import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "./http";
import { log } from "./log";

/**
 * Short-lived signed tickets (`<base64url json>.<hmac>`). Used for upload tickets: the browser gets one
 * with its presigned upload URL and hands it back to finish the upload, so the server knows which
 * pathname belongs to which user and track without keeping state.
 */
let devSecret: Buffer | null = null;

function secret(): Buffer {
  const env = process.env.MUSIC_SIGNING_SECRET;
  if (env) return Buffer.from(env, "utf8");
  if (process.env.NODE_ENV === "production") {
    log("storage_failed", { reason: "MUSIC_SIGNING_SECRET not set" });
    throw new ApiError(503, "storage_unavailable", "Uploads aren't available right now. Try again shortly.");
  }
  // Development: a per-process secret is enough for 15-minute tickets.
  devSecret ??= randomBytes(32);
  return devSecret;
}

const mac = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function signTicket<T extends object>(body: T, ttlS: number): string {
  const payload = Buffer.from(JSON.stringify({ ...body, exp: Math.floor(Date.now() / 1000) + ttlS })).toString("base64url");
  return `${payload}.${mac(payload)}`;
}

export function verifyTicket<T extends object>(ticket: unknown): T {
  const bad = new ApiError(400, "upload_expired", "That upload expired. Choose the file again.");
  if (typeof ticket !== "string") throw bad;
  const [payload, sig, extra] = ticket.split(".");
  if (!payload || !sig || extra !== undefined) throw bad;
  const want = Buffer.from(mac(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw bad;
  let body: T & { exp?: number };
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw bad;
  }
  if (typeof body.exp !== "number" || body.exp < Date.now() / 1000) throw bad;
  return body;
}
