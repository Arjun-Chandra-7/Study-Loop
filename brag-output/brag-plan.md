# Brag Plan: StudyLoop

## What is this app?
StudyLoop is a screenless study wearable (PPG pulse + EDA skin-conductance band) paired with a
"cockpit" session interface: you capture a 20-second baseline, run one subject on one timer, press
the band's single button to mark moments, then review where your heart rate and skin conductance
moved away from your own baseline. It explicitly refuses to show focus scores, stress scores or
brain readings ("Not a mind reader").

## The angle
**One line.** A student's desk is a mess of competing signals: tabs, pings, a clock, a notebook, a
pulse getting faster. StudyLoop's whole visual identity is a *single cyan status line* on the band
("It breathes during baseline, holds while you study, and never asks to be looked at"). The film
turns chaos into that one line, then follows the line through the product: it becomes the signal
trace, the baseline, the live session, the Insights timeline, and finally curls into a **loop** —
the brand name made literal. The product is not shown as a website; it's the place where the line
goes.

Honesty guardrails (from README "Claims policy"): never imply the product blocks notifications,
manages tasks, reads the mind, or scores focus. The chaos is the *problem*; the solution shown is
exactly what's implemented — band measures HR + EDA, 20 s baseline, one subject / one timer,
mark a moment, Insights vs baseline.

