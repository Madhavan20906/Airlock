import '../styles/app.css';
import { html, $, toast, fmtMs } from '../ui/dom.js';
import { icon, brandMark } from '../ui/icons.js';
import { routeBadge, fallbackFlag, escalationFlag, banner, pill } from '../ui/components.js';
import { tandem } from '../services/tandem.js';
import { kvGet, kvSet } from '../services/store.js';
import { SEEDS, type Note } from './seeds.js';
import type { RunResult as RouterResult } from '@tandem/router';
import type { Validator } from '@tandem/bench';
import type { TaskType } from '@tandem/policy';
import { runDeterministicDetectors, redactText } from '@tandem/guard';

type Action = 'summarize' | 'rewrite' | 'extract' | 'translate' | 'ask';
const LANGS = [
  { name: 'Hindi', script: 'Devanagari' }, { name: 'Tamil', script: 'Tamil' }, { name: 'Bengali', script: 'Bengali' },
  { name: 'Telugu', script: 'Telugu' }, { name: 'Marathi', script: 'Devanagari' }
] as const;

let notes: Note[] = [];
let current = '';
let lang: (typeof LANGS)[number]['name'] = 'Hindi';
let busy: Action | null = null;
let result: { action: Action; r: RouterResult; question?: string } | null = null;
let showSent = false;
let consent: { action: Action; preview: string; question?: string } | null = null;
let live = '';

const note = () => notes.find(n => n.id === current)!;

