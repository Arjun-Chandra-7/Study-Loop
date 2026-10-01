# STUDYLOOP — Project Brief

> A wristband and headphones that read how your body and brain respond while you study, then shape
> what you hear to help you focus — with sessions you can track, share with a group and review.

_Last updated: 1 October 2026_

---

## 1 · The idea in one paragraph

You put on the StudyLoop wristband and headphones and start a study session. The band tracks your
vitals; the headphones read your brainwaves. Based on what they measure, StudyLoop plays
non-lyrical audio tuned to brainwave bands (gamma, alpha, theta and delta) chosen to help you
focus. A strict mode locks away distracting apps for the length of the session,
and afterwards you get a full analysis of how the session went. Friends and classmates can study
together in groups.

## 2 · The problem

- Studying is full of distraction: phones, social apps, streaming.
- Lyrical music competes with reading and remembering — the words pull attention.
- Students have no objective view of when they were actually focused, only how long they sat down.

## 3 · Hardware

| Part | What it does |
| --- | --- |
| **Wristband** | Measures vitals with a PPG / pulse-oximetry sensor (**MAX30102**): heart rate and related signals, plus a status light and one button. |
| **Headphones** | Read brainwave activity once a session starts, and play the focus audio. |

## 4 · App features

### 4.1 Adaptive focus audio
- During a session, StudyLoop analyses brainwave activity and decides which band to play.
- Bands used: **gamma**, **alpha**, **theta** and **delta**.
- Rationale given by the team:
  - Non-lyrical sound supports focus better than lyrical music.
  - Gamma-band stimulation (≈ 40 Hz) is intended to raise gamma activity linked with clear focus.
  - Alpha is associated with selective attention.

### 4.2 Sessions and tracking
- Start, pause and finish study sessions; set subject, topic, length and mode.
- Track focus across sessions over time.

### 4.3 Session analysis
- After each session, a full breakdown: how vitals and brain activity changed, when focus held
  and when it slipped.

### 4.4 Group learning
- Study together as a class or a group of friends inside the app.

### 4.5 Strict mode
- Turned on with a session. While it runs, distracting apps (Instagram, YouTube, Netflix and
  similar) can't be opened; the home screen is replaced by a short list of allowed apps.

### 4.6 Spotify focus mode _(in development)_
- For people who prefer music to tones: connect a Spotify playlist.
- StudyLoop removes the vocals from each track. Users choose whether to keep the instrumentals;
  without them, only the beat remains.
- The resulting non-lyrical tracks are re-ordered into a sequence designed for focus.

## 5 · How a session works

1. **Connect** — put on the band and headphones; they pair with the app.
2. **Baseline** — a short still period so StudyLoop learns your normal signal for the day.
3. **Study** — strict mode on, adaptive audio (tones or de-vocalled Spotify) playing.
4. **Review** — the session analysis, saved under your account.

## 6 · What exists today

- **Website / app shell** (Next.js, deployed at https://study-loop-alpha.vercel.app):
  desktop "cockpit" with Home, Session, Insights, Research and Profile; a phone layout; landing
  sections explaining the band; simulated band data.
- **Google sign-in** through Firebase Auth (project `study-loop-abecd`); the app requires sign-in.
- Design system and wireframe: [`DESIGN.md`](./DESIGN.md).

## 7 · Open questions & risks

These came up while writing the brief and should be settled before demos or launch.

1. **Website copy vs. this brief.** The site currently says the band measures heart rate and skin
   conductance (EDA) and that StudyLoop "does not read brain activity"; it also labels 40 Hz audio
   as experimental and "not a treatment". This brief adds EEG headphones and the MAX30102 (PPG, not
   EDA). Decide the real sensor list and update the site to match.
2. **Strength of the science claims.** Evidence that 40 Hz / gamma audio improves focus is early
   and mixed; alpha's link to selective attention is correlational. Present these as what the
   product explores, not as proven effects, to keep claims defensible (and clear of medical-device
   territory).
3. **Delta waves while studying.** Delta is mainly associated with deep sleep; define when, if ever,
   it would be played during a study session.
4. **Spotify licensing.** Spotify's developer terms don't allow downloading, modifying or
   re-sequencing its audio, and the Web API doesn't expose full audio streams. Vocal removal would
   need a licensed source or audio the user already owns. Check this before building.
5. **Strict mode on phones.** iOS only allows app blocking through Apple's Screen Time
   (FamilyControls) APIs, which need a special entitlement; Android needs accessibility or
   device-admin permissions. Both shape what "home screen disabled" can mean.
6. **Sensitive data.** Brainwave and biometric data is sensitive personal data; plan consent,
   storage, retention and group-sharing rules (what classmates can see) early.
