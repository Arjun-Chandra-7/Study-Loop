import { requireUser } from "@/lib/music/server/auth";
import { route } from "@/lib/music/server/http";
import { playlists, playlistVibe } from "@/lib/music/server/vibe";

/**
 * GET /api/music/vibe?playlist=<name>[&refresh=1] → the playlist's vibe profile (cached), plus the
 * list of imported playlists for the picker. Without `playlist`: the whole library.
 */
export const GET = route("music.vibe", async (req) => {
  const uid = await requireUser(req);
  const url = new URL(req.url);
  if (url.searchParams.get("list") === "1") return Response.json({ playlists: await playlists(uid) });
  const name = url.searchParams.get("playlist");
  const [vibe, lists] = await Promise.all([
    playlistVibe(uid, name ? name.slice(0, 200) : null, url.searchParams.get("refresh") === "1"),
    playlists(uid),
  ]);
  return Response.json({ ...vibe, playlists: lists }, { headers: { "Cache-Control": "private, no-store" } });
});
