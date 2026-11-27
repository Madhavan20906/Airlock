/**
 * @tandem/router — createTandem().run({ task, input }) -> { output, receipt }
 *
 * Pipeline: Guard detect -> policy lookup -> dispatch -> validate -> (escalate) -> rehydrate -> receipt.
 *
 * Two different reasons to use the cloud, recorded separately on every receipt:
 *   availabilityFallback   the local model could not run (not downloaded, unsupported, error)
 *   qualityEscalation      the local model ran, but its answer failed a validator
 *
 * Fail closed: invalid policy -> built-in default; Guard crash, leak-verify failure, kill switch,
 * or a sensitive item with no local model and no consent -> BLOCKED. Sensitive content is never
 * queued or retried later.
 */
import {
  TandemPolicy, TaskType, LengthBucket, PolicyRule, defaultPolicy, lookupRule, validatePolicy, estimateTokens, bucketFor
} from '@tandem/policy';
import { Validator, validate, ValidationReport } from '@tandem/bench';
import {
  runDeterministicDetectors, redactText, rehydrateText, calculateSensitivityScore, DEFAULT_ROUTING_POLICY,
  globalEgressObserver, EgressFrame
} from '@tandem/guard';

export type Route = 'LOCAL' | 'CLOUD' | 'CLOUD_REDACTED' | 'BLOCKED';
export type Backend = 'on_device' | 'in_cloud';

/** The subset of @tandem/ai the router needs (injectable for tests). */
export interface AIBackend {
  getCapability(): Promise<{ state: string }>;
  runOnDevice(prompt: string, opts?: { systemInstruction?: string; onToken?: (t: string) => void; timeoutMs?: number }): Promise<{ text: string; servedBy: Backend | null; totalMs: number }>;
  runInCloud(prompt: string, opts?: { systemInstruction?: string; onToken?: (t: string) => void; timeoutMs?: number }): Promise<{ text: string; servedBy: Backend | null; totalMs: number }>;
}

export interface Receipt {
  id: string;
  ts: number;
  taskType: TaskType;
  lengthBucket: LengthBucket;
  policyVersion: number;
  ruleRoute: PolicyRule['route'];
  guard: { sensitive: boolean; sensitivity: number; entities: Record<string, number> };
  route: Route;
  servedBy: Backend | null;
  availabilityFallback: boolean;
  availabilityReason?: string;
  qualityEscalation: { happened: boolean; reason?: string };
  validation: { passed: boolean; quality: number } | null;
  /** Bytes of the prompt payload handed to the cloud call (0 for local). */
  payloadBytes: number;
  /** Bytes observed leaving through fetch() during this call (wire-level, from the egress observer). */
  bytesOut: number;
  destination: string[];
  latencyMs: number;
  why: string;
  prevHash: string;
  hash: string;
}

export interface RunRequest {
  task: TaskType;
  input: string;
  instruction?: string;
  validators?: Validator[];
  sensitivityHint?: boolean;
  /** Explicit, per-call user consent to send a Guard-redacted version of sensitive content to the cloud. */
  consentRedactedCloud?: boolean;
  systemInstruction?: string;
  onToken?: (textSoFar: string, backend: Backend) => void;
}

export interface RunResult {
  status: 'ok' | 'blocked' | 'error';
  output: string;
  receipt: Receipt;
  /** Exactly what was handed to the cloud call, if anything (already redacted when sensitive). */
  sentToCloud?: string;
  /** Wire-level frames observed during the call (for the receipts drawer). Ephemeral; not persisted. */
  frames?: EgressFrame[];
  local?: { output: string; report: ValidationReport | null };
  error?: string;
}

export interface TandemOptions {
  ai: AIBackend;
  policy?: unknown;
  previousHash?: string;
  onReceipt?: (r: Receipt) => void;
  isOnline?: () => boolean;
  now?: () => number;
}

export const GENESIS = '0'.repeat(64);

