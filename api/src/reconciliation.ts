import { randomUUID } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";
import { processSubscriptionWebhook, type LemonSqueezyConfig } from "./entitlements.js";

const API_ORIGIN = "https://api.lemonsqueezy.com";

type Trigger = "startup" | "scheduled" | "manual";
type Fetcher = (input:string | URL, init?:RequestInit) => Promise<Response>;

export type ReconciliationResult = {
  trigger:Trigger; startedAt:string; finishedAt:string;
  subscriptionsSeen:number; refundsSeen:number; eventsApplied:number;
};

export class BillingReconciler {
  private active:Promise<ReconciliationResult> | null = null;
  private currentAbort:AbortController | null = null;

  constructor(
    private database:PerceptionDatabase,
    private apiKey:string,
    private catalog:LemonSqueezyConfig,
    private fetcher:Fetcher = fetch,
    private timeoutMs = 15_000,
  ) {}

  run(trigger:Trigger, now = new Date()):Promise<ReconciliationResult> {
    if (this.active) return this.active;
    this.active = this.execute(trigger, now).finally(() => { this.active = null; });
    return this.active;
  }

  async cancelActive():Promise<void> {
    this.currentAbort?.abort();
    await this.active?.then(() => undefined, () => undefined);
  }

  private async execute(trigger:Trigger, now:Date):Promise<ReconciliationResult> {
    const startedAt = now.toISOString(); let subscriptionsSeen = 0; let refundsSeen = 0; let eventsApplied = 0;
    try {
      const subscriptionResult = await this.scanCollection("/v1/subscriptions", "subscription_updated", now);
      subscriptionsSeen = subscriptionResult.seen; eventsApplied += subscriptionResult.applied;
      const refundResult = await this.scanCollection("/v1/subscription-invoices", "subscription_payment_refunded", now, { "filter[refunded]":"true" });
      refundsSeen = refundResult.seen; eventsApplied += refundResult.applied;
      const result = { trigger, startedAt, finishedAt:new Date().toISOString(), subscriptionsSeen, refundsSeen, eventsApplied };
      this.record(result, "success", null);
      return result;
    } catch (error) {
      const code = safeErrorCode(error);
      this.record({ trigger, startedAt, finishedAt:new Date().toISOString(), subscriptionsSeen, refundsSeen, eventsApplied }, "failed", code);
      throw new Error(code);
    }
  }

  private async scanCollection(path:string, eventName:string, now:Date, filters:Record<string,string> = {}):Promise<{ seen:number; applied:number }> {
    let page:URL | null = new URL(path, API_ORIGIN); let seen = 0; let applied = 0;
    page.searchParams.set("filter[store_id]", String(this.catalog.storeId));
    page.searchParams.set("page[size]", "100");
    for (const [name, value] of Object.entries(filters)) page.searchParams.set(name, value);
    for (let pageNumber = 0; page && pageNumber < 100; pageNumber += 1) {
      const response = await this.fetchPage(page);
      const payload = await response.json() as { data?:unknown; links?:{ next?:unknown } };
      if (!Array.isArray(payload.data)) throw new Error("invalid_provider_response");
      for (const resource of payload.data) {
        if (!resource || typeof resource !== "object") throw new Error("invalid_provider_response");
        seen += 1;
        const raw = Buffer.from(JSON.stringify({ meta:{ event_name:eventName }, data:resource }));
        const result = processSubscriptionWebhook(this.database, raw, eventName, this.catalog, now);
        if (!result.duplicate && ["applied", "refund_revoked"].includes(result.outcome)) applied += 1;
      }
      page = nextPage(payload.links?.next);
    }
    if (page) throw new Error("provider_pagination_limit");
    return { seen, applied };
  }

  private async fetchPage(url:URL):Promise<Response> {
    this.currentAbort = new AbortController();
    const timer = setTimeout(() => this.currentAbort?.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        signal:this.currentAbort.signal,
        headers:{ Accept:"application/vnd.api+json", Authorization:`Bearer ${this.apiKey}` },
        redirect:"error",
      });
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? "provider_auth_failed" : "provider_request_failed");
      return response;
    } catch (error) {
      if (this.currentAbort.signal.aborted) throw new Error("provider_timeout");
      throw error;
    } finally { clearTimeout(timer); this.currentAbort = null; }
  }

  private record(result:ReconciliationResult, status:"success" | "failed", errorCode:string | null):void {
    this.database.prepare(`INSERT INTO billing_reconciliation_runs
      (id,trigger,started_at,finished_at,status,subscriptions_seen,refunds_seen,events_applied,error_code)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
      `reconcile_${randomUUID()}`, result.trigger, result.startedAt, result.finishedAt, status,
      result.subscriptionsSeen, result.refundsSeen, result.eventsApplied, errorCode,
    );
    this.database.prepare("DELETE FROM billing_reconciliation_runs WHERE id NOT IN (SELECT id FROM billing_reconciliation_runs ORDER BY finished_at DESC,id DESC LIMIT 100)").run();
  }
}

export function startBillingReconciliationScheduler(reconciler:BillingReconciler, intervalMs = 6 * 60 * 60_000):() => Promise<void> {
  const cadence = Number.isFinite(intervalMs) ? Math.max(5 * 60_000, intervalMs) : 6 * 60 * 60_000;
  const timer = setInterval(() => { void reconciler.run("scheduled").catch(() => undefined); }, cadence);
  timer.unref();
  return async () => { clearInterval(timer); await reconciler.cancelActive(); };
}

function nextPage(value:unknown):URL | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("invalid_provider_response");
  const parsed = new URL(value);
  if (parsed.origin !== API_ORIGIN || parsed.username || parsed.password) throw new Error("invalid_provider_pagination");
  return parsed;
}

function safeErrorCode(error:unknown):string {
  const code = error instanceof Error ? error.message : "provider_request_failed";
  return /^(invalid_provider_response|invalid_provider_pagination|provider_pagination_limit|provider_auth_failed|provider_request_failed|provider_timeout)$/.test(code)
    ? code : "provider_request_failed";
}
