import type { Screen } from '../main.js';
import { html, shortHash, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyph } from '../ui/glyphs.js';
import { routeBadge, empty, labelOf } from '../ui/components.js';
import { receiptSlip } from '../ui/receipt.js';
import { tandem } from '../services/tandem.js';
import { getParam } from './data.js';
import { verifyReceipts, type Receipt } from '@tandem/router';

const screen: Screen = {
  title: 'Receipts',
  crumb: 'Use it · Receipts',
  render(root) {
    let verdict: { valid: boolean; error?: string; brokenIndex?: number; tamper?: boolean } | null = null;
    let sel: number | null = null;
    let print = getParam('open') === 'latest';

    const paint = () => {
      const rs = tandem.receipts;
      const n = rs.length;
      if (sel === null || sel >= n) sel = n - 1;
      const local = rs.filter(r => r.route === 'LOCAL').length;
      const esc = rs.filter(r => r.qualityEscalation.happened).length;
      const fb = rs.filter(r => r.availabilityFallback).length;
      const bytes = rs.reduce((a, r) => a + (r.bytesOut || 0), 0);
      const broken = verdict && !verdict.valid ? verdict.brokenIndex ?? -1 : -1;
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">Every decision, <em>on the record.</em></h1>
          <p class="lede">The router issues a receipt for every request: route, who served it, why, and how many bytes left. Metadata only, never content. Each receipt carries the SHA-256 of the one before it, so any edit breaks the chain.</p>
        </header>
        ${n ? html`
          <div class="readouts" style="margin-bottom:22px">
            <div class="readout"><div class="caps">Requests</div><div class="rv num">${n}</div><div class="rn">in this browser</div></div>
            <div class="readout local"><div class="caps">${glyph('local')} on-device</div><div class="rv num">${Math.round((local / n) * 100)}<small>%</small></div><div class="rn">${local} of ${n}</div></div>
            <div class="readout"><div class="caps">${glyph('escalate')} escalations · ${glyph('fallback')} fallbacks</div><div class="rv num">${esc} · ${fb}</div><div class="rn">quality vs availability</div></div>
            <div class="readout"><div class="caps">Bytes that left</div><div class="rv num">${bytes.toLocaleString()}</div><div class="rn">observed on the wire</div></div>
          </div>
          <div class="probe-ctl">
            <button class="btn btn-primary" id="verify">${icon('shield')}Verify chain</button>
            <button class="btn" id="tamper">Tamper test, on a copy</button>
            <button class="btn btn-ghost" id="export">${icon('download')}Export JSON</button>
            <button class="btn btn-ghost" id="clear">Clear</button>
            ${verdict ? html`<span class="slip-verdict ${verdict.valid ? 'ok' : 'broken'}" role="status" style="font:700 11px var(--f-mono);margin:0 0 0 auto">${verdict.valid ? `CHAIN INTACT · ${n} RECOMPUTED` : verdict.tamper ? `TAMPERING DETECTED AT #${verdict.brokenIndex}` : 'CHAIN BROKEN'}</span>` : ''}
          </div>
          ${verdict && !verdict.valid ? html`<p class="meta" style="margin:-10px 0 18px">${verdict.error}${verdict.tamper ? ' The test edited a copy; your stored receipts are untouched.' : ''}</p>` : ''}
          <div class="folio">
            <div class="table-wrap"><table class="t ledger"><caption class="sr">Receipt ledger, newest first. Select a row to print its receipt.</caption><thead><tr><th>#</th><th>Time</th><th>Task</th><th>Route</th><th>Why the cloud</th><th class="r">Bytes out</th><th>Policy</th><th>Hash</th></tr></thead><tbody>
              ${[...rs].reverse().slice(0, 200).map((r: Receipt, i) => { const idx = n - 1 - i; return html`<tr class="clickable ${idx === sel ? 'is-sel' : ''} ${idx === broken ? 'is-broken' : ''}" data-i="${idx}" tabindex="0" aria-selected="${idx === sel}">
                <td class="num faint">${idx}</td>
                <td class="num" style="white-space:nowrap">${new Date(r.ts).toLocaleTimeString(undefined, { hour12: false })}</td>
                <td>${labelOf[r.taskType] ?? r.taskType} <span class="faint">${r.lengthBucket}</span>${r.guard.sensitive ? html` ${icon('lock')}<span class="sr">sensitive</span>` : ''}</td>
                <td>${routeBadge(r.route, { flat: true })}</td>
                <td>${r.qualityEscalation.happened ? html`${glyph('escalate')} escalation` : r.availabilityFallback ? html`${glyph('fallback')} fallback` : html`<span class="faint">—</span>`}</td>
                <td class="num r">${(r.bytesOut || 0).toLocaleString()}</td>
                <td class="num">v${r.policyVersion}</td>
                <td class="hash" title="prev ${r.prevHash}">${shortHash(r.hash)}</td></tr>`; })}
            </tbody></table></div>
            <aside class="margin slip-margin">${sel !== null && rs[sel] ? receiptSlip(rs[sel], { index: sel, print, tampered: sel === broken, verdict: verdict ? (sel === broken ? 'broken' : verdict.valid ? 'ok' : null) : null }) : ''}</aside>
          </div>`
        : html`<div class="plate">${empty('receipt', 'No receipts yet', 'Run an action in Tandem Notes. Every routing decision lands here, chained by SHA-256.', html`<a class="btn btn-primary" href="/notes/">${icon('notes')}Open Tandem Notes</a>`)}</div>`}`.html;
      print = false;
    };

    const pick = (el: Element | null) => { const row = el?.closest('[data-i]') as HTMLElement | null; if (row) { sel = Number(row.dataset.i); print = true; paint(); (root.querySelector(`[data-i="${sel}"]`) as HTMLElement)?.focus(); } };
    root.addEventListener('keydown', e => { if ((e as KeyboardEvent).key === 'Enter') pick(e.target as Element); });
    root.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      if (t.closest('[data-i]')) return pick(t);
      if (t.closest('#verify')) { verdict = await verifyReceipts(tandem.receipts); paint(); }
      if (t.closest('#tamper')) {
        const copy = tandem.receipts.map(r => ({ ...r }));
        const k = Math.floor(copy.length / 2);
        copy[k] = { ...copy[k], route: copy[k].route === 'LOCAL' ? 'CLOUD' : 'LOCAL' };
        verdict = { ...(await verifyReceipts(copy)), tamper: true };
        sel = verdict.brokenIndex ?? k; print = true;
        paint();
      }
      if (t.closest('#export')) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(tandem.receipts, null, 2)], { type: 'application/json' }));
        a.download = 'tandem-receipts.json'; a.click();
      }
      if (t.closest('#clear')) { await tandem.clearReceipts(); verdict = null; sel = null; toast('Receipts cleared'); }
    });
    const unsub = tandem.subscribe(paint);
    void tandem.whenReady().then(paint);
    paint();
    return unsub;
  }
};
export default screen;
