import type { Screen } from '../main.js';
import { html, pct, fmtMs } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyph } from '../ui/glyphs.js';
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

function strategies(h: Headline) {
  const rows = [
    { name: 'Tandem · 8 s budget', pass: h.passTandem, share: h.servedOnDevice ?? 0, note: `${pct(h.servedOnDevice)} on-device · p50 ${fmtMs(h.p50Tandem)}` },
    ...(h.background ? [{ name: 'Tandem · 30 s budget', pass: h.background.passTandem, share: h.background.servedOnDevice ?? 0, note: `${pct(h.background.servedOnDevice)} on-device · background work` }] : []),
    { name: 'All cloud', pass: h.passCloud, share: 0, note: `p50 ${fmtMs(h.p50Cloud)}` },
    { name: 'All on-device', pass: h.passLocal, share: 1, note: 'no validation, no escalation' }
  ];
  return html`<table class="t strat"><caption class="sr">Held-out pass rate by routing strategy, split by where requests were served</caption>
    <thead><tr><th>Strategy</th><th>Pass rate, held-out</th><th class="r">Pass</th><th>Served</th></tr></thead>
    <tbody>${rows.map(r => html`<tr><th scope="row">${r.name}</th>
      <td><span class="sbar" aria-hidden="true"><i class="l" style="width:${(r.pass ?? 0) * r.share * 100}%"></i><i class="c" style="width:${(r.pass ?? 0) * (1 - r.share) * 100}%"></i></span></td>
      <td class="num r">${pct(r.pass, 1)}</td><td class="faint mono" style="font-size:12px">${r.note}</td></tr>`)}</tbody></table>`;
}

