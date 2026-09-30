"use client";

import Image from "next/image";
import { AnimatePresence, motion, useDragControls, useInView, type Variants } from "motion/react";
import { useIntroDone } from "@/lib/intro";
import { useRef, useState } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { BASELINE_MS, type Tab } from "@/lib/engine";
import { clock, signedPercent } from "@/lib/format";
import { edaDelta, PHYSIO_LABEL } from "@/lib/sensors/classify";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Sparkline } from "../charts/Sparkline";
import { Dock } from "../cockpit/Dock";
import { subjectCode } from "../cockpit/LowerCards";
import { orbFor } from "../orb/orbState";
import { StateOrb } from "../orb/StateOrb";
import { Icon } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { StateBadge } from "../ui/StateBadge";
import { InsightsFoot, InsightsView } from "../views/InsightsView";
import { ProfileFoot, ProfileView } from "../views/ProfileView";
import { ResearchFoot, ResearchView } from "../views/ResearchView";
import { SessionFoot, SessionView } from "../views/SessionView";

/* Section choreography: every piece enters on its own beat. */
const sec: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
const pill: Variants = {
  hidden: { opacity: 0, scale: 0.6, y: 10 },
  show: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 20 } },
};
const bar: Variants = {
  hidden: { opacity: 0, scaleX: 0.5 },
  show: { opacity: 1, scaleX: 1, transition: { type: "spring", stiffness: 160, damping: 20 } },
};
const note: Variants = {
  hidden: { opacity: 0, x: 24 },
  show: { opacity: 1, x: 0, transition: { duration: 0.7, ease: [0.2, 0.8, 0.2, 1] } },
};
const main: Variants = {
  hidden: { opacity: 0, y: 60, scale: 0.88 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 120, damping: 16 } },
};
const side = (dir: 1 | -1): Variants => ({
  hidden: { opacity: 0, x: 40 * dir, rotate: 10 * dir, scale: 0.8 },
  show: { opacity: 1, x: 0, rotate: 0, scale: 1, transition: { type: "spring", stiffness: 160, damping: 14, delay: 0.15 } },
});
const strip: Variants = {
  hidden: { opacity: 0, clipPath: "inset(0 50% 0 50%)" },
  show: { opacity: 1, clipPath: "inset(0 0% 0 0%)", transition: { duration: 0.9, ease: [0.65, 0, 0.35, 1] } },
};

function Section({ id, children }: { id: number; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.25 });
  const ready = useIntroDone();
  return (
    <motion.section
      ref={ref}
      className="m-sec"
      id={`m-sec-${id}`}
      data-sec={id}
      variants={sec}
      initial="hidden"
      animate={ready && inView ? "show" : "hidden"}
    >
      {children}
    </motion.section>
  );
}

function Thumb({ orb, value, label, tone = "#14B8A6", dir }: { orb: OrbState; value: React.ReactNode; label: string; tone?: string; dir: 1 | -1 }) {
  return (
    <motion.div className={`m-side ${dir < 0 ? "m-side--l" : "m-side--r"}`} variants={side(dir)}>
      <div className="m-thumb">
        <ThinkingOrb state={orb} size={32} theme="dark" color={tone} speed={0.7} />
      </div>
      <p className="m-cap">
        <b className="tnum">{value}</b>
        <span>{label}</span>
      </p>
    </motion.div>
  );
}

function Marquee({ items, tone }: { items: string[]; tone?: "action" }) {
  return (
    <motion.div className={`m-strip ${tone === "action" ? "m-strip--action" : ""}`} variants={strip}>
      <div className="marquee__track">
        {[0, 1].map((k) => (
          <span key={k} className="marquee__group">
            {items.map((m, i) => (
              <span key={i}>
                {m}
                <i />
              </span>
            ))}
          </span>
        ))}
      </div>
    </motion.div>
  );
}

