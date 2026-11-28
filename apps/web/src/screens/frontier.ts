import type { Screen } from '../main.js';
import { html, raw, fmtMs, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyph } from '../ui/glyphs.js';
import { empty, labelOf } from '../ui/components.js';
import { openEvidence, ruleChip, blocker } from '../ui/evidence.js';
import { chooseData, dataToggle, getParam, type DataChoice } from './data.js';
import { tandem } from '../services/tandem.js';
import { aggregate, compilePolicy, TASK_TYPES, type CellStats, type TandemPolicy } from '@tandem/policy';

const W = 300, H = 210, PAD = { l: 36, r: 14, t: 14, b: 28 };
const X0 = Math.log10(150), X1 = Math.log10(40000);
const x = (ms: number) => PAD.l + ((Math.log10(Math.min(40000, Math.max(150, ms))) - X0) / (X1 - X0)) * (W - PAD.l - PAD.r);
// 8% headroom above 100% so marks at the ceiling are not clipped by the frame
const y = (p: number) => PAD.t + (1.08 - p) / 1.08 * (H - PAD.t - PAD.b);
let swept = false; // the plotting sweep plays once per session

function plate(type: string, cells: CellStats[], floor: number) {
  const g: string[] = [];
  for (let k = 0; k <= 10; k++) {
    const v = k / 10, major = k === 0 || k === 5 || k === 10;
    g.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(v)}" y2="${y(v)}" class="${major ? 'pg-maj' : 'pg-min'}"/>`);
    if (major) g.push(`<text x="${PAD.l - 6}" y="${y(v) + 3}" text-anchor="end" class="pg-lab">${k * 10}%</text>`);
  }
  for (const ms of [200, 300, 500, 1000, 2000, 3000, 5000, 10000, 20000, 30000]) {
    const major = [300, 1000, 3000, 10000, 30000].includes(ms);
    g.push(`<line x1="${x(ms)}" x2="${x(ms)}" y1="${PAD.t}" y2="${H - PAD.b}" class="${major ? 'pg-maj' : 'pg-min'}"/>`);
    if (major) g.push(`<line x1="${x(ms)}" x2="${x(ms)}" y1="${H - PAD.b}" y2="${H - PAD.b + 4}" class="pg-axis"/><text x="${x(ms)}" y="${H - PAD.b + 14}" text-anchor="middle" class="pg-lab">${ms < 1000 ? ms + 'ms' : ms / 1000 + 's'}</text>`);
  }
  g.push(`<rect x="${PAD.l}" y="${PAD.t}" width="${W - PAD.l - PAD.r}" height="${H - PAD.t - PAD.b}" class="pg-frame"/>`);
  g.push(`<line x1="${PAD.l}" x2="${W - PAD.r}" y1="${y(floor)}" y2="${y(floor)}" class="pg-floor"/><text x="${W - PAD.r - 3}" y="${y(floor) - 4}" text-anchor="end" class="pg-lab">floor ${Math.round(floor * 100)}%</text>`);
  const marks: string[] = [];
  let i = 0;
  for (const c of cells.filter(c => c.taskType === type)) {
    const b = c.lengthBucket, L = c.local, C = c.cloud;
    if (C.n && C.passRate !== null && C.p50Ms !== null) {
      const cx = x(C.p50Ms), cy = y(C.passRate);
      marks.push(`<g class="pt cloud" style="--i:${i++}" tabindex="0" role="button" data-rule="${type}|${b}" data-tip="Cloud · length ${b}|pass ${pct(C.passRate)} · n ${C.n}|p50 ${fmtMs(C.p50Ms)}" aria-label="Cloud, length ${b}: pass ${pct(C.passRate)} of ${C.n}, median ${fmtMs(C.p50Ms)}. Open evidence."><circle cx="${cx}" cy="${cy}" r="5" class="ring"/><text x="${cx + 7}" y="${cy - 7}" class="pg-pt">${b}</text><circle cx="${cx}" cy="${cy}" r="13" class="hit"/></g>`);
    }
    if (L.n && L.passRate !== null && L.p50Ms !== null) {
      const cx = x(L.p50Ms), cy = y(L.passRate);
      const lo = y(L.wilsonLo ?? L.passRate), hi = y(L.wilsonHi ?? L.passRate);
      marks.push(`<g class="pt local" style="--i:${i++}" tabindex="0" role="button" data-rule="${type}|${b}" data-tip="On-device · length ${b}|pass ${pct(L.passRate)} · n ${L.n}|95% ${pct(L.wilsonLo)}–${pct(L.wilsonHi)}|p50 ${fmtMs(L.p50Ms)}" aria-label="On-device, length ${b}: pass ${pct(L.passRate)} of ${L.n}, 95% interval ${pct(L.wilsonLo)} to ${pct(L.wilsonHi)}, median ${fmtMs(L.p50Ms)}. Open evidence."><path d="M${cx} ${hi}V${lo}M${cx - 4} ${hi}h8M${cx - 4} ${lo}h8" class="whisk"/><circle cx="${cx}" cy="${cy}" r="5.2" class="disc"/><text x="${cx}" y="${lo + 11}" text-anchor="middle" class="pg-pt">${b}</text><circle cx="${cx}" cy="${cy}" r="13" class="hit"/></g>`);
    }
  }
  return raw(`<svg class="plate-svg" viewBox="0 0 ${W} ${H}" role="group" aria-label="${labelOf[type]}: pass rate against median latency, on-device and cloud, by input length">${g.join('')}${marks.join('')}</svg>`);
}

