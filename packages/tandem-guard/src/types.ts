export type EntityType =
  | 'AADHAAR'
  | 'PAN'
  | 'ACCOUNT'
  | 'CARD'
  | 'PERSON'
  | 'PHONE'
  | 'EMAIL'
  | 'ADDRESS'
  | 'MEDICAL'
  | 'ORG'
  | 'GSTIN'
  | 'PASSPORT'
  | 'VOTER_ID'
  | 'DL'
  | 'UPI'
  | 'VEHICLE'
  | 'DOB';

export interface Entity {
  type: EntityType;
  value: string;
  span: [number, number]; // [startIndex, endIndex]
  confidence: number;
  source: 'deterministic' | 'ner';
}

export type TaskType =
  | 'summarize'
  | 'rewrite'
  | 'extract'
  | 'translate'
  | 'qa'
  | 'custom';

export type TaskComplexity = 'low' | 'medium' | 'high';

export interface TaskInput {
  instruction: string;
  content: string;
  taskType: TaskType;
}

export type RouteDecisionType =
  | 'LOCAL_ONLY'
  | 'REDACTED_CLOUD'
  | 'CLOUD_DIRECT'
  | 'BLOCKED_NEEDS_CONSENT';

export interface RouteDecision {
  route: RouteDecisionType;
  reason: string;
  sensitivityScore: number;
  complexity: TaskComplexity;
  classifierMode: 'hybrid' | 'deterministic-only';
  entityCounts: Record<string, number>;
}

export interface RedactionResult {
  sanitizedText: string;
  placeholderMap: Map<string, string>;
  redactedEntities: Entity[];
  verifierPassed?: boolean;
  verifierBadge?: string;
}

export interface RehydrationResult {
  rehydratedText: string;
  totalPlaceholders: number;
  restoredCount: number;
  missingPlaceholders: string[];
  isClean: boolean;
}

export interface LedgerEvent {
  id: string;
  index: number;
  previousHash: string;
  hash: string;
  timestamp: number;
  route: RouteDecisionType;
  reason: string;
  classifierMode: string;
  sensitivityScore: number;
  entityCounts: Record<string, number>;
  complexity: TaskComplexity;
  latencyMs: number;
  servedBy: 'on-device' | 'cloud' | 'blocked';
  placeholdersRestored: number;
  userConsentRequired: boolean;
  /** Version of the routing policy that produced this decision. */
  policyVersion: number;
}

export type PolicyMode = 'private-first' | 'balanced' | 'performance';

export interface RoutingPolicy {
  version: number;
  thresholds: {
    localOnly: number;
    hardBlock: number;
  };
  entityWeights: Record<EntityType, number>;
  complexity: {
    highCharCount: number;
  };
  mode: PolicyMode;
  killSwitchLocalOnly: boolean;
  enabledDetectors: string[];
}

export type HybridInferenceMode =
  | 'ONLY_ON_DEVICE'
  | 'ONLY_IN_CLOUD'
  | 'PREFER_ON_DEVICE'
  | 'PREFER_IN_CLOUD';
