# Tandem policy decision rule

Implemented in `packages/tandem-policy/src/compile.ts` (`decide`, `compilePolicy`). Unit and property tests in `packages/tandem-policy/test/policy.test.ts`.

**These parameters were fixed on 26 Nov 2026, before any probe data existed.** They are not tuned to results. Changing them requires a commit that says why.

| Param | Default | Meaning |
|---|---|---|
| `qualityFloor` | **0.75** | minimum Wilson 95% lower bound of the local pass rate |
| `tolerance` | 0.05 | local pass rate may trail cloud by at most 5 points |
| `latencyBudgetMs` | 8000 | p95 local latency budget |
| `minN` | 8 | minimum distinct tasks behind a decision |
| `z` | 1.96 | 95% Wilson interval |

## Rule
For each (task type, length bucket) cell, choose **LOCAL_FIRST** iff all hold:
1. `n >= minN` distinct tasks with a local result,
2. Wilson lower bound of the local pass rate `>= qualityFloor`,
3. local pass rate `>=` cloud pass rate `- tolerance` (skipped if no cloud data),
4. local p95 latency `<= latencyBudgetMs`.

Otherwise **CLOUD_FIRST**. The compiler never emits `LOCAL_ONLY` from measurements; that route is a privacy decision made by Tandem Guard.

## Counting
- `n` counts **distinct tasks**, not runs. Repeats of one task are collapsed by majority vote (a tie counts as a fail), because repeats of the same prompt are not independent evidence.
- Runs where the backend was **unavailable** or **rate-limited (HTTP 429)** are excluded from quality stats and recorded separately: infrastructure problems are not quality failures. (Added 27 Nov after the first cloud runs hit free-tier rate limits; it changes counting only, not thresholds.)
- **Pooling:** if a cell has fewer than `minN` tasks but its task type has at least `minN` across lengths, the rule uses the type-level pool and is marked `pooled_by_type`. A length bucket with **zero** observations is never filled by pooling (no extrapolating L from S-only data); it stays `insufficient_evidence` and cloud-first.

## Why 0.75 and not 0.90
The original brief suggested 0.90. With 95% Wilson bounds that is unreachable at the sample sizes a judge-runnable probe can produce: 15 of 15 passes gives a lower bound of about 0.80, and 0.90 needs about 35 consecutive passes. A 0.90 floor would make every rule cloud-first regardless of how well the local model does.

0.75 is defensible because **LOCAL_FIRST is not LOCAL_ONLY**: every local answer goes through the task's validators, and a failure escalates to the cloud (a "quality escalation", recorded separately from an "availability fallback"). The floor therefore bounds the expected escalation rate (roughly 25% at worst), which costs latency rather than answer quality, for failures the validators can see. Failures validators cannot see (e.g. a fluent but unfaithful summary) are a stated limitation, measured where possible with the capped cloud judge.

## Guarantees (tested)
- Monotonic: fewer local passes at the same n never produce a riskier route.
- Monotonic: less evidence (smaller n at the same pass rate) never produces a riskier route.
- Invalid policies are rejected (`validatePolicy`), and the router falls back to the built-in conservative default (`defaultPolicy()`: cloud-first everywhere, sensitive content on-device).
