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
    },
    reset: () => set({ playing: false, loop: null }),
  };
});
vi.mock("@/lib/music/vibe/engine", () => ({ vibeEngine: fake.vibeEngine }));

import { MusicView } from "../MusicView";
import { NowPlaying } from "../loops/NowPlaying";

const profile: VibeProfile = {
  summary: "Warm Hindi indie with acoustic guitar and soft Punjabi grooves",
  moods: ["romantic", "nostalgic"], tempoBpm: 84, key: "D", mode: "minor", progression: [1, 6, 4, 5],
  drumFeel: "dholak_groove", palette: ["acoustic_guitar", "sitar"], energy: 0.4, warmth: 0.7, swing: 0.3,
};
const vibe = (over: Partial<VibeProfile> = {}, source: "ai" | "basic" = "ai") => ({ profile: { ...profile, ...over }, source, playlistName: "💏", trackCount: 44 });

beforeEach(() => {
  testUid++;
  Object.values(api).forEach((f) => f.mockReset());
  fake.reset();
  api.loops.mockResolvedValue([]);
});
afterEach(cleanup);

describe("Loops — Create", () => {
  it("welcomes a first-timer with a clear next step", async () => {
    api.playlists.mockResolvedValue([]);
    render(<MusicView />);
    expect(await screen.findByText("Let's make your first Loop")).toBeTruthy();
    expect(screen.getByPlaceholderText("Paste a Spotify playlist link")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Now playing" }).textContent).toContain("Nothing's playing yet");
  });

  it("turns a pasted playlist into a Loop", async () => {
    api.playlists.mockResolvedValueOnce([]).mockResolvedValue([{ name: "💏", count: 44 }]);
    api.importSpotify.mockResolvedValue({ added: 44, total: 44, playlistName: "💏" });
    api.vibe.mockResolvedValue(vibe());
    render(<MusicView />);
    await screen.findByText("Let's make your first Loop");
    await userEvent.type(screen.getByLabelText("Spotify playlist link"), "https://open.spotify.com/playlist/3otkFuN9NnmLTHUgX8qe2z?si=x");
    await userEvent.click(screen.getByRole("button", { name: "Make a Loop" }));
    expect(await screen.findByText(/Got it — 44 songs from 💏/)).toBeTruthy();
    expect(await screen.findByText("Romantic Dholak Groove")).toBeTruthy();
    const card = screen.getByRole("region", { name: "Your Loop" });
    for (const chip of ["84 BPM", "D minor", "Dholak groove", "acoustic guitar", "sitar"]) expect(within(card).getByText(chip)).toBeTruthy();
    expect(within(card).getByText(/The vibe we heard/)).toBeTruthy();
  });

  it("offers Connect Spotify when a playlist needs it", async () => {
    const { MusicApiError } = await import("@/lib/music/client");
    api.playlists.mockResolvedValue([]);
    api.importSpotify.mockRejectedValue(new MusicApiError(409, "spotify_login_required", "Connect Spotify to import “💏”."));
    render(<MusicView />);
    await userEvent.type(await screen.findByLabelText("Spotify playlist link"), "https://open.spotify.com/playlist/3otkFuN9NnmLTHUgX8qe2z");
    await userEvent.click(screen.getByRole("button", { name: "Make a Loop" }));
    expect(await screen.findByRole("button", { name: "Connect Spotify" })).toBeTruthy();
  });

  it("plays, tries something else, and saves — and Now playing follows along", async () => {
    api.playlists.mockResolvedValue([{ name: "💏", count: 44 }]);
    api.vibe.mockResolvedValueOnce(vibe()).mockResolvedValue(vibe({ moods: ["dreamy"], drumFeel: "lofi", tempoBpm: 78 }));
    api.saveLoop.mockImplementation(async (l) => ({ id: "a".repeat(32), createdAt: 1, ...l }));
    render(<MusicView />);
    await userEvent.click(await screen.findByRole("button", { name: "Play this Loop" }));
    expect(fake.vibeEngine.play).toHaveBeenCalledWith(expect.objectContaining({ name: "Romantic Dholak Groove", playlistName: "💏" }), expect.anything());
    const np = screen.getByRole("region", { name: "Now playing" });
    expect(within(np).getByText("Romantic Dholak Groove")).toBeTruthy();
    expect(within(np).getByText("From 💏")).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Try something else?" }));
    expect(api.vibe).toHaveBeenLastCalledWith("💏", true);
    expect(await within(screen.getByRole("region", { name: "Your Loop" })).findByText("Dreamy Lo-fi Groove")).toBeTruthy();
    expect(within(np).getByText("Dreamy Lo-fi Groove")).toBeTruthy(); // the playing Loop switched to the new take

    await userEvent.click(screen.getByRole("button", { name: "Save to Your Loops" }));
    expect(api.saveLoop).toHaveBeenCalledWith(expect.objectContaining({ name: "Dreamy Lo-fi Groove", playlistName: "💏" }));
    expect(await screen.findByRole("button", { name: "In Your Loops" })).toBeTruthy();
  });

  it("is upfront when it's a quick read instead of the full one", async () => {
    api.playlists.mockResolvedValue([{ name: "💏", count: 44 }]);
    api.vibe.mockResolvedValue(vibe({}, "basic"));
    render(<MusicView />);
    expect(await screen.findByText(/A quick read of your vibe/)).toBeTruthy();
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
