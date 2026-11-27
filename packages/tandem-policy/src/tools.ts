import { LENGTH_BUCKETS, LengthBucket, PolicyRule, TASK_TYPES, TandemPolicy, TaskType } from './types.js';

// ---------------------------------------------------------------- diff

export interface RuleChange {
  taskType: TaskType;
  lengthBucket: LengthBucket;
  from: PolicyRule['route'] | null;
  to: PolicyRule['route'] | null;
  whyFrom?: string;
  whyTo?: string;
}

export function diffPolicies(prev: TandemPolicy | null, next: TandemPolicy): { changes: RuleChange[]; privacyChanged: boolean; killSwitchChanged: boolean } {
  const changes: RuleChange[] = [];
  for (const r of next.rules) {
    const old = prev?.rules.find(x => x.taskType === r.taskType && x.lengthBucket === r.lengthBucket);
    if (!old || old.route !== r.route) {
      changes.push({ taskType: r.taskType, lengthBucket: r.lengthBucket, from: old?.route ?? null, to: r.route, whyFrom: old?.evidence.why, whyTo: r.evidence.why });
    }
  }
  return {
    changes,
    privacyChanged: JSON.stringify(prev?.privacy) !== JSON.stringify(next.privacy),
    killSwitchChanged: JSON.stringify(prev?.killSwitch) !== JSON.stringify(next.killSwitch)
  };
}

// ---------------------------------------------------------------- validation (mirrors packages/spec/policy.schema.json)

const ROUTES = ['LOCAL_FIRST', 'CLOUD_FIRST', 'LOCAL_ONLY', 'CLOUD_ONLY'];
const SENSITIVE = ['LOCAL_ONLY', 'REDACT_THEN_CLOUD', 'BLOCK'];
const isNum = (x: unknown) => typeof x === 'number' && Number.isFinite(x);

export function validatePolicy(p: any): { valid: boolean; errors: string[] } {
  const e: string[] = [];
  if (!p || typeof p !== 'object') return { valid: false, errors: ['policy is not an object'] };
  if (!Number.isInteger(p.version) || p.version < 0) e.push('version must be a non-negative integer');
  if (typeof p.generatedAt !== 'string' || Number.isNaN(Date.parse(p.generatedAt))) e.push('generatedAt must be an ISO date');
  if (!['studio', 'default'].includes(p.source)) e.push('source must be studio|default');
  if (!p.privacy || !isNum(p.privacy.sensitivityThreshold) || p.privacy.sensitivityThreshold < 0 || p.privacy.sensitivityThreshold > 1) e.push('privacy.sensitivityThreshold must be 0..1');
  if (!p.privacy || !SENSITIVE.includes(p.privacy.sensitiveRoute)) e.push('privacy.sensitiveRoute invalid');
  if (!p.killSwitch || typeof p.killSwitch.cloud !== 'boolean' || typeof p.killSwitch.local !== 'boolean') e.push('killSwitch.cloud/local must be booleans');
  if (!p.budgets || !Number.isInteger(p.budgets.maxCloudCallsPerMin) || p.budgets.maxCloudCallsPerMin < 0) e.push('budgets.maxCloudCallsPerMin must be a non-negative integer');
  if (!Array.isArray(p.rules)) {
    e.push('rules must be an array');
  } else {
    for (const t of TASK_TYPES) for (const b of LENGTH_BUCKETS) {
      const matches = p.rules.filter((r: any) => r?.taskType === t && r?.lengthBucket === b);
      if (matches.length !== 1) e.push(`rules must contain exactly one ${t}/${b} rule (found ${matches.length})`);
    }
    p.rules.forEach((r: any, i: number) => {
      if (!TASK_TYPES.includes(r?.taskType)) e.push(`rules[${i}].taskType invalid`);
      if (!LENGTH_BUCKETS.includes(r?.lengthBucket)) e.push(`rules[${i}].lengthBucket invalid`);
      if (!ROUTES.includes(r?.route)) e.push(`rules[${i}].route invalid`);
      if (!Array.isArray(r?.escalateOn)) e.push(`rules[${i}].escalateOn must be an array`);
      if (!isNum(r?.timeoutMs) || r.timeoutMs <= 0) e.push(`rules[${i}].timeoutMs must be > 0`);
      if (!r?.evidence || typeof r.evidence.why !== 'string') e.push(`rules[${i}].evidence.why required`);
    });
  }
  return { valid: e.length === 0, errors: e };
}

