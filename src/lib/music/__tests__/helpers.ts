import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiError } from "../server/http";

export const fixturesDir = mkdtempSync(path.join(tmpdir(), "sl-music-fx-"));

/** A few seconds of tone + noise bursts, encoded with ffmpeg into each supported format. */
export function makeAudio(name: string, seconds = 3, codec: string[] = []): Buffer {
  const out = path.join(fixturesDir, name);
  execFileSync("ffmpeg", [
    "-nostdin", "-v", "error", "-y", "-f", "lavfi",
    "-i", `aevalsrc='0.3*sin(2*PI*220*t)+0.1*(random(0)*2-1)*exp(-20*mod(t,0.5))':s=44100:c=stereo`,
    "-t", String(seconds), ...codec, out,
  ]);
  return readFileSync(out);
}

export const fixtures = () => ({
  mp3: makeAudio("a.mp3", 3, ["-c:a", "libmp3lame", "-b:a", "128k"]),
  wav: makeAudio("a.wav", 3, ["-c:a", "pcm_s16le"]),
  flac: makeAudio("a.flac", 3, ["-c:a", "flac"]),
  m4a: makeAudio("a.m4a", 3, ["-c:a", "aac", "-b:a", "128k"]),
  mp3b: makeAudio("b.mp3", 2, ["-c:a", "libmp3lame", "-b:a", "96k"]),
});

export function writeFixture(name: string, data: Buffer) {
  const p = path.join(fixturesDir, name);
  writeFileSync(p, data);
  return p;
}

/** Tokens in tests are just "user-<name>"; anything else is rejected like a bad Firebase token. */
export async function testVerifier(token: string) {
  if (!token.startsWith("user-")) throw new ApiError(401, "unauthorized", "Sign in to use your music library.");
  return token;
}

export const BASE = "http://localhost:3000";

export function req(method: string, url: string, opts: { user?: string; body?: BodyInit; headers?: Record<string, string> } = {}) {
  const headers = new Headers(opts.headers);
  if (opts.user) headers.set("authorization", `Bearer ${opts.user}`);
  return new Request(new URL(url, BASE), { method, body: opts.body, headers, duplex: "half" } as RequestInit);
}

export const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) });
