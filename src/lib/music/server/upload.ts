import "server-only";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, statfsSync } from "node:fs";
import { mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { musicConfig } from "./config";
import { ApiError } from "./http";

const run = promisify(execFile);

/** What we accept. Every check below must agree on one of these. */
export const FORMATS = {
  mp3: { exts: [".mp3"], mimes: ["audio/mpeg", "audio/mp3", "audio/mpeg3", "audio/x-mpeg-3"], probe: "mp3", codecs: ["mp3"], mime: "audio/mpeg" },
  wav: { exts: [".wav", ".wave"], mimes: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"], probe: "wav", codecs: ["pcm_"], mime: "audio/wav" },
  flac: { exts: [".flac"], mimes: ["audio/flac", "audio/x-flac"], probe: "flac", codecs: ["flac"], mime: "audio/flac" },
  m4a: { exts: [".m4a"], mimes: ["audio/mp4", "audio/x-m4a", "audio/m4a"], probe: "m4a", codecs: ["aac", "alac"], mime: "audio/mp4" },
} as const;
export type Container = keyof typeof FORMATS;

/** Browsers often send these for audio they don't recognise; the content checks still apply. */
const GENERIC_MIMES = ["", "application/octet-stream"];
export const ACCEPT_ATTR = Object.values(FORMATS).flatMap((f) => [...f.exts, ...f.mimes]).join(",");

const HEAD_BYTES = 64 * 1024;

export function formatFor(fileName: string, mime: string): Container {
  const ext = path.extname(path.basename(fileName)).toLowerCase();
  const entry = (Object.entries(FORMATS) as [Container, (typeof FORMATS)[Container]][]).find(([, f]) =>
    (f.exts as readonly string[]).includes(ext),
  );
  if (!entry) throw unsupported();
  const m = mime.split(";")[0].trim().toLowerCase();
  if (!GENERIC_MIMES.includes(m) && !(entry[1].mimes as readonly string[]).includes(m)) throw unsupported();
  return entry[0];
}

/** Magic-byte sniff. "id3" means an ID3 tag hides the real container (MP3, sometimes FLAC). */
export function sniff(head: Uint8Array): Container | "id3" | null {
  const ascii = (a: number, b: number) => String.fromCharCode(...head.subarray(a, b));
  if (ascii(0, 3) === "ID3") return "id3";
  if ((ascii(0, 4) === "RIFF" || ascii(0, 4) === "RF64") && ascii(8, 12) === "WAVE") return "wav";
  if (ascii(0, 4) === "fLaC") return "flac";
  if (ascii(4, 8) === "ftyp") return "m4a";
  // MPEG audio frame sync with layer III.
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0 && ((head[1] >> 1) & 0x3) === 0x1) return "mp3";
  return null;
}

const unsupported = () =>
  new ApiError(415, "unsupported_format", "That file type isn't supported. Use MP3, WAV, M4A or FLAC.");
const corrupted = () =>
  new ApiError(422, "corrupted_audio", "This file couldn't be read as audio. Try exporting it again.");

function toolsMissing(e: unknown): never {
  if ((e as { code?: string }).code === "ENOENT") {
    throw new ApiError(503, "audio_tools_unavailable", "Audio processing isn't available on this server.");
  }
  throw corrupted();
}

export interface ReceivedAudio {
  tmpFile: string;
  sha256: string;
  sizeBytes: number;
  container: Container;
  mime: string;
  codec: string;
  sampleRate: number;
  channels: number;
  durationS: number;
}

/** Stream the request body to a private temp file, enforcing the size cap while hashing. */
async function receive(body: ReadableStream<Uint8Array>, tmpFile: string, maxBytes: number) {
  const hash = createHash("sha256");
  const out = createWriteStream(tmpFile, { flags: "wx", mode: 0o600 });
  const head = new Uint8Array(HEAD_BYTES);
  let size = 0;
  let headLen = 0;
  const reader = body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "too_large", `That file is too large. The limit is ${Math.round(maxBytes / 1048576)} MB.`);
      }
      if (headLen < HEAD_BYTES) {
        const n = Math.min(HEAD_BYTES - headLen, value.byteLength);
        head.set(value.subarray(0, n), headLen);
        headLen += n;
      }
      hash.update(value);
      if (!out.write(value)) await new Promise<void>((r) => out.once("drain", () => r()));
    }
    await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
  } catch (e) {
    out.destroy();
    if ((e as { code?: string }).code === "ENOSPC") {
      throw new ApiError(507, "disk_full", "The server is out of space for uploads right now. Try again later.");
    }
    if (e instanceof ApiError) throw e;
    throw new ApiError(400, "upload_failed", "The upload was interrupted. Try again.");
  }
  return { sha256: hash.digest("hex"), size, head: head.subarray(0, headLen) };
}

