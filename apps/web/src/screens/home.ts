import type { Screen } from '../main.js';
import { html, pct, fmtMs } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { routeBadge, fallbackFlag, escalationFlag, labelOf } from '../ui/components.js';
import { tandem } from '../services/tandem.js';
import { aggregate, compilePolicy, TASK_TYPES } from '@tandem/policy';
import { chooseData } from './data.js';

interface Headline {
  source: string; measuredAt: string; chrome: string; machine: string; nHeldout: number;
  servedOnDevice: number | null; qualityRetained: number | null; passTandem: number | null; passCloud: number | null; passLocal: number | null;
  cloudCallsAvoided: number; escalations: number; rescued: number; p50Tandem: number | null; p50Cloud: number | null;
  background?: { latencyBudgetMs: number; servedOnDevice: number | null; qualityRetained: number | null; passTandem: number | null };
}
let headline: Headline | null | undefined;
const loadHeadline = () => (headline !== undefined ? Promise.resolve(headline)
  : fetch('/headline.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(h => (headline = h)));

const dateOf = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

function compare(h: Headline) {
  const rows: Array<{ name: string; pass: number | null; tone: string; note: string; share?: number | null }> = [
    { name: 'Tandem, 8 s budget', pass: h.passTandem, tone: 'mix', share: h.servedOnDevice, note: `${pct(h.servedOnDevice)} on-device · p50 ${fmtMs(h.p50Tandem)}` },
    ...(h.background ? [{ name: 'Tandem, 30 s budget', pass: h.background.passTandem, tone: 'mix', share: h.background.servedOnDevice, note: `${pct(h.background.servedOnDevice)} on-device · background work` }] : []),
    { name: 'All cloud', pass: h.passCloud, tone: 'cloud', note: `0% on-device · p50 ${fmtMs(h.p50Cloud)}` },
    { name: 'All on-device', pass: h.passLocal, tone: 'local', note: '100% on-device, no validation' }
  ];
  return html`<div class="compare" role="table" aria-label="Held-out pass rate by routing strategy">
    ${rows.map(r => html`<div class="compare-row" role="row">
      <span class="compare-name" role="rowheader">${r.name}</span>
      <span class="compare-bar ${r.tone}" role="cell" aria-label="${r.name} pass rate ${pct(r.pass, 1)}">
        ${r.tone === 'mix' ? html`<i class="local" style="width:${(r.pass ?? 0) * (r.share ?? 0) * 100}%"></i><i class="cloud" style="width:${(r.pass ?? 0) * (1 - (r.share ?? 0)) * 100}%"></i>` : html`<i style="width:${(r.pass ?? 0) * 100}%"></i>`}
      </span>
      <span class="compare-val num" role="cell">${pct(r.pass, 1)}</span>
      <span class="compare-note" role="cell">${r.note}</span>
    </div>`)}
  </div>`;
}

const screen: Screen = {
  title: 'Overview',
  crumb: 'Tandem Studio',
  render(root) {
    const paint = () => {
      const d = chooseData();
      const byType = d.results.length ? aggregate(d.results).byType : [];
      const rows = TASK_TYPES.map(t => ({ t, c: byType.find(x => x.taskType === t) }));
      const policy = d.results.length ? compilePolicy(d.results) : null;
      const localFirst = policy ? policy.rules.filter(r => r.route === 'LOCAL_FIRST').length : 0;
      const best = policy ? [...policy.rules].sort((a, b) => (b.evidence.wilsonLoLocal ?? -1) - (a.evidence.wilsonLoLocal ?? -1))[0] : null;
      const cap = tandem.capability;
      const flow: Array<[string, string, string]> = [
        ['Probe', '#/probe', `${d.results.length || 0} runs measured`],
        ['Frontier', '#/frontier', `${byType.length} task types compared`],
        ['Policy', '#/policy', policy ? `${localFirst} of 24 rules local-first` : 'compiled with evidence'],
        ['Remote Config', '#/policy', `v${tandem.policy.version} live in the router`],
        ['Router', '/notes/', 'local-first, validated, escalates'],
        ['Receipts', '#/receipts', `${tandem.receipts.length} SHA-256-chained`]
      ];
      root.innerHTML = html`
        <section class=”card hero anim-section”>
          <div class=”stack” style=”gap:20px”>
            <h1 class=”hero-quote”>Every hybrid app hardcodes a guess: <span class=”strike”>”short goes on-device, long goes to the cloud.”</span> <em>Tandem measures it.</em></h1>
            <p class=”lede”>Firebase AI Logic hybrid answers “is a local model available?” Tandem answers what comes next: which of <i>your</i> tasks the on-device model can actually do, on which devices, what it costs when it can't, and what must never leave the device. With receipts.</p>
            <div class=”row”><a class=”btn btn-primary” href=”#/probe”>${icon('race')}Run the quick probe</a><a class=”btn” href=”/notes/”>${icon('notes')}Open Tandem Notes</a><a class=”btn btn-ghost” href=”#/start”>Judge quick start ${icon('arrow')}</a></div>
          </div>
          <figure class="figure" aria-label="Pass rate by task type, on-device and cloud">
            <figcaption class="spread"><strong>Pass rate by task type</strong><span class="legend"><span><i class="sw local"></i>On-device</span><span><i class="sw cloud"></i>Cloud</span></span></figcaption>
            ${byType.length ? html`<div class="duo">${rows.map(({ t, c }) => html`
              <div class="duo-row" title="${labelOf[t]}: on-device ${pct(c?.local.passRate)} (n=${c?.local.n ?? 0}), cloud ${pct(c?.cloud.passRate)} (n=${c?.cloud.n ?? 0})">
                <span>${labelOf[t]}</span>
                <span class="stack" style="gap:3px"><span class="bar local"><i style="width:${(c?.local.passRate ?? 0) * 100}%"></i></span><span class="bar cloud"><i style="width:${(c?.cloud.passRate ?? 0) * 100}%"></i></span></span>
                <span class="num" style="text-align:right">${pct(c?.local.passRate)}</span>
              </div>`)}</div>
              <p class="meta" style="margin-top:14px">${d.caption}. Losses are shown, not hidden.</p>`
            : html`<p class="meta">No measurements yet. Run the probe to fill this with real numbers from your device.</p>`}
          </figure>
        </section>

        ${headline ? html`<section class="card card-pad result anim-section" aria-labelledby="ho-title">
          <div class="result-head">
            <h2 id="ho-title" class="section-title" style="margin:0">Gemini Nano passed <span class="num" style="color:var(--local)">${pct(headline.passLocal)}</span> of ${headline.nHeldout} unseen tasks. Speed decides the rest.</h2>
            <p class="lede" style="font-size:15px">Compiled on calibration tasks only, replayed on held-out tasks measured on both models. At the registered 8-second budget Tandem keeps <b class="num">${pct(headline.servedOnDevice)}</b> on-device${headline.background ? html`; give background work 30 seconds and it keeps <b class="num">${pct(headline.background.servedOnDevice)}</b>` : ''}. Sensitive notes stay local at any budget.</p>
          </div>
          ${compare(headline)}
          <p class="meta">Measured on the author's laptop (${headline.machine}), ${dateOf(headline.measuredAt)}, Chrome ${headline.chrome}. Raw data: <span class="mono">${headline.source}</span></p>
        </section>` : ''}

        <section class="anim-section" aria-labelledby="flow-title">
          <h2 id="flow-title" class="section-title">How it works</h2>
          <ol class="flow">${flow.map(([name, href, fact]) => html`<li><a href="${href}"><span class="flow-name">${name}</span><span class="flow-fact">${fact}</span></a></li>`)}</ol>
        </section>

        <section class="anim-section" aria-labelledby="diff-title">
          <h2 id="diff-title" class="section-title">What hybrid inference was missing</h2>
          <dl class="defs">
            <div><dt>Two reasons to use the cloud, never conflated</dt>
              <dd><span class="row" style="gap:14px;margin-bottom:6px">${fallbackFlag()}${escalationFlag()}</span>The SDK falls back when the local model is unavailable. Tandem also escalates when the local answer is not good enough, because it failed a JSON, length, fact or refusal check, and every receipt records which one happened.</dd></div>
            <div><dt>A policy that can defend itself</dt>
              <dd>${best ? html`<span class="row" style="margin-bottom:6px"><span class="chip">${labelOf[best.taskType]} ${best.lengthBucket}</span><span class="chip">n <b>${best.evidence.n}</b></span><span class="chip">lower bound <b>${pct(best.evidence.wilsonLoLocal)}</b></span><span class="chip">p95 <b>${fmtMs(best.evidence.p95Local)}</b></span></span>` : ''}Every routing rule carries its evidence: sample size, local and cloud pass rates, a Wilson 95% lower bound and latency. Thresholds were fixed before any data existed.${best ? html` <span class="faint">Shown: the strongest rule in the ${d.label.toLowerCase()}.</span>` : ''}</dd></div>
            <div><dt>Privacy decides before measurements do</dt>
              <dd><span class="row" style="margin-bottom:6px">${routeBadge('LOCAL')}${routeBadge('CLOUD_REDACTED')}${routeBadge('BLOCKED')}</span>Tandem Guard finds Aadhaar, PAN, IFSC, UPI, GSTIN and phone numbers, even disguised with Indic digits, spacing or lookalike letters. Sensitive content stays on-device, leaves redacted only with your consent, or is blocked.</dd></div>
          </dl>
        </section>

        <div class="banner banner-hero ${cap.state === 'available' ? 'local' : ''} anim-section" style="margin-top:28px">${icon(cap.state === 'available' ? 'chip' : 'info')}<div class="stack" style="gap:4px"><strong>Nothing here is simulated.</strong><span class="muted">Every badge shows who actually answered, as reported by Firebase AI Logic. This browser's on-device model: <span class="mono">${cap.raw}</span>. <a href="#/device">Device check</a></span></div></div>`.html;
      requestAnimationFrame(() => { root.querySelectorAll('.anim-section').forEach(el => el.classList.add('is-mounted')); });
    };
    const unsub = tandem.subscribe(paint);
    void tandem.whenReady().then(paint);
    void loadHeadline().then(paint);
    paint();
    return unsub;
  }
};
export default screen;
