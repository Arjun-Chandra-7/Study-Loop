"use client";

import type { PhysioState } from "../../sensors/classify";
import { beatParams, chord, scale, stepGrid, type BeatParams, type VibeProfile } from "./profile";
import type { SongBeat } from "./songs";

type ToneNS = typeof import("tone");
type Pattern = (number | 0)[]; // 16 steps, values are velocities 0–1

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

const RAMP_S = 6;
/** Each song in a queue plays for about this long before the next one comes in. */
const SONG_S = 90;

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
}

/** The Loop for song `i` of a queue. */
export function songLoop(queue: SongBeat[], i: number, playlistName: string | null = "Your songs"): LoopMeta {
  const n = ((i % queue.length) + queue.length) % queue.length;
  const song = queue[n];
  return { name: song.title, playlistName, profile: song.profile, queue, index: n };
}

/** Chords per bar, kept to a value that divides a 16-step bar. */
const chordsPerBar = (p: VibeProfile) => (p.harmonicRhythm === 2 || p.harmonicRhythm === 4 ? p.harmonicRhythm : 1);

export interface LoopSnapshot {
  playing: boolean;
  loop: LoopMeta | null;
  params: BeatParams | null;
  state: PhysioState;
}

/**
 * Plays an endless, original, lyric-free beat in a playlist's style, entirely synthesized in the
 * browser (Tone.js), and reshapes it as the listener's stress state changes. One instance per app.
 */
