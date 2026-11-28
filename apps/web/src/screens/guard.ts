import type { Screen } from '../main.js';
import { html, pct } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyph } from '../ui/glyphs.js';
import { runLeakLab, runDeterministicDetectors, redactText, type LeakLabReport, type LeakOutcome } from '@tandem/guard';

const visible = (s: string) => s.replace(/[​-‍﻿]/g, '⁣·').replace(/\n/g, '⏎\n');

const screen: Screen = {
  title: 'Guard Lab',
  crumb: 'Use it · Guard Lab',
  render(root) {
    let report: LeakLabReport | null = null;
    let ms = 0;
    let filter: LeakOutcome | 'all' = 'missed';
    let own = 'Bhai mera PAN B Q K P S 4 8 2 1 L hai, aur Aadhaar ४७१२ ०९३८ ५६१८. Account 5010-0488-2177-63.';

    const ownResult = () => {
      try {
        const ents = runDeterministicDetectors(own);
        const r = redactText(own, ents);
        return html`<p class="caps" style="margin-top:12px">What would leave the device</p><pre class="payload" tabindex="0" aria-label="What would leave the device">${r.sanitizedText.split(/(\[[A-Z_]+_\d+\])/).map(p => /^\[[A-Z_]+_\d+\]$/.test(p) ? html`<mark>${p}</mark>` : p)}</pre><div class="row" style="margin-top:8px">${ents.length ? ents.map(e => html`<span class="chip">${e.type}</span>`) : html`<span class="meta">no identifiers found</span>`}</div>`;
      } catch (e: any) {
        return html`<div class="banner bad" style="margin-top:12px">${icon('lock')}<div><strong>Blocked by the verifier.</strong> <span class="muted">${String(e?.message ?? e)}. Nothing would be sent.</span></div></div>`;
      }
    };

    const paint = () => {
      const r = report;
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">We attack our own redactor. <em>Here is the scoreboard.</em></h1>
          <p class="lede">Tandem Guard keeps sensitive identifiers on-device. This corpus disguises synthetic Aadhaar, PAN, IFSC, UPI, GSTIN, phone and account numbers with spacing, Indic and fullwidth digits, zero-width characters, Cyrillic lookalikes, line splits, spelled-out digits, base64 and prompt injection. An independent oracle checks what would leave.</p>
        </header>
        ${!r ? html`<div class="scan" role="status" aria-label="Running the corpus"></div><p class="meta" style="margin-top:8px">Running the corpus in your browser.</p>` : html`
          <div class="readouts" style="margin-bottom:8px">
            <div class="readout"><div class="caps">Cases</div><div class="rv num">${r.total}</div><div class="rn">ran in ${ms} ms, locally</div></div>
            <div class="readout"><div class="caps">${glyph('pass')} caught</div><div class="rv num">${r.caught}</div><div class="rn">${pct(r.caught / r.total, 1)} redacted</div></div>
            <div class="readout"><div class="caps">${glyph('blocked')} blocked</div><div class="rv num">${r.blocked}</div><div class="rn">verifier stopped the send</div></div>
            <div class="readout"><div class="caps">${glyph('fail')} missed</div><div class="rv num"><span class="${r.missed ? 'hl' : ''}">${r.missed}</span></div><div class="rn">would have leaked</div></div>
          </div>
          <p class="meta" style="margin-bottom:8px">${r.missed} leaks on our ${r.total}-case corpus. Not a claim of zero leakage. Before the detector fixes this corpus drove, 108 of 263 cases leaked.</p>
          <div class="folio">
            <div>
              <div class="sec"><h2>By technique</h2><span class="caps">defended / total · missed</span></div>
              <div class="pairs">${Object.entries(r.byTechnique).sort((a, b) => b[1].missed - a[1].missed || a[0].localeCompare(b[0])).map(([t, b]) => html`
                <div class="tech" title="${t}: ${b.caught} caught, ${b.blocked} blocked, ${b.missed} missed of ${b.total}">
                  <span>${t}</span><span class="pbar l"><i style="width:${((b.caught + b.blocked) / b.total) * 100}%;background:var(--ink)"></i></span><span class="num r">${b.caught + b.blocked}/${b.total}${b.missed ? html` <span class="hl">${b.missed} missed</span>` : ''}</span></div>`)}
              </div>
              <div class="sec"><h2>Cases</h2><span class="caps">synthetic inputs</span></div>
              <div class="seg" role="group" aria-label="Filter cases" style="margin-bottom:12px">${(['missed', 'blocked', 'caught', 'all'] as const).map(f => html`<button data-f="${f}" aria-pressed="${filter === f}">${f} · ${f === 'all' ? r.total : r[f]}</button>`)}</div>
              <div class="table-wrap"><table class="t"><thead><tr><th>Case</th><th>Technique</th><th>Type</th><th>Input</th><th>What would leave</th></tr></thead><tbody>
                ${r.results.filter(x => filter === 'all' || x.outcome === filter).slice(0, 80).map(x => html`<tr>
                  <td class="num">${x.id}</td><td>${x.technique}</td><td><span class="chip">${x.canaryType}</span></td>
                  <td class="mono" style="font-size:11.5px;max-width:300px;white-space:pre-wrap">${visible(x.input).slice(0, 160)}</td>
                  <td class="mono" style="font-size:11.5px;max-width:300px;white-space:pre-wrap">${x.outcome === 'blocked' ? html`<span class="stamp blocked flat">${glyph('blocked')}nothing</span>` : x.outcome === 'missed' ? html`<span class="hl">${visible(x.outbound ?? '').slice(0, 160)}</span>` : visible(x.outbound ?? '').slice(0, 160)}</td></tr>`)}
              </tbody></table></div>
            </div>
            <aside class="margin">
              <section class="mnote"><span class="caps">Try your own · synthetic only</span>
                <textarea class="textarea mono" id="own" rows="5" aria-label="Text to test">${own}</textarea>
                <span class="meta">Runs on this device. Nothing is sent.</span>
                <div id="own-out">${ownResult()}</div>
              </section>
            </aside>
          </div>`}`.html;
    };

    root.addEventListener('click', e => { const f = (e.target as HTMLElement).closest('[data-f]') as HTMLElement | null; if (f) { filter = f.dataset.f as LeakOutcome; paint(); } });
    root.addEventListener('input', e => { const t = e.target as HTMLTextAreaElement; if (t.id === 'own') { own = t.value; root.querySelector('#own-out')!.innerHTML = ownResult().html; } });
    paint();
    setTimeout(() => { const t0 = performance.now(); report = runLeakLab(); ms = Math.round(performance.now() - t0); paint(); }, 30);
  }
};
export default screen;
