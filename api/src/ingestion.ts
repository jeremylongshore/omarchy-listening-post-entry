import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import type { PerceptionDatabase } from "./database.js";
import { classifyLane, MAX_FEED_BYTES, parseFeed, type SignalLane } from "./feed.js";
import { CURATED_SOURCES, type CuratedSource } from "./sources.js";

const RETENTION_MS = 45 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12_000;

export type IngestionResult = {
  trigger:"scheduled" | "manual"; startedAt:string; finishedAt:string;
  sourcesAttempted:number; sourcesHealthy:number; sourcesFailed:number; itemsParsed:number; signalsStored:number;
};

export type FeedFetcher = (url:string, init:RequestInit) => Promise<Response>;

export class IngestionService {
  private active:Promise<IngestionResult> | null = null;
  private cancelled = false;
  private currentAbort:AbortController | null = null;
  constructor(private database:PerceptionDatabase, private fetcher:FeedFetcher = fetch, private sources:readonly CuratedSource[] = CURATED_SOURCES) {}

  run(trigger:"scheduled" | "manual", now = new Date()):Promise<IngestionResult> {
    if (this.active) return this.active;
    this.cancelled = false;
    this.active = this.execute(trigger, now).finally(() => { this.active = null; });
    return this.active;
  }

  async cancelActive():Promise<void> {
    this.cancelled = true; this.currentAbort?.abort();
    await this.active?.then(() => undefined, () => undefined);
  }

  private async execute(trigger:"scheduled" | "manual", now:Date):Promise<IngestionResult> {
    const startedAt = now.toISOString(); let attempted = 0; let healthy = 0; let failed = 0; let parsed = 0;
    for (const source of this.sources) {
      if (this.cancelled) break;
      attempted += 1; this.currentAbort = new AbortController();
      try {
        const body = await fetchFeed(this.fetcher, source, this.currentAbort);
        const items = parseFeed(body);
        if (!items.length) { updateSourceHealth(this.database, source, "degraded", new Date()); failed += 1; continue; }
        storeSourceItems(this.database, source, items, now);
        updateSourceHealth(this.database, source, "healthy", new Date()); healthy += 1; parsed += items.length;
      } catch {
        if (this.cancelled) break;
        updateSourceHealth(this.database, source, "unavailable", new Date()); failed += 1;
      } finally { this.currentAbort = null; }
    }
    const cutoff = new Date(now.getTime() - RETENTION_MS).toISOString();
    this.database.prepare("DELETE FROM signals WHERE COALESCE(published_at,created_at) < ?").run(cutoff);
    scoreAllAccounts(this.database);
    const stored = this.database.prepare("SELECT count(*) AS count FROM signals").get() as { count:number };
    const result = { trigger, startedAt, finishedAt:new Date().toISOString(), sourcesAttempted:attempted, sourcesHealthy:healthy, sourcesFailed:failed, itemsParsed:parsed, signalsStored:stored.count };
    recordRun(this.database, result);
    return result;
  }
}

export function startIngestionScheduler(service:IngestionService, intervalMs = 15 * 60 * 1000):() => Promise<void> {
  void service.run("scheduled").catch(() => undefined);
  const cadence = Number.isFinite(intervalMs) ? Math.max(60_000, intervalMs) : 15 * 60 * 1000;
  const timer = setInterval(() => { void service.run("scheduled").catch(() => undefined); }, cadence);
  timer.unref();
  return async () => { clearInterval(timer); await service.cancelActive(); };
}

export function secureKeyMatches(expected:string, actual:string | undefined):boolean {
  if (!actual) return false; const left = Buffer.from(expected); const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function scoreAllAccounts(database:PerceptionDatabase):void {
  const accounts = database.prepare("SELECT id FROM accounts").all() as Array<{ id:string }>;
  for (const account of accounts) scoreAccountSignals(database, account.id);
}

export function scoreAccountSignals(database:PerceptionDatabase, accountId:string):void {
  const topics = database.prepare("SELECT id,name,keywords_json FROM topics WHERE account_id=? AND enabled=1 ORDER BY name,id").all(accountId) as Array<{ id:string; name:string; keywords_json:string }>;
  const parsedTopics = topics.map(topic => ({ ...topic, keywords:parseKeywords(topic.keywords_json) }));
  const signals = database.prepare(`SELECT s.id,s.title,s.source,s.lane,COALESCE(m.resolved,1) AS resolved,COALESCE(m.quiet,0) AS quiet
    FROM signals s LEFT JOIN signal_metadata m ON m.signal_id=s.id ORDER BY s.id`).all() as Array<{ id:string; title:string; source:string; lane:SignalLane; resolved:number; quiet:number }>;
  const replace = database.transaction(() => {
    database.prepare("DELETE FROM account_signal_scores WHERE account_id=?").run(accountId);
    database.prepare("DELETE FROM signal_topics WHERE topic_id IN (SELECT id FROM topics WHERE account_id=?)").run(accountId);
    const insertScore = database.prepare("INSERT INTO account_signal_scores VALUES (?,?,?,?)");
    const insertTopic = database.prepare("INSERT OR IGNORE INTO signal_topics VALUES (?,?)");
    for (const signal of signals) {
      const haystack = signal.title.toLocaleLowerCase("en-US");
      const matches = parsedTopics.flatMap(topic => {
        const keywords = topic.keywords.filter(keyword => haystack.includes(keyword.toLocaleLowerCase("en-US")));
        return keywords.length ? [{ id:topic.id, name:topic.name, keywords }] : [];
      });
      for (const topic of matches) insertTopic.run(signal.id, topic.id);
      const relevance = Math.min(100, laneBase(signal.lane, signal.resolved === 1, signal.quiet === 1) + matches.length * 8 + matches.reduce((sum, match) => sum + Math.min(6, match.keywords.length * 2), 0));
      insertScore.run(accountId, signal.id, relevance, scoreReason(signal, matches));
    }
  });
  replace();
}

async function fetchFeed(fetcher:FeedFetcher, source:CuratedSource, controller:AbortController):Promise<string> {
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(source.url, { signal:controller.signal, redirect:"error", headers:{ Accept:"application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9", "User-Agent":"perception/0.1 (+https://oma.intentsolutions.io/perception/)" } });
    if (!response.ok || !response.body) throw new Error("feed_fetch_failed");
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_FEED_BYTES) throw new Error("feed_too_large");
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let bytes = 0; let body = "";
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > MAX_FEED_BYTES) { await reader.cancel(); throw new Error("feed_too_large"); }
      body += decoder.decode(value, { stream:true });
    }
    return body + decoder.decode();
  } finally { clearTimeout(timeout); }
}

