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
            src="/media/studyloop-band-hd.png"
            alt=""
            fill
            preload
            sizes="(max-width: 1023px) 100vw, 80vw"
            className="hero__img"
          />
        </div>
        {/* Coordinates are in the render's own image space. */}
        <ul className="hero__callouts" aria-label="Band hardware">
          <li style={{ left: "50%", top: "36.5%" }}>
            <span className="callout__dot" />
            <span className="callout__text">Status light</span>
          </li>
          <li style={{ left: "68.5%", top: "37%" }}>
            <span className="callout__dot" />
            <span className="callout__text">One button</span>
          </li>
          <li data-side="down" style={{ left: "37.8%", top: "51%" }}>
            <span className="callout__dot" />
            <span className="callout__text">EDA electrodes</span>
          </li>
        </ul>
      </motion.div>
      {/* Rim light echoing the band's LED — the one light source in the scene. */}
      <motion.div className="hero__rim" style={{ x: glowX }} aria-hidden />

      <motion.div className="hero__copy" style={{ x: textX }}>
        {/* The logo already says StudyLoop: the headline says what it does. */}
        <h1 className="display hero__title">
          <span className="campaign hero__title-1">A band that feels stress.</span>
          <span className="hero__title-2">Music that answers it.</span>
        </h1>
        <p className="body hero__body">Wear it while you study. When stress climbs, your music slows and softens with you.</p>
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
      <a className="foot__scroll" href="#story">
        Inside the band
        <Icon name="arrow" size={14} style={{ transform: "rotate(90deg)" }} />
      </a>
    </div>
  );
}
