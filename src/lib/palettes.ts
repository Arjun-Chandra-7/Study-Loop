/**
 * Accent palettes. All sit on the same warm-carbon ground with bone text; only
 * the two meaning colours change. Each pair is desaturated for a dark UI
 * (no neon on black) except Race day, which is loud on purpose.
 */
export const PALETTES = {
  track: {
    name: "Collegiate track",
    blurb: "Infield sage, cinder brick",
    measured: "#9DBA8E",
    measuredHi: "#C3D6B4",
    action: "#CF4F33",
    actionHi: "#E58A6F",
    actionHover: "#DA6448",
    onAction: "#12110F",
  },
  lagoon: {
    name: "Calypso & gold",
    blurb: "Harbour blue, varsity gold",
    measured: "#7FB0C8",
    measuredHi: "#B3D2E0",
    action: "#D9A441",
    actionHi: "#E8C47E",
    actionHover: "#E2B256",
    onAction: "#12110F",
  },
  berry: {
    name: "Berry & sand",
    blurb: "Dune sand, crew berry",
    measured: "#D2BE9A",
    measuredHi: "#E6D9BF",
    action: "#C24E68",
    actionHi: "#DB8A9B",
    actionHover: "#CD627A",
    onAction: "#F5EFE3",
  },
  raceday: {
    name: "Race day",
    blurb: "Volt and blaze, turned up",
    measured: "#D7FF3A",
    measuredHi: "#E5FF8A",
    action: "#FF5A1F",
    actionHi: "#FF9666",
    actionHover: "#FF7846",
    onAction: "#12110F",
  },
} as const;

export type PaletteId = keyof typeof PALETTES;
export type Palette = (typeof PALETTES)[PaletteId];

export const PREFS_KEY = "sl-prefs";

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(" ");

/** The CSS variables a palette sets on <html>. */
export function paletteVars(p: Palette): Record<string, string> {
  return {
    "--m-500": p.measured,
    "--m-300": p.measuredHi,
    "--measured-rgb": rgb(p.measured),
    "--measured-hi-rgb": rgb(p.measuredHi),
    "--a-500": p.action,
    "--a-300": p.actionHi,
    "--action-rgb": rgb(p.action),
    "--action-hover": p.actionHover,
    "--text-on-action": p.onAction,
  };
}

/** Inline <head> script: applies the saved palette before first paint, so there's no flash of the default. */
export function prePaintScript() {
  const vars = Object.fromEntries(Object.entries(PALETTES).map(([id, p]) => [id, paletteVars(p)]));
  return `try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_KEY)})||"{}").palette,v=${JSON.stringify(vars)}[p];if(v){var r=document.documentElement;for(var k in v)r.style.setProperty(k,v[k]);r.dataset.palette=p}}catch(e){}`;
}
