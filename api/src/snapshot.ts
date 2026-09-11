import { validateSnapshot, type PerceptionSnapshot, type PerceptionSignal, type PerceptionTopic } from "@listening-post/perception-contract";
import type { PerceptionDatabase } from "./database.js";

export function buildSnapshot(database: PerceptionDatabase, accountId: string, now = new Date()): PerceptionSnapshot {
  const account = database.prepare("SELECT id, display_name FROM accounts WHERE id = ?").get(accountId) as { id: string; display_name: string } | undefined;
  if (!account) throw new Error("account_not_found");
  const topics = database.prepare("SELECT id, name, keywords_json, enabled FROM topics WHERE account_id = ? ORDER BY name LIMIT 8").all(accountId) as Array<{ id:string; name:string; keywords_json:string; enabled:number }>;
  const topicList: PerceptionTopic[] = topics.map((topic) => ({ id:topic.id, name:topic.name, keywords:parseKeywords(topic.keywords_json), enabled:topic.enabled === 1 }));
  const rows = database.prepare(`
    SELECT s.*, CASE WHEN r.signal_id IS NULL THEN 0 ELSE 1 END AS is_read
    FROM signals s LEFT JOIN read_state r ON r.signal_id = s.id AND r.account_id = ?
    ORDER BY CASE s.lane WHEN 'incident' THEN 0 WHEN 'release' THEN 1 WHEN 'pricing' THEN 2 ELSE 3 END,
             s.relevance DESC, COALESCE(s.published_at, s.created_at) DESC, s.id ASC LIMIT 400
  `).all(accountId) as Array<Record<string, unknown>>;
  const topicRows = database.prepare("SELECT topic_id FROM signal_topics WHERE signal_id = ? ORDER BY topic_id");
  const signals: PerceptionSignal[] = rows.map((row) => ({
    id:String(row.id), title:String(row.title), url:String(row.url), source:String(row.source),
    lane:row.lane as PerceptionSignal["lane"], relevance:Number(row.relevance),
    matchedTopicIds:(topicRows.all(String(row.id)) as Array<{ topic_id:string }>).map((item) => item.topic_id),
    publishedAt:row.published_at ? String(row.published_at) : null, read:Number(row.is_read) === 1,
  }));
  const windowStart = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const highlights = signals.filter((signal) => signal.publishedAt && Date.parse(signal.publishedAt) >= windowStart.getTime() && Date.parse(signal.publishedAt) <= now.getTime()).slice(0, 5).map((signal) => ({ signalId:signal.id, reason:signal.lane === "incident" ? "Active provider incident; operational impact takes precedence." : signal.matchedTopicIds.length ? `Matches ${signal.matchedTopicIds.length} active topic${signal.matchedTopicIds.length === 1 ? "" : "s"}.` : "High-priority source signal." }));
  const sourceHealth = database.prepare("SELECT id, name, status, checked_at FROM source_health ORDER BY name").all() as Array<{ id:string; name:string; status:PerceptionSnapshot["sourceHealth"][number]["status"]; checked_at:string }>;
  const snapshot: PerceptionSnapshot = {
    schemaVersion:"1.0", generatedAt:now.toISOString(), staleAfter:new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
    account:{ id:account.id, displayName:account.display_name }, topics:topicList, signals,
    brief:{ windowStart:windowStart.toISOString(), windowEnd:now.toISOString(), highlights },
    sourceHealth:sourceHealth.map((source) => ({ id:source.id, name:source.name, status:source.status, checkedAt:source.checked_at })),
  };
  const validation = validateSnapshot(snapshot);
  if (!validation.valid) throw new Error(`invalid_snapshot:${validation.errors.join("|")}`);
  return snapshot;
}

function parseKeywords(value: string): string[] {
  try { const parsed: unknown = JSON.parse(value); return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(0, 8) : []; }
  catch { return []; }
}
