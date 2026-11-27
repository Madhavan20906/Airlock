import test from 'node:test';
import assert from 'node:assert/strict';
import {
  redactText,
  rehydrateText
} from '../dist/index.js';
import type { Entity } from '../dist/index.js';

test('Redaction and Rehydration round-trip', () => {
  const originalText = 'Doctor report for Rajesh Sharma, PAN: ABCPE1234F. Email: rajesh@example.com.';
  const entities: Entity[] = [
    { type: 'PERSON', value: 'Rajesh Sharma', span: [18, 31], confidence: 0.9, source: 'ner' },
    { type: 'PAN', value: 'ABCPE1234F', span: [38, 48], confidence: 0.95, source: 'deterministic' },
    { type: 'EMAIL', value: 'rajesh@example.com', span: [57, 75], confidence: 0.98, source: 'deterministic' }
  ];

  const redaction = redactText(originalText, entities);
  assert.ok(!redaction.sanitizedText.includes('Rajesh Sharma'));
  assert.ok(!redaction.sanitizedText.includes('ABCPE1234F'));
  assert.ok(!redaction.sanitizedText.includes('rajesh@example.com'));
  assert.ok(redaction.sanitizedText.includes('[PERSON_1]'));
  assert.ok(redaction.sanitizedText.includes('[PAN_1]'));
  assert.ok(redaction.sanitizedText.includes('[EMAIL_1]'));

  // Sample Cloud AI response that preserved placeholders
  const sampleCloudResponse = 'Summary: The patient [PERSON_1] (Tax ID [PAN_1]) can be reached at [EMAIL_1]. Treatment prescribed.';
  const rehydration = rehydrateText(sampleCloudResponse, redaction.placeholderMap);

  assert.equal(rehydration.isClean, true);
  assert.equal(rehydration.restoredCount, 3);
  assert.ok(rehydration.rehydratedText.includes('Rajesh Sharma'));
  assert.ok(rehydration.rehydratedText.includes('ABCPE1234F'));
  assert.ok(rehydration.rehydratedText.includes('rajesh@example.com'));
});

test('Rehydration detects dropped or omitted placeholders', () => {
  const map = new Map<string, string>([
    ['[PERSON_1]', 'Alice'],
    ['[ACCOUNT_1]', '1234567890']
  ]);

  // Model only used PERSON_1 and hallucinated or dropped ACCOUNT_1
  const responseWithMissing = 'Hello [PERSON_1], your request was processed.';
  const result = rehydrateText(responseWithMissing, map);

  assert.equal(result.restoredCount, 1);
  assert.equal(result.totalPlaceholders, 2);
  assert.ok(result.missingPlaceholders.includes('[ACCOUNT_1]'));
});
