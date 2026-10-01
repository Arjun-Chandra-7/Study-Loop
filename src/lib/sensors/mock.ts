import type {
  MockScenario,
  ReadingListener,
  SensorProvider,
  SensorReading,
} from "./types";
import { EMPTY_READING } from "./types";

const TICK_MS = 250;

interface Profile {
  hr: number;
  eda: number;
  /** probability per tick of a skin-conductance response */
  scr: number;
  /** how quickly the tonic level moves toward the target (per tick) */
  follow: number;
}

const PROFILES: Record<Exclude<MockScenario, "disconnected">, Profile> = {
  normal: { hr: 72, eda: 4.2, scr: 0.012, follow: 0.03 },
  elevated: { hr: 91, eda: 5.9, scr: 0.07, follow: 0.018 },
  recovery: { hr: 72, eda: 4.2, scr: 0.01, follow: 0.008 },
  poorSignal: { hr: 74, eda: 4.3, scr: 0.02, follow: 0.03 },
  lowBattery: { hr: 72, eda: 4.2, scr: 0.012, follow: 0.03 },
};

/**
 * A believable stand-in for the band: tonic EDA + phasic responses, heart
 * rate with respiratory variation. Deterministic enough to demo, noisy
 * enough to exercise the UI's smoothing and state logic.
 */
export class MockSensorProvider implements SensorProvider {
  readonly kind = "mock" as const;
  private listeners = new Set<ReadingListener>();
  private reading: SensorReading = { ...EMPTY_READING };
  private timer: ReturnType<typeof setInterval> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private scenario: MockScenario = "normal";
  private hrLevel = 72;
  private edaLevel = 4.2;
  private phasic = 0;
  private battery = 82;
  private wantsConnection = false;

  getScenario() {
    return this.scenario;
  }

  setScenario(next: MockScenario) {
    const prev = this.scenario;
    this.scenario = next;
    if (next === "recovery" && this.hrLevel < 84) {
      // Recovery only reads as recovery if it starts from somewhere elevated.
      this.hrLevel = 90;
      this.edaLevel = 5.7;
      this.phasic = 0.6;
    }
    this.battery = next === "lowBattery" ? 7 : Math.max(this.battery, 60);
    if (next === "disconnected") {
      this.dropLink();
    } else if (prev === "disconnected" && this.wantsConnection) {
      void this.connect();
    }
  }

  async connect() {
    this.wantsConnection = true;
    if (this.reading.connection !== "disconnected") return;
    this.patch({ connection: "connecting", deviceName: "StudyLoop SL-01" });
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.connectTimer = setTimeout(() => {
      if (this.scenario === "disconnected") {
        this.patch({ connection: "disconnected" });
        return;
      }
      this.patch({ connection: "connected", battery: this.battery });
      this.start();
    }, 1400);
  }

  disconnect() {
    this.wantsConnection = false;
    this.dropLink();
  }

  subscribe(listener: ReadingListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getReading() {
    return this.reading;
  }

  dispose() {
    this.stop();
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.listeners.clear();
  }

  private dropLink() {
    this.stop();
    if (this.connectTimer) clearTimeout(this.connectTimer);
    this.patch({ connection: "disconnected", hr: null, eda: null, quality: "none" });
  }

  private start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), TICK_MS);
    this.tick();
  }

  private stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private tick() {
    if (this.scenario === "disconnected") return;
    const p = PROFILES[this.scenario];
    const now = Date.now();

    this.hrLevel += (p.hr - this.hrLevel) * p.follow;
    this.edaLevel += (p.eda - this.edaLevel) * p.follow;
    if (Math.random() < p.scr) this.phasic += 0.18 + Math.random() * 0.42;
    this.phasic *= 0.965;

    // Respiratory sinus arrhythmia (~15 breaths/min) + sensor noise.
    const rsa = 2.2 * Math.sin((now / 4000) * Math.PI * 2);
    let hr = this.hrLevel + rsa + (Math.random() - 0.5) * 1.6;
    let eda = this.edaLevel + this.phasic + (Math.random() - 0.5) * 0.04;
    let quality: SensorReading["quality"] = "good";

    if (this.scenario === "poorSignal") {
      quality = Math.random() < 0.3 ? "fair" : "poor";
      hr += (Math.random() - 0.5) * 18;
      eda += (Math.random() - 0.5) * 0.9;
    }

    this.battery = Math.max(1, this.battery - 0.0004);

    this.patch({
      t: now,
      hr: this.scenario === "poorSignal" && Math.random() < 0.25 ? null : hr,
      eda,
      quality,
      battery: Math.round(this.battery),
    });
  }

  private patch(p: Partial<SensorReading>) {
    this.reading = { ...this.reading, t: Date.now(), ...p };
    for (const l of this.listeners) l(this.reading);
  }
}
