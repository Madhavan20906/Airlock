import { CellStats, aggregate } from './aggregate.js';
import { round } from './stats.js';
import {
  CompileParams, DEFAULT_PARAMS, EscalationTrigger, LENGTH_BUCKETS, LengthBucket, PolicyRule,
  RuleEvidence, RunResult, SensitiveRoute, TASK_TYPES, TandemPolicy, TaskType
} from './types.js';

/** Which validators can trigger a quality escalation, per task type. */
const ESCALATE_ON: Record<TaskType, EscalationTrigger[]> = {
  classify: ['schema', 'refusal', 'timeout'],
  extract: ['schema', 'required_facts', 'refusal', 'timeout'],
  rewrite: ['length', 'refusal', 'timeout'],
  summarize: ['length', 'required_facts', 'refusal', 'timeout'],
  translate: ['required_facts', 'refusal', 'timeout'],
  qa: ['required_facts', 'refusal', 'timeout'],
  json_reliability: ['schema', 'timeout'],
  instruction: ['schema', 'length', 'refusal', 'timeout']
};

function evidenceFrom(c: CellStats, status: RuleEvidence['status'], why: string): RuleEvidence {
  const tokens = (c.cloud.meanInTokens ?? c.local.meanInTokens ?? 0) + (c.cloud.meanOutTokens ?? c.local.meanOutTokens ?? 0);
  // Expected cloud tokens avoided per 1,000 requests: local answers that pass are not sent to the cloud
  const avoided = (c.local.passRate ?? 0) * 1000 * tokens;
  return {
    status,
    n: c.local.n,
    nCloud: c.cloud.n,
    qLocal: round(c.local.meanQuality),
    qCloud: round(c.cloud.meanQuality),
    passLocal: round(c.local.passRate),
    passCloud: round(c.cloud.passRate),
    wilsonLoLocal: round(c.local.wilsonLo),
    wilsonHiLocal: round(c.local.wilsonHi),
    p50Local: c.local.p50Ms,
    p95Local: c.local.p95Ms,
    p50Cloud: c.cloud.p50Ms,
    p95Cloud: c.cloud.p95Ms,
    estCloudTokensAvoidedPer1k: Math.round(avoided),
    why
  };
}

const pct = (x: number | null) => (x === null ? 'n/a' : `${Math.round(x * 100)}%`);

/**
 * The decision rule (docs/POLICY_RULE.md). LOCAL_FIRST iff ALL of:
 *  - n >= minN distinct tasks
 *  - Wilson lower bound of local pass rate >= qualityFloor
 *  - local pass rate >= cloud pass rate - tolerance (or no cloud data)
 *  - p95 local latency <= latencyBudgetMs
 * Otherwise CLOUD_FIRST. Never LOCAL_ONLY from measurements alone (that is a privacy decision).
 */
export function decide(c: CellStats, params: CompileParams, status: RuleEvidence['status']): { route: 'LOCAL_FIRST' | 'CLOUD_FIRST'; why: string } {
  const L = c.local;
  const C = c.cloud;
  if (L.n < params.minN) {
    return { route: 'CLOUD_FIRST', why: `Not enough evidence: ${L.n} local task(s), need ${params.minN}. Defaulting to cloud-first.` };
  }
  if ((L.wilsonLo ?? 0) < params.qualityFloor) {
    return { route: 'CLOUD_FIRST', why: `Local pass rate ${pct(L.passRate)} over ${L.n} tasks; lower bound ${pct(L.wilsonLo)} is below the ${pct(params.qualityFloor)} floor.` };
  }
  if (C.passRate !== null && (L.passRate ?? 0) < C.passRate - params.tolerance) {
    return { route: 'CLOUD_FIRST', why: `Local passes ${pct(L.passRate)} vs cloud ${pct(C.passRate)}: more than ${pct(params.tolerance)} behind.` };
  }
  if (L.p95Ms !== null && L.p95Ms > params.latencyBudgetMs) {
    return { route: 'CLOUD_FIRST', why: `Local p95 latency ${Math.round(L.p95Ms)} ms exceeds the ${params.latencyBudgetMs} ms budget.` };
  }
  const pooled = status === 'pooled_by_type' ? ' (pooled across lengths)' : '';
  return {
    route: 'LOCAL_FIRST',
    why: `Local: lower bound ${pct(L.wilsonLo)} over ${L.n} tasks${pooled}; ${pct(L.passRate)} vs cloud ${pct(C.passRate)}; p95 ${L.p95Ms === null ? 'n/a' : Math.round(L.p95Ms) + ' ms'}.`
  };
}

