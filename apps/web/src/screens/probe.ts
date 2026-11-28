import type { Screen } from '../main.js';
import { html, raw, fmtMs, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { glyph } from '../ui/glyphs.js';
import { checkChip, labelOf, backendBadge } from '../ui/components.js';
import { probeState } from '../ui/bus.js';
import { tandem } from '../services/tandem.js';
import { firebase } from '../services/firebase.js';
import { ProbeRunner, generateBattery, quickProbe, type BenchTask, type ProbeEvent, type ValidationReport } from '@tandem/bench';
import { estimateTokens, type RunResult } from '@tandem/policy';
import { runDeterministicDetectors, redactText } from '@tandem/guard';

type LaneKey = 'on_device' | 'in_cloud';
interface Lane {
  task: BenchTask | null; text: string; ttft: number | null; total: number | null; tps: number | null;
  report: ValidationReport | null; servedBy: LaneKey | null; done: number; passed: number; qualitySum: number;
  status: 'idle' | 'running' | 'unavailable' | 'error'; t0: number;
  tok: number; lastTok: Map<string, number>; hist: Array<[number, number]>; samples: Array<[number, number]>; lastTokT: number;
}
const freshLane = (): Lane => ({ task: null, text: '', ttft: null, total: null, tps: null, report: null, servedBy: null, done: 0, passed: 0, qualitySum: 0, status: 'idle', t0: 0, tok: 0, lastTok: new Map(), hist: [], samples: [], lastTokT: -1e9 });

const VALIDATOR_LABEL: Record<string, string> = {
  exact: 'exact label', contains: 'answer', json_schema: 'JSON schema', field_f1: 'fields', required_facts: 'facts kept',
  max_len: 'length', min_len: 'min length', script_present: 'script', bullets: 'format', no_refusal: 'no refusal'
};

/** A recorded run: the event stream with timestamps (ms since start). The UI state is a pure function of it, so replay is exact. */
interface Rec { t: number; e: ProbeEvent }
let lastRecording: { events: Rec[]; tasks: BenchTask[]; duration: number } | null = null;

let W = 600;
const H = 132, WINDOW = 40000;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const screen: Screen = {
  title: 'Probe',
  crumb: 'Pipeline · 1 Probe',
  render(root) {
    let mode: 'quick' | 'full' = 'quick';
    let runner: ProbeRunner | null = null;
    let running = false, paused = false, finished = false;
    let lanes: Record<LaneKey, Lane> = { on_device: freshLane(), in_cloud: freshLane() };
    let tasks: BenchTask[] = quickProbe();
    const cells = new Map<string, { l?: boolean | null; c?: boolean | null }>();
    let events: Rec[] = [];
    let runT0 = 0;
    let now = 0;               // the strip's "current time": live clock, or the scrubber position
    let replay: { at: number; playing: boolean } | null = null;
    let loop = 0;
    let prevScore = { l: -1, c: -1, q: -1 };

    const qp = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const lanesParam = qp.get('lanes');
    const splitParam = qp.get('split') === 'heldout' ? 'heldout' : 'calibration';
    const typesParam = qp.get('types')?.split(',') ?? null;
    const fullTasks = () => generateBattery().filter(t => t.split === splitParam && (!typesParam || typesParam.includes(t.type)));
    const localReady = () => lanesParam !== 'cloud' && tandem.capability.state === 'available';
    const cloudReady = () => lanesParam !== 'local' && firebase.configured && !firebase.settings.killSwitchCloud && navigator.onLine;

    // ── state from events ───────────────────────────────────────────────
    const apply = (e: ProbeEvent, t: number) => {
      if (e.type === 'done') return;
      const k = e.backend;
      const L = lanes[k];
      if (e.type === 'start') {
        Object.assign(L, { task: e.task, text: '', ttft: null, total: null, tps: null, report: null, servedBy: null, status: 'running', t0: t });
        L.lastTok.set(e.task.id, 0);
      } else if (e.type === 'token') {
        if (L.task?.id === e.task.id) { L.text = e.text; if (L.ttft === null) L.ttft = t - L.t0; }
        const est = estimateTokens(e.text);
        L.tok += Math.max(0, est - (L.lastTok.get(e.task.id) ?? 0));
        L.lastTok.set(e.task.id, est);
        L.lastTokT = t;
        L.hist.push([t, L.tok]);
        while (L.hist.length > 2 && L.hist[0][0] < t - 700) L.hist.shift();
        const [t0, k0] = L.hist[0];
        const rate = t - t0 > 60 ? ((L.tok - k0) / (t - t0)) * 1000 : 0;
        const last = L.samples[L.samples.length - 1];
        if (!last || t - last[0] >= 80) L.samples.push([t, rate]);
        if (L.samples.length > 1800) L.samples.splice(0, 300);
      } else if (e.type === 'result') {
        const r: RunResult = e.result;
        if (L.task?.id === e.task.id || !L.task) {
          L.status = r.ok ? 'idle' : r.error === 'unavailable' ? 'unavailable' : 'error';
          L.text = r.ok ? e.output : `[${r.error}] the call failed; recorded as ${r.error === 'unavailable' ? 'unavailable (excluded from quality)' : 'a failure'}`;
          L.ttft = r.ttftMs; L.total = r.totalMs; L.report = e.report; L.servedBy = r.servedBy; L.task = e.task;
          L.tps = r.ok && r.totalMs && r.ttftMs !== null ? r.outTokensEst / Math.max(0.05, (r.totalMs - r.ttftMs) / 1000) : null;
        }
        if (r.error !== 'unavailable') { L.done++; if (r.passed) L.passed++; L.qualitySum += r.quality; }
        const c = cells.get(r.taskId) ?? {};
        if (k === 'on_device') c.l = r.error === 'unavailable' ? null : r.passed; else c.c = r.error === 'unavailable' ? null : r.passed;
        cells.set(r.taskId, c);
      } else if (e.type === 'skip') {
        const c = cells.get(e.task.id) ?? {};
        if (k === 'in_cloud') c.c = null; else c.l = null;
        cells.set(e.task.id, c);
      }
    };
    const rebuild = (upTo: number) => {
      lanes = { on_device: freshLane(), in_cloud: freshLane() };
      cells.clear();
      for (const r of events) { if (r.t > upTo) break; apply(r.e, r.t); }
      now = upTo;
    };

    // ── the pen trace ───────────────────────────────────────────────────
    const yMax = () => {
      const m = Math.max(1, ...lanes.on_device.samples.map(s => s[1]), ...lanes.in_cloud.samples.map(s => s[1]));
      return Math.max(40, Math.ceil((m * 1.15) / 20) * 20);
    };
    const traceD = (L: Lane, ym: number) => {
      const x = (t: number) => W - ((now - t) / WINDOW) * W;
      const y = (v: number) => H - 14 - (Math.min(v, ym) / ym) * (H - 28);
      const pts = L.samples.filter(s => s[0] >= now - WINDOW - 500 && s[0] <= now);
      if (!pts.length) return { d: '', tip: null as null | [number, number] };
      const seq: Array<[number, number]> = [];
      let prevT = -1e9;
      for (const [t, v] of pts) { if (t - prevT > 900) seq.push([prevT + 300, 0], [t - 200, 0]); seq.push([t, v]); prevT = t; }
      if (now - prevT > 600) seq.push([prevT + 300, 0], [now, 0]);
      const d = seq.filter(([t]) => t > now - WINDOW - 1000).map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)} ${y(v).toFixed(1)}`).join('');
      const tail = seq[seq.length - 1];
      return { d, tip: [x(tail[0]), y(tail[1])] as [number, number] };
    };
    const gridSvg = (k: LaneKey, ym: number) => {
      // vertical lines sit at absolute seconds, so they travel left as time passes: the paper moves
      const lines: string[] = [];
      const s0 = Math.floor((now - WINDOW) / 1000);
      for (let s = s0; s <= Math.ceil(now / 1000); s++) {
        const x = W - ((now - s * 1000) / WINDOW) * W;
        if (x < 0 || x > W) continue;
        const major = s % 5 === 0;
        lines.push(`<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${major ? 8 : 14}" y2="${H - 14}" class="${major ? 'g-maj' : 'g-min'}"/>`);
        if (major && s >= 0) lines.push(`<text x="${(x + 3).toFixed(1)}" y="${H - 3}" class="g-lab">${s}s</text>`);
      }
      const ys = [0, 0.5, 1].map(f => { const y = H - 14 - f * (H - 28); return `<line x1="0" x2="${W}" y1="${y}" y2="${y}" class="${f === 0 ? 'g-base' : 'g-min'}"/><text x="4" y="${y - 3}" class="g-lab">${Math.round(ym * f)}</text>`; });
      return `<g class="g" data-k="${k}">${ys.join('')}${lines.join('')}</g>`;
    };
    const stripSvg = (k: LaneKey) => {
      const L = lanes[k];
      const ym = yMax();
      const { d, tip } = traceD(L, ym);
      return raw(`<svg class="strip-svg" viewBox="0 0 ${W} ${H}" aria-hidden="true">${gridSvg(k, ym)}<path class="pen" d="${d}"/>${tip ? `<line class="needle" x1="${tip[0]}" x2="${W}" y1="${tip[1]}" y2="${tip[1]}"/><circle class="tip" cx="${tip[0]}" cy="${tip[1]}" r="3.2"/>` : ''}</svg>`);
    };

    // ── markup ──────────────────────────────────────────────────────────
    const laneHtml = (k: LaneKey) => {
      const L = lanes[k];
      const isLocal = k === 'on_device';
      const name = isLocal ? 'On-device' : 'Cloud';
      const sub = isLocal ? 'Gemini Nano · ONLY_ON_DEVICE' : 'gemini-3.5-flash-lite · ONLY_IN_CLOUD';
      const blocked = (isLocal ? !localReady() : !cloudReady()) && !events.length;
      const why = isLocal
        ? html`This Chrome reports <span class="mono">${tandem.capability.raw}</span>. The cloud lane still runs; nothing is simulated. <a href="#/device">Set up on-device AI</a>.`
        : lanesParam === 'local' ? 'Cloud lane switched off for this run (lanes=local).' : !navigator.onLine ? 'Offline. That is the point: the on-device lane keeps going.' : firebase.settings.killSwitchCloud ? 'The cloud kill switch is on in Remote Config.' : 'Firebase is not configured in this build.';
      const showText = L.text || (L.status === 'running' ? '' : L.task ? '(no output)' : 'Ready. Each task streams here as it runs.');
      return html`<section class="lane ${isLocal ? 'local' : 'cloud'} ${blocked ? 'is-off' : ''}" aria-label="${name} lane">
        <header class="lane-h">
          <span class="lane-id">${glyph(isLocal ? 'local' : 'cloud')}<span>${name}</span></span>
          <span class="lane-model">${sub}</span>
          <span class="lane-stamp">${L.servedBy ? backendBadge(L.servedBy) : ''}</span>
        </header>
        <div class="strip" data-strip="${k}">
          ${stripSvg(k)}
          <span class="strip-unit">tok/s <abbr title="estimated from characters streamed">est.</abbr></span>
          ${blocked ? html`<span class="no-signal">No signal</span>` : ''}
        </div>
        ${blocked ? html`<div class="lane-off"><p class="lane-off-t">${isLocal ? 'No on-device model on this device' : 'Cloud lane unavailable'}</p><p class="muted">${why}</p></div>` : html`
        <dl class="readouts3">
          <div><dt>first token</dt><dd class="num" data-r="ttft-${k}">${fmtMs(L.ttft)}</dd></div>
          <div><dt>tokens / s <span class="faint">est.</span></dt><dd class="num" data-r="tps-${k}">${L.tps === null ? '—' : L.tps.toFixed(1)}</dd></div>
          <div><dt>total</dt><dd class="num" data-r="tot-${k}">${fmtMs(L.total)}</dd></div>
        </dl>
        <div class="lane-task">${L.task ? html`<span class="caps">now</span><span class="mono">${labelOf[L.task.type]} · ${L.task.lengthBucket}${L.task.sensitive ? ' · sensitive, redacted for cloud' : ''}</span>` : html`<span class="caps">idle</span>`}</div>
        <pre class="stream" id="stream-${k}" aria-live="off" tabindex="0" aria-label="${name} output">${showText}${L.status === 'running' ? html`<span class="caret"></span>` : ''}</pre>
        <div class="checks" role="group" aria-label="Validator results">${L.report ? L.report.results.map(r => checkChip(VALIDATOR_LABEL[r.kind] ?? r.kind, r.passed, r.detail, true)) : L.task ? L.task.validators.map(v => checkChip(VALIDATOR_LABEL[v.kind] ?? v.kind, null)) : ''}</div>`}
      </section>`;
    };

    const odo = (v: string | number, key: 'l' | 'c' | 'q', cur: number) => {
      const changed = prevScore[key] !== -1 && prevScore[key] !== cur && !reduced();
      return html`<span class="odo ${changed ? 'roll' : ''}">${v}</span>`;
    };
    const seamHtml = () => {
      const L = lanes.on_device, C = lanes.in_cloud;
      const qL = L.done ? L.qualitySum / L.done : 0, qC = C.done ? C.qualitySum / C.done : 0;
      const ret = L.done && C.done && qC > 0 ? Math.round((qL / qC) * 100) : null;
      const doneTasks = new Set([...cells.entries()].filter(([, c]) => c.l !== undefined || c.c !== undefined).map(([id]) => id)).size;
      const out = html`<div class="seam" aria-live="polite" aria-atomic="true">
        <span class="caps">Scoreboard</span>
        <div class="sb-big"><span class="sb-lab">Local passed</span><span class="sb-n t-local">${L.done ? odo(L.passed, 'l', L.passed) : html`<span class="sb-none">not run</span>`}</span><span class="sb-of ${L.done ? '' : 'is-word'}">${L.done ? html`of <span class="num">${L.done}</span>` : localReady() ? html`of <span class="num">${tasks.length}</span>, not started` : 'not run on this device'}</span></div>
        <div class="sb-row"><span>${glyph('cloud')}Cloud</span><span class="num t-cloud">${odo(C.passed, 'c', C.passed)}<span class="faint"> / ${C.done}</span></span></div>
        <div class="sb-row"><span>Cloud quality retained</span><span class="num">${ret === null ? '—' : html`${odo(ret, 'q', ret)}%`}</span></div>
        <div class="sb-row"><span>Tasks</span><span class="num">${doneTasks} / ${tasks.length}</span></div>
        ${!localReady() && !L.done ? html`<p class="sb-note">On-device lane idle here. Score counts only what actually ran.</p>` : ''}
      </div>`;
      prevScore = { l: L.passed, c: C.passed, q: ret ?? -1 };
      return out;
    };

    const mark = (v: boolean | null | undefined, side: 'l' | 'c') => {
      const word = v === undefined ? 'pending' : v === null ? 'not run' : v ? 'pass' : 'fail';
      return raw(`<svg class="tm ${side} ${word.replace(' ', '-')}" viewBox="0 0 14 14" role="img" aria-label="${side === 'l' ? 'on-device' : 'cloud'} ${word}">${
        v === undefined ? '<circle cx="7" cy="7" r="1.4"/>'
        : v === null ? '<path d="M3 11 11 3"/>'
        : side === 'l' ? (v ? '<circle cx="7" cy="7" r="5"/>' : '<circle cx="7" cy="7" r="4.6" class="o"/><path d="m4.2 4.2 5.6 5.6M9.8 4.2l-5.6 5.6"/>')
        : (v ? '<circle cx="7" cy="7" r="4.4" class="o"/>' : '<circle cx="7" cy="7" r="4.4" class="o"/><path d="m4.2 4.2 5.6 5.6M9.8 4.2l-5.6 5.6"/>')}</svg>`);
    };
    const tapeHtml = () => html`<div class="tape-wrap" tabindex="0" role="region" aria-label="Task tape, scrolls sideways"><ol class="tape" aria-label="Task results, on-device and cloud">${tasks.map((t, i) => {
      const c = cells.get(t.id) ?? {};
      const active = lanes.on_device.task?.id === t.id && lanes.on_device.status === 'running' || lanes.in_cloud.task?.id === t.id && lanes.in_cloud.status === 'running';
      return html`<li class="tcell ${active ? 'active' : ''}" title="${t.id}"><span class="tnum num">${String(i + 1).padStart(2, '0')}</span><span class="tname">${labelOf[t.type]}<span class="faint"> ${t.lengthBucket}</span></span>${mark(c.l, 'l')}${mark(c.c, 'c')}</li>`;
    })}</ol></div>`;

    const scrubHtml = () => {
      const rec = running ? null : lastRecording;
      if (!rec) return '';
      const at = replay ? replay.at : rec.duration;
      return html`<div class="scrub" role="group" aria-label="Replay the recorded run">
        <button class="btn btn-sm" id="rp-play" aria-label="${replay?.playing ? 'Pause replay' : 'Play replay'}">${icon(replay?.playing ? 'pause' : 'play')}${replay?.playing ? 'Pause' : 'Replay'}</button>
        <input type="range" id="rp-range" min="0" max="${Math.round(rec.duration)}" step="50" value="${Math.round(at)}" aria-label="Replay position" aria-valuetext="${(at / 1000).toFixed(1)} seconds of ${(rec.duration / 1000).toFixed(1)}">
        <span class="num faint" id="rp-t">${(at / 1000).toFixed(1)} s / ${(rec.duration / 1000).toFixed(1)} s</span>
        <span class="caps">space plays</span>
      </div>`;
    };

    const recHtml = () => html`${laneHtml('on_device')}${seamHtml()}${laneHtml('in_cloud')}`;
    /** Repaint only the instrument and the tape (keeps the scrubber under the pointer). */
    const paintLive = () => {
      const r = root.querySelector('#rec'), t = root.querySelector('#tape');
      if (!r || !t) return paint();
      r.innerHTML = recHtml().html; t.innerHTML = tapeHtml().html;
      fit();
    };
    /** Size the SVG to the strip so ticks and labels are never stretched. */
    const fit = () => {
      const w = Math.round((root.querySelector('.strip') as HTMLElement | null)?.clientWidth ?? 0);
      if (w > 0 && w !== W) { W = w; frame(); }
    };
    const ro = new ResizeObserver(() => fit());
    const sig = () => `${lanes.on_device.done}|${lanes.in_cloud.done}|${lanes.on_device.task?.id}|${lanes.in_cloud.task?.id}|${lanes.on_device.status}|${lanes.in_cloud.status}`;
    let lastSig = '';
    const paint = () => {
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">Two lanes. The same tasks. <em>Measured, not guessed.</em></h1>
          <p class="lede">Identical synthetic tasks run on Gemini Nano in this browser and on the cloud model, scored by deterministic validators. What you see is what the SDK reports.</p>
        </header>
        <div class="probe-ctl">
          <div class="seg" role="group" aria-label="Probe size">
            <button data-mode="quick" aria-pressed="${mode === 'quick'}" ${running ? 'disabled' : ''}>Quick · 12 tasks</button>
            <button data-mode="full" aria-pressed="${mode === 'full'}" ${running ? 'disabled' : ''}>${splitParam === 'heldout' ? 'Held-out' : 'Calibration'} · ${fullTasks().length}</button>
          </div>
          ${!running ? html`<button class="btn btn-primary" id="start">${icon('play')}${finished ? 'Run again' : 'Start probe'}</button>` : html`
            <button class="btn" id="pause">${icon(paused ? 'play' : 'pause')}${paused ? 'Resume' : 'Pause'}</button>
            <button class="btn" id="abort">${icon('stop')}Stop</button>`}
          <span class="meta">${mode === 'quick' ? 'About 2 min on a laptop GPU (measured 139 s, Iris Xe)' : 'Owner run, 20+ min. Held-out tasks never run here.'} · cloud calls <span class="num" id="cc">${runner?.cloudCallsUsed ?? 0}</span>/${firebase.settings.probeMaxCloudCalls} cap</span>
        </div>
        <div class="recorder ${replay ? 'is-replay' : ''}" id="rec">${recHtml()}</div>
        ${scrubHtml()}
        <div class="probe-foot">
          <div>
            <div class="sec" style="margin-top:28px"><h2>Task tape</h2><span class="caps">${glyph('local')} on-device · ${glyph('cloud')} cloud · ✕ failed · / not run</span></div>
            <div id="tape">${tapeHtml()}</div>
          </div>
          <aside class="mnote airplane">
            <span class="caps">${icon('wifioff')} Airplane-mode test</span>
            <span>Switch off Wi-Fi mid-run. The on-device lane keeps writing; the cloud lane fails and says so. Nothing is retried in secret.</span>
          </aside>
        </div>
        ${finished ? html`<div class="next-step">
          <div class="stack" style="gap:4px">${lanes.on_device.done + lanes.in_cloud.done ? html`<strong>Probe complete. ${lanes.on_device.done + lanes.in_cloud.done} measurements saved on this device.</strong><span class="muted">Next: where the local model wins and loses, then a policy with the evidence attached.</span>` : html`<strong>Probe finished, but no lane could answer.</strong><span class="muted">Every call was unavailable, so nothing was measured. The Frontier and Policy keep showing the labelled reference run.</span>`}</div>
          <div class="row"><a class="btn" href="#/atlas">${icon('globe')}Add to the Atlas</a><a class="btn btn-primary" href="#/frontier?run=mine">${icon('frontier')}2 · See the frontier</a></div></div>` : ''}`.html;
      const st = root.querySelector('.strip'); if (st) ro.observe(st);
      fit();
    };

    // Frame update: only the traces, streams and readouts move; structure repaints on start/result.
    const frame = () => {
      for (const k of ['on_device', 'in_cloud'] as LaneKey[]) {
        const s = root.querySelector(`[data-strip="${k}"] svg`);
        if (s) s.outerHTML = stripSvg(k).html;
        const L = lanes[k];
        const el = root.querySelector(`#stream-${k}`);
        if (el && L.status === 'running') {
          el.textContent = L.text;
          const c = document.createElement('span'); c.className = 'caret'; el.appendChild(c);
          el.scrollTop = el.scrollHeight;
        }
        const ttft = root.querySelector(`[data-r="ttft-${k}"]`); if (ttft) ttft.textContent = fmtMs(L.ttft);
      }
    };
    const tick = () => {
      if (running && !paused) now = performance.now() - runT0;
      if (replay?.playing && lastRecording) {
        replay.at = Math.min(lastRecording.duration, replay.at + 16.7 * 2);
        rebuild(replay.at);
        const r = root.querySelector('#rp-range') as HTMLInputElement | null; if (r) r.value = String(Math.round(replay.at));
        const tt = root.querySelector('#rp-t'); if (tt) tt.textContent = `${(replay.at / 1000).toFixed(1)} s / ${(lastRecording.duration / 1000).toFixed(1)} s`;
        if (replay.at >= lastRecording.duration) { replay.playing = false; paint(); }
        else if (sig() !== lastSig) { lastSig = sig(); paintLive(); }
      }
      frame();
      loop = running || replay?.playing ? requestAnimationFrame(tick) : 0;
    };
    const startLoop = () => { if (!loop) loop = requestAnimationFrame(tick); };

    const onEvent = (e: ProbeEvent) => {
      if (e.type === 'done') return;
      const t = performance.now() - runT0;
      events.push({ t, e });
      apply(e, t);
      if (e.type === 'start' || e.type === 'result') { now = t; paint(); const cc = root.querySelector('#cc'); if (cc) cc.textContent = String(runner?.cloudCallsUsed ?? 0); }
    };

    const start = async () => {
      if (!tandem.ai) { toast('Firebase is not configured in this build.'); return; }
      await tandem.refreshCapability();
      tasks = mode === 'quick' ? quickProbe() : fullTasks();
      lanes = { on_device: freshLane(), in_cloud: freshLane() };
      cells.clear(); events = []; replay = null; prevScore = { l: -1, c: -1, q: -1 };
      finished = false; running = true; paused = false;
      probeState.set(true);
      runT0 = performance.now(); now = 0;
      const ai = tandem.ai;
      const env = { chromeMajor: tandem.capability.chromeMajor ?? undefined, osFamily: navigator.userAgent.includes('Windows') ? 'windows' : navigator.userAgent.includes('Mac') ? 'mac' : 'other', availability: tandem.capability.raw };
      runner = new ProbeRunner({
        tasks, repeats: 1,
        cloudConcurrency: Math.max(1, Math.min(3, Number(qp.get('cc')) || 3)),
        maxCloudCalls: firebase.settings.probeMaxCloudCalls,
        timeoutMs: 45000, env,
        backends: {
          ...(localReady() ? { on_device: (p, o) => ai.runOnDevice(p, { onToken: o.onToken, timeoutMs: o.timeoutMs }) } : {}),
          ...(cloudReady() ? { in_cloud: (p, o) => ai.runInCloud(p, { onToken: o.onToken, timeoutMs: o.timeoutMs }) } : {})
        },
        // Sensitive synthetic tasks reach the cloud only after Tandem Guard redaction
        prepareCloudInput: t => redactText(t.input, runDeterministicDetectors(t.input)).sanitizedText,
        onEvent
      });
      paint(); startLoop();
      const results = await runner.run();
      running = false; finished = results.length > 0;
      probeState.set(false);
      lastRecording = { events, tasks, duration: performance.now() - runT0 };
      now = lastRecording.duration;
      if (results.length) { await tandem.saveMyRun(results); toast(`Saved ${results.length} measurements on this device`); }
      paint();
    };

    root.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const m = t.closest('[data-mode]') as HTMLElement | null;
      if (m && !running) { mode = m.dataset.mode as 'quick' | 'full'; tasks = mode === 'quick' ? quickProbe() : fullTasks(); cells.clear(); paint(); }
      if (t.closest('#start')) void start();
      if (t.closest('#pause') && runner) { paused ? runner.resume() : runner.pause(); paused = !paused; paint(); }
      if (t.closest('#abort') && runner) { runner.abort(); toast('Stopping after the current task'); }
      if (t.closest('#rp-play') && lastRecording) togglePlay();
    });
    const togglePlay = () => {
      if (!lastRecording) return;
      if (!replay) { events = lastRecording.events; tasks = lastRecording.tasks; replay = { at: 0, playing: true }; }
      else { if (replay.at >= lastRecording.duration) replay.at = 0; replay.playing = !replay.playing; }
      if (reduced() && replay.playing) { replay.at = lastRecording.duration; replay.playing = false; rebuild(replay.at); }
      paint(); startLoop();
    };
    root.addEventListener('input', e => {
      const t = e.target as HTMLInputElement;
      if (t.id !== 'rp-range' || !lastRecording) return;
      events = lastRecording.events; tasks = lastRecording.tasks;
      replay = { at: Number(t.value), playing: false };
      rebuild(replay.at);
      paintLive();
      const tt = root.querySelector('#rp-t'); if (tt) tt.textContent = `${(replay.at / 1000).toFixed(1)} s / ${(lastRecording.duration / 1000).toFixed(1)} s`;
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Space' || running || !lastRecording) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' && (e.target as HTMLInputElement).type !== 'range' || tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'SELECT') return;
      e.preventDefault(); togglePlay();
    };
    addEventListener('keydown', onKey);
    const unsub = tandem.subscribe(() => { if (!running && !replay?.playing) paint(); });
    const onNet = () => { if (!replay?.playing) paint(); };
    addEventListener('online', onNet); addEventListener('offline', onNet);

    // Show the previous run (this session) instead of an empty instrument.
    if (lastRecording) { events = lastRecording.events; tasks = lastRecording.tasks; rebuild(lastRecording.duration); finished = true; }
    paint();
    void tandem.whenReady().then(() => {
      if (!running) paint();
      if (qp.get('go') === 'quick' && !running && !finished) { history.replaceState(null, '', '#/probe'); void start(); }
    });
    return () => { runner?.abort(); probeState.set(false); cancelAnimationFrame(loop); ro.disconnect(); unsub(); removeEventListener('keydown', onKey); removeEventListener('online', onNet); removeEventListener('offline', onNet); };
  }
};
export default screen;
