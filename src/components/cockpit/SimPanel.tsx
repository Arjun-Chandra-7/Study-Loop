"use client";

import type { MockScenario } from "@/lib/sensors/types";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";

const SCENARIOS: { id: MockScenario; label: string; hint: string }[] = [
  { id: "normal", label: "Normal", hint: "Resting-range signals" },
  { id: "elevated", label: "Elevated", hint: "HR + EDA climb above baseline" },
  { id: "recovery", label: "Recovery", hint: "Settles back toward baseline" },
  { id: "poorSignal", label: "Poor signal", hint: "Loose contact, noisy PPG" },
  { id: "lowBattery", label: "Low battery", hint: "Band at 7%" },
  { id: "disconnected", label: "Disconnected", hint: "Link drops" },
];

/** Developer control for the mock provider. Hidden meaning: none of this is real data. */
export function SimPanel({ compact = false }: { compact?: boolean }) {
  const s = useStudyLoop();
  const isMock = s.providerKind === "mock";
  return (
    <div className={`sim ${compact ? "sim--compact" : ""}`}>
      <div className="sim__head">
        <span className="label">Band simulator</span>
        <span className="chip chip--outline">{isMock ? "Mock data" : "Live BLE"}</span>
      </div>
      {!isMock && <p className="small muted">Switch to the mock provider in Profile to simulate states.</p>}
      <div className="sim__grid" role="radiogroup" aria-label="Simulation scenario">
        {SCENARIOS.map((sc) => (
          <button
            key={sc.id}
            type="button"
            role="radio"
            aria-checked={s.scenario === sc.id}
            disabled={!isMock}
            className="sim__opt"
            onClick={() => engine.setScenario(sc.id)}
          >
            <span className="sim__label">{sc.label}</span>
            {!compact && <span className="sim__hint">{sc.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
