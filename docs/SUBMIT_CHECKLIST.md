# Submission checklist

Tick only with evidence. Owner-only items are marked **(owner)**.

## Stage One (pass/fail)
- [ ] Public repo with detectable open-source licence: `LICENSE` (Apache-2.0); visible in GitHub About **(owner: check About panel)**
- [x] Firebase AI Logic imported AND called at runtime: `packages/tandem-ai/src/index.ts` (`getAI`, `getGenerativeModel`, `generateContentStream`); used by Probe, Device check and Notes
- [ ] Platform selected on Devpost: **Web** only **(owner)**
- [x] Text description ready: `docs/DEVPOST.md`
- [ ] Video: public on YouTube, ≤ 3:00, English captions, real footage **(owner)** — script `docs/DEMO_SCRIPT.md`
- [x] Existing-app summary + "built during the period" + pre-existing code disclosure: README section
- [x] No production keys, debug tokens or PII in repo: `.env.local` gitignored; history scanned (see "Security" below); all data synthetic
- [ ] App free to judges, no sign-in, no tokens: hosted at https://tandem-hybrid.web.app **(needs reCAPTCHA v3 site key in the build for cloud features)**

## Honesty
- [x] No simulated on-device behaviour; `servedBy` from SDK (`inferenceSource`)
- [x] Every number traced to `eval/results/*` (Gate A, probe runs, policy validation, Guard benchmarks)
- [x] Reference run labelled "measured on the author's machine, date, Chrome version"
- [x] Negative results reported (Guard misses, local losses on Frontier)
- [x] No "zero leakage" claims; "N leaks on our M-case corpus"
- [x] Cost figures labelled ESTIMATE with assumptions
- [x] No legal/compliance claims; DPDP referenced only as data-minimisation design principle
- [x] No third-party logos; fictional organisations in all samples

## Firebase safety
- [x] Existing project `airlock-ai-7dde4` unchanged; `.firebaserc` untouched
- [x] Hosting site `tandem-hybrid` added (additive); default site untouched
- [x] `firebase.json`, rules and RC template merged, not overwritten
- [ ] Firestore rules deployed **(after CI rules tests are green)**
- [ ] Remote Config template published (adds parameters only) **(owner confirms in console)**
- [x] Spark plan: no Functions or Blaze-only services

## Quality
- [ ] CI green on the submitted commit (build, tests, benchmarks, eval smoke, rules tests)
- [ ] Fresh-clone test following README only
- [ ] Gallery: 7 screenshots at 1500×1000 + thumbnail in `docs/gallery/`
- [ ] Independent judge pass (subagent) and fixes applied

## Security
- [x] `git log -p` secret scan: no API keys beyond the public web config, no service-account keys, no debug tokens
- [x] CSP and security headers in `firebase.json`
- [x] Receipts, runs and Atlas records contain no content (rules enforce field whitelists)
- [ ] Revoke the dev App Check debug token after judging **(owner)**
