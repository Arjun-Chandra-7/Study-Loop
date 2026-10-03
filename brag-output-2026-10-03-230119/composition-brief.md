# Hyperframes Composition Brief: StudyLoop teaser

## Objective
A ~23.5 s cinematic teaser for StudyLoop, built from PRD v0.3 and the UI on `feature/study-music-stems`.

## Output
- Composition directory: `composition/`
- Rendered video: `brag.mp4`
- Format: landscape 1920x1080, 30 fps
- Duration: 23.6 s

## Source Material
- Project root: `Study-Loop/` (main checkout) + worktree `.claude/worktrees/study-music-stems`
- Read: `PRD.md`, `src/app/tokens.css`, `src/lib/palettes.ts`, `src/lib/sensors/classify.ts`, cockpit/session/
  insights/loops components, `public/media/studyloop-logo.png`, `public/media/studyloop-band.png`
- Copy used verbatim from the app: "Capturing baseline", "Sit still. Breathe normally.", "Your baseline",
  "Heart rate", "Skin conductance", "Session live", "Stable / Changing / Elevated / Recovering",
  "Your playlist, as study beats", "Paste a Spotify playlist, album or song link", "Make beats",
  "Now playing", "Follows your band", "Near baseline", "Elevated moments", "Moments you marked", "Sample data"
- Fictional stand-ins: session numbers, the playlist link, and track names. No real user data.

## Creative Direction
- Tone: cinematic, quiet-premium teaser
- Hook: "You know how long you sat there." / ticking timer / "Not how it went."
- Outro: logo on the 20.19 s strong cue → "See how you study." + study-loop-alpha.vercel.app
- Avoid: focus/stress scores, brainwaves/EEG, strict mode, group study (Planned in the PRD), generic SaaS copy

## Visual Identity
- Room #0B0A07, surfaces #151411 / #181714 / #21201D, hairlines rgba(236,230,217,.10)
- Measured sage #9DBA8E / #C3D6B4 · Action cinder #CF4F33 / #E58A6F · Bone #ECE6D9 · Muted #B6AE9F
- Fonts (3 only): Michroma (display/numbers), Satoshi (UI), Instrument Serif italic (editorial lines)

## Storyboard
1. Hook 0–3.0: timer + two serif lines
2. Band 3.0–6.3: product render push-in, sage light flare, one line
3. Baseline 6.3–9.3: recreated baseline card, ring countdown, locked values
4. Live 9.3–13.1: cockpit slice; badge Stable → Changing → Elevated → Recovering; HR/EDA traces
5. Loops 13.1–17.2: type link → Make beats → 3 rows → Elevated flips tempo 92 → 75 bpm
6. Insights 17.2–20.2: EDA trace vs baseline band, three stats count up (Sample data)
7. Logo 20.2–23.6: pill wipe, logo lock-up, tagline, URL

## Audio
- Music: `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3`, 0.36 volume, fade in 0.6 s, fade out 22.4→23.6
- Cues: beat-locked logo at 20.19 s; badge steps and stat count-ups on the beat grid
- Audio-reactive: RMS/bass drives the room glow, the band light flare and the logo glow (subtle)
- SFX (sparse): soft impact on band reveal; drop on baseline lock; keypress ticks on the link; click on Make
  beats; drops on rows; switch on Elevated; card slide on Insights; bell on logo
