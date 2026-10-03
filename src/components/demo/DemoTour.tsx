"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { exitDemo, isDemo } from "@/lib/demo";
import { useIntroDone } from "@/lib/intro";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { engine } from "@/lib/useStudyLoop";
import { lockScroll, scrollToTop } from "../motion/SmoothScroll";
import { HowItWorks } from "../ui/HowItWorks";
import { Icon } from "../ui/Icon";
import { STEPS, type Pose } from "./steps";
import "./tour.css";

const STEP_KEY = "sl-tour-step";
const PAD = 10;
const TYPE_CPS = 55;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One box around every visible element matching the selectors. */
function unionRect(selectors: string[]): Rect | null {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const sel of selectors) {
    document.querySelectorAll(sel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      x1 = Math.min(x1, r.left);
      y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right);
      y2 = Math.max(y2, r.bottom);
    });
  }
  if (!isFinite(x1)) return null;
  return { x: x1 - PAD, y: y1 - PAD, w: x2 - x1 + PAD * 2, h: y2 - y1 + PAD * 2 };
}

const same = (a: Rect | null, b: Rect | null) =>
  a === b || (!!a && !!b && Math.abs(a.x - b.x) < 1 && Math.abs(a.y - b.y) < 1 && Math.abs(a.w - b.w) < 1 && Math.abs(a.h - b.h) < 1);

/** A line's visible text, without its **bold** markers. */
const plain = (line: string) => line.replace(/\*\*/g, "");

/** The first `n` visible characters of a line, keeping its bold parts bold. */
function typedLine(line: string, n: number) {
  const out: React.ReactNode[] = [];
  let left = n;
  line.split("**").forEach((part, k) => {
    if (left <= 0 || !part) return;
    const shown = part.slice(0, left);
    left -= shown.length;
    out.push(k % 2 ? <b key={k}>{shown}</b> : shown);
  });
  return out;
}

const POSES: Pose[] = ["normal", "talking", "extra"];

function savedStep() {
  try {
    const n = Number(sessionStorage.getItem(STEP_KEY));
    return Number.isInteger(n) && n >= 0 && n < STEPS.length ? n : 0;
  } catch {
    return 0;
  }
}

/**
 * Hackathon tour: a game-style walkthrough. One part of the app is lit, the
 * rest dimmed, and Arjun explains it. Only exists in demo mode.
 */