function emptyCell(t: TaskType, b: LengthBucket | '*'): CellStats {
  const z = { n: 0, passes: 0, passRate: null, wilsonLo: null, wilsonHi: null, meanQuality: null, p50Ms: null, p95Ms: null, p50TtftMs: null, meanInTokens: null, meanOutTokens: null, unavailable: 0 };
  return { taskType: t, lengthBucket: b, local: { ...z }, cloud: { ...z } };
}

export interface CompileOptions {
  params?: Partial<CompileParams>;
  previous?: TandemPolicy;
  device?: { class: string; notes: string };
  privacy?: { sensitivityThreshold: number; sensitiveRoute: SensitiveRoute };
  now?: Date;
}

export function compilePolicy(results: RunResult[], opts: CompileOptions = {}): TandemPolicy {
  const params: CompileParams = { ...DEFAULT_PARAMS, ...opts.params };
  const { cells, byType } = aggregate(results, params.z);
  const rules: PolicyRule[] = [];
  for (const t of TASK_TYPES) {
    for (const b of LENGTH_BUCKETS) {
      let cell = cells.find(c => c.taskType === t && c.lengthBucket === b) ?? emptyCell(t, b);
      let status: RuleEvidence['status'] = 'measured';
      // Back off to the task-type pool when the cell alone is too small
      if (cell.local.n < params.minN) {
        const pool = byType.find(c => c.taskType === t);
        // Only pool if this length was actually observed; never extrapolate L from S-only data
        if (pool && pool.local.n >= params.minN && cell.local.n > 0) {
          cell = { ...pool, lengthBucket: b };
          status = 'pooled_by_type';
        }
      }
      const d = decide(cell, params, status);
      if (cell.local.n < params.minN) status = 'insufficient_evidence';
      rules.push({
        taskType: t,
        lengthBucket: b,
        route: d.route,
        escalateOn: ESCALATE_ON[t],
        timeoutMs: Math.max(4000, Math.round((cell.local.p95Ms ?? 6000) * 1.5)),
        evidence: evidenceFrom(cell, status, d.why)
      });
    }
  }
  return {
    version: (opts.previous?.version ?? 0) + 1,
    generatedAt: (opts.now ?? new Date()).toISOString(),
    source: 'studio',
    device: opts.device ?? { class: 'unspecified', notes: '' },
    privacy: opts.privacy ?? { sensitivityThreshold: 0.5, sensitiveRoute: 'LOCAL_ONLY' },
    params,
    rules,
    killSwitch: { cloud: false, local: false },
    budgets: { maxCloudCallsPerMin: 20 }
  };
}

/** Built-in conservative policy used before any measurement (or when Remote Config is invalid). */
export function defaultPolicy(): TandemPolicy {
  const p = compilePolicy([], { now: new Date(0) });
  return {
    ...p,
    version: 0,
    source: 'default',
    device: { class: 'unmeasured', notes: 'Built-in conservative default: cloud-first everywhere, sensitive content stays on-device.' },
    rules: p.rules.map(r => ({ ...r, evidence: { ...r.evidence, why: 'No measurements yet: built-in default is cloud-first.' } }))
  };
}

export function lookupRule(policy: TandemPolicy, taskType: TaskType, lengthBucket: LengthBucket): PolicyRule {
  return policy.rules.find(r => r.taskType === taskType && r.lengthBucket === lengthBucket)
    ?? defaultPolicy().rules.find(r => r.taskType === taskType && r.lengthBucket === lengthBucket)!;
}

/** Rough token estimate (~4 chars/token for Latin script, ~2 for Indic). Labelled as an estimate wherever shown. */
export function estimateTokens(text: string): number {
  const indic = (text.match(/[ऀ-෿]/g) ?? []).length;
  return Math.ceil((text.length - indic) / 4 + indic / 2);
}

export function bucketFor(tokens: number): LengthBucket {
  return tokens < 200 ? 'S' : tokens < 800 ? 'M' : 'L';
}
