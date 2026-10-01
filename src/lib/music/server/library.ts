import "server-only";
import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import type { JobStatus, JobView, StudyMode, TrackView, VersionsView } from "../types";
import { loadPipeline, type Pipeline } from "./config";
import { newId, q, tx } from "./db";
import { dataPath, ownerTag, signFile, type FileClaim } from "./files";
import { ApiError } from "./http";
import { log } from "./log";
import type { ImportedTrack } from "./spotify";
import { storeSource, type ReceivedAudio } from "./upload";

interface TrackRow {
  id: string;
  user_id: string;
  title: string;
  artist: string;
  album: string | null;
  artwork_url: string | null;
  duration_ms: number | null;
  spotify_track_id: string | null;
  spotify_url: string | null;
  playlist_name: string | null;
  source_id: string | null;
}
interface SourceRow {
  id: string;
  sha256: string;
  file_path: string;
  mime: string;
  container: string;
  duration_s: number;
  size_bytes: number;
}
interface JobRow {
  id: string;
  user_id: string;
  status: JobStatus;
  progress: number | null;
  device: string | null;
  error_code: string | null;
  error_message: string | null;
}

const WORKER_FRESH_MS = 30_000;
const ID = /^[a-f0-9]{32}$/;

const notFound = () => new ApiError(404, "not_found", "That track isn't in your library.");