function TopRow() {
  const s = useStudyLoop();
  const ready = useIntroDone();
  const [open, setOpen] = useState(false);
  const on = s.reading.connection === "connected";
  const d = edaDelta(s.reading.eda, s.session.baseline);
  const orb = orbFor({ connection: s.reading.connection, phase: s.session.phase, physio: s.physio, research: s.research });
  const live = s.session.phase === "active" || s.session.phase === "paused";
  const q = s.reading.quality;

  return (
    <motion.header
      className="m-top"
      initial={{ y: -30, opacity: 0 }}
      animate={ready ? { y: 0, opacity: 1 } : undefined}
      transition={{ type: "spring", stiffness: 200, damping: 22, delay: 0.1 }}
    >
      <div className="m-top__stats" aria-label="Live values">
        <span className="tnum">{on && s.reading.hr != null ? Math.round(s.reading.hr) : "—"}</span>
        <span className="tnum">{d != null ? signedPercent(d) : on && s.reading.eda != null ? s.reading.eda.toFixed(1) : "—"}</span>
        <span className="tnum">{on ? q.slice(0, 4) : "—"}</span>
      </div>

      <motion.button
        layout
        type="button"
        className={`m-island ${open ? "is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={`${live ? clock(s.session.config.minutes * 60_000 - s.session.elapsedMs) : PHYSIO_LABEL[s.physio]} — system ${orb.label.toLowerCase()}`}
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
      >
        <motion.span layout className="m-island__orb">
          <StateOrb {...orb} size={20} dotScale={1.1} label="" />
        </motion.span>
        <AnimatePresence initial={false} mode="popLayout">
          {open ? (
            <motion.span
              key="open"
              className="m-island__detail"
              initial={{ opacity: 0, filter: "blur(4px)" }}
              animate={{ opacity: 1, filter: "blur(0px)" }}
              exit={{ opacity: 0 }}
            >
              <b>{live ? clock(s.session.config.minutes * 60_000 - s.session.elapsedMs) : orb.label}</b>
              <span>{on ? `${PHYSIO_LABEL[s.physio]} · ${s.reading.battery ?? "—"}%` : "Band offline"}</span>
            </motion.span>
          ) : (
            <motion.span key="closed" className="m-island__word" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {live ? clock(s.session.config.minutes * 60_000 - s.session.elapsedMs) : PHYSIO_LABEL[s.physio]}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <div className="m-top__dots" role="status" aria-label="Band status">
        <span data-tone={on ? "measured" : s.reading.connection === "connecting" ? "pulse" : "off"} title="Link" />
        <span data-tone={!on ? "off" : (s.reading.battery ?? 100) <= 15 ? "action" : "measured"} title="Battery" />
        <span data-tone={!on ? "off" : q === "poor" ? "action" : "measured"} title="Signal" />
        <span data-tone={s.research ? "action" : "off"} title="Research layer" />
      </div>
    </motion.header>
  );
}

/** The tall centre card of section one — whatever the session needs right now. */
function LiveCard() {
  const s = useStudyLoop();
  const phase = s.session.phase;
  const orb = orbFor({ connection: s.reading.connection, phase, physio: s.physio, research: s.research });
  const { config, elapsedMs } = s.session;

  const body = (() => {
    if (phase === "baseline") {
      const left = Math.ceil(((1 - s.session.baselineProgress) * BASELINE_MS) / 1000);
      return (
        <>
          <StateOrb {...orb} size={150} density={1.6} dotScale={0.7} />
          <p className="label label--action">Baseline</p>
          <p className="m-main__big tnum">00:{String(left).padStart(2, "0")}</p>
          <p className="serif m-main__serif">Sit still.</p>
        </>
      );
    }
    if (phase === "active" || phase === "paused") {
      return (
        <>
          <StateOrb {...orb} size={140} density={2} dotScale={0.75} paused={phase === "paused"} />
          <p className="label">{config.subject}</p>
          <p className="m-main__big tnum">{clock(config.minutes * 60_000 - elapsedMs)}</p>
          {phase === "paused" ? <span className="state state--paused">Paused</span> : <StateBadge state={s.physio} />}
        </>
      );
    }
    if (phase === "complete") {
      const last = s.summaries[0];
      return (
        <>
          <p className="label label--measured">Complete</p>
          <p className="m-main__big tnum">{last?.minutes ?? 0}m</p>
          <p className="small muted">{Math.round((last?.stableShare ?? 0) * 100)}% near baseline</p>
        </>
      );
    }
    return (
      <>
        <div className="m-main__img">
          <Image src="/media/studyloop-band.png" alt="The StudyLoop band" fill sizes="60vw" preload />
        </div>
        <p className="serif m-main__serif">designed for deeper focus</p>
      </>
    );
  })();

  const action = () => {
    if (phase === "active" || phase === "paused") engine.togglePause();
    else {
      if (phase === "complete") engine.newSession();
      engine.setTab("session");
    }
  };

  return (
    <motion.div className="m-main" variants={main}>
      <div className="m-main__body">{body}</div>
      {phase !== "baseline" && (
        <motion.button type="button" className="btn btn--primary m-main__btn" whileTap={{ scale: 0.94 }} onClick={action}>
          {phase === "active" ? "Pause" : phase === "paused" ? "Resume" : "Start"}
          <Icon name={phase === "active" ? "pause" : "play"} size={14} />
        </motion.button>
      )}
    </motion.div>
  );
}

function Sheet() {
  const { tab, session } = useStudyLoop();
  const drag = useDragControls();
  const open = tab !== "home";
  const views: Record<Exclude<Tab, "home">, [React.ReactNode, React.ReactNode]> = {
    session: [<SessionView key="v" />, <SessionFoot key="f" />],
    insights: [<InsightsView key="v" />, <InsightsFoot key="f" />],
    research: [<ResearchView key="v" />, <ResearchFoot key="f" />],
    profile: [<ProfileView key="v" />, <ProfileFoot key="f" />],
  };
  const live = session.phase === "active" || session.phase === "baseline";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="m-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => engine.setTab("home")}
          />
          <motion.div
            key="sheet"
            className="m-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={tab}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 260, damping: 32 }}
            drag="y"
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) engine.setTab("home");
            }}
            data-lenis-prevent
          >
            <div className="m-sheet__grip" onPointerDown={(e) => drag.start(e)}>
              <span />
              <button type="button" className="icon-btn" aria-label="Close" onClick={() => engine.setTab("home")}>
                <Icon name="close" size={16} />
              </button>
            </div>
            <div className={`m-sheet__body ${live ? "is-live" : ""}`}>
              <AnimatePresence mode="wait">
                <motion.div
                  key={tab}
                  className="m-sheet__view"
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -16 }}
                  transition={{ duration: 0.3 }}
                >
                  {views[tab as Exclude<Tab, "home">][0]}
                  <div className="m-sheet__foot">{views[tab as Exclude<Tab, "home">][1]}</div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function MobileApp() {
  const s = useStudyLoop();
  const root = useRef<HTMLDivElement>(null);
  const on = s.reading.connection === "connected";
  const { config } = s.session;
  const d = edaDelta(s.reading.eda, s.session.baseline);
  const last = s.summaries[0];
  const phase = s.session.phase;
  const running = phase === "active";

  const values = [
    `HR ${on && s.reading.hr != null ? Math.round(s.reading.hr) : "—"} bpm`,
    `EDA ${d != null ? signedPercent(d) : "—"}`,
    `Signal ${on ? s.reading.quality : "none"}`,
    `State ${PHYSIO_LABEL[s.physio]}`,
    `Baseline ${s.session.baseline ? "set" : "not set"}`,
  ];

  return (
    <div className="m-app" ref={root}>
      <TopRow />

      {/* 01 · Now */}
      <Section id={0}>
        <motion.span className="m-pill" variants={pill}>
          <span className={`link-dot link-dot--${s.reading.connection}`} aria-hidden />
          {on ? `Live · SL-01 · ${s.reading.battery ?? "—"}%` : s.reading.connection === "connecting" ? "Pairing…" : "Band offline"}
        </motion.span>
        <motion.div className="m-bar" variants={bar}>
          <Logo />
          <StateBadge state={s.physio} />
        </motion.div>
        <motion.p className="m-note" variants={note}>
          A wearable study interface that shows how your physiology changes while you learn.
        </motion.p>
        <div className="m-tri">
          <Thumb dir={-1} orb="listening" value={on && s.reading.hr != null ? Math.round(s.reading.hr) : "—"} label="bpm · heart" />
          <LiveCard />
          <Thumb dir={1} orb="breathing" value={d != null ? signedPercent(d) : on && s.reading.eda != null ? s.reading.eda.toFixed(2) : "—"} label={d != null ? "EDA vs base" : "µS · EDA"} />
        </div>
        <Marquee items={values} />
      </Section>

      {/* 02 · Session */}
      <Section id={1}>
        <motion.span className="m-pill" variants={pill}>
          Session · {config.mode}
        </motion.span>
        <motion.div className="m-bar m-bar--player" variants={bar}>
          <span className="m-bar__code">{subjectCode(config.subject)}</span>
          <span className="m-bar__title">
            <b>{config.subject}</b>
            <span>{config.topic}</span>
          </span>
          <motion.button
            type="button"
            className="play-btn m-bar__play"
            whileTap={{ scale: 0.9 }}
            aria-label={running ? "Pause" : phase === "paused" ? "Resume" : "Open session"}
            onClick={() => (running || phase === "paused" ? engine.togglePause() : engine.setTab("session"))}
            data-running={running || undefined}
          >
            <Icon name={running ? "pause" : "play"} size={16} />
          </motion.button>
        </motion.div>
        <motion.p className="m-note" variants={note}>
          Goal {config.minutes} min. {clock(s.session.elapsedMs)} studied so far.
        </motion.p>
        <div className="m-tri">
          <Thumb dir={-1} orb="searching" value={on ? s.reading.quality : "—"} label="signal" tone={s.reading.quality === "poor" ? "#FF6B5A" : "#14B8A6"} />
          <motion.div className="m-main m-main--chart" variants={main}>
            <p className="label">EDA · last 5 min</p>
            <div className="m-main__chart">
              <Sparkline values={s.history.slice(-300).map((x) => x.eda)} baseline={s.session.baseline?.eda} height={120} pad={0.25} />
            </div>
            <StateBadge state={s.physio} />
          </motion.div>
          <Thumb dir={1} orb="connecting" value={s.session.baseline ? "Set" : "—"} label="baseline" />
        </div>
        <motion.button
          type="button"
          className={`m-strip m-strip--action m-strip--btn ${s.research ? "is-on" : ""}`}
          variants={strip}
          onClick={engine.toggleResearch}
          aria-pressed={s.research}
        >
          <div className="marquee__track">
            {[0, 1].map((k) => (
              <span key={k} className="marquee__group">
                {["Research layer " + (s.research ? "on" : "off"), "40 Hz", "Experimental", "Not a treatment", "Tap to toggle"].map((m, i) => (
                  <span key={i}>
                    {m}
                    <i />
                  </span>
                ))}
              </span>
            ))}
          </div>
        </motion.button>
      </Section>

      {/* 03 · Insights */}
      <Section id={2}>
        <motion.span className="m-pill" variants={pill}>
          Insights · {last?.dateLabel ?? "—"}
        </motion.span>
        <motion.button type="button" className="m-bar m-bar--link" variants={bar} onClick={() => engine.setTab("insights")}>
          <span>
            <b>{last?.subject}</b> — {last?.topic}
          </span>
          <Icon name="arrow" size={16} />
        </motion.button>
        <motion.p className="m-note" variants={note}>
          “Near baseline” is time close to your starting signal — not a focus score.
        </motion.p>
        <div className="m-tri">
          <Thumb dir={-1} orb="shaping" value={`${Math.round((last?.stableShare ?? 0) * 100)}%`} label="near base" />
          <motion.div className="m-main m-main--chart" variants={main}>
            <p className="label">{last?.minutes} min session</p>
            <div className="m-main__chart">
              <Sparkline values={(last?.samples ?? []).map((x) => x.hr)} baseline={last?.baseline?.hr} height={60} />
              <Sparkline values={(last?.samples ?? []).map((x) => x.eda)} baseline={last?.baseline?.eda} height={60} />
            </div>
            <p className="small muted">HR above · EDA below</p>
          </motion.div>
          <Thumb dir={1} orb="composing" value={last?.elevatedMoments ?? 0} label="elevated" tone="#FF6B5A" />
        </div>
        <Marquee items={["Not a medical device", "Measures HR + EDA", "No brain reading", "No stress score"]} />
      </Section>

      <div className="m-dock">
        <Dock />
      </div>
      <Sheet />
    </div>
  );
}
