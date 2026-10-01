import { rmSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getJob } from "@/app/api/music/jobs/[id]/route";
import { POST as finishAudio } from "@/app/api/music/tracks/[id]/audio/route";
import { POST as processRoute } from "@/app/api/music/tracks/[id]/process/route";
import { POST as beginUpload } from "@/app/api/music/tracks/[id]/upload/route";
import { GET as versionsRoute } from "@/app/api/music/tracks/[id]/versions/route";
import { GET as listRoute, POST as addRoute } from "@/app/api/music/tracks/route";
import { setTestVerifier } from "../server/auth";
import { q, setExecutorForTests } from "../server/db";
import { route } from "../server/http";
import { setStorageForTests } from "../server/storage";
import type { JobView, TrackView, VersionsView } from "../types";
import { ctx, fixtures, fixturesDir, MemStorage, req, testDatabase, testVerifier } from "./helpers";
import { completeWithWorker } from "./workerHelpers";

let fx: ReturnType<typeof fixtures>;
let database: Awaited<ReturnType<typeof testDatabase>>;
let storage: MemStorage;

beforeAll(async () => {
  fx = fixtures();
  database = await testDatabase();
  setTestVerifier(testVerifier);
});
afterAll(async () => {
  setTestVerifier(null);
  setExecutorForTests(null);
  await database.close();
  rmSync(fixturesDir, { recursive: true, force: true });
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
  vi.unstubAllGlobals();
});

async function addTrack(user = "user-a", title = "Clair de Lune", artist = "Debussy"): Promise<TrackView> {
  const res = await addRoute(req("POST", "/api/music/tracks", { user, body: JSON.stringify({ title, artist }) }), undefined);
  expect(res.status).toBe(201);
  return (await res.json()).track;
}

const begin = (trackId: string, file: { name: string; type: string; size: number }, user = "user-a") =>
  beginUpload(req("POST", "/x", { user, body: JSON.stringify(file) }), ctx({ id: trackId }));
const finish = (trackId: string, ticket: string, user = "user-a") =>
  finishAudio(req("POST", "/x", { user, body: JSON.stringify({ ticket }) }), ctx({ id: trackId }));

/** The whole browser flow: describe the file, PUT it to the presigned URL, finish with the ticket. */
async function upload(trackId: string, data: Buffer, name: string, type: string, user = "user-a") {
  const b = await begin(trackId, { name, type, size: data.byteLength }, user);
  if (b.status !== 200) return b;
  const start = (await b.json()) as { uploadUrl: string; contentType: string; ticket: string };
  const put = storage.putTo(start.uploadUrl, new Uint8Array(data), start.contentType);
  expect(put).toBe(200);
  return finish(trackId, start.ticket, user);
}

async function processTrack(trackId: string, user = "user-a") {
  const res = await processRoute(req("POST", "/x", { user }), ctx({ id: trackId }));
  return { status: res.status, body: (await res.json()) as { job_id: string; status: string; job: JobView } };
}

