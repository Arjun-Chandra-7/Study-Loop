# Brag Plan: StudyLoop

## What is this app?
StudyLoop is a wristband (MAX30102 PPG pulse sensor) plus brainwave-reading headphones that watch
how your body and brain respond while you study, then play non-lyrical audio tuned to a brainwave
band (gamma, alpha, theta, delta), lock distracting apps away (Strict mode), let you study as a
group, and give you a full analysis afterwards. Source: `docs/PROJECT_BRIEF.md`.

## The angle
**The loop, animated.** The brand's own logo is the cast: a mint pill and a coral pill, a
coral blackletter STUDY and a mint LOOP. The film is ~80% custom motion graphics built from those
shapes and the brief's four-step session (Connect → Baseline → Study → Review), and ~20% the real
StudyLoop cockpit (Home + Insights screenshots from the current site). The pills act as the
"hands" of the film: they sweep away the chaos, wear the hardware, slide across the frequency
bands, lock the phone, and finally carry us into the real app.

User direction: "use animations and other stuff, make it 20% website portion and 80% custom
animations". Website portion = Scene 6 only (4.5 s of 24.5 s ≈ 18%).

Claims guardrails (brief §7): science is framed as what the product *explores* ("tuned to",
"chosen to help you focus"), never as proven effect. A small "Exploratory · not a treatment"
footnote rides on the frequency scene. Spotify mode is in development with licensing risk, so it
is **not** shown. App icons in the strict-mode scene are generic tiles with generic labels, not
real brand logos.

Known copy conflict (not fixed here, flagged to user): the website screenshots still say "EDA
electrodes", while the brief says the band is PPG (MAX30102) and the headphones read brainwaves.
The animated scenes follow the brief; the screenshots are shown as they are.

## Hook (first 2-3 seconds)
Black room. Instrument Serif italic: *"You sat down to study."* Then, on the beat grid,
notification chips pile in around it from every edge: "Reels · 12 new", "Next episode in 5…",
"Group chat · 47 messages", "Shorts", "Ping!" The sentence gets buried. The whole frame shudders.

## Key moments (the middle)
- **The sweep (reveal):** the mint and coral logo pills swing in from opposite corners like
  wipers and scrub the notifications off-frame. The real StudyLoop logo lands. Line:
  *"A band and headphones that listen while you study."*
- **The hardware (custom line art):** SVG headphones draw on with a brainwave trace rising off
  the cups ("Headphones read your brainwaves"); a band draws on, its status light pulses, a PPG
  pulse trace runs across ("Band reads your pulse · MAX30102").
- **Adaptive audio (hero animation):** four stacked live sine waves — GAMMA, ALPHA, THETA, DELTA
  — each at its own speed. A mint selector pill hops between them on the beat; the chosen wave
  swells full width. *"Non-lyrical audio, tuned to the band you need."*
- **Strict mode:** a phone outline fills with app tiles; a coral lock slams onto the frame
  (beat-locked), the distracting tiles fall away, three allowed apps remain.
  *"Strict mode. Distractions locked for the session."*
- **The real app (website, 20%):** the real cockpit Home screen flies in on a 3D tilt, then
  whips to the real Insights chart with a mint playhead scanning it.
  *"Every session, analysed."*

## Outro / punchline
Five friend avatars orbit in and link into a ring: *"Study together."* The ring snaps into the
real StudyLoop logo (beat-locked logo landing). Final line: *"Focus, tuned to you."*

## User flow worth showing
Connect (band + headphones) → Study (adaptive audio + Strict mode) → Review (Insights analysis).
Hardware/audio/strict are animated from the brief; Review uses the real Insights screen.

## Tone
- Preset: cinematic
- Creative direction: kinetic motion-design brand film; the logo's pills are the cast
- Interpretation: high energy through motion and beat-snapped cuts, but every line holds long
  enough to read; big type, dark room palette, mint/coral accents only.

## Format: landscape — 1920x1080
## Duration: 24.5 s (outro extended so the tagline holds 1.3 s)

