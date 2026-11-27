import type { Screen } from '../main.js';
import { html, raw, fmtMs, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { empty, labelOf } from '../ui/components.js';
import { openEvidence, ruleChip } from '../ui/evidence.js';
import { chooseData, dataToggle, getParam, type DataChoice } from './data.js';
import { tandem } from '../services/tandem.js';
import { aggregate, compilePolicy, TASK_TYPES, LENGTH_BUCKETS, type CellStats, type TandemPolicy } from '@tandem/policy';

const W = 260, H = 170, PAD = { l: 34, r: 10, t: 10, b: 26 };
const X0 = Math.log10(150), X1 = Math.log10(40000);
const x = (ms: number) => PAD.l + ((Math.log10(Math.min(40000, Math.max(150, ms))) - X0) / (X1 - X0)) * (W - PAD.l - PAD.r);
const y = (p: number) => PAD.t + (1 - p) * (H - PAD.t - PAD.b);

function chart(type: string, cells: CellStats[], floor: number) {
  const marks: string[] = [];
  const grid: string[] = [];
  for (const v of [0, 0.5, 1]) grid.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" stroke="var(--rule)" stroke-width="1"/><text x="${PAD.l - 6}" y="${y(v) + 3.5}" text-anchor="end" font-size="9.5" fill="var(--ink-3)" font-family="var(--f-mono)">${v * 100}%</text>`);
  for (const ms of [300, 1000, 3000, 10000, 30000]) grid.push(`<line x1="${x(ms)}" x2="${x(ms)}" y1="${PAD.t}" y2="${H - PAD.b}" stroke="var(--rule)" stroke-dasharray="1 3"/><text x="${x(ms)}" y="${H - PAD.b + 13}" text-anchor="middle" font-size="9.5" fill="var(--ink-3)" font-family="var(--f-mono)">${ms < 1000 ? ms + 'ms' : ms / 1000 + 's'}</text>`);
  grid.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(floor)}" y2="${y(floor)}" stroke="var(--ink-3)" stroke-dasharray="4 3"/><text x="${W - PAD.r}" y="${y(floor) - 4}" text-anchor="end" font-size="9" fill="var(--ink-3)" font-family="var(--f-mono)">floor</text>`);
  for (const c of cells.filter(c => c.taskType === type)) {
    const b = c.lengthBucket;
    const L = c.local, C = c.cloud;
    if (C.n && C.passRate !== null && C.p50Ms !== null) {
      const cx = x(C.p50Ms), cy = y(C.passRate);
      marks.push(`<g><title>Cloud · length ${b} · pass ${pct(C.passRate)} (n=${C.n}) · p50 ${fmtMs(C.p50Ms)}</title><rect x="${cx - 5}" y="${cy - 5}" width="10" height="10" rx="2" fill="var(--cloud)" stroke="var(--card)" stroke-width="2"/><text x="${cx + 8}" y="${cy + 3.5}" font-size="9.5" fill="var(--ink-2)" font-family="var(--f-mono)">${b}</text><rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" fill="transparent"/></g>`);
    }
    if (L.n && L.passRate !== null && L.p50Ms !== null) {
      const cx = x(L.p50Ms), cy = y(L.passRate);
      const lo = y(L.wilsonLo ?? L.passRate), hi = y(L.wilsonHi ?? L.passRate);
      marks.push(`<g><title>On-device · length ${b} · pass ${pct(L.passRate)} (n=${L.n}, 95% ${pct(L.wilsonLo)}–${pct(L.wilsonHi)}) · p50 ${fmtMs(L.p50Ms)}</title><line x1="${cx}" x2="${cx}" y1="${hi}" y2="${lo}" stroke="var(--local)" stroke-width="2" stroke-linecap="round" opacity="0.55"/><circle cx="${cx}" cy="${cy}" r="5.5" fill="var(--local)" stroke="var(--card)" stroke-width="2"/><text x="${cx - 8}" y="${cy + 3.5}" text-anchor="end" font-size="9.5" fill="var(--ink-2)" font-family="var(--f-mono)">${b}</text><circle cx="${cx}" cy="${cy}" r="12" fill="transparent"/></g>`);
    }
  }
  return raw(`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${labelOf[type]}: pass rate against median latency, on-device and cloud, by input length">${grid.join('')}${marks.join('')}</svg>`);
}

