"use client";

import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { DotCanvas } from "../motion/DotCanvas";
import { flowScene } from "../motion/scenes";
import { Tilt } from "../motion/Tilt";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STEPS: { n: string; title: string; body: string; at: number; img: string; pos?: string; alt: string }[] = [
  {
    n: "01",
    title: "Connect",
    body: "Put the band on. It pairs with your laptop in a few seconds.",
    at: 0.08,
    img: "/media/campaign/button.webp",
    alt: "A thumb pressing the band's button to switch it on.",
  },
  {
    n: "02",
    title: "Baseline",
    body: "Twenty still seconds. The band learns what normal looks like today.",
    at: 0.3,
    img: "/media/campaign/baseline.webp",
    pos: "50% 62%",
    alt: "A student sitting still at a desk, hands resting, the band on one wrist.",
  },
  {
    n: "03",
    title: "Study",
    body: "One subject, one timer. The screen gets quieter the longer you work.",
    at: 0.58,
    img: "/media/campaign/hero.webp",
    pos: "62% 40%",
    alt: "A hand writing in a notebook under a desk lamp, wearing the band.",
  },
  {
    n: "04",
    title: "Review",
    body: "See where your signals moved away from baseline — and what you were doing then.",
    at: 0.86,
    img: "/media/campaign/review.webp",
    pos: "50% 45%",
    alt: "A student's hand on a laptop showing the StudyLoop dashboard, the band on the wrist.",
  },
];

export function Flow() {
  const root = useRef<HTMLElement>(null);
  const progress = useRef(0);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const cards = q(".flow__step");
      const tags = q(".flow__tag");
      let last = -1;
      const setStage = (p: number) => {
        progress.current = p;
        let idx = 0;
        STEPS.forEach((s, i) => {
          if (p >= s.at - 0.08) idx = i;
        });
        if (idx !== last) {
          last = idx;
          cards.forEach((c, i) => {
            c.toggleAttribute("data-active", i === idx);
            c.toggleAttribute("data-done", i < idx);
          });
          tags.forEach((t, i) => t.toggleAttribute("data-active", i <= idx));
        }
        gsap.set(q(".flow__rail-fill"), { scaleX: p });
      };

      // Always say where you are: step 1 is current before the first scroll update.
      setStage(0);

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        ScrollTrigger.create({
          trigger: root.current,
          start: "top 70%",
          onEnter: () => q(".flow__steps")[0].classList.add("is-in"),
        });
        ScrollTrigger.create({
          trigger: root.current,
          start: "top top",
          end: "+=300%",
          pin: true,
          scrub: 0.6,
          onUpdate: (self) => setStage(self.progress),
        });
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        q(".flow__steps")[0].classList.add("is-in");
        setStage(1);
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="flow" aria-label="How a session works">
      <div className="flow__head">
        <p className="eyebrow" data-reveal>
          <span className="eyebrow__rule" aria-hidden />
          How it works
        </p>
        <h2 className="display campaign flow__title" data-split>
          Your session has a signal.
        </h2>
      </div>

      <div className="flow__stage">
        <DotCanvas scene={flowScene} param={progress} label="A session signal being written from connect to review" />
        <div className="flow__tags">
          {STEPS.map((s) => (
            <span key={s.n} className="flow__tag" style={{ "--at": s.at } as React.CSSProperties}>
              {s.title}
            </span>
          ))}
        </div>
        <span className="flow__rail" aria-hidden>
          <span className="flow__rail-fill" />
        </span>
      </div>

      <ol className="flow__steps">
        {STEPS.map((s) => (
          <li key={s.n} className="flow__step">
            <Tilt className="flow__card" max={6}>
              <div className="flow__photo">
                <Image src={s.img} alt={s.alt} fill sizes="(min-width: 760px) 25vw, 50vw" style={{ objectPosition: s.pos }} />
              </div>
              <span className="flow__n tnum">{s.n}</span>
              <h3 className="h-section">{s.title}</h3>
              <p className="body muted">{s.body}</p>
            </Tilt>
          </li>
        ))}
      </ol>
    </section>
  );
}
