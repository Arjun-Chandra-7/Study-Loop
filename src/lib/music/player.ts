"use client";

import { useSyncExternalStore } from "react";
import type { StudyMode, TrackView, VersionsView } from "./types";

export type QueueItem = Pick<TrackView, "id" | "title" | "artist" | "artworkUrl">;
export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  track: QueueItem | null;
  /** The version actually playing. */
  mode: StudyMode;
  /** The version the listener picked; kept across tracks and used whenever a track has it. */
  preferredMode: StudyMode;
  available: StudyMode[];
  playing: boolean;
  loading: boolean;
  time: number;
  duration: number;
  error: string | null;
  /** Play order. `index` points at the current track. */
  queue: QueueItem[];
  index: number;
  shuffle: boolean;
  repeat: RepeatMode;
  volume: number;
  muted: boolean;
}

const IDLE: PlayerState = {
  track: null,
  mode: "original",
  preferredMode: "original",
  available: [],
  playing: false,
  loading: false,
  time: 0,
  duration: 0,
  error: null,
  queue: [],
  index: -1,
  shuffle: false,
  repeat: "off",
  volume: 1,
  muted: false,
};

const MODES: StudyMode[] = ["original", "no_lyrics", "vocals_only", "beats_only"];
/** Like Spotify: "previous" restarts the song unless you're in its first few seconds. */
const RESTART_THRESHOLD_S = 3;

const item = (t: QueueItem): QueueItem => ({ id: t.id, title: t.title, artist: t.artist, artworkUrl: t.artworkUrl });

