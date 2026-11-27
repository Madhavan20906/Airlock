// Gate A harness: official Firebase AI Logic hybrid hello-world in on-device-only mode.
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';

const log = (msg: string) => {
  const el = document.getElementById('log')!;
  el.textContent += `[${new Date().toISOString().slice(11, 19)}] ${msg}\n`;
};

const app = initializeApp({
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
});
const ai = getAI(app, { backend: new GoogleAIBackend() });
const model = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
const LM = (globalThis as any).LanguageModel;

(window as any).gate = { results: [] as any[] };

document.getElementById('check')!.addEventListener('click', async () => {
  log(`navigator.userAgent: ${navigator.userAgent}`);
  log(`LanguageModel API present: ${typeof LM !== 'undefined'}`);
  if (LM?.availability) {
    const a = await LM.availability();
    log(`LanguageModel.availability(): ${a}`);
    (window as any).gate.availability = a;
  }
});

document.getElementById('download')!.addEventListener('click', async () => {
  try {
    if (typeof (model as any).initializeDeviceModel === 'function') {
      log('calling model.initializeDeviceModel() (Firebase SDK)');
      await (model as any).initializeDeviceModel();
    } else if (LM?.create) {
      log('calling LanguageModel.create() with download monitor');
      const s = await LM.create({
        monitor(m: any) {
          m.addEventListener('downloadprogress', (e: any) => {
            (window as any).gate.progress = e.loaded;
            log(`download progress: ${(e.loaded * 100).toFixed(1)}%`);
          });
        }
      });
      s.destroy?.();
    }
    log(`after init, availability: ${LM?.availability ? await LM.availability() : 'n/a'}`);
  } catch (e: any) {
    log(`init error: ${e?.name || ''} ${e?.message || e}`);
  }
});

document.getElementById('run')!.addEventListener('click', async () => {
  const t0 = performance.now();
  try {
    const r = await model.generateContent('Reply with one short sentence: what colour is a clear daytime sky?');
    const res = {
      online: navigator.onLine,
      text: r.response.text().trim(),
      inferenceSource: (r.response as any).inferenceSource,
      ms: Math.round(performance.now() - t0)
    };
    (window as any).gate.results.push(res);
    log(`RESULT ${JSON.stringify(res)}`);
  } catch (e: any) {
    log(`run error: ${e?.code || ''} ${e?.message || e}`);
    (window as any).gate.results.push({ error: String(e?.message || e) });
  }
});
