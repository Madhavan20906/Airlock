/**
 * Obfuscation-resistant detection (found and fixed via Leak Lab).
 *
 * Runs on already-normalised text (Indic/fullwidth digits folded, zero-width stripped,
 * homoglyphs folded). Catches structured identifiers that were deliberately broken up:
 *   - spaced / hyphenated / dotted / slash-separated characters ("4 9 2 8 ...", "BQKPS-4821-L")
 *   - identifiers split across a line break
 *   - digits spelled out as English words ("four nine two eight ...")
 *   - identifiers wrapped in base64
 * Spans returned are in the input (normalised) text coordinates.
 */
import { Entity, EntityType } from '../../types.js';
import { validateVerhoeff } from './aadhaar.js';
import { validateLuhn } from './card.js';

const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9'
};

interface Token { text: string; start: number; end: number; single: boolean; word: boolean }
interface Group { compact: string; map: number[]; ends: number[]; starts: Set<number>; stops: Set<number>; tokens: number; allSingle: boolean; hasNewline: boolean; start: number; end: number }

const TOKEN_RE = /[A-Za-z0-9]+/g;
const SEP_GAP_RE = /^[ \t\-. _/\n\r]{1,3}$/;

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    const raw = m[0];
    const num = NUMBER_WORDS[raw.toLowerCase()];
    if (num !== undefined) {
      out.push({ text: num, start: m.index, end: m.index + raw.length, single: true, word: true });
    } else {
      out.push({ text: raw, start: m.index, end: m.index + raw.length, single: raw.length === 1, word: false });
    }
  }
  return out;
}

/** Groups of tokens joined by short separator-only gaps, i.e. text that was split apart. */
function buildGroups(text: string, tokens: Token[]): Group[] {
  const groups: Group[] = [];
  let i = 0;
  while (i < tokens.length) {
    let j = i;
    let hasNewline = false;
    while (j + 1 < tokens.length) {
      const gap = text.slice(tokens[j].end, tokens[j + 1].start);
      if (!SEP_GAP_RE.test(gap)) break;
      if (gap.includes('\n')) hasNewline = true;
      j++;
    }
    const count = j - i + 1;
    if (count >= 3 || (count === 2 && hasNewline) || (count >= 2 && tokens.slice(i, j + 1).every(t => t.word))) {
      let compact = '';
      const map: number[] = [];
      const ends: number[] = [];
      const starts = new Set<number>();
      const stops = new Set<number>();
      for (let k = i; k <= j; k++) {
        const t = tokens[k];
        starts.add(compact.length);
        for (let c = 0; c < t.text.length; c++) {
          compact += t.text[c];
          // Map each compact char to its source span; spelled words map whole-word
          map.push(t.word ? t.start : t.start + c);
          ends.push(t.word ? t.end : t.start + c + 1);
        }
        stops.add(compact.length);
      }
      groups.push({
        compact, map, ends, starts, stops, tokens: count, hasNewline, start: tokens[i].start, end: tokens[j].end,
        allSingle: tokens.slice(i, j + 1).every(t => t.single)
      });
    }
    i = j + 1;
  }
  return groups;
}

const ACCOUNT_CONTEXT = /\b(a\/c|acct|account|bank|beneficiary|salary|savings)\b/i;
const PHONE_CONTEXT = /\b(mobile|phone|ph|cell|call|whatsapp|contact|tel)\b/i;

function pushFromGroup(out: Entity[], g: Group, type: EntityType, cStart: number, cEnd: number, confidence: number, text: string) {
  const start = g.map[cStart];
  const end = g.ends[cEnd - 1];
  out.push({ type, value: text.slice(start, end), span: [start, end], confidence, source: 'deterministic' });
}

