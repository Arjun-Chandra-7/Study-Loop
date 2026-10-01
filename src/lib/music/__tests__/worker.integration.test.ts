/**
 * API → queue → real Python worker (Demucs) → playback links. Opt-in because it runs the model:
 *   MUSIC_TEST_WORKER=1 npx vitest run worker.integration
 * Optional: MUSIC_TEST_AUDIO=/path/to/song.mp3 to use a real song instead of the synthetic mix.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { GET as getFile } from "@/app/api/music/files/[token]/route";
import { GET as getJob } from "@/app/api/music/jobs/[id]/route";
import { PUT as putAudio } from "@/app/api/music/tracks/[id]/audio/route";
import { POST as processRoute } from "@/app/api/music/tracks/[id]/process/route";
import { GET as versionsRoute } from "@/app/api/music/tracks/[id]/versions/route";
import { POST as addRoute } from "@/app/api/music/tracks/route";
import { setTestVerifier } from "../server/auth";
import { closeDb, q } from "../server/db";
import type { StudyMode, VersionsView } from "../types";
import { ctx, req, testVerifier } from "./helpers";

const enabled = process.env.MUSIC_TEST_WORKER === "1";
const PY = path.resolve("worker/.venv/bin/python");
let dataDir: string;
let audioPath: string;

/** Mean level (dBFS) of a file, decoded by ffmpeg. */
function levelDb(file: string): number {
  const pcm = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "f32le", "-ac", "1", "-ar", "22050", "pipe:1"], { maxBuffer: 1 << 30 });
  const s = new Float32Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 4);
  let sum = 0;
  for (const v of s) sum += v * v;
  return 10 * Math.log10(sum / s.length + 1e-20);
}

describe.skipIf(!enabled)("worker integration", () => {
  beforeAll(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "sl-music-int-"));
    vi.stubEnv("MUSIC_DATA_DIR", dataDir);
    vi.stubEnv("MUSIC_SIGNING_SECRET", "int-secret");
    setTestVerifier(testVerifier);
    closeDb();
    audioPath = process.env.MUSIC_TEST_AUDIO ?? path.join(dataDir, "synthetic.mp3");
    if (!process.env.MUSIC_TEST_AUDIO) {
      // Voice (TTS) over a kick pattern and bass: a stand-in song with an obvious vocal part.
      const text = "This is the vocal line of a study loop test song. It should end up in the vocal stem. ".repeat(3);
      execFileSync("ffmpeg", [
        "-v", "error", "-y",
        "-f", "lavfi", "-i", `flite=text='${text}':voice=slt`,
        "-f", "lavfi", "-i", "aevalsrc='0.8*sin(2*PI*55*t)*exp(-18*mod(t,0.5))+0.25*sin(2*PI*41.2*t)':s=44100",
        "-filter_complex", "[0:a]aresample=44100,volume=4[v];[v][1:a]amix=inputs=2:duration=shortest:normalize=0,aformat=channel_layouts=stereo",
        "-t", "12", "-c:a", "libmp3lame", "-b:a", "192k", audioPath,
      ]);
    }
  });
  afterAll(() => {
    closeDb();
    setTestVerifier(null);
    vi.unstubAllEnvs();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("separates an uploaded track into playable study versions, then serves the cache", async () => {
    const user = "user-int";
    const add = await addRoute(req("POST", "/api/music/tracks", { user, body: JSON.stringify({ title: "Integration", artist: "Test" }) }), undefined);
    const { track } = await add.json();

    const t0 = performance.now();
    const up = await putAudio(
      req("PUT", "/x", { user, body: new Uint8Array(readFileSync(audioPath)), headers: { "content-type": "audio/mpeg", "x-file-name": "song.mp3" } }),
      ctx({ id: track.id }),
    );
    expect(up.status).toBe(200);
    const uploadMs = performance.now() - t0;

    const proc = await processRoute(req("POST", "/x", { user }), ctx({ id: track.id }));
    expect(proc.status).toBe(202);
    const { job_id } = await proc.json();

    const t1 = performance.now();
    const worker = spawnSync(PY, ["-m", "studyloop_music", "--once"], {
      cwd: path.resolve("worker"),
      env: { ...process.env, MUSIC_DATA_DIR: dataDir, PYTHONWARNINGS: "ignore" },
      encoding: "utf8",
      timeout: 15 * 60_000,
    });
    const workerMs = performance.now() - t1;
    const events = worker.stderr.split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
    const done = events.find((e) => e.event === "job_completed");
    expect(done, worker.stderr.slice(-2000)).toBeTruthy();

    const job = (await (await getJob(req("GET", "/x", { user }), ctx({ id: job_id }))).json()).job;
    expect(job).toMatchObject({ status: "completed", progress: 1, error: null });

    const v: VersionsView = await (await versionsRoute(req("GET", "/x", { user }), ctx({ id: track.id }))).json();
    expect(Object.keys(v.versions).sort()).toEqual(["beats_only", "no_lyrics", "original", "vocals_only"]);

    const levels: Partial<Record<StudyMode, number>> = {};
    for (const [mode, { url, durationS }] of Object.entries(v.versions) as [StudyMode, { url: string; durationS: number }][]) {
      const token = url.split("/").pop()!;
      const res = await getFile(req("GET", url), ctx({ token }));
      expect(res.status).toBe(200);
      const file = path.join(dataDir, `check-${mode}.m4a`);
      writeFileSync(file, Buffer.from(await res.arrayBuffer()));
      const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file], { encoding: "utf8" }));
      expect(probe.streams[0]).toMatchObject({ codec_name: "aac", sample_rate: "44100", channels: 2 });
      expect(Number(probe.format.duration)).toBeCloseTo(durationS, 0);
      levels[mode] = levelDb(file);
    }
    console.log(JSON.stringify({ uploadMs: Math.round(uploadMs), workerMs: Math.round(workerMs), timings: done.timings, storageBytes: done.storage_bytes, levels, stemLevels: done.levels, residual: done.reconstruction_residual_dbfs }));

    // Nothing is silence, and every version is a distinct signal.
    for (const l of Object.values(levels)) expect(l).toBeGreaterThan(-45);
    expect(new Set(Object.values(levels).map((l) => l.toFixed(1))).size).toBe(4);

    // Scratch space is cleaned up, outputs are in place.
    expect(readdirSync(path.join(dataDir, "tmp"))).toEqual([]);
    expect(readdirSync(path.join(dataDir, "outputs", job_id)).sort()).toEqual(
      ["bass.m4a", "drums.m4a", "no_lyrics.m4a", "original.m4a", "other.m4a", "vocals.m4a"],
    );

    // Asking again is answered from the cache without another separation.
    const again = await processRoute(req("POST", "/x", { user }), ctx({ id: track.id }));
    expect(again.status).toBe(200);
    expect((await again.json()).job).toMatchObject({ id: job_id, cached: true });
    expect(q.get("SELECT COUNT(*) AS n FROM music_jobs")).toEqual({ n: 1 });
  }, 20 * 60_000);
});
