"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";
import { DotCanvas, type Scene } from "../motion/DotCanvas";
import { batteryScene, chipScene, edaScene, ppgScene } from "../motion/scenes";
import { Tilt } from "../motion/Tilt";

gsap.registerPlugin(ScrollTrigger, useGSAP);

const PARTS: { n: string; name: string; measures: string; body: string; scene: Scene; spec: string[] }[] = [
  {
    n: "A",
    name: "PPG sensor",
    measures: "Pulse",
    body: "Light passes into the skin of the inner wrist; each heartbeat changes how much comes back.",
    scene: ppgScene,
    spec: ["Optical", "Continuous"],
  },
  {
    n: "B",
    name: "EDA electrodes",
    measures: "Skin conductance",
    body: "Two contacts measure tiny changes in skin conductance — a signal linked to arousal, not to thought.",
    scene: edaScene,
    spec: ["2 contacts", "Inner wrist"],
  },
  {
    n: "C",
    name: "Controller",
    measures: "Timing & link",
    body: "A low-power microcontroller timestamps every sample and streams it to your laptop over Bluetooth LE.",
    scene: chipScene,
    spec: ["Bluetooth LE", "Timestamped"],
  },
  {
    n: "D",
    name: "Battery",
    measures: "A full study day",
    body: "A slim rechargeable cell under the enclosure. The status light tells you when it needs a charge.",
    scene: batteryScene,
    spec: ["Rechargeable", "Status light"],
  },
];

export function Anatomy() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      const q = gsap.utils.selector(root);

      mm.add("(prefers-reduced-motion: no-preference) and (min-width: 760px)", () => {
        const track = q(".anatomy__track")[0] as HTMLElement;
        const cards = q(".plate-wrap");
        const distance = () => track.scrollWidth - window.innerWidth + 64;

        const scroll = gsap.to(track, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: () => `+=${distance() + window.innerHeight * 0.6}`,
            pin: true,
            scrub: 0.8,
            invalidateOnRefresh: true,
          },
        });

        // Background word drifts the other way — depth without 3D.
        gsap.to(q(".anatomy__ghost"), {
          xPercent: 30,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: () => `+=${distance()}`, scrub: true },
        });

        cards.forEach((card, i) => {
          // Pop in: rise, un-rotate, overshoot slightly.
          gsap.fromTo(
            card,
            { yPercent: 40, scale: 0.72, rotate: i % 2 ? 7 : -7, opacity: 0 },
            {
              yPercent: 0,
              scale: 1,
              rotate: 0,
              opacity: 1,
              ease: "back.out(1.7)",
              scrollTrigger: {
                trigger: card,
                containerAnimation: scroll,
                start: "left 105%",
                end: "left 60%",
                scrub: 0.6,
              },
            },
          );
          // Recede as it leaves on the left.
          gsap.to(card, {
            rotateY: -18,
            scale: 0.9,
            opacity: 0.35,
            transformPerspective: 1200,
            ease: "none",
            scrollTrigger: {
              trigger: card,
              containerAnimation: scroll,
              start: "left 12%",
              end: "right -10%",
              scrub: true,
            },
          });
          // Numbers and chips flip in once the card lands.
          gsap.from(card.querySelectorAll(".plate__spec span, .plate__head > *"), {
            y: 16,
            opacity: 0,
            stagger: 0.05,
            duration: 0.6,
            ease: "expo.out",
            scrollTrigger: { trigger: card, containerAnimation: scroll, start: "left 70%", toggleActions: "play none none reverse" },
          });
        });

        gsap.to(q(".anatomy__bar-fill"), {
          scaleX: 1,
          ease: "none",
          scrollTrigger: { trigger: root.current, start: "top top", end: () => `+=${distance()}`, scrub: true },
        });
      });

      mm.add("(prefers-reduced-motion: no-preference) and (max-width: 759px)", () => {
        q(".plate-wrap").forEach((card) =>
          gsap.from(card, {
            y: 60,
            scale: 0.9,
            opacity: 0,
            duration: 0.9,
            ease: "back.out(1.6)",
            scrollTrigger: { trigger: card, start: "top 90%", once: true },
          }),
        );
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className="anatomy field field--sage" aria-label="Inside the band">
      <div className="anatomy__head">
        <p className="eyebrow" data-reveal>
          <span className="eyebrow__rule" aria-hidden />
          Inside the band
        </p>
        <h2 className="display campaign anatomy__title" data-split>
          Four parts.
        </h2>
        <p className="serif serif--lg" data-split="words">
          Nothing that doesn’t earn its place on your wrist.
        </p>
      </div>
      <div className="anatomy__track">
        {PARTS.map((p) => (
          <div key={p.n} className="plate-wrap">
            <Tilt className="plate">
              <header className="plate__head">
                <span className="plate__n">{p.n}</span>
                <span className="chip chip--measured">{p.measures}</span>
              </header>
              <div className="plate__art">
                <DotCanvas scene={p.scene} label={`${p.name} animation`} />
              </div>
              <h3 className="h-section">{p.name}</h3>
              <p className="body muted">{p.body}</p>
              <p className="plate__spec">
                {p.spec.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </p>
            </Tilt>
          </div>
        ))}
      </div>
      <div className="anatomy__bar" aria-hidden>
        <span className="anatomy__bar-fill" />
      </div>
    </section>
  );
}