export async function receiveAudio(req: Request, fileName: string, declaredMime: string): Promise<ReceivedAudio> {
  const cfg = musicConfig();
  const container = formatFor(fileName, declaredMime);
  const declared = Number(req.headers.get("content-length") ?? NaN);
  if (declared > cfg.maxUploadBytes) {
    throw new ApiError(413, "too_large", `That file is too large. The limit is ${Math.round(cfg.maxUploadBytes / 1048576)} MB.`);
  }
  if (!req.body) throw new ApiError(400, "upload_failed", "No audio was received.");

  const tmpDir = path.join(cfg.dataDir, "tmp");
  await mkdir(tmpDir, { recursive: true });
  const fs = statfsSync(tmpDir);
  if (fs.bavail * fs.bsize < (Number.isFinite(declared) ? declared : cfg.maxUploadBytes) + 256 * 1048576) {
    throw new ApiError(507, "disk_full", "The server is out of space for uploads right now. Try again later.");
  }
  const tmpFile = path.join(tmpDir, `upload-${crypto.randomUUID()}.part`);
  try {
    const { sha256, size, head } = await receive(req.body, tmpFile, cfg.maxUploadBytes);
    if (size === 0) throw new ApiError(400, "upload_failed", "No audio was received.");

    const sniffed = sniff(head);
    if (sniffed === null || (sniffed === "id3" ? !["mp3", "flac"].includes(container) : sniffed !== container)) {
      throw unsupported();
    }

    // Decoder's view of the file must agree too.
    let probe: { format?: { format_name?: string; duration?: string }; streams?: { codec_type?: string; codec_name?: string; sample_rate?: string; channels?: number }[] };
    try {
      const { stdout } = await run("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", tmpFile], { timeout: 30_000, maxBuffer: 4 * 1048576 });
      probe = JSON.parse(stdout);
    } catch (e) {
      toolsMissing(e);
    }
    const stream = probe.streams?.find((s) => s.codec_type === "audio");
    const formats = (probe.format?.format_name ?? "").split(",");
    const spec = FORMATS[container];
    if (!stream || !formats.includes(spec.probe)) throw corrupted();
    if (!spec.codecs.some((c) => stream.codec_name?.startsWith(c))) throw unsupported();
    const durationS = Number(probe.format?.duration);
    if (!Number.isFinite(durationS) || durationS < 1) throw corrupted();
    if (durationS > cfg.maxDurationS) {
      throw new ApiError(413, "too_long", `That track is too long. The limit is ${Math.round(cfg.maxDurationS / 60)} minutes.`);
    }
    // Decode the whole audio stream once: proves it's playable, not just well-labelled.
    try {
      await run("ffmpeg", ["-nostdin", "-v", "error", "-xerror", "-i", tmpFile, "-map", "0:a:0", "-f", "null", "-"], { timeout: 120_000, maxBuffer: 1048576 });
    } catch (e) {
      toolsMissing(e);
    }
    return {
      tmpFile, sha256, sizeBytes: size, container, mime: spec.mime, codec: stream.codec_name ?? "",
      sampleRate: Number(stream.sample_rate ?? 0), channels: stream.channels ?? 0, durationS,
    };
  } catch (e) {
    await rm(tmpFile, { force: true });
    throw e;
  }
}

/** Move a validated upload into persistent storage under a server-generated name. */
export async function storeSource(tmpFile: string, sourceId: string, container: Container): Promise<string> {
  const rel = path.join("sources", `${sourceId}.${container}`);
  const dest = path.join(musicConfig().dataDir, rel);
  try {
    await mkdir(path.dirname(dest), { recursive: true });
    await rename(tmpFile, dest);
  } catch {
    await rm(tmpFile, { force: true });
    throw new ApiError(507, "storage_failed", "We couldn't save your audio. Try again later.");
  }
  return rel;
}
