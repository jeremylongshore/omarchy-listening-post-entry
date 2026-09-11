import { randomUUID } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";

export const PRODUCT_EVENTS = [
  "landing_view", "checkout_opened", "sign_in_opened", "magic_link_requested",
  "signal_room_opened", "first_signal_opened", "device_credential_created",
  "listening_post_paired", "purchase_entitled",
] as const;
export type ProductEventName = typeof PRODUCT_EVENTS[number];

const RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

export function isProductEventName(value:unknown):value is ProductEventName {
  return typeof value === "string" && (PRODUCT_EVENTS as readonly string[]).includes(value);
}

export function recordProductEvent(database:PerceptionDatabase, name:ProductEventName, accountId:string | null, now = new Date()):void {
  const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
  database.transaction(() => {
    database.prepare("DELETE FROM product_events WHERE occurred_at < ?").run(cutoff);
    database.prepare("INSERT INTO product_events VALUES (?,?,?,?)").run(`event_${randomUUID()}`, name, accountId, now.toISOString());
  })();
}
