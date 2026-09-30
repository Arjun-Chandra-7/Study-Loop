"use client";

import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { SessionChart } from "../charts/SessionChart";
import { subjectCode } from "../cockpit/LowerCards";

export function InsightsView() {
  const { summaries, selectedSummary } = useStudyLoop();
  const sel = summaries.find((x) => x.id === selectedSummary) ?? summaries[0];

  if (!sel) {
    return (
      <div className="empty">
        <p className="label">Insights</p>
        <p className="serif serif--lg">Your first session will appear here.</p>
      </div>
    );
  }

  return (
    <div className="insights">
      <header className="insights__head">
        <div>
          <p className="eyebrow">
            <span className="eyebrow__rule" aria-hidden />
            Insights · {sel.dateLabel}
          </p>
          <h2 className="h-section">
            {sel.subject} <span className="serif">— {sel.topic}</span>
          </h2>
        </div>
        <dl className="stat-row stat-row--compact">
          <div>
            <dt>Length</dt>
            <dd className="tnum">{sel.minutes} min</dd>
          </div>
          <div>
            <dt>Near baseline</dt>
            <dd className="tnum">{Math.round(sel.stableShare * 100)}%</dd>
          </div>
          <div>
            <dt>Elevated</dt>
            <dd className="tnum">{sel.elevatedMoments}</dd>
          </div>
          <div>
            <dt>Marked</dt>
            <dd className="tnum">{sel.marks}</dd>
          </div>
        </dl>
      </header>

      {sel.samples.length > 1 ? (
        <SessionChart
          key={sel.id}
          samples={sel.samples}
          events={sel.events}
          baseline={sel.baseline}
          durationMs={sel.minutes * 60_000}
        />
      ) : (
        <div className="empty empty--inline">
          <p className="small muted">This session was too short to chart.</p>
        </div>
      )}

      <div className="legend" aria-hidden>
        <span className="legend__item legend__item--measured">Measured</span>
        <span className="legend__item legend__item--base">Your baseline</span>
        <span className="legend__item legend__item--mark">Marked moment</span>
        <span className="legend__item legend__item--event">Elevated</span>
        {sel.isSample && <span className="chip chip--outline">Sample data</span>}
        <span className="legend__note">“Near baseline” is time close to your starting signal — not a focus score.</span>
      </div>
    </div>
  );
}

export function InsightsFoot() {
  const { summaries, selectedSummary } = useStudyLoop();
  const selected = selectedSummary ?? summaries[0]?.id;
  return (
    <ul className="history foot" aria-label="Recent sessions">
      {summaries.map((x) => (
        <li key={x.id}>
          <button type="button" className="history__item" aria-pressed={x.id === selected} onClick={() => engine.selectSummary(x.id)}>
            <span className="history__code">{subjectCode(x.subject)}</span>
            <span className="history__meta">
              <span>{x.topic}</span>
              <span className="muted">
                {x.dateLabel} · {x.minutes} min
              </span>
            </span>
            <span className="history__bar" aria-label={`${Math.round(x.stableShare * 100)}% near baseline`}>
              <span style={{ transform: `scaleX(${x.stableShare})` }} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