function spec(action: Action, n: Note, question?: string): { task: TaskType; instruction: string; input: string; validators?: Validator[] } {
  const nums = [...new Set((n.body.match(/\d[\d,]*\d|\d/g) ?? []).map(x => x.replace(/,/g, '')))].slice(0, 5);
  switch (action) {
    case 'summarize': return { task: 'summarize', instruction: 'Summarise this note in 2-3 short sentences. Keep key numbers and dates.', input: n.body };
    case 'rewrite': return { task: 'rewrite', instruction: 'Rewrite this note as a clear, polite, professional message. Keep every number, date and name exactly.', input: n.body };
    case 'extract': return {
      task: 'extract', instruction: 'Extract the action items as JSON: {"tasks": [{"task": string, "owner": string or null, "due": string or null}]}. Output only the JSON.', input: n.body,
      validators: [{ kind: 'no_refusal' }, { kind: 'json_schema', required: { tasks: 'array' } }]
    };
    case 'translate': {
      const L = LANGS.find(l => l.name === lang)!;
      return {
        task: 'translate', instruction: `Translate this note into ${L.name}. Output only the translation. Keep numbers as digits.`, input: n.body,
        validators: [{ kind: 'no_refusal' }, { kind: 'script_present', script: L.script as any, minRatio: 0.5 }, ...(nums.length ? [{ kind: 'required_facts' as const, facts: nums, threshold: 0.6 }] : [])]
      };
    }
    case 'ask': {
      // Local retrieval: rank notes by query-term overlap (on-device, no embeddings sent anywhere)
      const terms = (question ?? '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [];
      const ranked = notes.map(x => ({ x, s: terms.reduce((a, t) => a + ((x.title + ' ' + x.body).toLowerCase().split(t).length - 1), 0) })).sort((a, b) => b.s - a.s).filter(r => r.s > 0).slice(0, 2);
      const ctx = (ranked.length ? ranked : [{ x: n, s: 0 }]).map(r => `## ${r.x.title}\n${r.x.body}`).join('\n\n');
      return { task: 'qa', instruction: `Answer the question using only these notes. If the notes do not say, reply "Not in your notes." Question: ${question}`, input: ctx, validators: [{ kind: 'no_refusal' }, { kind: 'min_len', words: 1 }] };
    }
  }
}

async function run(action: Action, opts: { consent?: boolean; question?: string } = {}) {
  const n = note();
  busy = action; result = null; showSent = false; live = '';
  paint();
  const s = spec(action, n, opts.question);
  try {
    const r = await tandem.router.run({
      task: s.task, instruction: s.instruction, input: s.input, validators: s.validators, consentRedactedCloud: opts.consent,
      onToken: t => { live = t; const el = $('#live'); if (el) el.textContent = t; }
    });
    result = { action, r, question: opts.question };
    if (r.status === 'blocked' && !opts.consent && r.receipt.guard.sensitive && r.receipt.availabilityFallback) {
      let preview = '';
      try { preview = redactText(`${s.instruction}\n\n${s.input}`, runDeterministicDetectors(`${s.instruction}\n\n${s.input}`)).sanitizedText; } catch { preview = ''; }
      consent = preview ? { action, preview, question: opts.question } : null;
    }
  } catch (e: any) {
    toast(String(e?.message ?? e));
  }
  busy = null;
  paint();
}

const ACTIONS: Array<[Action, string, string]> = [
  ['summarize', 'Summarise', 'spark'], ['rewrite', 'Rewrite', 'policy'], ['extract', 'Extract tasks', 'check'], ['translate', 'Translate', 'globe'], ['ask', 'Ask my notes', 'compass']
];

function sentHtml(sent: string) {
  return html`<pre class="payload" aria-label="Exact text handed to the cloud call">${sent.split(/(\[[A-Z_]+_\d+\])/).map(p => /^\[[A-Z_]+_\d+\]$/.test(p) ? html`<mark>${p}</mark>` : p)}</pre>`;
}

function resultHtml() {
  if (busy) {
    return html`<div class="card result"><div class="row"><span class="spinner"></span><strong>${ACTIONS.find(a => a[0] === busy)![1]}…</strong><span class="faint">routing by policy v${tandem.policy.version}</span></div><div class="result-out mono faint" id="live">${live}</div></div>`;
  }
  if (!result) return html``;
  const { r, action } = result;
  const rc = r.receipt;
  const sensitive = rc.guard.sensitive;
  let out: unknown = r.output;
  if (action === 'extract' && r.status === 'ok') {
    try {
      const j = JSON.parse(r.output.replace(/```(json)?/g, '').slice(r.output.replace(/```(json)?/g, '').indexOf('{')).replace(/[^}]*$/, ''));
      out = html`<ul style="margin:0;padding-left:18px;display:grid;gap:4px">${(j.tasks ?? []).map((t: any) => html`<li>${t.task ?? t.title ?? JSON.stringify(t)}${t.owner ? html` <span class="chip">${t.owner}</span>` : ''}${t.due ? html` <span class="chip">due ${t.due}</span>` : ''}</li>`)}</ul>`;
    } catch { /* show raw */ }
  }
  return html`<div class="card result" aria-live="polite">
    <div class="spread"><div class="row">${routeBadge(rc.route, { lg: true, seal: true })}${sensitive ? html`<span class="chip">${icon('lock')}${Object.entries(rc.guard.entities).map(([k, v]) => `${v} ${k}`).join(' · ')}</span>` : ''}</div>
      <div class="row faint num" style="font-size:12px"><span>${fmtMs(rc.latencyMs)}</span><span>·</span><span>policy v${rc.policyVersion}</span><span>·</span><span>${rc.taskType} ${rc.lengthBucket}</span></div></div>
    <div class="callout" style="font-size:13px">${rc.why}</div>
    ${rc.qualityEscalation.happened ? escalationFlag(rc.qualityEscalation.reason) : rc.availabilityFallback ? fallbackFlag(rc.availabilityReason) : ''}
    ${r.status === 'ok' ? html`<div class="result-out">${out}</div>` : r.status === 'blocked' ? banner('bad', 'Held on this device', 'This note contains sensitive identifiers and no on-device model is available here. Nothing was sent.', 'lock') : banner('bad', 'Could not complete', r.error ?? rc.why)}
    ${rc.qualityEscalation.happened && r.local ? html`<details><summary class="faint" style="cursor:pointer;font-size:12.5px">Show the local attempt that failed validation</summary><pre class="payload" style="margin-top:8px">${r.local.output || '(empty)'}</pre></details>` : ''}
    <div class="spread" style="border-top:1px dashed var(--rule-2);padding-top:10px">
      <span class="faint" style="font-size:12.5px">${rc.route === 'LOCAL' ? html`${icon('chip')} Nothing left this device for this answer.` : rc.route === 'BLOCKED' ? 'Nothing was sent.' : html`${rc.bytesOut.toLocaleString()} bytes observed leaving to ${rc.destination.join(', ') || 'Firebase AI Logic'} · ${rc.payloadBytes.toLocaleString()} bytes of prompt`}</span>
      <span class="row">${r.sentToCloud ? html`<button class="btn btn-sm" id="sent">${showSent ? 'Hide' : 'What left this device'}</button>` : ''}<a class="btn btn-sm btn-ghost" href="/studio/#/receipts">${icon('receipt')}Receipt</a></span>
    </div>
    ${showSent && r.sentToCloud ? sentHtml(r.sentToCloud) : ''}
  </div>`;
}