function shuffled<T>(xs: T[], random: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * One <audio> element for the whole app, so music keeps playing while you move between tabs.
 * Switching study version swaps the source and restores position and play/pause; all versions
 * come from the same decode, so they line up sample-for-sample. Queue, shuffle and repeat work
 * like a normal music player.
 */
export class MusicPlayer {
  private audio: HTMLAudioElement | null = null;
  private versions: VersionsView | null = null;
  private url: string | null = null;
  private loadSeq = 0;
  private openSeq = 0;
  private retried = false;
  /** Queue order before shuffle, so turning shuffle off restores it. */
  private unshuffled: QueueItem[] = [];
  private state: PlayerState = IDLE;
  private listeners = new Set<() => void>();
  /** Set by the view: fetches (fresh) signed links for a track's versions. */
  refetch: ((trackId: string) => Promise<VersionsView>) | null = null;

  constructor(
    private createAudio: () => HTMLAudioElement = () => new Audio(),
    private random: () => number = Math.random,
  ) {}

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
    a.volume = this.state.volume;
    a.muted = this.state.muted;
    a.addEventListener("timeupdate", () => this.set({ time: a.currentTime }));
    a.addEventListener("durationchange", () => Number.isFinite(a.duration) && this.set({ duration: a.duration }));
    a.addEventListener("play", () => this.set({ playing: true }));
    a.addEventListener("pause", () => this.set({ playing: false }));
    a.addEventListener("ended", () => void this.onEnded());
    a.addEventListener("waiting", () => this.set({ loading: true }));
    a.addEventListener("playing", () => this.set({ loading: false, error: null }));
    a.addEventListener("canplay", () => this.set({ loading: false }));
    a.addEventListener("error", () => void this.recover());
    this.audio = a;
    return a;
  }

  private availableIn(v: VersionsView): StudyMode[] {
    return MODES.filter((m) => v.versions[m]);
  }

  /** Load one track's versions (paused unless `autoplay`), honouring the preferred study version. */
  open(track: QueueItem, versions: VersionsView, opts: { mode?: StudyMode; autoplay?: boolean } = {}) {
    this.versions = versions;
    this.retried = false;
    const available = this.availableIn(versions);
    const preferredMode = opts.mode ?? this.state.preferredMode;
    const mode = available.includes(preferredMode) ? preferredMode : "original";
    const inQueue = this.state.queue.findIndex((q) => q.id === track.id);
    this.set({
      track: item(track),
      mode, preferredMode, available, time: 0, duration: versions.versions[mode]?.durationS ?? 0, error: null,
      ...(inQueue === -1 ? { queue: [item(track)], index: 0 } : { index: inQueue }),
    });
    if (inQueue === -1) this.unshuffled = [item(track)];
    this.load(versions.versions[mode]!.url, 0, opts.autoplay ?? false);
    this.mediaSession();
  }

  /** Replace the queue and start playing from `start`. Only pass tracks that have audio. */
  async playQueue(tracks: QueueItem[], start = 0, opts: { mode?: StudyMode } = {}) {
    if (!tracks.length) return;
    const list = tracks.map(item);
    const first = list[Math.min(Math.max(start, 0), list.length - 1)];
    this.unshuffled = list;
    const queue = this.state.shuffle ? [first, ...shuffled(list.filter((t) => t.id !== first.id), this.random)] : list;
    this.set({ queue, index: queue.indexOf(first), ...(opts.mode ? { preferredMode: opts.mode } : {}) });
    await this.playAt(queue.indexOf(first));
  }

  private async playAt(index: number, autoplay = true) {
    const t = this.state.queue[index];
    if (!t || !this.refetch) return;
    const seq = ++this.openSeq;
    this.set({ index, track: t, loading: true, error: null, time: 0 });
    try {
      const versions = await this.refetch(t.id);
      if (seq !== this.openSeq) return; // a later skip won
      this.open(t, versions, { autoplay });
    } catch {
      if (seq !== this.openSeq) return;
      this.set({ loading: false, playing: false, error: `Couldn't load “${t.title}”.` });
    }
  }

  /** New links/versions for the loaded track (e.g. processing just finished). Doesn't interrupt playback. */
  update(versions: VersionsView) {
    if (versions.trackId !== this.state.track?.id) return;
    this.versions = versions;
    this.set({ available: this.availableIn(versions) });
  }

  setMode(mode: StudyMode) {
    const v = this.versions?.versions[mode];
    if (!v) return;
    this.set({ preferredMode: mode });
    if (mode === this.state.mode) return;
    const a = this.el();
    const at = a.currentTime;
    const resume = !a.paused;
    this.set({ mode });
    this.load(v.url, at, resume);
  }

  private load(url: string, at: number, autoplay: boolean) {
    const a = this.el();
    if (url === this.url) {
      if (autoplay) {
        a.currentTime = at;
        a.play().catch(() => this.set({ playing: false }));
      }
      this.set({ loading: false });
      return;
    }
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

  hasNext() {
    const { queue, index, repeat } = this.state;
    return index < queue.length - 1 || (repeat === "all" && queue.length > 0);
  }

  async next() {
    const { queue, index, repeat } = this.state;
    if (index < queue.length - 1) return this.playAt(index + 1);
    if (repeat === "all" && queue.length) return this.playAt(0);
  }

  async previous() {
    const { queue, index, repeat } = this.state;
    if ((this.audio?.currentTime ?? 0) > RESTART_THRESHOLD_S || (index <= 0 && repeat !== "all")) {
      this.seek(0);
      return;
    }
    return this.playAt(index > 0 ? index - 1 : queue.length - 1);
  }

  private async onEnded() {
    const { repeat, index, queue } = this.state;
    if (repeat === "one") {
      this.seek(0);
      this.audio?.play().catch(() => this.set({ playing: false }));
      return;
    }
    if (index < queue.length - 1 || (repeat === "all" && queue.length > 1)) return this.next();
    if (repeat === "all") {
      this.seek(0);
      this.audio?.play().catch(() => this.set({ playing: false }));
      return;
    }
    this.set({ playing: false });
  }

  /** Jump to an entry already in the queue. */
  jumpTo(index: number) {
    return this.playAt(index);
  }

  /** Insert right after the current track. */
  playNext(track: QueueItem) {
    const t = item(track);
    if (this.state.track?.id === t.id) return;
    const queue = this.state.queue.filter((q) => q.id !== t.id);
    const current = queue.findIndex((q) => q.id === this.state.track?.id);
    queue.splice(current + 1, 0, t);
    this.unshuffled = [...this.unshuffled.filter((q) => q.id !== t.id), t];
    this.set({ queue, index: current });
  }

  addToQueue(track: QueueItem) {
    const t = item(track);
    if (this.state.queue.some((q) => q.id === t.id)) return;
    this.unshuffled = [...this.unshuffled, t];
    this.set({ queue: [...this.state.queue, t], index: this.state.index < 0 ? 0 : this.state.index });
  }

  removeFromQueue(index: number) {
    const { queue, index: current } = this.state;
    if (index === current || index < 0 || index >= queue.length) return;
    const removed = queue[index];
    this.unshuffled = this.unshuffled.filter((q) => q.id !== removed.id);
    this.set({ queue: queue.filter((_, i) => i !== index), index: index < current ? current - 1 : current });
  }

  /** Spotify-style: shuffling reorders what's still to come; un-shuffling restores the original order. */
  toggleShuffle() {
    const { queue, index, track, shuffle } = this.state;
    if (!shuffle) {
      const upcoming = shuffled(queue.filter((_, i) => i !== index), this.random);
      const q = track ? [item(track), ...upcoming] : upcoming;
      this.set({ shuffle: true, queue: q, index: track ? 0 : -1 });
    } else {
      const q = this.unshuffled.length ? this.unshuffled : queue;
      this.set({ shuffle: false, queue: q, index: track ? Math.max(0, q.findIndex((t) => t.id === track.id)) : -1 });
    }
  }

  cycleRepeat() {
    const next: Record<RepeatMode, RepeatMode> = { off: "all", all: "one", one: "off" };
    this.set({ repeat: next[this.state.repeat] });
  }

  setVolume(v: number) {
    const volume = Math.max(0, Math.min(1, v));
    if (this.audio) {
      this.audio.volume = volume;
      this.audio.muted = volume === 0 ? true : false;
    }
    this.set({ volume, muted: volume === 0 });
  }

  toggleMute() {
    const muted = !this.state.muted;
    if (this.audio) this.audio.muted = muted;
    const volume = !muted && this.state.volume === 0 ? 0.5 : this.state.volume;
    if (this.audio) this.audio.volume = volume;
    this.set({ muted, volume });
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
      this.set({ available: this.availableIn(fresh) });
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
    const on = (action: MediaSessionAction, fn: () => void) => {
      try {
        navigator.mediaSession.setActionHandler(action, fn);
      } catch {}
    };
    on("play", () => this.toggle());
    on("pause", () => this.toggle());
    on("nexttrack", () => void this.next());
    on("previoustrack", () => void this.previous());
    on("seekbackward", () => this.skip(-10));
    on("seekforward", () => this.skip(10));
  }
}

export const player = new MusicPlayer();

export function usePlayer(p: MusicPlayer = player): PlayerState {
  return useSyncExternalStore(p.subscribe, p.getSnapshot, () => IDLE);
}