const screen: Screen = {
  title: 'Frontier',
  crumb: 'Pipeline · 2 Frontier',
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
        <p class="lede">One plate per task type. Up is more tasks passed, left is faster. Filled discs are on-device, rings are cloud; S, M and L are input lengths. Whiskers are 95% Wilson intervals.</p>
      </header>`;
      if (!d.results.length) {
        root.innerHTML = html`${head}<div class="plate">${empty('frontier', 'No measurements yet', 'Run the probe on this device, or use the reference run bundled with the app.', html`<a class="btn btn-primary" href="#/probe">${icon('play')}Run the probe</a>`)}</div>`.html;
        return;
      }
      const { cells } = aggregate(d.results);
      policy = compilePolicy(d.results, { device: { class: d.label, notes: d.caption } });
      const floor = policy.params.qualityFloor;
      const localCells = policy.rules.filter(r => r.route === 'LOCAL_FIRST').length;
      const sweep = !swept; swept = true;
      root.innerHTML = html`${head}
        <div class="probe-ctl">
          ${dataToggle(d.choice)}
          <div class="seg" role="group" aria-label="View"><button data-view="chart" aria-pressed="${view === 'chart'}">Plates</button><button data-view="table" aria-pressed="${view === 'table'}">Table</button></div>
          <span class="legend-line" style="margin:0 0 0 auto"><span>${glyph('local')} on-device ± 95%</span><span class="c">${glyph('cloud')} cloud</span><span>- - - floor ${pct(floor)}</span></span>
        </div>
        <div class="folio">
          <div>
            <p class="verdict"><span class="vn num t-local">${localCells}</span><span>of 24 cells compile to local-first.</span><span class="muted">The rest stay cloud-first until the evidence clears the bar.</span></p>
            ${view === 'chart' ? html`<div class="plates ${sweep ? 'sweep' : ''}">${TASK_TYPES.map(t => {
                const rs = policy!.rules.filter(r => r.taskType === t);
                const lf = rs.filter(r => r.route === 'LOCAL_FIRST').length;
                return html`<figure class="fplate plate"><figcaption><span class="ft">${labelOf[t]}</span>${ruleChip(lf ? 'LOCAL_FIRST' : 'CLOUD_FIRST')}</figcaption>
                  ${plate(t, cells, floor)}
                  <div class="fmeta"><span>${lf} of 3 lengths local-first${(() => { const why = [...new Set(rs.map(r => blocker(r, policy!.params)?.split(' ')[0]).filter(Boolean))]; return why.length ? ` · held back by ${why.join(', ')}` : ''; })()}</span><button class="btn btn-sm btn-ghost" data-type="${t}">Evidence</button></div></figure>`;
              })}</div>`
            : html`<div class="table-wrap"><table class="t"><caption class="sr">Every cell's evidence</caption><thead><tr><th>Task</th><th>Len</th><th>Rule</th><th class="r">n</th><th class="r">Local pass</th><th class="r">95% low</th><th class="r">Cloud pass</th><th class="r">Local p50</th><th class="r">Cloud p50</th></tr></thead><tbody>
                ${policy.rules.map(r => html`<tr class="clickable" data-rule="${r.taskType}|${r.lengthBucket}" tabindex="0"><td>${labelOf[r.taskType]}</td><td class="num">${r.lengthBucket}</td><td>${ruleChip(r.route, r.evidence.status)}</td><td class="num r">${r.evidence.n}</td><td class="num r">${pct(r.evidence.passLocal)}</td><td class="num r">${pct(r.evidence.wilsonLoLocal)}</td><td class="num r">${pct(r.evidence.passCloud)}</td><td class="num r">${fmtMs(r.evidence.p50Local)}</td><td class="num r">${fmtMs(r.evidence.p50Cloud)}</td></tr>`)}
              </tbody></table></div>`}
            <div class="next-step"><span class="muted">Every point opens its evidence. The compiler uses exactly these numbers.</span><a class="btn btn-primary" href="#/policy?run=${d.choice}">${icon('policy')}3 · Compile the policy</a></div>
          </div>
          <aside class="margin">
            <div class="mnote"><span class="caps">Data</span><span>${d.caption}.</span><span class="num faint">${d.results.length} runs</span></div>
            <div class="mnote"><span class="caps">Reading a plate</span><span>A disc above the floor and level with its ring is a task the local model can take. A long whisker means too few samples to be sure, so the rule stays cloud-first.</span></div>
            <div class="mnote"><span class="caps">Keyboard</span><span>Tab to any point; Enter opens its evidence.</span></div>
          </aside>
        </div>
        <div class="loupe" id="loupe" hidden></div>`.html;
    };

    const open = (tt: string, b: string) => { if (policy) openEvidence(policy.rules.find(r => r.taskType === tt && r.lengthBucket === b)!, policy.params, label); };
    root.addEventListener('click', e => {
      const t = e.target as Element;
      const dd = t.closest('[data-data]') as HTMLElement | null;
      if (dd && !dd.hasAttribute('disabled')) { pref = dd.dataset.data as DataChoice; paint(); return; }
      const v = t.closest('[data-view]') as HTMLElement | null;
      if (v) { view = v.dataset.view as 'chart' | 'table'; paint(); return; }
      const m = t.closest('[data-type]') as HTMLElement | null;
      if (m && policy) {
        const rules = policy.rules.filter(r => r.taskType === m.dataset.type);
        const best = rules.find(r => r.route === 'LOCAL_FIRST') ?? rules.find(r => r.evidence.n > 0) ?? rules[0];
        openEvidence(best, policy.params, label); return;
      }
      const row = t.closest('[data-rule]') as HTMLElement | null;
      if (row) { const [tt, b] = row.dataset.rule!.split('|'); open(tt, b); }
    });
    root.addEventListener('keydown', e => {
      const k = (e as KeyboardEvent).key;
      const row = (e.target as Element).closest('[data-rule]') as HTMLElement | null;
      if (row && (k === 'Enter' || k === ' ')) { e.preventDefault(); const [tt, b] = row.dataset.rule!.split('|'); open(tt, b); }
    });
    // Loupe: the evidence for a point, magnified beside it
    const showLoupe = (el: Element | null) => {
      const lp = root.querySelector('#loupe') as HTMLElement | null;
      if (!lp) return;
      const pt = el?.closest('.pt') as SVGGElement | null;
      if (!pt) { lp.hidden = true; return; }
      const [h, ...rest] = (pt.dataset.tip ?? '').split('|');
      lp.innerHTML = html`<b>${h}</b>${rest.map(r => html`<span>${r}</span>`)}<em>click or Enter: evidence</em>`.html;
      const r = pt.getBoundingClientRect();
      lp.hidden = false;
      lp.style.left = `${Math.min(innerWidth - 220, r.right + 12)}px`;
      lp.style.top = `${Math.max(8, r.top - 8)}px`;
    };
    root.addEventListener('pointerover', e => showLoupe(e.target as Element));
    root.addEventListener('focusin', e => showLoupe(e.target as Element));
    root.addEventListener('focusout', () => showLoupe(null));
    const hide = () => showLoupe(null);
    addEventListener('scroll', hide, { passive: true });
    const unsub = tandem.subscribe(paint);
    void tandem.whenReady().then(paint);
    paint();
    return () => { unsub(); removeEventListener('scroll', hide); };
  }
};
export default screen;
