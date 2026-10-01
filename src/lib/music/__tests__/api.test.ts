import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { GET as getFile } from "@/app/api/music/files/[token]/route";
import { POST as importRoute } from "@/app/api/music/import/route";
import { GET as getJob } from "@/app/api/music/jobs/[id]/route";
import { PUT as putAudio } from "@/app/api/music/tracks/[id]/audio/route";
import { POST as processRoute } from "@/app/api/music/tracks/[id]/process/route";
import { GET as versionsRoute } from "@/app/api/music/tracks/[id]/versions/route";
import { GET as listRoute, POST as addRoute } from "@/app/api/music/tracks/route";
import { setTestVerifier } from "../server/auth";
import { closeDb, newId, q } from "../server/db";
import { signFile } from "../server/files";
import { route } from "../server/http";
import { parseSpotifyUrl, resetSpotifyToken } from "../server/spotify";
import type { JobView, TrackView, VersionsView } from "../types";
import { ctx, fixtures, fixturesDir, makeAudio, req, testVerifier } from "./helpers";

let dataDir: string;
let fx: ReturnType<typeof fixtures>;

beforeAll(() => {
  fx = fixtures();
  setTestVerifier(testVerifier);
});
afterAll(() => {
  setTestVerifier(null);
  rmSync(fixturesDir, { recursive: true, force: true });
});
beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), "sl-music-data-"));
  vi.stubEnv("MUSIC_DATA_DIR", dataDir);
  vi.stubEnv("MUSIC_SIGNING_SECRET", "test-secret");
  closeDb();
});
afterEach(() => {
  closeDb();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(dataDir, { recursive: true, force: true });
});

async function addTrack(user = "user-a", title = "Clair de Lune", artist = "Debussy"): Promise<TrackView> {
  const res = await addRoute(req("POST", "/api/music/tracks", { user, body: JSON.stringify({ title, artist }) }), undefined);
  expect(res.status).toBe(201);
  return (await res.json()).track;
}

function upload(trackId: string, data: Buffer, name: string, type: string, user = "user-a") {
  return putAudio(
    req("PUT", `/api/music/tracks/${trackId}/audio`, {
      user, body: new Uint8Array(data), headers: { "content-type": type, "x-file-name": encodeURIComponent(name) },
    }),
    ctx({ id: trackId }),
  );
}

async function processTrack(trackId: string, user = "user-a") {
  const res = await processRoute(req("POST", `/api/music/tracks/${trackId}/process`, { user }), ctx({ id: trackId }));
  return { status: res.status, body: (await res.json()) as { job_id: string; status: string; job: JobView } };
}

/** Do what the worker does on success: write version files and mark the job completed. */
function completeJob(jobId: string) {
  const dir = path.join(dataDir, "outputs", jobId);
  mkdirSync(dir, { recursive: true });
  const m4a = makeAudio("out.m4a", 3, ["-c:a", "aac", "-b:a", "96k"]);
  const now = Date.now();
  for (const [kind, name, file] of [
    ["stem", "vocals", "vocals.m4a"], ["stem", "drums", "drums.m4a"], ["stem", "bass", "bass.m4a"], ["stem", "other", "other.m4a"],
    ["version", "original", "original.m4a"], ["version", "no_lyrics", "no_lyrics.m4a"],
    ["version", "vocals_only", "vocals.m4a"], ["version", "beats_only", "drums.m4a"],
  ]) {
    writeFileSync(path.join(dir, file), m4a);
    q.run(
      `INSERT INTO music_outputs (id, job_id, kind, name, file_path, format, codec, duration_s, sample_rate, channels, size_bytes, created_at)
       VALUES (?, ?, ?, ?, ?, 'm4a', 'aac', 3, 44100, 2, ?, ?)`,
      newId(), jobId, kind, name, `outputs/${jobId}/${file}`, m4a.length, now,
    );
  }
  q.run("UPDATE music_jobs SET status = 'completed', progress = 1, device = 'cpu', completed_at = ? WHERE id = ?", now, jobId);
}

const tmpFiles = () => readdirSync(path.join(dataDir, "tmp"));

describe("authentication", () => {
  it("rejects requests without a valid token", async () => {
    const none = await listRoute(req("GET", "/api/music/tracks"), undefined);
    expect(none.status).toBe(401);
    const bad = await listRoute(req("GET", "/api/music/tracks", { user: "forged" }), undefined);
    expect(bad.status).toBe(401);
    expect((await bad.json()).error.code).toBe("unauthorized");
  });

  it("starts with an empty library", async () => {
    const res = await listRoute(req("GET", "/api/music/tracks", { user: "user-a" }), undefined);
    expect(await res.json()).toEqual({ tracks: [] });
  });
});

