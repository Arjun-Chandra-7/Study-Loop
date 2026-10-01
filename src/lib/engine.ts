import { BluetoothSensorProvider } from "./sensors/bluetooth";
import {
  classify,
  computeBaseline,
  type Baseline,
  type PhysioState,
  type Sample,
} from "./sensors/classify";
import { MockSensorProvider } from "./sensors/mock";
import type { MockScenario, SensorProvider, SensorReading } from "./sensors/types";
import { EMPTY_READING } from "./sensors/types";

export type Tab = "home" | "session" | "insights" | "research" | "music" | "profile";
export type SessionPhase = "idle" | "baseline" | "active" | "paused" | "complete";
export type StudyMode = "Deep work" | "Review" | "Practice";

export interface SessionConfig {
  subject: string;
  topic: string;
  minutes: number;
  mode: StudyMode;
}

export interface SessionEvent {
  /** elapsed active ms */
  at: number;
  kind: "mark" | "elevated";
}

export interface SessionSample extends Sample {
  /** elapsed active ms */
  at: number;
}

export interface SessionSummary {
  id: string;
  subject: string;
  topic: string;
  dateLabel: string;
  minutes: number;
  stableShare: number;
  elevatedMoments: number;
  marks: number;
  samples: SessionSample[];
  events: SessionEvent[];
  baseline: Baseline | null;
  isSample?: boolean;
}

export interface SessionState {
  phase: SessionPhase;
  config: SessionConfig;
  baselineProgress: number;
  baseline: Baseline | null;
  elapsedMs: number;
  stableMs: number;
  events: SessionEvent[];
  samples: SessionSample[];
}

export interface Snapshot {
  reading: SensorReading;
  providerKind: "mock" | "bluetooth";
  providerError: string | null;
  scenario: MockScenario;
  /** rolling 1 Hz history, last 10 minutes */
  history: Sample[];
  physio: PhysioState;
  session: SessionState;
  summaries: SessionSummary[];
  tab: Tab;
  /** which summary Insights is showing; null = most recent */
  selectedSummary: string | null;
  quiet: boolean;
  research: boolean;
}

export const BASELINE_MS = 20_000;
const HISTORY_MAX = 600;
const LOOP_MS = 250;

const DEFAULT_CONFIG: SessionConfig = {
  subject: "Physics",
  topic: "Light — Refraction",
  minutes: 45,
  mode: "Deep work",
};

const idleSession = (config: SessionConfig, baseline: Baseline | null = null): SessionState => ({
  phase: "idle",
  config,
  baselineProgress: 0,
  baseline,
  elapsedMs: 0,
  stableMs: 0,
  events: [],
  samples: [],
});

