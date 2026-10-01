"use client";

import { useSyncExternalStore } from "react";
import { vibeEngine } from "@/lib/music/vibe/engine";
import type { VibeProfile } from "@/lib/music/vibe/profile";
import type { PhysioState } from "@/lib/sensors/classify";
import { engine } from "@/lib/useStudyLoop";

// Loops follow the band wherever you are in the app.
if (typeof window !== "undefined") {
  engine.subscribe(() => vibeEngine.setState(engine.getSnapshot().physio));
}

export function useLoopPlayer() {
  return useSyncExternalStore(vibeEngine.subscribe, vibeEngine.getSnapshot, vibeEngine.getSnapshot);
}

export const FEEL: Record<VibeProfile["drumFeel"], string> = {
  lofi: "Lo-fi groove",
  dholak_groove: "Dholak groove",
  boom_bap: "Boom-bap",
  downtempo: "Downtempo",
  ambient: "Ambient",
};

export const STATE_WORD: Record<PhysioState, string> = {
  stable: "You're steady",
  changing: "Something's shifting",
  elevated: "Stress is rising",
  recovering: "You're settling",
  poor: "Band signal is weak",
  none: "No band connected",
};

export const nice = (s: string) => s.replace(/_/g, " ");

/** "romantic" + dholak → "Romantic Dholak Groove". */
export function loopName(p: VibeProfile): string {
  const mood = p.moods[0] ?? "Focus";
  return `${mood[0].toUpperCase()}${mood.slice(1)} ${FEEL[p.drumFeel].replace(/(^|\s)\w/g, (c) => c.toUpperCase())}`;
}
