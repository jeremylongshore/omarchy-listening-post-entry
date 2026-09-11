export const CONTRACT_VERSION = "1.0";
export const TOPIC_LIMITS = Object.freeze({ topics: 8, keywordsPerTopic: 8, topicName: 40, keyword: 64 });

const LANES = new Set(["incident", "release", "pricing", "engineering"]);
const HEALTH = new Set(["healthy", "degraded", "unavailable"]);
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isIsoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const isBoundedString = (value, maximum) => typeof value === "string" && value.trim().length > 0 && value.length <= maximum;

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
  if (value.schemaVersion !== CONTRACT_VERSION) errors.push("schemaVersion must be 1.0");
  if (!isIsoDate(value.generatedAt)) errors.push("generatedAt must be an ISO date");
  if (!isIsoDate(value.staleAfter)) errors.push("staleAfter must be an ISO date");
  if (!isRecord(value.account) || !isBoundedString(value.account.id, 128) || !isBoundedString(value.account.displayName, 80)) {
    errors.push("account must contain bounded id and displayName strings");
  }

  if (!Array.isArray(value.topics) || value.topics.length > TOPIC_LIMITS.topics) {
    errors.push(`topics must contain at most ${TOPIC_LIMITS.topics} entries`);
  } else {
    value.topics.forEach((topic, index) => {
      const validKeywords = isRecord(topic) && Array.isArray(topic.keywords)
        && topic.keywords.length <= TOPIC_LIMITS.keywordsPerTopic
        && topic.keywords.every((keyword) => isBoundedString(keyword, TOPIC_LIMITS.keyword));
      if (!isRecord(topic) || !isBoundedString(topic.id, 128)
        || !isBoundedString(topic.name, TOPIC_LIMITS.topicName)
        || typeof topic.enabled !== "boolean" || !validKeywords) errors.push(`topics[${index}] is invalid`);
    });
  }

  const signalIds = new Set();
  if (!Array.isArray(value.signals) || value.signals.length > 400) {
    errors.push("signals must contain at most 400 entries");
  } else {
    value.signals.forEach((signal, index) => {
      const valid = isRecord(signal) && isBoundedString(signal.id, 160)
        && isBoundedString(signal.title, 240) && isSafeHttps(signal.url)
        && isBoundedString(signal.source, 80) && LANES.has(signal.lane)
        && Number.isFinite(signal.relevance) && signal.relevance >= 0 && signal.relevance <= 100
        && Array.isArray(signal.matchedTopicIds) && signal.matchedTopicIds.every((id) => isBoundedString(id, 128))
        && (signal.publishedAt === null || isIsoDate(signal.publishedAt)) && typeof signal.read === "boolean";
      if (!valid) errors.push(`signals[${index}] is invalid`);
      if (isRecord(signal) && typeof signal.id === "string") {
        if (signalIds.has(signal.id)) errors.push(`signals[${index}].id is duplicated`);
        signalIds.add(signal.id);
      }
    });
  }

  if (!isRecord(value.brief) || !isIsoDate(value.brief.windowStart) || !isIsoDate(value.brief.windowEnd)
    || !Array.isArray(value.brief.highlights) || value.brief.highlights.length > 5) {
    errors.push("brief must contain a valid window and at most five highlights");
  } else {
    value.brief.highlights.forEach((highlight, index) => {
      if (!isRecord(highlight) || !signalIds.has(highlight.signalId) || !isBoundedString(highlight.reason, 240)) {
        errors.push(`brief.highlights[${index}] is invalid or does not reference a signal`);
      }
    });
  }

  if (!Array.isArray(value.sourceHealth)) errors.push("sourceHealth must be an array");
  else value.sourceHealth.forEach((source, index) => {
    if (!isRecord(source) || !isBoundedString(source.id, 128) || !isBoundedString(source.name, 80)
      || !HEALTH.has(source.status) || !isIsoDate(source.checkedAt)) errors.push(`sourceHealth[${index}] is invalid`);
  });
  return { valid: errors.length === 0, errors };
}
