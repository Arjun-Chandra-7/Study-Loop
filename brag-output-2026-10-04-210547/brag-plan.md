# Brag Plan: StudyLoop (light teaser)

## What is this app?
A study wristband (two EDA electrodes + an optical pulse sensor) and a web app: it learns your
resting baseline in twenty still seconds, watches heart rate and skin conductance against it while
you study, and slows and softens your music when stress climbs. Source: `feature/study-music-stems`
(`src/components/landing/*`, `views/*`, `public/media/campaign/*`).

## The angle
**The daylight spec sheet.** Teasers 1 and 2 were night films (dark room, cyan glow). This one is
the same product printed on warm paper: an editorial product manual in ink, sage and terracotta.
The exploded band is annotated like a technical drawing, the stress response is drawn like a pen
plotter on graph paper, and the only dark thing on screen is a night campaign photo pinned to the
page as a print. The site's own hero line carries the film:
*"A band that feels stress. / Music that answers it."*

Claims guardrails: heart rate and skin conductance only, measured against your own baseline, never
a focus or stress score; no brainwaves, no EEG, no strict mode or group study. Session numbers are
fictional sample values. No real user names.

## Hook (first 2-3 seconds)
Blank warm paper with a faint registration grid. In big ink Mona Sans (wide):
**"A band that feels stress."** sets in word by word. On the next bar, in terracotta, under it:
**"Music that answers it."** Both hold together until 3.27 s.

## Key moments (the middle)
- **Inside the band (technical drawing):** the exploded band (`exploded.webp`, transparent) starts
  assembled, then separates layer by layer on the beat. Hairline ink leader lines draw out to four
  labels, every other beat: Status light / Pulse sensor / EDA electrodes / One button, each with
  a one-line spec from the site.
- **Baseline (light UI):** a recreated app card, "Capturing baseline", ring sweeps 0:20 → 0:00,
  then locks to *Your baseline · HR 68 bpm · EDA 2.4 µS*. Line: *"Twenty still seconds. The band
  learns what normal looks like today."*
- **The answer (centerpiece):** graph paper. A pen-plotter EDA trace draws left to right through
  a sage baseline band; it climbs out, the state badge steps Stable → Changing → Elevated, and the
  Loop card beside it glides its tempo 92 → 75 bpm. The trace settles back, badge → Recovering.
  Caption: *"When stress climbs, your music slows and softens with you."*
- **The print:** a dark night campaign photo (`review.webp`, laptop showing the dashboard)
  drops onto the paper as a pinned print; beside it the review line and three stat chips.

## Outro / punchline
The page clears to paper; the StudyLoop logo stamps on like a sticker (beat-locked 22.37 s), with
*"Focus, measured differently."* under it in ink.

## User flow worth showing
Wear the band → 20 s baseline → stress climbs, music slows → review where signals moved.

## Tone
- Preset: polished
- Creative direction: daylight product manual — warm paper, ink type, technical-drawing annotations
- Interpretation: calm confidence; slow-in / long-hold reveals, hairline lines that draw rather
  than fly, soft slides and crossfades; energy comes from the beat-timed sequencing, not from flash.

## Format: landscape — 1920x1080
## Duration: 24.6 s