function consentHtml() {
  if (!consent) return '';
  return html`<div class="scrim"></div><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="c-title"><div class="card card-pad stack">
    <h2 id="c-title" style="font:400 28px/1.1 var(--f-display)">Send a redacted version to the cloud?</h2>
    <p class="meta">Your consent applies to this one request only.</p>
    <p class="muted">There is no on-device model here, so this sensitive note was held. If you agree, exactly the text below is sent. Identifiers are replaced by placeholders and restored on your device afterwards.</p>
    ${sentHtml(consent.preview)}
    <div class="row" style="justify-content:flex-end"><button class="btn" id="c-no">Keep it local</button><button class="btn btn-primary" id="c-yes">${icon('mask')}Send redacted</button></div>
  </div></div>`;
}

function paint() {
  const n = note();
  const cap = tandem.capability;
  $('#app')!.innerHTML = html`
    <div class="topbar" style="padding:12px clamp(16px,3vw,32px);margin:0;border-bottom:1px solid var(--rule);background:color-mix(in srgb,var(--paper) 92%,transparent);position:sticky;top:env(safe-area-inset-top,0px);z-index:20;backdrop-filter:blur(8px)">
      <a class="brand" href="/notes/" style="padding:0">${brandMark}<span><span class="brand-name">Tandem Notes</span><br><span class="brand-sub">private, local-first, measured</span></span></a>
      <div class="status-strip">${cap.state === 'available' ? pill('On-device ready', 'local') : pill(`On-device: ${cap.raw}`, 'warn')}${!navigator.onLine ? pill('Offline', 'warn') : ''}<span class="pill"><span class="dot"></span>Policy v${tandem.policy.version}</span><a class="btn btn-sm btn-ghost" href="/studio/">${icon('gauge')}Studio</a></div>
    </div>
    <div class="notes">
      <nav class="notes-list" aria-label="Notes">
        <button class="btn btn-sm" id="new" style="justify-self:start;margin:4px 0 8px">${icon('plus')}New note</button>
        ${notes.map(x => html`<button class="note-item" data-note="${x.id}" aria-current="${x.id === current}"><span class="nt">${runDeterministicDetectors(x.body).length ? icon('lock') : ''}${x.title || 'Untitled'}</span><span class="np">${x.body.slice(0, 80)}</span></button>`)}
      </nav>
      <main class="editor">
        ${!navigator.onLine ? banner('warn', 'You are offline', 'Actions the policy routes on-device still work. Cloud-routed actions will say they could not run.', 'wifioff') : ''}
        <input class="editor-title" id="title" value="${n.title}" placeholder="Untitled" aria-label="Note title">
        <textarea class="editor-body" id="body" aria-label="Note text" rows="9" placeholder="Start writing your note here…">${n.body}</textarea>
        <div class="spread">
          <div class="actions">${ACTIONS.map(([a, l, ic]) => html`<button class="btn ${a === 'summarize' ? 'btn-primary' : ''}" data-act="${a}" ${busy ? 'disabled' : ''}>${icon(ic)}${l}</button>`)}</div>
          <label class="row" style="font-size:13px">Translate to <select class="select" id="lang" style="width:auto;min-height:32px;padding:4px 10px">${LANGS.map(l => html`<option ${l.name === lang ? 'selected' : ''}>${l.name}</option>`)}</select></label>
        </div>
        <div id="askrow" class="row" hidden><input class="input" id="q" placeholder="Ask across your notes, e.g. When is the tax deadline?" style="flex:1"><button class="btn btn-primary" id="ask-go">${icon('arrow')}Ask</button></div>
        <div id="result">${resultHtml()}</div>
        <p class="faint" style="font-size:12px">Notes are stored only in this browser. Each action is routed by the Tandem policy; sensitive notes (lock icon) never leave without your consent. All sample data is synthetic.</p>
      </main>
    </div>${consentHtml()}`.html;
}

