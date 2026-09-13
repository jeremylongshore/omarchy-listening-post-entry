export const CONTRACT_VERSION = "1.0";
export const TOPIC_LIMITS = Object.freeze({ topics: 8, keywordsPerTopic: 8, topicName: 40, keyword: 64 });

const LANES = new Set(["incident", "release", "pricing", "engineering"]);
const HEALTH = new Set(["healthy", "degraded", "unavailable"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const hasOnlyKeys = (value, keys) => isRecord(value)
  && Object.keys(value).every((key) => keys.includes(key));
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const isBoundedString = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;
const isSafeId = (value, maximum = 160) => isBoundedString(value, maximum) && /^[A-Za-z0-9_-]+$/.test(value);

function isSafeHttps(value) {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && parsed.username === "" && parsed.password === "";
  } catch {
    return false;
  }
}

export function validateSnapshot(value) {
  const errors = [];
  if (!isRecord(value)) return { valid: false, errors: ["snapshot must be an object"] };
  if (!hasOnlyKeys(value, ["schemaVersion", "generatedAt", "staleAfter", "account", "topics", "signals", "brief", "sourceHealth"])) {
    errors.push("snapshot contains an unknown field");
  }
  if (value.schemaVersion !== CONTRACT_VERSION) errors.push("schemaVersion must be 1.0");
  if (!isIsoDate(value.generatedAt)) errors.push("generatedAt must be an ISO date");
  if (!isIsoDate(value.staleAfter)) errors.push("staleAfter must be an ISO date");
  if (isIsoDate(value.generatedAt) && isIsoDate(value.staleAfter)
    && Date.parse(value.staleAfter) < Date.parse(value.generatedAt)) errors.push("staleAfter must not precede generatedAt");
  if (!hasOnlyKeys(value.account, ["id", "displayName"])
    || !isBoundedString(value.account.id, 128) || !isBoundedString(value.account.displayName, 80)) {
    errors.push("account must contain bounded id and displayName strings");
  }

  if (!Array.isArray(value.topics) || value.topics.length > TOPIC_LIMITS.topics) {
    errors.push(`topics must contain at most ${TOPIC_LIMITS.topics} entries`);
  } else {
    value.topics.forEach((topic, index) => {
      const validKeywords = isRecord(topic) && Array.isArray(topic.keywords)
        && topic.keywords.length <= TOPIC_LIMITS.keywordsPerTopic
        && topic.keywords.every((keyword) => isBoundedString(keyword, TOPIC_LIMITS.keyword));
      if (!hasOnlyKeys(topic, ["id", "name", "keywords", "enabled"]) || !isBoundedString(topic.id, 128)
        || !isBoundedString(topic.name, TOPIC_LIMITS.topicName)
        || typeof topic.enabled !== "boolean" || !validKeywords) errors.push(`topics[${index}] is invalid`);
    });
  }

  const signalIds = new Set();
  if (!Array.isArray(value.signals) || value.signals.length > 400) {
    errors.push("signals must contain at most 400 entries");
  } else {
    value.signals.forEach((signal, index) => {
      const valid = hasOnlyKeys(signal, ["id", "title", "url", "source", "lane", "relevance", "resolved", "quiet", "matchedTopicIds", "publishedAt", "read"])
        && isSafeId(signal.id, 160)
        && isBoundedString(signal.title, 240) && isSafeHttps(signal.url)
        && isBoundedString(signal.source, 80) && LANES.has(signal.lane)
        && Number.isFinite(signal.relevance) && signal.relevance >= 0 && signal.relevance <= 100
        && typeof signal.resolved === "boolean" && typeof signal.quiet === "boolean"
        && Array.isArray(signal.matchedTopicIds) && signal.matchedTopicIds.every((id) => isBoundedString(id, 128))
        && (signal.publishedAt === null || isIsoDate(signal.publishedAt)) && typeof signal.read === "boolean";
      if (!valid) errors.push(`signals[${index}] is invalid`);
      if (isRecord(signal) && typeof signal.id === "string") {
        if (signalIds.has(signal.id)) errors.push(`signals[${index}].id is duplicated`);
        signalIds.add(signal.id);
      }
    });
  }

  if (!hasOnlyKeys(value.brief, ["windowStart", "windowEnd", "highlights"])
    || !isIsoDate(value.brief.windowStart) || !isIsoDate(value.brief.windowEnd)
    || !Array.isArray(value.brief.highlights) || value.brief.highlights.length > 5) {
    errors.push("brief must contain a valid window and at most five highlights");
  } else {
    if (Date.parse(value.brief.windowEnd) < Date.parse(value.brief.windowStart)) errors.push("brief windowEnd must not precede windowStart");
    value.brief.highlights.forEach((highlight, index) => {
      if (!hasOnlyKeys(highlight, ["signalId", "reason"])
        || !signalIds.has(highlight.signalId) || !isBoundedString(highlight.reason, 240)) {
        errors.push(`brief.highlights[${index}] is invalid or does not reference a signal`);
      }
    });
  }

  if (!Array.isArray(value.sourceHealth) || value.sourceHealth.length > 64) errors.push("sourceHealth must contain at most 64 entries");
  else value.sourceHealth.forEach((source, index) => {
    if (!hasOnlyKeys(source, ["id", "name", "status", "checkedAt"])
      || !isBoundedString(source.id, 128) || !isBoundedString(source.name, 80)
      || !HEALTH.has(source.status) || !isIsoDate(source.checkedAt)) errors.push(`sourceHealth[${index}] is invalid`);
  });
  return { valid: errors.length === 0, errors };
}
