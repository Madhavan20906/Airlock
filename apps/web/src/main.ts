import './styles/app.css';
import './styles/screens.css';
import './styles/slips-notes.css';
import './styles/plates.css';
import './styles/misc.css';
import { html, $ } from './ui/dom.js';
import { icon, brandMark } from './ui/icons.js';
import { pill } from './ui/components.js';
import { tandem } from './services/tandem.js';
import { firebase } from './services/firebase.js';
import { initTheme, toggleTheme, themeButton } from './ui/theme.js';
import { probeState } from './ui/bus.js';
import { usableRuns } from './screens/data.js';

export interface Screen { title: string; crumb: string; render(root: HTMLElement): void | (() => void) }

const routes: Record<string, () => Promise<{ default: Screen }>> = {
  '': () => import('./screens/home.js'),
  start: () => import('./screens/start.js'),
  device: () => import('./screens/device.js'),
  probe: () => import('./screens/probe.js'),
  frontier: () => import('./screens/frontier.js'),
  policy: () => import('./screens/policy.js'),
  deploy: () => import('./screens/policy.js'),
  atlas: () => import('./screens/atlas.js'),
  receipts: () => import('./screens/receipts.js'),
  guard: () => import('./screens/guard.js')
};

type StageState = 'idle' | 'running' | 'done' | 'stale';
/** The real workflow, in order. State is derived from stored measurements and live config, never assumed. */
function stages(): Array<{ id: string; n: string; label: string; fact: string; state: StageState }> {
  const runs = usableRuns();
  const src = tandem.policySource;
  const pol = tandem.policy;
  const stale = src === 'my-compiled' && tandem.myRunMeta && new Date(tandem.myRunMeta.date) > new Date(pol.generatedAt);
  const atlasMine = (() => { try { return sessionStorage.getItem('tandem-atlas-mine') === '1'; } catch { return false; } })();
  return [
    { id: 'probe', n: '1', label: 'Probe', state: probeState.running ? 'running' : runs ? 'done' : 'idle', fact: probeState.running ? 'running now' : runs ? `${runs} runs on this device` : 'not run here yet' },
    { id: 'frontier', n: '2', label: 'Frontier', state: runs ? 'done' : 'idle', fact: runs ? 'your run' : 'reference run' },
    { id: 'policy', n: '3', label: 'Policy', state: stale ? 'stale' : src !== 'built-in-default' ? 'done' : 'idle', fact: stale ? 'older than your run' : `v${pol.version} · ${src === 'remote-config' ? 'Remote Config' : src === 'my-compiled' ? 'compiled here' : 'default'}` },
    { id: 'deploy', n: '4', label: 'Deploy', state: src === 'remote-config' ? 'done' : 'idle', fact: src === 'remote-config' ? 'live via Remote Config' : 'not published' },
    { id: 'atlas', n: '5', label: 'Atlas', state: atlasMine ? 'done' : 'idle', fact: atlasMine ? 'device added' : 'opt-in' }
  ];
}
const STATE_WORD: Record<StageState, string> = { idle: 'not started', running: 'running', done: 'done', stale: 'stale' };
const SIDE: Array<{ id?: string; href?: string; label: string; icon: string; short: string }> = [
  { id: '', label: 'Overview', icon: 'home', short: 'Home' },
  { id: 'device', label: 'Device check', icon: 'gauge', short: 'Device' },
  { id: 'start', label: 'Judge quick start', icon: 'compass', short: 'Start' }
];
const USE: Array<{ id?: string; href?: string; label: string; icon: string; short: string }> = [
  { href: '/notes/', label: 'Tandem Notes', icon: 'notes', short: 'Notes' },
  { id: 'receipts', label: 'Receipts', icon: 'receipt', short: 'Receipts' },
  { id: 'guard', label: 'Guard Lab', icon: 'shield', short: 'Guard' }
];

