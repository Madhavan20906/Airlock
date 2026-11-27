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
    : c.state === 'downloading' ? pill('On-device: downloading', 'warn')
    : c.state === 'unavailable' ? pill('On-device unavailable', 'bad')
    : pill('No on-device API', '');
  const cloud = !firebase.configured ? pill('Cloud not configured', 'bad')
    : firebase.settings.killSwitchCloud ? pill('Cloud paused (kill switch)', 'bad')
    : firebase.appCheckMode === 'none' ? pill('Cloud: App Check missing', 'warn')
    : pill(`Cloud · App Check ${firebase.appCheckMode === 'debug' ? '(dev)' : 'on'}`, 'cloud');
  const net = tandem.online ? '' : pill('Offline', 'warn');
  const p = tandem.policy;
  const src = tandem.policySource === 'remote-config' ? 'Remote Config' : tandem.policySource === 'my-compiled' ? 'your probe' : 'built-in default';
  return html`${dev}${cloud}${net}<span class="pill"><span class="dot"></span>Policy v${p.version} · ${src}</span>`;
}

function themeToggle() {
  const t = document.documentElement.dataset.theme;
  return html`<button class="btn btn-ghost btn-sm" id="theme" aria-label="Toggle colour theme">${icon(t === 'dark' ? 'sun' : 'moon')}${t === 'dark' ? 'Light' : 'Dark'}</button>`;
}

function shell() {
  const app = document.getElementById('app')!;
  app.innerHTML = html`
    <div class="mobile-bar"><a class="brand" href="#/" style="padding:0">${brandMark}<span class="brand-name">Tandem</span></a><div id="theme-m"></div></div>
    <div class="shell">
      <aside class="rail" aria-label="Primary">
        <a class="brand" href="#/">${brandMark}<span><span class="brand-name">Tandem</span><br><span class="brand-sub">measure, don't guess</span></span></a>
        <nav class="nav" id="nav">${navHtml('nav')}</nav>
        <div class="rail-foot"><div id="theme-d"></div><div class="faint" style="font-size:11.5px">Firebase AI Logic hybrid · Gemini Nano on-device · nothing simulated</div></div>
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
}

let cleanup: void | (() => void);
let navToken = 0;
async function route() {
  const id = currentId();
  const my = ++navToken;
  $('#nav')!.innerHTML = navHtml('nav').map(x => (typeof x === 'string' ? x : x.html)).join('');
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
  try { const t = localStorage.getItem('tandem-theme'); if (t) document.documentElement.dataset.theme = t; } catch { /* ignore */ }
  if (!document.documentElement.dataset.theme) document.documentElement.dataset.theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.addEventListener('click', e => {
    if (!(e.target as Element).closest('#theme')) return;
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('tandem-theme', next); } catch { /* ignore */ }
    paintChrome();
  });
}

initTheme();
shell();
paintChrome();
tandem.subscribe(paintChrome);
firebase.onChange(paintChrome);
addEventListener('hashchange', route);
route();
