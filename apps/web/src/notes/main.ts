import '../styles/app.css';
import '../styles/screens.css';
import '../styles/slips-notes.css';
import '../styles/plates.css';
import '../styles/misc.css';
import '../styles/review-fixes.css';
// Indic faces: unicode-range subsets, so the browser fetches a script's file only when that script appears on screen.
import '@fontsource/noto-sans-devanagari/400.css';
import '@fontsource/noto-sans-tamil/400.css';
import '@fontsource/noto-sans-bengali/400.css';
import '@fontsource/noto-sans-telugu/400.css';
import { html, $, toast, fmtMs } from '../ui/dom.js';
import { icon, brandMark } from '../ui/icons.js';
import { routeBadge, fallbackFlag, escalationFlag, banner, pill } from '../ui/components.js';
import { receiptSlip } from '../ui/receipt.js';
import { initTheme, themeButton, toggleTheme } from '../ui/theme.js';
import { tandem } from '../services/tandem.js';
import { kvGet, kvSet } from '../services/store.js';
import { SEEDS, type Note } from './seeds.js';
import { verifyReceipts, type RunResult as RouterResult } from '@tandem/router';
import type { Validator } from '@tandem/bench';
import type { TaskType } from '@tandem/policy';
import { runDeterministicDetectors, redactText } from '@tandem/guard';

type Action = 'summarize' | 'rewrite' | 'extract' | 'translate' | 'ask';
const LANGS = [
  { name: 'Hindi', script: 'Devanagari' }, { name: 'Tamil', script: 'Tamil' }, { name: 'Bengali', script: 'Bengali' },
  { name: 'Telugu', script: 'Telugu' }, { name: 'Marathi', script: 'Devanagari' }
] as const;
const LANG_CODE: Record<string, string> = { Hindi: 'hi', Tamil: 'ta', Bengali: 'bn', Telugu: 'te', Marathi: 'mr' };

let notes: Note[] = [];
let current = '';
let lang: (typeof LANGS)[number]['name'] = 'Hindi';
let busy: Action | null = null;
let result: { action: Action; r: RouterResult; question?: string; lang: string } | null = null;
let showSlip = false;
let printNext = false;
let consent: { action: Action; preview: string; question?: string } | null = null;
let drawer = false;
let chain: 'ok' | 'broken' | null = null;
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
  busy = action; result = null; showSlip = false; live = '';
  paint();
  const s = spec(action, n, opts.question);
  try {
    const r = await tandem.router.run({
      task: s.task, instruction: s.instruction, input: s.input, validators: s.validators, consentRedactedCloud: opts.consent,
      onToken: t => { live = t; const el = $('#live'); if (el) el.textContent = t; }
    });
    result = { action, r, question: opts.question, lang };
    printNext = false; chain = null;
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
  ['summarize', 'Summarise', 'S'], ['rewrite', 'Rewrite', 'R'], ['extract', 'Extract tasks', 'E'], ['translate', 'Translate', 'T'], ['ask', 'Ask my notes', 'A']
];

