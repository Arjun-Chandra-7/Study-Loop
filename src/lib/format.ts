export function clock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function signedPercent(x: number | null, digits = 0) {
  if (x == null || !Number.isFinite(x)) return "—";
  const v = (x * 100).toFixed(digits);
  // A tiny negative that rounds to zero reads "0%", never "-0%".
  if (Number(v) === 0) return `${(0).toFixed(digits)}%`;
  return `${x > 0 ? "+" : ""}${v}%`;
}

/** Catmull-Rom → cubic Bézier: calm, continuous curves through every point. */
export function smoothPath(points: [number, number][], tension = 0.5) {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0][0]},${points[0][1]}`;
  let d = `M${points[0][0].toFixed(2)},${points[0][1].toFixed(2)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const k = tension / 3;
    const c1x = p1[0] + (p2[0] - p0[0]) * k;
    const c1y = p1[1] + (p2[1] - p0[1]) * k;
    const c2x = p2[0] - (p3[0] - p1[0]) * k;
    const c2y = p2[1] - (p3[1] - p1[1]) * k;
    d += `C${c1x.toFixed(2)},${c1y.toFixed(2)} ${c2x.toFixed(2)},${c2y.toFixed(2)} ${p2[0].toFixed(2)},${p2[1].toFixed(2)}`;
  }
  return d;
}

/** Split a series with nulls into continuous runs. */
export function runs<T>(xs: T[], valid: (x: T) => boolean) {
  const out: T[][] = [];
  let cur: T[] = [];
  for (const x of xs) {
    if (valid(x)) cur.push(x);
    else if (cur.length) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length) out.push(cur);
  return out;
}
