import type { OrbState } from "thinking-orbs";
import type { SessionPhase } from "@/lib/engine";
import type { PhysioState } from "@/lib/sensors/classify";
import type { ConnectionState } from "@/lib/sensors/types";

export interface OrbSpec {
  state: OrbState;
  /** multiplier on the preset speed; ≤ 0.6 at rest so it can stay open for an hour */
  speed: number;
  color: string;
  label: string;
}

const TEAL = "#14B8A6";
const CORAL = "#FF6B5A";
const IVORY = "#B7C4C1";

/**
 * The orb shows SYSTEM STATE — connection, calibration, and how the measured
 * signal compares to baseline. It is never a picture of brain activity.
 */
export function orbFor(input: {
  connection: ConnectionState;
  phase: SessionPhase;
  physio: PhysioState;
  research: boolean;
}): OrbSpec {
  const { connection, phase, physio, research } = input;
  if (connection === "disconnected") return { state: "breathing", speed: 0.3, color: IVORY, label: "Band offline" };
  if (connection === "connecting") return { state: "connecting", speed: 0.8, color: TEAL, label: "Pairing with band" };
  if (physio === "poor") return { state: "searching", speed: 0.6, color: IVORY, label: "Looking for a clean signal" };
  if (phase === "baseline") return { state: "connecting", speed: 0.55, color: TEAL, label: "Capturing baseline" };
  if (phase === "paused") return { state: "breathing", speed: 0.25, color: IVORY, label: "Session paused" };
  if (phase === "complete") return { state: "breathing", speed: 0.35, color: TEAL, label: "Session complete" };
  if (phase === "active") {
    if (research) return { state: "listening", speed: 0.7, color: CORAL, label: "Research protocol layer active" };
    switch (physio) {
      case "elevated":
        return { state: "working", speed: 1.05, color: CORAL, label: "Signals elevated" };
      case "changing":
        return { state: "working", speed: 0.75, color: TEAL, label: "Signals changing" };
      case "recovering":
        return { state: "breathing", speed: 0.6, color: TEAL, label: "Signals recovering" };
      default:
        return { state: "working", speed: 0.5, color: TEAL, label: "Signals stable" };
    }
  }
  return { state: "breathing", speed: 0.45, color: TEAL, label: "Ready" };
}
