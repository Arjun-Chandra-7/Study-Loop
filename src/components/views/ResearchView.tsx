"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { BANDS } from "../research/bands";
import { wavePath } from "../cockpit/LowerCards";

export function ResearchView() {
  const [id, setId] = useState<(typeof BANDS)[number]["id"]>("theta");
  const band = BANDS.find((b) => b.id === id)!;
  // Visual cycles scale with log-frequency so 40 Hz stays readable next to 6 Hz.
  const cycles = Math.round(3 + Math.log2(band.hz) * 3.2);

  return (
    <div className="research">
      <div className="research__head">
        <p className="eyebrow eyebrow--action">
          <span className="eyebrow__rule" aria-hidden />
          Research · separate from your measured data
        </p>
        <h2 className="display display--md">
          The signals
          <br />
          behind focus
        </h2>
      </div>

      <div className="research__tabs" role="tablist" aria-label="Frequency bands">
        {BANDS.map((b) => (
          <button
            key={b.id}
            role="tab"
            type="button"
            aria-selected={b.id === id}
            className={`band-tab ${b.experimental ? "band-tab--exp" : ""}`}
            onClick={() => setId(b.id)}
          >
            <span className="band-tab__name">{b.name}</span>
            <span className="band-tab__range">{b.range}</span>
            {b.id === id && <motion.span layoutId="band-underline" className="band-tab__line" />}
          </button>
        ))}
      </div>

      <div className="research__stage" role="tabpanel">
        <div className={`osc ${band.experimental ? "osc--exp" : ""}`} aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.div
              key={band.id}
              className="osc__track"
              style={{ ["--dur" as string]: `${Math.max(2.5, 10 - band.hz / 6)}s` }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              {[0, 1].map((i) => (
                <svg key={i} viewBox="0 0 400 120" preserveAspectRatio="none">
                  <path d={wavePath(400, 120, cycles, 0.34)} />
                </svg>
              ))}
            </motion.div>
          </AnimatePresence>
          <span className="osc__axis" />
        </div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={band.id}
            className="research__copy"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
          >
            <p className="serif serif--lg">{band.line}</p>
            <p className="body muted">{band.body}</p>
            {band.experimental && <span className="chip chip--action-outline">Experimental · not a treatment</span>}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

export function ResearchFoot() {
  return (
    <div className="foot foot--legend">
      <p>
        <span className="legend__swatch legend__swatch--measured" aria-hidden />
        <b>Measured by the band</b> heart rate · skin conductance
      </p>
      <p>
        <span className="legend__swatch legend__swatch--action" aria-hidden />
        <b>Explored in research</b> neural oscillations — StudyLoop does not read brain activity
      </p>
    </div>
  );
}
