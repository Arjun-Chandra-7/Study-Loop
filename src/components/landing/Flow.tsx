"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { DotCanvas } from "../motion/DotCanvas";
import { flowScene } from "../motion/scenes";
import { Tilt } from "../motion/Tilt";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const STEPS: { n: string; title: string; body: string; orb: OrbState; at: number }[] = [
  { n: "01", title: "Connect", body: "Put the band on. It pairs with your laptop in a few seconds.", orb: "connecting", at: 0.08 },
  { n: "02", title: "Baseline", body: "Twenty still seconds. The band learns what normal looks like today.", orb: "breathing", at: 0.3 },
  { n: "03", title: "Study", body: "One subject, one timer. The screen gets quieter the longer you work.", orb: "working", at: 0.58 },
  { n: "04", title: "Review", body: "See where your signals moved away from baseline — and what you were doing then.", orb: "composing", at: 0.86 },
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
        <h2 className="display display--md" data-split>
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
              <div className="flow__orb">
                <ThinkingOrb state={s.orb} size={64} theme="dark" color="#D7FF3A" speed={0.7} aria-label={`${s.title} state`} />
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
