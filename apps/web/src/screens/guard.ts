import type { Screen } from '../main.js';
import { html, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { bar } from '../ui/components.js';
import { runLeakLab, runDeterministicDetectors, redactText, type LeakLabReport, type LeakOutcome } from '@tandem/guard';

const visible = (s: string) => s.replace(/[​-‍﻿]/g, '⁣·').replace(/\n/g, '⏎\n');

const screen: Screen = {
  title: 'Guard Lab',
  crumb: 'Use · Guard Lab',
  render(root) {
    let report: LeakLabReport | null = null;
    let ms = 0;
    let filter: LeakOutcome | 'all' = 'missed';
    let own = 'Bhai mera PAN B Q K P S 4 8 2 1 L hai, aur Aadhaar ४७१२ ०९३८ ५६१८. Account 5010-0488-2177-63.';

    const ownResult = () => {
      try {
        const ents = runDeterministicDetectors(own);
        const r = redactText(own, ents);
        return html`<pre class="payload" aria-label="What would leave the device">${r.sanitizedText.split(/(\[[A-Z_]+_\d+\])/).map(p => /^\[[A-Z_]+_\d+\]$/.test(p) ? html`<mark>${p}</mark>` : p)}</pre><div class="row">${ents.map(e => html`<span class="chip">${e.type}</span>`)}</div>`;
      } catch (e: any) {
        return html`<div class="banner bad">${icon('lock')}<div><strong>Blocked by the verifier.</strong> <span class="muted">${String(e?.message ?? e)}. Nothing would be sent.</span></div></div>`;
      }
    };

    const paint = () => {
      const r = report;
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">We attack our own redactor. <em>Here is the scoreboard.</em></h1>
          <p class="lede">Tandem Guard keeps sensitive identifiers on-device. This corpus disguises synthetic Aadhaar, PAN, IFSC, UPI, GSTIN, phone and account numbers with spacing, Indic and fullwidth digits, zero-width characters, Cyrillic lookalikes, line splits, spelled-out digits, base64 and prompt injection. An independent oracle checks what would leave.</p>
        </header>
        ${!r ? html`<div class="card card-pad"><div class="row"><span class="spinner"></span>Running the corpus in your browser…</div></div>` : html`
          <div class="grid g4" style="margin-bottom:16px">
            <div class="card stat"><div class="stat-k">Cases</div><div class="stat-v num">${r.total}</div><div class="stat-n">ran in ${ms} ms, locally</div></div>
            <div class="card stat"><div class="stat-k">Caught</div><div class="stat-v num" style="color:var(--ok)">${r.caught}</div><div class="stat-n">${pct(r.caught / r.total, 1)} redacted</div></div>
            <div class="card stat"><div class="stat-k">Blocked</div><div class="stat-v num">${r.blocked}</div><div class="stat-n">verifier stopped the send</div></div>
            <div class="card stat"><div class="stat-k">Missed</div><div class="stat-v num" style="color:${r.missed ? 'var(--bad)' : 'var(--ok)'}">${r.missed}</div><div class="stat-n">would have leaked</div></div>
          </div>
          <p class="faint" style="font-size:12.5px;margin-bottom:14px">${icon('info')} ${r.missed} leaks on our ${r.total}-case corpus. Not a claim of zero leakage. Before the detector fixes this corpus drove, 108 of 263 cases leaked.</p>
          <div class="grid g2">
            <div class="card card-pad stack"><strong>By technique</strong>
              ${Object.entries(r.byTechnique).sort((a, b) => b[1].missed - a[1].missed || a[0].localeCompare(b[0])).map(([t, b]) => html`
                <div class="duo-row" style="grid-template-columns:140px 1fr 74px" title="${t}: ${b.caught} caught, ${b.blocked} blocked, ${b.missed} missed of ${b.total}">
                  <span>${t}</span>${bar((b.caught + b.blocked) / b.total, '', `${t} defended`)}<span class="num" style="text-align:right">${b.caught + b.blocked}/${b.total}${b.missed ? html` <span style="color:var(--bad)">·${b.missed}</span>` : ''}</span></div>`)}
            </div>
            <div class="card card-pad stack"><strong>Try your own</strong>
              <textarea class="textarea mono" id="own" rows="4" aria-label="Text to test">${own}</textarea>
              <span class="faint" style="font-size:12px">Use synthetic data only. Runs on this device; nothing is sent.</span>
              <div id="own-out">${ownResult()}</div>
            </div>
          </div>
          <h2 class="section-title">Cases</h2>
          <div class="seg" role="group" aria-label="Filter cases" style="margin-bottom:12px">${(['missed', 'blocked', 'caught', 'all'] as const).map(f => html`<button data-f="${f}" aria-pressed="${filter === f}">${f} (${f === 'all' ? r.total : r[f]})</button>`)}</div>
          <div class="card table-wrap"><table class="t"><thead><tr><th>Case</th><th>Technique</th><th>Type</th><th>Input (synthetic)</th><th>What would leave</th></tr></thead><tbody>
            ${r.results.filter(x => filter === 'all' || x.outcome === filter).slice(0, 80).map(x => html`<tr>
              <td class="num">${x.id}</td><td>${x.technique}</td><td><span class="chip">${x.canaryType}</span></td>
              <td class="mono" style="font-size:12px;max-width:320px;white-space:pre-wrap">${visible(x.input).slice(0, 160)}</td>
              <td class="mono" style="font-size:12px;max-width:320px;white-space:pre-wrap;color:${x.outcome === 'missed' ? 'var(--bad)' : 'inherit'}">${x.outcome === 'blocked' ? 'nothing (blocked)' : visible(x.outbound ?? '').slice(0, 160)}</td></tr>`)}
          </tbody></table></div>`}`.html;
    };

    root.addEventListener('click', e => { const f = (e.target as HTMLElement).closest('[data-f]') as HTMLElement | null; if (f) { filter = f.dataset.f as LeakOutcome; paint(); } });
    root.addEventListener('input', e => { const t = e.target as HTMLTextAreaElement; if (t.id === 'own') { own = t.value; root.querySelector('#own-out')!.innerHTML = ownResult().html; } });
    paint();
    setTimeout(() => { const t0 = performance.now(); report = runLeakLab(); ms = Math.round(performance.now() - t0); paint(); }, 30);
  }
};
export default screen;