function storeSourceItems(database:PerceptionDatabase, source:CuratedSource, items:ReturnType<typeof parseFeed>, now:Date):void {
  const write = database.transaction(() => {
    const upsert = database.prepare(`INSERT INTO signals (id,title,url,source,lane,relevance,published_at,created_at) VALUES (?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,source=excluded.source,lane=excluded.lane,relevance=excluded.relevance,published_at=COALESCE(excluded.published_at,signals.published_at)`);
    const origin = database.prepare("INSERT OR IGNORE INTO signal_origins VALUES (?,?)");
    const metadata = database.prepare(`INSERT INTO signal_metadata VALUES (?,?,?)
      ON CONFLICT(signal_id) DO UPDATE SET resolved=excluded.resolved,quiet=excluded.quiet`);
    for (const item of items) {
      const lane = classifyLane(item.title, source.kind); const id = signalId(source.id, item.guid);
      const resolved = source.kind === "status" ? item.resolved : true; const quiet = source.kind === "changelog";
      upsert.run(id, item.title, item.url, source.name, lane, laneBase(lane, resolved, quiet), item.publishedAt, now.toISOString());
      origin.run(id, source.id); metadata.run(id, resolved ? 1 : 0, quiet ? 1 : 0);
    }
  });
  write();
}

function updateSourceHealth(database:PerceptionDatabase, source:CuratedSource, status:"healthy" | "degraded" | "unavailable", now:Date):void {
  database.prepare(`INSERT INTO source_health VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,status=excluded.status,checked_at=excluded.checked_at`).run(source.id, source.title, status, now.toISOString());
}

function signalId(sourceId:string, guid:string):string { return `signal_${createHash("sha256").update(sourceId).update("\0").update(guid).digest("hex").slice(0, 40)}`; }
function laneBase(lane:SignalLane, resolved = true, quiet = false):number {
  if (lane === "incident") return resolved ? 36 : 100;
  if (lane === "release") return quiet ? 38 : 72;
  return lane === "pricing" ? 68 : 48;
}
function parseKeywords(value:string):string[] { try { const parsed:unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item):item is string => typeof item === "string") : []; } catch { return []; } }
function scoreReason(signal:{ lane:SignalLane; source:string; resolved:number; quiet:number }, matches:Array<{ name:string; keywords:string[] }>):string {
  if (signal.lane === "incident" && signal.resolved === 0) return `Active operational incident from ${signal.source}; prioritized ahead of other lanes.`.slice(0, 240);
  if (signal.lane === "incident") return `Resolved incident history from ${signal.source}.`.slice(0, 240);
  if (signal.quiet === 1) return `Quiet changelog activity from ${signal.source}.`.slice(0, 240);
  if (matches.length) return `Matches ${matches.map(match => `${match.name} (${match.keywords.join(", ")})`).join("; ")}.`.slice(0, 240);
  return `Curated ${signal.lane} signal from ${signal.source}.`.slice(0, 240);
}

function recordRun(database:PerceptionDatabase, result:IngestionResult):void {
  const status = result.sourcesHealthy === 0 ? "failed" : result.sourcesFailed === 0 ? "success" : "partial";
  const write = database.transaction(() => {
    database.prepare(`INSERT INTO ingestion_state (id,last_attempt_at,last_success_at) VALUES (1,?,?)
      ON CONFLICT(id) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,last_success_at=COALESCE(excluded.last_success_at,ingestion_state.last_success_at)`).run(result.finishedAt, result.sourcesHealthy > 0 ? result.finishedAt : null);
    database.prepare("INSERT INTO ingestion_runs VALUES (?,?,?,?,?,?,?,?,?,?)").run(`run_${randomUUID()}`, result.trigger, result.startedAt, result.finishedAt, status, result.sourcesAttempted, result.sourcesHealthy, result.sourcesFailed, result.itemsParsed, result.signalsStored);
    database.prepare("DELETE FROM ingestion_runs WHERE id NOT IN (SELECT id FROM ingestion_runs ORDER BY finished_at DESC,id DESC LIMIT 100)").run();
  });
  write();
}
