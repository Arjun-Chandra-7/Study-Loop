import { requireUser } from "@/lib/music/server/auth";
import { route } from "@/lib/music/server/http";
import { requestProcessing } from "@/lib/music/server/library";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Start separating a track's audio. Returns immediately: 202 with a queued job, or 200 with the
 * existing job when this exact audio was already processed (or is in progress) with the same model.
 */
export const POST = route<Ctx>("tracks.process", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  const { job, created } = await requestProcessing(uid, id);
  return Response.json({ job_id: job.id, status: job.status, job }, { status: created ? 202 : 200 });
});
