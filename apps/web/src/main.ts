import './styles/app.css';
import { html, $ } from './ui/dom.js';
import { icon, brandMark } from './ui/icons.js';
import { pill } from './ui/components.js';
import { tandem } from './services/tandem.js';
import { firebase } from './services/firebase.js';

export interface Screen { title: string; crumb: string; render(root: HTMLElement): void | (() => void) }

const routes: Record<string, () => Promise<{ default: Screen }>> = {
  '': () => import('./screens/home.js'),
  start: () => import('./screens/start.js'),
  device: () => import('./screens/device.js'),
  probe: () => import('./screens/probe.js'),
  frontier: () => import('./screens/frontier.js'),
  policy: () => import('./screens/policy.js'),
  atlas: () => import('./screens/atlas.js'),
  receipts: () => import('./screens/receipts.js'),
  guard: () => import('./screens/guard.js')
};

const NAV: Array<{ group?: string; id?: string; label?: string; icon?: string; step?: string; href?: string }> = [
  { id: '', label: 'Overview', icon: 'home' },
  { id: 'start', label: 'Judge quick start', icon: 'compass' },
  { group: 'Measure' },
  { id: 'device', label: 'Device check', icon: 'gauge' },
  { id: 'probe', label: 'Probe', icon: 'race', step: '01' },
  { id: 'frontier', label: 'Frontier', icon: 'frontier', step: '02' },
  { id: 'policy', label: 'Policy', icon: 'policy', step: '03' },
  { id: 'atlas', label: 'Hybrid Atlas', icon: 'globe', step: '04' },
  { group: 'Use' },
  { href: '/notes/', label: 'Tandem Notes', icon: 'notes' },
  { id: 'receipts', label: 'Receipts', icon: 'receipt' },
  { id: 'guard', label: 'Guard Lab', icon: 'shield' }
];

// ── Command palette ──────────────────────────────────────────────────────────
const PALETTE: Array<{ label: string; desc: string; icon: string; id?: string; href?: string }> = [
  { label: 'Overview',         desc: 'Start page with quick links',                icon: 'home',    id: '' },
  { label: 'Judge quick start',desc: 'Step-by-step guide for evaluators',          icon: 'compass', id: 'start' },
  { label: 'Device check',     desc: 'Gemini Nano availability on this device',    icon: 'gauge',   id: 'device' },
  { label: 'Probe',            desc: 'Race tasks on both models in real time',     icon: 'race',    id: 'probe' },
  { label: 'Frontier',         desc: 'Measured pass-rate chart by task type',      icon: 'frontier',id: 'frontier' },
  { label: 'Policy',           desc: '24 evidence-backed routing rules',           icon: 'policy',  id: 'policy' },
  { label: 'Hybrid Atlas',     desc: 'On-device vs cloud comparison map',          icon: 'globe',   id: 'atlas' },
  { label: 'Receipts',         desc: 'SHA-256 hash-chained routing history',       icon: 'receipt', id: 'receipts' },
  { label: 'Guard Lab',        desc: 'Test identifier detection in real time',     icon: 'shield',  id: 'guard' },
  { label: 'Tandem Notes',     desc: 'Local-first AI notes app with routing',      icon: 'notes',   href: '/notes/' },
];

let _plOpen = false;
let _plIdx  = 0;
let _plQ    = '';

function _plFiltered() {
  const q = _plQ.toLowerCase();
  return q ? PALETTE.filter(i => i.label.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q)) : PALETTE;
}

function _plHtml() {
  const items = _plFiltered();
  const idx = Math.min(_plIdx, Math.max(items.length - 1, 0));
  return html`<div class="pl-scrim" id="pl-scrim"><div class="pl" role="dialog" aria-modal="true" aria-label="Go to screen">
    <div class="pl-bar">
      ${icon('search')}
      <input class="pl-input" id="pl-q" type="text" placeholder="Go to…" value="${_plQ}" autocomplete="off" spellcheck="false">
      <span class="pl-esc">Esc</span>
    </div>
    <ul class="pl-list" role="listbox" aria-label="Screens">
      ${items.length
        ? items.map((it, i) => html`<li class="pl-row ${i === idx ? 'pl-sel' : ''}" role="option" aria-selected="${i === idx}" data-pi="${i}">
            <span class="pl-ic">${icon(it.icon)}</span>
            <span class="pl-info"><b class="pl-name">${it.label}</b><span class="pl-desc">${it.desc}</span></span>
            <kbd class="pl-enter">↵</kbd>
          </li>`)
        : html`<li class="pl-empty">No results for "<em>${_plQ}</em>"</li>`}
    </ul>
    <div class="pl-foot">
      <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
      <span><kbd>↵</kbd> open</span>
      <span><kbd>Esc</kbd> close</span>
      <span class="pl-brand">Tandem Studio</span>
    </div>
  </div></div>`;
}

