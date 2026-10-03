"use client";

import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";
import Image from "next/image";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { orbFor } from "../orb/orbState";
import { StateOrb } from "../orb/StateOrb";
import { Icon } from "../ui/Icon";
import { Magnetic } from "../ui/Magnetic";

export function HomeView({ stageRef }: { stageRef: React.RefObject<HTMLDivElement | null> }) {
  const reduced = useReducedMotionSafe();
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const imgX = useTransform(sx, (v) => v * 12);
  const imgY = useTransform(sy, (v) => v * 8);
  const glowX = useTransform(sx, (v) => v * 24);
  const textX = useTransform(sx, (v) => v * -4);

  useEffect(() => {
    const el = stageRef.current;
    if (!el || reduced) return;
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      mx.set(((e.clientX - r.left) / r.width - 0.5) * 2);
      my.set(((e.clientY - r.top) / r.height - 0.5) * 2);
    };
    const onLeave = () => {
      mx.set(0);
      my.set(0);
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerleave", onLeave);
    };
  }, [stageRef, reduced, mx, my]);

  const s = useStudyLoop();
  const start = () => {
    engine.setTab("session");
    if (s.session.phase === "complete") engine.newSession();
  };

  return (
    <div className="hero">
      <motion.div className="hero__product" style={{ x: imgX, y: imgY }}>
        <div className="hero__plate" aria-hidden>
          <Image
            src="/media/studyloop-band.png"
            alt=""
            fill
            preload
            sizes="(max-width: 1023px) 100vw, 80vw"
            className="hero__img"
          />
        </div>
        {/* Coordinates are in the render's own image space. */}
        <ul className="hero__callouts" aria-label="Band hardware">
          <li data-side="up" style={{ left: "46%", top: "33%" }}>
            <span className="callout__dot" />
            <span className="callout__text">Status light</span>
          </li>
          <li style={{ left: "63.5%", top: "44%" }}>
            <span className="callout__dot" />
            <span className="callout__text">One button</span>
          </li>
          <li data-side="down" style={{ left: "37%", top: "63%" }}>
            <span className="callout__dot" />
            <span className="callout__text">EDA electrodes</span>
          </li>
        </ul>
      </motion.div>
      {/* Rim light echoing the band's LED — the one light source in the scene. */}
      <motion.div className="hero__rim" style={{ x: glowX }} aria-hidden />

      <motion.div className="hero__copy" style={{ x: textX }}>
        <p className="eyebrow">
          <span className="eyebrow__rule" aria-hidden />
          A study band + adaptive music
        </p>
        <h1 className="display hero__title">StudyLoop</h1>
        <p className="serif hero__serif">A band that feels stress. Music that answers it.</p>
        <p className="body hero__body">
          Wear the band while you study. It reads your heart rate and skin, learns your calm, and when stress climbs, your music slows and softens with you.
        </p>
        <div className="hero__ctas">
          <Magnetic>
            <button type="button" className="btn btn--primary" onClick={start}>
              Start a session
              <Icon name="arrow" size={16} />
            </button>
          </Magnetic>
          <button type="button" className="btn btn--ghost" onClick={() => engine.setTab("research")}>
            Explore the research
          </button>
        </div>
      </motion.div>

    </div>
  );
}

export function HomeFoot() {
  const s = useStudyLoop();
  const conn = s.reading.connection;
  const orb = orbFor({ connection: conn, phase: s.session.phase, physio: s.physio, research: s.research });
  return (
    <div className="foot foot--home">
      <div className="foot__status">
        <StateOrb {...orb} size={48} density={1.1} dotScale={0.8} className="foot__orb" />
        <span>
          {conn === "connected"
            ? s.session.baseline
              ? "Band on wrist · baseline set"
              : "Band on wrist · ready for baseline"
            : conn === "connecting"
              ? "Pairing with band…"
              : "Start a session now, or pair your band from the top bar"}
        </span>
      </div>
      <p className="foot__spec">
        <span>PPG pulse</span>
        <span>EDA electrodes</span>
        <span>No screen</span>
        <span>One button</span>
      </p>
      <a className="foot__scroll" href="#story">
        Inside the band
        <Icon name="arrow" size={14} style={{ transform: "rotate(90deg)" }} />
      </a>
    </div>
  );
}
