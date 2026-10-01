/**
 * Hits the real Spotify Web API. Opt-in, needs SPOTIFY_CLIENT_ID/SECRET in the environment:
 *   MUSIC_TEST_SPOTIFY_URL="https://open.spotify.com/playlist/…" npx vitest run spotify.live
 */
import { describe, expect, it } from "vitest";
import { fetchSpotify, parseSpotifyUrl } from "../server/spotify";

const url = process.env.MUSIC_TEST_SPOTIFY_URL;
if (url && !process.env.SPOTIFY_CLIENT_ID) {
  try {
    process.loadEnvFile(".env.local");
  } catch {}
}

describe.skipIf(!url)("Spotify (live)", () => {
  it("imports metadata from a real share link", async () => {
    const { name, tracks } = await fetchSpotify(parseSpotifyUrl(url!));
    console.log(JSON.stringify({ name, count: tracks.length, sample: tracks.slice(0, 3).map(({ title, artist, durationMs, artworkUrl }) => ({ title, artist, durationMs, art: Boolean(artworkUrl) })) }));
    expect(tracks.length).toBeGreaterThan(0);
    for (const t of tracks) {
      expect(t.title).toBeTruthy();
      expect(t.spotifyTrackId).toMatch(/^[A-Za-z0-9]{22}$/);
    }
  });
});
