import * as THREE from "three";

/**
 * Geometry builders for the procedural headphones.
 *
 * Cups and cushions are swept around a superellipse outline; band, pad and
 * yokes are swept along a path. Both produce smooth, closed, UV-mapped
 * surfaces in real-world units so procedural textures tile at true scale.
 */

export interface Outline {
  rx: number;
  ry: number;
  n: number;
}

/** A superellipse re-sampled by arc length, so points are evenly spaced even on squircles. */
export class Loop {
  readonly length: number;
  private pts: THREE.Vector2[] = [];
  private cum: number[] = [];

  constructor(o: Outline, samples = 2048) {
    const p = 2 / o.n;
    let acc = 0;
    for (let i = 0; i <= samples; i++) {
      const t = (i / samples) * Math.PI * 2;
      const c = Math.cos(t), s = Math.sin(t);
      const v = new THREE.Vector2(o.rx * Math.sign(c) * Math.abs(c) ** p, o.ry * Math.sign(s) * Math.abs(s) ** p);
      if (i) acc += v.distanceTo(this.pts[i - 1]);
      this.pts.push(v);
      this.cum.push(acc);
    }
    this.length = acc;
  }

  /** Point and outward normal at fraction `u` of the perimeter (0 = +x, 0.25 = top). */
  at(u: number, p = new THREE.Vector2(), nrm = new THREE.Vector2()) {
    const f = (((u % 1) + 1) % 1) * this.length;
    let lo = 0, hi = this.cum.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cum[mid] < f) lo = mid;
      else hi = mid;
    }
    const span = this.cum[hi] - this.cum[lo] || 1;
    p.lerpVectors(this.pts[lo], this.pts[hi], (f - this.cum[lo]) / span);
    const a = this.pts[Math.max(0, lo - 2)], b = this.pts[Math.min(this.pts.length - 1, hi + 2)];
    const tx = b.x - a.x, ty = b.y - a.y;
    const l = Math.hypot(tx, ty) || 1;
    nrm.set(ty / l, -tx / l);
    return { p, nrm };
  }
}

/** One cross-section sample: scale of the outline, offset along its normal, height. */
export type Ring = [k: number, n: number, z: number];

/**
 * Sweep a profile around the outline. `profile(u)` may vary with u (wrinkles).
 * The profile should run so that, on the +x side, it climbs in +z on the outside.
 */
