// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudyLoopEngine, dateLabelFor } from "../engine";

/** A page load: a fresh engine that knows who's signed in. */
function load(uid = "u1") {
  const e = new StudyLoopEngine();
  e.start();
  e.attachUser(uid);
  return e;
}
const real = (e: StudyLoopEngine) => e.getSnapshot().summaries.filter((s) => !s.isSample);

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("sessions survive a reload", () => {
  it("keeps finished sessions", () => {
    const a = load();
    a.beginSession();
    vi.advanceTimersByTime(65_000);
    a.end();
    expect(real(a)).toHaveLength(1);

    const b = load();
    expect(real(b)).toHaveLength(1);
    expect(real(b)[0].minutes).toBe(1);
    expect(b.getSnapshot().recovery).toBeNull();
  });

  it("a session running at reload asks to continue, and Continue picks up the timer", () => {
    const a = load();
    a.beginSession();
    a.mark();
    vi.advanceTimersByTime(10_000);
    // The tab dies here: no clean shutdown, only the periodic save has run.

    const b = load();
    const r = b.getSnapshot().recovery;
    expect(r?.phase).toBe("active");
    expect(r!.elapsedMs).toBeGreaterThanOrEqual(6_000);
    expect(b.getSnapshot().session.phase).toBe("idle");

    b.resumeRecovered();
    const s = b.getSnapshot().session;
    expect(b.getSnapshot().recovery).toBeNull();
    expect(s.phase).toBe("active");
    expect(s.elapsedMs).toBe(r!.elapsedMs);
    expect(s.events.filter((x) => x.kind === "mark")).toHaveLength(1);
    expect(b.getSnapshot().tab).toBe("session");
  });

  it("reloading again before answering still offers the session", () => {
    const a = load();
    a.beginSession();
    vi.advanceTimersByTime(8_000);
    load(); // reload, ignore the popup
    vi.advanceTimersByTime(8_000);
    expect(load().getSnapshot().recovery?.phase).toBe("active");
  });

  it("End & save turns the interrupted session into a finished one", () => {
    const a = load();
    a.beginSession();
    vi.advanceTimersByTime(90_000);
    const b = load();
    b.endRecovered();
    expect(b.getSnapshot().recovery).toBeNull();
    expect(real(b)).toHaveLength(1);
    expect(b.getSnapshot().tab).toBe("insights");
    expect(load().getSnapshot().recovery).toBeNull();
  });

  it("Discard forgets it for good", () => {
    const a = load();
    a.beginSession();
    vi.advanceTimersByTime(8_000);
    const b = load();
    b.discardRecovered();
    expect(load().getSnapshot().recovery).toBeNull();
    expect(real(load())).toHaveLength(0);
  });

  it("is kept per person", () => {
    const a = load("alice");
    a.beginSession();
    vi.advanceTimersByTime(65_000);
    a.end();
    expect(real(load("bob"))).toHaveLength(0);
    expect(real(load("alice"))).toHaveLength(1);
  });
});

describe("dateLabelFor", () => {
  it("says Today, Yesterday, then a date", () => {
    const now = new Date(2026, 9, 2, 15).getTime();
    expect(dateLabelFor(new Date(2026, 9, 2, 9).getTime(), now)).toBe("Today");
    expect(dateLabelFor(new Date(2026, 9, 1, 22).getTime(), now)).toBe("Yesterday");
    expect(dateLabelFor(new Date(2026, 8, 20, 22).getTime(), now)).not.toMatch(/Today|Yesterday/);
  });
});
