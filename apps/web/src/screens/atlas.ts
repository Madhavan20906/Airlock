import type { Screen } from '../main.js';
import { html, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, empty, labelOf } from '../ui/components.js';
import { tandem } from '../services/tandem.js';
import { firebase } from '../services/firebase.js';
import { AVAIL, TTFT, TPS, ATLAS_TASKS, BAND_LABEL, buildContribution } from '../services/atlas.js';

interface Counts { total: number; avail: Record<string, number>; ttft: Record<string, number>; tps: Record<string, number>; pass80: Record<string, number>; passMeasured: Record<string, number> }

async function loadCounts(): Promise<Counts> {
  const c = (f?: string, v?: string) => firebase.atlasCount(f, v);
  const [total, ...rest] = await Promise.all([
    c(),
    ...AVAIL.map(a => c('availability', a)),
    ...TTFT.map(a => c('ttftBand', a)),
    ...TPS.map(a => c('tokensPerSecBand', a)),
    ...ATLAS_TASKS.map(t => c(`localPassBands.${t}`, 'gte80')),
    ...ATLAS_TASKS.map(t => c(`localPassBands.${t}`, 'na'))
  ]);
  let i = 0;
  const take = <T extends readonly string[]>(keys: T) => Object.fromEntries(keys.map(k => [k, rest[i++]]));
  const avail = take(AVAIL), ttft = take(TTFT), tps = take(TPS), pass80 = take(ATLAS_TASKS);
  const na = take(ATLAS_TASKS);
  const passMeasured = Object.fromEntries(ATLAS_TASKS.map(t => [t, total - na[t]]));
  return { total, avail, ttft, tps, pass80, passMeasured };
}

function hbars(rows: Array<{ label: string; n: number; tone?: string }>, total: number, aria: string) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return html`<div class="stack" style="gap:8px" role="list" aria-label="${aria}">${rows.map(r => html`
    <div role="listitem" class="duo-row" style="grid-template-columns:120px 1fr 64px" title="${r.label}: ${r.n} of ${total}">
      <span>${r.label}</span><span class="bar ${r.tone ?? ''}"><i style="width:${(r.n / max) * 100}%"></i></span><span class="num" style="text-align:right">${r.n}</span></div>`)}</div>`;
}

