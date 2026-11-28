# Tandem design system: Field Instrument

Tandem is a calibration instrument, not a dashboard. It produces measurements, a policy and receipts, so its interface looks like the documents that do the same in the physical world: chart-recorder strips, engraved plotting plates, a certificate of calibration, perforated thermal receipts, specimen labels. Warm paper, ink, two signal inks.

Source of truth: `apps/web/src/styles/app.css` (tokens, base, primitives), `screens.css` (Probe recorder, Overview), `slips-notes.css` (receipt slip, Notes), `plates.css` (Frontier, evidence sheet, certificate, print), `misc.css` (Device, Quick start, Atlas, Receipts, Guard), `landing.css`; glyphs in `src/ui/glyphs.ts`; the stamp in `src/ui/components.ts`.

## Modes
- **Paper** (light, default when the OS is light): warm bone page, ink text.
- **Darkroom** (dark): warm black, not navy. Designed separately: signal inks are lifted, rules darkened, and **receipt slips stay paper-coloured** (a lit slip on a dark bench) so a receipt reads the same in both modes.
- Toggle: rail button, `Alt+D`, command palette. Saved as `tandem-theme-pref` and applied before first paint by `public/theme-init.js` (an external file because the CSP forbids inline scripts). Notes and the landing page share it.

## Colour tokens (WCAG contrast measured, not estimated)

| Token | Paper | Darkroom | Use | Contrast on `--bg` (Paper / Darkroom) |
|---|---|---|---|---|
| `--bg` | `#F2EEE3` | `#0F0D0B` | page | |
| `--surface` | `#E9E3D4` | `#171410` | wells, pressed controls | |
| `--sheet` | `#F7F4EC` | `#14110E` | certificate, consent card, drawers | |
| `--rule` | `#CFC7B4` | `#2E2920` | decorative hairlines and ticks only | |
| `--rule-2` | `#8F8674` | `#6B6252` | control borders (non-text, needs 3:1) | 3.11 / 3.23 |
| `--ink` | `#15120E` | `#EFE9DA` | text | 16.1 / 16.0 |
| `--ink-2` | `#5A5448` | `#A39B88` | secondary text | 6.5 / 7.0 |
| `--ink-3` | `#655E50` | `#8C8473` | meta text, captions | 5.5 / 5.2 (5.0 / 5.0 on surface) |
| `--local` | `#0A5C58` | `#3CC4B8` | ON-DEVICE marks and text | 6.8 / 9.0 |
| `--cloud` | `#E0452B` | `#FF7A57` | CLOUD marks | 3.6 (graphics) / 7.6 |
| `--cloud-text` | `#B3321B` | `#FF7A57` | CLOUD text | 5.35 (4.84 on surface) / 7.6 |
| `--hl` | `#F4D35E` | same | highlighter: evidence, diffs, misses | ink on it 12.7 |

Rules
- Only `--local` and `--cloud` carry the local/cloud duality. They are never used for decoration, success or error. (The first build used vermilion for a decorative strikethrough on the Overview; caught in review and changed to ink.)
- Colour is never the only signal. Local = filled disc, solid pen trace, solid bar. Cloud = ring, dashed pen trace, hatched bar. Every mark also has a word.
- Success and failure use ink, shape and words: validator pass = filled ink box with a tick; fail = hatched box with a cross; pending = dashed. Misses are highlighted (`--hl`), not reddened.
- Paper grain: one inline SVG `feTurbulence` tile behind everything at low opacity; removed under `prefers-reduced-transparency` and `forced-colors`.
- `prefers-contrast: more` collapses secondary inks to `--ink` and hairlines to `--rule-2`.

## Type (self-hosted; zero third-party requests, checked by `pnpm --filter @tandem/studio check:egress`)
- **Display:** Instrument Serif 400 + italic. Titles, scoreboard numerals, hero metric, certificate, signatures.
- **UI:** Schibsted Grotesk variable (400–900). Body 15 px / 1.5.
- **Data:** JetBrains Mono variable, `tabular-nums` wherever a number can change. Labels in caps mono (`.caps`) carry units and sources.
- Latin subsets copied to `public/fonts/` with stable names so the two above-the-fold faces can be preloaded; fallback faces (`Georgia`, `Arial`, `Consolas`) carry `size-adjust` / `ascent-override` to limit swap shift.
- **Indic (Notes):** Noto Sans Devanagari, Tamil, Bengali, Telugu via `@fontsource`, whose `unicode-range` subsets mean the browser fetches a script's file only when that script is on screen. Translation output is marked with `lang` and gets a taller line height (1.75).
- Scale: ratio 1.25 from 15 px (12 · 13.5 · 15 · 18.75 · 23.4 · 29.3 · 45.8 · 57.2), hero numerals `clamp(72px, 10vw, 140px)`. Display numerals tagged `.num` stay in the serif (`plates.css`, last rule).

## Layout
- **Pipeline spine** (left rail): Probe → Frontier → Policy → Deploy → Atlas as numbered nodes on a rule. Node state is derived from stored data, never assumed: *done* (filled), *running* (dashed, rotating), *stale* (hatched: your compiled policy is older than your latest run), *not started* (open). Then "Use it" (Notes, Receipts, Guard Lab) and "Orientation". Below 900 px the spine becomes a bottom bar with the same numbered nodes.
- **Folio with marginalia:** `.folio` = content + 272 px margin column for sources, evidence, captions ("n = 31", "measured on…"). Below 1180 px the margin drops under the content as inline notes.
- **Hairlines, not boxes.** Sections open with a 1 px ink rule (`.sec`). Framed objects (`.plate`) get crop/registration marks. Radii 2–3 px. Shadows only on floating layers (palette, sheets, slips).
- Density: instrument-dense in Probe, Frontier, Receipts; airy in Notes (68ch writing column, ruled paper, 32 px baseline).

