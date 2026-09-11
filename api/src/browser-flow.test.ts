import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { SESSION_COOKIE, type GitHubOAuthClient } from "./browser-auth.js";
import { openDatabase, type PerceptionDatabase } from "./database.js";

const oauth:GitHubOAuthClient = {
  authorizeUrl:state => `https://github.com/login/oauth/authorize?state=${encodeURIComponent(state)}`,
  exchange:async code => {
    if (code === "bad") throw new Error("exchange_failed");
    return { id:"4242", login:"operator", name:"Test Operator", avatarUrl:"https://avatars.githubusercontent.com/u/4242" };
  },
};

describe("browser account and device flow", () => {
  let database:PerceptionDatabase; let app:FastifyInstance;
  beforeEach(async () => {
    database = openDatabase(":memory:");
    app = await createApp(database, { webOrigin:"https://waitstate.intentsolutions.io", secureCookies:false, githubOAuth:oauth });
  });
  afterEach(async () => { await app.close(); database.close(); });

  async function login() {
    const start = await app.inject({ method:"GET", url:"/v1/auth/github/start" });
    expect(start.statusCode).toBe(302);
    const oauthCookie = start.cookies.find(item => item.name === "perception_oauth_state");
    expect(oauthCookie?.httpOnly).toBe(true);
    const state = new URL(start.headers.location!).searchParams.get("state")!;
    const callback = await app.inject({ method:"GET", url:`/v1/auth/github/callback?code=good&state=${encodeURIComponent(state)}`, cookies:{ perception_oauth_state:oauthCookie!.value } });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe("https://waitstate.intentsolutions.io/?auth=complete");
    const session = callback.cookies.find(item => item.name === SESSION_COOKIE);
    expect(session?.httpOnly).toBe(true);
    return session!.value;
  }

  it("binds OAuth state to the initiating browser", async () => {
    const start = await app.inject({ method:"GET", url:"/v1/auth/github/start" });
    const state = new URL(start.headers.location!).searchParams.get("state")!;
    const denied = await app.inject({ method:"GET", url:`/v1/auth/github/callback?code=good&state=${state}`, cookies:{ perception_oauth_state:"wrong-state-value-that-is-at-least-32-chars" } });
    expect(denied.headers.location).toBe("https://waitstate.intentsolutions.io/?auth=failed");
    expect((database.prepare("SELECT count(*) AS count FROM browser_sessions").get() as { count:number }).count).toBe(0);
  });

  it("serves account and snapshots through a private session cookie", async () => {
    const session = await login();
    const account = await app.inject({ method:"GET", url:"/v1/account", cookies:{ [SESSION_COOKIE]:session } });
    expect(account.statusCode).toBe(200);
    expect(account.json()).toMatchObject({ displayName:"Test Operator", githubLogin:"operator" });
    const snapshot = await app.inject({ method:"GET", url:"/v1/snapshot", cookies:{ [SESSION_COOKIE]:session } });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.headers["cache-control"]).toBe("private, no-store");
  });

  it("validates and atomically replaces bounded topics", async () => {
    const session = await login();
    const valid = await app.inject({ method:"PUT", url:"/v1/topics", cookies:{ [SESSION_COOKIE]:session }, payload:{ topics:[{ name:"Agent infrastructure", keywords:["agent","MCP"], enabled:true }] } });
    expect(valid.statusCode).toBe(200);
    expect(valid.json().topics[0]).toMatchObject({ name:"Agent infrastructure", keywords:["agent","MCP"] });
    const invalid = await app.inject({ method:"PUT", url:"/v1/topics", cookies:{ [SESSION_COOKIE]:session }, payload:{ topics:Array.from({ length:9 }, (_, index) => ({ name:`Topic ${index}`, keywords:[] })) } });
    expect(invalid.statusCode).toBe(400);
    const after = await app.inject({ method:"GET", url:"/v1/topics", cookies:{ [SESSION_COOKIE]:session } });
    expect(after.json().topics).toHaveLength(1);
  });

  it("shows a device token once, stores only its hash, and enforces account ownership", async () => {
    const session = await login();
    const created = await app.inject({ method:"POST", url:"/v1/devices", cookies:{ [SESSION_COOKIE]:session }, payload:{ label:"Framework laptop" } });
    expect(created.statusCode).toBe(201);
    const body = created.json();
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    const stored = database.prepare("SELECT token_hash FROM device_tokens WHERE id=?").get(body.device.id) as { token_hash:string };
    expect(stored.token_hash).not.toContain(body.token);
    database.prepare("INSERT INTO accounts VALUES (?,?,?)").run("acct_other", "Other", new Date().toISOString());
    database.prepare("UPDATE device_tokens SET account_id='acct_other' WHERE id=?").run(body.device.id);
    const denied = await app.inject({ method:"DELETE", url:`/v1/devices/${body.device.id}`, cookies:{ [SESSION_COOKIE]:session } });
    expect(denied.statusCode).toBe(404);
  });

  it("revokes the current browser session on logout", async () => {
    const session = await login();
    expect((await app.inject({ method:"POST", url:"/v1/auth/logout", cookies:{ [SESSION_COOKIE]:session } })).statusCode).toBe(204);
    expect((await app.inject({ method:"GET", url:"/v1/account", cookies:{ [SESSION_COOKIE]:session } })).statusCode).toBe(401);
  });

  it("rejects state changes from an untrusted browser origin", async () => {
    const session = await login();
    const response = await app.inject({ method:"PUT", url:"/v1/topics", headers:{ origin:"https://attacker.example" }, cookies:{ [SESSION_COOKIE]:session }, payload:{ topics:[] } });
    expect(response.statusCode).toBe(403);
  });
});