const screen: Screen = {
  title: 'Hybrid Atlas',
  crumb: 'Step 04 · Hybrid Atlas',
  render(root) {
    let counts: Counts | null = null;
    let error = '';
    let mine: any = null;
    let consent = false;
    let busy = false;

    const paint = () => {
      const enabled = firebase.settings.atlasEnabled && firebase.configured;
      const contrib = tandem.myRun.length ? buildContribution(tandem.myRun, tandem.capability.state, tandem.capability.chromeMajor) : null;
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">How many devices can <em>actually</em> run local AI?</h1>
          <p class="lede">Nobody can answer this for their own users today. The Atlas is an opt-in, anonymous map built from probe results. If you run the probe, you can be a data point.</p>
        </header>
        ${!enabled ? banner('warn', 'The Atlas is switched off', 'Remote Config atlas_enabled is false, or Firebase is not configured in this build.') : ''}
        <div class="grid g2" style="margin-bottom:8px">
          <div class="card card-pad stack">
            <strong>What is collected (and nothing else)</strong>
            <ul class="muted" style="font-size:13px;padding-left:18px;margin:0;display:grid;gap:3px">
              <li>Chrome version bucket (e.g. 155-159) and OS family</li>
              <li>On-device availability state</li>
              <li>Speed bands: median first-token time and tokens per second</li>
              <li>Local pass-rate bands per task type (&lt;50%, 50-80%, ≥80%)</li>
            </ul>
            <strong style="margin-top:6px">Not collected</strong>
            <p class="muted" style="font-size:13px">No content, no prompts, no location, no IP stored by Tandem, no device model. The record id is a SHA-256 of an anonymous Firebase sign-in id, so one device counts once. Delete it any time.</p>
          </div>
          <div class="card card-pad stack">
            <strong>Your contribution</strong>
            ${mine ? html`<div class="banner ok">${icon('check')}<div>Your device is in the Atlas. <button class="btn btn-sm" id="del" style="margin-left:8px">${icon('trash')}Delete it</button></div></div>`
              : !contrib ? html`<p class="muted" style="font-size:13px">Run the quick probe first. The Atlas only accepts measured results.</p><a class="btn btn-primary" href="#/probe" style="justify-self:start">${icon('race')}Run the probe</a>`
              : html`<pre class="payload" aria-label="Exactly what would be sent">${JSON.stringify(contrib, null, 2)}</pre>
                <label class="row" style="font-size:13px"><input type="checkbox" id="consent" ${consent ? 'checked' : ''}> I agree to add exactly this record to the public, anonymous Atlas.</label>
                <button class="btn btn-primary" id="add" ${!consent || busy || !enabled ? 'disabled' : ''} style="justify-self:start">${busy ? html`<span class="spinner"></span>` : icon('globe')}Add my device</button>`}
          </div>
        </div>
        <h2 class="section-title">The Atlas so far</h2>
        ${error ? banner('bad', 'Could not load the Atlas', error)
          : !counts ? html`<div class="card card-pad"><div class="skeleton" style="height:140px"></div></div>`
          : counts.total === 0 ? html`<div class="card">${empty('globe', 'No devices yet', 'Be the first: run the probe and add your device. No reference data is shown here, because none is fabricated.')}</div>`
          : html`
            <div class="card card-pad" style="margin-bottom:14px"><div class="scoreline"><span><span class="num">${counts.total}</span> device${counts.total === 1 ? '' : 's'} measured</span><span class="faint">·</span><span><span class="n-local num">${counts.avail.available}</span> could run Gemini Nano</span></div><p class="faint" style="font-size:12px;margin-top:6px">Live counts from Firestore aggregation queries. Self-selected sample (people who opened Tandem); not representative of all users.</p></div>
            <div class="grid g3">
              <div class="card card-pad stack"><strong>On-device availability</strong>${hbars(AVAIL.map(a => ({ label: a, n: counts!.avail[a], tone: a === 'available' ? 'local' : '' })), counts.total, 'Availability states')}</div>
              <div class="card card-pad stack"><strong>Median first token</strong>${hbars(TTFT.map(a => ({ label: BAND_LABEL[a], n: counts!.ttft[a], tone: a === 'na' ? '' : 'local' })), counts.total, 'Time to first token bands')}</div>
              <div class="card card-pad stack"><strong>Local tokens per second</strong>${hbars(TPS.map(a => ({ label: BAND_LABEL[a], n: counts!.tps[a], tone: a === 'na' ? '' : 'local' })), counts.total, 'Tokens per second bands')}</div>
            </div>
            <div class="card card-pad stack" style="margin-top:14px"><strong>Devices where on-device passed ≥ 80% of tasks</strong>${hbars(ATLAS_TASKS.map(t => ({ label: `${labelOf[t]} (of ${counts!.passMeasured[t]})`, n: counts!.pass80[t], tone: 'local' })), counts.total, 'Pass rate at least 80 percent by task')}</div>`}`.html;
    };

    const refresh = async () => {
      try { counts = await loadCounts(); error = ''; } catch (e: any) { error = String(e?.message ?? e); }
      mine = await firebase.atlasMine();
      paint();
    };

    root.addEventListener('change', e => { if ((e.target as HTMLElement).id === 'consent') { consent = (e.target as HTMLInputElement).checked; paint(); } });
    root.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      if (t.closest('#add')) {
        const c = buildContribution(tandem.myRun, tandem.capability.state, tandem.capability.chromeMajor);
        busy = true; paint();
        try { await firebase.atlasContribute(c as any); toast('Added. Thank you.'); } catch (err: any) { toast(`Could not add: ${err?.message ?? err}`); }
        busy = false; await refresh();
      }
      if (t.closest('#del')) { try { await firebase.atlasDelete(); toast('Your record was deleted'); } catch (err: any) { toast(String(err?.message ?? err)); } await refresh(); }
    });
    const unsub = firebase.onChange(() => { void refresh(); });
    paint();
    void refresh();
    return unsub;
  }
};
export default screen;
