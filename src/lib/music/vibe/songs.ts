import { z } from "zod";
import { KEYS, VibeProfileSchema, type VibeProfile } from "./profile";

/**
 * Songs → beats. Every song in a listener's Spotify playlist is read for its production
 * fingerprint (tempo, key, chord loop, groove, sound) and its signature hook, and played back as a
 * generated, instrumental beat you recognise at once. Lyrics are never reproduced.
 */

export const SongBeatSchema = z.object({
  title: z.string().max(120).describe("The song's title as officially written."),
  artist: z.string().max(120).describe("The main artist, as officially written."),
  known: z.boolean().describe("true if you recognise this exact song; false if you are guessing from the words."),
  profile: VibeProfileSchema,
});
export type SongBeat = z.infer<typeof SongBeatSchema> & {
  /** "Title — Artist" as it was read, the song's cache key. */
  query: string;
  /** "ai": read by the model; "basic": a keyword guess when the model isn't available. */
  source: "ai" | "basic";
  /** From the Spotify playlist it came from. */
  artworkUrl?: string | null;
  spotifyUrl?: string | null;
};

/** A Spotify playlist rebuilt as beats: same songs, same order, each played as its own beat. */
export interface BeatPlaylist {
  id: string;
  name: string;
  sourceUrl: string | null;
  artworkUrl: string | null;
  songs: SongBeat[];
  createdAt: number;
}

/** Case- and punctuation-blind key for a song, used for caching. */
export const songKey = (q: string) => q.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]+/gu, " ").trim();

/** "Title — Artist", "Title - Artist" or "Title by Artist". */
export function splitSong(q: string): { title: string; artist: string } {
  const m = q.match(/^(.+?)\s+(?:[-–—|]|by)\s+(.+)$/i);
  return m ? { title: m[1].trim(), artist: m[2].trim() } : { title: q.trim(), artist: "" };
}

function hash(s: string): number[] {
  let h = 2166136261;
  const out: number[] = [];
  for (let i = 0; i < 8; i++) {
    for (const c of s + i) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    out.push(h & 0xff);
  }
  return out;
}

/** A best guess from the words alone, varied per song. Used when the model is unavailable. */
export function basicSong(query: string): SongBeat {
  const { title, artist } = splitSong(query);
  const text = songKey(query);
  const h = hash(text);
  const has = (re: RegExp) => re.test(text);
  const folk = has(/punjab|bhangra|dhol|sufi|qawwali|coke studio|diljit|sidhu|karan aujla|ap dhillon|nusrat|rahat|arijit|bollywood/);
  const trap = has(/travis|future|drake|21 savage|metro|playboi|lil |trap|drill|divine|seedhe maut|krsna/);
  const rap = has(/kendrick|eminem|nas|jay z|cole|rap|hip hop/);
  const dance = has(/remix|edm|house|disco|daft punk|dua lipa|weeknd|calvin harris|avicii|club/);
  const rock = has(/rock|queen|nirvana|ac dc|arctic monkeys|linkin|coldplay|imagine dragons/);
  const latin = has(/reggaeton|bad bunny|j balvin|despacito|daddy yankee/);
  const calm = has(/lofi|lo fi|chill|piano|acoustic|slowed|sleep|ballad/);
  const progressions = [[1, 5, 6, 4], [6, 4, 1, 5], [1, 6, 4, 5], [2, 5, 1, 6], [1, 4, 6, 5], [6, 5, 4, 5]];
  const drumFeel: VibeProfile["drumFeel"] = folk ? "dholak_groove" : trap ? "trap" : rap ? "boom_bap" : dance ? "four_on_floor" : rock ? "rock" : latin ? "reggaeton" : calm ? "downtempo" : "lofi";
  const tempo: Record<VibeProfile["drumFeel"], number> = {
    dholak_groove: 96, trap: 140, boom_bap: 90, four_on_floor: 118, rock: 120, reggaeton: 94, downtempo: 72, lofi: 82, funk: 108, ambient: 66,
  };
  const palette: Record<VibeProfile["drumFeel"], VibeProfile["palette"]> = {
    dholak_groove: ["sitar", "strings"], trap: ["bells", "pad"], boom_bap: ["rhodes", "piano"], four_on_floor: ["synth", "pad"], rock: ["electric_guitar", "piano"],
    reggaeton: ["synth", "acoustic_guitar"], downtempo: ["piano", "strings"], lofi: ["rhodes", "acoustic_guitar"], funk: ["electric_guitar", "rhodes"], ambient: ["pad"],
  };
  const energy = drumFeel === "downtempo" ? 0.3 : drumFeel === "lofi" ? 0.4 : 0.6;
  return {
    query,
    source: "basic",
    title,
    artist,
    known: false,
    profile: {
      summary: `A best guess at ${title}'s feel`,
      moods: [energy > 0.5 ? "driving" : "mellow"],
      tempoBpm: tempo[drumFeel] + (h[3] % 9) - 4,
      key: KEYS[h[0] % KEYS.length],
      mode: h[1] % 3 === 0 ? "major" : "minor",
      progression: progressions[h[2] % progressions.length],
      drumFeel,
      palette: palette[drumFeel],
      energy,
      warmth: 0.6,
      swing: drumFeel === "lofi" || drumFeel === "boom_bap" ? 0.25 : 0,
    },
  };
}

/** Demo mode's playlist: what a Spotify import looks like, with no account and no model. */
export const demoPlaylist = (): BeatPlaylist => ({ id: "demo", name: "Demo playlist", sourceUrl: null, artworkUrl: null, songs: DEMO_SONGS, createdAt: 0 });

