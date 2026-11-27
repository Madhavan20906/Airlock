# Judge map

Every claim, with the evidence and where to see it. Live app: https://tandem-hybrid.web.app · Repo: this repository · Video timestamps refer to `docs/DEMO_SCRIPT.md`.

| Criterion | Claim | Evidence | Where |
|---|---|---|---|
| **Technological implementation** | Firebase AI Logic hybrid is imported and called with an explicit `InferenceMode` per call | `runOnDevice` → `ONLY_ON_DEVICE`, `runInCloud` → `ONLY_IN_CLOUD`, `runPrefer` → `PREFER_ON_DEVICE`; streaming for TTFT | `packages/tandem-ai/src/index.ts` (class `TandemAI`) · video 0:12 |
| | `servedBy` is reported by the SDK, never assumed | reads `response.inferenceSource`; marks `servedBySource: 'mode'` only for unambiguous `ONLY_*` modes | `packages/tandem-ai/src/index.ts` · Device check → airplane-mode proof |
| | On-device inference really runs, also offline | Gate A: `inferenceSource: "on_device"` online and with the network disabled | `eval/results/gate-a-2026-11-26.json`, `eval/gate-a.mjs` |
| | Availability fallback and quality escalation are different, and recorded separately | router sets `availabilityFallback` vs `qualityEscalation`; test "quality escalation and availability fallback are recorded differently" | `packages/tandem-router/src/index.ts`, `packages/tandem-router/test/router.test.ts` |
| | Policy compiler with statistical evidence | Wilson bounds, majority-vote repeats, pooling, `insufficient_evidence`; monotonicity property tests; thresholds fixed before data | `packages/tandem-policy`, `docs/POLICY_RULE.md` |
| | Held-out validation | policy compiled on calibration split only, replayed on held-out measurements vs all-cloud / all-local | `eval/policy-validation.mjs`, `eval/results/policy-validation-*.json` |
| | Remote Config policy swap, live | `tandem_policy_v1` + kill switches, `onConfigUpdate` real-time listener, schema-validated, fail closed | `apps/web/src/services/firebase.ts`, `firebase/remoteconfig.template.json` · video 2:15 |
| | App Check, Auth, Firestore rules tested | reCAPTCHA v3 provider; anonymous Auth; metadata-only rules with emulator tests (cross-user denied, content fields denied, Atlas write-once) | `firebase/firestore.rules`, `firebase/rules.test.mjs`, CI job `firestore-rules` |
| | Privacy guard tested at the dispatch boundary | test asserts no raw Aadhaar/PAN in the exact payload handed to the cloud call | `packages/tandem-router/test/router.test.ts` ("LEAK TEST") |
| | Tamper-evident receipts | SHA-256 over key-sorted JSON, chained; verify + tamper test | `packages/tandem-router/src/index.ts`, Studio → Receipts |
| | CI | build, typecheck, 76+ unit/property tests, Guard benchmarks, eval smoke, rules tests | `.github/workflows/ci.yml` |
| **Design** | A complete product, not a demo | Studio (9 screens) + Notes; every state designed: loading, empty, offline, unavailable, blocked, error | `apps/web/src/screens/*`, `apps/web/src/notes/*` |
| | One coherent system | `docs/DESIGN.md`; route badge and fallback/escalation icons identical in Studio and Notes; two validated signal colours | `apps/web/src/ui/components.ts`, `apps/web/src/styles/app.css` |
| | Accessible and responsive | WCAG AA tokens, keyboard, visible focus, `prefers-reduced-motion`, ARIA live regions, chart table views, 390px layout, light/dark | screenshots in `docs/gallery/` |
| **Potential impact** | Named audience | developers on Firebase AI Logic; end users of their apps; Indian freelancers/students with sensitive notes | README "Who it is for" |
| | Measured, not claimed | on-device share and quality retained on held-out tasks; latency tables with machine stated | `eval/results/`, README "Results" |
| | Live evidence beyond our machine | Hybrid Atlas counts (N shown with date) | Studio → Atlas |
| | Deployable today | 5-line SDK snippet; RC template export | README, Studio → Policy |
| **Quality of the idea** | Measure, don't guess | probe → frontier → policy → Remote Config → router | Overview, video 0:00 |
| | Policy with receipts | every rule opens its evidence | Studio → Policy / Frontier → click any cell |
| | Privacy as a routing axis | Guard decides before measurements do | Notes → "Tax filing checklist" |
| | Atlas turns judges into data | opt-in, anonymous, deletable | Studio → Atlas |
