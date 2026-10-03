"use client";

import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useEffect, useRef, useState } from "react";
import { isDemo } from "@/lib/demo";
import { intro } from "@/lib/intro";
import { lockScroll } from "../motion/SmoothScroll";
import { WORDMARK_LETTERS, WORDMARK_VIEWBOX } from "./wordmark";

gsap.registerPlugin(useGSAP);

/** Resolves when fonts and the hero render are in, or after a ceiling. */
function whenLoaded(maxMs = 3500) {
  const load = new Promise<void>((r) =>
    document.readyState === "complete" ? r() : window.addEventListener("load", () => r(), { once: true }),
  );
  return Promise.race([
    Promise.all([document.fonts?.ready, load]).then(() => undefined),
    new Promise<void>((r) => setTimeout(r, maxMs)),
  ]);
}

/**
 * Intro: the wordmark writes itself (Mona Sans outlines traced, then filled,
 * then a sheen) → it sinks into a single warm light → the light stretches
 * edge to edge and the screen splits open along it → a skeleton of the exact
 * layout shimmers → it dissolves as the real cards land on it.
 */
export function Intro() {
  const root = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    window.scrollTo(0, 0);
    lockScroll(true);
    return () => lockScroll(false);
  }, []);

  useGSAP(
    () => {
      const q = gsap.utils.selector(root);
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const done = () => {
        intro.finish();
        lockScroll(false);
      };

      if (reduced) {
        gsap.set(q(".wm-ink"), { strokeDashoffset: 0, fillOpacity: 1, strokeOpacity: 0 });
        gsap.to(root.current, { opacity: 0, duration: 0.4, delay: 0.6, onStart: done, onComplete: () => setGone(true) });
        return;
      }

      gsap.set(q(".intro__led"), { scaleX: 0, opacity: 0 });
      gsap.set(q(".sk-anim"), { opacity: 0, scale: 0.94, y: 16 });

      let loaded = false;
      let atPause = false;
      const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
      tlRef.current = tl;
      tl
        // 1 · Write: each letter's outline is traced, as if by pen, then inked in.
        .to(q(".wm-ink"), { strokeDashoffset: 0, duration: 1.7, stagger: 0.14, ease: "power2.inOut" }, 0.3)
        .to(q(".wm-ink"), { fillOpacity: 1, duration: 0.9, stagger: 0.08, ease: "power1.out" }, 1.6)
        .to(q(".wm-ink"), { strokeOpacity: 0, duration: 0.8, stagger: 0.08 }, 2.1)
        .fromTo(
          q(".wm-sheen-grad"),
          { attr: { x1: -600, x2: -200 } },
          { attr: { x1: 1300, x2: 1700 }, duration: 1.6, ease: "power2.inOut" },
          2.4,
        )
        .fromTo(
          q(".intro__tag"),
          { opacity: 0, y: 10, letterSpacing: "0.6em" },
          { opacity: 1, y: 0, letterSpacing: "0.32em", duration: 1.2, ease: "expo.out" },
          2.5,
        )
        .addLabel("loaded", 4)
        .addPause("loaded", () => {
          atPause = true;
          if (loaded) tl.play();
        })
        // 2 · The word sinks into a single warm light.
        .to(q(".intro__tag"), { opacity: 0, y: 8, duration: 0.5 }, "loaded")
        .to(q(".intro__mark"), { y: "4vmin", scaleY: 0.2, opacity: 0, filter: "blur(10px)", duration: 1, ease: "power3.in" }, "loaded+=0.1")
        .to(q(".intro__led"), { scaleX: 1, opacity: 1, duration: 1.2, ease: "expo.out" }, "loaded+=0.8")
        // 3 · The light stretches edge to edge — slowly — then the room splits along it.
        .to(q(".intro__led"), { scaleX: 6, duration: 1.4, ease: "power3.in" }, "loaded+=1.8")
        .addLabel("open", "loaded+=3.1")
        .to(q(".intro__curtain--top"), { yPercent: -100, duration: 1.5, ease: "power4.inOut" }, "open")
        .to(q(".intro__curtain--bottom"), { yPercent: 100, duration: 1.5, ease: "power4.inOut" }, "open")
        .to(q(".intro__led"), { opacity: 0, scaleY: 12, duration: 1, ease: "power2.out" }, "open")
        .to(q(".sk-anim"), { opacity: 1, scale: 1, y: 0, stagger: 0.045, duration: 0.7, ease: "back.out(1.6)" }, "open+=0.3")
        .fromTo(
          q(".intro__scan"),
          { yPercent: -10, opacity: 1 },
          { yPercent: 1000, opacity: 0.2, duration: 1.4, ease: "power2.inOut" },
          "open+=0.35",
        )
        // Hand-off: real cards pop in while the skeleton dissolves onto them.
        .call(done, [], "open+=1.45")
        .to(q(".sk-anim"), { opacity: 0, scale: 1.02, filter: "blur(6px)", stagger: 0.035, duration: 0.55, ease: "power2.in" }, "open+=1.55")
        .to(q(".intro__skeleton"), { opacity: 0, duration: 0.5 }, "open+=2.1")
        .call(() => setGone(true));

      // The full film plays once per visit; repeat loads in the same session run at skip speed.
      let seen = false;
      try {
        seen = sessionStorage.getItem("sl-intro-seen") === "1";
        sessionStorage.setItem("sl-intro-seen", "1");
      } catch {}
      // Judges are short on time: the film runs fast in demo mode.
      tl.timeScale(seen ? 4 : isDemo() ? 2.2 : 1);

      whenLoaded().then(() => {
        loaded = true;
        if (atPause) tl.play();
      });
    },
    { scope: root },
  );

  const skip = () => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.timeScale(5);
    if (tl.paused()) tl.play();
  };

  if (gone) return null;

  const sk = (extra = "") => <div className={`sk sk-anim ${extra}`} />;

  return (
    <div className="intro" ref={root} role="status" aria-live="polite" aria-label="Loading StudyLoop">
      {/* The skeleton — same grid as the real cockpit, so the hand-off lands in place. */}
      <div className="intro__skeleton" aria-hidden>
        <div className="only-wide">
          <div className="cockpit-shell">
            <div className="cockpit sk-cockpit">
              <span className="sk-capsule sk-anim">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} />
                ))}
              </span>
              <div className="sk sk-anim sk-main">
                <span className="sk-line" style={{ width: "10%", top: 32 }} />
                <span className="sk-line sk-line--xl" style={{ width: "38%", top: 96 }} />
                <span className="sk-line" style={{ width: "22%", top: 176 }} />
                <span className="sk-line" style={{ width: "28%", top: 208 }} />
                <span className="sk-line sk-line--btn" style={{ top: 256 }} />
                <span className="sk-orb" />
                <span className="sk-status" />
              </div>
              <div className="notch notch--bl sk-notch">
                {sk()}
                {sk()}
              </div>
              <div className="area-c">{sk()}</div>
              <div className="area-d">{sk()}</div>
              <div className="area-player">{sk("sk--player")}</div>
              <div className="area-trend">{sk()}</div>
              <div className="area-research">{sk("sk--tall")}</div>
              <div className="area-profile">{sk("sk--pill")}</div>
              <span className="sk-dock sk-anim" />
            </div>
          </div>
        </div>
        <div className="only-phone">
          <div className="sk-phone">
            <div className="sk-phone__top sk-anim">
              <span />
              <span />
              <span />
              <b />
              <i />
              <i />
              <i />
              <i />
            </div>
            <span className="sk sk-anim sk-phone__pill" />
            <span className="sk sk-anim sk-phone__bar" />
            <span className="sk-phone__note sk-anim">
              <span />
              <span />
              <span />
            </span>
            <div className="sk-phone__tri">
              <span className="sk sk-anim sk-phone__l" />
              <span className="sk sk-anim sk-phone__c" />
              <span className="sk sk-anim sk-phone__r" />
            </div>
            <span className="sk-anim sk-phone__strip" />
          </div>
        </div>
        <span className="intro__scan" />
      </div>

      <div className="intro__curtain intro__curtain--top" />
      <div className="intro__curtain intro__curtain--bottom" />

      <div className="intro__core">
        <span className="intro__led" aria-hidden />
        <div className="intro__mark">
          <svg className="intro__word" viewBox={WORDMARK_VIEWBOX} aria-hidden>
            <defs>
              <linearGradient className="wm-sheen-grad" id="wm-sheen" gradientUnits="userSpaceOnUse" x1="-600" y1="0" x2="-200" y2="0">
                <stop offset="0" stopColor="#fff" stopOpacity="0" />
                <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
                <stop offset="1" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
            </defs>
            {WORDMARK_LETTERS.map((l, i) => (
              <path key={i} className="wm-ink" d={l.d} pathLength={1} />
            ))}
            <g className="wm-sheen">
              {WORDMARK_LETTERS.map((l, i) => (
                <path key={i} d={l.d} />
              ))}
            </g>
          </svg>
          <p className="intro__tag">Focus, measured differently</p>
        </div>
      </div>

      <button type="button" className="intro__skip" onClick={skip}>
        Skip intro
      </button>
    </div>
  );
}
