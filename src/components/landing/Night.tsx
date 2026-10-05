"use client";

import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** One full-bleed photograph before the finale: who this is for, in their own light. */
export function Night() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          q(".night__img"),
          { scale: 1.18, yPercent: -4 },
          { scale: 1, yPercent: 4, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "bottom top", scrub: true } },
        );
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="night" aria-label="Who it’s for">
      <div className="night__frame">
        <Image
          src="/media/campaign/night.webp"
          alt="A student with headphones writing notes at a desk late at night, the band glowing on the wrist."
          fill
          sizes="100vw"
          className="night__img"
        />
      </div>
      <div className="night__copy">
        <h2 className="display campaign night__title" data-split>
          For the hours you put in.
        </h2>
        <p className="body night__body" data-reveal>
          Late nights, early starts, the chapter you keep rereading. StudyLoop sits quietly on your wrist and keeps count of
          how those hours actually felt.
        </p>
      </div>
    </section>
  );
}
