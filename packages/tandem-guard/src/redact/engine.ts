import { Entity, RedactionResult } from '../types.js';
import { runVerifierPass } from './verifier.js';

export function redactText(text: string, entities: Entity[]): RedactionResult {
  if (!entities.length) {
    const v = runVerifierPass({ originalText: text, sanitizedText: text, placeholderMap: new Map(), redactedEntities: [] });
    if (!v.passed) throw new Error(v.reason ?? 'verification failed');
    return { sanitizedText: text, placeholderMap: new Map(), redactedEntities: [], verifierPassed: true, verifierBadge: v.badge };
  }

  // Sort entities by start span ascending
  const sorted = [...entities].sort((a, b) => a.span[0] - b.span[0]);

  // Merge and deduplicate spans
  const nonOverlapping: Entity[] = [];
  let currentEnd = -1;
  for (const ent of sorted) {
    if (ent.span[0] >= currentEnd) {
      nonOverlapping.push(ent);
      currentEnd = ent.span[1];
    }
  }

  const placeholderMap = new Map<string, string>(); // placeholder -> original
  const entityTypeCounts = new Map<string, number>();
  const entityToPlaceholder = new Map<string, string>(); // original -> placeholder

  // Assign stable placeholders for identical entities
  for (const ent of nonOverlapping) {
    const key = `${ent.type}:${ent.value}`;
    if (!entityToPlaceholder.has(key)) {
      const count = (entityTypeCounts.get(ent.type) || 0) + 1;
      entityTypeCounts.set(ent.type, count);
      const placeholder = `[${ent.type}_${count}]`;
      entityToPlaceholder.set(key, placeholder);
      placeholderMap.set(placeholder, ent.value);
    }
  }

  // Build sanitized text from back to front to preserve span indexes
  let sanitized = text;
  for (let i = nonOverlapping.length - 1; i >= 0; i--) {
    const ent = nonOverlapping[i];
    const key = `${ent.type}:${ent.value}`;
    const placeholder = entityToPlaceholder.get(key)!;
    const [start, end] = ent.span;
    sanitized = sanitized.slice(0, start) + placeholder + sanitized.slice(end);
  }

  // Post-Redaction Defense-in-Depth Verifier Pass
  const verifierResult = runVerifierPass({
    originalText: text,
    sanitizedText: sanitized,
    placeholderMap,
    redactedEntities: nonOverlapping
  });

  if (!verifierResult.passed) {
    throw new Error(verifierResult.reason || 'Verification pass failed: sensitive entity leak detected in sanitized output.');
  }

  return {
    sanitizedText: sanitized,
    placeholderMap,
    redactedEntities: nonOverlapping,
    verifierPassed: verifierResult.passed,
    verifierBadge: verifierResult.badge
  };
}
