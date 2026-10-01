// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { JobView, TrackView, VersionsView } from "@/lib/music/types";

const api = vi.hoisted(() => ({
  tracks: vi.fn(),
  addTrack: vi.fn(),
  importSpotify: vi.fn(),
  process: vi.fn(),
  job: vi.fn(),
  versions: vi.fn(),
  upload: vi.fn(),
}));
vi.mock("@/lib/music/client", () => ({
  musicApi: api,
  MusicApiError: class MusicApiError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
}));

import { MusicApiError } from "@/lib/music/client";
import { MusicView } from "../MusicView";

const base: TrackView = {
  id: "t1", title: "Weightless", artist: "Marconi Union", album: null, artworkUrl: null, durationMs: 480000,
  spotifyUrl: "https://open.spotify.com/track/x", playlistName: "Focus", audio: null, job: null,
};
const withAudio = (over: Partial<TrackView> = {}): TrackView => ({ ...base, audio: { durationS: 480, sizeBytes: 1, container: "mp3" }, ...over });
const job = (over: Partial<JobView>): JobView => ({ id: "j1", status: "queued", progress: null, error: null, ...over });
const versions = (all: boolean): VersionsView => ({
  trackId: "t1",
  expiresAt: Date.now() + 1e6,
  versions: all
    ? { original: { url: "/o", durationS: 480 }, no_lyrics: { url: "/n", durationS: 480 }, vocals_only: { url: "/v", durationS: 480 }, beats_only: { url: "/b", durationS: 480 } }
    : { original: { url: "/src", durationS: 480 } },
});

