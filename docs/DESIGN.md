# STUDYLOOP — Design System & Wireframe Mapping

> Direction: **warm scientific futurism.** A cognitive-performance instrument, not a dashboard.
> Reference: `docs/wireframe-desktop.png` (structurally locked).

---

## 1 · The spatial system in the wireframe

The wireframe is a **single rounded "cockpit" chassis** (≈ 1.53 : 1) sitting in a dark room with a
floor light rising from below. Everything lives *inside* one object — nothing floats free except
two capsules that deliberately break the chassis edge.

```
            ┌──────── top capsule (5 controls) ────────┐   ← straddles top edge
 ┌──────────┴───────────────────────────────────────────┴──┬───────────────┐
 │ (chip)                                                 │ ◦ ━━━━━━  ◦   │ ← capsule in an inverted notch
 │                                                        └───────────────┤
 │                     MAIN PANEL  (≈ 62% of height)                      │
 │                                                                        │
 ├─────────┬─────────┐                                                    │
 │ mini A  │ mini B  │      (main panel continues — L-shaped notch)       │
 │         │         ├──────────────────────┬─────────────────┬───────────┤
 ├─────────┼─────────┤ ┌────┐ title         │ title     (pill)│ title (p) │
 │ mini C  │ mini D  │ │tile│  ◦  ●  ◦      │ ┌─────┐  ──     │  ┌─────┐  │
 │         │         │ └────┘ ───────────   │ └─────┘  ──     │  └─────┘  │
 ├─────────┴─────────┤                      └─────────────────┤ [██████ ] │
 │ ◉ profile pill    │    ( 4 pills + ◦ )  ← bottom nav straddles bottom  │
 └───────────────────┴────────────────────────────────────────────────────┘
```

Observed proportions (wireframe units → implemented grid):

| Column | Wireframe width | Grid track |
|---|---|---|
| Mini column A / B | 77 / 77 | `0.77fr` / `0.77fr` |
| Centre card 1 (player) | 195 | `1.95fr` |
| Centre card 2 (signal) | 169 | `1.69fr` |
| Right vertical card | 129 | `1.29fr` |

Rows: **R1** main panel (flex) · **R2** main continues right / minis A-B left · **R3** centre cards,
minis C-D, right card starts · **R4** profile pill left, right card continues, nav floats between.

Key relationships that are preserved exactly:
- Main panel is **L-shaped**: its lower-left corner is surrendered to the mini-card stack.
- Top-right capsule sits in an **inverted notch** cut into the main panel (concave corners).
- The right card is the **only tall card** in the lower band — it runs past the centre cards to the chassis floor.
- Both capsules **straddle** the chassis edge (half in, half out).
- Uniform inner gutter (8 px) — the chassis reads as one machined object.

One micro-adjustment (alignment, not structure): in the wireframe the first mini row ends ~15 units
below the main panel's bottom edge. They are snapped to a shared row line so the notch edge and the
mini-card edge align. Nothing moves between regions.

## 2 · Content mapping

| Block | Home | Live session |
|---|---|---|
| Top capsule (5) | Band connect · Session play/pause · Research layer · Simulator · Quiet mode | same (controls, not navigation) |
| Top-left chip | STUDYLOOP wordmark + live dot | "REC" state chip |
| Top-right notch | connection dot · battery bar · account | same |
| Main panel | Hero: band render, STUDYLOOP, serif line, CTAs, orb | Timer, state, subject, large orb |
| Mini A | Heart rate (BPM + sparkline) | same |
| Mini B | EDA (Δ vs baseline) | same |
| Mini C | Signal quality (3-bar + label) | same |
| Mini D | Baseline / elapsed | same |
| Profile pill | Avatar · band name · battery | same |
| Centre card 1 | Session player: subject tile · title · ‑5 / play / +5 · block progress | same |
| Centre card 2 | Session signal: EDA vs baseline mini-chart · goal · mode | same |
| Right card | Research layer: 40 Hz (experimental) visual · switch | same (coral) |
| Bottom nav | Home · Session · Insights · Research · Profile(◦) | same |

Main-panel views per nav tab: **Home** (hero) · **Session** (setup → baseline → live → paused → complete) ·
**Insights** (HR/EDA timeline + history) · **Research** (frequency explorer, clearly experimental) ·
**Profile** (band, provider, simulator).

## 3 · Tokens (`src/app/tokens.css`)

