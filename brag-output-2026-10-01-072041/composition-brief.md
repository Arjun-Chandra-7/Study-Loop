# Hyperframes Composition Brief: StudyLoop

## Objective
A 24 s launch-style brag film for StudyLoop: ~80% custom motion graphics, ~20% the real site.

## Output
- Composition directory: `brag-output-2026-10-01-072041/composition/`
- Rendered video: `brag-output-2026-10-01-072041/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 24.5 s

## Source Material
- Project root: repo root (branch based on `worktree-rec-logo`)
- Primary files read: `docs/PROJECT_BRIEF.md`, `docs/DESIGN.md`, `src/app/tokens.css`,
  `src/components/research/bands.ts`, `src/components/ui/Logo.tsx`, cockpit views
- Product name: StudyLoop
- Strongest claim: "read how your body and brain respond while you study, then shape what you
  hear to help you focus"
- Real UI: `assets/ui/home.jpg` (cockpit Home), `assets/ui/insights.jpg` (Insights · sample
  session: Chemistry — Reaction kinetics, 45 min, 78% near baseline). Captured from the local
  dev build at 1920x1080, cropped to the chassis.
- Real brand art: `assets/img/logo.png` (public/media/studyloop-logo.png)
- Copy that must appear verbatim:
  - You sat down to study.
  - Non-lyrical audio, tuned to the band you need.
  - Strict mode. Distractions locked for the session.
  - Every session, analysed.
  - Focus, tuned to you.

## Creative Direction
- Tone preset: cinematic · direction: kinetic motion-design brand film; the logo's pills are the cast
- Angle / hook / outro: see `brag-plan.md`
- Avoid: generic SaaS language, abstract filler, real third-party brand logos, any efficacy claim

## Visual Identity
- Room #060808, surfaces #0b1413 / #122120, teal #14B8A6 / #5FD9CB, logo mint #34EBAA,
  coral #FF5A5A / #FF6B5A, ivory #F4F1EA, muted #B7C4C1
- Fonts (local woff2): Michroma (display), Satoshi 400/500/700 (UI), Instrument Serif italic

## Storyboard
Contract: `brag-plan.md`. Scenes: Hook 0–3.02 · Sweep 3.02–5.52 · Hardware 5.52–9.52 ·
Adaptive audio 9.52–13.52 · Strict mode 13.52–16.02 · Real app 16.02–20.52 · Outro 20.52–24.00

## Audio
- Music: `assets/music/happy-beats-business-moves-vol-1-by-ende-dot-app.mp3`, 0.34, fade out last 1.5 s
- Cues: bundled preset (120.19 BPM, grid x.02 / x.52). Beat-locks: 16.02 (website), 23.02 (logo).
- Audio-reactive: subtle — bass drives room glow + wave amplitude (extract-audio-data.py)
- SFX: chosen after animation, low HF-risk files from the brag SFX library, 0.55–0.8 volume.
