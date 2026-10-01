"use client";

import { useSyncExternalStore } from "react";
import type { StudyMode, TrackView, VersionsView } from "./types";

export interface PlayerState {
  track: Pick<TrackView, "id" | "title" | "artist" | "artworkUrl"> | null;
  mode: StudyMode;
  available: StudyMode[];
  playing: boolean;
  loading: boolean;
  time: number;
  duration: number;
  error: string | null;
}

const IDLE: PlayerState = {
  track: null,
  mode: "original",
  available: [],
  playing: false,
  loading: false,
  time: 0,
  duration: 0,
  error: null,
};

/**
 * One <audio> element for the whole app, so music keeps playing while you move between tabs.
 * Switching study version swaps the source and restores position and play/pause; all versions
 * come from the same decode, so they line up sample-for-sample.
 */
export class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private versions: VersionsView | null = null;
  private url: string | null = null;
  private loadSeq = 0;
  private retried = false;
  private state: PlayerState = IDLE;
  private listeners = new Set<() => void>();
  /** Set by the view: fetches fresh signed links when the current ones expire. */
  refetch: ((trackId: string) => Promise<VersionsView>) | null = null;

  constructor(private createAudio: () => HTMLAudioElement = () => new Audio()) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.state;

  private set(patch: Partial<PlayerState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }

  private el(): HTMLAudioElement {
    if (this.audio) return this.audio;
    const a = this.createAudio();
    a.preload = "metadata";
    a.addEventListener("timeupdate", () => this.set({ time: a.currentTime }));
    a.addEventListener("durationchange", () => Number.isFinite(a.duration) && this.set({ duration: a.duration }));
    a.addEventListener("play", () => this.set({ playing: true }));
    a.addEventListener("pause", () => this.set({ playing: false }));
    a.addEventListener("ended", () => this.set({ playing: false }));
    a.addEventListener("waiting", () => this.set({ loading: true }));
    a.addEventListener("playing", () => this.set({ loading: false, error: null }));
    a.addEventListener("canplay", () => this.set({ loading: false }));
    a.addEventListener("error", () => void this.recover());
    this.audio = a;
    return a;
  }

  private available(v: VersionsView): StudyMode[] {
    return (["original", "no_lyrics", "vocals_only", "beats_only"] as StudyMode[]).filter((m) => v.versions[m]);
  }

  /** Load a track (paused unless `autoplay`). Keeps the chosen mode if this track has it. */
  open(track: TrackView, versions: VersionsView, opts: { mode?: StudyMode; autoplay?: boolean } = {}) {
    this.versions = versions;
    this.retried = false;
    const available = this.available(versions);
    const want = opts.mode ?? this.state.mode;
    const mode = available.includes(want) ? want : "original";
    this.set({
      track: { id: track.id, title: track.title, artist: track.artist, artworkUrl: track.artworkUrl },
      mode, available, time: 0, duration: versions.versions[mode]?.durationS ?? 0, error: null,
    });
    this.load(versions.versions[mode]!.url, 0, opts.autoplay ?? false);
    this.mediaSession();
  }

  /** New links/versions for the loaded track (e.g. processing just finished). Doesn't interrupt playback. */
  update(versions: VersionsView) {
    if (versions.trackId !== this.state.track?.id) return;
    this.versions = versions;
    this.set({ available: this.available(versions) });
  }

  setMode(mode: StudyMode) {
    const v = this.versions?.versions[mode];
    if (!v || mode === this.state.mode) return;
    const a = this.el();
    const at = a.currentTime;
    const resume = !a.paused;
    this.set({ mode });
    this.load(v.url, at, resume);
  }

  private load(url: string, at: number, autoplay: boolean) {
    const a = this.el();
    if (url === this.url) return;
    const seq = ++this.loadSeq;
    this.url = url;
    this.set({ loading: true, error: null });
    const restore = () => {
      if (seq !== this.loadSeq) return;
      if (at > 0) a.currentTime = Math.min(at, Math.max(0, a.duration - 0.25) || at);
      this.set({ loading: false, time: a.currentTime });
      if (autoplay) a.play().catch(() => this.set({ playing: false }));
    };
    a.addEventListener("loadedmetadata", restore, { once: true });
    a.src = url;
    a.load();
  }

  toggle() {
    const a = this.audio;
    if (!a || !this.state.track) return;
    if (a.paused) a.play().catch(() => this.set({ playing: false, error: "Playback was blocked. Press play again." }));
    else a.pause();
  }

  seek(seconds: number) {
    const a = this.audio;
    if (!a || !this.state.track) return;
    a.currentTime = Math.max(0, Math.min(seconds, this.state.duration || seconds));
    this.set({ time: a.currentTime });
  }

  skip(delta: number) {
    this.seek((this.audio?.currentTime ?? 0) + delta);
  }

  /** Links expire; on a load error fetch fresh ones once and resume where we were. */
  private async recover() {
    const a = this.audio;
    const track = this.state.track;
    if (!a || !track || !this.url) return;
    if (this.retried || !this.refetch) {
      this.set({ loading: false, playing: false, error: "This version couldn't be played. Try reloading the track." });
      return;
    }
    this.retried = true;
    // Some browsers reset currentTime on a media error; the last reported position survives in state.
    const at = this.state.time || a.currentTime;
    const resume = this.state.playing;
    try {
      const fresh = await this.refetch(track.id);
      this.versions = fresh;
      const v = fresh.versions[this.state.mode];
      if (!v) throw new Error("mode gone");
      this.url = null;
      this.set({ available: this.available(fresh) });
      this.load(v.url, at, resume);
    } catch {
      this.set({ loading: false, playing: false, error: "This version couldn't be played. Try reloading the track." });
    }
  }

  private mediaSession() {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator) || !this.state.track) return;
    const t = this.state.track;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: t.title,
      artist: t.artist,
      artwork: t.artworkUrl ? [{ src: t.artworkUrl, sizes: "300x300" }] : [],
    });
    navigator.mediaSession.setActionHandler("play", () => this.toggle());
    navigator.mediaSession.setActionHandler("pause", () => this.toggle());
    navigator.mediaSession.setActionHandler("seekbackward", () => this.skip(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => this.skip(10));
  }
}

export const player = new MusicPlayer();

export function usePlayer(p: MusicPlayer = player): PlayerState {
  return useSyncExternalStore(p.subscribe, p.getSnapshot, () => IDLE);
}
