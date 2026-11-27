// Mirrors packages/spec/*.schema.json. Metadata only: no task content ever appears here.

export type TaskType = 'classify' | 'extract' | 'rewrite' | 'summarize' | 'translate' | 'qa' | 'json_reliability' | 'instruction';
export const TASK_TYPES: TaskType[] = ['classify', 'extract', 'rewrite', 'summarize', 'translate', 'qa', 'json_reliability', 'instruction'];

export type LengthBucket = 'S' | 'M' | 'L';
export const LENGTH_BUCKETS: LengthBucket[] = ['S', 'M', 'L'];

export type Backend = 'on_device' | 'in_cloud';

export interface RunResult {
  runId: string;
  taskId: string;
  taskType: TaskType;
  lengthBucket: LengthBucket;
  backend: Backend;
  /** As reported by the SDK (response.inferenceSource), or null if the call failed. */
  servedBy: Backend | null;
  /** True when the call returned output (independent of quality). */
  ok: boolean;
  /** 0..1 validator score. */
  quality: number;
  /** All hard validators passed. */
  passed: boolean;
  ttftMs: number | null;
  totalMs: number | null;
  outTokensEst: number;
  inTokensEst: number;
  /** Error class: 'unavailable' and 'quota' are excluded from quality stats (infrastructure, not the model's fault). */
  error?: 'unavailable' | 'timeout' | 'quota' | 'other';
  /** First line of the error message (diagnostics only; never contains task content). */
  errorMessage?: string;
  /** First 400 characters of the answer. Synthetic task output only; never stored remotely. */
  outputPreview?: string;
  ts: number;
  env?: { chromeMajor?: number; osFamily?: string; availability?: string; modelId?: string };
}

export type RuleRoute = 'LOCAL_FIRST' | 'CLOUD_FIRST' | 'LOCAL_ONLY' | 'CLOUD_ONLY';
export type EscalationTrigger = 'schema' | 'length' | 'required_facts' | 'refusal' | 'timeout';
export type EvidenceStatus = 'measured' | 'pooled_by_type' | 'insufficient_evidence';

export interface RuleEvidence {
  status: EvidenceStatus;
  /** Distinct tasks with a local result (after pooling, if pooled). */
  n: number;
  nCloud: number;
  qLocal: number | null;
  qCloud: number | null;
  passLocal: number | null;
  passCloud: number | null;
  wilsonLoLocal: number | null;
  wilsonHiLocal: number | null;
  p50Local: number | null;
  p95Local: number | null;
  p50Cloud: number | null;
  p95Cloud: number | null;
  estCloudTokensAvoidedPer1k: number;
  /** Plain-language reason for the chosen route. */
  why: string;
}

export interface PolicyRule {
  taskType: TaskType;
  lengthBucket: LengthBucket;
  route: RuleRoute;
  escalateOn: EscalationTrigger[];
  timeoutMs: number;
  evidence: RuleEvidence;
}

export type SensitiveRoute = 'LOCAL_ONLY' | 'REDACT_THEN_CLOUD' | 'BLOCK';

export interface TandemPolicy {
  version: number;
  generatedAt: string;
  source: 'studio' | 'default';
  device: { class: string; notes: string };
  privacy: { sensitivityThreshold: number; sensitiveRoute: SensitiveRoute };
  params: CompileParams;
  rules: PolicyRule[];
  killSwitch: { cloud: boolean; local: boolean };
  budgets: { maxCloudCallsPerMin: number };
}

export interface CompileParams {
  /** Minimum Wilson lower bound of the local pass rate for LOCAL_FIRST. */
  qualityFloor: number;
  /** Local pass rate may trail cloud by at most this much. */
  tolerance: number;
  /** p95 local latency budget, ms. */
  latencyBudgetMs: number;
  /** Minimum distinct tasks per decision. */
  minN: number;
  /** z for the Wilson interval (1.96 = 95%). */
  z: number;
}

export const DEFAULT_PARAMS: CompileParams = {
  qualityFloor: 0.75,
  tolerance: 0.05,
  latencyBudgetMs: 8000,
  minN: 8,
  z: 1.96
};
