"use client";

import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useId, useRef, useState } from "react";
import type { Tab } from "@/lib/engine";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Icon, type IconName } from "../ui/Icon";

const ITEMS: { id: Tab; label: string; icon: IconName }[] = [
  { id: "home", label: "Home", icon: "home" },
  { id: "session", label: "Session", icon: "session" },
  { id: "insights", label: "Insights", icon: "insights" },
  { id: "research", label: "Research", icon: "research" },
  { id: "music", label: "Music", icon: "music" },
  { id: "profile", label: "Profile", icon: "user" },
];

const BASE = 44;
const MAX = 68;
const REACH = 140;
const SPRING = { mass: 0.1, stiffness: 170, damping: 13 };

/**
 * Floating dock with macOS-style magnification (the pattern popularised by
 * Aceternity UI's Floating Dock / Build UI's magnified dock): items swell by
 * cursor distance on springs, the blaze active tile glides between them, and
 * a click gives a small launch bounce.
 */
export function Dock() {
  const { tab, session } = useStudyLoop();
  const mouseX = useMotionValue(Infinity);
  const reduced = useReducedMotionSafe();
  const live = session.phase === "active" || session.phase === "baseline";
  // One dock per layout (desktop + phone) — each needs its own shared-layout id.
  const layoutId = `dock-active-${useId()}`;

  return (
    <motion.nav
      className="dock"
      aria-label="Primary"
      onMouseMove={(e) => !reduced && mouseX.set(e.clientX)}
      onMouseLeave={() => mouseX.set(Infinity)}
    >
      {ITEMS.map((it, i) => (
        <DockItem
          key={it.id}
          item={it}
          active={tab === it.id}
          mouseX={mouseX}
          live={it.id === "session" && live}
          layoutId={layoutId}
          divider={i === ITEMS.length - 1}
        />
      ))}
    </motion.nav>
  );
}

function DockItem({
  item,
  active,
  mouseX,
  live,
  layoutId,
  divider,
}: {
  item: (typeof ITEMS)[number];
  layoutId: string;
  active: boolean;
  mouseX: MotionValue<number>;
  live: boolean;
  divider: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState(false);
  const bounce = useMotionValue(0);

  const distance = useTransform(mouseX, (x) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || !Number.isFinite(x)) return REACH;
    return x - (r.left + r.width / 2);
  });
  const size = useSpring(useTransform(distance, [-REACH, 0, REACH], [BASE, MAX, BASE]), SPRING);
  const iconSize = useSpring(useTransform(distance, [-REACH, 0, REACH], [20, 30, 20]), SPRING);

  const launch = () => {
    engine.setTab(item.id);
    animate(bounce, [0, -14, 0, -5, 0], { duration: 0.6, ease: "easeOut" });
  };

  return (
    <>
      {divider && <span className="dock__divider" aria-hidden />}
      <motion.button
        ref={ref}
        type="button"
        className="dock__item"
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        data-active={active || undefined}
        style={{ width: size, height: size, y: bounce }}
        onClick={launch}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setHover(true)}
        onBlur={() => setHover(false)}
        whileTap={{ scale: 0.92 }}
      >
        {active && (
          <motion.span
            layoutId={layoutId}
            className="dock__active"
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
          />
        )}
        <motion.span className="dock__icon" style={{ width: iconSize, height: iconSize }}>
          <Icon name={item.icon} size={30} style={{ width: "100%", height: "100%" }} />
        </motion.span>
        {live && <span className="dock__live" aria-hidden />}

        <AnimatePresence>
          {hover && (
            <motion.span
              className="dock__tip"
              initial={{ opacity: 0, y: 8, x: "-50%", scale: 0.9 }}
              animate={{ opacity: 1, y: 0, x: "-50%", scale: 1 }}
              exit={{ opacity: 0, y: 4, x: "-50%", scale: 0.95 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
            >
              {item.label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}
