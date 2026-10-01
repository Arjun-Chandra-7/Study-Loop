import "server-only";
import { del, head, issueSignedToken, presignUrl, put, type IssuedSignedToken } from "@vercel/blob";
import { ApiError } from "./http";
import { log } from "./log";

/**
 * Audio files live in a private Vercel Blob store. Nothing is public: browsers and the worker get
 * short-lived presigned URLs scoped to one pathname and one operation. Uploads go straight from the
 * browser to Blob (function bodies are capped at 4.5 MB); playback streams from the Blob CDN with
 * Range support.
 */
export interface Storage {
  presignPut(pathname: string, opts: { contentType: string; maxBytes: number; ttlS: number }): Promise<string>;
  presignGet(pathname: string, opts: { ttlS: number }): Promise<string>;
  head(pathname: string): Promise<{ size: number; contentType: string } | null>;
  /** Bytes [start, end] inclusive. */
  readRange(pathname: string, start: number, end: number): Promise<Uint8Array>;
  read(pathname: string): Promise<ReadableStream<Uint8Array>>;
  remove(pathname: string): Promise<void>;
  /** Small server-side writes (e.g. profile photos). */
  put(pathname: string, bytes: Uint8Array, contentType: string): Promise<void>;
}

const storageDown = () =>
  new ApiError(503, "storage_unavailable", "Audio storage isn't available right now. Try again shortly.");

class BlobStorage implements Storage {
  private token: IssuedSignedToken | null = null;

  /** One store-wide delegation, reused until shortly before it expires; each URL is scoped to a pathname. */
  private async delegation(): Promise<IssuedSignedToken> {
    if (this.token && this.token.validUntil > Date.now() + 5 * 60_000) return this.token;
    try {
      this.token = await issueSignedToken({
        pathname: "*",
        operations: ["get", "head", "put"],
        validUntil: Date.now() + 60 * 60_000,
      });
    } catch (e) {
      log("storage_failed", { stage: "signed_token", error: (e as Error).name, detail: (e as Error).message });
      throw storageDown();
    }
    return this.token;
  }

  async presignPut(pathname: string, o: { contentType: string; maxBytes: number; ttlS: number }) {
    const { presignedUrl } = await presignUrl(await this.delegation(), {
      access: "private",
      operation: "put",
      pathname,
      allowedContentTypes: [o.contentType],
      maximumSizeInBytes: o.maxBytes,
      addRandomSuffix: false,
      allowOverwrite: true,
      validUntil: Date.now() + o.ttlS * 1000,
    });
    return presignedUrl;
  }

  async presignGet(pathname: string, o: { ttlS: number }) {
    const { presignedUrl } = await presignUrl(await this.delegation(), {
      access: "private",
      operation: "get",
      pathname,
      validUntil: Date.now() + o.ttlS * 1000,
    });
    return presignedUrl;
  }

  async head(pathname: string) {
    try {
      const h = await head(pathname);
      return { size: h.size, contentType: h.contentType };
    } catch (e) {
      if ((e as Error).name === "BlobNotFoundError" || /does not exist/i.test((e as Error).message)) return null;
      log("storage_failed", { stage: "head", error: (e as Error).name });
      throw storageDown();
    }
  }

  async readRange(pathname: string, start: number, end: number) {
    const res = await fetch(await this.presignGet(pathname, { ttlS: 120 }), { headers: { range: `bytes=${start}-${end}` } });
    if (!res.ok) throw storageDown();
    return new Uint8Array(await res.arrayBuffer());
  }

  async read(pathname: string) {
    const res = await fetch(await this.presignGet(pathname, { ttlS: 600 }));
    if (!res.ok || !res.body) throw storageDown();
    return res.body;
  }

  async put(pathname: string, bytes: Uint8Array, contentType: string) {
    try {
      await put(pathname, Buffer.from(bytes), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType });
    } catch (e) {
      log("storage_failed", { stage: "put", error: (e as Error).name });
      throw storageDown();
    }
  }

  async remove(pathname: string) {
    try {
      await del(pathname);
    } catch (e) {
      log("storage_failed", { stage: "delete", error: (e as Error).name });
    }
  }
}

let storage: Storage | null = null;

export function getStorage(): Storage {
  storage ??= new BlobStorage();
  return storage;
}

/** Tests: swap in an in-memory store. */
export function setStorageForTests(s: Storage | null) {
  storage = s;
}