const screen: Screen = {
  title: 'Frontier',
  crumb: 'Step 02 · Frontier',
  render(root) {
    let pref: string | null = getParam('run');
    let view: 'chart' | 'table' = 'chart';
    let policy: TandemPolicy | null = null;
    let label = '';

    const paint = () => {
      const d = chooseData(pref);
      label = d.label;
      const head = html`<header class="page-head">
        <h1 class="title">Where the local model <em>wins, and where it doesn't.</em></h1>
        <p class="lede">Each panel is one task type. Amber circles are on-device, cobalt squares are cloud; S, M and L are input lengths. Up is more tasks passed, left is faster. Whiskers are 95% Wilson intervals. Losses are shown, not hidden.</p>
      </header>`;
      if (!d.results.length) {
        root.innerHTML = html`${head}<div class="card">${empty('frontier', 'No measurements yet', 'Run the probe on this device, or use the reference run bundled with the app.', html`<a class="btn btn-primary" href="#/probe">${icon('race')}Run the probe</a>`)}</div>`.html;
        return;
      }
      const { cells } = aggregate(d.results);
      policy = compilePolicy(d.results, { device: { class: d.label, notes: d.caption } });
      const floor = policy.params.qualityFloor;
      const summary = TASK_TYPES.map(t => {
        const rs = policy!.rules.filter(r => r.taskType === t);
        const lf = rs.filter(r => r.route === 'LOCAL_FIRST').length;
        return { t, lf, rule: rs.find(r => r.lengthBucket === 'S')! };
      });
      const localCells = policy.rules.filter(r => r.route === 'LOCAL_FIRST').length;
      root.innerHTML = html`${head}
        <div class="spread" style="margin-bottom:14px">
          <div class="row">${dataToggle(d.choice)}<div class="seg" role="group" aria-label="View"><button data-view="chart" aria-pressed="${view === 'chart'}">Charts</button><button data-view="table" aria-pressed="${view === 'table'}">Table</button></div></div>
          <div class="row" style="font-size:12.5px">
            <span class="row" style="gap:6px"><svg width="12" height="12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="var(--local)"/></svg>On-device</span>
            <span class="row" style="gap:6px"><svg width="12" height="12" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="2" fill="var(--cloud)"/></svg>Cloud</span>
            <span class="row faint" style="gap:6px"><svg width="20" height="8" aria-hidden="true"><line x1="0" x2="20" y1="4" y2="4" stroke="currentColor" stroke-dasharray="4 3"/></svg>quality floor ${pct(floor)}</span>
          </div>
        </div>
        <p class="faint" style="font-size:12.5px;margin-bottom:14px">${icon('info')} ${d.caption}. ${d.results.length} runs.</p>
        <div class="card card-pad" style="margin-bottom:16px"><div class="scoreline"><span>Compiled: <span class="n-local num">${localCells}</span> of 24 cells local-first</span><span class="faint">·</span><span class="muted" style="font-size:.7em;font-family:var(--f-text)">the rest stay cloud-first until the evidence clears the bar</span></div></div>
        ${view === 'chart' ? html`<div class="multiples">${summary.map(s => html`<button class="mult" data-type="${s.t}" aria-label="Open evidence for ${labelOf[s.t]}">
            <div class="mh"><span class="mt">${labelOf[s.t]}</span>${ruleChip(s.lf ? 'LOCAL_FIRST' : 'CLOUD_FIRST')}</div>
            ${chart(s.t, cells, floor)}
            <div class="faint" style="font-size:11.5px">${s.lf} of 3 lengths local-first</div></button>`)}</div>`
        : html`<div class="card table-wrap"><table class="t"><thead><tr><th>Task</th><th>Len</th><th>Rule</th><th>n</th><th>Local pass</th><th>95% low</th><th>Cloud pass</th><th>Local p50</th><th>Cloud p50</th></tr></thead><tbody>
            ${policy.rules.map(r => html`<tr class="clickable" data-rule="${r.taskType}|${r.lengthBucket}" tabindex="0"><td>${labelOf[r.taskType]}</td><td class="num">${r.lengthBucket}</td><td>${ruleChip(r.route, r.evidence.status)}</td><td class="num">${r.evidence.n}</td><td class="num">${pct(r.evidence.passLocal)}</td><td class="num">${pct(r.evidence.wilsonLoLocal)}</td><td class="num">${pct(r.evidence.passCloud)}</td><td class="num">${fmtMs(r.evidence.p50Local)}</td><td class="num">${fmtMs(r.evidence.p50Cloud)}</td></tr>`)}
          </tbody></table></div>`}
        <div class="row" style="justify-content:flex-end;margin-top:20px"><a class="btn btn-primary" href="#/policy?run=${d.choice}">${icon('policy')}Compile this into a policy</a></div>`.html;
    };

    root.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const dd = t.closest('[data-data]') as HTMLElement | null;
      if (dd && !dd.hasAttribute('disabled')) { pref = dd.dataset.data as DataChoice; paint(); return; }
      const v = t.closest('[data-view]') as HTMLElement | null;
      if (v) { view = v.dataset.view as 'chart' | 'table'; paint(); return; }
      const m = t.closest('[data-type]') as HTMLElement | null;
      if (m && policy) {
        const rules = policy.rules.filter(r => r.taskType === m.dataset.type);
        const best = rules.find(r => r.route === 'LOCAL_FIRST') ?? rules.find(r => r.evidence.n > 0) ?? rules[0];
        openEvidence(best, policy.params, label);
      }
      const row = t.closest('[data-rule]') as HTMLElement | null;
      if (row && policy) { const [tt, b] = row.dataset.rule!.split('|'); openEvidence(policy.rules.find(r => r.taskType === tt && r.lengthBucket === b)!, policy.params, label); }
    });
    root.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') (e.target as HTMLElement).closest('[data-rule]') && (e.target as HTMLElement).click(); });
    const unsub = tandem.subscribe(paint);
    void tandem.whenReady().then(paint);
    paint();
    void LENGTH_BUCKETS;
    return unsub;
  }
};
export default screen;
