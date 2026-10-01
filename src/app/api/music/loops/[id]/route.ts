import { requireUser } from "@/lib/music/server/auth";
import { readJson, route } from "@/lib/music/server/http";
import { deleteLoop, renameLoop } from "@/lib/music/server/loops";

type Ctx = { params: Promise<{ id: string }> };

/** Rename a saved Loop: { name }. */
export const PATCH = route<Ctx>("loops.rename", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  const { name } = await readJson<{ name?: unknown }>(req);
  return Response.json({ loop: await renameLoop(uid, id, name) });
});

/** Remove a saved Loop. */
export const DELETE = route<Ctx>("loops.delete", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  await deleteLoop(uid, id);
  return new Response(null, { status: 204 });
});
