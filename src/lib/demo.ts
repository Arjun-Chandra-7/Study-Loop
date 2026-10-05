"use client";

/**
 * Hackathon / demo mode: a judge explores StudyLoop with no account, on the
 * simulated band, guided by a tour. Lives for the browser tab (sessionStorage),
 * entered from the sign-in page via /?demo.
 */
const KEY = "sl-demo";

let cached: boolean | null = null;

export function isDemo(): boolean {
  if (typeof window === "undefined") return false;
  if (cached !== null) return cached;
  try {
    const url = new URL(location.href);
    if (url.searchParams.has("demo")) {
      sessionStorage.setItem(KEY, "1");
      url.searchParams.delete("demo");
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    cached = sessionStorage.getItem(KEY) === "1";
  } catch {
    cached = false;
  }
  return cached;
}

/** Full navigation, so every part of the app boots in demo mode from the start. */
export function startDemo() {
  location.href = "/?demo";
}

export function exitDemo() {
  try {
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem("sl-tour-step");
  } catch {}
  location.href = "/login";
}
