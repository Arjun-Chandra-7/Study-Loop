"use client";

import { edaDelta } from "@/lib/sensors/classify";
import { clock } from "@/lib/format";
import { useStudyLoop } from "@/lib/useStudyLoop";
import { Sparkline } from "../charts/Sparkline";
import { AnimatedNumber } from "../ui/AnimatedNumber";
import { ThinkingOrb, type OrbState } from "thinking-orbs";

function MetricCard({
  orb,
  label,
  chip,
  chipTone = "measured",
  children,
  foot,
  offline,
}: {
  orb: OrbState;
  label: string;
  chip?: string;
  chipTone?: "measured" | "action" | "muted" | "unit";
  children: React.ReactNode;
  foot?: React.ReactNode;
  offline?: boolean;
}) {
  return (
    <section className={`card metric ${offline ? "is-offline" : ""}`} aria-label={label}>
      <header className="card__head">
        <span className="icon-well" aria-hidden>
          <ThinkingOrb
            state={orb}
            size={20}
            theme="dark"
            color={offline ? "#8A9695" : chipTone === "action" ? "#FF6B5A" : "#5FD9CB"}
            speed={offline ? 0.3 : 0.8}
            paused={offline}
          />
        </span>
        {chip && <span className={`chip chip--${chipTone === "unit" ? "measured chip--unit" : chipTone}`}>{chip}</span>}
      </header>
      <div className="metric__body">
        <span className="label">{label}</span>
        <div className="metric__value">{children}</div>
        {foot && <div className="metric__foot">{foot}</div>}
      </div>
    </section>
  );
}

export function HeartRateCard() {
  const { reading, history } = useStudyLoop();
  const on = reading.connection === "connected";
  const tail = history.slice(-60).map((s) => s.hr);
  return (
    <MetricCard orb="listening" label="Heart rate" chip={on ? "PPG" : "Offline"} chipTone={on ? "measured" : "muted"} offline={!on}>
      <AnimatedNumber value={on ? reading.hr : null} className="metric__num" />
      <span className="metric__unit">bpm</span>
      <Sparkline values={tail} className="metric__spark" height={24} />
    </MetricCard>
  );
}

export function EdaCard() {
  const { reading, session, history } = useStudyLoop();
  const on = reading.connection === "connected";
  const d = on ? edaDelta(reading.eda, session.baseline) : null;
  return (
    <MetricCard
     
      orb="breathing"
      label="EDA"
      chip={session.baseline ? "vs base" : "µS"}
      chipTone={d != null && d > 0.22 ? "action" : !on ? "muted" : session.baseline ? "measured" : "unit"}
      offline={!on}
      foot={on && reading.eda != null ? `${reading.eda.toFixed(2)} µS` : "Skin conductance"}
    >
      {session.baseline ? (
        <AnimatedNumber value={d != null ? d * 100 : null} signed suffix="%" className="metric__num" />
      ) : (
        <AnimatedNumber value={on ? reading.eda : null} decimals={2} className="metric__num" />
      )}
      <Sparkline values={history.slice(-60).map((s) => s.eda)} className="metric__spark" height={24} baseline={session.baseline?.eda} />
    </MetricCard>
  );
}

const QUALITY_WORD = { good: "Good", fair: "Fair", poor: "Poor", none: "None" } as const;
const QUALITY_BARS = { good: 4, fair: 2, poor: 1, none: 0 } as const;

export function SignalCard() {
  const { reading } = useStudyLoop();
  const q = reading.connection === "connected" ? reading.quality : "none";
  return (
    <MetricCard
     
      orb="searching"
      label="Signal"
      chip={q === "poor" ? "Adjust" : q === "none" ? "—" : "Contact"}
      chipTone={q === "poor" ? "action" : q === "none" ? "muted" : "measured"}
      offline={q === "none"}
      foot={q === "poor" ? "Tighten strap on inner wrist" : q === "fair" ? "Contact is intermittent" : q === "none" ? "No band connected" : "Electrodes in contact"}
    >
      <span className="metric__word">{QUALITY_WORD[q]}</span>
      <span className={`bars bars--${q}`} aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} data-on={i < QUALITY_BARS[q] || undefined} />
        ))}
      </span>
    </MetricCard>
  );
}

export function BaselineCard() {
  const { session } = useStudyLoop();
  const b = session.baseline;
  const phase = session.phase;
  const live = phase === "active" || phase === "paused";
  return (
    <MetricCard
      orb={phase === "baseline" ? "connecting" : live ? "working" : "shaping"}
      label={live ? "Elapsed" : "Baseline"}
      chip={phase === "baseline" ? "Capturing" : b ? "Set" : "Not set"}
      chipTone={phase === "baseline" ? "action" : b ? "measured" : "muted"}
      foot={b ? `${Math.round(b.hr)} bpm · ${b.eda.toFixed(2)} µS` : "Set at session start"}
    >
      {live ? (
        <span className="metric__num tnum">{clock(session.elapsedMs)}</span>
      ) : phase === "baseline" ? (
        <span className="metric__num tnum">{Math.round(session.baselineProgress * 100)}%</span>
      ) : (
        <span className="metric__word">{b ? "Ready" : "—"}</span>
      )}
    </MetricCard>
  );
}
