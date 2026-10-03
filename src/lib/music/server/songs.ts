import "server-only";
import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import { basicSong, MAX_SONGS, SongBeatSchema, songKey, type SongBeat } from "../vibe/songs";
import { q } from "./db";
import { ApiError } from "./http";
import { log } from "./log";
import { vibeModel } from "./vibe";

/** A song's fingerprint is the same for everyone, so readings are cached once for all listeners. */
const CACHE_USER = "_song";

/**
 * Read each typed song for how it's produced. Cached per song, so a song is read once ever;
 * the uncached ones share a single model call.
 */
export async function songBeats(input: unknown): Promise<SongBeat[]> {
  const songs = Array.isArray(input) ? input.filter((s): s is string => typeof s === "string").map((s) => s.trim().slice(0, 160)).filter(Boolean) : [];
  if (!songs.length) throw new ApiError(400, "no_songs", "Add at least one song, one per line.");
  if (songs.length > MAX_SONGS) throw new ApiError(400, "too_many_songs", `Up to ${MAX_SONGS} songs at a time.`);

  const [model, modelId] = vibeModel();
  const keyOf = (s: string) => createHash("sha256").update(JSON.stringify([modelId, songKey(s)])).digest("hex");
  const out = new Map<string, SongBeat>();

  for (const s of songs) {
    const hit = await q.get<{ profile_json: string }>("SELECT profile_json FROM music_vibes WHERE user_id = ? AND key = ?", CACHE_USER, keyOf(s));
    const parsed = hit && SongBeatSchema.safeParse(JSON.parse(hit.profile_json));
    if (parsed && parsed.success) out.set(s, { ...parsed.data, query: s, source: "ai" });
  }

  const todo = songs.filter((s) => !out.has(s));
  if (todo.length) {
    const t0 = Date.now();
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: z.object({ songs: z.array(SongBeatSchema).describe("One entry per requested song, in the same order.") }) }),
        system:
          "You are a record producer who knows how famous songs are built. For each requested song, identify the recording and describe its production " +
          "as precisely as you can: its real tempo, key and mode, the chord loop it is built on (as scale degrees), how many chords change per bar, " +
          "its signature drum groove and bass rhythm as 16-step grids, and the instruments that carry its sound. " +
          "This drives an instrumental, lyric-free beat in the style of the song. Never write out melodies, vocal lines, riffs as notes, or lyrics. " +
          "If you don't recognise a song, set known to false and make an honest guess from its title and artist.",
        prompt: `Songs:\n${todo.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      });
      const read = output.songs;
      for (const [i, s] of todo.entries()) {
        const beat = read[i];
        if (!beat) continue;
        out.set(s, { ...beat, query: s, source: "ai" });
        await q.run(
          `INSERT INTO music_vibes (user_id, key, playlist_name, profile_json, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (user_id, key) DO UPDATE SET profile_json = excluded.profile_json, created_at = excluded.created_at`,
          CACHE_USER, keyOf(s), null, JSON.stringify(beat), Date.now(),
        );
      }
      log("songs_read", { model: modelId, songs: todo.length, ms: Date.now() - t0 });
    } catch (e) {
      // Keep the music going: anything the model couldn't read gets a keyword guess, not cached.
      log("songs_failed", { model: modelId, error: (e as Error).name, detail: (e as Error).message.slice(0, 200) });
    }
  }

  return songs.map((s) => out.get(s) ?? basicSong(s));
}
