/**
 * Deterministic validators. Each returns a score in 0..1 and pass/fail.
 * A task passes only if every validator passes. Validators are also the router's
 * quality-escalation triggers (see escalationTrigger()).
 */
import type { EscalationTrigger } from '@tandem/policy';

export type Validator =
  | { kind: 'exact'; value: string }
  | { kind: 'contains'; values: string[]; mode?: 'all' | 'any' }
  | { kind: 'json_schema'; required: Record<string, 'string' | 'number' | 'boolean' | 'array'>; enums?: Record<string, string[]> }
  | { kind: 'field_f1'; expected: Record<string, string | number>; threshold?: number }
  | { kind: 'required_facts'; facts: string[]; threshold?: number }
  | { kind: 'max_len'; words: number }
  | { kind: 'min_len'; words: number }
  | { kind: 'script_present'; script: IndicScript; minRatio?: number }
  | { kind: 'bullets'; count: number; maxWords?: number }
  | { kind: 'no_refusal' };

export type IndicScript = 'Devanagari' | 'Tamil' | 'Bengali' | 'Telugu' | 'Gujarati' | 'Kannada' | 'Malayalam';

export interface ValidatorResult { kind: Validator['kind']; score: number; passed: boolean; detail?: string }
export interface ValidationReport { passed: boolean; quality: number; results: ValidatorResult[]; failedTriggers: EscalationTrigger[] }

const DIGIT_ZEROS = [0x0660, 0x06f0, 0x0966, 0x09e6, 0x0a66, 0x0ae6, 0x0b66, 0x0be6, 0x0c66, 0x0ce6, 0x0d66, 0x0de6, 0xff10];

/** Lowercase, fold Unicode digits to ASCII, drop thousands separators, collapse whitespace and punctuation. */
export function norm(s: string): string {
  let out = '';
  for (const ch of s.normalize('NFKC')) {
    const cp = ch.codePointAt(0)!;
    const z = DIGIT_ZEROS.find(z => cp >= z && cp < z + 10);
    out += z === undefined ? ch : String(cp - z);
  }
  return out
    .toLowerCase()
    .replace(/(\d)[,٬](?=\d)/g, '$1')
    .replace(/[^\p{L}\p{M}\p{N}@.]+/gu, ' ')
    .replace(/\.(?!\d)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** First balanced JSON object in the text (tolerates ``` fences and prose around it). */
export function extractJson(text: string): any | undefined {
  const s = text.replace(/```(?:json)?/gi, '');
  for (let i = s.indexOf('{'); i !== -1; i = s.indexOf('{', i + 1)) {
    let depth = 0, inStr = false, esc = false;
    for (let j = i; j < s.length; j++) {
      const c = s[j];
      if (inStr) { if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(s.slice(i, j + 1)); } catch { break; }
      }
    }
  }
  return undefined;
}

const REFUSAL = /\b(i\s*(?:can(?:no|')t|am\s+(?:not\s+able|unable)|won'?t)\s+(?:help|assist|do|provide|comply|translate|answer)|as an ai\b|i'?m sorry,? but|i apologi[sz]e,? but|cannot (?:fulfil|fulfill|comply))/i;

const SCRIPT_RANGES: Record<IndicScript, [number, number]> = {
  Devanagari: [0x0900, 0x097f], Bengali: [0x0980, 0x09ff], Gujarati: [0x0a80, 0x0aff], Tamil: [0x0b80, 0x0bff],
  Telugu: [0x0c00, 0x0c7f], Kannada: [0x0c80, 0x0cff], Malayalam: [0x0d00, 0x0d7f]
};

function typeOk(v: unknown, t: string): boolean {
  if (t === 'array') return Array.isArray(v);
  if (t === 'number') return typeof v === 'number' || (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v.replace(/[,\s]/g, ''))));
  return typeof v === t;
}

