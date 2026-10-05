"use client";

import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import type { Tab } from "@/lib/engine";
import { clock, signedPercent } from "@/lib/format";
import { useIntroDone } from "@/lib/intro";
import { gammaBeats, useGammaBeats } from "@/lib/music/gamma";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { useLoopPlayer } from "../views/loops/shared";
import { edaDelta, PHYSIO_LABEL } from "@/lib/sensors/classify";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Sparkline } from "../charts/Sparkline";
import { orbFor } from "../orb/orbState";
import { StateOrb } from "../orb/StateOrb";
import { toggleBeats } from "../session/SessionPrompts";
import { Avatar } from "../ui/Avatar";
import { Icon, type IconName } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { InsightsFoot, InsightsView } from "../views/InsightsView";
import { MusicFoot, MusicView } from "../views/MusicView";
import { ProfileFoot, ProfileView } from "../views/ProfileView";
import { ResearchFoot, ResearchView } from "../views/ResearchView";
import { SessionFoot, SessionView } from "../views/SessionView";
import "./mobile.css";

/*
 * Phone layout, built on patterns from the best health and focus apps:
 *  - the first screen is one hero and nothing else: the one thing that matters now (Oura's Today);
 *  - below the fold, one scrolling Today list, not swipe-tabs (Whoop's 2025 home);
 *  - glanceable dials first, trends a tap away, detail in sheets (progressive disclosure);
 *  - navigation and the live session in the thumb zone at the bottom.
 */

const rise = (i: number) => ({
  initial: { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.08 * i, type: "spring" as const, stiffness: 220, damping: 26 },
});

const LIVE = ["baseline", "active", "paused"];
const noSub = () => () => {};

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Burning the midnight oil" : h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function TopBar() {
  const s = useStudyLoop();
  const r = s.reading;
  const on = r.connection === "connected";
  return (
    <header className="mx-top">
      <Logo size="sm" />
      <button
        type="button"
        className={`mx-band mx-band--${r.connection}`}
        onClick={on ? () => engine.setTab("profile") : engine.toggleConnection}
        aria-label={on ? "Band connected, open band settings" : "Pair your band"}
      >
        <span className={`link-dot link-dot--${r.connection}`} aria-hidden />
        {on ? (
          <>
            Band 1 <span className="tnum">{r.battery ?? "—"}%</span>
          </>
        ) : r.connection === "connecting" ? (
          "Pairing…"
        ) : (
          "Pair band"
        )}
      </button>
      <button type="button" className="mx-me" onClick={() => engine.setTab("profile")} aria-label="Open your profile">
        <Avatar size="sm" />
      </button>
    </header>
  );
}

/** Progress ring drawn around the orb: elapsed time, or baseline progress. */
function Ring({ progress, tone }: { progress: number; tone: "measured" | "action" | "muted" }) {
  const r = 46;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`mx-ring mx-ring--${tone}`} viewBox="0 0 100 100" aria-hidden>
      <circle cx="50" cy="50" r={r} className="mx-ring__track" />
      <circle cx="50" cy="50" r={r} className="mx-ring__fill" strokeDasharray={c} strokeDashoffset={c * (1 - Math.max(0, Math.min(1, progress)))} />
    </svg>
  );
}

/**
 * The first screen is this and nothing else: one orb, one line, one action.
 * Everything else waits below the fold.
 */
