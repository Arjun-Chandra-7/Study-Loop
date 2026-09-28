"use client";

import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { engine } from "@/lib/useStudyLoop";
import { StateOrb } from "../orb/StateOrb";
import { Icon } from "../ui/Icon";
import { Magnetic } from "../ui/Magnetic";
import { scrollToTop } from "../motion/SmoothScroll";
import type { OrbState } from "thinking-orbs";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** The loop the product is named for — it runs forever once you arrive. */
const LOOP: { label: string; state: OrbState; speed: number; color: string }[] = [
  { label: "Idle", state: "breathing", speed: 0.4, color: "#B7C4C1" },
  { label: "Baseline", state: "connecting", speed: 0.6, color: "#14B8A6" },
  { label: "Study", state: "working", speed: 0.6, color: "#14B8A6" },
  { label: "Recover", state: "breathing", speed: 0.8, color: "#5FD9CB" },
];
const STEP_MS = 3200;

const MARQUEE = ["Focus", "Baseline", "Signal", "Recover", "Measured", "Not a mind reader", "Study with feedback"];

export function Finale() {
  const root = useRef<HTMLElement>(null);
  const [step, setStep] = useState(0);
  const [live, setLive] = useState(false);
  const [orbSize, setOrbSize] = useState(420);

  useEffect(() => {
    const fit = () => setOrbSize(Math.round(Math.min(440, window.innerWidth * 0.7, window.innerHeight * 0.46)));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setStep((s) => (s + 1) % LOOP.length), STEP_MS);
    return () => clearInterval(id);
  }, [live]);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({
          defaults: { ease: "power2.inOut" },
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: "+=260%",
            pin: true,
            scrub: 1,
            onUpdate: (self) => setLive(self.progress > 0.55),
          },
        });
        tl.to(q(".finale__band"), { scale: 5, filter: "brightness(1.4)", duration: 1.2, ease: "power3.in" }, 0)
          .to(q(".finale__flash"), { opacity: 1, scale: 3, duration: 0.7, ease: "power2.in" }, 0.55)
          .set(q(".finale__band"), { opacity: 0 }, 1.25)
          .to(q(".finale__flash"), { opacity: 0, scale: 6, duration: 0.8, ease: "power2.out" }, 1.25)
          .fromTo(q(".finale__orbit"), { scale: 0.4, opacity: 0, rotate: -90 }, { scale: 1, opacity: 1, rotate: 0, duration: 1, ease: "expo.out" }, 1.3)
          .from(q(".finale__label"), { opacity: 0, scale: 0.6, stagger: 0.08, duration: 0.5, ease: "back.out(2)" }, 1.6)
          .from(q(".finale__line .w"), { yPercent: 120, opacity: 0, stagger: 0.05, duration: 0.6, ease: "expo.out" }, 1.7)
          .from(q(".finale__cta"), { y: 30, opacity: 0, scale: 0.9, duration: 0.5, ease: "back.out(2)" }, 2)
          .from(q(".finale__word .c"), { yPercent: 110, stagger: 0.04, duration: 0.6, ease: "expo.out" }, 2);
      });
      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(q(".finale__band"), { opacity: 0 });
        setLive(true);
      });
    },
    { scope: root },
  );

  const start = () => {
    engine.setTab("session");
    scrollToTop();
  };
  const cur = LOOP[step];

  return (
    <section ref={root} className={`finale ${live ? "is-live" : ""}`} aria-label="StudyLoop">
      <div className="finale__band" aria-hidden>
        <Image src="/media/studyloop-band.png" alt="" fill sizes="100vw" className="finale__img" />
      </div>
      <div className="finale__flash" aria-hidden />

      <div className="finale__stage">
        <div className="finale__orbit" style={{ width: orbSize * 1.35, height: orbSize * 1.35 }}>
          <svg viewBox="0 0 100 100" className="finale__ring" aria-hidden>
            <circle cx="50" cy="50" r="48" className="finale__ring-track" />
            <motion.circle
              key={`${step}-${live}`}
              cx="50"
              cy="50"
              r="48"
              className="finale__ring-fill"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: live ? 1 : 0 }}
              transition={{ duration: STEP_MS / 1000, ease: "linear" }}
              style={{ rotate: -90 + step * 90, transformOrigin: "50% 50%" }}
            />
          </svg>
          <div className="finale__orb">
            <StateOrb state={cur.state} speed={cur.speed} color={cur.color} size={orbSize} density={2.4} dotScale={0.8} label={`Loop: ${cur.label}`} />
          </div>
          {LOOP.map((l, i) => (
            <span key={l.label} className={`finale__label finale__label--${i}`} data-active={i === step || undefined}>
              <span className="tnum">0{i + 1}</span> {l.label}
            </span>
          ))}
        </div>

        <div className="finale__copy">
          <p className="serif serif--xl finale__line" aria-label="Built around how you learn.">
            {"Built around how you learn.".split(" ").map((w, i) => (
              <span key={i} className="w-mask">
                <span className="w">{w}&nbsp;</span>
              </span>
            ))}
          </p>
          <AnimatePresence mode="wait">
            {live && (
            <motion.p
              key={cur.label}
              className="finale__now"
              initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.5 }}
            >
              {cur.label}
            </motion.p>
            )}
          </AnimatePresence>
          <div className="finale__cta">
            <Magnetic>
              <button type="button" className="btn btn--primary btn--lg" onClick={start}>
                Start a session
                <Icon name="arrow" size={18} />
              </button>
            </Magnetic>
          </div>
        </div>
      </div>

      <p className="finale__word display" data-text="StudyLoop" aria-hidden>
        {"StudyLoop".split("").map((c, i) => (
          <span key={i} className="c-mask">
            <span className="c">{c}</span>
          </span>
        ))}
      </p>

      <div className="marquee" aria-hidden>
        <div className="marquee__track">
          {[0, 1].map((k) => (
            <span key={k} className="marquee__group">
              {MARQUEE.map((m) => (
                <span key={m}>
                  {m}
                  <i />
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}

export function FinePrint() {
  return (
    <footer className="fineprint">
      <p className="small">
        StudyLoop is a study tool, not a medical device. It measures heart rate and skin conductance and does not
        diagnose stress, read brain activity, or treat any condition. Research content describes ongoing scientific
        work, not product claims.
      </p>
    </footer>
  );
}
