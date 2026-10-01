-- StudyLoop music library. Shared by the Next.js API (src/lib/music/db.ts) and the worker
-- (worker/studyloop_music/db.py); both apply it idempotently on start. Times are epoch ms.
-- file_path columns are relative to MUSIC_DATA_DIR and only ever built from server-generated ids.

CREATE TABLE IF NOT EXISTS music_sources (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  sha256      TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  mime        TEXT NOT NULL,
  container   TEXT NOT NULL,
  codec       TEXT,
  sample_rate INTEGER,
  channels    INTEGER,
  duration_s  REAL NOT NULL,
  size_bytes  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  UNIQUE (user_id, sha256)
);

CREATE TABLE IF NOT EXISTS music_tracks (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  title            TEXT NOT NULL,
  artist           TEXT NOT NULL DEFAULT '',
  album            TEXT,
  artwork_url      TEXT,
  duration_ms      INTEGER,
  spotify_track_id TEXT,
  spotify_url      TEXT,
  playlist_name    TEXT,
  source_id        TEXT REFERENCES music_sources (id),
  created_at       INTEGER NOT NULL,
  updated_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS music_tracks_by_user ON music_tracks (user_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_spotify_once
  ON music_tracks (user_id, spotify_track_id) WHERE spotify_track_id IS NOT NULL;

-- One row per processing attempt of a source with a given pipeline identity (cache_key).
-- At most one non-failed job per (user, cache_key): that row is the cache.
CREATE TABLE IF NOT EXISTS music_jobs (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  source_id     TEXT NOT NULL REFERENCES music_sources (id),
  cache_key     TEXT NOT NULL,
  model         TEXT NOT NULL,
  model_version TEXT NOT NULL,
  params_json   TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'finalizing', 'completed', 'failed')),
  progress      REAL,
  device        TEXT,
  error_code    TEXT,
  error_message TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  worker_id     TEXT,
  heartbeat_at  INTEGER,
  timings_json  TEXT,
  created_at    INTEGER NOT NULL,
  started_at    INTEGER,
  completed_at  INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS music_jobs_one_live_per_key
  ON music_jobs (user_id, cache_key) WHERE status != 'failed';
CREATE INDEX IF NOT EXISTS music_jobs_queue ON music_jobs (status, created_at);

-- Stems (vocals/drums/bass/other) and the study versions built from them
-- (original/no_lyrics/vocals_only/beats_only). A version may share a stem's file.
CREATE TABLE IF NOT EXISTS music_outputs (
  id          TEXT PRIMARY KEY,
  job_id      TEXT NOT NULL REFERENCES music_jobs (id),
  kind        TEXT NOT NULL CHECK (kind IN ('stem', 'version')),
  name        TEXT NOT NULL,
  file_path   TEXT NOT NULL,
  format      TEXT NOT NULL,
  codec       TEXT NOT NULL,
  duration_s  REAL NOT NULL,
  sample_rate INTEGER NOT NULL,
  channels    INTEGER NOT NULL,
  size_bytes  INTEGER NOT NULL,
  rms_dbfs    REAL,
  created_at  INTEGER NOT NULL,
  UNIQUE (job_id, kind, name)
);

-- Worker liveness, so the app can tell "waiting in line" from "nobody is processing".
CREATE TABLE IF NOT EXISTS music_workers (
  id      TEXT PRIMARY KEY,
  device  TEXT,
  seen_at INTEGER NOT NULL
);
