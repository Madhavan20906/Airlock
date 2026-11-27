// Tandem held-out policy validation (WP-12).
//
// 1. Compile a policy from CALIBRATION-split probe results only.
// 2. Replay the HELD-OUT split's measured outcomes through that policy, using the router's
//    decision logic: LOCAL_FIRST -> local answer if it passed validation, otherwise escalate to cloud
//    (latency = local + cloud); CLOUD_FIRST -> cloud.
// 3. Compare with all-cloud and all-local baselines.
//
// This is a replay of real measurements (both backends were run on every held-out task), not a
// simulation of model behaviour. Usage:
//   node eval/policy-validation.mjs <calibration.json> <heldout.json> [out.json]
//   node eval/policy-validation.mjs --smoke      (CI: synthetic fixture, checks the pipeline only)
import fs from 'node:fs';
import { compilePolicy, lookupRule, percentile, wilson } from '../packages/tandem-policy/dist/index.js';
import { generateBattery } from '../packages/tandem-bench/dist/index.js';

import { pathToFileURL } from 'node:url';
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const args = isMain ? process.argv.slice(2) : [];
const smoke = args.includes('--smoke');

function byTask(results) {
  const m = new Map();
  for (const r of results) {
    if (r.error === 'unavailable' || r.error === 'quota') continue; // infrastructure, not quality
    const k = `${r.taskId}|${r.backend}`;
    if (!m.has(k)) m.set(k, r); // first repeat only for replay
  }
  return m;
}

export function validatePolicy(calibration, heldout, params = {}) {
  const split = new Map(generateBattery().map(t => [t.id, t.split]));
  const leak = calibration.filter(r => split.get(r.taskId) !== 'calibration');
  if (leak.length) throw new Error(`${leak.length} calibration results come from non-calibration tasks`);
  const policy = compilePolicy(calibration, { params });
  const idx = byTask(heldout);
  const tasks = [...new Set(heldout.map(r => r.taskId))].filter(id => split.get(id) === 'heldout');
  const rows = [];
  for (const id of tasks) {
    const L = idx.get(`${id}|on_device`), C = idx.get(`${id}|in_cloud`);
    if (!L || !C) continue; // need both measurements to replay honestly
    const rule = lookupRule(policy, L.taskType, L.lengthBucket);
    let served, passed, ms, escalated = false;
    if (rule.route === 'LOCAL_FIRST') {
      if (L.passed) { served = 'on_device'; passed = true; ms = L.totalMs; }
      else { served = 'in_cloud'; passed = C.passed; ms = (L.totalMs ?? 0) + (C.totalMs ?? 0); escalated = true; }
    } else { served = 'in_cloud'; passed = C.passed; ms = C.totalMs; }
    rows.push({ id, type: L.taskType, bucket: L.lengthBucket, rule: rule.route, served, passed, ms, escalated, localPassed: L.passed, cloudPassed: C.passed, localMs: L.totalMs, cloudMs: C.totalMs });
  }
  const n = rows.length;
  const pass = k => rows.filter(k).length;
  const tandemPass = pass(r => r.passed), cloudPass = pass(r => r.cloudPassed), localPass = pass(r => r.localPassed);
  const onDevice = pass(r => r.served === 'on_device');
  const w = (k, nn) => { const x = wilson(k, nn); return { p: x.p, lo: x.lo, hi: x.hi }; };
  return {
    policyVersion: policy.version,
    localFirstCells: policy.rules.filter(r => r.route === 'LOCAL_FIRST').map(r => `${r.taskType}/${r.lengthBucket}`),
    nHeldoutTasks: n,
    passRate: { tandem: w(tandemPass, n), allCloud: w(cloudPass, n), allLocal: w(localPass, n) },
    qualityRetainedVsAllCloud: cloudPass ? tandemPass / cloudPass : null,
    servedOnDevice: n ? onDevice / n : null,
    cloudCallsAvoided: onDevice,
    escalations: pass(r => r.escalated),
    escalationsThatRescued: pass(r => r.escalated && r.cloudPassed),
    latencyMs: {
      tandem: { p50: percentile(rows.map(r => r.ms), 50), p95: percentile(rows.map(r => r.ms), 95) },
      allCloud: { p50: percentile(rows.map(r => r.cloudMs), 50), p95: percentile(rows.map(r => r.cloudMs), 95) },
      allLocal: { p50: percentile(rows.map(r => r.localMs), 50), p95: percentile(rows.map(r => r.localMs), 95) }
    },
    wrongChoices: {
      localFirstButBothFailed: pass(r => r.rule === 'LOCAL_FIRST' && !r.localPassed && !r.cloudPassed),
      cloudFirstButLocalWouldPass: pass(r => r.rule !== 'LOCAL_FIRST' && r.localPassed),
      cloudFirstAndCloudFailedButLocalPassed: pass(r => r.rule !== 'LOCAL_FIRST' && !r.cloudPassed && r.localPassed)
    },
    rows
  };
}

