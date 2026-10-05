import { describe, expect, it } from "vitest";
import { hookFields, hookMidi, parseHook, type VibeProfile } from "../vibe/profile";
import { DEMO_SONGS } from "../vibe/songs";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
/** A hook's notes as note names with octaves, e.g. "E2". */
const names = (p: VibeProfile, line: string, octave: number) =>
  parseHook(line)!.notes.map((n) => {
    const m = hookMidi(p.key, p.mode, n, octave);
    return NAMES[m % 12] + (Math.floor(m / 12) - 1);
  });
const song = (title: string) => DEMO_SONGS.find((s) => s.title === title)!.profile;

describe("hooks", () => {
  it("reads degrees, accidentals, octave marks, lengths and rests", () => {
    expect(parseHook("1:6 r:2 b3':4 #4,:4")).toEqual({
      notes: [
        { step: 0, len: 6, degree: 1, shift: 0, octave: 0 },
        { step: 8, len: 4, degree: 3, shift: -1, octave: 1 },
        { step: 12, len: 4, degree: 4, shift: 1, octave: -1 },
      ],
      steps: 16,
    });
    expect(parseHook("1:4 5:4 1:4")?.steps).toBe(16); // rounded up to whole bars
  });

  it("rejects what isn't a hook", () => {
    expect(parseHook("")).toBeNull();
    expect(parseHook("1:4")).toBeNull(); // one note
    expect(parseHook("1:4 8:4")).toBeNull(); // no 8th degree
    expect(parseHook("E:4 G:4")).toBeNull(); // note names, not degrees
    expect(parseHook(Array(40).fill("1:4").join(" "))).toBeNull(); // over 8 bars
    expect(hookFields({ riff: "C D E", bass: "1:8 5,:8", comp: "x.x.", sevenths: "no" })).toEqual({ bassLine: "1:8 5,:8", comp: "x.x." });
  });

  it("plays the demo songs' real riffs", () => {
    expect(names(song("Seven Nation Army"), song("Seven Nation Army").riff!, 3)).toEqual(["E3", "E3", "G3", "E3", "D3", "C3", "B2"]);
    expect(names(song("Billie Jean"), song("Billie Jean").bassLine!, 2)).toEqual(["F#2", "C#2", "E2", "F#2", "E2", "C#2", "B1", "C#2"]);
    expect(names(song("Stand By Me"), song("Stand By Me").bassLine!, 2).slice(0, 16)).toEqual(
      ["A2", "A2", "C#3", "E3", "F#3", "E3", "C#3", "B2", "F#2", "F#2", "A2", "C#3", "D3", "C#3", "A2", "G#2"],
    );
  });

  it("lines every demo hook up with its chord loop", () => {
    for (const { title, profile: p } of DEMO_SONGS) {
      const loopSteps = (p.progression.length / (p.harmonicRhythm ?? 1)) * 16;
      for (const line of [p.riff, p.bassLine].filter(Boolean)) {
        const steps = parseHook(line)!.steps;
        expect(loopSteps % steps === 0 || steps % loopSteps === 0, `${title}: ${steps} vs ${loopSteps}`).toBe(true);
      }
    }
  });
});
