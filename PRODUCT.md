# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Solo developer building a hackathon entry for #BuildHybridAI 2026 (Firebase AI Logic). The primary audience is hackathon judges evaluating Technological Implementation, Design, Potential Impact, and Quality of Idea (tie-break in that order). Secondary audience: other web developers considering on-device inference who land on the live site or repo.

## Product Purpose

Tandem measures where Gemini Nano is good enough and compiles the results into an evidence-backed routing policy. Every hybrid-AI app hardcodes a guess about what runs on-device vs cloud; Tandem replaces the guess with measurement. Success means a judge can open the live site, understand the thesis in one screen, run the probe on their own Chrome, and see real numbers — not marketing claims.

## Positioning

The only hybrid-AI tool that compiles a routing policy from statistical evidence (Wilson intervals, majority-vote repeats) on the developer's own device, ships it through Firebase Remote Config, and proves every routing decision with hash-chained receipts. Privacy is a routing constraint, not an afterthought: Tandem Guard detects disguised Indian identifiers (Aadhaar, PAN, GSTIN, UPI, IFSC, phone, bank account) even when obfuscated with Indic digits, spacing, Cyrillic lookalikes, or base64.

## Operating Context

- Hackathon submission: deadline Dec 1 2026 03:30 IST. Judges may evaluate only from text, images, and a ≤3 min video.
- Firebase Spark plan (free tier): no Cloud Functions, no Blaze. Client-side only.
- Firebase project `airlock-ai-7dde4` (unchanged from prior work; `.firebaserc` must not change).
- Chrome 139+ required for on-device lane (Gemini Nano). Cloud lane works in any browser.
- Measurement runs on the author's laptop: Intel i5-1334U, Iris Xe integrated GPU, 16 GB RAM, Windows 11.
- Three surfaces: Landing page (`/`), Studio (`/studio/`), Notes (`/notes/`).

## Capabilities and Constraints

**Capabilities:**
- Probe: runs every task type on both lanes (on-device + cloud) with deterministic validators
- Policy compiler: Wilson 95% lower bound, min N=8, quality floor 75%, tolerance 5%, configurable latency budget
- Router SDK: `createTandem().run()` → `{ output, receipt }` with availability fallback and quality escalation tracked separately
- Guard: 263-case adversarial corpus, 261 caught (259 detected + 2 blocked), 2 missed
- Receipts: SHA-256 hash-chained, verifiable in-browser
- Atlas: opt-in anonymous device capability map (Firestore)
- Remote Config live policy swap via `onConfigUpdate`

**Constraints:**
- Spark plan: no server-side logic, no Functions
- On-device inference on Iris Xe is slow (~10 s median vs ~1.3 s cloud); 8 s interactive budget yields 0% on-device; 30 s background budget yields 86% on-device
- Synthetic data only (honesty rule: no real names/companies in samples)
- Cost figures are labelled estimates from Remote Config price constants

## Brand Commitments

- Name: **Tandem** (lowercase in running text, title case in headings)
- Tagline: "measure, don't guess"
- Palette: warm parchment background (#f4f1e8), dark ink (#17191c), amber accent (#b45f06), cloud blue (#2547d0)
- Typography: IBM Plex Sans / IBM Plex Mono
- Icon: amber square with white T-like mark (favicon.svg)
- License: Apache-2.0, attributed "Tandem Authors"
- Trademark line: "Firebase, Gemini and Chrome are trademarks of Google LLC."

## Evidence on Hand

- `eval/results/probe-calibration-2026-11-27.json` — 192 calibration runs (8 task types × 12 tasks × 2 lanes)
- `eval/results/probe-heldout-2026-11-27.json` — 93 held-out validation runs
- `eval/results/policy-validation-2026-11-27.json` — registered + sensitivity policy validation
- `eval/results/gate-a-2026-11-26.json` — Gate A proof (on-device inference confirmed online and offline)
- `eval/results/probe-paired-example-2026-11-27.json` — real paired output from both lanes
- `eval/results/notes-sample-2026-11-27.json` — real Guard blocking on the tax note
- Guard Lab corpus: 263 synthetic cases with independent oracle (`packages/tandem-guard/src/leaklab/corpus.ts`)
- No real user data. No testimonials. No customer logos. All numbers from committed scripts.

## Product Principles

1. **Every number from a committed script.** No hand-typed stats, no cherry-picked runs. The build pipeline regenerates README, landing page, and headline from raw measurement files.
2. **Report negative results.** The 8 s budget yields 0% on-device on this hardware — that's the honest finding, presented as the developer's budget trade-off.
3. **Privacy is a routing constraint.** Sensitive content routes on-device or is blocked, never silently sent to the cloud.
4. **The developer decides the budget; Tandem shows the cost.** The tool measures and presents; it doesn't prescribe.
5. **Synthetic data only.** No real identifiers, no compliance claims, no fabricated endorsements.
