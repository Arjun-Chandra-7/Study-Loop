import { requireUser } from "@/lib/music/server/auth";
import { deleteBeatPlaylist, renameBeatPlaylist } from "@/lib/music/server/beatPlaylists";
import { readJson, route } from "@/lib/music/server/http";

type Ctx = { params: Promise<{ id: string }> };

/** Rename a beat playlist: { name }. */
export const PATCH = route<Ctx>("beatPlaylists.rename", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  const { name } = await readJson<{ name?: unknown }>(req);
  return Response.json({ playlist: await renameBeatPlaylist(uid, id, name) });
});

/** Remove a beat playlist (the imported songs stay in the library). */
export const DELETE = route<Ctx>("beatPlaylists.delete", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  await deleteBeatPlaylist(uid, id);
  return new Response(null, { status: 204 });
});
