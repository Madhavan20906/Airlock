import test from 'node:test';
import assert from 'node:assert/strict';
import { generateLeakLabCorpus, runLeakLab, findLeakedCanaries } from '../dist/index.js';

test('Leak Lab: corpus has >= 200 adversarial cases across >= 15 techniques', () => {
  const corpus = generateLeakLabCorpus();
  assert.ok(corpus.length >= 200, `corpus size ${corpus.length}`);
  assert.ok(new Set(corpus.map(c => c.technique)).size >= 15);
});

test('Leak Lab: oracle is not blind (it flags every canary in the raw, unredacted input)', () => {
  // If the oracle could not see disguised canaries, a "0 leaks" result would be meaningless.
  for (const c of generateLeakLabCorpus()) {
    assert.deepEqual(findLeakedCanaries(c.input, c.canaries), c.canaries, `${c.id} (${c.technique})`);
  }
});

test('Leak Lab: known misses are exactly the documented ones (regression guard)', () => {
  const r = runLeakLab();
  const missed = r.results.filter(x => x.outcome === 'missed').map(x => `${x.canaryType}/${x.technique}`);
  // Documented limitation: bare account numbers with no context, wrapped in base64.
  assert.ok(missed.every(m => m === 'ACCOUNT/base64'), `unexpected misses: ${missed.join(', ')}`);
  assert.ok(r.missed <= 2, `missed ${r.missed}`);
});
