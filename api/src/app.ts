import { randomUUID } from "node:crypto";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import type { PerceptionDatabase } from "./database.js";
import { authenticateDevice, extractBearer, hashDeviceToken } from "./auth.js";
import {
  authenticateBrowser, consumeMagicLink, createBrowserSession, createMagicLink,
  hashOpaqueToken, opaqueToken, revokeBrowserSession, SESSION_COOKIE, type MagicLinkSender,
} from "./browser-auth.js";
import { accountEntitlement, processSubscriptionWebhook, validEmail, verifyLemonSignature, type LemonSqueezyConfig } from "./entitlements.js";
import { buildSnapshot } from "./snapshot.js";
import { secureKeyMatches, scoreAccountSignals, type IngestionService } from "./ingestion.js";
import { deliverPendingCustomerMessages, type CustomerMessageSender } from "./customer-messages.js";
import { isProductEventName, recordProductEvent } from "./product-events.js";

export type AppConfig = {
  webOrigin:string; apiOrigin?:string; secureCookies?:boolean; checkoutUrl?:string;
  magicLinkSender?:MagicLinkSender; lemonSqueezy?:LemonSqueezyConfig;
  customerMessageSender?:CustomerMessageSender;
  ingestionService?:IngestionService; ingestionKey?:string;
};
type TopicInput = { id?:unknown; name?:unknown; keywords?:unknown; enabled?:unknown };

