import type { Paper } from "./bands";

/** Peer-reviewed reading for a band. Compact = one line of author-year links (the landing story). */
export function Papers({ papers, compact = false }: { papers: Paper[]; compact?: boolean }) {
  if (compact) {
    return (
      <p className="papers papers--compact small">
        <span className="papers__label">Read</span>
        {papers.map((p) => (
          <a key={p.doi} href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" title={`${p.title} · ${p.journal}`}>
            {p.authors} {p.year}
          </a>
        ))}
      </p>
    );
  }
  return (
    <div className="papers">
      <p className="label papers__label">Key papers</p>
      <ol className="papers__list">
        {papers.map((p) => (
          <li key={p.doi}>
            <a href={`https://doi.org/${p.doi}`} target="_blank" rel="noreferrer" title={`${p.title} · ${p.journal}, ${p.year}`}>
              <span className="papers__title">{p.title}</span>
              <span className="papers__meta">
                {p.authors} · {p.year}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}
