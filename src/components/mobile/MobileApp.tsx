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
import { edaDelta, PHYSIO_HINT, PHYSIO_LABEL } from "@/lib/sensors/classify";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Sparkline } from "../charts/Sparkline";
import { orbFor } from "../orb/orbState";
import { StateOrb } from "../orb/StateOrb";
import { toggleBeats } from "../session/SessionPrompts";
import { Avatar } from "../ui/Avatar";
import { Icon, type IconName } from "../ui/Icon";
import { Logo } from "../ui/Logo";
import { StateBadge } from "../ui/StateBadge";
import { InsightsFoot, InsightsView } from "../views/InsightsView";
import { MusicFoot, MusicView } from "../views/MusicView";
import { ProfileFoot, ProfileView } from "../views/ProfileView";
import { ResearchFoot, ResearchView } from "../views/ResearchView";
import { SessionFoot, SessionView } from "../views/SessionView";
import "./mobile.css";

/*
 * Phone layout, built on patterns from the best health and focus apps:
 *  - one scrolling "Today" screen, not swipe-tabs (Whoop's 2025 home);
 *  - a hero card that is the one thing that matters right now (Oura's Today);
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
            SL-01 <span className="tnum">{r.battery ?? "—"}%</span>
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

/** The one thing that matters right now: start, the live session, or what just happened. */
function Hero() {
  const s = useStudyLoop();
  const { phase, config, elapsedMs, baselineProgress } = s.session;
  const orb = orbFor({ connection: s.reading.connection, phase, physio: s.physio, research: s.research });
  const banded = s.reading.connection === "connected";
  const total = config.minutes * 60_000;

  if (phase === "baseline") {
    const left = Math.ceil(((1 - baselineProgress) * engine.baselineMs) / 1000);
    return (
      <section className="mx-hero mx-hero--baseline" aria-label="Capturing baseline">
        <div className="mx-hero__row">
          <StateOrb {...orb} size={84} density={1.4} dotScale={0.7} />
          <div className="mx-hero__text">
            <p className="mx-kicker">Capturing baseline</p>
            <p className="mx-hero__big tnum">0:{String(left).padStart(2, "0")}</p>
            <p className="mx-hero__sub">Sit still and breathe normally.</p>
          </div>
        </div>
        <div className="mx-progress" aria-hidden>
          <span style={{ transform: `scaleX(${baselineProgress})` }} />
        </div>
        <div className="mx-hero__actions">
          <button type="button" className="btn btn--ghost" onClick={engine.end}>
            Cancel
          </button>
        </div>
      </section>
    );
  }

  if (phase === "active" || phase === "paused") {
    const paused = phase === "paused";
    return (
      <section className={`mx-hero mx-hero--live ${paused ? "is-paused" : ""}`} aria-label="Session in progress">
        <div className="mx-hero__row">
          <StateOrb {...orb} size={84} density={1.8} dotScale={0.75} paused={paused} />
          <div className="mx-hero__text">
            <p className="mx-kicker">
              {config.subject} · {config.mode}
            </p>
            <p className="mx-hero__big tnum">{clock(Math.max(0, total - elapsedMs))}</p>
            {paused ? <span className="state state--paused">Paused</span> : banded ? <StateBadge state={s.physio} /> : <p className="mx-hero__sub">Timer only · no band</p>}
          </div>
        </div>
        <div className="mx-progress" aria-hidden>
          <span style={{ transform: `scaleX(${Math.min(1, elapsedMs / total)})` }} />
        </div>
        <div className="mx-hero__actions">
          <button type="button" className={`btn ${paused ? "btn--primary" : "btn--solid"} mx-grow`} onClick={engine.togglePause}>
            <Icon name={paused ? "play" : "pause"} size={16} />
            {paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="btn btn--ghost mx-square" onClick={engine.mark} disabled={paused} aria-label="Mark this moment">
            <Icon name="flag" size={16} />
          </button>
          <button type="button" className="btn btn--ghost mx-square" onClick={engine.end} aria-label="End session">
            <Icon name="stop" size={16} />
          </button>
        </div>
      </section>
    );
  }

  if (phase === "complete") {
    const last = s.summaries[0];
    return (
      <section className="mx-hero mx-hero--done" aria-label="Session complete">
        <p className="mx-kicker">Session complete · {last?.subject}</p>
        <div className="mx-stats">
          <p>
            <b className="tnum">{last?.minutes ?? 0}</b>
            <span>minutes</span>
          </p>
          <p>
            <b className="tnum">{Math.round((last?.stableShare ?? 0) * 100)}%</b>
            <span>near baseline</span>
          </p>
          <p>
            <b className="tnum">{last?.elevatedMoments ?? 0}</b>
            <span>elevated</span>
          </p>
        </div>
        <div className="mx-hero__actions">
          <button type="button" className="btn btn--primary mx-grow" onClick={() => engine.setTab("insights")}>
            Review session
            <Icon name="arrow" size={16} />
          </button>
          <button type="button" className="btn btn--ghost" onClick={engine.newSession}>
            New
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-hero" aria-label="Next session">
      <div className="mx-hero__row">
        <StateOrb {...orb} size={84} density={1.2} dotScale={0.7} />
        <div className="mx-hero__text">
          <p className="mx-kicker">Next session</p>
          <p className="mx-hero__title">{config.subject}</p>
          <p className="mx-hero__sub">
            {config.topic} · {config.minutes} min · {config.mode}
          </p>
        </div>
      </div>
      <div className="mx-hero__actions">
        <button type="button" className="btn btn--primary mx-grow" onClick={startHere}>
          <Icon name="play" size={16} />
          {banded ? "Start session" : "Start without band"}
        </button>
        <button type="button" className="btn btn--ghost mx-square" onClick={() => engine.setTab("session")} aria-label="Change subject, length and mode">
          <Icon name="sliders" size={16} />
        </button>
      </div>
      {!banded && (
        <button type="button" className="mx-hint" onClick={engine.toggleConnection}>
          <Icon name="band" size={14} />
          Pair your band to see heart rate and skin conductance
        </button>
      )}
    </section>
  );
}

/** On the phone the hero becomes the live session, so starting stays on Today. */
function startHere() {
  engine.beginSession();
  engine.setTab("home");
}

function Dial({ icon, label, value, sub, series, base, tone }: { icon: IconName; label: string; value: React.ReactNode; sub: string; series?: (number | null)[]; base?: number | null; tone?: "action" }) {
  return (
    <div className={`mx-dial ${tone === "action" ? "is-action" : ""}`}>
      <p className="mx-dial__label">
        <Icon name={icon} size={13} />
        {label}
      </p>
      <p className="mx-dial__value tnum">{value}</p>
      <p className="mx-dial__sub">{sub}</p>
      {series && series.length > 1 && <Sparkline values={series} baseline={base} height={22} pad={0.25} className="mx-dial__spark" tone={tone ?? "measured"} />}
    </div>
  );
}

/** Three glanceable numbers, Whoop-style: the answer first, the detail a tap away. */
function Dials() {
  const s = useStudyLoop();
  const on = s.reading.connection === "connected";
  const b = s.session.baseline;
  const d = edaDelta(s.reading.eda, b);
  const hr = on && s.reading.hr != null ? Math.round(s.reading.hr) : null;
  const recent = s.history.slice(-90);
  const elevated = s.physio === "elevated";
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
      <Dial icon="baseline" label="State" value={on ? PHYSIO_LABEL[s.physio] : "Offline"} sub={on ? (b ? "vs your baseline" : "no baseline yet") : "pair to see"} tone={elevated ? "action" : undefined} />
    </button>
  );
}

function Card({ onClick, label, children, className = "" }: { onClick: () => void; label: string; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" className={`mx-card ${className}`} onClick={onClick} aria-label={label}>
      {children}
      <Icon name="arrow" size={16} className="mx-card__go" />
    </button>
  );
}

function SignalCard() {
  const s = useStudyLoop();
  const on = s.reading.connection === "connected";
  const recent = s.history.slice(-300);
  return (
    <Card onClick={() => engine.setTab("session")} label="Signal trend, open session" className="mx-card--chart">
      <div className="mx-card__head">
        <p className="mx-card__title">Signal · last 5 min</p>
        {on && <StateBadge state={s.physio} />}
      </div>
      {recent.length > 4 ? (
        <div className="mx-card__charts">
          <Sparkline values={recent.map((x) => x.hr)} baseline={s.session.baseline?.hr} height={34} pad={0.25} />
          <Sparkline values={recent.map((x) => x.eda)} baseline={s.session.baseline?.eda} height={34} pad={0.25} />
        </div>
      ) : (
        <p className="mx-card__empty">{on ? "Collecting… the trace fills in over a few seconds." : "Pair your band to see heart rate and skin conductance over time."}</p>
      )}
      <p className="mx-card__foot">{on ? PHYSIO_HINT[s.physio] : "Heart rate above · skin conductance below"}</p>
    </Card>
  );
}

/** What's playing, with the controls under your thumb. */
function SoundCard() {
  const p = useLoopPlayer();
  const beats = useGammaBeats();
  const live = LIVE.includes(useStudyLoop().session.phase);
  const title = p.playing ? p.loop?.name : beats ? "40 Hz beats" : p.loop ? p.loop.name : "Nothing playing";
  const sub = p.playing ? `Loop · ${p.params?.bpm ?? "—"} BPM, following your band` : beats ? "Binaural on headphones, pulsed on speakers" : "Make a Loop from any Spotify playlist";
  return (
    <div className="mx-sound">
      <button type="button" className="mx-sound__main" onClick={() => engine.setTab("music")} aria-label="Open Music">
        <span className={`mx-sound__art ${p.playing || beats ? "is-on" : ""}`} aria-hidden>
          <i />
          <i />
          <i />
          <i />
        </span>
        <span className="mx-sound__text">
          <b>{title}</b>
          <span>{sub}</span>
        </span>
      </button>
      {p.loop && !beats && (
        <button type="button" className="play-btn mx-sound__play" onClick={() => void vibeToggle()} aria-label={p.playing ? "Pause Loop" : "Play Loop"}>
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

function LastSessionCard() {
  const s = useStudyLoop();
  const last = s.summaries[0];
  if (!last) return null;
  return (
    <Card onClick={() => engine.setTab("insights")} label="Last session, open Insights" className="mx-card--last">
      <div className="mx-card__head">
        <p className="mx-card__title">{last.isSample ? "Sample session" : `Last session · ${last.dateLabel}`}</p>
      </div>
      <p className="mx-card__name">
        <b>{last.subject}</b> {last.topic}
      </p>
      <div className="mx-stats mx-stats--sm">
        <p>
          <b className="tnum">{last.minutes}m</b>
          <span>length</span>
        </p>
        <p>
          <b className="tnum">{Math.round(last.stableShare * 100)}%</b>
          <span>near base</span>
        </p>
        <p>
          <b className="tnum">{last.elevatedMoments}</b>
          <span>elevated</span>
        </p>
        <p>
          <b className="tnum">{last.marks}</b>
          <span>marks</span>
        </p>
      </div>
    </Card>
  );
}

function ResearchCard() {
  return (
    <Card onClick={() => engine.setTab("research")} label="Research, open" className="mx-card--research">
      <div className="mx-card__head">
        <p className="mx-card__title">Research</p>
        <span className="chip chip--action-outline">Experimental</span>
      </div>
      <p className="mx-card__name">
        <b>The signals behind focus</b> Theta, alpha, gamma and 40 Hz, with the papers behind each.
      </p>
    </Card>
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
  const s = useStudyLoop();
  const ready = useIntroDone();
  const { user } = useAuth();
  const first = user?.uid === "demo" ? "judge" : user?.displayName?.split(/\s+/)[0];
  const today = useSyncExternalStore(
    noSub,
    () => new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" }),
    () => "",
  );
  const phase = s.session.phase;
  const status =
    phase === "active"
      ? `Studying ${s.session.config.subject}. ${clock(s.session.elapsedMs)} in.`
      : phase === "paused"
        ? "Paused. Pick it up when you're ready."
        : phase === "baseline"
          ? "Learning your baseline for today."
          : phase === "complete"
            ? "Nice work. Here's how it went."
            : "Ready when you are.";

  return (
    <div className="mx">
      <TopBar />
      {ready && (
        <main className="mx-today">
          <motion.section className="mx-greet" {...rise(0)}>
            <p className="mx-date">{today}</p>
            <h1>
              {greeting()}
              {first ? `, ${first}` : ""}
            </h1>
            <p className="mx-status">{status}</p>
          </motion.section>
          <motion.div {...rise(1)}>
            <Hero />
          </motion.div>
          <motion.div {...rise(2)}>
            <Dials />
          </motion.div>
          <motion.div {...rise(3)}>
            <SoundCard />
          </motion.div>
          <motion.div {...rise(4)}>
            <SignalCard />
          </motion.div>
          <motion.div {...rise(5)}>
            <LastSessionCard />
          </motion.div>
          <motion.div {...rise(6)}>
            <ResearchCard />
          </motion.div>
          <p className="mx-fine">StudyLoop is a study tool, not a medical device. It measures heart rate and skin conductance; it never scores your focus or stress.</p>
        </main>
      )}
      <Sheet />
      <LiveStrip />
      <TabBar />
    </div>
  );
}