- **Space** — 8 px base: `4 8 12 16 24 32 40 48 64 96 128`. (4 and 12 only for icon/label optics.)
- **Radius** — one family: `8` (chips inside cards) · `12` (inner tiles) · `16` (cards) · `20` (main panel) · `28` (chassis) · `999` (pills: tabs, toggles, capsules only).
- **Colour** (semantic):
  - Surfaces (60 %): `--ink-0 #07090A` room · `--ink-1 #0B0D0F` chassis · `--teal-900 #0F2A2A` / `--teal-950 #102524` card material.
  - Energy (teal): `--teal-500 #14B8A6` — measured physiology, baseline, *stable*, connected.
  - Action (coral, 30 % of emphasis): `--coral-500 #FF6B5A` — CTAs, selected, events, research/experimental.
  - Structure (10 %): near-black hairlines + ivory `#F4F1EA` type. Muted `#B7C4C1`.
  - No red/amber/green traffic lights: *elevated* = coral outline + icon + word; *poor signal* = hatched ivory + icon + word.
- **Borders** — hairline `1px rgba(244,241,234,.06–.12)` + inner top highlight.
- **Shadows** — 3 levels (rest / lift / float). Floating capsules only get backdrop blur (max 16 px).
- **Motion** — `--ease-out: cubic-bezier(.2,.8,.2,1)`, springs: `soft {stiffness 170, damping 26}`, `snap {400, 34}`. Durations 120 / 240 / 480 / 900 ms.
- **Grain** — one static SVG noise layer at 4 % over the room.

## 4 · Typography

| Role | Face | Use |
|---|---|---|
| Display | **ASTROZ** (self-hosted slot `public/fonts/Astroz.woff2`, fallback *Michroma*) | STUDYLOOP, section words, timer numerals on landing only |
| UI | **Satoshi** 400/500/700 | Everything functional: nav, labels, metrics, body |
| Editorial | **Instrument Serif** (italic) | taglines, research statements, transitions |

Scale (6 steps, no more): `11 caps-label` · `13 small` · `15 body` · `20 title` · `32 metric/section` · `clamp(48–120) display`.
Timer uses Satoshi tabular numerals at display size — legibility over flourish during a session.

## 5 · Motion language

Motion communicates **state, depth, cause → effect, continuity**.
- **Deserve animation**: nav active pill (layout morph), main-panel view change (opacity + 8 px + blur 4→0), metric number interpolation, orb state interpolation (speed eased, state crossfade), chart line draw on first view, capsule button press (scale .96), card hover lift (−2 px + border brighten), hero parallax (≤ 12 px), landing scroll choreography (ScrollTrigger).
- **Stay quiet**: live values during a session (interpolate, never flash), timer (no ticking animation), sparklines (shift, don't redraw-animate), errors (no shake), anything in Quiet mode. No looping decorative motion except the orb, which is tuned to ≤ 0.6× speed at rest.
- `prefers-reduced-motion` → orb static frame, no parallax, no ScrollTrigger scrub (content revealed statically).

## 6 · Desktop → mobile

Mobile (< 760 px) is a **session-first vertical instrument**, not the grid stacked:
1. header capsule (wordmark · band status) — replaces top capsule + notch
2. **live card** (main panel content; hero collapses to product + one CTA)
3. 2×2 compact metrics (HR · EDA · Signal · Baseline)
4. session player card
5. signal/insights card
6. research card
7. floating bottom nav (fixed), top-capsule controls move into the Profile view.

Tablet (760–1100): chassis keeps its silhouette; right card folds under centre cards; minis become a 4-up row.
Laptop 1280–1440: full cockpit, fluid via `fr` tracks and `clamp()` type. 1440+: chassis caps at 1440 px wide.

## 7 · Eye test (applied)

- **Hierarchy** — Home: STUDYLOOP + band render are loud; everything else ≤ 60 % contrast. Session: timer + state word are loud; hero imagery gone.
- **Spacing** — 8 px inner gutter between cards (one object); 24–32 px inside cards between groups; 8 px within groups.
- **Type** — 6 sizes, 3 weights; caps labels always 11/0.12em.
- **Alignment** — every card uses the same 16 px inset and a shared header row (icon/title left, pill right).
- **Density** — metrics are compact (value + one line of context); no giant empty cards.
- **Colour** — teal = measured, coral = action/research, ivory = text. Nothing else.
- **Consistency** — buttons: 40 px (md) / 32 px (sm), pill radius only for toggles/tabs/capsules; cards radius 16.
- **States** — the current state carries an icon + word + colour, is announced via `aria-live`.
