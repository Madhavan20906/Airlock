# Tandem — guide for coding agents

**Pitch (verbatim everywhere):** Every hybrid-AI app hardcodes a guess: "short and simple goes on-device, long and hard goes to the cloud." Tandem replaces the guess with measurement.

Submission for #BuildHybridAI 2026, **Web (Chrome) only**. Never mention mobile.
Deadline: submit by Mon 30 Nov 12:00 IST (hard: Dec 1 03:30 IST). Feature freeze Sun 29 Nov 18:00 IST.

## Layout
- `packages/spec` — JSON schemas + shared test vectors (source of truth between packages)
- `packages/tandem-guard` — **Tandem Guard**: detect/redact/rehydrate, leak oracle + Guard Lab corpus, SHA-256 hash-chained ledger
- `packages/tandem-ai` — the ONLY package that imports `firebase/ai`; capability state, runOnDevice/runInCloud/runPrefer, servedBy from SDK
- `packages/tandem-bench` — synthetic task battery, validators, probe runner
- `packages/tandem-policy` — pure stats (Wilson), frontier, policy compiler, diff, RC export, savings simulator
- `packages/tandem-router` — public SDK `createTandem().run()` → `{ output, receipt }`
- `apps/web` — Tandem Studio (`/`) and Tandem Notes (`/notes/`, built ONLY on @tandem/router)
- `eval/` scripts, `eval/results/` raw JSON (machine, Chrome version, date), `eval/harness/` CDP measurement harness (outputs in gitignored `.measure/`)

## Commands (PowerShell-safe; repo lives on D:, C: is nearly full)
- `pnpm install` (set `npm_config_store_dir=D:\.pnpm-store` if installing)
- `pnpm build` · `pnpm test` · `pnpm eval` · `pnpm eval:heldout`
- `pnpm --filter @tandem/studio dev` → http://localhost:5173 (gate page: `/gate.html`)
- Deploy: `npx firebase-tools deploy --only hosting --project airlock-ai-7dde4` (site `tandem-hybrid`)
- Measurement: see `eval/harness/README.md` (Chrome profile with Nano: `D:/chrome-tandem-profile`; launch with TEMP on D:)

## Firebase (project `airlock-ai-7dde4`, Spark plan)
- NEVER change `.firebaserc`, project/app IDs, or delete/disable anything. Merge, don't overwrite, `firebase.json`, rules, RC template.
- No Cloud Functions / Blaze features. Backend-free: client SDK + Firestore + Remote Config + Hosting.
- App Check is ENFORCED for AI Logic: cloud calls need reCAPTCHA v3 (hosted) or a registered debug token (dev only, never committed).
- Web config lives in `apps/web/.env.local` (gitignored). Never commit keys or tokens.

## Honesty rules (disqualification risk)
- Never fake or emulate on-device. `servedBy` comes from `response.inferenceSource` / the mode actually used.
- Every number in README/Devpost/video/UI comes from a committed script + raw file in `eval/results/` (machine, Chrome version, date).
- Reference runs shown to other devices are labelled "Measured on the author's machine, <date>, Chrome <ver>".
- Report negative results. Say "0 leaks on our N-case corpus", never "zero leakage".
- Synthetic data only. No real names of hospitals/banks/companies in samples. No legal/compliance claims (DPDP: "designed around data-minimisation principles").
- Cost figures are ESTIMATES from Remote Config price constants, labelled with assumptions.

## Conventions
- TypeScript, ESM, Node test runner (`node --test`), tests import from `dist/`.
- Small commits straight to `main` (owner's instruction), only when build + tests are green. Never force-push.
- Commit messages: conventional prefix; end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- UI: no emojis; plain language; every state designed (loading/empty/error/offline/unavailable/rate-limited); WCAG AA; 390px and 1280px; light + dark. See `docs/DESIGN.md`.
- Two signal colours only: ON-DEVICE and CLOUD, plus neutral accent.

## Cut order (cut from the top)
1. (extension already cut) 2. P3 stretch 3. Guard Lab breadth / Indic extras 4. Extra translate languages 5. Ask-my-notes 6. Full Probe repeats (keep n>=2) 7. Savings simulator polish
NEVER cut: real hybrid calls, Quick Probe, policy compiler with evidence, router with escalation, Notes with badges, Remote Config policy swap, Atlas, Judge Quick Start + Reference Run, honest eval, README accuracy, video.
