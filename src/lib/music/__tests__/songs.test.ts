import { MockLanguageModelV4 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST as songsRoute } from "@/app/api/music/songs/route";
import { setTestVerifier } from "../server/auth";
import { q, setExecutorForTests } from "../server/db";
import { setVibeModelForTests } from "../server/vibe";
import { stepGrid } from "../vibe/profile";
import { DEMO_SONGS, parseSongs } from "../vibe/songs";
import { req, testDatabase, testVerifier } from "./helpers";

let calls = 0;
let lastPrompt = "";
const model = (text: () => string) =>
  new MockLanguageModelV4({
    doGenerate: async (opts) => {
      calls++;
      lastPrompt = JSON.stringify(opts.prompt);
      return {
        content: [{ type: "text", text: text() }],
        finishReason: { unified: "stop", raw: undefined },
        usage: { inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined }, outputTokens: { total: 1, text: 1, reasoning: undefined } },
        warnings: [],
      };
    },
  });

/** What the model would say about the given demo songs. */
const reading = (...i: number[]) => JSON.stringify({ songs: i.map((n) => ({ title: DEMO_SONGS[n].title, artist: DEMO_SONGS[n].artist, known: true, profile: DEMO_SONGS[n].profile })) });

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

const post = async (songs: unknown, user: string | null = "user-a") => {
  const res = await songsRoute(req("POST", "/api/music/songs", { user: user ?? undefined, body: JSON.stringify({ songs }) }), undefined);
  return { status: res.status, body: await res.json() };
};

describe("songs API", () => {
  it("reads each song once, for everyone, in the order typed", async () => {
    setVibeModelForTests(model(() => reading(0, 1)));
    const first = await post(["Get Lucky — Daft Punk", "Let It Be — The Beatles"]);
    expect(first.status).toBe(200);
    expect(first.body.songs.map((s: { title: string; source: string }) => [s.title, s.source])).toEqual([["Get Lucky", "ai"], ["Let It Be", "ai"]]);
    expect(first.body.songs[0].profile).toMatchObject({ tempoBpm: 116, key: "F#", drumFeel: "four_on_floor" });
    expect(calls).toBe(1);

    // Another listener, with one song already known and one new: only the new one is read.
    setVibeModelForTests(model(() => reading(2)));
    const second = await post(["let it be - the beatles", "Stand By Me — Ben E. King"], "user-b");
    expect(second.body.songs.map((s: { title: string }) => s.title)).toEqual(["Let It Be", "Stand By Me"]);
    expect(calls).toBe(2);
    expect(lastPrompt).toContain("Stand By Me");
    expect(lastPrompt).not.toContain("Let It Be");
  });

  it("keeps the music going with a best guess when the model is unavailable, without caching it", async () => {
    setVibeModelForTests(model(() => { throw new Error("rate limited"); }));
    const res = await post(["Brown Munde — AP Dhillon"]);
    expect(res.body.songs[0]).toMatchObject({ title: "Brown Munde", artist: "AP Dhillon", source: "basic", known: false });
    expect(res.body.songs[0].profile.drumFeel).toBe("dholak_groove");
    expect((await q.all("SELECT 1 FROM music_vibes")).length).toBe(0);
  });

  it("needs sign-in and at least one song, and caps the list", async () => {
    expect((await post(["Song"], null)).status).toBe(401);
    expect((await post([])).body.error.code).toBe("no_songs");
    expect((await post("not a list")).body.error.code).toBe("no_songs");
    expect((await post(Array.from({ length: 13 }, (_, i) => `Song ${i}`))).body.error.code).toBe("too_many_songs");
  });
});

describe("typed song lists", () => {
  it("takes one song per line, ignoring numbering, bullets, blanks and repeats", () => {
    expect(parseSongs("1. Get Lucky — Daft Punk\n\n- Let It Be\n• let it be\n  Stand By Me  ")).toEqual(["Get Lucky — Daft Punk", "Let It Be", "Stand By Me"]);
  });

  it("reads drawn drum grids, tolerating sloppy lengths", () => {
    expect(stepGrid("x...x...x...x...")).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]);
    expect(stepGrid("x.o")?.slice(0, 4)).toEqual([1, 0, 0.55, 0]);
    expect(stepGrid("................")).toBeNull();
    expect(stepGrid(undefined)).toBeNull();
  });
});
