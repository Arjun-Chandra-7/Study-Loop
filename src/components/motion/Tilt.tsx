"use client";

import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

/** Pointer-driven 3D tilt with a moving specular highlight. */
export function Tilt({
  children,
  className,
  max = 8,
}: {
  children: React.ReactNode;
  className?: string;
  max?: number;
}) {
  const reduced = useReducedMotionSafe();
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 180, damping: 18 });
  const sy = useSpring(py, { stiffness: 180, damping: 18 });
  const rotateY = useTransform(sx, [0, 1], [-max, max]);
  const rotateX = useTransform(sy, [0, 1], [max, -max]);
  const glare = useTransform(
    [sx, sy] as never,
    ([x, y]: number[]) =>
      `radial-gradient(420px circle at ${x * 100}% ${y * 100}%, rgba(244, 244, 240,0.09), transparent 45%)`,
  );

  return (
    <motion.div
      className={className}
      style={reduced ? undefined : { rotateX, rotateY, transformPerspective: 900 }}
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width);
        py.set((e.clientY - r.top) / r.height);
      }}
      onPointerLeave={() => {
        px.set(0.5);
        py.set(0.5);
      }}
    >
      {children}
      {!reduced && <motion.span className="tilt__glare" style={{ background: glare }} aria-hidden />}
    </motion.div>
  );
}
