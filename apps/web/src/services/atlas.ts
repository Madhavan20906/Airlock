/** Hybrid Atlas: coarse, enumerated, anonymous buckets. Mirrors packages/spec/atlas-contrib.schema.json and firestore.rules. */
import { aggregate, percentile, type RunResult } from '@tandem/policy';

export const ATLAS_TASKS = ['classify', 'extract', 'rewrite', 'summarize', 'translate', 'qa'] as const;
export const AVAIL = ['available', 'downloadable', 'downloading', 'unavailable', 'unsupported'] as const;
export const TTFT = ['lt500', '500to1500', '1500to4000', 'gte4000', 'na'] as const;
export const TPS = ['lt5', '5to15', '15to40', 'gte40', 'na'] as const;
export const PASS = ['lt50', '50to80', 'gte80', 'na'] as const;
export const OS = ['windows', 'mac', 'linux', 'chromeos', 'other'] as const;

export const BAND_LABEL: Record<string, string> = {
  lt500: '< 0.5 s', '500to1500': '0.5–1.5 s', '1500to4000': '1.5–4 s', gte4000: '≥ 4 s',
  lt5: '< 5 tok/s', '5to15': '5–15', '15to40': '15–40', gte40: '≥ 40',
  lt50: '< 50%', '50to80': '50–80%', gte80: '≥ 80%', na: 'not measured'
};

export interface AtlasContribution {
  chromeMajorBucket: string;
  osFamily: (typeof OS)[number];
  availability: (typeof AVAIL)[number];
  ttftBand: (typeof TTFT)[number];
  tokensPerSecBand: (typeof TPS)[number];
  localPassBands: Record<(typeof ATLAS_TASKS)[number], (typeof PASS)[number]>;
}

export function osFamily(): AtlasContribution['osFamily'] {
  const ua = navigator.userAgent;
  return /CrOS/.test(ua) ? 'chromeos' : /Windows/.test(ua) ? 'windows' : /Mac OS X/.test(ua) ? 'mac' : /Linux/.test(ua) ? 'linux' : 'other';
}

export function chromeBucket(major: number | null): string {
  if (!major) return 'unknown';
  const lo = Math.floor(major / 5) * 5;
  return `${lo}-${lo + 4}`;
}

export function buildContribution(run: RunResult[], availability: string, chromeMajor: number | null): AtlasContribution {
  const local = run.filter(r => r.backend === 'on_device' && r.ok);
  const ttft = percentile(local.map(r => r.ttftMs ?? NaN), 50);
  const tps = percentile(local.map(r => (r.totalMs && r.ttftMs !== null ? r.outTokensEst / Math.max(0.05, (r.totalMs - r.ttftMs) / 1000) : NaN)), 50);
  const { byType } = aggregate(run);
  const passBand = (t: string): AtlasContribution['localPassBands']['classify'] => {
    const p = byType.find(c => c.taskType === t)?.local.passRate;
    return p === null || p === undefined ? 'na' : p < 0.5 ? 'lt50' : p < 0.8 ? '50to80' : 'gte80';
  };
  return {
    chromeMajorBucket: chromeBucket(chromeMajor),
    osFamily: osFamily(),
    availability: (AVAIL as readonly string[]).includes(availability) ? (availability as AtlasContribution['availability']) : 'unavailable',
    ttftBand: ttft === null ? 'na' : ttft < 500 ? 'lt500' : ttft < 1500 ? '500to1500' : ttft < 4000 ? '1500to4000' : 'gte4000',
    tokensPerSecBand: tps === null ? 'na' : tps < 5 ? 'lt5' : tps < 15 ? '5to15' : tps < 40 ? '15to40' : 'gte40',
    localPassBands: Object.fromEntries(ATLAS_TASKS.map(t => [t, passBand(t)])) as AtlasContribution['localPassBands']
  };
}

/** Document id = SHA-256(anonymous uid): enforces one contribution per user without storing the uid. Rules recompute it. */
export async function contribId(uid: string): Promise<string> {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}
