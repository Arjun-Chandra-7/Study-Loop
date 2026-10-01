# StudyLoop

Cockpit UI + landing narrative for the StudyLoop study wearable (PPG + EDA band).

```bash
npm install
npm run dev        # http://localhost:3000
```

- **Design spec:** [`docs/DESIGN.md`](docs/DESIGN.md) covers the wireframe mapping, tokens, type, motion, responsive rules and the eye test.
- **Locked wireframe:** `docs/wireframe-desktop.png`

## Architecture

```
src/lib/sensors/
  types.ts        SensorProvider interface (the only thing the UI depends on)
  mock.ts         MockSensorProvider: tonic/phasic EDA, HR with respiratory variation
  bluetooth.ts    BluetoothSensorProvider: Web Bluetooth, standard HR + battery GATT,
                  EDA on a vendor service (placeholder UUIDs until firmware ships)
  classify.ts     Stable / Changing / Elevated / Recovering / Poor signal, relative to baseline
src/lib/engine.ts  Session state machine (idle → baseline → active ⇄ paused → complete),
                  1 Hz sampling, baseline capture, event log. One external store.
src/components/
  cockpit/        The wireframe: capsules, notches, metric cards, player, trend, research, nav
  views/          Main-panel views per tab (Home hero, Session, Insights, Research, Profile)
  orb/            Thinking Orbs engine driven at hero scale; orbState.ts maps system state → orb
  landing/        GSAP ScrollTrigger narrative below the cockpit
```

To swap in real hardware, switch **Profile → Data source → Bluetooth band**; the UI code stays the same.
The **simulator** (sliders icon in the top capsule) drives the mock through normal / elevated / recovery /
poor signal / low battery / disconnected.

## Music for study

The **Music** tab imports Spotify playlist metadata, takes audio the user supplies, separates it with Demucs in a
background Python worker, and plays it as **Original / No Lyrics / Vocals Only / Beats Only**. It needs FFmpeg and
the worker running alongside the app:

```bash
npm run dev            # app + API
npm run music:worker   # separation worker (setup: docs/MUSIC.md)
npm test               # app/API tests
```

Architecture, setup, environment variables, measured performance and known limitations:
[`docs/MUSIC.md`](docs/MUSIC.md).

## Fonts

- **Satoshi** loads from Fontshare.
- **Instrument Serif** loads via `next/font`.
- **ASTROZ** is licensed separately. Add `public/fonts/Astroz.woff2` and append the `url()` line noted in
  `src/app/tokens.css`. Until then, Michroma stands in.

## Claims policy

StudyLoop measures heart rate and skin conductance. The UI never shows focus scores, stress scores or brain
readings. Research content is labelled experimental, is coloured coral, and is kept visually separate from measured data.
