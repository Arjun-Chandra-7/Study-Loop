import "server-only";
import { createHash } from "node:crypto";
import type { JobStatus, JobView, StudyMode, TrackView, VersionsView } from "../types";
import { loadPipeline, musicConfig, type Pipeline } from "./config";
import { isUniqueViolation, newId, q } from "./db";
import { ApiError } from "./http";
import { log } from "./log";
import type { ImportedTrack } from "./spotify";
import { getStorage } from "./storage";
import type { ReceivedAudio } from "./upload";

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
  pathname: string;
  mime: string;
  container: string;
  duration_s: number | null;
  size_bytes: number;
}
interface JobRow {
  id: string;
  user_id: string;
  cache_key: string;
  status: JobStatus;
  progress: number | null;
  device: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: number;
}

export const WORKER_FRESH_MS = 30_000;
const ID = /^[a-f0-9]{32}$/;

const notFound = () => new ApiError(404, "not_found", "That track isn't in your library.");

/** Deterministic processing identity: same audio bytes + same model/config ⇒ same key ⇒ no re-run. */
export function cacheKey(sourceSha256: string, p: Pipeline = loadPipeline()): string {
  const identity = { source: sourceSha256, pipeline: p.pipelineVersion, model: p.model, modelVersion: p.modelVersion, params: p.params };
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

const workerOnline = async () =>
  Boolean(await q.get("SELECT 1 AS ok FROM music_workers WHERE seen_at > ?", Date.now() - WORKER_FRESH_MS));

function toJobView(j: JobRow, online: boolean | null, extra: Partial<JobView> = {}): JobView {
  return {
    id: j.id,
    status: j.status,
    progress: j.status === "processing" ? j.progress : j.status === "completed" ? 1 : null,
    error: j.status === "failed" ? { code: j.error_code ?? "internal", message: j.error_message ?? "Processing failed." } : null,
    device: j.device,
    ...(j.status === "queued" && online !== null ? { workerOnline: online } : {}),
    ...extra,
  };
}

/** The job that represents a key: a live/completed one if any, else the latest failure. */
function pickJob(jobs: JobRow[]): JobRow | undefined {
  return [...jobs].sort((a, b) => Number(b.status !== "failed") - Number(a.status !== "failed") || b.created_at - a.created_at)[0];
}

async function views(uid: string, tracks: TrackRow[]): Promise<TrackView[]> {
  const sourceIds = [...new Set(tracks.map((t) => t.source_id).filter((s): s is string => Boolean(s)))];
  const sources = sourceIds.length
    ? await q.all<SourceRow>("SELECT * FROM music_sources WHERE user_id = ? AND id = ANY(?)", uid, sourceIds)
    : [];
  const byId = new Map(sources.map((s) => [s.id, s]));
  const keys = sources.map((s) => cacheKey(s.sha256));
  const jobs = keys.length ? await q.all<JobRow>("SELECT * FROM music_jobs WHERE user_id = ? AND cache_key = ANY(?)", uid, keys) : [];
  const online = jobs.some((j) => j.status === "queued") ? await workerOnline() : null;
  return tracks.map((t) => {
    const source = t.source_id ? byId.get(t.source_id) : undefined;
    const job = source ? pickJob(jobs.filter((j) => j.cache_key === cacheKey(source.sha256))) : undefined;
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
      job: job ? toJobView(job, online) : null,
    };
  });
}

export async function ownedTrack(uid: string, id: string): Promise<TrackRow> {
  const t = ID.test(id) ? await q.get<TrackRow>("SELECT * FROM music_tracks WHERE id = ? AND user_id = ?", id, uid) : undefined;
  if (!t) throw notFound();
  return t;
}

async function ownedSource(uid: string, track: TrackRow): Promise<SourceRow> {
  const s = track.source_id
    ? await q.get<SourceRow>("SELECT * FROM music_sources WHERE id = ? AND user_id = ?", track.source_id, uid)
    : undefined;
  if (!s) throw new ApiError(409, "no_audio", "Add an audio file for this track first.");
  return s;
}

export async function listTracks(uid: string): Promise<TrackView[]> {
  return views(uid, await q.all<TrackRow>("SELECT * FROM music_tracks WHERE user_id = ? ORDER BY created_at DESC, id", uid));
}

export async function getTrack(uid: string, id: string): Promise<TrackView> {
  return (await views(uid, [await ownedTrack(uid, id)]))[0];
}

const clean = (s: unknown, max: number) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim().slice(0, max) : "");

export async function addTrack(uid: string, input: { title?: unknown; artist?: unknown }): Promise<TrackView> {
  const title = clean(input.title, 200);
  const artist = clean(input.artist, 200);
  if (!title) throw new ApiError(400, "invalid_track", "Give the track a name.");
  const id = newId();
  const now = Date.now();
  await q.run("INSERT INTO music_tracks (id, user_id, title, artist, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", id, uid, title, artist, now, now);
  log("track_added", { trackId: id, via: "manual" });
  return getTrack(uid, id);
}

