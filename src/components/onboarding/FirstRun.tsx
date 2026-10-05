"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { isDemo, startDemo } from "@/lib/demo";
import { useIntroDone } from "@/lib/intro";
import { useStudyLoop } from "@/lib/useStudyLoop";
import { HowItWorks, TAGLINE } from "../ui/HowItWorks";
import { Icon } from "../ui/Icon";

const SEEN_KEY = "sl-seen-how";

function seen() {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * First visit: before the dashboard's numbers mean anything, StudyLoop in
 * eight seconds. Three beats that play themselves, then out of the way for good.
 */
export function FirstRun() {
  const introDone = useIntroDone();
  const { recovery } = useStudyLoop();
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const okBtn = useRef<HTMLButtonElement>(null);

  // Never on top of the tour (it explains everything) or the crash prompt.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first-visit flag lives in the browser
    if (introDone && !recovery && !isDemo() && !seen()) setOpen(true);
  }, [introDone, recovery]);

  useEffect(() => {
    if (open) okBtn.current?.focus();
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
  }, []);
  const finish = useCallback(() => setDone(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="prompt-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div
            className="prompt prompt--how"
            role="dialog"
            aria-modal="true"
            aria-labelledby="how-title"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <p className="prompt__kicker">New here? StudyLoop in 8 seconds</p>
            <h2 id="how-title" className="prompt__title prompt__title--lg">
              {TAGLINE}
            </h2>
            <HowItWorks auto onDone={finish} />
            <div className="prompt__actions">
              <button ref={okBtn} type="button" className="btn btn--primary" onClick={close}>
                {done ? "Got it, let’s study" : "Skip"}
                {done && <Icon name="arrow" size={16} />}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => {
                  close();
                  startDemo();
                }}
              >
                <Icon name="play" size={14} />
                2-minute guided tour
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
