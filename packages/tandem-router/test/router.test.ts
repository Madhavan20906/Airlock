import test from 'node:test';
import assert from 'node:assert/strict';
import { createTandem, verifyReceipts, GENESIS } from '../dist/index.js';
import type { AIBackend, Receipt } from '../dist/index.js';
import { compilePolicy, defaultPolicy } from '@tandem/policy';
import type { RunResult as ProbeRun } from '@tandem/policy';

type Call = { backend: 'on_device' | 'in_cloud'; prompt: string };

function mockAI(opts: { state?: string; local?: string | Error; cloud?: string | Error } = {}): AIBackend & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    async getCapability() { return { state: opts.state ?? 'available' }; },
    async runOnDevice(prompt) {
      calls.push({ backend: 'on_device', prompt });
      if (opts.local instanceof Error) throw opts.local;
      return { text: opts.local ?? 'Local answer with enough words to pass.', servedBy: 'on_device', totalMs: 10 };
    },
    async runInCloud(prompt) {
      calls.push({ backend: 'in_cloud', prompt });
      if (opts.cloud instanceof Error) throw opts.cloud;
      return { text: opts.cloud ?? 'Cloud answer with enough words to pass.', servedBy: 'in_cloud', totalMs: 20 };
    }
  };
}

/** A policy where summarize/S is LOCAL_FIRST (from synthetic measurements). */
function localFirstPolicy() {
  const rs: ProbeRun[] = [];
  for (let i = 0; i < 20; i++) for (const backend of ['on_device', 'in_cloud'] as const) {
    rs.push({ runId: `${i}${backend}`, taskId: `t${i}`, taskType: 'summarize', lengthBucket: 'S', backend, servedBy: backend, ok: true, quality: 1, passed: true, ttftMs: 10, totalMs: 500, outTokensEst: 30, inTokensEst: 100, ts: 0 });
  }
  return compilePolicy(rs);
}

const SAFE = 'Quarterly notes: the team met on Tuesday and agreed to move the review to next week.';
const SENSITIVE = 'Client Meera Iyer, PAN BQKPS4821L, Aadhaar 4712 0938 5618, asked for a refund summary.';

test('LOCAL_FIRST: local passes -> served on-device, no escalation, no fallback', async () => {
  const ai = mockAI();
  const t = createTandem({ ai, policy: localFirstPolicy() });
  const r = await t.run({ task: 'summarize', input: SAFE });
  assert.equal(r.receipt.route, 'LOCAL');
  assert.equal(r.receipt.servedBy, 'on_device');
  assert.equal(r.receipt.qualityEscalation.happened, false);
  assert.equal(r.receipt.availabilityFallback, false);
  assert.deepEqual(ai.calls.map(c => c.backend), ['on_device']);
  assert.equal(r.receipt.payloadBytes, 0);
});

test('quality escalation and availability fallback are recorded differently', async () => {
  // Quality escalation: local ran but failed its validator (refusal)
  const q = await createTandem({ ai: mockAI({ local: "I'm sorry, but I can't help with that." }), policy: localFirstPolicy() }).run({ task: 'summarize', input: SAFE });
  assert.equal(q.receipt.route, 'CLOUD');
  assert.equal(q.receipt.qualityEscalation.happened, true);
  assert.match(q.receipt.qualityEscalation.reason!, /refusal/);
  assert.equal(q.receipt.availabilityFallback, false);
  assert.ok(q.local, 'local attempt kept for the UI');

  // Availability fallback: local model not available at all
  const a = await createTandem({ ai: mockAI({ state: 'downloadable' }), policy: localFirstPolicy() }).run({ task: 'summarize', input: SAFE });
  assert.equal(a.receipt.route, 'CLOUD');
  assert.equal(a.receipt.availabilityFallback, true);
  assert.match(a.receipt.availabilityReason!, /downloadable/);
  assert.equal(a.receipt.qualityEscalation.happened, false);
});

test('CLOUD_FIRST default policy: cloud serves; offline falls back to local (availability)', async () => {
  const ai = mockAI();
  const r = await createTandem({ ai }).run({ task: 'qa', input: SAFE });
  assert.equal(r.receipt.route, 'CLOUD');
  assert.equal(r.receipt.policyVersion, 0);
  const off = await createTandem({ ai: mockAI(), isOnline: () => false }).run({ task: 'qa', input: SAFE });
  assert.equal(off.receipt.route, 'LOCAL');
  assert.equal(off.receipt.availabilityFallback, true);
  assert.match(off.receipt.availabilityReason!, /offline/);
});

