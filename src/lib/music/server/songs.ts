import "server-only";
import { createHash } from "node:crypto";
import { generateText, type LanguageModel } from "ai";
import { fromModel, hookFields } from "../vibe/profile";
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
 * The chorus melody, riff and bass line are what make a song recognisable, but they're only asked
 * of a strong model (MUSIC_VIBE_MODEL): the free Groq model writes wrong tunes at low reasoning,
 * and at higher reasoning it hits its rate limit and the playlist never finishes. A wrong tune is
 * worse than none. One copied from an example is dropped.
 */
const askHooks = () => !!process.env.MUSIC_VIBE_MODEL;
const EXAMPLE_RIFF = "1:6 1:2 3:3 1:3 7,:2 6,:8 5,:8";
const EXAMPLE_MELODY = "3:4 3:4 4:4 5:4 5:4 4:4 3:4 2:4 1:4 1:4 2:4 3:4 3:6 2:2 2:8";
const HOOKS = `- melody: the chorus's sung melody, the line a listener hums along to (for Indian songs, the mukhda / hook line), as notes in order. Each note is scale-degree:length, degree 1-7 of the key (# or b for a chromatic note, ' an octave up, , an octave down) and length in sixteenth notes (4 = a beat, 16 = a bar); r:4 is a rest. 2-8 bars, starting where the progression starts. Recall the real tune note by note before writing it: intervals and rhythm must match the record.
- riff: the main instrumental riff in the same notation, only if the song has one people know (e.g. a guitar or synth hook), else ""
- bass: the bass line in the same notation, only if it's iconic (e.g. a walking or riff bass line), else ""
- Use "" for melody, riff or bass when you don't actually know the tune: a made-up melody is worse than none.
`;
const system = (hooks: boolean) => `You are a record producer who knows exactly how famous recordings are built, across every genre and language (including Bollywood, Punjabi and other Indian music).
For each song, identify the exact recording and describe its production as it really is:
- tempoBpm: the recording's real tempo
- key and mode: the recording's real key (e.g. "F#", "minor")
- progression: its chord loop as scale degrees 1-7 relative to that key, in order (2-8 chords); chordsPerBar: 1, 2 or 4
- drumFeel: the groove family it belongs to, one of lofi, dholak_groove (Punjabi/Bollywood/folk), boom_bap (classic hip-hop), trap (modern rap, 808s), four_on_floor (dance, disco, house, synth-pop), funk, rock, reggaeton (dembow, dancehall, latin), downtempo (ballads), ambient
- instruments: 1-3 that carry its sound, most important first, from piano, rhodes, acoustic_guitar, electric_guitar, synth, sitar, flute, strings, pad, bells
- energy and warmth 0-1, swing 0-0.6, summary (one short line about the sound), moods (2-4 words)
- sevenths: true if its chords are jazzy 7th chords, false for plain triads (most pop, rock and soul)
- comp: the rhythm the keys or guitar play the chords in, as 16 characters for one bar (x = stab, o = soft, . = rest), or "" for held chords
${hooks ? HOOKS : ""}- known: true only if you recognise this exact recording
This drives an instrumental, lyric-free beat of the song. Never write lyrics${hooks ? "" : ", melodies or riffs"}.
Answer with JSON only, no prose, in exactly this shape, one entry per song in the same order:
{"songs":[{"title":"Seven Nation Army","artist":"The White Stripes","known":true,"tempoBpm":124,"key":"E","mode":"minor","progression":[1,1,6,5],"chordsPerBar":2,"drumFeel":"rock","instruments":["electric_guitar"],"sevenths":false,"comp":"",${hooks ? `"melody":"","riff":"${EXAMPLE_RIFF}","bass":"${EXAMPLE_RIFF}",` : ""}"energy":0.6,"warmth":0.4,"swing":0,"summary":"One fuzzed-out riff over a stomping kick","moods":["driving","defiant"]}${hooks ? `,{"title":"Ode to Joy","artist":"Ludwig van Beethoven","known":true,"tempoBpm":120,"key":"D","mode":"major","progression":[1,5,1,5],"chordsPerBar":1,"drumFeel":"downtempo","instruments":["strings","piano"],"sevenths":false,"comp":"x...x...x...x...","melody":"${EXAMPLE_MELODY}","riff":"","bass":"","energy":0.4,"warmth":0.6,"swing":0,"summary":"The hymn tune, carried by strings","moods":["uplifting","bright"]}` : ""}]}`;

type Flat = Record<string, unknown>;
const str = (v: unknown, d = "") => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && Number.isFinite(Number(v)) ? Number(v) : d);
const list = (v: unknown) => (Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,\s]+/) : []);

/** One song from the model's JSON, or null if it's unusable. */
function toBeat(f: Flat | undefined): Omit<SongBeat, "query" | "source"> | null {
  if (!f || typeof f !== "object" || !num(f.tempoBpm, 0) || !str(f.key)) return null;
  const grid = (v: unknown) => (typeof v === "string" ? v : null);
  // A song whose hook is one of the examples' was copied, not read.
  const own = (v: unknown, example: string, title: RegExp) => (!title.test(str(f.title)) && str(v).replace(/\s+/g, " ").trim() === example ? null : v);
  const hooks = hookFields({ melody: own(f.melody, EXAMPLE_MELODY, /ode to joy/i), riff: own(f.riff, EXAMPLE_RIFF, /seven nation/i), bass: own(f.bass, EXAMPLE_RIFF, /seven nation/i), comp: f.comp, sevenths: f.sevenths });
  return {
    title: str(f.title).slice(0, 120),
    artist: str(f.artist).slice(0, 120),
    known: f.known !== false,
    profile: {
      ...fromModel({
        summary: str(f.summary),
        moods: list(f.moods).map((m) => str(m)),
        tempoBpm: num(f.tempoBpm, 100),
        key: str(f.key),
        mode: str(f.mode, "minor"),
        progression: list(f.progression).map((d) => num(d, 0)),
        harmonicRhythm: num(f.chordsPerBar, 1),
        drumFeel: str(f.drumFeel, "lofi"),
        groove: grid(f.kick) ? { kick: grid(f.kick)!, snare: grid(f.snare) ?? "", hat: grid(f.hat) ?? "" } : null,
        bassRhythm: null, // "bass" is now a line of notes, played by the bass line
        palette: list(f.instruments).map((i) => str(i)),
        energy: num(f.energy, 0.5),
        warmth: num(f.warmth, 0.5),
        swing: num(f.swing, 0),
      }),
      ...hooks,
    },
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
export async function readSongsWith(model: LanguageModel, chunk: string[], hooks = askHooks()) {
  const { text } = await generateText({
    model,
    system: system(hooks),
    prompt: `Songs:\n${chunk.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
    providerOptions: { groq: { reasoningEffort: "low" } },
  });
  const songs = parseJson(text)?.songs;
  const beat = (f: Flat | undefined) => toBeat(hooks || !f ? f : { ...f, melody: undefined, riff: undefined, bass: undefined });
  return { songs: chunk.map((_, i) => beat(Array.isArray(songs) ? songs[i] : undefined)), raw: text };
}

/**
 * Read each song ("Title — Artist") for how it's produced, in the order given. Cached per song, so a
 * song is read once ever; the rest are read in batches and retried. Only if the model can't be
 * reached at all does a song fall back to a reading from its title (not cached, so it's read again
 * next time).
 */
export async function readSongs(songs: string[]): Promise<SongBeat[]> {
  const [model, modelId] = vibeModel();
  const keyOf = (s: string) => createHash("sha256").update(JSON.stringify([modelId, "v6", songKey(s)])).digest("hex");
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
