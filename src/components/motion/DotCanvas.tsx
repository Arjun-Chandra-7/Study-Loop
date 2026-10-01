"use client";

import { useEffect, useRef } from "react";
import { finalizeFrame, paintFrame, type Dot, type Line } from "thinking-orbs/engine";
import { usePalette } from "@/lib/prefs";

export interface SceneFrame {
  dots: Dot[];
  lines?: Line[];
  /** painted in the accent tint on top of the main pass */
  accent?: Dot[];
}

/**
 * A scene is pure geometry over (width, height, time, param) — the same
 * contract as a Thinking Orbs mode, so every motion graphic on the site is
 * drawn by the orb library's own painter and shares its dotted, depth-lit
 * language.
 */
export type Scene = (w: number, h: number, t: number, param: number) => SceneFrame;

function hex(c: string) {
  const n = parseInt(c.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function DotCanvas({
  scene,
  tint: tintProp,
  accent: accentProp,
  param,
  speed = 1,
  fps = 30,
  className,
  label,
}: {
  scene: Scene;
  tint?: string;
  accent?: string;
  /** external driver (scroll progress, frequency…) read every frame */
  param?: React.RefObject<number>;
  speed?: number;
  fps?: number;
  className?: string;
  label?: string;
}) {
  const pal = usePalette();
  const tint = tintProp ?? pal.measured;
  const accent = accentProp ?? pal.action;
  const ref = useRef<HTMLCanvasElement>(null);
  const tintRef = useRef(tint);
  const sceneRef = useRef(scene);
  useEffect(() => {
    tintRef.current = tint;
    sceneRef.current = scene;
  }, [tint, scene]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    let w = 0;
    let h = 0;
    let t = Math.random() * 10;
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    let visible = false;
    const accentTint = hex(accent);

    const draw = () => {
      if (!w || !h) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const f = sceneRef.current(w, h, t, param?.current ?? 0);
      paintFrame(ctx, finalizeFrame(f.dots, f.lines ?? [], 0.3), true, hex(tintRef.current));
      if (f.accent?.length) paintFrame(ctx, finalizeFrame(f.accent, [], 0.3), true, accentTint);
    };

    const ro = new ResizeObserver(([e]) => {
      w = e.contentRect.width;
      h = e.contentRect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      draw();
    });
    ro.observe(canvas);

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      t += dt * speed;
      acc += dt;
      if (acc >= 1 / fps) {
        acc = 0;
        draw();
      }
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (reduced) return draw();
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
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [accent, fps, param, speed]);

  return (
    <canvas
      ref={ref}
      className={className}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%" }}
    />
  );
}
