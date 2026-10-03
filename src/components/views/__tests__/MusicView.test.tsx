// @vitest-environment jsdom
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VibeProfile } from "@/lib/music/vibe/profile";

const api = vi.hoisted(() => ({
  importSpotify: vi.fn(),
  spotifyConfig: vi.fn(),
  playlists: vi.fn(),
  vibe: vi.fn(),
  songs: vi.fn(),
  loops: vi.fn(),
  saveLoop: vi.fn(),
  renameLoop: vi.fn(),
  deleteLoop: vi.fn(),
}));
vi.mock("@/lib/music/client", () => ({
  musicApi: api,
  MusicApiError: class MusicApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));
// A different person per test: nothing remembered from one carries into the next.
let testUid = 0;
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: { uid: `user-${testUid}` } }) }));
vi.mock("@/lib/music/spotifyAuth", () => ({ spotifyToken: async () => null, startSpotifyLogin: vi.fn(), takePendingImport: () => null }));

// The real engine makes sound with Tone.js; here it just tracks what would be playing.
const fake = vi.hoisted(() => {
  type Snap = { playing: boolean; loop: unknown; params: null; state: string };
  let snap: Snap = { playing: false, loop: null, params: null, state: "stable" };
  const listeners = new Set<() => void>();
  const set = (patch: Partial<Snap>) => {
    snap = { ...snap, ...patch };
    listeners.forEach((l) => l());
  };
  return {
    vibeEngine: {
      get playing() {
        return snap.playing;
      },
      subscribe: (fn: () => void) => (listeners.add(fn), () => listeners.delete(fn)),
      getSnapshot: () => snap,
      play: vi.fn(async (loop: unknown) => set({ playing: true, loop })),
      stop: vi.fn(() => set({ playing: false })),
      toggle: vi.fn(async () => set({ playing: !snap.playing })),
      markSaved: vi.fn((id: string, name: string) => set({ loop: { ...(snap.loop as object), savedId: id, name } })),
      setState: vi.fn(),
      skip: vi.fn(async () => {}),
    },
    reset: () => set({ playing: false, loop: null }),
  };
});
vi.mock("@/lib/music/vibe/engine", async (actual) => ({ ...(await actual<object>()), vibeEngine: fake.vibeEngine }));

import { MusicView } from "../MusicView";
import { NowPlaying } from "../loops/NowPlaying";
import { basicSong, DEMO_SONGS } from "@/lib/music/vibe/songs";

const profile: VibeProfile = {
  summary: "Warm Hindi indie with acoustic guitar and soft Punjabi grooves",
  moods: ["romantic", "nostalgic"], tempoBpm: 84, key: "D", mode: "minor", progression: [1, 6, 4, 5],
  drumFeel: "dholak_groove", palette: ["acoustic_guitar", "sitar"], energy: 0.4, warmth: 0.7, swing: 0.3,
};

beforeEach(() => {
  testUid++;
  localStorage.clear();
  Object.values(api).forEach((f) => f.mockReset());
  fake.reset();
  api.loops.mockResolvedValue([]);
});
afterEach(cleanup);

