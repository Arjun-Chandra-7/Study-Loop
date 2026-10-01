import { requireUser } from "@/lib/music/server/auth";
import { ApiError, route } from "@/lib/music/server/http";
import { attachAudio, ownedTrack } from "@/lib/music/server/library";
import { receiveAudio } from "@/lib/music/server/upload";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Upload the audio for a track. The body is the raw file; `X-File-Name` (URI-encoded) carries the
 * original name, used only to check the extension. Validated before anything is stored.
 */
export const PUT = route<Ctx>("tracks.audio", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  ownedTrack(uid, id); // before accepting any bytes
  let fileName: string;
  try {
    fileName = decodeURIComponent(req.headers.get("x-file-name") ?? "");
  } catch {
    throw new ApiError(400, "bad_request", "Invalid file name.");
  }
  const audio = await receiveAudio(req, fileName, req.headers.get("content-type") ?? "");
  return Response.json({ track: await attachAudio(uid, id, audio) });
});