export async function importTracks(uid: string, playlistName: string | null, tracks: ImportedTrack[]): Promise<{ added: number; total: number }> {
  const known = new Set(
    (await q.all<{ s: string }>("SELECT spotify_track_id AS s FROM music_tracks WHERE user_id = ? AND spotify_track_id IS NOT NULL", uid)).map((r) => r.s),
  );
  const added = new Set(tracks.map((t) => t.spotifyTrackId).filter((id) => !known.has(id))).size;
  const now = Date.now();
  // Later created_at for earlier tracks keeps playlist order in the newest-first library.
  await q.batch(
    tracks.map((t, i) => [
      `INSERT INTO music_tracks (id, user_id, title, artist, album, artwork_url, duration_ms, spotify_track_id,
         spotify_url, playlist_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, spotify_track_id) WHERE spotify_track_id IS NOT NULL DO UPDATE SET
         title = excluded.title, artist = excluded.artist, album = excluded.album,
         artwork_url = excluded.artwork_url, duration_ms = excluded.duration_ms, updated_at = excluded.updated_at`,
      newId(), uid, t.title, t.artist, t.album, t.artworkUrl, t.durationMs, t.spotifyTrackId, t.spotifyUrl,
      playlistName, now + (tracks.length - i), now,
    ]),
  );
  log("spotify_imported", { total: tracks.length, added });
  return { added, total: tracks.length };
}

/** Attach checked audio to a track, reusing the user's existing copy of identical bytes. */
export async function attachAudio(uid: string, trackId: string, audio: ReceivedAudio): Promise<TrackView> {
  await ownedTrack(uid, trackId);
  let source = await q.get<SourceRow>("SELECT * FROM music_sources WHERE user_id = ? AND sha256 = ?", uid, audio.sha256);
  const reused = Boolean(source);
  if (source) {
    if (source.pathname !== audio.pathname) await getStorage().remove(audio.pathname);
  } else {
    const id = newId();
    try {
      await q.run(
        `INSERT INTO music_sources (id, user_id, sha256, pathname, mime, container, size_bytes, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        id, uid, audio.sha256, audio.pathname, audio.mime, audio.container, audio.sizeBytes, Date.now(),
      );
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // same bytes uploaded twice at once: keep the first
      await getStorage().remove(audio.pathname);
    }
    source = await q.get<SourceRow>("SELECT * FROM music_sources WHERE user_id = ? AND sha256 = ?", uid, audio.sha256);
  }
  await q.run("UPDATE music_tracks SET source_id = ?, updated_at = ? WHERE id = ? AND user_id = ?", source!.id, Date.now(), trackId, uid);
  log("audio_uploaded", { trackId, sourceId: source!.id, bytes: audio.sizeBytes, container: audio.container, reused });
  return getTrack(uid, trackId);
}

/** Queue separation, or hand back the existing job for identical audio + config (the cache). */
export async function requestProcessing(uid: string, trackId: string): Promise<{ job: JobView; created: boolean }> {
  const source = await ownedSource(uid, await ownedTrack(uid, trackId));
  const p = loadPipeline();
  const key = cacheKey(source.sha256, p);
  const live = () => q.get<JobRow>("SELECT * FROM music_jobs WHERE user_id = ? AND cache_key = ? AND status != 'failed'", uid, key);

  const existing = await live();
  if (existing) {
    log("job_reused", { jobId: existing.id, trackId, status: existing.status });
    return { job: toJobView(existing, await workerOnline(), { cached: existing.status === "completed" }), created: false };
  }
  const id = newId();
  try {
    await q.run(
      `INSERT INTO music_jobs (id, user_id, source_id, cache_key, model, model_version, params_json, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', ?)`,
      id, uid, source.id, key, p.model, p.modelVersion, JSON.stringify(p.params), Date.now(),
    );
  } catch (e) {
    // Lost a race with a concurrent request for the same audio: use the winner's job.
    if (!isUniqueViolation(e)) throw e;
    const winner = await live();
    if (winner) return { job: toJobView(winner, await workerOnline()), created: false };
    throw e;
  }
  log("job_created", { jobId: id, trackId, sourceId: source.id, model: p.model, modelVersion: p.modelVersion });
  const job = (await q.get<JobRow>("SELECT * FROM music_jobs WHERE id = ?", id))!;
  return { job: toJobView(job, await workerOnline()), created: true };
}

export async function getJob(uid: string, jobId: string): Promise<JobView> {
  const j = ID.test(jobId) ? await q.get<JobRow>("SELECT * FROM music_jobs WHERE id = ? AND user_id = ?", jobId, uid) : undefined;
  if (!j) throw new ApiError(404, "not_found", "That processing job doesn't exist.");
  return toJobView(j, j.status === "queued" ? await workerOnline() : null);
}

/** Short-lived playback links (Blob CDN, Range-capable) for every version that exists. */
export async function trackVersions(uid: string, trackId: string): Promise<VersionsView> {
  const source = await ownedSource(uid, await ownedTrack(uid, trackId));
  const job = pickJob(await q.all<JobRow>("SELECT * FROM music_jobs WHERE user_id = ? AND cache_key = ?", uid, cacheKey(source.sha256)));
  const { urlTtlS } = musicConfig();
  const storage = getStorage();
  const versions: VersionsView["versions"] = {};
  if (job?.status === "completed") {
    const outs = await q.all<{ name: StudyMode; pathname: string; duration_s: number }>(
      "SELECT name, pathname, duration_s FROM music_outputs WHERE job_id = ? AND kind = 'version'", job.id,
    );
    for (const o of outs) versions[o.name] = { url: await storage.presignGet(o.pathname, { ttlS: urlTtlS }), durationS: o.duration_s };
  }
  if (!versions.original) {
    // Before processing, "Original" plays the upload itself.
    versions.original = { url: await storage.presignGet(source.pathname, { ttlS: urlTtlS }), durationS: source.duration_s ?? 0 };
  }
  return { trackId, versions, expiresAt: Date.now() + urlTtlS * 1000 };
}
