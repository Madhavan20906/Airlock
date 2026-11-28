import './styles/app.css';
import './styles/screens.css';
import './styles/slips-notes.css';
import './styles/plates.css';
import './styles/misc.css';
import './styles/review-fixes.css';
import './styles/landing.css';
import { initTheme, toggleTheme } from './ui/theme.js';

initTheme();
document.addEventListener('click', e => { if ((e.target as Element).closest('[data-theme-toggle]')) toggleTheme(); });

// ── Live Guard scanner ───────────────────────────────────────────────────────
// Lightweight standalone detectors — no dependency on @tandem/guard bundle
const SCAN_DETECTORS: Array<{ name: string; re: RegExp }> = [
  { name: 'PAN',     re: /\b[A-Z]{5}[0-9]{4}[A-Z]\b/g },
  { name: 'AADHAAR', re: /\b\d{4}[\s ]?\d{4}[\s ]?\d{4}\b/g },
  { name: 'GSTIN',   re: /\b\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]\b/g },
  { name: 'IFSC',    re: /\b[A-Z]{4}0[A-Z0-9]{6}\b/g },
  { name: 'MOBILE',  re: /\b(?:\+91[\s\-]?)?[6-9]\d{9}\b/g },
];

function escHtml(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function scanText(text: string) {
  type Rng = { start: number; end: number; name: string };
  const ranges: Rng[] = [];
  for (const det of SCAN_DETECTORS) {
    det.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = det.re.exec(text)) !== null) {
      ranges.push({ start: m.index, end: m.index + m[0].length, name: det.name });
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  const deduped: Rng[] = [];
  let last = 0;
  for (const r of ranges) { if (r.start >= last) { deduped.push(r); last = r.end; } }

  if (!deduped.length) return { html: escHtml(text), found: [] };
  let out = '';
  let pos = 0;
  const counters: Record<string, number> = {};
  const found: string[] = [];
  for (const r of deduped) {
    counters[r.name] = (counters[r.name] ?? 0) + 1;
    const tag = `${r.name}_${counters[r.name]}`;
    found.push(r.name);
    out += escHtml(text.slice(pos, r.start));
    out += `<mark>${tag}</mark>`;
    pos = r.end;
  }
  out += escHtml(text.slice(pos));
  return { html: out, found };
}

const guardInput = document.getElementById('guard-input') as HTMLTextAreaElement | null;
const guardOut = document.getElementById('guard-out') as HTMLElement | null;
const guardTags = document.getElementById('guard-tags') as HTMLElement | null;
if (guardInput && guardOut) {
  let tid = 0;
  guardInput.addEventListener('input', () => {
    clearTimeout(tid);
    tid = window.setTimeout(() => {
      const text = guardInput.value.trim();
      if (!text) { guardOut.innerHTML = '<span class="meta">Waiting for input.</span>'; if (guardTags) guardTags.innerHTML = ''; return; }
      const { html, found } = scanText(text);
      guardOut.innerHTML = '<pre class="lp-code">' + html + '</pre>';
      if (guardTags) guardTags.innerHTML = [...new Set(found)].map(n => '<span class="chip">' + n + '</span>').join('') || '<span class="meta">No identifiers found by the preview patterns.</span>';
    }, 120);
  });
}
