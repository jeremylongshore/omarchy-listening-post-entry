import { randomUUID } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { PerceptionDatabase } from "./database.js";
import { authenticateDevice, extractBearer, hashDeviceToken } from "./auth.js";
import {
  authenticateBrowser, consumeOAuthState, createBrowserSession, createOAuthState,
  OAUTH_COOKIE, opaqueToken, revokeBrowserSession, SESSION_COOKIE, upsertGitHubAccount,
  type GitHubOAuthClient,
} from "./browser-auth.js";
import { buildSnapshot } from "./snapshot.js";

export type AppConfig = { webOrigin:string; secureCookies?:boolean; githubOAuth?:GitHubOAuthClient };
type TopicInput = { id?:unknown; name?:unknown; keywords?:unknown; enabled?:unknown };

export async function createApp(database:PerceptionDatabase, config:AppConfig | string) {
  const options:AppConfig = typeof config === "string" ? { webOrigin:config, secureCookies:false } : config;
  const secureCookies = options.secureCookies ?? true;
  const app = Fastify({ logger:false, bodyLimit:64 * 1024, trustProxy:true });
  await app.register(cookie);
  await app.register(cors, {
    origin:options.webOrigin, methods:["GET","POST","PUT","DELETE"],
    allowedHeaders:["Authorization","Content-Type"], credentials:true, maxAge:600,
  });
  await app.register(rateLimit, { max:120, timeWindow:"1 minute" });
  app.addHook("onRequest", async (request, reply) => {
    if (["POST","PUT","DELETE"].includes(request.method) && request.headers.origin && request.headers.origin !== options.webOrigin) {
      return reply.code(403).send({ error:"origin_forbidden" });
    }
  });

  const browserIdentity = (request:FastifyRequest) => authenticateBrowser(database, request.cookies[SESSION_COOKIE]);
  const requireBrowser = (request:FastifyRequest, reply:FastifyReply) => {
    const identity = browserIdentity(request);
    if (!identity) reply.code(401).send({ error:"unauthorized" });
    return identity;
  };

  app.get("/healthz", async () => ({ status:"ok", service:"perception-api", contractVersion:"1.0" }));

  app.get("/v1/auth/github/start", { config:{ rateLimit:{ max:20, timeWindow:"1 minute" } } }, async (_request, reply) => {
    if (!options.githubOAuth) return reply.code(503).send({ error:"github_oauth_unavailable" });
    const state = createOAuthState(database);
    reply.setCookie(OAUTH_COOKIE, state, cookieOptions(secureCookies, 10 * 60));
    return reply.redirect(options.githubOAuth.authorizeUrl(state));
  });

  app.get("/v1/auth/github/callback", { config:{ rateLimit:{ max:20, timeWindow:"1 minute" } } }, async (request, reply) => {
    const query = request.query as { code?:string; state?:string; error?:string };
    if (!options.githubOAuth || query.error || !query.code || !query.state || !consumeOAuthState(database, query.state, request.cookies[OAUTH_COOKIE])) {
      reply.clearCookie(OAUTH_COOKIE, { path:"/" });
      return reply.redirect(`${options.webOrigin}/?auth=failed`);
    }
    try {
      const identity = await options.githubOAuth.exchange(query.code);
      const accountId = upsertGitHubAccount(database, identity);
      const session = createBrowserSession(database, accountId);
      reply.clearCookie(OAUTH_COOKIE, { path:"/" });
      reply.setCookie(SESSION_COOKIE, session, cookieOptions(secureCookies, 30 * 24 * 60 * 60));
      return reply.redirect(`${options.webOrigin}/?auth=complete`);
    } catch {
      reply.clearCookie(OAUTH_COOKIE, { path:"/" });
      return reply.redirect(`${options.webOrigin}/?auth=failed`);
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    revokeBrowserSession(database, request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path:"/" });
    return reply.code(204).send();
  });

  app.get("/v1/account", async (request, reply) => {
    const identity = requireBrowser(request, reply); if (!identity) return;
    reply.header("Cache-Control", "private, no-store");
    const row = database.prepare(`SELECT a.id,a.display_name,g.login,g.avatar_url FROM accounts a
      LEFT JOIN github_identities g ON g.account_id=a.id WHERE a.id=?`).get(identity.accountId) as { id:string; display_name:string; login:string | null; avatar_url:string | null };
    return { id:row.id, displayName:row.display_name, githubLogin:row.login, avatarUrl:row.avatar_url };
  });

  app.get("/v1/topics", async (request, reply) => {
    const identity = requireBrowser(request, reply); if (!identity) return;
    reply.header("Cache-Control", "private, no-store");
    return { topics:listTopics(database, identity.accountId) };
  });

  app.put("/v1/topics", async (request, reply) => {
    const identity = requireBrowser(request, reply); if (!identity) return;
    const parsed = parseTopics((request.body as { topics?:unknown } | null)?.topics);
    if (!parsed) return reply.code(400).send({ error:"invalid_topics" });
    const replace = database.transaction(() => {
      database.prepare("DELETE FROM topics WHERE account_id = ?").run(identity.accountId);
      const insert = database.prepare("INSERT INTO topics VALUES (?,?,?,?,?)");
      for (const topic of parsed) insert.run(topic.id, identity.accountId, topic.name, JSON.stringify(topic.keywords), topic.enabled ? 1 : 0);
    });
    replace();
    return { topics:listTopics(database, identity.accountId) };
  });

  app.get("/v1/devices", async (request, reply) => {
    const identity = requireBrowser(request, reply); if (!identity) return;
    reply.header("Cache-Control", "private, no-store");
    const devices = database.prepare(`SELECT id,label,created_at,last_seen_at FROM device_tokens
      WHERE account_id=? AND revoked_at IS NULL ORDER BY created_at DESC`).all(identity.accountId) as Array<{ id:string; label:string; created_at:string; last_seen_at:string | null }>;
    return { devices:devices.map((device) => ({ id:device.id, label:device.label, createdAt:device.created_at, lastSeenAt:device.last_seen_at })) };
  });

  app.post("/v1/devices", { config:{ rateLimit:{ max:10, timeWindow:"1 minute" } } }, async (request, reply) => {
    const identity = requireBrowser(request, reply); if (!identity) return;
    const label = (request.body as { label?:unknown } | null)?.label;
    if (typeof label !== "string" || !label.trim() || label.trim().length > 80) return reply.code(400).send({ error:"invalid_device_label" });
    const active = database.prepare("SELECT count(*) AS count FROM device_tokens WHERE account_id=? AND revoked_at IS NULL").get(identity.accountId) as { count:number };
    if (active.count >= 8) return reply.code(409).send({ error:"device_limit" });
    const token = opaqueToken(); const id = `device_${randomUUID()}`; const now = new Date().toISOString();
    database.prepare("INSERT INTO device_tokens (id,account_id,label,token_hash,created_at) VALUES (?,?,?,?,?)").run(id, identity.accountId, label.trim(), hashDeviceToken(token), now);
    reply.header("Cache-Control", "private, no-store");
    return reply.code(201).send({ device:{ id, label:label.trim(), createdAt:now, lastSeenAt:null }, token });
  });

  app.delete("/v1/devices/:deviceId", async (request, reply) => {
    const identity = requireBrowser(request, reply); if (!identity) return;
    const { deviceId } = request.params as { deviceId:string };
    const result = database.prepare("UPDATE device_tokens SET revoked_at=? WHERE id=? AND account_id=? AND revoked_at IS NULL").run(new Date().toISOString(), deviceId, identity.accountId);
    if (result.changes !== 1) return reply.code(404).send({ error:"device_not_found" });
    return reply.code(204).send();
  });

  app.put("/v1/signals/:signalId/read", async (request, reply) => {
    const identity = requireBrowser(request, reply); if (!identity) return;
    const { signalId } = request.params as { signalId:string };
    const signal = database.prepare("SELECT id FROM signals WHERE id=?").get(signalId);
    if (!signal) return reply.code(404).send({ error:"signal_not_found" });
    database.prepare("INSERT INTO read_state VALUES (?,?,?) ON CONFLICT(account_id,signal_id) DO UPDATE SET read_at=excluded.read_at").run(identity.accountId, signalId, new Date().toISOString());
    return reply.code(204).send();
  });

  app.get("/v1/snapshot", { config:{ rateLimit:{ max:30, timeWindow:"1 minute" } } }, async (request, reply) => {
    const token = extractBearer(request.headers.authorization);
    const deviceIdentity = token ? authenticateDevice(database, token) : null;
    const accountId = deviceIdentity?.accountId ?? browserIdentity(request)?.accountId;
    if (!accountId) return reply.code(401).send({ error:"unauthorized" });
    reply.header("Cache-Control", "private, no-store");
    return buildSnapshot(database, accountId);
  });
  return app;
}

