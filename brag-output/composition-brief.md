# Hyperframes Composition Brief: StudyLoop

## Objective
A ~28.5 s cinematic product film for StudyLoop: original animated story (desk chaos → one line →
signals/baseline → loop) wrapped around real product UI (live session, Insights) and the real band
render. Roughly half custom animation, half real product material. Never a website walkthrough.

## Output
- Composition directory: `brag-output/composition/`
- Rendered video: `brag-output/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 28.5 s

## Source Material
- Project root: repository root (Next.js 16 app)
- Primary files read: README.md, docs/DESIGN.md, src/app/tokens.css, src/app/layout.tsx,
  src/lib/engine.ts, src/lib/sensors/classify.ts, src/components/landing/*, src/components/views/*,
  src/components/cockpit/*
- Product name: StudyLoop
- Tagline / strongest claim: "Focus, measured differently." / "Not a mind reader" / "Study with feedback"
- Key UI to show: live-session cockpit (timer 44:54, STABLE, Physics · Light — Refraction) and
  Insights chart (Chemistry — Reaction kinetics sample: HR + EDA vs baseline, 2 marked, 2 elevated,
  78% near baseline). Captured from the running app at 2x → `composition/assets/ui/`.
- Product asset: `public/media/studyloop-band.png` (band with cyan status light, one button, EDA
  electrodes).
- Copy that must appear verbatim:
  - STUDYLOOP
  - Not a mind reader.
  - Study with feedback.
  - Focus, measured differently.
- Short copy (adapted from product lines): "Everything pulls at you." · "It learns your normal." ·
  "One subject. One timer." · "See where your signals moved."

## Creative Direction
- Tone preset: cinematic; direction: Apple-style product film, "one line becomes a loop"
- Hook: stylised study desk escalating into chaos; pulse trace speeds up
- Outro: line curls into a loop → band status light → wordmark
- Avoid: generic SaaS language, website scroll/browse feel, invented features (no task lists,
  streaks, blocking, focus/stress scores), glitch/spin/whip transitions.

## Visual Identity
- Room #060808, chassis #0a0d0e, surfaces #0b1413/#122120/#183130
- Teal #14B8A6 / #5FD9CB (measured), coral #FF6B5A (events/action), ivory #F4F1EA, muted #B7C4C1
- Fonts: Michroma (display), Satoshi (UI), Instrument Serif italic (editorial) — shipped as local woff2
- Floor light rising from below in a dark room; 4% grain; hairline borders

## Storyboard
See `brag-plan.md` (7 scenes: Desk 0–4.4, One line 4.4–7.4, Normal 7.4–11.6, One subject 11.6–16.5,
Insights 16.5–22.6, Mind reader 22.6–25.6, Brand 25.6–28.5).

## Audio
- Role: cinematic support, 4-act arc; ORIGINAL synthesised score (`assets/music/studyloop-score.wav`)
  authored to the edit at 120 BPM.
- Strong cues: 4.4 collapse, ~6.9 band/wordmark, 16.5 hero land, 25.6 logo.
- Audio-reactive: subtle — score RMS drives floor-light and status-line glow.
- SFX: Kenney CC0 set from the /brag skill + Hyperframes media-use SFX; pings/paper/ticks in the
  chaos, click + drop for the mark, soft hits, logo bell. Chosen after animation exists.

## Hyperframes Instructions
Single standalone `index.html`, one paused GSAP timeline registered as `window.__timelines["main"]`,
seek-safe (seeded PRNG only), local fonts via @font-face, `npx hyperframes check` as the gate.
