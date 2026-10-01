import { requireUser } from "@/lib/music/server/auth";
import { route } from "@/lib/music/server/http";
import { trackVersions } from "@/lib/music/server/library";

type Ctx = { params: Promise<{ id: string }> };

/** Short-lived playback links for each study version that exists for this track. */
export const GET = route<Ctx>("tracks.versions", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  return Response.json(await trackVersions(uid, id), { headers: { "Cache-Control": "private, no-store" } });
});
