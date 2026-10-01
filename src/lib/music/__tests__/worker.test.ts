import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getJob } from "@/app/api/music/jobs/[id]/route";
import { POST as finishAudio } from "@/app/api/music/tracks/[id]/audio/route";
import { POST as processRoute } from "@/app/api/music/tracks/[id]/process/route";
import { POST as beginUpload } from "@/app/api/music/tracks/[id]/upload/route";
import { POST as addRoute } from "@/app/api/music/tracks/route";
import { setTestVerifier } from "../server/auth";
import { q, setExecutorForTests } from "../server/db";
import { setStorageForTests } from "../server/storage";
import type { JobView } from "../types";
import { ctx, fixtures, MemStorage, req, testDatabase, testVerifier } from "./helpers";
import { claimJob, completeWithWorker, OUTPUT_FILES, WORKER, workerCall } from "./workerHelpers";

let database: Awaited<ReturnType<typeof testDatabase>>;
let storage: MemStorage;
let mp3: Buffer;

beforeAll(async () => {
  database = await testDatabase();
  setTestVerifier(testVerifier);
  mp3 = fixtures().mp3;
});
afterAll(async () => {
  setTestVerifier(null);
  setExecutorForTests(null);
  await database.close();
});
beforeEach(async () => {
  await database.reset();
  storage = new MemStorage();
  setStorageForTests(storage);
  vi.stubEnv("MUSIC_SIGNING_SECRET", "test-secret");
  vi.stubEnv("MUSIC_WORKER_TOKEN", "worker-secret");
});
afterEach(() => {
  setStorageForTests(null);
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

/** A user track with audio and a queued job. */
async function queuedJob(user = "user-a"): Promise<string> {
  const t = (await (await addRoute(req("POST", "/x", { user, body: JSON.stringify({ title: "Song" }) }), undefined)).json()).track;
  const start = await (await beginUpload(req("POST", "/x", { user, body: JSON.stringify({ name: "a.mp3", type: "audio/mpeg", size: mp3.byteLength }) }), ctx({ id: t.id }))).json();
  storage.putTo(start.uploadUrl, new Uint8Array(mp3), start.contentType);
  await finishAudio(req("POST", "/x", { user, body: JSON.stringify({ ticket: start.ticket }) }), ctx({ id: t.id }));
  return (await (await processRoute(req("POST", "/x", { user }), ctx({ id: t.id }))).json()).job_id;
}

const userJob = async (id: string, user = "user-a"): Promise<JobView> =>
  (await (await getJob(req("GET", "/x", { user }), ctx({ id }))).json()).job;

describe("worker endpoints", () => {
  it("require the worker token, and are off when no token is configured", async () => {
    expect((await claimJob({}, { authorization: "Bearer nope" })).status).toBe(401);
    expect((await claimJob({}, {})).status).toBe(401);
    expect((await claimJob({}, { authorization: "Bearer user-a" })).status).toBe(401); // a user token isn't a worker token
    vi.stubEnv("MUSIC_WORKER_TOKEN", "");
    expect((await claimJob()).status).toBe(503);
  });

  it("claim the oldest queued job once, with a download link for its audio", async () => {
    expect((await claimJob()).body).toEqual({ job: null });
    const id = await queuedJob();
    const { body } = await claimJob();
    expect(body.job).toMatchObject({ id, attempts: 1, model: "htdemucs", container: "mp3" });
    expect(storage.pathOf(body.job.sourceUrl)).toMatch(/^sources\/[a-f0-9]{32}\.mp3$/);
    expect((await claimJob({ workerId: "other:2" })).body).toEqual({ job: null }); // already taken
    expect((await userJob(id)).status).toBe("processing");
  });

  it("show the listener real progress, then the finalizing stage", async () => {
    const id = await queuedJob();
    expect((await userJob(id)).workerOnline).toBe(false);
    await claimJob();
    expect((await workerCall("heartbeat", id, { status: "processing", progress: 0.42, device: "cpu" })).body).toEqual({ owned: true });
    expect(await userJob(id)).toMatchObject({ status: "processing", progress: 0.42, device: "cpu" });
    await workerCall("heartbeat", id, { status: "finalizing", progress: null });
    expect(await userJob(id)).toMatchObject({ status: "finalizing", progress: null });
  });

  it("knows when a worker is online", async () => {
    const id = await queuedJob();
    expect((await userJob(id)).workerOnline).toBe(false);
    await claimJob(); // claims this job…
    const id2 = await queuedJob("user-b");
    expect((await userJob(id2, "user-b")).workerOnline).toBe(true); // …and counts as a live worker
  });

  it("complete only when every output is really in storage", async () => {
    const id = await queuedJob();
    const missing = await completeWithWorker(storage, id, { skip: "bass" });
    expect(missing.status).toBe(400);

    // Reported sizes must match what was stored.
    const outputs = OUTPUT_FILES.map((file) => ({ file, codec: "aac", durationS: 3, sampleRate: 44100, channels: 2, sizeBytes: 999_999, rmsDbfs: -20 }));
    expect((await workerCall("complete", id, { outputs })).body.error.code).toBe("outputs_missing");
    expect((await userJob(id)).status).toBe("processing");
  });

  it("can't touch a job another worker owns", async () => {
    const id = await queuedJob();
    await claimJob();
    await q.run("UPDATE music_jobs SET worker_id = 'someone-else' WHERE id = ?", id);
    expect((await workerCall("heartbeat", id, { progress: 0.5 })).body).toEqual({ owned: false });
    expect((await workerCall("upload-urls", id, {})).status).toBe(409);
    expect((await workerCall("fail", id, { code: "internal" })).body).toEqual({ status: null });
    expect((await userJob(id)).status).toBe("processing");
  });

  it("retry retryable failures, then fail with the reason the listener sees", async () => {
    const id = await queuedJob();
    await claimJob();
    expect((await workerCall("fail", id, { code: "model_unavailable", message: "The model couldn't load.", retryable: true })).body).toEqual({ status: "queued" });
    await claimJob(); // attempt 2 (MUSIC_MAX_ATTEMPTS = 2)
    expect((await workerCall("fail", id, { code: "model_unavailable", message: "The model couldn't load.", retryable: true })).body).toEqual({ status: "failed" });
    expect((await userJob(id)).error).toEqual({ code: "model_unavailable", message: "The model couldn't load." });
  });

  it("don't retry permanent failures, and sanitize unknown codes", async () => {
    const id = await queuedJob();
    await claimJob();
    await workerCall("fail", id, { code: "rm -rf /", message: "x".repeat(1000) });
    const job = await userJob(id);
    expect(job.status).toBe("failed");
    expect(job.error?.code).toBe("internal");
    expect(job.error!.message.length).toBeLessThanOrEqual(300);
  });

  it("recover jobs from a worker that stopped checking in", async () => {
    const id = await queuedJob();
    await claimJob();
    vi.useFakeTimers({ now: Date.now() + 5 * 60_000, toFake: ["Date"] });
    const again = await claimJob({ workerId: "fresh:1" }); // recovery runs before claiming
    expect(again.body.job).toMatchObject({ id, attempts: 2 });
    vi.setSystemTime(Date.now() + 5 * 60_000);
    expect((await claimJob({ workerId: "fresh:2" })).body).toEqual({ job: null });
    expect((await userJob(id)).error?.code).toBe("worker_crashed");
  });

  it("finish the job: outputs recorded, source duration learned", async () => {
    const id = await queuedJob();
    const res = await completeWithWorker(storage, id, { sourceDurationS: 153.08 });
    expect(res).toEqual({ status: 200, body: { ok: true } });
    expect(await userJob(id)).toMatchObject({ status: "completed", progress: 1, error: null });
    const outs = await q.all<{ kind: string; name: string; pathname: string }>("SELECT kind, name, pathname FROM music_outputs ORDER BY kind, name");
    expect(outs).toHaveLength(8);
    expect(outs.find((o) => o.name === "beats_only")?.pathname).toBe(`outputs/${id}/drums.m4a`);
    expect((await q.get<{ d: number }>("SELECT duration_s AS d FROM music_sources"))!.d).toBe(153.08);
    // A second completion is refused: the worker no longer owns a finished job.
    expect((await workerCall("complete", id, { outputs: [] })).status).toBe(409);
  });

  it("validate worker ids", async () => {
    expect((await claimJob({ workerId: "bad id with spaces" })).status).toBe(400);
    expect(WORKER).toMatch(/^[\w.:@-]+$/);
  });
});
