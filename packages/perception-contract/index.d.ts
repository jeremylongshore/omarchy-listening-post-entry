export type SignalLane = "incident" | "release" | "pricing" | "engineering";
export interface PerceptionTopic { id: string; name: string; keywords: string[]; enabled: boolean; }
export interface PerceptionSignal {
  id: string; title: string; url: string; source: string; lane: SignalLane;
  relevance: number; matchedTopicIds: string[]; publishedAt: string | null; read: boolean;
}
export interface PerceptionSnapshot {
  schemaVersion: "1.0";
  generatedAt: string;
  staleAfter: string;
  account: { id: string; displayName: string };
  topics: PerceptionTopic[];
  signals: PerceptionSignal[];
  brief: { windowStart: string; windowEnd: string; highlights: Array<{ signalId: string; reason: string }> };
  sourceHealth: Array<{ id: string; name: string; status: "healthy" | "degraded" | "unavailable"; checkedAt: string }>;
}
export interface ContractValidation { valid: boolean; errors: string[]; }
export declare const CONTRACT_VERSION: "1.0";
export declare const TOPIC_LIMITS: Readonly<{ topics: 8; keywordsPerTopic: 8; topicName: 40; keyword: 64 }>;
export declare function validateSnapshot(value: unknown): ContractValidation;
