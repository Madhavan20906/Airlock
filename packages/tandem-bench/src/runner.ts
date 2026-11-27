import type { Backend, RunResult } from '@tandem/policy';
import { estimateTokens } from '@tandem/policy';
import { BenchTask, promptFor } from './tasks.js';
import { ValidationReport, validate } from './validators.js';

export interface GenerateOutput {
  text: string;
  /** From the SDK response (inferenceSource), not assumed. */
  servedBy: Backend | null;
  ttftMs: number | null;
  totalMs: number;
  inTokens?: number;
  outTokens?: number;
}

export interface GenerateOptions {
  onToken?: (textSoFar: string) => void;
  signal?: AbortSignal;
  timeoutMs: number;
}

export interface ProbeBackends {
  on_device?: (prompt: string, opts: GenerateOptions) => Promise<GenerateOutput>;
  in_cloud?: (prompt: string, opts: GenerateOptions) => Promise<GenerateOutput>;
}

export type ProbeEvent =
  | { type: 'start'; task: BenchTask; backend: Backend; repeat: number }
  | { type: 'token'; task: BenchTask; backend: Backend; text: string }
  | { type: 'result'; task: BenchTask; backend: Backend; result: RunResult; report: ValidationReport | null; output: string }
  | { type: 'skip'; task: BenchTask; backend: Backend; reason: string }
  | { type: 'done'; results: RunResult[]; aborted: boolean };

export interface ProbeOptions {
  tasks: BenchTask[];
  backends: ProbeBackends;
  repeats?: number;
  cloudConcurrency?: number;
  maxCloudCalls?: number;
  timeoutMs?: number;
  /** Turns a sensitive task's input into what may be sent to the cloud (Tandem Guard redaction). Required for sensitive tasks. */
  prepareCloudInput?: (task: BenchTask) => string;
  onEvent?: (e: ProbeEvent) => void;
  env?: RunResult['env'];
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export function classifyError(e: any): NonNullable<RunResult['error']> {
  const s = `${e?.name ?? ''} ${e?.code ?? ''} ${e?.message ?? e}`.toLowerCase();
  if (/notsupported|not available|unavailable|not supported|no on-device|model.*(download|not ready)|only_on_device|app ?check|40[13]|permission/.test(s)) return 'unavailable';
  if (/429|quota|resource_exhausted|rate limit|too many requests/.test(s)) return 'quota';
  if (/timeout|timed out|abort/.test(s)) return 'timeout';
  return 'other';
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout after ${ms} ms`)), ms);
    p.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
  });
}

export class ProbeRunner {
  private paused = false;
  private resumeWaiters: Array<() => void> = [];
  private abortCtl = new AbortController();
  private cloudCalls = 0;
  readonly results: RunResult[] = [];

  constructor(private opts: ProbeOptions) {}

  pause() { this.paused = true; }
  resume() { this.paused = false; this.resumeWaiters.splice(0).forEach(f => f()); }
  abort() { this.abortCtl.abort(); this.resume(); }
  get cloudCallsUsed() { return this.cloudCalls; }

  private async gate() {
    while (this.paused && !this.abortCtl.signal.aborted) await new Promise<void>(r => this.resumeWaiters.push(r));
  }

  private emit(e: ProbeEvent) { try { this.opts.onEvent?.(e); } catch { /* UI errors never break the probe */ } }

  private async runOne(task: BenchTask, backend: Backend, repeat: number) {
    const fn = this.opts.backends[backend];
    if (!fn) return;
    await this.gate();
    if (this.abortCtl.signal.aborted) return;
    const now = this.opts.now ?? (() => performance.now());
    const sleep = this.opts.sleep ?? ((ms: number) => new Promise(r => setTimeout(r, ms)));

    let prompt = promptFor(task);
    if (backend === 'in_cloud') {
      if (task.sensitive) {
        if (!this.opts.prepareCloudInput) { this.emit({ type: 'skip', task, backend, reason: 'sensitive task and no Guard redaction available' }); return; }
        prompt = `${task.instruction}\n\n${this.opts.prepareCloudInput(task)}`;
      }
      const cap = this.opts.maxCloudCalls ?? 60;
      if (this.cloudCalls >= cap) { this.emit({ type: 'skip', task, backend, reason: `cloud call cap (${cap}) reached` }); return; }
    }

    this.emit({ type: 'start', task, backend, repeat });
    const base: Omit<RunResult, 'servedBy' | 'ok' | 'quality' | 'passed' | 'ttftMs' | 'totalMs' | 'outTokensEst'> = {
      runId: `${task.id}:${backend}:${repeat}:${Math.random().toString(36).slice(2, 8)}`,
      taskId: task.id, taskType: task.type, lengthBucket: task.lengthBucket, backend,
      inTokensEst: estimateTokens(prompt), ts: Date.now(), env: this.opts.env
    };

    let attempt = 0;
    for (;;) {
      const t0 = now();
      try {
        if (backend === 'in_cloud') this.cloudCalls++;
        const out = await withTimeout(fn(prompt, {
          timeoutMs: this.opts.timeoutMs ?? 30000,
          signal: this.abortCtl.signal,
          onToken: text => this.emit({ type: 'token', task, backend, text })
        }), this.opts.timeoutMs ?? 30000);
        const report = validate(task.validators, out.text);
        const result: RunResult = {
          ...base, servedBy: out.servedBy, ok: true, quality: report.quality, passed: report.passed,
          ttftMs: out.ttftMs, totalMs: out.totalMs ?? now() - t0,
          inTokensEst: out.inTokens ?? base.inTokensEst, outTokensEst: out.outTokens ?? estimateTokens(out.text),
          outputPreview: out.text.slice(0, 400)
        };
        this.results.push(result);
        this.emit({ type: 'result', task, backend, result, report, output: out.text });
        return;
      } catch (e) {
        const kind = classifyError(e);
        if (kind === 'quota' && backend === 'in_cloud' && attempt < 3 && !this.abortCtl.signal.aborted) {
          await sleep(1500 * 2 ** attempt++);
          continue;
        }
        const result: RunResult = {
          ...base, servedBy: null, ok: false, quality: 0, passed: false, ttftMs: null,
          totalMs: kind === 'unavailable' ? null : now() - t0, outTokensEst: 0, error: kind,
          errorMessage: String((e as any)?.message ?? e).split('\n')[0].replace('\r', '').slice(0, 160)
        };
        this.results.push(result);
        this.emit({ type: 'result', task, backend, result, report: null, output: '' });
        return;
      }
    }
  }

  async run(): Promise<RunResult[]> {
    const repeats = this.opts.repeats ?? 1;
    const jobs = this.opts.tasks.flatMap(t => Array.from({ length: repeats }, (_, r) => ({ t, r })));
    // On-device lane: strictly sequential (one Nano session at a time)
    const local = (async () => { for (const j of jobs) await this.runOne(j.t, 'on_device', j.r); })();
    // Cloud lane: bounded concurrency
    const queue = [...jobs];
    const workers = Array.from({ length: Math.max(1, this.opts.cloudConcurrency ?? 3) }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) await this.runOne(j.t, 'in_cloud', j.r);
    });
    await Promise.all([local, ...workers]);
    this.emit({ type: 'done', results: this.results, aborted: this.abortCtl.signal.aborted });
    return this.results;
  }
}
