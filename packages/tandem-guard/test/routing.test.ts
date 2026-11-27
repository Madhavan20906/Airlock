import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateRoute,
  DEFAULT_ROUTING_POLICY
} from '../dist/index.js';
import type { Entity } from '../dist/index.js';

test('Policy Engine: Sensitive + Simple task routes to LOCAL_ONLY', () => {
  const sensitiveEntities: Entity[] = [
    { type: 'PAN', value: 'ABCPE1234F', span: [0, 10], confidence: 0.95, source: 'deterministic' }
  ];

  const decision = evaluateRoute({
    task: { instruction: 'Summarize', content: 'Short invoice text', taskType: 'summarize' },
    entities: sensitiveEntities,
    localModelAvailable: true,
    online: true,
    policy: DEFAULT_ROUTING_POLICY,
    hasNERLayer: true
  });

  assert.equal(decision.route, 'LOCAL_ONLY');
  assert.ok(decision.sensitivityScore > 0.35);
  assert.equal(decision.complexity, 'low');
});

test('Policy Engine: Sensitive + High Complexity routes to REDACTED_CLOUD', () => {
  const sensitiveEntities: Entity[] = [
    { type: 'AADHAAR', value: '999999990019', span: [0, 12], confidence: 0.98, source: 'deterministic' }
  ];

  const longContent = 'A'.repeat(7000); // Exceeds highCharCount
  const decision = evaluateRoute({
    task: { instruction: 'Analyze deeply', content: longContent, taskType: 'qa' },
    entities: sensitiveEntities,
    localModelAvailable: true,
    online: true,
    policy: DEFAULT_ROUTING_POLICY,
    hasNERLayer: true
  });

  assert.equal(decision.route, 'REDACTED_CLOUD');
  assert.equal(decision.complexity, 'high');
});

test('Policy Engine: Kill Switch overrides to LOCAL_ONLY', () => {
  const policy = { ...DEFAULT_ROUTING_POLICY, killSwitchLocalOnly: true };
  const decision = evaluateRoute({
    task: { instruction: 'General QA', content: 'What is photosynthesis?', taskType: 'qa' },
    entities: [],
    localModelAvailable: true,
    online: true,
    policy,
    hasNERLayer: false
  });

  assert.equal(decision.route, 'LOCAL_ONLY');
});

test('Policy Engine: Offline without local model blocks with consent requirement', () => {
  const decision = evaluateRoute({
    task: { instruction: 'Summarize', content: 'Text', taskType: 'summarize' },
    entities: [],
    localModelAvailable: false,
    online: false,
    policy: DEFAULT_ROUTING_POLICY,
    hasNERLayer: false
  });

  assert.equal(decision.route, 'BLOCKED_NEEDS_CONSENT');
});
