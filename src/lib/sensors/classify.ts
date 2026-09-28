/**
 * Turns measured physiology into a small vocabulary of *change* states.
 * These describe the signal relative to the student's own baseline — they
 * never claim to know what the student is thinking or feeling.
 */

export type PhysioState = "stable" | "changing" | "elevated" | "recovering" | "poor" | "none";

export interface Sample {
  t: number;
  hr: number | null;
  eda: number | null;
  quality: "good" | "fair" | "poor" | "none";
}

export interface Baseline {
  hr: number;
  eda: number;
}

export const PHYSIO_LABEL: Record<PhysioState, string> = {
  stable: "Stable",
  changing: "Changing",
  elevated: "Elevated",
  recovering: "Recovering",
  poor: "Poor signal",
  none: "No signal",
};

export const PHYSIO_HINT: Record<PhysioState, string> = {
  stable: "Signals are close to your baseline.",
  changing: "Signals are moving away from baseline.",
  elevated: "Heart rate and skin conductance are above baseline.",
  recovering: "Signals are settling back toward baseline.",
  poor: "Adjust the band so the electrodes touch your inner wrist.",
  none: "Connect your band to see live signals.",
};

function mean(xs: number[]) {
  return xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
}

export function computeBaseline(samples: Sample[]): Baseline | null {
  const good = samples.filter((s) => s.hr != null && s.eda != null && s.quality !== "poor");
  if (good.length < 3) return null;
  return { hr: mean(good.map((s) => s.hr!)), eda: mean(good.map((s) => s.eda!)) };
}

export function edaDelta(eda: number | null, baseline: Baseline | null) {
  if (eda == null || !baseline) return null;
  return (eda - baseline.eda) / baseline.eda;
}

/**
 * @param recent samples at ~1 Hz, newest last
 */
export function classify(recent: Sample[], baseline: Baseline | null, prev: PhysioState): PhysioState {
  const window = recent.slice(-8);
  if (window.length === 0) return "none";
  const poor = window.filter((s) => s.quality === "poor" || s.hr == null).length;
  if (poor >= window.length / 2) return "poor";
  if (!baseline) return "stable";

  const hr = mean(window.filter((s) => s.hr != null).map((s) => s.hr!));
  const eda = mean(window.filter((s) => s.eda != null).map((s) => s.eda!));
  const dHr = hr - baseline.hr;
  const dEda = (eda - baseline.eda) / baseline.eda;

  // Trend over the last ~20 s tells rising from falling.
  const older = recent.slice(-24, -12).filter((s) => s.eda != null);
  const trend = older.length ? eda - mean(older.map((s) => s.eda!)) : 0;

  const elevated = dEda > 0.22 || dHr > 12;
  const changing = dEda > 0.1 || dHr > 6;

  if (elevated && trend > -0.08) return "elevated";
  if ((prev === "elevated" || prev === "recovering") && trend < -0.02 && (changing || elevated)) {
    return "recovering";
  }
  if (prev === "recovering" && changing) return "recovering";
  if (changing || elevated) return "changing";
  return "stable";
}
