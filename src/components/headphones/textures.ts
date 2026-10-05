import * as THREE from "three";

/**
 * Surface detail, generated once on a canvas: no image files to ship or license.
 * Height fields are tileable and turned into normal maps with a central difference.
 */

const cache = new Map<string, THREE.Texture>();

function once(key: string, make: () => THREE.Texture) {
  let t = cache.get(key);
  if (!t) cache.set(key, (t = make()));
  return t;
}

/** Deterministic hash → [0, 1). */
function hash(x: number, y: number, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Tileable value noise with `cells` lattice cells across the tile. */
function valueNoise(x: number, y: number, cells: number, seed: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const w = (v: number) => ((v % cells) + cells) % cells;
  const a = hash(w(xi), w(yi), seed), b = hash(w(xi + 1), w(yi), seed);
  const c = hash(w(xi), w(yi + 1), seed), d = hash(w(xi + 1), w(yi + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, base: number, octaves: number, seed: number) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const c = base << o;
    sum += valueNoise(u * c, v * c, c, seed + o) * amp;
    norm += amp;
    amp *= 0.5;
  }
  return sum / norm;
}

function heightToNormal(size: number, height: Float32Array, strength: number, key: string) {
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = (-dx / l) * 127.5 + 127.5;
      data[i + 1] = (-dy / l) * 127.5 + 127.5;
      data[i + 2] = (1 / l) * 127.5 + 127.5;
      data[i + 3] = 255;
    }
  return dataTexture(data, size, key);
}

function dataTexture(data: Uint8Array, size: number, name: string) {
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.name = name;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/** Pebbled leatherette: Worley cells with soft creases between them. */
export function leatherNormal() {
  return once("leather", () => {
    const size = 512, cells = 44;
    const h = new Float32Array(size * size);
    const pts: [number, number][] = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([i + hash(i, j, 7), j + hash(i, j, 11)]);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const u = (x / size) * cells, v = (y / size) * cells;
        const ci = Math.floor(u), cj = Math.floor(v);
        let f1 = 9, f2 = 9;
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ii = (ci + di + cells) % cells, jj = (cj + dj + cells) % cells;
            const p = pts[jj * cells + ii];
            const px = p[0] + (ci + di - ii), py = p[1] + (cj + dj - jj);
            const d = Math.hypot(px - u, py - v);
            if (d < f1) [f2, f1] = [f1, d];
            else if (d < f2) f2 = d;
          }
        const crease = Math.min(1, (f2 - f1) * 3.2);
        h[y * size + x] = crease * crease * (3 - 2 * crease) * 0.8 + fbm(x / size, y / size, 64, 2, 3) * 0.2;
      }
    return heightToNormal(size, h, 1.6, "leather");
  });
}

/** Soft-touch / bead-blasted plastic: very fine, low-contrast grain. */
export function grainNormal() {
  return once("grain", () => {
    const size = 256;
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) h[y * size + x] = fbm(x / size, y / size, 64, 2, 21);
    return heightToNormal(size, h, 0.9, "grain");
  });
}

/** Brushed metal: long streaks along U, used as a roughness map (green channel). */
export function brushedRoughness() {
  return once("brushed", () => {
    const size = 256;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const streak = fbm(x / size, y / size, 2, 2, 5) * 0.35 + hash(y, 0, 9) * 0.65;
        const r = 120 + streak * 80;
        const i = (y * size + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = r;
        data[i + 3] = 255;
      }
    return dataTexture(data, size, "brushed");
  });
}

/** Woven textile — knit canopy, knit cushions, speaker cloth. */
export function weaveNormal() {
  return once("weave", () => {
    const size = 256, p = 8;
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const cx = Math.floor(x / p), cy = Math.floor(y / p);
        const fx = (x % p) / p, fy = (y % p) / p;
        const over = (cx + cy) % 2 === 0;
        const thread = over ? Math.sin(Math.PI * fy) : Math.sin(Math.PI * fx);
        h[y * size + x] = thread * 0.85 + hash(x, y, 4) * 0.15;
      }
    return heightToNormal(size, h, 2.2, "weave");
  });
}

/** Printed wordmark as an alpha mask: white glyphs on black, centred. */
export function wordmarkAlpha(text: string, weight = 600) {
  return once(`wm:${text}:${weight}`, () => {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#000";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#fff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    let size = 190;
    const font = (s: number) => `${weight} ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
    g.font = font(size);
    while (g.measureText(text).width > c.width * 0.92 && size > 20) g.font = font((size -= 6));
    g.fillText(text, c.width / 2, c.height / 2 + size * 0.04);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  });
}

export function repeated(tex: THREE.Texture, rx: number, ry = rx) {
  const t = tex.clone();
  t.repeat.set(rx, ry);
  t.needsUpdate = true;
  return t;
}
