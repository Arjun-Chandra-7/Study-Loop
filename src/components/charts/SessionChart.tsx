"use client";

import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";
import { motion } from "motion/react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { SessionEvent, SessionSample } from "@/lib/engine";
import type { Baseline } from "@/lib/sensors/classify";
import { runs, smoothPath, signedPercent } from "@/lib/format";

interface Props {
  samples: SessionSample[];
  events: SessionEvent[];
  baseline: Baseline | null;
  durationMs: number;
}

const LANE_GAP = 28;
const PAD_X = 40;
const PAD_TOP = 8;
const PAD_BOTTOM = 28;

/**
 * Two lanes on one clock: heart rate above, skin conductance below, both
 * against the student's own baseline. Coral marks are events, never data.
 */
export function SessionChart({ samples, events, baseline, durationMs }: Props) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [h, setH] = useState(260);
  const [hover, setHover] = useState<number | null>(null);
  const reduced = useReducedMotionSafe();

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      setW(Math.max(240, e.contentRect.width));
      setH(Math.max(180, e.contentRect.height));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const laneH = (h - PAD_TOP - PAD_BOTTOM - LANE_GAP) / 2;
  const plotW = w - PAD_X * 2;
  const dur = Math.max(durationMs, samples.at(-1)?.at ?? 0, 60_000);
  const xAt = (at: number) => PAD_X + (at / dur) * plotW;

  const lanes = useMemo(() => {
    const make = (key: "hr" | "eda", top: number, base: number | undefined) => {
      const vals = samples.map((s) => s[key]).filter((v): v is number => v != null);
      if (base != null) vals.push(base);
      const lo = vals.length ? Math.min(...vals) : 0;
      const hi = vals.length ? Math.max(...vals) : 1;
      const span = (hi - lo || 1) * 1.2;
      const mid = (hi + lo) / 2;
      const y = (v: number) => top + laneH - ((v - (mid - span / 2)) / span) * laneH;
      const segs = runs(samples, (s) => s[key] != null).map((seg) =>
        smoothPath(seg.map((s) => [xAt(s.at), y(s[key]!)] as [number, number])),
      );
      return { y, segs, top, base };
    };
    return {
      hr: make("hr", PAD_TOP, baseline?.hr),
      eda: make("eda", PAD_TOP + laneH + LANE_GAP, baseline?.eda),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [samples, baseline, w, h, dur]);

  const ticks = useMemo(() => {
    const mins = dur / 60_000;
    const step = mins > 60 ? 15 : mins > 20 ? 10 : mins > 6 ? 2 : 1;
    const out: number[] = [];
    for (let m = 0; m <= mins + 0.001; m += step) out.push(m);
    return out;
  }, [dur]);

  const hovered = hover != null ? samples[hover] : null;

  const onMove = (e: React.PointerEvent) => {
    if (!samples.length) return;
    const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
    const at = ((e.clientX - rect.left - PAD_X) / plotW) * dur;
    let best = 0;
    for (let i = 0; i < samples.length; i++) {
      if (Math.abs(samples[i].at - at) < Math.abs(samples[best].at - at)) best = i;
    }
    setHover(best);
  };

  const draw = reduced
    ? {}
    : { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 1.4, ease: [0.65, 0, 0.35, 1] as const } };

  return (
    <div ref={wrap} className="chart">
      <svg
        width={w}
        height={h}
        role="img"
        aria-label="Heart rate and skin conductance across the session, compared to baseline"
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${id}-f`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--measured)" stopOpacity="0.18" />
            <stop offset="1" stopColor="var(--measured)" stopOpacity="0" />
          </linearGradient>
        </defs>

        {(["hr", "eda"] as const).map((k) => {
          const lane = lanes[k];
          return (
            <g key={k}>
              <text x={0} y={lane.top + 10} className="chart__lane">
                {k === "hr" ? "HR" : "EDA"}
              </text>
              <line x1={PAD_X} x2={w - PAD_X} y1={lane.top + laneH} y2={lane.top + laneH} stroke="var(--line-1)" />
              {lane.base != null && (
                <>
                  <line
                    x1={PAD_X}
                    x2={w - PAD_X}
                    y1={lane.y(lane.base)}
                    y2={lane.y(lane.base)}
                    stroke="var(--line-3)"
                    strokeDasharray="2 4"
                  />
                  <text x={w - PAD_X + 8} y={lane.y(lane.base) + 4} className="chart__tick">
                    base
                  </text>
                </>
              )}
              {lane.segs.map((d, i) => (
                <g key={i}>
                  {k === "eda" && (
                    <path d={`${d}V${lane.top + laneH}H${PAD_X}Z`} fill={`url(#${id}-f)`} opacity={0.9} />
                  )}
                  <motion.path
                    d={d}
                    fill="none"
                    stroke="var(--measured)"
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    {...draw}
                  />
                </g>
              ))}
            </g>
          );
        })}

        {events.map((ev, i) => {
          const x = xAt(ev.at);
          return (
            <g key={i} className={`chart__event chart__event--${ev.kind}`}>
              <line x1={x} x2={x} y1={PAD_TOP} y2={h - PAD_BOTTOM} />
              {ev.kind === "mark" ? (
                <path d={`M${x},${PAD_TOP}h7l-2,3 2,3h-7`} />
              ) : (
                <circle cx={x} cy={h - PAD_BOTTOM} r={3} />
              )}
            </g>
          );
        })}

        {ticks.map((m) => (
          <text key={m} x={xAt(m * 60_000)} y={h - 8} textAnchor="middle" className="chart__tick">
            {m}m
          </text>
        ))}

        {hovered && (
          <g pointerEvents="none">
            <line
              x1={xAt(hovered.at)}
              x2={xAt(hovered.at)}
              y1={PAD_TOP}
              y2={h - PAD_BOTTOM}
              stroke="var(--line-3)"
            />
            {hovered.hr != null && <circle cx={xAt(hovered.at)} cy={lanes.hr.y(hovered.hr)} r={3.5} className="chart__dot" />}
            {hovered.eda != null && <circle cx={xAt(hovered.at)} cy={lanes.eda.y(hovered.eda)} r={3.5} className="chart__dot" />}
          </g>
        )}
      </svg>

      {hovered && (
        <div
          className="chart__tip"
          style={{
            transform: `translate(${Math.min(w - 176, Math.max(0, xAt(hovered.at) + 12))}px, 8px)`,
          }}
        >
          <span className="chart__tip-time">{(hovered.at / 60_000).toFixed(1)} min</span>
          <span>
            <b>{hovered.hr != null ? Math.round(hovered.hr) : "—"}</b> bpm
          </span>
          <span>
            EDA <b>{signedPercent(baseline && hovered.eda != null ? (hovered.eda - baseline.eda) / baseline.eda : null)}</b>
          </span>
        </div>
      )}
    </div>
  );
}
