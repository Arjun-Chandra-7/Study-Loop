"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef } from "react";
import type { Tab } from "@/lib/engine";
import { useIntroDone } from "@/lib/intro";
import { useEngineLifecycle, useStudyLoop } from "@/lib/useStudyLoop";
import { HomeFoot, HomeView } from "../views/HomeView";
import { InsightsFoot, InsightsView } from "../views/InsightsView";
import { ProfileFoot, ProfileView } from "../views/ProfileView";
import { ResearchFoot, ResearchView } from "../views/ResearchView";
import { SessionFoot, SessionView } from "../views/SessionView";
import { Dock } from "./Dock";
import { PlayerCard, ProfilePill, ResearchCard, TrendCard } from "./LowerCards";
import { BaselineCard, EdaCard, HeartRateCard, SignalCard } from "./MetricCards";
import { Logo } from "../ui/Logo";
import { StatusCapsule } from "./StatusCapsule";
import { TopCapsule } from "./TopCapsule";

const viewMotion = {
  initial: { opacity: 0, y: 8, filter: "blur(4px)" },
  animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: { opacity: 0, y: -8, filter: "blur(4px)" },
  transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] as const },
};

/** Staggered entrance: each piece of the chassis pops in after the frame. */
const pop = (i: number, ready: boolean) => ({
  initial: { opacity: 0, y: 28, scale: 0.94, filter: "blur(6px)" },
  animate: ready ? { opacity: 1, y: 0, scale: 1, filter: "blur(0px)" } : undefined,
  transition: { delay: 0.25 + i * 0.07, type: "spring" as const, stiffness: 160, damping: 20 },
});

const FOOTS: Record<Tab, () => React.ReactNode> = {
  home: HomeFoot,
  session: SessionFoot,
  insights: InsightsFoot,
  research: ResearchFoot,
  profile: ProfileFoot,
};

/**
 * The cockpit follows the locked wireframe:
 *
 *   ┌─────────────── main (L-shaped) ─────────────┬ notch-tr ┐
 *   │                                             └──────────┤
 *   ├ notch-bl ┐                  main-foot                  │
 *   ├ C │ D    │ player │ trend │ research                   │
 *   └ profile  ┘        (nav)   │ research                   ┘
 */
export function Cockpit() {
  useEngineLifecycle();
  const ready = useIntroDone();
  const s = useStudyLoop();
  const stageRef = useRef<HTMLDivElement>(null);
  const phase = s.session.phase;
  const live = s.tab === "session" && (phase === "active" || phase === "paused" || phase === "baseline");
  const Foot = FOOTS[s.tab];

  return (
    <div className="cockpit-shell">
      <motion.div
        className="cockpit"
        initial={{ opacity: 0, scale: 0.97, y: 24 }}
        animate={ready ? { opacity: 1, scale: 1, y: 0 } : undefined}
        transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
        data-tab={s.tab} data-live={live || undefined} data-quiet={s.quiet || undefined}>
        <motion.div
          className="top-capsule-wrap"
          initial={{ y: -40, opacity: 0 }}
          animate={ready ? { y: 0, opacity: 1 } : undefined}
          transition={{ delay: 0.5, type: "spring", stiffness: 200, damping: 20 }}
        >
          <TopCapsule />
        </motion.div>

        {/* Mobile header replaces the top capsule + notch composition. */}
        <header className="m-header">
          <Logo />
          <StatusCapsule />
        </header>

        <motion.div
          className="main"
          ref={stageRef}
          aria-live="off"
          initial={{ opacity: 0, clipPath: "inset(0% 0% 100% 0% round 20px)" }}
          animate={ready ? { opacity: 1, clipPath: "inset(0% 0% 0% 0% round 20px)" } : undefined}
          transition={{ delay: 0.05, duration: 1.1, ease: [0.65, 0, 0.35, 1] }}
        >
          <div className="main__chip">
            <Logo size="sm" />
            {live && <span className="rec" aria-label="Session live">Live</span>}
          </div>

          <div className="notch notch--tr">
            <StatusCapsule />
          </div>

          <div className="stage">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={s.tab} className="view" {...viewMotion}>
                {s.tab === "home" && <HomeView stageRef={stageRef} />}
                {s.tab === "session" && <SessionView />}
                {s.tab === "insights" && <InsightsView />}
                {s.tab === "research" && <ResearchView />}
                {s.tab === "profile" && <ProfileView />}
              </motion.div>
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="main-foot">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={s.tab} className="main-foot__inner" {...viewMotion}>
              <Foot />
            </motion.div>
          </AnimatePresence>
        </div>

        <motion.div className="notch notch--bl" {...pop(1, ready)}>
          <HeartRateCard />
          <EdaCard />
        </motion.div>
        <motion.div className="area-c" {...pop(2, ready)}>
          <SignalCard />
        </motion.div>
        <motion.div className="area-d" {...pop(3, ready)}>
          <BaselineCard />
        </motion.div>
        <motion.div className="area-player" {...pop(4, ready)}>
          <PlayerCard />
        </motion.div>
        <motion.div className="area-trend" {...pop(5, ready)}>
          <TrendCard />
        </motion.div>
        <motion.div className="area-research" {...pop(6, ready)}>
          <ResearchCard />
        </motion.div>
        <motion.div className="area-profile" {...pop(7, ready)}>
          <ProfilePill />
        </motion.div>

        <motion.div className="dock-wrap" initial={{ y: 60, opacity: 0 }} animate={ready ? { y: 0, opacity: 1 } : undefined} transition={{ delay: 0.6, type: "spring", stiffness: 200, damping: 20 }}>
          <Dock />
        </motion.div>
      </motion.div>
    </div>
  );
}
