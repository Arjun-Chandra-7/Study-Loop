"use client";

import { useSyncExternalStore } from "react";

const BEAT_HZ = 40;
const LEFT_HZ = 200;
const LEVEL = 0.16;
const FADE_S = 2.5;

/**
 * 40 Hz study beats, synthesized with WebAudio. Two layers so it works on any output:
 *  - binaural: 200 Hz left, 240 Hz right — the 40 Hz difference is heard on headphones;
 *  - isochronic: a soft 160 Hz tone pulsed 40 times a second — audible on speakers too.
 * Placeholder for the fuller beats system; one instance per app.
 */
class GammaBeats {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sources: AudioScheduledSourceNode[] = [];
  private playing = false;
  private listeners = new Set<() => void>();

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  getSnapshot = () => this.playing;

  private set(playing: boolean) {
    this.playing = playing;
    this.listeners.forEach((l) => l());
  }

  /** Must be called from a user gesture (browsers only start audio that way). */
  async start() {
    if (this.playing) return;
    const ctx = (this.ctx ??= new AudioContext());
    await ctx.resume();
    const now = ctx.currentTime;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, now);
    master.gain.linearRampToValueAtTime(LEVEL, now + FADE_S);
    master.connect(ctx.destination);

    const tone = (hz: number, pan: number, level: number) => {
      const osc = ctx.createOscillator();
      osc.frequency.value = hz;
      const g = ctx.createGain();
      g.gain.value = level;
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      osc.connect(g).connect(p).connect(master);
      osc.start(now);
      return osc;
    };
    const left = tone(LEFT_HZ, -1, 0.5);
    const right = tone(LEFT_HZ + BEAT_HZ, 1, 0.5);

    // Isochronic layer: amplitude-modulate a carrier at 40 Hz (gain swings 0 → 0.35).
    const carrier = ctx.createOscillator();
    carrier.frequency.value = 160;
    const am = ctx.createGain();
    am.gain.value = 0.175;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = BEAT_HZ;
    const depth = ctx.createGain();
    depth.gain.value = 0.175;
    lfo.connect(depth).connect(am.gain);
    carrier.connect(am).connect(master);
    carrier.start(now);
    lfo.start(now);

    this.master = master;
    this.sources = [left, right, carrier, lfo];
    this.set(true);
  }

  stop() {
    if (!this.playing || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const master = this.master;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 0.8);
    for (const s of this.sources) s.stop(now + 0.85);
    setTimeout(() => master.disconnect(), 1000);
    this.sources = [];
    this.master = null;
    this.set(false);
  }

  async toggle() {
    if (this.playing) this.stop();
    else await this.start();
  }
}

export const gammaBeats = new GammaBeats();

export function useGammaBeats() {
  return useSyncExternalStore(gammaBeats.subscribe, gammaBeats.getSnapshot, () => false);
}
