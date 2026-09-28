import type { Dot } from "thinking-orbs/engine";
import type { Scene } from "./DotCanvas";

/*
 * Dotted motion graphics. Every scene is pure math over (w, h, t, param)
 * and is painted by the Thinking Orbs painter: brightness `b` maps to the
 * library's ink value, `z` orders depth.
 */

const TAU = Math.PI * 2;
const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const k = clamp((x - a) / (b - a));
  return k * k * (3 - 2 * k);
};
const hash = (i: number, s = 1) => {
  const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453;
  return x - Math.floor(x);
};

function dot(x: number, y: number, z: number, r: number, b: number, a = 1): Dot {
  return { x, y, z, r, white: 1 - clamp(b), a };
}

/** Photoplethysmography pulse shape: systolic peak + dicrotic wave. */
export function ppg(phase: number) {
  const p = phase - Math.floor(phase);
  return Math.exp(-(((p - 0.12) / 0.06) ** 2)) + 0.42 * Math.exp(-(((p - 0.4) / 0.09) ** 2));
}

function roundRect(out: Dot[], x: number, y: number, w: number, h: number, r: number, gap: number, b: number, rad: number, z = 0) {
  const straight = [
    [x + r, y, x + w - r, y],
    [x + w, y + r, x + w, y + h - r],
    [x + w - r, y + h, x + r, y + h],
    [x, y + h - r, x, y + r],
  ];
  for (const [x1, y1, x2, y2] of straight) {
    const n = Math.max(1, Math.round(Math.hypot(x2 - x1, y2 - y1) / gap));
    for (let i = 0; i < n; i++) out.push(dot(x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n, z, rad, b));
  }
  const corners = [
    [x + w - r, y + r, -Math.PI / 2],
    [x + w - r, y + h - r, 0],
    [x + r, y + h - r, Math.PI / 2],
    [x + r, y + r, Math.PI],
  ];
  const cn = Math.max(2, Math.round((r * Math.PI) / 2 / gap));
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i < cn; i++) {
      const a = a0 + (i / cn) * (Math.PI / 2);
      out.push(dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, rad, b));
    }
  }
}

function ring(out: Dot[], cx: number, cy: number, r: number, n: number, b: number, rad: number, z = 0, rot = 0) {
  for (let i = 0; i < n; i++) {
    const a = rot + (i / n) * TAU;
    out.push(dot(cx + Math.cos(a) * r, cy + Math.sin(a) * r, z, rad, b));
  }
}

// ── A · PPG sensor ───────────────────────────────────────────
export const ppgScene: Scene = (w, h, t) => {
  const dots: Dot[] = [];
  const s = Math.min(w / 220, h / 180);
  const cx = w / 2;
  const top = h * 0.14;
  const beatPhase = t * 1.2; // 72 bpm
  const beat = ppg(beatPhase);

  roundRect(dots, cx - 62 * s, top, 124 * s, 40 * s, 14 * s, 4 * s, 0.5, 1.1 * s);
  const ey = top + 20 * s;
  for (const ex of [cx - 20 * s, cx + 20 * s]) {
    ring(dots, ex, ey, 7 * s, 14, 0.45 + 0.55 * beat, 1.2 * s, 1, t * 0.6);
    dots.push(dot(ex, ey, 2, (2 + 1.5 * beat) * s, 0.7 + 0.3 * beat));
  }

  // skin strata
  const strataTop = top + 62 * s;
  for (let k = 0; k < 4; k++) {
    const y = strataTop + k * 12 * s;
    for (let x = cx - 90 * s; x <= cx + 90 * s; x += 5 * s) {
      const fade = 1 - Math.abs(x - cx) / (95 * s);
      dots.push(dot(x + Math.sin(t * 0.4 + k) * 2 * s, y + Math.sin(x * 0.05 + t + k) * 1.2 * s, -1, 0.8 * s, 0.12 + 0.12 * fade));
    }
  }

  // photons: down into tissue and back, brighter on each heartbeat
  for (let i = 0; i < 90; i++) {
    const ph = (t * 0.55 + i / 90) % 1;
    const side = i % 2 ? 1 : -1;
    const x0 = cx + side * 20 * s;
    const depth = (34 + hash(i) * 30) * s;
    const x = x0 + side * -1 * ph * 40 * s * (0.6 + hash(i, 2));
    const y = ey + 8 * s + Math.sin(ph * Math.PI) * depth;
    const b = (0.25 + 0.75 * beat) * Math.sin(ph * Math.PI);
    dots.push(dot(x, y, 0.5, (0.7 + 1.1 * b) * s, b, 0.9));
  }

  // pulse trace
  const accent: Dot[] = [];
  const traceY = h * 0.86;
  const n = 110;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const x = cx - 95 * s + u * 190 * s;
    const v = ppg(beatPhase - (1 - u) * 2.4);
    const b = 0.2 + 0.8 * u;
    dots.push(dot(x, traceY - v * 20 * s, 3, (0.8 + 0.8 * u) * s, b));
  }
  const headV = ppg(beatPhase);
  accent.push(dot(cx + 95 * s, traceY - headV * 20 * s, 4, 2.4 * s, 1));
  return { dots, accent };
};

