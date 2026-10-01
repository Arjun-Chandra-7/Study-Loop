import { requireUser } from "@/lib/music/server/auth";
import { readJson, route } from "@/lib/music/server/http";
import { ownedTrack } from "@/lib/music/server/library";
import { beginUpload } from "@/lib/music/server/upload";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Step 1 of adding audio: describe the file ({ name, type, size }); get back a one-file upload URL
 * (the browser PUTs the bytes straight to storage) and a ticket for step 2 (POST …/audio).
 */
export const POST = route<Ctx>("tracks.upload", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  await ownedTrack(uid, id);
  const file = await readJson<{ name?: unknown; type?: unknown; size?: unknown }>(req);
  return Response.json(await beginUpload(uid, id, file));
});
