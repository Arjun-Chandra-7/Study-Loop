import type { IconName } from "@/components/ui/Icon";
import type { TrackView } from "./types";

export type TrackStatusKey =
  | "needs_audio"
  | "uploading"
  | "ready"
  | "queued"
  | "processing"
  | "finalizing"
  | "completed"
  | "failed";

export interface TrackStatus {
  key: TrackStatusKey;
  label: string;
  icon: IconName;
  /** Extra sentence for the user, if any. */
  detail: string | null;
  /** 0–1 only when something real is being measured (upload bytes, model chunks). */
  progress: number | null;
}

/** Every state carries a word and an icon; colour is never the only signal. */
export function trackStatus(track: TrackView, uploadProgress?: number): TrackStatus {
  if (uploadProgress !== undefined) {
    return { key: "uploading", label: "Uploading audio…", icon: "upload", detail: null, progress: uploadProgress };
  }
  const job = track.job;
  if (!track.audio) {
    return { key: "needs_audio", label: "Needs audio", icon: "upload", detail: "Add a file you own or have the rights to use.", progress: null };
  }
  switch (job?.status) {
    case undefined:
      return { key: "ready", label: "Ready to process", icon: "wave", detail: null, progress: null };
    case "queued":
      return {
        key: "queued",
        label: "Waiting for processing…",
        icon: "session",
        detail: job.workerOnline === false ? "The processing service is offline. Your track will start when it's back." : null,
        progress: null,
      };
    case "processing":
      return { key: "processing", label: "Separating music…", icon: "wave", detail: null, progress: job.progress };
    case "finalizing":
      return { key: "finalizing", label: "Preparing study versions…", icon: "wave", detail: null, progress: null };
    case "completed":
      return { key: "completed", label: "Ready to study", icon: "check", detail: null, progress: null };
    case "failed":
      return { key: "failed", label: "Processing failed", icon: "alert", detail: job.error?.message ?? null, progress: null };
  }
}