function cookieOptions(secure:boolean, maxAge:number) {
  return { httpOnly:true, secure, sameSite:"lax" as const, path:"/", maxAge };
}

function listTopics(database:PerceptionDatabase, accountId:string) {
  const rows = database.prepare("SELECT id,name,keywords_json,enabled FROM topics WHERE account_id=? ORDER BY name").all(accountId) as Array<{ id:string; name:string; keywords_json:string; enabled:number }>;
  return rows.map((row) => ({ id:row.id, name:row.name, keywords:JSON.parse(row.keywords_json) as string[], enabled:row.enabled === 1 }));
}

function parseTopics(value:unknown) {
  if (!Array.isArray(value) || value.length > 8) return null;
  const topics:Array<{ id:string; name:string; keywords:string[]; enabled:boolean }> = [];
  const names = new Set<string>(); const ids = new Set<string>();
  for (const raw of value as TopicInput[]) {
    if (!raw || typeof raw !== "object" || typeof raw.name !== "string" || !Array.isArray(raw.keywords) || (raw.enabled !== undefined && typeof raw.enabled !== "boolean")) return null;
    const name = raw.name.trim(); const normalizedName = name.toLocaleLowerCase("en-US");
    if (!name || name.length > 40 || names.has(normalizedName) || raw.keywords.length > 8) return null;
    const keywords = raw.keywords.map((item) => typeof item === "string" ? item.trim() : "");
    if (keywords.some((keyword) => !keyword || keyword.length > 64) || new Set(keywords.map((keyword) => keyword.toLocaleLowerCase("en-US"))).size !== keywords.length) return null;
    const id = typeof raw.id === "string" && /^topic_[A-Za-z0-9_-]{1,80}$/.test(raw.id) ? raw.id : `topic_${randomUUID()}`;
    if (ids.has(id)) return null;
    names.add(normalizedName); ids.add(id); topics.push({ id, name, keywords, enabled:raw.enabled !== false });
  }
  return topics;
}
