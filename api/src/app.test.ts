import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { hashDeviceToken } from "./auth.js";
import { openDatabase, type PerceptionDatabase } from "./database.js";

describe("Perception API", () => {
  let database:PerceptionDatabase; let app:FastifyInstance; let token:string;
  beforeEach(async () => {
    database = openDatabase(":memory:"); token = randomBytes(32).toString("base64url");
    database.prepare("INSERT INTO accounts VALUES (?, ?, ?)").run("acct_test", "Test operator", "2026-09-10T00:00:00.000Z");
    database.prepare("INSERT INTO email_identities VALUES (?,?,?)").run("test@example.com", "acct_test", "2026-09-10T00:00:00.000Z");
    database.prepare(`INSERT INTO billing_entitlements
      (subscription_id,email,customer_id,store_id,product_id,variant_id,status,user_name,test_mode,upstream_updated_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run("sub_test", "test@example.com", "customer_test", 10, 20, 30, "active", "Test operator", 1, "2026-09-10T00:00:00.000Z", "2026-09-10T00:00:00.000Z");
    database.prepare("INSERT INTO device_tokens (id,account_id,label,token_hash,created_at) VALUES (?,?,?,?,?)").run("device_test", "acct_test", "Test device", hashDeviceToken(token), "2026-09-10T00:00:00.000Z");
    database.prepare("INSERT INTO topics VALUES (?,?,?,?,?)").run("topic_agents", "acct_test", "Agent infrastructure", JSON.stringify(["agent","MCP"]), 1);
    database.prepare("INSERT INTO signals VALUES (?,?,?,?,?,?,?,?)").run("signal_1", "Agent runtime release", "https://example.com/release", "Example", "release", 92, new Date().toISOString(), new Date().toISOString());
    database.prepare("INSERT INTO account_signal_scores VALUES (?,?,?,?)").run("acct_test", "signal_1", 92, "Matches Agent infrastructure.");
    database.prepare("INSERT INTO signal_topics VALUES (?,?)").run("signal_1", "topic_agents");
    database.prepare("INSERT INTO source_health VALUES (?,?,?,?)").run("example", "Example", "healthy", new Date().toISOString());
    app = await createApp(database, "https://oma.intentsolutions.io");
  });
  afterEach(async () => { await app.close(); database.close(); });
  it("serves unauthenticated liveness and database-readiness contracts", async () => {
    const health = await app.inject({ method:"GET", url:"/healthz" });
    expect(health.statusCode).toBe(200); expect(health.json()).toMatchObject({ status:"ok", contractVersion:"1.0" });
    const ready = await app.inject({ method:"GET", url:"/readyz" });
    expect(ready.statusCode).toBe(200); expect(ready.json()).toMatchObject({ status:"ready", contractVersion:"1.0" });
  });
  it("rejects missing and malformed device tokens", async () => { expect((await app.inject({ method:"GET", url:"/v1/snapshot" })).statusCode).toBe(401); expect((await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:"Bearer short" } })).statusCode).toBe(401); });
  it("returns a contract-valid private snapshot to an active device", async () => { const response = await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } }); expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store"); expect(response.json()).toMatchObject({ schemaVersion:"1.0", account:{ id:"acct_test" } }); });
  it("shares read state from an entitled device with the account snapshot", async () => {
    const marked = await app.inject({ method:"PUT", url:"/v1/signals/signal_1/read", headers:{ authorization:`Bearer ${token}` } });
    expect(marked.statusCode).toBe(204);
    const snapshot = await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } });
    expect(snapshot.json().signals[0].read).toBe(true);
  });
  it("rejects device read writes after entitlement ends", async () => {
    database.prepare("UPDATE billing_entitlements SET status='expired'").run();
    const response = await app.inject({ method:"PUT", url:"/v1/signals/signal_1/read", headers:{ authorization:`Bearer ${token}` } });
    expect(response.statusCode).toBe(401);
    expect(database.prepare("SELECT count(*) AS count FROM read_state").get()).toEqual({ count:0 });
  });
  it("bounds a requested brief window", async () => { expect((await app.inject({ method:"GET", url:"/v1/snapshot?windowHours=0", headers:{ authorization:`Bearer ${token}` } })).statusCode).toBe(400); expect((await app.inject({ method:"GET", url:"/v1/snapshot?windowHours=168", headers:{ authorization:`Bearer ${token}` } })).statusCode).toBe(200); });
  it("rejects a revoked device", async () => { database.prepare("UPDATE device_tokens SET revoked_at=? WHERE id=?").run(new Date().toISOString(), "device_test"); const response = await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } }); expect(response.statusCode).toBe(401); });
  it("rejects a device after its account entitlement expires", async () => { database.prepare("UPDATE billing_entitlements SET status='expired'").run(); const response = await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } }); expect(response.statusCode).toBe(401); });
});
