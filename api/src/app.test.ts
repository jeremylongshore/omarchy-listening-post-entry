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
    database.prepare("INSERT INTO device_tokens (id,account_id,label,token_hash,created_at) VALUES (?,?,?,?,?)").run("device_test", "acct_test", "Test device", hashDeviceToken(token), "2026-09-10T00:00:00.000Z");
    database.prepare("INSERT INTO topics VALUES (?,?,?,?,?)").run("topic_agents", "acct_test", "Agent infrastructure", JSON.stringify(["agent","MCP"]), 1);
    database.prepare("INSERT INTO signals VALUES (?,?,?,?,?,?,?,?)").run("signal_1", "Agent runtime release", "https://example.com/release", "Example", "release", 92, new Date().toISOString(), new Date().toISOString());
    database.prepare("INSERT INTO signal_topics VALUES (?,?)").run("signal_1", "topic_agents");
    database.prepare("INSERT INTO source_health VALUES (?,?,?,?)").run("example", "Example", "healthy", new Date().toISOString());
    app = await createApp(database, "https://waitstate.intentsolutions.io");
  });
  afterEach(async () => { await app.close(); database.close(); });
  it("serves an unauthenticated health contract", async () => { const response = await app.inject({ method:"GET", url:"/healthz" }); expect(response.statusCode).toBe(200); expect(response.json()).toMatchObject({ status:"ok", contractVersion:"1.0" }); });
  it("rejects missing and malformed device tokens", async () => { expect((await app.inject({ method:"GET", url:"/v1/snapshot" })).statusCode).toBe(401); expect((await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:"Bearer short" } })).statusCode).toBe(401); });
  it("returns a contract-valid private snapshot to an active device", async () => { const response = await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } }); expect(response.statusCode).toBe(200); expect(response.headers["cache-control"]).toBe("private, no-store"); expect(response.json()).toMatchObject({ schemaVersion:"1.0", account:{ id:"acct_test" } }); });
  it("rejects a revoked device", async () => { database.prepare("UPDATE device_tokens SET revoked_at=? WHERE id=?").run(new Date().toISOString(), "device_test"); const response = await app.inject({ method:"GET", url:"/v1/snapshot", headers:{ authorization:`Bearer ${token}` } }); expect(response.statusCode).toBe(401); });
});