export class VibeEngine {
  private T: ToneNS | null = null;
  private nodes: { dispose(): void }[] = [];
  private repeatId: number | null = null;
  private profile: VibeProfile | null = null;
  private params: BeatParams | null = null;
  private state: PhysioState = "stable";
  private step = 0;
  private lastNote = 0;
  private songBars = Infinity;
  /** Funk-style 16th-note guitar chops instead of a slow arpeggio. */
  private choppy = false;
  private advancing = false;
  /** A song's own drum and bass grids, when it has them. */
  private grooves: { kick: number[] | null; snare: number[] | null; hat: number[] | null; bass: number[] | null } = { kick: null, snare: null, hat: null, bass: null };
  private master: { filter: import("tone").Filter; reverb: import("tone").Freeverb; volume: import("tone").Volume } | null = null;
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
    const profile = loop.profile;
    const T = (this.T ??= await import("tone"));
    await T.start();
    this.stop();
    this.meta = loop;
    this.profile = profile;
    this.state = state;
    this.params = beatParams(profile, state);
    this.build(T, profile, this.params);
    const transport = T.getTransport();
    transport.bpm.value = this.params.bpm;
    transport.swing = profile.swing;
    transport.swingSubdivision = "16n";
    this.step = 0;
    this.advancing = false;
    // Long enough to sink in, and always a whole number of passes through the chord loop.
    const loopBars = Math.max(1, Math.ceil(profile.progression.length / chordsPerBar(profile)));
    this.songBars = Math.max(16, Math.ceil(SONG_S / (240 / profile.tempoBpm) / loopBars) * loopBars);
    this.grooves = {
      kick: stepGrid(profile.groove?.kick),
      snare: stepGrid(profile.groove?.snare),
      hat: stepGrid(profile.groove?.hat),
      bass: stepGrid(profile.bassRhythm),
    };
    this.repeatId = transport.scheduleRepeat((time) => this.tick(time), "16n");
    transport.start("+0.1");
    this.playing = true;
    this.emit();
  }

  /** Jump through a song queue: +1 next, -1 previous. Needs a user gesture if nothing is playing. */
  async skip(by: number) {
    const m = this.meta;
    if (!m?.queue || m.queue.length < 2) return;
    await this.play(songLoop(m.queue, (m.index ?? 0) + by, m.playlistName), this.state);
  }

  /** The current song has had its turn: fade it out and bring in the next. */
  private advance() {
    if (this.advancing) return;
    this.advancing = true;
    this.master?.volume.volume.rampTo(-48, 1.2);
    setTimeout(() => {
      if (this.playing) void this.skip(1);
    }, 1300);
  }

  /** Follow the band: changes glide over a few seconds, never jump. */
  setState(state: PhysioState) {
    if (!this.profile || !this.T || state === this.state) return;
    this.state = state;
    this.params = beatParams(this.profile, state);
    this.T.getTransport().bpm.rampTo(this.params.bpm, RAMP_S);
    if (this.master) {
      this.master.filter.frequency.rampTo(this.params.cutoffHz, RAMP_S);
      this.master.volume.volume.rampTo(this.params.gainDb, RAMP_S);
      this.master.reverb.wet.rampTo(this.params.space, RAMP_S);
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

  stop() {
    if (!this.T) return;
    const transport = this.T.getTransport();
    if (this.repeatId !== null) transport.clear(this.repeatId);
    this.repeatId = null;
    transport.stop();
    transport.cancel();
    this.nodes.forEach((n) => n.dispose());
    this.nodes = [];
    this.master = null;
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
    bass?: import("tone").MonoSynth;
    kick?: import("tone").MembraneSynth;
    snare?: import("tone").NoiseSynth;
    hat?: import("tone").NoiseSynth;
    perc?: import("tone").MembraneSynth;
  } = {};

  private build(T: ToneNS, p: VibeProfile, params: BeatParams) {
    const keep = <N extends { dispose(): void }>(n: N) => (this.nodes.push(n), n);
    this.voices = {};
    const volume = keep(new T.Volume(params.gainDb)).toDestination();
    const comp = keep(new T.Compressor(-20, 3)).connect(volume);
    const reverb = keep(new T.Freeverb({ roomSize: 0.82, dampening: 2600, wet: params.space })).connect(comp);
    const filter = keep(new T.Filter(params.cutoffHz, "lowpass", -12)).connect(reverb);
    this.master = { filter, reverb, volume };

    const pal = new Set(p.palette);
    // Chords: the first keys-type instrument in the palette leads (it's ordered by importance).
    const keys = p.palette.find((i) => i === "rhodes" || i === "synth" || i === "pad" || i === "strings" || i === "piano");
    const chordVoice =
      keys === "rhodes"
        ? new T.PolySynth(T.FMSynth, { harmonicity: 3, modulationIndex: 1.6, envelope: { attack: 0.01, decay: 1.2, sustain: 0.25, release: 1.6 } })
        : keys === "synth"
          ? new T.PolySynth(T.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 24 }, envelope: { attack: 0.01, decay: 0.35, sustain: 0.35, release: 0.5 } })
          : keys === "pad" || keys === "strings"
            ? new T.PolySynth(T.Synth, { oscillator: { type: "fatsawtooth", count: 3, spread: 18 }, envelope: { attack: 0.8, decay: 0.5, sustain: 0.7, release: 2.5 } })
            : new T.PolySynth(T.Synth, { oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 1.4, sustain: 0.15, release: 1.4 } });
    chordVoice.volume.value = keys === "pad" || keys === "strings" ? -20 : keys === "synth" ? -21 : -14;
    this.voices.chords = keep(chordVoice).connect(filter);

    // Guitars and sitar: plucked; electric guitar brighter, choppier and a little driven.
    if (pal.has("acoustic_guitar") || pal.has("sitar") || pal.has("electric_guitar")) {
      const electric = pal.has("electric_guitar") && !pal.has("acoustic_guitar") && !pal.has("sitar");
      const pluck = new T.PluckSynth({
        attackNoise: pal.has("sitar") ? 2.5 : electric ? 1.6 : 1,
        dampening: pal.has("sitar") ? 5200 : electric ? 6400 : 3200,
        resonance: pal.has("sitar") ? 0.97 : electric ? 0.8 : 0.9,
      });
      pluck.volume.value = electric ? -12 : -10;
      if (electric) {
        const drive = keep(new T.Distortion(0.25)).connect(filter);
        this.voices.pluck = keep(pluck).connect(drive);
      } else {
        this.voices.pluck = keep(pluck).connect(filter);
      }
      this.choppy = electric;
    } else {
      this.choppy = false;
    }

    // Sparse lead: flute (sine + vibrato), bells (FM), else soft piano.
    if (pal.has("flute")) {
      const vib = keep(new T.Vibrato(5, 0.12)).connect(filter);
      const lead = new T.Synth({ oscillator: { type: "sine" }, envelope: { attack: 0.12, decay: 0.3, sustain: 0.6, release: 0.9 } });
      lead.volume.value = -16;
      this.voices.lead = keep(lead).connect(vib);
    } else if (pal.has("bells")) {
      const lead = new T.FMSynth({ harmonicity: 5.1, modulationIndex: 8, envelope: { attack: 0.001, decay: 1.6, sustain: 0, release: 1.6 } });
      lead.volume.value = -22;
      this.voices.lead = keep(lead).connect(filter);
    } else {
      const lead = new T.Synth({ oscillator: { type: "triangle" }, envelope: { attack: 0.005, decay: 0.9, sustain: 0.1, release: 1 } });
      lead.volume.value = -18;
      this.voices.lead = keep(lead).connect(filter);
    }

    const bass = new T.MonoSynth({ oscillator: { type: "sine" }, filter: { Q: 1, type: "lowpass" }, envelope: { attack: 0.02, decay: 0.4, sustain: 0.6, release: 0.6 }, filterEnvelope: { baseFrequency: 120, octaves: 1.5 } });
    bass.volume.value = -12;
    this.voices.bass = keep(bass).connect(comp); // keep the low end out of the darkening filter

    {
      const trap = p.drumFeel === "trap"; // a long, tuned 808
      const kick = new T.MembraneSynth({ pitchDecay: trap ? 0.08 : 0.04, octaves: trap ? 4 : 6, envelope: { attack: 0.001, decay: trap ? 0.9 : 0.38, sustain: 0 } });
      kick.volume.value = p.drumFeel === "dholak_groove" ? -14 : -10;
      this.voices.kick = keep(kick).connect(comp);
      const snareFilter = keep(new T.Filter(2200, "bandpass")).connect(filter);
      const snare = new T.NoiseSynth({ noise: { type: "pink" }, envelope: { attack: 0.001, decay: 0.18, sustain: 0 } });
      snare.volume.value = -20;
      this.voices.snare = keep(snare).connect(snareFilter);
      const hatFilter = keep(new T.Filter(7000, "highpass")).connect(filter);
      const hat = new T.NoiseSynth({ noise: { type: "white" }, envelope: { attack: 0.001, decay: 0.045, sustain: 0 } });
      hat.volume.value = -30;
      this.voices.hat = keep(hat).connect(hatFilter);
      const perc = new T.MembraneSynth({ pitchDecay: 0.012, octaves: 2, envelope: { attack: 0.001, decay: 0.14, sustain: 0 } });
      perc.volume.value = -17;
      this.voices.perc = keep(perc).connect(filter);
    }
  }

  private tick(time: number) {
    const T = this.T!;
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

    // A queued song has had its turn: hand over to the next one on a bar line.
    if (s === 0 && bar >= this.songBars && (this.meta?.queue?.length ?? 0) > 1) this.advance();

    // Chords on each change, with a soft re-hit halfway through a whole-bar chord for busier feels.
    if (at === 0 || (span === 16 && s === 8 && params.drumDensity > 0.5 && p.drumFeel !== "ambient")) {
      v.chords?.triggerAttackRelease(chord(p.key, p.mode, degree, 3).map(midi), at === 0 ? (span === 16 ? "1m" : "2n") : "2n", time, at === 0 ? 0.55 : 0.3);
    }
    // Bass: the song's own rhythm on the chord root, or root on 1 with a fifth on 3.
    const root = chord(p.key, p.mode, degree, 2)[0];
    if (g.bass) {
      if (g.bass[s] && Math.random() < Math.max(0.5, params.drumDensity + 0.2)) v.bass?.triggerAttackRelease(midi(root), "8n", time, 0.8 * g.bass[s]);
    } else {
      if (at === 0) v.bass?.triggerAttackRelease(midi(root), "4n", time, 0.8);
      if (s === 10 && params.drumDensity > 0.3) v.bass?.triggerAttackRelease(midi(root + 7), "8n", time, 0.55);
    }

    // Guitar: choppy 16ths on the off-beats for electric, else a plucked arpeggio over the chord.
    if (v.pluck) {
      const tones = chord(p.key, p.mode, degree, 4);
      if (this.choppy ? s % 4 === 2 || (s % 4 === 3 && Math.random() < params.drumDensity * 0.5) : s % 4 === 2) {
        v.pluck.triggerAttack(midi(tones[(Math.floor(s / 2) + bar) % tones.length]), time);
      }
    }

    // Sparse lead: a gentle random walk on the pentatonic subset of the scale.
    if (v.lead && s % 2 === 0 && Math.random() < params.melodyDensity) {
      const sc = scale(p.key, p.mode, 5);
      const penta = p.mode === "major" ? [0, 1, 2, 4, 5] : [0, 2, 3, 4, 6];
      this.lastNote = Math.max(0, Math.min(penta.length - 1, this.lastNote + Math.round((Math.random() - 0.5) * 3)));
      const note = midi(sc[penta[this.lastNote]]);
      if (v.lead instanceof T.PluckSynth) v.lead.triggerAttack(note, time);
      else v.lead.triggerAttackRelease(note, "8n", time, 0.5);
    }

    // Drums, thinned by the current density (stress → sparser).
    const [baseKick, baseSnare, baseHat, perc] = PATTERNS[p.drumFeel] ?? PATTERNS.lofi;
    const kick = g.kick ?? baseKick;
    const snare = g.snare ?? baseSnare;
    const hat = g.hat ?? baseHat;
    const hit = (vel: number, floor = 0) => vel > 0 && Math.random() < Math.max(floor, params.drumDensity) * (0.6 + 0.4 * vel);
    const kickNote = p.drumFeel === "dholak_groove" ? "D2" : p.drumFeel === "trap" ? midi(chord(p.key, p.mode, degree, 1)[0]) : "C1";
    if (hit(kick[s], s === 0 ? 0.9 : 0)) v.kick?.triggerAttackRelease(kickNote, "8n", time, kick[s]);
    if (hit(snare[s])) v.snare?.triggerAttackRelease("16n", time, snare[s]);
    if (hit(hat[s])) v.hat?.triggerAttackRelease("32n", time, hat[s]);
    if (hit(perc[s])) v.perc?.triggerAttackRelease(s % 4 === 2 ? "A3" : "E3", "16n", time, perc[s]);
  }
}

export const vibeEngine = new VibeEngine();
