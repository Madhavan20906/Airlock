import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEgressReceipt,
  computeSHA256,
  evaluateRoute,
  DEFAULT_ROUTING_POLICY
} from '../dist/index.js';
import type { RouteDecision } from '../dist/index.js';

test('Egress Receipt: LOCAL_ONLY guarantees zero egress count and zero bytes', async () => {
  const decision: RouteDecision = {
    route: 'LOCAL_ONLY',
    reason: 'Sensitive workload with low complexity routed to on-device model.',
    sensitivityScore: 0.85,
    complexity: 'low',
    classifierMode: 'hybrid',
    entityCounts: { AADHAAR: 1, PAN: 1 }
  };

  const originalDoc = 'Client: Rajesh Sharma, Aadhaar: 9999 9999 0019, PAN: ABCPE1234F';
  const receipt = await generateEgressReceipt({
    decision,
    originalText: originalDoc
  });

  const nullHash = await computeSHA256('');
  assert.equal(receipt.route, 'LOCAL_ONLY');
  assert.equal(receipt.egressRequestCount, 0, 'Must record 0 outbound network requests');
  assert.equal(receipt.outboundByteSize, 0, 'Must record 0 outbound bytes');
  assert.equal(receipt.destination, 'on-device (gemini-nano)');
  assert.equal(receipt.outboundPayloadHash, nullHash);
  assert.equal(receipt.verifierPassed, true);
  assert.ok(receipt.verifierBadge.includes('0 requests, 0 bytes'));
  assert.ok(receipt.receiptId.startsWith('rcpt_'));
});

test('Egress Receipt: REDACTED_CLOUD records exact SHA-256 and byte size', async () => {
  const decision: RouteDecision = {
    route: 'REDACTED_CLOUD',
    reason: 'Sensitive heavy reasoning routed via sanitized cloud path.',
    sensitivityScore: 0.90,
    complexity: 'high',
    classifierMode: 'hybrid',
    entityCounts: { PAN: 1, ACCOUNT: 1 }
  };

  const originalDoc = 'Client PAN is ABCPE1234F. Transfer settlement to A/C: 987654321098.';
  const sanitizedDoc = 'Client PAN is [PAN_1]. Transfer settlement to A/C: [ACCOUNT_1].';

  const expectedHash = await computeSHA256(sanitizedDoc);
  const expectedBytes = new TextEncoder().encode(sanitizedDoc).length;

  const receipt = await generateEgressReceipt({
    decision,
    originalText: originalDoc,
    sanitizedText: sanitizedDoc,
    verifierPassed: true,
    verifierBadge: 'outbound payload re-scanned: 0 sensitive matches',
    placeholdersRestored: 2
  });

  assert.equal(receipt.route, 'REDACTED_CLOUD');
  assert.equal(receipt.egressRequestCount, 1);
  assert.equal(receipt.outboundByteSize, expectedBytes);
  assert.equal(receipt.outboundPayloadHash, expectedHash);
  assert.equal(receipt.destination, 'firebase-ai-logic (cloud)');
  assert.equal(receipt.outboundPayload, sanitizedDoc);
  assert.equal(receipt.placeholdersRestored, 2);
  assert.equal(receipt.verifierPassed, true);
});

test('Egress Receipt: BLOCKED_NEEDS_CONSENT records fail-closed halted transmission', async () => {
  const decision: RouteDecision = {
    route: 'BLOCKED_NEEDS_CONSENT',
    reason: 'Offline and on-device hardware unavailable for sensitive data.',
    sensitivityScore: 0.95,
    complexity: 'medium',
    classifierMode: 'deterministic-only',
    entityCounts: { AADHAAR: 1 }
  };

  const receipt = await generateEgressReceipt({
    decision,
    originalText: 'Confidential document with Aadhaar 9999 9999 0019'
  });

  assert.equal(receipt.route, 'BLOCKED_NEEDS_CONSENT');
  assert.equal(receipt.egressRequestCount, 0);
  assert.equal(receipt.outboundByteSize, 0);
  assert.equal(receipt.destination, 'none (blocked)');
  assert.equal(receipt.verifierPassed, false);
  assert.ok(receipt.verifierBadge.includes('halted'));
});
