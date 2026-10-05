import { KEYS, type VibeProfile } from "./profile";
import type { BeatPlaylist, SongBeat } from "./songs";

/**
 * Orders a playlist so it plays like a DJ set rather than a shuffle.
 *
 * The rules are the ones DJs mix by:
 *  - keys: neighbours on the Camelot wheel (same key, ±1 "hour", or the relative major/minor)
 *    blend; anything further clashes. A song may move a semitone to land on a neighbour, the way
 *    a DJ nudges pitch — still recognisably the song.
 *  - tempo: small steps (a few percent), counting half- and double-time as the same pulse.
 *  - energy: for studying, a gentle arc — ease in, lift through the middle, settle at the end —
 *    with no sudden jumps between neighbours.
 *  - feel: songs with a similar groove sit together.
 *
 * Search: the best greedy chain from every starting song, then 2-opt until nothing improves.
 */

export interface Camelot {
  /** 1–12 around the wheel. */
  hour: number;
  /** A = minor, B = major. */
  letter: "A" | "B";
}

/** Camelot position of a key: C major = 8B, A minor = 8A, G major = 9B… */
export function camelot(key: VibeProfile["key"], mode: VibeProfile["mode"]): Camelot {
  const pc = KEYS.indexOf(key);
  const major = mode === "major" ? pc : (pc + 3) % 12; // a minor key shares its relative major's hour
  return { hour: ((major * 7 + 7) % 12) + 1, letter: mode === "major" ? "B" : "A" };
}

/** How far apart two keys sound on the wheel: 0 same, 1 neighbour, 2 a mild lift, more = clash. */
export function keyDistance(a: Camelot, b: Camelot): number {
  const d = Math.min((a.hour - b.hour + 12) % 12, (b.hour - a.hour + 12) % 12);
  const sameLetter = a.letter === b.letter;
  if (d === 0) return sameLetter ? 0 : 1;
  if (d === 1) return sameLetter ? 1 : 2;
  if (d === 2 && sameLetter) return 2.5;
  return 3 + d * 0.5 + (sameLetter ? 0 : 0.5);
}

/** Tempo step between songs in "6 % units", treating half- and double-time as the same pulse. */
export function tempoDistance(a: number, b: number): number {
  const best = Math.min(...[1, 2, 0.5].map((f) => Math.abs(Math.log((b * f) / a))));
  return best / Math.log(1.06);
}

/** The tempo `to` sounds like next to `from`: itself, or its half/double time if that's closer. */
export function pulseMatch(from: number, to: number): number {
  return [to, to * 2, to / 2].reduce((best, t) => (Math.abs(Math.log(t / from)) < Math.abs(Math.log(best / from)) ? t : best), to);
}

const FEEL_FAMILY: Record<VibeProfile["drumFeel"], string> = {
  lofi: "chill",
  boom_bap: "chill",
  downtempo: "chill",
  ambient: "chill",
  funk: "groove",
  four_on_floor: "groove",
  reggaeton: "groove",
  rock: "drive",
  trap: "trap",
  dholak_groove: "dholak",
};

/** Cost of playing `b` right after `a`. */
export function transitionCost(a: VibeProfile, b: VibeProfile): number {
  const key = keyDistance(camelot(a.key, a.mode), camelot(b.key, b.mode));
  const tempo = Math.min(4, tempoDistance(a.tempoBpm, b.tempoBpm));
  const energy = Math.abs(a.energy - b.energy) * 4;
  const feel = a.drumFeel === b.drumFeel ? 0 : FEEL_FAMILY[a.drumFeel] === FEEL_FAMILY[b.drumFeel] ? 0.3 : 0.8;
  return key * 1.0 + tempo * 1.2 + energy + feel;
}

/** The study arc: calm start, a lift through the middle, settle at the end. */
function arcTarget(i: number, n: number, lo: number, hi: number) {
  if (n < 3) return (lo + hi) / 2;
  return lo + (hi - lo) * Math.sin((Math.PI * i) / (n - 1));
}

