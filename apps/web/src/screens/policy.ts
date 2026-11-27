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

const screen: Screen = {
  title: 'Policy',
  crumb: 'Step 03 · Policy',
  render(root) {
    let pref = getParam('run');
    // The latency budget is the developer's choice. 8 s is the registered default (docs/POLICY_RULE.md).
    let budget: 8000 | 30000 = 8000;
    let policy: TandemPolicy | null = null;
    let label = '';
    const shares: Record<string, number> = Object.fromEntries(TASK_TYPES.map(t => [t, t === 'summarize' || t === 'rewrite' || t === 'classify' ? 20 : 8]));

    const savings = () => {
      if (!policy) return html``;
      const mix = TASK_TYPES.flatMap(t => LENGTH_BUCKETS.map(b => ({ taskType: t as TaskType, lengthBucket: b, share: shares[t] * BUCKET_MIX[b] })));
      const s = simulateSavings(policy, mix, { inPerMTok: firebase.settings.priceInPerMTok, outPerMTok: firebase.settings.priceOutPerMTok });
      return html`
        <div class="grid g4" style="margin-bottom:14px">
          <div class="card stat local"><div class="stat-k">Served on-device</div><div class="stat-v num">${pct(s.localShare)}</div><div class="stat-n">of requests, for this mix</div></div>
          <div class="card stat"><div class="stat-k">Cloud calls avoided</div><div class="stat-v num">${(s.cloudCallsAvoidedPer1M / 1000).toFixed(0)}<small>k / 1M</small></div><div class="stat-n">estimate</div></div>
          <div class="card stat"><div class="stat-k">Cost avoided</div><div class="stat-v num">$${s.estCostAvoidedPer1M.toFixed(2)}<small>/ 1M</small></div><div class="stat-n">estimate, of $${s.estCostAllCloudPer1M.toFixed(2)} all-cloud</div></div>
          <div class="card stat"><div class="stat-k">p50 latency change</div><div class="stat-v num">${s.p50LatencyDeltaMs === null ? '—' : (s.p50LatencyDeltaMs > 0 ? '+' : '') + fmtMs(s.p50LatencyDeltaMs)}</div><div class="stat-n">vs all-cloud, incl. escalations</div></div>
        </div>
        <ul class="faint" style="font-size:12px;margin:0 0 4px;padding-left:18px">${s.assumptions.map(a => html`<li>${a}</li>`)}<li>Prices: $${firebase.settings.priceInPerMTok}/M input, $${firebase.settings.priceOutPerMTok}/M output tokens (Remote Config). Check the current official Gemini API pricing page before relying on these.</li></ul>`;
    };

    const paint = () => {
      const d = chooseData(pref);
      label = d.label;
      const head = html`<header class="page-head">
        <h1 class="title">A routing policy <em>that can defend itself.</em></h1>
        <p class="lede">Every rule carries the measurements that justify it. Click a cell to see its evidence. Ship it to every user through Remote Config; the router swaps it live.</p>
      </header>`;
      if (!d.results.length) {
        root.innerHTML = html`${head}<div class="card">${empty('policy', 'Nothing to compile yet', 'Run the probe first, or switch to the reference run.', html`<a class="btn btn-primary" href="#/probe">${icon('race')}Run the probe</a>`)}</div>`.html;
        return;
      }
      policy = compilePolicy(d.results, { params: { latencyBudgetMs: budget }, previous: tandem.policy.source === 'studio' ? tandem.policy : undefined, device: { class: d.label, notes: d.caption } });
      const diff = diffPolicies(tandem.policy, policy);
      const active = tandem.policySource === 'remote-config' ? 'Remote Config (all users)' : tandem.policySource === 'my-compiled' ? 'your compiled policy (this device)' : 'built-in default';
      root.innerHTML = html`${head}
        <div class="spread" style="margin-bottom:12px"><div class="row">${dataToggle(d.choice)}<div class="seg" role="group" aria-label="Latency budget"><button data-budget="8000" aria-pressed="${budget === 8000}">Interactive · 8 s</button><button data-budget="30000" aria-pressed="${budget === 30000}">Background · 30 s</button></div></div><span class="faint" style="font-size:12.5px">${d.caption}</span></div>
        ${budget === 30000 ? banner('warn', 'Sensitivity view, not the registered policy', 'Same decision rule with a 30-second p95 budget, for work nobody waits on (summaries, tagging, overnight jobs). The registered default is 8 seconds.') : ''}
        ${firebase.settings.policyError ? banner('warn', 'Remote policy rejected', `${firebase.settings.policyError} The router is using a safe policy instead.`) : ''}
        <div class="grid g2" style="margin:14px 0 6px">
          <div class="card card-pad stack">
            <h2 style="font:600 14px var(--f-text)">Compiled from these measurements</h2>
            <div class="scoreline"><span>Policy <span class="num">v${policy.version}</span></span><span class="faint">·</span><span><span class="n-local num">${policy.rules.filter(r => r.route === 'LOCAL_FIRST').length}</span> local-first</span><span class="faint">·</span><span><span class="n-cloud num">${policy.rules.filter(r => r.route === 'CLOUD_FIRST').length}</span> cloud-first</span></div>
            <div class="muted" style="font-size:13px">Floor ${pct(policy.params.qualityFloor)} lower bound · tolerance ${pct(policy.params.tolerance)} · p95 budget ${fmtMs(policy.params.latencyBudgetMs)} · min n ${policy.params.minN}. Sensitive content: ${policy.privacy.sensitiveRoute.replace(/_/g, ' ').toLowerCase()}.</div>
            <div class="row" style="margin-top:6px">
              <button class="btn btn-primary" id="use">${icon('check')}Use on this device</button>
              <button class="btn" id="export">${icon('download')}Remote Config template</button>
              <button class="btn" id="copy">${icon('copy')}Copy JSON</button>
            </div>
          </div>
          <div class="card card-pad stack">
            <h2 style="font:600 14px var(--f-text)">Live in the router</h2>
            <div class="scoreline"><span>Policy <span class="num">v${tandem.policy.version}</span></span><span class="faint">·</span><span class="muted" style="font-size:.72em;font-family:var(--f-text)">${active}</span></div>
            <div class="muted" style="font-size:13px">${diff.changes.length ? `${diff.changes.length} rule${diff.changes.length === 1 ? '' : 's'} would change:` : 'The compiled policy matches the live rules.'}</div>
            <div class="row">${diff.changes.slice(0, 8).map(c => html`<span class="chip">${labelOf[c.taskType]} ${c.lengthBucket}: <b>${c.from === 'LOCAL_FIRST' ? 'local' : 'cloud'} → ${c.to === 'LOCAL_FIRST' ? 'local' : 'cloud'}</b></span>`)}${diff.changes.length > 8 ? html`<span class="chip">+${diff.changes.length - 8} more</span>` : ''}</div>
            <div class="faint" style="font-size:12px">To publish to every user: Firebase console → Remote Config → <span class="mono">tandem_policy_v1</span> → paste the JSON → Publish. Open apps pick it up in real time.</div>
          </div>
        </div>
        <h2 class="section-title">Rules</h2>
        <div class="card table-wrap"><table class="t"><thead><tr><th>Task type</th>${LENGTH_BUCKETS.map(b => html`<th>${b === 'S' ? 'Short' : b === 'M' ? 'Medium' : 'Long'}</th>`)}</tr></thead><tbody>
          ${TASK_TYPES.map(t => html`<tr><td style="font-weight:600">${labelOf[t]}</td>${LENGTH_BUCKETS.map(b => {
            const r = policy!.rules.find(x => x.taskType === t && x.lengthBucket === b)!;
            return html`<td><button class="btn btn-ghost btn-sm" style="padding:0;height:auto" data-rule="${t}|${b}" aria-label="Evidence for ${labelOf[t]} ${b}">${ruleChip(r.route, r.evidence.status)}</button><div class="faint num" style="font-size:11px;margin-top:4px">n ${r.evidence.n} · low ${pct(r.evidence.wilsonLoLocal)}</div></td>`;
          })}</tr>`)}
        </tbody></table></div>
        <h2 class="section-title">Savings simulator <span class="faint" style="font-size:16px;font-family:var(--f-text)">estimate</span></h2>
        <div class="card card-pad">
          <p class="muted" style="margin-bottom:14px">Set your app's traffic mix. Lengths are split 50% short, 35% medium, 15% long.</p>
          <div class="grid g4" style="margin-bottom:18px">${TASK_TYPES.map(t => html`<label class="field"><span class="spread label"><span>${labelOf[t]}</span><span class="num" data-share-out="${t}">${shares[t]}</span></span><input type="range" min="0" max="40" value="${shares[t]}" data-share="${t}" aria-label="${labelOf[t]} share of traffic"></label>`)}</div>
          <div id="sav">${savings()}</div>
        </div>`.html;
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
      if (t.closest('#use')) { await tandem.setMyPolicy(policy); toast(`Policy v${policy.version} is now live on this device`); paint(); }
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
    const unsub = tandem.subscribe(paint);
    void tandem.whenReady().then(paint);
    paint();
    return unsub;
  }
};
export default screen;
