import { ApiError, route } from "@/lib/music/server/http";
import { getStorage } from "@/lib/music/server/storage";

type Ctx = { params: Promise<{ id: string }> };

/** Serve a profile photo (shown wherever the person appears, so it's readable without a token). */
export const GET = route<Ctx>("profile.avatar.get", async (_req, { params }) => {
  const { id } = await params;
  if (!/^[a-f0-9]{32}$/.test(id)) throw new ApiError(404, "not_found", "No such photo.");
  const storage = getStorage();
  const path = `avatars/${id}.jpg`;
  if (!(await storage.head(path))) throw new ApiError(404, "not_found", "No such photo.");
  return new Response(await storage.read(path), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" },
  });
});