/** Deterministic processing identity: same audio bytes + same model/config ⇒ same key ⇒ no re-run. */
export function cacheKey(sourceSha256: string, p: Pipeline = loadPipeline()): string {
  const identity = { source: sourceSha256, pipeline: p.pipelineVersion, model: p.model, modelVersion: p.modelVersion, params: p.params };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

const workerOnline = () =>
  Boolean(q.get("SELECT 1 AS ok FROM music_workers WHERE seen_at > ?", Date.now() - WORKER_FRESH_MS));

function toJobView(j: JobRow, extra: Partial<JobView> = {}): JobView {
  return {
    id: j.id,
    status: j.status,
    progress: j.status === "processing" ? j.progress : j.status === "completed" ? 1 : null,
    error: j.status === "failed" ? { code: j.error_code ?? "internal", message: j.error_message ?? "Processing failed." } : null,
    device: j.device,
    ...(j.status === "queued" ? { workerOnline: workerOnline() } : {}),
    ...extra,
  };
}

function currentJob(uid: string, source: SourceRow | undefined): JobRow | undefined {
  if (!source) return undefined;
  return q.get<JobRow>(
    `SELECT * FROM music_jobs WHERE user_id = ? AND cache_key = ?
     ORDER BY (status != 'failed') DESC, created_at DESC LIMIT 1`,
    uid, cacheKey(source.sha256),
  );
}

function toTrackView(uid: string, t: TrackRow): TrackView {
  const source = t.source_id ? q.get<SourceRow>("SELECT * FROM music_sources WHERE id = ?", t.source_id) : undefined;
  const job = currentJob(uid, source);
  return {
    id: t.id,
    title: t.title,
    artist: t.artist,
    album: t.album,
    artworkUrl: t.artwork_url,
    durationMs: t.duration_ms,
    spotifyUrl: t.spotify_url,
    playlistName: t.playlist_name,
    audio: source ? { durationS: source.duration_s, sizeBytes: source.size_bytes, container: source.container } : null,
    job: job ? toJobView(job) : null,
  };
}

export function ownedTrack(uid: string, id: string): TrackRow {
  const t = ID.test(id) ? q.get<TrackRow>("SELECT * FROM music_tracks WHERE id = ? AND user_id = ?", id, uid) : undefined;
  if (!t) throw notFound();
  return t;
}

export function listTracks(uid: string): TrackView[] {
  return q
    .all<TrackRow>("SELECT * FROM music_tracks WHERE user_id = ? ORDER BY created_at DESC, rowid DESC", uid)
    .map((t) => toTrackView(uid, t));
}

export function getTrack(uid: string, id: string): TrackView {
  return toTrackView(uid, ownedTrack(uid, id));
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

export function addTrack(uid: string, input: { title?: unknown; artist?: unknown }): TrackView {
  const title = clean(input.title, 200);
  const artist = clean(input.artist, 200);
  if (!title) throw new ApiError(400, "invalid_track", "Give the track a name.");
  const id = newId();
  const now = Date.now();
  q.run(
    "INSERT INTO music_tracks (id, user_id, title, artist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    id, uid, title, artist, now, now,
  );
  log("track_added", { trackId: id, via: "manual" });
  return getTrack(uid, id);
}

export function importTracks(uid: string, playlistName: string | null, tracks: ImportedTrack[]): { added: number; total: number } {
  const known = new Set(
    q.all<{ s: string }>("SELECT spotify_track_id AS s FROM music_tracks WHERE user_id = ? AND spotify_track_id IS NOT NULL", uid).map((r) => r.s),
  );
  const added = new Set(tracks.map((t) => t.spotifyTrackId).filter((id) => !known.has(id))).size;
  const now = Date.now();
  tx(() => {
    // Later created_at for earlier tracks keeps playlist order in the newest-first library.
    tracks.forEach((t, i) => {
      q.run(
        `INSERT INTO music_tracks (id, user_id, title, artist, album, artwork_url, duration_ms, spotify_track_id,
           spotify_url, playlist_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, spotify_track_id) WHERE spotify_track_id IS NOT NULL DO UPDATE SET
           title = excluded.title, artist = excluded.artist, album = excluded.album,
           artwork_url = excluded.artwork_url, duration_ms = excluded.duration_ms, updated_at = excluded.updated_at`,
        newId(), uid, t.title, t.artist, t.album, t.artworkUrl, t.durationMs, t.spotifyTrackId, t.spotifyUrl,
        playlistName, now + (tracks.length - i), now,
      );
    });
  });
  log("spotify_imported", { total: tracks.length, added });
  return { added, total: tracks.length };
}

/** Attach validated audio to a track, reusing the user's existing copy of identical bytes. */
export async function attachAudio(uid: string, trackId: string, audio: ReceivedAudio): Promise<TrackView> {
  ownedTrack(uid, trackId);
  const existing = q.get<SourceRow>("SELECT * FROM music_sources WHERE user_id = ? AND sha256 = ?", uid, audio.sha256);
  let sourceId: string;
  if (existing) {
    await rm(audio.tmpFile, { force: true });
    sourceId = existing.id;
  } else {
    sourceId = newId();
    const rel = await storeSource(audio.tmpFile, sourceId, audio.container);
    try {
      q.run(
        `INSERT INTO music_sources (id, user_id, sha256, file_path, mime, container, codec, sample_rate, channels,
           duration_s, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        sourceId, uid, audio.sha256, rel, audio.mime, audio.container, audio.codec, audio.sampleRate,
        audio.channels, audio.durationS, audio.sizeBytes, Date.now(),
      );
    } catch (e) {
      await rm(dataPath(rel), { force: true });
      throw e;
    }
  }
  q.run("UPDATE music_tracks SET source_id = ?, updated_at = ? WHERE id = ? AND user_id = ?", sourceId, Date.now(), trackId, uid);
  log("audio_uploaded", { trackId, sourceId, bytes: audio.sizeBytes, durationS: Math.round(audio.durationS), container: audio.container, reused: Boolean(existing) });
  return getTrack(uid, trackId);
}

/** Queue separation, or hand back the existing job for identical audio + config (the cache). */
export function requestProcessing(uid: string, trackId: string): { job: JobView; created: boolean } {
  const track = ownedTrack(uid, trackId);
  const source = track.source_id ? q.get<SourceRow>("SELECT * FROM music_sources WHERE id = ?", track.source_id) : undefined;
  if (!source) throw new ApiError(409, "no_audio", "Add an audio file for this track first.");
  const p = loadPipeline();
  const key = cacheKey(source.sha256, p);
  const live = () =>
    q.get<JobRow>("SELECT * FROM music_jobs WHERE user_id = ? AND cache_key = ? AND status != 'failed'", uid, key);

  const existing = live();
  if (existing) {
    log("job_reused", { jobId: existing.id, trackId, status: existing.status });
    return { job: toJobView(existing, { cached: existing.status === "completed" }), created: false };
  }
  const id = newId();
  try {
    q.run(
      `INSERT INTO music_jobs (id, user_id, source_id, cache_key, model, model_version, params_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
      id, uid, source.id, key, p.model, p.modelVersion, JSON.stringify(p.params), Date.now(),
    );
  } catch (e) {
    // Lost a race with a concurrent request for the same audio: use the winner's job.
    const winner = live();
    if (winner) return { job: toJobView(winner), created: false };
    throw e;
  }
  log("job_created", { jobId: id, trackId, sourceId: source.id, model: p.model, modelVersion: p.modelVersion });
  return { job: toJobView(q.get<JobRow>("SELECT * FROM music_jobs WHERE id = ?", id)!), created: true };
}

export function getJob(uid: string, jobId: string): JobView {
  const j = ID.test(jobId) ? q.get<JobRow>("SELECT * FROM music_jobs WHERE id = ? AND user_id = ?", jobId, uid) : undefined;
  if (!j) throw new ApiError(404, "not_found", "That processing job doesn't exist.");
  return toJobView(j);
}

export function trackVersions(uid: string, trackId: string): VersionsView {
  const track = ownedTrack(uid, trackId);
  const source = track.source_id ? q.get<SourceRow>("SELECT * FROM music_sources WHERE id = ?", track.source_id) : undefined;
  if (!source) throw new ApiError(409, "no_audio", "Add an audio file for this track first.");
  const job = currentJob(uid, source);
  const versions: VersionsView["versions"] = {};
  let exp = 0;
  if (job?.status === "completed") {
    const outs = q.all<{ id: string; name: StudyMode; duration_s: number }>(
      "SELECT id, name, duration_s FROM music_outputs WHERE job_id = ? AND kind = 'version'", job.id,
    );
    for (const o of outs) {
      const s = signFile({ k: "o", id: o.id, uid });
      versions[o.name] = { url: s.url, durationS: o.duration_s };
      exp = s.exp;
    }
  }
  if (!versions.original) {
    // Before processing, "Original" plays the upload itself.
    const s = signFile({ k: "s", id: source.id, uid });
    versions.original = { url: s.url, durationS: source.duration_s };
    exp = s.exp;
  }
  return { trackId, versions, expiresAt: exp * 1000 };
}

/** Map a verified link back to a file its owner still has. */
export function resolveFile(claim: FileClaim): { file: string; mime: string } {
  if (!ID.test(claim.id)) throw new ApiError(404, "not_found", "Audio not found.");
  const row =
    claim.k === "o"
      ? q.get<{ file_path: string; mime: string; user_id: string }>(
          `SELECT o.file_path, 'audio/mp4' AS mime, j.user_id FROM music_outputs o JOIN music_jobs j ON j.id = o.job_id
           WHERE o.id = ?`, claim.id)
      : q.get<{ file_path: string; mime: string; user_id: string }>(
          "SELECT file_path, mime, user_id FROM music_sources WHERE id = ?", claim.id);
  if (!row || ownerTag(row.user_id) !== claim.u) throw new ApiError(404, "not_found", "Audio not found.");
  return { file: dataPath(row.file_path), mime: row.mime };
}