export async function createApp(database:PerceptionDatabase, config:AppConfig | string) {
  const options:AppConfig = typeof config === "string" ? { webOrigin:config, secureCookies:false } : config;
  const secureCookies = options.secureCookies ?? true;
  const app = Fastify({ logger:false, bodyLimit:64 * 1024, trustProxy:true });
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs:"buffer" }, (request, body, done) => {
    if (request.url === "/v1/billing/webhook") return done(null, body);
    try { done(null, JSON.parse(body.toString("utf8"))); }
    catch (error) { done(error as Error, undefined); }
  });
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
  const requireSession = (request:FastifyRequest, reply:FastifyReply) => {
    const identity = browserIdentity(request);
    if (!identity) reply.code(401).send({ error:"unauthorized" });
    return identity;
  };
  const requireBrowser = (request:FastifyRequest, reply:FastifyReply) => {
    const identity = requireSession(request, reply);
    if (!identity) return null;
    if (!accountEntitlement(database, identity.accountId)?.entitled) {
      reply.code(402).send({ error:"entitlement_required", checkoutUrl:options.checkoutUrl ?? null });
      return null;
    }
    return identity;
  };

  app.get("/healthz", async () => ({ status:"ok", service:"perception-api", contractVersion:"1.0" }));

  app.post("/v1/events", { config:{ rateLimit:{ max:60, timeWindow:"1 minute" } } }, async (request, reply) => {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length !== 1 || !isProductEventName((body as { name?:unknown }).name) || (body as { name:string }).name === "purchase_entitled") {
      return reply.code(400).send({ error:"invalid_product_event" });
    }
    const identity = browserIdentity(request);
    recordProductEvent(database, (body as { name:Parameters<typeof recordProductEvent>[1] }).name, identity?.accountId ?? null);
    reply.header("Cache-Control", "no-store");
    return reply.code(202).send({ accepted:true });
  });

  app.post("/v1/ingestion", { config:{ rateLimit:{ max:4, timeWindow:"15 minutes" } } }, async (request, reply) => {
    if (!options.ingestionService || !options.ingestionKey) return reply.code(503).send({ error:"ingestion_unavailable" });
    if (!secureKeyMatches(options.ingestionKey, headerValue(request.headers["x-ingestion-key"]))) return reply.code(401).send({ error:"unauthorized" });
    const result = await options.ingestionService.run("manual");
    reply.header("Cache-Control", "no-store");
    return result;
  });

  app.post("/v1/billing/webhook", { config:{ rateLimit:{ max:60, timeWindow:"1 minute" } } }, async (request, reply) => {
    const rawBody = request.body;
    if (!options.lemonSqueezy || !Buffer.isBuffer(rawBody)) return reply.code(503).send({ error:"billing_webhook_unavailable" });
    const signature = headerValue(request.headers["x-signature"]);
    if (!verifyLemonSignature(rawBody, signature, options.lemonSqueezy.webhookSecret)) return reply.code(401).send({ error:"invalid_signature" });
    const result = processSubscriptionWebhook(database, rawBody, headerValue(request.headers["x-event-name"]), options.lemonSqueezy);
    if (options.customerMessageSender) await deliverPendingCustomerMessages(database, options.customerMessageSender);
    return reply.code(200).send({ received:true, duplicate:result.duplicate });
  });

  app.post("/v1/auth/magic-link", { config:{ rateLimit:{ max:5, timeWindow:"15 minutes" } } }, async (request, reply) => {
    if (!options.magicLinkSender) return reply.code(503).send({ error:"auth_unavailable" });
    const email = (request.body as { email?:unknown } | null)?.email;
    if (validEmail(email)) {
      const token = createMagicLink(database, email);
      if (token) {
        const url = `${options.webOrigin}/#magic=${encodeURIComponent(token)}`;
        try { await options.magicLinkSender.send({ email:email.trim().toLocaleLowerCase("en-US"), url }); }
        catch { database.prepare("DELETE FROM magic_links WHERE token_hash=?").run(hashOpaqueToken(token)); }
      }
    }
    reply.header("Cache-Control", "no-store");
    return reply.code(202).send({ status:"accepted", checkoutUrl:options.checkoutUrl ?? null });
  });

  app.post("/v1/auth/magic-link/consume", { config:{ rateLimit:{ max:20, timeWindow:"1 minute" } } }, async (request, reply) => {
    if (request.headers.origin !== options.webOrigin) return reply.code(403).send({ error:"origin_forbidden" });
    const token = (request.body as { token?:unknown } | null)?.token;
    const identity = typeof token === "string" ? consumeMagicLink(database, token) : null;
    if (!identity) return reply.code(401).send({ error:"invalid_magic_link" });
    const session = createBrowserSession(database, identity.accountId);
    reply.setCookie(SESSION_COOKIE, session, cookieOptions(secureCookies, 30 * 24 * 60 * 60));
    reply.header("Cache-Control", "no-store");
    return reply.code(204).send();
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    revokeBrowserSession(database, request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, { path:"/" });
    return reply.code(204).send();
  });

  app.get("/v1/account", async (request, reply) => {
    const identity = requireSession(request, reply); if (!identity) return;
    reply.header("Cache-Control", "private, no-store");
    const row = database.prepare(`SELECT a.id,a.display_name,e.email FROM accounts a
      JOIN email_identities e ON e.account_id=a.id WHERE a.id=?`).get(identity.accountId) as { id:string; display_name:string; email:string };
    const entitlement = accountEntitlement(database, identity.accountId);
    return { id:row.id, displayName:row.display_name, email:row.email, entitlement };
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
    scoreAccountSignals(database, identity.accountId);
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
    const token = extractBearer(request.headers.authorization);
    const deviceIdentity = token ? authenticateDevice(database, token) : null;
    const browser = deviceIdentity ? null : requireBrowser(request, reply);
    const accountId = deviceIdentity?.accountId ?? browser?.accountId;
    if (!accountId) return;
    const { signalId } = request.params as { signalId:string };
    const signal = database.prepare("SELECT id FROM signals WHERE id=?").get(signalId);
    if (!signal) return reply.code(404).send({ error:"signal_not_found" });
    database.prepare("INSERT INTO read_state VALUES (?,?,?) ON CONFLICT(account_id,signal_id) DO UPDATE SET read_at=excluded.read_at").run(accountId, signalId, new Date().toISOString());
    return reply.code(204).send();
  });

  app.get("/v1/snapshot", { config:{ rateLimit:{ max:30, timeWindow:"1 minute" } } }, async (request, reply) => {
    const rawWindow = (request.query as { windowHours?:unknown }).windowHours;
    const windowHours = rawWindow === undefined ? 24 : Number(rawWindow);
    if (!Number.isSafeInteger(windowHours) || windowHours < 1 || windowHours > 168) return reply.code(400).send({ error:"invalid_window" });
    const token = extractBearer(request.headers.authorization);
    const deviceIdentity = token ? authenticateDevice(database, token) : null;
    const sessionIdentity = deviceIdentity ? null : browserIdentity(request);
    const accountId = deviceIdentity?.accountId ?? sessionIdentity?.accountId;
    if (!accountId) return reply.code(401).send({ error:"unauthorized" });
    if (!deviceIdentity && !accountEntitlement(database, accountId)?.entitled) return reply.code(402).send({ error:"entitlement_required", checkoutUrl:options.checkoutUrl ?? null });
    reply.header("Cache-Control", "private, no-store");
    return buildSnapshot(database, accountId, new Date(), windowHours);
  });
  return app;
}

function cookieOptions(secure:boolean, maxAge:number) {
  return { httpOnly:true, secure, sameSite:"lax" as const, path:"/", maxAge };
}

function headerValue(value:string | string[] | undefined):string | undefined { return Array.isArray(value) ? value[0] : value; }

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
