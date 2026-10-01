import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setExecutorForTests, type Executor, type Row } from "../server/db";
import { ApiError } from "../server/http";
import type { Storage } from "../server/storage";

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

/** In-process Postgres (PGlite). Fresh tables per test via `reset()`. */
export async function testDatabase() {
  const { PGlite } = await import("@electric-sql/pglite");
  const pg = new PGlite();
  const executor: Executor = {
    query: async (text, params) => (await pg.query(text, params)).rows as Row[],
    batch: async (statements) => {
      await pg.transaction(async (tx) => {
        for (const s of statements) await tx.query(s.text, s.params);
      });
    },
  };
  return {
    executor,
    async reset() {
      await pg.exec("DROP TABLE IF EXISTS music_outputs, music_jobs, music_tracks, music_sources, music_workers CASCADE");
      setExecutorForTests(executor); // re-applies the schema on next use
    },
    close: () => pg.close(),
  };
}

/**
 * Behaves like the private Blob store as far as the app can tell: presigned PUTs enforce their
 * content type and size; everything else reads what was stored.
 */
export class MemStorage implements Storage {
  files = new Map<string, { bytes: Uint8Array; contentType: string }>();
  private grants = new Map<string, { contentType: string; maxBytes: number }>();

  async presignPut(pathname: string, o: { contentType: string; maxBytes: number }) {
    this.grants.set(pathname, { contentType: o.contentType, maxBytes: o.maxBytes });
    return `https://blob.test/put/${encodeURIComponent(pathname)}`;
  }
  async presignGet(pathname: string) {
    return `https://blob.test/get/${encodeURIComponent(pathname)}`;
  }
  /** What a browser/worker PUT to a presigned URL does. Returns the HTTP status Blob would give. */
  putTo(url: string, bytes: Uint8Array, contentType: string): number {
    const pathname = decodeURIComponent(url.replace("https://blob.test/put/", ""));
    const g = this.grants.get(pathname);
    if (!g || g.contentType !== contentType || bytes.byteLength > g.maxBytes) return 403;
    this.files.set(pathname, { bytes, contentType });
    return 200;
  }
  pathOf(url: string) {
    return decodeURIComponent(url.replace(/^https:\/\/blob\.test\/(get|put)\//, ""));
  }
  async head(pathname: string) {
    const f = this.files.get(pathname);
    return f ? { size: f.bytes.byteLength, contentType: f.contentType } : null;
  }
  async readRange(pathname: string, start: number, end: number) {
    return this.files.get(pathname)!.bytes.subarray(start, end + 1);
  }
  async read(pathname: string) {
    const bytes = this.files.get(pathname)!.bytes;
    return new ReadableStream<Uint8Array>({
      start(c) {
        // Two chunks, like a real stream.
        c.enqueue(bytes.subarray(0, bytes.byteLength >> 1));
        c.enqueue(bytes.subarray(bytes.byteLength >> 1));
        c.close();
      },
    });
  }
  async remove(pathname: string) {
    this.files.delete(pathname);
  }
}
