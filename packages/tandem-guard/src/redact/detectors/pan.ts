import { Entity } from '../../types.js';

const VALID_PAN_FOURTH_CHARS = new Set(['P', 'C', 'H', 'F', 'A', 'T', 'B', 'L', 'J', 'G']);

export function validatePAN(pan: string): boolean {
  const cleaned = pan.toUpperCase().replace(/[\s\-]/g, '');
  if (cleaned.length !== 10) return false;

  // Pattern: 5 letters, 4 digits, 1 letter
  if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleaned)) return false;

  const fourthChar = cleaned[3];
  return VALID_PAN_FOURTH_CHARS.has(fourthChar);
}

export function detectPAN(text: string): Entity[] {
  const entities: Entity[] = [];

  // Matches 5 letters, optional space/dash, 4 digits, optional space/dash, 1 letter
  // Case-insensitive
  const regex = /\b([a-zA-Z]{5})[\s\-]?([0-9]{4})[\s\-]?([a-zA-Z])\b/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawVal = match[0];
    if (validatePAN(rawVal)) {
      entities.push({
        type: 'PAN',
        value: rawVal,
        span: [match.index, match.index + rawVal.length],
        confidence: 0.98,
        source: 'deterministic'
      });
    }
  }

  return entities;
}
