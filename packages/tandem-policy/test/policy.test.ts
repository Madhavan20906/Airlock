import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wilson, percentile, aggregate, compilePolicy, defaultPolicy, lookupRule, validatePolicy, diffPolicies,
  mergeIntoRemoteConfigTemplate, simulateSavings, decide, DEFAULT_PARAMS, POLICY_PARAM, bucketFor, estimateTokens
} from '../dist/index.js';
import type { RunResult, TaskType, LengthBucket } from '../dist/index.js';

let seq = 0;
function run(taskId: string, backend: 'on_device' | 'in_cloud', passed: boolean, ms = 1000, type: TaskType = 'classify', bucket: LengthBucket = 'S', extra: Partial<RunResult> = {}): RunResult {
  return {
    runId: `r${++seq}`, taskId, taskType: type, lengthBucket: bucket, backend, servedBy: backend, ok: true,
    quality: passed ? 1 : 0.2, passed, ttftMs: ms / 4, totalMs: ms, outTokensEst: 40, inTokensEst: 120, ts: 0, ...extra
  };
}
/** n tasks, k of which pass locally; cloud passes all. */
function cell(n: number, k: number, opts: { type?: TaskType; bucket?: LengthBucket; localMs?: number; cloudPass?: number } = {}): RunResult[] {
  const out: RunResult[] = [];
  for (let i = 0; i < n; i++) {
    const id = `${opts.type ?? 'classify'}-${opts.bucket ?? 'S'}-${i}`;
    out.push(run(id, 'on_device', i < k, opts.localMs ?? 900, opts.type, opts.bucket));
    out.push(run(id, 'in_cloud', i < (opts.cloudPass ?? n), 1800, opts.type, opts.bucket));
  }
  return out;
}

test('wilson: matches published values', () => {
  const w = wilson(8, 10);
  assert.ok(Math.abs(w.lo! - 0.4902) < 1e-3, `lo ${w.lo}`);
  assert.ok(Math.abs(w.hi! - 0.9433) < 1e-3, `hi ${w.hi}`);
  assert.deepEqual(wilson(0, 0), { p: null, lo: null, hi: null });
  assert.equal(wilson(10, 10).hi, 1);
  assert.equal(wilson(0, 10).lo, 0);
  assert.throws(() => wilson(11, 10));
});

test('percentile: nearest rank, ignores non-finite', () => {
  assert.equal(percentile([5, 1, 3, NaN], 50), 3);
  assert.equal(percentile([1, 2, 3, 4], 95), 4);
  assert.equal(percentile([], 50), null);
});

test('aggregate: repeats collapse to one task by majority vote; unavailable runs excluded', () => {
  const rs = [
    run('t1', 'on_device', true), run('t1', 'on_device', true), run('t1', 'on_device', false),
    run('t2', 'on_device', true), run('t2', 'on_device', false), // tie -> fail
    run('t3', 'on_device', false, 0, 'classify', 'S', { error: 'unavailable', ok: false }),
    run('t4', 'on_device', false, 0, 'classify', 'S', { error: 'quota', ok: false })
  ];
  const { cells } = aggregate(rs);
  const c = cells.find(x => x.taskType === 'classify' && x.lengthBucket === 'S')!;
  assert.equal(c.local.n, 2, 'unavailable and rate-limited runs are not quality evidence');
  assert.equal(c.local.passes, 1);
  assert.equal(c.local.unavailable, 2);
});

test('decide: every branch', () => {
  const P = DEFAULT_PARAMS;
  const agg = (rs: RunResult[]) => aggregate(rs).cells.find(c => c.lengthBucket === 'S')!;
  assert.equal(decide(agg(cell(5, 5)), P, 'measured').route, 'CLOUD_FIRST');                  // n < minN
  assert.match(decide(agg(cell(5, 5)), P, 'measured').why, /Not enough evidence/);
  assert.equal(decide(agg(cell(20, 20)), P, 'measured').route, 'LOCAL_FIRST');                 // all good
  assert.equal(decide(agg(cell(20, 12)), P, 'measured').route, 'CLOUD_FIRST');                 // below floor
  assert.equal(decide(agg(cell(40, 36, { cloudPass: 40 })), P, 'measured').route, 'CLOUD_FIRST'); // 90% vs 100%: > tolerance behind
  assert.equal(decide(agg(cell(20, 20, { localMs: 20000 })), P, 'measured').route, 'CLOUD_FIRST'); // latency budget
});

test('property: fewer local passes never yields a riskier route (monotonic)', () => {
  const rank = { LOCAL_FIRST: 1, CLOUD_FIRST: 0 } as const;
  for (const n of [8, 12, 20, 30, 50]) {
    let prev = Infinity;
    for (let k = n; k >= 0; k--) {
      const c = aggregate(cell(n, k)).cells.find(x => x.lengthBucket === 'S')!;
      const r = rank[decide(c, DEFAULT_PARAMS, 'measured').route];
      assert.ok(r <= prev, `n=${n} k=${k} became riskier`);
      prev = r;
    }
  }
});

