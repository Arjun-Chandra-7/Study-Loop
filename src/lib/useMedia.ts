"use client";

import { useSyncExternalStore } from "react";

/** Live result of a CSS media query. On the server it reports `fallback`. */
export function useMedia(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}

/** Same breakpoint as `.only-phone` in globals.css. */
export const PHONE_QUERY = "(max-width: 759px)";
