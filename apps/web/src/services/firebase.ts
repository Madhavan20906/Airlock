/**
 * Firebase plumbing for Tandem Studio and Notes (client-only, Spark plan).
 * - App Check: reCAPTCHA v3 in production; debug token only in `vite dev` (never committed).
 * - Auth: anonymous sign-in (an opaque uid used only to scope a user's own metadata).
 * - Firestore: metadata-only writes (see firebase/firestore.rules).
 * - Remote Config: tandem_policy_v1 + switches, real-time listener, schema-validated (fail closed).
 */
import { initializeApp, type FirebaseApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider, type AppCheck } from 'firebase/app-check';
import { getAuth, signInAnonymously, onAuthStateChanged, type Auth } from 'firebase/auth';
import {
  getFirestore, doc, setDoc, deleteDoc, getDoc, collection, query, where, getCountFromServer, type Firestore
} from 'firebase/firestore';
import { getRemoteConfig, fetchAndActivate, getValue, onConfigUpdate, activate, type RemoteConfig } from 'firebase/remote-config';
import { validatePolicy, type TandemPolicy } from '@tandem/policy';

export interface RemoteSettings {
  policy: TandemPolicy | null;
  policyError?: string;
  killSwitchCloud: boolean;
  killSwitchLocal: boolean;
  probeMaxCloudCalls: number;
  atlasEnabled: boolean;
  priceInPerMTok: number;
  priceOutPerMTok: number;
  minChromeMajor: number;
  source: 'remote' | 'defaults';
  fetchedAt: number | null;
}

export const RC_DEFAULTS = {
  tandem_policy_v1: '',
  kill_switch_cloud: false,
  kill_switch_local: false,
  probe_max_cloud_calls: 60,
  atlas_enabled: true,
  // ESTIMATE constants (USD per 1M tokens). Editable in Remote Config. Not a quote.
  price_in_per_mtok: 0.1,
  price_out_per_mtok: 0.4,
  min_chrome_major: 139
};

const env = import.meta.env;
export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID
};

export type AppCheckMode = 'recaptcha-v3' | 'debug' | 'none';

class FirebaseService {
  readonly configured = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId);
  app?: FirebaseApp;
  appCheck?: AppCheck;
  appCheckMode: AppCheckMode = 'none';
  auth?: Auth;
  db?: Firestore;
  rc?: RemoteConfig;
  uid: string | null = null;
  settings: RemoteSettings = {
    policy: null, killSwitchCloud: false, killSwitchLocal: false, probeMaxCloudCalls: 60, atlasEnabled: true,
    priceInPerMTok: RC_DEFAULTS.price_in_per_mtok, priceOutPerMTok: RC_DEFAULTS.price_out_per_mtok, minChromeMajor: 139,
    source: 'defaults', fetchedAt: null
  };
  private listeners = new Set<() => void>();

  constructor() {
    if (!this.configured) return;
    this.app = initializeApp(firebaseConfig);
    const siteKey = env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
    try {
      if (env.DEV || env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN) {
        // Dev / local measurement builds only (token passed at build time, never committed or deployed).
        (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN || true;
        this.appCheck = initializeAppCheck(this.app, { provider: new ReCaptchaV3Provider(siteKey || 'debug-mode-placeholder'), isTokenAutoRefreshEnabled: true });
        this.appCheckMode = 'debug';
      } else if (siteKey) {
        this.appCheck = initializeAppCheck(this.app, { provider: new ReCaptchaV3Provider(siteKey), isTokenAutoRefreshEnabled: true });
        this.appCheckMode = 'recaptcha-v3';
      }
    } catch { this.appCheckMode = 'none'; }

    this.auth = getAuth(this.app);
    onAuthStateChanged(this.auth, u => {
      if (u) { this.uid = u.uid; this.emit(); }
      else signInAnonymously(this.auth!).catch(() => { /* offline or blocked: metadata sync stays off */ });
    });
    this.db = getFirestore(this.app);
    this.initRemoteConfig();
  }

  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit() { this.listeners.forEach(f => { try { f(); } catch { /* ignore */ } }); }

  private async initRemoteConfig() {
    try {
      this.rc = getRemoteConfig(this.app!);
      this.rc.settings.minimumFetchIntervalMillis = 60_000;
      this.rc.defaultConfig = RC_DEFAULTS as any;
      await fetchAndActivate(this.rc).catch(() => false);
      this.readSettings();
      onConfigUpdate(this.rc, {
        next: async () => { await activate(this.rc!); this.readSettings(); },
        error: () => { /* keep last good settings */ },
        complete: () => {}
      });
    } catch { /* RC unavailable: built-in defaults stay in force */ }
  }

  private readSettings() {
    if (!this.rc) return;
    const s = (k: string) => getValue(this.rc!, k);
    let policy: TandemPolicy | null = null;
    let policyError: string | undefined;
    const raw = s('tandem_policy_v1').asString();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const v = validatePolicy(parsed);
        if (v.valid) policy = parsed;
        else policyError = `Remote policy rejected: ${v.errors.slice(0, 2).join('; ')}`;
      } catch { policyError = 'Remote policy is not valid JSON; using the built-in default.'; }
    }
    const fromRemote = s('tandem_policy_v1').getSource() === 'remote' || s('kill_switch_cloud').getSource() === 'remote';
    this.settings = {
      policy, policyError,
      killSwitchCloud: s('kill_switch_cloud').asBoolean(),
      killSwitchLocal: s('kill_switch_local').asBoolean(),
      probeMaxCloudCalls: s('probe_max_cloud_calls').asNumber() || 60,
      atlasEnabled: s('atlas_enabled').asBoolean(),
      priceInPerMTok: s('price_in_per_mtok').asNumber(),
      priceOutPerMTok: s('price_out_per_mtok').asNumber(),
      minChromeMajor: s('min_chrome_major').asNumber() || 139,
      source: fromRemote ? 'remote' : 'defaults',
      fetchedAt: Date.now()
    };
    this.emit();
  }

  /** Metadata-only write under the user's own subtree. Skipped when offline or unauthenticated. */
  async saveMeta(kind: 'receipts' | 'runs', id: string, data: Record<string, unknown>) {
    if (!this.db || !this.uid) return false;
    // Firestore rejects undefined values; round-trip through JSON drops them.
    try { await setDoc(doc(this.db, 'users', this.uid, kind, id), JSON.parse(JSON.stringify(data))); return true; } catch { return false; }
  }

  // ------------------------------------------------------------- Atlas
  private async contribRef() {
    if (!this.db || !this.uid) throw new Error('Still signing in anonymously. Try again in a moment.');
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.uid));
    const id = Array.from(new Uint8Array(d), b => b.toString(16).padStart(2, '0')).join('');
    return doc(this.db, 'contrib', id);
  }
  async atlasContribute(c: Record<string, unknown>) {
    await setDoc(await this.contribRef(), { ...c, ts: Date.now() });
  }
  async atlasMine() {
    try { const s = await getDoc(await this.contribRef()); return s.exists() ? s.data() : null; } catch { return null; }
  }
  async atlasDelete() {
    await deleteDoc(await this.contribRef());
  }
  /** Server-side aggregation (count queries): no individual contribution is ever downloaded. */
  async atlasCount(field?: string, value?: string): Promise<number> {
    if (!this.db) return 0;
    const c = collection(this.db, 'contrib');
    const q = field ? query(c, where(field, '==', value)) : c;
    const snap = await getCountFromServer(q);
    return snap.data().count;
  }
}

export const firebase = new FirebaseService();