export function runValidator(v: Validator, output: string): ValidatorResult {
  const out = output ?? '';
  switch (v.kind) {
    case 'exact': {
      const ok = norm(out) === norm(v.value);
      return { kind: v.kind, score: ok ? 1 : 0, passed: ok };
    }
    case 'contains': {
      const n = norm(out);
      const hits = v.values.filter(x => n.includes(norm(x))).length;
      const ok = v.mode === 'any' ? hits > 0 : hits === v.values.length;
      return { kind: v.kind, score: v.values.length ? hits / v.values.length : 1, passed: ok };
    }
    case 'json_schema': {
      const j = extractJson(out);
      if (!j || typeof j !== 'object' || Array.isArray(j)) return { kind: v.kind, score: 0, passed: false, detail: 'no JSON object' };
      const keys = Object.entries(v.required);
      let good = 0;
      for (const [k, t] of keys) {
        const val = j[k];
        const enumOk = !v.enums?.[k] || v.enums[k].map(norm).includes(norm(String(val)));
        if (val !== undefined && val !== null && typeOk(val, t) && enumOk) good++;
      }
      const score = keys.length ? good / keys.length : 1;
      return { kind: v.kind, score, passed: score === 1 };
    }
    case 'field_f1': {
      const j = extractJson(out) ?? {};
      const exp = Object.entries(v.expected);
      const got = Object.keys(j).length;
      let tp = 0;
      for (const [k, e] of exp) {
        const g = j[k];
        if (g === undefined || g === null) continue;
        const ge = norm(String(g)), ee = norm(String(e));
        const numEq = Number(ge.replace(/\s/g, '')) === Number(ee.replace(/\s/g, '')) && ee.replace(/\s/g, '') !== '' && !Number.isNaN(Number(ee.replace(/\s/g, '')));
        if (ge === ee || numEq || (ee.length > 3 && ge.includes(ee))) tp++;
      }
      const precision = got ? tp / Math.max(got, tp) : 0;
      const recall = exp.length ? tp / exp.length : 1;
      const f1 = precision + recall ? (2 * precision * recall) / (precision + recall) : 0;
      return { kind: v.kind, score: f1, passed: f1 >= (v.threshold ?? 0.8) };
    }
    case 'required_facts': {
      const n = norm(out);
      const hits = v.facts.filter(f => n.includes(norm(f))).length;
      const score = v.facts.length ? hits / v.facts.length : 1;
      return { kind: v.kind, score, passed: score >= (v.threshold ?? 1) };
    }
    case 'max_len': {
      const w = words(out);
      return { kind: v.kind, score: w <= v.words ? 1 : Math.max(0, 1 - (w - v.words) / v.words), passed: w <= v.words && w > 0, detail: `${w} words` };
    }
    case 'min_len': {
      const w = words(out);
      return { kind: v.kind, score: Math.min(1, w / v.words), passed: w >= v.words, detail: `${w} words` };
    }
    case 'script_present': {
      const [lo, hi] = SCRIPT_RANGES[v.script];
      const letters = [...out].filter(c => /\p{L}|\p{M}/u.test(c));
      const inScript = letters.filter(c => { const cp = c.codePointAt(0)!; return cp >= lo && cp <= hi; }).length;
      const ratio = letters.length ? inScript / letters.length : 0;
      return { kind: v.kind, score: ratio, passed: ratio >= (v.minRatio ?? 0.6), detail: `${Math.round(ratio * 100)}% ${v.script}` };
    }
    case 'bullets': {
      const lines = out.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      const bullets = lines.filter(l => /^([-*•]|\d+[.)])\s+/.test(l));
      const okCount = bullets.length === v.count && lines.length === bullets.length;
      const okWords = !v.maxWords || bullets.every(b => words(b.replace(/^([-*•]|\d+[.)])\s+/, '')) <= v.maxWords!);
      return { kind: v.kind, score: (okCount ? 0.5 : 0) + (okWords && bullets.length ? 0.5 : 0), passed: okCount && okWords, detail: `${bullets.length}/${lines.length} bullet lines` };
    }
    case 'no_refusal': {
      const empty = out.trim().length === 0;
      const refused = REFUSAL.test(out);
      return { kind: v.kind, score: empty || refused ? 0 : 1, passed: !empty && !refused, detail: empty ? 'empty output' : refused ? 'refusal' : undefined };
    }
  }
}

export function escalationTrigger(kind: Validator['kind']): EscalationTrigger {
  switch (kind) {
    case 'exact': case 'json_schema': case 'field_f1': case 'bullets': return 'schema';
    case 'max_len': case 'min_len': return 'length';
    case 'no_refusal': return 'refusal';
    default: return 'required_facts';
  }
}

export function validate(validators: Validator[], output: string): ValidationReport {
  const results = validators.map(v => runValidator(v, output));
  const failedTriggers = [...new Set(results.filter(r => !r.passed).map(r => escalationTrigger(r.kind)))];
  return {
    passed: results.every(r => r.passed),
    quality: results.length ? results.reduce((a, r) => a + r.score, 0) / results.length : 0,
    results,
    failedTriggers
  };
}
