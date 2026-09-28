"use client";

import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";
import { motion, useSpring, useTransform } from "motion/react";
import { useEffect } from "react";

/**
 * Live values glide rather than flicker — a changing number should read as
 * a trend, not an alarm.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  signed = false,
  className,
}: {
  value: number | null;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  signed?: boolean;
  className?: string;
}) {
  const reduced = useReducedMotionSafe();
  const spring = useSpring(value ?? 0, { stiffness: 70, damping: 20, mass: 1 });
  useEffect(() => {
    if (value == null) return;
    if (reduced) spring.jump(value);
    else spring.set(value);
  }, [value, reduced, spring]);

  const text = useTransform(spring, (v) => {
    const s = v.toFixed(decimals);
    return `${prefix}${signed && v >= 0 ? "+" : ""}${s}${suffix}`;
  });

  if (value == null) return <span className={className}>—</span>;
  return <motion.span className={className}>{text}</motion.span>;
}