function Hero() {
  const s = useStudyLoop();
  const { user } = useAuth();
  const { phase, config, elapsedMs, baselineProgress } = s.session;
  const orb = orbFor({ connection: s.reading.connection, phase, physio: s.physio, research: s.research });
  const banded = s.reading.connection === "connected";
  const total = config.minutes * 60_000;
  const first = user?.uid === "demo" ? "judge" : user?.displayName?.split(/\s+/)[0];
  const today = useSyncExternalStore(
    noSub,
    () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    () => "",
  );
  const last = s.summaries[0];
  const live = phase === "active" || phase === "paused";

  let title: React.ReactNode;
  let line: React.ReactNode;
  let ring = 0;
  let tone: "measured" | "action" | "muted" = "muted";
  if (phase === "baseline") {
    title = <span className="tnum">0:{String(Math.ceil(((1 - baselineProgress) * engine.baselineMs) / 1000)).padStart(2, "0")}</span>;
    line = "Capturing your baseline. Sit still.";
    ring = baselineProgress;
    tone = "measured";
  } else if (live) {
    title = <span className="tnum">{clock(Math.max(0, total - elapsedMs))}</span>;
    line = phase === "paused" ? "Paused" : banded ? PHYSIO_LABEL[s.physio] : "Timer only";
    ring = elapsedMs / total;
    tone = s.physio === "elevated" ? "action" : "measured";
  } else if (phase === "complete") {
    title = "Nice work";
    line = `${last?.minutes ?? 0} min · ${Math.round((last?.stableShare ?? 0) * 100)}% near baseline`;
    ring = 1;
    tone = "measured";
  } else {
    title = "Ready when you are";
    line = `${config.subject} · ${config.minutes} min · ${config.mode}`;
  }

  return (
    <section className={`mx-hero mx-hero--${phase}`} aria-label="Now">
      <p className="mx-hero__eyebrow">
        {today}
        {first ? ` · ${greeting()}, ${first}` : ""}
      </p>

      <div className="mx-hero__center">
        <div className="mx-hero__stage">
          <Ring progress={ring} tone={tone} />
          <StateOrb {...orb} size={168} density={1.6} dotScale={0.7} paused={phase === "paused"} />
        </div>
        <div className="mx-hero__copy">
          {live && <p className="mx-hero__kicker">{config.subject}</p>}
          <h1 className={`mx-hero__title ${live || phase === "baseline" ? "is-clock" : ""}`}>{title}</h1>
          <p className={`mx-hero__line ${live && s.physio === "elevated" ? "is-action" : ""}`}>{line}</p>
        </div>
      </div>

      <div className="mx-hero__cta">
        {phase === "idle" && (
          <>
            <button type="button" className="btn btn--primary mx-cta" onClick={startHere}>
              <Icon name="play" size={16} />
              {banded ? "Start session" : "Start without band"}
            </button>
            <div className="mx-hero__links">
              <button type="button" onClick={() => engine.setTab("session")}>
                Change session
              </button>
              {!banded && (
                <button type="button" onClick={engine.toggleConnection}>
                  Pair band
                </button>
              )}
            </div>
          </>
        )}
        {phase === "baseline" && (
          <div className="mx-hero__links">
            <button type="button" onClick={engine.end}>
              Cancel
            </button>
          </div>
        )}
        {live && (
          <div className="mx-controls">
            <button type="button" className="mx-round" onClick={engine.mark} disabled={phase === "paused"} aria-label="Mark this moment">
              <Icon name="flag" size={18} />
            </button>
            <button type="button" className={`btn ${phase === "paused" ? "btn--primary" : "btn--solid"} mx-cta`} onClick={engine.togglePause}>
              <Icon name={phase === "paused" ? "play" : "pause"} size={16} />
              {phase === "paused" ? "Resume" : "Pause"}
            </button>
            <button type="button" className="mx-round" onClick={engine.end} aria-label="End session">
              <Icon name="stop" size={18} />
            </button>
          </div>
        )}
        {phase === "complete" && (
          <>
            <button type="button" className="btn btn--primary mx-cta" onClick={() => engine.setTab("insights")}>
              Review session
              <Icon name="arrow" size={16} />
            </button>
            <div className="mx-hero__links">
              <button type="button" onClick={engine.newSession}>
                Start a new one
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

/** On the phone the hero becomes the live session, so starting stays on Today. */
function startHere() {
  engine.beginSession();
  engine.setTab("home");
}

/** Three equal tiles, same anatomy each: label, value, one-line note, trace. */
function Dial({ icon, label, value, sub, series, base, tone }: { icon: IconName; label: string; value: React.ReactNode; sub: string; series: (number | null)[]; base?: number | null; tone?: "action" }) {
  return (
    <div className={`mx-dial ${tone === "action" ? "is-action" : ""}`}>
      <p className="mx-dial__label">
        <Icon name={icon} size={13} />
        {label}
      </p>
      <p className="mx-dial__value tnum">{value}</p>
      <p className="mx-dial__sub">{sub}</p>
      <div className="mx-dial__spark">{series.filter((x) => x != null).length > 1 && <Sparkline values={series} baseline={base} height={20} pad={0.25} tone={tone ?? "measured"} />}</div>
    </div>
  );
}

function Dials() {
  const s = useStudyLoop();
  const on = s.reading.connection === "connected";
  const b = s.session.baseline;
  const d = edaDelta(s.reading.eda, b);
  const hr = on && s.reading.hr != null ? Math.round(s.reading.hr) : null;
  const recent = s.history.slice(-90);
  const elevated = on && s.physio === "elevated";
  return (
    <button type="button" className="mx-dials" onClick={() => engine.setTab("session")} aria-label="Live signals, open session">
      <Dial icon="heart" label="Heart" value={hr ?? "—"} sub={hr != null && b ? `${signedPercent((hr - b.hr) / b.hr)} vs base` : "bpm"} series={recent.map((x) => x.hr)} base={b?.hr} />
      <Dial
        icon="eda"
        label="Skin"
        value={d != null ? signedPercent(d) : on && s.reading.eda != null ? s.reading.eda.toFixed(1) : "—"}
        sub={d != null ? "vs base" : "µS"}
        series={recent.map((x) => x.eda)}
        base={b?.eda}
        tone={elevated ? "action" : undefined}
      />
      <Dial icon="baseline" label="State" value={on ? PHYSIO_LABEL[s.physio] : "—"} sub={on ? (b ? "vs baseline" : "no baseline") : "band offline"} series={[]} tone={elevated ? "action" : undefined} />
    </button>
  );
}

/** What's playing, with play and 40 Hz under your thumb. */
function SoundRow() {
  const p = useLoopPlayer();
  const beats = useGammaBeats();
  const live = LIVE.includes(useStudyLoop().session.phase);
  const title = p.playing ? p.loop?.name : beats ? "40 Hz beats" : p.loop ? p.loop.name : "Nothing playing";
  const sub = p.playing ? `${p.params?.bpm ?? "—"} BPM · following your band` : beats ? "Binaural on headphones" : "Turn your songs into beats";
  return (
    <div className="mx-row">
      <button type="button" className="mx-row__main" onClick={() => engine.setTab("music")} aria-label="Open Music">
        <span className={`mx-row__art ${p.playing || beats ? "is-on" : ""}`} aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="mx-row__text">
          <b>{title}</b>
          <span>{sub}</span>
        </span>
      </button>
      {p.loop && !beats && (
        <button type="button" className="mx-round" onClick={() => void vibeToggle()} aria-label={p.playing ? "Pause Loop" : "Play Loop"}>
          <Icon name={p.playing ? "pause" : "play"} size={16} />
        </button>
      )}
      {(live || beats) && (
        <button type="button" className={`mx-chip ${beats ? "is-on" : ""}`} onClick={toggleBeats} aria-pressed={beats}>
          40 Hz
        </button>
      )}
    </div>
  );
}

/** One soundtrack at a time: resuming a Loop ends the 40 Hz beats. */
async function vibeToggle() {
  if (gammaBeats.getSnapshot()) gammaBeats.stop();
  await vibeEngine.toggle();
}

function LastSessionRow() {
  const last = useStudyLoop().summaries[0];
  if (!last) return null;
  return (
    <button type="button" className="mx-row mx-row--link" onClick={() => engine.setTab("insights")} aria-label="Last session, open Insights">
      <span className="mx-row__art mx-row__art--stat tnum" aria-hidden>
        {Math.round(last.stableShare * 100)}
        <small>%</small>
      </span>
      <span className="mx-row__text">
        <b>
          {last.subject} · {last.minutes} min
        </b>
        <span>{last.isSample ? "Sample session" : last.dateLabel} · near baseline · {last.elevatedMoments} elevated</span>
      </span>
      <Icon name="arrow" size={16} className="mx-row__go" />
    </button>
  );
}

function ResearchRow() {
  return (
    <button type="button" className="mx-row mx-row--link mx-row--research" onClick={() => engine.setTab("research")} aria-label="Research, open">
      <span className="mx-row__art mx-row__art--research" aria-hidden>
        <Icon name="research" size={18} />
      </span>
      <span className="mx-row__text">
        <b>The signals behind focus</b>
        <span>Experimental research, with papers</span>
      </span>
      <Icon name="arrow" size={16} className="mx-row__go" />
    </button>
  );
}

/** Pinned above the tabs while a session runs and you're looking at something else. */
function LiveStrip() {
  const s = useStudyLoop();
  const { phase, config, elapsedMs } = s.session;
  const show = LIVE.includes(phase) && s.tab !== "session" && s.tab !== "home";
  const orb = orbFor({ connection: s.reading.connection, phase, physio: s.physio, research: s.research });
  return (
    <AnimatePresence>
      {show && (
        <motion.div className="mx-strip" initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}>
          <button type="button" className="mx-strip__main" onClick={() => engine.setTab("session")}>
            <StateOrb {...orb} size={28} dotScale={1} label="" />
            <span>
              <b className="tnum">{phase === "baseline" ? "Baseline" : clock(Math.max(0, config.minutes * 60_000 - elapsedMs))}</b>
              {config.subject}
            </span>
          </button>
          {phase !== "baseline" && (
            <button type="button" className="play-btn" onClick={engine.togglePause} aria-label={phase === "active" ? "Pause" : "Resume"}>
              <Icon name={phase === "active" ? "pause" : "play"} size={14} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Today", icon: "home" },
  { id: "session", label: "Session", icon: "session" },
  { id: "insights", label: "Insights", icon: "insights" },
  { id: "music", label: "Music", icon: "music" },
  { id: "profile", label: "You", icon: "user" },
];

function TabBar() {
  const s = useStudyLoop();
  const live = LIVE.includes(s.session.phase);
  return (
    <nav className="mx-tabs" aria-label="Primary">
      {TABS.map((t) => {
        const on = s.tab === t.id || (t.id === "home" && s.tab === "research");
        return (
          <button key={t.id} type="button" className={`mx-tab ${on ? "is-on" : ""}`} onClick={() => engine.setTab(t.id)} aria-current={on ? "page" : undefined}>
            {on && <motion.span layoutId="mx-tab-pill" className="mx-tab__pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
            <span className="mx-tab__icon">
              <Icon name={t.icon} size={20} />
              {t.id === "session" && live && <i className="mx-tab__live" aria-label="Session running" />}
            </span>
            <span className="mx-tab__label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Detail lives in a sheet above the tabs: drag down or tap outside to go back to Today. */
function Sheet() {
  const { tab, session } = useStudyLoop();
  const drag = useDragControls();
  const open = tab !== "home";
  const views: Record<Exclude<Tab, "home">, [React.ReactNode, React.ReactNode]> = {
    session: [<SessionView key="v" />, <SessionFoot key="f" />],
    insights: [<InsightsView key="v" />, <InsightsFoot key="f" />],
    research: [<ResearchView key="v" />, <ResearchFoot key="f" />],
    music: [<MusicView key="v" />, <MusicFoot key="f" />],
    profile: [<ProfileView key="v" />, <ProfileFoot key="f" />],
  };
  const live = session.phase === "active" || session.phase === "baseline";

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="m-scrim mx-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => engine.setTab("home")} />
          <motion.div
            key="sheet"
            className="m-sheet mx-sheet"
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
              <button type="button" className="icon-btn" aria-label="Back to Today" onClick={() => engine.setTab("home")}>
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
                  transition={{ duration: 0.25 }}
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
  const ready = useIntroDone();
  return (
    <div className="mx">
      <TopBar />
      {ready && (
        <main className="mx-today">
          <motion.div {...rise(0)}>
            <Hero />
          </motion.div>
          <section className="mx-below" aria-label="Today">
            <h2 className="mx-section">Today</h2>
            <Dials />
            <h2 className="mx-section">Listening</h2>
            <SoundRow />
            <h2 className="mx-section">Recent</h2>
            <div className="mx-list">
              <LastSessionRow />
              <ResearchRow />
            </div>
            <p className="mx-fine">StudyLoop is a study tool, not a medical device. It measures heart rate and skin conductance; it never scores your focus or stress.</p>
          </section>
        </main>
      )}
      <Sheet />
      <LiveStrip />
      <TabBar />
    </div>
  );
}
