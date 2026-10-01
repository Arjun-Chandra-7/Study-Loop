/** Shapes shared by the music API and the Music view. */

/** What the listener picks. Internally each maps to stems (see VERSION_STEMS). */
export type StudyMode = "original" | "no_lyrics" | "vocals_only" | "beats_only";

export const STUDY_MODES: { id: StudyMode; label: string; hint: string }[] = [
  { id: "original", label: "Original", hint: "The track as you uploaded it" },
  { id: "no_lyrics", label: "No Lyrics", hint: "Everything except the voice" },
  { id: "vocals_only", label: "Vocals Only", hint: "Just the voice" },
  { id: "beats_only", label: "Beats Only", hint: "Just the drums" },
];

/** Which separated stems make up each mode. `original` is the source itself. */
export const VERSION_STEMS: Record<StudyMode, readonly Stem[] | null> = {
  original: null,
  no_lyrics: ["drums", "bass", "other"],
  vocals_only: ["vocals"],
  beats_only: ["drums"],
};

export type Stem = "vocals" | "drums" | "bass" | "other";

export type JobStatus = "queued" | "processing" | "finalizing" | "completed" | "failed";

export interface JobView {
  id: string;
  status: JobStatus;
  /** 0–1 from the model's own chunk counter; null when the stage has no measurable progress. */
  progress: number | null;
  /** True when this result was reused instead of separating again. */
  cached?: boolean;
  error: { code: string; message: string } | null;
  /** Whether a processing worker has checked in recently (only meaningful while queued). */
  workerOnline?: boolean;
  device?: string | null;
}

export interface TrackView {
  id: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
  playlistName: string | null;
  audio: { durationS: number; sizeBytes: number; container: string } | null;
  job: JobView | null;
}

export interface VersionsView {
  trackId: string;
  /** Only `original` until processing completes. */
  versions: Partial<Record<StudyMode, { url: string; durationS: number }>>;
  expiresAt: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
