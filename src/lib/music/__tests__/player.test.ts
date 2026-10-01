import { describe, expect, it, vi } from "vitest";
import { MusicPlayer } from "../player";
import type { TrackView, VersionsView } from "../types";

/** Just enough of HTMLAudioElement: loading a src fires loadedmetadata on the next tick. */
class FakeAudio extends EventTarget {
  src = "";
  paused = true;
  currentTime = 0;
  duration = NaN;
  preload = "";
  loads = 0;
  failNext = false;
  load() {
    this.loads++;
    this.currentTime = 0;
    const fail = this.failNext;
    this.failNext = false;
    queueMicrotask(() => {
      if (fail) return this.dispatchEvent(new Event("error"));
      this.duration = 200;
      this.dispatchEvent(new Event("durationchange"));
      this.dispatchEvent(new Event("loadedmetadata"));
    });
  }
  async play() {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
  }
  pause() {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  }
}

const track: TrackView = {
  id: "t1", title: "Song", artist: "Artist", album: null, artworkUrl: null, durationMs: null,
  spotifyUrl: null, playlistName: null, audio: { durationS: 200, sizeBytes: 1, container: "mp3" }, job: null,
};
const all = (n = 1): VersionsView => ({
  trackId: "t1",
  expiresAt: Date.now() + 1e6,
  versions: {
    original: { url: `/o${n}`, durationS: 200 },
    no_lyrics: { url: `/n${n}`, durationS: 200 },
    vocals_only: { url: `/v${n}`, durationS: 200 },
    beats_only: { url: `/b${n}`, durationS: 200 },
  },
});
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const audio = new FakeAudio();
  const p = new MusicPlayer(() => audio as unknown as HTMLAudioElement);
  return { audio, p };
}

describe("MusicPlayer", () => {
  it("opens a track and plays the chosen version", async () => {
    const { audio, p } = setup();
    p.open(track, all(), { mode: "no_lyrics", autoplay: true });
    await tick();
    expect(audio.src).toBe("/n1");
    expect(p.getSnapshot()).toMatchObject({ mode: "no_lyrics", playing: true, loading: false, duration: 200 });
    expect(p.getSnapshot().available).toEqual(["original", "no_lyrics", "vocals_only", "beats_only"]);
  });

  it("keeps position and play state when switching versions", async () => {
    const { audio, p } = setup();
    p.open(track, all(), { autoplay: true });
    await tick();
    audio.currentTime = 151;
    p.setMode("beats_only");
    await tick();
    expect(audio.src).toBe("/b1");
    expect(audio.currentTime).toBe(151);
    expect(audio.paused).toBe(false);

    audio.pause();
    audio.currentTime = 30;
    p.setMode("vocals_only");
    await tick();
    expect(audio.currentTime).toBe(30);
    expect(audio.paused).toBe(true);
    expect(p.getSnapshot().mode).toBe("vocals_only");
  });

  it("doesn't reload for the active version or one that doesn't exist", async () => {
    const { audio, p } = setup();
    p.open(track, { trackId: "t1", expiresAt: 0, versions: { original: { url: "/o", durationS: 200 } } });
    await tick();
    const loads = audio.loads;
    p.setMode("original");
    p.setMode("no_lyrics"); // not processed yet
    expect(audio.loads).toBe(loads);
    expect(p.getSnapshot()).toMatchObject({ mode: "original", available: ["original"] });
  });

  it("unlocks versions when processing finishes without interrupting playback", async () => {
    const { audio, p } = setup();
    p.open(track, { trackId: "t1", expiresAt: 0, versions: { original: { url: "/src", durationS: 200 } } }, { autoplay: true });
    await tick();
    audio.currentTime = 12;
    p.update(all());
    expect(audio.src).toBe("/src");
    expect(audio.currentTime).toBe(12);
    expect(p.getSnapshot().available).toHaveLength(4);
  });

  it("refetches expired links once and resumes where it was", async () => {
    const { audio, p } = setup();
    p.refetch = vi.fn(async () => all(2));
    p.open(track, all(1), { mode: "no_lyrics", autoplay: true });
    await tick();
    audio.currentTime = 99;
    audio.dispatchEvent(new Event("timeupdate"));
    audio.currentTime = 0; // browsers may reset position on a media error
    audio.dispatchEvent(new Event("error")); // e.g. the signed link expired mid-session
    await tick();
    await tick();
    expect(p.refetch).toHaveBeenCalledWith("t1");
    expect(audio.src).toBe("/n2");
    expect(audio.currentTime).toBe(99);
    expect(p.getSnapshot().error).toBeNull();
  });

  it("shows an error if the version still can't play", async () => {
    const { audio, p } = setup();
    p.refetch = null;
    p.open(track, all());
    await tick();
    audio.dispatchEvent(new Event("error"));
    await tick();
    expect(p.getSnapshot().error).toMatch(/couldn't be played/);
  });

  it("seeks and skips within the track", async () => {
    const { audio, p } = setup();
    p.open(track, all());
    await tick();
    p.seek(250);
    expect(audio.currentTime).toBe(200);
    p.skip(-10);
    expect(audio.currentTime).toBe(190);
    p.seek(-5);
    expect(audio.currentTime).toBe(0);
  });
});
