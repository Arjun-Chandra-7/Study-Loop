"use client";

import { getFirebaseAuth } from "../firebase";
import type { JobView, TrackView, VersionsView } from "./types";

export class MusicApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function idToken(): Promise<string> {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new MusicApiError(401, "unauthorized", "Sign in to use your music library.");
  return user.getIdToken();
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers, Authorization: `Bearer ${await idToken()}` },
    });
  } catch (e) {
    if (e instanceof MusicApiError) throw e;
    throw new MusicApiError(0, "offline", "Couldn't reach StudyLoop. Check your connection.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MusicApiError(res.status, body?.error?.code ?? "internal", body?.error?.message ?? "Something went wrong. Try again.");
  }
  return body as T;
}

export const musicApi = {
  tracks: () => call<{ tracks: TrackView[] }>("/api/music/tracks").then((r) => r.tracks),
  addTrack: (title: string, artist: string) =>
    call<{ track: TrackView }>("/api/music/tracks", { method: "POST", body: JSON.stringify({ title, artist }) }).then((r) => r.track),
  importSpotify: (url: string) =>
    call<{ added: number; total: number; playlistName: string | null; tracks: TrackView[] }>("/api/music/import", {
      method: "POST",
      body: JSON.stringify({ url }),
    }),
  process: (trackId: string) => call<{ job: JobView }>(`/api/music/tracks/${trackId}/process`, { method: "POST" }).then((r) => r.job),
  job: (jobId: string) => call<{ job: JobView }>(`/api/music/jobs/${jobId}`).then((r) => r.job),
  versions: (trackId: string) => call<VersionsView>(`/api/music/tracks/${trackId}/versions`),

  /** XHR rather than fetch: it reports real upload progress. */
  async upload(trackId: string, file: File, onProgress: (fraction: number) => void, signal?: AbortSignal): Promise<TrackView> {
    const token = await idToken();
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/music/tracks/${trackId}/audio`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
      xhr.onerror = () => reject(new MusicApiError(0, "upload_failed", "The upload was interrupted. Try again."));
      xhr.onabort = () => reject(new MusicApiError(0, "aborted", "Upload cancelled."));
      xhr.onload = () => {
        let body: { track?: TrackView; error?: { code: string; message: string } } | null = null;
        try {
          body = JSON.parse(xhr.responseText);
        } catch {}
        if (xhr.status >= 200 && xhr.status < 300 && body?.track) resolve(body.track);
        else reject(new MusicApiError(xhr.status, body?.error?.code ?? "upload_failed", body?.error?.message ?? "The upload failed. Try again."));
      };
      signal?.addEventListener("abort", () => xhr.abort());
      xhr.send(file);
    });
  },
};
