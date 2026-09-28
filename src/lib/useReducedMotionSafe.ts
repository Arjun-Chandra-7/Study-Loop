"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(cb: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}

/**
 * Reduced-motion preference that is safe to branch on during render:
 * the server and the hydration pass both see `false`, then React re-renders
 * with the real value. (Motion's useReducedMotion returns null on the server
 * and the real value on the client, which breaks hydration.)
 */
export function useReducedMotionSafe() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches, () => false);
}
