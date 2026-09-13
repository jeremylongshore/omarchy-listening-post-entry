import type { PerceptionDatabase } from "./database.js";

export const CUSTOMER_MESSAGE_KINDS = ["welcome", "billing_attention", "cancelled", "access_ended"] as const;
export type CustomerMessageKind = typeof CUSTOMER_MESSAGE_KINDS[number];

export type CustomerMessage = {
  id:string;
  email:string;
  kind:CustomerMessageKind;
  name:string | null;
  portalUrl:string | null;
  endsAt:string | null;
};

export interface CustomerMessageSender {
  sendCustomerMessage(message:CustomerMessage):Promise<void>;
}

type MessageRow = {
  id:string; email:string; kind:CustomerMessageKind; payload_json:string;
};

export async function deliverPendingCustomerMessages(
  database:PerceptionDatabase,
  sender:CustomerMessageSender,
  now = new Date(),
  limit = 10,
  deliveryTimeoutMs = 30_000,
):Promise<{ sent:number; failed:number }> {
  let sent = 0; let failed = 0;
  for (let index = 0; index < limit; index += 1) {
    const row = claimNext(database, now);
    if (!row) break;
    const payload = parsePayload(row.payload_json);
    try {
      await withTimeout(sender.sendCustomerMessage({ id:row.id, email:row.email, kind:row.kind, ...payload }), deliveryTimeoutMs);
      const completedAt = new Date().toISOString();
      database.prepare("UPDATE customer_messages SET sent_at=?,claimed_at=NULL,next_attempt_at=NULL,last_error=NULL,updated_at=? WHERE id=?").run(completedAt, completedAt, row.id);
      sent += 1;
    } catch (error) {
      const detail = error instanceof Error ? error.message : "delivery failed";
      const attempt = database.prepare("SELECT attempts FROM customer_messages WHERE id=?").get(row.id) as { attempts:number };
      const retryDelayMs = Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, attempt.attempts - 1));
      const failedAt = new Date();
      database.prepare("UPDATE customer_messages SET claimed_at=NULL,next_attempt_at=?,last_error=?,updated_at=? WHERE id=?")
        .run(new Date(failedAt.getTime() + retryDelayMs).toISOString(), detail.slice(0, 500), failedAt.toISOString(), row.id);
      failed += 1;
    }
  }
  return { sent, failed };
}

export function startCustomerMessageWorker(database:PerceptionDatabase, sender:CustomerMessageSender, intervalMs = 60_000) {
  let running = false;
  const drain = async () => {
    if (running) return;
    running = true;
    try { await deliverPendingCustomerMessages(database, sender); }
    finally { running = false; }
  };
  void drain();
  const timer = setInterval(() => { void drain(); }, intervalMs);
  timer.unref();
  return async () => { clearInterval(timer); while (running) await new Promise((resolve) => setTimeout(resolve, 10)); };
}

function claimNext(database:PerceptionDatabase, now:Date):MessageRow | null {
  const staleClaim = new Date(now.getTime() - 5 * 60_000).toISOString();
  return database.transaction(() => {
    const row = database.prepare(`SELECT id,email,kind,payload_json FROM customer_messages
      WHERE sent_at IS NULL AND attempts < 10 AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        AND (claimed_at IS NULL OR claimed_at < ?)
      ORDER BY created_at,id LIMIT 1`).get(now.toISOString(), staleClaim) as MessageRow | undefined;
    if (!row) return null;
    const claim = database.prepare(`UPDATE customer_messages SET claimed_at=?,attempts=attempts+1,updated_at=?
      WHERE id=? AND sent_at IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
        AND (claimed_at IS NULL OR claimed_at < ?)`).run(now.toISOString(), now.toISOString(), row.id, now.toISOString(), staleClaim);
    return claim.changes === 1 ? row : null;
  })();
}

async function withTimeout<T>(operation:Promise<T>, timeoutMs:number):Promise<T> {
  let timer:ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<T>((_resolve, reject) => { timer = setTimeout(() => reject(new Error("delivery_timeout")), timeoutMs); }),
    ]);
  } finally { if (timer) clearTimeout(timer); }
}

function parsePayload(value:string):{ name:string | null; portalUrl:string | null; endsAt:string | null } {
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    return {
      name:typeof raw.name === "string" ? raw.name : null,
      portalUrl:typeof raw.portalUrl === "string" ? raw.portalUrl : null,
      endsAt:typeof raw.endsAt === "string" ? raw.endsAt : null,
    };
  } catch { return { name:null, portalUrl:null, endsAt:null }; }
}
