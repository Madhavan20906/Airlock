import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  createLedgerEvent,
  verifyLedgerChain,
  canonicalLedgerPayload,
  GENESIS_PREVIOUS_HASH
} from '../dist/index.js';
import type { RouteDecision } from '../dist/index.js';

const d1: RouteDecision = {
  route: 'LOCAL_ONLY', reason: 'Sensitive data with low complexity', sensitivityScore: 0.85,
  complexity: 'simple', classifierMode: 'deterministic-only', entityCounts: { PAN: 1, AADHAAR: 1 }
};
const d2: RouteDecision = {
  route: 'REDACTED_CLOUD', reason: 'Sensitive data with high complexity', sensitivityScore: 0.9,
  complexity: 'complex', classifierMode: 'hybrid', entityCounts: { PERSON: 2, ACCOUNT: 1 }
};

test('Ledger: hash is a real SHA-256 of the canonical payload (independent node:crypto oracle)', async () => {
  const ev = await createLedgerEvent({ routeDecision: d1, latencyMs: 120, servedBy: 'on-device', policyVersion: 7 });
  const { hash, ...rest } = ev;
  const oracle = createHash('sha256').update(canonicalLedgerPayload(rest)).digest('hex');
  assert.equal(hash, oracle);
  assert.match(hash, /^[0-9a-f]{64}$/);
  assert.equal(ev.policyVersion, 7);
});

test('Ledger: hash-chaining and tamper verification', async () => {
  const ev0 = await createLedgerEvent({ routeDecision: d1, latencyMs: 120, servedBy: 'on-device' });
  assert.equal(ev0.index, 0);
  assert.equal(ev0.previousHash, GENESIS_PREVIOUS_HASH);

  const ev1 = await createLedgerEvent({ routeDecision: d2, latencyMs: 450, servedBy: 'cloud', placeholdersRestored: 3, previousEvent: ev0 });
  assert.equal(ev1.index, 1);
  assert.equal(ev1.previousHash, ev0.hash);
  assert.notEqual(ev1.hash, ev0.hash);

  assert.equal((await verifyLedgerChain([ev0, ev1])).valid, true);

  // Any field edit is caught, not only the fields the old hash covered
  for (const tampered of [
    { ...ev0, latencyMs: 9999 },
    { ...ev0, servedBy: 'cloud' as const },
    { ...ev0, reason: 'edited' },
    { ...ev0, policyVersion: 99 },
    { ...ev0, entityCounts: { PAN: 0, AADHAAR: 1 } }
  ]) {
    const r = await verifyLedgerChain([tampered, ev1]);
    assert.equal(r.valid, false);
    assert.equal(r.brokenIndex, 0);
  }

  const broken = await verifyLedgerChain([ev0, { ...ev1, previousHash: 'corrupted' }]);
  assert.equal(broken.valid, false);
  assert.equal(broken.brokenIndex, 1);

  // Deletion of the first event is caught
  const deleted = await verifyLedgerChain([ev1]);
  assert.equal(deleted.valid, false);
});
