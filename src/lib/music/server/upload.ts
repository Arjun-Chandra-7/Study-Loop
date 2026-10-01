import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import { musicConfig } from "./config";
import { newId } from "./db";
import { ApiError } from "./http";
import { signTicket, verifyTicket } from "./sign";
import { getStorage } from "./storage";

/** What we accept. Extension, declared type and the file's own bytes must all agree on one of these. */
export const FORMATS = {
  mp3: { exts: [".mp3"], mimes: ["audio/mpeg", "audio/mp3", "audio/mpeg3", "audio/x-mpeg-3"], mime: "audio/mpeg" },
  wav: { exts: [".wav", ".wave"], mimes: ["audio/wav", "audio/x-wav", "audio/wave", "audio/vnd.wave"], mime: "audio/wav" },
  flac: { exts: [".flac"], mimes: ["audio/flac", "audio/x-flac"], mime: "audio/flac" },
  m4a: { exts: [".m4a"], mimes: ["audio/mp4", "audio/x-m4a", "audio/m4a"], mime: "audio/mp4" },
} as const;
export type Container = keyof typeof FORMATS;

/** Browsers often send these for audio they don't recognise; the content checks still apply. */
const GENERIC_MIMES = ["", "application/octet-stream"];
const HEAD_BYTES = 64 * 1024;
const TICKET_TTL_S = 15 * 60;

const unsupported = () =>
  new ApiError(415, "unsupported_format", "That file type isn't supported. Use MP3, WAV, M4A or FLAC.");
const tooLarge = (max: number) =>
  new ApiError(413, "too_large", `That file is too large. The limit is ${Math.round(max / 1048576)} MB.`);

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

interface UploadTicket {
  uid: string;
  trackId: string;
  pathname: string;
  container: Container;
}

export interface UploadStart {
  /** PUT the file here with `Content-Type: contentType`. */
  uploadUrl: string;
  contentType: string;
  /** Hand back to finish the upload. */
  ticket: string;
}

/** Step 1: check what the browser says it's sending and hand out a one-file upload URL. */
export async function beginUpload(uid: string, trackId: string, file: { name?: unknown; type?: unknown; size?: unknown }): Promise<UploadStart> {
  const { maxUploadBytes } = musicConfig();
  if (typeof file.name !== "string" || typeof file.size !== "number" || !Number.isFinite(file.size)) {
    throw new ApiError(400, "bad_request", "Choose an audio file to upload.");
  }
  const container = formatFor(file.name, typeof file.type === "string" ? file.type : "");
  if (file.size <= 0) throw new ApiError(400, "upload_failed", "That file is empty.");
  if (file.size > maxUploadBytes) throw tooLarge(maxUploadBytes);
  const pathname = `sources/${newId()}.${container}`;
  const contentType = FORMATS[container].mime;
  const uploadUrl = await getStorage().presignPut(pathname, { contentType, maxBytes: maxUploadBytes, ttlS: TICKET_TTL_S });
  return { uploadUrl, contentType, ticket: signTicket<UploadTicket>({ uid, trackId, pathname, container }, TICKET_TTL_S) };
}

export interface ReceivedAudio {
  pathname: string;
  sha256: string;
  sizeBytes: number;
  container: Container;
  mime: string;
}

/**
 * Step 2: the file is in storage. Check it's really there, really this format (its own bytes, not
 * the label), and fingerprint it. Full decoding happens in the worker, which has FFmpeg.
 */
export async function finishUpload(uid: string, trackId: string, ticket: unknown): Promise<ReceivedAudio> {
  const t = verifyTicket<UploadTicket>(ticket);
  if (t.uid !== uid || t.trackId !== trackId) throw new ApiError(400, "upload_expired", "That upload expired. Choose the file again.");
  const storage = getStorage();
  const { maxUploadBytes } = musicConfig();
  const meta = await storage.head(t.pathname);
  if (!meta) throw new ApiError(400, "upload_failed", "The upload didn't finish. Try again.");
  const reject = async (e: ApiError) => {
    await storage.remove(t.pathname);
    throw e;
  };
  if (meta.size > maxUploadBytes) return reject(tooLarge(maxUploadBytes));
  if (meta.size === 0) return reject(new ApiError(400, "upload_failed", "That file is empty."));

  const head = await storage.readRange(t.pathname, 0, Math.min(HEAD_BYTES, meta.size) - 1);
  const sniffed = sniff(head);
  if (sniffed === null || (sniffed === "id3" ? !["mp3", "flac"].includes(t.container) : sniffed !== t.container)) {
    return reject(unsupported());
  }

  const hash = createHash("sha256");
  const reader = (await storage.read(t.pathname)).getReader();
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    hash.update(value);
  }
  if (size !== meta.size) return reject(new ApiError(400, "upload_failed", "The upload was interrupted. Try again."));
  return { pathname: t.pathname, sha256: hash.digest("hex"), sizeBytes: size, container: t.container, mime: FORMATS[t.container].mime };
}
