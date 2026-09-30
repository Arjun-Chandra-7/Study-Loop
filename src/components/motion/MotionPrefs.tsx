"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";

/** Motion components drop movement (keep fades) when the OS asks for reduced motion. */
export function MotionPrefs({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
