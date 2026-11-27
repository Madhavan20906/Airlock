import { Entity } from '../types.js';
import { runDeterministicDetectors } from './deterministic.js';

export interface VerifierOptions {
  originalText: string;
  sanitizedText: string;
  placeholderMap: Map<string, string>;
  redactedEntities: Entity[];
}

export interface VerifierResult {
  passed: boolean;
  leakedEntities: Entity[];
  rawMatchesCount: number;
  badge: string;
  reason?: string;
}

/**
 * Defense-in-depth Verifier Pass:
 * Verifies that outbound sanitized payload contains zero surviving sensitive tokens,
 * zero valid checksums, and zero unredacted PII values.
 */
export function runVerifierPass(options: VerifierOptions): VerifierResult {
  const { sanitizedText, placeholderMap } = options;

  // 1. Re-run Layer A deterministic detectors on the sanitized text
  const surviving = runDeterministicDetectors(sanitizedText);
  const sensitiveLeaks: Entity[] = [];

  for (const ent of surviving) {
    // If a detected entity value matches a known placeholder like [AADHAAR_1], it is benign
    if (/^\[[A-Z0-9_]+\]$/.test(ent.value)) {
      continue;
    }
    sensitiveLeaks.push(ent);
  }

  // 2. Direct string containment check: ensure no original sensitive string survived
  let rawMatchCount = 0;
  for (const [placeholder, originalVal] of placeholderMap.entries()) {
    const trimmed = originalVal.trim();
    if (trimmed.length < 3) continue;

    // Check if original sensitive value appears verbatim outside of a placeholder
    if (sanitizedText.includes(trimmed)) {
      rawMatchCount++;
      sensitiveLeaks.push({
        type: (placeholder.replace(/[\[\]_0-9]/g, '') || 'PERSON') as any,
        value: trimmed,
        span: [sanitizedText.indexOf(trimmed), sanitizedText.indexOf(trimmed) + trimmed.length],
        confidence: 1.0,
        source: 'deterministic'
      });
    }
  }

  // 3. Unredacted Long Digit Guard (Defense-in-depth against leaked account numbers/IDs)
  const survivingDigitsRegex = /\b(\d{9,18})\b/g;
  let digitMatch: RegExpExecArray | null;
  while ((digitMatch = survivingDigitsRegex.exec(sanitizedText)) !== null) {
    const matchedNumber = digitMatch[1];
    const matchIndex = digitMatch.index;
    const windowStart = Math.max(0, matchIndex - 60);
    const windowEnd = Math.min(sanitizedText.length, matchIndex + matchedNumber.length + 60);
    const contextWindow = sanitizedText.substring(windowStart, windowEnd);

    // If context window contains financial/account references, flag as a leak
    if (/(?:account|a\/c|acct|salary|savings|current|settlement|beneficiary|bank|deposit|ifsc|wire|\bnumber\b)/i.test(contextWindow)) {
      // Check if already in sensitiveLeaks
      if (!sensitiveLeaks.some(e => e.value === matchedNumber)) {
        sensitiveLeaks.push({
          type: 'ACCOUNT',
          value: matchedNumber,
          span: [matchIndex, matchIndex + matchedNumber.length],
          confidence: 0.99,
          source: 'deterministic'
        });
      }
    }
  }

  const passed = sensitiveLeaks.length === 0 && rawMatchCount === 0;

  return {
    passed,
    leakedEntities: sensitiveLeaks,
    rawMatchesCount: rawMatchCount,
    badge: passed
      ? 'outbound payload re-scanned: 0 sensitive matches'
      : `outbound verification failed: ${sensitiveLeaks.length} potential leaks detected`,
    reason: passed
      ? undefined
      : `Sanitized text failed verification pass: ${sensitiveLeaks.map(e => `${e.type} (${e.value})`).join(', ')}`
  };
}
