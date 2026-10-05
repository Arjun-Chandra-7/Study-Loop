import { requireUser } from "@/lib/music/server/auth";
import { createFromList, createFromSpotify, listBeatPlaylists } from "@/lib/music/server/beatPlaylists";
import { parseSpotifyUrl } from "@/lib/music/server/spotify";
import { readJson, route } from "@/lib/music/server/http";

/** Reading a whole playlist's songs can take a while on a cold cache. */
export const maxDuration = 300;

/** The listener's beat playlists, newest first. */
export const GET = route("beatPlaylists.list", async (req) => {
  const uid = await requireUser(req);
  return Response.json({ playlists: await listBeatPlaylists(uid) }, { headers: { "Cache-Control": "private, no-store" } });
});

/**
 * { url, spotifyToken? } → the Spotify playlist, album or track rebuilt as beats and saved.
 * Anything that isn't a single Spotify link — songs copied out of the Spotify app, or typed
 * "Title — Artist" lines — is read as a list of songs instead, which needs no Spotify sign-in.
 */
export const POST = route("beatPlaylists.create", async (req) => {
  const uid = await requireUser(req);
  const { url, spotifyToken } = await readJson<{ url?: unknown; spotifyToken?: unknown }>(req);
  // The listener's own Spotify token, used for this request only and never stored.
  const token = typeof spotifyToken === "string" && /^[A-Za-z0-9_-]{20,1000}$/.test(spotifyToken) ? spotifyToken : undefined;
  const single = typeof url === "string" && isSingleSpotifyLink(url);
  const { playlist, updated } = single ? await createFromSpotify(uid, url, token) : await createFromList(uid, url);
  return Response.json({ playlist, updated }, { status: updated ? 200 : 201 });
});

function isSingleSpotifyLink(text: string) {
  const t = text.trim();
  // URL parsing quietly drops newlines, so a pasted list could pass as its first link.
  if (/\s/.test(t) || (t.match(/open\.spotify\.com|spotify:/g)?.length ?? 0) !== 1) return false;
  try {
    parseSpotifyUrl(text);
    return true;
  } catch {
    return false;
  }
}
