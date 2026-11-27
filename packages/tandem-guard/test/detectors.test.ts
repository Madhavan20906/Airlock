import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVerhoeff,
  detectAadhaar,
  validatePAN,
  detectPAN,
  validateLuhn,
  detectCard,
  detectBankDetails,
  detectGovernmentIDs,
  detectDeterministicNames,
  detectContactDetails,
  runDeterministicDetectors,
  runVerifierPass,
  redactText
} from '../dist/index.js';

test('Aadhaar Verhoeff Checksum and Format Variations', () => {
  // Valid Verhoeff checksums
  assert.equal(validateVerhoeff('999999990019'), true);
  assert.equal(validateVerhoeff('234567890124'), true);
  // Invalid checksums
  assert.equal(validateVerhoeff('999999990018'), false);
  assert.equal(validateVerhoeff('123456789012'), false);

  // Formats: spaces, dashes, contiguous, and OCR noise
  const text = `
    Aadhaar spaced: 9999 9999 0019
    Aadhaar dashed: 2345-6789-0124
    Aadhaar contiguous: 999999990019
    Aadhaar OCR variant: 9999 9999 OO19
    Invalid 12-digit number (should NOT detect): 123456789012
  `;
  const entities = detectAadhaar(text);
  assert.equal(entities.length, 4, 'Should detect valid spaced, dashed, contiguous, and OCR Aadhaar numbers');
  assert.ok(entities.some(e => e.value.includes('0019')));
  assert.ok(entities.some(e => e.value.includes('0124')));
  assert.ok(!entities.some(e => e.value.includes('123456789012')));
});

test('PAN Validation and Detection with Variations', () => {
  // Standard Valid PANs
  assert.equal(validatePAN('ABCPE1234F'), true); // 4th char P (Individual)
  assert.equal(validatePAN('AAACC9999A'), true); // 4th char C (Company)
  assert.equal(validatePAN('abcpe1234f'), true); // Lowercase support
  assert.equal(validatePAN('ABCPE 1234 F'), true); // Stray spaces
  assert.equal(validatePAN('ABCPE-1234-F'), true); // Stray dashes

  // Invalid PANs
  assert.equal(validatePAN('ABCDE1234F'), false); // 4th char D is invalid
  assert.equal(validatePAN('ABCZE1234F'), false); // 4th char Z is invalid
  assert.equal(validatePAN('SHORT'), false);

  const text = 'Client PAN is abcpe1234f, company PAN is AAACC 9999 A, and director PAN is BZRPK-5678-M.';
  const entities = detectPAN(text);
  assert.equal(entities.length, 3, 'Should detect lowercase, spaced, and dashed valid PANs');
});

test('Government ID Detection (GSTIN, Passport, Voter ID, Driving Licence, Vehicle)', () => {
  const doc = `
    GSTIN: 29ABCDE1234F1Z5
    Passport No: A1234567
    Voter ID: WBF1234567
    Driving Licence: DL-0420110012345
    Commercial Vehicle: MH 12 AB 1234
    BH Series Vehicle: 22BH1234AA
  `;
  const entities = detectGovernmentIDs(doc);
  const types = entities.map(e => e.type);

  assert.ok(types.includes('GSTIN'), 'Should detect Indian GSTIN');
  assert.ok(types.includes('PASSPORT'), 'Should detect Passport number');
  assert.ok(types.includes('VOTER_ID'), 'Should detect Voter ID / EPIC');
  assert.ok(types.includes('DL'), 'Should detect Driving Licence');
  assert.ok(types.includes('VEHICLE'), 'Should detect Vehicle plates');
});

test('Banking & UPI Detection', () => {
  const text = `
    Pay via UPI to freelancer@okhdfcbank or merchant@paytm.
    Alternatively transfer to Bank A/C: 987654321098 with IFSC: HDFC0001234.
    Bank Settlement Account: 50100412345678 (HDFC Bank).
    Designated Salary Account: 002101567890 (ICICI Bank).
  `;
  const entities = detectBankDetails(text);
  const types = entities.map(e => e.type);
  const values = entities.map(e => e.value);

  assert.ok(types.includes('UPI'), 'Should detect UPI IDs');
  assert.ok(types.includes('ACCOUNT'), 'Should detect Account and IFSC');
  assert.equal(entities.filter(e => e.type === 'UPI').length, 2);
  assert.ok(values.includes('50100412345678'), 'Should detect Bank Settlement Account 50100412345678');
  assert.ok(values.includes('002101567890'), 'Should detect Salary Account 002101567890');
});

test('Contact & Date of Birth Detection', () => {
  const text = `
    Email: support@guard.example.net
    Mobile: +91 98765 43210 or 98765-43210
    DOB: 15/08/1992
  `;
  const entities = detectContactDetails(text);
  const types = entities.map(e => e.type);

  assert.ok(types.includes('EMAIL'));
  assert.ok(types.includes('PHONE'));
  assert.ok(types.includes('DOB'));
});

test('Deterministic Name Fallback', () => {
  const text = `
    Consultation for Patient: Anita Desai by Dr. Arvind Swaminathan.
    Client: Rajesh Mehra, accompanied by Smt. Sunita Mehra.
  `;
  const entities = detectDeterministicNames(text);
  assert.ok(entities.length >= 3, 'Should extract names following honorifics and form labels');
  const values = entities.map(e => e.value);
  assert.ok(values.includes('Anita Desai'));
  assert.ok(values.includes('Arvind Swaminathan'));
  assert.ok(values.includes('Rajesh Mehra'));
});

test('Defense-in-depth Verifier Pass', () => {
  const text = 'Invoice for Mr. Rajesh Sharma, PAN: ABCPE1234F, Aadhaar: 9999 9999 0019.';
  const entities = runDeterministicDetectors(text);
  const { sanitizedText, placeholderMap, redactedEntities } = redactText(text, entities);

  const verifier = runVerifierPass({
    originalText: text,
    sanitizedText,
    placeholderMap,
    redactedEntities
  });

  assert.equal(verifier.passed, true);
  assert.equal(verifier.leakedEntities.length, 0);
  assert.equal(verifier.rawMatchesCount, 0);
  assert.equal(verifier.badge, 'outbound payload re-scanned: 0 sensitive matches');

  // Test failure case: artificially inject a raw Aadhaar number back into sanitized text
  const corruptedText = sanitizedText + ' Leaked: 999999990019';
  const failedVerifier = runVerifierPass({
    originalText: text,
    sanitizedText: corruptedText,
    placeholderMap,
    redactedEntities
  });
  assert.equal(failedVerifier.passed, false);
  assert.ok(failedVerifier.leakedEntities.length > 0);
});
