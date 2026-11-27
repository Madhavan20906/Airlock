# Engineering audit

An honest record of what we checked, what was wrong, and what we changed. Every item points to code or a committed result.

## What we audited
The privacy core that became **Tandem Guard** (`packages/tandem-guard`) was written first in the submission period. Before building Tandem on top of it we re-ran everything from a clean clone and checked every claim against code.

| Finding | Severity | Fix | Evidence |
|---|---|---|---|
| The ledger called itself "SHA-256" but used a 32-bit FNV hash repeated four times to look like 64 hex characters | High (a false cryptographic claim) | Real SHA-256 (WebCrypto) over a canonical serialisation of every field; added `policyVersion` | `packages/tandem-guard/src/ledger/event.ts`; test compares against `node:crypto` |
| "Egress inspector" only counted bytes; it did not capture what was sent | Medium | Wraps `fetch` for the duration of a call and records method, URL, exact body bytes and body text | `packages/tandem-guard/src/ledger/egress-observer.ts` |
| "0 leaks" was claimed from a corpus written by the detector author | High | 263-case adversarial corpus with an oracle that shares no code with the detectors | `packages/tandem-guard/src/leaklab/corpus.ts`, `test/leaklab.test.ts` |
| That corpus found **108 of 263** leaks (spaced/hyphenated/line-split IDs, fullwidth digits, Cyrillic lookalikes, spelled-out digits, base64, unknown UPI handles) | High | NFKC + all Unicode digit blocks + homoglyph folding in normalisation; a gap-filling detector for split, spelled-out and base64-wrapped identifiers aligned to token boundaries; generic UPI VPA detection | `packages/tandem-guard/src/redact/normalization.ts`, `redact/detectors/obfuscated.ts`; result: 259 caught, 2 blocked, **2 missed** (bare account numbers inside base64, shown in Guard Lab) |
| Fixes must not trade recall for false positives | Check | Measured before/after on the Guard benchmarks | dev F1 98.4%, held-out precision 94.4% / recall 100% (`pnpm eval`, `pnpm eval:heldout`) |
| A verifier-downgrade path skipped the previous hash, breaking the chain | Medium | Linked correctly | covered by ledger tests |
| The Guard package imported `firebase/ai` directly | Design | All model calls moved to `@tandem/ai`; Guard is model-free | `packages/tandem-ai/src/index.ts` |
| The hosted URL had never been deployed | High | New Hosting site `tandem-hybrid` with CSP and security headers | `firebase.json` |
| On-device inference had never been shown to run | Blocking | Gate A: `ONLY_ON_DEVICE` → `inferenceSource: on_device`, online and offline | `eval/results/gate-a-2026-11-26.json` |

## Things we chose not to claim
- No "zero leakage". We report N leaks on an M-case corpus.
- No compliance or certification claims. India's DPDP Act is referenced only as a data-minimisation design principle.
- No on-device numbers from any machine except the one stated, and every reference number is labelled with machine, Chrome version and date.
- No cost figures that are not labelled estimates.

## Known limitations
See README → Limitations.
