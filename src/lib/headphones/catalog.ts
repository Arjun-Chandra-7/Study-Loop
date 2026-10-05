/**
 * Known headphone models, matched against the OS audio-device label.
 *
 * Each entry is a recipe for the procedural 3D model in HeadphonesScene —
 * not a mesh. Silhouette (kind + cup shape) and finish carry the identity;
 * proportions are tuned by eye against product photos.
 */

export type HeadphoneKind = "overear" | "onear" | "earbuds";
export type CupShape = "round" | "oval" | "rect";

export interface HeadphoneModel {
  id: string;
  brand: string;
  name: string;
  kind: HeadphoneKind;
  match: RegExp;
  look: {
    cup: CupShape;
    /** Cup radius (round) or half-height (oval/rect), in scene units. */
    cupSize: number;
    cupDepth: number;
    /** Headband tube radius. */
    band: number;
    shell: string;
    accent: string;
    cushion: string;
    /** 0 = matte plastic, 1 = polished metal. */
    metal: number;
    gloss: number;
    /** AirPods Max-style knit canopy under the band. */
    canopy?: boolean;
    /** Exposed metal slider arms between band and cup. */
    sliders?: boolean;
  };
}

export const CATALOG: HeadphoneModel[] = [
  {
    id: "boat-rockerz-4xx",
    brand: "boAt",
    name: "Rockerz 4xx",
    kind: "onear",
    match: /rockerz\s*4\d\d/i,
    look: { cup: "round", cupSize: 0.62, cupDepth: 0.34, band: 0.075, shell: "#17181b", accent: "#d8343a", cushion: "#101012", metal: 0.15, gloss: 0.75, sliders: true },
  },
  {
    id: "boat-rockerz-5xx",
    brand: "boAt",
    name: "Rockerz 5xx",
    kind: "overear",
    match: /rockerz\s*[5-9]\d\d/i,
    look: { cup: "oval", cupSize: 0.72, cupDepth: 0.36, band: 0.08, shell: "#1b1c20", accent: "#3d7bd9", cushion: "#111114", metal: 0.1, gloss: 0.55, sliders: true },
  },
  {
    id: "airpods-max",
    brand: "Apple",
    name: "AirPods Max",
    kind: "overear",
    match: /airpods\s*max/i,
    look: { cup: "rect", cupSize: 0.74, cupDepth: 0.42, band: 0.06, shell: "#c9cacc", accent: "#e8e8ea", cushion: "#d8d8da", metal: 0.85, gloss: 0.8, canopy: true, sliders: true },
  },
  {
    id: "sony-wh1000xm",
    brand: "Sony",
    name: "WH-1000XM",
    kind: "overear",
    match: /wh-?1000\s*xm\s*\d|wh-?1000/i,
    look: { cup: "oval", cupSize: 0.76, cupDepth: 0.34, band: 0.07, shell: "#26262a", accent: "#b9a27a", cushion: "#1d1d20", metal: 0.05, gloss: 0.25 },
  },
  {
    id: "bose-qc",
    brand: "Bose",
    name: "QuietComfort",
    kind: "overear",
    match: /bose|quiet\s*comfort|\bqc\s*\d+/i,
    look: { cup: "oval", cupSize: 0.74, cupDepth: 0.36, band: 0.065, shell: "#202124", accent: "#9aa0a6", cushion: "#18181b", metal: 0.35, gloss: 0.35, sliders: true },
  },
  {
    id: "jbl-tune",
    brand: "JBL",
    name: "Tune",
    kind: "onear",
    match: /jbl/i,
    look: { cup: "round", cupSize: 0.6, cupDepth: 0.3, band: 0.07, shell: "#1d1e22", accent: "#ff6a00", cushion: "#131316", metal: 0.1, gloss: 0.45 },
  },
  {
    id: "sennheiser-momentum",
    brand: "Sennheiser",
    name: "Momentum",
    kind: "overear",
    match: /sennheiser|momentum/i,
    look: { cup: "oval", cupSize: 0.74, cupDepth: 0.38, band: 0.065, shell: "#1a1a1c", accent: "#8f8f94", cushion: "#121214", metal: 0.6, gloss: 0.5, sliders: true },
  },
  {
    id: "beats-studio",
    brand: "Beats",
    name: "Studio",
    kind: "overear",
    match: /beats/i,
    look: { cup: "oval", cupSize: 0.72, cupDepth: 0.36, band: 0.075, shell: "#141416", accent: "#d61f2c", cushion: "#0f0f11", metal: 0.1, gloss: 0.85 },
  },
  {
    id: "airpods",
    brand: "Apple",
    name: "AirPods",
    kind: "earbuds",
    match: /airpods/i,
    look: { cup: "round", cupSize: 0.5, cupDepth: 0.3, band: 0, shell: "#f2f2f2", accent: "#cfd1d4", cushion: "#e6e6e6", metal: 0.05, gloss: 0.9 },
  },
  {
    id: "boat-airdopes",
    brand: "boAt",
    name: "Airdopes",
    kind: "earbuds",
    match: /airdopes/i,
    look: { cup: "round", cupSize: 0.5, cupDepth: 0.3, band: 0, shell: "#1a1b1e", accent: "#d8343a", cushion: "#111113", metal: 0.1, gloss: 0.7 },
  },
  {
    id: "galaxy-buds",
    brand: "Samsung",
    name: "Galaxy Buds",
    kind: "earbuds",
    match: /galaxy\s*buds|\bbuds\s*(pro|live|fe|\d)/i,
    look: { cup: "round", cupSize: 0.5, cupDepth: 0.3, band: 0, shell: "#2a2c33", accent: "#8ea3c7", cushion: "#20232a", metal: 0.1, gloss: 0.8 },
  },
];