function annotation() {
  if (busy) {
    return html`<section class="ann" aria-busy="true"><div class="ann-h"><span class="caps">${ACTIONS.find(a => a[0] === busy)![1]} · routing</span><span class="spinner"></span></div>
      <p class="ann-why">Routing by policy v${tandem.policy.version}. The stamp appears when the SDK reports who answered.</p>
      <div class="ann-live" id="live">${live}</div></section>`;
  }
  if (!result) {
    return html`<section class="n-empty">
      <span class="caps">Margin</span>
      <p>Run an action. The answer lands here as an annotation, stamped with where it ran and why, with a receipt of exactly what left the device.</p>
      <div class="e-legend">
        <div>${routeBadge('LOCAL')}<span>Gemini Nano answered, here</span></div>
        <div>${routeBadge('CLOUD')}<span>the cloud model answered</span></div>
        <div>${routeBadge('CLOUD_REDACTED')}<span>sent with identifiers replaced</span></div>
        <div>${routeBadge('BLOCKED')}<span>sensitive, no local model: nothing sent</span></div>
      </div></section>`;
  }
  const { r, action } = result;
  const rc = r.receipt;
  let out: unknown = r.output;
  if (action === 'extract' && r.status === 'ok') {
    try {
      const raw = r.output.replace(/```(json)?/g, '');
      const j = JSON.parse(raw.slice(raw.indexOf('{')).replace(/[^}]*$/, ''));
      out = html`<ul>${(j.tasks ?? []).map((t: any) => html`<li>${t.task ?? t.title ?? JSON.stringify(t)}${t.owner ? html` <span class="chip">${t.owner}</span>` : ''}${t.due ? html` <span class="chip">due ${t.due}</span>` : ''}</li>`)}</ul>`;
    } catch { /* show raw */ }
  }
  const tr = action === 'translate';
  const out_ = html`<section class="ann" aria-live="polite">
    <div class="ann-h"><span class="caps">${ACTIONS.find(a => a[0] === action)![1]}${result.question ? `: ${result.question}` : ''}</span>${routeBadge(rc.route, { lg: true, seal: true })}</div>
    <p class="ann-why">${rc.why}</p>
    ${rc.qualityEscalation.happened ? escalationFlag(rc.qualityEscalation.reason) : rc.availabilityFallback ? fallbackFlag(rc.availabilityReason) : ''}
    ${r.status === 'ok' ? html`<div class="ann-out ${tr ? 'indic' : ''}" ${tr ? html`lang="${LANG_CODE[result.lang]}"` : ''}>${out}</div>`
      : r.status === 'blocked' ? banner('bad', 'Held on this device', 'This note contains sensitive identifiers and no on-device model is available here. Nothing was sent.', 'lock')
      : banner('bad', 'Could not complete', r.error ?? rc.why)}
    ${rc.qualityEscalation.happened && r.local ? html`<details><summary class="faint" style="cursor:pointer;font-size:12.5px">The local attempt that failed validation</summary><pre class="payload" tabindex="0" style="margin-top:8px">${r.local.output || '(empty)'}</pre></details>` : ''}
    <div class="ann-line"><span class="num">${fmtMs(rc.latencyMs)} · policy v${rc.policyVersion} · ${rc.route === 'LOCAL' || rc.route === 'BLOCKED' ? '0 bytes left' : `${rc.bytesOut.toLocaleString()} bytes left`}</span>
      <button class="btn btn-sm" id="slip-t" aria-expanded="${showSlip}">${icon('receipt')}${showSlip ? 'Hide receipt' : 'Print receipt'}</button></div>
    ${showSlip ? receiptSlip(rc, { index: tandem.receipts.length - 1, payload: r.sentToCloud ?? null, print: printNext, verify: true, verdict: chain }) : ''}
  </section>`;
  printNext = false;
  return out_;
}

function consentHtml() {
  if (!consent) return '';
  return html`<div class="scrim"></div><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="c-title"><div class="sheet pad stack" style="gap:14px">
    <h2 id="c-title" style="font:400 30px/1.1 var(--f-display)">Send a redacted version to the cloud?</h2>
    <p class="meta">Your consent applies to this one request only.</p>
    <p class="muted">There is no on-device model here, so this sensitive note was held. If you agree, exactly the text below is sent. Identifiers are replaced by placeholders and restored on your device afterwards.</p>
    <pre class="payload" tabindex="0">${consent.preview.split(/(\[[A-Z_]+_\d+\])/).map(p => /^\[[A-Z_]+_\d+\]$/.test(p) ? html`<mark>${p}</mark>` : p)}</pre>
    <div class="row" style="justify-content:flex-end"><button class="btn" id="c-no">Keep it local</button><button class="btn btn-primary" id="c-yes">Send redacted</button></div>
  </div></div>`;
}

function drawerHtml() {
  if (!drawer) return '';
  const rs = tandem.receipts.slice(-8).reverse();
  const base = tandem.receipts.length - 1;
  return html`<div class="scrim" data-close-drawer></div><aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="d-title">
    <div class="spread"><h2 id="d-title" style="font:400 30px/1.1 var(--f-display)">Receipts</h2><button class="btn btn-sm btn-ghost" data-close-drawer>Close</button></div>
    <p class="meta" style="margin:6px 0 14px">${tandem.receipts.length} in this browser, SHA-256 chained. Newest first. <a href="/studio/#/receipts">Open the full ledger</a></p>
    <div class="row" style="margin-bottom:14px"><button class="btn btn-sm" data-verify>Verify chain</button>${chain ? html`<span class="slip-verdict ${chain}" style="font:700 11px var(--f-mono)">${chain === 'ok' ? 'CHAIN VERIFIED' : 'CHAIN BROKEN'}</span>` : ''}</div>
    ${rs.length ? html`<div class="n-drawer-list">${rs.map((r, i) => receiptSlip(r, { index: base - i }))}</div>` : html`<p class="muted">No receipts yet. Every action you run issues one.</p>`}
  </aside>`;
}

function paint() {
  const n = note();
  const cap = tandem.capability;
  const ents = runDeterministicDetectors(n.body);
  const counts = ents.reduce<Record<string, number>>((a, e) => ((a[e.type] = (a[e.type] ?? 0) + 1), a), {});
  const words = (n.body.match(/\S+/g) ?? []).length;
  const focusId = (document.activeElement as HTMLElement | null)?.id;
  $('#app')!.innerHTML = html`
    <a class="skip" href="#body">Skip to the note</a>
    <header class="n-top">
      <a class="brand" href="/notes/">${brandMark}<span><span class="brand-name">Tandem Notes</span><span class="brand-sub">private · local-first · measured</span></span></a>
      <div class="row" style="gap:16px">
        <span class="status-strip">${cap.state === 'available' ? pill('on-device ready', 'local') : pill(`on-device: ${cap.raw}`, 'bad')}${!navigator.onLine ? pill('offline', 'warn') : ''}<span class="pill ok"><span class="dot" aria-hidden="true"></span>policy v${tandem.policy.version}</span></span>
        <button class="btn btn-sm" id="open-drawer">${icon('receipt')}Receipts <span class="num">${tandem.receipts.length}</span></button>
        <a class="btn btn-sm btn-ghost" href="/studio/">Studio</a>
        ${themeButton(true)}
      </div>
    </header>
    <div class="n-shell">
      <nav class="n-index" aria-label="Notes">
        <span class="caps">Notes · this browser</span>
        <button class="btn btn-sm n-new" id="new">${icon('plus')}New note</button>
        ${notes.map(x => html`<button class="note-item" data-note="${x.id}" aria-current="${x.id === current}"><span class="nt">${runDeterministicDetectors(x.body).length ? html`${icon('lock')}<span class="sr">Sensitive: </span>` : ''}<span>${x.title || 'Untitled'}</span></span><span class="np">${x.body.slice(0, 80)}</span></button>`)}
      </nav>
      <main class="n-page" id="main">
        ${!navigator.onLine ? banner('warn', 'You are offline', 'Actions the policy routes on-device still work. Cloud-routed actions will say they could not run.', 'wifioff') : ''}
        <div class="n-meta"><span>saved in this browser</span><span class="num">${words} words</span>${ents.length ? html`<span>${icon('lock')} found on-device: ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ')}</span>` : html`<span>no identifiers found</span>`}</div>
        <textarea class="editor-title" id="title" rows="1" placeholder="Untitled" aria-label="Note title">${n.title}</textarea>
        <textarea class="editor-body" id="body" aria-label="Note text" rows="10" placeholder="Start writing.">${n.body}</textarea>
        <div class="n-actions" role="toolbar" aria-label="AI actions">
          ${ACTIONS.map(([a, l, k]) => html`<button class="act ${busy === a ? 'busy' : ''}" data-act="${a}" ${busy ? 'disabled' : ''} aria-keyshortcuts="Alt+${k}" title="Alt+${k}">${l}</button>`)}
          <label class="lang">to <select class="select" id="lang">${LANGS.map(l => html`<option ${l.name === lang ? 'selected' : ''}>${l.name}</option>`)}</select></label>
        </div>
        <div id="askrow" class="row" hidden><input class="input" id="q" placeholder="Ask across your notes, e.g. When is the tax deadline?" style="flex:1"><button class="btn btn-primary" id="ask-go">Ask</button></div>
        <p class="n-fine">Each action is routed by the Tandem policy. Notes with identifiers (lock) never leave without your consent. All sample data is synthetic. Shortcuts: Alt+S, R, E, T, A.</p>
      </main>
      <aside class="n-margin" aria-label="Results">${annotation()}</aside>
    </div>${consentHtml()}${drawerHtml()}`.html;
  if (drawer) (document.querySelector('.drawer [data-close-drawer]') as HTMLElement)?.focus();
  else if (consent) ($('#c-no') as HTMLElement)?.focus();
  else if (focusId && focusId !== 'body' && focusId !== 'title') ($(`#${focusId}`) as HTMLElement | null)?.focus();
}

async function save() { await kvSet('notes', notes); }

async function verify() {
  const v = await verifyReceipts(tandem.receipts);
  chain = v.valid ? 'ok' : 'broken';
  paint();
}

document.addEventListener('click', async e => {
  const t = e.target as HTMLElement;
  if (t.closest('[data-theme-toggle]')) { toggleTheme(); return; }
  const ni = t.closest('[data-note]') as HTMLElement | null;
  if (ni) { current = ni.dataset.note!; result = null; paint(); return; }
  const a = t.closest('[data-act]') as HTMLElement | null;
  if (a && !busy) {
    const act = a.dataset.act as Action;
    if (act === 'ask') { const row = $('#askrow')!; row.hidden = !row.hidden; ($('#q') as HTMLInputElement)?.focus(); return; }
    void run(act);
  }
  if (t.closest('#ask-go')) { const q = ($('#q') as HTMLInputElement).value.trim(); if (q) void run('ask', { question: q }); }
  if (t.closest('#slip-t')) { showSlip = !showSlip; printNext = showSlip; paint(); }
  if (t.closest('[data-verify]')) void verify();
  if (t.closest('#open-drawer')) { drawer = true; paint(); }
  if (t.closest('[data-close-drawer]')) { drawer = false; paint(); $('#open-drawer')?.focus(); }
  if (t.closest('#new')) { const n: Note = { id: `n-${Date.now()}`, title: 'Untitled', body: '', updated: Date.now() }; notes.unshift(n); current = n.id; result = null; await save(); paint(); ($('#body') as HTMLTextAreaElement).focus(); }
  if (t.closest('#c-no')) { consent = null; paint(); }
  if (t.closest('#c-yes') && consent) { const c = consent; consent = null; void run(c.action, { consent: true, question: c.question }); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && consent) { consent = null; paint(); return; }
  if (e.key === 'Escape' && drawer) { drawer = false; paint(); $('#open-drawer')?.focus(); return; }
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'title') { e.preventDefault(); ($('#body') as HTMLElement)?.focus(); return; }
  if (e.key === 'Enter' && (e.target as HTMLElement).id === 'q') $('#ask-go')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  if (e.altKey && !e.ctrlKey && !e.metaKey && !busy) {
    if (e.code === 'KeyD') { e.preventDefault(); toggleTheme(); return; }
    const hit = ACTIONS.find(x => `Key${x[2]}` === e.code);
    if (hit) { e.preventDefault(); ($(`[data-act="${hit[0]}"]`) as HTMLElement)?.click(); }
  }
});
document.addEventListener('input', e => {
  const t = e.target as HTMLInputElement;
  if (t.id === 'title' || t.id === 'body') {
    const n = note();
    if (t.id === 'title') n.title = t.value; else n.body = t.value;
    n.updated = Date.now();
    const item = document.querySelector(`[data-note="${n.id}"] .nt > span:last-child`);
    if (item && t.id === 'title') item.textContent = t.value || 'Untitled';
    void save();
  }
});
document.addEventListener('change', e => { const t = e.target as HTMLSelectElement; if (t.id === 'lang') lang = t.value as typeof lang; });

(async () => {
  initTheme(() => paint());
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
