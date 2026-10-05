import { requireUser } from "@/lib/music/server/auth";
import { createFromSpotify, listBeatPlaylists } from "@/lib/music/server/beatPlaylists";
import { readJson, route } from "@/lib/music/server/http";

/** Reading a whole playlist's songs can take a while on a cold cache. */
export const maxDuration = 300;

/** The listener's beat playlists, newest first. */
export const GET = route("beatPlaylists.list", async (req) => {
  const uid = await requireUser(req);
  return Response.json({ playlists: await listBeatPlaylists(uid) }, { headers: { "Cache-Control": "private, no-store" } });
});

/** { url, spotifyToken? } → the Spotify playlist, album or track rebuilt as beats and saved. */
export const POST = route("beatPlaylists.create", async (req) => {
  const uid = await requireUser(req);
  const { url, spotifyToken } = await readJson<{ url?: unknown; spotifyToken?: unknown }>(req);
  // The listener's own Spotify token, used for this request only and never stored.
  const token = typeof spotifyToken === "string" && /^[A-Za-z0-9_-]{20,1000}$/.test(spotifyToken) ? spotifyToken : undefined;
  const { playlist, updated } = await createFromSpotify(uid, url, token);
  return Response.json({ playlist, updated }, { status: updated ? 200 : 201 });
});
