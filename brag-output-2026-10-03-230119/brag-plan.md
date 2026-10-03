# Brag Plan: StudyLoop (teaser)

## What is this app?
A study wristband plus a web app: it captures a 20-second resting baseline, tracks how your heart rate and
skin conductance move against it while you study, and plays original lyric-free beats, made in the style of
your own Spotify playlist, that slow and soften when you're elevated. Source: `PRD.md` v0.3.

## The angle
**"You know how long you sat there. Not how it went."** The PRD's problem statement is the hook. The teaser
then walks the real session loop (baseline → live state → Loops → Insights) using recreated UI from the
current `feature/study-music-stems` branch, in the new Collegiate-track palette. It ends on the logo.

Claims guardrails (PRD A7): the video shows heart rate and skin conductance only, never a focus or stress
score, and no brainwaves. EEG headphones, strict mode and group study are Planned in the PRD and are left out.
Everything shown is Live in the PRD's feature table. Session numbers are fictional sample values.

## Hook (first 2-3 seconds)
A big Michroma timer ticks `00:47:12` on warm carbon. Instrument Serif italic above it:
*"You know how long you sat there."* The timer freezes, and the second line cuts in under it:
*"Not how it went."*

## Key moments (the middle)
- **The band:** the real product render (studyloop-band.png) pushes in, and its status light flares in sage.
  *"StudyLoop reads how your body responds while you study."*
- **Baseline:** recreated card "Capturing baseline · Sit still. Breathe normally." A ring sweeps 20→0 s, then
  locks to *Your baseline* with HR 68 bpm and EDA 2.4 µS.
- **Live state:** recreated cockpit slice with timer, HR and EDA sparklines, and the StateBadge stepping
  **Stable → Changing → Elevated → Recovering**. Caption: *"Measured against you. Never a score."*
- **Loops:** a Spotify link types into "Paste a Spotify playlist, album or song link", a cursor clicks
  **Make beats**, and the card "Your playlist, as study beats" deals out 3 track rows (Lo-fi groove, Dholak groove,
  Boom-bap). When the state flips to Elevated, the tempo readout glides 92 → 75 bpm.
  *"Your playlist, as study beats. They slow down when you tense up."*

## Outro / punchline
Insights (EDA trace against the baseline band, stats counting up: 74% near baseline · 3 elevated moments ·
2 marks) gets wiped by the two logo pills. The real logo lands on the 20.19 s strong cue. Tagline in
Instrument Serif: *"See how you study."* URL: study-loop-alpha.vercel.app.

## User flow worth showing
Pair band → 20 s baseline → live session with state against baseline → Loop adapts → review in Insights.

## Tone
- Preset: cinematic
- Creative direction: quiet-premium teaser; warm, dark and confident
- Interpretation: big type, slow-in/hold beats, short whip transitions; each scene makes one claim and holds it.

## Format: landscape — 1920x1080
## Duration: ~23.5 s

## Visual identity (from the project)
- Background: room #0B0A07, panel #151411, surfaces #181714 / #21201D
- Measured (data): sage #9DBA8E (hi #C3D6B4)
- Action: cinder brick #CF4F33 (hi #E58A6F)
- Text: bone #ECE6D9, muted #B6AE9F
- Display font: Michroma (ASTROZ stand-in) · UI: Satoshi · Editorial: Instrument Serif italic (three fonts max)
- Strongest visual element: the band's status light, the cinder/sage logo pills, the state badge

## Share copy (draft)
StudyLoop: a wristband that learns your resting baseline, shows how your body responds while you study, and
turns your Spotify playlist into lyric-free beats that ease off when you tense up.

## Audio direction
- Role: cinematic support, a warm bed with a few motion-matched accents
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (110 BPM)
- Music treatment: fade in over 0.6 s, sit under the hook, swell into the logo, fade out over the last 1.2 s
- Music cue guidance: preset read. Strong cue **20.19 s** for the logo landing; 15.82 s for the tempo-drop
  moment; beat grid 0.545 s apart (e.g. 9.83, 10.93, 12.02, 13.11 for the state-badge steps, every other beat).
- Audio-reactive treatment: subtle. Music RMS breathes the band's status-light glow and the logo glow.
- SFX posture: sparse (cinematic): soft impact on the reveal, keypress ticks on the pasted link, a click on Make
  beats, light drops for the track rows, a bell on the logo
- Restraint rule: no SFX on every state change; never louder than the bed on the hook

## Storyboard

### Scene 1 — Hook — 0.0–3.0 s
Timer `00:47:12` counting, serif line 1, then line 2. Holds ≥1.2 s each.
Sequential/interaction: yes, two lines in sequence
Audio intent: quiet, a little unresolved · Transition: hard cut → 2

### Scene 2 — The band — 3.0–6.3 s
Band render push-in, sage status-light flare, line: "StudyLoop reads how your body responds while you study."
Audio intent: soft impact on light flare · Transition: whip/slide → 3

### Scene 3 — Baseline — 6.3–9.3 s
Recreated baseline card, ring sweep, locked values. Kicker: "20 seconds of stillness."
Sequential/interaction: ring countdown then two value tiles · Audio: drop on lock · Transition: clean wipe → 4

### Scene 4 — Live state — 9.3–13.1 s
Cockpit slice, badge steps on every other beat, caption holds whole scene.
Sequential/interaction: 4 state steps (~0.9 s each) · Transition: slide → 5

### Scene 5 — Loops — 13.1–17.0 s
Type link, click Make beats, rows deal in, tempo glides 92 → 75 bpm at ~15.8 s with an Elevated chip.
Sequential/interaction: typing + click + 3 rows · Audio: keys, click, drops · Transition: pills wipe → 6

### Scene 6 — Insights — 17.0–20.19 s
EDA trace draws against the baseline band, 3 stats count up and hold.
Audio: light ticks on counts · Transition: pill wipe → 7

### Scene 7 — Logo — 20.19–23.5 s
Logo lands on the beat, tagline + URL hold ~2 s, music fades.

**Music mood:** warm, upbeat-cinematic
**Audio summary:** a soft bed that builds through the session flow and lands the logo on the strongest beat.