## Signature elements
1. **Probe recorder** (`screens/probe.ts`): two lanes with live SVG pen traces of estimated tokens/s (shared y-scale so lanes compare honestly; grid lines sit at absolute seconds so the paper scrolls), a needle to the pen tip, TTFT / tok/s / total readouts, streaming text, stamped validator marks. **The seam** between lanes holds the scoreboard ("Local passed N of M", cloud score, cloud quality retained) with odometer rolls on change. A punched **task tape** below. Unavailable lanes show a hatched strip with a NO SIGNAL label and the reason.
2. **Route stamp** (`routeBadge`): uppercase mono label, -1.5° rotation, double inset rule, ink-press entrance. Silhouettes drawn for Tandem (`glyphs.ts`): disc = on-device, ring = cloud, ring with bars = cloud redacted, hatched square = blocked; plus **availability fallback** (a bridge over a gap) and **quality escalation** (a staircase). Same stamp in Studio, Notes, receipts and the landing page.
3. **Receipt slips** (`ui/receipt.ts`): narrow mono slips with torn edges (CSS conic-gradient teeth, no mask needed), route stamp, why, bytes that left, the payload as sent (Notes, where it is known; the ledger states that receipts store size, not content), prev/hash, Verify. They print with a stepped clip. A tampered receipt gets a broken perforation and a hatched CHAIN BROKEN verdict.
4. **Certificate of Calibration** (`screens/policy.ts`): instrument, data source, date, method, sensitive-content rule, result, "Measured, not guessed.", the 8×3 rule table with evidence per cell, three signature lines, and a SHA-256 fingerprint of the policy (excluding its timestamp). `@media print` renders it alone on white A4; "Certificate PDF" opens the print dialog.
5. **Frontier plates** (`screens/frontier.ts`): engraved grid, log-latency x axis, discs/rings, Wilson whiskers drawn as tolerance marks with caps, dashed quality floor, a rule stamp per plate, a loupe on hover/focus, keyboard-focusable points that open the evidence sheet. A table view is the data alternative.
6. **Highlighter diff:** cells that differ from the live policy get a 240 ms left-to-right `--hl` swipe; a Remote Config update received while the screen is open highlights the moved rules and rolls the version number in the status bar.
7. **Atlas specimen plate:** one pinned disc per real contribution (capped at 30, then "+n"), specimen labels per bucket, a bordered consent card showing the exact record. Nothing is padded; with one device there is one pin.

## Motion
Mechanical, never bouncy. Easing `cubic-bezier(.2,.7,.1,1)`; linear for traces; `steps()` for printing and ticks. Micro 120 ms, standard 200–240 ms, hero ≤ 420 ms. Pen traces and streams update in one `requestAnimationFrame` loop (never a DOM write per token). Frontier points plot in a staggered sweep once per session. Route changes use the View Transitions API when available. `prefers-reduced-motion` turns all of it into instant changes; traces render statically, replay jumps to the end, the scrubber still works.

**Replay:** every probe run is recorded as a timestamped event stream; the lane state is a pure function of it, so the scrubber (drag, or Space to play) reproduces the run exactly.

## Commands
`Ctrl/Cmd+K` palette (Run Quick Probe, toggle Paper/Darkroom, open latest receipt, download certificate, every screen). `Alt+P` quick probe, `Alt+D` mode. Notes: `Alt+S/R/E/T/A` for the five actions.

## Voice
Dry and exact. "Measured on this device." "n 12 · low 76%". "estimate". No exclamation marks, no emojis, no "powered by AI".

## Deviations from the brief, and why
| Brief | Shipped | Reason |
|---|---|---|
| Tokens listed `--rule` for hairlines only | added `--rule-2` for control borders | `--rule` is 1.4:1; input and button borders need 3:1 (WCAG 1.4.11) |
| `--ink-2` as the only secondary text ink | added `--ink-3` (`#655E50`) for meta | needed a quieter tier that still passes 4.5:1 on both `--bg` and `--surface` |
| Geist Mono or JetBrains Mono | JetBrains Mono | tabular figures, wide glyph coverage, one variable file |
| Deploy as a pipeline stage | Deploy is the second half of the Policy screen (`#/deploy` scrolls to it) | publishing is a Remote Config action outside the app; a separate screen would repeat the certificate |
| Atlas caption "N devices measured, date range" | count only | Firestore aggregation queries return counts, not dates; we do not invent a range |
| Receipt slips list "the sanitized payload as sent" | shown in Notes; the ledger says content is not stored | receipts are metadata-only by design (privacy); the payload exists only for the current Notes answer |
| Certificate "Download" | print stylesheet + browser Save as PDF | no PDF library added (bundle budget, zero third-party code paths) |
| Tick sound option | not built | optional in the brief; cut for time |
| `/dev/kit` primitives route | not built | cut for time; every primitive appears on real screens and in `docs/ui-review/` |
