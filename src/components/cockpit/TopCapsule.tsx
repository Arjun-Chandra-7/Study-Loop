"use client";

import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../ui/Icon";

/**
 * Compact system controls — not navigation. They act on the band and
 * the session; the bottom nav changes what you're looking at.
 */
export function TopCapsule() {
  const s = useStudyLoop();
  const conn = s.reading.connection;
  const phase = s.session.phase;

  const sessionLabel =
    phase === "active" ? "Pause session" : phase === "paused" ? "Resume session" : "Open session";

  return (
    <div className="top-capsule glass" role="toolbar" aria-label="System controls">
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
        label={s.quiet ? "Leave quiet mode" : "Quiet mode"}
        onClick={engine.toggleQuiet}
        pressed={s.quiet}
        tone="neutral"
      >
        <Icon name="moon" />
      </CapsuleButton>
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
