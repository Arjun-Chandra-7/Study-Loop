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
  volume = 1;
  muted = false;
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

  describe("queue", () => {
    const q = (id: string) => ({ id, title: `Song ${id}`, artist: "A", artworkUrl: null });
    /** Versions per track; "u" = unprocessed (Original only). */
    const versionsFor = (id: string): VersionsView =>
      id.startsWith("u")
        ? { trackId: id, expiresAt: 0, versions: { original: { url: `/${id}/o`, durationS: 200 } } }
        : {
            trackId: id,
            expiresAt: 0,
            versions: {
              original: { url: `/${id}/o`, durationS: 200 },
              no_lyrics: { url: `/${id}/n`, durationS: 200 },
              vocals_only: { url: `/${id}/v`, durationS: 200 },
              beats_only: { url: `/${id}/b`, durationS: 200 },
            },
          };
    function queued(random = () => 0.5) {
      const audio = new FakeAudio();
      const p = new MusicPlayer(() => audio as unknown as HTMLAudioElement, random);
      p.refetch = async (id) => versionsFor(id);
      return { audio, p, ids: () => p.getSnapshot().queue.map((t) => t.id) };
    }
    const settle = async () => {
      await tick();
      await tick();
    };

    it("plays a list from the chosen track and moves through it", async () => {
      const { audio, p } = queued();
      await p.playQueue([q("a"), q("b"), q("c")], 1);
      await settle();
      expect(p.getSnapshot()).toMatchObject({ index: 1, track: { id: "b" }, playing: true });
      await p.next();
      await settle();
      expect(audio.src).toBe("/c/o");
      expect(p.hasNext()).toBe(false);
      await p.next(); // end of queue, repeat off: stays put
      expect(p.getSnapshot().track?.id).toBe("c");
    });

    it("previous restarts the song after 3 s, otherwise goes back", async () => {
      const { audio, p } = queued();
      await p.playQueue([q("a"), q("b")], 1);
      await settle();
      audio.currentTime = 42;
      await p.previous();
      expect(audio.currentTime).toBe(0);
      expect(p.getSnapshot().track?.id).toBe("b");
      await p.previous();
      await settle();
      expect(p.getSnapshot().track?.id).toBe("a");
    });

    it("advances when a song ends, and honours repeat all / one", async () => {
      const { audio, p } = queued();
      await p.playQueue([q("a"), q("b")]);
      await settle();
      audio.dispatchEvent(new Event("ended"));
      await settle();
      expect(p.getSnapshot().track?.id).toBe("b");

      audio.dispatchEvent(new Event("ended")); // last song, repeat off
      await settle();
      expect(p.getSnapshot()).toMatchObject({ track: { id: "b" }, playing: false });

      p.cycleRepeat(); // all
      expect(p.getSnapshot().repeat).toBe("all");
      audio.dispatchEvent(new Event("ended"));
      await settle();
      expect(p.getSnapshot().track?.id).toBe("a");

      p.cycleRepeat(); // one
      audio.currentTime = 150;
      audio.dispatchEvent(new Event("ended"));
      await settle();
      expect(p.getSnapshot().track?.id).toBe("a");
      expect(audio.currentTime).toBe(0);
      expect(audio.paused).toBe(false);
      p.cycleRepeat();
      expect(p.getSnapshot().repeat).toBe("off");
    });

    it("shuffles what's coming up, keeps the current song, and restores order when turned off", async () => {
      let n = 0;
      const { p, ids } = queued(() => [0.1, 0.9, 0.3, 0.7][n++ % 4]);
      await p.playQueue([q("a"), q("b"), q("c"), q("d"), q("e")], 1);
      await settle();
      p.toggleShuffle();
      expect(p.getSnapshot()).toMatchObject({ shuffle: true, index: 0, track: { id: "b" } });
      expect(ids()[0]).toBe("b");
      expect([...ids()].sort()).toEqual(["a", "b", "c", "d", "e"]);
      expect(ids()).not.toEqual(["b", "a", "c", "d", "e"]);
      p.toggleShuffle();
      expect(ids()).toEqual(["a", "b", "c", "d", "e"]);
      expect(p.getSnapshot().index).toBe(1);
    });

    it("queues tracks to play next or last, and removes them", async () => {
      const { p, ids } = queued();
      await p.playQueue([q("a"), q("b")]);
      await settle();
      p.addToQueue(q("x"));
      p.addToQueue(q("x")); // no duplicates
      p.playNext(q("y"));
      expect(ids()).toEqual(["a", "y", "b", "x"]);
      p.removeFromQueue(2);
      expect(ids()).toEqual(["a", "y", "x"]);
      p.removeFromQueue(0); // can't remove what's playing
      expect(ids()).toEqual(["a", "y", "x"]);
      await p.next();
      await settle();
      expect(p.getSnapshot().track?.id).toBe("y");
      await p.jumpTo(2);
      await settle();
      expect(p.getSnapshot().track?.id).toBe("x");
    });

    it("keeps the chosen study version across tracks, falling back to Original where needed", async () => {
      const { audio, p } = queued();
      await p.playQueue([q("a"), q("u1"), q("c")], 0, { mode: "no_lyrics" });
      await settle();
      expect(audio.src).toBe("/a/n");
      await p.next();
      await settle();
      expect(p.getSnapshot()).toMatchObject({ mode: "original", preferredMode: "no_lyrics" });
      await p.next();
      await settle();
      expect(audio.src).toBe("/c/n");
    });

    it("controls volume and mute", async () => {
      const { audio, p } = queued();
      await p.playQueue([q("a")]);
      await settle();
      p.setVolume(0.3);
      expect((audio as unknown as { volume: number }).volume).toBe(0.3);
      p.toggleMute();
      expect(p.getSnapshot()).toMatchObject({ muted: true, volume: 0.3 });
      p.toggleMute();
      expect(p.getSnapshot()).toMatchObject({ muted: false, volume: 0.3 });
      p.setVolume(0);
      expect(p.getSnapshot().muted).toBe(true);
    });
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
