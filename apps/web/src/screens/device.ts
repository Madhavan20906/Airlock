import type { Screen } from '../main.js';
import { html, fmtMs, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyph } from '../ui/glyphs.js';
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
  crumb: 'Orientation · Device check',
  render(root) {
    let apis: Record<string, string> = {};
    let progress: number | null = null;
    let proof: { running: boolean; online?: boolean; servedBy?: string | null; source?: string; text?: string; ms?: number; error?: string } = { running: false };

    const paint = () => {
      const c = tandem.capability;
      const state = c.state;
      const ok = state === 'available';
      const title = ok ? html`Gemini Nano is <em>ready on this device.</em>`
        : state === 'downloadable' ? html`Gemini Nano can run here, <em>after a one-time download.</em>`
        : state === 'downloading' ? html`Gemini Nano is <em>downloading.</em>`
        : state === 'unavailable' ? html`This device cannot run Gemini Nano <em>right now.</em>`
        : html`This browser has <em>no on-device AI.</em>`;
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">${title}</h1>
          <p class="lede">Tandem never pretends. Without a local model the on-device lane says so, sensitive notes are held for your consent, and everything else runs in the cloud with the true source shown.</p>
        </header>
        <div class="folio">
          <div>
            <div class="diag plate">
              <div class="diag-main">
                <span class="caps">LanguageModel.availability()</span>
                <span class="diag-v ${ok ? 't-local' : ''}">${c.raw}</span>
                ${ok ? routeBadge('LOCAL', { lg: true }) : html`<span class="stamp blocked lg" role="img" aria-label="On-device lane idle">${glyph('blocked')}Lane idle</span>`}
              </div>
              <dl class="diag-kv">
                <div><dt>Chrome</dt><dd class="num">${c.chromeMajor ?? 'unknown'}</dd></div>
                <div><dt>Prompt API</dt><dd>${c.promptApi ? 'present' : 'absent'}</dd></div>
                <div><dt>Network</dt><dd>${navigator.onLine ? 'online' : 'offline'}</dd></div>
                <div><dt>Cloud lane</dt><dd>unaffected</dd></div>
              </dl>
              ${state === 'downloadable' || state === 'downloading' ? html`<div class="stack" style="padding:16px 20px;border-top:1px solid var(--rule)">
                <button class="btn btn-primary" id="dl" style="justify-self:start" ${progress !== null ? 'disabled' : ''}>${icon('download')}${progress !== null ? 'Downloading' : 'Download Gemini Nano'}</button>
                ${progress !== null ? html`${bar(progress, 'local', 'Download progress')}<span class="num faint" style="font-size:12px">${Math.round(progress * 100)}%</span>` : html`<span class="meta">About 4 GB, once. Needs an unmetered connection and about 22 GB free on the drive with your Chrome profile.</span>`}</div>` : ''}
              <div class="row" style="padding:12px 20px;border-top:1px solid var(--rule)"><button class="btn btn-sm" id="recheck">${icon('gauge')}Check again</button></div>
            </div>
            ${state === 'unavailable' || state === 'unsupported' ? html`
              <div class="sec"><h2>To enable it</h2><span class="caps">desktop Chrome</span></div>
              <ol class="steps big">
                <li>Use Chrome 139 or later on Windows 10/11, macOS 13+ or Linux.</li>
                <li>Open <span class="mono">chrome://flags/#prompt-api-for-gemini-nano-multimodal-input</span>, set Enabled, restart.</li>
                <li>Hardware: a GPU with more than 4 GB VRAM, or 16 GB RAM and 4+ cores; 22 GB free disk.</li>
                <li>Check <span class="mono">chrome://on-device-internals</span> for the model state.</li>
              </ol>` : ''}
            <div class="sec"><h2>Airplane-mode proof</h2><span class="caps">ONLY_ON_DEVICE</span></div>
            <ol class="steps">
              <li>Turn off Wi-Fi, or DevTools → Network → Offline.</li>
              <li>Press the button. It calls Firebase AI Logic with <span class="mono">InferenceMode.ONLY_ON_DEVICE</span>.</li>
              <li>The stamp shows the source the SDK reports, and whether the browser was offline.</li>
            </ol>
            <div class="row" style="margin-top:14px"><button class="btn btn-primary" id="proof" ${proof.running || !ok ? 'disabled' : ''}>${proof.running ? html`<span class="spinner"></span>Running locally` : html`${icon('play')}Run a local prompt now`}</button>
              ${!ok ? html`<span class="meta">Needs a ready on-device model. The proof footage in the demo video was recorded on the author's laptop.</span>` : ''}</div>
            ${proof.servedBy !== undefined || proof.error ? html`<div class="ann" style="margin-top:18px;padding-top:14px;border-top:1px solid var(--ink)">
              ${proof.error ? banner('bad', 'The local call failed', proof.error) : html`
              <div class="row">${proof.servedBy === 'on_device' ? routeBadge('LOCAL', { lg: true, seal: true }) : routeBadge('CLOUD', { lg: true, seal: true })}<span class="chip">network <b>${proof.online ? 'online' : 'OFFLINE'}</b></span><span class="chip"><b>${fmtMs(proof.ms)}</b></span><span class="chip">source <b>${proof.source}</b></span></div>
              <p class="ann-out">${proof.text}</p>`}</div>` : ''}
            <div class="sec"><h2>Chrome built-in AI here</h2><span class="caps">reported live</span></div>
            <div class="table-wrap"><table class="t"><thead><tr><th>API</th><th>Availability here</th><th>In Tandem</th></tr></thead><tbody>
              ${APIS.map(a => html`<tr><td style="font-weight:500">${a.name}</td><td class="mono">${apis[a.g] ?? 'checking'}</td><td class="muted">${a.use}</td></tr>`)}
            </tbody></table></div>
            ${!navigator.onLine ? html`<div style="margin-top:16px">${banner('warn', 'You are offline', 'Local inference still works. Cloud calls will fail and say so.', 'wifioff')}</div>` : ''}
          </div>
          <aside class="margin">
            <div class="mnote"><span class="caps">Without Nano</span><span>Every screen still works. The Frontier and Policy show the labelled reference run from the author's laptop; your probe runs the cloud lane alone.</span></div>
            <div class="mnote"><span class="caps">Claims</span><span>Tandem only claims what it runs: all local inference goes through the Prompt API via Firebase AI Logic.</span></div>
          </aside>
        </div>`.html;
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