/**
 * Three well-known songs, fingerprinted by hand, so demo mode plays without an account or a model.
 * Only public facts about each recording: tempo, key, chord loop and groove.
 */
export const DEMO_SONGS: SongBeat[] = [
  {
    query: "Get Lucky — Daft Punk",
    source: "ai",
    title: "Get Lucky",
    artist: "Daft Punk",
    known: true,
    profile: {
      summary: "Disco-funk: choppy guitar, four-on-the-floor, a loop that never resolves",
      moods: ["groovy", "bright"],
      tempoBpm: 116,
      key: "F#",
      mode: "minor",
      progression: [4, 6, 1, 7],
      harmonicRhythm: 1,
      drumFeel: "four_on_floor",
      groove: { kick: "x...x...x...x...", snare: "....x.......x...", hat: "o.x.o.x.o.x.o.xo" },
      // Octave-jumping funk bass on Bm7, D, F#m7, E; the guitar chops the chords in 16ths.
      bassLine: "4:3 4:1 r:2 4':2 r:2 4:2 r:2 4:2 6,:3 6,:1 r:2 6:2 r:2 6,:2 r:2 6,:2 1:3 1:1 r:2 1':2 r:2 1:2 r:2 1:2 7,:3 7,:1 r:2 7:2 r:2 7,:2 r:2 7,:2",
      comp: "x.xx.x.x.xx.x.xx",
      sevenths: true,
      palette: ["electric_guitar", "rhodes", "synth"],
      energy: 0.65,
      warmth: 0.5,
      swing: 0.08,
    },
  },
  {
    query: "Let It Be — The Beatles",
    source: "ai",
    title: "Let It Be",
    artist: "The Beatles",
    known: true,
    profile: {
      summary: "Gospel-tinged piano ballad with an organ swell and a steady backbeat",
      moods: ["hopeful", "warm"],
      tempoBpm: 72,
      key: "C",
      mode: "major",
      progression: [1, 5, 6, 4, 1, 5, 4, 1],
      harmonicRhythm: 2,
      drumFeel: "downtempo",
      groove: { kick: "x.......x.......", snare: "....x.......x...", hat: "x.o.x.o.x.o.x.o." },
      bassRhythm: "x.......x.......",
      comp: "x...x...x...x...",
      sevenths: false,
      palette: ["piano", "pad"],
      energy: 0.35,
      warmth: 0.75,
      swing: 0,
    },
  },
  {
    query: "Stand By Me — Ben E. King",
    source: "ai",
    title: "Stand By Me",
    artist: "Ben E. King",
    known: true,
    profile: {
      summary: "Soul classic: walking bass, scraped percussion, strings that lift the loop",
      moods: ["soulful", "steady"],
      tempoBpm: 118,
      key: "A",
      mode: "major",
      progression: [1, 1, 6, 6, 4, 5, 1, 1],
      harmonicRhythm: 1,
      drumFeel: "funk",
      groove: { kick: "x.....x.x.......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
      // The riff: A A C# E F# E C# B, then the same shape on F#m, D and E.
      bassLine:
        "1:6 1:2 3:4 5:4 6:4 5:4 3:4 2:4 6,:6 6,:2 1:4 3:4 4:4 3:4 1:4 7,:4 4,:6 4,:2 6,:4 1:4 5,:6 5,:2 7,:4 2:4 1:6 1:2 3:4 5:4 6:4 5:4 3:4 2:4",
      sevenths: false,
      palette: ["strings", "acoustic_guitar"],
      energy: 0.45,
      warmth: 0.7,
      swing: 0.12,
    },
  },
  {
    query: "Seven Nation Army — The White Stripes",
    source: "ai",
    title: "Seven Nation Army",
    artist: "The White Stripes",
    known: true,
    profile: {
      summary: "One fuzzed-out riff over a stomping kick",
      moods: ["driving", "defiant"],
      tempoBpm: 124,
      key: "E",
      mode: "minor",
      progression: [1, 1, 6, 5],
      harmonicRhythm: 2,
      drumFeel: "rock",
      groove: { kick: "x...x...x...x...", snare: "................", hat: "o...o...o...o..." },
      riff: "1:6 1:2 3:3 1:3 7,:2 6,:8 5,:8",
      bassLine: "1:6 1:2 3:3 1:3 7,:2 6,:8 5,:8",
      sevenths: false,
      palette: ["electric_guitar"],
      energy: 0.6,
      warmth: 0.4,
      swing: 0,
    },
  },
  {
    query: "Billie Jean — Michael Jackson",
    source: "ai",
    title: "Billie Jean",
    artist: "Michael Jackson",
    known: true,
    profile: {
      summary: "A tight drum machine and the bass line everyone knows, under soft synth chords",
      moods: ["tense", "groovy"],
      tempoBpm: 117,
      // F# dorian, written in E major so the chords (F#m, G#m, A) come out right.
      key: "E",
      mode: "major",
      progression: [2, 3, 4, 3],
      harmonicRhythm: 1,
      drumFeel: "funk",
      groove: { kick: "x.......x.......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x." },
      bassLine: "2:2 6,:2 1:2 2:2 1:2 6,:2 5,:2 6,:2",
      sevenths: false,
      palette: ["pad", "synth"],
      energy: 0.55,
      warmth: 0.5,
      swing: 0,
    },
  },
];
