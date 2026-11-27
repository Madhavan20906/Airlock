// Firestore rules tests. Run with the emulator:
//   npx firebase-tools emulators:exec --only firestore --project demo-tandem "node --test firebase/rules.test.mjs"
import test, { before, after, beforeEach } from 'node:test';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, deleteDoc, updateDoc, collection, getCountFromServer } from 'firebase/firestore';

let env;
const hid = uid => createHash('sha256').update(uid).digest('hex');
const receipt = (id, extra = {}) => ({
  id, ts: 1, taskType: 'summarize', lengthBucket: 'S', policyVersion: 1, ruleRoute: 'LOCAL_FIRST',
  guard: { sensitive: false, sensitivity: 0, entities: {} }, route: 'LOCAL', servedBy: 'on_device',
  availabilityFallback: false, qualityEscalation: { happened: false }, validation: { passed: true, quality: 1 },
  payloadBytes: 0, bytesOut: 0, destination: [], latencyMs: 12, why: 'measured', prevHash: '0'.repeat(64), hash: 'a'.repeat(64), ...extra
});
const contrib = (extra = {}) => ({
  chromeMajorBucket: '155-159', osFamily: 'windows', availability: 'available', ttftBand: '1500to4000', tokensPerSecBand: 'lt5',
  localPassBands: { classify: 'gte80', extract: 'gte80', rewrite: 'gte80', summarize: 'gte80', translate: '50to80', qa: 'gte80' }, ts: 1, ...extra
});

before(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-tandem', firestore: { rules: fs.readFileSync('firebase/firestore.rules', 'utf8') } });
});
after(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

test('receipts: owner can create and read; other users and anonymous cannot', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  const anon = env.unauthenticatedContext().firestore();
  await assertSucceeds(setDoc(doc(alice, 'users/alice/receipts/r1'), receipt('r1')));
  await assertSucceeds(getDoc(doc(alice, 'users/alice/receipts/r1')));
  await assertFails(getDoc(doc(bob, 'users/alice/receipts/r1')));
  await assertFails(setDoc(doc(bob, 'users/alice/receipts/r2'), receipt('r2')));
  await assertFails(getDoc(doc(anon, 'users/alice/receipts/r1')));
});

test('receipts: content fields are rejected; receipts are immutable', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(alice, 'users/alice/receipts/r1'), receipt('r1', { prompt: 'my PAN is ...' })));
  await assertFails(setDoc(doc(alice, 'users/alice/receipts/r1'), receipt('r1', { output: 'secret' })));
  await assertFails(setDoc(doc(alice, 'users/alice/receipts/r1'), receipt('r1', { route: 'TELEPORT' })));
  await assertSucceeds(setDoc(doc(alice, 'users/alice/receipts/r1'), receipt('r1')));
  await assertFails(updateDoc(doc(alice, 'users/alice/receipts/r1'), { route: 'CLOUD' }));
});

test('runs: metrics only, owner only', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const run = { runId: 'x', taskId: 'classify-S-01', taskType: 'classify', lengthBucket: 'S', backend: 'on_device', servedBy: 'on_device', ok: true, quality: 1, passed: true, ttftMs: 10, totalMs: 20, outTokensEst: 3, inTokensEst: 40, ts: 1, chromeMajor: 158 };
  await assertSucceeds(setDoc(doc(alice, 'users/alice/runs/x'), run));
  await assertFails(setDoc(doc(alice, 'users/alice/runs/y'), { ...run, output: 'text' }));
  await assertFails(setDoc(doc(env.authenticatedContext('bob').firestore(), 'users/alice/runs/z'), run));
});

test('atlas: create only at SHA-256(own uid), enum-validated, no update, owner delete', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  const bob = env.authenticatedContext('bob').firestore();
  await assertFails(setDoc(doc(alice, 'contrib/alice'), contrib()), 'raw uid as id is rejected');
  await assertFails(setDoc(doc(alice, `contrib/${hid('bob')}`), contrib()), 'cannot write as someone else');
  await assertFails(setDoc(doc(alice, `contrib/${hid('alice')}`), contrib({ availability: 'maybe' })));
  await assertFails(setDoc(doc(alice, `contrib/${hid('alice')}`), contrib({ city: 'Pune' })), 'no extra fields');
  await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `contrib/${hid('alice')}`), contrib()));
  await assertSucceeds(setDoc(doc(alice, `contrib/${hid('alice')}`), contrib()));
  await assertFails(updateDoc(doc(alice, `contrib/${hid('alice')}`), { availability: 'unavailable' }), 'write-once');
  await assertFails(deleteDoc(doc(bob, `contrib/${hid('alice')}`)));
  const count = await getCountFromServer(collection(bob, 'contrib'));
  if (count.data().count !== 1) throw new Error('aggregate count should be readable');
  await assertSucceeds(deleteDoc(doc(alice, `contrib/${hid('alice')}`)));
});

test('everything else is denied', async () => {
  const alice = env.authenticatedContext('alice').firestore();
  await assertFails(setDoc(doc(alice, 'notes/n1'), { body: 'x' }));
  await assertFails(getDoc(doc(alice, 'users/alice/notes/n1')));
});
