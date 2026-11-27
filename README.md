# Tandem — measure, don't guess

> **Every hybrid-AI app hardcodes a guess: "short and simple goes on-device, long and hard goes to the cloud." Tandem replaces the guess with measurement.**

Firebase AI Logic hybrid inference answers *"is a local model available?"* Tandem answers the harder question every developer hits next: **which of your tasks can the on-device model actually do well enough, on which devices, at what latency cost, and what must never leave the device at all?** With receipts.

Built for **#BuildHybridAI 2026** on **Firebase AI Logic hybrid inference** (Gemini Nano in Chrome + `gemini-3.5-flash-lite` in the cloud). **Platform: Web (Chrome).**

[![Tandem CI](https://github.com/Madhavan20906/Tandem/actions/workflows/ci.yml/badge.svg)](https://github.com/Madhavan20906/Tandem/actions) · Apache-2.0 · **Live: [tandem-hybrid.web.app](https://tandem-hybrid.web.app)** · Notes: [tandem-hybrid.web.app/notes/](https://tandem-hybrid.web.app/notes/)

---

## What we found when we measured

We ran **285 tasks** across 8 task types on a mid-range laptop (Intel i5-1334U, Iris Xe integrated GPU, 16 GB RAM).  
Gemini Nano got almost everything right. It was just slow.

| Latency budget | On-device % | Validator pass rate | What it means |
|---|---|---|---|
| **8 s** (interactive) | **0 %** | 97.8 % | Local model is accurate but too slow for interactive use on integrated graphics |
| **30 s** (background) | **86 %** | 100.0 % | Same hardware, same model — background work stays on-device |
| Cloud baseline | 0 % | 97.8 % | Reference ceiling |

The developer sets the latency budget. Tandem shows what each choice costs — before the app ships, with evidence on every rule.

**Three things measurement found that guessing would not:**

1. **Translation breaks on-device.** Gemini Nano passes 100 % of classify, extract, rewrite and summarise tasks — but only **33 %** of translate tasks (English → Tamil / Hindi). Without measurement, a developer would assume both work because "it's just text."

2. **Latency is the constraint, not accuracy.** On-device median for structured extraction is **20 seconds**; the cloud answers the same task in under **1 second**. No prompt-length heuristic predicts this. Only measurement does.

3. **108 → 2 adversarial leaks.** Tandem Guard started with 108 detected leaks out of 263 adversarial attempts to disguise Indian personal identifiers (PAN, Aadhaar, GSTIN — Indic digits, zero-width chars, Cyrillic lookalikes, base64). After fixes: **2 misses** on a 263-case corpus. We documented the gap, not just the final number.

**What Tandem built on top of that:**  
A probe that races both models on your tasks → a policy compiler that turns measurements into routing rules with Wilson 95% lower bounds → a router SDK that applies the policy at runtime with Guard-enforced privacy and SHA-256-chained receipts → a live notes app built entirely on the router → Firebase Remote Config delivery so a published policy reaches every open app without a redeploy.

---

## Table of Contents

- [The Thesis](#the-thesis)
- [In 5 Lines](#in-5-lines)
- [What It Is: One Engine, Three Faces](#what-it-is-one-engine-three-faces)
- [Three Ideas You Can Check in 30 Seconds](#three-ideas-you-can-check-in-30-seconds)
- [Requirements and Availability](#requirements-and-availability)
- [Results](#results-all-measured-all-re-runnable)
- [How Firebase AI Logic Is Used](#how-firebase-ai-logic-is-used)
- [Architecture](#architecture)
- [Package Deep Dive](#package-deep-dive)
- [The Privacy Layer: Tandem Guard](#the-privacy-layer-tandem-guard)
- [The Measurement Pipeline](#the-measurement-pipeline)
- [The Policy Compiler](#the-policy-compiler)
- [The Router SDK](#the-router-sdk)
- [The Receipt Chain](#the-receipt-chain)
- [Judge Quick Start](#judge-quick-start)
- [Who It Is For](#who-it-is-for)
- [Build and Run](#build-and-run)
- [Repository Map](#repository-map)
- [Limitations](#limitations-stated-plainly)
- [What Was Built During the Submission Period](#what-was-built-during-the-submission-period)
- [Licence](#licence)

---

## The Thesis

Firebase AI Logic gives developers three inference modes: `ONLY_ON_DEVICE`, `ONLY_IN_CLOUD`, and `PREFER_ON_DEVICE`. The SDK handles availability — if Gemini Nano isn't downloaded or the browser doesn't support it, the request falls back to the cloud. That is a solved problem.

The unsolved problem is **quality routing**. A local model that is *available* is not necessarily *good enough* for a given task. And "good enough" depends on the task type, the input length, the device's GPU, and the latency budget the developer is willing to accept. No single flag answers all of that.

Tandem's answer: **measure it**. Run every task type on both models, score the answers with deterministic validators, compile the results into a routing policy with statistical evidence on every rule, and ship that policy through Firebase Remote Config so it can be updated without redeploying. Then use the policy at runtime: route each request by evidence, escalate when local quality fails, and produce a hash-chained receipt that proves where every answer came from and why.

The 0% on-device figure at the 8-second interactive budget is not a failure — it is the honest finding on this hardware. At a 30-second budget for background work, 86% of tasks stay on-device with 100% of them passing validators. **The developer decides the budget; Tandem shows the cost.**

---

## In 5 Lines

```ts
import { createTandem } from '@tandem/router';
import { TandemAI } from '@tandem/ai';

const tandem = createTandem({ ai: new TandemAI(firebaseApp), policy: remoteConfigPolicy });
const { output, receipt } = await tandem.run({ task: 'summarize', input: note });
// receipt.route: LOCAL | CLOUD | CLOUD_REDACTED | BLOCKED
// receipt.servedBy from the SDK · receipt.why from measured evidence
```

---

## What It Is: One Engine, Three Faces

| | What | Where |
|---|---|---|
| **Tandem Studio** | Measures on *your* device how Gemini Nano and the cloud model each perform on a battery of real task types. Compiles the results into a routing policy with statistical evidence on every rule. Ships it through Remote Config. Five stages: Probe → Frontier → Policy → Deploy → Atlas. | `apps/web` (`/studio/`) |
| **Tandem Router** | Drop-in SDK over Firebase AI Logic. Reads the compiled policy, applies a privacy guard, runs local-first where measurements say that is safe, validates the answer, and escalates to the cloud only when a validator fails. Every request produces a hash-chained receipt. | `packages/tandem-router` |
| **Tandem Notes** | Private, local-first notes app (summarise, rewrite, extract tasks, translate, ask my notes) built **only** on the router. Every action shows where it ran and why, with a verifiable receipt. | `apps/web/notes` (`/notes/`) |

### Three Ideas You Can Check in 30 Seconds

1. **Availability fallback ≠ quality escalation.** The SDK falls back when the local model is *unavailable*. Tandem also escalates when the local answer is *not good enough* (fails a JSON-schema, length, required-facts or refusal check), and records which one happened, with different icons and receipt fields.

2. **Policy with receipts.** Every rule carries its evidence: n, local and cloud pass rates, Wilson 95% lower bound, p50/p95 latency, estimated cloud tokens avoided. The thresholds were fixed before any data existed ([`docs/POLICY_RULE.md`](docs/POLICY_RULE.md)).

3. **Hybrid Atlas.** An opt-in, anonymous, coarse-bucket map of which devices can actually run on-device inference and how fast. Anyone who opens the link and runs the probe can add a data point.

And a fourth axis: **privacy as a routing constraint.** Tandem Guard (`packages/tandem-guard`) detects Aadhaar (Verhoeff), PAN, IFSC, UPI, GSTIN, phone and account numbers, including disguised ones (Indic or fullwidth digits, spacing, zero-width characters, Cyrillic lookalikes, base64). Sensitive content stays on-device, is sent redacted only with per-request consent, or is blocked. Never silently sent.

---

## Requirements and Availability

### What Works Everywhere

| Feature | Any modern browser | Notes |
|---|---|---|
| Landing page | Yes | Static, no login required |
| Tandem Studio (all screens) | Yes | Cloud inference only; on-device lane reports "unavailable" honestly |
| Policy viewer, Frontier, Atlas | Yes | Reads from a labelled Reference Run from the author's laptop |
| Guard Lab | Yes | Deterministic — runs entirely in the browser, no model needed |
| Receipts (verify, tamper test) | Yes | SHA-256 in WebCrypto |

### What Needs Chrome 139+ Desktop

| Feature | Requirement | Why |
|---|---|---|
| On-device inference lane | Chrome 139+ on Windows 10/11, macOS 13+, or Linux desktop | Gemini Nano runs via the Chrome Prompt API through Firebase AI Logic |
| Device check "run locally" proof | Same | Calls `InferenceMode.ONLY_ON_DEVICE` |
| Tandem Notes (local route) | Same | Notes default to on-device when available; cloud when not |

### Hardware for On-Device Inference

- GPU with >4 GB VRAM, **or** 16 GB RAM with 4+ CPU cores
- ~22 GB free disk space (one-time Gemini Nano download, ~4 GB)
- Chrome flag: `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → Enabled, then restart Chrome

### If Gemini Nano Is Not Available

Nothing breaks. Every screen in Tandem Studio works without it:
- The on-device lane says **why** it is idle (not downloaded, unsupported browser, insufficient hardware)
- The probe runs cloud-only and labels the results accordingly
- A labelled **Reference Run** from the author's laptop fills all charts and policy views
- Tandem Notes routes everything to the cloud, shows the true source, and the receipt proves it
- Guard Lab is fully deterministic and needs no model at all

### Firebase Services Used (Spark Plan)

| Service | Purpose | Config |
|---|---|---|
| AI Logic (hybrid inference) | On-device (Gemini Nano) + cloud (`gemini-3.5-flash-lite`) | App Check enforced |
| App Check (reCAPTCHA v3) | Protects AI Logic cloud calls | Site key in HTML |
| Anonymous Authentication | Per-session identity for Firestore writes | Auto sign-in |
| Firestore | Receipt metadata, Atlas contributions | Owner-only rules with field whitelists |
| Remote Config | Ships `tandem_policy_v1` to open apps in real time | `onConfigUpdate` listener |
| Hosting | Static site at `tandem-hybrid.web.app` | Single-page with rewrites |

No Cloud Functions. No Blaze plan. Everything runs client-side on the Spark (free) tier.

---

## Results (all measured, all re-runnable)

<!-- RESULTS:START -->
**Held-out validation.** The policy is compiled from the calibration split only and replayed on 93 held-out tasks measured on both models (`eval/results/policy-validation-2026-11-27.json`).

| | Tandem, registered policy (8 s p95 budget) | Tandem, 30 s background budget (sensitivity view) | All cloud | All on-device |
|---|---|---|---|---|
| Tasks passing validators | 97.8% | 100.0% | 97.8% | 93.5% |
| Served on-device | 0.0% | 86.0% | 0% | 100% |
| p50 / p95 latency | 1.3 s / 5.3 s | 8.4 s / 17.9 s | 1.3 s / 5.3 s | 10.6 s / 45.0 s |
| Quality escalations (rescued) | 0 (0) | 1 (1) | | |

**What this says.** On this laptop's integrated GPU, Gemini Nano passes most tasks but answers several times slower than the cloud. At the registered 8-second interactive budget the policy keeps 0% on-device; with a 30-second budget for background work it keeps 86%. Sensitive content is routed on-device by Tandem Guard regardless of budget. The budget is the developer's choice; Tandem shows what each choice costs.

**Calibration probe by task type** (192 runs; `eval/results/probe-calibration-2026-11-27.json`):

| Task type | On-device pass | Cloud pass | On-device p50 | Cloud p50 | Local-first lengths (8 s) |
|---|---|---|---|---|---|
| classify | 12/12 (100%) | 12/12 (100%) | 4.8 s | 2.2 s | 0/3 |
| extract | 12/12 (100%) | 12/12 (100%) | 20.0 s | 956 ms | 0/3 |
| instruction | 12/12 (100%) | 11/11 (100%) | 8.5 s | 921 ms | 0/3 |
| json_reliability | 12/12 (100%) | 12/12 (100%) | 13.0 s | 893 ms | 0/3 |
| qa | 12/12 (100%) | 12/12 (100%) | 4.5 s | 2.2 s | 0/3 |
| rewrite | 12/12 (100%) | 9/12 (75%) | 16.1 s | 2.3 s | 0/3 |
| summarize | 12/12 (100%) | 11/11 (100%) | 12.2 s | 1.0 s | 0/3 |
| translate | 4/12 (33%) | 12/12 (100%) | 7.3 s | 3.4 s | 0/3 |

Rate-limited (HTTP 429) and unavailable runs are recorded in the raw files and excluded from pass rates.

**Gate A** (`eval/results/gate-a-2026-11-26.json`): Firebase AI Logic `ONLY_ON_DEVICE` returned `inferenceSource: "on_device"` online and with the network disabled.

**Tandem Guard** (computed by `runLeakLab()` at build time): 263-case adversarial corpus with an independent oracle: 259 caught, 2 blocked, 2 missed. Held-out Guard benchmark: run `pnpm eval:heldout`.

Machine: Intel Core i5-1334U (10C/12T), Intel Iris Xe (integrated), 16 GB RAM, Windows 11, Chrome 158.0.8127.38. Validators are deterministic quality proxies (see Limitations).
<!-- RESULTS:END -->

### Reading the Numbers

The 0% on-device at the 8-second budget is not a shortcoming — it is the central demonstration. On integrated graphics, Gemini Nano's median answer time for most task types exceeds 8 seconds. A developer shipping an interactive feature (autocomplete, inline summary, quick classification) would rightly set a tight latency budget. Tandem's policy compiler sees that the local model cannot meet it and routes everything to the cloud — honestly, with evidence.

Change the budget to 30 seconds (suitable for background processing — batch summarisation, overnight extraction, offline-first workflows) and 86% of tasks stay on-device with a 100% pass rate. The same policy compiler, the same evidence, a different developer choice.

This is what "measure, don't guess" means in practice: the tool does not prescribe; it shows what each choice costs and lets the developer decide.

---

## How Firebase AI Logic Is Used

Tandem is built entirely on Firebase AI Logic for all model inference. No direct Gemini API calls, no third-party model providers.

| Where | What |
|---|---|
| `packages/tandem-ai/src/index.ts` → `runOnDevice` | `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE })` + `generateContentStream` (time to first token) |
| `packages/tandem-ai/src/index.ts` → `runInCloud` | `InferenceMode.ONLY_IN_CLOUD`, `gemini-3.5-flash-lite`, `usageMetadata` token counts |
| `packages/tandem-ai/src/index.ts` → `runPrefer` | `InferenceMode.PREFER_ON_DEVICE` (the SDK's own availability fallback, exposed for comparison) |
| `packages/tandem-ai/src/index.ts` → `servedBy` | Read from `response.inferenceSource` (`on_device` / `in_cloud`), never assumed |
| `apps/web/src/services/firebase.ts` | `getAI(app, { backend: new GoogleAIBackend() })` · App Check (reCAPTCHA v3) · anonymous Auth · Firestore (metadata only) · Remote Config `tandem_policy_v1` with `onConfigUpdate` real-time swap |
| `firebase/firestore.rules`, `firebase/rules.test.mjs` | Owner-only receipts/runs with field whitelists; Atlas `contrib/{sha256(uid)}` create-only; emulator tests in CI |

### The Three Inference Modes in Practice

```
ONLY_ON_DEVICE  →  Probe measurement (isolate local quality)
                   Gate A proof (confirm source offline)
                   Guard-forced routing (sensitive content)

ONLY_IN_CLOUD   →  Probe measurement (isolate cloud quality)
                   Quality escalation (local answer failed checks)
                   Availability fallback target

PREFER_ON_DEVICE →  Comparison baseline (SDK's own routing)
                    Not used by the router (Tandem routes by evidence, not availability)
```

---

## Architecture

```
              Studio (measure)                        Notes (use)
     Probe → Frontier → Policy → Atlas         summarise · rewrite · extract · translate · ask
          │          │        │                              │
    @tandem/bench  @tandem/policy ──── Remote Config ───► @tandem/router ── receipts (SHA-256 chain)
     (tasks,        (Wilson, rule,      tandem_policy_v1     │  Guard → policy → dispatch → validate
      validators,    diff, export)      (real-time)          │  → escalate? → rehydrate → receipt
      runner)                                                ▼
                                          @tandem/ai  (only importer of firebase/ai)
                                     ONLY_ON_DEVICE ─► Gemini Nano (Chrome Prompt API)
                                     ONLY_IN_CLOUD  ─► gemini-3.5-flash-lite (App Check)
     @tandem/guard = Tandem Guard: detect · redact · leak-verify · rehydrate
```

### Data Flow: A Single Router Request

```
1. Developer calls tandem.run({ task: 'summarize', input: note })
2. Guard scans the input for sensitive identifiers
   ├── Found? Route on-device (or block if model unavailable + no consent)
   └── Clean? Continue to policy lookup
3. Policy lookup: find the rule for (task_type, input_length)
   ├── local-first? Try on-device first
   └── cloud-first? Go straight to cloud
4. If local-first: run on-device, validate the answer
   ├── Passed? Return with receipt (route: LOCAL)
   └── Failed? Log quality escalation, re-run in cloud
5. Cloud answer: validate, return with receipt (route: CLOUD or CLOUD_REDACTED)
6. Receipt is hash-chained to the previous receipt (SHA-256)
7. Receipt includes: route, servedBy, why, validator results, timing, token counts
```

---

## Package Deep Dive

### `packages/tandem-guard` — The Privacy Layer

Tandem Guard is a deterministic (no-model) identifier detector and redactor for Indian personal data. It runs before any model call and enforces privacy as a routing constraint.

**Detected identifier types:**
- **Aadhaar** — 12-digit with Verhoeff checksum validation, handles Indic digits (Devanagari, Tamil, etc.), spacing, zero-width characters
- **PAN** — 10-character alphanumeric (ABCDE1234F pattern) with structure validation
- **GSTIN** — 15-character with check digit
- **IFSC** — 11-character bank branch code
- **UPI ID** — `name@bank` pattern with known PSP handles
- **Bank account** — Contextual detection (requires anchoring words to avoid false positives)
- **Indian mobile** — +91 / 0-prefixed 10-digit with carrier-range validation
- **Passport, Voter ID, Driving licence, Vehicle number** — Pattern-matched with format validation

**Adversarial robustness (Guard Lab):**
- 263-case corpus with disguise techniques: Indic digit substitution, fullwidth characters, Cyrillic lookalikes, strategic spacing, zero-width joiners, base64 encoding, mixed scripts
- Independent oracle validates each detection
- Result: 259 caught, 2 blocked (input too obfuscated to safely process), 2 missed
- The 2 misses are documented: unlabelled bare account numbers with no contextual anchor

**Redaction and rehydration:**
```
Input:  "My PAN is BQKPS4821L and Aadhaar 4712 0938 5618"
Redacted: "My PAN is [PAN_1] and Aadhaar [AADHAAR_1]"
Cloud processes the redacted version.
Rehydrated: "My PAN is BQKPS4821L and Aadhaar 4712 0938 5618"
```

The leak verifier runs after rehydration to confirm no identifier leaked through the model's output.

### `packages/tandem-bench` — The Measurement Engine

Defines synthetic task batteries across 8 task types (classify, extract, instruction, json_reliability, qa, rewrite, summarize, translate) × 3 input lengths (short, medium, long). Each task includes:

- A prompt template with synthetic (never real) data
- One or more deterministic validators:
  - **Schema validator** — JSON output matches a declared schema
  - **Facts validator** — required facts present in the output
  - **Length validator** — output within min/max token bounds
  - **Refusal validator** — model did not refuse the task
  - **Format validator** — output matches a structural pattern (bullets, numbered list, etc.)

The runner executes each task on both inference modes, streams the response (measuring time-to-first-token and tokens-per-second), runs all validators, and records the full result with timing metadata.

### `packages/tandem-policy` — The Policy Compiler

Takes calibration probe results and compiles a routing policy. A task-type + input-length combination goes local-first only when **all four checks pass**:

1. **Sample size** — at least 8 distinct tasks measured (avoid small-sample noise)
2. **Quality floor** — Wilson 95% lower bound of on-device pass rate ≥ 75%
3. **Tolerance** — on-device pass rate within 5 percentage points of cloud
4. **Latency budget** — on-device p95 answer time ≤ the developer's budget (default: 8 s)

Wilson interval was chosen over raw pass rate because it handles small samples correctly — with 12/12 passes, the 95% lower bound is 76%, not 100%. The thresholds were fixed in `docs/POLICY_RULE.md` before any measurement data existed, preventing threshold-shopping.

**Policy diff:** when a new probe runs, the compiler shows what changed from the previous policy — which rules flipped, which thresholds moved, what the evidence delta is.

**Export:** the compiled policy is a JSON structure that ships through Firebase Remote Config as `tandem_policy_v1`. The router reads it with `onConfigUpdate` for real-time swaps without redeployment.

### `packages/tandem-router` — The Runtime Router

The router is the runtime component that reads the compiled policy and makes routing decisions for every request. Its pipeline:

```
Guard scan → Policy lookup → Dispatch (local or cloud) → Validate → Escalate? → Rehydrate → Receipt
```

**Key behaviours:**
- **Guard-forced routing:** if Guard detects sensitive identifiers, the request goes on-device regardless of the policy. If the local model is unavailable, the input is redacted before cloud dispatch (with consent) or blocked.
- **Quality escalation:** if the local model's answer fails a validator, the router re-dispatches to the cloud. The receipt records both the failed local attempt and the successful cloud answer, with `qualityEscalation.happened: true`.
- **Availability fallback:** if the local model is unavailable (not downloaded, unsupported browser), the router falls back to cloud. The receipt records `availabilityFallback: true` with the reason.
- **Receipt chaining:** every receipt includes a SHA-256 hash of the previous receipt, forming a verifiable chain.

### `packages/tandem-ai` — Firebase AI Logic Wrapper

The only package that imports `firebase/ai`. Provides typed wrappers around the three inference modes, streams responses, extracts `inferenceSource` and `usageMetadata`, and measures timing. All other packages go through this layer — no package calls Firebase AI Logic directly.

### `packages/spec` — JSON Schemas

Shared TypeScript types and JSON schemas for tasks, probe results, policy rules, and receipts. Used by the bench, policy compiler, and router for type-safe data exchange.

---

## The Receipt Chain

Every router request produces a receipt: a JSON object that records the routing decision and its evidence.

```json
{
  "id": "r-1732710234-001",
  "task": "summarize",
  "route": "LOCAL",
  "servedBy": "on_device",
  "why": "policy local-first: summarize/M (Wilson LB 76%, p95 12.2 s ≤ 30 s budget)",
  "guard": { "sensitive": false },
  "validators": { "length": "pass", "refusal": "pass" },
  "timing": { "firstToken": 1400, "total": 12200 },
  "tokens": { "input": 142, "output": 67 },
  "prevHash": "a3f8c1d2e4b5...",
  "hash": "7e9f0a1b2c3d..."
}
```

**Tamper test:** the Studio receipts screen includes a tamper test that modifies a receipt and shows the chain break. The SHA-256 hash chain is computed in-browser using WebCrypto.

---

## Judge Quick Start (no sign-in, no tokens)

1. Open [tandem-hybrid.web.app](https://tandem-hybrid.web.app) → **Open Tandem Studio**.
2. **Device check** shows whether your Chrome can run Gemini Nano. If it can't, nothing breaks: you get the honest status and how to enable it.
3. **Probe → Quick** (about 2 minutes with Nano on a laptop GPU): two lanes race 12 synthetic tasks.
4. **Frontier / Policy**: explore your run, or the labelled **Reference run** from the author's laptop. Click any rule for its evidence.
5. **Notes** (`/notes/`): pick a sample note, run Summarise / Extract tasks / Translate. Each result shows its route badge and why.
6. **Receipts**: verify the SHA-256 chain, then run the tamper test. **Guard Lab**: watch the adversarial corpus attack the redactor.
7. **Atlas**: optionally add your device.

Claim → evidence map: [`docs/JUDGE_MAP.md`](docs/JUDGE_MAP.md).

---

## Who It Is For

- **Developers on Firebase AI Logic** (primary): a measured answer to "which of my prompts are safe to run locally?", plus a deployable policy, instead of over-spending on cloud or shipping bad local answers.
- **End users of those apps**: free, instant, private AI for routine tasks; cloud strength only when needed.
- **Concrete scenario:** an Indian freelancer or student with tax notes and client invoices on a laptop with patchy internet. Notes work offline; sensitive notes never leave; hard tasks escalate with identifiers redacted.

---

## Build and Run

### Prerequisites

- **Node.js 22+** and **pnpm 10+**
- **Chrome 139+** desktop for on-device AI (not required for cloud-only or Guard features)
- Java (for Firestore emulator tests only)

### Quick Start

```bash
pnpm install
pnpm test            # Guard, policy (incl. property tests), bench, router
pnpm build           # packages + Studio + Notes
cp apps/web/.env.example apps/web/.env.local   # your Firebase web config (public identifiers)
pnpm dev:web         # http://localhost:5173 (App Check runs in debug mode in dev)
```

### Measurement Pipeline

```bash
# Run the probe (needs Chrome with Gemini Nano)
node eval/harness/probe.mjs --split calibration --out eval/results/probe-calibration.json
node eval/harness/probe.mjs --split heldout --out eval/results/probe-heldout.json

# Validate the policy against held-out data
node eval/policy-validation.mjs eval/results/probe-calibration.json eval/results/probe-heldout.json

# Build landing page results from measurement files
node eval/build-results.mjs
```

### Firestore Rules Tests

```bash
npx firebase-tools emulators:exec \
  --only firestore \
  --project demo-tandem \
  "node --test firebase/rules.test.mjs"
```

### Deploy

```bash
pnpm build
npx firebase-tools deploy --only hosting,firestore:rules
```

---

## Repository Map

```
tandem/
├── packages/
│   ├── spec/              # Shared JSON schemas and TypeScript types
│   ├── tandem-guard/      # Privacy: detect, redact, leak-verify, rehydrate
│   ├── tandem-ai/         # Firebase AI Logic wrapper (sole importer of firebase/ai)
│   ├── tandem-bench/      # Task batteries, validators, measurement runner
│   ├── tandem-policy/     # Wilson intervals, rule compiler, diff, Remote Config export
│   └── tandem-router/     # Runtime: Guard → policy → dispatch → validate → receipt
├── apps/
│   └── web/               # Tandem Studio + Tandem Notes (Vite + TypeScript)
│       ├── src/
│       │   ├── main.ts         # Studio: SPA router, navigation, screen loader
│       │   ├── landing.ts      # Landing page: scroll reveals, counters, interactions
│       │   ├── screens/        # Studio screens: device, probe, frontier, policy, atlas, guard, receipts
│       │   ├── notes/          # Tandem Notes: local-first notes app on the router
│       │   ├── services/       # Firebase init, Tandem service singleton
│       │   └── ui/             # Shared components, icons, DOM helpers
│       ├── public/
│       │   └── landing.css     # Landing page styles (brand tokens, scroll reveals, app frames)
│       └── index.html          # Landing page (GEN markers filled by build-results.mjs)
├── eval/
│   ├── build-results.mjs       # Single source of truth: reads JSONL, writes README + landing blocks
│   ├── policy-validation.mjs   # Held-out policy replay
│   ├── harness/                # Playwright CDP measurement harness
│   └── results/                # Raw measurement data (committed, not generated)
├── firebase/
│   ├── firestore.rules         # Security rules with field whitelists
│   ├── rules.test.mjs          # Emulator tests for Firestore rules
│   └── remoteconfig.template.json  # Remote Config template with tandem_policy_v1
├── docs/
│   ├── AUDIT.md                # Engineering audit of the Guard (108 leaks → 2)
│   ├── POLICY_RULE.md          # Pre-registered policy thresholds
│   ├── JUDGE_MAP.md            # Claim → evidence map for judges
│   └── DEMO_SCRIPT.md         # 3-minute demo walkthrough
└── README.md                   # This file
```

---

## Limitations (stated plainly)

- **Single-device measurements.** On-device numbers come from one laptop (Intel i5-1334U, Iris Xe, 16 GB). Other devices will differ — that is what the Atlas is for.
- **Deterministic validators, not human judges.** Validators catch broken JSON, missing facts, length violations and refusals. They cannot catch a fluent but unfaithful summary. They are quality proxies, not quality itself.
- **Limited translation coverage.** Gemini Nano officially declares output languages de/en/es/fr/ja. Tandem measures Indian-language translation (Hindi, Tamil) rather than assuming it works, and the results show it: 33% pass rate for translate tasks on-device.
- **Guard is deterministic, not omniscient.** Unlabelled names and unanchored account numbers with no context can be missed (see Guard Lab). The Guard makes no claim of zero leakage.
- **Cost figures are estimates.** Cloud cost projections use editable Remote Config price constants, not a quote from Google.
- **Atlas is self-selected.** Contributors choose to participate; the sample is not representative.
- **Synthetic data only.** All task inputs are synthetic. No real identifiers, no compliance claims, no fabricated endorsements.
- **India's DPDP Act.** Tandem is designed around data-minimisation principles. It makes no compliance or certification claim and gives no legal, medical or financial advice.
- **Spark plan constraints.** No server-side logic, no Cloud Functions. Everything is client-side.

---

## What Was Built During the Submission Period (11–30 Nov 2026)

All of this project was written between 22 and 30 Nov 2026, inside the submission period.

- **First (22–25 Nov):** the privacy core that is now **Tandem Guard** (`packages/tandem-guard`): Indian identifier detectors (Aadhaar with Verhoeff, PAN, GSTIN, IFSC, UPI, phone, passport, voter ID, driving licence), redaction and rehydration, a leak verifier, Guard benchmarks.

- **Then (26 Nov onward), Tandem:** an engineering audit of that core ([`docs/AUDIT.md`](docs/AUDIT.md)) that replaced a fake "SHA-256" ledger hash with real SHA-256 and drove the Guard Lab fixes (108 leaks → 2 on a 263-case corpus); `@tandem/policy`, `@tandem/bench`, `@tandem/ai`, `@tandem/router`; Tandem Studio and Tandem Notes; Firestore rules with emulator tests, Remote Config, App Check and Hosting; the on-device proof (Gate A); probe measurements and the held-out validation.

**Pre-existing code disclosure:** no code predates the submission period. Open-source dependencies are listed in the package manifests (Firebase JS SDK, Vite, TypeScript, @fontsource fonts, Playwright for the measurement harness). AI coding assistants were used during development; design decisions, measurements and every claim were checked against the code and the committed result files.

---

## Licence

```
Copyright 2026 Tandem Authors

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
```

Firebase, Gemini and Chrome are trademarks of Google LLC.
