"use client";

import Image from "next/image";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { useRef } from "react";

gsap.registerPlugin(ScrollTrigger, useGSAP);

/**
 * A photographed story. The opening shot fills the screen, then narrows into
 * a tall window; each detail wipes up through it while the words change on
 * the left. The last shot opens back out to the full frame.
 */
const STOPS = [
  {
    n: "01",
    title: "Status light",
    body: "A single cyan line. It breathes during baseline, holds while you study, and never asks to be looked at.",
    src: "/media/campaign/light.webp",
    alt: "Close-up of the band's cyan status light glowing on the matte black enclosure.",
  },
  {
    n: "02",
    title: "One button",
    body: "Press to start. Press again to mark a moment. Hold to end the session.",
    src: "/media/campaign/button.webp",
    alt: "A thumb pressing the band's single button on a wrist.",
  },
  {
    n: "03",
    title: "Inner-wrist contacts",
    body: "Two electrodes read skin conductance. A PPG sensor between them reads your pulse.",
    src: "/media/campaign/contacts.webp",
    alt: "The underside of the band on slate, showing two brushed-steel electrodes.",
  },
  {
    n: "04",
    title: "Nothing else",
    body: "No screen, no notifications. A woven strap and a matte enclosure you forget you’re wearing.",
    src: "/media/campaign/alone.webp",
    alt: "The band standing alone on a dark surface, its status light glowing.",
  },
];

const FULL = "inset(0% 0% 0% 0%)";

export function ProductStory() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { wide: "(prefers-reduced-motion: no-preference) and (min-width: 760px)", phone: "(prefers-reduced-motion: no-preference) and (max-width: 759px)" },
        (ctx) => {
          const { wide } = ctx.conditions as { wide: boolean };
          // The window the details show through: the right side on laptops, the top on phones.
          const WINDOW = wide ? "inset(0% 0% 0% 50%)" : "inset(0% 0% 46% 0%)";
          const SHUT = wide ? "inset(100% 0% 0% 50%)" : "inset(54% 0% 46% 0%)";
          const q = gsap.utils.selector(root);
          const steps = q(".story__step");
          const shots = q(".story__shot");
          // Detail shots live inside the window and reveal upward; the last one is full-frame.
          const LOCAL_SHUT = "inset(100% 0% 0% 0%)";

          gsap.set(steps, { autoAlpha: 0 });
          gsap.set(q(".story__hero"), { clipPath: FULL });
          shots.forEach((el, i) => gsap.set(el, { clipPath: i === shots.length - 1 ? SHUT : LOCAL_SHUT }));

          // Entrance before pinning: the opening shot settles as it arrives.
          gsap.fromTo(
            q(".story__hero img"),
            { scale: 1.12 },
            { scale: 1, ease: "none", scrollTrigger: { trigger: root.current, start: "top bottom", end: "top top", scrub: true } },
          );

          const tl = gsap.timeline({
            defaults: { ease: "power3.inOut" },
            scrollTrigger: {
              trigger: root.current,
              start: "top top",
              end: "+=360%",
              pin: true,
              scrub: 1,
              anticipatePin: 1,
            },
          });

          tl.to(q(".story__intro"), { autoAlpha: 0, y: -40, duration: 0.4 }, 0.2)
            .to(q(".story__hero"), { clipPath: WINDOW, duration: 1 }, 0.3)
            .fromTo(q(".story__meta"), { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.3 }, 0.9);

          STOPS.forEach((_, i) => {
            const at = 1.1 + i * 1.2;
            const last = i === STOPS.length - 1;
            tl.to(shots[i], { clipPath: last ? WINDOW : FULL, duration: 0.9 }, at);
            tl.fromTo(shots[i].querySelector("img"), { scale: 1.25 }, { scale: 1, duration: 1.4, ease: "power2.out" }, at);
            if (last) tl.to(shots[i], { clipPath: FULL, duration: 1 }, at + 0.8);
            tl.fromTo(steps[i], { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.01 }, at + 0.35);
            tl.from(steps[i].querySelectorAll(".story__line"), { yPercent: 110, stagger: 0.06, duration: 0.5, ease: "expo.out" }, at + 0.35);
            if (!last) tl.to(steps[i].querySelectorAll(".story__line"), { yPercent: -110, stagger: 0.04, duration: 0.35, ease: "expo.in" }, at + 0.95);
            tl.to(q(".story__count-track"), { yPercent: -(100 / STOPS.length) * i, duration: 0.5 }, at + 0.3);
            tl.to(q(".story__rail-fill"), { scaleX: (i + 1) / STOPS.length, duration: 1, ease: "none" }, at);
          });
          tl.to({}, { duration: 0.5 });
        },
      );
    },
    { scope: root },
  );

  return (
    <section id="story" ref={root} className="story" aria-label="The band">
      <div className="story__frame">
        <div className="story__hero">
          <Image
            src="/media/campaign/hero.webp"
            alt="A student writing at a desk at night, wearing the StudyLoop band with its cyan light on."
            fill
            sizes="100vw"
            className="story__img story__img--wide"
          />
          <Image src="/media/campaign/hero-phone.webp" alt="" fill sizes="100vw" className="story__img story__img--tall" />
          <div className="story__shade" aria-hidden />
        </div>
        {STOPS.map((st, i) => (
          <div key={st.n} className={`story__shot ${i === STOPS.length - 1 ? "story__shot--full" : ""}`}>
            <Image src={st.src} alt={st.alt} fill sizes={i === STOPS.length - 1 ? "100vw" : "(min-width: 760px) 50vw, 100vw"} className="story__img" />
          </div>
        ))}
      </div>

      <div className="story__intro">
        <h2 className="display campaign story__title" data-split>
          Focus,
          <br />
          measured
          <br />
          differently.
        </h2>
      </div>

      <div className="story__meta" aria-hidden>
        <div className="story__count">
          <div className="story__count-track">
            {STOPS.map((s) => (
              <span key={s.n}>{s.n}</span>
            ))}
          </div>
        </div>
        <div className="story__rail">
          <span className="story__rail-fill" />
        </div>
      </div>

      <ol className="story__steps">
        {STOPS.map((st) => (
          <li key={st.n} className="story__step">
            <div className="line-mask">
              <h3 className="campaign story__line story__name">{st.title}</h3>
            </div>
            <div className="line-mask">
              <p className="body story__line story__body">{st.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
