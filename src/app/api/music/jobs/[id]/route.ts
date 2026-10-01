import { requireUser } from "@/lib/music/server/auth";
import { route } from "@/lib/music/server/http";
import { getJob } from "@/lib/music/server/library";

type Ctx = { params: Promise<{ id: string }> };

/** Processing state for one job, polled by the Music view while it runs. */
export const GET = route<Ctx>("jobs.get", async (req, { params }) => {
  const uid = await requireUser(req);
  const { id } = await params;
  return Response.json({ job: await getJob(uid, id) }, { headers: { "Cache-Control": "private, no-store" } });
});