function _plOpen_() {
  if (_plOpen) return;
  _plOpen = true; _plIdx = 0; _plQ = '';
  const m = document.createElement('div');
  m.id = 'pl-mount'; m.innerHTML = _plHtml().html;
  document.body.appendChild(m);
  requestAnimationFrame(() => { ($('#pl-q') as HTMLInputElement)?.focus(); });
}
function _plClose() { _plOpen = false; document.getElementById('pl-mount')?.remove(); }
function _plRepaint() {
  const m = $('#pl-mount'); if (!m) return;
  m.innerHTML = _plHtml().html;
  const inp = $('#pl-q') as HTMLInputElement;
  if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
function _plGo(item: (typeof PALETTE)[0]) {
  _plClose();
  if (item.href) location.href = item.href;
  else location.hash = `#/${item.id}`;
}

function initPalette() {
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault(); _plOpen ? _plClose() : _plOpen_(); return;
    }
    if (!_plOpen) return;
    const items = _plFiltered();
    if (e.key === 'Escape') { _plClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); _plIdx = Math.min(_plIdx + 1, items.length - 1); _plRepaint(); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); _plIdx = Math.max(_plIdx - 1, 0);               _plRepaint(); return; }
    if (e.key === 'Enter')     { e.preventDefault(); const it = items[Math.min(_plIdx, items.length - 1)]; if (it) _plGo(it); return; }
  });
  document.addEventListener('input', e => {
    if (!_plOpen) return;
    const t = e.target as HTMLInputElement;
    if (t.id === 'pl-q') { _plQ = t.value; _plIdx = 0; _plRepaint(); }
  });
  document.addEventListener('click', e => {
    if (!_plOpen) return;
    const t = e.target as HTMLElement;
    if (t.closest('#pl-scrim') && !t.closest('.pl')) { _plClose(); return; }
    const row = t.closest('[data-pi]') as HTMLElement | null;
    if (row) { const it = _plFiltered()[parseInt(row.dataset.pi!)]; if (it) _plGo(it); }
  });
  // "Go to…" button in the rail
  document.addEventListener('click', e => {
    if ((e.target as Element).closest('#palette-open')) _plOpen_();
  });
}

