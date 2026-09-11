import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";

export const SUBSCRIPTION_STATUSES = ["on_trial", "active", "paused", "past_due", "unpaid", "cancelled", "expired"] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

export type LemonSqueezyConfig = {
  webhookSecret:string;
  storeId:number;
  variantIds:Set<number>;
  allowTestMode?:boolean;
};

type SubscriptionAttributes = {
  store_id:unknown; customer_id:unknown; product_id:unknown; variant_id:unknown;
  user_email:unknown; user_name?:unknown; status:unknown; renews_at?:unknown; ends_at?:unknown;
  updated_at:unknown; test_mode:unknown; urls?:{ customer_portal?:unknown };
};

type SubscriptionWebhook = {
  meta?:{ event_name?:unknown };
  data?:{ type?:unknown; id?:unknown; attributes?:SubscriptionAttributes };
};

export type Entitlement = {
  email:string; status:SubscriptionStatus; entitled:boolean; customerPortalUrl:string | null;
  renewsAt:string | null; endsAt:string | null;
};

export function normalizeEmail(value:string):string { return value.trim().toLocaleLowerCase("en-US"); }

export function validEmail(value:unknown):value is string {
  return typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function isEntitledStatus(status:string):status is SubscriptionStatus {
  return (SUBSCRIPTION_STATUSES as readonly string[]).includes(status) && status !== "expired";
}

export function entitlementForEmail(database:PerceptionDatabase, email:string, now = new Date()):Entitlement | null {
  const row = database.prepare(`SELECT email,status,customer_portal_url,renews_at,ends_at
    FROM billing_entitlements WHERE email=?
    ORDER BY CASE WHEN status='expired' THEN 1 ELSE 0 END, upstream_updated_at DESC LIMIT 1`).get(normalizeEmail(email)) as {
      email:string; status:SubscriptionStatus; customer_portal_url:string | null; renews_at:string | null; ends_at:string | null;
    } | undefined;
  const graceEnded = row?.status === "cancelled" && (!row.ends_at || Date.parse(row.ends_at) <= now.getTime());
  return row ? { email:row.email, status:row.status, entitled:isEntitledStatus(row.status) && !graceEnded, customerPortalUrl:row.customer_portal_url, renewsAt:row.renews_at, endsAt:row.ends_at } : null;
}

export function accountEntitlement(database:PerceptionDatabase, accountId:string):Entitlement | null {
  const identity = database.prepare("SELECT email FROM email_identities WHERE account_id=?").get(accountId) as { email:string } | undefined;
  return identity ? entitlementForEmail(database, identity.email) : null;
}

export function verifyLemonSignature(rawBody:Buffer, signature:string | undefined, secret:string):boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"), "hex");
  const actual = Buffer.from(signature, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function processSubscriptionWebhook(database:PerceptionDatabase, rawBody:Buffer, eventHeader:string | undefined, config:LemonSqueezyConfig, now = new Date()): { duplicate:boolean; outcome:string } {
  const digest = createHash("sha256").update(rawBody).digest("hex");
  const duplicate = database.prepare("SELECT outcome FROM webhook_events WHERE body_digest=?").get(digest) as { outcome:string } | undefined;
  if (duplicate) return { duplicate:true, outcome:duplicate.outcome };

  let payload:SubscriptionWebhook;
  try { payload = JSON.parse(rawBody.toString("utf8")) as SubscriptionWebhook; }
  catch { return record("invalid_payload"); }
  const eventName = payload.meta?.event_name;
  const data = payload.data;
  const attributes = data?.attributes;
  if (typeof eventName !== "string" || eventName !== eventHeader || !["subscription_created", "subscription_updated"].includes(eventName)) return record("ignored_event", typeof eventName === "string" ? eventName : "unknown", stringValue(data?.id));
  if (data?.type !== "subscriptions" || !data.id || !attributes) return record("invalid_payload", eventName, stringValue(data?.id));

  const status = stringValue(attributes.status);
  const email = validEmail(attributes.user_email) ? normalizeEmail(attributes.user_email) : null;
  const storeId = integerValue(attributes.store_id); const productId = integerValue(attributes.product_id); const variantId = integerValue(attributes.variant_id);
  const customerId = stringValue(attributes.customer_id); const updatedAt = isoDate(attributes.updated_at);
  const testMode = attributes.test_mode;
  if (!email || !status || !(SUBSCRIPTION_STATUSES as readonly string[]).includes(status) || storeId === null || productId === null || variantId === null || !customerId || !updatedAt || typeof testMode !== "boolean") return record("invalid_payload", eventName, String(data.id));
  if (storeId !== config.storeId || !config.variantIds.has(variantId) || (testMode && !config.allowTestMode)) return record("outside_catalog", eventName, String(data.id));

  const userName = typeof attributes.user_name === "string" && attributes.user_name.trim() ? attributes.user_name.trim().slice(0, 80) : null;
  const renewsAt = nullableIsoDate(attributes.renews_at); const endsAt = nullableIsoDate(attributes.ends_at);
  const portal = typeof attributes.urls?.customer_portal === "string" && safeHttpsUrl(attributes.urls.customer_portal) ? attributes.urls.customer_portal : null;
  const appliedAt = now.toISOString();
  const apply = database.transaction(() => {
    const existing = database.prepare("SELECT upstream_updated_at FROM billing_entitlements WHERE subscription_id=?").get(String(data.id)) as { upstream_updated_at:string } | undefined;
    const outcome = existing && existing.upstream_updated_at > updatedAt ? "stale_event" : "applied";
    if (outcome === "applied") database.prepare(`INSERT INTO billing_entitlements
      (subscription_id,email,customer_id,store_id,product_id,variant_id,status,user_name,renews_at,ends_at,customer_portal_url,test_mode,upstream_updated_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(subscription_id) DO UPDATE SET
      email=excluded.email,customer_id=excluded.customer_id,store_id=excluded.store_id,product_id=excluded.product_id,variant_id=excluded.variant_id,status=excluded.status,user_name=excluded.user_name,renews_at=excluded.renews_at,ends_at=excluded.ends_at,customer_portal_url=excluded.customer_portal_url,test_mode=excluded.test_mode,upstream_updated_at=excluded.upstream_updated_at,updated_at=excluded.updated_at`).run(
        String(data.id), email, customerId, storeId, productId, variantId, status, userName, renewsAt, endsAt, portal, testMode ? 1 : 0, updatedAt, appliedAt,
      );
    const messageKind = outcome === "applied" ? customerMessageKind(eventName, status) : null;
    if (messageKind) {
      const messageId = createHash("sha256").update(`billing:${String(data.id)}:${updatedAt}:${messageKind}`).digest("hex");
      database.prepare(`INSERT OR IGNORE INTO customer_messages
        (id,email,kind,payload_json,created_at) VALUES (?,?,?,?,?)`).run(
          messageId, email, messageKind,
          JSON.stringify({ name:userName, portalUrl:portal, endsAt }), appliedAt,
        );
    }
    if (outcome === "applied" && eventName === "subscription_created" && status !== "expired") {
      const eventId = createHash("sha256").update(`purchase:${String(data.id)}:${updatedAt}`).digest("hex");
      database.prepare("INSERT OR IGNORE INTO product_events VALUES (?,?,NULL,?)").run(`event_${eventId}`, "purchase_entitled", appliedAt);
    }
    database.prepare("INSERT INTO webhook_events VALUES (?,?,?,?,?)").run(digest, eventName, String(data.id), appliedAt, outcome);
    return outcome;
  });
  return { duplicate:false, outcome:apply() };

  function record(outcome:string, name = "unknown", resourceId:string | null = null) {
    database.prepare("INSERT INTO webhook_events VALUES (?,?,?,?,?)").run(digest, name, resourceId, now.toISOString(), outcome);
    return { duplicate:false, outcome };
  }
}

function customerMessageKind(eventName:string, status:string):"welcome" | "billing_attention" | "cancelled" | "access_ended" | null {
  if (eventName === "subscription_created" && status !== "expired") return "welcome";
  if (status === "past_due" || status === "unpaid") return "billing_attention";
  if (status === "cancelled") return "cancelled";
  if (status === "expired") return "access_ended";
  return null;
}

function integerValue(value:unknown):number | null { return typeof value === "number" && Number.isSafeInteger(value) ? value : null; }
function stringValue(value:unknown):string | null { return typeof value === "string" || typeof value === "number" ? String(value) : null; }
function isoDate(value:unknown):string | null { if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return null; return new Date(value).toISOString(); }
function nullableIsoDate(value:unknown):string | null { return value === null || value === undefined ? null : isoDate(value); }
function safeHttpsUrl(value:string):boolean { try { return new URL(value).protocol === "https:"; } catch { return false; } }
