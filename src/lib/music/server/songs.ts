import "server-only";
import { createHash } from "node:crypto";
import { generateText, type LanguageModel } from "ai";
import { fromModel } from "../vibe/profile";
import { basicSong, SongBeatSchema, songKey, type SongBeat } from "../vibe/songs";
import { q } from "./db";
import { log } from "./log";
import { vibeModel } from "./vibe";

/** A song's fingerprint is the same for everyone, so readings are cached once for all listeners. */
const CACHE_USER = "_song";
/** Songs per model call, and calls in flight at once: a 100-song playlist reads in two rounds. */
const CHUNK = 12;
const PARALLEL = 4;
/** Tries per batch; rate limits and hiccups usually clear in a second or two. */
const TRIES = 3;

/**
 * Asked as plain JSON with a worked example rather than provider-enforced structured output:
 * strict schema mode makes some models (gpt-oss on Groq) return nothing at all, and one bad field
 * would sink the whole batch. Each song is parsed and brought into range on its own instead.
 * Drum grids aren't asked for: models don't know them and copy the example back, so the groove
 * comes from the hand-written pattern for the song's drum feel.
 */
const SYSTEM = `You are a record producer who knows exactly how famous recordings are built, across every genre and language (including Bollywood, Punjabi and other Indian music).
For each song, identify the exact recording and describe its production as it really is:
- tempoBpm: the recording's real tempo
- key and mode: the recording's real key (e.g. "F#", "minor")
- progression: its chord loop as scale degrees 1-7 relative to that key, in order (2-8 chords); chordsPerBar: 1, 2 or 4
- drumFeel: the groove family it belongs to, one of lofi, dholak_groove (Punjabi/Bollywood/folk), boom_bap (classic hip-hop), trap (modern rap, 808s), four_on_floor (dance, disco, house, synth-pop), funk, rock, reggaeton (dembow, dancehall, latin), downtempo (ballads), ambient
- instruments: 1-3 that carry its sound, most important first, from piano, rhodes, acoustic_guitar, electric_guitar, synth, sitar, flute, strings, pad, bells
- energy and warmth 0-1, swing 0-0.6, summary (one short line about the sound), moods (2-4 words)
- known: true only if you recognise this exact recording
This drives an instrumental, lyric-free beat in the style of the song. Never write melodies, vocal lines, riffs as notes, or lyrics.
Answer with JSON only, no prose, in exactly this shape, one entry per song in the same order:
{"songs":[{"title":"Get Lucky","artist":"Daft Punk","known":true,"tempoBpm":116,"key":"F#","mode":"minor","progression":[4,6,1,7],"chordsPerBar":1,"drumFeel":"four_on_floor","instruments":["electric_guitar","rhodes","synth"],"energy":0.65,"warmth":0.5,"swing":0.08,"summary":"Disco-funk: choppy guitar over four-on-the-floor","moods":["groovy","bright"]}]}`;

type Flat = Record<string, unknown>;
const str = (v: unknown, d = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : d);
const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : []);

/** One song from the model's JSON, or null if it's unusable. */
function toBeat(f: Flat | undefined): Omit<SongBeat, "query" | "source"> | null {
  if (!f || typeof f !== "object" || !num(f.tempoBpm, 0) || !str(f.key)) return null;
  const grid = (v: unknown) => (typeof v === "string" ? v : null);
  return {
    title: str(f.title).slice(0, 120),
    artist: str(f.artist).slice(0, 120),
    known: f.known !== false,
    profile: fromModel({
      summary: str(f.summary),
      moods: list(f.moods).map((m) => str(m)),
      tempoBpm: num(f.tempoBpm, 100),
      key: str(f.key),
      mode: str(f.mode, "minor"),
      progression: list(f.progression).map((d) => num(d, 0)),
      harmonicRhythm: num(f.chordsPerBar, 1),
      drumFeel: str(f.drumFeel, "lofi"),
      groove: grid(f.kick) ? { kick: grid(f.kick)!, snare: grid(f.snare) ?? "", hat: grid(f.hat) ?? "" } : null,
      bassRhythm: grid(f.bass),
      palette: list(f.instruments).map((i) => str(i)),
      energy: num(f.energy, 0.5),
      warmth: num(f.warmth, 0.5),
      swing: num(f.swing, 0),
    }),
  };
}

/** The JSON object in a model's answer (models sometimes wrap it in prose or code fences). */
function parseJson(text: string): { songs?: Flat[] } | null {
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return null;
  }
}

/** One model call for a batch of songs, in order; null where a song couldn't be read. */
export async function readSongsWith(model: LanguageModel, chunk: string[]) {
  const { text } = await generateText({
    model,
    system: SYSTEM,
    prompt: `Songs:\n${chunk.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    providerOptions: { groq: { reasoningEffort: "low" } },
  });
  const songs = parseJson(text)?.songs;
  return { songs: chunk.map((_, i) => toBeat(Array.isArray(songs) ? songs[i] : undefined)), raw: text };
}

/**
 * Read each song ("Title — Artist") for how it's produced, in the order given. Cached per song, so a
 * song is read once ever; the rest are read in batches and retried. Only if the model can't be
 * reached at all does a song fall back to a reading from its title (not cached, so it's read again
 * next time).
 */
export async function readSongs(songs: string[]): Promise<SongBeat[]> {
  const [model, modelId] = vibeModel();
  const keyOf = (s: string) => createHash("sha256").update(JSON.stringify([modelId, "v3", songKey(s)])).digest("hex");
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
    let left = chunk;
    for (let attempt = 1; attempt <= TRIES && left.length; attempt++) {
      const t0 = Date.now();
      try {
        const { songs: read } = await readSongsWith(model, left);
        const missed: string[] = [];
        for (const [i, s] of left.entries()) {
          const beat = read[i];
          if (!beat) {
            missed.push(s);
            continue;
          }
          out.set(s, { ...beat, query: s, source: "ai" });
          await q.run(
            `INSERT INTO music_vibes (user_id, key, playlist_name, profile_json, created_at) VALUES (?, ?, ?, ?, ?)
             ON CONFLICT (user_id, key) DO UPDATE SET profile_json = excluded.profile_json, created_at = excluded.created_at`,
            CACHE_USER, keyOf(s), null, JSON.stringify(beat), Date.now(),
          );
        }
        log("songs_read", { model: modelId, songs: left.length, missed: missed.length, ms: Date.now() - t0, attempt });
        left = missed;
      } catch (e) {
        log("songs_failed", { model: modelId, songs: left.length, attempt, error: (e as Error).name, detail: (e as Error).message.slice(0, 200) });
      }
      if (left.length && attempt < TRIES) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  };
  for (let i = 0; i < chunks.length; i += PARALLEL) await Promise.all(chunks.slice(i, i + PARALLEL).map(readChunk));

  return songs.map((s) => out.get(s) ?? basicSong(s));
}