test('sensitive + local available: stays on-device even when the rule is cloud-first', async () => {
  const ai = mockAI();
  const r = await createTandem({ ai }).run({ task: 'summarize', input: SENSITIVE });
  assert.equal(r.receipt.guard.sensitive, true);
  assert.ok(r.receipt.guard.entities.PAN >= 1 && r.receipt.guard.entities.AADHAAR >= 1);
  assert.equal(r.receipt.route, 'LOCAL');
  assert.ok(ai.calls.every(c => c.backend === 'on_device'));
});

test('sensitive + no local model: BLOCKED without consent, nothing sent', async () => {
  const ai = mockAI({ state: 'unavailable' });
  const r = await createTandem({ ai }).run({ task: 'summarize', input: SENSITIVE });
  assert.equal(r.status, 'blocked');
  assert.equal(r.receipt.route, 'BLOCKED');
  assert.equal(ai.calls.length, 0);
  assert.equal(r.receipt.payloadBytes, 0);
});

test('LEAK TEST at the dispatch boundary: consented redacted cloud payload contains no raw identifiers', async () => {
  const ai = mockAI({ state: 'unavailable', cloud: 'Summary for [PERSON_1] ([PAN_1]).' });
  const r = await createTandem({ ai }).run({ task: 'summarize', input: SENSITIVE, consentRedactedCloud: true });
  assert.equal(r.receipt.route, 'CLOUD_REDACTED');
  const sent = ai.calls.find(c => c.backend === 'in_cloud')!.prompt;
  for (const raw of ['BQKPS4821L', '4712 0938 5618', '471209385618']) assert.ok(!sent.includes(raw), `leaked ${raw}`);
  assert.equal(sent, r.sentToCloud, 'receipt shows exactly what was dispatched');
  assert.ok(r.output.includes('BQKPS4821L'), 'rehydrated locally after the cloud call');
  assert.equal(r.receipt.payloadBytes, new TextEncoder().encode(sent).length);
});

test('privacy BLOCK policy and cloud kill switch fail closed', async () => {
  const p = { ...defaultPolicy(), privacy: { sensitivityThreshold: 0.5, sensitiveRoute: 'BLOCK' as const } };
  const ai = mockAI();
  const r = await createTandem({ ai, policy: p }).run({ task: 'summarize', input: SENSITIVE });
  assert.equal(r.status, 'blocked');
  assert.equal(ai.calls.length, 0);
  const k = { ...defaultPolicy(), killSwitch: { cloud: true, local: false } };
  const ai2 = mockAI({ state: 'unavailable' });
  const r2 = await createTandem({ ai: ai2, policy: k }).run({ task: 'qa', input: SAFE });
  assert.equal(r2.status, 'error');
  assert.equal(ai2.calls.length, 0);
});

test('invalid policy is rejected; router keeps the conservative default', async () => {
  const t = createTandem({ ai: mockAI(), policy: { version: 'x', rules: [] } });
  assert.equal(t.getPolicy().version, 0);
  assert.ok(t.policyErrors.length > 0);
  assert.equal(t.setPolicy(localFirstPolicy()), true);
  assert.equal(t.getPolicy().version, 1);
});

test('cloud budget per minute is enforced', async () => {
  const p = { ...defaultPolicy(), budgets: { maxCloudCallsPerMin: 2 } };
  const ai = mockAI({ state: 'unavailable' });
  const t = createTandem({ ai, policy: p, now: () => 1000 });
  await t.run({ task: 'qa', input: SAFE });
  await t.run({ task: 'qa', input: SAFE });
  const third = await t.run({ task: 'qa', input: SAFE });
  assert.equal(third.status, 'error');
  assert.match(third.receipt.why, /budget/);
  assert.equal(ai.calls.length, 2);
});

test('receipts: SHA-256 hash chain verifies; any edit is detected', async () => {
  const receipts: Receipt[] = [];
  const t = createTandem({ ai: mockAI(), policy: localFirstPolicy(), onReceipt: r => receipts.push(r) });
  await t.run({ task: 'summarize', input: SAFE });
  await t.run({ task: 'qa', input: SAFE });
  await t.run({ task: 'summarize', input: SENSITIVE });
  assert.equal(receipts[0].prevHash, GENESIS);
  assert.ok(receipts.every(r => /^[0-9a-f]{64}$/.test(r.hash)));
  assert.equal((await verifyReceipts(receipts)).valid, true);
  const tampered = receipts.map((r, i) => (i === 1 ? { ...r, route: 'LOCAL' as const } : r));
  const v = await verifyReceipts(tampered);
  assert.equal(v.valid, false);
  assert.equal(v.brokenIndex, 1);
  // Receipts never carry content
  const json = JSON.stringify(receipts);
  assert.ok(!json.includes('BQKPS4821L') && !json.includes('Quarterly notes'));
});
