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
Spotify link ─► POST /api/music/import ─► track metadata (Neon Postgres)
                                                │
user's file ─► POST /tracks/:id/upload  {name,type,size} → extension + type + size checked
                 → presigned PUT URL (one pathname, fixed content type, size cap) + signed ticket
             ─► browser PUTs the bytes straight to private Vercel Blob (real progress; no 4.5 MB limit)
             ─► POST /tracks/:id/audio {ticket} → file exists, magic bytes match, sha256 → music_sources
                                                    (identical bytes stored once per user)
                                                │
POST /tracks/:id/process ─► cache key = sha256(source sha256 + model + model version + params)
     ├─ same key completed/in flight → 200, existing job (no Demucs run)
     └─ else music_jobs row 'queued' → 202 { job_id, status: "queued" }
                                                │
Worker (any machine with Python + FFmpeg; talks only to the API, holds no DB/storage credentials)
  POST /api/music/worker/claim       → recovers stale jobs, claims next (FOR UPDATE SKIP LOCKED),
                                       returns a presigned GET for the source
  download → ffprobe (decodable? length limit) → decode → Demucs htdemucs
  POST …/jobs/:id/heartbeat          → real chunk progress, then "finalizing"; owned? (else abandon)
  encode 6 AAC files → POST …/upload-urls → PUT each to its presigned URL
  POST …/jobs/:id/complete           → server checks every file is in Blob at the reported size,
                                       records outputs + source duration in one statement
  POST …/jobs/:id/fail               → retryable: requeue (≤ MUSIC_MAX_ATTEMPTS), else failed + reason
                                                │
GET /api/music/jobs/:id  (polled every 1.5 s while active)
GET /tracks/:id/versions → presigned Blob CDN links (Range-capable, expire after MUSIC_URL_TTL_S)
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
**Try again**. If no worker has checked in for 30 s, a queued track says the processing service is offline.

## Where things live

| Path | What |
| --- | --- |
| `src/components/views/MusicView.tsx` | The Music tab (library, import, track cards, queue, Now playing) |
| `src/lib/music/{client,player,status,types,useMusicLibrary,spotifyAuth}.ts` | Client API, shared player, status words, polling, Connect Spotify (PKCE) |
| `src/lib/music/server/db.ts`, `schema.ts` | Neon Postgres access + schema (applied idempotently on first use) |
| `src/lib/music/server/storage.ts` | Private Vercel Blob: presigned GET/PUT, head, read |
| `src/lib/music/server/{upload,library,workerApi,spotify,auth,sign}.ts` | Upload checks, library logic, worker API, Spotify, Firebase token check, signed tickets |
| `src/app/api/music/**/route.ts` | Thin route handlers (user API + `/worker/*`) |
| `worker/pipeline.json` | Processing identity (model, version, params): part of every cache key; bundled into the app |
| `worker/studyloop_music/` | The worker: `__main__` (loop), `api` (HTTP client), `pipeline`, `separate` (Demucs), `audio` (FFmpeg) |

**Data.** Postgres tables `music_tracks`, `music_sources`, `music_jobs` (also the queue), `music_outputs`,
`music_workers`. Blob pathnames: `sources/<id>.<ext>` and `outputs/<job id>/{original,no_lyrics,vocals,drums,bass,other}.m4a`
(vocals_only/beats_only reuse the vocals/drums files). Nothing is public; no pathname comes from user input.
The worker's scratch dir (`worker/.work`, git-ignored) is emptied after every job and swept of anything over 1 h old.

## Running it

Requirements: Node 22+; for the worker, Python 3.11+, FFmpeg/ffprobe on `PATH`, ~2 GB disk for PyTorch + weights.

```bash
# App (local): env comes from Vercel — Neon, Blob, Firebase, Spotify, worker secrets
vercel env pull .env.local
npm run dev                      # open http://127.0.0.1:3000 (Spotify won't redirect to "localhost")

# Worker environment (once). PyTorch first — pick the build for your machine:
python3 -m venv worker/.venv
worker/.venv/bin/pip install torch --index-url https://download.pytorch.org/whl/cpu      # or a CUDA build
worker/.venv/bin/pip install --no-deps "torchaudio==2.11.0" --index-url https://download.pytorch.org/whl/cpu
worker/.venv/bin/pip install --no-deps demucs==4.0.1 openunmix==1.3.0
worker/.venv/bin/pip install -r worker/requirements.txt

# Worker against your local app (reads MUSIC_* from .env.local):
npm run music:worker
# …or against the live site, from any machine:
MUSIC_API_URL=https://study-loop-alpha.vercel.app MUSIC_WORKER_TOKEN=<same as on Vercel> npm run music:worker
```

