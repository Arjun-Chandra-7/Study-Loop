# Music for study — stem separation

The **Music** tab lets a signed-in student bring their own music and listen to it in four study versions:

| UI label | What plays | Built from |
| --- | --- | --- |
| **Original** | The track as uploaded | the decoded source, re-encoded (before processing: the upload itself) |
| **No Lyrics** | Everything except the voice | `drums + bass + other` stems, summed |
| **Vocals Only** | Just the voice | `vocals` stem |
| **Beats Only** | Just the drums | `drums` stem |

Spotify is used for **metadata only** (titles, artists, album art, durations). The audio always comes from a
file the user uploads. StudyLoop never requests, streams, downloads or modifies Spotify audio.

## Flow

```
Spotify link ─► /api/music/import ─► track metadata (SQLite)
                                          │
user's file ─► PUT /api/music/tracks/:id/audio
                 stream to tmp (size cap, sha256) → extension + MIME + magic bytes + ffprobe agree
                 → full decode check → sources/<id>.<ext>   (identical bytes stored once per user)
                                          │
POST /api/music/tracks/:id/process ─► cache key = sha256(source sha256 + model + model version + params)
     ├─ same key already completed/in flight → 200, existing job (no Demucs run)
     └─ else insert music_jobs row 'queued' → 202 { job_id, status: "queued" }
                                          │
Python worker (worker/, one process, model kept loaded)
  claim job (BEGIN IMMEDIATE) → 'processing' → decode with FFmpeg (44.1 kHz stereo float)
  → Demucs htdemucs (real chunk progress → music_jobs.progress) → validate stems (finite, shape,
    stems re-add to the mix) → 'finalizing' → derive no_lyrics → encode 6 AAC files in parallel
  → ffprobe each → atomic rename tmp/job-<id> → outputs/<id>/ → music_outputs rows → 'completed'
                                          │
GET /api/music/jobs/:id  (polled every 1.5 s while active)
GET /api/music/tracks/:id/versions → short-lived signed links → GET /api/music/files/<token> (Range)
                                          │
One shared <audio> element (src/lib/music/player.ts): switching version swaps src and restores
position + play/pause. All versions come from one decode, so they line up sample-for-sample.
```

