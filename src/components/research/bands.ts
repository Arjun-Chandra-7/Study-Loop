export interface Band {
  id: "theta" | "alpha" | "gamma" | "40hz";
  name: string;
  range: string;
  /** representative frequency for the visual, Hz */
  hz: number;
  line: string;
  body: string;
  experimental?: boolean;
}

/** Copy is deliberately hedged: associated with, explored, investigated. */
export const BANDS: Band[] = [
  {
    id: "theta",
    name: "Theta",
    range: "4–8 Hz",
    hz: 6,
    line: "associated with memory encoding",
    body: "Frontal-midline theta is often observed during working-memory and sustained-attention tasks.",
  },
  {
    id: "alpha",
    name: "Alpha",
    range: "8–12 Hz",
    hz: 10,
    line: "associated with relaxed wakefulness",
    body: "Alpha activity is studied as a marker of how attention is gated — rising when the eyes close or the mind idles.",
  },
  {
    id: "gamma",
    name: "Gamma",
    range: "30–100 Hz",
    hz: 38,
    line: "associated with binding & attention",
    body: "Fast gamma rhythms are explored in research on how the brain combines features into a single perception.",
  },
  {
    id: "40hz",
    name: "40 Hz",
    range: "experimental",
    hz: 40,
    line: "gamma-entrainment research",
    body: "Early studies are investigating whether 40 Hz light and sound can entrain gamma rhythms. Findings are preliminary and it is not a treatment.",
    experimental: true,
  },
];