export function DemoTour() {
  const introDone = useIntroDone();
  const [demo, setDemo] = useState(false);
  const [open, setOpen] = useState(true);
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [typed, setTyped] = useState(0);
  const nextBtn = useRef<HTMLButtonElement>(null);
  const step = STEPS[i];
  const text = plain(step.line);
  const last = i === STEPS.length - 1;
  const active = demo && introDone && open;

  // Demo mode is only knowable in the browser.
  useEffect(() => {
    if (!isDemo()) return;
    engine.baselineMs = 5_000;
    document.documentElement.dataset.demo = "";
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the tab's demo flag once on mount
    setDemo(true);
    setI(savedStep());
  }, []);

  const go = useCallback((n: number) => {
    const next = Math.max(0, Math.min(STEPS.length - 1, n));
    const s = STEPS[next];
    if (s.tab) engine.setTab(s.tab);
    s.run?.();
    setI(next);
    setTyped(0);
    try {
      sessionStorage.setItem(STEP_KEY, String(next));
    } catch {}
  }, []);

  // Entering the tour (or reopening it): start at the top of the page, and run the current step.
  useEffect(() => {
    if (!active) return;
    scrollToTop();
    lockScroll(true);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- opening the tour runs its current step
    go(i);
    return () => lockScroll(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per opening, not per step
  }, [active]);

  // Follow the target while views animate and the window resizes.
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    let prev: Rect | null | undefined;
    const track = () => {
      const r = step.target ? unionRect(step.target) : null;
      if (prev === undefined || !same(r, prev)) {
        prev = r;
        setRect(r);
      }
      raf = requestAnimationFrame(track);
    };
    track();
    return () => cancelAnimationFrame(raf);
  }, [active, step]);

  // Typewriter, like a game's dialogue box. Instant for reduced motion.
  useEffect(() => {
    if (!active) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion shows the full line at once
      setTyped(text.length);
      return;
    }
    const t = setInterval(() => setTyped((n) => (n >= text.length ? (clearInterval(t), n) : n + 1)), 1000 / TYPE_CPS);
    return () => clearInterval(t);
  }, [active, text]);

  const typing = typed < text.length;
  const next = useCallback(() => {
    if (typing) return setTyped(text.length);
    if (last) return setOpen(false);
    go(i + 1);
  }, [typing, last, text, go, i]);
  const back = useCallback(() => i > 0 && go(i - 1), [i, go]);
  const close = useCallback(() => {
    setOpen(false);
    vibeEngine.stop();
  }, []);

  useEffect(() => {
    if (!active) return;
    nextBtn.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "Enter") {
        e.preventDefault();
        next();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        back();
      } else if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, next, back, close]);

  if (!demo || !introDone) return null;

  if (!open) {
    return (
      <div className="tour-pill" role="region" aria-label="Demo mode">
        <span className="tour-pill__dot" aria-hidden />
        <span className="tour-pill__label">Demo mode</span>
        <button
          type="button"
          onClick={() => {
            go(0);
            setOpen(true);
          }}
        >
          <Icon name="play" size={14} />
          Replay tour
        </button>
        <button type="button" onClick={exitDemo}>
          Exit demo
        </button>
      </div>
    );
  }

  const full = step.art === "full";
  // He talks while the line types, then settles into the step's mood.
  const pose: Pose = typing ? "talking" : (step.mood ?? "normal");
  // The guide stands on the side away from what's lit.
  const guideLeft = !rect || rect.x + rect.w / 2 > window.innerWidth / 2;
  const progress = (i + 1) / STEPS.length;

  return (
    <div className={`tour ${full ? "tour--full" : ""}`} role="dialog" aria-modal="true" aria-label="StudyLoop demo tour">
      {/* Clicks outside the controls are held back so the tour can't be knocked off course. */}
      <div className="tour__blocker" />
      <div
        className={`tour__spot ${rect ? "" : "is-none"}`}
        style={rect ? { left: rect.x, top: rect.y, width: rect.w, height: rect.h } : undefined}
        aria-hidden
      />

      {/* Keyed by step: each card replaces the last at once, so a click never lands on a leaving one. */}
      <motion.div
          key={step.id}
          className={`tour__guide ${guideLeft ? "is-left" : "is-right"} ${full ? "is-full" : ""}`}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 26 }}
        >
          <motion.div
            className={`tour__art ${typing ? "is-talking" : ""}`}
            initial={{ x: guideLeft ? -40 : 40, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 22, delay: 0.05 }}
          >
            {/* All three poses stay loaded and cross-fade, so a change of pose never flickers. */}
            <span className={`tour__poses ${guideLeft ? "" : "is-flipped"}`}>
              {POSES.map((p) => (
                <Image
                  key={p}
                  src={`/media/arjun/${p}${full ? "" : "-bust"}.webp`}
                  alt={p === pose ? "Arjun, StudyLoop's software and research developer" : ""}
                  aria-hidden={p !== pose}
                  width={full ? 458 : 530}
                  height={full ? 1100 : 560}
                  priority
                  className={p === pose ? "is-shown" : ""}
                />
              ))}
            </span>
          </motion.div>

          <div className="tour__bubble">
            <div className="tour__who">
              <b>Arjun</b>
              <span>Software & research dev</span>
              <span className="tour__count tnum">
                {i + 1} / {STEPS.length}
              </span>
            </div>
            <p className="tour__title">{step.title}</p>
            <p className="tour__line" aria-hidden>
              {typedLine(step.line, typed)}
              {typing && <span className="tour__caret" />}
            </p>
            <p className="sr-only" aria-live="polite">
              {text}
            </p>
            {step.beats && <HowItWorks auto />}
            <div className="tour__bar" aria-hidden>
              <span style={{ transform: `scaleX(${progress})` }} />
            </div>
            <div className="tour__actions">
              <button type="button" className="tour__skip" onClick={close}>
                {last ? "Close" : "Skip tour"}
              </button>
              <div className="tour__nav">
                {i > 0 && (
                  <button type="button" className="btn btn--ghost btn--sm" onClick={back}>
                    Back
                  </button>
                )}
                <button ref={nextBtn} type="button" className="btn btn--primary btn--sm" onClick={next}>
                  {typing ? "Show all" : last ? "Explore on my own" : i === 0 ? "Let’s go" : "Next"}
                  {!typing && !last && <Icon name="arrow" size={14} />}
                </button>
              </div>
            </div>
            {last && !typing && (
              <div className="tour__end">
                <button type="button" className="tour__skip" onClick={() => go(0)}>
                  Replay the tour
                </button>
                <button type="button" className="tour__skip" onClick={exitDemo}>
                  Exit demo
                </button>
              </div>
            )}
          </div>
      </motion.div>
    </div>
  );
}
