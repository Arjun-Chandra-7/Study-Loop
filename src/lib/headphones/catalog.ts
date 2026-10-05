/**
 * Known headphone models, matched against the OS audio-device label.
 *
 * Each entry is a recipe for the procedural 3D model in HeadphonesScene —
 * not a mesh. Dimensions are real-world, in decimetres (1 unit = 100 mm),
 * taken from spec sheets and product photos; materials name a finish the
 * scene knows how to render.
 */

export type HeadphoneKind = "overear" | "onear" | "earbuds";
export type Finish = "matte" | "satin" | "gloss" | "anodized" | "chrome" | "brushed";

export interface HeadphoneLook {
  /** Cup outline as a superellipse: half-width (front–back), half-height, exponent (2 = ellipse, 4+ = squircle). */
  cup: { rx: number; ry: number; n: number; depth: number };
  cushion: { thick: number; width: number; fabric: "leather" | "knit"; color: string };
  shell: { color: string; finish: Finish };
  face: { color: string; finish: Finish };
  ring?: { color: string; finish: Finish };
  band: { style: "padded" | "canopy"; color: string; width: number; height: number };
  slider: "metal" | "telescopic";
  /** Printed on the face plate and the band, the way the real one is. */
  wordmark?: { text: string; color: string };
  /** Earbuds only. */
  buds?: { stem: boolean; tip: boolean; case: string };
}

export interface HeadphoneModel {
  id: string;
  brand: string;
  name: string;
  kind: HeadphoneKind;
  match: RegExp;
  look: HeadphoneLook;
}

const BLACK_LEATHER = { fabric: "leather", color: "#121213" } as const;

export const CATALOG: HeadphoneModel[] = [
  {
    id: "boat-rockerz-4xx",
    brand: "boAt",
    name: "Rockerz 4xx",
    kind: "onear",
    match: /rockerz\s*4\d\d/i,
    look: {
      cup: { rx: 0.35, ry: 0.37, n: 2.1, depth: 0.17 },
      cushion: { thick: 0.15, width: 0.11, ...BLACK_LEATHER },
      shell: { color: "#151517", finish: "matte" },
      face: { color: "#0e0e10", finish: "gloss" },
      ring: { color: "#b3182a", finish: "gloss" },
      band: { style: "padded", color: "#161618", width: 0.27, height: 0.95 },
      slider: "metal",
      wordmark: { text: "boAt", color: "#e8e8ea" },
    },
  },
  {
    id: "boat-rockerz-5xx",
    brand: "boAt",
    name: "Rockerz 5xx",
    kind: "overear",
    match: /rockerz\s*[5-9]\d\d/i,
    look: {
      cup: { rx: 0.36, ry: 0.46, n: 2.3, depth: 0.19 },
      cushion: { thick: 0.19, width: 0.13, ...BLACK_LEATHER },
      shell: { color: "#18191b", finish: "matte" },
      face: { color: "#1c1d20", finish: "satin" },
      ring: { color: "#2f5fb8", finish: "gloss" },
      band: { style: "padded", color: "#18191b", width: 0.32, height: 1.0 },
      slider: "metal",
      wordmark: { text: "boAt", color: "#d9d9dc" },
    },
  },
  {
    id: "sony-wh1000xm",
    brand: "Sony",
    name: "WH-1000XM",
    kind: "overear",
    match: /wh-?1000\s*xm\s*\d|wh-?1000/i,
    look: {
      cup: { rx: 0.36, ry: 0.47, n: 2.2, depth: 0.18 },
      cushion: { thick: 0.2, width: 0.13, fabric: "leather", color: "#1b1b1d" },
      shell: { color: "#232325", finish: "matte" },
      face: { color: "#262628", finish: "matte" },
      ring: { color: "#a88d62", finish: "brushed" },
      band: { style: "padded", color: "#232325", width: 0.3, height: 1.02 },
      slider: "metal",
      wordmark: { text: "SONY", color: "#bfa47a" },
    },
  },
  {
    id: "bose-qc",
    brand: "Bose",
    name: "QuietComfort",
    kind: "overear",
    match: /bose|quiet\s*comfort|\bqc\s*\d+/i,
    look: {
      cup: { rx: 0.36, ry: 0.48, n: 2.4, depth: 0.19 },
      cushion: { thick: 0.19, width: 0.13, ...BLACK_LEATHER },
      shell: { color: "#1d1e21", finish: "satin" },
      face: { color: "#1d1e21", finish: "satin" },
      ring: { color: "#b7bac0", finish: "chrome" },
      band: { style: "padded", color: "#1d1e21", width: 0.3, height: 1.02 },
      slider: "metal",
      wordmark: { text: "BOSE", color: "#b7bac0" },
    },
  },
  {
    id: "jbl-tune",
    brand: "JBL",
    name: "Tune",
    kind: "onear",
    match: /jbl/i,
    look: {
      cup: { rx: 0.34, ry: 0.36, n: 2, depth: 0.16 },
      cushion: { thick: 0.14, width: 0.11, ...BLACK_LEATHER },
      shell: { color: "#18181a", finish: "matte" },
      face: { color: "#18181a", finish: "matte" },
      ring: { color: "#2a2a2d", finish: "gloss" },
      band: { style: "padded", color: "#18181a", width: 0.26, height: 0.92 },
      slider: "metal",
      wordmark: { text: "JBL", color: "#ff6a13" },
    },
  },
  {
    id: "sennheiser-momentum",
    brand: "Sennheiser",
    name: "Momentum",
    kind: "overear",
    match: /sennheiser|momentum/i,
    look: {
      cup: { rx: 0.37, ry: 0.47, n: 2.3, depth: 0.2 },
      cushion: { thick: 0.19, width: 0.13, ...BLACK_LEATHER },
      shell: { color: "#19191a", finish: "satin" },
      face: { color: "#202022", finish: "matte" },
      ring: { color: "#9b9da2", finish: "brushed" },
      band: { style: "padded", color: "#19191a", width: 0.3, height: 1.02 },
      slider: "metal",
      wordmark: { text: "SENNHEISER", color: "#c9cace" },
    },
  },
  {
    id: "beats-studio",
    brand: "Beats",
    name: "Studio",
    kind: "overear",
    match: /beats/i,
    look: {
      cup: { rx: 0.35, ry: 0.45, n: 2.2, depth: 0.19 },
      cushion: { thick: 0.18, width: 0.12, ...BLACK_LEATHER },
      shell: { color: "#111113", finish: "gloss" },
      face: { color: "#111113", finish: "gloss" },
      band: { style: "padded", color: "#111113", width: 0.3, height: 1.0 },
      slider: "metal",
      wordmark: { text: "beats", color: "#d6202f" },
    },
  },
  {
    id: "airpods-max",
    brand: "Apple",
    name: "AirPods Max",
    kind: "overear",
    match: /airpods\s*max/i,
    look: {
      cup: { rx: 0.37, ry: 0.46, n: 4.5, depth: 0.22 },
      cushion: { thick: 0.2, width: 0.13, fabric: "knit", color: "#cfd0d2" },
      shell: { color: "#c6c7ca", finish: "anodized" },
      face: { color: "#c6c7ca", finish: "anodized" },
      band: { style: "canopy", color: "#d4d5d7", width: 0.3, height: 1.05 },
      slider: "telescopic",
    },
  },
  {
    id: "airpods-pro",
    brand: "Apple",
    name: "AirPods Pro",
    kind: "earbuds",
    match: /airpods\s*pro/i,
    look: earbuds("#f3f3f1", { stem: true, tip: true, case: "#f3f3f1" }),
  },
  {
    id: "airpods",
    brand: "Apple",
    name: "AirPods",
    kind: "earbuds",
    match: /airpods/i,
    look: earbuds("#f3f3f1", { stem: true, tip: false, case: "#f3f3f1" }),
  },
  {
    id: "boat-airdopes",
    brand: "boAt",
    name: "Airdopes",
    kind: "earbuds",
    match: /airdopes/i,
    look: earbuds("#18191b", { stem: true, tip: true, case: "#18191b" }),
  },
  {
    id: "galaxy-buds",
    brand: "Samsung",
    name: "Galaxy Buds",
    kind: "earbuds",
    match: /galaxy\s*buds|\bbuds\s*(pro|live|fe|\d)/i,
    look: earbuds("#2a2c33", { stem: false, tip: true, case: "#2a2c33" }),
  },
];

