import { describe, expect, it, vi } from "vitest";
import { DEMO_SONGS } from "../vibe/songs";

/** A stand-in for Tone.js that records every note it's asked to play, as MIDI numbers. */
vi.mock("tone", () => {
  const param = () => ({ value: 0, rampTo() {} });
  class Node {
    played: { note: number; step: number }[] = [];
    volume = param();
    wet = param();
    frequency = param();
    connect() {
      return this;
    }
    toDestination() {
      return this;
    }
    dispose() {}
    /** Chords record each note; named notes ("C1") and noise hits record as -1. */
    triggerAttackRelease(note: unknown) {
      for (const n of Array.isArray(note) ? note : [note]) this.played.push({ note: typeof n === "number" ? n : -1, step: clock.step });
    }
    triggerAttack(note: unknown) {
      this.triggerAttackRelease(note);
    }
  }
  const clock = { step: 0, tick: (() => {}) as (time: number) => void };
  const transport = {
    bpm: param(),
    swing: 0,
    swingSubdivision: "16n",
    scheduleRepeat(cb: (t: number) => void) {
      clock.tick = cb;
      return 1;
    },
    start() {},
    stop() {},
    cancel() {},
    clear() {},
  };
  transport.bpm.value = 120;
  const names = ["Volume", "Compressor", "Freeverb", "Filter", "PolySynth", "Synth", "FMSynth", "PluckSynth", "MonoSynth", "MembraneSynth", "NoiseSynth", "Distortion", "Vibrato"];
  return {
    ...Object.fromEntries(names.map((n) => [n, class extends Node {}])),
    clock,
    start: async () => {},
    getTransport: () => transport,
    Frequency: (n: number) => ({ toFrequency: () => n }),
  };
});

type Voice = { played: { note: number; step: number }[] };

/** Play a demo song for `bars` bars; what each voice played. */
async function play(title: string, bars: number) {
  const tone = (await import("tone")) as unknown as { clock: { step: number; tick: (t: number) => void } };
  const { VibeEngine } = await import("../vibe/engine");
  const engine = new VibeEngine();
  const song = DEMO_SONGS.find((s) => s.title === title)!;
  await engine.play({ name: song.title, playlistName: null, profile: song.profile }, "stable");
  for (tone.clock.step = 0; tone.clock.step < bars * 16; tone.clock.step++) tone.clock.tick(0);
  return (engine as unknown as { voices: Record<string, Voice | undefined> }).voices;
}

describe("the beat engine", () => {
  it("plays Seven Nation Army's riff on the beat, over the bass, with no piano on top", async () => {
    const v = await play("Seven Nation Army", 4);
    // E3 E3 G3 E3 D3 C3 B2
    const riff = [[52, 0], [52, 6], [55, 8], [52, 11], [50, 14], [48, 16], [47, 24]];
    expect(v.lead!.played.slice(0, 7).map((n) => [n.note, n.step])).toEqual(riff);
    expect(v.lead!.played.slice(7, 14).map((n) => [n.note, n.step])).toEqual(riff.map(([m, s]) => [m, s + 32])); // and again
    expect(v.bass!.played.slice(0, 7).map((n) => n.note)).toEqual([40, 40, 43, 40, 38, 36, 35]); // E2 E2 G2 E2 D2 C2 B1
    expect(v.chords).toBeUndefined();
    expect(v.kick!.played.map((n) => n.step)).toEqual([0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60]); // every beat, none dropped
    expect(v.snare!.played).toEqual([]);
  });

  it("plays Billie Jean's bass line in eighths, every bar", async () => {
    const v = await play("Billie Jean", 2);
    expect(v.bass!.played.map((n) => n.note)).toEqual([42, 37, 40, 42, 40, 37, 35, 37, 42, 37, 40, 42, 40, 37, 35, 37]);
    expect(v.bass!.played.map((n) => n.step)).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30]);
  });

  it("stabs Let It Be's chords as plain triads on the beat", async () => {
    const v = await play("Let It Be", 1);
    expect(v.chords!.played.map((n) => n.step)).toEqual([0, 0, 0, 4, 4, 4, 8, 8, 8, 12, 12, 12]); // C, C, G, G
  });
});
