import { MockLanguageModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE as removeRoute, PATCH as renameRoute } from "@/app/api/music/beat-playlists/[id]/route";
import { GET as listRoute, POST as createRoute } from "@/app/api/music/beat-playlists/route";
import { setTestVerifier } from "../server/auth";
import { q, setExecutorForTests } from "../server/db";
import { resetSpotifyToken } from "../server/spotify";
import { setVibeModelForTests } from "../server/vibe";
import { stepGrid } from "../vibe/profile";
import { DEMO_SONGS } from "../vibe/songs";
import { ctx, req, testDatabase, testVerifier } from "./helpers";

let calls = 0;
let prompts: string[] = [];
const model = (text: () => string) =>
  new MockLanguageModelV4({
    doGenerate: async (opts) => {
      calls++;
      prompts.push(JSON.stringify(opts.prompt));
      return {
        content: [{ type: "text", text: text() }],
        finishReason: { unified: "stop", raw: undefined },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
        warnings: [],
      };
    },
  });
/** What the model says about the given demo songs. */
const reading = (...i: number[]) =>
  JSON.stringify({
    songs: i.map((n) => {
      const { title, artist, profile: p } = DEMO_SONGS[n];
      return { title, artist, known: true, tempoBpm: p.tempoBpm, key: p.key, mode: p.mode, progression: p.progression, chordsPerBar: p.harmonicRhythm ?? 1, drumFeel: p.drumFeel, instruments: p.palette, energy: p.energy, warmth: p.warmth, swing: p.swing, summary: p.summary, moods: p.moods };
    }),
  });

const PLAYLIST = "37i9dQZF1DXcBWIGoYBM5M";
const LINK = `https://open.spotify.com/playlist/${PLAYLIST}?si=abc`;
const TOKEN = "listener-token-0123456789abcdef";
const track = (id: string, name: string, artist: string) => ({
  id, name, type: "track", duration_ms: 200000, artists: [{ name: artist }],
  album: { name: "Album", images: [{ url: `https://i.scdn.co/image/${id}`, width: 300 }] },
  external_urls: { spotify: `https://open.spotify.com/track/${id}` },
});

/** Spotify with one playlist of two songs; songs are only listed to a signed-in listener. */
function mockSpotify() {
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = String(input);
    const asUser = new Headers(init?.headers).get("authorization") === `Bearer ${TOKEN}`;
    if (url.includes("accounts.spotify.com")) return Response.json({ access_token: "tok", expires_in: 3600 });
    if (url.endsWith(`/playlists/${PLAYLIST}?fields=name`)) return Response.json({ name: "Night Drive" });
    if (url.includes(`/playlists/${PLAYLIST}/items`)) {
      if (!asUser) return Response.json({ error: { status: 401 } }, { status: 401 });
      return Response.json({ items: [{ item: track("a".repeat(22), "Get Lucky", "Daft Punk") }, { item: track("b".repeat(22), "Let It Be", "The Beatles") }], next: null });
    }
    return new Response("{}", { status: 404 });
  });
}

let database: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  database = await testDatabase();
  setTestVerifier(testVerifier);
});
afterAll(async () => {
  setVibeModelForTests(null);
  setTestVerifier(null);
  setExecutorForTests(null);
  await database.close();
});
beforeEach(async () => {
  await database.reset();
  calls = 0;
  prompts = [];
  resetSpotifyToken();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "id");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "secret");
  mockSpotify();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const create = async (user: string | null = "user-a", body: object = { url: LINK, spotifyToken: TOKEN }) => {
  const res = await createRoute(req("POST", "/api/music/beat-playlists", { user: user ?? undefined, body: JSON.stringify(body) }), undefined);
  return { status: res.status, body: await res.json() };
};
const list = async (user = "user-a") => (await (await listRoute(req("GET", "/api/music/beat-playlists", { user }), undefined)).json()).playlists;