const sourceCount = async () => (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM music_sources"))!.n;

describe("authentication", () => {
  it("rejects requests without a valid token", async () => {
    expect((await listRoute(req("GET", "/x"), undefined)).status).toBe(401);
    const bad = await listRoute(req("GET", "/x", { user: "forged" }), undefined);
    expect(bad.status).toBe(401);
    expect((await bad.json()).error.code).toBe("unauthorized");
  });

  it("starts with an empty library", async () => {
    expect(await (await listRoute(req("GET", "/x", { user: "user-a" }), undefined)).json()).toEqual({ tracks: [] });
  });
});

describe("ownership", () => {
  it("hides one user's tracks, uploads, jobs and audio from another", async () => {
    const t = await addTrack("user-a");
    expect((await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg")).status).toBe(200);
    const { body } = await processTrack(t.id);

    const asB = { user: "user-b" };
    expect((await (await listRoute(req("GET", "/x", asB), undefined)).json()).tracks).toEqual([]);
    expect((await begin(t.id, { name: "x.mp3", type: "audio/mpeg", size: 10 }, "user-b")).status).toBe(404);
    expect((await processTrack(t.id, "user-b")).status).toBe(404);
    expect((await versionsRoute(req("GET", "/x", asB), ctx({ id: t.id }))).status).toBe(404);
    expect((await getJob(req("GET", "/x", asB), ctx({ id: body.job_id }))).status).toBe(404);

    // A ticket issued to user A can't attach a file to user B's track.
    const tb = await addTrack("user-b", "B's track");
    const start = await (await begin(t.id, { name: "s.mp3", type: "audio/mpeg", size: fx.mp3b.byteLength })).json();
    storage.putTo(start.uploadUrl, new Uint8Array(fx.mp3b), start.contentType);
    expect((await finish(tb.id, start.ticket, "user-b")).status).toBe(400);
  });

  it("treats malformed ids as not found", async () => {
    const res = await versionsRoute(req("GET", "/x", { user: "user-a" }), ctx({ id: "../../etc" }));
    expect(res.status).toBe(404);
  });
});

describe("audio upload", () => {
  it.each([
    ["song.mp3", "audio/mpeg", "mp3"],
    ["song.wav", "audio/wav", "wav"],
    ["song.flac", "audio/flac", "flac"],
    ["song.m4a", "audio/mp4", "m4a"],
    ["song.flac", "", "flac"], // browsers sometimes send no type
  ] as const)("accepts %s (%s)", async (name, type, key) => {
    const t = await addTrack();
    const res = await upload(t.id, fx[key], name, type);
    expect(res.status).toBe(200);
    const { track } = (await res.json()) as { track: TrackView };
    expect(track.audio).toMatchObject({ container: key, sizeBytes: fx[key].byteLength, durationS: null });
    expect([...storage.files.keys()]).toEqual([expect.stringMatching(new RegExp(`^sources/[a-f0-9]{32}\\.${key}$`))]);
  });

  it.each([
    ["wrong extension", { name: "notes.txt", type: "text/plain", size: 5 }, 415, "unsupported_format"],
    ["declared type contradicts extension", { name: "song.mp3", type: "image/png", size: 5 }, 415, "unsupported_format"],
    ["empty file", { name: "song.mp3", type: "audio/mpeg", size: 0 }, 400, "upload_failed"],
    ["too large", { name: "song.wav", type: "audio/wav", size: 151 * 1048576 }, 413, "too_large"],
  ])("refuses to start an upload: %s", async (_label, file, status, code) => {
    const t = await addTrack();
    const res = await begin(t.id, file);
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
  });

  it("only accepts the declared type and size at the storage end", async () => {
    vi.stubEnv("MUSIC_MAX_UPLOAD_MB", "0.01");
    const t = await addTrack();
    const start = await (await begin(t.id, { name: "a.mp3", type: "audio/mpeg", size: 1000 })).json();
    expect(start.contentType).toBe("audio/mpeg");
    expect(storage.putTo(start.uploadUrl, new Uint8Array(fx.mp3), "audio/mpeg")).toBe(403); // bigger than declared cap
    expect(storage.putTo(start.uploadUrl, new Uint8Array(100), "text/html")).toBe(403);
  });

  it.each([
    ["bytes are not audio", "song.mp3", "audio/mpeg", () => Buffer.alloc(50_000, 7)],
    ["WAV bytes named .mp3", "song.mp3", "audio/mpeg", () => fx.wav],
  ])("rejects after upload when %s, and deletes the file", async (_label, name, type, data) => {
    const t = await addTrack();
    const res = await upload(t.id, data(), name, type);
    expect(res.status).toBe(415);
    expect((await res.json()).error.code).toBe("unsupported_format");
    expect(storage.files.size).toBe(0);
    expect(await sourceCount()).toBe(0);
  });

  it("rejects a finish with no file, or a tampered or expired ticket", async () => {
    const t = await addTrack();
    const start = await (await begin(t.id, { name: "a.mp3", type: "audio/mpeg", size: fx.mp3.byteLength })).json();
    const missing = await finish(t.id, start.ticket); // nothing uploaded yet
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("upload_failed");
    expect((await finish(t.id, start.ticket.slice(0, -2) + "xx")).status).toBe(400);
    vi.useFakeTimers({ now: Date.now() + 16 * 60_000 });
    try {
      storage.putTo(start.uploadUrl, new Uint8Array(fx.mp3), "audio/mpeg");
      const late = await finish(t.id, start.ticket);
      expect((await late.json()).error.code).toBe("upload_expired");
    } finally {
      vi.useRealTimers();
    }
  });

  it("stores identical audio once per user", async () => {
    const a = await addTrack("user-a", "One");
    const b = await addTrack("user-a", "Two");
    await upload(a.id, fx.mp3, "one.mp3", "audio/mpeg");
    await upload(b.id, fx.mp3, "copy.mp3", "audio/mpeg");
    expect(await sourceCount()).toBe(1);
    expect(storage.files.size).toBe(1); // the duplicate upload was removed
  });

  it("doesn't share identical audio across users", async () => {
    await upload((await addTrack("user-a")).id, fx.mp3, "a.mp3", "audio/mpeg");
    await upload((await addTrack("user-b")).id, fx.mp3, "b.mp3", "audio/mpeg", "user-b");
    expect(await sourceCount()).toBe(2);
  });
});

describe("processing jobs and caching", () => {
  it("needs audio first", async () => {
    expect((await processTrack((await addTrack()).id)).status).toBe(409);
  });

  it("queues once, reuses in-flight and completed work, and retries after failure", async () => {
    const t = await addTrack();
    await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg");

    const first = await processTrack(t.id);
    expect(first.status).toBe(202);
    expect(first.body).toMatchObject({ status: "queued", job: { status: "queued", progress: null, workerOnline: false } });

    const again = await processTrack(t.id);
    expect(again.status).toBe(200);
    expect(again.body.job_id).toBe(first.body.job_id);

    await completeWithWorker(storage, first.body.job_id, { sourceDurationS: 3.02 });
    const cached = await processTrack(t.id);
    expect(cached.body).toMatchObject({ job_id: first.body.job_id, status: "completed", job: { cached: true, progress: 1 } });
    const track = (await (await listRoute(req("GET", "/x", { user: "user-a" }), undefined)).json()).tracks[0] as TrackView;
    expect(track.audio?.durationS).toBe(3.02); // learned from the worker's decode

    // Same audio on another track: no new separation.
    const t2 = await addTrack("user-a", "Same song again");
    await upload(t2.id, fx.mp3, "dupe.mp3", "audio/mpeg");
    expect((await processTrack(t2.id)).body.job_id).toBe(first.body.job_id);

    // Different audio ⇒ different cache key ⇒ new job; after a failure, asking again makes a new one.
    const t3 = await addTrack("user-a", "Other");
    await upload(t3.id, fx.mp3b, "b.mp3", "audio/mpeg");
    const other = await processTrack(t3.id);
    expect(other.status).toBe(202);
    await q.run("UPDATE music_jobs SET status = 'failed', error_code = 'timeout', error_message = 'Processing took too long.' WHERE id = ?", other.body.job_id);
    const failed = await (await getJob(req("GET", "/x", { user: "user-a" }), ctx({ id: other.body.job_id }))).json();
    expect(failed.job).toMatchObject({ status: "failed", error: { code: "timeout" } });
    const retry = await processTrack(t3.id);
    expect(retry.status).toBe(202);
    expect(retry.body.job_id).not.toBe(other.body.job_id);
  });
});

describe("versions and playback links", () => {
  async function versions(trackId: string): Promise<VersionsView> {
    const res = await versionsRoute(req("GET", "/x", { user: "user-a" }), ctx({ id: trackId }));
    expect(res.status).toBe(200);
    return res.json();
  }

  it("offers the upload as Original before processing, then all four study versions", async () => {
    const t = await addTrack();
    await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg");
    const before = await versions(t.id);
    expect(Object.keys(before.versions)).toEqual(["original"]);
    expect(storage.pathOf(before.versions.original!.url)).toMatch(/^sources\//);

    const { body } = await processTrack(t.id);
    await completeWithWorker(storage, body.job_id);
    const after = await versions(t.id);
    const paths = Object.fromEntries(Object.entries(after.versions).map(([k, v]) => [k, storage.pathOf(v!.url)]));
    expect(paths).toEqual({
      original: `outputs/${body.job_id}/original.m4a`,
      no_lyrics: `outputs/${body.job_id}/no_lyrics.m4a`,
      vocals_only: `outputs/${body.job_id}/vocals.m4a`,
      beats_only: `outputs/${body.job_id}/drums.m4a`,
    });
    expect(after.expiresAt).toBeGreaterThan(Date.now());
  });
});

describe("error responses", () => {
  it("reports an unreachable database cleanly", async () => {
    setExecutorForTests(null);
    vi.stubEnv("DATABASE_URL", "");
    const res = await listRoute(req("GET", "/x", { user: "user-a" }), undefined);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("storage_unavailable");
    setExecutorForTests(database.executor);
  });

  it("never leaks internals", async () => {
    const boom = route("test", async () => {
      throw new TypeError("cannot read x of undefined at /home/app/lib.ts:12");
    });
    const body = await (await boom(req("GET", "/x"), undefined)).json();
    expect(body.error).toMatchObject({ code: "internal", message: "Something went wrong. Try again." });
    expect(JSON.stringify(body)).not.toContain("/home");
  });
});