## Visual identity (from the project)
- Background / room: #060808 (chassis #0a0d0e, surfaces #0b1413 / #122120)
- Measured / energy: teal #14B8A6, light #5FD9CB
- Logo mint: #34EBAA · Logo coral: #FF5A5A · Site coral (action): #FF6B5A
- Text: ivory #F4F1EA, muted #B7C4C1
- Display font: Michroma (ASTROZ stand-in) · UI: Satoshi · Editorial: Instrument Serif italic
- Strongest visual element: the logo (pills + blackletter STUDY + mint LOOP), the band's cyan
  status light, the Insights HR/EDA chart

## Share copy (draft)
StudyLoop: a band and headphones that listen while you study, tune non-lyrical audio to your
brainwaves, and lock your phone until the session's done.

## Audio direction
- Role: dense rhythmic layer under a cinematic arc
- Music: `happy-beats-business-moves-vol-1-by-ende-dot-app.mp3` (120 BPM, most energetic)
- Music treatment: start at 0, bed ~0.34, fade out over the final 1.5 s
- Music cue guidance: preset `assets/music/cues/happy-beats-business-moves-vol-1…music-cues.json`;
  beat grid every 0.50 s from 3.02 s. Strong-cue locks: 16.02 s (website enters),
  23.02 s (logo lands). Scene cuts on grid: 3.02 / 5.52 / 9.52 / 13.52 / 16.02 / 20.52.
- Audio-reactive treatment: subtle; bass swells the room glow and the frequency-wave amplitude;
  no equalizer visuals.
- SFX posture: moderate, motion-matched — soft drops for notification chips (first/last only plus
  a few), a soft impact for the pill sweep, switch ticks for the band selector, a soft heavy thud
  for the lock, card slide for the website whip, bell for the logo.
- Restraint rule: no SFX on every chip; nothing louder than the music at the logo except the bell.

## Storyboard

### Scene 1 — Hook: the pile-up — 3.02 s (0.00–3.02)
"You sat down to study." holds centre from 0.2 s. Notification chips arrive on the beat grid
(from ~0.9 s), covering the line by 2.6 s; frame shudders.
Sequential: yes — ~9 chips, every half-beat (accents, not reads; the hook line is the read).
Audio: music starts; soft drop on first and last chip. Transition: hard → pills sweep.

### Scene 2 — Reveal: the sweep — 2.50 s (3.02–5.52)
Mint pill and coral pill swing in and wipe the chips off. Logo lands; line below.
Audio: soft impact on the sweep. Transition: logo shrinks into the corner.

### Scene 3 — Hardware — 4.00 s (5.52–9.52)
Left: headphones draw on, brainwave trace. Right: band draws on, status light, PPG pulse trace.
Labels hold ≥1.5 s each. Audio: soft drop per label. Transition: traces flow into waves.

### Scene 4 — Adaptive audio — 4.00 s (9.52–13.52)
Four stacked waves; selector hops GAMMA → ALPHA → GAMMA on the grid; the chosen wave swells.
Headline holds 3 s. Footnote "Exploratory · not a treatment."
Audio: switch tick per hop. Transition: waves collapse into a phone.

### Scene 5 — Strict mode — 2.50 s (13.52–16.02)
Phone fills with tiles, coral lock slams at ~14.52, 6 tiles drop, 3 remain.
Audio: heavy soft thud on the lock. Transition: phone zooms out → website.

### Scene 6 — The real app (website) — 4.50 s (16.02–20.52)
Home cockpit screenshot flies in on a 3D tilt (beat-locked 16.02). At ~18.0 whip to the Insights
screenshot; a mint playhead scans the chart. Caption "Every session, analysed."
Audio: card slide on the whip.

### Scene 7 — Outro — 3.98 s (20.52–24.50)
Five avatars orbit into a ring, "Study together." The ring morphs into the logo (beat-locked
23.02), "Focus, tuned to you." Audio: bell on the logo; music fades out.

**Music mood:** upbeat, propulsive
**Audio summary:** a driving 120 BPM bed with chips, sweeps, ticks and a lock thud on the grid,
landing the logo on a bell as the music fades.
