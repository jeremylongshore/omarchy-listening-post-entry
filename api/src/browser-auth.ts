import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";
import { entitlementForEmail, normalizeEmail } from "./entitlements.js";
import { scoreAccountSignals } from "./ingestion.js";

export const SESSION_COOKIE = "perception_session";
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const MAGIC_LINK_LIFETIME_MS = 15 * 60 * 1000;

export interface MagicLinkSender {
  send(message:{ email:string; url:string }):Promise<void>;
}

export function opaqueToken(bytes = 32):string { return randomBytes(bytes).toString("base64url"); }
export function hashOpaqueToken(token:string):string { return createHash("sha256").update(token, "utf8").digest("hex"); }

export function createMagicLink(database:PerceptionDatabase, email:string, now = new Date()):string | null {
  const normalized = normalizeEmail(email);
  if (!entitlementForEmail(database, normalized)?.entitled) return null;
  database.prepare("DELETE FROM magic_links WHERE expires_at <= ? OR consumed_at IS NOT NULL").run(now.toISOString());
  const token = opaqueToken();
  database.prepare("INSERT INTO magic_links VALUES (?,?,?,?,?,NULL)").run(`magic_${randomUUID()}`, normalized, hashOpaqueToken(token), now.toISOString(), new Date(now.getTime() + MAGIC_LINK_LIFETIME_MS).toISOString());
  return token;
}

export function consumeMagicLink(database:PerceptionDatabase, token:string, now = new Date()):{ accountId:string } | null {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(token)) return null;
  const digest = hashOpaqueToken(token);
  const row = database.prepare("SELECT id,email,token_hash FROM magic_links WHERE token_hash=? AND expires_at>? AND consumed_at IS NULL").get(digest, now.toISOString()) as { id:string; email:string; token_hash:string } | undefined;
  if (!row || !safeEqual(row.token_hash, digest) || !entitlementForEmail(database, row.email)?.entitled) return null;
  return database.transaction(() => {
    const consumed = database.prepare("UPDATE magic_links SET consumed_at=? WHERE id=? AND consumed_at IS NULL").run(now.toISOString(), row.id);
    if (consumed.changes !== 1) return null;
    return { accountId:upsertEmailAccount(database, row.email, now) };
  })();
}

export function upsertEmailAccount(database:PerceptionDatabase, email:string, now = new Date()):string {
  const normalized = normalizeEmail(email);
  const existing = database.prepare("SELECT account_id FROM email_identities WHERE email=?").get(normalized) as { account_id:string } | undefined;
  const accountId = existing?.account_id ?? `acct_${randomUUID()}`;
  const billing = database.prepare("SELECT user_name FROM billing_entitlements WHERE email=? ORDER BY upstream_updated_at DESC LIMIT 1").get(normalized) as { user_name:string | null } | undefined;
  const displayName = (billing?.user_name?.trim() || normalized.split("@")[0] || "Perception account").slice(0, 80);
  if (!existing) {
    database.prepare("INSERT INTO accounts VALUES (?,?,?)").run(accountId, displayName, now.toISOString());
    database.prepare("INSERT INTO email_identities VALUES (?,?,?)").run(normalized, accountId, now.toISOString());
  } else {
    database.prepare("UPDATE accounts SET display_name=? WHERE id=?").run(displayName, accountId);
    database.prepare("UPDATE email_identities SET updated_at=? WHERE email=?").run(now.toISOString(), normalized);
  }
  scoreAccountSignals(database, accountId);
  return accountId;
}

export function createBrowserSession(database:PerceptionDatabase, accountId:string, now = new Date()):string {
  database.prepare("DELETE FROM browser_sessions WHERE expires_at <= ?").run(now.toISOString());
  const token = opaqueToken();
  database.prepare("INSERT INTO browser_sessions VALUES (?, ?, ?, ?, ?, ?)").run(`session_${randomUUID()}`, accountId, hashOpaqueToken(token), now.toISOString(), new Date(now.getTime() + SESSION_LIFETIME_MS).toISOString(), now.toISOString());
  return token;
}

export function authenticateBrowser(database:PerceptionDatabase, token:string | undefined, now = new Date()):{ accountId:string } | null {
  if (!token || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) return null;
  const digest = hashOpaqueToken(token);
  const row = database.prepare("SELECT id,account_id,token_hash FROM browser_sessions WHERE token_hash=? AND expires_at>?").get(digest, now.toISOString()) as { id:string; account_id:string; token_hash:string } | undefined;
  if (!row || !safeEqual(row.token_hash, digest)) return null;
  database.prepare("UPDATE browser_sessions SET last_seen_at=? WHERE id=?").run(now.toISOString(), row.id);
  return { accountId:row.account_id };
}

export function revokeBrowserSession(database:PerceptionDatabase, token:string | undefined):void {
  if (token) database.prepare("DELETE FROM browser_sessions WHERE token_hash=?").run(hashOpaqueToken(token));
}

function safeEqual(left:string, right:string):boolean {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
