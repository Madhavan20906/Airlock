import type { Screen } from '../main.js';
import { html, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyph } from '../ui/glyphs.js';
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

const CAP = 30;
/** One pinned disc per real contribution, up to a cap, then the count. Nothing padded. */
function specimens(title: string, rows: Array<{ label: string; n: number; local: boolean }>) {
  return html`<figure class="specimen plate"><figcaption class="caps">${title}</figcaption>
    <div class="spec-cols" role="list">${rows.map(r => html`<div class="spec-col" role="listitem" aria-label="${r.label}: ${r.n} device${r.n === 1 ? '' : 's'}">
      <div class="pins" aria-hidden="true">${Array.from({ length: Math.min(r.n, CAP) }, () => html`<i class="${r.local ? 'l' : 'o'}"></i>`)}${r.n > CAP ? html`<b class="num">+${r.n - CAP}</b>` : ''}</div>
      <span class="spec-n num">${r.n}</span><span class="spec-label">${r.label}</span></div>`)}</div></figure>`;
}

const screen: Screen = {
  title: 'Hybrid Atlas',
  crumb: 'Pipeline · 5 Hybrid Atlas',
  render(root) {
    let counts: Counts | null = null;
    let error = '';
    let mine: any = null;
    let consent = false;
    let busy = false;

    const paint = () => {
      const enabled = firebase.settings.atlasEnabled && firebase.configured;
      const contrib = tandem.myRun.length ? buildContribution(tandem.myRun, tandem.capability.state, tandem.capability.chromeMajor) : null;
      try { sessionStorage.setItem('tandem-atlas-mine', mine ? '1' : '0'); } catch { /* ignore */ }
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">How many devices can <em>actually</em> run local AI?</h1>
          <p class="lede">Nobody can answer this for their own users today. The Atlas is an opt-in, anonymous map built only from probe results. Run the probe and you can be one pin on it.</p>
        </header>
        ${!enabled ? html`<div style="margin-bottom:20px">${banner('warn', 'The Atlas is switched off', 'Remote Config atlas_enabled is false, or Firebase is not configured in this build. Nothing below is collected.')}</div>` : ''}
        <div class="folio">
          <div>
            ${error ? banner('bad', 'Could not load the Atlas', html`${error} <button class="btn btn-sm" id="retry" style="margin-left:8px">Try again</button>`)
              : !counts ? html`<div class="scan" role="status" aria-label="Loading counts"></div><p class="meta" style="margin-top:8px">Counting devices with Firestore aggregation queries.</p>`
              : counts.total === 0 ? html`<div class="plate">${empty('globe', 'No devices yet', 'Be the first: run the probe and add your device. No reference data is shown here, because none is invented.')}</div>`
              : html`
                <p class="verdict"><span class="vn num">${counts.total}</span><span>device${counts.total === 1 ? '' : 's'} measured,</span><span class="t-local"><b class="num">${counts.avail.available}</b> could run Gemini Nano.</span><span class="muted">Live Firestore counts. A self-selected sample of people who opened Tandem, not all users.</span></p>
                ${specimens('On-device availability', AVAIL.map(a => ({ label: a, n: counts!.avail[a], local: a === 'available' })))}
                <div class="g2 grid" style="margin-top:26px">
                  ${specimens('Median first token', TTFT.map(a => ({ label: BAND_LABEL[a], n: counts!.ttft[a], local: a !== 'na' })))}
                  ${specimens('Local tokens per second', TPS.map(a => ({ label: BAND_LABEL[a], n: counts!.tps[a], local: a !== 'na' })))}
                </div>
                <div class="sec"><h2>Passed ≥ 80% on-device</h2><span class="caps">devices, by task type</span></div>
                <div class="table-wrap"><table class="t"><thead><tr><th>Task</th><th class="r">Devices ≥ 80%</th><th class="r">Measured</th></tr></thead><tbody>
                  ${ATLAS_TASKS.map(t => html`<tr><td>${labelOf[t]}</td><td class="num r">${counts!.pass80[t]}</td><td class="num r faint">${counts!.passMeasured[t]}</td></tr>`)}
                </tbody></table></div>`}
          </div>
          <aside class="margin">
            <section class="consent" aria-labelledby="cn-t">
              <h2 id="cn-t" class="consent-t">Your device</h2>
              ${mine ? html`<p>${glyph('local')} Your device is in the Atlas.</p><button class="btn btn-sm" id="del">${icon('trash')}Delete my record</button>`
                : !contrib ? html`<p class="muted">The Atlas only accepts measured results. Run the quick probe first.</p><a class="btn btn-primary" href="#/probe" style="justify-self:start">${icon('play')}Run the probe</a>`
                : html`<p class="caps">Exactly this record would be sent</p>
                  <pre class="payload" aria-label="Exactly what would be sent">${JSON.stringify(contrib, null, 2)}</pre>
                  <label class="consent-check"><input type="checkbox" id="consent" ${consent ? 'checked' : ''}><span>I agree to add exactly this record to the public, anonymous Atlas.</span></label>
                  <button class="btn btn-primary" id="add" ${!consent || busy || !enabled ? 'disabled' : ''}>${busy ? html`<span class="spinner"></span>` : ''}Add my device</button>`}
            </section>
            <div class="mnote"><span class="caps">Collected</span><span>Chrome version bucket and OS family; availability state; speed bands; local pass-rate bands per task type.</span></div>
            <div class="mnote"><span class="caps">Never collected</span><span>Content, prompts, location, device model. Tandem stores no IP. The record id is a SHA-256 of an anonymous sign-in id, so one device counts once. Delete it any time.</span></div>
          </aside>
        </div>`.html;
    };

    const refresh = async () => {
      try { counts = await loadCounts(); error = ''; } catch (e: any) { error = String(e?.message ?? e); }
      try { mine = await firebase.atlasMine(); } catch { mine = null; }
      paint();
    };

    root.addEventListener('change', e => { if ((e.target as HTMLElement).id === 'consent') { consent = (e.target as HTMLInputElement).checked; paint(); (root.querySelector('#consent') as HTMLElement)?.focus(); } });
    root.addEventListener('click', async e => {
      const t = e.target as HTMLElement;
      if (t.closest('#retry')) { error = ''; counts = null; paint(); void refresh(); }
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