async function save() { await kvSet('notes', notes); }

document.addEventListener('click', async e => {
  const t = e.target as HTMLElement;
  const ni = t.closest('[data-note]') as HTMLElement | null;
  if (ni) { current = ni.dataset.note!; result = null; paint(); return; }
  const a = t.closest('[data-act]') as HTMLElement | null;
  if (a && !busy) {
    const act = a.dataset.act as Action;
    if (act === 'ask') { const row = $('#askrow')!; row.hidden = !row.hidden; ($('#q') as HTMLInputElement)?.focus(); return; }
    void run(act);
  }
  if (t.closest('#ask-go')) { const q = ($('#q') as HTMLInputElement).value.trim(); if (q) void run('ask', { question: q }); }
  if (t.closest('#sent')) { showSent = !showSent; paint(); }
  if (t.closest('#new')) { const n: Note = { id: `n-${Date.now()}`, title: 'Untitled', body: '', updated: Date.now() }; notes.unshift(n); current = n.id; result = null; await save(); paint(); ($('#body') as HTMLTextAreaElement).focus(); }
  if (t.closest('#c-no')) { consent = null; paint(); }
  if (t.closest('#c-yes') && consent) { const c = consent; consent = null; void run(c.action, { consent: true, question: c.question }); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && consent) { consent = null; paint(); } if (e.key === 'Enter' && (e.target as HTMLElement).id === 'q') $('#ask-go')?.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
document.addEventListener('input', e => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'title' || t.id === 'body') {
    const n = note();
    if (t.id === 'title') n.title = t.value; else n.body = t.value;
    n.updated = Date.now();
    const item = document.querySelector(`[data-note="${n.id}"] .nt`);
    if (item && t.id === 'title') item.lastChild!.textContent = t.value || 'Untitled';
    void save();
  }
});
document.addEventListener('change', e => { const t = e.target as HTMLSelectElement; if (t.id === 'lang') lang = t.value as typeof lang; });

(async () => {
  try { const th = localStorage.getItem('tandem-theme'); if (th) document.documentElement.dataset.theme = th; } catch { /* ignore */ }
  notes = await kvGet<Note[]>('notes', []);
  if (!notes.length) { notes = SEEDS.map(s => ({ ...s, updated: Date.now() })); await save(); }
  current = (notes.find(n => n.body.trim()) ?? notes[0]).id;
  paint();
  await tandem.whenReady();
  tandem.subscribe(() => { if (!busy) paint(); });
  addEventListener('online', paint); addEventListener('offline', paint);
  paint();
  if ('serviceWorker' in navigator && !import.meta.env.DEV) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
