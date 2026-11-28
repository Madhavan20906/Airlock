import { html, fmtMs, pct } from './dom.js';
import { glyph } from './glyphs.js';
import { labelOf, checkChip } from './components.js';
import type { PolicyRule, CompileParams } from '@tandem/policy';

/** A compiled rule, stamped: disc for local-first/local-only, ring for cloud-first/cloud-only. */
export function ruleChip(route: PolicyRule['route'], status?: string) {
  const local = route === 'LOCAL_FIRST' || route === 'LOCAL_ONLY';
  const label = route === 'LOCAL_FIRST' ? 'Local-first' : route === 'CLOUD_FIRST' ? 'Cloud-first' : route === 'LOCAL_ONLY' ? 'Local only' : 'Cloud only';
  const thin = status === 'insufficient_evidence';
  return html`<span class="stamp ${local ? 'local' : 'cloud'} ${thin ? 'thin' : ''}" role="img" aria-label="Rule: ${label}${thin ? ', insufficient evidence' : ''}">${glyph(local ? 'local' : 'cloud')}${label}${thin ? html`<span class="sub">· n low</span>` : ''}</span>`;
}

function cond(ok: boolean | null, text: unknown) {
  return html`<li class="cond">${checkChip(ok === null ? 'not reached' : ok ? 'holds' : 'fails', ok)}<span>${text}</span></li>`;
}

let returnFocus: HTMLElement | null = null;
export function openEvidence(rule: PolicyRule, params: CompileParams, sourceLabel: string) {
  const ev = rule.evidence;
  document.querySelector('.scrim')?.remove();
  document.querySelector('.drawer')?.remove();
  returnFocus = document.activeElement as HTMLElement | null;
  const scrim = document.createElement('div');
  scrim.className = 'scrim';
  const d = document.createElement('aside');
  d.className = 'drawer evidence';
  d.setAttribute('role', 'dialog');
  d.setAttribute('aria-modal', 'true');
  d.setAttribute('aria-label', `Evidence for ${labelOf[rule.taskType]} ${rule.lengthBucket}`);
  const nOk = ev.n >= params.minN;
  const loOk = ev.wilsonLoLocal !== null && ev.wilsonLoLocal >= params.qualityFloor;
  const tolOk = ev.passCloud === null ? null : (ev.passLocal ?? 0) >= ev.passCloud - params.tolerance;
  const latOk = ev.p95Local === null ? null : ev.p95Local <= params.latencyBudgetMs;
  d.innerHTML = html`
    <div class="spread"><span class="caps">Evidence · ${sourceLabel}</span><button class="btn btn-sm btn-ghost" data-close>Close</button></div>
    <h2 class="ev-title">${labelOf[rule.taskType]} <em>length ${rule.lengthBucket}</em></h2>
    <div class="row" style="margin:12px 0 16px">${ruleChip(rule.route, ev.status)}<span class="chip">${ev.status.replace(/_/g, ' ')}</span><span class="chip">timeout <b>${fmtMs(rule.timeoutMs)}</b></span></div>
    <p class="ann-why" style="margin-bottom:22px">${ev.why}</p>
    <div class="readouts ev-r">
      <div class="readout local"><div class="caps">${glyph('local')} on-device pass</div><div class="rv num">${pct(ev.passLocal)}</div><div class="rn">95% ${pct(ev.wilsonLoLocal)} – ${pct(ev.wilsonHiLocal)} · n ${ev.n}</div></div>
      <div class="readout cloud"><div class="caps">${glyph('cloud')} cloud pass</div><div class="rv num">${pct(ev.passCloud)}</div><div class="rn">n ${ev.nCloud}</div></div>
    </div>
    <table class="t" style="margin:18px 0 24px"><caption class="sr">Quality and latency, on-device against cloud</caption><thead><tr><th></th><th class="r">On-device</th><th class="r">Cloud</th></tr></thead><tbody>
      <tr><td>Mean quality</td><td class="num r">${pct(ev.qLocal, 1)}</td><td class="num r">${pct(ev.qCloud, 1)}</td></tr>
      <tr><td>p50 latency</td><td class="num r">${fmtMs(ev.p50Local)}</td><td class="num r">${fmtMs(ev.p50Cloud)}</td></tr>
      <tr><td>p95 latency</td><td class="num r">${fmtMs(ev.p95Local)}</td><td class="num r">${fmtMs(ev.p95Cloud)}</td></tr>
      <tr><td>Cloud tokens avoided / 1k requests</td><td class="num r" colspan="2">${ev.estCloudTokensAvoidedPer1k.toLocaleString()} <span class="faint">estimate</span></td></tr>
    </tbody></table>
    <div class="sec" style="margin:0 0 10px"><h2 style="font-size:20px">Decision rule</h2><span class="caps">fixed before any data</span></div>
    <ul class="conds">
      ${cond(nOk, html`At least <b>${params.minN}</b> distinct tasks <span class="faint num">(have ${ev.n})</span>`)}
      ${cond(nOk ? loOk : null, html`Wilson 95% lower bound ≥ <b>${pct(params.qualityFloor)}</b> <span class="faint num">(${pct(ev.wilsonLoLocal)})</span>`)}
      ${cond(nOk ? tolOk : null, html`Local within <b>${pct(params.tolerance)}</b> of cloud <span class="faint num">(${pct(ev.passLocal)} vs ${pct(ev.passCloud)})</span>`)}
      ${cond(nOk ? latOk : null, html`Local p95 ≤ <b>${fmtMs(params.latencyBudgetMs)}</b> <span class="faint num">(${fmtMs(ev.p95Local)})</span>`)}
    </ul>
    <p class="meta" style="margin-top:14px">All four must hold for local-first. Local-first still validates every answer and escalates to the cloud when a check fails (${rule.escalateOn.join(', ')}). See docs/POLICY_RULE.md.</p>`.html;
  const close = () => { scrim.remove(); d.remove(); removeEventListener('keydown', onKey); returnFocus?.focus?.(); };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // keep focus inside the sheet
      const f = [...d.querySelectorAll<HTMLElement>('button, a[href], [tabindex="0"]')];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  scrim.addEventListener('click', close);
  d.addEventListener('click', e => { if ((e.target as Element).closest('[data-close]')) close(); });
  addEventListener('keydown', onKey);
  document.body.append(scrim, d);
  (d.querySelector('[data-close]') as HTMLElement).focus();
}
