"use client";

import { gsap } from "gsap";
import { useGSAP } from "@gsap/react";
import { useEffect, useRef, useState } from "react";
import { intro } from "@/lib/intro";
import { DotCanvas } from "../motion/DotCanvas";
import { introScene } from "../motion/scenes";
import { lockScroll } from "../motion/SmoothScroll";

gsap.registerPlugin(useGSAP);

const STATUS = ["Waking the band", "Pairing over Bluetooth", "Calibrating sensors", "Loading your baseline", "Ready"];

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
 * Intro: particles spiral into the orb → the orb collapses into the band's
 * status light → the screen splits open along that light → a skeleton of
 * the exact layout shimmers → it dissolves as the real cards land on it.
 */
export function Intro() {
  const root = useRef<HTMLDivElement>(null);
  const param = useRef(0);
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
        param.current = 1;
        gsap.set(q(".intro__core"), { opacity: 0 });
        gsap.to(root.current, { opacity: 0, duration: 0.4, delay: 0.3, onStart: done, onComplete: () => setGone(true) });
        return;
      }

      const counter = { v: 0 };
      const num = q(".intro__num")[0] as HTMLElement;
      const lines = q(".intro__status li");
      let lastLine = -1;
      const renderCounter = () => {
        num.textContent = String(Math.round(counter.v)).padStart(3, "0");
        const idx = Math.min(STATUS.length - 1, Math.floor((counter.v / 100) * (STATUS.length - 1) + 0.001));
        if (idx !== lastLine) {
          lastLine = idx;
          lines.forEach((l, i) => {
            l.toggleAttribute("data-active", i === idx);
            l.toggleAttribute("data-done", i < idx);
          });
        }
      };

      gsap.set(q(".intro__word .c"), { yPercent: 120 });
      gsap.set(q(".intro__led"), { scaleX: 0, opacity: 0 });
      gsap.set(q(".sk-anim"), { opacity: 0, scale: 0.94, y: 16 });

      let loaded = false;
      let atPause = false;
      const tl = gsap.timeline({ defaults: { ease: "power3.inOut" } });
      tlRef.current = tl;
      tl.from(q(".intro__meta > *"), { opacity: 0, y: 20, stagger: 0.08, duration: 0.8, ease: "expo.out" }, 0)
        .to(param, { current: 0.5, duration: 1.7, ease: "power2.out" }, 0)
        .to(counter, { v: 72, duration: 1.9, ease: "power1.inOut", onUpdate: renderCounter }, 0)
        .to(q(".intro__word .c"), { yPercent: 0, stagger: 0.045, duration: 0.9, ease: "expo.out" }, 1.1)
        .to(param, { current: 1, duration: 0.9 }, 1.8)
        .to(q(".intro__led"), { scaleX: 1, opacity: 1, duration: 0.45, ease: "expo.out" }, 2.45)
        .to(q(".intro__canvas"), { opacity: 0, duration: 0.3 }, 2.6)
        .addPause("loaded", () => {
          atPause = true;
          if (loaded) tl.play();
        })
        .to(counter, { v: 100, duration: 0.5, ease: "power2.out", onUpdate: renderCounter }, "loaded")
        // Exit: the light stretches edge to edge, then the room splits along it.
        .to(q(".intro__word, .intro__meta"), { opacity: 0, y: -24, filter: "blur(8px)", duration: 0.5, stagger: 0.05 }, "loaded+=0.45")
        .to(q(".intro__led"), { scaleX: 6, duration: 0.6, ease: "expo.in" }, "loaded+=0.5")
        .addLabel("open", "loaded+=1.05")
        .to(q(".intro__curtain--top"), { yPercent: -100, duration: 1.1, ease: "power4.inOut" }, "open")
        .to(q(".intro__curtain--bottom"), { yPercent: 100, duration: 1.1, ease: "power4.inOut" }, "open")
        .to(q(".intro__led"), { opacity: 0, scaleY: 12, duration: 0.6, ease: "power2.out" }, "open")
        .to(q(".sk-anim"), { opacity: 1, scale: 1, y: 0, stagger: 0.045, duration: 0.7, ease: "back.out(1.6)" }, "open+=0.15")
        .fromTo(q(".intro__scan"), { yPercent: -10, opacity: 1 }, { yPercent: 1000, opacity: 0.2, duration: 1.3, ease: "power2.inOut" }, "open+=0.2")
        // Hand-off: real cards pop in while the skeleton dissolves onto them.
        .call(done, [], "open+=1.25")
        .to(q(".sk-anim"), { opacity: 0, scale: 1.02, filter: "blur(6px)", stagger: 0.035, duration: 0.55, ease: "power2.in" }, "open+=1.35")
        .to(q(".intro__skeleton"), { opacity: 0, duration: 0.5 }, "open+=1.9")
        .call(() => setGone(true));

      // A branded reveal earns ~2s once per visit: same choreography at 2×,
      // and repeat loads in the same session run at skip speed.
      let seen = false;
      try {
        seen = sessionStorage.getItem("sl-intro-seen") === "1";
        sessionStorage.setItem("sl-intro-seen", "1");
      } catch {}
      tl.timeScale(seen ? 5 : 2);

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
        <div className="intro__canvas">
          <DotCanvas scene={introScene} param={param} fps={60} />
        </div>
        <span className="intro__led" aria-hidden />
        <p className="intro__word display" aria-hidden>
          {"StudyLoop".split("").map((c, i) => (
            <span key={i} className="c-mask">
              <span className="c">{c}</span>
            </span>
          ))}
        </p>
        <div className="intro__meta">
          <span className="intro__num tnum">000</span>
          <ol className="intro__status">
            {STATUS.map((s, i) => (
              <li key={s} data-active={i === 0 || undefined}>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </div>

      <button type="button" className="intro__skip" onClick={skip}>
        Skip intro
      </button>
    </div>
  );
}