// ── Core ─────────────────────────────────────────────────────────────────────
function currentId() { return location.hash.replace(/^#\/?/, '').split('?')[0]; }

function navHtml(cls: 'nav' | 'mobile-nav') {
  const id = currentId();
  return NAV.map(n => {
    if (n.group) return cls === 'nav' ? html`<div class="nav-group">${n.group}</div>` : '';
    const href = n.href ?? `#/${n.id}`;
    const cur = n.id !== undefined && n.id === id ? 'page' : null;
    return html`<a href="${href}" ${cur ? html`aria-current="page"` : ''}>${icon(n.icon!)}<span>${cls === 'mobile-nav' ? n.label!.replace('Judge quick start', 'Start').replace('Tandem Notes', 'Notes').replace('Device check', 'Device').replace('Hybrid Atlas', 'Atlas') : n.label}</span>${n.step && cls === 'nav' ? html`<span class="step">${n.step}</span>` : ''}</a>`;
  });
}

function statusStrip() {
  const c = tandem.capability;
  const dev = c.state === 'available' ? pill('On-device ready', 'local')
    : c.state === 'downloadable' ? pill('On-device: download needed', 'warn')
    : c.state === 'downloading'  ? pill('On-device: downloading', 'warn')
    : c.state === 'unavailable'  ? pill('On-device unavailable', 'bad')
    : pill('No on-device API', '');
  const cloud = !firebase.configured ? pill('Cloud not configured', 'bad')
    : firebase.settings.killSwitchCloud ? pill('Cloud paused (kill switch)', 'bad')
    : firebase.appCheckMode === 'none'  ? pill('Cloud: App Check missing', 'warn')
    : pill(`Cloud · App Check ${firebase.appCheckMode === 'debug' ? '(dev)' : 'on'}`, 'cloud');
  const net = tandem.online ? '' : pill('Offline', 'warn');
  const p = tandem.policy;
  const src = tandem.policySource === 'remote-config' ? 'Remote Config' : tandem.policySource === 'my-compiled' ? 'your probe' : 'built-in default';
  return html`${dev}${cloud}${net}<span class="pill"><span class="dot"></span>Policy v${p.version} · ${src}</span>`;
}

function themeToggle() {
  const pref = (() => { try { return localStorage.getItem('tandem-theme-pref') ?? 'system'; } catch { return 'system'; } })();
  return html`<div class="theme-seg" id="theme" role="group" aria-label="Colour theme">
    <span class="ts-pill" aria-hidden="true"></span>
    <button class="ts-btn ${pref === 'light'  ? 'ts-on' : ''}" data-t="light"  title="Light theme">${icon('sun')}<span class="ts-label">Light</span></button>
    <button class="ts-btn ${pref === 'system' ? 'ts-on' : ''}" data-t="system" title="Follow system preference">${icon('spark')}<span class="ts-label">Auto</span></button>
    <button class="ts-btn ${pref === 'dark'   ? 'ts-on' : ''}" data-t="dark"   title="Dark theme">${icon('moon')}<span class="ts-label">Dark</span></button>
  </div>`;
}

function snapThemePills() {
  document.querySelectorAll<HTMLElement>('.theme-seg').forEach(seg => {
    const pill   = seg.querySelector<HTMLElement>('.ts-pill');
    const active = seg.querySelector<HTMLElement>('.ts-btn.ts-on');
    if (!pill || !active) return;
    pill.style.transition = 'none';
    const sr = seg.getBoundingClientRect(), br = active.getBoundingClientRect();
    pill.style.width     = `${br.width}px`;
    pill.style.height    = `${br.height}px`;
    pill.style.transform = `translateX(${br.left - sr.left}px)`;
    requestAnimationFrame(() => { pill.style.transition = ''; });
  });
}

function shell() {
  const app = document.getElementById('app')!;
  app.innerHTML = html`
    <div class="mobile-bar"><a class="brand" href="#/" style="padding:0">${brandMark}<span class="brand-name">Tandem</span></a><div id="theme-m"></div></div>
    <div class="shell">
      <aside class="rail" aria-label="Primary">
        <a class="brand" href="#/">${brandMark}<span><span class="brand-name">Tandem</span><br><span class="brand-sub">measure, don't guess</span></span></a>
        <nav class="nav" id="nav">${navHtml('nav')}</nav>
        <div class="rail-foot">
          <button class="palette-trigger" id="palette-open">${icon('search')}<span>Go to…</span><kbd>⌘K</kbd></button>
          <div id="theme-d"></div>
          <div class="faint" style="font-size:11.5px">Firebase AI Logic hybrid · Gemini Nano on-device · nothing simulated</div>
        </div>
      </aside>
      <main class="main" id="main" tabindex="-1">
        <div class="topbar"><div class="crumbs" id="crumbs"></div><div class="status-strip" id="status" aria-live="polite"></div></div>
        <div id="view"></div>
      </main>
    </div>
    <nav class="mobile-nav" id="mnav" aria-label="Primary">${navHtml('mobile-nav')}</nav>`.html;
}

function paintChrome() {
  $('#status')!.innerHTML = statusStrip().html;
  for (const id of ['#theme-d', '#theme-m']) { const el = $(id); if (el) el.innerHTML = themeToggle().html; }
  requestAnimationFrame(snapThemePills);
}

let cleanup: void | (() => void);
let navToken = 0;
async function route() {
  const id = currentId();
  const my = ++navToken;
  $('#nav')!.innerHTML  = navHtml('nav').map(x => (typeof x === 'string' ? x : x.html)).join('');
  $('#mnav')!.innerHTML = navHtml('mobile-nav').map(x => (typeof x === 'string' ? x : x.html)).join('');
  const load = routes[id] ?? routes[''];
  const mod = await load();
  if (my !== navToken) return;
  if (typeof cleanup === 'function') cleanup();
  const view = $('#view')!;
  view.innerHTML = '';
  view.classList.remove('page-enter');
  void (view as HTMLElement).getBoundingClientRect();
  view.classList.add('page-enter');
  $('#crumbs')!.textContent = 'Tandem Studio';
  document.title = `${mod.default.title} · Tandem`;
  cleanup = mod.default.render(view);
  ($('#main') as HTMLElement).focus({ preventScroll: true });
  scrollTo({ top: 0 });
}

function initTheme() {
  function applyPref(pref: string) {
    try { localStorage.setItem('tandem-theme-pref', pref); } catch {}
    document.documentElement.dataset.theme = pref === 'system'
      ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : pref;
  }
  const saved = (() => {
    try { return localStorage.getItem('tandem-theme-pref') ?? localStorage.getItem('tandem-theme') ?? 'system'; }
    catch { return 'system'; }
  })();
  applyPref(saved);
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const p = (() => { try { return localStorage.getItem('tandem-theme-pref') ?? 'system'; } catch { return 'system'; } })();
    if (p === 'system') { document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'; paintChrome(); }
  });
  document.addEventListener('click', e => {
    const btn = (e.target as Element).closest('.ts-btn[data-t]') as HTMLElement | null;
    if (!btn?.closest('#theme')) return;
    const newPref = btn.dataset.t!;
    // Animate the pill to its new position on the current DOM, then rebuild
    document.querySelectorAll<HTMLElement>('.theme-seg').forEach(seg => {
      const pill  = seg.querySelector<HTMLElement>('.ts-pill');
      const toBtn = seg.querySelector<HTMLElement>(`.ts-btn[data-t="${newPref}"]`);
      if (!pill || !toBtn) return;
      const sr = seg.getBoundingClientRect(), br = toBtn.getBoundingClientRect();
      pill.style.width     = `${br.width}px`;
      pill.style.height    = `${br.height}px`;
      pill.style.transform = `translateX(${br.left - sr.left}px)`;
      seg.querySelectorAll<HTMLElement>('.ts-btn').forEach(b => b.classList.toggle('ts-on', b.dataset.t === newPref));
    });
    applyPref(newPref);
    // Rebuild after the pill animation starts (double rAF) so the slide is visible
    requestAnimationFrame(() => requestAnimationFrame(paintChrome));
  });
}

initTheme();
shell();
paintChrome();
tandem.subscribe(paintChrome);
firebase.onChange(paintChrome);
addEventListener('hashchange', route);
initPalette();
route();