export async function sha256Hex(s: string): Promise<string> {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic JSON: object keys sorted at every level, undefined dropped. */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter(k => o[k] !== undefined).sort().map(k => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

export function canonicalReceipt(r: Omit<Receipt, 'hash'>): string {
  return stableStringify(r);
}

export async function verifyReceipts(receipts: Receipt[]): Promise<{ valid: boolean; brokenIndex?: number; error?: string }> {
  for (let i = 0; i < receipts.length; i++) {
    const { hash, ...rest } = receipts[i];
    const expectedPrev = i === 0 ? receipts[0].prevHash : receipts[i - 1].hash;
    if (rest.prevHash !== expectedPrev) return { valid: false, brokenIndex: i, error: `Receipt ${i}: link to previous receipt is broken` };
    if (hash !== await sha256Hex(canonicalReceipt(rest))) return { valid: false, brokenIndex: i, error: `Receipt ${i}: contents changed after it was issued (SHA-256 mismatch)` };
  }
  return { valid: true };
}

/** Default validators for unlabeled real inputs, by task type. Conservative and cheap. */
export function defaultValidators(task: TaskType, input: string): Validator[] {
  const nums = [...new Set((input.match(/\d[\d,.]*\d|\d/g) ?? []).map(n => n.replace(/,/g, '')))].slice(0, 6);
  const keepNums: Validator[] = nums.length ? [{ kind: 'required_facts', facts: nums, threshold: 0.6 }] : [];
  switch (task) {
    case 'summarize': return [{ kind: 'no_refusal' }, { kind: 'min_len', words: 5 }, { kind: 'max_len', words: 120 }];
    case 'rewrite': return [{ kind: 'no_refusal' }, ...keepNums, { kind: 'min_len', words: 3 }];
    case 'extract': case 'json_reliability': return [{ kind: 'no_refusal' }, { kind: 'json_schema', required: {} }];
    case 'translate': return [{ kind: 'no_refusal' }, ...keepNums];
    default: return [{ kind: 'no_refusal' }];
  }
}

const SENSITIVE_TYPES = new Set(['AADHAAR', 'PAN', 'ACCOUNT', 'CARD', 'PHONE', 'EMAIL', 'UPI', 'GSTIN', 'PASSPORT', 'VOTER_ID', 'DL', 'DOB', 'MEDICAL', 'ADDRESS', 'PERSON', 'VEHICLE']);

export class Tandem {
  private policy: TandemPolicy;
  private lastHash: string;
  private cloudCallTimes: number[] = [];
  readonly policyErrors: string[] = [];

  constructor(private o: TandemOptions) {
    this.policy = defaultPolicy();
    this.lastHash = o.previousHash ?? GENESIS;
    if (o.policy !== undefined) this.setPolicy(o.policy);
  }

  /** Hot-swap the policy (e.g. from a Remote Config listener). Invalid input keeps the current policy. */
  setPolicy(p: unknown): boolean {
    const v = validatePolicy(p);
    if (!v.valid) { this.policyErrors.splice(0, this.policyErrors.length, ...v.errors); return false; }
    this.policy = p as TandemPolicy;
    this.policyErrors.length = 0;
    return true;
  }
  getPolicy(): TandemPolicy { return this.policy; }

  private cloudAllowed(): { ok: boolean; reason?: string } {
    if (this.policy.killSwitch.cloud) return { ok: false, reason: 'cloud kill switch is on' };
    if (this.o.isOnline && !this.o.isOnline()) return { ok: false, reason: 'offline' };
    const now = (this.o.now ?? Date.now)();
    this.cloudCallTimes = this.cloudCallTimes.filter(t => now - t < 60000);
    if (this.cloudCallTimes.length >= this.policy.budgets.maxCloudCallsPerMin) return { ok: false, reason: `cloud budget reached (${this.policy.budgets.maxCloudCallsPerMin}/min)` };
    return { ok: true };
  }

  private async localState(): Promise<{ ok: boolean; reason?: string }> {
    if (this.policy.killSwitch.local) return { ok: false, reason: 'local kill switch is on' };
    try {
      const c = await this.o.ai.getCapability();
      return c.state === 'available' ? { ok: true } : { ok: false, reason: `on-device model ${c.state}` };
    } catch (e: any) {
      return { ok: false, reason: `capability check failed: ${e?.message ?? e}` };
    }
  }

  async run(req: RunRequest): Promise<RunResult> {
    const t0 = (this.o.now ?? Date.now)();
    const instruction = req.instruction ?? '';
    const prompt = instruction ? `${instruction}\n\n${req.input}` : req.input;
    const bucket = bucketFor(estimateTokens(prompt));
    const rule = lookupRule(this.policy, req.task, bucket);
    const validators = req.validators ?? defaultValidators(req.task, req.input);

    const r: Omit<Receipt, 'hash' | 'prevHash' | 'id' | 'ts' | 'latencyMs'> = {
      taskType: req.task, lengthBucket: bucket, policyVersion: this.policy.version, ruleRoute: rule.route,
      guard: { sensitive: false, sensitivity: 0, entities: {} }, route: 'BLOCKED', servedBy: null,
      availabilityFallback: false, qualityEscalation: { happened: false }, validation: null,
      payloadBytes: 0, bytesOut: 0, destination: [], why: ''
    };

    const finish = async (status: RunResult['status'], output: string, extra: Partial<RunResult> = {}): Promise<RunResult> => {
      const body = { ...r, id: `rc_${t0}_${Math.random().toString(36).slice(2, 8)}`, ts: t0, latencyMs: Math.round((this.o.now ?? Date.now)() - t0), prevHash: this.lastHash };
      const receipt: Receipt = { ...body, hash: await sha256Hex(canonicalReceipt(body)) };
      this.lastHash = receipt.hash;
      try { this.o.onReceipt?.(receipt); } catch { /* never let a sink break routing */ }
      return { status, output, receipt, ...extra };
    };

    // 1. Guard
    let entities;
    try {
      entities = runDeterministicDetectors(prompt);
      const { score, entityCounts } = calculateSensitivityScore(entities, DEFAULT_ROUTING_POLICY);
      const structured = entities.some(e => SENSITIVE_TYPES.has(e.type));
      r.guard = { sensitive: Boolean(req.sensitivityHint) || (structured && score >= this.policy.privacy.sensitivityThreshold), sensitivity: Math.round(score * 1000) / 1000, entities: entityCounts };
    } catch (e: any) {
      r.why = `Guard failed (${e?.message ?? e}); failing closed.`;
      return finish('blocked', '');
    }

    const local = await this.localState();
    const cloud = this.cloudAllowed();

    const runLocal = async () => {
      const out = await this.o.ai.runOnDevice(prompt, { systemInstruction: req.systemInstruction, timeoutMs: rule.timeoutMs, onToken: t => req.onToken?.(t, 'on_device') });
      return { text: out.text, servedBy: out.servedBy, report: validate(validators, out.text) };
    };

    const runCloud = async (redact: boolean): Promise<RunResult | { text: string; servedBy: Backend | null; sent: string; frames: EgressFrame[] }> => {
      let payload = prompt;
      let map: Map<string, string> | undefined;
      if (redact) {
        try {
          const red = redactText(prompt, entities!);
          payload = red.sanitizedText;
          map = red.placeholderMap;
        } catch (e: any) {
          r.why = `Redaction could not be verified (${e?.message ?? e}); nothing was sent.`;
          return finish('blocked', '');
        }
      }
      this.cloudCallTimes.push((this.o.now ?? Date.now)());
      r.payloadBytes = new TextEncoder().encode(payload).length;
      globalEgressObserver.startCapture();
      let out;
      try {
        out = await this.o.ai.runInCloud(payload, {
          systemInstruction: redact ? `${req.systemInstruction ?? ''}\nTokens like [PAN_1] or [PERSON_1] are placeholders. Keep them exactly as written.`.trim() : req.systemInstruction,
          timeoutMs: 30000,
          onToken: t => req.onToken?.(t, 'in_cloud')
        });
      } finally {
        const cap = globalEgressObserver.stopCapture();
        r.bytesOut = cap.measuredBytes;
        r.destination = cap.outboundEndpoints;
        (r as any)._frames = cap.frames;
      }
      const frames: EgressFrame[] = (r as any)._frames;
      delete (r as any)._frames;
      const text = map && map.size ? rehydrateText(out.text, map).rehydratedText : out.text;
      return { text, servedBy: out.servedBy, sent: payload, frames };
    };

    const cloudResult = async (redact: boolean, why: string, localPart?: RunResult['local']): Promise<RunResult> => {
      try {
        const c = await runCloud(redact);
        if ('receipt' in c) return c;
        r.route = redact ? 'CLOUD_REDACTED' : 'CLOUD';
        r.servedBy = c.servedBy;
        const rep = validate(validators, c.text);
        r.validation = { passed: rep.passed, quality: Math.round(rep.quality * 1000) / 1000 };
        r.why = why;
        return finish('ok', c.text, { sentToCloud: c.sent, frames: c.frames, local: localPart });
      } catch (e: any) {
        r.why = `${why} Cloud call failed: ${e?.message ?? e}.`;
        return finish('error', '', { error: String(e?.message ?? e), local: localPart });
      }
    };

    // 2. Sensitive content: privacy decides before measurements do
    if (r.guard.sensitive) {
      const ents = Object.entries(r.guard.entities).map(([k, v]) => `${v} ${k}`).join(', ') || 'sensitivity hint';
      const sr = this.policy.privacy.sensitiveRoute;
      if (sr === 'BLOCK') { r.why = `Sensitive (${ents}); policy blocks sensitive content.`; return finish('blocked', ''); }
      if (local.ok) {
        try {
          const l = await runLocal();
          r.route = 'LOCAL';
          r.servedBy = l.servedBy;
          r.validation = { passed: l.report.passed, quality: Math.round(l.report.quality * 1000) / 1000 };
          if (l.report.passed || sr === 'LOCAL_ONLY') {
            r.why = `Sensitive (${ents}): kept on-device.${l.report.passed ? '' : ' Local answer failed validation; not escalated because sensitive content stays local.'}`;
            return finish('ok', l.text, { local: { output: l.text, report: l.report } });
          }
          // REDACT_THEN_CLOUD: escalate with redaction
          r.qualityEscalation = { happened: true, reason: l.report.failedTriggers.join(', ') };
          if (!cloud.ok) { r.why = `Sensitive; local answer failed and cloud is unavailable (${cloud.reason}).`; return finish('ok', l.text, { local: { output: l.text, report: l.report } }); }
          return cloudResult(true, `Sensitive (${ents}); local answer failed ${r.qualityEscalation.reason}; escalated with identifiers redacted.`, { output: l.text, report: l.report });
        } catch (e: any) {
          r.availabilityFallback = true;
          r.availabilityReason = String(e?.message ?? e);
        }
      } else {
        r.availabilityFallback = true;
        r.availabilityReason = local.reason;
      }
      if ((sr === 'REDACT_THEN_CLOUD' || req.consentRedactedCloud) && cloud.ok) {
        return cloudResult(true, `Sensitive (${ents}); on-device unavailable (${r.availabilityReason}); sent to cloud with identifiers redacted${req.consentRedactedCloud ? ' (user consented for this request)' : ''}.`);
      }
      r.route = 'BLOCKED';
      r.why = `Sensitive (${ents}) and the on-device model is unavailable (${r.availabilityReason}). Nothing was sent. Consent is needed to send a redacted version.`;
      return finish('blocked', '');
    }

    // 3. Non-sensitive: follow the measured rule
    const localFirst = rule.route === 'LOCAL_FIRST' || rule.route === 'LOCAL_ONLY';
    if (localFirst || !cloud.ok) {
      if (local.ok) {
        try {
          const l = await runLocal();
          r.validation = { passed: l.report.passed, quality: Math.round(l.report.quality * 1000) / 1000 };
          if (l.report.passed || rule.route === 'LOCAL_ONLY' || !cloud.ok) {
            r.route = 'LOCAL';
            r.servedBy = l.servedBy;
            r.why = localFirst
              ? `${rule.evidence.why}${l.report.passed ? '' : ` Local answer failed (${l.report.failedTriggers.join(', ')}); cloud unavailable (${cloud.reason}).`}`
              : `Cloud unavailable (${cloud.reason}); used on-device.`;
            if (!localFirst) { r.availabilityFallback = true; r.availabilityReason = cloud.reason; }
            return finish('ok', l.text, { local: { output: l.text, report: l.report } });
          }
          r.qualityEscalation = { happened: true, reason: l.report.failedTriggers.join(', ') };
          return cloudResult(false, `Local-first rule; local answer failed ${r.qualityEscalation.reason}; escalated to cloud.`, { output: l.text, report: l.report });
        } catch (e: any) {
          r.availabilityFallback = true;
          r.availabilityReason = `local run failed: ${e?.message ?? e}`;
        }
      } else if (localFirst) {
        r.availabilityFallback = true;
        r.availabilityReason = local.reason;
      }
      if (!cloud.ok) {
        r.why = `Neither backend available: local (${local.reason ?? r.availabilityReason}), cloud (${cloud.reason}).`;
        return finish('error', '', { error: r.why });
      }
      return cloudResult(false, `${localFirst ? 'Local-first rule' : 'Cloud-first rule'}; on-device unavailable (${r.availabilityReason}); used cloud.`);
    }
    return cloudResult(false, rule.evidence.why);
  }
}

export function createTandem(o: TandemOptions): Tandem {
  return new Tandem(o);
}
