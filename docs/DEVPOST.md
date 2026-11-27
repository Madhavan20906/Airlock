# Devpost submission text (ready to paste)

## Project name
Tandem

## Tagline (≤ 200 chars)
Every hybrid-AI app hardcodes a guess about what runs on-device. Tandem measures it, compiles a policy with evidence, and routes every request through Firebase AI Logic with receipts.

## Platform
Web (Chrome). Only Web is selected.

## Links
- Live app (free, no sign-in): https://tandem-hybrid.web.app · Notes: https://tandem-hybrid.web.app/notes/
- Repository (Apache-2.0): https://github.com/Madhavan20906/Tandem
- Video: <YouTube URL>

## Inspiration
Firebase AI Logic hybrid inference made a hard thing easy: run Gemini Nano in Chrome when it is available, and fall back to the cloud when it is not. But "is a local model available?" is only the first question. Every developer then has to guess which of *their* prompts the local model can handle. The usual guess, "short goes on-device, long goes to the cloud", is hardcoded and never checked. We wanted to replace it with measurement.

## What it does
**Tandem Studio** races identical synthetic tasks on Gemini Nano (`InferenceMode.ONLY_ON_DEVICE`) and in the cloud (`ONLY_IN_CLOUD`), scores every answer with deterministic validators (JSON schema, required facts, length, refusals, script), and shows a **Frontier** of where the local model wins and loses. It compiles the measurements into a **routing policy** in which every rule carries its evidence (n, pass rates, Wilson 95% lower bound, p50/p95 latency), and exports it to **Remote Config**.

**Tandem Router** (SDK) applies that policy at runtime: a privacy guard first, then local-first where the evidence supports it, validation of the local answer, and escalation to the cloud only when a check fails. It records two different reasons to use the cloud: **availability fallback** (the local model could not run) and **quality escalation** (it ran, but the answer failed a check). Every request gets a SHA-256 hash-chained receipt.

**Tandem Notes** is a private, local-first notes app built only on the router: summarise, rewrite, extract tasks, translate, ask your notes. Each result shows where it ran and why, and exactly what (if anything) left the device.

**Hybrid Atlas**: an opt-in, anonymous map of which devices can actually run on-device AI and how fast, built from probe results with Firestore aggregation queries.

## How we used Firebase AI Logic
- `getGenerativeModel` with an explicit `InferenceMode` per call: `ONLY_ON_DEVICE` for the local lane and local-first rules, `ONLY_IN_CLOUD` for the cloud lane and escalations, `PREFER_ON_DEVICE` exposed for comparison. Streaming (`generateContentStream`) for time-to-first-token.
- `response.inferenceSource` is the only source of the "served by" badge. Nothing is assumed or simulated.
- **App Check** (reCAPTCHA v3) protects the AI calls; **anonymous Auth** scopes metadata; **Firestore** stores metadata only (rules enforce field whitelists and are tested in the emulator); **Remote Config** delivers `tandem_policy_v1`, kill switches and price constants, with a real-time listener so a published policy reaches open apps live.

## Who it is for
Developers building on Firebase AI Logic (a measured, deployable answer to "what can run locally?"), the end users of their apps (private, instant AI for routine tasks), and a concrete case: an Indian freelancer or student whose notes contain PAN and Aadhaar numbers. Tandem Guard detects Indian identifiers, even disguised with Indic digits, spacing, lookalike letters or base64, and keeps them on-device, sends a redacted version only with consent, or blocks.

## Results
<paste the Results block from README.md>

## Challenges
- The on-device model crashed on our laptop until we found the cause: no free commit memory because the C: drive was full. We documented the diagnosis rather than working around it.
- Our own audit found that an earlier "SHA-256" ledger was a 32-bit hash repeated to look like SHA-256. We replaced it with real SHA-256 and a test against Node's crypto.
- An adversarial corpus we wrote to attack our own redactor found 108 leaks out of 263 cases. After fixes it finds 2, and we show them.
- Statistically honest thresholds: a 0.90 Wilson floor is unreachable at judge-runnable sample sizes, so we fixed 0.75 before collecting any data and explained why (local-first still escalates on validator failure).

## What we learned
Measuring beats guessing in both directions: on our laptop Gemini Nano handled task types we expected it to fail, and it still produced output in scripts Chrome does not officially declare. The interesting product is not the model call; it is the evidence around it.

## What's next
More task types and validators, a cloud-judge for faithfulness on summaries (capped), more devices in the Atlas, and the policy compiler as a CI step for apps that ship prompts.

## Built during the submission period / existing work
All code was written inside the submission period (22–30 Nov 2026). The privacy core (now Tandem Guard) was written first and Tandem was built on top of it. No code predates the period. AI coding assistants were used during development.

## Testing instructions (no credentials needed)
1. Open https://tandem-hybrid.web.app and click **Judge quick start**.
2. **Device check** tells you whether your Chrome can run Gemini Nano (Chrome 139+ desktop). Without it, every screen still works and the on-device lane explains why it is idle.
3. **Probe → Quick**, then **Frontier** and **Policy** (use **Reference run** if your device has no on-device model).
4. **/notes/**: pick a sample note and run the actions. **Receipts** → Verify chain / Tamper test. **Guard Lab** runs in your browser.
All sample data is synthetic.
