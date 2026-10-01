import { fileResponse, verifyFileToken } from "@/lib/music/server/files";
import { route } from "@/lib/music/server/http";
import { resolveFile } from "@/lib/music/server/library";

type Ctx = { params: Promise<{ token: string }> };

/** Streams one audio file from a signed link issued by /tracks/:id/versions. */
const serve = route<Ctx>("files.get", async (req, { params }) => {
  const { token } = await params;
  const { file, mime } = resolveFile(verifyFileToken(token));
  return fileResponse(req, file, mime);
});

export const GET = serve;
export const HEAD = serve;
