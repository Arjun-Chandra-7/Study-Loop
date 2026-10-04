# Hyperframes Composition Brief: StudyLoop (light teaser)

## Objective
A 24.6 s light-themed teaser for StudyLoop: the product as a daylight spec sheet on warm paper.

## Output
- Composition directory: `brag-output-2026-10-04-210547/composition/`
- Rendered video: `brag-output-2026-10-04-210547/brag.mp4`
- Format: landscape — 1920x1080, 30 fps
- Duration: 24.6 s

## Source Material
- Project: StudyLoop, branch `feature/study-music-stems` (latest product work)
- Primary files read: `src/components/landing/{ProductStory,Anatomy,Flow,Finale}.tsx`,
  `src/app/tokens.css`, `src/app/layout.tsx`, `src/components/views/*`, `public/media/campaign/*`
- Strongest claim (site hero): "A band that feels stress. Music that answers it."
- Real assets: `assets/img/exploded.webp` (transparent exploded band), `assets/img/review.webp`
  (night campaign photo, laptop with dashboard), `assets/img/studyloop-logo.png`
- Recreated UI: baseline card ("Capturing baseline", 68 bpm / 2.4 µS), state badge
  (Stable / Changing / Elevated / Recovering), Loop "Now playing" tempo card
- Copy that must appear verbatim:
  - A band that feels stress.
  - Music that answers it.
  - Capturing baseline
  - Twenty still seconds. The band learns what normal looks like today.
  - When stress climbs, your music slows and softens with you.
  - Focus, measured differently.

## Creative Direction
- Tone preset: polished · direction: daylight product manual — warm paper, ink type, technical-drawing annotations
- Angle, hook, outro: see `brag-plan.md`
- Avoid: generic SaaS language, abstract filler, any score/efficacy claim, EEG/brainwaves, dark-room look

## Visual Identity
- Paper #F4EFE4 · ivory well #ECE6D9 · card #FBF8F2 · ink #12110F · ink-2 #4A463F · muted #6B655B (darkened from site #8A8376 for AA)
- Sage #9DBA8E (fills), deep sage #4F6B43 (lines/text) · terracotta #CF4F33 · status cyan #3FC7E6
- Font: Mona Sans VF (local woff2), wide (125%) display, condensed (75%) labels

## Storyboard
Contract: `brag-plan.md`. Hook 0–3.27 · Inside the band 3.27–8.74 · Baseline 8.74–12.02 ·
The answer 12.02–17.47 · The print 17.47–21.84 · Logo 21.84–24.6

## Audio
- Music: `assets/music/happy-beats-business-moves-vol-12-by-ende-dot-app.mp3`, 0.32, fade in 0.5 s, out last 1.4 s
- Cues: bundled preset (109.96 BPM). Beat-locks: 8.74 (baseline), 17.47 (print), 22.37 (logo)
- Audio-reactive: subtle — RMS breathes the cyan status light; bass warms a paper vignette
- SFX: drop_001/002 on labels, click_003 on baseline lock, switch_002 on Elevated,
  card-slide-1 on the print, impactBell_heavy_000 on the logo; 0.45–0.7 volume
