import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { SESSION_COOKIE, type MagicLinkSender } from "./browser-auth.js";
import { openDatabase, type PerceptionDatabase } from "./database.js";
import { IngestionService } from "./ingestion.js";

const WEB = "https://oma.intentsolutions.io";
const WEB_APP = "https://oma.intentsolutions.io/perception/";
const API = "https://api.perception.intentsolutions.io";
const SECRET = "customer-journey-webhook-secret";

describe("paid customer journey", () => {
  let database:PerceptionDatabase | undefined;
  let app:FastifyInstance | undefined;
  afterEach(async () => { if (app) await app.close(); if (database?.open) database.close(); });

  it("runs Lemon purchase through login, topic, brief, pairing, read sync, and revocation", async () => {
    database = openDatabase(":memory:");
    const sent:Array<{ email:string; url:string }> = [];
    const sender:MagicLinkSender = { send:async message => { sent.push(message); } };
    const source = { id:"journey", vendor:"perception", name:"Perception Lab", title:"Perception Lab", kind:"blog" as const, url:"https://journey.example.test/feed" };
    const ingestion = new IngestionService(database, async () => new Response(
      `<?xml version="1.0"?><rss><channel><item><title>Agent runtime release</title><link>https://journey.example.test/release</link><guid>journey-release</guid><pubDate>${new Date().toISOString()}</pubDate></item></channel></rss>`,
      { status:200, headers:{ "content-length":"240" } },
    ), [source]);
    app = await createApp(database, {
      webOrigin:WEB, webAppUrl:WEB_APP, apiOrigin:API, secureCookies:false, magicLinkSender:sender,
      checkoutUrl:"https://example.lemonsqueezy.com/buy/perception",
      lemonSqueezy:{ webhookSecret:SECRET, storeId:10, variantIds:new Set([30]), allowTestMode:true },
      ingestionService:ingestion, ingestionKey:"journey-ingestion-key",
    });

    const purchase = JSON.stringify({ meta:{ event_name:"subscription_created" }, data:{ type:"subscriptions", id:"sub_journey", attributes:{
      store_id:10, customer_id:101, order_id:401, product_id:20, variant_id:30,
      user_email:"buyer@example.com", user_name:"Buyer Operator", status:"active",
      renews_at:"2026-10-11T00:00:00.000Z", ends_at:null,
      urls:{ customer_portal:"https://example.lemonsqueezy.com/billing" },
      updated_at:"2026-09-11T00:00:00.000Z", test_mode:true,
    } } });
    const signature = createHmac("sha256", SECRET).update(Buffer.from(purchase)).digest("hex");
    const webhook = await app.inject({ method:"POST", url:"/v1/billing/webhook", headers:{ "content-type":"application/json", "x-event-name":"subscription_created", "x-signature":signature }, payload:purchase });
    expect(webhook.statusCode).toBe(200);

    expect((await app.inject({ method:"POST", url:"/v1/auth/magic-link", payload:{ email:"buyer@example.com" } })).statusCode).toBe(202);
    const magicUrl = new URL(sent[0].url);
    expect(magicUrl.origin + magicUrl.pathname).toBe(WEB_APP);
    expect(magicUrl.search).toBe("");
    const magicToken = new URLSearchParams(magicUrl.hash.slice(1)).get("magic")!;
    const consumed = await app.inject({ method:"POST", url:"/v1/auth/magic-link/consume", headers:{ origin:WEB }, payload:{ token:magicToken } });
    const session = consumed.cookies.find(cookie => cookie.name === SESSION_COOKIE)!.value;

    const topics = await app.inject({ method:"PUT", url:"/v1/topics", cookies:{ [SESSION_COOKIE]:session }, payload:{ topics:[{ name:"Agent infrastructure", keywords:["agent"], enabled:true }] } });
    expect(topics.statusCode).toBe(200);
    expect((await app.inject({ method:"POST", url:"/v1/ingestion", headers:{ "x-ingestion-key":"journey-ingestion-key" } })).statusCode).toBe(200);

    const expiredPairing = await app.inject({ method:"POST", url:"/v1/pairing-codes", cookies:{ [SESSION_COOKIE]:session }, payload:{ label:"Expired workstation" } });
    database.prepare("UPDATE pairing_codes SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(expiredPairing.json().id);
    expect((await app.inject({ method:"POST", url:"/v1/pairing/exchange", payload:{ code:expiredPairing.json().code } })).statusCode).toBe(401);

    const pairing = await app.inject({ method:"POST", url:"/v1/pairing-codes", cookies:{ [SESSION_COOKIE]:session }, payload:{ label:"Omarchy workstation" } });
    expect(pairing.statusCode).toBe(201);
    const created = await app.inject({ method:"POST", url:"/v1/pairing/exchange", payload:{ code:pairing.json().code } });
    const { device, token } = created.json();
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ method:"POST", url:"/v1/pairing/exchange", payload:{ code:pairing.json().code } })).statusCode).toBe(401);
    expect((database.prepare("SELECT code_hash FROM pairing_codes WHERE id=?").get(pairing.json().id) as { code_hash:string }).code_hash).not.toContain(pairing.json().code);
    expect((database.prepare("SELECT token_hash FROM device_tokens WHERE id=?").get(device.id) as { token_hash:string }).token_hash).not.toContain(token);
    const nativeSnapshot = await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } });
    expect(nativeSnapshot.statusCode).toBe(200);
    expect(nativeSnapshot.json()).toMatchObject({ account:{ displayName:"Buyer Operator" }, topics:[{ name:"Agent infrastructure" }] });
    expect(nativeSnapshot.json().brief.highlights).toHaveLength(1);
    const signalId = nativeSnapshot.json().signals[0].id as string;

    expect((await app.inject({ method:"PUT", url:`/v1/signals/${signalId}/read`, headers:{ authorization:`Bearer ${token}` } })).statusCode).toBe(204);
    const browserSnapshot = await app.inject({ method:"GET", url:"/v1/snapshot", cookies:{ [SESSION_COOKIE]:session } });
    expect(browserSnapshot.json().signals[0].read).toBe(true);

    expect((await app.inject({ method:"DELETE", url:`/v1/devices/${device.id}`, cookies:{ [SESSION_COOKIE]:session } })).statusCode).toBe(204);
    expect((await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } })).statusCode).toBe(401);
  });
});