export function sweep(loop: Loop, profile: (u: number) => Ring[], segU = 160, uvUnit = 1) {
  const first = profile(0);
  const M = first.length;
  const pos = new Float32Array((segU + 1) * M * 3);
  const uv = new Float32Array((segU + 1) * M * 2);
  const p = new THREE.Vector2(), nrm = new THREE.Vector2();
  for (let i = 0; i <= segU; i++) {
    const u = i / segU;
    loop.at(u, p, nrm);
    const r = i === segU ? first : profile(u);
    let v = 0;
    for (let j = 0; j < M; j++) {
      const [k, n, z] = r[j];
      const x = p.x * k + nrm.x * n, y = p.y * k + nrm.y * n;
      const o = (i * M + j) * 3;
      if (j) v += Math.hypot(x - pos[o - 3], y - pos[o - 2], z - pos[o - 1]);
      pos.set([x, y, z], o);
      uv.set([(u * loop.length) / uvUnit, v / uvUnit], (i * M + j) * 2);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < segU; i++)
    for (let j = 0; j < M - 1; j++) {
      const a = i * M + j, b = (i + 1) * M + j, c = b + 1, d = a + 1;
      idx.push(a, b, d, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Weld the seam's shading: the first and last columns are the same points.
  const no = g.getAttribute("normal") as THREE.BufferAttribute;
  const t = new THREE.Vector3(), s = new THREE.Vector3();
  for (let j = 0; j < M; j++) {
    t.fromBufferAttribute(no, j);
    s.fromBufferAttribute(no, segU * M + j);
    t.add(s).normalize();
    no.setXYZ(j, t.x, t.y, t.z);
    no.setXYZ(segU * M + j, t.x, t.y, t.z);
  }
  return g;
}

/** Closed 2D cross-section (counter-clockwise), x = across the path in-plane, y = along +Z. */
export function superSection(hx: number, hy: number, n: number, segs = 32): THREE.Vector2[] {
  const p = 2 / n;
  return Array.from({ length: segs }, (_, i) => {
    const t = (i / segs) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    return new THREE.Vector2(hx * Math.sign(c) * Math.abs(c) ** p, hy * Math.sign(s) * Math.abs(s) ** p);
  });
}

/** Sample a curve densely into points. */
export function samplePath(curve: THREE.Curve<THREE.Vector3>, segs: number) {
  return Array.from({ length: segs + 1 }, (_, i) => curve.getPoint(i / segs));
}

/** In-plane left normal (Z × T) at each point of a path lying in an XY plane. */
export function sideNormals(pts: THREE.Vector3[]) {
  return pts.map((_, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(b, a).normalize();
    return new THREE.Vector3(-t.y, t.x, 0);
  });
}

export function offsetPath(pts: THREE.Vector3[], d: number) {
  const ns = sideNormals(pts);
  return pts.map((p, i) => p.clone().addScaledVector(ns[i], d));
}

/**
 * Sweep a closed section along a planar path (in XY). Section x runs along the
 * path's in-plane left normal, y along +Z. Ends are capped.
 */
export function sweepPath(pts: THREE.Vector3[], section: THREE.Vector2[], uvUnit = 1, caps = true) {
  const ns = sideNormals(pts);
  const S = section.length;
  const P = pts.length;
  const pos: number[] = [];
  const uv: number[] = [];
  let along = 0;
  for (let i = 0; i < P; i++) {
    if (i) along += pts[i].distanceTo(pts[i - 1]);
    let around = 0;
    for (let j = 0; j <= S; j++) {
      const s = section[j % S];
      if (j) around += s.distanceTo(section[(j - 1) % S]);
      pos.push(pts[i].x + ns[i].x * s.x, pts[i].y + ns[i].y * s.x, pts[i].z + s.y);
      uv.push(along / uvUnit, around / uvUnit);
    }
  }
  const idx: number[] = [];
  const W = S + 1;
  for (let i = 0; i < P - 1; i++)
    for (let j = 0; j < S; j++) {
      const a = i * W + j, b = (i + 1) * W + j;
      idx.push(a, a + 1, b, b, a + 1, b + 1);
    }
  if (caps)
    for (const [i, flip] of [
      [0, true],
      [P - 1, false],
    ] as const) {
      const c = pos.length / 3;
      pos.push(pts[i].x, pts[i].y, pts[i].z);
      uv.push(0, 0);
      for (let j = 0; j < S; j++) {
        const a = i * W + j, b = i * W + j + 1;
        if (flip) idx.push(c, b, a);
        else idx.push(c, a, b);
      }
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return orient(g, pts[P >> 1], ns[P >> 1], (P >> 1) * W);
}

/**
 * Make sure faces point outward: the vertex at section x-max of the middle
 * ring should face along the side normal. Flip winding if it doesn't.
 */
function orient(g: THREE.BufferGeometry, _c: THREE.Vector3, side: THREE.Vector3, ringStart: number) {
  const no = g.getAttribute("normal");
  const n = new THREE.Vector3().fromBufferAttribute(no, ringStart);
  if (n.dot(side) >= 0) return g;
  const index = g.getIndex()!;
  const arr = index.array as Uint16Array | Uint32Array;
  for (let i = 0; i < arr.length; i += 3) [arr[i + 1], arr[i + 2]] = [arr[i + 2], arr[i + 1]];
  index.needsUpdate = true;
  g.computeVertexNormals();
  return g;
}

/** Superellipse outline as a flat Shape (speaker cloth, face decals). */
export function outlineShape(loop: Loop, k: number, segs = 96) {
  const s = new THREE.Shape();
  const p = new THREE.Vector2();
  for (let i = 0; i <= segs; i++) {
    loop.at(i / segs, p);
    if (i) s.lineTo(p.x * k, p.y * k);
    else s.moveTo(p.x * k, p.y * k);
  }
  return s;
}

/** Rounded box, centred, for buttons, ports and hinge housings. */
export function roundedBox(w: number, h: number, d: number, r: number) {
  const s = new THREE.Shape();
  const hw = w / 2 - r, hh = h / 2 - r;
  s.moveTo(-hw, -h / 2);
  s.lineTo(hw, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -hh);
  s.lineTo(w / 2, hh);
  s.quadraticCurveTo(w / 2, h / 2, hw, h / 2);
  s.lineTo(-hw, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, hh);
  s.lineTo(-w / 2, -hh);
  s.quadraticCurveTo(-w / 2, -h / 2, -hw, -h / 2);
  const bevel = Math.min(r, d / 2) * 0.9;
  const g = new THREE.ExtrudeGeometry(s, {
    depth: Math.max(0.0001, d - bevel * 2),
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 4,
    curveSegments: 8,
  });
  g.center();
  return g;
}

/** Orientation whose x, y, z axes are the given vectors. */
export function basis(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3) {
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}
