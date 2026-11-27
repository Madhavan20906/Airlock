# Tandem Platform Decision

**Platform: Web (Chrome desktop) only.** Final. No Android/iOS. Devpost platform: Web.

## Firebase (Gate B) — verified 26 Nov 2026
| Item | Status |
|---|---|
| Project | `airlock-ai-7dde4` (unchanged), **Spark** plan (owner) |
| Web app | `Airlock Web` `1:658301935236:web:aebf4ab37fd3c317436cd1` |
| AI Logic (Gemini Developer API) | **Enabled**: a real call reached `firebasevertexai.googleapis.com` |
| App Check | **Enforced for AI Logic** (401 without a token). Provider: **reCAPTCHA v3**, site key set (public value, build-time env `VITE_RECAPTCHA_SITE_KEY`); `tandem-hybrid.web.app` allowed. Dev and measurement builds use a registered debug token (never committed) |
| Hosting | New site **`tandem-hybrid`** → https://tandem-hybrid.web.app (added 26 Nov, additive). Default site `airlock-ai-7dde4` untouched |
| Cloud model | `gemini-3.5-flash-lite` (current hybrid default per Firebase docs) |
| Repository | Renamed to **github.com/Madhavan20906/Tandem** (old URL redirects) |
| Remote Config | Server template was empty (verified 26 Nov); Tandem parameters published from `firebase/remoteconfig.template.json` |

## Gate A: on-device inference — **PASSED 26 Nov 2026 19:40 IST** (after owner reboot freed commit memory: 0.47 GB → 8.7 GB)

Result: `eval/results/gate-a-2026-11-26.json`. Firebase AI Logic `ONLY_ON_DEVICE` → `inferenceSource: "on_device"` online (9.4 s cold) and with the network disabled via CDP (`navigator.onLine=false`, 1.9 s warm). Script: `eval/gate-a.mjs`.

### History (the earlier failure, kept for the record)

Harness: `apps/web/gate.html` (Firebase AI Logic, `InferenceMode.ONLY_ON_DEVICE`, reads `response.inferenceSource`), driven in a separate Chrome profile on D:.

| Check | Result |
|---|---|
| Chrome | 158.0.8127.38, Windows 11 (26300) |
| Machine | Intel Core i5-1334U (10C/12T), Intel Iris Xe (integrated, driver 32.0.101.7076), 16 GB RAM |
| `LanguageModel.availability()` | `downloadable` → model downloaded in ~7.5 min → `available` |
| chrome://on-device-internals | Performance class **High**; Enough VRAM **true (8013 MiB shared / 3000 required)**; `nano_v3_gpu` 4,072 MiB **Ready**; backend GPU |
| WebGPU | Hardware accelerated (intel gen-12lp) |
| Session creation | **Fails**: "The model process crashed too many times for this version"; after a reset it crashes again |
| Free commit memory | **0.47 GB** (pagefile on C: is 3.2 GB and cannot grow: C: has 0.25 GB free) |

**Diagnosis:** the model process runs out of committable memory while loading 4 GB of weights. Integrated graphics shares system RAM, and the pagefile cannot grow because C: is full. Eligibility, flags, disk (D:) and GPU are all fine.

**Fix (owner, either one):**
1. Free 10+ GB on C: (lets Windows grow the pagefile), or
2. Add a pagefile on D: (System Properties → Advanced → Performance → Virtual memory → D: "System managed size") and reboot.

Then close other heavy apps and re-run Gate A (`node D:\tandem-gate\gatea.mjs` with the gate Chrome open).

Nothing is simulated meanwhile: the on-device lane shows its true state (unavailable) and no on-device numbers are claimed.

## Judges' machines
The app must stay convincing without Gemini Nano: Device Check explains status, Guard detection/redaction runs locally without any model, and a labelled Reference Run ("Measured on the author's machine, <date>, Chrome <ver>") lets Frontier/Policy be explored.
