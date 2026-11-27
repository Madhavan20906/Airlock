/** Which measurements a screen shows: the viewer's own probe, or the author's labelled reference run. */
import { tandem } from '../services/tandem.js';
import { html } from '../ui/dom.js';
import type { RunResult } from '@tandem/policy';

export type DataChoice = 'mine' | 'reference';

export function chooseData(pref?: string | null): { choice: DataChoice; results: RunResult[]; label: string; caption: string } {
  const hasMine = tandem.myRun.length > 0;
  const hasRef = Boolean(tandem.reference?.results.length);
  const choice: DataChoice = pref === 'reference' && hasRef ? 'reference' : pref === 'mine' && hasMine ? 'mine' : hasMine ? 'mine' : 'reference';
  if (choice === 'mine') {
    return { choice, results: tandem.myRun, label: 'Your device', caption: `Measured on this device, ${new Date(tandem.myRunMeta?.date ?? Date.now()).toLocaleString()}, Chrome ${tandem.myRunMeta?.chrome ?? ''}` };
  }
  const r = tandem.reference;
  return {
    choice, results: r?.results ?? [], label: 'Reference run',
    caption: r ? `${r.label}: measured on the author's machine, ${new Date(r.measuredAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, Chrome ${r.chrome} · ${r.machine}` : 'No reference run bundled'
  };
}

export function dataToggle(choice: DataChoice) {
  const hasMine = tandem.myRun.length > 0;
  const hasRef = Boolean(tandem.reference?.results.length);
  return html`<div class="seg" role="group" aria-label="Measurements to show">
    <button data-data="mine" aria-pressed="${choice === 'mine'}" ${hasMine ? '' : 'disabled title="Run the probe first"'}>My run</button>
    <button data-data="reference" aria-pressed="${choice === 'reference'}" ${hasRef ? '' : 'disabled'}>Reference run</button>
  </div>`;
}

export function getParam(name: string): string | null {
  const q = location.hash.split('?')[1];
  return q ? new URLSearchParams(q).get(name) : null;
}