// ---------------------------------------------------------------- Remote Config template export

export const POLICY_PARAM = 'tandem_policy_v1';

/**
 * Merges the policy into an existing Remote Config template without touching any other
 * parameter, condition or group. Returns a new object; the input is not mutated.
 */
export function mergeIntoRemoteConfigTemplate(template: any, policy: TandemPolicy): any {
  const v = validatePolicy(policy);
  if (!v.valid) throw new Error(`refusing to export an invalid policy: ${v.errors.join('; ')}`);
  const out = JSON.parse(JSON.stringify(template ?? {}));
  out.parameters = out.parameters ?? {};
  out.parameters[POLICY_PARAM] = {
    defaultValue: { value: JSON.stringify(policy) },
    description: `Tandem routing policy v${policy.version} (${policy.source}), generated ${policy.generatedAt}`,
    valueType: 'JSON'
  };
  return out;
}

// ---------------------------------------------------------------- savings simulator (ESTIMATES)

export interface TrafficMix { taskType: TaskType; lengthBucket: LengthBucket; share: number }
export interface Prices { inPerMTok: number; outPerMTok: number }

export interface SavingsEstimate {
  localShare: number;
  cloudCallsAvoidedPer1M: number;
  estCostAllCloudPer1M: number;
  estCostWithPolicyPer1M: number;
  estCostAvoidedPer1M: number;
  p50LatencyDeltaMs: number | null;
  assumptions: string[];
}

/**
 * Expected local share = sum over cells of share * [LOCAL_FIRST] * localPassRate
 * (a LOCAL_FIRST request that fails validation escalates and still costs a cloud call).
 * All cost outputs are estimates from caller-supplied price constants.
 */
export function simulateSavings(policy: TandemPolicy, mix: TrafficMix[], prices: Prices): SavingsEstimate {
  const total = mix.reduce((a, m) => a + Math.max(0, m.share), 0) || 1;
  let localShare = 0;
  let costAll = 0;
  let costPolicy = 0;
  let latAll = 0;
  let latPolicy = 0;
  let latKnown = true;
  for (const m of mix) {
    const w = Math.max(0, m.share) / total;
    const r = policy.rules.find(x => x.taskType === m.taskType && x.lengthBucket === m.lengthBucket);
    if (!r) continue;
    const ev = r.evidence;
    const inTok = 300, outTok = 150; // fallback sizes when no token data
    const cost = (inTok * prices.inPerMTok + outTok * prices.outPerMTok) / 1e6;
    const local = r.route === 'LOCAL_FIRST' || r.route === 'LOCAL_ONLY' ? (r.route === 'LOCAL_ONLY' ? 1 : ev.passLocal ?? 0) : 0;
    localShare += w * local;
    costAll += w * cost;
    costPolicy += w * cost * (1 - local);
    if (ev.p50Cloud === null || (local > 0 && ev.p50Local === null)) latKnown = false;
    latAll += w * (ev.p50Cloud ?? 0);
    // Escalated requests pay local + cloud latency
    latPolicy += w * (local * (ev.p50Local ?? 0) + (r.route === 'LOCAL_FIRST' ? (1 - local) * ((ev.p50Local ?? 0) + (ev.p50Cloud ?? 0)) : (1 - local) * (ev.p50Cloud ?? 0)));
  }
  return {
    localShare,
    cloudCallsAvoidedPer1M: Math.round(localShare * 1e6),
    estCostAllCloudPer1M: costAll * 1e6,
    estCostWithPolicyPer1M: costPolicy * 1e6,
    estCostAvoidedPer1M: (costAll - costPolicy) * 1e6,
    p50LatencyDeltaMs: latKnown ? Math.round(latPolicy - latAll) : null,
    assumptions: [
      'ESTIMATE. Prices are editable constants (Remote Config price_in_per_mtok / price_out_per_mtok), not a quote.',
      'Assumes ~300 input and ~150 output tokens per request.',
      'A local-first request that fails validation escalates and is billed as a cloud call.',
      'Local share uses measured local pass rates from this policy\'s evidence.'
    ]
  };
}
