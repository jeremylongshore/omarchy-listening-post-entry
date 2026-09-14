import { randomUUID } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";
import { accountEntitlement } from "./entitlements.js";
import { hashDeviceToken } from "./auth.js";
import { hashOpaqueToken, opaqueToken } from "./browser-auth.js";

const PAIRING_LIFETIME_MS = 10 * 60_000;

export function createPairingCode(database:PerceptionDatabase, accountId:string, label:string, now = new Date()) {
  database.prepare("DELETE FROM pairing_codes WHERE expires_at <= ? OR consumed_at IS NOT NULL").run(now.toISOString());
  const code = opaqueToken(); const id = `pair_${randomUUID()}`;
  const expiresAt = new Date(now.getTime() + PAIRING_LIFETIME_MS).toISOString();
  database.prepare("INSERT INTO pairing_codes (id,account_id,label,code_hash,created_at,expires_at) VALUES (?,?,?,?,?,?)")
    .run(id, accountId, label, hashOpaqueToken(code), now.toISOString(), expiresAt);
  return { id, code, expiresAt };
}

export function exchangePairingCode(database:PerceptionDatabase, code:string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{32,256}$/.test(code)) return null;
  const digest = hashOpaqueToken(code);
  const row = database.prepare(`SELECT id,account_id,label FROM pairing_codes
    WHERE code_hash=? AND expires_at>? AND consumed_at IS NULL`).get(digest, now.toISOString()) as { id:string; account_id:string; label:string } | undefined;
  if (!row || !accountEntitlement(database, row.account_id)?.entitled) return null;
  return database.transaction(() => {
    const consumed = database.prepare("UPDATE pairing_codes SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?")
      .run(now.toISOString(), row.id, now.toISOString());
    if (consumed.changes !== 1) return null;
    const token = opaqueToken(); const deviceId = `device_${randomUUID()}`;
    database.prepare("INSERT INTO device_tokens (id,account_id,label,token_hash,created_at) VALUES (?,?,?,?,?)")
      .run(deviceId, row.account_id, row.label, hashDeviceToken(token), now.toISOString());
    database.prepare("UPDATE pairing_codes SET device_id=? WHERE id=?").run(deviceId, row.id);
    return { token, device:{ id:deviceId, label:row.label, createdAt:now.toISOString(), lastSeenAt:null } };
  })();
}
