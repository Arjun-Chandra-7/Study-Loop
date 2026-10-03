import { requireUser } from "@/lib/music/server/auth";
import { readJson, route } from "@/lib/music/server/http";
import { songBeats } from "@/lib/music/server/songs";

/** POST { songs: string[] } → each song's beat fingerprint, in the same order. */
export const POST = route("music.songs", async (req) => {
  await requireUser(req);
  const { songs } = await readJson<{ songs?: unknown }>(req);
  return Response.json({ songs: await songBeats(songs) }, { headers: { "Cache-Control": "private, no-store" } });
});
