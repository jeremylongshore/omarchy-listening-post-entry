import { createHash, timingSafeEqual } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";
import { accountEntitlement } from "./entitlements.js";

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function extractBearer(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(header);
  return match ? match[1] : null;
}

export function authenticateDevice(database: PerceptionDatabase, token: string): { deviceId: string; accountId: string } | null {
  const digest = hashDeviceToken(token);
  const row = database.prepare(`SELECT id, account_id, token_hash FROM device_tokens WHERE token_hash = ? AND revoked_at IS NULL`).get(digest) as { id: string; account_id: string; token_hash: string } | undefined;
  if (!row) return null;
  const expected = Buffer.from(row.token_hash, "hex");
  const actual = Buffer.from(digest, "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  if (!accountEntitlement(database, row.account_id)?.entitled) return null;
  database.prepare("UPDATE device_tokens SET last_seen_at = ? WHERE id = ?").run(new Date().toISOString(), row.id);
  return { deviceId: row.id, accountId: row.account_id };
}
