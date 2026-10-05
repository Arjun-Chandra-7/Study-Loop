"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker once, in the browser, after load. The worker itself is
 * conservative (see public/sw.js); this just wires it up and lets a new deploy's worker take over
 * on the next visit. Mounted once at the app root.
 */
export function ServiceWorkerManager() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    // next dev ships no /sw.js; only register where it exists (production build / the static file).
    if (process.env.NODE_ENV !== "production") return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.warn("[StudyLoop] service worker registration failed", e));
    };
    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
