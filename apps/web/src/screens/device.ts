import type { Screen } from '../main.js';
import { html, fmtMs, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, routeBadge, bar } from '../ui/components.js';
import { tandem } from '../services/tandem.js';

const APIS = [
  { name: 'Prompt API', g: 'LanguageModel', use: 'All local inference (via Firebase AI Logic)' },
  { name: 'Summarizer', g: 'Summarizer', use: 'Not used by Tandem yet' },
  { name: 'Writer', g: 'Writer', use: 'Not used by Tandem yet' },
  { name: 'Rewriter', g: 'Rewriter', use: 'Not used by Tandem yet' },
  { name: 'Proofreader', g: 'Proofreader', use: 'Not used by Tandem yet' },
  { name: 'Translator', g: 'Translator', use: 'Not used by Tandem yet' },
  { name: 'Language Detector', g: 'LanguageDetector', use: 'Not used by Tandem yet' }
];

async function apiStates() {
  const out: Record<string, string> = {};
  for (const a of APIS) {
    const A = (globalThis as any)[a.g];
    if (!A) { out[a.g] = 'not in this browser'; continue; }
    try {
      out[a.g] = a.g === 'Translator' ? await A.availability({ sourceLanguage: 'en', targetLanguage: 'hi' }) : await A.availability();
    } catch (e: any) { out[a.g] = `error: ${e?.name ?? e}`; }
  }
  return out;
}

