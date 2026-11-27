/**
 * Pre-detection normalisation. One output char per kept input char, so every
 * normalised index maps back to an exact original index (see indexMap).
 *
 *  1. Strip zero-width and bidi control characters (evasion).
 *  2. Fold every Unicode decimal digit (all 10 Indic scripts, Arabic-Indic, fullwidth) to ASCII.
 *  3. Per-character NFKC where it yields a single char (fullwidth letters, compatibility forms).
 *  4. Fold Cyrillic/Greek lookalikes to Latin (PAN/IFSC/GSTIN homoglyph attacks).
 */

// Zero code points of decimal digit blocks
const DIGIT_ZEROS = [
  0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0de6, 0xff10
];

const HOMOGLYPHS: Record<string, string> = {
  // Cyrillic capitals
  'А': 'A', 'В': 'B', 'С': 'C', 'Е': 'E', 'Н': 'H', 'І': 'I', 'Ј': 'J', 'К': 'K', 'М': 'M',
  'О': 'O', 'Р': 'P', 'Ѕ': 'S', 'Т': 'T', 'Х': 'X', 'У': 'Y',
  // Cyrillic lowercase that render like Latin
  'а': 'a', 'с': 'c', 'е': 'e', 'о': 'o', 'р': 'p', 'х': 'x', 'у': 'y', 'і': 'i', 'ј': 'j', 'ѕ': 's',
  // Greek capitals
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N',
  'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X'
};

const ZERO_WIDTH_REGEX = /[​-‍﻿‎‏‪-‮⁠-⁤­]/;

export interface NormalizedResult {
  normalizedText: string;
  /** Maps each index in normalizedText back to an index in the original text (plus an end sentinel). */
  indexMap: number[];
}

function foldChar(char: string): string {
  const cp = char.codePointAt(0)!;
  for (const z of DIGIT_ZEROS) {
    if (cp >= z && cp < z + 10) return String(cp - z);
  }
  const h = HOMOGLYPHS[char];
  if (h) return h;
  if (cp > 0x7f) {
    const n = char.normalize('NFKC');
    if (n.length === 1) return n;
  }
  return char;
}

export function normalizeInputText(originalText: string): NormalizedResult {
  const indexMap: number[] = [];
  const out: string[] = [];
  for (let i = 0; i < originalText.length; i++) {
    const char = originalText[i];
    if (ZERO_WIDTH_REGEX.test(char)) continue;
    out.push(foldChar(char));
    indexMap.push(i);
  }
  indexMap.push(originalText.length);
  return { normalizedText: out.join(''), indexMap };
}
