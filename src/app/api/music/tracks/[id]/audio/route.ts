import { requireUser } from "@/lib/music/server/auth";
import { readJson, route } from "@/lib/music/server/http";
import { attachAudio, ownedTrack } from "@/lib/music/server/library";
import { finishUpload } from "@/lib/music/server/upload";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Step 2 of adding audio: after the browser uploaded the file, hand back the ticket. The file is
 * checked (it exists, its bytes match the format) and fingerprinted before it's attached.
 */
export const POST = route<Ctx>("tracks.audio", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  await ownedTrack(uid, id);
  const { ticket } = await readJson<{ ticket?: unknown }>(req);
  const audio = await finishUpload(uid, id, ticket);
  return Response.json({ track: await attachAudio(uid, id, audio) });
});
