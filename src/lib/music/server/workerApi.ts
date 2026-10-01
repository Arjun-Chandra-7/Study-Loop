import "server-only";
import { timingSafeEqual } from "node:crypto";
import { musicConfig } from "./config";
import { newId, q } from "./db";
import { ApiError } from "./http";
import { log } from "./log";
import { getStorage } from "./storage";

/**
 * Endpoints the separation worker calls. The worker never touches the database or storage
 * credentials: it claims jobs, reports progress and gets presigned links through these.
 */
const OUTPUT_FILES = ["original", "no_lyrics", "vocals", "drums", "bass", "other"] as const;
type OutputFile = (typeof OUTPUT_FILES)[number];
const VERSION_FILES: Record<string, OutputFile> = { original: "original", no_lyrics: "no_lyrics", vocals_only: "vocals", beats_only: "drums" };
const STEMS = ["vocals", "drums", "bass", "other"];
const ERROR_CODES = new Set([
  "corrupted_audio", "too_long", "source_missing", "disk_full", "model_unavailable", "timeout",
  "ffmpeg_failed", "separation_failed", "storage_failed", "worker_crashed", "internal",
]);
const LINK_TTL_S = 30 * 60;
const ID = /^[a-f0-9]{32}$/;
const WORKER_ID = /^[\w.:@-]{1,100}$/;

export function requireWorker(req: Request) {
  const { workerToken } = musicConfig();
  if (!workerToken) throw new ApiError(503, "worker_disabled", "Processing workers aren't configured on this server.");
  const got = Buffer.from((req.headers.get("authorization") ?? "").replace(/^Bearer /, ""));
  const want = Buffer.from(workerToken);
  if (got.length !== want.length || !timingSafeEqual(got, want)) throw new ApiError(401, "unauthorized", "Bad worker token.");
}

function workerId(v: unknown): string {
  if (typeof v !== "string" || !WORKER_ID.test(v)) throw new ApiError(400, "bad_request", "workerId required.");
  return v;
}
function jobId(v: string): string {
  if (!ID.test(v)) throw new ApiError(404, "not_found", "No such job.");
  return v;
}
const outputPath = (job: string, file: OutputFile) => `outputs/${job}/${file}.m4a`;

async function beat(worker: string, device: unknown) {
  await q.run(
    `INSERT INTO music_workers (id, device, seen_at) VALUES (?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET device = COALESCE(excluded.device, music_workers.device), seen_at = excluded.seen_at`,
    worker, typeof device === "string" ? device.slice(0, 20) : null, Date.now(),
  );
}

/** Jobs whose worker stopped checking in: requeue while attempts remain, otherwise fail them. */
export async function recoverStale(): Promise<{ id: string; status: string }[]> {
  const { staleAfterS, maxAttempts } = musicConfig();
  const now = Date.now();
  const rows = await q.all<{ id: string; status: string }>(
    `UPDATE music_jobs SET
       status = CASE WHEN attempts < ?::int THEN 'queued' ELSE 'failed' END,
       completed_at = CASE WHEN attempts < ?::int THEN NULL ELSE ?::float8 END,
       worker_id = NULL, progress = NULL, heartbeat_at = ?,
       error_code = 'worker_crashed', error_message = 'Processing stopped unexpectedly. Try again.'
     WHERE status IN ('processing', 'finalizing') AND heartbeat_at < ?
     RETURNING id, status`,
    maxAttempts, maxAttempts, now, now, now - staleAfterS * 1000,
  );
  for (const r of rows) log("job_recovered", { jobId: r.id, action: r.status === "queued" ? "requeued" : "failed" });
  return rows;
}

export async function claim(body: { workerId?: unknown; device?: unknown }) {
  const worker = workerId(body.workerId);
  await beat(worker, body.device);
  await recoverStale();
  const now = Date.now();
  const job = await q.get<{ id: string; source_id: string; attempts: number; model: string; model_version: string }>(
    `UPDATE music_jobs SET status = 'processing', progress = NULL, attempts = attempts + 1, worker_id = ?,
       heartbeat_at = ?, started_at = ?, error_code = NULL, error_message = NULL
     WHERE id = (SELECT id FROM music_jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
     RETURNING id, source_id, attempts, model, model_version`,
    worker, now, now,
  );
  if (!job) return { job: null };
  const src = await q.get<{ pathname: string; container: string }>("SELECT pathname, container FROM music_sources WHERE id = ?", job.source_id);
  if (!src) {
    await fail(job.id, { workerId: worker, code: "source_missing", retryable: false });
    return { job: null };
  }
  log("job_claimed", { jobId: job.id, worker, attempt: job.attempts });
  return {
    job: {
      id: job.id,
      attempts: job.attempts,
      model: job.model,
      modelVersion: job.model_version,
      container: src.container,
      sourceUrl: await getStorage().presignGet(src.pathname, { ttlS: LINK_TTL_S }),
      maxDurationS: musicConfig().maxDurationS,
    },
  };
}

export async function heartbeat(id: string, body: { workerId?: unknown; status?: unknown; progress?: unknown; device?: unknown }) {
  const worker = workerId(body.workerId);
  const status = body.status === "finalizing" ? "finalizing" : "processing";
  const progress = typeof body.progress === "number" && body.progress >= 0 && body.progress <= 1 ? body.progress : null;
  await beat(worker, body.device);
  const row = await q.get(
    `UPDATE music_jobs SET heartbeat_at = ?, status = ?, progress = ?, device = COALESCE(?, device)
     WHERE id = ? AND worker_id = ? AND status IN ('processing', 'finalizing') RETURNING id`,
    Date.now(), status, progress, typeof body.device === "string" ? body.device.slice(0, 20) : null, jobId(id), worker,
  );
  return { owned: Boolean(row) };
}