// ── Command palette ──────────────────────────────────────────────────────────
interface PItem { label: string; desc: string; icon: string; go: () => void; key?: string; sec: 'Go to' | 'Actions' }
const nav = (h: string) => () => { if (h.startsWith('/')) location.href = h; else location.hash = h; };
const PALETTE: PItem[] = [
  { sec: 'Actions', label: 'Run Quick Probe', desc: '12 tasks, both lanes, about 2 minutes', icon: 'play', go: nav('#/probe?go=quick'), key: 'P' },
  { sec: 'Actions', label: 'Toggle Paper / Darkroom', desc: 'switch colour mode', icon: 'moon', go: () => toggleTheme(), key: 'D' },
  { sec: 'Actions', label: 'Open latest receipt', desc: 'the most recent routing decision', icon: 'receipt', go: nav('#/receipts?open=latest') },
  { sec: 'Actions', label: 'Download certificate', desc: 'Certificate of Calibration, print or PDF', icon: 'download', go: nav('#/policy?print=1') },
  { sec: 'Go to', label: 'Overview', desc: 'the thesis and the held-out result', icon: 'home', go: nav('#/') },
  { sec: 'Go to', label: '1 Probe', desc: 'race tasks on both models', icon: 'race', go: nav('#/probe') },
  { sec: 'Go to', label: '2 Frontier', desc: 'pass rate against latency, per task type', icon: 'frontier', go: nav('#/frontier') },
  { sec: 'Go to', label: '3 Policy', desc: 'rules with evidence attached', icon: 'policy', go: nav('#/policy') },
  { sec: 'Go to', label: '4 Deploy', desc: 'Remote Config template and live policy', icon: 'download', go: nav('#/deploy') },
  { sec: 'Go to', label: '5 Hybrid Atlas', desc: 'how many devices can run local AI', icon: 'globe', go: nav('#/atlas') },
  { sec: 'Go to', label: 'Tandem Notes', desc: 'the notes app built on the router', icon: 'notes', go: nav('/notes/') },
  { sec: 'Go to', label: 'Receipts', desc: 'hash-chained routing ledger', icon: 'receipt', go: nav('#/receipts') },
  { sec: 'Go to', label: 'Guard Lab', desc: 'adversarial redaction corpus', icon: 'shield', go: nav('#/guard') },
  { sec: 'Go to', label: 'Device check', desc: 'on-device model status here', icon: 'gauge', go: nav('#/device') },
  { sec: 'Go to', label: 'Judge quick start', desc: 'what to click and what you should see', icon: 'compass', go: nav('#/start') }
];
let plOpen = false, plIdx = 0, plQ = '', plReturn: HTMLElement | null = null;
const plFiltered = () => { const q = plQ.toLowerCase(); return q ? PALETTE.filter(i => (i.label + ' ' + i.desc).toLowerCase().includes(q)) : PALETTE; };
function plHtml() {
  const items = plFiltered();
  const idx = Math.min(plIdx, Math.max(items.length - 1, 0));
  let lastSec = '';
  return html`<div class="pl-scrim" id="pl-scrim"><div class="pl" role="dialog" aria-modal="true" aria-label="Command palette">
    <div class="pl-bar">${icon('arrow')}<input class="pl-input" id="pl-q" type="text" placeholder="Type a command or screen" value="${plQ}" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="pl-list" aria-activedescendant="pl-${idx}"><kbd>Esc</kbd></div>
    <ul class="pl-list" id="pl-list" role="listbox" aria-label="Commands">
      ${items.length ? items.map((it, i) => { const sec = it.sec !== lastSec ? (lastSec = it.sec, html`<li class="pl-sec caps" role="presentation">${it.sec}</li>`) : ''; return html`${sec}<li id="pl-${i}" class="pl-row ${i === idx ? 'pl-sel' : ''}" role="option" aria-selected="${i === idx}" data-pi="${i}"><span class="pl-ic">${icon(it.icon)}</span><span class="pl-info"><span class="pl-name">${it.label}</span><span class="pl-desc">${it.desc}</span></span>${it.key ? html`<kbd>Alt ${it.key}</kbd>` : ''}</li>`; })
        : html`<li class="pl-empty">Nothing matches "${plQ}".</li>`}
    </ul>
    <div class="pl-foot"><span><kbd>↑</kbd> <kbd>↓</kbd> move</span><span><kbd>Enter</kbd> run</span><span><kbd>Esc</kbd> close</span></div>
  </div></div>`;
}
function plShow() {
  if (plOpen) return;
  plOpen = true; plIdx = 0; plQ = ''; plReturn = document.activeElement as HTMLElement | null;
  const m = document.createElement('div'); m.id = 'pl-mount'; m.innerHTML = plHtml().html; document.body.appendChild(m);
  ($('#pl-q') as HTMLInputElement)?.focus();
}
function plClose() { plOpen = false; $('#pl-mount')?.remove(); plReturn?.focus?.(); }
function plRepaint() {
  const m = $('#pl-mount'); if (!m) return;
  const list = $('#pl-list'); const st = list?.scrollTop ?? 0;
  m.innerHTML = plHtml().html;
  const inp = $('#pl-q') as HTMLInputElement; inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length);
  const nl = $('#pl-list'); if (nl) nl.scrollTop = st;
  $('.pl-sel')?.scrollIntoView({ block: 'nearest' });
}
function plRun(it?: PItem) { if (!it) return; plClose(); it.go(); }
function initPalette() {
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); plOpen ? plClose() : plShow(); return; }
    if (!plOpen && e.altKey && !e.ctrlKey && !e.metaKey) {
      const it = PALETTE.find(p => p.key && `Key${p.key}` === e.code);
      if (it) { e.preventDefault(); it.go(); return; }
    }
    if (!plOpen) return;
    const items = plFiltered();
    if (e.key === 'Escape') { e.preventDefault(); plClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); plIdx = Math.min(plIdx + 1, items.length - 1); plRepaint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); plIdx = Math.max(plIdx - 1, 0); plRepaint(); }
    else if (e.key === 'Enter') { e.preventDefault(); plRun(items[Math.min(plIdx, items.length - 1)]); }
    else if (e.key === 'Tab') e.preventDefault();
  });
  document.addEventListener('input', e => { const t = e.target as HTMLInputElement; if (plOpen && t.id === 'pl-q') { plQ = t.value; plIdx = 0; plRepaint(); } });
  document.addEventListener('click', e => {
    const t = e.target as HTMLElement;
    if (t.closest('[data-palette]')) { plShow(); return; }
    if (t.closest('[data-theme-toggle]')) { toggleTheme(); return; }
    if (!plOpen) return;
    const row = t.closest('[data-pi]') as HTMLElement | null;
    if (row) { plRun(plFiltered()[Number(row.dataset.pi)]); return; }
    if (t.closest('#pl-scrim') && !t.closest('.pl')) plClose();
  });
}

