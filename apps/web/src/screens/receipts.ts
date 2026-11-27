import type { Screen } from '../main.js';
import { html, fmtMs, shortHash, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { routeBadge, fallbackFlag, escalationFlag, empty, banner, labelOf, stat } from '../ui/components.js';
import { tandem } from '../services/tandem.js';
import { verifyReceipts, type Receipt } from '@tandem/router';

const screen: Screen = {
  title: 'Receipts',
  crumb: 'Use · Receipts',
  render(root) {
    let verdict: { valid: boolean; error?: string; brokenIndex?: number; tamper?: boolean } | null = null;

    const paint = () => {
      const rs = tandem.receipts;
      const n = rs.length;
      const local = rs.filter(r => r.route === 'LOCAL').length;
      const esc = rs.filter(r => r.qualityEscalation.happened).length;
      const fb = rs.filter(r => r.availabilityFallback).length;
      const blocked = rs.filter(r => r.route === 'BLOCKED').length;
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">Every decision, <em>on the record.</em></h1>
          <p class="lede">The router issues a receipt for every request: route, who served it, why, and how many bytes left. Metadata only, never content. Each receipt includes the SHA-256 of the one before it, so any edit breaks the chain.</p>
        </header>
        ${n ? html`
          <div class="grid g4" style="margin-bottom:16px">
            ${stat('Requests', n)}${stat('Served on-device', n ? Math.round((local / n) * 100) : 0, `${local} of ${n}`, 'local', '%')}${stat('Quality escalations', esc, 'local answer failed a check')}${stat('Availability fallbacks', fb, `${blocked} blocked`)}
          </div>
          <div class="card card-pad spread" style="margin-bottom:16px">
            <div class="row">
              <button class="btn btn-primary" id="verify">${icon('shield')}Verify chain</button>
              <button class="btn" id="tamper">${icon('flask')}Tamper test (on a copy)</button>
              <button class="btn btn-ghost" id="export">${icon('download')}Export JSON</button>
              <button class="btn btn-ghost" id="clear">${icon('trash')}Clear</button>
            </div>
            <span class="faint" style="font-size:12px">Stored in this browser; also mirrored (metadata only) to your own Firestore path.</span>
          </div>
          ${verdict ? html`<div style="margin-bottom:16px">${verdict.valid
            ? banner('ok', `Chain intact: ${n} receipt${n === 1 ? '' : 's'} recomputed with SHA-256`, 'Every hash and every link matches.')
            : banner('bad', verdict.tamper ? `Tampering detected at receipt ${verdict.brokenIndex}` : 'Chain broken', `${verdict.error}${verdict.tamper ? ' (The test edited a copy; your stored receipts are untouched.)' : ''}`)}</div>` : ''}
          <div class="card table-wrap"><table class="t"><thead><tr><th>#</th><th>When</th><th>Task</th><th>Route</th><th>Why the cloud</th><th>Bytes out</th><th>Policy</th><th>Hash</th></tr></thead><tbody>
            ${[...rs].reverse().slice(0, 200).map((r: Receipt, i) => html`<tr>
              <td class="num faint">${n - 1 - i}</td>
              <td class="num" style="white-space:nowrap">${new Date(r.ts).toLocaleTimeString()}</td>
              <td>${labelOf[r.taskType] ?? r.taskType} <span class="faint">${r.lengthBucket}</span>${r.guard.sensitive ? html` <span class="chip" title="${Object.entries(r.guard.entities).map(([k, v]) => `${v} ${k}`).join(', ')}">${icon('lock')}sensitive</span>` : ''}</td>
              <td>${routeBadge(r.route)}</td>
              <td>${r.qualityEscalation.happened ? escalationFlag(r.qualityEscalation.reason) : r.availabilityFallback ? fallbackFlag() : html`<span class="faint">—</span>`}</td>
              <td class="num">${r.bytesOut || r.payloadBytes ? `${r.bytesOut.toLocaleString()}` : '0'}</td>
              <td class="num">v${r.policyVersion}</td>
              <td class="hash" title="prev ${r.prevHash}">${shortHash(r.hash)}</td></tr>`)}
          </tbody></table></div>`
        : html`<div class="card">${empty('receipt', 'No receipts yet', 'Run an action in Tandem Notes. Every routing decision lands here, chained by SHA-256.', html`<a class="btn btn-primary" href="/notes/">${icon('notes')}Open Tandem Notes</a>`)}</div>`}`.html;
    };

    root.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      if (t.closest('#verify')) { verdict = await verifyReceipts(tandem.receipts); paint(); }
      if (t.closest('#tamper')) {
        const copy = tandem.receipts.map(r => ({ ...r }));
        const k = Math.floor(copy.length / 2);
        copy[k] = { ...copy[k], route: copy[k].route === 'LOCAL' ? 'CLOUD' : 'LOCAL' };
        verdict = { ...(await verifyReceipts(copy)), tamper: true };
        paint();
      }
      if (t.closest('#export')) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(tandem.receipts, null, 2)], { type: 'application/json' }));
        a.download = 'tandem-receipts.json'; a.click();
      }
      if (t.closest('#clear')) { await tandem.clearReceipts(); verdict = null; toast('Receipts cleared'); }
    });
    const unsub = tandem.subscribe(paint);
    void tandem.whenReady().then(paint);
    paint();
    void fmtMs;
    return unsub;
  }
};
export default screen;
