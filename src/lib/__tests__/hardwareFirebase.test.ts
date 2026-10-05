import { afterEach, describe, expect, it, vi } from "vitest";
import { FirebaseSensorProvider, latestEntry, pathFor, pick } from "../sensors/firebase";
import type { SensorReading } from "../sensors/types";

describe("band readings from the hardware's Firebase", () => {
  afterEach(() => vi.useRealTimers());

  it("finds values under the names firmware tends to use, a few levels deep", () => {
    expect(pick({ heartRate: 78 }, /^(hr|bpm|heart_?rate)$/i)).toBe(78);
    expect(pick({ sensor: { BPM: "81.5" } }, /^(hr|bpm|heart_?rate)$/i)).toBe(81.5);
    expect(pick({ spo2: 97 }, /^(hr|bpm)$/i)).toBeNull();
    expect(pick(null, /hr/)).toBeNull();
  });

  it("reads a log of readings as its newest entry", () => {
    expect(latestEntry({ "-Na1": { bpm: 70 }, "-Na2": { bpm: 75 } })).toEqual({ bpm: 75 });
    expect(latestEntry({ bpm: 75, gsr: 3 })).toEqual({ bpm: 75, gsr: 3 });
  });

  it("reads each user's own live node: users/<uid>/device/live", () => {
    expect(pathFor("abc123")).toBe("users/abc123/device/live");
  });

  it("matches the band's real field names (heartRate, gsr), not its baseline/change siblings", () => {
    const live = { heartRate: 88, hrBaseline: 70, hrChange: 18, gsr: 5.1, gsrRaw: 2048, gsrBaseline: 4, gsrChange: 1.1, spo2: 97 };
    expect(pick(live, /^(hr|bpm|heart_?rate|heartbeat|pulse|beat_?avg|avg_?bpm)$/i)).toBe(88);
    expect(pick(live, /^(eda|gsr|skin_?conductance|conductance|sweat)$/i)).toBe(5.1);
  });

  it("simulates while the band reports itself offline, then uses real values once it's back", async () => {
    vi.useFakeTimers();
    const band = new FirebaseSensorProvider("uid-1");
    await band.connect();
    vi.advanceTimersByTime(1500);
    const internal = band as unknown as { receive(d: unknown): void };

    internal.receive({ online: false, heartRate: 0, gsr: 0 });
    vi.advanceTimersByTime(300);
    expect(band.getReading().hr).toBeGreaterThan(40); // offline: simulated, never a flat 0

    internal.receive({ online: true, heartRate: 83, gsr: 4.9, contact: true });
    vi.advanceTimersByTime(300);
    const r = band.getReading();
    expect(r.hr).toBe(83);
    expect(r.quality).toBe("good");
    band.dispose();
  });

  it("uses real values, and simulates null or zero ones around that value's average", async () => {
    vi.useFakeTimers();
    const band = new FirebaseSensorProvider();
    const seen: SensorReading[] = [];
    band.subscribe((r) => seen.push(r));
    await band.connect();
    vi.advanceTimersByTime(1500); // the simulation underneath comes up
    const internal = band as unknown as { receive(d: unknown): void };

    internal.receive({ heartRate: 95, gsr: 0, battery: 64 });
    vi.advanceTimersByTime(300);
    let r = band.getReading();
    expect(r.connection).toBe("connected");
    expect(r.hr).toBe(95);
    expect(r.battery).toBe(64);
    expect(r.eda).toBeGreaterThan(2); // gsr 0: simulated around the resting average
    expect(r.deviceName).toBe("StudyLoop band");

    // The sensor drops out: heart rate is simulated, now centred on this band's own average (95).
    internal.receive({ heartRate: null, battery: 64 });
    vi.advanceTimersByTime(300);
    r = band.getReading();
    expect(r.hr).toBeGreaterThan(85);
    expect(r.hr).toBeLessThan(105);

    // Nothing for a while: the whole band is simulated, and says so.
    vi.advanceTimersByTime(20_000);
    expect(band.getReading().deviceName).toBe("StudyLoop band (simulated)");
    band.dispose();
    expect(seen.length).toBeGreaterThan(3);
  });
});
