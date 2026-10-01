import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { musicConfig } from "./config";
import { ApiError } from "./http";

/**
 * <audio> can't send an Authorization header, so playback uses short-lived signed URLs:
 * /api/music/files/<payload>.<hmac>. The payload names a DB row and a keyed hash of the owner
 * (never the raw uid, since URLs end up in logs); the route re-checks ownership against the
 * database before serving anything.
 */
export interface FileClaim {
  /** "o" = processed output row, "s" = uploaded source row */
  k: "o" | "s";
  id: string;
  /** ownerTag(uid) */
  u: string;
  exp: number;
}

let secret: Buffer | null = null;
function signingSecret(): Buffer {
  if (secret) return secret;
  const { signingSecret: env, dataDir } = musicConfig();
  if (env) return (secret = Buffer.from(env, "utf8"));
  // Dev fallback: a random secret kept with the data so links survive restarts.
  const file = path.join(dataDir, ".signing-secret");
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(32).toString("hex"), { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as { code?: string }).code !== "EEXIST") throw e; // another process created it first
    }
  }
  return (secret = Buffer.from(readFileSync(file, "utf8").trim(), "utf8"));
}

const mac = (payload: string) => createHmac("sha256", signingSecret()).update(payload).digest("base64url");

/** Identifies the owner inside a link without revealing their uid. */
export const ownerTag = (uid: string) => createHmac("sha256", signingSecret()).update(`owner:${uid}`).digest("base64url").slice(0, 22);

export function signFile(claim: { k: FileClaim["k"]; id: string; uid: string }, ttlS = musicConfig().urlTtlS): { url: string; exp: number } {
  const exp = Math.floor(Date.now() / 1000) + ttlS;
  const body: FileClaim = { k: claim.k, id: claim.id, u: ownerTag(claim.uid), exp };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return { url: `/api/music/files/${payload}.${mac(payload)}`, exp };
}

export function verifyFileToken(token: string): FileClaim {
  const [payload, sig, extra] = token.split(".");
  const denied = new ApiError(403, "link_expired", "This audio link has expired. Reload the track.");
  if (!payload || !sig || extra !== undefined) throw denied;
  const want = Buffer.from(mac(payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw denied;
  let claim: FileClaim;
  try {
    claim = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw denied;
  }
  if (typeof claim.exp !== "number" || claim.exp < Date.now() / 1000) throw denied;
  return claim;
}

/** Resolve a stored relative path, refusing anything outside the data dir. */
export function dataPath(rel: string): string {
  const base = musicConfig().dataDir;
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) throw new ApiError(404, "not_found", "Audio not found.");
  return full;
}

/** Serve a file with HTTP Range support so the player can seek without downloading everything. */
export function fileResponse(req: Request, file: string, contentType: string): Response {
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    throw new ApiError(404, "not_found", "Audio not found.");
  }
  const headers = new Headers({
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
  });
  const range = req.headers.get("range");
  let start = 0;
  let end = size - 1;
  let status = 200;
  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === "" && m[2] === "")) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    if (m[1] === "") {
      start = Math.max(0, size - Number(m[2]));
    } else {
      start = Number(m[1]);
      end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
    }
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    status = 206;
    headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  headers.set("Content-Length", String(end - start + 1));
  if (req.method === "HEAD") return new Response(null, { status, headers });
  const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
  return new Response(body, { status, headers });
}
