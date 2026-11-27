/**
 * @tandem/ai — the ONLY Tandem package that imports firebase/ai.
 *
 * Every call states its InferenceMode explicitly:
 *   runOnDevice  -> InferenceMode.ONLY_ON_DEVICE  (throws if no local model)
 *   runInCloud   -> InferenceMode.ONLY_IN_CLOUD
 *   runPrefer    -> InferenceMode.PREFER_ON_DEVICE (SDK availability fallback)
 * `servedBy` is read from the SDK response (`inferenceSource`). When the SDK does not
 * report it, ONLY_* modes are unambiguous and we mark `servedBySource: 'mode'`; for
 * PREFER_* we report `null` rather than guess.
 */
import type { FirebaseApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode, InferenceSource, type AI, type GenerativeModel } from 'firebase/ai';

export type Backend = 'on_device' | 'in_cloud';
export type CapabilityState = 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported';

export interface Capability {
  state: CapabilityState;
  /** Raw value from LanguageModel.availability(), for display/debugging. */
  raw: string;
  /** Prompt API present in this browser at all. */
  promptApi: boolean;
  chromeMajor: number | null;
}

export interface RunOptions {
  systemInstruction?: string;
  onToken?: (textSoFar: string) => void;
  signal?: AbortSignal;
  timeoutMs?: number;
  /** Cloud model override; default is the SDK's documented default for hybrid. */
  cloudModel?: string;
}

export interface RunOutput {
  text: string;
  servedBy: Backend | null;
  servedBySource: 'sdk' | 'mode' | 'unknown';
  mode: 'only_on_device' | 'only_in_cloud' | 'prefer_on_device';
  ttftMs: number | null;
  totalMs: number;
  /** From usageMetadata when the SDK provides it (cloud); otherwise undefined. */
  inTokens?: number;
  outTokens?: number;
}

export const DEFAULT_CLOUD_MODEL = 'gemini-3.5-flash-lite';

export function chromeMajor(): number | null {
  const m = typeof navigator !== 'undefined' ? navigator.userAgent.match(/Chrome\/(\d+)/) : null;
  return m ? Number(m[1]) : null;
}

export async function getCapability(): Promise<Capability> {
  const LM = (globalThis as any).LanguageModel;
  const base = { promptApi: typeof LM !== 'undefined', chromeMajor: chromeMajor() };
  if (!LM?.availability) return { ...base, state: 'unsupported', raw: 'no LanguageModel API' };
  try {
    const raw: string = await LM.availability();
    const state: CapabilityState = raw === 'available' || raw === 'readily' ? 'available'
      : raw === 'downloadable' || raw === 'after-download' ? 'downloadable'
      : raw === 'downloading' ? 'downloading' : 'unavailable';
    return { ...base, state, raw };
  } catch (e: any) {
    return { ...base, state: 'unavailable', raw: String(e?.message ?? e) };
  }
}

const CANCELLED = Symbol('cancelled');

export class TandemAI {
  readonly ai: AI;
  private models = new Map<string, GenerativeModel>();

  constructor(readonly app: FirebaseApp) {
    this.ai = getAI(app, { backend: new GoogleAIBackend() });
  }

  private model(mode: InferenceMode, opts: RunOptions): GenerativeModel {
    const key = `${mode}|${opts.cloudModel ?? ''}|${opts.systemInstruction ?? ''}`;
    let m = this.models.get(key);
    if (!m) {
      m = getGenerativeModel(this.ai, {
        mode,
        inCloudParams: {
          model: opts.cloudModel ?? DEFAULT_CLOUD_MODEL,
          ...(opts.systemInstruction ? { systemInstruction: opts.systemInstruction } : {})
        },
        // Chrome asks for declared languages; Gemini Nano's supported outputs are de/en/es/fr/ja.
        // Tandem declares English and measures (rather than assumes) how other-language tasks fare.
        onDeviceParams: {
          createOptions: {
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }],
            ...(opts.systemInstruction ? { initialPrompts: [{ role: 'system', content: opts.systemInstruction }] } : {})
          } as any
        }
      });
      this.models.set(key, m);
    }
    return m;
  }

  /** Must be called from a user gesture. Resolves when the model is ready (or throws). */
  async downloadModel(onProgress?: (fraction: number) => void): Promise<void> {
    const LM = (globalThis as any).LanguageModel;
    if (!LM?.create) throw new Error('This browser has no on-device Prompt API.');
    const session = await LM.create({
      monitor(m: any) {
        m.addEventListener('downloadprogress', (e: any) => onProgress?.(typeof e.loaded === 'number' ? e.loaded : 0));
      }
    });
    session.destroy?.();
  }

  runOnDevice(prompt: string, opts: RunOptions = {}) { return this.run(InferenceMode.ONLY_ON_DEVICE, prompt, opts); }
  runInCloud(prompt: string, opts: RunOptions = {}) { return this.run(InferenceMode.ONLY_IN_CLOUD, prompt, opts); }
  runPrefer(prompt: string, opts: RunOptions = {}) { return this.run(InferenceMode.PREFER_ON_DEVICE, prompt, opts); }

  private async run(mode: InferenceMode, prompt: string, opts: RunOptions): Promise<RunOutput> {
    const t0 = performance.now();
    let ttftMs: number | null = null;
    let text = '';
    const model = this.model(mode, opts);
    const work = (async () => {
      const res = await model.generateContentStream(prompt);
      for await (const chunk of res.stream) {
        if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        const piece = safeText(chunk);
        if (piece) {
          if (ttftMs === null) ttftMs = performance.now() - t0;
          text += piece;
          opts.onToken?.(text);
        }
      }
      return res.response;
    })();
    const timeout = opts.timeoutMs
      ? new Promise<typeof CANCELLED>((_, rej) => setTimeout(() => rej(new Error(`timeout after ${opts.timeoutMs} ms`)), opts.timeoutMs))
      : null;
    const response: any = await (timeout ? Promise.race([work, timeout]) : work);
    if (!text) text = safeText(response);

    const src = response?.inferenceSource;
    let servedBy: Backend | null = null;
    let servedBySource: RunOutput['servedBySource'] = 'unknown';
    if (src === InferenceSource.ON_DEVICE || src === InferenceSource.IN_CLOUD) {
      servedBy = src;
      servedBySource = 'sdk';
    } else if (mode === InferenceMode.ONLY_ON_DEVICE || mode === InferenceMode.ONLY_IN_CLOUD) {
      servedBy = mode === InferenceMode.ONLY_ON_DEVICE ? 'on_device' : 'in_cloud';
      servedBySource = 'mode';
    }
    const usage = response?.usageMetadata;
    return {
      text,
      servedBy,
      servedBySource,
      mode: mode as RunOutput['mode'],
      ttftMs,
      totalMs: performance.now() - t0,
      inTokens: usage?.promptTokenCount,
      outTokens: usage?.candidatesTokenCount
    };
  }
}

function safeText(r: any): string {
  try { return typeof r?.text === 'function' ? r.text() ?? '' : ''; } catch { return ''; }
}
