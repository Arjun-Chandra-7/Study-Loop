import { describe, expect, it } from "vitest";
import { arrangeOrder, arrangeSongs, camelot, keyDistance, pulseMatch, tempoDistance, transitionCost } from "../vibe/arrange";
import type { VibeProfile } from "../vibe/profile";
import { DEMO_SONGS, type SongBeat } from "../vibe/songs";

const p = (over: Partial<VibeProfile>): VibeProfile => ({
  summary: "",
  moods: [],
  tempoBpm: 100,
  key: "C",
  mode: "major",
  progression: [1, 5, 6, 4],
  drumFeel: "lofi",
  palette: ["piano"],
  energy: 0.5,
  warmth: 0.5,
  swing: 0,
  ...over,
});
const song = (title: string, over: Partial<VibeProfile>): SongBeat => ({ query: title, source: "ai", title, artist: "", known: true, profile: p(over) });

describe("the Camelot wheel", () => {
  it("places keys where DJs expect them", () => {
    expect(camelot("C", "major")).toEqual({ hour: 8, letter: "B" });
    expect(camelot("A", "minor")).toEqual({ hour: 8, letter: "A" });
    expect(camelot("G", "major")).toEqual({ hour: 9, letter: "B" });
    expect(camelot("B", "major")).toEqual({ hour: 1, letter: "B" });
    expect(camelot("F#", "minor")).toEqual({ hour: 11, letter: "A" });
    expect(camelot("D", "minor")).toEqual({ hour: 7, letter: "A" });
  });

  it("treats same key, ±1 hour and relative major/minor as compatible", () => {
    const c = camelot("C", "major");
    expect(keyDistance(c, camelot("C", "major"))).toBe(0);
    expect(keyDistance(c, camelot("G", "major"))).toBe(1);
    expect(keyDistance(c, camelot("F", "major"))).toBe(1);
    expect(keyDistance(c, camelot("A", "minor"))).toBe(1);
    expect(keyDistance(c, camelot("F#", "major"))).toBeGreaterThanOrEqual(3); // the tritone clashes
  });
});

describe("tempo", () => {
  it("counts half- and double-time as the same pulse", () => {
    expect(tempoDistance(70, 140)).toBeCloseTo(0);
    expect(tempoDistance(100, 106)).toBeCloseTo(1, 1);
    expect(pulseMatch(72, 140)).toBe(70);
    expect(pulseMatch(118, 116)).toBe(116);
  });
});

describe("arranging a playlist", () => {
  it("chains compatible keys and close tempos instead of jumping around", () => {
    const songs = [
      song("a", { key: "C", tempoBpm: 100, energy: 0.3 }),
      song("tritone", { key: "F#", tempoBpm: 128, energy: 0.8, drumFeel: "four_on_floor" }),
      song("b", { key: "G", tempoBpm: 102, energy: 0.45 }),
      song("c", { key: "D", tempoBpm: 105, energy: 0.6 }),
      song("d", { key: "A", tempoBpm: 104, energy: 0.45 }),
    ];
    const order = arrangeOrder(songs.map((s) => s.profile)).map((i) => songs[i].title);
    // The out-of-key, faster song can't sit in the middle of the smooth chain.
    const t = order.indexOf("tritone");
    expect(t === 0 || t === order.length - 1).toBe(true);
    const ordered = order.map((n) => songs.find((s) => s.title === n)!.profile);
    const chain = ordered.filter((s) => s.drumFeel === "lofi");
    for (let i = 1; i < chain.length; i++) expect(keyDistance(camelot(chain[i - 1].key, "major"), camelot(chain[i].key, "major"))).toBeLessThanOrEqual(1);
  });

  it("is cheaper than the playlist's own order for the demo set", () => {
    const profiles = DEMO_SONGS.map((s) => s.profile);
    const cost = (o: number[]) => o.slice(1).reduce((c, j, i) => c + transitionCost(profiles[o[i]], profiles[j]), 0);
    expect(cost(arrangeOrder(profiles))).toBeLessThan(cost(profiles.map((_, i) => i)));
  });

  it("keeps every song exactly once", () => {
    const out = arrangeSongs(DEMO_SONGS);
    expect(out.map((s) => s.query).sort()).toEqual(DEMO_SONGS.map((s) => s.query).sort());
  });

  it("moves a clashing song by a semitone at most, onto a compatible key", () => {
    const out = arrangeSongs([song("x", { key: "C", energy: 0.4 }), song("y", { key: "C#", energy: 0.5 }), song("z", { key: "C", energy: 0.45 })]);
    for (const s of out) expect(Math.abs(s.keyShift)).toBeLessThanOrEqual(1);
    for (let i = 1; i < out.length; i++) {
      const a = out[i - 1].profile;
      const b = out[i].profile;
      if (out[i].keyShift) expect(keyDistance(camelot(a.key, a.mode), camelot(b.key, b.mode))).toBeLessThanOrEqual(1);
    }
  });
});
