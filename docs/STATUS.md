# Tandem Status

**Updated:** Fri 27 Nov 2026, afternoon IST · **Submit target:** Mon 30 Nov 12:00 IST · **Freeze:** Sun 29 Nov 18:00 IST

## Done (on `main`)
- **Gate A passed**: Firebase AI Logic `ONLY_ON_DEVICE` → `inferenceSource: on_device`, online and offline (`eval/results/gate-a-2026-11-26.json`).
- **Engine**: `@tandem/policy` (13 tests, 100% lines), `@tandem/bench` (192 tasks, 10 validators, runner), `@tandem/ai` (explicit InferenceMode, streaming, SDK servedBy), `@tandem/router` (fallback vs escalation, Guard, consent, budgets, SHA-256 receipts, leak test).
- **Guard**: real SHA-256 ledger, wire-level egress capture, Guard Lab 263 cases: 108 → 2 misses.
- **Studio** (9 screens) and **Notes** UI on the lab-notebook design system; command palette, 3-way theme, live Guard scanner; PWA shell; validated palette.
- **Firebase**: App Check, anonymous Auth, Firestore metadata rules + emulator tests (`@firebase/rules-unit-testing` 6.0.0), Remote Config params with real-time listener, hosting site `tandem-hybrid` with CSP.
- **Measurement complete**: calibration (192 runs) + held-out (93 runs) + policy validation committed under `eval/results/` with machine label. README results block regenerated from raw files.
- **Gallery**: 7 screenshots + thumbnail committed to `docs/gallery/` (landing, studio overview, probe, frontier, policy, guard lab, notes).
- Docs: README, JUDGE_MAP, DEVPOST, DEMO_SCRIPT, DESIGN, POLICY_RULE, SUBMIT_CHECKLIST.

## In progress
- Nothing blocking submit — all automatable steps done.

## Blocked on owner
1. **reCAPTCHA v3 site key** (public), and `tandem-hybrid.web.app` in that key's allowed domains. Without it the live site's cloud calls are rejected by App Check (on-device, Guard and all screens still work).
2. **Pagefile on D:** (System Properties → Virtual memory → D: system managed) to stop out-of-memory crashes while Nano is loaded. Not required for judges, only for development on this laptop.
3. Video recording, YouTube upload, Devpost form.

## Risks
- Laptop memory: Nano (4 GB) + Chrome + builds exceed commit memory; work is sequenced to avoid it.
- Free-tier cloud quota: probe caps cloud calls (Remote Config `probe_max_cloud_calls`).
