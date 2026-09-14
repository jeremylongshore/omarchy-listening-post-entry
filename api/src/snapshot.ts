import { validateSnapshot, type PerceptionSnapshot, type PerceptionSignal, type PerceptionTopic } from "@listening-post/perception-contract";
import type { PerceptionDatabase } from "./database.js";

export function buildSnapshot(database: PerceptionDatabase, accountId: string, now = new Date(), briefWindowHours = 24): PerceptionSnapshot {
  const account = database.prepare("SELECT id, display_name FROM accounts WHERE id = ?").get(accountId) as { id: string; display_name: string } | undefined;
  if (!account) throw new Error("account_not_found");
  const topics = database.prepare("SELECT id, name, keywords_json, enabled FROM topics WHERE account_id = ? ORDER BY name LIMIT 8").all(accountId) as Array<{ id:string; name:string; keywords_json:string; enabled:number }>;
  const topicList: PerceptionTopic[] = topics.map((topic) => ({ id:topic.id, name:topic.name, keywords:parseKeywords(topic.keywords_json), enabled:topic.enabled === 1 }));
  const rows = database.prepare(`
    SELECT s.*,score.relevance AS account_relevance,score.reason AS score_reason,
           COALESCE(meta.resolved,1) AS is_resolved,COALESCE(meta.quiet,0) AS is_quiet,
           CASE WHEN r.signal_id IS NULL THEN 0 ELSE 1 END AS is_read
    FROM account_signal_scores score JOIN signals s ON s.id=score.signal_id
    LEFT JOIN signal_metadata meta ON meta.signal_id=s.id
    LEFT JOIN read_state r ON r.signal_id = s.id AND r.account_id = ?
    WHERE score.account_id = ?
      AND (s.lane!='incident' OR COALESCE(meta.resolved,1)=0 OR s.id IN (
        SELECT history.signal_id FROM signal_metadata history JOIN signals incident ON incident.id=history.signal_id
        WHERE incident.lane='incident' AND history.resolved=1
        ORDER BY COALESCE(incident.published_at,incident.created_at) DESC,incident.id ASC LIMIT 2
      ))
    ORDER BY CASE
               WHEN s.lane='incident' AND COALESCE(meta.resolved,1)=0 THEN 0
               WHEN s.lane='release' AND COALESCE(meta.quiet,0)=0 THEN 1
               WHEN s.lane='pricing' THEN 2
               WHEN s.lane='engineering' THEN 3
               WHEN s.lane='release' THEN 4 ELSE 5 END,
             score.relevance DESC, COALESCE(s.published_at, s.created_at) DESC, s.id ASC LIMIT 400
  `).all(accountId, accountId) as Array<Record<string, unknown>>;
  const topicRows = database.prepare("SELECT topic_id FROM signal_topics WHERE signal_id = ? ORDER BY topic_id");
  const signals: PerceptionSignal[] = rows.map((row) => ({
    id:String(row.id), title:String(row.title), url:String(row.url), source:String(row.source),
    lane:row.lane as PerceptionSignal["lane"], relevance:Number(row.account_relevance),
    resolved:Number(row.is_resolved) === 1, quiet:Number(row.is_quiet) === 1,
    matchedTopicIds:(topicRows.all(String(row.id)) as Array<{ topic_id:string }>).map((item) => item.topic_id),
    publishedAt:row.published_at ? String(row.published_at) : null, read:Number(row.is_read) === 1,
  }));
  const boundedWindowHours = Number.isSafeInteger(briefWindowHours) && briefWindowHours >= 1 && briefWindowHours <= 168 ? briefWindowHours : 24;
  const windowStart = new Date(now.getTime() - boundedWindowHours * 60 * 60 * 1000);
  const reasons = new Map(rows.map((row) => [String(row.id), String(row.score_reason)]));
  const highlights = signals.filter((signal) => signal.publishedAt && Date.parse(signal.publishedAt) >= windowStart.getTime() && Date.parse(signal.publishedAt) <= now.getTime()).slice(0, 5).map((signal) => ({ signalId:signal.id, reason:reasons.get(signal.id) ?? "High-priority source signal." }));
  const sourceHealth = database.prepare("SELECT id, name, status, checked_at FROM source_health ORDER BY name").all() as Array<{ id:string; name:string; status:PerceptionSnapshot["sourceHealth"][number]["status"]; checked_at:string }>;
  const ingestionState = database.prepare("SELECT last_success_at FROM ingestion_state WHERE id=1").get() as { last_success_at:string | null } | undefined;
  const generatedAt = ingestionState?.last_success_at && Number.isFinite(Date.parse(ingestionState.last_success_at)) ? new Date(ingestionState.last_success_at) : now;
  const snapshot: PerceptionSnapshot = {
    schemaVersion:"1.0", generatedAt:generatedAt.toISOString(), staleAfter:new Date(generatedAt.getTime() + 30 * 60 * 1000).toISOString(),
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
