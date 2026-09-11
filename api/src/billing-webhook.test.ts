import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { openDatabase, type PerceptionDatabase } from "./database.js";
import { entitlementForEmail } from "./entitlements.js";

const secret = "test-webhook-secret-with-enough-entropy";

describe("Lemon Squeezy entitlement webhook", () => {
  let database:PerceptionDatabase; let app:FastifyInstance;
  beforeEach(async () => {
    database = openDatabase(":memory:");
    app = await createApp(database, {
      webOrigin:"https://perception.intentsolutions.io",
      lemonSqueezy:{ webhookSecret:secret, storeId:10, variantIds:new Set([30]), allowTestMode:true },
    });
  });
  afterEach(async () => { await app.close(); database.close(); });

  it("applies a signed subscription and treats an identical retry idempotently", async () => {
    const raw = subscriptionPayload();
    const first = await send(raw); const retry = await send(raw);
    expect(first.statusCode).toBe(200); expect(first.json()).toEqual({ received:true, duplicate:false });
    expect(retry.statusCode).toBe(200); expect(retry.json()).toEqual({ received:true, duplicate:true });
    const row = database.prepare("SELECT email,status,customer_portal_url FROM billing_entitlements").get();
    expect(row).toEqual({ email:"operator@example.com", status:"active", customer_portal_url:"https://example.lemonsqueezy.com/billing" });
    expect((database.prepare("SELECT count(*) AS count FROM webhook_events").get() as { count:number }).count).toBe(1);
    expect(database.prepare("SELECT email,kind,attempts,sent_at FROM customer_messages").all()).toEqual([{ email:"operator@example.com", kind:"welcome", attempts:0, sent_at:null }]);
  });

  it("rejects unsigned or incorrectly signed bodies without recording entitlement", async () => {
    const raw = subscriptionPayload();
    const missing = await app.inject({ method:"POST", url:"/v1/billing/webhook", headers:{ "content-type":"application/json", "x-event-name":"subscription_created" }, payload:raw });
    const wrong = await app.inject({ method:"POST", url:"/v1/billing/webhook", headers:{ "content-type":"application/json", "x-event-name":"subscription_created", "x-signature":"0".repeat(64) }, payload:raw });
    expect(missing.statusCode).toBe(401); expect(wrong.statusCode).toBe(401);
    expect((database.prepare("SELECT count(*) AS count FROM billing_entitlements").get() as { count:number }).count).toBe(0);
  });

  it("cannot grant access for another store, variant, live/test boundary, or mismatched event header", async () => {
    const outsideStore = await send(subscriptionPayload({ store_id:11 }));
    const outsideVariant = await send(subscriptionPayload({ variant_id:31, updated_at:"2026-09-11T00:00:01.000Z" }));
    const appWithoutTestMode = await createApp(database, { webOrigin:"https://perception.intentsolutions.io", lemonSqueezy:{ webhookSecret:secret, storeId:10, variantIds:new Set([30]) } });
    const testBody = subscriptionPayload({ updated_at:"2026-09-11T00:00:02.000Z" });
    const testRejected = await signedInject(appWithoutTestMode, testBody, "subscription_created");
    const mismatch = await signedInject(app, subscriptionPayload({ test_mode:false, updated_at:"2026-09-11T00:00:03.000Z" }), "subscription_updated", "subscription_created");
    await appWithoutTestMode.close();
    expect(outsideStore.statusCode).toBe(200); expect(outsideVariant.statusCode).toBe(200); expect(testRejected.statusCode).toBe(200); expect(mismatch.statusCode).toBe(200);
    expect((database.prepare("SELECT count(*) AS count FROM billing_entitlements").get() as { count:number }).count).toBe(0);
  });

  it("ignores stale lifecycle delivery and removes access only when the newest status expires", async () => {
    await send(subscriptionPayload({ status:"active", test_mode:false, updated_at:"2026-09-12T00:00:00.000Z" }), "subscription_updated");
    await send(subscriptionPayload({ status:"expired", test_mode:false, updated_at:"2026-09-11T00:00:00.000Z" }), "subscription_updated");
    expect((database.prepare("SELECT status FROM billing_entitlements").get() as { status:string }).status).toBe("active");
    await send(subscriptionPayload({ status:"expired", test_mode:false, updated_at:"2026-09-13T00:00:00.000Z" }), "subscription_updated");
    expect((database.prepare("SELECT status FROM billing_entitlements").get() as { status:string }).status).toBe("expired");
  });

  it("honors a cancelled subscription only through its paid grace period", async () => {
    await send(subscriptionPayload({ status:"cancelled", test_mode:false, ends_at:"2026-09-20T00:00:00.000Z" }), "subscription_updated");
    expect(entitlementForEmail(database, "operator@example.com", new Date("2026-09-19T00:00:00.000Z"))?.entitled).toBe(true);
    expect(entitlementForEmail(database, "operator@example.com", new Date("2026-09-21T00:00:00.000Z"))?.entitled).toBe(false);
  });

  function send(raw:string, event="subscription_created") { return signedInject(app, raw, event); }
});

function subscriptionPayload(overrides:Record<string, unknown> = {}):string {
  return JSON.stringify({
    meta:{ event_name:"subscription_created" },
    data:{ type:"subscriptions", id:"501", attributes:{
      store_id:10, customer_id:101, product_id:20, variant_id:30,
      user_email:"Operator@Example.com", user_name:"Test Operator", status:"active",
      renews_at:"2026-10-01T00:00:00.000Z", ends_at:null,
      urls:{ customer_portal:"https://example.lemonsqueezy.com/billing" },
      updated_at:"2026-09-11T00:00:00.000Z", test_mode:true, ...overrides,
    } },
  });
}

async function signedInject(app:FastifyInstance, raw:string, eventHeader:string, payloadEvent = eventHeader) {
  const parsed = JSON.parse(raw) as { meta:{ event_name:string } }; parsed.meta.event_name = payloadEvent; raw = JSON.stringify(parsed);
  const signature = createHmac("sha256", secret).update(Buffer.from(raw)).digest("hex");
  return app.inject({ method:"POST", url:"/v1/billing/webhook", headers:{ "content-type":"application/json", "x-event-name":eventHeader, "x-signature":signature }, payload:raw });
}