function scanGroup(g: Group, text: string, out: Entity[]) {
  const upper = g.compact.toUpperCase();
  const before = text.slice(Math.max(0, g.start - 48), g.start + 1) + text.slice(g.start, g.end);
  const taken: Array<[number, number]> = [];
  const free = (s: number, e: number) => taken.every(([a, b]) => e <= a || s >= b);
  const take = (type: EntityType, s: number, e: number, conf: number): boolean => {
    // Only accept matches aligned to token boundaries, so merged words cannot form an identifier
    if (!g.starts.has(s) || !g.stops.has(e) || !free(s, e)) return false;
    // Must actually be split: an unbroken single token is the primary detectors' job
    let split = false;
    for (const k of g.starts) if (k > s && k < e) { split = true; break; }
    if (!split) return false;
    taken.push([s, e]);
    pushFromGroup(out, g, type, s, e, conf, text);
    return true;
  };

  for (const [re, type] of [
    [/\d{2}[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]/g, 'GSTIN'],
    [/[A-Z]{3}[PCHFATBLJG][A-Z]\d{4}[A-Z]/g, 'PAN'],
    [/[A-Z]{4}0[A-Z0-9]{6}/g, 'ACCOUNT'] // IFSC is reported as ACCOUNT, matching bank.ts
  ] as Array<[RegExp, EntityType]>) {
    for (let s = 0; s < upper.length; s++) {
      if (!g.starts.has(s)) continue;
      re.lastIndex = s;
      const mm = re.exec(upper);
      if (mm && mm.index === s) take(type, s, s + mm[0].length, 0.95);
    }
  }

  // Digit runs inside the compact string
  const runRe = /\d+/g;
  let m: RegExpExecArray | null;
  while ((m = runRe.exec(g.compact)) !== null) {
    const run = m[0];
    const s = m.index;
    const srcStart = g.map[s];
    const intl = /\+\s*$/.test(text.slice(Math.max(0, srcStart - 2), srcStart));
    if (intl && run.length >= 10 && run.length <= 13) { take('PHONE', s, s + run.length, 0.9); continue; }
    if (run.length === 12 && /^[2-9]/.test(run) && validateVerhoeff(run) && take('AADHAAR', s, s + 12, 0.97)) continue;
    if (run.length >= 13 && run.length <= 19 && validateLuhn(run) && take('CARD', s, s + run.length, 0.95)) continue;
    const phone = /^(?:91)?[6-9]\d{9}$/.test(run);
    if (phone && (g.allSingle || PHONE_CONTEXT.test(before))) { take('PHONE', s, s + run.length, 0.9); continue; }
    if (run.length >= 9 && run.length <= 18 && (g.allSingle || ACCOUNT_CONTEXT.test(before) || g.hasNewline)) {
      take('ACCOUNT', s, s + run.length, 0.85);
    }
  }
}

const B64_RE = /[A-Za-z0-9+/]{12,}={0,2}/g;

function decodeBase64(s: string): string | null {
  if (s.replace(/=+$/, '').length % 4 === 1) return null;
  try {
    const bin = atob(s);
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
    // Require mostly printable output so ordinary words are not mistaken for base64
    const printable = decoded.replace(/[^\x20-\x7E]/g, '').length;
    return printable / Math.max(1, decoded.length) > 0.9 ? decoded : null;
  } catch {
    return null;
  }
}

/**
 * @param detectPlain detector for plain text, used on base64-decoded payloads (no recursion)
 */
export function detectObfuscatedIdentifiers(text: string, detectPlain?: (s: string) => Entity[]): Entity[] {
  const out: Entity[] = [];
  for (const g of buildGroups(text, tokenize(text))) scanGroup(g, text, out);

  if (detectPlain) {
    let m: RegExpExecArray | null;
    B64_RE.lastIndex = 0;
    while ((m = B64_RE.exec(text)) !== null) {
      const decoded = decodeBase64(m[0]);
      if (!decoded) continue;
      const inner = detectPlain(decoded);
      if (inner.length) {
        out.push({ type: inner[0].type, value: m[0], span: [m.index, m.index + m[0].length], confidence: 0.9, source: 'deterministic' });
      }
    }
  }
  return out;
}
