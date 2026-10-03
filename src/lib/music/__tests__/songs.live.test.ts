/**
 * Real model call: reads well-known songs and checks tempo and key against the records.
 * Uses a throwaway in-process database, so nothing is cached in production. Opt-in:
 *   MUSIC_TEST_SONGS=1 npx vitest run songs.live
 */
import { describe, expect, it } from "vitest";
import { setExecutorForTests } from "../server/db";
import { readSongs } from "../server/songs";
import { testDatabase } from "./helpers";

/** Published tempo and key of each recording. */
const KNOWN: [string, number, string][] = [
  ["Blinding Lights — The Weeknd", 171, "F minor"],
  ["Shape of You — Ed Sheeran", 96, "C# minor"],
  ["Billie Jean — Michael Jackson", 117, "F# minor"],
  ["Get Lucky — Daft Punk", 116, "F# minor"],
  ["Let It Be — The Beatles", 72, "C major"],
  ["Smells Like Teen Spirit — Nirvana", 117, "F minor"],
  ["Levitating — Dua Lipa", 103, "B minor"],
  ["Uptown Funk — Mark Ronson", 115, "D minor"],
];

describe.skipIf(process.env.MUSIC_TEST_SONGS !== "1")("songs (live)", () => {
  it("reads real songs close to their records", async () => {
    process.loadEnvFile(".env.local");
    process.env.MUSIC_LOG = "on"; // show model failures
    const db = await testDatabase();
    await db.reset(); // points the app at this throwaway database, never production
    try {
      const t0 = Date.now();
      const read = await readSongs(KNOWN.map(([s]) => s));
      console.log("ms", Date.now() - t0);
      let close = 0;
      for (const [i, [song, bpm, key]] of KNOWN.entries()) {
        const p = read[i].profile;
        const got = `${p.key} ${p.mode}`;
        const ok = Math.abs(p.tempoBpm - bpm) <= 4 || Math.abs(p.tempoBpm * 2 - bpm) <= 4 || Math.abs(p.tempoBpm - bpm * 2) <= 4;
        if (ok && got === key) close++;
        console.log(
          `${read[i].source} ${read[i].known ? "known" : "unknown"} | ${song}: ${p.tempoBpm} BPM ${got} (record ${bpm} ${key}) | ${p.drumFeel} [${p.progression}] x${p.harmonicRhythm ?? 1} ${p.palette} | ${JSON.stringify(p.groove)} bass ${p.bassRhythm}`,
        );
      }
      expect(read.every((s) => s.source === "ai")).toBe(true);
      console.log(`close on tempo and key: ${close}/${KNOWN.length}`);
    } finally {
      setExecutorForTests(null);
      await db.close();
    }
  }, 180_000);
});
