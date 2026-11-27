import { html, fmtMs, pct } from './dom.js';
import { icon } from './icons.js';
import { labelOf } from './components.js';
import type { PolicyRule, CompileParams } from '@tandem/policy';

export function ruleChip(route: PolicyRule['route'], status?: string) {
  const local = route === 'LOCAL_FIRST' || route === 'LOCAL_ONLY';
  const label = route === 'LOCAL_FIRST' ? 'Local-first' : route === 'CLOUD_FIRST' ? 'Cloud-first' : route === 'LOCAL_ONLY' ? 'Local only' : 'Cloud only';
  return html`<span class="route ${local ? 'local' : 'cloud'}" role="img" aria-label="Rule: ${label}${status === 'insufficient_evidence' ? ', insufficient evidence' : ''}">${icon(local ? 'chip' : 'cloud')}${label}${status === 'insufficient_evidence' ? html`<span style="opacity:.7;font-weight:500">· n too small</span>` : ''}</span>`;
}

function cond(ok: boolean | null, text: unknown) {
  return html`<li class="row" style="gap:8px;align-items:flex-start;flex-wrap:nowrap"><span class="check ${ok === null ? '' : ok ? 'pass' : 'fail'}" style="flex:none">${ok === null ? '–' : icon(ok ? 'check' : 'x')}</span><span>${text}</span></li>`;
}

export function openEvidence(rule: PolicyRule, params: CompileParams, sourceLabel: string) {
  const ev = rule.evidence;
  document.querySelector('.scrim')?.remove();
  document.querySelector('.drawer')?.remove();
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const d = document.createElement('aside');
  d.className = 'drawer';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('aria-label', `Evidence for ${labelOf[rule.taskType]} ${rule.lengthBucket}`);
  const nOk = ev.n >= params.minN;
  const loOk = ev.wilsonLoLocal !== null && ev.wilsonLoLocal >= params.qualityFloor;
  const tolOk = ev.passCloud === null ? null : (ev.passLocal ?? 0) >= ev.passCloud - params.tolerance;
  const latOk = ev.p95Local === null ? null : ev.p95Local <= params.latencyBudgetMs;
  d.innerHTML = html`
    <div class="spread" style="margin-bottom:18px"><span class="meta">Evidence from ${sourceLabel}</span><button class="btn btn-ghost btn-sm" data-close aria-label="Close">${icon('x')}Close</button></div>
    <h2 style="font:400 34px/1.05 var(--f-display)">${labelOf[rule.taskType]} <span class="faint">· length ${rule.lengthBucket}</span></h2>
    <div class="row" style="margin:14px 0 18px">${ruleChip(rule.route, ev.status)}<span class="chip">${ev.status.replace(/_/g, ' ')}</span><span class="chip">timeout <b>${fmtMs(rule.timeoutMs)}</b></span></div>
    <p class="callout" style="margin-bottom:22px">${ev.why}</p>
    <div class="grid g2" style="margin-bottom:22px">
      <div class="card stat local"><div class="stat-k">On-device pass rate</div><div class="stat-v num">${pct(ev.passLocal)}</div><div class="stat-n">95% interval ${pct(ev.wilsonLoLocal)} – ${pct(ev.wilsonHiLocal)} · n = ${ev.n}</div></div>
      <div class="card stat cloud"><div class="stat-k">Cloud pass rate</div><div class="stat-v num">${pct(ev.passCloud)}</div><div class="stat-n">n = ${ev.nCloud}</div></div>
    </div>
    <div class="table-wrap card" style="margin-bottom:22px"><table class="t"><thead><tr><th></th><th>On-device</th><th>Cloud</th></tr></thead><tbody>
      <tr><td>Mean quality</td><td class="num">${pct(ev.qLocal, 1)}</td><td class="num">${pct(ev.qCloud, 1)}</td></tr>
      <tr><td>p50 latency</td><td class="num">${fmtMs(ev.p50Local)}</td><td class="num">${fmtMs(ev.p50Cloud)}</td></tr>
      <tr><td>p95 latency</td><td class="num">${fmtMs(ev.p95Local)}</td><td class="num">${fmtMs(ev.p95Cloud)}</td></tr>
      <tr><td>Cloud tokens avoided per 1k requests</td><td class="num" colspan="2">${ev.estCloudTokensAvoidedPer1k.toLocaleString()} <span class="faint">(estimate)</span></td></tr>
    </tbody></table></div>
    <h3 style="font:600 13px var(--f-text);margin-bottom:10px">Decision rule (fixed before any data, see docs/POLICY_RULE.md)</h3>
    <ul class="stack" style="list-style:none;padding:0;margin:0 0 18px">
      ${cond(nOk, html`At least <b>${params.minN}</b> distinct tasks <span class="faint">(have ${ev.n})</span>`)}
      ${cond(nOk ? loOk : null, html`Wilson 95% lower bound ≥ <b>${pct(params.qualityFloor)}</b> <span class="faint">(${pct(ev.wilsonLoLocal)})</span>`)}
      ${cond(nOk ? tolOk : null, html`Local within <b>${pct(params.tolerance)}</b> of cloud <span class="faint">(${pct(ev.passLocal)} vs ${pct(ev.passCloud)})</span>`)}
      ${cond(nOk ? latOk : null, html`Local p95 ≤ <b>${fmtMs(params.latencyBudgetMs)}</b> <span class="faint">(${fmtMs(ev.p95Local)})</span>`)}
    </ul>
    <p class="faint" style="font-size:12.5px">All four must hold for local-first. Local-first still validates every answer and escalates to the cloud when a check fails (${rule.escalateOn.join(', ')}).</p>`.html;
  const close = () => { scrim.remove(); d.remove(); removeEventListener('keydown', onKey); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  scrim.addEventListener('click', close);
  d.addEventListener('click', e => { if ((e.target as Element).closest('[data-close]')) close(); });
  addEventListener('keydown', onKey);
  document.body.append(scrim, d);
  (d.querySelector('[data-close]') as HTMLElement).focus();
}
