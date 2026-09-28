"use client";

import { useSyncExternalStore } from "react";

/** One flag: has the intro handed the stage to the app yet? */
let done = false;
const listeners = new Set<() => void>();

export const intro = {
  isDone: () => done,
  finish() {
    if (done) return;
    done = true;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useIntroDone() {
  return useSyncExternalStore(intro.subscribe, intro.isDone, () => false);
}
