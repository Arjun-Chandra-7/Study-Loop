"use client";

import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef } from "react";
import { scaleCounts, scaleRadii, type OrbState } from "thinking-orbs";
import { MODE_FRAMES, paintFrame, resolvePreset } from "thinking-orbs/engine";

interface Props {
  state: OrbState;
  speed: number;
  color: string;
  /** rendered CSS size in px */
  size: number;
  label: string;
  paused?: boolean;
  /** density / dot size multipliers for large renders */
  density?: number;
  dotScale?: number;
  className?: string;
}

function hexToTint(hex: string) {
  const n = parseInt(hex.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/**
 * Hero-scale Thinking Orb. Uses the library's own geometry (MODE_FRAMES)
 * and painter (paintFrame) — only the host loop is ours, so we can render
 * at any size, ease speed changes instead of jumping, cap to 30 fps, and
 * crossfade between states.
 */
function OrbCanvas({ state, size, color, speedRef, paused, density = 1, dotScale = 1 }: {
  state: OrbState;
  size: number;
  color: string;
  speedRef: React.RefObject<number>;
  paused: boolean;
  density?: number;
  dotScale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const reduced = useReducedMotionSafe();

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { mode, speed: base, opts: preset } = resolvePreset(state, 64);
    let opts = density !== 1 ? scaleCounts(preset, density) : preset;
    if (dotScale !== 1) opts = scaleRadii(opts, dotScale);
    const frameFn = MODE_FRAMES[mode];
    const tint = hexToTint(color);

    let t = 4 + Math.random() * 20;
    let cur = speedRef.current ?? 1;
    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      paintFrame(ctx, frameFn(size, t, opts), true, tint);
    };

    if (reduced || paused) {
      draw();
      return;
    }

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let visible = true;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      acc += dt;
      // Ease speed so state changes feel like a change of pace, never a jump.
      cur += ((speedRef.current ?? 1) - cur) * Math.min(1, dt * 1.5);
      t += dt * base * cur;
      if (acc >= 1 / 30) {
        acc = 0;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      cancelAnimationFrame(raf);
      last = performance.now();
      raf = requestAnimationFrame(loop);
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !document.hidden) start();
      else cancelAnimationFrame(raf);
    });
    io.observe(canvas);
    const onVis = () => (document.hidden || !visible ? cancelAnimationFrame(raf) : start());
    document.addEventListener("visibilitychange", onVis);
    draw();
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [state, size, color, paused, reduced, density, dotScale, speedRef]);

  return <canvas ref={ref} style={{ width: size, height: size, display: "block" }} aria-hidden />;
}

export function StateOrb({ state, speed, color, size, label, paused = false, density, dotScale, className }: Props) {
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const key = `${state}-${color}`;
  return (
    <div
      className={className}
      role="img"
      aria-label={label}
      style={{ position: "relative", width: size, height: size }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={key}
          style={{ position: "absolute", inset: 0 }}
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.9, ease: [0.2, 0.8, 0.2, 1] }}
        >
          <OrbCanvas
            state={state}
            size={size}
            color={color}
            speedRef={speedRef}
            paused={paused}
            density={density}
            dotScale={dotScale}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
