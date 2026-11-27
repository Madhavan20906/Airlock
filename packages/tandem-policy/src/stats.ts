/** Wilson score interval for a binomial proportion. Returns nulls for n = 0. */
export function wilson(passes: number, n: number, z = 1.96): { p: number | null; lo: number | null; hi: number | null } {
  if (n <= 0) return { p: null, lo: null, hi: null };
  if (passes < 0 || passes > n) throw new RangeError(`passes ${passes} out of range for n ${n}`);
  const p = passes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/** Nearest-rank percentile (p in 0..100). Returns null for an empty list. */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter(x => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const rank = Math.ceil((p / 100) * v.length);
  return v[Math.min(v.length - 1, Math.max(0, rank - 1))];
}

export function mean(values: number[]): number | null {
  const v = values.filter(x => Number.isFinite(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

export function round(x: number | null, d = 3): number | null {
  if (x === null) return null;
  const f = 10 ** d;
  return Math.round(x * f) / f;
}
