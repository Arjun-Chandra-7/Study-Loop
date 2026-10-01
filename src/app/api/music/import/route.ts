import { requireUser } from "@/lib/music/server/auth";
import { ApiError, readJson, route } from "@/lib/music/server/http";
import { importTracks, listTracks } from "@/lib/music/server/library";
import { fetchSpotify, parseSpotifyUrl } from "@/lib/music/server/spotify";

/** Import track metadata from a Spotify playlist, album or track link. Never audio. */
export const POST = route("music.import", async (req) => {
  const uid = await requireUser(req);
  const { url, spotifyToken } = await readJson<{ url?: unknown; spotifyToken?: unknown }>(req);
  if (typeof url !== "string") throw new ApiError(400, "invalid_spotify_link", "Paste a Spotify link.");
  // The listener's own Spotify token, used for this request only and never stored.
  const userToken = typeof spotifyToken === "string" && /^[A-Za-z0-9_-]{20,1000}$/.test(spotifyToken) ? spotifyToken : undefined;
  const { name, tracks } = await fetchSpotify(parseSpotifyUrl(url), userToken);
  if (!tracks.length) throw new ApiError(404, "spotify_empty", "That link has no tracks StudyLoop can import.");
  const result = importTracks(uid, name, tracks);
  return Response.json({ ...result, playlistName: name, tracks: listTracks(uid) });
});