describe("Loops — Create", () => {
  const typeSongs = async () => {
    await userEvent.type(screen.getByLabelText("Your songs"), "Get Lucky — Daft Punk{Enter}Let It Be — The Beatles");
    await userEvent.click(screen.getByRole("button", { name: "Make my Loop" }));
  };

  it("welcomes a first-timer with a clear next step", async () => {
    render(<MusicView />);
    expect(screen.getByText("Your songs, as study beats")).toBeTruthy();
    expect(screen.getByLabelText("Your songs")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make my Loop" }).hasAttribute("disabled")).toBe(true);
    await userEvent.click(screen.getByRole("button", { name: "Try an example" }));
    expect((screen.getByLabelText("Your songs") as HTMLTextAreaElement).value).toContain("Get Lucky — Daft Punk");
    expect(screen.getByRole("region", { name: "Now playing" }).textContent).toContain("Nothing's playing yet");
  });

  it("reads every typed song for its own beat", async () => {
    api.songs.mockResolvedValue(DEMO_SONGS.slice(0, 2));
    render(<MusicView />);
    await typeSongs();
    expect(api.songs).toHaveBeenCalledWith(["Get Lucky — Daft Punk", "Let It Be — The Beatles"]);
    const list = await screen.findByRole("list", { name: "Songs in your Loop" });
    expect(within(list).getByText("Daft Punk · 116 BPM · F# minor · Four-on-the-floor")).toBeTruthy();
    expect(within(list).getByText("The Beatles · 72 BPM · C major · Downtempo")).toBeTruthy();
    expect(within(list).queryByText("Best guess")).toBeNull();
  });

  it("plays the songs in order, any one on demand, and saves the one you like", async () => {
    api.songs.mockResolvedValue(DEMO_SONGS.slice(0, 2));
    api.saveLoop.mockImplementation(async (l) => ({ id: "a".repeat(32), createdAt: 1, ...l }));
    render(<MusicView />);
    await typeSongs();
    await userEvent.click(await screen.findByRole("button", { name: "Play your Loop" }));
    expect(fake.vibeEngine.play).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Get Lucky", index: 0 }), expect.anything());
    const np = screen.getByRole("region", { name: "Now playing" });
    expect(within(np).getByText("Get Lucky")).toBeTruthy();
    expect(within(np).getByText("Daft Punk · song 1 of 2")).toBeTruthy();

    await userEvent.click(within(np).getByRole("button", { name: "Next song" }));
    expect(fake.vibeEngine.skip).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole("button", { name: "Play Let It Be" }));
    expect(fake.vibeEngine.play).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Let It Be", index: 1 }), expect.anything());

    await userEvent.click(screen.getByRole("button", { name: "Save Let It Be" }));
    expect(api.saveLoop).toHaveBeenCalledWith({ name: "Let It Be beat", playlistName: "The Beatles", profile: DEMO_SONGS[1].profile });
    expect(await screen.findByRole("button", { name: "Let It Be is in Your Loops" })).toBeTruthy();
  });

  it("is upfront when a song is a best guess", async () => {
    api.songs.mockResolvedValue([basicSong("Some Song Nobody Knows - Me")]);
    render(<MusicView />);
    await userEvent.type(screen.getByLabelText("Your songs"), "Some Song Nobody Knows - Me");
    await userEvent.click(screen.getByRole("button", { name: "Make my Loop" }));
    expect(await screen.findByText("Best guess", { selector: ".chip" })).toBeTruthy();
  });

  it("remembers your songs when you come back", async () => {
    api.songs.mockResolvedValue(DEMO_SONGS.slice(0, 2));
    render(<MusicView />);
    await typeSongs();
    await screen.findByRole("list", { name: "Songs in your Loop" });
    cleanup();
    render(<MusicView />);
    expect(screen.getByRole("list", { name: "Songs in your Loop" })).toBeTruthy();
    expect(api.songs).toHaveBeenCalledTimes(1);
  });
});

describe("Loops — Your Loops", () => {
  const saved = (name: string, id: string) => ({ id, name, playlistName: "💏", profile, createdAt: 1 });

  it("encourages saving when the collection is empty", async () => {
    api.playlists.mockResolvedValue([]);
    render(<MusicView />);
    await userEvent.click(screen.getByRole("tab", { name: "Your Loops" }));
    expect(await screen.findByText("Your collection starts here")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Make a Loop" }));
    expect(screen.getByRole("tab", { name: "Create" }).getAttribute("aria-selected")).toBe("true");
  });

  it("plays, renames and removes saved Loops", async () => {
    api.playlists.mockResolvedValue([]);
    api.loops.mockResolvedValue([saved("Late night", "a".repeat(32)), saved("Morning", "b".repeat(32))]);
    api.renameLoop.mockImplementation(async (id, name) => ({ ...saved(name, id) }));
    api.deleteLoop.mockResolvedValue(null);
    render(<MusicView />);
    await userEvent.click(screen.getByRole("tab", { name: "Your Loops" }));
    const list = await screen.findByRole("list", { name: "Your Loops" });

    await userEvent.click(within(list).getByRole("button", { name: "Play Late night" }));
    expect(fake.vibeEngine.play).toHaveBeenCalledWith(expect.objectContaining({ name: "Late night", savedId: "a".repeat(32) }), expect.anything());
    expect(within(list).getByRole("button", { name: "Pause Late night" })).toBeTruthy();

    await userEvent.click(within(list).getByRole("button", { name: "Rename Morning" }));
    const input = within(list).getByLabelText("Loop name");
    await userEvent.clear(input);
    await userEvent.type(input, "Sunrise{Enter}");
    expect(api.renameLoop).toHaveBeenCalledWith("b".repeat(32), "Sunrise");
    expect(await within(list).findByText("Sunrise")).toBeTruthy();

    await userEvent.click(within(list).getByRole("button", { name: "Remove Sunrise" }));
    expect(within(list).queryByText("Sunrise")).toBeNull();
  });
});

describe("Now playing", () => {
  it("shows whatever Loop is loaded and controls it", async () => {
    render(<NowPlaying />);
    await act(async () => {
      await fake.vibeEngine.play({ name: "Late night", playlistName: null, profile });
    });
    const np = screen.getByRole("region", { name: "Now playing" });
    expect(within(np).getByText("Late night")).toBeTruthy();
    expect(within(np).getByText("Your Loop")).toBeTruthy();
    expect(within(np).getByText("84 BPM")).toBeTruthy();
    await userEvent.click(within(np).getByRole("button", { name: "Pause" }));
    expect(fake.vibeEngine.toggle).toHaveBeenCalled();
    expect(within(np).getByRole("button", { name: "Play" })).toBeTruthy();
  });
});