export const GENERIC: Record<HeadphoneKind, HeadphoneModel> = {
  overear: {
    id: "generic-overear",
    brand: "",
    name: "Headphones",
    kind: "overear",
    match: /$^/,
    look: { cup: "oval", cupSize: 0.72, cupDepth: 0.34, band: 0.07, shell: "#222226", accent: "#7d7d84", cushion: "#18181b", metal: 0.2, gloss: 0.4, sliders: true },
  },
  onear: {
    id: "generic-onear",
    brand: "",
    name: "Headphones",
    kind: "onear",
    match: /$^/,
    look: { cup: "round", cupSize: 0.6, cupDepth: 0.3, band: 0.07, shell: "#222226", accent: "#7d7d84", cushion: "#18181b", metal: 0.2, gloss: 0.4 },
  },
  earbuds: {
    id: "generic-earbuds",
    brand: "",
    name: "Earbuds",
    kind: "earbuds",
    match: /$^/,
    look: { cup: "round", cupSize: 0.5, cupDepth: 0.3, band: 0, shell: "#e9e9ea", accent: "#c9cacd", cushion: "#dedee0", metal: 0.05, gloss: 0.8 },
  },
};

/** Labels that are definitely not something you wear. */
const NOT_WORN = /speaker|hdmi|displayport|monitor|\btv\b|soundbar|line out|digital output|s\/pdif/i;
const BUDS = /buds|dopes|earphone|in-?ear|\bwf-|pods(?!\s*max)/i;
const WORN = /head(phone|set)|buds|dopes|earphone|airpods|bluetooth|wireless|\bwh-|\bwf-|hands-?free|a2dp|rockerz|bose|jbl|sony|sennheiser|beats|jabra|skullcandy|soundcore|anker|nothing ear|oneplus|realme|noise|marshall|audio-?technica|plantronics|logitech g/i;

/** Strip Chrome's "Default - " / "Communications - " prefixes and OS suffixes. */
export function cleanLabel(label: string) {
  return label
    .replace(/^(default|communications)\s*-\s*/i, "")
    .replace(/\s*\((bluetooth|[0-9a-f]{4}:[0-9a-f]{4})\)\s*$/i, "")
    .replace(/\s*(hands-?free|stereo|a2dp sink|headset)\s*$/i, "")
    .trim();
}

export function identify(label: string): HeadphoneModel | null {
  const clean = cleanLabel(label);
  if (!clean || NOT_WORN.test(clean)) return null;
  const known = CATALOG.find((m) => m.match.test(clean));
  if (known) return known;
  if (!WORN.test(label)) return null;
  return GENERIC[BUDS.test(clean) ? "earbuds" : "overear"];
}

export function findModel(id: string) {
  return CATALOG.find((m) => m.id === id) ?? Object.values(GENERIC).find((m) => m.id === id) ?? null;
}
