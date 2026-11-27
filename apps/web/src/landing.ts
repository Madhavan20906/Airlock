import '@fontsource/ibm-plex-sans/400.css';
import '@fontsource/ibm-plex-sans/500.css';
import '@fontsource/ibm-plex-sans/600.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

const reveals: Element[] = [];
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (e.isIntersecting) { e.target.classList.add('in-view'); io.unobserve(e.target); }
  }
}, { threshold: 0.08, rootMargin: '0px 0px -40px 0px' });

let stagger = 0;
document.querySelectorAll('section, .card, .stat, .lane, .compare__row, .faq-q, .faq-a').forEach((el) => {
  el.classList.add('reveal');
  const parent = el.closest('.stats, .faq, .compare, .duo-cards, .guard-demo, .lanes');
  if (parent) { (el as HTMLElement).style.setProperty('--d', `${stagger * 80}ms`); stagger++; }
  reveals.push(el);
  io.observe(el);
});

setTimeout(() => { for (const el of reveals) el.classList.add('in-view'); }, 1500);

const counterIo = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    counterIo.unobserve(e.target);
    const el = e.target as HTMLElement;
    const text = el.textContent || '';
    const match = text.match(/^([\d.]+)(%|s| ms)?/);
    if (!match) continue;
    const end = parseFloat(match[1]);
    const suffix = match[2] || '';
    const rest = text.slice(match[0].length);
    const duration = 1400;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 4);
      const val = end * ease;
      el.textContent = (Number.isInteger(end) ? Math.round(val).toString() : val.toFixed(1)) + suffix + rest;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
}, { threshold: 0.5 });

document.querySelectorAll('#results .t-stat').forEach(el => counterIo.observe(el));

document.querySelectorAll('.hero [data-step]').forEach((el, i) => {
  (el as HTMLElement).style.animationDelay = `${0.6 + i * 0.5}s`;
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Tab') document.documentElement.classList.add('using-keyboard');
});
document.addEventListener('mousedown', () => document.documentElement.classList.remove('using-keyboard'));

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
    out += `<mark class="gtok">${tag}</mark>`;
    pos = r.end;
  }
  out += escHtml(text.slice(pos));
  return { html: out, found };
}

const guardInput  = document.getElementById('guard-input')  as HTMLTextAreaElement | null;
const guardOut    = document.getElementById('guard-out')    as HTMLElement | null;
const guardTags   = document.getElementById('guard-tags')   as HTMLElement | null;

if (guardInput && guardOut) {
  const idle = `<span class="guard-scanner__idle"><span class="guard-scanner__dot"></span>Waiting for input…</span>`;
  let scanTid = 0;
  guardInput.addEventListener('input', () => {
    clearTimeout(scanTid);
    scanTid = window.setTimeout(() => {
      const text = guardInput.value.trim();
      if (!text) { guardOut.innerHTML = idle; if (guardTags) guardTags.innerHTML = ''; return; }
      const { html: highlighted, found } = scanText(text);
      guardOut.innerHTML = `<pre class="guard-scanner__pre">${highlighted}</pre>`;
      if (guardTags) {
        const uniq = [...new Set(found)];
        guardTags.innerHTML = uniq.length
          ? uniq.map(n => `<span class="guard-tag">${n}</span>`).join('')
          : `<span class="guard-tag guard-tag--clean">No identifiers found</span>`;
      }
    }, 120);
  });
}

const nav = document.querySelector('.nav') as HTMLElement;
if (nav) {
  let last = 0;
  window.addEventListener('scroll', () => {
    const y = window.scrollY;
    nav.classList.toggle('nav--scrolled', y > 60);
    nav.classList.toggle('nav--hidden', y > 400 && y > last);
    last = y;
  }, { passive: true });
}

document.querySelectorAll<HTMLAnchorElement>('.nav__link[href^="#"]').forEach(a => {
  a.addEventListener('click', (e) => {
    const target = document.querySelector(a.getAttribute('href')!);
    if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  });
});