const screen: Screen = {
  title: 'Overview',
  crumb: 'Tandem Studio · Overview',
  render(root) {
    const paint = () => {
      const d = chooseData();
      const byType = d.results.length ? aggregate(d.results).byType : [];
      const policy = d.results.length ? compilePolicy(d.results) : null;
      const best = policy ? [...policy.rules].sort((a, b) => (b.evidence.wilsonLoLocal ?? -1) - (a.evidence.wilsonLoLocal ?? -1))[0] : null;
      const cap = tandem.capability;
      const h = headline;
      const passedN = h && h.passLocal !== null ? Math.round(h.passLocal * h.nHeldout) : null;
      root.innerHTML = html`
        <section class="folio hero-folio">
          <div class="hero-main">
            <h1 class="hero-line">Every hybrid app hardcodes a guess:<br><s class="guess">“short goes on-device, long goes to the cloud.”</s><br><em>Tandem measures it.</em></h1>
            ${h && passedN !== null ? html`
              <div class="hero-metric">
                <span class="hm-n t-local num">${pct(h.passLocal)}</span>
                <p class="hm-cap">Gemini Nano passed <b class="num">${passedN}</b> of <b class="num">${h.nHeldout}</b> unseen tasks on a laptop GPU.<br><span class="muted">Quality is not the problem. Speed decides the rest.</span></p>
              </div>` : ''}
            <div class="row hero-cta"><a class="btn btn-primary" href="#/probe">${icon('play')}Run the quick probe</a><a class="btn" href="/notes/">${icon('notes')}Open Tandem Notes</a><a class="btn btn-ghost" href="#/start">Judge quick start</a></div>
          </div>
          <aside class="margin">
            ${h ? html`<div class="mnote"><span class="caps">Source</span><span>Measured on the author's laptop, ${dateOf(h.measuredAt)}, Chrome <span class="num">${h.chrome}</span>.</span><span class="mono faint" style="font-size:11px">${h.machine}</span><span class="mono faint" style="font-size:11px">${h.source}</span></div>` : html`<div class="mnote"><span class="caps">Source</span><span>Loading the committed result file.</span></div>`}
            <div class="mnote"><span class="caps">This browser</span><span>${cap.state === 'available' ? routeBadge('LOCAL') : html`on-device model: <span class="mono">${cap.raw}</span>`}</span><a href="#/device" class="faint">Device check</a></div>
            <div class="mnote"><span class="caps">Rule</span><span>Thresholds were fixed before any data: Wilson 95% lower bound ≥ 75%, n ≥ 8, within 5% of cloud.</span></div>
          </aside>
        </section>

        ${h ? html`<section aria-labelledby="ho-t">
          <div class="sec"><h2 id="ho-t">Held-out validation</h2><span class="caps">n = ${h.nHeldout} · compiled on calibration only</span></div>
          <div class="folio">
            <div>${strategies(h)}<p class="legend-line"><span>${glyph('local')} solid: served on-device</span><span class="c">${glyph('cloud')} hatched: served in the cloud</span></p></div>
            <aside class="margin"><div class="mnote"><span class="caps">Reading it</span><span>At the registered 8-second budget Tandem keeps <b class="num">${pct(h.servedOnDevice)}</b> on-device on this hardware: Nano is accurate but slow on an integrated GPU. Give background work 30 seconds and <b class="num">${pct(h.background?.servedOnDevice)}</b> stays local, at no loss in pass rate. Negative results are reported, not hidden.</span></div></aside>
          </div>
        </section>` : ''}

        <section aria-labelledby="tt-t">
          <div class="sec"><h2 id="tt-t">Pass rate by task type</h2><span class="caps">${d.label}</span></div>
          ${byType.length ? html`<div class="folio"><div class="pairs" role="table" aria-label="Pass rate by task type, on-device and cloud">
              <div class="pair head" role="row"><span role="columnheader">Task</span><span role="columnheader">${glyph('local')} on-device</span><span role="columnheader">${glyph('cloud')} cloud</span></div>
              ${TASK_TYPES.map(t => { const c = byType.find(x => x.taskType === t); return html`<div class="pair" role="row">
                <span role="rowheader">${labelOf[t]}</span>
                <span role="cell" class="pv"><span class="pbar l"><i style="width:${(c?.local.passRate ?? 0) * 100}%"></i></span><span class="num">${pct(c?.local.passRate)}</span></span>
                <span role="cell" class="pv"><span class="pbar c"><i style="width:${(c?.cloud.passRate ?? 0) * 100}%"></i></span><span class="num">${pct(c?.cloud.passRate)}</span></span></div>`; })}
            </div><aside class="margin"><div class="mnote"><span class="caps">Data</span><span>${d.caption}.</span><span class="faint">Losses are shown, not hidden.</span></div></aside></div>`
          : html`<p class="muted">No measurements yet. Run the probe to fill this with numbers from your device.</p>`}
        </section>

        <section aria-labelledby="pp-t">
          <div class="sec"><h2 id="pp-t">The pipeline</h2><span class="caps">measure → decide → ship → prove</span></div>
          <ol class="pipe">
            ${[
              ['1', 'Probe', '#/probe', `${tandem.myRun.length || 'no'} runs on this device`],
              ['2', 'Frontier', '#/frontier', `${byType.length} task types plotted`],
              ['3', 'Policy', '#/policy', policy ? `${policy.rules.filter(r => r.route === 'LOCAL_FIRST').length} of 24 rules local-first` : 'compiled with evidence'],
              ['4', 'Deploy', '#/deploy', `v${tandem.policy.version} live in the router`],
              ['5', 'Atlas', '#/atlas', 'opt-in device map']
            ].map(([n, name, href, fact]) => html`<li><a href="${href}"><span class="pn num">${n}</span><span class="pname">${name}</span><span class="pfact">${fact}</span></a></li>`)}
          </ol>
          <p class="pipe-then"><span class="caps">then</span> <a href="/notes/">Router SDK in Tandem Notes</a> <span class="faint">→</span> <a href="#/receipts">${tandem.receipts.length} hash-chained receipts</a></p>
        </section>

        <section aria-labelledby="df-t">
          <div class="sec"><h2 id="df-t">What hybrid inference was missing</h2></div>
          <dl class="defs">
            <div><dt>Two reasons to use the cloud, never conflated</dt>
              <dd><span class="row" style="gap:18px;margin-bottom:8px">${fallbackFlag()}${escalationFlag()}</span>The SDK falls back when the local model is unavailable. Tandem also escalates when the local answer is not good enough: it failed a JSON, length, fact or refusal check. Every receipt records which one happened.</dd></div>
            <div><dt>A policy that can defend itself</dt>
              <dd>${best ? html`<span class="row" style="margin-bottom:8px"><span class="chip">${labelOf[best.taskType]} ${best.lengthBucket}</span><span class="chip">n <b>${best.evidence.n}</b></span><span class="chip">lower bound <b>${pct(best.evidence.wilsonLoLocal)}</b></span><span class="chip">p95 <b>${fmtMs(best.evidence.p95Local)}</b></span></span>` : ''}Every rule carries its evidence: sample size, both pass rates, a Wilson 95% lower bound and latency.${best ? html` <span class="faint">Shown: the strongest rule in the ${d.label.toLowerCase()}.</span>` : ''}</dd></div>
            <div><dt>Privacy decides before measurements do</dt>
              <dd><span class="row" style="margin-bottom:8px">${routeBadge('LOCAL')}${routeBadge('CLOUD_REDACTED')}${routeBadge('BLOCKED')}</span>Tandem Guard finds Aadhaar, PAN, IFSC, UPI, GSTIN and phone numbers, even disguised with Indic digits, spacing or lookalike letters. Sensitive content stays on-device, leaves redacted only with consent, or is blocked.</dd></div>
          </dl>
        </section>
        <p class="colophon">Nothing here is simulated. Every stamp shows who actually answered, as reported by Firebase AI Logic. All sample data is synthetic.</p>`.html;
    };
    const unsub = tandem.subscribe(paint);
    void tandem.whenReady().then(paint);
    void loadHeadline().then(paint);
    paint();
    return unsub;
  }
};
export default screen;