test('property: less evidence (smaller n at the same pass rate) never yields a riskier route', () => {
  const rank = { LOCAL_FIRST: 1, CLOUD_FIRST: 0 } as const;
  let prev = Infinity;
  for (let n = 60; n >= 1; n--) {
    const c = aggregate(cell(n, n)).cells.find(x => x.lengthBucket === 'S')!;
    const r = rank[decide(c, DEFAULT_PARAMS, 'measured').route];
    assert.ok(r <= prev, `n=${n} became riskier`);
    prev = r;
  }
});

test('compile: 24 rules, pooling by type, insufficient evidence marked, version increments', () => {
  const rs = [...cell(6, 6, { bucket: 'S' }), ...cell(6, 6, { bucket: 'M' })];
  const p = compilePolicy(rs, { now: new Date('2026-11-27T00:00:00Z') });
  assert.equal(p.rules.length, 24);
  assert.equal(validatePolicy(p).valid, true, validatePolicy(p).errors.join('; '));
  const s = lookupRule(p, 'classify', 'S');
  assert.equal(s.evidence.status, 'pooled_by_type');
  assert.equal(s.evidence.n, 12);
  const l = lookupRule(p, 'classify', 'L');
  assert.equal(l.evidence.status, 'insufficient_evidence', 'never extrapolate to an unobserved bucket');
  assert.equal(l.route, 'CLOUD_FIRST');
  assert.equal(lookupRule(p, 'translate', 'S').route, 'CLOUD_FIRST');
  const p2 = compilePolicy(rs, { previous: p });
  assert.equal(p2.version, p.version + 1);
});

test('default policy: valid, cloud-first everywhere, sensitive stays local', () => {
  const d = defaultPolicy();
  assert.equal(validatePolicy(d).valid, true);
  assert.equal(d.version, 0);
  assert.ok(d.rules.every(r => r.route === 'CLOUD_FIRST'));
  assert.equal(d.privacy.sensitiveRoute, 'LOCAL_ONLY');
});

test('validatePolicy: rejects malformed input (fail closed)', () => {
  assert.equal(validatePolicy(null).valid, false);
  assert.equal(validatePolicy({}).valid, false);
  const d = defaultPolicy();
  assert.equal(validatePolicy({ ...d, rules: d.rules.slice(1) }).valid, false);
  assert.equal(validatePolicy({ ...d, privacy: { ...d.privacy, sensitiveRoute: 'SEND' } }).valid, false);
  assert.equal(validatePolicy({ ...d, rules: [...d.rules, d.rules[0]] }).valid, false);
});

test('diff: reports route changes only', () => {
  const a = defaultPolicy();
  const b = compilePolicy(cell(20, 20));
  const d = diffPolicies(a, b);
  assert.ok(d.changes.some(c => c.taskType === 'classify' && c.lengthBucket === 'S' && c.from === 'CLOUD_FIRST' && c.to === 'LOCAL_FIRST'));
  assert.equal(diffPolicies(b, b).changes.length, 0);
});

test('Remote Config export: merges without touching other params; refuses invalid policy', () => {
  const tpl = { conditions: [{ name: 'beta' }], parameters: { other_flag: { defaultValue: { value: 'true' } } }, version: { versionNumber: '7' } };
  const p = compilePolicy(cell(20, 20));
  const out = mergeIntoRemoteConfigTemplate(tpl, p);
  assert.deepEqual(out.parameters.other_flag, tpl.parameters.other_flag);
  assert.deepEqual(out.conditions, tpl.conditions);
  assert.equal(JSON.parse(out.parameters[POLICY_PARAM].defaultValue.value).version, p.version);
  assert.equal((tpl.parameters as any)[POLICY_PARAM], undefined, 'input not mutated');
  assert.throws(() => mergeIntoRemoteConfigTemplate(tpl, { ...p, rules: [] } as any));
});

test('savings: all-cloud default avoids nothing; local-first cell avoids its pass rate', () => {
  const mix = [{ taskType: 'classify' as const, lengthBucket: 'S' as const, share: 1 }];
  const prices = { inPerMTok: 0.1, outPerMTok: 0.4 };
  assert.equal(simulateSavings(defaultPolicy(), mix, prices).localShare, 0);
  const s = simulateSavings(compilePolicy(cell(20, 20)), mix, prices);
  assert.equal(s.localShare, 1);
  assert.ok(s.estCostAvoidedPer1M > 0);
  assert.ok(s.assumptions[0].startsWith('ESTIMATE'));
});

test('tokens and buckets', () => {
  assert.equal(bucketFor(10), 'S');
  assert.equal(bucketFor(500), 'M');
  assert.equal(bucketFor(1500), 'L');
  assert.ok(estimateTokens('नमस्ते दुनिया') > estimateTokens('hello world') / 2);
});