if (smoke) {
  // Synthetic fixture: exercises compile + replay end to end; numbers are meaningless by design.
  const tasks = generateBattery();
  const mk = (t, backend, passed) => ({ runId: `${t.id}:${backend}`, taskId: t.id, taskType: t.type, lengthBucket: t.lengthBucket, backend, servedBy: backend, ok: true, quality: passed ? 1 : 0, passed, ttftMs: 100, totalMs: backend === 'on_device' ? 800 : 1500, outTokensEst: 20, inTokensEst: 100, ts: 0 });
  const all = tasks.flatMap(t => [mk(t, 'on_device', t.type !== 'translate'), mk(t, 'in_cloud', true)]);
  const r = validatePolicy(all.filter(x => tasks.find(t => t.id === x.taskId).split === 'calibration'), all.filter(x => tasks.find(t => t.id === x.taskId).split === 'heldout'));
  if (!(r.nHeldoutTasks > 50 && r.servedOnDevice > 0 && r.passRate.tandem.p >= r.passRate.allLocal.p)) throw new Error('smoke failed: ' + JSON.stringify({ n: r.nHeldoutTasks, od: r.servedOnDevice }));
  console.log(`smoke ok: ${r.nHeldoutTasks} held-out tasks replayed, ${r.localFirstCells.length} local-first cells, on-device ${(r.servedOnDevice * 100).toFixed(0)}%`);
} else if (args.length >= 2) {
  const cal = JSON.parse(fs.readFileSync(args[0], 'utf8'));
  const held = JSON.parse(fs.readFileSync(args[1], 'utf8'));
  const r = validatePolicy(cal.results ?? cal, held.results ?? held);
  const out = args[2];
  if (out) fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), calibrationFile: args[0], heldoutFile: args[1], ...r }, null, 2));
  const pct = x => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
  console.log(`Held-out tasks replayed: ${r.nHeldoutTasks}`);
  console.log(`Pass rate  tandem ${pct(r.passRate.tandem.p)} | all-cloud ${pct(r.passRate.allCloud.p)} | all-local ${pct(r.passRate.allLocal.p)}`);
  console.log(`Quality retained vs all-cloud: ${pct(r.qualityRetainedVsAllCloud)}   Served on-device: ${pct(r.servedOnDevice)} (${r.cloudCallsAvoided} cloud calls avoided)`);
  console.log(`Escalations: ${r.escalations} (rescued: ${r.escalationsThatRescued})   Wrong choices: ${JSON.stringify(r.wrongChoices)}`);
  console.log(`Latency p50/p95 ms  tandem ${r.latencyMs.tandem.p50}/${r.latencyMs.tandem.p95} | all-cloud ${r.latencyMs.allCloud.p50}/${r.latencyMs.allCloud.p95}`);
} else if (isMain) {
  console.error('usage: node eval/policy-validation.mjs <calibration.json> <heldout.json> [out.json] | --smoke');
  process.exit(2);
}