function earbuds(color: string, buds: NonNullable<HeadphoneLook["buds"]>): HeadphoneLook {
  return {
    cup: { rx: 0, ry: 0, n: 2, depth: 0 },
    cushion: { thick: 0, width: 0, fabric: "leather", color: "#9a9a9c" },
    shell: { color, finish: "gloss" },
    face: { color, finish: "gloss" },
    band: { style: "padded", color, width: 0, height: 0 },
    slider: "metal",
    buds,
  };
}

export const GENERIC: Record<HeadphoneKind, HeadphoneModel> = {
  overear: {
    id: "generic-overear",
    brand: "",
    name: "Headphones",
    kind: "overear",
    match: /$^/,
    look: {
      cup: { rx: 0.36, ry: 0.46, n: 2.3, depth: 0.19 },
      cushion: { thick: 0.19, width: 0.13, ...BLACK_LEATHER },
      shell: { color: "#1c1c1e", finish: "matte" },
      face: { color: "#202022", finish: "satin" },
      ring: { color: "#8e9096", finish: "brushed" },
      band: { style: "padded", color: "#1c1c1e", width: 0.3, height: 1.0 },
      slider: "metal",
    },
  },
  onear: {
    id: "generic-onear",
    brand: "",
    name: "Headphones",
    kind: "onear",
    match: /$^/,
    look: {
      cup: { rx: 0.34, ry: 0.36, n: 2, depth: 0.16 },
      cushion: { thick: 0.14, width: 0.11, ...BLACK_LEATHER },
      shell: { color: "#1c1c1e", finish: "matte" },
      face: { color: "#1c1c1e", finish: "satin" },
      ring: { color: "#8e9096", finish: "brushed" },
      band: { style: "padded", color: "#1c1c1e", width: 0.26, height: 0.92 },
      slider: "metal",
    },
  },
  earbuds: {
    id: "generic-earbuds",
    brand: "",
    name: "Earbuds",
    kind: "earbuds",
    match: /$^/,
    look: earbuds("#ececea", { stem: true, tip: true, case: "#ececea" }),
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
