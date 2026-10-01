import { ApiError, readJson, route } from "@/lib/music/server/http";
import { complete, fail, heartbeat, requireWorker, uploadUrls } from "@/lib/music/server/workerApi";

type Ctx = { params: Promise<{ id: string; action: string }> };

const ACTIONS = { heartbeat, "upload-urls": uploadUrls, complete, fail } as const;

/** Worker: heartbeat · upload-urls · complete · fail for a job it has claimed. */
export const POST = route<Ctx>("worker.job", async (req, { params }) => {
  requireWorker(req);
  const { id, action } = await params;
  const fn = ACTIONS[action as keyof typeof ACTIONS];
  if (!fn) throw new ApiError(404, "not_found", "Unknown action.");
  return Response.json(await fn(id, await readJson(req, 64 * 1024)));
});
