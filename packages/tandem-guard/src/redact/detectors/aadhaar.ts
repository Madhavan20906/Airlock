import { Entity } from '../../types.js';

// Verhoeff multiplication table (d)
const dTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];

// Verhoeff permutation table (p)
const pTable = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

/**
 * Validate 12-digit number against the Verhoeff checksum algorithm (D5 group)
 */
export function validateVerhoeff(numStr: string): boolean {
  const digits = numStr.replace(/\D/g, '');
  if (digits.length !== 12) return false;

  let c = 0;
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    const digit = parseInt(digits[len - 1 - i], 10);
    c = dTable[c][pTable[i % 8][digit]];
  }
  return c === 0;
}

/**
 * Normalizes common OCR character confusions:
 * 'O'/'o' -> '0', 'l'/'I'/'|' -> '1', 'S'/'s' -> '5', 'B' -> '8'
 */
function normalizeOcrDigits(raw: string): string {
  return raw
    .replace(/[Oo]/g, '0')
    .replace(/[lI|]/g, '1')
    .replace(/[Ss]/g, '5')
    .replace(/[B]/g, '8')
    .replace(/[\s\-]/g, '');
}

export function detectAadhaar(text: string): Entity[] {
  const entities: Entity[] = [];

  // Matches 12-digit numbers formatted as XXXX XXXX XXXX, XXXX-XXXX-XXXX, or contiguous XXXXXXXXXXXX
  // Also includes common OCR characters (O, o, l, I, S, B)
  const regex = /\b[2-9][0-9OlISB]{3}[\s\-]?[0-9OlISB]{4}[\s\-]?[0-9OlISB]{4}\b/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawVal = match[0];
    const normalizedDigits = normalizeOcrDigits(rawVal);

    if (normalizedDigits.length === 12 && validateVerhoeff(normalizedDigits)) {
      entities.push({
        type: 'AADHAAR',
        value: rawVal,
        span: [match.index, match.index + rawVal.length],
        confidence: /^[0-9\s\-]+$/.test(rawVal) ? 0.99 : 0.92,
        source: 'deterministic'
      });
    }
  }

  return entities;
}
