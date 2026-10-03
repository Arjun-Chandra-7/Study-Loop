// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { VibeProfile } from "@/lib/music/vibe/profile";

const api = vi.hoisted(() => ({
  importSpotify: vi.fn(),
  spotifyConfig: vi.fn(),
  playlists: vi.fn(),
  vibe: vi.fn(),
  beatPlaylists: vi.fn(),
  makeBeatPlaylist: vi.fn(),
  renameBeatPlaylist: vi.fn(),
  deleteBeatPlaylist: vi.fn(),
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
import { basicSong, DEMO_SONGS, type BeatPlaylist } from "@/lib/music/vibe/songs";

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
  api.beatPlaylists.mockResolvedValue([]);
});
afterEach(cleanup);

const LINK = "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M";
const nightDrive = (over: Partial<BeatPlaylist> = {}): BeatPlaylist => ({
  id: "c".repeat(32),
  name: "Night Drive",
  sourceUrl: LINK,
  artworkUrl: "https://i.scdn.co/image/cover",
  songs: DEMO_SONGS.slice(0, 2),
  createdAt: 1,
  ...over,
});

describe("Loops — Create", () => {
  const paste = async (link = LINK) => {
    await userEvent.type(screen.getByLabelText("Spotify link"), link);
    await userEvent.click(screen.getByRole("button", { name: "Make beats" }));
  };

  it("welcomes a first-timer with a clear next step", async () => {
    render(<MusicView />);
    expect(screen.getByText("Your playlist, as study beats")).toBeTruthy();
    expect(screen.getByPlaceholderText("Paste a Spotify playlist, album or song link")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Now playing" }).textContent).toContain("Nothing's playing yet");
  });

  it("turns a pasted Spotify playlist into the same playlist as beats, saved to the Library", async () => {
    api.makeBeatPlaylist.mockResolvedValue({ playlist: nightDrive(), updated: false });
    render(<MusicView />);
    await paste();
    expect(api.makeBeatPlaylist).toHaveBeenCalledWith(LINK, null);
    expect(await screen.findByText("Saved to your Library: Night Drive, 2 songs as beats.")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Songs in Night Drive" });
    expect(within(list).getByText("Daft Punk · 116 BPM · F# minor · Four-on-the-floor")).toBeTruthy();
    expect(within(list).getByText("The Beatles · 72 BPM · C major · Downtempo")).toBeTruthy();
  });

  it("offers Connect Spotify when a playlist needs it", async () => {
    const { MusicApiError } = await import("@/lib/music/client");
    api.makeBeatPlaylist.mockRejectedValue(new MusicApiError(409, "spotify_login_required", "Connect Spotify to import “Night Drive”."));
    render(<MusicView />);
    await paste();
    expect(await screen.findByRole("button", { name: "Connect Spotify" })).toBeTruthy();
  });

  it("plays the songs in order, any one on demand, and keeps the one you like", async () => {
    api.makeBeatPlaylist.mockResolvedValue({ playlist: nightDrive(), updated: false });
    api.saveLoop.mockImplementation(async (l) => ({ id: "a".repeat(32), createdAt: 1, ...l }));
    render(<MusicView />);
    await paste();
    await userEvent.click(await screen.findByRole("button", { name: "Play Night Drive" }));
    expect(fake.vibeEngine.play).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Get Lucky", index: 0, playlistName: "Night Drive" }), expect.anything());
    const np = screen.getByRole("region", { name: "Now playing" });
    expect(within(np).getByText("Get Lucky")).toBeTruthy();
    expect(within(np).getByText("Daft Punk · song 1 of 2")).toBeTruthy();

    await userEvent.click(within(np).getByRole("button", { name: "Next song" }));
    expect(fake.vibeEngine.skip).toHaveBeenCalledWith(1);

    await userEvent.click(screen.getByRole("button", { name: "Play Let It Be" }));
    expect(fake.vibeEngine.play).toHaveBeenLastCalledWith(expect.objectContaining({ name: "Let It Be", index: 1 }), expect.anything());

    await userEvent.click(screen.getByRole("button", { name: "Save Let It Be" }));
    expect(api.saveLoop).toHaveBeenCalledWith({ name: "Let It Be beat", playlistName: "The Beatles", profile: DEMO_SONGS[1].profile });
    expect(await screen.findByRole("button", { name: "Let It Be is in Saved beats" })).toBeTruthy();
  });

  it("is upfront when a song is a best guess", async () => {
    api.makeBeatPlaylist.mockResolvedValue({ playlist: nightDrive({ songs: [basicSong("Obscure Song — Someone")] }), updated: false });
    render(<MusicView />);
    await paste();
    expect(await screen.findByText(/1 best guess/)).toBeTruthy();
    expect(screen.getByText("Best guess", { selector: ".chip" })).toBeTruthy();
  });
});

describe("Loops — Library", () => {
  const saved = (name: string, id: string) => ({ id, name, playlistName: "Daft Punk", profile, createdAt: 1 });
  const openLibrary = async () => {
    render(<MusicView />);
    await userEvent.click(screen.getByRole("tab", { name: "Library" }));
  };

  it("points an empty Library at Create", async () => {
    api.beatPlaylists.mockResolvedValue([]);
    await openLibrary();
    expect(await screen.findByText("Your Library starts here")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Make beats" }));
    expect(screen.getByRole("tab", { name: "Create" }).getAttribute("aria-selected")).toBe("true");
  });

  it("plays, opens, renames and removes beat playlists", async () => {
    api.beatPlaylists.mockResolvedValue([nightDrive()]);
    api.renameBeatPlaylist.mockImplementation(async (id, name) => nightDrive({ id, name }));
    api.deleteBeatPlaylist.mockResolvedValue(null);
    await openLibrary();
    const list = await screen.findByRole("list", { name: "Beat playlists" });
    expect(within(list).getByText("2 songs · from Spotify")).toBeTruthy();

    await userEvent.click(within(list).getByRole("button", { name: "Play Night Drive" }));
    expect(fake.vibeEngine.play).toHaveBeenCalledWith(expect.objectContaining({ name: "Get Lucky", playlistId: "c".repeat(32) }), expect.anything());

    await userEvent.click(within(list).getByRole("button", { name: "Open Night Drive" }));
    expect(screen.getByRole("list", { name: "Songs in Night Drive" })).toBeTruthy();

    await userEvent.click(within(list).getByRole("button", { name: "Rename Night Drive" }));
    const input = within(list).getByLabelText("Playlist name");
    await userEvent.clear(input);
    await userEvent.type(input, "Focus Drive{Enter}");
    expect(api.renameBeatPlaylist).toHaveBeenCalledWith("c".repeat(32), "Focus Drive");
    expect((await within(list).findAllByText("Focus Drive")).length).toBeGreaterThan(0);

    await userEvent.click(within(list).getByRole("button", { name: "Remove Focus Drive" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Beat playlists" })).toBeNull());
    expect(screen.getByText("Your Library starts here")).toBeTruthy();
  });

  it("keeps single saved beats under the playlists", async () => {
    api.beatPlaylists.mockResolvedValue([]);
    api.loops.mockResolvedValue([saved("Get Lucky beat", "a".repeat(32))]);
    api.renameLoop.mockImplementation(async (id, name) => ({ ...saved(name, id) }));
    api.deleteLoop.mockResolvedValue(null);
    await openLibrary();
    const list = await screen.findByRole("list", { name: "Saved beats" });
    await userEvent.click(within(list).getByRole("button", { name: "Play Get Lucky beat" }));
    expect(fake.vibeEngine.play).toHaveBeenCalledWith(expect.objectContaining({ name: "Get Lucky beat", savedId: "a".repeat(32) }), expect.anything());
    await userEvent.click(within(list).getByRole("button", { name: "Remove Get Lucky beat" }));
    await waitFor(() => expect(screen.queryByRole("list", { name: "Saved beats" })).toBeNull());
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
