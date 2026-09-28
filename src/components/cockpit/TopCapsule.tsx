"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../ui/Icon";
import { SimPanel } from "./SimPanel";

/**
 * Five compact system controls — not navigation. They act on the band and
 * the session; the bottom nav changes what you're looking at.
 */
export function TopCapsule() {
  const s = useStudyLoop();
  const [simOpen, setSimOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const conn = s.reading.connection;
  const phase = s.session.phase;

  useEffect(() => {
    if (!simOpen) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setSimOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSimOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [simOpen]);

  const sessionLabel =
    phase === "active" ? "Pause session" : phase === "paused" ? "Resume session" : "Open session";

  return (
    <div className="top-capsule glass" ref={ref} role="toolbar" aria-label="System controls">
      <CapsuleButton
        label={conn === "connected" ? "Disconnect band" : conn === "connecting" ? "Connecting…" : "Connect band"}
        onClick={engine.toggleConnection}
        pressed={conn === "connected"}
        tone="measured"
      >
        <Icon name="band" />
        <span className={`cap-dot cap-dot--${conn}`} aria-hidden />
      </CapsuleButton>
      <CapsuleButton label={sessionLabel} onClick={engine.togglePause} pressed={phase === "active"} tone="action">
        <Icon name={phase === "active" ? "pause" : "play"} />
      </CapsuleButton>
      <CapsuleButton
        label={s.research ? "Hide research layer" : "Show research layer"}
        onClick={engine.toggleResearch}
        pressed={s.research}
        tone="action"
      >
        <Icon name="wave" />
      </CapsuleButton>
      <CapsuleButton
        label="Band simulator"
        onClick={() => setSimOpen((o) => !o)}
        pressed={simOpen}
        tone="neutral"
        expanded={simOpen}
      >
        <Icon name="sliders" />
      </CapsuleButton>
      <CapsuleButton
        label={s.quiet ? "Leave quiet mode" : "Quiet mode"}
        onClick={engine.toggleQuiet}
        pressed={s.quiet}
        tone="neutral"
      >
        <Icon name="moon" />
      </CapsuleButton>

      <AnimatePresence>
        {simOpen && (
          <motion.div
            className="popover glass"
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 400, damping: 34 }}
          >
            <SimPanel compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CapsuleButton({
  label,
  onClick,
  pressed,
  tone,
  expanded,
  children,
}: {
  label: string;
  onClick: () => void;
  pressed: boolean;
  tone: "measured" | "action" | "neutral";
  expanded?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={`cap-btn cap-btn--${tone}`}
      aria-label={label}
      aria-pressed={expanded === undefined ? pressed : undefined}
      aria-expanded={expanded}
      data-on={pressed || undefined}
      data-tip={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
