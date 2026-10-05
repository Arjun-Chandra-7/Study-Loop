"use client";

import { useSyncExternalStore } from "react";

/**
 * Study beats, synthesized with WebAudio. Each band is a brainwave frequency we reference in the
 * Research tab (theta, alpha, gamma/40 Hz), rendered two ways so it works on any output:
 *  - binaural: a carrier in the left ear and carrier+beat in the right — the *difference* is the
 *    target frequency, heard only on headphones;
 *  - isochronic: the carrier amplitude-pulsed at the beat frequency — audible on speakers too.
 * Several bands can play at once (a "blend"), mixed live. One instance per app.
 *
 * Research is associative, not clinical — see the Research tab. This is a study aid, not therapy.
 */
export type BeatBandId = "theta" | "alpha" | "gamma";

export interface BeatBand {
  id: BeatBandId;
  label: string;
  /** short hint shown under the label */
  sub: string;
  /** the entrainment frequency, Hz (the binaural difference / isochronic pulse rate) */
  beatHz: number;
  /** audible carrier tone, Hz */
  carrierHz: number;
}

export const BEAT_BANDS: BeatBand[] = [
  { id: "theta", label: "Theta", sub: "4–8 Hz · calm", beatHz: 6, carrierHz: 110 },
  { id: "alpha", label: "Alpha", sub: "8–12 Hz · relaxed focus", beatHz: 10, carrierHz: 136 },
  { id: "gamma", label: "40 Hz", sub: "gamma · attention", beatHz: 40, carrierHz: 160 },
];

/** "Focus blend": relaxed-focus alpha under attention-linked 40 Hz — the two we lean on for study. */
export const BLEND: BeatBandId[] = ["alpha", "gamma"];

const MASTER = 0.16;
const FADE_IN = 2.0;
const DEFAULT: BeatBandId[] = ["gamma"];

interface Layer {
  gain: GainNode;
  sources: AudioScheduledSourceNode[];
}

interface BeatsState {
  playing: boolean;
  active: BeatBandId[];
}
const EMPTY: BeatsState = { playing: false, active: [] };

class Beats {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private layers = new Map<BeatBandId, Layer>();
  private state: BeatsState = EMPTY;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  /** Boolean "is anything playing" — kept for existing callers. */
  getSnapshot = () => this.state.playing;
  /** Full state (which bands) for the band selector. */
  getState = () => this.state;

  private emit() {
    this.state = { playing: this.layers.size > 0, active: [...this.layers.keys()] };
    this.listeners.forEach((l) => l());
  }

  private ensure(): AudioContext {
    const ctx = (this.ctx ??= new AudioContext());
    if (!this.master) {
      const m = ctx.createGain();
      m.gain.value = MASTER;
      m.connect(ctx.destination);
      this.master = m;
    }
    return ctx;
  }

  /** One band's binaural + isochronic layer, faded in, feeding its own gain into the master. */
  private build(id: BeatBandId) {
    const band = BEAT_BANDS.find((b) => b.id === id);
    if (!band || !this.ctx || !this.master) return;
    const ctx = this.ctx;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.connect(this.master);

    const tone = (hz: number, pan: number, level: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = level;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      osc.connect(g).connect(p).connect(gain);
      osc.start(now);
      return osc;
    };
    const left = tone(band.carrierHz, -1, 0.5);
    const right = tone(band.carrierHz + band.beatHz, 1, 0.5);

    // Isochronic: a carrier amplitude-modulated at the beat frequency.
    const carrier = ctx.createOscillator();
    carrier.frequency.value = band.carrierHz * 0.75;
    const am = ctx.createGain();
    am.gain.value = 0.175;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = band.beatHz;
    const depth = ctx.createGain();
    depth.gain.value = 0.175;
    lfo.connect(depth).connect(am.gain);
    carrier.connect(am).connect(gain);
    carrier.start(now);
    lfo.start(now);

    this.layers.set(id, { gain, sources: [left, right, carrier, lfo] });
    this.rebalance(FADE_IN);
  }

  /** Keep the combined level roughly constant as bands come and go. */
  private rebalance(fade = 0.4) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const per = 1 / Math.sqrt(Math.max(1, this.layers.size));
    for (const { gain } of this.layers.values()) {
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(per, now + fade);
    }
  }

  private teardown(id: BeatBandId, fade = 0.5) {
    const layer = this.layers.get(id);
    if (!layer || !this.ctx) return;
    const now = this.ctx.currentTime;
    layer.gain.gain.cancelScheduledValues(now);
    layer.gain.gain.setValueAtTime(layer.gain.gain.value, now);
    layer.gain.gain.linearRampToValueAtTime(0, now + fade);
    for (const s of layer.sources) s.stop(now + fade + 0.05);
    const g = layer.gain;
    setTimeout(() => g.disconnect(), (fade + 0.1) * 1000);
    this.layers.delete(id);
  }

  /** Must be called from a user gesture. Starts the given bands (or the current/default ones). */
  async start(ids?: BeatBandId[]) {
    const want = ids && ids.length ? ids : this.state.active.length ? this.state.active : DEFAULT;
    await this.setBands(want);
  }

  /** Make exactly these bands play, adding/removing live. Empty = stop. */
  async setBands(ids: BeatBandId[]) {
    const want = new Set(ids);
    if (want.size === 0) return this.stop();
    const ctx = this.ensure();
    await ctx.resume();
    for (const id of this.layers.keys()) if (!want.has(id)) this.teardown(id);
    for (const id of want) if (!this.layers.has(id)) this.build(id);
    this.rebalance();
    this.emit();
  }

  /** Turn one band on or off, leaving the others as they are. */
  async toggleBand(id: BeatBandId) {
    const next = new Set(this.state.active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    await this.setBands([...next]);
  }

  stop() {
    if (!this.ctx || !this.master) {
      if (this.layers.size) this.emit();
      return;
    }
    const now = this.ctx.currentTime;
    for (const id of [...this.layers.keys()]) this.teardown(id, 0.6);
    void now;
    this.emit();
  }

  async toggle() {
    if (this.state.playing) this.stop();
    else await this.start();
  }
}

export const beats = new Beats();
/** Back-compat alias: the old 40 Hz-only engine is now the general beats engine. */
export const gammaBeats = beats;

export function useGammaBeats() {
  return useSyncExternalStore(beats.subscribe, beats.getSnapshot, () => false);
}

export function useBeats(): BeatsState {
  return useSyncExternalStore(beats.subscribe, beats.getState, () => EMPTY);
}
