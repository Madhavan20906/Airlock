import { html, raw, pct, fmtMs } from './dom.js';
import { icon } from './icons.js';
import { glyph } from './glyphs.js';

export type RouteKind = 'LOCAL' | 'CLOUD' | 'CLOUD_REDACTED' | 'BLOCKED';

const ROUTE_META: Record<RouteKind, { cls: string; label: string; g: 'local' | 'cloud' | 'redacted' | 'blocked'; aria: string }> = {
  LOCAL: { cls: 'local', label: 'On-device', g: 'local', aria: 'Served on-device by Gemini Nano' },
  CLOUD: { cls: 'cloud', label: 'Cloud', g: 'cloud', aria: 'Served in the cloud' },
  CLOUD_REDACTED: { cls: 'redacted', label: 'Cloud · redacted', g: 'redacted', aria: 'Served in the cloud with identifiers redacted' },
  BLOCKED: { cls: 'blocked', label: 'Blocked', g: 'blocked', aria: 'Blocked: nothing was sent' }
};

/** THE signature element: an ink stamp. Identical in Studio and Notes. */
export function routeBadge(r: RouteKind, opts: { lg?: boolean; seal?: boolean; flat?: boolean } = {}) {
  const m = ROUTE_META[r];
  return html`<span class="stamp ${m.cls} ${opts.lg ? 'lg' : ''} ${opts.seal ? 'press' : ''} ${opts.flat ? 'flat' : ''}" role="img" aria-label="${m.aria}">${glyph(m.g)}${m.label}</span>`;
}

export function backendBadge(b: 'on_device' | 'in_cloud' | null) {
  return b === 'on_device' ? routeBadge('LOCAL', { seal: true }) : b === 'in_cloud' ? routeBadge('CLOUD', { seal: true }) : html`<span class="chip">not served</span>`;
}

/** The two reasons to use the cloud, never conflated, each with its own glyph. */
export function fallbackFlag(reason?: string) {
  return html`<span class="flag fallback" title="${reason ?? ''}">${glyph('fallback')}Availability fallback${reason ? html`<span class="faint">· ${reason}</span>` : ''}</span>`;
}
export function escalationFlag(reason?: string) {
  return html`<span class="flag escalate" title="${reason ?? ''}">${glyph('escalate')}Quality escalation${reason ? html`<span class="faint">· failed ${reason}</span>` : ''}</span>`;
}

export function pill(text: string, tone: 'ok' | 'bad' | 'warn' | 'local' | 'cloud' | '' = '') {
  return html`<span class="pill ${tone}"><span class="dot" aria-hidden="true"></span>${text}</span>`;
}

/** A readout: label, big numeral with unit, note. No card. */
export function stat(k: string, v: string | number, note?: string, tone: '' | 'local' | 'cloud' = '', unit?: string) {
  return html`<div class="readout ${tone}"><div class="caps">${k}</div><div class="rv num">${v}${unit ? html`<small>${unit}</small>` : ''}</div>${note ? html`<div class="rn">${note}</div>` : ''}</div>`;
}

export function bar(frac: number | null, tone: '' | 'local' | 'cloud' = '', label = '') {
  const w = Math.max(0, Math.min(1, frac ?? 0)) * 100;
  return html`<div class="gauge ${tone}" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(w)}" aria-label="${label}"><i style="width:${w}%"></i></div>`;
}

/** Validator result: a stamped square. Pass = filled ink box with tick; fail = hatched with a cross; pending = dashed. */
export function checkChip(name: string, passed: boolean | null, detail?: string, stamped = false) {
  const cls = passed === null ? '' : passed ? 'pass' : 'fail';
  return html`<span class="check ${cls} ${stamped && passed !== null ? 'stamped' : ''}" title="${detail ?? ''}"><span class="box">${glyph(passed === null ? 'pending' : passed ? 'pass' : 'fail')}</span>${name}<span class="sr">${passed === null ? 'pending' : passed ? 'passed' : 'failed'}</span></span>`;
}

export function banner(tone: 'warn' | 'bad' | 'ok' | 'local' | '', title: string, body?: unknown, ic = tone === 'bad' ? 'alert' : tone === 'ok' ? 'check' : tone === 'local' ? 'chip' : 'info') {
  return html`<div class="banner ${tone}" role="${tone === 'bad' ? 'alert' : 'status'}">${icon(ic)}<div class="stack" style="gap:4px"><strong>${title}</strong>${body ? html`<div class="muted">${body}</div>` : ''}</div></div>`;
}

export function empty(ic: string, title: string, body?: unknown, action?: unknown) {
  return html`<div class="empty">${icon(ic)}<div class="e-title">${title}</div>${body ? html`<div style="max-width:52ch">${body}</div>` : ''}${action ?? ''}</div>`;
}

export function evidenceLine(ev: { n: number; wilsonLoLocal: number | null; passLocal: number | null; passCloud: number | null; p50Local: number | null }) {
  return html`<span class="chip">n <b>${ev.n}</b></span> <span class="chip">lower bound <b>${pct(ev.wilsonLoLocal)}</b></span> <span class="chip">local <b>${pct(ev.passLocal)}</b> · cloud <b>${pct(ev.passCloud)}</b></span> <span class="chip">p50 <b>${fmtMs(ev.p50Local)}</b></span>`;
}

export const labelOf: Record<string, string> = {
  classify: 'Classify', extract: 'Extract', rewrite: 'Rewrite', summarize: 'Summarise', translate: 'Translate',
  qa: 'Answer', json_reliability: 'JSON output', instruction: 'Follow format'
};
export { raw, icon, glyph };
