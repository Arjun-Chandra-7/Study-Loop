"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef, useState } from "react";
import { BANDS } from "../research/bands";
import { Papers } from "../research/Papers";
import { DotCanvas } from "../motion/DotCanvas";
import { ribbonScene } from "../motion/scenes";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/** Visual cycles across the frame per band (log-spaced so 40 Hz stays legible). */
const CYCLES = [2.6, 4.6, 11, 15];
const HZ = BANDS.map((b) => b.hz);
const HOLD = 0.55; // fraction of each stage spent holding before morphing onward

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2);

/**
 * Pinned: each band holds, then the ribbon morphs into the next frequency.
 * theta → alpha → gamma → 40 Hz (experimental, cinder).
 */
export function Frequencies() {
  const root = useRef<HTMLElement>(null);
  const cycles = useRef(CYCLES[0]);
  const [exp, setExp] = useState(false);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const words = q(".sig__band");
      const fills = q(".sig__fill");
      const hz = q(".sig__hz-num")[0] as HTMLElement;
      const bodies = q(".sig__body");
      let lastIdx = -1;

      const apply = (p: number) => {
        const n = BANDS.length;
        const pos = Math.min(n - 1e-4, p * n);
        const k = Math.floor(pos);
        const local = pos - k;
        const morph = k < n - 1 ? ease(Math.max(0, (local - HOLD) / (1 - HOLD))) : 0;
        cycles.current = CYCLES[k] + (CYCLES[Math.min(n - 1, k + 1)] - CYCLES[k]) * morph;
        const hzNow = HZ[k] + (HZ[Math.min(n - 1, k + 1)] - HZ[k]) * morph;
        if (hz) hz.textContent = String(Math.round(hzNow));

        const idx = morph > 0.5 ? k + 1 : k;
        fills.forEach((f, i) => {
          const v = i < idx ? 1 : i === idx ? (i === k ? Math.min(1, local / HOLD) : 0.05) : 0;
          gsap.set(f, { scaleX: v });
        });
        if (idx !== lastIdx) {
          lastIdx = idx;
          words.forEach((w, i) => w.toggleAttribute("data-active", i === idx));
          bodies.forEach((b, i) => b.toggleAttribute("data-active", i === idx));
          setExp(BANDS[idx].experimental === true);
          gsap.fromTo(words[idx], { scale: 0.94 }, { scale: 1, duration: 0.6, ease: "back.out(3)" });
          gsap.fromTo(
            q(".sig__hz"),
            { yPercent: 30, opacity: 0.2, filter: "blur(6px)" },
            { yPercent: 0, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out" },
          );
        }
      };
      apply(0);

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        ScrollTrigger.create({
          trigger: root.current,
          start: "top top",
          end: "+=360%",
          pin: true,
          scrub: 0.8,
          onUpdate: (self) => apply(self.progress),
        });
        gsap.from(q(".sig__wave"), {
          scaleX: 0.2,
          opacity: 0,
          duration: 1.4,
          ease: "expo.out",
          scrollTrigger: { trigger: root.current, start: "top 70%", once: true },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className={`sig ${exp ? "is-exp" : ""}`} aria-label="The signals behind focus">
      <div className="sig__inner">
        <header className="sig__head">
          <div>
            <p className="eyebrow eyebrow--action" data-reveal>
              <span className="eyebrow__rule" aria-hidden />
              Research
            </p>
            <h2 className="display sig__title" data-split>
              The signals behind focus
            </h2>
          </div>
          <div className="sig__hz" aria-live="polite">
            <span className="sig__hz-num tnum">6</span>
            <span className="sig__hz-unit">Hz</span>
            <span className={`chip chip--action-outline sig__stamp ${exp ? "is-on" : ""}`}>Experimental</span>
          </div>
        </header>

        <div className="sig__wave">
          <DotCanvas scene={ribbonScene} param={cycles} tint={exp ? "#CF4F33" : "#9DBA8E"} label="Oscillation at the selected frequency" />
        </div>

        <ol className="sig__bands">
          {BANDS.map((b, i) => (
            <li key={b.id} className={`sig__band ${b.experimental ? "sig__band--exp" : ""}`} data-active={i === 0 || undefined}>
              <span className="sig__track">
                <span className="sig__fill" />
              </span>
              <span className="sig__name">{b.name}</span>
              <span className="sig__range tnum">{b.range}</span>
            </li>
          ))}
        </ol>

        <div className="sig__bodies">
          {BANDS.map((b, i) => (
            <div key={b.id} className="sig__body" data-active={i === 0 || undefined}>
              <p className="serif serif--lg">{b.line}</p>
              <p className="body muted">{b.body}</p>
              <Papers papers={b.papers} compact />
            </div>
          ))}
          <p className="small sig__note">
            Neural rhythms are what researchers explore. Your pulse and skin are what the band measures.
          </p>
        </div>
      </div>
    </section>
  );
}