// ── B · EDA electrodes ───────────────────────────────────────
function scr(t: number) {
  const period = 3.4;
  const k = t % period;
  return Math.exp(-k / 0.9) * (1 - Math.exp(-k / 0.1));
}

export const edaScene: Scene = (w, h, t) => {
  const dots: Dot[] = [];
  const s = Math.min(w / 220, h / 180);
  const cx = w / 2;
  const cy = h * 0.4;
  const c = 0.3 + 0.7 * scr(t);

  for (const side of [-1, 1]) {
    const px = cx + side * 58 * s;
    for (let gx = -3; gx <= 3; gx++) {
      for (let gy = -3; gy <= 3; gy++) {
        const edge = Math.max(Math.abs(gx), Math.abs(gy));
        if (Math.abs(gx) === 3 && Math.abs(gy) === 3) continue;
        const x = px + gx * 5 * s;
        const y = cy + gy * 5 * s + gx * side * 0.8 * s;
        const b = edge === 3 ? 0.55 : 0.18 + 0.5 * c * (1 - edge / 3);
        dots.push(dot(x, y, 1, (edge === 3 ? 1.1 : 1.3) * s, b));
      }
    }
  }

  // ions travelling the skin between the contacts — more when conductance rises
  for (let i = 0; i < 120; i++) {
    if (hash(i, 3) > 0.25 + 0.75 * c) continue;
    const ph = (t * (0.18 + 0.45 * c) + i / 120) % 1;
    const lift = (18 + hash(i) * 34) * s;
    const x = cx - 40 * s + ph * 80 * s;
    const y = cy + 24 * s + Math.sin(ph * Math.PI) * lift * 0.9 - 6 * s;
    const b = (0.35 + 0.65 * c) * Math.sin(ph * Math.PI);
    dots.push(dot(x, y, 0.5, (0.7 + 1.2 * b) * s, b, 0.95));
  }

  // skin
  for (let x = cx - 100 * s; x <= cx + 100 * s; x += 5 * s) {
    const fade = 1 - Math.abs(x - cx) / (105 * s);
    dots.push(dot(x, cy + 26 * s + Math.sin(x * 0.04 + t * 0.8) * 1.5 * s, -1, 0.8 * s, 0.1 + 0.15 * fade));
  }

  // conductance trace
  const accent: Dot[] = [];
  const traceY = h * 0.86;
  for (let i = 0; i < 110; i++) {
    const u = i / 109;
    const v = 0.3 + 0.7 * scr(t - (1 - u) * 6);
    const x = cx - 95 * s + u * 190 * s;
    dots.push(dot(x, traceY - v * 22 * s, 3, (0.8 + 0.8 * u) * s, 0.2 + 0.8 * u));
  }
  if (c > 0.7) accent.push(dot(cx + 95 * s, traceY - c * 22 * s, 4, 2.6 * s, 1));
  return { dots, accent };
};

// ── C · Controller ───────────────────────────────────────────
export const chipScene: Scene = (w, h, t) => {
  const dots: Dot[] = [];
  const s = Math.min(w / 220, h / 180);
  const cx = w / 2;
  const cy = h * 0.52;
  const yaw = t * 0.3;
  const tilt = 0.95;
  const sc = 7 * s;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const P = (x: number, z: number, y = 0) => {
    const X = x * cosY - z * sinY;
    const Z = x * sinY + z * cosY;
    return { sx: cx + X * sc, sy: cy + Z * sc * Math.cos(tilt) - y * sc * Math.sin(tilt), d: Z };
  };
  const put = (x: number, z: number, y: number, r: number, b: number) => {
    const p = P(x, z, y);
    const depth = 0.55 + 0.45 * (1 - (p.d + 10) / 20);
    dots.push(dot(p.sx, p.sy, -p.d, r * s * (0.8 + 0.4 * depth), b * depth));
  };

  // package outline
  for (let i = -6; i <= 6; i++) {
    put(i, -6, 0, 1.1, 0.5);
    put(i, 6, 0, 1.1, 0.5);
    put(-6, i, 0, 1.1, 0.5);
    put(6, i, 0, 1.1, 0.5);
  }
  // die + core, the core breathes with activity
  const act = 0.5 + 0.5 * Math.sin(t * 3);
  for (let gx = -3; gx <= 3; gx++) {
    for (let gz = -3; gz <= 3; gz++) {
      const core = Math.abs(gx) <= 1 && Math.abs(gz) <= 1;
      put(gx, gz, 0.6, core ? 1.6 : 0.9, core ? 0.55 + 0.45 * act : 0.22);
    }
  }
  // pins + packets
  for (let side = 0; side < 4; side++) {
    for (let k = -3; k <= 3; k += 2) {
      for (let j = 7; j <= 10; j++) {
        const [x, z] = side === 0 ? [k, -j] : side === 1 ? [j, k] : side === 2 ? [k, j] : [-j, k];
        put(x, z, 0, 0.8, 0.3);
      }
      const ph = (t * 0.7 + (side * 7 + k) * 0.13) % 1;
      const j = 7 + ph * 4;
      const [x, z] = side === 0 ? [k, -j] : side === 1 ? [j, k] : side === 2 ? [k, j] : [-j, k];
      put(x, z, 0, 1.8, 1 - ph);
    }
  }
  // radio: rings rise off the chip
  const accent: Dot[] = [];
  for (let r = 0; r < 3; r++) {
    const ph = (t * 0.35 + r / 3) % 1;
    const rad = 2 + ph * 7;
    const n = 28;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      const p = P(Math.cos(a) * rad, Math.sin(a) * rad, 3 + ph * 6);
      dots.push(dot(p.sx, p.sy, 5, 0.9 * s, 0.6 * (1 - ph)));
    }
  }
  return { dots, accent };
};

