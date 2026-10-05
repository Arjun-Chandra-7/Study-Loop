"use client";

import { motion } from "motion/react";
import { useAuth } from "@/lib/auth";
import { Avatar } from "../ui/Avatar";
import { clock } from "@/lib/format";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { usePalette } from "@/lib/prefs";
import { Sparkline } from "../charts/Sparkline";
import { Icon } from "../ui/Icon";
import { StateBadge } from "../ui/StateBadge";
import { ThinkingOrb } from "thinking-orbs";

const SUBJECT_CODES: Record<string, string> = {
  Physics: "PHY",
  Chemistry: "CHM",
  Mathematics: "MTH",
  Biology: "BIO",
  History: "HIS",
  Literature: "LIT",
};

export function subjectCode(subject: string) {
  return SUBJECT_CODES[subject] ?? subject.slice(0, 3).toUpperCase();
}

/** Centre card 1 — the session "player". */
export function PlayerCard() {
  const s = useStudyLoop();
  const pal = usePalette();
  const { phase, config, elapsedMs } = s.session;
  const total = config.minutes * 60_000;
  const progress = phase === "complete" ? 1 : Math.min(1, elapsedMs / total);
  const running = phase === "active";

  const primary = () => {
    if (phase === "idle" || phase === "complete") {
      if (phase === "complete") engine.newSession();
      engine.setTab("session");
      engine.beginSession();
    } else engine.togglePause();
  };
  const primaryLabel =
    phase === "active" ? "Pause" : phase === "paused" ? "Resume" : phase === "baseline" ? "Capturing baseline" : "Start session";

  return (
    <section className="card player" aria-label="Session">
      <div className="player__tile" aria-hidden>
        <span className="player__orb">
          <ThinkingOrb
            state={running ? "working" : phase === "baseline" ? "connecting" : "breathing"}
            size={32}
            theme="dark"
            color={pal.measuredHi}
            speed={running ? 0.8 : 0.4}
          />
        </span>
        <span className="player__code">{subjectCode(config.subject)}</span>
        <span className="player__mode">{config.mode}</span>
      </div>
      <div className="player__main">
        <div>
          <p className="card__title">{config.subject}</p>
          <p className="card__sub">{config.topic}</p>
        </div>
        <div className="player__controls">
          <button
            type="button"
            className="icon-btn"
            aria-label="Five minutes shorter"
            onClick={() => engine.configure({ minutes: config.minutes - 5 })}
            disabled={config.minutes <= 5}
          >
            <Icon name="minus" size={16} />
          </button>
          <motion.button
            type="button"
            className="play-btn"
            aria-label={primaryLabel}
            onClick={primary}
            disabled={phase === "baseline"}
            whileTap={{ scale: 0.94 }}
            data-running={running || undefined}
          >
            <Icon name={running ? "pause" : "play"} size={18} />
          </motion.button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Five minutes longer"
            onClick={() => engine.configure({ minutes: config.minutes + 5 })}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <div className="player__progress">
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Session progress"
          >
            <span className="progress__fill" style={{ transform: `scaleX(${progress})` }} />
            {s.session.events
              .filter((e) => e.kind === "mark")
              .map((e, i) => (
                <span key={i} className="progress__mark" style={{ left: `${(e.at / total) * 100}%` }} />
              ))}
          </div>
          <div className="player__times tnum">
            <span>{clock(elapsedMs)}</span>
            <span>{config.minutes}:00</span>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Centre card 2 — the recent signal against baseline, plus goal & mode. */
export function TrendCard() {
  const s = useStudyLoop();
  const tail = s.history.slice(-300);
  const on = s.reading.connection === "connected";
  return (
    <section className="card trend" aria-label="Recent signal">
      <header className="card__head">
        <p className="card__title">Signal · 5 min</p>
        <StateBadge state={s.physio} />
      </header>
      <div className="trend__body">
        <div className="trend__tile">
          {on && tail.length > 2 ? (
            <Sparkline values={tail.map((x) => x.eda)} baseline={s.session.baseline?.eda} height={56} pad={0.25} />
          ) : (
            <span className="small muted">{on ? "Collecting…" : "No signal"}</span>
          )}
          <span className="trend__axis">EDA</span>
        </div>
        <dl className="trend__facts">
          <div>
            <dt>Goal</dt>
            <dd>{s.session.config.minutes} min</dd>
          </div>
          <div>
            <dt>Mode</dt>
            <dd>{s.session.config.mode}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

export function wavePath(w: number, h: number, cycles: number, amp = 0.36) {
  const pts: string[] = [];
  const steps = cycles * 16;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * w;
    const y = h / 2 - Math.sin((i / steps) * cycles * Math.PI * 2) * h * amp;
    pts.push(`${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join("");
}

/** Bottom-left: who is studying and which band is on their wrist. */
export function ProfilePill() {
  const { reading } = useStudyLoop();
  const { user } = useAuth();
  const conn = reading.connection;
  return (
    <button type="button" className="profile-pill" onClick={() => engine.setTab("profile")} title="Open profile and band settings">
      <Avatar />
      <span className="profile-pill__text">
        <span className="profile-pill__name">{user?.displayName ?? user?.email ?? "Signed in"}</span>
        <span className="profile-pill__band">
          {conn === "connected" ? `Band SL-01 · ${reading.battery ?? "—"}%` : conn === "connecting" ? "Pairing band…" : "Band not connected"}
        </span>
      </span>
      {/* Mirrors the physical LED on the band. */}
      <span className={`led led--${conn}`} aria-hidden />
    </button>
  );
}
