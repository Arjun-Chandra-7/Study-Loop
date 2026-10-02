"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { clock } from "@/lib/format";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../ui/Icon";

/**
 * Sessions survive a reload: once we know who's signed in, their finished
 * sessions come back, and a session that was running asks to be continued.
 */
export function SessionRecovery() {
  const { user } = useAuth();
  const { recovery } = useStudyLoop();
  const firstBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    engine.attachUser(user?.uid ?? null);
  }, [user?.uid]);

  useEffect(() => {
    if (recovery) firstBtn.current?.focus();
  }, [recovery]);

  const left = recovery ? Math.max(0, recovery.config.minutes * 60_000 - recovery.elapsedMs) : 0;

  return (
    <AnimatePresence>
      {recovery && (
        <motion.div className="prompt-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="prompt"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="recovery-title"
            aria-describedby="recovery-body"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <span className="prompt__icon prompt__icon--action" aria-hidden>
              <Icon name="alert" size={18} />
            </span>
            <h2 id="recovery-title" className="prompt__title">
              Your app crashed while playing a session.
            </h2>
            <p id="recovery-body" className="prompt__body">
              Do you want to continue? <b>{recovery.config.subject}</b> · {recovery.config.topic}
              {recovery.phase === "baseline"
                ? " was still taking its baseline, so that part starts over."
                : ` — ${clock(recovery.elapsedMs)} studied, ${clock(left)} to go.`}
            </p>
            <div className="prompt__actions">
              <button ref={firstBtn} type="button" className="btn btn--primary" onClick={engine.resumeRecovered}>
                <Icon name="play" size={16} />
                Continue session
              </button>
              <button type="button" className="btn btn--ghost" onClick={engine.endRecovered}>
                End & save it
              </button>
            </div>
            <button type="button" className="prompt__never" onClick={engine.discardRecovered}>
              Discard this session
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