## Visual identity (from the project, inverted to light)
- Paper (bg): #F4EFE4 · deeper paper / card wells: #ECE6D9 (site `--ivory`) · card: #FBF8F2
- Ink (text): #12110F (site `--ink-900`) · ink-2: #4A463F · muted: #8A8376 (site `--text-3`)
- Measured / sage: #9DBA8E fills (site `--m-500`), deepened to #4F6B43 for lines/text on paper
- Action / terracotta: #CF4F33 (site `--a-500`), hi #E58A6F
- Status-light cyan (from photos), used only on the band light: #3FC7E6
- Font: Mona Sans VF (site's only family) — width 125% for display, 75% for condensed labels
- Strongest visual element: the exploded band; the logo badge; the state badge

## Share copy (draft)
StudyLoop, in daylight: a band that feels stress, and music that answers it. Twenty still seconds to
learn your baseline, then your beats slow and soften when you tense up.

## Audio direction
- Role: warm bed with sparse, precise accents (polished)
- Music: `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (110 BPM, steady and clean)
- Music treatment: fade in over 0.5 s, bed ~0.32, fade out over the final 1.4 s
- Music cue guidance: preset read. Beat grid ~0.545 s. Strong-cue locks: **8.74 s** (baseline card
  arrives), **17.47 s** (print drops), **22.37 s** (logo stamp). Anatomy labels on every other beat:
  4.39 / 5.34 / 6.00 / 6.56. State badge steps: 12.40 / 14.20 / 15.29 (Elevated) / 16.38.
- Audio-reactive treatment: subtle; music RMS breathes the band's cyan status-light glow and a soft
  warm vignette on the paper. No waveform/equalizer visuals.
- SFX posture: sparse — soft drop on each label, a light tick as the baseline locks, a pen-like
  card slide for the print, a soft bell on the logo stamp.
- Restraint rule: nothing on the hook words; never louder than the bed except the logo bell.

## Storyboard

### Scene 1 — Hook — 0.00–3.27 s
Paper + grid. "A band that feels stress." sets in word by word (0.3–1.2 s), "Music that answers it."
in terracotta at 1.64 s. Both hold ≥1.6 s.
Sequential/interaction: yes — two lines in sequence. Audio intent: quiet, open.
Transition mood: soft — headline slides up and out as the band drops in.

### Scene 2 — Inside the band — 3.27–8.74 s
Kicker "Inside the band". The exploded band arrives assembled at centre, separates into layers,
cyan status light breathes. Labels with leader lines land at 4.39 / 5.34 / 6.00 / 6.56 and hold to 8.45:
- Status light — "Breathes during baseline."
- Pulse sensor — "Reads your pulse."
- EDA electrodes — "Read skin conductance."
- One button — "Press to mark a moment."
Sequential/interaction: yes — short subs so the full set of 4 holds together ~1.9 s at the end.
Audio-coupled: soft drop per label. Transition: soft slide → 3.

### Scene 3 — Baseline — 8.74–12.02 s (beat-locked 8.74)
Recreated light app card: "Capturing baseline", ring sweep 0:20 → 0:00 (compressed), lock state
"Your baseline · HR 68 bpm · EDA 2.4 µS" with sage check. Line left of card holds whole scene.
Audio-coupled: light tick when baseline locks. Transition: card slides left, graph paper in.

### Scene 4 — The answer — 12.02–17.47 s
Graph-paper panel with the sage baseline band; EDA trace plots left→right. Badge steps
Stable → Changing → Elevated (terracotta) → Recovering on the grid. Loop card "Now playing ·
Lo-fi groove" tempo readout glides 92 → 75 bpm while Elevated, label "Slower and softer". Caption
holds ≥3 s. Audio-coupled: switch tick on Elevated only. Transition: paper slide → 5.

### Scene 5 — The print — 17.47–21.84 s (beat-locked 17.47)
`review.webp` drops onto the paper as a pinned print, slight tilt, soft shadow. Right: "Review"
kicker, line *"See where your signals moved away from baseline."*, three chips arrive:
74% near baseline · 3 elevated moments · 2 marks (fictional sample). Hold ≥1.3 s after last chip.
Audio-coupled: card slide on the print. Transition: everything lifts off → 6.

### Scene 6 — Logo — 21.84–24.60 s (beat-locked 22.37)
Paper only. Logo badge stamps in, tagline "Focus, measured differently." holds ≥1.5 s.
Audio: soft bell on the stamp; music fades.

**Music mood:** steady, warm, clean
**Audio summary:** a steady bed under a calm paper film, with small drops/ticks on the annotations and a
single bell when the logo stamps.
