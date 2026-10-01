import "server-only";

/**
 * Music library schema (Postgres: Neon in production, PGlite in tests). Applied idempotently on first
 * use. Times are epoch ms and sizes are bytes, stored as DOUBLE PRECISION so drivers return plain
 * numbers (both stay exact far below 2^53). Blob pathnames are always built from server ids.
 */
export const SCHEMA: string[] = [
  `CREATE TABLE IF NOT EXISTS music_sources (
     id          TEXT PRIMARY KEY,
     user_id     TEXT NOT NULL,
     sha256      TEXT NOT NULL,
     pathname    TEXT NOT NULL,
     mime        TEXT NOT NULL,
     container   TEXT NOT NULL,
     duration_s  DOUBLE PRECISION,
     size_bytes  DOUBLE PRECISION NOT NULL,
     created_at  DOUBLE PRECISION NOT NULL,
     UNIQUE (user_id, sha256)
   )`,
  `CREATE TABLE IF NOT EXISTS music_tracks (
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
     created_at       DOUBLE PRECISION NOT NULL,
     updated_at       DOUBLE PRECISION NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS music_tracks_by_user ON music_tracks (user_id, created_at)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS music_tracks_spotify_once
     ON music_tracks (user_id, spotify_track_id) WHERE spotify_track_id IS NOT NULL`,
  // One row per processing attempt of a source with a given pipeline identity (cache_key).
  // At most one non-failed job per (user, cache_key): that row is the cache. The table is also the queue.
  `CREATE TABLE IF NOT EXISTS music_jobs (
     id            TEXT PRIMARY KEY,
     user_id       TEXT NOT NULL,
     source_id     TEXT NOT NULL REFERENCES music_sources (id),
     cache_key     TEXT NOT NULL,
     model         TEXT NOT NULL,
     model_version TEXT NOT NULL,
     params_json   TEXT NOT NULL,
     status        TEXT NOT NULL CHECK (status IN ('queued', 'processing', 'finalizing', 'completed', 'failed')),
     progress      DOUBLE PRECISION,
     device        TEXT,
     error_code    TEXT,
     error_message TEXT,
     attempts      INTEGER NOT NULL DEFAULT 0,
     worker_id     TEXT,
     heartbeat_at  DOUBLE PRECISION,
     timings_json  TEXT,
     created_at    DOUBLE PRECISION NOT NULL,
     started_at    DOUBLE PRECISION,
     completed_at  DOUBLE PRECISION
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS music_jobs_one_live_per_key
     ON music_jobs (user_id, cache_key) WHERE status != 'failed'`,
  `CREATE INDEX IF NOT EXISTS music_jobs_queue ON music_jobs (status, created_at)`,
  // Stems (vocals/drums/bass/other) and study versions (original/no_lyrics/vocals_only/beats_only).
  `CREATE TABLE IF NOT EXISTS music_outputs (
     id          TEXT PRIMARY KEY,
     job_id      TEXT NOT NULL REFERENCES music_jobs (id),
     kind        TEXT NOT NULL CHECK (kind IN ('stem', 'version')),
     name        TEXT NOT NULL,
     pathname    TEXT NOT NULL,
     codec       TEXT NOT NULL,
     duration_s  DOUBLE PRECISION NOT NULL,
     sample_rate INTEGER NOT NULL,
     channels    INTEGER NOT NULL,
     size_bytes  DOUBLE PRECISION NOT NULL,
     rms_dbfs    DOUBLE PRECISION,
     created_at  DOUBLE PRECISION NOT NULL,
     UNIQUE (job_id, kind, name)
   )`,
  // A playlist's vibe profile (from titles/artists), cached per exact track list.
  `CREATE TABLE IF NOT EXISTS music_vibes (
     user_id       TEXT NOT NULL,
     key           TEXT NOT NULL,
     playlist_name TEXT,
     profile_json  TEXT NOT NULL,
     created_at    DOUBLE PRECISION NOT NULL,
     PRIMARY KEY (user_id, key)
   )`,
  // Worker liveness, so the app can tell "waiting in line" from "nobody is processing".
  `CREATE TABLE IF NOT EXISTS music_workers (
     id      TEXT PRIMARY KEY,
     device  TEXT,
     seen_at DOUBLE PRECISION NOT NULL
   )`,
];