The first run downloads the htdemucs weights (~80 MB). Demucs 4.0.1 on PyPI pins `torchaudio<2.1`, which no
longer installs, hence `--no-deps`; torchaudio is only imported (FFmpeg does all audio I/O).

### Environment variables

| Variable | Where | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | app | Neon (set by the Marketplace integration) |
| `BLOB_READ_WRITE_TOKEN` / `VERCEL_OIDC_TOKEN` | app | Private Blob store `studyloop-music` (set when the store was connected) |
| `MUSIC_SIGNING_SECRET` | app | HMAC key for upload tickets (set on Vercel for all environments) |
| `MUSIC_WORKER_TOKEN` | app + worker | Shared secret for `/api/music/worker/*` (set on Vercel; the worker needs the same value) |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | app | Also used server-side to verify Firebase ID tokens |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | app | Spotify import |
| `MUSIC_MAX_UPLOAD_MB` (150), `MUSIC_MAX_DURATION_S` (900), `MUSIC_URL_TTL_S` (7200) | app | Limits and link lifetime |
| `MUSIC_STALE_AFTER_S` (120), `MUSIC_MAX_ATTEMPTS` (2) | app | Crash recovery |
| `MUSIC_API_URL` (`http://127.0.0.1:3000`) | worker | Which StudyLoop to work for |
| `MUSIC_DEVICE` (`auto`), `MUSIC_JOB_TIMEOUT_S` (1800), `MUSIC_MIN_FREE_MB` (1024), `MUSIC_WORK_DIR` | worker | Hardware, timeout, disk floor, scratch dir |

## Tests

```bash
npm test                      # API on in-process Postgres (PGlite) + in-memory Blob, worker API, Spotify, player, Music view
npm run music:test-worker     # worker pipeline: real FFmpeg, real HTTP to a fake StudyLoop, stand-in separator
MUSIC_TEST_DEMUCS=1 npm run music:test-worker                     # + real Demucs on a synthetic mix with known parts
MUSIC_TEST_SPOTIFY_URL=<share link> npx vitest run spotify.live   # real Spotify API
```

## Measured performance

Machine: 8-core laptop CPU, 22 GB RAM, RTX 3050 Laptop (4 GB, mostly used by other processes, so Demucs ran on
the **CPU fallback**; GPU timings not measured). Song: 2:33 CC0 MP3 (3.8 MB).

| Measurement | Value |
| --- | --- |
| Browser → Blob upload (3.8 MB, from India to iad1) | 1.8 s |
| Worker: download / decode / Demucs (CPU) / encode / upload | 3.3 s / 0.3 s / 67–128 s / 6.5–8.1 s / 15.1 s |
| Whole job, live (Neon + Blob + worker through the API) | 156 s (machine under load) |
| Model load | 1.5–2.3 s, once per worker process |
| Cache hit (same audio again) | no separation; answered from the existing job |
| Storage per processed track | ~22.7 MB outputs (6 × ~3.8 MB @ 192 kb/s for 2:33) + the original upload |
| API latency from this laptop to Neon (us-east) | ~1 s warm for the library list (4 queries); first call after idle ~5 s (Neon waking up) |

Rule of thumb on CPU: plan on roughly half to one times the song length per job, one job at a time per worker.
Run more worker processes (on more machines) for parallelism; claims never collide.
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
  users' ids return the same 404 as missing ones, the Blob store is private, and playback/upload links are
  presigned for one file and one operation and expire. Identical audio is de-duplicated
  and cached **per user** only, so one user's upload never serves another's request.
- Logs carry ids, sizes and timings only: never titles, file names, tokens or audio.

## Deployment

- **App:** Vercel (`vercel deploy --prod`). Neon and the private Blob store are connected to the project, so
  the library, Spotify import, uploads and playback work on the live site.
- **Worker:** runs anywhere with Python + FFmpeg (a laptop, a VM, a GPU box) and needs only `MUSIC_API_URL` +
  `MUSIC_WORKER_TOKEN`. While no worker is running, uploads still work and tracks wait in the queue, and the
  UI says the processing service is offline. Vercel Functions can't host it (no model, ~300 s limit).
- Crash safety: workers heartbeat every 10 s; a job silent for `MUSIC_STALE_AFTER_S` is requeued (or failed
  after `MUSIC_MAX_ATTEMPTS`) the next time any worker claims.
