import "server-only";
import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { z } from "zod";
import { basicSong, SongBeatSchema, songKey, type SongBeat } from "../vibe/songs";
import { q } from "./db";
import { log } from "./log";
import { vibeModel } from "./vibe";

/** A song's fingerprint is the same for everyone, so readings are cached once for all listeners. */
const CACHE_USER = "_song";
/** Songs per model call, and calls in flight at once: a 100-song playlist reads in two rounds. */
const CHUNK = 15;
const PARALLEL = 4;

const SYSTEM =
  "You are a record producer who knows how famous songs are built. For each requested song, identify the recording and describe its production " +
  "as precisely as you can: its real tempo, key and mode, the chord loop it is built on (as scale degrees), how many chords change per bar, " +
  "its signature drum groove and bass rhythm as 16-step grids, and the instruments that carry its sound. " +
  "This drives an instrumental, lyric-free beat in the style of the song. Never write out melodies, vocal lines, riffs as notes, or lyrics. " +
  "If you don't recognise a song, set known to false and make an honest guess from its title and artist.";

/**
 * Read each song ("Title — Artist") for how it's produced, in the order given. Cached per song, so a
 * song is read once ever; the rest are read in batches. Anything the model can't read gets a keyword
 * guess (not cached), so the music always plays.
 */
export async function readSongs(songs: string[]): Promise<SongBeat[]> {
  const [model, modelId] = vibeModel();
  const keyOf = (s: string) => createHash("sha256").update(JSON.stringify([modelId, songKey(s)])).digest("hex");
  const out = new Map<string, SongBeat>();

  for (const s of songs) {
    const hit = await q.get<{ profile_json: string }>("SELECT profile_json FROM music_vibes WHERE user_id = ? AND key = ?", CACHE_USER, keyOf(s));
    const parsed = hit && SongBeatSchema.safeParse(JSON.parse(hit.profile_json));
    if (parsed && parsed.success) out.set(s, { ...parsed.data, query: s, source: "ai" });
  }

  const todo = [...new Set(songs.filter((s) => !out.has(s)))];
  const chunks: string[][] = [];
  for (let i = 0; i < todo.length; i += CHUNK) chunks.push(todo.slice(i, i + CHUNK));

  const readChunk = async (chunk: string[]) => {
    const t0 = Date.now();
    try {
      const { output } = await generateText({
        model,
        output: Output.object({ schema: z.object({ songs: z.array(SongBeatSchema).describe("One entry per requested song, in the same order.") }) }),
        system: SYSTEM,
        prompt: `Songs:\n${chunk.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      });
      for (const [i, s] of chunk.entries()) {
        const beat = output.songs[i];
        if (!beat) continue;
        out.set(s, { ...beat, query: s, source: "ai" });
        await q.run(
          `INSERT INTO music_vibes (user_id, key, playlist_name, profile_json, created_at) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (user_id, key) DO UPDATE SET profile_json = excluded.profile_json, created_at = excluded.created_at`,
          CACHE_USER, keyOf(s), null, JSON.stringify(beat), Date.now(),
        );
      }
      log("songs_read", { model: modelId, songs: chunk.length, ms: Date.now() - t0 });
    } catch (e) {
      log("songs_failed", { model: modelId, songs: chunk.length, error: (e as Error).name, detail: (e as Error).message.slice(0, 200) });
    }
  };
  for (let i = 0; i < chunks.length; i += PARALLEL) await Promise.all(chunks.slice(i, i + PARALLEL).map(readChunk));

  return songs.map((s) => out.get(s) ?? basicSong(s));
}
