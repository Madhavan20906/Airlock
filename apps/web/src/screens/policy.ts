import type { Screen } from '../main.js';
import { html, fmtMs, pct, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { empty, labelOf, banner } from '../ui/components.js';
import { openEvidence, ruleChip } from '../ui/evidence.js';
import { chooseData, dataToggle, getParam, type DataChoice } from './data.js';
import { tandem } from '../services/tandem.js';
import { firebase } from '../services/firebase.js';
import {
  compilePolicy, diffPolicies, simulateSavings, mergeIntoRemoteConfigTemplate, TASK_TYPES, LENGTH_BUCKETS, type TandemPolicy, type TaskType
} from '@tandem/policy';

const BUCKET_MIX = { S: 0.5, M: 0.35, L: 0.15 } as const;
const BUCKET_NAME = { S: 'Short', M: 'Medium', L: 'Long' } as const;
const dateTime = (iso: string) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZoneName: 'short' });

async function fingerprint(p: TandemPolicy) {
  const { generatedAt: _g, ...stable } = p;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(stable)));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

const screen: Screen = {
  title: 'Policy',
  crumb: 'Pipeline · 3 Policy · 4 Deploy',
  render(root) {
    let pref = getParam('run');
    let budget: 8000 | 30000 = 8000; // registered default (docs/POLICY_RULE.md); 30 s is the labelled sensitivity view
    let policy: TandemPolicy | null = null;
    let label = '';
    let fp = '';
    let liveVersion = tandem.policy.version;
    let liveChanged = new Set<string>();   // rules that changed in the last live (Remote Config) update
    let prevLive = new Map(tandem.policy.rules.map(r => [`${r.taskType}|${r.lengthBucket}`, r.route]));
    const shares: Record<string, number> = Object.fromEntries(TASK_TYPES.map(t => [t, t === 'summarize' || t === 'rewrite' || t === 'classify' ? 20 : 8]));

    const savings = () => {
      if (!policy) return html``;
      const mix = TASK_TYPES.flatMap(t => LENGTH_BUCKETS.map(b => ({ taskType: t as TaskType, lengthBucket: b, share: shares[t] * BUCKET_MIX[b] })));
      const s = simulateSavings(policy, mix, { inPerMTok: firebase.settings.priceInPerMTok, outPerMTok: firebase.settings.priceOutPerMTok });
      return html`
        <div class="readouts">
          <div class="readout local"><div class="caps">Served on-device</div><div class="rv num">${pct(s.localShare)}</div><div class="rn">of requests, this mix</div></div>
          <div class="readout"><div class="caps">Cloud calls avoided</div><div class="rv num">${(s.cloudCallsAvoidedPer1M / 1000).toFixed(0)}<small>k / 1M</small></div><div class="rn">estimate</div></div>
          <div class="readout"><div class="caps">Cost avoided</div><div class="rv num">$${s.estCostAvoidedPer1M.toFixed(2)}<small>/ 1M</small></div><div class="rn">estimate, of $${s.estCostAllCloudPer1M.toFixed(2)} all-cloud</div></div>
          <div class="readout"><div class="caps">p50 latency change</div><div class="rv num">${s.p50LatencyDeltaMs === null ? '—' : (s.p50LatencyDeltaMs > 0 ? '+' : '') + fmtMs(s.p50LatencyDeltaMs)}</div><div class="rn">vs all-cloud, incl. escalations</div></div>
        </div>
        <ul class="meta assumptions">${s.assumptions.map(a => html`<li>${a}</li>`)}<li>Prices: $${firebase.settings.priceInPerMTok}/M input, $${firebase.settings.priceOutPerMTok}/M output tokens, from Remote Config. Check current official Gemini API pricing before relying on these.</li></ul>`;
    };

    const paint = () => {
      const d = chooseData(pref);
      label = d.label;
      const head = html`<header class="page-head no-print">
        <h1 class="title">A routing policy <em>that can defend itself.</em></h1>
        <p class="lede">Compiled from measurements, issued as a certificate. Every rule carries the evidence that justifies it; click a cell to read it. Ship it through Remote Config and the router swaps it live.</p>
      </header>`;
      if (!d.results.length) {
        root.innerHTML = html`${head}<div class="plate">${empty('policy', 'Nothing to compile yet', 'Run the probe first, or switch to the reference run.', html`<a class="btn btn-primary" href="#/probe">${icon('play')}Run the probe</a>`)}</div>`.html;
        return;
      }
      policy = compilePolicy(d.results, { params: { latencyBudgetMs: budget }, previous: tandem.policy.source === 'studio' ? tandem.policy : undefined, device: { class: d.label, notes: d.caption } });
      const live = tandem.policy;
      const diff = diffPolicies(live, policy);
      const changed = new Set(diff.changes.map(c => `${c.taskType}|${c.lengthBucket}`));
      const lf = policy.rules.filter(r => r.route === 'LOCAL_FIRST').length;
      const active = tandem.policySource === 'remote-config' ? 'Remote Config, all users' : tandem.policySource === 'my-compiled' ? 'compiled on this device' : 'built-in default';
      root.innerHTML = html`${head}
        <div class="probe-ctl no-print">
          ${dataToggle(d.choice)}
          <div class="seg" role="group" aria-label="Latency budget"><button data-budget="8000" aria-pressed="${budget === 8000}">Interactive · 8 s</button><button data-budget="30000" aria-pressed="${budget === 30000}">Background · 30 s</button></div>
          <span class="row" style="margin-left:auto"><button class="btn btn-primary" id="use">${icon('check')}Use on this device</button><button class="btn" id="print">${icon('download')}Certificate PDF</button></span>
        </div>
        ${budget === 30000 ? html`<div class="no-print" style="margin-bottom:18px">${banner('warn', 'Sensitivity view, not the registered policy', 'Same decision rule with a 30-second p95 budget, for work nobody waits on. The registered default is 8 seconds.')}</div>` : ''}
        ${firebase.settings.policyError ? html`<div class="no-print" style="margin-bottom:18px">${banner('warn', 'Remote policy rejected', `${firebase.settings.policyError} The router is using a safe policy instead.`)}</div>` : ''}

        <article class="cert plate" aria-labelledby="cert-t">
          <header class="cert-h">
            <div><p class="caps">Certificate of calibration</p><h2 id="cert-t" class="cert-title">Tandem routing policy <span class="num">v${policy.version}</span></h2></div>
            <div class="cert-no"><span class="caps">Fingerprint · SHA-256</span><span class="mono" id="fp">${fp ? fp.slice(0, 16) : 'computing'}</span></div>
          </header>
          <dl class="cert-fields">
            <div><dt>Instrument</dt><dd>Tandem Studio probe, deterministic validators</dd></div>
            <div><dt>Measured on</dt><dd>${d.caption}</dd></div>
            <div><dt>Compiled</dt><dd class="num">${dateTime(policy.generatedAt)}</dd></div>
            <div><dt>Method</dt><dd>Local-first only if n ≥ <span class="num">${policy.params.minN}</span>, Wilson 95% lower bound ≥ <span class="num">${pct(policy.params.qualityFloor)}</span>, within <span class="num">${pct(policy.params.tolerance)}</span> of cloud, p95 ≤ <span class="num">${fmtMs(policy.params.latencyBudgetMs)}</span>.</dd></div>
            <div><dt>Sensitive content</dt><dd>${policy.privacy.sensitiveRoute.replace(/_/g, ' ').toLowerCase()}, whatever the measurements say</dd></div>
            <div><dt>Result</dt><dd><b class="num t-local">${lf}</b> local-first · <b class="num t-cloud">${24 - lf}</b> cloud-first, of 24 cells</dd></div>
          </dl>
          <p class="cert-motto">Measured, not guessed.</p>
          <div class="table-wrap"><table class="t cert-rules"><caption class="sr">Routing rules by task type and input length. Highlighted cells differ from the policy live in the router.</caption>
            <thead><tr><th>Task type</th>${LENGTH_BUCKETS.map(b => html`<th>${BUCKET_NAME[b]}</th>`)}</tr></thead><tbody>
            ${TASK_TYPES.map(t => html`<tr><th scope="row">${labelOf[t]}</th>${LENGTH_BUCKETS.map(b => {
              const r = policy!.rules.find(x => x.taskType === t && x.lengthBucket === b)!;
              const k = `${t}|${b}`;
              return html`<td class="${changed.has(k) ? 'is-diff' : ''}"><button class="cell" data-rule="${k}" aria-label="Evidence for ${labelOf[t]} ${BUCKET_NAME[b]}${changed.has(k) ? ', differs from the live policy' : ''}">${ruleChip(r.route, r.evidence.status)}<span class="cell-ev num"><span class="${changed.has(k) ? 'hl-swipe' : ''}">n ${r.evidence.n} · low ${pct(r.evidence.wilsonLoLocal)}</span></span></button></td>`;
            })}</tr>`)}
          </tbody></table></div>
          <footer class="cert-sign">
            <div><span class="sig">Tandem policy compiler</span><span class="caps">calibrated by</span></div>
            <div><span class="sig num">${d.results.length} runs</span><span class="caps">evidence base</span></div>
            <div><span class="sig">docs/POLICY_RULE.md</span><span class="caps">rule registered before data</span></div>
          </footer>
        </article>

        <section id="deploy" class="no-print" aria-labelledby="dep-t">
          <div class="sec"><h2 id="dep-t">Deploy</h2><span class="caps">4 · Remote Config</span></div>
          <div class="folio">
            <div>
              <div class="deploy-row">
                <div class="dv"><span class="caps">compiled here</span><span class="dvn num">v${policy.version}</span></div>
                <span class="dv-arrow" aria-hidden="true">→</span>
                <div class="dv"><span class="caps">live in the router · ${active}</span><span class="dvn num ${liveChanged.size ? 'hl-swipe' : ''}">v${live.version}</span></div>
              </div>
              <p class="muted" style="margin:14px 0 10px">${diff.changes.length ? html`<b class="num">${diff.changes.length}</b> rule${diff.changes.length === 1 ? '' : 's'} would change if you publish this certificate. They are highlighted above.` : 'The compiled policy matches the live rules.'}</p>
              ${diff.changes.length ? html`<ul class="diff-list">${diff.changes.slice(0, 12).map(c => html`<li><span>${labelOf[c.taskType]} · ${c.lengthBucket}</span><span class="mono"><span class="hl-swipe">${c.from === 'LOCAL_FIRST' ? 'local' : 'cloud'} → ${c.to === 'LOCAL_FIRST' ? 'local' : 'cloud'}</span></span></li>`)}${diff.changes.length > 12 ? html`<li class="faint">+${diff.changes.length - 12} more</li>` : ''}</ul>` : ''}
              ${liveChanged.size ? html`<p class="live-note" role="status"><span class="hl">Remote Config update received.</span> ${liveChanged.size} rule${liveChanged.size === 1 ? '' : 's'} changed in the router without a reload.</p>` : ''}
              <ol class="steps">
                <li>Download the template: <button class="btn btn-sm" id="export">${icon('download')}Remote Config template</button> <button class="btn btn-sm btn-ghost" id="copy">Copy JSON</button></li>
                <li>Firebase console → Remote Config → <span class="mono">tandem_policy_v1</span> → paste → Publish.</li>
                <li>Open apps receive it through <span class="mono">onConfigUpdate</span>. The version above rolls and changed rules are highlighted.</li>
              </ol>
            </div>
            <aside class="margin"><div class="mnote"><span class="caps">Why a certificate</span><span>The routing decision is only as good as its evidence. This document is the evidence, signed by its fingerprint: if any rule changes, so does the hash.</span></div></aside>
          </div>
        </section>

        <section class="no-print" aria-labelledby="sav-t">
          <div class="sec"><h2 id="sav-t">Savings simulator</h2><span class="caps">estimate</span></div>
          <p class="muted" style="margin-bottom:14px">Set your app's traffic mix. Lengths split 50% short, 35% medium, 15% long.</p>
          <div class="sliders">${TASK_TYPES.map(t => html`<label class="field"><span class="spread label"><span>${labelOf[t]}</span><span class="num" data-share-out="${t}">${shares[t]}</span></span><input type="range" min="0" max="40" value="${shares[t]}" data-share="${t}" aria-label="${labelOf[t]} share of traffic"></label>`)}</div>
          <div id="sav">${savings()}</div>
        </section>`.html;
      void fingerprint(policy).then(h => { fp = h; const el = root.querySelector('#fp'); if (el) el.textContent = h.slice(0, 16); });
      liveChanged = new Set();
    };

    root.addEventListener('input', e => {
      const t = e.target as HTMLInputElement;
      if (t.dataset.share) { shares[t.dataset.share] = Number(t.value); root.querySelector(`[data-share-out="${t.dataset.share}"]`)!.textContent = t.value; root.querySelector('#sav')!.innerHTML = savings().html; }
    });
    root.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      const dd = t.closest('[data-data]') as HTMLElement | null;
      if (dd && !dd.hasAttribute('disabled')) { pref = dd.dataset.data as DataChoice; paint(); return; }
      const bb = t.closest('[data-budget]') as HTMLElement | null;
      if (bb) { budget = Number(bb.dataset.budget) as 8000 | 30000; paint(); return; }
      const rr = t.closest('[data-rule]') as HTMLElement | null;
      if (rr && policy) { const [tt, b] = rr.dataset.rule!.split('|'); openEvidence(policy.rules.find(r => r.taskType === tt && r.lengthBucket === b)!, policy.params, label); return; }
      if (!policy) return;
      if (t.closest('#print')) print();
      if (t.closest('#use')) { await tandem.setMyPolicy(policy); toast(`Policy v${policy.version} is now live on this device`); }
      if (t.closest('#copy')) { await navigator.clipboard.writeText(JSON.stringify(policy, null, 2)).then(() => toast('Policy JSON copied'), () => toast('Clipboard blocked by the browser')); }
      if (t.closest('#export')) {
        const tpl = mergeIntoRemoteConfigTemplate({ parameters: {} }, policy);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(tpl, null, 2)], { type: 'application/json' }));
        a.download = `tandem-policy-v${policy.version}.remoteconfig.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      }
    });
    const unsub = tandem.subscribe(() => {
      // A live policy swap (Remote Config onConfigUpdate or "Use on this device"): highlight what moved.
      if (tandem.policy.version !== liveVersion) {
        const next = new Map(tandem.policy.rules.map(r => [`${r.taskType}|${r.lengthBucket}`, r.route]));
        const moved = new Set([...next].filter(([k, v]) => prevLive.get(k) !== v).map(([k]) => k));
        liveVersion = tandem.policy.version; prevLive = next;
        liveChanged = moved; // paint() renders the highlight once, then clears it
      }
      paint();
    });
    void tandem.whenReady().then(() => {
      paint();
      const id = location.hash.replace(/^#\/?/, '').split('?')[0];
      if (id === 'deploy') root.querySelector('#deploy')?.scrollIntoView({ block: 'start' });
      if (getParam('print') === '1') { history.replaceState(null, '', '#/policy'); setTimeout(() => print(), 400); }
    });
    paint();
    return unsub;
  }
};
export default screen;
