import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { SESSION_COOKIE, type MagicLinkSender } from "./browser-auth.js";
import { openDatabase, type PerceptionDatabase } from "./database.js";

describe("email account and device flow", () => {
  let database:PerceptionDatabase; let app:FastifyInstance; let sent:Array<{ email:string; url:string }>;
  beforeEach(async () => {
    database = openDatabase(":memory:"); sent = [];
    seedEntitlement(database);
    const sender:MagicLinkSender = { send:async message => { sent.push(message); } };
    app = await createApp(database, {
      webOrigin:"https://perception.intentsolutions.io", apiOrigin:"https://api.perception.intentsolutions.io",
      secureCookies:false, checkoutUrl:"https://example.lemonsqueezy.com/buy/perception", magicLinkSender:sender,
    });
  });
  afterEach(async () => { await app.close(); database.close(); });

  async function login() {
    const requested = await app.inject({ method:"POST", url:"/v1/auth/magic-link", payload:{ email:"OPERATOR@example.com" } });
    expect(requested.statusCode).toBe(202);
    expect(sent).toHaveLength(1);
    expect(sent[0].email).toBe("operator@example.com");
    const magicUrl = new URL(sent[0].url);
    const token = new URLSearchParams(magicUrl.hash.slice(1)).get("magic")!;
    expect(magicUrl.origin + magicUrl.pathname).toBe("https://perception.intentsolutions.io/");
    expect(magicUrl.search).toBe("");
    const stored = database.prepare("SELECT token_hash FROM magic_links").get() as { token_hash:string };
    expect(stored.token_hash).not.toContain(token);
    const consumed = await app.inject({ method:"POST", url:"/v1/auth/magic-link/consume", headers:{ origin:"https://perception.intentsolutions.io" }, payload:{ token } });
    expect(consumed.statusCode).toBe(204);
    expect(consumed.headers["cache-control"]).toBe("no-store");
    const session = consumed.cookies.find(item => item.name === SESSION_COOKIE);
    expect(session?.httpOnly).toBe(true);
    return { session:session!.value, token };
  }

  it("returns the same accepted response without disclosing entitlement", async () => {
    const entitled = await app.inject({ method:"POST", url:"/v1/auth/magic-link", payload:{ email:"operator@example.com" } });
    const unknown = await app.inject({ method:"POST", url:"/v1/auth/magic-link", payload:{ email:"unknown@example.com" } });
    const malformed = await app.inject({ method:"POST", url:"/v1/auth/magic-link", payload:{ email:"not-an-email" } });
    expect(entitled.statusCode).toBe(202); expect(unknown.statusCode).toBe(202); expect(malformed.statusCode).toBe(202);
    expect(entitled.json()).toEqual(unknown.json()); expect(unknown.json()).toEqual(malformed.json());
    expect(sent).toHaveLength(1);
  });

  it("consumes a magic link once and serves an entitled account", async () => {
    const { session, token } = await login();
    const replay = await app.inject({ method:"POST", url:"/v1/auth/magic-link/consume", headers:{ origin:"https://perception.intentsolutions.io" }, payload:{ token } });
    expect(replay.statusCode).toBe(401);
    const account = await app.inject({ method:"GET", url:"/v1/account", cookies:{ [SESSION_COOKIE]:session } });
    expect(account.statusCode).toBe(200);
    expect(account.json()).toMatchObject({ displayName:"Test Operator", email:"operator@example.com", entitlement:{ status:"active", entitled:true } });
    const snapshot = await app.inject({ method:"GET", url:"/v1/snapshot", cookies:{ [SESSION_COOKIE]:session } });
    expect(snapshot.statusCode).toBe(200); expect(snapshot.headers["cache-control"]).toBe("private, no-store");
  });

  it("rejects an expired magic link without creating a session", async () => {
    await app.inject({ method:"POST", url:"/v1/auth/magic-link", payload:{ email:"operator@example.com" } });
    const token = new URLSearchParams(new URL(sent[0].url).hash.slice(1)).get("magic")!;
    database.prepare("UPDATE magic_links SET expires_at='2000-01-01T00:00:00.000Z'").run();
    const consumed = await app.inject({ method:"POST", url:"/v1/auth/magic-link/consume", headers:{ origin:"https://perception.intentsolutions.io" }, payload:{ token } });
    expect(consumed.statusCode).toBe(401);
    expect((database.prepare("SELECT count(*) AS count FROM browser_sessions").get() as { count:number }).count).toBe(0);
  });

  it("does not expose or consume a magic token through a scanner-prefetched GET", async () => {
    await app.inject({ method:"POST", url:"/v1/auth/magic-link", payload:{ email:"operator@example.com" } });
    const magicUrl = new URL(sent[0].url);
    const token = new URLSearchParams(magicUrl.hash.slice(1)).get("magic")!;
    expect(magicUrl.search).toBe("");
    expect((await app.inject({ method:"GET", url:"/v1/auth/magic-link/consume" })).statusCode).toBe(404);
    expect((database.prepare("SELECT consumed_at FROM magic_links").get() as { consumed_at:string | null }).consumed_at).toBeNull();
    expect((await app.inject({ method:"POST", url:"/v1/auth/magic-link/consume", payload:{ token } })).statusCode).toBe(403);
    expect((await app.inject({ method:"POST", url:"/v1/auth/magic-link/consume", headers:{ origin:"https://perception.intentsolutions.io" }, payload:{ token } })).statusCode).toBe(204);
  });

  it("denies product data when a signed-in account expires while preserving billing access", async () => {
    const { session } = await login();
    database.prepare("UPDATE billing_entitlements SET status='expired'").run();
    const snapshot = await app.inject({ method:"GET", url:"/v1/snapshot", cookies:{ [SESSION_COOKIE]:session } });
    expect(snapshot.statusCode).toBe(402);
    expect(snapshot.json()).toMatchObject({ error:"entitlement_required", checkoutUrl:"https://example.lemonsqueezy.com/buy/perception" });
    const account = await app.inject({ method:"GET", url:"/v1/account", cookies:{ [SESSION_COOKIE]:session } });
    expect(account.statusCode).toBe(200); expect(account.json()).toMatchObject({ entitlement:{ status:"expired", entitled:false } });
  });

  it("validates and atomically replaces bounded topics", async () => {
    const { session } = await login();
    const valid = await app.inject({ method:"PUT", url:"/v1/topics", cookies:{ [SESSION_COOKIE]:session }, payload:{ topics:[{ name:"Agent infrastructure", keywords:["agent","MCP"], enabled:true }] } });
    expect(valid.statusCode).toBe(200); expect(valid.json().topics[0]).toMatchObject({ name:"Agent infrastructure", keywords:["agent","MCP"] });
    const invalid = await app.inject({ method:"PUT", url:"/v1/topics", cookies:{ [SESSION_COOKIE]:session }, payload:{ topics:Array.from({ length:9 }, (_, index) => ({ name:`Topic ${index}`, keywords:[] })) } });
    expect(invalid.statusCode).toBe(400);
    const after = await app.inject({ method:"GET", url:"/v1/topics", cookies:{ [SESSION_COOKIE]:session } });
    expect(after.json().topics).toHaveLength(1);
  });

  it("shows a device token once, stores only its hash, and enforces entitlement", async () => {
    const { session } = await login();
    const created = await app.inject({ method:"POST", url:"/v1/devices", cookies:{ [SESSION_COOKIE]:session }, payload:{ label:"Framework laptop" } });
    expect(created.statusCode).toBe(201);
    const body = created.json(); const stored = database.prepare("SELECT token_hash FROM device_tokens WHERE id=?").get(body.device.id) as { token_hash:string };
    expect(stored.token_hash).not.toContain(body.token);
    expect((await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${body.token}` } })).statusCode).toBe(200);
    database.prepare("UPDATE billing_entitlements SET status='expired'").run();
    expect((await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${body.token}` } })).statusCode).toBe(401);
  });

  it("revokes sessions and rejects state changes from an untrusted origin", async () => {
    const { session } = await login();
    const crossOrigin = await app.inject({ method:"PUT", url:"/v1/topics", headers:{ origin:"https://attacker.example" }, cookies:{ [SESSION_COOKIE]:session }, payload:{ topics:[] } });
    expect(crossOrigin.statusCode).toBe(403);
    expect((await app.inject({ method:"POST", url:"/v1/auth/logout", cookies:{ [SESSION_COOKIE]:session } })).statusCode).toBe(204);
    expect((await app.inject({ method:"GET", url:"/v1/account", cookies:{ [SESSION_COOKIE]:session } })).statusCode).toBe(401);
  });
});

function seedEntitlement(database:PerceptionDatabase) {
  database.prepare(`INSERT INTO billing_entitlements
    (subscription_id,email,customer_id,store_id,product_id,variant_id,status,user_name,renews_at,ends_at,customer_portal_url,test_mode,upstream_updated_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run("sub_1", "operator@example.com", "customer_1", 10, 20, 30, "active", "Test Operator", "2026-10-01T00:00:00.000Z", null, "https://example.lemonsqueezy.com/billing", 1, "2026-09-11T00:00:00.000Z", "2026-09-11T00:00:00.000Z");
}
