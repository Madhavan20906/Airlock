# UI review log (Field Instrument overhaul, 28 Nov 2026)

Captures: `<screen>-<width>-<paper|darkroom>.jpg` (12 screens × 1440/390 × Paper/Darkroom), produced by `matrix.js` against the dev server. `before/` holds the Phase 0 captures referenced by `docs/UI_AUDIT.md`. Extra states: `notes-consent-1500.jpg`, `receipts-ledger-1500.jpg`, `receipts-tamper-1500.jpg`, `certificate-print.jpg`.

Capture machine: on-device model `unavailable`; the cloud lane's App Check debug token is rejected (`exchangeDebugToken` 403), so cloud calls return 401. Every "unavailable" / "no signal" state in these images is real.

## Loop 1 (self-critique)
| Finding | Fix |
|---|---|
| Probe strip labels stretched (SVG scaled non-uniformly) | SVG width now follows the strip's measured width (ResizeObserver) |
| Scoreboard read "of 0" with no local lane | explicit "not run on this device" state |
| Vermilion used for a decorative strikethrough | ink; the two signal inks carry only local/cloud |
| Display numerals fell into the mono face via `.num` | serif restored for display numerals (later revised, see loop 2) |
| Probe with every call unavailable became "your run", emptying Frontier/Policy | runs count as yours only if a lane answered; summary says nothing was measured |
| Unavailable cloud results drawn as failures on the tape | drawn as "not run" |
| Screen CSS loaded via `@import` lost the cascade to base rules | screen stylesheets imported from JS after `app.css` |
| Notes title clipped | title wraps (`field-sizing: content`) |
| Quick start stamp captions squeezed | captions stack under the stamps |

## Independent review (subagent shown only screenshots + rubric)
Scores (overall, 1–5): landing 4.0, overview 4.5, start 3.8, device 4.5, probe 3.8, frontier 3.7, policy 4.0, deploy 3.3, atlas 3.8, receipts 3.3, guard 4.2, notes 3.7.

| Reviewer finding | Disposition |
|---|---|
| Verdicts look contradictory: "low 76%" vs a 75% floor, yet CLOUD-FIRST | **Fixed.** Each certificate cell prints the failing criterion (`× p95 10.3 s > 8.00 s`), Frontier plates say what held them back |
| Deploy said "v1 → v0" and "matches the live rules" | **Fixed.** "identical to the live v0 rules at the 8 s budget: nothing to ship", plus a link to the 30 s view |
| Savings simulator all zeros | **Fixed.** States why (every rule cloud-first at this budget) and offers the 30 s simulation |
| Instrument Serif "1" reads as "l" (v1 → "vl") | **Fixed.** Versions, counts, scores and readouts use light JetBrains Mono numerals |
| Frontier S/M/L labels collide at 100% and clip the frame | **Fixed.** 8% headroom; on-device labels sit under the whisker, cloud labels above-right |
| Landing stamp wraps mid-token | **Fixed** (`nowrap`, ellipsis) |
| Mobile tab bar clipped "Receipts"; Overview overflowed at 390 | **Fixed.** Eight items fit; measured `scrollWidth == clientWidth` on five surfaces |
| Notes toolbar wrapped 4+1 and misaligned with the editor | **Fixed.** One measure for all (68ch differed between 17 px and 15 px faces); shortcuts moved to the caption |
| Scrollbar gutter shift on Receipts | **Fixed** (`scrollbar-gutter: stable`) |
| Scoreboard empty value read as a stray rule | **Fixed.** hatched "not run" label |
| Darkroom viridian too saturated, drifting to neon | **Fixed.** `#5DB3A6` (7.8:1 on Darkroom bg) |
| Atlas JSON wraps keys from values | **Fixed** (no wrap, horizontal scroll) |
| Payoff (stamped answer + receipt) never visible in a still | **Addressed with real data**: `docs/gallery/04-notes.jpg` and `receipts-tamper-1500.jpg` show a real BLOCKED answer, its slip and chain verification. No sample/fake receipts were added (honesty rule) |
| Guard / Receipts four-up tallies feel dashboard-like | Kept: readouts are hairline-ruled with mono labels, not cards; noted for later |

## Checks run
- axe-core 4.10 on 11 surfaces × Paper/Darkroom: after fixes, no critical or serious violations (scrollable regions made focusable; `aria-label` on a role-less div given `role="group"`).
- Contrast: token pairs computed (see `docs/DESIGN.md`); `--ink-3` darkened to pass on `--surface`.
- Egress: `pnpm --filter @tandem/studio check:egress` → 10 pages, no third-party requests.
- Build + 65 package tests green before and after.

## Not done
Lighthouse score, INP and 60 fps profiling were not measured. Keyboard-only walkthrough was partial (palette, Frontier points, ledger rows, drawers with focus trap/return). Colour-blindness simulation not run (shape redundancy is built in: disc/ring, solid/dashed, solid/hatched). 768 and 1920 widths not captured. Probe mid-run and Remote Config live-swap need the owner's machine (Nano + valid App Check).
