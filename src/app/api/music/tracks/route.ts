import { requireUser } from "@/lib/music/server/auth";
import { readJson, route } from "@/lib/music/server/http";
import { addTrack, listTracks } from "@/lib/music/server/library";

/** The signed-in user's music library. */
export const GET = route("tracks.list", async (req) => {
  const uid = await requireUser(req);
  return Response.json({ tracks: await listTracks(uid) });
});

/** Add a track by name (for music that isn't on Spotify). */
export const POST = route("tracks.add", async (req) => {
  const uid = await requireUser(req);
  const body = await readJson<{ title?: unknown; artist?: unknown }>(req);
  return Response.json({ track: await addTrack(uid, body) }, { status: 201 });
});
