"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { gammaBeats } from "@/lib/music/gamma";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { getPrefs, setPref } from "@/lib/prefs";
import { engine } from "@/lib/useStudyLoop";
import { Icon } from "../ui/Icon";

type Prompt = "music" | "beats-conflict" | null;

let open: Prompt = null;
const listeners = new Set<() => void>();
function show(p: Prompt) {
  open = p;
  listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/**
 * The session's 40 Hz beats button. Stops beats if they're on; if a Loop is
 * playing, asks before pausing it (unless told not to ask again).
 */
export function toggleBeats() {
  if (gammaBeats.getSnapshot()) return gammaBeats.stop();
  if (vibeEngine.getSnapshot().playing) {
    if (!getPrefs().autoPauseForBeats) return show("beats-conflict");
    vibeEngine.stop();
  }
  void gammaBeats.start();
}

if (typeof window !== "undefined") {
  let phase = engine.getSnapshot().session.phase;
  engine.subscribe(() => {
    const next = engine.getSnapshot().session.phase;
    const prev = phase;
    phase = next;
    if (next === prev) return;
    // A session just started with nothing playing: offer a Loop.
    const started = (prev === "idle" || prev === "complete") && (next === "baseline" || next === "active");
    if (started && getPrefs().askMusicOnStart && !vibeEngine.getSnapshot().playing && !gammaBeats.getSnapshot()) {
      show("music");
    }
    // Beats belong to a session: they stop when it ends.
    if (next === "idle" || next === "complete") gammaBeats.stop();
  });
  // One soundtrack at a time: starting a Loop ends the beats.
  vibeEngine.subscribe(() => {
    if (vibeEngine.getSnapshot().playing) gammaBeats.stop();
  });
}

export function SessionPrompts() {
  const prompt = useSyncExternalStore(subscribe, () => open, () => null);
  // Uncontrolled: the dialog remounts each time it opens, so it always starts unticked.
  const dontAsk = useRef<HTMLInputElement>(null);
  const firstBtn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!prompt) return;
    firstBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && show(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prompt]);

  return (
    <AnimatePresence>
      {prompt && (
        <motion.div
          className="prompt-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={(e) => e.target === e.currentTarget && show(null)}
        >
          <motion.div
            className="prompt"
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-title"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
          >
            <span className="prompt__icon" aria-hidden>
              <Icon name="music" size={18} />
            </span>
            {prompt === "music" ? (
              <>
                <h2 id="prompt-title" className="prompt__title">
                  Hey, we see you’re not listening to any Loop.
                </h2>
                <p className="prompt__body">Want us to play some constructive beats for you?</p>
                <div className="prompt__actions">
                  <button
                    ref={firstBtn}
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      show(null);
                      engine.setTab("music");
                    }}
                  >
                    Yes, play my playlist
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => show(null)}>
                    No
                  </button>
                </div>
                <button
                  type="button"
                  className="prompt__never"
                  onClick={() => {
                    setPref("askMusicOnStart", false);
                    show(null);
                  }}
                >
                  Don’t ask me again
                </button>
              </>
            ) : (
              <>
                <h2 id="prompt-title" className="prompt__title">
                  Hey, you’ve already got some beats flowing.
                </h2>
                <p className="prompt__body">Maybe want to pause that first? Then we’ll start the 40 Hz beats.</p>
                <label className="prompt__check">
                  <input ref={dontAsk} type="checkbox" />
                  Don’t ask me again
                </label>
                <div className="prompt__actions">
                  <button
                    ref={firstBtn}
                    type="button"
                    className="btn btn--primary"
                    onClick={() => {
                      if (dontAsk.current?.checked) setPref("autoPauseForBeats", true);
                      show(null);
                      vibeEngine.stop();
                      void gammaBeats.start();
                    }}
                  >
                    Yes, pause
                  </button>
                  <button type="button" className="btn btn--ghost" onClick={() => show(null)}>
                    Cancel
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
