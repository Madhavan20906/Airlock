import type { Screen } from '../main.js';
import { html, fmtMs, pct, toast } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { banner, checkChip, bar, labelOf, backendBadge } from '../ui/components.js';
import { tandem } from '../services/tandem.js';
import { firebase } from '../services/firebase.js';
import { ProbeRunner, generateBattery, quickProbe, type BenchTask, type ProbeEvent, type ValidationReport } from '@tandem/bench';
import { estimateTokens, type RunResult } from '@tandem/policy';
import { runDeterministicDetectors, redactText } from '@tandem/guard';

type LaneKey = 'on_device' | 'in_cloud';
interface Lane {
  task: BenchTask | null; text: string; ttft: number | null; total: number | null; tps: number | null;
  report: ValidationReport | null; servedBy: LaneKey | null; done: number; passed: number; qualitySum: number;
  status: 'idle' | 'running' | 'unavailable' | 'error'; note?: string; t0: number;
}
const freshLane = (): Lane => ({ task: null, text: '', ttft: null, total: null, tps: null, report: null, servedBy: null, done: 0, passed: 0, qualitySum: 0, status: 'idle', t0: 0 });

const VALIDATOR_LABEL: Record<string, string> = {
  exact: 'exact label', contains: 'answer', json_schema: 'JSON schema', field_f1: 'fields', required_facts: 'facts kept',
  max_len: 'length', min_len: 'min length', script_present: 'script', bullets: 'format', no_refusal: 'no refusal'
};

