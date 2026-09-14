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
      webOrigin:"https://oma.intentsolutions.io",
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
    const appWithoutTestMode = await createApp(database, { webOrigin:"https://oma.intentsolutions.io", lemonSqueezy:{ webhookSecret:secret, storeId:10, variantIds:new Set([30]) } });
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

  it("keeps access during payment retries and denies it after recovery is exhausted", async () => {
    await send(subscriptionPayload({ status:"past_due", test_mode:false }), "subscription_updated");
    expect(entitlementForEmail(database, "operator@example.com")?.entitled).toBe(true);
    await send(subscriptionPayload({ status:"unpaid", test_mode:false, updated_at:"2026-09-12T00:00:00.000Z" }), "subscription_updated");
    expect(entitlementForEmail(database, "operator@example.com")).toMatchObject({ status:"unpaid", entitled:false });
    expect(database.prepare("SELECT kind FROM customer_messages WHERE kind='billing_attention' ORDER BY created_at DESC LIMIT 1").get())
      .toEqual({ kind:"billing_attention" });
  });

  it("records partial refunds without changing access and revokes on a full refund", async () => {
    await send(subscriptionPayload({ test_mode:false }));
    const partial = orderRefundPayload({ status:"partial_refund", refunded:false, refunded_amount:500, refunded_at:null, test_mode:false });
    const partialResponse = await signedInject(app, partial, "order_refunded");
    expect(partialResponse.json()).toEqual({ received:true, duplicate:false });
    expect(entitlementForEmail(database, "operator@example.com")?.entitled).toBe(true);
    expect((database.prepare("SELECT outcome FROM webhook_events WHERE event_name='order_refunded'").get() as { outcome:string }).outcome).toBe("partial_refund_no_access_change");

    const full = orderRefundPayload({ status:"refunded", refunded:true, refunded_amount:1000, refunded_at:"2026-09-12T01:00:00.000Z", updated_at:"2026-09-12T01:00:00.000Z", test_mode:false });
    const revoked = await signedInject(app, full, "order_refunded");
    const duplicate = await signedInject(app, full, "order_refunded");
    expect(revoked.statusCode).toBe(200); expect(duplicate.json()).toEqual({ received:true, duplicate:true });
    expect(entitlementForEmail(database, "operator@example.com")).toMatchObject({ status:"expired", entitled:false });
    expect(database.prepare("SELECT reason FROM billing_revocations").get()).toEqual({ reason:"full_refund" });
    expect(database.prepare("SELECT kind FROM customer_messages WHERE kind='access_ended'").get()).toEqual({ kind:"access_ended" });

    database.prepare(`INSERT INTO billing_entitlements
      (subscription_id,email,customer_id,order_id,store_id,product_id,variant_id,status,user_name,renews_at,ends_at,customer_portal_url,test_mode,upstream_updated_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        "502", "operator@example.com", "102", "402", 10, 20, 30, "active", "Test Operator",
        "2026-10-01T00:00:00.000Z", null, "https://example.lemonsqueezy.com/billing", 0,
        "2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z",
      );
    expect(entitlementForEmail(database, "operator@example.com")).toMatchObject({ status:"active", entitled:true });
  });

  it("revokes a catalog subscription after a fully refunded renewal invoice", async () => {
    await send(subscriptionPayload({ test_mode:false }));
    const raw = subscriptionInvoiceRefundPayload({ test_mode:false });
    const first = await signedInject(app, raw, "subscription_payment_refunded");
    const duplicate = await signedInject(app, raw, "subscription_payment_refunded");
    expect(first.json()).toEqual({ received:true, duplicate:false });
    expect(duplicate.json()).toEqual({ received:true, duplicate:true });
    expect(entitlementForEmail(database, "operator@example.com")).toMatchObject({ status:"expired", entitled:false });
    expect(database.prepare("SELECT event_name,outcome FROM webhook_events WHERE event_name='subscription_payment_refunded'").get())
      .toEqual({ event_name:"subscription_payment_refunded", outcome:"refund_revoked" });
  });

  function send(raw:string, event="subscription_created") { return signedInject(app, raw, event); }
});

function subscriptionPayload(overrides:Record<string, unknown> = {}):string {
  return JSON.stringify({
    meta:{ event_name:"subscription_created" },
    data:{ type:"subscriptions", id:"501", attributes:{
      store_id:10, customer_id:101, order_id:401, product_id:20, variant_id:30,
      user_email:"Operator@Example.com", user_name:"Test Operator", status:"active",
      renews_at:"2026-10-01T00:00:00.000Z", ends_at:null,
      urls:{ customer_portal:"https://example.lemonsqueezy.com/billing" },
      updated_at:"2026-09-11T00:00:00.000Z", test_mode:true, ...overrides,
    } },
  });
}

function orderRefundPayload(overrides:Record<string, unknown> = {}):string {
  return JSON.stringify({ meta:{ event_name:"order_refunded" }, data:{ type:"orders", id:"401", attributes:{
    store_id:10, customer_id:101, user_email:"Operator@Example.com", status:"refunded", refunded:true,
    refunded_amount:1000, refunded_at:"2026-09-12T00:00:00.000Z", updated_at:"2026-09-12T00:00:00.000Z", test_mode:true,
    first_order_item:{ product_id:20, variant_id:30 }, ...overrides,
  } } });
}

function subscriptionInvoiceRefundPayload(overrides:Record<string, unknown> = {}):string {
  return JSON.stringify({ meta:{ event_name:"subscription_payment_refunded" }, data:{ type:"subscription-invoices", id:"invoice-601", attributes:{
    store_id:10, subscription_id:501, customer_id:101, user_email:"Operator@Example.com", status:"refunded", refunded:true,
    refunded_amount:1000, refunded_at:"2026-09-12T02:00:00.000Z", updated_at:"2026-09-12T02:00:00.000Z", test_mode:true,
    ...overrides,
  } } });
}

async function signedInject(app:FastifyInstance, raw:string, eventHeader:string, payloadEvent = eventHeader) {
  const parsed = JSON.parse(raw) as { meta:{ event_name:string } }; parsed.meta.event_name = payloadEvent; raw = JSON.stringify(parsed);
  const signature = createHmac("sha256", secret).update(Buffer.from(raw)).digest("hex");
  return app.inject({ method:"POST", url:"/v1/billing/webhook", headers:{ "content-type":"application/json", "x-event-name":eventHeader, "x-signature":signature }, payload:raw });
}