describe("ownership", () => {
  it("hides one user's tracks, jobs and files from another", async () => {
    const t = await addTrack("user-a");
    expect((await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg")).status).toBe(200);
    const { body } = await processTrack(t.id);

    const asB = { user: "user-b" };
    expect((await listRoute(req("GET", "/api/music/tracks", asB), undefined).then((r) => r.json())).tracks).toEqual([]);
    expect((await upload(t.id, fx.mp3, "x.mp3", "audio/mpeg", "user-b")).status).toBe(404);
    expect((await processTrack(t.id, "user-b")).status).toBe(404);
    expect((await versionsRoute(req("GET", `/api/music/tracks/${t.id}/versions`, asB), ctx({ id: t.id }))).status).toBe(404);
    expect((await getJob(req("GET", `/api/music/jobs/${body.job_id}`, asB), ctx({ id: body.job_id }))).status).toBe(404);

    // A link signed for user-b that names user-a's source is refused.
    const source = q.get<{ id: string }>("SELECT id FROM music_sources")!;
    const forged = signFile({ k: "s", id: source.id, uid: "user-b" }).url.split("/").pop()!;
    expect((await getFile(req("GET", `/api/music/files/${forged}`), ctx({ token: forged }))).status).toBe(404);
  });

  it("treats malformed ids as not found", async () => {
    const res = await versionsRoute(req("GET", "/api/music/tracks/../../etc/versions", { user: "user-a" }), ctx({ id: "../../etc" }));
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
    expect(track.audio).toMatchObject({ container: key });
    expect(track.audio!.durationS).toBeCloseTo(3, 0);
    expect(readdirSync(path.join(dataDir, "sources"))).toHaveLength(1);
    expect(tmpFiles()).toEqual([]);
  });

  it.each([
    ["wrong extension", "notes.txt", "text/plain", () => Buffer.from("hello"), 415, "unsupported_format"],
    ["declared type contradicts extension", "song.mp3", "image/png", () => fx.mp3, 415, "unsupported_format"],
    ["bytes are not audio", "song.mp3", "audio/mpeg", () => Buffer.alloc(50_000, 7), 415, "unsupported_format"],
    ["WAV bytes named .mp3", "song.mp3", "audio/mpeg", () => fx.wav, 415, "unsupported_format"],
    ["audio header then garbage", "song.mp3", "audio/mpeg", () => Buffer.concat([fx.mp3.subarray(0, 4000), Buffer.alloc(40_000, 0x55)]), 422, "corrupted_audio"],
    ["empty body", "song.mp3", "audio/mpeg", () => Buffer.alloc(0), 400, "upload_failed"],
  ])("rejects %s", async (_label, name, type, data, status, code) => {
    const t = await addTrack();
    const res = await upload(t.id, data(), name, type);
    expect(res.status).toBe(status);
    const body = await res.json();
    expect(body.error.code).toBe(code);
    expect(JSON.stringify(body)).not.toContain(dataDir);
    expect(tmpFiles()).toEqual([]);
    expect(q.get("SELECT COUNT(*) AS n FROM music_sources")).toEqual({ n: 0 });
  });

  it("rejects oversized files while streaming", async () => {
    vi.stubEnv("MUSIC_MAX_UPLOAD_MB", "0.01");
    const t = await addTrack();
    const res = await upload(t.id, fx.wav, "song.wav", "audio/wav");
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("too_large");
    expect(tmpFiles()).toEqual([]);
  });

  it("rejects tracks over the length limit", async () => {
    vi.stubEnv("MUSIC_MAX_DURATION_S", "2");
    const t = await addTrack();
    const res = await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg");
    expect(res.status).toBe(413);
    expect((await res.json()).error.code).toBe("too_long");
  });

  it("stores identical audio once per user", async () => {
    const a = await addTrack("user-a", "One");
    const b = await addTrack("user-a", "Two");
    await upload(a.id, fx.mp3, "one.mp3", "audio/mpeg");
    await upload(b.id, fx.mp3, "copy.mp3", "audio/mpeg");
    expect(q.get("SELECT COUNT(*) AS n FROM music_sources")).toEqual({ n: 1 });
    expect(readdirSync(path.join(dataDir, "sources"))).toHaveLength(1);
  });
});

describe("processing jobs and caching", () => {
  it("needs audio first", async () => {
    const t = await addTrack();
    const res = await processTrack(t.id);
    expect(res.status).toBe(409);
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

    completeJob(first.body.job_id);
    const cached = await processTrack(t.id);
    expect(cached.body).toMatchObject({ job_id: first.body.job_id, status: "completed", job: { cached: true, progress: 1 } });

    // Same audio on another track: no new separation.
    const t2 = await addTrack("user-a", "Same song again");
    await upload(t2.id, fx.mp3, "dupe.mp3", "audio/mpeg");
    expect((await processTrack(t2.id)).body.job_id).toBe(first.body.job_id);
    expect(q.get("SELECT COUNT(*) AS n FROM music_jobs")).toEqual({ n: 1 });

    // Different audio ⇒ different cache key ⇒ new job.
    const t3 = await addTrack("user-a", "Other");
    await upload(t3.id, fx.mp3b, "b.mp3", "audio/mpeg");
    const other = await processTrack(t3.id);
    expect(other.status).toBe(202);
    q.run("UPDATE music_jobs SET status = 'failed', error_code = 'timeout', error_message = 'Processing took too long and was stopped. Try a shorter track.' WHERE id = ?", other.body.job_id);
    const failed = await getJob(req("GET", `/api/music/jobs/${other.body.job_id}`, { user: "user-a" }), ctx({ id: other.body.job_id }));
    expect((await failed.json()).job).toMatchObject({ status: "failed", error: { code: "timeout" } });
    const retry = await processTrack(t3.id);
    expect(retry.status).toBe(202);
    expect(retry.body.job_id).not.toBe(other.body.job_id);
  });

  it("reports whether a worker is online while queued and progress while processing", async () => {
    const t = await addTrack();
    await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg");
    const { body } = await processTrack(t.id);
    q.run("INSERT INTO music_workers (id, device, seen_at) VALUES ('w1', 'cpu', ?)", Date.now());
    const poll = async () =>
      (await (await getJob(req("GET", `/api/music/jobs/${body.job_id}`, { user: "user-a" }), ctx({ id: body.job_id }))).json()).job as JobView;
    expect(await poll()).toMatchObject({ status: "queued", workerOnline: true });
    q.run("UPDATE music_jobs SET status = 'processing', progress = 0.42 WHERE id = ?", body.job_id);
    expect(await poll()).toMatchObject({ status: "processing", progress: 0.42 });
    q.run("UPDATE music_jobs SET status = 'finalizing', progress = NULL WHERE id = ?", body.job_id);
    expect(await poll()).toMatchObject({ status: "finalizing", progress: null });
  });
});

describe("versions and playback links", () => {
  async function versions(trackId: string): Promise<VersionsView> {
    const res = await versionsRoute(req("GET", `/api/music/tracks/${trackId}/versions`, { user: "user-a" }), ctx({ id: trackId }));
    expect(res.status).toBe(200);
    return res.json();
  }
  const fetchLink = (url: string, headers?: Record<string, string>) => {
    const token = url.split("/").pop()!;
    return getFile(req("GET", url, { headers }), ctx({ token }));
  };

  it("offers the upload as Original before processing, then all four study versions", async () => {
    const t = await addTrack();
    await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg");
    const before = await versions(t.id);
    expect(Object.keys(before.versions)).toEqual(["original"]);
    const orig = await fetchLink(before.versions.original!.url);
    expect(orig.status).toBe(200);
    expect(orig.headers.get("content-type")).toBe("audio/mpeg");
    expect(Buffer.from(await orig.arrayBuffer()).equals(fx.mp3)).toBe(true);

    const { body } = await processTrack(t.id);
    completeJob(body.job_id);
    const after = await versions(t.id);
    expect(Object.keys(after.versions).sort()).toEqual(["beats_only", "no_lyrics", "original", "vocals_only"]);
    for (const v of Object.values(after.versions)) {
      const r = await fetchLink(v!.url);
      expect(r.status).toBe(200);
      expect(r.headers.get("content-type")).toBe("audio/mp4");
    }
  });

  it("serves byte ranges for seeking", async () => {
    const t = await addTrack();
    await upload(t.id, fx.wav, "song.wav", "audio/wav");
    const url = (await versions(t.id)).versions.original!.url;
    const r = await fetchLink(url, { range: "bytes=100-199" });
    expect(r.status).toBe(206);
    expect(r.headers.get("content-range")).toBe(`bytes 100-199/${fx.wav.length}`);
    expect(Buffer.from(await r.arrayBuffer()).equals(fx.wav.subarray(100, 200))).toBe(true);
    expect((await fetchLink(url, { range: `bytes=${fx.wav.length + 10}-` })).status).toBe(416);
  });

  it("refuses tampered or expired links", async () => {
    const t = await addTrack();
    await upload(t.id, fx.mp3, "song.mp3", "audio/mpeg");
    const url = (await versions(t.id)).versions.original!.url;
    const [payload, sig] = url.split("/").pop()!.split(".");
    expect(Buffer.from(payload, "base64url").toString()).not.toContain("user-a"); // links don't carry the uid
    const tampered = `${payload}.${sig.slice(0, -2)}xx`;
    expect((await getFile(req("GET", "/x"), ctx({ token: tampered }))).status).toBe(403);
    const source = q.get<{ id: string }>("SELECT id FROM music_sources")!;
    const expired = signFile({ k: "s", id: source.id, uid: "user-a" }, -10).url.split("/").pop()!;
    const res = await getFile(req("GET", "/x"), ctx({ token: expired }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("link_expired");
  });
});

describe("Spotify import", () => {
  const track = (id: string, name: string) => ({
    id, name, type: "track", duration_ms: 201000, artists: [{ name: "Artist" }],
    album: { name: "Album", images: [{ url: "https://i.scdn.co/image/small", width: 64 }, { url: "https://i.scdn.co/image/med", width: 300 }] },
    external_urls: { spotify: `https://open.spotify.com/track/${id}` },
  });
  const ID = "37i9dQZF1DXcBWIGoYBM5M";

  const USER_TOKEN = "listener-token-0123456789abcdef";

  /**
   * Mirrors Spotify's current behaviour (verified live): an app token can read a playlist's name but
   * not its songs; songs need the listener's token, via /items whose entries are `item` (or the older
   * /tracks with `track`). `itemsMode` simulates the variants.
   */
  function mockSpotify(itemsMode: "items" | "tracks-only" | "forbidden" = "items") {
    const calls: { url: string; auth: string }[] = [];
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      const auth = new Headers(init?.headers).get("authorization") ?? "";
      calls.push({ url, auth });
      const asUser = auth === `Bearer ${USER_TOKEN}`;
      if (url.includes("accounts.spotify.com")) return Response.json({ access_token: "tok", expires_in: 3600 });
      if (url.endsWith(`/playlists/${ID}?fields=name`)) return Response.json({ name: "Deep Focus" });
      if (url.includes(`/playlists/${ID}/items`)) {
        if (!asUser) return Response.json({ error: { status: 401 } }, { status: 401 });
        if (itemsMode !== "items") return new Response("{}", { status: 403 });
        return url.includes("offset=50")
          ? Response.json({ items: [{ item: track("c".repeat(22), "Second") }], next: null })
          : Response.json({ items: [{ item: track("a".repeat(22), "First") }, { item: null }, { item: { ...track("b".repeat(22), "Local"), is_local: true } }], next: `https://api.spotify.com/v1/playlists/${ID}/items?offset=50` });
      }
      if (url.includes(`/playlists/${ID}/tracks`)) {
        if (!asUser || itemsMode === "forbidden") return new Response("{}", { status: 403 });
        return url.includes("offset=50")
          ? Response.json({ items: [{ track: track("c".repeat(22), "Second") }], next: null })
          : Response.json({ items: [{ track: track("a".repeat(22), "First") }, { track: null }], next: `https://api.spotify.com/v1/playlists/${ID}/tracks?offset=50` });
      }
      return new Response("{}", { status: 404 });
    });
    return calls;
  }

  beforeEach(() => {
    resetSpotifyToken();
    vi.stubEnv("SPOTIFY_CLIENT_ID", "id");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
  });

  const importUrl = (url: string, spotifyToken?: string, user = "user-a") =>
    importRoute(req("POST", "/api/music/import", { user, body: JSON.stringify({ url, spotifyToken }) }), undefined);

  it("imports playlist metadata in order, skipping local files, without duplicates", async () => {
    const calls = mockSpotify();
    const res = await importUrl(`https://open.spotify.com/playlist/${ID}?si=abc`, USER_TOKEN);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ added: 2, total: 2, playlistName: "Deep Focus" });
    expect(body.tracks.map((t: TrackView) => t.title)).toEqual(["First", "Second"]);
    expect(body.tracks[0]).toMatchObject({ artist: "Artist", album: "Album", durationMs: 201000, artworkUrl: "https://i.scdn.co/image/med", audio: null, playlistName: "Deep Focus" });
    expect(calls.every((c) => !/audio|preview|stream/i.test(c.url))).toBe(true);
    // The listener's token is only sent for the playlist's songs.
    expect(calls.filter((c) => c.auth.includes(USER_TOKEN)).every((c) => c.url.includes("/items"))).toBe(true);

    const again = await (await importUrl(`https://open.spotify.com/playlist/${ID}`, USER_TOKEN)).json();
    expect(again).toMatchObject({ added: 0, total: 2 });
    expect(again.tracks).toHaveLength(2);
  });

  it.each(["https://example.com/playlist/x", "http://open.spotify.com/playlist/" + ID, "not a url", "https://open.spotify.com/show/" + ID])(
    "rejects %s",
    async (url) => {
      mockSpotify();
      const res = await importUrl(url);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("invalid_spotify_link");
    },
  );

  it.each([
    ["https://open.spotify.com/playlist/3otkFuN9NnmLTHUgX8qe2z?si=4aedb68e77884c50", "playlist", "3otkFuN9NnmLTHUgX8qe2z"],
    ["  https://open.spotify.com/intl-de/playlist/3otkFuN9NnmLTHUgX8qe2z?si=x  ", "playlist", "3otkFuN9NnmLTHUgX8qe2z"],
    ["spotify:playlist:3otkFuN9NnmLTHUgX8qe2z", "playlist", "3otkFuN9NnmLTHUgX8qe2z"],
    ["https://open.spotify.com/album/4aawyAB9vmqN3uQ7FjRGTy?si=1", "album", "4aawyAB9vmqN3uQ7FjRGTy"],
    ["https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl", "track", "11dFghVXANMlKmJXsNCbNl"],
  ])("understands share links like %s", (url, kind, id) => {
    expect(parseSpotifyUrl(url)).toEqual({ kind, id });
  });

  it("asks the listener to connect Spotify for playlists", async () => {
    mockSpotify();
    const res = await importUrl(`https://open.spotify.com/playlist/${ID}?si=4aedb68e77884c50`);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("spotify_login_required");
    expect(body.error.message).toContain("Deep Focus");
  });

  it("falls back to the older /tracks listing", async () => {
    mockSpotify("tracks-only");
    const body = await (await importUrl(`https://open.spotify.com/playlist/${ID}`, USER_TOKEN)).json();
    expect(body).toMatchObject({ added: 2, total: 2 });
  });

  it("explains when Spotify won't share a playlist's songs even when connected", async () => {
    mockSpotify("forbidden");
    const res = await importUrl(`https://open.spotify.com/playlist/${ID}`, USER_TOKEN);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("spotify_playlist_forbidden");
  });

  it("ignores a malformed listener token", async () => {
    mockSpotify();
    const res = await importUrl(`https://open.spotify.com/playlist/${ID}`, "bad token!");
    expect((await res.json()).error.code).toBe("spotify_login_required");
  });

  it("explains private or unknown playlists", async () => {
    mockSpotify();
    const res = await importUrl("https://open.spotify.com/playlist/" + "z".repeat(22));
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe("spotify_not_found");
  });

  it("explains when Spotify blocks the app (owner without Premium)", async () => {
    vi.stubGlobal("fetch", async (input: string | URL) =>
      String(input).includes("accounts.spotify.com")
        ? Response.json({ access_token: "tok", expires_in: 3600 })
        : new Response("Active premium subscription required for the owner of the app.", { status: 403 }),
    );
    const res = await importUrl(`https://open.spotify.com/playlist/${ID}?si=abc`);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("spotify_app_blocked");
  });

  it("says so when Spotify isn't configured", async () => {
    vi.stubEnv("SPOTIFY_CLIENT_ID", "");
    const res = await importUrl(`https://open.spotify.com/playlist/${ID}`);
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe("spotify_not_configured");
  });
});

describe("error responses", () => {
  it("reports unavailable storage cleanly (e.g. a read-only host)", async () => {
    const blocker = path.join(dataDir, "not-a-dir");
    writeFileSync(blocker, "x");
    vi.stubEnv("MUSIC_DATA_DIR", path.join(blocker, "music"));
    closeDb();
    const res = await listRoute(req("GET", "/api/music/tracks", { user: "user-a" }), undefined);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatchObject({ code: "storage_unavailable" });
  });

  it("never leaks internals", async () => {
    const boom = route("test", async () => {
      throw Object.assign(new Error("SQLITE_BUSY: database is locked at /srv/data/music.db"), { code: "ERR_SQLITE_ERROR" });
    });
    const res = await boom(req("GET", "/x"), undefined);
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(text).not.toMatch(/srv|SQLITE|locked/);
    expect(JSON.parse(text).error.code).toBe("storage_unavailable");

    const crash = route("test", async () => {
      throw new TypeError("cannot read x of undefined at /home/app/lib.ts:12");
    });
    const body = await (await crash(req("GET", "/x"), undefined)).json();
    expect(body.error).toMatchObject({ code: "internal", message: "Something went wrong. Try again." });
    expect(JSON.stringify(body)).not.toContain("/home");
  });
});
