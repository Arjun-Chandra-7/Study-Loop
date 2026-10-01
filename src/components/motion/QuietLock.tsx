"use client";

import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect } from "react";
import { useStudyLoop } from "@/lib/useStudyLoop";
import { scrollToTop } from "./SmoothScroll";

/**
 * Quiet mode keeps you on the first screen: back to the top, and the story
 * below (html[data-quiet] hides it in CSS) stays out of reach until you leave.
 */
export function QuietLock() {
  const { quiet } = useStudyLoop();
  useEffect(() => {
    if (!quiet) return;
    scrollToTop();
    // Hide the story once the glide home has landed, so the scroll isn't cut short.
    const t = setTimeout(() => {
      document.documentElement.dataset.quiet = "";
      ScrollTrigger.refresh();
    }, 700);
    return () => {
      clearTimeout(t);
      if (!("quiet" in document.documentElement.dataset)) return;
      delete document.documentElement.dataset.quiet;
      ScrollTrigger.refresh();
    };
  }, [quiet]);
  return null;
}
