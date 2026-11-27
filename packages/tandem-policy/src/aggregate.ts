import { Backend, LengthBucket, RunResult, TaskType } from './types.js';
import { mean, percentile, wilson } from './stats.js';

export interface BackendStats {
  /** Distinct tasks. Repeats of one task are collapsed (majority vote) so n counts independent items. */
  n: number;
  passes: number;
  passRate: number | null;
  wilsonLo: number | null;
  wilsonHi: number | null;
  meanQuality: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  p50TtftMs: number | null;
  meanInTokens: number | null;
  meanOutTokens: number | null;
  /** Runs excluded because the backend was unavailable or rate-limited (infrastructure, not a quality failure). */
  unavailable: number;
}

export interface CellStats {
  taskType: TaskType;
  lengthBucket: LengthBucket | '*';
  local: BackendStats;
  cloud: BackendStats;
}

function statsFor(runs: RunResult[], z: number): BackendStats {
  const usable = runs.filter(r => r.error !== 'unavailable' && r.error !== 'quota');
  const byTask = new Map<string, RunResult[]>();
  for (const r of usable) {
    const list = byTask.get(r.taskId) ?? [];
    list.push(r);
    byTask.set(r.taskId, list);
  }
  let passes = 0;
  const qualities: number[] = [];
  for (const list of byTask.values()) {
    const p = list.filter(r => r.passed).length;
    // Majority vote; ties count as a fail (conservative)
    if (p * 2 > list.length) passes++;
    qualities.push(mean(list.map(r => r.quality)) ?? 0);
  }
  const n = byTask.size;
  const w = wilson(passes, n, z);
  const okRuns = usable.filter(r => r.ok);
  return {
    n,
    passes,
    passRate: w.p,
    wilsonLo: w.lo,
    wilsonHi: w.hi,
    meanQuality: mean(qualities),
    p50Ms: percentile(okRuns.map(r => r.totalMs ?? NaN), 50),
    p95Ms: percentile(okRuns.map(r => r.totalMs ?? NaN), 95),
    p50TtftMs: percentile(okRuns.map(r => r.ttftMs ?? NaN), 50),
    meanInTokens: mean(okRuns.map(r => r.inTokensEst)),
    meanOutTokens: mean(okRuns.map(r => r.outTokensEst)),
    unavailable: runs.length - usable.length
  };
}

export function aggregate(results: RunResult[], z = 1.96): { cells: CellStats[]; byType: CellStats[] } {
  const key = (t: string, b: string) => `${t}|${b}`;
  const groups = new Map<string, { t: TaskType; b: LengthBucket | '*'; runs: Record<Backend, RunResult[]> }>();
  const add = (t: TaskType, b: LengthBucket | '*', r: RunResult) => {
    const k = key(t, b);
    const g = groups.get(k) ?? { t, b, runs: { on_device: [], in_cloud: [] } };
    g.runs[r.backend].push(r);
    groups.set(k, g);
  };
  for (const r of results) {
    add(r.taskType, r.lengthBucket, r);
    add(r.taskType, '*', r);
  }
  const cells: CellStats[] = [];
  const byType: CellStats[] = [];
  for (const g of groups.values()) {
    const c: CellStats = { taskType: g.t, lengthBucket: g.b, local: statsFor(g.runs.on_device, z), cloud: statsFor(g.runs.in_cloud, z) };
    (g.b === '*' ? byType : cells).push(c);
  }
  return { cells, byType };
}
