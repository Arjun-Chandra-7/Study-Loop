import { createHash } from "node:crypto";
import { requireUser } from "@/lib/music/server/auth";
import { ApiError, route } from "@/lib/music/server/http";
import { getStorage } from "@/lib/music/server/storage";

const MAX_BYTES = 512 * 1024;

/** Stable, non-reversible id for a user's photo. */
const avatarId = (uid: string) => createHash("sha256").update(`avatar:${uid}`).digest("hex").slice(0, 32);

/**
 * Save a new profile photo. The browser crops and shrinks it to a 256 px JPEG first, so the body is
 * small. Returns the URL to put in the Firebase profile.
 */
export const POST = route("profile.avatar", async (req) => {
  const uid = await requireUser(req);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) throw new ApiError(413, "too_large", "That photo is too big. Try a smaller one.");
  // JPEG only (we produce it client-side); check the bytes, not the label.
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) throw new ApiError(415, "unsupported_format", "That doesn't look like a photo. Try a JPG or PNG.");
  const id = avatarId(uid);
  await getStorage().put(`avatars/${id}.jpg`, bytes, "image/jpeg");
  return Response.json({ url: `/api/profile/avatar/${id}?v=${Date.now()}` });
});
