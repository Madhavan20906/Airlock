/** Receipts render as thermal slips: exactly what left the device, the policy that decided it, and the hash chain. */
import { html } from './dom.js';
import { routeBadge, labelOf } from './components.js';
import { glyph } from './glyphs.js';
import type { Receipt } from '@tandem/router';

const time = (ts: number) => new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const kv = (k: string, v: unknown) => html`<div class="kv"><span>${k}</span><span>${v}</span></div>`;

export interface SlipOpts { index?: number; payload?: string | null; verdict?: 'ok' | 'broken' | null; print?: boolean; verify?: boolean; tampered?: boolean }

export function receiptSlip(r: Receipt, o: SlipOpts = {}) {
  const left = r.route !== 'LOCAL' && r.route !== 'BLOCKED';
  const why = r.qualityEscalation.happened ? html`${glyph('escalate')} quality escalation${r.qualityEscalation.reason ? `: failed ${r.qualityEscalation.reason}` : ''}`
    : r.availabilityFallback ? html`${glyph('fallback')} availability fallback${r.availabilityReason ? `: ${r.availabilityReason}` : ''}` : 'by policy';
  return html`<article class="slip ${o.print ? 'printing' : ''} ${o.tampered ? 'tampered' : ''}" aria-label="Routing receipt ${o.index ?? ''}">
    <header class="slip-h"><span>TANDEM · ROUTING RECEIPT</span><span>${o.index !== undefined ? `#${String(o.index).padStart(4, '0')}` : ''} ${time(r.ts)}</span></header>
    <div class="slip-sec">
      ${kv('task', `${labelOf[r.taskType] ?? r.taskType} · ${r.lengthBucket}`)}
      <div class="kv"><span>route</span><span>${routeBadge(r.route)}</span></div>
      ${kv('served by', r.servedBy ? r.servedBy.replace('_', '-') : 'nobody')}
      <div class="kv"><span>cloud why</span><span>${why}</span></div>
      ${r.guard.sensitive ? kv('guard', Object.entries(r.guard.entities).map(([k, v]) => `${v} ${k}`).join(', ')) : ''}
      ${kv('policy', `v${r.policyVersion} · rule ${r.ruleRoute.replace('_', '-').toLowerCase()}`)}
      ${kv('latency', `${Math.round(r.latencyMs).toLocaleString()} ms`)}
    </div>
    <div class="slip-sec">
      <div class="slip-t">LEFT THIS DEVICE</div>
      ${left ? html`
        ${kv('to', r.destination.join(', ') || 'Firebase AI Logic')}
        ${kv('bytes', html`<b>${r.bytesOut.toLocaleString()}</b> observed · ${r.payloadBytes.toLocaleString()} prompt`)}
        ${o.payload ? html`<div class="slip-t" style="margin-top:6px">PAYLOAD, AS SENT</div><pre class="slip-pay" tabindex="0" aria-label="Payload as sent">${o.payload.split(/(\[[A-Z_]+_\d+\])/).map(p => /^\[[A-Z_]+_\d+\]$/.test(p) ? html`<mark>${p}</mark>` : p)}</pre>`
          : html`<p class="slip-note">Content is not stored in receipts, only its size.</p>`}`
        : html`<p class="slip-big">0 bytes</p><p class="slip-note">${r.route === 'BLOCKED' ? 'Blocked. Nothing was sent.' : 'Answered on this device.'}</p>`}
    </div>
    <footer class="slip-sec slip-chain">
      ${kv('prev', html`<span class="mono">${r.prevHash.slice(0, 16)}…</span>`)}
      ${kv('hash', html`<span class="mono">${r.hash.slice(0, 16)}…</span>`)}
      ${o.verdict ? html`<p class="slip-verdict ${o.verdict}">${o.verdict === 'ok' ? 'CHAIN VERIFIED · SHA-256' : 'CHAIN BROKEN AT THIS RECEIPT'}</p>` : ''}
      ${o.verify ? html`<button class="btn btn-sm" data-verify>Verify chain</button>` : ''}
    </footer>
  </article>`;
}
