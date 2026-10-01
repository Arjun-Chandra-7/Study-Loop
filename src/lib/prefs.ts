"use client";

import { useSyncExternalStore } from "react";
import { PALETTES, PREFS_KEY, paletteVars, type Palette, type PaletteId } from "./palettes";

export interface Prefs {
  palette: PaletteId;
  /** Offer a Loop when a session starts with no music on. */
  askMusicOnStart: boolean;
  /** Starting 40 Hz beats while a Loop plays: pause the Loop without asking. */
  autoPauseForBeats: boolean;
}

const DEFAULTS: Prefs = { palette: "track", askMusicOnStart: true, autoPauseForBeats: false };

function read(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") as Partial<Prefs>;
    const palette = raw.palette && raw.palette in PALETTES ? raw.palette : DEFAULTS.palette;
    return { ...DEFAULTS, ...raw, palette };
  } catch {
    return DEFAULTS;
  }
}

let prefs: Prefs = DEFAULTS;
let loaded = false;
const listeners = new Set<() => void>();

function current() {
  if (!loaded && typeof window !== "undefined") {
    loaded = true;
    prefs = read();
  }
  return prefs;
}

function apply(id: PaletteId) {
  const root = document.documentElement;
  for (const [k, v] of Object.entries(paletteVars(PALETTES[id]))) root.style.setProperty(k, v);
  root.dataset.palette = id;
}

/** Saved in this browser only: these are personal display and prompt preferences. */
export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs = { ...current(), [key]: value };
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
  if (key === "palette") apply(value as PaletteId);
  listeners.forEach((l) => l());
}

export function getPrefs() {
  return current();
}

/** Accent colours for canvas/SVG code that can't read CSS variables. */
export function palette(): Palette {
  return PALETTES[current().palette];
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function usePrefs() {
  return useSyncExternalStore(subscribe, current, () => DEFAULTS);
}

export function usePalette(): Palette {
  return PALETTES[usePrefs().palette];
}
