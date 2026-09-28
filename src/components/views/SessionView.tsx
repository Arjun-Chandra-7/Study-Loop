"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLayoutEffect, useRef, useState } from "react";
import { BASELINE_MS, type StudyMode } from "@/lib/engine";
import { clock } from "@/lib/format";
import { PHYSIO_HINT } from "@/lib/sensors/classify";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Sparkline } from "../charts/Sparkline";
import { orbFor } from "../orb/orbState";
import { StateOrb } from "../orb/StateOrb";
import { Icon } from "../ui/Icon";
import { Magnetic } from "../ui/Magnetic";
import { StateBadge } from "../ui/StateBadge";

const SUBJECTS = ["Physics", "Chemistry", "Mathematics", "Biology", "History", "Literature"];
const DURATIONS = [25, 45, 60, 90];
const MODES: StudyMode[] = ["Deep work", "Review", "Practice"];

/** Measures its own box so the orb can take whatever room the panel gives it. */
function useBoxSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize(Math.floor(Math.min(width, height)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function useOrb() {
  const s = useStudyLoop();
  return orbFor({
    connection: s.reading.connection,
    phase: s.session.phase,
    physio: s.physio,
    research: s.research,
  });
}

export function SessionView() {
  const { session } = useStudyLoop();
  const phase = session.phase;
  const key = phase === "paused" ? "active" : phase;
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={key}
        className="view-fill"
        initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
        animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
        transition={{ duration: 0.42, ease: [0.2, 0.8, 0.2, 1] }}
      >
        {phase === "idle" && <SessionSetup />}
        {phase === "baseline" && <BaselineCapture />}
        {(phase === "active" || phase === "paused") && <LiveSession />}
        {phase === "complete" && <SessionComplete />}
      </motion.div>
    </AnimatePresence>
  );
}

function SessionSetup() {
  const s = useStudyLoop();
  const { config } = s.session;
  const orb = useOrb();
  const [orbBox, orbSize] = useBoxSize<HTMLDivElement>();

  return (
    <div className="setup">
      <div className="setup__form">
        <p className="eyebrow">
          <span className="eyebrow__rule" aria-hidden />
          New session
        </p>
        <h2 className="h-section">What are you studying?</h2>

        <fieldset className="field">
          <legend className="label">Subject</legend>
          <div className="choice-row">
            {SUBJECTS.map((sub) => (
              <button
                key={sub}
                type="button"
                className="choice"
                aria-pressed={config.subject === sub}
                onClick={() => engine.configure({ subject: sub })}
              >
                {sub}
              </button>
            ))}
          </div>
        </fieldset>

        <label className="field">
          <span className="label">Topic</span>
          <input
            className="input"
            value={config.topic}
            onChange={(e) => engine.configure({ topic: e.target.value })}
            placeholder="e.g. Light — Refraction"
            maxLength={60}
          />
        </label>

        <div className="field-row">
          <fieldset className="field">
            <legend className="label">Length</legend>
            <div className="choice-row">
              {DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="choice choice--num"
                  aria-pressed={config.minutes === m}
                  onClick={() => engine.configure({ minutes: m })}
                >
                  {m}
                  <small>min</small>
                </button>
              ))}
            </div>
          </fieldset>
          <fieldset className="field">
            <legend className="label">Mode</legend>
            <div className="choice-row">
              {MODES.map((m) => (
                <button
                  key={m}
                  type="button"
                  className="choice"
                  aria-pressed={config.mode === m}
                  onClick={() => engine.configure({ mode: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="setup__aside">
        <div className="orb-box" ref={orbBox}>
          {orbSize > 0 && (
            <StateOrb {...orb} size={Math.min(orbSize, 320)} density={1.8} dotScale={0.62} />
          )}
        </div>
        <div className="setup__note">
          <p className="label">Baseline first</p>
          <p className="serif serif--md">
            Twenty seconds of stillness teaches the band what normal looks like for you today.
          </p>
        </div>
      </div>

    </div>
  );
}

function BaselineCapture() {
  const s = useStudyLoop();
  const orb = useOrb();
  const [box, size] = useBoxSize<HTMLDivElement>();
  const p = s.session.baselineProgress;
  const remaining = Math.ceil(((1 - p) * BASELINE_MS) / 1000);
  const ring = Math.min(size, 380);
  const r = ring / 2 - 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="baseline">
      <div className="baseline__orb" ref={box}>
        {size > 0 && (
          <div className="ring-wrap" style={{ width: ring, height: ring }}>
            <svg width={ring} height={ring} className="ring" aria-hidden>
              <circle cx={ring / 2} cy={ring / 2} r={r} className="ring__track" />
              <circle
                cx={ring / 2}
                cy={ring / 2}
                r={r}
                className="ring__fill"
                strokeDasharray={c}
                strokeDashoffset={c * (1 - p)}
              />
            </svg>
            <StateOrb {...orb} size={Math.round(ring * 0.72)} density={1.6} dotScale={0.6} className="ring__orb" />
          </div>
        )}
      </div>
      <div className="baseline__copy" aria-live="polite">
        <p className="label label--action">Capturing baseline</p>
        <p className="timer timer--md tnum">00:{String(remaining).padStart(2, "0")}</p>
        <p className="serif serif--md">Sit still. Breathe normally.</p>
        <p className="small muted">
          The band is learning your resting heart rate and skin conductance. Every state you see later is relative to
          this moment.
        </p>
      </div>
    </div>
  );
}

function LiveSession() {
  const s = useStudyLoop();
  const { config, elapsedMs, phase } = s.session;
  const orb = useOrb();
  const [box, size] = useBoxSize<HTMLDivElement>();
  const remaining = config.minutes * 60_000 - elapsedMs;
  const paused = phase === "paused";

  return (
    <div className={`live ${paused ? "is-paused" : ""}`}>
      <div className="live__left">
        <div className="live__subject">
          <p className="label">{config.subject}</p>
          <p className="serif serif--lg">{config.topic || "Untitled topic"}</p>
        </div>
        <div className="live__timer">
          <p className="timer tnum" aria-label={`${clock(remaining)} remaining`}>
            {clock(remaining)}
          </p>
          <p className="small muted">
            {paused ? "Paused" : "Remaining"} · {config.minutes} min {config.mode.toLowerCase()}
          </p>
        </div>
        <div className="live__state" aria-live="polite">
          {paused ? (
            <span className="state state--paused state--lg">
              <Icon name="pause" size={20} />
              <span>Paused</span>
            </span>
          ) : (
            <StateBadge state={s.physio} size="lg" />
          )}
          <p className="small muted">{paused ? "Timer and state tracking are on hold." : PHYSIO_HINT[s.physio]}</p>
        </div>
      </div>
      <div className="live__orb" ref={box}>
        {size > 0 && (
          <StateOrb {...orb} size={Math.min(size, 420)} paused={paused} density={2.6} dotScale={0.85} />
        )}
        {s.research && !paused && (
          <span className="chip chip--action-outline live__research">Research layer · experimental</span>
        )}
      </div>
    </div>
  );
}

function SessionComplete() {
  const s = useStudyLoop();
  const last = s.summaries[0];
  if (!last) return null;
  return (
    <div className="complete">
      <div className="complete__head">
        <p className="label label--measured">
          <Icon name="check" size={14} /> Session complete
        </p>
        <p className="timer tnum">{clock(last.minutes * 60_000)}</p>
        <p className="serif serif--lg">
          {last.subject} — {last.topic}
        </p>
      </div>
      <dl className="stat-row">
        <div>
          <dt>Near baseline</dt>
          <dd className="tnum">{Math.round(last.stableShare * 100)}%</dd>
        </div>
        <div>
          <dt>Elevated moments</dt>
          <dd className="tnum">{last.elevatedMoments}</dd>
        </div>
        <div>
          <dt>Moments you marked</dt>
          <dd className="tnum">{last.marks}</dd>
        </div>
      </dl>
      <div className="complete__spark">
        <Sparkline values={last.samples.map((x) => x.eda)} baseline={last.baseline?.eda} height={64} />
      </div>
    </div>
  );
}

export function SessionFoot() {
  const s = useStudyLoop();
  const phase = s.session.phase;
  const orb = orbFor({ connection: s.reading.connection, phase, physio: s.physio, research: s.research });

  if (phase === "idle") {
    const ready = s.reading.connection === "connected";
    return (
      <div className="foot">
        <p className="foot__status" role="status">
          <span className={`link-dot link-dot--${s.reading.connection}`} aria-hidden />
          {ready
            ? "Band ready · keep your wrist still for the baseline"
            : s.reading.connection === "connecting"
              ? "Pairing with your band…"
              : "Your band isn’t connected"}
        </p>
        {s.reading.connection === "disconnected" && (
          <button type="button" className="btn btn--ghost" onClick={engine.connect}>
            <Icon name="link" size={16} />
            Connect band
          </button>
        )}
        <Magnetic>
          <button type="button" className="btn btn--primary" disabled={!ready} onClick={engine.beginSession}>
            Begin baseline
            <Icon name="arrow" size={16} />
          </button>
        </Magnetic>
      </div>
    );
  }
  if (phase === "baseline") {
    return (
      <div className="foot">
        <p className="foot__status">{orb.label}</p>
        <button type="button" className="btn btn--ghost" onClick={engine.end}>
          Cancel
        </button>
      </div>
    );
  }
  if (phase === "complete") {
    return (
      <div className="foot">
        <p className="foot__status">Saved to Insights</p>
        <div className="btn-row">
          <button type="button" className="btn btn--ghost" onClick={engine.newSession}>
            New session
          </button>
          <button type="button" className="btn btn--primary" onClick={() => engine.setTab("insights")}>
            Review in Insights
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </div>
    );
  }
  const paused = phase === "paused";
  return (
    <div className="foot">
      <p className="foot__status">{orb.label}</p>
      <div className="btn-row">
        <button type="button" className="btn btn--ghost" onClick={engine.mark} disabled={paused}>
          <Icon name="flag" size={16} />
          Mark moment
        </button>
        <button type="button" className="btn btn--ghost" onClick={engine.end}>
          <Icon name="stop" size={16} />
          End
        </button>
        <button type="button" className={`btn ${paused ? "btn--primary" : "btn--solid"}`} onClick={engine.togglePause}>
          <Icon name={paused ? "play" : "pause"} size={16} />
          {paused ? "Resume" : "Pause"}
        </button>
      </div>
    </div>
  );
}