function totalCost(order: number[], songs: VibeProfile[], lo: number, hi: number) {
  let c = 0;
  for (let i = 0; i < order.length; i++) {
    c += Math.abs(songs[order[i]].energy - arcTarget(i, order.length, lo, hi)) * 2;
    if (i) c += transitionCost(songs[order[i - 1]], songs[order[i]]);
  }
  return c;
}

/** Best order of the profiles, as indexes into the input. */
export function arrangeOrder(profiles: VibeProfile[]): number[] {
  const n = profiles.length;
  if (n < 3) return profiles.map((_, i) => i);
  const energies = profiles.map((p) => p.energy);
  const lo = Math.min(...energies);
  const hi = Math.max(...energies);

  let best: number[] = [];
  let bestCost = Infinity;
  for (let start = 0; start < n; start++) {
    const order = [start];
    const left = new Set(profiles.map((_, i) => i).filter((i) => i !== start));
    while (left.size) {
      const last = order[order.length - 1];
      const pos = order.length;
      let pick = -1;
      let pickCost = Infinity;
      for (const j of left) {
        const c = transitionCost(profiles[last], profiles[j]) + Math.abs(profiles[j].energy - arcTarget(pos, n, lo, hi)) * 2;
        if (c < pickCost) [pick, pickCost] = [j, c];
      }
      order.push(pick);
      left.delete(pick);
    }
    const c = totalCost(order, profiles, lo, hi);
    if (c < bestCost) [best, bestCost] = [order, c];
  }

  // 2-opt: reverse any stretch that lowers the whole set's cost, until nothing does.
  for (let improved = true, passes = 0; improved && passes < 50; passes++) {
    improved = false;
    for (let i = 0; i < n - 1; i++)
      for (let j = i + 1; j < n; j++) {
        const next = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
        const c = totalCost(next, profiles, lo, hi);
        if (c < bestCost - 1e-9) {
          [best, bestCost] = [next, c];
          improved = true;
        }
      }
  }
  return best;
}

/** The profile moved by `semitones`, hooks and all (they're written in scale degrees). */
export function transpose(p: VibeProfile, semitones: number): VibeProfile {
  if (!semitones) return p;
  return { ...p, key: KEYS[(KEYS.indexOf(p.key) + semitones + 12) % 12] };
}

export interface ArrangedSong extends SongBeat {
  /** Semitones it was moved to sit in key with its neighbour (0 = as recorded). */
  keyShift: number;
}

/**
 * The playlist in set order. Where two neighbours still clash, the later song moves a semitone
 * up or down if that puts it on a compatible key — never more.
 */
export function arrangeSongs(songs: SongBeat[]): ArrangedSong[] {
  const order = arrangeOrder(songs.map((s) => s.profile));
  const out: ArrangedSong[] = [];
  for (const i of order) {
    const song = songs[i];
    const prev = out[out.length - 1]?.profile;
    let shift = 0;
    if (prev) {
      const here = keyDistance(camelot(prev.key, prev.mode), camelot(song.profile.key, song.profile.mode));
      if (here >= 3) {
        for (const s of [1, -1]) {
          const moved = transpose(song.profile, s);
          if (keyDistance(camelot(prev.key, prev.mode), camelot(moved.key, moved.mode)) <= 1) {
            shift = s;
            break;
          }
        }
      }
    }
    out.push({ ...song, profile: transpose(song.profile, shift), keyShift: shift });
  }
  return out;
}

const arranged = new WeakMap<BeatPlaylist, BeatPlaylist>();

/** The playlist as it plays: same songs, set order. Cached per playlist object. */
export function arrangePlaylist(p: BeatPlaylist): BeatPlaylist {
  let a = arranged.get(p);
  if (!a) arranged.set(p, (a = { ...p, songs: arrangeSongs(p.songs) }));
  return a;
}
