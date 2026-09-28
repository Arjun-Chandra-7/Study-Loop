import { runs, smoothPath } from "@/lib/format";
import { useId } from "react";

/** Thin, calm trace. Nulls break the line instead of inventing data. */
export function Sparkline({
  values,
  baseline,
  tone = "measured",
  height = 32,
  className,
  pad = 0.15,
}: {
  values: (number | null)[];
  baseline?: number | null;
  tone?: "measured" | "action" | "muted";
  height?: number;
  className?: string;
  pad?: number;
}) {
  const id = useId();
  const W = 100;
  const H = height;
  const nums = values.filter((v): v is number => v != null);
  if (baseline != null) nums.push(baseline);
  const lo = nums.length ? Math.min(...nums) : 0;
  const hi = nums.length ? Math.max(...nums) : 1;
  const span = hi - lo || 1;
  const min = lo - span * pad;
  const max = hi + span * pad;
  const x = (i: number) => (values.length <= 1 ? W : (i / (values.length - 1)) * W);
  const y = (v: number) => H - ((v - min) / (max - min)) * H;

  const indexed = values.map((v, i) => ({ v, i }));
  const segments = runs(indexed, (p) => p.v != null).map((seg) =>
    seg.map((p) => [x(p.i), y(p.v!)] as [number, number]),
  );
  const color =
    tone === "action" ? "var(--action)" : tone === "muted" ? "var(--text-3)" : "var(--measured)";

  return (
    <svg
      className={className}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      width="100%"
      height={H}
      aria-hidden
    >
      <defs>
        <linearGradient id={`${id}-fade`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {baseline != null && (
        <line
          x1="0"
          x2={W}
          y1={y(baseline)}
          y2={y(baseline)}
          stroke="var(--line-3)"
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {segments.map((pts, i) => {
        const d = smoothPath(pts);
        const last = pts[pts.length - 1];
        return (
          <g key={i}>
            <path d={`${d}L${last[0]},${H}L${pts[0][0]},${H}Z`} fill={`url(#${id}-fade)`} />
            <path d={d} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
    </svg>
  );
}
