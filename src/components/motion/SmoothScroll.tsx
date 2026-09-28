"use client";

import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";

gsap.registerPlugin(ScrollTrigger);

let lenis: Lenis | null = null;

export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { duration: 1.6 });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

export function scrollToEl(el: Element | null, offset = 0) {
  if (!el) return;
  if (lenis) lenis.scrollTo(el as HTMLElement, { offset, duration: 1.2 });
  else el.scrollIntoView({ behavior: "smooth" });
}

/** Freeze scrolling (used while the intro plays). */
export function lockScroll(locked: boolean) {
  document.documentElement.style.overflow = locked ? "hidden" : "";
  if (lenis) {
    if (locked) lenis.stop();
    else lenis.start();
  }
}

/** Inertial scrolling, driven by GSAP's ticker so ScrollTrigger stays in lockstep. */
export function SmoothScroll() {
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis?.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => {
      gsap.ticker.remove(tick);
      lenis?.destroy();
      lenis = null;
    };
  }, []);
  return null;
}
