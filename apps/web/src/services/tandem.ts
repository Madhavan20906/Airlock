/**
 * App-wide Tandem state shared by Studio and Notes.
 * Everything that reaches the network goes through @tandem/ai (Firebase AI Logic) via @tandem/router.
 */
import { TandemAI, getCapability, type Capability } from '@tandem/ai';
import { createTandem, type Receipt, type Tandem, type AIBackend } from '@tandem/router';
import { defaultPolicy, validatePolicy, type TandemPolicy, type RunResult } from '@tandem/policy';
import { firebase } from './firebase.js';
import { kvGet, kvSet } from './store.js';

export type PolicySource = 'remote-config' | 'my-compiled' | 'built-in-default';

export interface ReferenceRun {
  label: string;
  measuredAt: string;
  chrome: string;
  machine: string;
  battery: string;
  notes?: string;
  results: RunResult[];
}

type Listener = () => void;

class TandemState {
  capability: Capability = { state: 'unsupported', raw: 'checking', promptApi: false, chromeMajor: null };
  ai: TandemAI | null = null;
  router: Tandem;
  receipts: Receipt[] = [];
  myRun: RunResult[] = [];
  myRunMeta: { date: string; chrome: string } | null = null;
  reference: ReferenceRun | null = null;
  myPolicy: TandemPolicy | null = null;
  online = typeof navigator === 'undefined' ? true : navigator.onLine;
  private listeners = new Set<Listener>();
  private ready: Promise<void>;

  constructor() {
    if (firebase.app) this.ai = new TandemAI(firebase.app);
    this.router = createTandem(this.routerOptions());
    this.ready = this.load();
    firebase.onChange(() => this.applyPolicy());
    addEventListener('online', () => { this.online = true; this.emit(); });
    addEventListener('offline', () => { this.online = false; this.emit(); });
  }

  whenReady() { return this.ready; }

  private needAI(): TandemAI {
    if (!this.ai) throw new Error('Firebase is not configured for this build.');
    return this.ai;
  }

  private async load() {
    this.receipts = await kvGet<Receipt[]>('receipts', []);
    if (this.receipts.length) this.router = createTandem({ ...this.routerOptions(), previousHash: this.receipts[this.receipts.length - 1].hash });
    this.myRun = await kvGet<RunResult[]>('myRun', []);
    this.myRunMeta = await kvGet('myRunMeta', null);
    const mp = await kvGet<TandemPolicy | null>('myPolicy', null);
    this.myPolicy = mp && validatePolicy(mp).valid ? mp : null;
    try {
      const r = await fetch('/reference-run.json', { cache: 'no-cache' });
      if (r.ok) this.reference = await r.json();
    } catch { /* offline: reference not available */ }
    await this.refreshCapability();
    this.applyPolicy();
  }

  private routerOptions() {
    return {
      ai: {
        getCapability: async () => ({ state: (await this.refreshCapability()).state }),
        runOnDevice: (p: string, o: any) => this.needAI().runOnDevice(p, o),
        runInCloud: (p: string, o: any) => this.needAI().runInCloud(p, o)
      } as AIBackend,
      isOnline: () => navigator.onLine,
      onReceipt: (r: Receipt) => this.addReceipt(r)
    };
  }

  async refreshCapability(): Promise<Capability> {
    this.capability = await getCapability();
    this.emit();
    return this.capability;
  }

  /** Remote Config wins; then the user's own compiled policy; then the conservative default. */
  get policySource(): PolicySource {
    if (firebase.settings.policy) return 'remote-config';
    if (this.myPolicy) return 'my-compiled';
    return 'built-in-default';
  }

  applyPolicy() {
    const base = firebase.settings.policy ?? this.myPolicy ?? defaultPolicy();
    const p: TandemPolicy = {
      ...base,
      killSwitch: { cloud: base.killSwitch.cloud || firebase.settings.killSwitchCloud, local: base.killSwitch.local || firebase.settings.killSwitchLocal }
    };
    this.router.setPolicy(p);
    this.emit();
  }

  get policy(): TandemPolicy { return this.router.getPolicy(); }

  async setMyPolicy(p: TandemPolicy | null) {
    this.myPolicy = p;
    await kvSet('myPolicy', p);
    this.applyPolicy();
  }

  async saveMyRun(results: RunResult[]) {
    this.myRun = results;
    this.myRunMeta = { date: new Date().toISOString(), chrome: navigator.userAgent.match(/Chrome\/([\d.]+)/)?.[1] ?? 'unknown' };
    await kvSet('myRun', results);
    await kvSet('myRunMeta', this.myRunMeta);
    for (const r of results.slice(-200)) {
      const { env, outputPreview, errorMessage, ...meta } = r;
      void firebase.saveMeta('runs', r.runId.replace(/[^\w-]/g, '_'), { ...meta, chromeMajor: env?.chromeMajor ?? null });
    }
    this.emit();
  }

  private async addReceipt(r: Receipt) {
    this.receipts = [...this.receipts, r].slice(-500);
    await kvSet('receipts', this.receipts);
    void firebase.saveMeta('receipts', r.id, r as unknown as Record<string, unknown>);
    this.emit();
  }

  async clearReceipts() {
    this.receipts = [];
    await kvSet('receipts', []);
    this.router = createTandem(this.routerOptions());
    this.applyPolicy();
  }

  subscribe(fn: Listener) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  emit() { this.listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } }); }
}

export const tandem = new TandemState();
