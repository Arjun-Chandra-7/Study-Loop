import { deleteApp, getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { MockSensorProvider } from "./mock";
import type { ReadingListener, SensorProvider, SensorReading } from "./types";
import { EMPTY_READING } from "./types";

/**
 * The band's own Firebase project (separate from the login project). The hardware writes its
 * latest reading to a Realtime Database path or a Firestore document; StudyLoop listens to it.
 * Public client config, like the login project's: access is governed by the database rules.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_HARDWARE_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_HARDWARE_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_HARDWARE_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_HARDWARE_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_HARDWARE_FIREBASE_APP_ID,
};
/**
 * Where the live reading lives, as a template. The band writes per user, keyed by the StudyLoop
 * login UID: `users/<uid>/device/live`. `{uid}` is filled in with the signed-in user's id. A set
 * env value wins (a bare "/" is treated as "unset", so today's deployed value still uses the default).
 */
const PATH_ENV = (process.env.NEXT_PUBLIC_HARDWARE_FIREBASE_PATH ?? "").trim();
const PATH_TEMPLATE = PATH_ENV && PATH_ENV !== "/" ? PATH_ENV : "users/{uid}/device/live";
export const pathFor = (uid: string) => PATH_TEMPLATE.replace("{uid}", uid).replace(/^\/+/, "");

export const hardwareConfigured = Boolean(config.apiKey && config.projectId && config.databaseURL);

/** Resting averages, used until the band has sent a real value to average from. */
const TYPICAL = { hr: 72, eda: 4.2, battery: 82 };
/** No update for this long and the band counts as offline (values are then simulated). */
const STALE_MS = 15_000;

const KEYS: Record<keyof typeof TYPICAL, RegExp> = {
  hr: /^(hr|bpm|heart_?rate|heartbeat|pulse|beat_?avg|avg_?bpm)$/i,
  eda: /^(eda|gsr|skin_?conductance|conductance|sweat)$/i,
  battery: /^(battery|batt?|battery_?level|battery_?percent(age)?)$/i,
};

/** A number from the hardware's JSON: a field matching `re`, looked for a few levels deep. */
export function pick(data: unknown, re: RegExp, depth = 3): number | null {
  if (!data || typeof data !== "object" || depth < 0) return null;
  for (const [k, v] of Object.entries(data)) {
    if (re.test(k)) {
      const n = typeof v === "string" ? Number.parseFloat(v) : v;
      if (typeof n === "number" && Number.isFinite(n)) return n;
    }
  }
  for (const v of Object.values(data)) {
    const n = pick(v, re, depth - 1);
    if (n !== null) return n;
  }
  return null;
}

/** A log of readings (push ids, or timestamps as keys) reads as its newest entry. */
export function latestEntry(data: unknown): unknown {
  if (!data || typeof data !== "object") return data;
  const entries = Object.entries(data);
  if (entries.length > 1 && entries.every(([, v]) => v && typeof v === "object")) return entries.sort(([a], [b]) => (a < b ? -1 : 1)).at(-1)![1];
  return data;
}

/** Running average of the real values seen, so simulated gaps sit where this band usually reads. */
class Average {
  private sum = 0;
  private n = 0;
  constructor(private fallback: number) {}
  add(v: number) {
    this.sum += v;
    this.n = Math.min(this.n + 1, 600);
    if (this.n === 600) this.sum = (this.sum / 601) * 600; // slowly forget very old values
  }
  get value() {
    return this.n ? this.sum / this.n : this.fallback;
  }
}

/**
 * The band, as it reports through Firebase. Any value that's missing, null or zero (sensor off
 * the skin, field not wired up yet, band offline) is simulated around that value's average, so
 * the rest of the app always has something believable to work with.
 */
export class FirebaseSensorProvider implements SensorProvider {
  readonly kind = "firebase" as const;
  private listeners = new Set<ReadingListener>();
  private reading: SensorReading = { ...EMPTY_READING };
  private sim = new MockSensorProvider();
  private unsubSim: (() => void) | null = null;
  private unsubDb: (() => void) | null = null;
  private app: FirebaseApp | null = null;
  private raw: { hr: number | null; eda: number | null; battery: number | null; online: boolean; contact: boolean; at: number } = { hr: null, eda: null, battery: null, online: true, contact: true, at: 0 };
  private avg = { hr: new Average(TYPICAL.hr), eda: new Average(TYPICAL.eda), battery: new Average(TYPICAL.battery) };

  /** `uid`: the signed-in StudyLoop user, whose band readings live at `users/<uid>/device/live`. */
  constructor(private uid: string | null = null) {}

  async connect() {
    if (this.reading.connection !== "disconnected") return;
    this.patch({ connection: "connecting", deviceName: "StudyLoop band" });
    // The simulation runs underneath and supplies every value the hardware doesn't.
    this.unsubSim = this.sim.subscribe((s) => s.connection === "connected" && this.merge(s));
    await this.sim.connect();
    // No hardware config, or no signed-in user to key the per-user path: simulate only.
    if (!hardwareConfigured || !this.uid) return;
    try {
      this.app = getApps().some((a) => a.name === "hardware") ? getApp("hardware") : initializeApp(config, "hardware");
      const { getDatabase, onValue, ref } = await import("firebase/database");
      this.unsubDb = onValue(
        ref(getDatabase(this.app), pathFor(this.uid)),
        (snap) => this.receive(snap.val()),
        (e) => console.warn("[StudyLoop] hardware Firebase read refused, simulating", e),
      );
    } catch (e) {
      // Unreachable or locked database: keep going on simulated values.
      console.warn("[StudyLoop] hardware Firebase unavailable, simulating", e);
    }
  }

  private receive(data: unknown) {
    const latest = latestEntry(data);
    const real = (v: number | null) => (v !== null && v > 0 ? v : null);
    const flag = (re: RegExp) => {
      const v = pick(latest, re);
      return v === null ? true : v > 0; // absent → assume ok; present → truthy means ok
    };
    const online = flag(/^(online|connected|present)$/i);
    // Skin contact: any of the contact flags reading false means the sensor isn't on the skin.
    const contact = flag(/^(contact|ppg_?contact|gsr_?contact|on_?skin|worn)$/i);
    this.raw = {
      hr: online ? real(pick(latest, KEYS.hr)) : null,
      eda: online ? real(pick(latest, KEYS.eda)) : null,
      battery: real(pick(latest, KEYS.battery)),
      online,
      contact,
      at: Date.now(),
    };
    if (this.raw.hr !== null) this.avg.hr.add(this.raw.hr);
    if (this.raw.eda !== null) this.avg.eda.add(this.raw.eda);
    if (this.raw.battery !== null) this.avg.battery.add(this.raw.battery);
  }

  /** One tick: real values where the band has them, simulated ones (around the average) where not. */
  private merge(s: SensorReading) {
    const live = Date.now() - this.raw.at < STALE_MS;
    const value = (k: keyof typeof TYPICAL, simulated: number | null) => {
      const r = live ? this.raw[k] : null;
      if (r !== null) return r;
      // The simulation wobbles around a resting average; move that wobble onto this band's average.
      return simulated === null ? null : simulated - TYPICAL[k] + this.avg[k].value;
    };
    this.patch({
      connection: "connected",
      hr: value("hr", s.hr),
      eda: value("eda", s.eda),
      battery: Math.round(Math.min(100, Math.max(1, value("battery", s.battery) ?? this.avg.battery.value))),
      quality: live ? (this.raw.hr !== null && this.raw.contact ? "good" : this.raw.online ? "fair" : s.quality) : s.quality,
      deviceName: live ? "StudyLoop band" : "StudyLoop band (simulated)",
    });
  }

  disconnect() {
    this.unsubDb?.();
    this.unsubDb = null;
    this.unsubSim?.();
    this.unsubSim = null;
    this.sim.disconnect();
    if (this.app) void deleteApp(this.app).catch(() => {});
    this.app = null;
    this.patch({ connection: "disconnected", hr: null, eda: null, quality: "none" });
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
    this.disconnect();
    this.sim.dispose();
    this.listeners.clear();
  }

  private patch(p: Partial<SensorReading>) {
    this.reading = { ...this.reading, t: Date.now(), ...p };
    for (const l of this.listeners) l(this.reading);
  }
}
