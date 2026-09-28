"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { useEffect } from "react";

gsap.registerPlugin(ScrollTrigger, SplitText);

/**
 * Declarative scroll choreography for the landing pages:
 *
 *   data-split          headline rises line-by-line, char-by-char, through a mask
 *   data-split="words"  same, by word (for serif lines)
 *   data-reveal         fades up once when it enters
 *   data-stagger        children reveal in sequence
 *   data-parallax="n"   drifts n × viewport while the section passes
 */
export function ScrollFX() {
  useEffect(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      document.querySelectorAll<HTMLElement>("[data-split]").forEach((el) => {
        const byWords = el.dataset.split === "words";
        SplitText.create(el, {
          type: byWords ? "lines,words" : "lines,chars",
          mask: "lines",
          autoSplit: true,
          onSplit(self) {
            return gsap.from(byWords ? self.words : self.chars, {
              yPercent: 110,
              rotate: byWords ? 0 : 6,
              opacity: 0,
              duration: byWords ? 1 : 0.9,
              ease: "expo.out",
              stagger: byWords ? 0.04 : 0.018,
              scrollTrigger: { trigger: el, start: "top 88%", once: true },
            });
          },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.from(el, {
          y: 40,
          opacity: 0,
          duration: 1.1,
          ease: "expo.out",
          scrollTrigger: { trigger: el, start: "top 90%", once: true },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((el) => {
        gsap.from(el.children, {
          y: 48,
          opacity: 0,
          scale: 0.96,
          duration: 1,
          ease: "expo.out",
          stagger: 0.08,
          scrollTrigger: { trigger: el, start: "top 85%", once: true },
        });
      });

      gsap.utils.toArray<HTMLElement>("[data-parallax]").forEach((el) => {
        const amt = parseFloat(el.dataset.parallax || "0.2");
        gsap.fromTo(
          el,
          { yPercent: -amt * 100 },
          {
            yPercent: amt * 100,
            ease: "none",
            scrollTrigger: { trigger: el.parentElement, start: "top bottom", end: "bottom top", scrub: true },
          },
        );
      });

      requestAnimationFrame(() => ScrollTrigger.refresh());
    });
    return () => mm.revert();
  }, []);
  return null;
}