// ── D · Battery ──────────────────────────────────────────────
export const batteryScene: Scene = (w, h, t) => {
  const dots: Dot[] = [];
  const s = Math.min(w / 220, h / 180);
  const bw = 150 * s;
  const bh = 64 * s;
  const x0 = w / 2 - bw / 2 - 6 * s;
  const y0 = h * 0.5 - bh / 2;
  roundRect(dots, x0, y0, bw, bh, 12 * s, 4 * s, 0.55, 1.1 * s);
  roundRect(dots, x0 + bw, y0 + bh * 0.3, 10 * s, bh * 0.4, 4 * s, 3.5 * s, 0.45, 1 * s);

  const level = 0.2 + 0.78 * (0.5 - 0.5 * Math.cos(t * 0.35));
  const gap = 5.5 * s;
  const fillW = (bw - 16 * s) * level;
  for (let x = x0 + 8 * s; x < x0 + 8 * s + fillW; x += gap) {
    for (let y = y0 + 8 * s; y < y0 + bh - 6 * s; y += gap) {
      const front = (x - x0) / (fillW + 8 * s);
      const wave = Math.sin(y * 0.12 + t * 3) * 0.2;
      dots.push(dot(x, y, 0, 1.2 * s, 0.25 + 0.5 * front + wave * front));
    }
  }
  // charge sparks leaving the fill edge
  for (let i = 0; i < 26; i++) {
    const ph = (t * 0.6 + i / 26) % 1;
    const y = y0 + 10 * s + hash(i) * (bh - 20 * s);
    const x = x0 + 8 * s + fillW + ph * 18 * s;
    dots.push(dot(x, y + Math.sin(ph * 6 + i) * 3 * s, 1, (1.6 - ph) * s, 1 - ph));
  }
  return { dots };
};

// ── Signals: a dotted 3D ribbon whose frequency is the param ──
export const ribbonScene: Scene = (w, h, t, cycles) => {
  const dots: Dot[] = [];
  const lanes = 6;
  const n = Math.round(Math.min(340, w / 3.6));
  const cy = h / 2;
  const amp = h * 0.3;
  const speed = 0.6 + cycles * 0.04;
  for (let l = 0; l < lanes; l++) {
    const z = l / (lanes - 1);
    const near = 1 - z;
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const env = Math.sin(u * Math.PI) ** 0.8;
      const ph = u * cycles * TAU - t * speed * TAU * 0.25 + l * 0.32;
      const v = Math.sin(ph);
      const x = u * w + (z - 0.5) * 24;
      const y = cy + v * amp * env * (0.55 + 0.45 * near) + (z - 0.5) * 30;
      const b = (0.2 + 0.8 * near) * (0.45 + 0.55 * Math.abs(v)) * (0.3 + 0.7 * env);
      dots.push(dot(x, y, near * 10, 0.6 + 1.3 * near * env, b));
    }
  }
  return { dots };
};

