/**
 * Real AI Gateway call on a real imported playlist (reads Neon). Opt-in:
 *   MUSIC_TEST_VIBE=1 npx vitest run vibe.live
 */
import { describe, expect, it } from "vitest";
import { q } from "../server/db";
import { playlistVibe } from "../server/vibe";
import { beatParams } from "../vibe/profile";

describe.skipIf(process.env.MUSIC_TEST_VIBE !== "1")("vibe (live)", () => {
  it("reads a real playlist's vibe", async () => {
    process.loadEnvFile(".env.local");
    const owner = await q.get<{ user_id: string; playlist_name: string }>(
      "SELECT user_id, playlist_name FROM music_tracks WHERE playlist_name IS NOT NULL ORDER BY created_at DESC LIMIT 1",
    );
    expect(owner, "import a playlist first").toBeTruthy();
    const t0 = Date.now();
    const v = await playlistVibe(owner!.user_id, owner!.playlist_name, true);
    console.log(JSON.stringify({ ms: Date.now() - t0, tracks: v.trackCount, profile: v.profile }, null, 1));
    console.log("calm:", JSON.stringify(beatParams(v.profile, "stable")));
    console.log("stressed:", JSON.stringify(beatParams(v.profile, "elevated")));
    const again = await playlistVibe(owner!.user_id, owner!.playlist_name);
    expect(again.cached).toBe(true);
  }, 120_000);
});
