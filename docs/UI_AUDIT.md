# UI audit (Phase 0, before the Field Instrument overhaul)

Captured Sat 28 Nov 2026, evening IST, on `main` at `9742094`, dev server, Chrome via Playwright, Paper/light, 1280×800 and 390×844.
Screenshots: `docs/ui-review/before/<screen>-<width>.jpg` (22 images). On-device model on the capture machine: `unavailable`; cloud: App Check debug token.

## Inventory

| Surface | Entry | Routes / views | Code |
|---|---|---|---|
| Landing | `/` (`index.html`) | single page, kit-based (`public/kit/*`, `landing.css`, `src/landing.ts`) | separate design system: IBM Plex, amber buttons, painterly-landscape hero |
| Studio | `/studio/` | `#/` overview, `start`, `device`, `probe`, `frontier`, `policy`, `atlas`, `receipts`, `guard` | `src/main.ts`, `src/screens/*.ts`, `src/styles/app.css` |
| Notes | `/notes/` | single view, consent dialog | `src/notes/main.ts` |

Shared components (`src/ui/components.ts`): `routeBadge`, `backendBadge`, `fallbackFlag`, `escalationFlag`, `pill`, `stat`, `bar`, `checkChip`, `banner`, `empty`, `evidenceLine`. Evidence drawer: `src/ui/evidence.ts`. Icons: Lucide-geometry set in `src/ui/icons.ts`.

## Cross-cutting findings

1. **Two design systems.** The landing page (centred hero, orange solid buttons, rounded window mock over a painted desert) shares nothing with Studio but the background colour. A judge who lands on `/` and clicks into Studio sees two products.
2. **"Dashboard with cards" everywhere.** Every screen is rounded 16 px cards with soft shadows; KPI tiles in rows of four (Receipts, Guard Lab, Policy savings). Fails rubric (1) by definition.
3. **Signal colours are amber and cobalt**, and amber is also the brand accent (buttons on landing, nav active border, palette highlight, caret). The local/cloud duality is diluted by decoration.
4. **Colour-only state.** Validator chips are green/red; `pill` dots are red/amber/blue; Frontier distinguishes lanes by colour + circle vs square, but the legend and the tape rely on colour.
5. **Icons are stock Lucide geometry** as the primary visual language, including the route badges (chip, cloud, mask, lock).
6. **Generic motion**: card lift on hover, staggered fade-ups, shimmer skeleton, button "glow" on hover, sliding-pill theme toggle.
7. **Theme bug**: Studio stores `tandem-theme-pref`, Notes reads `tandem-theme`, so Notes ignores the chosen theme.
8. **Listener leak**: screens attach listeners to the shared `#view` element on every navigation; after visiting Probe twice, one click fires twice.
9. Console: repeated `403` responses on every Studio load (Firestore/App Check in dev), no UI error state for them.

## Per screen

| Screen | What is generic or weak | Defects |
|---|---|---|
| Overview | Big serif quote, then a card with 16 paired amber/cobalt bars, then a KPI-ish comparison card. The single most important number (Nano passed 94% of 93 unseen tasks) is buried below the fold. | **Hero markup uses typographic quotes as attribute delimiters** (`class=”card hero”`) so the hero section loses its class, layout and spacing; CTAs render as bare underlined links. |
| Judge quick start | Six same-size icon cards in a 3×2 grid; badge legend cards. | — |
| Device check | Two cards side by side; reads as a settings page. | No visual difference between "available" and "unavailable" beyond a title. |
| Probe (hero) | Two tinted cards. No sense of measurement over time: TTFT/tok/s are static numbers. Scoreline is a sentence, not a scoreboard. "Task tape" is a grid of rounded chips. | At 390 px the lanes are below a 300 px control card; the probe's first screen shows no lane at all. |
| Frontier | Card per task type; charts are small and pale. | **Route chip icons render at 100% width** (the `.mult svg { width: 100% }` rule hits the chip icon), giant cloud outlines cover every panel. |
| Policy | Two cards + a table of pills + four KPI tiles for savings. Nothing feels like an artifact you could hand over. | — |
| Atlas | Disclosure card + contribution card + bar cards. | Skeleton shimmer while counts load. |
| Receipts | Four KPI tiles + table. Receipts are rows, not receipts. | — |
| Guard Lab | Four KPI tiles (green/red numerals) + bars + table. | Status colours carry meaning alone. |
| Notes | Competent but plain: textarea in a rounded card, a row of pill buttons, results in a card below the fold. | Result appears below the editor, so the stamp is off-screen at 1280×800 after an action. Theme ignored (finding 7). |
| Landing | Centred SaaS hero, painterly desert, orange CTAs, rounded "app window" mock. | The hero mock shows a fixed "Policy v4" and a blocked result as illustration, unlabelled as such. |

## What to keep

- Content and copy: honest captions, labelled reference run, negative results, the `fallback` vs `escalation` distinction.
- Instrument Serif for display (already self-hosted).
- The data plumbing: `chooseData`, headline JSON, evidence drawer content, every number's source.

## Plan (maps to the brief's phases)

Foundations (tokens, fonts, spine, stamp, palette) → Probe recorder → Notes marginalia + receipt slips → Frontier plate → Policy certificate → Overview / Device / Start → Atlas, Receipts, Guard → landing rebuilt in the same system → motion → verification matrix.