const screen: Screen = {
  title: 'Device check',
  crumb: 'Measure · Device check',
  render(root) {
    let apis: Record<string, string> = {};
    let progress: number | null = null;
    let proof: { running: boolean; online?: boolean; servedBy?: string | null; source?: string; text?: string; ms?: number; error?: string } = { running: false };

    const paint = () => {
      const c = tandem.capability;
      const state = c.state;
      const title = state === 'available' ? 'Gemini Nano is ready on this device'
        : state === 'downloadable' ? 'Gemini Nano can run here, after a one-time download'
        : state === 'downloading' ? 'Gemini Nano is downloading'
        : state === 'unavailable' ? 'This device cannot run Gemini Nano right now'
        : 'This browser has no on-device AI';
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">${title}</h1>
          <p class="lede">Tandem never pretends. If there is no local model, the on-device lane says so, sensitive tasks are held for your consent, and everything else uses the cloud with the true source shown.</p>
        </header>
        <div class="grid g2">
          <div class="card card-pad stack">
            <div class="spread"><strong>On-device model</strong>${state === 'available' ? routeBadge('LOCAL') : html`<span class="chip">${c.raw}</span>`}</div>
            <div class="muted" style="font-size:13px">Chrome ${c.chromeMajor ?? 'unknown'} · Prompt API ${c.promptApi ? 'present' : 'absent'} · <span class="mono">LanguageModel.availability()</span> = <span class="mono">${c.raw}</span></div>
            ${state === 'downloadable' || state === 'downloading' ? html`
              <button class="btn btn-primary" id="dl" ${progress !== null ? 'disabled' : ''}>${icon('download')}${progress !== null ? 'Downloading…' : 'Download Gemini Nano'}</button>
              ${progress !== null ? html`${bar(progress, 'local', 'Download progress')}<span class="num faint" style="font-size:12px">${Math.round(progress * 100)}%</span>` : html`<span class="faint" style="font-size:12px">About 4 GB, once. Needs an unmetered connection and ~22 GB free on the drive holding your Chrome profile.</span>`}` : ''}
            ${state === 'unavailable' || state === 'unsupported' ? html`
              <ol class="muted" style="font-size:13px;padding-left:18px;margin:0;display:grid;gap:6px">
                <li>Use Chrome 139+ on Windows 10/11, macOS 13+ or Linux (desktop).</li>
                <li>Open <span class="mono">chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</span>, set Enabled, restart.</li>
                <li>Hardware: GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ cores. 22 GB free disk.</li>
                <li>Check <span class="mono">chrome://on-device-internals</span> for the model state.</li>
              </ol>` : ''}
            <button class="btn btn-sm" id="recheck" style="justify-self:start">${icon('gauge')}Check again</button>
          </div>
          <div class="card card-pad stack">
            <strong>Airplane-mode proof</strong>
            <ol class="muted" style="font-size:13px;padding-left:18px;margin:0;display:grid;gap:4px">
              <li>Turn off Wi-Fi (or DevTools → Network → Offline).</li>
              <li>Press the button. It calls Firebase AI Logic with <span class="mono">InferenceMode.ONLY_ON_DEVICE</span>.</li>
              <li>The badge shows the source the SDK reports, and whether the browser was offline.</li>
            </ol>
            <button class="btn btn-primary" id="proof" ${proof.running || state !== 'available' ? 'disabled' : ''} style="justify-self:start">${proof.running ? html`<span class="spinner"></span>Running locally…` : html`${icon('chip')}Run a local prompt now`}</button>
            ${proof.servedBy !== undefined || proof.error ? html`<div class="card card-pad stack" style="box-shadow:none;background:var(--paper-2)">
              ${proof.error ? html`<span style="color:var(--bad)">${proof.error}</span>` : html`
              <div class="row">${proof.servedBy === 'on_device' ? routeBadge('LOCAL', { seal: true }) : routeBadge('CLOUD')}<span class="chip">network <b>${proof.online ? 'online' : 'OFFLINE'}</b></span><span class="chip">${fmtMs(proof.ms)}</span><span class="chip">source <b>${proof.source}</b></span></div>
              <div class="mono" style="font-size:13px">${proof.text}</div>`}</div>` : ''}
            ${state !== 'available' ? html`<span class="faint" style="font-size:12px">Needs a ready on-device model. The proof footage in the demo video was recorded on the author's laptop.</span>` : ''}
          </div>
        </div>
        <h2 class="section-title">Chrome built-in AI on this browser</h2>
        <div class="card table-wrap"><table class="t"><thead><tr><th>API</th><th>Availability here</th><th>In Tandem</th></tr></thead><tbody>
          ${APIS.map(a => html`<tr><td style="font-weight:600">${a.name}</td><td class="mono">${apis[a.g] ?? 'checking…'}</td><td class="muted">${a.use}</td></tr>`)}
        </tbody></table></div>
        <p class="faint" style="font-size:12px;margin-top:10px">Reported live by this browser. Tandem only claims what it runs: all local inference goes through the Prompt API via Firebase AI Logic.</p>
        ${!navigator.onLine ? html`<div style="margin-top:16px">${banner('warn', 'You are offline', 'Local inference still works. Cloud calls will fail and say so.', 'wifioff')}</div>` : ''}`.html;
    };

    root.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      if (t.closest('#recheck')) { await tandem.refreshCapability(); apis = await apiStates(); paint(); }
      if (t.closest('#dl') && tandem.ai) {
        progress = 0; paint();
        try { await tandem.ai.downloadModel(f => { progress = f; paint(); }); toast('Gemini Nano is ready'); }
        catch (err: any) { toast(`Download failed: ${err?.message ?? err}`); }
        progress = null; await tandem.refreshCapability(); paint();
      }
      if (t.closest('#proof') && tandem.ai) {
        proof = { running: true }; paint();
        try {
          const online = navigator.onLine;
          const r = await tandem.ai.runOnDevice('In one short sentence: why is it useful for AI to run on the device itself?');
          proof = { running: false, online, servedBy: r.servedBy, source: r.servedBySource === 'sdk' ? 'SDK inferenceSource' : 'mode (ONLY_ON_DEVICE)', text: r.text.trim(), ms: r.totalMs };
        } catch (err: any) { proof = { running: false, error: String(err?.message ?? err) }; }
        paint();
      }
    });
    const unsub = tandem.subscribe(paint);
    const onNet = () => paint();
    addEventListener('online', onNet); addEventListener('offline', onNet);
    paint();
    void apiStates().then(a => { apis = a; paint(); });
    return () => { unsub(); removeEventListener('online', onNet); removeEventListener('offline', onNet); };
  }
};
export default screen;
