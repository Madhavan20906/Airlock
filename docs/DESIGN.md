# Tandem design system

**Direction: precision instrument / lab notebook.** Warm paper, a faint measurement grid, an editorial serif for headings and a mono for every number. Calm, numeric-forward, high-trust. Explicitly not a neon "AI" dashboard and not a default component-library look.

Source of truth: `apps/web/src/styles/app.css` (tokens + components), `apps/web/src/ui/components.ts` (signature components), `apps/web/src/ui/icons.ts`.

## The core duality: two signal colours, nothing else
| Meaning | Light | Dark | Used for |
|---|---|---|---|
| **On-device** | `#b45f06` amber (here, warm) | `#d98a26` | badges, left lane, circles in charts, local bars |
| **Cloud** | `#2547d0` cobalt (away, cool) | `#6a86ee` | badges, right lane, squares in charts, cloud bars |

Validated with the dataviz palette validator (`validate_palette.js`): light on `#fffdf7` and dark on `#15181d` both pass lightness band, chroma floor, CVD separation (ΔE ≈ 28–30) and the normal-vision floor, and are ≥ 3:1 against the surface. Identity is never colour-only: circles vs squares in charts, icons on every badge, text labels everywhere.

Status colours (ok `#1e7a46`, bad `#b3261e`, warn `#8a6100`) are reserved for validator checks and banners and always come with an icon and words.

Neutrals: paper `#f4f1e8`, card `#fffdf7`, ink `#17191c`, secondary ink `#4f535a`, rules `#d9d3c3` (dark: `#0f1114`, `#15181d`, `#ede8db`, `#b2ada1`, `#2a2e35`).

## Type
- **Instrument Serif**: page titles, hero line, big numbers (editorial, distinctive).
- **IBM Plex Sans**: UI text. **IBM Plex Mono**: every number, hash, model name, InferenceMode, payload.
- All self-hosted via `@fontsource` so the app renders correctly offline (airplane-mode demo).

## Signature elements (identical in Studio and Notes)
- **Route badge**: On-device (chip icon, amber), Cloud (cloud icon, cobalt), Cloud redacted (outlined cobalt with hatching + mask icon), Blocked (lock, red). `role="img"` with a spelled-out `aria-label`.
- **Why the cloud was used**: *Availability fallback* (unplug icon) vs *Quality escalation* (step-up icon). Never conflated.
- **Lane**: coloured top rule, three mono meters (first token, tokens/s, total), streaming output with caret, validator check chips, pass-rate bar.
- **Held-out comparison**: one row per strategy (Tandem policy, all cloud, all on-device); the Tandem bar is split amber/cobalt by on-device share.
- **Pipeline strip**: Probe → Frontier → Policy → Remote Config → Router → Receipts, each step showing a live fact.
- **Evidence drawer**: rule chip, plain-language why, local vs cloud stat tiles, latency table, and the four decision conditions each ticked or crossed.

## Rules we hold ourselves to
- No kicker or eyebrow label above a heading; headings carry their own weight. Small context goes in a `.meta` line beside or below.
- Monospace only for data: numbers, hashes, model names, InferenceMode values, payloads. Labels are IBM Plex Sans.
- No coloured bar down one side of a rounded box. Lanes carry identity with a tinted header and a tinted border; callouts are tinted blocks.
- No page built from same-size icon cards. The Overview uses a comparison chart, a connected pipeline and a ruled definition list.
- Browser surfaces are themed: selection, caret, scrollbars, focus ring, form accent colour.

## Space, shape, motion
- 4px grid; radius 6 (controls), 10 (inner cards), 16 (cards), 999 (pills).
- Borders first; one soft shadow for cards.
- Motion only with purpose: the route badge "seals" in (520 ms) when a result lands, streaming caret, bars filling. `prefers-reduced-motion` disables all of it.

## Accessibility and layout
- WCAG AA text contrast; visible focus ring; keyboard reachable; ARIA live regions for streaming and scores; every chart has a table view or text equivalent.
- Desktop: left rail + content (max ~1200px). ≤ 860px: top bar + bottom tab bar, single column. Checked at 390px and 1280px, light and dark.
- No emojis in product UI. Plain words; units always shown; every estimate says "estimate".
