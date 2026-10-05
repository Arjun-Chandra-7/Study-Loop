"use client";

import type { PhysioState } from "../../sensors/classify";
import { pulseMatch } from "./arrange";
import { beatParams, chord, hookMidi, parseHook, scale, stepGrid, usesSevenths, type BeatParams, type Hook, type VibeProfile } from "./profile";
import type { SongBeat } from "./songs";

type ToneNS = typeof import("tone");
type Pattern = (number | 0)[]; // 16 steps, values are velocities 0–1
type Disposable = { dispose(): void };

/** 16-step drum patterns per feel: [kick, snare, hat, perc]. Velocities, 0 = rest. */
const PATTERNS: Record<VibeProfile["drumFeel"], [Pattern, Pattern, Pattern, Pattern]> = {
  lofi: [
    [1, 0, 0, 0, 0, 0, 0, 0.6, 0.8, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0.3],
    [0.5, 0, 0.4, 0, 0.5, 0, 0.4, 0, 0.5, 0, 0.4, 0, 0.5, 0, 0.4, 0.3],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  boom_bap: [
    [1, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0.9, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [0.6, 0, 0.5, 0, 0.6, 0, 0.5, 0, 0.6, 0, 0.5, 0, 0.6, 0, 0.5, 0.4],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  dholak_groove: [
    // perc = the high "na/ta" stroke; kick = the low "dha/ge" stroke
    [1, 0, 0, 0.6, 0, 0, 0.8, 0, 1, 0, 0, 0.6, 0, 0, 0.7, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0.3, 0, 0.25, 0, 0.3, 0, 0.25, 0, 0.3, 0, 0.25, 0, 0.3, 0, 0.25, 0],
    [0, 0, 0.8, 0, 0.6, 0.5, 0, 0.7, 0, 0, 0.8, 0, 0.6, 0.5, 0, 0.6],
  ],
  downtempo: [
    [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.7, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0, 0, 0, 0],
    [0.4, 0, 0, 0, 0.4, 0, 0, 0, 0.4, 0, 0, 0, 0.4, 0, 0, 0.3],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  ambient: [
    [0.8, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0.3, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  trap: [
    // half-time: snare on 3, rolling hats
    [1, 0, 0, 0, 0, 0, 0.8, 0, 0, 0, 0.7, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0.6, 0.3, 0.5, 0.3, 0.6, 0.3, 0.5, 0.3, 0.6, 0.3, 0.5, 0.4, 0.6, 0.5, 0.5, 0.5],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  four_on_floor: [
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0, 0.9, 0, 0, 0, 0, 0, 0, 0, 0.9, 0, 0, 0],
    [0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0, 0, 0, 0.7, 0.3],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  funk: [
    [1, 0, 0, 0.6, 0, 0, 0.7, 0, 0, 0, 0.8, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0.35, 0, 0.35, 0, 0, 1, 0, 0, 0],
    [0.6, 0.3, 0.5, 0.3, 0.6, 0.3, 0.5, 0.3, 0.6, 0.3, 0.5, 0.3, 0.6, 0.3, 0.5, 0.3],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  rock: [
    [1, 0, 0, 0, 0, 0, 0.8, 0, 0.9, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
    [0.6, 0, 0.5, 0, 0.6, 0, 0.5, 0, 0.6, 0, 0.5, 0, 0.6, 0, 0.5, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
  reggaeton: [
    // dembow
    [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
    [0, 0, 0, 0.9, 0, 0, 0.8, 0, 0, 0, 0, 0.9, 0, 0, 0.8, 0],
    [0.5, 0, 0.4, 0, 0.5, 0, 0.4, 0, 0.5, 0, 0.4, 0, 0.5, 0, 0.4, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ],
};

const SILENT: Pattern = Array(16).fill(0);

const RAMP_S = 6;
/** Each song in a queue plays for about this long before the next one comes in. */
const SONG_S = 90;
/** Bars the outgoing song spends gliding to the next one's tempo before the handover. */
const MIX_BARS = 4;
/** Bars a song takes to arrive: hats and percussion wait, the filter opens. */
const INTRO_BARS = 4;
/** Ear safety: nothing leaves the master above this, and the whole mix sits this much under it. */
const CEILING_DB = -3;
const TRIM_DB = 5;

/** What's playing: a Loop is a beat profile plus where it came from. */
export interface LoopMeta {
  name: string;
  playlistName: string | null;
  profile: VibeProfile;
  /** Set once it's in "Your Loops". */
  savedId?: string;
  /** A queue of songs, each played as its own beat; `profile` is the current one's. */
  queue?: SongBeat[];
  index?: number;
  /** The beat playlist the queue came from. */
  playlistId?: string;
}

/** The Loop for song `i` of a playlist's queue. */
export function songLoop(queue: SongBeat[], i: number, from: { name: string | null; id?: string } = { name: null }): LoopMeta {
  const n = ((i % queue.length) + queue.length) % queue.length;
  const song = queue[n];
  return { name: song.title, playlistName: from.name, profile: song.profile, queue, index: n, playlistId: from.id };
}

/** Chords per bar, kept to a value that divides a 16-step bar. */
const chordsPerBar = (p: VibeProfile) => (p.harmonicRhythm === 2 || p.harmonicRhythm === 4 ? p.harmonicRhythm : 1);

/**
 * How riff and chorus share the song: with both, at least two bars of riff then the chorus twice,
 * each section a whole number of chord loops so the melody always starts on its own chord.
 * With one, it plays throughout.
 */
export function arrange(p: VibeProfile, riff: Hook | null, melody: Hook | null) {
  const loop = Math.ceil(p.progression.length / chordsPerBar(p)) * 16;
  const whole = (steps: number) => Math.ceil(steps / loop) * loop;
  if (riff && melody) return { riffSteps: whole(Math.max(32, riff.steps)), melodySteps: whole(melody.steps * 2) };
  return { riffSteps: riff ? riff.steps : 0, melodySteps: melody ? melody.steps : 0 };
}

/**
 * A chord voiced the way a keyboard player would: the inversion closest to the last chord, so
 * the hands barely move between changes, kept in the warm middle of the keyboard.
 */
export function voiceLead(notes: number[], prev: number[] | null, lo = 52, hi = 76): number[] {
  const pcs = notes.map((n) => ((n % 12) + 12) % 12);
  const candidates: number[][] = [];
  for (let r = 0; r < pcs.length; r++) {
    const order = [...pcs.slice(r), ...pcs.slice(0, r)];
    for (const base of [lo, lo + 12]) {
      const v: number[] = [];
      let n = base + ((order[0] - (base % 12) + 12) % 12);
      v.push(n);
      for (const pc of order.slice(1)) {
        n += ((pc - (n % 12) + 12) % 12) || 12;
        v.push(n);
      }
      if (v[v.length - 1] <= hi) candidates.push(v);
    }
  }
  if (!candidates.length) return notes;
  const score = (v: number[]) =>
    prev && prev.length === v.length ? v.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0) : Math.abs(v.reduce((a, b) => a + b, 0) / v.length - 63);
  return candidates.reduce((best, v) => (score(v) < score(best) ? v : best));
}

export interface LoopSnapshot {
  playing: boolean;
  loop: LoopMeta | null;
  params: BeatParams | null;
  state: PhysioState;
}

interface Master {
  filter: import("tone").Filter;
  reverb: import("tone").Reverb;
  volume: import("tone").Volume;
  /** Low end (bass, kick) skips the darkening filter and the reverb. */
  lowIn: import("tone").ToneAudioNode;
  nodes: Disposable[];
}

/** One song's instruments, on their own buses so a handover can crossfade two songs. */
interface Band {
  high: import("tone").Gain;
  low: import("tone").Gain;
  nodes: Disposable[];
}

/**
 * Plays an endless, original, lyric-free beat in a playlist's style, entirely synthesized in the
 * browser (Tone.js), and reshapes it as the listener's stress state changes. One instance per app.
 *
 * Sound: a gentle master chain (rumble cut, treble shelf, glue compression and a hard ceiling) so
 * nothing is ever harsh; rounded timbres; human timing and dynamics; songs with an intro, phrase
 * fills and breakdowns. A playlist plays as a set: each song glides to the next one's tempo and
 * hands over on the downbeat, crossfading, without the beat ever stopping.
 */
export class VibeEngine {
  private T: ToneNS | null = null;
  private master: Master | null = null;
  private band: Band | null = null;
  private repeatId: number | null = null;
  private profile: VibeProfile | null = null;
  private params: BeatParams | null = null;
  private state: PhysioState = "stable";
  private step = 0;
  private lastNote = 0;
  private songBars = Infinity;
  /** Funk-style 16th-note guitar chops instead of a slow arpeggio. */
  private choppy = false;
  /** The handover to the next song has started (tempo glide). */
  private mixing = false;
  /** A skip asked for while playing: taken on the next downbeat. */
  private pendingSkip = 0;
  /** A song's own drum and bass grids, when it has them. */
  private grooves: { kick: number[] | null; snare: number[] | null; hat: number[] | null; bass: number[] | null } = { kick: null, snare: null, hat: null, bass: null };
  /** A song's own chorus melody, riff, bass line and chord-stab rhythm: what makes it recognisable. */
  private hooks: { melody: Hook | null; riff: Hook | null; bass: Hook | null; comp: number[] | null } = { melody: null, riff: null, bass: null, comp: null };
  /** Riff and chorus take turns like the record: `riffSteps` of riff, then `melodySteps` of chorus. */
  private sections = { riffSteps: 0, melodySteps: 0 };
  /** Drum density at the song's own feel; below it (stress), hits start to drop out. */
  private fullDensity = 1;
  /** Octave the riff's tonic sits in, by instrument. */
  private riffOctave = 4;
  /** The last chord as voiced, so the next one moves as little as possible. */
  private voicing: number[] | null = null;
  playing = false;
  private meta: LoopMeta | null = null;
  private snap: LoopSnapshot = { playing: false, loop: null, params: null, state: "stable" };
  listeners = new Set<() => void>();

  private emit() {
    this.snap = { playing: this.playing, loop: this.meta, params: this.params, state: this.state };
    this.listeners.forEach((l) => l());
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getSnapshot = () => this.snap;

  /** Must be called from a user gesture (browsers only allow audio to start that way). */
  async play(loop: LoopMeta, state: PhysioState) {
    const T = (this.T ??= await import("tone"));
    await T.start();
    this.stop();
    this.state = state;
    this.load(loop);
    const p = this.profile!;
    const params = this.params!;
    this.master = this.buildMaster(T, params);
    this.band = this.buildBand(T, p, this.master, 1);
    const transport = T.getTransport();
    transport.stop();
    transport.cancel();
    transport.bpm.value = params.bpm;
    transport.swing = p.swing;
    transport.swingSubdivision = "16n";
    this.step = 0;
    this.repeatId = transport.scheduleRepeat((time) => this.tick(time), "16n");
    transport.start("+0.1");
    // Arrive gently: fade up from silence and let the filter open over the intro.
    const bar = 240 / params.bpm;
    this.master.volume.volume.rampTo(params.gainDb + TRIM_DB, 2.5);
    this.master.filter.frequency.rampTo(params.cutoffHz, bar * INTRO_BARS);
    this.playing = true;
    this.emit();
  }

  /** Point the engine at a loop: its profile, hooks, grooves and how long it plays in a set. */
  private load(loop: LoopMeta) {
    const profile = loop.profile;
    this.meta = loop;
    this.profile = profile;
    this.params = beatParams(profile, this.state);
    this.hooks = { melody: parseHook(profile.melody), riff: parseHook(profile.riff), bass: parseHook(profile.bassLine), comp: stepGrid(profile.comp) };
    this.sections = arrange(profile, this.hooks.riff, this.hooks.melody);
    // Long enough to sink in, and always a whole number of passes through the chord loop.
    const loopBars = Math.max(1, Math.ceil(profile.progression.length / chordsPerBar(profile)));
    this.songBars = Math.max(16, Math.ceil(SONG_S / (240 / profile.tempoBpm) / loopBars) * loopBars);
    this.grooves = {
      kick: stepGrid(profile.groove?.kick),
      snare: stepGrid(profile.groove?.snare),
      hat: stepGrid(profile.groove?.hat),
      bass: stepGrid(profile.bassRhythm),
    };
    this.fullDensity = beatParams(profile, "stable").drumDensity;
    this.voicing = null;
    this.mixing = false;
    this.pendingSkip = 0;
  }

  /**
   * Jump through a song queue: +1 next, -1 previous. While playing it's a DJ cut — the tempo
   * glides for a bar and the next song comes in on the downbeat. Otherwise it starts playing,
   * which needs a user gesture.
   */
  async skip(by: number) {
    const m = this.meta;
    if (!m?.queue || m.queue.length < 2) return;
    if (this.playing && this.T) {
      this.pendingSkip = by;
      const next = songLoop(m.queue, (m.index ?? 0) + by, { name: m.playlistName, id: m.playlistId });
      const bpm = this.T.getTransport().bpm;
      bpm.rampTo(pulseMatch(bpm.value, beatParams(next.profile, this.state).bpm), 240 / bpm.value);
      return;
    }
    await this.play(songLoop(m.queue, (m.index ?? 0) + by, { name: m.playlistName, id: m.playlistId }), this.state);
  }

  /** The next song takes over on this downbeat: new band fades in as the old one fades out. */
  private handover(by: number, time: number) {
    const T = this.T!;
    const m = this.meta!;
    const master = this.master!;
    const old = this.band;
    this.load(songLoop(m.queue!, (m.index ?? 0) + by, { name: m.playlistName, id: m.playlistId }));
    const p = this.profile!;
    const params = this.params!;
    const transport = T.getTransport();
    // Already glided to the matching pulse; land exactly on the new song's own tempo.
    transport.bpm.setValueAtTime(params.bpm, time);
    transport.swing = p.swing;
    const bar = 240 / params.bpm;
    if (old) {
      old.high.gain.rampTo(0, bar * 1.5, time);
      old.low.gain.rampTo(0, bar * 0.5, time);
      setTimeout(() => old.nodes.forEach((n) => n.dispose()), (bar * 1.5 + 4) * 1000);
    }
    this.band = this.buildBand(T, p, master, 0, time);
    this.band.high.gain.rampTo(1, bar, time);
    this.band.low.gain.rampTo(1, bar * 0.25, time);
    master.filter.frequency.rampTo(params.cutoffHz, bar * 2, time);
    master.reverb.wet.rampTo(params.space * 0.7, bar * 2, time);
    master.volume.volume.rampTo(params.gainDb + TRIM_DB, bar * 2, time);
    this.step = 0;
    this.emit();
  }

  /** Follow the band: changes glide over a few seconds, never jump. */
  setState(state: PhysioState) {
    if (!this.profile || !this.T || state === this.state) return;
    this.state = state;
    this.params = beatParams(this.profile, state);
    this.T.getTransport().bpm.rampTo(this.params.bpm, RAMP_S);
    if (this.master) {
      this.master.filter.frequency.rampTo(this.params.cutoffHz, RAMP_S);
      this.master.volume.volume.rampTo(this.params.gainDb + TRIM_DB, RAMP_S);
      this.master.reverb.wet.rampTo(this.params.space * 0.7, RAMP_S);
    }
    this.emit();
  }

  /** Pause/resume what's loaded (resume needs a user gesture, like play). */
  async toggle() {
    if (this.playing) this.stop();
    else if (this.meta) await this.play(this.meta, this.state);
  }

  /** The loaded Loop was saved (or renamed) in "Your Loops". */
  markSaved(id: string, name: string) {
    if (!this.meta) return;
    this.meta = { ...this.meta, savedId: id, name };
    this.emit();
  }

  /** Stops with a short fade, never a click. */
  stop() {
    if (!this.T) return;
    const transport = this.T.getTransport();
    if (this.repeatId !== null) transport.clear(this.repeatId);
    this.repeatId = null;
    const master = this.master;
    const band = this.band;
    this.master = null;
    this.band = null;
    if (master) {
      master.volume.volume.rampTo(-80, 0.25);
      setTimeout(() => {
        band?.nodes.forEach((n) => n.dispose());
        master.nodes.forEach((n) => n.dispose());
        if (!this.playing) {
          transport.stop();
          transport.cancel();
        }
      }, 320);
    }
    if (this.playing) {
      this.playing = false;
      this.emit();
    }
  }

  get currentParams() {
    return this.params;
  }

  private voices: {
    chords?: import("tone").PolySynth;
    pluck?: import("tone").PluckSynth;
    lead?: import("tone").Synth | import("tone").FMSynth | import("tone").PluckSynth;
    /** Sings the chorus melody. */
    singer?: import("tone").Synth;
    bass?: import("tone").MonoSynth;
    kick?: import("tone").MembraneSynth;
    snare?: import("tone").NoiseSynth;
    /** The snare's drum body under its rattle. */
    snareBody?: import("tone").MembraneSynth;
    hat?: import("tone").NoiseSynth;
    /** Open hat / soft crash at the top of a phrase. */
    openHat?: import("tone").NoiseSynth;
    perc?: import("tone").MembraneSynth;
  } = {};

  /**
   * The master chain, shared by every song in a set:
   * band → stress lowpass → room → rumble cut → treble shelf → glue → ceiling → volume.
   */
  private buildMaster(T: ToneNS, params: BeatParams): Master {
    const nodes: Disposable[] = [];
    const keep = <N extends Disposable>(n: N) => (nodes.push(n), n);
    const volume = keep(new T.Volume(-80)).toDestination();
    const ceiling = keep(new T.Limiter(CEILING_DB)).connect(volume);
    const glue = keep(new T.Compressor({ threshold: -22, ratio: 2.5, attack: 0.02, release: 0.25 })).connect(ceiling);
    // Tame the 4–10 kHz region that makes long listening fatiguing; a touch of warmth below.
    const shelf = keep(new T.EQ3({ low: 1, mid: 0, high: -4.5, lowFrequency: 200, highFrequency: 4200 })).connect(glue);
    const rumble = keep(new T.Filter(32, "highpass", -12)).connect(shelf);
    const reverb = keep(new T.Reverb({ decay: 2.4, preDelay: 0.018, wet: params.space * 0.7 })).connect(rumble);
    const filter = keep(new T.Filter(params.cutoffHz * 0.35, "lowpass", -12)).connect(reverb);
    return { filter, reverb, volume, lowIn: rumble, nodes };
  }

  /** One song's instruments, gentle and rounded, on buses starting at `level`. */
  private buildBand(T: ToneNS, p: VibeProfile, master: Master, level: number, time?: number): Band {
    const nodes: Disposable[] = [];
    const keep = <N extends Disposable>(n: N) => (nodes.push(n), n);
    const high = keep(new T.Gain(level)).connect(master.filter);
    const low = keep(new T.Gain(level)).connect(master.lowIn);
    this.voices = {};

    const pal = new Set(p.palette);
    const guitar = pal.has("acoustic_guitar") || pal.has("sitar") || pal.has("electric_guitar");
    // Chords: the first keys-type instrument in the palette leads (it's ordered by importance).
    const keys = p.palette.find((i) => i === "rhodes" || i === "synth" || i === "pad" || i === "strings" || i === "piano");
    const padLike = keys === "pad" || keys === "strings";
    // Every chord voice goes through its own soft lowpass; pads also get a slow chorus for width.
    const chordTone = keep(new T.Filter(padLike ? 1700 : keys === "synth" ? 2600 : 3400, "lowpass", -24)).connect(high);
    const chordOut = padLike ? keep(new T.Chorus(0.6, 3.5, 0.35).start(time)).connect(chordTone) : chordTone;
    const chordVoice =
      keys === "rhodes"
        ? new T.PolySynth(T.FMSynth, { harmonicity: 3, modulationIndex: 1.1, envelope: { attack: 0.006, decay: 1.4, sustain: 0.25, release: 1.6 }, modulationEnvelope: { attack: 0.002, decay: 0.6, sustain: 0.1, release: 1 } })
        : keys === "synth"
          ? new T.PolySynth(T.Synth, { oscillator: { type: "fattriangle", count: 3, spread: 20 }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.35, release: 0.6 } })
          : padLike
            ? new T.PolySynth(T.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 14 }, envelope: { attack: 0.9, decay: 0.6, sustain: 0.7, release: 2.6 } })
            : // piano: a struck tone that blooms and decays, not a buzzing wave
              new T.PolySynth(T.Synth, { oscillator: { type: "custom", partials: [1, 0.42, 0.2, 0.1, 0.05, 0.025] }, envelope: { attack: 0.004, decay: 1.8, sustain: 0.08, release: 1.3 } });
    chordVoice.volume.value = padLike ? -21 : keys === "synth" ? -22 : -15;
    // A guitar band with no keys (a riff-led rock song) gets no piano laid over it.
    if (keys || !guitar) this.voices.chords = keep(chordVoice).connect(chordOut);
    else chordVoice.dispose();

    // Guitars and sitar: plucked; electric through a gentle amp and a speaker-cabinet rolloff.
    if (guitar) {
      const electric = pal.has("electric_guitar") && !pal.has("acoustic_guitar") && !pal.has("sitar");
      const pluck = new T.PluckSynth({
        attackNoise: pal.has("sitar") ? 2 : electric ? 1.2 : 0.9,
        dampening: pal.has("sitar") ? 4800 : electric ? 4200 : 3000,
        resonance: pal.has("sitar") ? 0.96 : electric ? 0.82 : 0.9,
      });
      pluck.volume.value = electric ? -13 : -11;
      if (electric) {
        const cab = keep(new T.Filter(3000, "lowpass", -24)).connect(high);
        const drive = keep(new T.Distortion(0.12)).connect(cab);
        this.voices.pluck = keep(pluck).connect(drive);
      } else {
        this.voices.pluck = keep(pluck).connect(high);
      }
      this.choppy = electric;
    } else {
      this.choppy = false;
    }

    if (this.hooks.melody) {
      // A soft "ooh" voice: few harmonics, a gentle glide and a slow vibrato, so the chorus reads as
      // the song's vocal line without a buzz.
      const vib = keep(new T.Vibrato(5.2, 0.06)).connect(high);
      const tone = keep(new T.Filter(2000, "lowpass", -12)).connect(vib);
      const singer = new T.Synth({ portamento: 0.05, oscillator: { type: "custom", partials: [1, 0.5, 0.26, 0.14, 0.07, 0.035] }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.8, release: 0.3 } });
      singer.volume.value = -13;
      this.voices.singer = keep(singer).connect(tone);
    }
    if (this.hooks.riff) {
      this.voices.lead = this.riffVoice(T, p, high, keep);
    } else if (this.hooks.melody) {
      // The singer carries the tune; no wandering lead on top of it.
    } else if (pal.has("flute")) {
      const vib = keep(new T.Vibrato(5, 0.1)).connect(high);
      const lead = new T.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.12, decay: 0.3, sustain: 0.6, release: 0.9 } });
      lead.volume.value = -16;
      this.voices.lead = keep(lead).connect(vib);
    } else if (pal.has("bells")) {
      const lead = new T.FMSynth({ harmonicity: 5.1, modulationIndex: 4, envelope: { attack: 0.002, decay: 1.6, sustain: 0, release: 1.6 } });
      lead.volume.value = -24;
      this.voices.lead = keep(lead).connect(high);
    } else {
      const lead = new T.Synth({ oscillator: { type: "custom", partials: [1, 0.3, 0.1] }, envelope: { attack: 0.006, decay: 0.9, sustain: 0.1, release: 1 } });
      lead.volume.value = -18;
      this.voices.lead = keep(lead).connect(high);
    }

    // A played bass line needs a little bite to carry on laptop speakers; a pad-like root doesn't.
    const bass = this.hooks.bass
      ? new T.MonoSynth({ oscillator: { type: "sawtooth" }, filter: { Q: 1, type: "lowpass", rolloff: -24 }, envelope: { attack: 0.006, decay: 0.3, sustain: 0.5, release: 0.18 }, filterEnvelope: { attack: 0.003, decay: 0.2, sustain: 0.3, baseFrequency: 140, octaves: 2.2 } })
      : new T.MonoSynth({ oscillator: { type: "triangle" }, filter: { Q: 0.7, type: "lowpass" }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.6 }, filterEnvelope: { baseFrequency: 110, octaves: 1.5 } });
    bass.volume.value = -12;
    this.voices.bass = keep(bass).connect(low);

    {
      const trap = p.drumFeel === "trap"; // a long, tuned 808
      const kick = new T.MembraneSynth({ pitchDecay: trap ? 0.08 : 0.045, octaves: trap ? 4 : 4.5, envelope: { attack: 0.002, decay: trap ? 0.9 : 0.4, sustain: 0 } });
      kick.volume.value = p.drumFeel === "dholak_groove" ? -14 : -11;
      this.voices.kick = keep(kick).connect(low);
      // Snare: a drum body under a pink-noise rattle, band-limited so it never cracks.
      const snareTone = keep(new T.Filter(1800, "bandpass")).connect(high);
      const snare = new T.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.002, decay: 0.16, sustain: 0 } });
      snare.volume.value = -23;
      this.voices.snare = keep(snare).connect(snareTone);
      const body = new T.MembraneSynth({ pitchDecay: 0.02, octaves: 1.5, envelope: { attack: 0.002, decay: 0.12, sustain: 0 } });
      body.volume.value = -24;
      this.voices.snareBody = keep(body).connect(high);
      // Hats: a narrow band, not the full fizz of white noise.
      const hatTop = keep(new T.Filter(10500, "lowpass", -12)).connect(high);
      const hatBand = keep(new T.Filter(6500, "highpass", -12)).connect(hatTop);
      const hat = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.002, decay: 0.035, sustain: 0 } });
      hat.volume.value = -34;
      this.voices.hat = keep(hat).connect(hatBand);
      const openHat = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.004, decay: 0.45, sustain: 0 } });
      openHat.volume.value = -38;
      this.voices.openHat = keep(openHat).connect(hatBand);
      const perc = new T.MembraneSynth({ pitchDecay: 0.012, octaves: 2, envelope: { attack: 0.002, decay: 0.14, sustain: 0 } });
      perc.volume.value = -18;
      this.voices.perc = keep(perc).connect(high);
    }
    return { high, low, nodes };
  }

  /** The hook's instrument: the palette's lead sound, up front in the mix. */
  private riffVoice(T: ToneNS, p: VibeProfile, out: import("tone").ToneAudioNode, keep: <N extends Disposable>(n: N) => N) {
    const lead = p.palette[0];
    this.riffOctave = lead === "electric_guitar" || lead === "acoustic_guitar" ? 3 : 4;
    if (lead === "electric_guitar") {
      // Crunch, not fuzz: light drive into a speaker-cabinet rolloff.
      const cab = keep(new T.Filter(2800, "lowpass", -24)).connect(out);
      const drive = keep(new T.Distortion(0.28)).connect(cab);
      const v = new T.Synth({ oscillator: { type: "fatsawtooth", count: 2, spread: 10 }, envelope: { attack: 0.005, decay: 0.2, sustain: 0.7, release: 0.15 } });
      v.volume.value = -18;
      return keep(v).connect(drive);
    }
    if (lead === "acoustic_guitar" || lead === "sitar") {
      const v = new T.PluckSynth({ attackNoise: lead === "sitar" ? 2 : 1, dampening: lead === "sitar" ? 4800 : 3800, resonance: 0.95 });
      v.volume.value = -7;
      return keep(v).connect(out);
    }
    if (lead === "flute") {
      const vib = keep(new T.Vibrato(5, 0.09)).connect(out);
      const v = new T.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.06, decay: 0.2, sustain: 0.8, release: 0.3 } });
      v.volume.value = -10;
      return keep(v).connect(vib);
    }
    if (lead === "bells") {
      const v = new T.FMSynth({ harmonicity: 5.1, modulationIndex: 3.5, envelope: { attack: 0.002, decay: 1.2, sustain: 0, release: 1.2 } });
      v.volume.value = -15;
      return keep(v).connect(out);
    }
    if (lead === "synth" || lead === "pad" || lead === "strings") {
      // Rounded: odd harmonics rolled off, not a raw square or saw.
      const tone = keep(new T.Filter(2400, "lowpass", -12)).connect(out);
      const v = new T.Synth({
        oscillator: lead === "synth" ? { type: "custom", partials: [1, 0, 0.3, 0, 0.14, 0, 0.07] } : { type: "fatsawtooth", count: 2, spread: 12 },
        envelope: { attack: lead === "synth" ? 0.008 : 0.06, decay: 0.2, sustain: 0.7, release: 0.3 },
      });
      v.volume.value = lead === "synth" ? -17 : -18;
      return keep(v).connect(tone);
    }
    // piano, rhodes
    const v = new T.Synth({ oscillator: { type: "custom", partials: [1, 0.4, 0.18, 0.08] }, envelope: { attack: 0.004, decay: 0.9, sustain: 0.25, release: 0.5 } });
    v.volume.value = -10;
    return keep(v).connect(out);
  }

  private tick(time: number) {
    const T = this.T!;
    const m = this.meta;
    const queued = (m?.queue?.length ?? 0) > 1;
    // On a downbeat: take a pending skip, or hand over to the next song once this one's had its turn.
    if (this.step % 16 === 0 && queued) {
      const bar = Math.floor(this.step / 16);
      if (this.pendingSkip) this.handover(this.pendingSkip, time);
      else if (bar >= this.songBars) this.handover(1, time);
      else if (bar === this.songBars - MIX_BARS && !this.mixing) this.startMix(time);
    }

    const p = this.profile!;
    const params = this.params!;
    const v = this.voices;
    const s = this.step % 16;
    const bar = Math.floor(this.step / 16);
    const span = 16 / chordsPerBar(p); // steps per chord
    const at = this.step % span; // step within the current chord
    const degree = p.progression[Math.floor(this.step / span) % p.progression.length];
    this.step++;
    const midi = (n: number) => T.Frequency(n, "midi").toFrequency();
    const g = this.grooves;
    const h = this.hooks;
    // Where we are in the riff → chorus cycle.
    const { riffSteps, melodySteps } = this.sections;
    const inCycle = (this.step - 1) % (riffSteps + melodySteps || 1);
    const sixteenth = 15 / T.getTransport().bpm.value;
    // At the song's own feel every hit lands; under stress they start to drop out.
    const thin = Math.min(1, params.drumDensity / this.fullDensity);
    const keeps = (vel: number) => thin >= 0.999 || Math.random() < thin * (0.6 + 0.4 * vel);
    // Players, not a grid: a few milliseconds late and never twice the same strength.
    const late = (t: number, ms = 10) => t + Math.random() * ms * 0.001;
    const human = (vel: number) => Math.min(1, vel * (0.88 + Math.random() * 0.22));
    const chordNotes = (octave: number) => {
      const c = chord(p.key, p.mode, degree, octave);
      return usesSevenths(p) ? c : c.slice(0, 3);
    };
    // Song shape: an intro that arrives, a fill into every 8-bar phrase, a breakdown every 32 bars.
    const intro = bar < INTRO_BARS;
    const phraseEnd = bar % 8 === 7;
    const breakdown = bar >= 24 && bar % 32 >= 24 && bar % 32 < 28;
    const outro = this.mixing;

    // Chords: stabbed in the song's own rhythm, else held on each change with a soft re-hit halfway
    // through a whole-bar chord for busier feels. Voiced close to the last chord.
    const strike = (len: number | string, vel: number) => {
      this.voicing = voiceLead(chordNotes(3), this.voicing);
      v.chords?.triggerAttackRelease(this.voicing.map(midi), len, late(time, 14), human(vel * (intro ? 0.8 : 1)));
    };
    if (h.comp) {
      if (h.comp[s]) strike(this.choppy ? sixteenth * 0.9 : sixteenth * 3, 0.5 * h.comp[s]);
    } else if (at === 0 || (span === 16 && s === 8 && params.drumDensity > 0.5 && p.drumFeel !== "ambient" && !breakdown)) {
      strike(at === 0 ? (span === 16 ? "1m" : "2n") : "2n", at === 0 ? 0.55 : 0.3);
    }
    // Bass: the song's own bass line, its rhythm on the chord root, or root on 1 with a fifth on 3.
    const root = chord(p.key, p.mode, degree, 2)[0];
    if (h.bass) {
      const pos = (this.step - 1) % h.bass.steps;
      for (const n of h.bass.notes) if (n.step === pos) v.bass?.triggerAttackRelease(midi(hookMidi(p.key, p.mode, n, 2)), sixteenth * n.len * 0.9, time, human(0.85));
    } else if (g.bass) {
      if (g.bass[s] && keeps(g.bass[s])) v.bass?.triggerAttackRelease(midi(root), "8n", time, human(0.8 * g.bass[s]));
    } else {
      if (at === 0) v.bass?.triggerAttackRelease(midi(root), "4n", time, human(0.8));
      if (s === 10 && params.drumDensity > 0.3) v.bass?.triggerAttackRelease(midi(root + 7), "8n", time, human(0.55));
    }

    // Guitar: on the song's chord stabs; choppy 16ths on the off-beats for electric, else a plucked
    // arpeggio over the chord. Quiet when a riff carries the song.
    if (v.pluck) {
      const tones = chordNotes(4);
      const play = h.comp ? h.comp[s] > 0 : h.riff && inCycle < riffSteps ? false : this.choppy ? s % 4 === 2 || (s % 4 === 3 && Math.random() < params.drumDensity * 0.5) : s % 4 === 2;
      if (play) v.pluck.triggerAttack(midi(tones[h.comp ? tones.length - 1 : (Math.floor(s / 2) + bar) % tones.length]), late(time));
    }

    // The hooks, note for note: they're what make the song recognisable, so they play at every
    // stress level, just softer as stress rises. Riff and chorus take turns, as on the record.
    const playLine = (line: Hook, pos: number, octave: number, voice: NonNullable<typeof v.lead>, vel: number) => {
      for (const n of line.notes) {
        if (n.step !== pos) continue;
        const note = midi(hookMidi(p.key, p.mode, n, octave));
        if (voice instanceof T.PluckSynth) voice.triggerAttack(note, late(time, 6));
        else voice.triggerAttackRelease(note, sixteenth * n.len * 0.92, late(time, 6), human(vel));
      }
    };
    if (h.riff && v.lead && inCycle < riffSteps) playLine(h.riff, inCycle % h.riff.steps, this.riffOctave, v.lead, 0.45 + 0.4 * thin);
    if (h.melody && v.singer && inCycle >= riffSteps) playLine(h.melody, (inCycle - riffSteps) % h.melody.steps, 4, v.singer, 0.5 + 0.35 * thin);
    if (!h.riff && !h.melody && v.lead && !h.bass && s % 2 === 0 && !intro && Math.random() < params.melodyDensity) {
      // No hook: a sparse, gentle random walk on the pentatonic subset of the scale.
      const sc = scale(p.key, p.mode, 5);
      const penta = p.mode === "major" ? [0, 1, 2, 4, 5] : [0, 2, 3, 4, 6];
      this.lastNote = Math.max(0, Math.min(penta.length - 1, this.lastNote + Math.round((Math.random() - 0.5) * 3)));
      const note = midi(sc[penta[this.lastNote]]);
      if (v.lead instanceof T.PluckSynth) v.lead.triggerAttack(note, late(time));
      else v.lead.triggerAttackRelease(note, "8n", late(time), human(0.5));
    }

    // Drums, thinned by the current density (stress → sparser) and shaped by the song's sections.
    const [baseKick, baseSnare, baseHat, perc] = PATTERNS[p.drumFeel] ?? PATTERNS.lofi;
    const own = g.kick !== null; // the song's own groove: what it leaves out stays out
    const kick = g.kick ?? baseKick;
    const snare = g.snare ?? (own ? SILENT : baseSnare);
    const hat = g.hat ?? (own ? SILENT : baseHat);
    const hasSnare = snare.some((x) => x > 0);
    const hit = (vel: number, floor = 0) => vel > 0 && (keeps(vel) || Math.random() < floor);
    const kickNote = p.drumFeel === "dholak_groove" ? "D2" : p.drumFeel === "trap" ? midi(chord(p.key, p.mode, degree, 1)[0]) : "C1";
    const snareHit = (vel: number) => {
      v.snare?.triggerAttackRelease("16n", late(time, 6), vel);
      v.snareBody?.triggerAttackRelease(190, "16n", late(time, 6), vel * 0.8);
    };

    if (breakdown) {
      // The band drops to a heartbeat for four bars, then comes back.
      if (s % 8 === 0 && kick[s]) v.kick?.triggerAttackRelease(kickNote, "8n", time, kick[s] * 0.8);
      if (hat[s] && s % 4 === 0) v.hat?.triggerAttackRelease("32n", late(time, 6), human(hat[s] * 0.6));
      return;
    }
    if (hit(kick[s], s === 0 ? 0.9 : 0)) v.kick?.triggerAttackRelease(kickNote, "8n", time, kick[s]);
    if (hit(snare[s])) snareHit(human(snare[s]));
    else if (hasSnare && !intro && thin >= 0.999 && s % 2 === 1 && Math.random() < 0.05) snareHit(0.12); // ghost note
    if (hasSnare && phraseEnd && s >= 12 && !intro && thin > 0.5) snareHit([0.3, 0.4, 0.55, 0.75][s - 12]); // fill into the phrase
    // Hats and percussion wait out the first bars of the intro, and thin out as a song hands over.
    const hatsIn = !(intro && bar < 2) && !(outro && s % 4 !== 0);
    if (hatsIn && hit(hat[s])) v.hat?.triggerAttackRelease("32n", late(time, 6), human(hat[s]));
    if (s === 0 && bar > 0 && bar % 8 === 0 && !outro) v.openHat?.triggerAttackRelease("8n", late(time, 6), 0.5);
    if (!intro && hit(perc[s])) v.perc?.triggerAttackRelease(s % 4 === 2 ? "A3" : "E3", "16n", late(time), human(perc[s]));
  }

  /** The last bars of a song in a set: glide to the next one's pulse and let the top end settle. */
  private startMix(time: number) {
    const T = this.T!;
    const m = this.meta!;
    this.mixing = true;
    const next = songLoop(m.queue!, (m.index ?? 0) + 1, { name: m.playlistName, id: m.playlistId });
    const bpm = T.getTransport().bpm;
    const bar = 240 / bpm.value;
    bpm.rampTo(pulseMatch(bpm.value, beatParams(next.profile, this.state).bpm), bar * MIX_BARS, time);
    this.master?.filter.frequency.rampTo((this.params?.cutoffHz ?? 2000) * 0.7, bar * MIX_BARS, time);
  }
}

export const vibeEngine = new VibeEngine();