## Hook (first 2-3 seconds)
A top-down, stylised 2.5D study desk in StudyLoop's dark "room" palette. The notebook reads
"Physics · Light — Refraction" (the product's real default session). Within two seconds the desk is
invaded: phone pings stack up, browser tabs multiply along the top, the clock hand spins, sticky
notes land — and underneath everything a thin pulse trace runs faster and more jagged. One line of
italic serif: *"Everything pulls at you."*

## Key moments (the middle)
- **The collapse:** on a hard musical cut, every piece of clutter is pulled toward centre, flattens
  to a sliver and fuses into one horizontal line that ignites StudyLoop teal. It breathes once —
  and the camera reveals it is the status light on the real band render.
- **Signals + baseline (animated explainer):** two traces flow out of the band's inner-wrist
  contacts — *Heart rate* and *Skin conductance* — and a dotted baseline draws beneath each as a
  20-second ring fills. "It learns your normal."
- **One subject. One timer. (real UI):** the notebook title from the hook flies in and docks as
  the "Physics / Light — Refraction" header of the real live-session cockpit (44:54, STABLE). The
  band's one button is pressed → a coral flag drops.
- **Hero — Insights (real UI):** the coral flag lands on the real Insights chart. A glowing
  playhead writes the HR and EDA traces left→right over the real screenshot; elevated dots and
  marked-moment flags ping as it passes. Stats read: 45 min · 78% near baseline · 2 elevated · 2
  marked. "See where your signals moved."

## Outro / punchline
The chart's lines lift out of the UI, merge back into the single cyan line, and the line curls into
a closed loop. Kinetic type, verbatim from the site's finale: *"Not a mind reader."* →
*"Study with feedback."* The loop settles into the band's status light; STUDYLOOP wordmark lands
with *"Focus, measured differently."* (the site's title line).

## User flow worth showing
Band on → 20-second baseline → live session (one subject, one timer, STABLE, mark a moment) →
Insights (HR/EDA vs baseline with marked + elevated moments).

## Tone
- Preset: cinematic
- Creative direction: Apple-style product film × startup launch — "one line becomes a loop"
- Interpretation: restrained, confident, few words; big type only where it earns it; motion is
  causal (every element travels somewhere meaningful); real UI framed as a lit object in the
  product's own dark room with floor light, not as browser screenshots.

## Format: landscape — 1920x1080
## Duration: ~28.5 s (user asked for 20–30 s; story needs the room)

## Visual identity (from the project)
- Background / room: #060808 (chassis #0a0d0e, surfaces #0b1413 / #122120)
- Accent (measured energy): teal #14B8A6, light #5FD9CB
- Action / events: coral #FF6B5A
- Text: ivory #F4F1EA, muted #B7C4C1
- Display font: Michroma (ASTROZ stand-in, wide-tracked caps) — "STUDYLOOP"
- Body/UI font: Satoshi 400/500/700
- Editorial font: Instrument Serif italic — taglines
- Strongest visual element: the band's single cyan status light; the Insights HR/EDA chart
- No traffic-light colours; coral = marks/events; teal = measured

## Share copy (draft)
StudyLoop. A screenless band and one quiet session screen — see where your heart rate and skin
conductance moved while you studied. Not a mind reader. Just feedback.

## Audio direction
- Role: cinematic support with a clear 4-act arc
- Music: ORIGINAL score synthesised for this edit (numpy/scipy), 120 BPM, D major family. Bundled
  "Happy Beats" tracks don't fit the tense opening the user asked for.
- Music treatment:
  - 0–4.4 s tense/fragmented: accelerating clock ticks, detuned pulsing drone, dissonant plucks,
    filtered-noise riser into the cut
  - 4.4 s hard cut: sub impact + near-silence, then a warm open pad (the "clear musical shift"),
    heartbeat-like soft thumps as the line breathes; bell on band reveal
  - 7.4–16.5 s confident rhythmic groove (kick, soft hats, bass, pluck arp)
  - 16.5–22.5 s hero: fullest arrangement, big hit on the Insights land
  - 22.5–25.5 s breakdown under "Not a mind reader"; 25.5 s resolution chord + logo bell; tail
- Music cue guidance: the score is authored to the edit, so cues are exact by construction:
  4.4 (collapse), ~6.9 (band reveal), 16.5 (hero land), 25.6 (logo). Beat grid = 0.5 s.
- Audio-reactive treatment: subtle — score RMS/bass drives the room floor-light glow and the
  status-line glow. No visualiser graphics.
- SFX posture: moderate in the chaos (pings, paper, tick), sparse after (button click, flag drop,
  soft whooshes), one logo bell.
- Restraint rule: nothing loud over readable text; no stacked cues after the collapse.

## Storyboard

### Scene 1 — The desk — 0.0–4.4 s (custom animation)
Top-down stylised desk: notebook "Physics · Light — Refraction" with handwritten lines drawing in,
textbook, phone, pen, clock, laptop tab strip. Clutter escalates in waves: phone notifications
stack (generic, fictional), tabs multiply, sticky notes land, the clock's minute hand accelerates,
a pulse trace jitters faster. Camera slowly pushes in. Text: *"Everything pulls at you."* (hold
≥1.4 s).
Sequential/interaction: yes — notifications/tabs/notes arrive one by one, accelerating.
Audio intent: tense, fragmented, accelerating. Audio-coupled: pings on notifications, paper on
sticky notes, tick on clock.
Transition mood: hard → Scene 2

### Scene 2 — One line — 4.4–7.4 s (custom → product asset)
Everything is pulled to centre, flattens and fuses into one horizontal line which ignites teal and
breathes. Pull back: the line is the status light of the real band render; the room light rises.
"STUDYLOOP" wordmark in wide display caps lands at ~6.9 s.
Audio intent: the shift — impact, silence, warm pad, bell on the band reveal.
Transition mood: dramatic/soft → Scene 3

### Scene 3 — It learns your normal — 7.4–11.6 s (custom explainer)
Band small at left. Two traces flow right from the contacts: "HEART RATE" (pulse) and "SKIN
CONDUCTANCE" (slow wave). A 20-second ring fills; dotted baselines draw beneath each trace.
Text: *"It learns your normal."*
Sequential: labels arrive one after another. Audio: groove starts; soft ticks as ring fills.
Transition mood: clean → Scene 4

### Scene 4 — One subject. One timer. — 11.6–16.5 s (real UI)
The notebook title from Scene 1 flies in and docks onto the real live-session UI (floating
chassis in the dark room). Slow push toward 44:54 + STABLE. Text: "One subject. One timer."
Then the band's single button pulses (inset), a coral flag drops.
Interaction: simulated button press → mark. Audio: click + soft drop.
Transition mood: continuous (flag carries across) → Scene 5

### Scene 5 — Hero: Insights — 16.5–22.6 s (real UI)
Flag lands on the real Insights chart. A playhead writes the traces left→right; elevated dots and
marked flags ping as it passes; stats row settles. Text: *"See where your signals moved."*
Audio: biggest hit at 16.5; light pings on markers.
Transition mood: lines lift out → Scene 6

### Scene 6 — Not a mind reader — 22.6–25.6 s (custom)
Chart lines peel off, merge into one line, curl into a loop. Type: "Not a mind reader." →
"Study with feedback."
Audio: breakdown, space. Transition: loop shrinks into status light → Scene 7

### Scene 7 — Brand — 25.6–28.5 s
Band hero, status light glowing, STUDYLOOP wordmark, *"Focus, measured differently."*
Audio: resolution chord + bell; clean tail.

**Music mood for this video:** cinematic → confident
**Audio summary:** a fragmented, ticking opening that cuts to silence and a warm chord when chaos
becomes one line, a steady groove through the product, peak on Insights, and a clean resolve on the
loop and logo.
