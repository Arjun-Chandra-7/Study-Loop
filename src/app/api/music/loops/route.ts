import { requireUser } from "@/lib/music/server/auth";
import { readJson, route } from "@/lib/music/server/http";
import { listLoops, saveLoop } from "@/lib/music/server/loops";

/** The listener's saved Loops. */
export const GET = route("loops.list", async (req) => {
  const uid = await requireUser(req);
  return Response.json({ loops: await listLoops(uid) }, { headers: { "Cache-Control": "private, no-store" } });
});

/** Save the Loop that's playing: { name, playlistName, profile }. */
export const POST = route("loops.save", async (req) => {
  const uid = await requireUser(req);
  return Response.json({ loop: await saveLoop(uid, await readJson(req)) }, { status: 201 });
});