beforeAll(() => {
  // jsdom has no media pipeline: loading a src just reports metadata, play/pause just flip state.
  const paused = new WeakMap<HTMLMediaElement, boolean>();
  Object.defineProperty(HTMLMediaElement.prototype, "paused", {
    configurable: true,
    get(this: HTMLMediaElement) {
      return paused.get(this) ?? true;
    },
  });
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(function (this: HTMLMediaElement) {
    queueMicrotask(() => this.dispatchEvent(new Event("loadedmetadata")));
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(function (this: HTMLMediaElement) {
    paused.set(this, false);
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(function (this: HTMLMediaElement) {
    paused.set(this, true);
    this.dispatchEvent(new Event("pause"));
  });
});
beforeEach(() => {
  Object.values(api).forEach((f) => f.mockReset());
});
afterEach(cleanup);

const card = (title = "Weightless") => screen.getByText(title).closest("li")!;

describe("MusicView", () => {
  it("shows a loading state, then the empty state", async () => {
    let resolve!: (t: TrackView[]) => void;
    api.tracks.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<MusicView />);
    expect(screen.getByText("Loading your music…").getAttribute("role")).toBe("status");
    await act(async () => resolve([]));
    expect(screen.getByText(/Nothing here yet/)).toBeTruthy();
    expect(screen.getByRole("region", { name: "Now playing" }).textContent).toContain("Pick a track to start");
  });

  it("explains a failed load and retries", async () => {
    api.tracks.mockRejectedValueOnce(new MusicApiError(503, "storage_unavailable", "Your music library is unavailable right now."));
    api.tracks.mockResolvedValueOnce([base]);
    render(<MusicView />);
    expect((await screen.findByRole("alert")).textContent).toContain("Your music library is unavailable right now.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Weightless")).toBeTruthy();
  });

  it.each([
    ["needs audio", base, "Needs audio", null],
    ["ready", withAudio(), "Ready to process", null],
    ["queued", withAudio({ job: job({ status: "queued", workerOnline: true }) }), "Waiting for processing…", null],
    ["processing", withAudio({ job: job({ status: "processing", progress: 0.67 }) }), "Separating music…", 67],
    ["finalizing", withAudio({ job: job({ status: "finalizing" }) }), "Preparing study versions…", "indeterminate"],
    ["completed", withAudio({ job: job({ status: "completed", progress: 1 }) }), "Ready to study", null],
    ["failed", withAudio({ job: job({ status: "failed", error: { code: "timeout", message: "Processing took too long and was stopped." } }) }), "Processing failed", null],
  ] as const)("labels the %s state with words, not just colour", async (_n, track, label, progress) => {
    api.tracks.mockResolvedValue([track]);
    api.job.mockResolvedValue(track.job);
    render(<MusicView />);
    const li = await screen.findByText(label).then((el) => el.closest("li")!);
    const bar = within(li).queryByRole("progressbar");
    if (progress === null) expect(bar).toBeNull();
    else if (progress === "indeterminate") {
      expect(bar!.getAttribute("aria-valuenow")).toBeNull();
      expect(within(li).queryByText(/%$/)).toBeNull(); // no invented percentage
    } else {
      expect(bar!.getAttribute("aria-valuenow")).toBe(String(progress));
      expect(within(li).getByText(`${progress}%`)).toBeTruthy();
    }
    if (_n === "failed") {
      expect(within(li).getByText("Processing took too long and was stopped.")).toBeTruthy();
      expect(within(li).getByRole("button", { name: /Try processing again/ })).toBeTruthy();
    }
  });

  it("warns when nothing is processing the queue", async () => {
    api.tracks.mockResolvedValue([withAudio({ job: job({ status: "queued", workerOnline: false }) })]);
    api.job.mockResolvedValue(job({ status: "queued", workerOnline: false }));
    render(<MusicView />);
    expect(await screen.findByText(/processing service is offline/)).toBeTruthy();
  });

  it("uploads with real progress, then processes and follows the job to completion", async () => {
    api.tracks.mockResolvedValue([base]);
    let finishUpload!: (t: TrackView) => void;
    api.upload.mockImplementation((_id: string, _f: File, onProgress: (f: number) => void) => {
      onProgress(0.4);
      return new Promise((r) => (finishUpload = r));
    });
    render(<MusicView />);
    await screen.findByText("Needs audio");

    const input = card().querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, new File([new Uint8Array(8)], "song.mp3", { type: "audio/mpeg" }));
    expect(api.upload.mock.calls[0][1].name).toBe("song.mp3");
    expect(within(card()).getByText("Uploading audio…")).toBeTruthy();
    expect(within(card()).getByRole("progressbar").getAttribute("aria-valuenow")).toBe("40");

    await act(async () => finishUpload(withAudio()));
    expect(within(card()).getByText("Ready to process")).toBeTruthy();

    api.process.mockResolvedValue(job({ status: "queued", workerOnline: true }));
    api.job
      .mockResolvedValueOnce(job({ status: "processing", progress: 0.5 }))
      .mockResolvedValue(job({ status: "completed", progress: 1 }));
    await userEvent.click(within(card()).getByRole("button", { name: "Process Weightless" }));
    expect(within(card()).getByText("Waiting for processing…")).toBeTruthy();
    expect(await within(card()).findByText("Separating music…", {}, { timeout: 3000 })).toBeTruthy();
    expect(await within(card()).findByText("Ready to study", {}, { timeout: 3000 })).toBeTruthy();
  });

  it("shows upload rejections from the server", async () => {
    api.tracks.mockResolvedValue([base]);
    api.upload.mockRejectedValue(new MusicApiError(415, "unsupported_format", "That file type isn't supported. Use MP3, WAV, M4A or FLAC."));
    render(<MusicView />);
    await screen.findByText("Needs audio");
    await userEvent.upload(card().querySelector<HTMLInputElement>('input[type="file"]')!, new File(["x"], "a.mp3", { type: "audio/mpeg" }));
    expect((await within(card()).findByRole("alert")).textContent).toContain("That file type isn't supported");
    expect(within(card()).getByText("Needs audio")).toBeTruthy();
  });

  it("imports a playlist and reports what was added", async () => {
    api.tracks.mockResolvedValue([]);
    api.importSpotify.mockResolvedValue({ added: 2, total: 2, playlistName: "Deep Focus", tracks: [base, { ...base, id: "t2", title: "Nuvole Bianche" }] });
    render(<MusicView />);
    await screen.findByText(/Nothing here yet/);
    await userEvent.type(screen.getByLabelText(/Spotify playlist, album or track link/), "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M");
    await userEvent.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText("Added 2 tracks from Deep Focus.")).toBeTruthy();
    expect(screen.getByText("Nuvole Bianche")).toBeTruthy();
  });

  it("adds a track by name when it isn't on Spotify", async () => {
    api.tracks.mockResolvedValue([]);
    api.addTrack.mockResolvedValue({ ...base, id: "t9", title: "My recording", artist: "Me", spotifyUrl: null });
    render(<MusicView />);
    await screen.findByText(/Nothing here yet/);
    await userEvent.click(screen.getByRole("button", { name: /Add a track by name/ }));
    await userEvent.type(screen.getByLabelText("Track name"), "My recording");
    await userEvent.type(screen.getByLabelText("Artist"), "Me");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(api.addTrack).toHaveBeenCalledWith("My recording", "Me");
    expect(await screen.findByText("My recording")).toBeTruthy();
  });

  it("plays a track and switches study versions from the player", async () => {
    api.tracks.mockResolvedValue([withAudio({ job: job({ status: "completed", progress: 1 }) })]);
    api.versions.mockResolvedValue(versions(true));
    render(<MusicView />);
    await screen.findByText("Ready to study");
    await userEvent.click(screen.getByRole("button", { name: "Play Weightless" }));

    const playerRegion = await screen.findByRole("region", { name: "Now playing" });
    await within(playerRegion).findByText("Weightless");
    const group = within(playerRegion).getByRole("radiogroup", { name: "Study version" });
    const radio = (name: string) => within(group).getByRole("radio", { name: new RegExp(name) });
    expect(radio("Original").getAttribute("aria-checked")).toBe("true");
    expect(within(playerRegion).getByRole("button", { name: "Pause" })).toBeTruthy();

    await userEvent.click(radio("No Lyrics"));
    expect(radio("No Lyrics").getAttribute("aria-checked")).toBe("true");
    expect(radio("Original").getAttribute("aria-checked")).toBe("false");

    // Keyboard: the radios are real buttons.
    radio("Beats Only").focus();
    await userEvent.keyboard("{Enter}");
    expect(radio("Beats Only").getAttribute("aria-checked")).toBe("true");
    // Arrow keys move through the group (wrapping) and only the checked radio is in the tab order.
    await userEvent.keyboard("{ArrowRight}");
    expect(radio("Original").getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radio("Original"));
    expect(radio("No Lyrics").tabIndex).toBe(-1);
    await userEvent.keyboard("{ArrowLeft}");
    expect(radio("Beats Only").getAttribute("aria-checked")).toBe("true");

    await userEvent.click(within(playerRegion).getByRole("button", { name: "Pause" }));
    expect(within(playerRegion).getByRole("button", { name: "Play" })).toBeTruthy();
    expect(within(playerRegion).getByRole("slider", { name: "Position" })).toBeTruthy();
  });

  it("has Spotify-style controls and an Up next queue", async () => {
    const t = (id: string, title: string) => withAudio({ id, title, job: job({ id: `j${id}`, status: "completed", progress: 1 }) });
    api.tracks.mockResolvedValue([t("q1", "First"), t("q2", "Second"), t("q3", "Third")]);
    api.versions.mockImplementation(async (id: string) => ({ ...versions(true), trackId: id }));
    render(<MusicView />);
    await userEvent.click(await screen.findByRole("button", { name: "Play First" }));
    const region = screen.getByRole("region", { name: "Now playing" });
    await within(region).findByText("First");
    for (const name of ["Shuffle", "Previous", "Pause", "Next", "Repeat: off", "Mute"]) {
      expect(within(region).getByRole("button", { name })).toBeTruthy();
    }
    expect(within(region).getByRole("slider", { name: "Volume" })).toBeTruthy();

    await userEvent.click(within(region).getByRole("button", { name: "Repeat: off" }));
    expect(within(region).getByRole("button", { name: "Repeat: all" }).getAttribute("aria-pressed")).toBe("true");
    await userEvent.click(within(region).getByRole("button", { name: "Next" }));
    expect(await within(region).findByText("Second")).toBeTruthy();

    await userEvent.click(screen.getByRole("tab", { name: /Up next/ }));
    const queue = screen.getByRole("list", { name: "Queue" });
    expect(within(queue).getAllByRole("listitem")).toHaveLength(3);
    expect(within(queue).getByRole("button", { name: "Now playing: Second by Marconi Union" })).toBeTruthy();
    await userEvent.click(within(queue).getByRole("button", { name: "Remove Third from queue" }));
    expect(within(queue).getAllByRole("listitem")).toHaveLength(2);
  });

  it("locks the separated versions until a track is processed", async () => {
    api.tracks.mockResolvedValue([{ ...withAudio(), id: "t3", title: "Unprocessed" }]);
    api.versions.mockResolvedValue({ ...versions(false), trackId: "t3" });
    render(<MusicView />);
    await userEvent.click(await screen.findByRole("button", { name: "Play Unprocessed" }));
    const playerRegion = screen.getByRole("region", { name: "Now playing" });
    await within(playerRegion).findByText("Unprocessed");
    const group = within(playerRegion).getByRole("radiogroup");
    for (const name of ["No Lyrics", "Vocals Only", "Beats Only"]) {
      expect((within(group).getByRole("radio", { name: new RegExp(name) }) as HTMLButtonElement).disabled).toBe(true);
    }
    expect(within(playerRegion).getByText("Process this track to unlock the other versions.")).toBeTruthy();
    await waitFor(() => expect(within(group).getByRole("radio", { name: /Original/ }).getAttribute("aria-checked")).toBe("true"));
  });
});