**Player.** Play/pause, previous (restarts the song after 3 s, like Spotify), next, shuffle (reorders
what's coming up; turning it off restores the order), repeat off → all → one, seek, volume/mute, an
**Up next** queue (play from any track, add to queue, remove, jump), auto-advance when a song ends, and
media keys / lock-screen controls via the Media Session API. The chosen study version (e.g. No Lyrics)
carries across tracks; an unprocessed track plays Original until it's processed.

States the user sees: *Needs audio* → *Uploading audio… (real %)* → *Ready to process* → *Waiting for
processing…* → *Separating music… (real %, from Demucs' own chunk counter)* → *Preparing study versions…*
(activity sweep, no number) → *Ready to study*, or *Processing failed* with a plain-language reason and
**Try again**. Every state has an icon and a word; colour is never the only signal. If no worker has checked in
for 30 s, a queued track says the processing service is offline instead of waiting silently.

## Where things live

| Path | What |
| --- | --- |
| `src/components/views/MusicView.tsx` | The Music tab (library, import, track cards, Now playing) |
| `src/lib/music/{client,player,status,types,useMusicLibrary}.ts` | Client API, shared player, status words, polling |
| `src/lib/music/server/*` | Auth (Firebase ID-token check), DB, upload validation, signed files, Spotify, library logic |
| `src/app/api/music/**/route.ts` | Thin route handlers |
| `worker/schema.sql` | SQLite schema, shared by API and worker (both apply it idempotently) |
| `worker/pipeline.json` | Processing identity: model, model version, params. Part of every cache key |
| `worker/studyloop_music/` | The worker: `__main__` (loop), `pipeline`, `separate` (Demucs), `audio` (FFmpeg), `db` (queue) |

### Data (`MUSIC_DATA_DIR`, default `./.data/music`, git-ignored)

```
music.db                 SQLite (WAL). music_tracks, music_sources, music_jobs (= the queue), music_outputs, music_workers
sources/<id>.<ext>       uploads, named by server-generated id only
outputs/<job id>/*.m4a   original, no_lyrics, vocals, drums, bass, other (vocals_only/beats_only reuse stem files)
tmp/                     in-progress uploads (upload-*.part) and job scratch (job-<id>/); always cleaned,
                         and anything older than 1 h is swept by the worker
.signing-secret          dev fallback when MUSIC_SIGNING_SECRET isn't set
```

No file path is ever built from user input: names come from random ids, stored paths are relative and
resolved with a check that they stay inside the data dir.

## Running it locally

Requirements: Node 22+, Python 3.11+, FFmpeg/ffprobe on `PATH`, ~2 GB disk for PyTorch + weights.

```bash
# 1. Worker environment (PyTorch first — pick the build for your machine)
python3 -m venv worker/.venv
worker/.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu      # or a CUDA build
worker/.venv/bin/pip install --no-deps "torchaudio==2.11.0" --index-url https://download.pytorch.org/whl/cpu
worker/.venv/bin/pip install --no-deps demucs==4.0.1 openunmix==1.3.0
worker/.venv/bin/pip install -r worker/requirements.txt
# (If PyTorch is already installed system-wide: python3 -m venv --system-site-packages worker/.venv)

# 2. App + worker, in two terminals
npm run dev
npm run music:worker       # first run downloads the htdemucs weights (~80 MB) to ~/.cache/torch
```

Demucs 4.0.1 on PyPI pins `torchaudio<2.1`, which no longer installs on current Python/PyTorch, hence
`--no-deps`. Demucs only *imports* torchaudio here; all audio I/O goes through FFmpeg. torchaudio 2.11 (its
last release) imports fine against torch 2.13.

### Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | (existing) | Also used server-side to verify Firebase ID tokens (`aud`/`iss`) |
| `MUSIC_DATA_DIR` | `./.data/music` | Library DB + files. API and worker must point at the same place |
| `MUSIC_SIGNING_SECRET` | random, saved in data dir | HMAC key for playback links. **Set it in production** |
| `MUSIC_MAX_UPLOAD_MB` | `150` | Upload size cap (enforced while streaming) |
| `MUSIC_MAX_DURATION_S` | `900` | Longest track accepted |
| `MUSIC_URL_TTL_S` | `7200` | Playback link lifetime; the player refetches on expiry |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | unset | Enables Spotify import (client-credentials). Unset ⇒ import says so; add-by-name still works |
| `MUSIC_DEVICE` (worker) | `auto` | `auto` (CUDA if present), `cuda`, or `cpu` |
| `MUSIC_JOB_TIMEOUT_S` (worker) | `1800` | Hard stop per job |
| `MUSIC_STALE_AFTER_S` (worker) | `120` | Heartbeat age after which a job is treated as crashed |
| `MUSIC_MAX_ATTEMPTS` (worker) | `2` | Attempts for retryable failures (crash, low disk, model load) |
| `MUSIC_MIN_FREE_MB` (worker) | `1024` | Refuse to start a job below this free space |
| `MUSIC_LOG=off` | | Silence API logs (used in tests) |

## Tests

```bash
npm test                                   # API, player, Music view (75 tests, ~6 s)
npm run music:test-worker                  # worker pipeline with real FFmpeg + stand-in separator (12 tests)
MUSIC_TEST_DEMUCS=1 npm run music:test-worker          # + real Demucs on a synthetic mix with known parts
MUSIC_TEST_WORKER=1 npx vitest run worker.integration  # API → queue → real worker → playback links
MUSIC_TEST_AUDIO=/path/song.mp3 MUSIC_TEST_WORKER=1 npx vitest run worker.integration   # with a real song
```

## Measured performance

Machine: 8-core laptop CPU, 22 GB RAM, RTX 3050 Laptop (4 GB). During testing other processes held ~3.3 GB
of the GPU, so CUDA ran out of memory and every job ran on the **CPU fallback**. GPU timings were not measured.

| Measurement | Value |
| --- | --- |
| Model load (weights cached) | 1.5–2.3 s, once per worker process (kept loaded between jobs) |
| First-ever model download | 80 MB, ~5 s |
| Upload + validation (3.7 MB MP3, local) | 0.25 s via API test; 0.6 s via HTTP |
| Decode (2:33 song) | 0.2–0.3 s |
| Separation, CPU (2:33 song) | **67 s** (idle machine) · 119 s (machine under load, load avg 11) ≈ 0.44–0.78× real time |
| Encode 6 AAC outputs (parallel) | 6.5 s idle · 10.8 s under load |
| Whole job | 74 s idle · 130 s under load |
| Cache hit (same audio again) | 50 ms, no separation |
| Storage per processed track | ~22.7 MB outputs (6 × ~3.8 MB @ 192 kb/s for 2:33) + the original upload |

Rule of thumb on CPU: plan on roughly half to one times the song length per job, one job at a time per
worker. A CUDA GPU with ≥4 GB *free* should be several times faster, but that's an expectation, not a
measurement from this machine. Run more worker processes for parallelism; each holds its own model copy
(~1 GB RAM on CPU).

## Quality: what was checked, and the limits

Checks run on real output (`MUSIC_TEST_WORKER=1`, plus a signal-level script on the CC0 test song
*Monkeys At Typewriters*, Wikimedia Commons):

- All outputs decode as AAC, 44.1 kHz, stereo, with the source's exact duration (153.08 s), no clipping.
- Stems re-add to the decoded mix within −47 dBFS; `no_lyrics + vocals` re-adds to `original` within −37 dBFS
  even after AAC encoding.
- The vocal stem carries 41 % of the original's energy but only 0.3 % of *No Lyrics*.
- On a synthetic mix with known parts (TTS voice + kick/hat + bass), Demucs' vocal stem correlates 0.999 with
  the true voice, drums 0.98, bass 0.99, and the voice's share of *No Lyrics* is ~0 %.

Known limitations (normal for source separation; no output was listened to by a person during this work):

- **Bleed.** Some instrument energy lands in *Vocals Only* (the test song's vocal stem is non-trivial in
  almost every second), and faint vocal remnants can survive in *No Lyrics*, especially reverb tails,
  backing vocals, ad-libs and vocal-like synths.
- **Beats Only is the drum stem, not "all rhythm".** Rhythmic guitar, bass lines, plucks and percussion the
  model files under *other* won't be in it. Drum transients can sound softened or smeared.
- **Phase/transient artefacts** ("watery" highs, pre-echo) are possible in every stem; AAC at 192 kb/s
  adds its own small coding loss.
- Spoken word, live recordings and heavily processed/distorted vocals separate less cleanly.
- Model: `htdemucs` (Demucs v4 hybrid transformer, `955717e8`), `shifts=1`, `overlap=0.25`.
  `htdemucs_ft` is better but ~4× slower; switching it means editing `worker/pipeline.json` (new cache keys).

## Spotify, rights and privacy

- **Spotify requires the owner of the Spotify developer app to have an active Premium subscription.**
  Without it, every Web API call returns 403 "Active premium subscription required for the owner of the
  app" (verified 1 Oct 2026 with real credentials), and the app shows "Spotify import is unavailable right
  now". After subscribing, Spotify says it can take a few hours before requests are allowed.
- **Playlists need "Connect Spotify".** Verified live (1 Oct 2026): with app-only credentials Spotify
  returns a playlist's name but refuses its songs ("Valid user authentication required"). So playlist
  import asks the listener to connect Spotify once (Authorization Code + PKCE in the browser, scopes
  `playlist-read-private playlist-read-collaborative`, token kept in sessionStorage and sent only with the
  import request, never stored server-side). Albums and single tracks import without connecting.
  Register these redirect URIs in the Spotify dashboard (Spotify rejects `localhost`, so use 127.0.0.1
  locally and add 127.0.0.1 to Firebase's authorised domains):
  `https://study-loop-alpha.vercel.app/music/spotify-callback` and
  `http://127.0.0.1:3000/music/spotify-callback`. While the Spotify app is in Development mode, only
  Spotify accounts added under **User Management** in the dashboard can connect.
- Import uses Spotify's Web API with the **client-credentials** flow for albums/tracks, so only public playlists, albums and
  tracks are readable. Up to 100 tracks per import. Local files and podcast episodes are skipped. Spotify has
  restricted some endpoints for new/dev-mode apps; if playlist reads are refused the user sees "Spotify
  couldn't share that link". The live check is opt-in:
  `MUSIC_TEST_SPOTIFY_URL=<share link> npx vitest run spotify.live` (reads `.env.local`).
- Album art is shown from Spotify's CDN with a link back to the track on Spotify; audio is never fetched.
- Users must supply audio they own or have the rights to use (the UI says so). Separating copyrighted
  recordings for personal listening still raises licensing questions for a commercial product; see the
  project brief's open question on Spotify licensing. This feature is built so the audio path is fully
  independent of Spotify.
- Uploads and outputs are private to the uploader: every query is scoped by the verified Firebase uid, other
  users' ids return the same 404 as missing ones, and playback links are HMAC-signed, expire, carry a keyed
  hash of the owner (not the uid) and are re-checked against the database. Identical audio is de-duplicated
  and cached **per user** only, so one user's upload never serves another's request.
- Logs carry ids, sizes and timings only: never titles, file names, tokens or audio.

## Deployment

The API needs a writable disk shared with the worker, and the worker needs PyTorch + FFmpeg, so this runs on a
**single long-lived server or VM** (`next start` + `npm run music:worker`, e.g. under systemd or Docker), not on
Vercel Functions: their filesystem is ephemeral and they can't host the model. On the current Vercel
deployment the rest of StudyLoop is unaffected; the Music tab will report that the library is unavailable.
Moving to object storage + a managed queue would be the next step for multi-instance hosting.
