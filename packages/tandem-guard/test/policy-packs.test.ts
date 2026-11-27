import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRoute,
  HEALTHCARE_POLICY_PACK,
  STUDENT_POLICY_PACK,
  FINANCE_TAX_POLICY_PACK,
  POLICY_PACKS,
  runDeterministicDetectors
} from '../dist/index.js';

test('Pillar 3: Policy Packs Change Route on Identical Input', () => {
  // Input with a person name and contact number
  const input = 'Patient Rajesh Kumar has clinical test results pending. Contact +91 98765 43210.';
  const entities = runDeterministicDetectors(input);

  // 1. Student pack: higher tolerance thresholds for routine names/phones -> CLOUD_DIRECT
  const studentDecision = evaluateRoute({
    task: { instruction: 'Summarize clinical notes', content: input, taskType: 'summarize' },
    entities,
    localModelAvailable: true,
    online: true,
    policy: STUDENT_POLICY_PACK,
    hasNERLayer: false
  });

  // 2. Healthcare pack: strict zero-leak patient confidentiality -> LOCAL_ONLY
  const healthcareDecision = evaluateRoute({
    task: { instruction: 'Summarize clinical notes', content: input, taskType: 'summarize' },
    entities,
    localModelAvailable: true,
    online: true,
    policy: HEALTHCARE_POLICY_PACK,
    hasNERLayer: false
  });

  assert.notStrictEqual(
    studentDecision.route,
    healthcareDecision.route,
    `Policy pack flip failed to change route! Student got ${studentDecision.route}, Healthcare got ${healthcareDecision.route}`
  );

  assert.strictEqual(healthcareDecision.route, 'LOCAL_ONLY');
});

test('Pillar 3: Finance Pack Heavily Penalizes Financial Identifiers', () => {
  const financialEntities = [
    { type: 'PAN', value: 'ABCPE1234F', span: [0, 10], confidence: 0.98, source: 'deterministic' }
  ];

  const financeDecision = evaluateRoute({
    task: { instruction: 'Extract tax data', content: 'PAN ABCPE1234F', taskType: 'extract' },
    entities: financialEntities as any,
    localModelAvailable: true,
    online: true,
    policy: FINANCE_TAX_POLICY_PACK,
    hasNERLayer: false
  });

  assert.strictEqual(financeDecision.route, 'LOCAL_ONLY');
  assert.ok(financeDecision.sensitivityScore >= 0.50);
});

test('Pillar 3: All 6 Policy Packs Are Schema Valid and Registered', () => {
  const expectedPacks = ['default', 'healthcare', 'legal', 'finance', 'student', 'freelancer'];
  for (const name of expectedPacks) {
    const pack = (POLICY_PACKS as any)[name];
    assert.ok(pack, `Missing policy pack: ${name}`);
    assert.ok(typeof pack.version === 'number');
    assert.ok(typeof pack.thresholds.localOnly === 'number');
    assert.ok(typeof pack.thresholds.hardBlock === 'number');
    assert.ok(typeof pack.mode === 'string');
    assert.ok(Array.isArray(pack.enabledDetectors));
  }
});
