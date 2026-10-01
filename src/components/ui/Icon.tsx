import type { SVGProps } from "react";

/**
 * One icon language: 24-unit grid, 1.5 stroke, round caps, no fills except
 * for small state dots. Every state icon pairs with a word — colour is never
 * the only signal.
 */
const PATHS = {
  band: (
    <>
      <rect x="5" y="8" width="14" height="8" rx="3" />
      <path d="M8 8V5.5M16 8V5.5M8 16v2.5M16 16v2.5" />
      <path d="M10 12h3.5" />
    </>
  ),
  play: <path d="M8.5 6.8v10.4a.6.6 0 0 0 .9.5l8.2-5.2a.6.6 0 0 0 0-1L9.4 6.3a.6.6 0 0 0-.9.5Z" />,
  pause: <path d="M9 6.5v11M15 6.5v11" />,
  stop: <rect x="7" y="7" width="10" height="10" rx="2" />,
  wave: <path d="M3 12c1.5 0 1.5-5 3-5s1.5 10 3 10 1.5-10 3-10 1.5 10 3 10 1.5-10 3-10 1.5 5 3 5" />,
  sliders: (
    <>
      <path d="M5 7h8M17 7h2M5 17h2M11 17h8" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  moon: <path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5Z" />,
  heart: <path d="M3.5 12h3.2l1.8-4 3 8 2-5 1.2 1h5.8" />,
  eda: (
    <>
      <path d="M8 4v6a4 4 0 0 0 8 0V4" />
      <path d="M12 14v6M9 20h6" />
    </>
  ),
  signal: <path d="M6 18v-3M10 18v-6M14 18V9M18 18V6" />,
  baseline: (
    <>
      <path d="M4 15h16" strokeDasharray="2 2.5" />
      <path d="M4 12c2 0 3-4 5-4s3 7 5 7 3-3 6-3" />
    </>
  ),
  home: <path d="M4.5 11 12 5l7.5 6v7.5a1 1 0 0 1-1 1h-4v-5h-5v5h-4a1 1 0 0 1-1-1Z" />,
  session: (
    <>
      <circle cx="12" cy="13" r="7" />
      <path d="M12 9.5V13l2.2 1.6M10 3.5h4" />
    </>
  ),
  insights: <path d="M4 19h16M7 15l3.5-4 3 2.5L18 7" />,
  research: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M12 3c3 2.5 3 15.5 0 18M12 3c-3 2.5-3 15.5 0 18M3.5 9.5c4-1.5 13-1.5 17 0M3.5 14.5c4 1.5 13 1.5 17 0" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5.5 19.5c1.2-3 3.7-4.5 6.5-4.5s5.3 1.5 6.5 4.5" />
    </>
  ),
  flag: <path d="M6 20V4.5M6 5h10.5l-2 3.5 2 3.5H6" />,
  back5: (
    <>
      <path d="M5 12a7 7 0 1 0 2.1-5" />
      <path d="M5 4.5V8h3.5" />
    </>
  ),
  fwd5: (
    <>
      <path d="M19 12a7 7 0 1 1-2.1-5" />
      <path d="M19 4.5V8h-3.5" />
    </>
  ),
  check: <path d="m5.5 12.5 4 4 9-9" />,
  alert: (
    <>
      <path d="M12 8v5" />
      <circle cx="12" cy="16.5" r=".6" fill="currentColor" />
      <path d="M10.3 4.5 3.2 17a2 2 0 0 0 1.7 3h14.2a2 2 0 0 0 1.7-3L13.7 4.5a2 2 0 0 0-3.4 0Z" />
    </>
  ),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  bluetooth: <path d="m7 7.5 10 9L12 21V3l5 4.5-10 9" />,
  battery: (
    <>
      <rect x="3" y="8" width="16" height="8" rx="2" />
      <path d="M21 11v2" />
    </>
  ),
  link: <path d="M9.5 14.5 14.5 9.5M8 12l-2 2a3 3 0 0 0 4.2 4.2l2-2M16 12l2-2A3 3 0 0 0 13.8 5.8l-2 2" />,
  unlink: <path d="M8 12l-2 2a3 3 0 0 0 4.2 4.2l2-2M16 12l2-2A3 3 0 0 0 13.8 5.8l-2 2M4 4l16 16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  music: (
    <>
      <path d="M9 17.5V6.5l10-2v11" />
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="16.5" cy="15.5" r="2.5" />
    </>
  ),
  upload: <path d="M12 16V5M7.5 9.5 12 5l4.5 4.5M5 15v3.5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V15" />,
  recover: <path d="M4 8c3 0 3 8 6 8s3-5 5-5 3 2 5 2" />,
  rise: <path d="M4 18c4 0 5-4 8-8s4-5 8-5M16 5h4v4" />,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({
  name,
  size = 20,
  ...rest
}: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