// ── Session flow: the signal of a whole session, written by scroll ──
export const flowScene: Scene = (w, h, t, p) => {
  const dots: Dot[] = [];
  const accent: Dot[] = [];
  const n = Math.round(Math.min(240, w / 5));
  const base = h * 0.56;
  const amp = h * 0.22;
  const gather = smooth(0, 0.22, p);
  const head = smooth(0.18, 0.86, p);
  const review = smooth(0.8, 0.98, p);

  const signal = (u: number) => {
    if (u < 0.25) return 0.04 * Math.sin(u * 90 + t * 2);
    const bump = Math.exp(-(((u - 0.55) / 0.05) ** 2)) + 0.6 * Math.exp(-(((u - 0.72) / 0.035) ** 2));
    return 0.14 * Math.sin(u * 60 + t * 1.5) * smooth(0.25, 0.32, u) + bump;
  };

  // baseline guide
  for (let x = 0; x < w; x += 9) dots.push(dot(x, base, -2, 0.7, 0.12));

  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const tx = u * w;
    const ty = base - signal(u) * amp;
    // Connect: dots fly in from scatter
    const k = clamp(gather * 1.4 - hash(i) * 0.4);
    const sx = hash(i, 7) * w;
    const sy = hash(i, 9) * h;
    const x = sx + (tx - sx) * k;
    const y = sy + (ty - sy) * k;
    const written = u <= head;
    const b = written ? 0.45 + 0.55 * clamp(1 - (head - u) * 1.5) : 0.1 + 0.08 * k;
    const bump = signal(u) > 0.45;
    if (written && bump && p > 0.5) accent.push(dot(x, y, 2, 1.8, 0.95));
    else dots.push(dot(x, y, 1, written ? 1.5 : 1, b * (0.4 + 0.6 * k)));
  }

  // writing head
  if (p > 0.18 && p < 0.99) {
    const hx = head * w;
    const hy = base - signal(head) * amp;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU + t * 1.5;
      dots.push(dot(hx + Math.cos(a) * 9, hy + Math.sin(a) * 9, 3, 1.2, 0.8));
    }
  }

  // Review: markers pop up over each elevated moment
  if (review > 0) {
    for (const mu of [0.55, 0.72]) {
      const mx = mu * w;
      const top = base - amp * 1.35;
      const rows = Math.round(14 * review);
      for (let r = 0; r < rows; r++) accent.push(dot(mx, top + r * ((amp * 1.35) / 14), 3, 1.1, 0.8));
      ring(accent, mx, top - 8, 6 * review, 14, 1, 1.2, 4, t);
    }
  }
  return { dots, accent };
};

// ── Intro: scatter → orb → the band's LED line ───────────────
/**
 * param 0 → 0.5: particles spiral in from a wide field and settle onto a
 * rotating dotted sphere. 0.5 → 1: the sphere collapses into a single
 * horizontal line — the status light on the band.
 */
export const introScene: Scene = (w, h, t, p) => {
  const dots: Dot[] = [];
  const n = 560;
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) * 0.16;
  const L = Math.min(w * 0.36, 420);
  const yaw = t * 0.55;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const tilt = 0.4;
  const gather = p <= 0.5 ? p / 0.5 : 1;
  const collapse = p > 0.5 ? (p - 0.5) / 0.5 : 0;
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < n; i++) {
    // Fibonacci sphere, spun and tilted
    const yy = 1 - (i / (n - 1)) * 2;
    const rr = Math.sqrt(1 - yy * yy);
    const th = golden * i;
    const x0 = Math.cos(th) * rr;
    const z0 = Math.sin(th) * rr;
    const x1 = x0 * cosY - z0 * sinY;
    const z1 = x0 * sinY + z0 * cosY;
    const y1 = yy * Math.cos(tilt) - z1 * Math.sin(tilt);
    const z2 = yy * Math.sin(tilt) + z1 * Math.cos(tilt);
    const sx = cx + x1 * R;
    const sy = cy + y1 * R;
    const depth = (z2 + 1) / 2;

    // Spiral origin: far out, rotating inward as it arrives
    const delay = hash(i, 4) * 0.45;
    const k = smooth(delay, delay + 0.55, gather);
    const a0 = hash(i, 5) * TAU + (1 - k) * 3.2 + t * 0.2;
    const r0 = R * (2.6 + hash(i, 6) * 5);
    const ox = cx + Math.cos(a0) * r0;
    const oy = cy + Math.sin(a0) * r0 * 0.7;
    let x = ox + (sx - ox) * k;
    let y = oy + (sy - oy) * k;
    let b = (0.15 + 0.85 * depth) * (0.25 + 0.75 * k);
    let r = 0.6 + 1.6 * depth * k;

    // Collapse to the LED line
    if (collapse > 0) {
      const c = smooth(hash(i, 8) * 0.35, hash(i, 8) * 0.35 + 0.65, collapse);
      const u = (x1 + 1) / 2;
      const lx = cx + (u - 0.5) * L;
      const ly = cy + Math.sin(u * 40 + t * 8) * 0.6 * (1 - c);
      x += (lx - x) * c;
      y += (ly - y) * c;
      b += (1 - b) * c;
      r += (1.5 - r) * c;
    }
    dots.push(dot(x, y, depth * 10, r, b));
  }
  return { dots };
};