// ── Shell ────────────────────────────────────────────────────────────────────
function currentId() { return location.hash.replace(/^#\/?/, '').split('?')[0]; }

function railHtml() {
  const id = currentId();
  const cur = (x: string | undefined) => (x !== undefined && x === id ? html`aria-current="page"` : '');
  return html`
    <ol class="spine" aria-label="Pipeline">${stages().map(s => html`<li><a href="#/${s.id}" data-state="${s.state}" ${cur(s.id)}>
      <span class="node" aria-hidden="true"><span>${s.n}</span></span>
      <span class="lbl"><b>${s.label}</b><span>${s.fact}</span></span><span class="sr">, step ${s.n}, ${STATE_WORD[s.state]}</span></a></li>`)}</ol>
    <div class="rail-group caps">Use it</div>
    <nav class="rail-links" aria-label="Apps">${USE.map(n => html`<a href="${n.href ?? `#/${n.id}`}" ${cur(n.id)}>${icon(n.icon)}${n.label}</a>`)}</nav>
    <div class="rail-group caps">Orientation</div>
    <nav class="rail-links" aria-label="Orientation">${SIDE.map(n => html`<a href="#/${n.id}" ${cur(n.id)}>${icon(n.icon)}${n.label}</a>`)}</nav>`;
}
function mobileNavHtml() {
  const id = currentId();
  return html`${stages().map(s => html`<a href="#/${s.id}" data-state="${s.state}" ${s.id === id ? html`aria-current="page"` : ''}><span class="n" aria-hidden="true">${s.n}</span>${s.label}<span class="sr">, ${STATE_WORD[s.state]}</span></a>`)}
    ${[...USE, SIDE[0]].map(n => html`<a href="${n.href ?? `#/${n.id}`}" ${n.id !== undefined && n.id === id ? html`aria-current="page"` : ''}>${icon(n.icon)}${n.short}</a>`)}`;
}

function statusStrip() {
  const c = tandem.capability;
  const dev = c.state === 'available' ? pill('on-device ready', 'local')
    : c.state === 'downloadable' ? pill('on-device: download needed', 'warn')
    : c.state === 'downloading' ? pill('on-device: downloading', 'warn')
    : c.state === 'unavailable' ? pill('on-device unavailable here', 'bad')
    : pill('no on-device API', 'bad');
  const cloud = !firebase.configured ? pill('cloud not configured', 'bad')
    : firebase.settings.killSwitchCloud ? pill('cloud paused (kill switch)', 'bad')
    : firebase.appCheckMode === 'none' ? pill('cloud: App Check missing', 'warn')
    : pill(`cloud · App Check ${firebase.appCheckMode === 'debug' ? 'dev' : 'on'}`, 'cloud');
  const net = tandem.online ? '' : pill('offline', 'warn');
  return html`${dev}${cloud}${net}<span class="pill ok"><span class="dot" aria-hidden="true"></span>policy v<span class="odo" id="pol-v">${tandem.policy.version}</span></span>`;
}

function shell() {
  $('#app')!.innerHTML = html`
    <a class="skip" href="#main">Skip to content</a>
    <div class="mobile-bar"><a class="brand" href="#/">${brandMark}<span class="brand-name">Tandem</span></a><div class="row" style="gap:8px"><button class="btn btn-sm" data-palette aria-label="Open command palette">${icon('arrow')}Go</button><span id="theme-m"></span></div></div>
    <div class="shell">
      <aside class="rail" aria-label="Primary">
        <a class="brand" href="#/">${brandMark}<span><span class="brand-name">Tandem</span><span class="brand-sub">measure, don't guess</span></span></a>
        <div id="rail">${railHtml()}</div>
        <div class="rail-foot">
          <button class="palette-trigger" data-palette>${icon('arrow')}<span>Commands</span><kbd>Ctrl K</kbd></button>
          <span id="theme-d"></span>
          <p class="fine">Firebase AI Logic hybrid inference. Gemini Nano on-device. Nothing simulated.</p>
        </div>
      </aside>
      <main class="main" id="main" tabindex="-1">
        <div class="topbar"><div class="crumbs" id="crumbs"></div><div class="status-strip" id="status" aria-live="polite"></div></div>
        <div id="view"></div>
      </main>
    </div>
    <nav class="mobile-nav" id="mnav" aria-label="Primary"></nav>`.html;
}

let lastPolicyV = -1;
function paintChrome() {
  $('#status')!.innerHTML = statusStrip().html;
  $('#rail')!.innerHTML = railHtml().html;
  $('#mnav')!.innerHTML = mobileNavHtml().html;
  for (const id of ['#theme-d', '#theme-m']) { const el = $(id); if (el) el.innerHTML = themeButton(id === '#theme-m').html; }
  const v = tandem.policy.version;
  if (lastPolicyV !== -1 && v !== lastPolicyV) $('#pol-v')?.classList.add('roll');
  lastPolicyV = v;
}

let cleanup: void | (() => void);
let navToken = 0;
async function route() {
  const id = currentId();
  const my = ++navToken;
  const load = routes[id] ?? routes[''];
  const mod = await load();
  if (my !== navToken) return;
  if (typeof cleanup === 'function') cleanup();
  const view = $('#view')!;
  const swap = () => {
    const fresh = view.cloneNode(false) as HTMLElement; // drop old listeners
    view.replaceWith(fresh);
    fresh.classList.add('page-enter');
    $('#crumbs')!.textContent = mod.default.crumb;
    document.title = `${mod.default.title} · Tandem`;
    paintChrome();
    cleanup = mod.default.render(fresh);
  };
  const vt = (document as any).startViewTransition;
  if (vt && !matchMedia('(prefers-reduced-motion: reduce)').matches) vt.call(document, swap); else swap();
  ($('#main') as HTMLElement).focus({ preventScroll: true });
  scrollTo({ top: 0 });
}

initTheme(paintChrome);
shell();
paintChrome();
tandem.subscribe(paintChrome);
firebase.onChange(paintChrome);
probeState.on(paintChrome);
addEventListener('hashchange', route);
initPalette();
route();
