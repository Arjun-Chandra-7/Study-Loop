import { z } from "zod";
import type { PhysioState } from "../../sensors/classify";

/**
 * A playlist's musical "vibe", read from its titles and artists. It drives an original, generated,
 * lyric-free study beat: nothing is copied from the songs themselves.
 */
export const KEYS = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export const INSTRUMENTS = ["piano", "rhodes", "acoustic_guitar", "sitar", "flute", "strings", "pad", "bells"] as const;
export const DRUM_FEELS = ["lofi", "dholak_groove", "boom_bap", "downtempo", "ambient"] as const;
/** Scale degrees (1-based) for chord roots; the engine builds diatonic 7th chords in the key/mode. */
export const DEGREES = [1, 2, 3, 4, 5, 6, 7] as const;

export const VibeProfileSchema = z.object({
  summary: z.string().max(160).describe("One short line a listener would recognise as their playlist's feel, e.g. 'Warm Hindi indie with acoustic guitar and soft Punjabi grooves'."),
  moods: z.array(z.string().max(24)).min(1).max(4).describe("2–4 single-word moods, e.g. romantic, nostalgic, uplifting."),
  tempoBpm: z.number().int().min(60).max(130).describe("Typical tempo of these songs, adjusted towards a calm study pace."),
  key: z.enum(KEYS),
  mode: z.enum(["major", "minor"]),
  progression: z.array(z.number().int().min(1).max(7)).length(4).describe("Four chord roots as scale degrees (1–7) typical of these songs, e.g. [1,5,6,4] or [6,4,1,5]."),
  drumFeel: z.enum(DRUM_FEELS).describe("dholak_groove for Punjabi/Bollywood/folk, boom_bap for hip-hop, lofi for indie/pop, downtempo for slow ballads, ambient for very calm."),
  palette: z.array(z.enum(INSTRUMENTS)).min(1).max(3).describe("1–3 lead/chord instruments that suit these songs."),
  energy: z.number().min(0).max(1).describe("0 = very calm, 1 = very energetic, for a study setting."),
  warmth: z.number().min(0).max(1).describe("0 = bright and airy, 1 = warm and mellow."),
  swing: z.number().min(0).max(0.6).describe("Groove swing: 0 straight, ~0.3 lofi, 0.5 heavy."),
});
export type VibeProfile = z.infer<typeof VibeProfileSchema>;

export interface BeatParams {
  bpm: number;
  /** 0–1 how busy the drums are (0 = no drums) */
  drumDensity: number;
  /** probability a lead note plays on an eighth-note step */
  melodyDensity: number;
  /** lowpass cutoff on the whole mix, Hz */
  cutoffHz: number;
  /** master gain in dB */
  gainDb: number;
  /** reverb wet 0–1 */
  space: number;
  /** listener-facing description of the adaptation */
  label: string;
}

/**
 * How the beat responds to the band. Calm/stable: the playlist's own feel. Rising stress: slow down,
 * thin out the drums, darken and widen the sound (a de-escalating bed). Recovering: ease back.
 */
export function beatParams(p: VibeProfile, state: PhysioState): BeatParams {
  const baseCutoff = 1400 + (1 - p.warmth) * 3600; // warm 1.4 kHz … bright 5 kHz
  const base: BeatParams = {
    bpm: p.tempoBpm,
    drumDensity: p.drumFeel === "ambient" ? 0.15 : 0.45 + p.energy * 0.5,
    melodyDensity: 0.12 + p.energy * 0.18,
    cutoffHz: baseCutoff,
    gainDb: -12,
    space: 0.25 + (1 - p.energy) * 0.15,
    label: "Following your playlist's feel",
  };
  switch (state) {
    case "elevated":
      return {
        ...base,
        bpm: Math.max(58, Math.round(p.tempoBpm * 0.82)),
        drumDensity: base.drumDensity * 0.3,
        melodyDensity: base.melodyDensity * 0.5,
        cutoffHz: base.cutoffHz * 0.55,
        gainDb: base.gainDb - 3,
        space: Math.min(0.6, base.space + 0.2),
        label: "Stress is up: slowing down and softening",
      };
    case "recovering":
      return {
        ...base,
        bpm: Math.round(p.tempoBpm * 0.9),
        drumDensity: base.drumDensity * 0.6,
        melodyDensity: base.melodyDensity * 0.75,
        cutoffHz: base.cutoffHz * 0.75,
        gainDb: base.gainDb - 1.5,
        space: base.space + 0.1,
        label: "Settling back down",
      };
    case "changing":
      return { ...base, bpm: Math.round(p.tempoBpm * 0.95), drumDensity: base.drumDensity * 0.85, label: "Easing off a little" };
    default:
      return base;
  }
}

/** MIDI note numbers for the scale of a key/mode, starting at `octave`. */
export function scale(key: VibeProfile["key"], mode: VibeProfile["mode"], octave = 4): number[] {
  const root = 12 * (octave + 1) + KEYS.indexOf(key);
  const steps = mode === "major" ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10];
  return steps.map((s) => root + s);
}

/** A diatonic 7th chord on a scale degree (1–7), as MIDI notes. */
export function chord(key: VibeProfile["key"], mode: VibeProfile["mode"], degree: number, octave = 3): number[] {
  const sc = [...scale(key, mode, octave), ...scale(key, mode, octave + 1)];
  const i = degree - 1;
  return [sc[i], sc[i + 2], sc[i + 4], sc[i + 6]];
}
