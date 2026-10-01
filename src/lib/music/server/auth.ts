import "server-only";
import { createPublicKey, createVerify, type KeyObject } from "node:crypto";
import { ApiError } from "./http";

/**
 * Verifies Firebase Auth ID tokens (the same check firebase-admin does) using Google's
 * published signing certificates, so the API needs no service-account credentials.
 * https://firebase.google.com/docs/auth/admin/verify-id-tokens#verify_id_tokens_using_a_third-party_jwt_library
 */
const CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
const SKEW_S = 60;

let certs: { keys: Map<string, KeyObject>; expires: number } | null = null;

async function signingKeys(force = false): Promise<Map<string, KeyObject>> {
  if (!force && certs && certs.expires > Date.now()) return certs.keys;
  const res = await fetch(CERTS_URL, { cache: "no-store" });
  if (!res.ok) throw new ApiError(503, "auth_unavailable", "Couldn't check your sign-in right now. Try again.");
  const body = (await res.json()) as Record<string, string>;
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") ?? "")?.[1] ?? 3600);
  certs = {
    keys: new Map(Object.entries(body).map(([kid, pem]) => [kid, createPublicKey(pem)])),
    expires: Date.now() + maxAge * 1000,
  };
  return certs.keys;
}

const b64json = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

export async function verifyFirebaseIdToken(token: string, projectId: string): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) throw unauthorized();
  let header: { alg?: string; kid?: string };
  let claims: { aud?: string; iss?: string; sub?: string; exp?: number; iat?: number; auth_time?: number };
  try {
    header = b64json(parts[0]);
    claims = b64json(parts[1]);
  } catch {
    throw unauthorized();
  }
  if (header.alg !== "RS256" || !header.kid) throw unauthorized();
  let key = (await signingKeys()).get(header.kid);
  if (!key) key = (await signingKeys(true)).get(header.kid); // keys rotate
  if (!key) throw unauthorized();
  const ok = createVerify("RSA-SHA256").update(`${parts[0]}.${parts[1]}`).verify(key, Buffer.from(parts[2], "base64url"));
  const now = Date.now() / 1000;
  if (
    !ok ||
    claims.aud !== projectId ||
    claims.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof claims.sub !== "string" ||
    !claims.sub ||
    claims.sub.length > 128 ||
    typeof claims.exp !== "number" ||
    claims.exp < now - SKEW_S ||
    typeof claims.iat !== "number" ||
    claims.iat > now + SKEW_S ||
    (typeof claims.auth_time === "number" && claims.auth_time > now + SKEW_S)
  ) {
    throw unauthorized();
  }
  return claims.sub;
}

const unauthorized = () => new ApiError(401, "unauthorized", "Sign in to use your music library.");

type Verifier = (token: string) => Promise<string>;
let testVerifier: Verifier | null = null;

/** Tests only: replace token verification. Ignored outside NODE_ENV=test. */
export function setTestVerifier(v: Verifier | null) {
  if (process.env.NODE_ENV === "test") testVerifier = v;
}

/** The signed-in user's Firebase uid, from `Authorization: Bearer <ID token>`. */
export async function requireUser(req: Request): Promise<string> {
  const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(req.headers.get("authorization") ?? "");
  if (!m) throw unauthorized();
  if (testVerifier && process.env.NODE_ENV === "test") return testVerifier(m[1]);
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) throw new ApiError(503, "auth_unavailable", "Sign-in isn't configured on this server.");
  return verifyFirebaseIdToken(m[1], projectId);
}
