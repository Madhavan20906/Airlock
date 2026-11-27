import type { Screen } from '../main.js';
import { html } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { routeBadge, fallbackFlag, escalationFlag } from '../ui/components.js';
import { tandem } from '../services/tandem.js';

const STEPS: Array<[string, string, string, string, string]> = [
  ['1', 'Device check', '#/device', 'gauge', 'See whether your Chrome can run Gemini Nano. If not, nothing breaks: you get the honest status and how to enable it.'],
  ['2', 'Quick probe (about 2 min)', '#/probe', 'race', 'Two lanes race 12 synthetic tasks. Without Nano, the cloud lane runs alone and the local lane says why.'],
  ['3', 'Frontier and Policy', '#/frontier', 'frontier', 'Explore your run, or the labelled reference run from the author\'s laptop. Click any rule to see its evidence.'],
  ['4', 'Tandem Notes', '/notes/', 'notes', 'Load a sample note and run Summarise, Rewrite, Extract tasks, Translate. Each result shows where it ran and why.'],
  ['5', 'Receipts and Guard Lab', '#/receipts', 'receipt', 'Verify the SHA-256 hash chain of every routing decision, then watch the adversarial corpus attack the redactor.'],
  ['6', 'Hybrid Atlas', '#/atlas', 'globe', 'Optionally add your device (coarse, anonymous buckets) and see how many devices can run local AI.']
];

function getVisited(): Set<string> {
  try { return new Set(JSON.parse(sessionStorage.getItem('tandem-visited') || '[]')); } catch { return new Set(); }
}
function markVisited(href: string) {
  const v = getVisited(); v.add(href);
  try { sessionStorage.setItem('tandem-visited', JSON.stringify([...v])); } catch { /* ignore */ }
}

const screen: Screen = {
  title: 'Judge quick start',
  crumb: 'Judge quick start',
  render(root) {
    const c = tandem.capability;
    const visited = getVisited();
    const done = STEPS.filter(([,, href]) => visited.has(href)).length;
    root.innerHTML = html`
      <header class="page-head anim-section">
        <h1 class="title">What to click, <em>and what you should see.</em></h1>
        <p class="lede">Five minutes, no sign-in, no tokens. Your Chrome ${c.state === 'available' ? html`<b>can</b> run Gemini Nano right now, so you will see real on-device results.` : html`reports <span class="mono">${c.raw}</span> for on-device AI. That is fine: every screen works, the on-device lane tells you why it is idle, and the reference run shows real measurements from the author's laptop (clearly labelled).`}</p>
        ${done > 0 ? html`<div class="row" style="gap:6px;margin-top:4px"><span class="faint" style="font-size:13px">${done} of ${STEPS.length} visited</span><span class="bar" style="width:120px;height:6px"><i style="width:${(done / STEPS.length) * 100}%;background:var(--ok)"></i></span></div>` : ''}
      </header>
      <ol class="grid g3" style="list-style:none;padding:0;margin:0 0 24px">
        ${STEPS.map(([n, t, href, ic, body]) => html`<li class="anim-card"><a class="card card-pad step-card stack ${visited.has(href) ? 'is-visited' : ''}" href="${href}" data-track="${href}" style="text-decoration:none;height:100%;gap:8px"><div class="spread">${icon(ic)}</div><div style="font:600 15px var(--f-text)">${t}</div><div class="muted" style="font-size:13px">${body}</div><span class="step-num">${n}</span></a></li>`)}
      </ol>
      <div class="grid g2">
        <div class="card card-pad badge-legend anim-card"><strong style="margin-bottom:4px">The badges</strong>
          <div class="row">${routeBadge('LOCAL')}<span class="muted" style="font-size:13px">Gemini Nano answered, on this device</span></div>
          <div class="row">${routeBadge('CLOUD')}<span class="muted" style="font-size:13px">gemini-3.5-flash-lite answered via Firebase AI Logic</span></div>
          <div class="row">${routeBadge('CLOUD_REDACTED')}<span class="muted" style="font-size:13px">sent to cloud with identifiers replaced by placeholders</span></div>
          <div class="row">${routeBadge('BLOCKED')}<span class="muted" style="font-size:13px">sensitive and no local model; nothing was sent</span></div>
        </div>
        <div class="card card-pad badge-legend anim-card"><strong style="margin-bottom:4px">Why the cloud was used</strong>
          <div>${fallbackFlag()}<p class="muted" style="font-size:13px;margin-top:4px">The local model could not run (not downloaded, unsupported, offline cloud, kill switch).</p></div>
          <div>${escalationFlag()}<p class="muted" style="font-size:13px;margin-top:4px">The local model ran, but its answer failed a check (JSON schema, length, required facts, refusal). The cloud rescued it.</p></div>
        </div>
      </div>
      <div class="banner banner-hero" style="margin-top:18px">${icon('info')}<div class="stack" style="gap:4px"><strong>Nothing is simulated.</strong><span class="muted">All data is synthetic. Every number on screen comes from a real call or a committed result file in the repository (<span class="mono">eval/results/</span>). Cost figures are labelled estimates.</span></div></div>`.html;
    requestAnimationFrame(() => { root.querySelectorAll('.anim-section').forEach(el => el.classList.add('is-mounted')); });
    root.addEventListener('click', e => {
      const a = (e.target as Element).closest('[data-track]') as HTMLElement | null;
      if (a) markVisited(a.dataset.track!);
    });
  }
};
export default screen;
