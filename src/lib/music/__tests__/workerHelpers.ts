import { expect } from "vitest";
import { POST as claimRoute } from "@/app/api/music/worker/claim/route";
import { POST as jobRoute } from "@/app/api/music/worker/jobs/[id]/[action]/route";
import { ctx, req, type MemStorage } from "./helpers";

export const WORKER = "test-host:1";
const auth = { authorization: "Bearer worker-secret" };

export async function workerCall(action: string, jobId: string, body: Record<string, unknown>, headers: Record<string, string> = auth) {
  const res = await jobRoute(req("POST", "/x", { headers, body: JSON.stringify({ workerId: WORKER, ...body }) }), ctx({ id: jobId, action }));
  return { status: res.status, body: await res.json() };
}

export async function claimJob(body: Record<string, unknown> = {}, headers: Record<string, string> = auth) {
  const res = await claimRoute(req("POST", "/x", { headers, body: JSON.stringify({ workerId: WORKER, device: "cpu", ...body }) }), undefined);
  return { status: res.status, body: await res.json() };
}

export const OUTPUT_FILES = ["original", "no_lyrics", "vocals", "drums", "bass", "other"];

/** Everything a successful worker run does, through the real worker endpoints. */
export async function completeWithWorker(storage: MemStorage, jobId: string, opts: { sourceDurationS?: number; skip?: string } = {}) {
  const claimed = await claimJob();
  expect(claimed.body.job?.id, JSON.stringify(claimed)).toBe(jobId);
  const { body: up } = await workerCall("upload-urls", jobId, {});
  const outputs = OUTPUT_FILES.filter((f) => f !== opts.skip).map((file, i) => {
    const bytes = new Uint8Array(1000 + i);
    expect(storage.putTo(up.urls[file], bytes, up.contentType)).toBe(200);
    return { file, codec: "aac", durationS: 3, sampleRate: 44100, channels: 2, sizeBytes: bytes.byteLength, rmsDbfs: -20 };
  });
  return workerCall("complete", jobId, { device: "cpu", timings: { total_s: 1 }, sourceDurationS: opts.sourceDurationS ?? 3, outputs });
}
