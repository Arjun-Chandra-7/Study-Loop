"use client";

import { useEffect, useState } from "react";
import { Icon, type IconName } from "./Icon";
import "./how.css";

/** The one sentence StudyLoop is, everywhere a newcomer meets it. */
export const TAGLINE = "A band that feels stress. Music that answers it.";

export const BEATS: { icon: IconName; title: string; body: string }[] = [
  { icon: "band", title: "Wear", body: "The band reads your heart rate and skin conductance." },
  { icon: "baseline", title: "Study", body: "It learns your calm, then watches for stress." },
  { icon: "music", title: "It adapts", body: "Stress climbs? Your music slows and softens." },
];

const BEAT_MS = 2400;

/**
 * StudyLoop in three beats. With `auto`, it plays like stories: one idea at a
 * time, each with its own progress bar, ending with all three lit.
 */
export function HowItWorks({ auto = false, onDone }: { auto?: boolean; onDone?: () => void }) {
  const [at, setAt] = useState(auto ? 0 : BEATS.length);

  useEffect(() => {
    if (!auto) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion shows every beat at once
      setAt(BEATS.length);
      return;
    }
    const t = setInterval(() => setAt((n) => (n >= BEATS.length ? (clearInterval(t), n) : n + 1)), BEAT_MS);
    return () => clearInterval(t);
  }, [auto]);

  useEffect(() => {
    if (at >= BEATS.length) onDone?.();
  }, [at, onDone]);

  return (
    <div className={`how ${auto ? "how--auto" : ""}`}>
      {auto && (
        <div className="how__bars" aria-hidden>
          {BEATS.map((b, i) => (
            <span key={b.title} className={i < at ? "is-done" : i === at ? "is-now" : ""} style={{ animationDuration: `${BEAT_MS}ms` }} />
          ))}
        </div>
      )}
      <ol className="how__beats">
        {BEATS.map((b, i) => (
          <li key={b.title} className={`how__beat ${i <= at ? "is-on" : ""} ${i === at ? "is-now" : ""}`}>
            <span className="how__icon" aria-hidden>
              <Icon name={b.icon} size={18} />
            </span>
            <span className="how__text">
              <b>
                <span className="how__n tnum">{i + 1}</span>
                {b.title}
              </b>
              <span>{b.body}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
