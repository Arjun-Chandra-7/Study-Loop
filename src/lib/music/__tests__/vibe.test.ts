import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { GET as vibeRoute } from "@/app/api/music/vibe/route";
import { setTestVerifier } from "../server/auth";
import { newId, q, setExecutorForTests } from "../server/db";
import { setVibeModelForTests } from "../server/vibe";
import { beatParams, chord, scale, type VibeProfile } from "../vibe/profile";
import { req, testDatabase, testVerifier } from "./helpers";

const profile: VibeProfile = {
  summary: "Warm Hindi indie with acoustic guitar",
  moods: ["romantic", "calm"],
  tempoBpm: 88,
  key: "A",
  mode: "minor",
  progression: [6, 4, 1, 5],
  drumFeel: "lofi",
  palette: ["acoustic_guitar", "rhodes"],
  energy: 0.5,
  warmth: 0.6,
  swing: 0.3,
};

let calls = 0;
const model = (text: () => string) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      calls++;
      return {
        content: [{ type: "text", text: text() }],
        finishReason: { unified: "stop", raw: undefined },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
        warnings: [],
      };
    },
  });

let database: Awaited<ReturnType<typeof testDatabase>>;
beforeAll(async () => {
  database = await testDatabase();
  setTestVerifier(testVerifier);
});
afterAll(async () => {
  setVibeModelForTests(null);
  setTestVerifier(null);
  setExecutorForTests(null);
  await database.close();
});
beforeEach(async () => {
  await database.reset();
  calls = 0;
});

async function seed(user: string, playlist: string, songs: [string, string][]) {
  const now = Date.now();
  for (const [i, [title, artist]] of songs.entries()) {
    await q.run(
      "INSERT INTO music_tracks (id, user_id, title, artist, spotify_track_id, playlist_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      newId(), user, title, artist, `${playlist}${i}`.padEnd(22, "x").slice(0, 22), playlist, now + i, now,
    );
  }
}
const get = async (qs: string, user = "user-a") => {
  const res = await vibeRoute(req("GET", `/api/music/vibe?${qs}`, { user }), undefined);
  return { status: res.status, body: await res.json() };
};

describe("vibe API", () => {
  it("lists playlists, reads a vibe once and caches it per exact track list", async () => {
    setVibeModelForTests(model(() => JSON.stringify({ ...profile, harmonicRhythm: null, groove: null, bassRhythm: null })));
    await seed("user-a", "Chill", [["Husn", "Anuv Jain"], ["Baarishein", "Anuv Jain"]]);
    await seed("user-a", "Gym", [["Brown Munde", "AP Dhillon"]]);
    expect((await get("list=1")).body.playlists.map((p: { name: string }) => p.name).sort()).toEqual(["Chill", "Gym"]);

    const first = await get("playlist=Chill");
    expect(first.body).toMatchObject({ profile, source: "ai", trackCount: 2, cached: false });
    expect((await get("playlist=Chill")).body.cached).toBe(true);
    expect(calls).toBe(1);
    await get("playlist=Chill&refresh=1");
    expect(calls).toBe(2);
  });

  it("falls back to a basic reading when the model is unavailable, without caching it", async () => {
    setVibeModelForTests(model(() => { throw new Error("AI Gateway requires a valid credit card"); }));
    await seed("user-a", "Sufi", [["Tajdar-E-Haram", "Atif Aslam"], ["Khalasi | Coke Studio Bharat", "Aditya Gadhvi"]]);
    const res = await get("playlist=Sufi");
    expect(res.body).toMatchObject({ source: "basic", profile: { drumFeel: "dholak_groove", palette: ["sitar", "strings"] } });
    expect((await q.all("SELECT 1 FROM music_vibes")).length).toBe(0);
  });

  it("rejects malformed model output by falling back", async () => {
    setVibeModelForTests(model(() => JSON.stringify({ ...profile, tempoBpm: 400 })));
    await seed("user-a", "X", [["Song", "Artist"]]);
    expect((await get("playlist=X")).body.source).toBe("basic");
  });

  it("needs sign-in and an imported playlist, and keeps users apart", async () => {
    expect((await vibeRoute(req("GET", "/api/music/vibe"), undefined)).status).toBe(401);
    await seed("user-a", "Mine", [["Song", "Artist"]]);
    const other = await get("playlist=Mine", "user-b");
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("no_tracks");
  });
});

describe("beat adaptation to stress", () => {
  it("slows, thins, darkens and softens as stress rises, then eases back", () => {
    const calm = beatParams(profile, "stable");
    const stressed = beatParams(profile, "elevated");
    const recovering = beatParams(profile, "recovering");
    expect(calm.bpm).toBe(88);
    expect(stressed.bpm).toBeLessThan(recovering.bpm);
    expect(recovering.bpm).toBeLessThan(calm.bpm);
    expect(stressed.drumDensity).toBeLessThan(recovering.drumDensity);
    expect(stressed.cutoffHz).toBeLessThan(recovering.cutoffHz);
    expect(stressed.gainDb).toBeLessThan(calm.gainDb);
    expect(stressed.space).toBeGreaterThan(calm.space);
    expect(beatParams(profile, "none")).toEqual(calm); // no band: just the playlist's feel
    expect(beatParams({ ...profile, tempoBpm: 60 }, "elevated").bpm).toBeGreaterThanOrEqual(58);
  });

  it("builds harmony in the playlist's key", () => {
    expect(scale("A", "minor", 4)).toEqual([69, 71, 72, 74, 76, 77, 79]);
    expect(chord("C", "major", 1, 3)).toEqual([48, 52, 55, 59]); // Cmaj7
    expect(chord("A", "minor", 6, 3)).toEqual([65, 69, 72, 76]); // Fmaj7 in A minor
  });
});