const screen: Screen = {
  title: 'Probe',
  crumb: 'Step 01 · Probe',
  render(root) {
    let mode: 'quick' | 'full' = 'quick';
    let runner: ProbeRunner | null = null;
    let running = false, paused = false, finished = false;
    let lanes: Record<LaneKey, Lane> = { on_device: freshLane(), in_cloud: freshLane() };
    let tasks: BenchTask[] = quickProbe();
    const cells = new Map<string, { l?: boolean | null; c?: boolean | null }>();
    let raf = 0;

    const localReady = () => new URLSearchParams(location.hash.split('?')[1] ?? '').get('lanes') !== 'cloud' && tandem.capability.state === 'available';
    const qp = new URLSearchParams(location.hash.split('?')[1] ?? '');
    const lanesParam = qp.get('lanes');
    // Batch controls for long owner runs: ?split=calibration|heldout&types=classify,extract
    const splitParam = qp.get('split') === 'heldout' ? 'heldout' : 'calibration';
    const typesParam = qp.get('types')?.split(',') ?? null;
    const fullTasks = () => generateBattery().filter(t => t.split === splitParam && (!typesParam || typesParam.includes(t.type)));
    const cloudReady = () => lanesParam !== 'local' && firebase.configured && !firebase.settings.killSwitchCloud && navigator.onLine;

    const laneHtml = (k: LaneKey) => {
      const L = lanes[k];
      const isLocal = k === 'on_device';
      const name = isLocal ? 'On-device' : 'Cloud';
      const sub = isLocal ? 'Gemini Nano · InferenceMode.ONLY_ON_DEVICE' : 'gemini-3.5-flash-lite · InferenceMode.ONLY_IN_CLOUD';
      const blocked = isLocal ? !localReady() : !cloudReady();
      let body;
      if (blocked && L.status !== 'running' && !L.done) {
        body = html`<div class="lane-empty">${icon(isLocal ? 'chip' : 'cloud')}
          <div style="font:400 22px var(--f-display);color:var(--ink)">${isLocal ? 'No on-device model here' : 'Cloud lane unavailable'}</div>
          <div style="max-width:320px">${isLocal
            ? html`This Chrome reports <span class="mono">${tandem.capability.raw}</span>. The cloud lane still runs, and nothing is simulated. <a href="#/device">Set up on-device AI</a>.`
            : lanesParam === 'local' ? 'Cloud lane switched off for this run (lanes=local).' : !navigator.onLine ? 'You are offline. That is the point: the on-device lane keeps going.' : firebase.settings.killSwitchCloud ? 'The cloud kill switch is on in Remote Config.' : 'Firebase is not configured in this build.'}</div></div>`;
      } else {
        const showText = L.text || (L.status === 'running' ? '' : L.task ? '(no output)' : 'Ready. Press Start probe: each task streams here as it runs.');
        body = html`
          <div class="meters">
            <div class="meter"><span class="meter-k">first token</span><span class="meter-v">${fmtMs(L.ttft)}</span></div>
            <div class="meter"><span class="meter-k">tokens / s</span><span class="meter-v">${L.tps === null ? '—' : L.tps.toFixed(1)}<small>est</small></span></div>
            <div class="meter"><span class="meter-k">total</span><span class="meter-v">${fmtMs(L.total)}</span></div>
          </div>
          <pre class="stream" id="stream-${k}" aria-live="off">${showText}${L.status === 'running' ? html`<span class="caret"></span>` : ''}</pre>
          <div class="lane-foot">
            <div class="checks" aria-label="Validator results">${L.report ? L.report.results.map(r => checkChip(VALIDATOR_LABEL[r.kind] ?? r.kind, r.passed, r.detail)) : L.task ? L.task.validators.map(v => checkChip(VALIDATOR_LABEL[v.kind] ?? v.kind, null)) : ''}</div>
            <div class="spread"><span class="faint" style="font-size:12px">${L.done ? `passed ${L.passed} of ${L.done}` : 'waiting'} ${L.servedBy ? '· servedBy reported by SDK' : ''}</span><span class="num" style="font-size:12px">${L.done ? pct(L.passed / L.done) : ''}</span></div>
            ${bar(L.done ? L.passed / L.done : 0, isLocal ? 'local' : 'cloud', `${name} pass rate`)}
          </div>`;
      }
      return html`<section class="card lane ${isLocal ? 'local' : 'cloud'}" aria-label="${name} lane">
        <div class="lane-head">
          <div><div class="lane-name">${icon(isLocal ? 'chip' : 'cloud')}${name}</div><div class="lane-sub">${sub}</div></div>
          <div class="stack" style="justify-items:end;gap:6px">${L.servedBy ? backendBadge(L.servedBy) : ''}${L.task ? html`<span class="chip">${labelOf[L.task.type]} · ${L.task.lengthBucket}</span>` : ''}</div>
        </div>${body}</section>`;
    };

    const scoreline = () => {
      const L = lanes.on_device, C = lanes.in_cloud;
      if (!L.done && !C.done) return html`<div class="scoreline"><span class="muted">${tasks.length} tasks · ${new Set(tasks.map(t => t.type)).size} task types · same prompts, both lanes</span></div>`;
      const qL = L.done ? L.qualitySum / L.done : 0, qC = C.done ? C.qualitySum / C.done : 0;
      return html`<div class="scoreline" aria-live="polite">
        <span>Local passed <span class="n-local num">${L.passed}</span> of <span class="num">${L.done}</span></span>
        <span class="faint">·</span>
        <span>cloud <span class="n-cloud num">${C.passed}</span> of <span class="num">${C.done}</span></span>
        ${L.done && C.done && qC > 0 ? html`<span class="faint">·</span><span>local at <span class="n-local num">${Math.round((qL / qC) * 100)}%</span> of cloud quality</span>` : ''}
      </div>`;
    };

    const tapeHtml = () => html`<div class="tape" aria-label="Task results">${tasks.map(t => {
      const c = cells.get(t.id) ?? {};
      const cls = (v: boolean | null | undefined, side: string) => v === undefined ? side : v === null ? `${side} na` : `${side} ${v ? 'pass' : 'fail'}`;
      const active = lanes.on_device.task?.id === t.id || lanes.in_cloud.task?.id === t.id;
      return html`<div class="tape-cell ${active ? 'active' : ''}" title="${t.id}"><span class="t">${labelOf[t.type]} · ${t.lengthBucket}${t.sensitive ? ' · sensitive' : ''}</span><span class="tape-dots"><i class="${cls(c.l, 'l')}" aria-label="local ${c.l === undefined ? 'pending' : c.l === null ? 'n/a' : c.l ? 'pass' : 'fail'}"></i><i class="${cls(c.c, 'c')}" aria-label="cloud ${c.c === undefined ? 'pending' : c.c === null ? 'n/a' : c.c ? 'pass' : 'fail'}"></i></span></div>`;
    })}</div>`;

    const paint = () => {
      root.innerHTML = html`
        <header class="page-head">
          <h1 class="title">Race the same tasks, <em>on-device and in the cloud.</em></h1>
          <p class="lede">Every hybrid app guesses which prompts the local model can handle. The probe measures it on this device: identical synthetic tasks, two lanes, deterministic validators. Results feed the policy compiler.</p>
        </header>
        <div class="card card-pad" style="margin-bottom:16px">
          <div class="spread">
            <div class="row">
              <div class="seg" role="group" aria-label="Probe size">
                <button data-mode="quick" aria-pressed="${mode === 'quick'}" ${running ? 'disabled' : ''}>Quick · 12 tasks</button>
                <button data-mode="full" aria-pressed="${mode === 'full'}" ${running ? 'disabled' : ''}>${splitParam === 'heldout' ? 'Held-out' : 'Calibration'} · ${fullTasks().length} tasks</button>
              </div>
              <span class="faint" style="font-size:12.5px">${mode === 'quick' ? 'About 2 minutes on a laptop GPU (measured: 139 s, Iris Xe).' : 'Owner run, 20+ minutes. Held-out tasks are never used here.'}</span>
            </div>
            <div class="row">
              ${!running ? html`<button class="btn btn-primary" id="start">${icon('play')}${finished ? 'Run again' : 'Start probe'}</button>` : html`
                <button class="btn" id="pause">${icon(paused ? 'play' : 'pause')}${paused ? 'Resume' : 'Pause'}</button>
                <button class="btn" id="abort">${icon('stop')}Stop</button>`}
            </div>
          </div>
          <hr class="rule">
          <div class="row faint" style="font-size:12.5px">${icon('wifioff')}<span>Try it offline: switch on airplane mode mid-run. The on-device lane keeps going; the cloud lane fails honestly. Cloud calls this run: <span class="num">${runner?.cloudCallsUsed ?? 0}</span> / ${firebase.settings.probeMaxCloudCalls} cap.</span></div>
        </div>
        <div style="margin:8px 2px 14px">${scoreline()}</div>
        <div class="race">${laneHtml('on_device')}${laneHtml('in_cloud')}</div>
        <h2 class="section-title">Task tape</h2>
        ${tapeHtml()}
        ${finished ? html`<div class="card card-pad" style="margin-top:20px"><div class="spread">
          <div class="stack" style="gap:4px"><strong>Probe complete · ${lanes.on_device.done + lanes.in_cloud.done} runs saved on this device</strong><span class="muted">Next: see where the local model wins and loses, then compile a policy with the evidence attached.</span></div>
          <div class="row"><a class="btn" href="#/atlas">${icon('globe')}Add to the Atlas</a><a class="btn btn-primary" href="#/frontier?run=mine">${icon('frontier')}See the frontier</a></div></div></div>` : ''}
      `.html;
    };

    const paintStream = (k: LaneKey) => {
      const el = root.querySelector(`#stream-${k}`);
      if (!el) return;
      el.textContent = lanes[k].text;
      if (lanes[k].status === 'running') { const c = document.createElement('span'); c.className = 'caret'; el.appendChild(c); }
      el.scrollTop = el.scrollHeight;
    };

    const onEvent = (e: ProbeEvent) => {
      if (e.type === 'done') return;
      const k = e.backend;
      const L = lanes[k];
      if (e.type === 'start') {
        Object.assign(L, { task: e.task, text: '', ttft: null, total: null, tps: null, report: null, servedBy: null, status: 'running', t0: performance.now() });
        paint();
      } else if (e.type === 'token') {
        L.text = e.text;
        if (L.ttft === null) L.ttft = performance.now() - L.t0;
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => paintStream(k));
      } else if (e.type === 'result') {
        const r: RunResult = e.result;
        L.status = r.ok ? 'idle' : r.error === 'unavailable' ? 'unavailable' : 'error';
        L.text = r.ok ? e.output : `[${r.error}] the call failed; recorded as ${r.error === 'unavailable' ? 'unavailable (excluded from quality)' : 'a failure'}`;
        L.ttft = r.ttftMs; L.total = r.totalMs; L.report = e.report; L.servedBy = r.servedBy;
        L.tps = r.ok && r.totalMs && r.ttftMs !== null ? r.outTokensEst / Math.max(0.05, (r.totalMs - r.ttftMs) / 1000) : null;
        if (r.error !== 'unavailable') { L.done++; if (r.passed) L.passed++; L.qualitySum += r.quality; }
        const c = cells.get(r.taskId) ?? {};
        if (k === 'on_device') c.l = r.error === 'unavailable' ? null : r.passed; else c.c = r.passed;
        cells.set(r.taskId, c);
        paint();
      } else if (e.type === 'skip') {
        const c = cells.get(e.task.id) ?? {};
        if (k === 'in_cloud') c.c = null; else c.l = null;
        cells.set(e.task.id, c);
      }
    };

    const start = async () => {
      if (!tandem.ai) { toast('Firebase is not configured in this build.'); return; }
      await tandem.refreshCapability();
      tasks = mode === 'quick' ? quickProbe() : fullTasks();
      lanes = { on_device: freshLane(), in_cloud: freshLane() };
      cells.clear();
      finished = false; running = true; paused = false;
      const ai = tandem.ai;
      const env = { chromeMajor: tandem.capability.chromeMajor ?? undefined, osFamily: navigator.userAgent.includes('Windows') ? 'windows' : navigator.userAgent.includes('Mac') ? 'mac' : 'other', availability: tandem.capability.raw };
      runner = new ProbeRunner({
        tasks,
        repeats: 1,
        cloudConcurrency: Math.max(1, Math.min(3, Number(qp.get('cc')) || 3)),
        maxCloudCalls: firebase.settings.probeMaxCloudCalls,
        timeoutMs: 45000,
        env,
        backends: {
          ...(localReady() ? { on_device: (p, o) => ai.runOnDevice(p, { onToken: o.onToken, timeoutMs: o.timeoutMs }) } : {}),
          ...(cloudReady() ? { in_cloud: (p, o) => ai.runInCloud(p, { onToken: o.onToken, timeoutMs: o.timeoutMs }) } : {})
        },
        // Sensitive synthetic tasks reach the cloud only after Tandem Guard redaction
        prepareCloudInput: t => redactText(t.input, runDeterministicDetectors(t.input)).sanitizedText,
        onEvent
      });
      paint();
      const results = await runner.run();
      running = false; finished = results.length > 0;
      if (results.length) {
        await tandem.saveMyRun(results);
        toast(`Saved ${results.length} measurements on this device`);
      }
      paint();
    };

    root.addEventListener('click', e => {
      const t = e.target as HTMLElement;
      const m = t.closest('[data-mode]') as HTMLElement | null;
      if (m && !running) { mode = m.dataset.mode as 'quick' | 'full'; tasks = mode === 'quick' ? quickProbe() : fullTasks(); cells.clear(); paint(); }
      if (t.closest('#start')) void start();
      if (t.closest('#pause') && runner) { paused ? runner.resume() : runner.pause(); paused = !paused; paint(); }
      if (t.closest('#abort') && runner) { runner.abort(); toast('Stopping after the current task'); }
    });
    const unsub = tandem.subscribe(() => { if (!running) paint(); });
    const onNet = () => paint();
    addEventListener('online', onNet); addEventListener('offline', onNet);
    paint();
    void tandem.whenReady().then(() => { if (!running) paint(); });
    void estimateTokens;
    return () => { runner?.abort(); unsub(); removeEventListener('online', onNet); removeEventListener('offline', onNet); };
  }
};
export default screen;
