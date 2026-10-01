/**
 * SL-01 tech-spec drawing for the Profile band card. Drawn, not photographed,
 * so it stays crisp at any size and the status LED can reflect the live link.
 */
export function BandSpec({ live = false }: { live?: boolean }) {
  return (
    <svg
      className={`band-spec ${live ? "is-live" : ""}`}
      viewBox="0 0 400 240"
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="StudyLoop SL-01 band, front view"
    >
      <defs>
        <pattern id="bs-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M20 0H0V20" fill="none" stroke="var(--line-1)" strokeWidth="1" />
        </pattern>
        <pattern id="bs-weave" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#191815" />
          <path d="M0 0V6" stroke="#262522" strokeWidth="3" />
        </pattern>
        <linearGradient id="bs-shell" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d3c39" />
          <stop offset="0.18" stopColor="#292825" />
          <stop offset="1" stopColor="#151411" />
        </linearGradient>
        <filter id="bs-glow" x="-50%" y="-200%" width="200%" height="500%">
          <feGaussianBlur stdDeviation="5" />
        </filter>
      </defs>

      <rect width="400" height="240" fill="url(#bs-grid)" />

      {/* header */}
      <text x="18" y="26" className="band-spec__kicker">TECH SPEC</text>
      <text x="18" y="48" className="band-spec__model">SL-01</text>
      <text x="382" y="26" textAnchor="end" className="band-spec__kicker">FRONT</text>

      {/* strap: woven, running off both edges */}
      <rect x="-10" y="102" width="420" height="48" rx="6" fill="url(#bs-weave)" />
      <rect x="-10" y="102" width="420" height="48" rx="6" fill="none" stroke="#2f2e2b" />
      <rect x="78" y="95" width="12" height="62" rx="4" fill="#201f1c" stroke="#363532" />
      <rect x="310" y="95" width="12" height="62" rx="4" fill="#201f1c" stroke="#363532" />

      {/* underside electrodes (ghosted) */}
      <rect x="134" y="170" width="40" height="24" rx="5" className="band-spec__ghost" />
      <rect x="226" y="170" width="40" height="24" rx="5" className="band-spec__ghost" />
      <circle cx="200" cy="182" r="7" className="band-spec__ghost" />

      {/* module */}
      <rect x="116" y="76" width="168" height="100" rx="26" fill="url(#bs-shell)" stroke="#403f3c" />
      <rect x="124" y="81" width="152" height="2" rx="1" fill="rgba(255, 255, 255,0.12)" />

      {/* status LED */}
      <line x1="156" y1="122" x2="222" y2="122" className="band-spec__led-glow" filter="url(#bs-glow)" />
      <line x1="156" y1="122" x2="222" y2="122" className="band-spec__led" />

      {/* button */}
      <circle cx="238" cy="138" r="1.8" fill="#12110f" />
      <rect x="246" y="126" width="22" height="22" rx="6" fill="#1d1c19" stroke="#484744" />
      <path d="M257 132v5M253.2 134.5a5 5 0 1 0 7.6 0" fill="none" stroke="#6a6a6a" strokeWidth="1.3" strokeLinecap="round" />

      {/* callouts */}
      <g className="band-spec__callout">
        <path d="M189 119V66H160" />
        <circle cx="189" cy="122" r="3" />
        <text x="156" y="64" textAnchor="end">01</text>
        <text x="156" y="78" textAnchor="end" className="band-spec__note">Status light</text>
      </g>
      <g className="band-spec__callout">
        <path d="M257 126V62H290" />
        <circle cx="257" cy="137" r="3" />
        <text x="294" y="60">02</text>
        <text x="294" y="74" className="band-spec__note">One button</text>
      </g>
      <g className="band-spec__callout">
        <path d="M154 194V214H112" />
        <text x="108" y="212" textAnchor="end">03</text>
        <text x="108" y="226" textAnchor="end" className="band-spec__note">EDA ×2</text>
      </g>
      <g className="band-spec__callout">
        <path d="M200 189V214H290" />
        <text x="294" y="212">04</text>
        <text x="294" y="226" className="band-spec__note">PPG pulse</text>
      </g>
    </svg>
  );
}