describe("beat playlists from Spotify", () => {
  it("rebuilds a playlist as beats, song for song, and saves it to the library", async () => {
    setVibeModelForTests(model(() => reading(0, 1)));
    const { status, body } = await create();
    expect(status).toBe(201);
    const p = body.playlist;
    expect(p).toMatchObject({ name: "Night Drive", sourceUrl: `https://open.spotify.com/playlist/${PLAYLIST}`, artworkUrl: `https://i.scdn.co/image/${"a".repeat(22)}` });
    expect(p.songs.map((s: { title: string; artist: string; source: string }) => [s.title, s.artist, s.source])).toEqual([["Get Lucky", "Daft Punk", "ai"], ["Let It Be", "The Beatles", "ai"]]);
    expect(p.songs[0].profile).toMatchObject({ tempoBpm: 116, key: "F#", drumFeel: "four_on_floor" });
    expect(p.songs[1].spotifyUrl).toBe(`https://open.spotify.com/track/${"b".repeat(22)}`);
    expect(prompts[0]).toContain("Get Lucky — Daft Punk");
    // Saved: the playlist in the Library, the songs in the track library.
    expect((await list()).map((x: { name: string }) => x.name)).toEqual(["Night Drive"]);
    expect((await q.all("SELECT 1 FROM music_tracks WHERE user_id = 'user-a'")).length).toBe(2);
  });

  it("refreshes the same playlist on a second import, and reads each song only once, for everyone", async () => {
    setVibeModelForTests(model(() => reading(0, 1)));
    await create();
    const again = await create();
    expect(again.status).toBe(200);
    expect(again.body.updated).toBe(true);
    expect(await list()).toHaveLength(1);
    await create("user-b");
    expect(calls).toBe(1);
    expect(await list("user-b")).toHaveLength(1);
  });

  it("keeps the music going with best guesses when the model is unavailable, without caching them", async () => {
    setVibeModelForTests(model(() => { throw new Error("rate limited"); }));
    const { body } = await create();
    expect(body.playlist.songs.map((s: { source: string; known: boolean }) => [s.source, s.known])).toEqual([["basic", false], ["basic", false]]);
    expect(body.playlist.songs[0].title).toBe("Get Lucky");
    expect((await q.all("SELECT 1 FROM music_vibes")).length).toBe(0);
  });

  it("reads songs that couldn't be read before the next time the Library opens", async () => {
    setVibeModelForTests(model(() => { throw new Error("rate limited"); }));
    await create();
    setVibeModelForTests(model(() => reading(0, 1)));
    const [p] = await list();
    expect(p.songs.map((s: { source: string; title: string }) => [s.title, s.source])).toEqual([["Get Lucky", "ai"], ["Let It Be", "ai"]]);
    expect(p.songs[0].profile.tempoBpm).toBe(116);
    expect(p.songs[0].artworkUrl).toBe(`https://i.scdn.co/image/${"a".repeat(22)}`);
    const callsBefore = calls;
    await list();
    expect(calls).toBe(callsBefore); // saved, so it isn't read again
  });

  it("brings a model's answer into range: flats, doubled tempos, unknown names", async () => {
    setVibeModelForTests(model(() => JSON.stringify({ songs: [{ title: "Get Lucky", artist: "Daft Punk", known: true, tempoBpm: 232, key: "Gb", mode: "Minor", progression: [4, 6, 1, 9], drumFeel: "Four on floor", instruments: ["Electric Guitar", "kazoo"], energy: 2, warmth: 0.5, swing: 0, summary: "x", moods: [] }, "junk"] })));
    const { body } = await create();
    expect(body.playlist.songs[0].profile).toMatchObject({ tempoBpm: 116, key: "F#", mode: "minor", progression: [4, 6, 1], drumFeel: "four_on_floor", palette: ["electric_guitar"], energy: 1 });
  });

  it("asks to connect Spotify for a playlist, and needs sign-in", async () => {
    const res = await create("user-a", { url: LINK });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("spotify_login_required");
    expect((await create(null)).status).toBe(401);
    expect((await create("user-a", { url: "not a link" })).status).toBe(400);
  });

  it("renames and removes, only for its owner", async () => {
    setVibeModelForTests(model(() => reading(0, 1)));
    const id = (await create()).body.playlist.id;
    const patch = (user: string, name: string) => renameRoute(req("PATCH", `/api/music/beat-playlists/${id}`, { user, body: JSON.stringify({ name }) }), ctx({ id }));
    expect((await patch("user-b", "Mine now")).status).toBe(404);
    expect((await (await patch("user-a", "Focus Drive")).json()).playlist.name).toBe("Focus Drive");
    expect((await removeRoute(req("DELETE", `/api/music/beat-playlists/${id}`, { user: "user-b" }), ctx({ id }))).status).toBe(404);
    expect((await removeRoute(req("DELETE", `/api/music/beat-playlists/${id}`, { user: "user-a" }), ctx({ id }))).status).toBe(204);
    expect(await list()).toHaveLength(0);
  });
});

describe("drum grids", () => {
  it("reads drawn grids, tolerating sloppy lengths", () => {
    expect(stepGrid("x...x...x...x...")).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(stepGrid("x.o")?.slice(0, 4)).toEqual([1, 0, 0.55, 0]);
    expect(stepGrid("................")).toBeNull();
    expect(stepGrid(undefined)).toBeNull();
  });
});