async function assertOwned(id: string, worker: string) {
  const row = await q.get("SELECT 1 AS ok FROM music_jobs WHERE id = ? AND worker_id = ? AND status IN ('processing', 'finalizing')", jobId(id), worker);
  if (!row) throw new ApiError(409, "not_owned", "This worker no longer owns the job.");
}

export async function uploadUrls(id: string, body: { workerId?: unknown }) {
  await assertOwned(id, workerId(body.workerId));
  const storage = getStorage();
  const urls: Record<string, string> = {};
  for (const f of OUTPUT_FILES) {
    urls[f] = await storage.presignPut(outputPath(id, f), { contentType: "audio/mp4", maxBytes: 400 * 1048576, ttlS: LINK_TTL_S });
  }
  return { contentType: "audio/mp4", urls };
}

interface OutputReport {
  file: OutputFile;
  codec: string;
  durationS: number;
  sampleRate: number;
  channels: number;
  sizeBytes: number;
  rmsDbfs: number | null;
}

export async function complete(id: string, body: { workerId?: unknown; device?: unknown; timings?: unknown; sourceDurationS?: unknown; outputs?: unknown }) {
  const worker = workerId(body.workerId);
  await assertOwned(id, worker);
  const reports = Array.isArray(body.outputs) ? (body.outputs as OutputReport[]) : [];
  const byFile = new Map(reports.filter((r) => (OUTPUT_FILES as readonly string[]).includes(r?.file)).map((r) => [r.file, r]));
  if (byFile.size !== OUTPUT_FILES.length) throw new ApiError(400, "bad_request", "All six outputs are required.");
  // Trust but verify: every file must actually be in storage at the reported size.
  const storage = getStorage();
  for (const [file, r] of byFile) {
    const meta = await storage.head(outputPath(id, file));
    if (!meta || meta.size !== r.sizeBytes) throw new ApiError(400, "outputs_missing", `Output ${file} isn't in storage.`);
  }
  const row = (file: OutputFile, kind: "stem" | "version", name: string) => {
    const r = byFile.get(file)!;
    return {
      id: newId(), kind, name, pathname: outputPath(id, file), codec: String(r.codec).slice(0, 20),
      duration_s: Number(r.durationS), sample_rate: Math.round(Number(r.sampleRate)), channels: Math.round(Number(r.channels)),
      size_bytes: Number(r.sizeBytes), rms_dbfs: typeof r.rmsDbfs === "number" ? r.rmsDbfs : null,
    };
  };
  const rows = [
    ...STEMS.map((s) => row(s as OutputFile, "stem", s)),
    ...Object.entries(VERSION_FILES).map(([v, f]) => row(f, "version", v)),
  ];
  const now = Date.now();
  const duration = typeof body.sourceDurationS === "number" ? body.sourceDurationS : null;
  const done = await q.all(
    `WITH j AS (
       UPDATE music_jobs SET status = 'completed', progress = 1, device = COALESCE(?::text, device), timings_json = ?,
         completed_at = ?, heartbeat_at = ?
       WHERE id = ? AND worker_id = ? AND status IN ('processing', 'finalizing')
       RETURNING id, source_id
     ), s AS (
       UPDATE music_sources SET duration_s = COALESCE(?::float8, duration_s) WHERE id = (SELECT source_id FROM j)
     )
     INSERT INTO music_outputs (id, job_id, kind, name, pathname, codec, duration_s, sample_rate, channels, size_bytes, rms_dbfs, created_at)
     SELECT x.id, j.id, x.kind, x.name, x.pathname, x.codec, x.duration_s, x.sample_rate, x.channels, x.size_bytes, x.rms_dbfs, ?::float8
     FROM j CROSS JOIN json_to_recordset(?::json) AS x(id text, kind text, name text, pathname text, codec text,
       duration_s float8, sample_rate int, channels int, size_bytes float8, rms_dbfs float8)
     RETURNING job_id`,
    typeof body.device === "string" ? body.device.slice(0, 20) : null, JSON.stringify(body.timings ?? {}), now, now,
    id, worker, duration, now, JSON.stringify(rows),
  );
  if (!done.length) throw new ApiError(409, "not_owned", "This worker no longer owns the job.");
  log("job_completed", { jobId: id, worker, device: body.device, timings: body.timings });
  return { ok: true };
}

export async function fail(id: string, body: { workerId?: unknown; code?: unknown; message?: unknown; retryable?: unknown }) {
  const worker = workerId(body.workerId);
  const code = typeof body.code === "string" && ERROR_CODES.has(body.code) ? body.code : "internal";
  const message = typeof body.message === "string" && body.message ? body.message.slice(0, 300) : "Processing failed. Try again.";
  const { maxAttempts } = musicConfig();
  const now = Date.now();
  const row = await q.get<{ status: string }>(
    `UPDATE music_jobs SET
       status = CASE WHEN ?::boolean AND attempts < ?::int THEN 'queued' ELSE 'failed' END,
       completed_at = CASE WHEN ?::boolean AND attempts < ?::int THEN NULL ELSE ?::float8 END,
       worker_id = NULL, progress = NULL, heartbeat_at = ?, error_code = ?, error_message = ?
     WHERE id = ? AND worker_id = ? AND status IN ('processing', 'finalizing')
     RETURNING status`,
    body.retryable === true, maxAttempts, body.retryable === true, maxAttempts, now, now, code, message, jobId(id), worker,
  );
  log("job_failed", { jobId: id, worker, code, requeued: row?.status === "queued" });
  return { status: row?.status ?? null };
}
