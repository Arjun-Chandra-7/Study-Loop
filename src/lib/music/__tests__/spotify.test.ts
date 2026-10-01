import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as importRoute } from "@/app/api/music/import/route";
import { setTestVerifier } from "../server/auth";
import { setExecutorForTests } from "../server/db";
import { parseSpotifyUrl, resetSpotifyToken } from "../server/spotify";
import type { TrackView } from "../types";
import { req, testDatabase, testVerifier } from "./helpers";

let database: Awaited<ReturnType<typeof testDatabase>>;

beforeAll(async () => {
  database = await testDatabase();
  setTestVerifier(testVerifier);
});
afterAll(async () => {
  setTestVerifier(null);
  setExecutorForTests(null);
  await database.close();
});
beforeEach(async () => {
  await database.reset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
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