/** A labelled sample so Insights has something honest to show before the first session. */
function sampleSummary(): SessionSummary {
  const samples: SessionSample[] = [];
  const events: SessionEvent[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const minutes = 45;
  for (let s = 0; s <= minutes * 60; s += 10) {
    const m = s / 60;
    const bump = Math.exp(-((m - 17) ** 2) / 6) + 0.7 * Math.exp(-((m - 33) ** 2) / 3);
    const hr = 71 + 3 * Math.sin(m / 3) + 15 * bump + (rnd() - 0.5) * 2.4;
    const eda = 4.1 + 0.25 * Math.sin(m / 5) + 1.5 * bump + (rnd() - 0.5) * 0.12;
    samples.push({ at: s * 1000, t: s * 1000, hr, eda, quality: "good" });
  }
  events.push({ at: 16.2 * 60_000, kind: "elevated" }, { at: 32.6 * 60_000, kind: "elevated" });
  events.push({ at: 9 * 60_000, kind: "mark" }, { at: 27.5 * 60_000, kind: "mark" });
  return {
    id: "sample",
    subject: "Chemistry",
    topic: "Reaction kinetics",
    dateLabel: "Sample session",
    minutes,
    stableShare: 0.78,
    elevatedMoments: 2,
    marks: 2,
    samples,
    events,
    baseline: { hr: 71.5, eda: 4.15 },
    isSample: true,
  };
}

type Listener = () => void;

export class StudyLoopEngine {
  private listeners = new Set<Listener>();
  private mock = new MockSensorProvider();
  private provider: SensorProvider = this.mock;
  private unsubProvider: (() => void) | null = null;
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastLoop = 0;
  private lastSample = 0;
  private baselineStart = 0;
  private baselineSamples: Sample[] = [];
  private latest: SensorReading = { ...EMPTY_READING };
  private started = false;

  private snap: Snapshot = {
    reading: { ...EMPTY_READING },
    providerKind: "mock",
    providerError: null,
    scenario: "normal",
    history: [],
    physio: "none",
    session: idleSession(DEFAULT_CONFIG),
    summaries: [sampleSummary()],
    tab: "home",
    selectedSummary: null,
    quiet: false,
    research: false,
  };

  readonly serverSnapshot = this.snap;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  getSnapshot = () => this.snap;

  /** Called once on the client. Auto-connects the mock band so the demo is alive. */
  start() {
    if (this.started) return;
    this.started = true;
    this.attach(this.provider);
    this.lastLoop = performance.now();
    this.loop = setInterval(() => this.tick(), LOOP_MS);
    void this.provider.connect();
  }

  stop() {
    if (this.loop) clearInterval(this.loop);
    this.loop = null;
    this.unsubProvider?.();
    this.started = false;
  }

  // ── actions ────────────────────────────────────────────────

  setTab = (tab: Tab) => this.set({ tab });
  selectSummary = (id: string | null) => this.set({ selectedSummary: id });
  toggleQuiet = () => this.set({ quiet: !this.snap.quiet });
  toggleResearch = () => this.set({ research: !this.snap.research });
  setResearch = (research: boolean) => this.set({ research });

  connect = async () => {
    this.set({ providerError: null });
    try {
      await this.provider.connect();
    } catch (e) {
      this.set({ providerError: e instanceof Error ? e.message : "Could not connect." });
    }
  };

  disconnect = () => this.provider.disconnect();

  toggleConnection = () => {
    if (this.snap.reading.connection === "disconnected") void this.connect();
    else this.disconnect();
  };

  setScenario = (scenario: MockScenario) => {
    this.mock.setScenario(scenario);
    this.set({ scenario });
  };

  setProvider = (kind: "mock" | "bluetooth") => {
    if (kind === this.snap.providerKind) return;
    this.provider.disconnect();
    this.unsubProvider?.();
    if (this.provider !== this.mock) this.provider.dispose();
    this.provider = kind === "mock" ? this.mock : new BluetoothSensorProvider();
    this.attach(this.provider);
    this.set({ providerKind: kind, providerError: null, reading: this.provider.getReading() });
    if (kind === "mock") void this.connect();
  };

  configure = (patch: Partial<SessionConfig>) => {
    const s = this.snap.session;
    const minutes = patch.minutes != null ? Math.max(5, Math.min(180, patch.minutes)) : undefined;
    this.setSession({ config: { ...s.config, ...patch, ...(minutes ? { minutes } : {}) } });
  };

  beginSession = () => {
    if (this.snap.reading.connection !== "connected") return;
    this.baselineStart = Date.now();
    this.baselineSamples = [];
    this.setSession({
      ...idleSession(this.snap.session.config),
      phase: "baseline",
    });
    this.set({ tab: "session" });
  };

  pause = () => {
    if (this.snap.session.phase === "active") this.setSession({ phase: "paused" });
  };

  resume = () => {
    if (this.snap.session.phase === "paused") this.setSession({ phase: "active" });
  };

  togglePause = () => {
    const p = this.snap.session.phase;
    if (p === "active") this.pause();
    else if (p === "paused") this.resume();
    else if (p === "idle" || p === "complete") this.set({ tab: "session" });
  };

  mark = () => {
    const s = this.snap.session;
    if (s.phase !== "active") return;
    this.setSession({ events: [...s.events, { at: s.elapsedMs, kind: "mark" }] });
  };

  end = () => {
    const s = this.snap.session;
    if (s.phase === "baseline") {
      this.setSession(idleSession(s.config, s.baseline));
      return;
    }
    if (s.phase !== "active" && s.phase !== "paused") return;
    this.complete();
  };

  newSession = () => {
    this.setSession(idleSession(this.snap.session.config, this.snap.session.baseline));
  };

  // ── internals ──────────────────────────────────────────────

  private attach(p: SensorProvider) {
    this.unsubProvider?.();
    this.unsubProvider = p.subscribe((r) => {
      const prev = this.latest;
      this.latest = r;
      // Connection changes are announced immediately; values batch into the loop.
      if (prev.connection !== r.connection) {
        this.set({ reading: r, physio: r.connection === "connected" ? this.snap.physio : "none" });
      }
    });
    this.latest = p.getReading();
  }

  private tick() {
    const now = performance.now();
    const dt = now - this.lastLoop;
    this.lastLoop = now;
    const r = this.latest;
    const patch: Partial<Snapshot> = { reading: r };
    let session = this.snap.session;

    if (Date.now() - this.lastSample >= 1000) {
      this.lastSample = Date.now();
      const sample: Sample | null =
        r.connection === "connected" ? { t: r.t, hr: r.hr, eda: r.eda, quality: r.quality } : null;

      if (sample) {
        const history = this.snap.history.concat(sample);
        if (history.length > HISTORY_MAX) history.splice(0, history.length - HISTORY_MAX);
        patch.history = history;
        const physio = classify(history, session.baseline, this.snap.physio);
        patch.physio = physio;

        if (session.phase === "baseline") this.baselineSamples.push(sample);
        if (session.phase === "active") {
          const events =
            physio === "elevated" && this.snap.physio !== "elevated"
              ? [...session.events, { at: session.elapsedMs, kind: "elevated" as const }]
              : session.events;
          session = {
            ...session,
            events,
            samples: session.samples.concat({ ...sample, at: session.elapsedMs }),
          };
        }
      } else {
        patch.physio = "none";
      }
    }

    if (session.phase === "baseline") {
      const progress = Math.min(1, (Date.now() - this.baselineStart) / BASELINE_MS);
      session = { ...session, baselineProgress: progress };
      if (progress >= 1) {
        const baseline = computeBaseline(this.baselineSamples) ?? session.baseline;
        session = { ...session, phase: "active", baseline, baselineProgress: 1 };
      }
    } else if (session.phase === "active" && r.connection === "connected") {
      const physio = patch.physio ?? this.snap.physio;
      session = {
        ...session,
        elapsedMs: session.elapsedMs + dt,
        stableMs: session.stableMs + (physio === "stable" ? dt : 0),
      };
    }

    patch.session = session;
    this.snap = { ...this.snap, ...patch };
    if (session.phase === "active" && session.elapsedMs >= session.config.minutes * 60_000) {
      this.complete();
      return;
    }
    this.emit();
  }

  private complete() {
    const s = this.snap.session;
    const summary: SessionSummary = {
      id: String(Date.now()),
      subject: s.config.subject,
      topic: s.config.topic,
      dateLabel: "Today",
      minutes: Math.max(1, Math.round(s.elapsedMs / 60_000)),
      stableShare: s.elapsedMs ? s.stableMs / s.elapsedMs : 0,
      elevatedMoments: s.events.filter((e) => e.kind === "elevated").length,
      marks: s.events.filter((e) => e.kind === "mark").length,
      samples: s.samples,
      events: s.events,
      baseline: s.baseline,
    };
    this.snap = {
      ...this.snap,
      session: { ...s, phase: "complete" },
      summaries: [summary, ...this.snap.summaries].slice(0, 8),
      selectedSummary: null,
    };
    this.emit();
  }

  private setSession(p: Partial<SessionState>) {
    this.set({ session: { ...this.snap.session, ...p } });
  }

  private set(p: Partial<Snapshot>) {
    this.snap = { ...this.snap, ...p };
    this.emit();
  }

  private emit() {
    for (const l of this.listeners) l();
  }
}

export const engine = new StudyLoopEngine();
