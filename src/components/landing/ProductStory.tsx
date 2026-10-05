"use client";

import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * One photographed frame, one camera. The scroll drives a macro camera move
 * across the real render; each part gets a focus ring, a light sweep, and a
 * card that wipes in beside it.
 */
const STOPS = [
  {
    n: "01",
    title: "Status light",
    body: "A single cyan line. It breathes during baseline, holds while you study, and never asks to be looked at.",
    px: 0.5,
    py: 0.365,
    s: 1.75,
  },
  {
    n: "02",
    title: "One button",
    body: "Press to start. Press again to mark a moment. Hold to end the session.",
    px: 0.685,
    py: 0.37,
    s: 1.9,
  },
  {
    n: "03",
    title: "Inner-wrist contacts",
    body: "Two electrodes read skin conductance. A PPG sensor between them reads your pulse.",
    px: 0.5,
    py: 0.51,
    s: 1.6,
  },
  {
    n: "04",
    title: "Nothing else",
    body: "No screen, no notifications. A woven strap and a matte enclosure you forget you’re wearing.",
    px: 0.5,
    py: 0.5,
    s: 1,
  },
];

const FOCUS_X = 0.4;

export function ProductStory() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const q = gsap.utils.selector(root);
        const steps = q(".story__step");
        gsap.set(steps, { clipPath: "inset(0% 100% 0% 0%)", opacity: 1 });
        gsap.set(q(".story__focus"), { scale: 0, opacity: 0 });

        // Entrance before pinning: the frame opens up from a letterbox.
        gsap.fromTo(
          q(".story__frame"),
          { clipPath: "inset(12% 6% 12% 6% round 28px)" },
          {
            clipPath: "inset(0% 0% 0% 0% round 0px)",
            ease: "none",
            scrollTrigger: { trigger: root.current, start: "top bottom", end: "top top", scrub: true },
          },
        );

        const tl = gsap.timeline({
          defaults: { ease: "power3.inOut" },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=300%",
            pin: true,
            scrub: 1,
            anticipatePin: 1,
          },
        });

        tl.to(q(".story__intro"), { opacity: 0, y: -40, filter: "blur(8px)", duration: 0.5 }, 0.25);
        STOPS.forEach((st, i) => {
          const at = 0.35 + i * 1.25;
          tl.to(
            q(".story__camera"),
            {
              scale: st.s,
              xPercent: (FOCUS_X - st.px) * 100 * st.s,
              yPercent: (0.5 - st.py) * 100 * st.s,
              rotate: i === 3 ? 0 : (i % 2 ? -1.2 : 1.2),
              duration: 1,
            },
            at,
          );
          tl.fromTo(q(".story__sweep"), { xPercent: -120 }, { xPercent: 220, duration: 0.8, ease: "power2.out" }, at + 0.25);
          if (i < 3) {
            tl.fromTo(
              q(".story__focus"),
              { scale: 0.4, opacity: 0 },
              { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" },
              at + 0.7,
            );
            tl.to(q(".story__focus"), { scale: 1.6, opacity: 0, duration: 0.3 }, at + 1.1);
          }
          tl.to(steps[i], { clipPath: "inset(0% 0% 0% 0%)", duration: 0.4, ease: "expo.out" }, at + 0.5);
          tl.from(steps[i].querySelectorAll(".story__line"), { y: 24, opacity: 0, stagger: 0.06, duration: 0.35 }, at + 0.6);
          if (i < STOPS.length - 1) {
            tl.to(steps[i], { clipPath: "inset(0% 0% 0% 100%)", duration: 0.35, ease: "expo.in" }, at + 1.15);
          }
          tl.to(q(".story__count-track"), { yPercent: -(100 / STOPS.length) * i, duration: 0.4 }, at + 0.5);
          tl.to(q(".story__rail-fill"), { scaleY: (i + 1) / STOPS.length, duration: 1, ease: "none" }, at);
        });
      });
    },
    { scope: root },
  );

  return (
    <section id="story" ref={root} className="story" aria-label="The band">
      <div className="story__frame">
        <div className="story__camera">
          <Image
            src="/media/studyloop-band-hd.png"
            alt="StudyLoop band seen head-on: a matte black enclosure with a cyan status light and one button on a woven strap, two metal electrodes beneath."
            fill
            sizes="100vw"
            className="story__img"
          />
        </div>
        <div className="story__sweep" aria-hidden />
        <div className="story__vignette" aria-hidden />
        <div className="story__focus" aria-hidden style={{ left: `${FOCUS_X * 100}%` }}>
          <span />
        </div>
      </div>

      <div className="story__intro">
        <p className="eyebrow" data-reveal>
          <span className="eyebrow__rule" aria-hidden />
          The band
        </p>
        <h2 className="display campaign story__title" data-split>
          Focus,
          <br />
          measured
          <br />
          differently.
        </h2>
      </div>

      <ol className="story__steps">
        {STOPS.map((st) => (
          <li key={st.n} className="story__step">
            <span className="story__n tnum story__line">{st.n} / 04</span>
            <h3 className="h-section story__line">{st.title}</h3>
            <p className="body muted story__line">{st.body}</p>
          </li>
        ))}
      </ol>

      <div className="story__count" aria-hidden>
        <div className="story__count-track">
          {STOPS.map((s) => (
            <span key={s.n}>{s.n}</span>
          ))}
        </div>
      </div>
      <div className="story__rail" aria-hidden>
        <span className="story__rail-fill" />
      </div>
    </section>
  );
}
