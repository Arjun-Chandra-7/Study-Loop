"use client";
/* eslint-disable react-hooks/immutability, react-hooks/use-memo, react-hooks/exhaustive-deps --
   three.js objects are mutated in place every frame (the R3F model), outside React's render. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Finish, HeadphoneLook, HeadphoneModel } from "@/lib/headphones/catalog";
import { meter } from "@/lib/headphones/store";
import { basis, Loop, offsetPath, outlineShape, roundedBox, samplePath, superSection, sweep, sweepPath, type Ring } from "./geometry";
import { brushedRoughness, grainNormal, leatherNormal, repeated, smudgeRoughness, weaveNormal, wordmarkAlpha } from "./textures";

/**
 * Procedural, physically based headphones. Real-world proportions (1 unit =
 * 100 mm), swept surfaces for cushions, cups and band, and canvas-generated
 * leather, soft-touch, brushed-metal and knit surfaces under a studio light rig.
 *
 * Loaded client-only (next/dynamic) so three never touches the server bundle.
 */

interface SceneProps {
  model: HeadphoneModel;
  ringColor: string;
  reduced: boolean;
}

export default function HeadphonesScene({ model, ringColor, reduced }: SceneProps) {
  const buds = model.kind === "earbuds";
  const wired = model.kind === "wired";
  return (
    <Canvas
      shadows="percentage"
      dpr={[1, 2]}
      camera={{ position: [0, 0.15, 8], fov: 24 }}
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.08 }}
      style={{ touchAction: "pan-y" }}
    >
      <Studio />
      <KeyLight />
      <directionalLight position={[-4, 1.2, -3]} intensity={0.9} color="#ffe2cf" />
      <ambientLight intensity={0.03} />
      <Fit box={buds ? [1.05, 1.05] : wired ? [0.9, 1.15] : [3.0, 2.8]} />
      <Rig key={model.id} reduced={reduced}>
        {buds ? (
          <Earbuds look={model.look} ringColor={ringColor} />
        ) : wired ? (
          <Wired look={model.look} ringColor={ringColor} />
        ) : (
          <Headphones model={model} ringColor={ringColor} />
        )}
      </Rig>
      <Floor y={buds ? -0.36 : wired ? -0.6 : -1.22} />
    </Canvas>
  );
}

/* ── Stage ─────────────────────────────────────────────────── */

/** Studio reflections from a procedural room, no HDR download. */
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const room = photoStudio();
    const env = pmrem.fromScene(room, 0.02).texture;
    room.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    scene.environment = env;
    scene.environmentIntensity = 1;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/**
 * A product-photography set, rendered once into the reflections: a big overhead-left key softbox,
 * a soft fill panel, two tall rim strip-lights behind, a dim ceiling and a dark floor bounce.
 * The strips are what draw the long, clean highlights you see on real headphone shots.
 */
function photoStudio() {
  const room = new THREE.Scene();
  room.background = new THREE.Color(0x0e0e10);
  const panel = (w: number, h: number, pos: [number, number, number], intensity: number, tint = 0xffffff) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(tint).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    room.add(m);
  };
  panel(5, 3.5, [-3.5, 4.5, 4], 7); // key softbox
  panel(7, 2.5, [5.5, 1, 3.5], 1.6, 0xfff4ea); // fill
  panel(0.7, 7, [-5, 1, -3.5], 9, 0xfff1e4); // warm rim strip
  panel(0.7, 7, [5, 1.5, -4.5], 7, 0xe8f0ff); // cool rim strip
  panel(10, 10, [0, 8, 0], 0.9); // ceiling
  panel(16, 16, [0, -4, 0], 0.08); // floor bounce
  return room;
}

function KeyLight() {
  const ref = useRef<THREE.DirectionalLight>(null);
  useLayoutEffect(() => {
    const l = ref.current;
    if (!l) return;
    const c = l.shadow.camera;
    c.left = c.bottom = -2;
    c.right = c.top = 2;
    c.near = 0.5;
    c.far = 14;
    c.updateProjectionMatrix();
  }, []);
  return (
    <directionalLight
      ref={ref}
      castShadow
      position={[-3, 4.5, 3.8]}
      intensity={1.6}
      shadow-mapSize={[2048, 2048]}
      shadow-bias={-0.0003}
      shadow-normalBias={0.015}
      shadow-radius={5}
    />
  );
}

/** Pull the camera back until the front view fits whatever box the card gives us. */
function Fit({ box: [w, h] }: { box: [number, number] }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const aspect = size.width / Math.max(1, size.height);
    cam.position.z = Math.max(h / 2 / t, w / 2 / (t * aspect));
    cam.position.y = cam.position.z * 0.045;
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, w, h]);
  return null;
}

/** Shadow catcher plus a soft contact blob for ambient occlusion under the product. */
function Floor({ y }: { y: number }) {
  const blob = useDisposable(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.6)");
    grad.addColorStop(0.5, "rgba(0,0,0,0.25)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <group position-y={y} rotation-x={-Math.PI / 2}>
      <mesh receiveShadow>
        <planeGeometry args={[8, 8]} />
        <shadowMaterial opacity={0.42} transparent depthWrite={false} />
      </mesh>
      <mesh position-z={0.001} scale={[2.6, 1.3, 1]}>
        <planeGeometry />
        <meshBasicMaterial map={blob} transparent depthWrite={false} />
      </mesh>
    </group>
  );
}

/**
 * Entrance (spin-in with a little overshoot), idle turntable, drag to spin,
 * and a head-bob on every beat.
 */
function Rig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const st = useRef({ born: -1, yaw: -0.55, vel: 0, drag: false, lastX: 0 });

  useLayoutEffect(() => {
    g.current?.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && !o.userData.noShadow) o.castShadow = o.receiveShadow = true;
    });
  }, []);

  useEffect(() => {
    const el = gl.domElement;
    const s = st.current;
    const down = (e: PointerEvent) => {
      s.drag = true;
      s.lastX = e.clientX;
      el.setPointerCapture(e.pointerId);
      el.style.cursor = "grabbing";
    };
    const move = (e: PointerEvent) => {
      if (!s.drag) return;
      const dx = e.clientX - s.lastX;
      s.lastX = e.clientX;
      s.yaw += dx * 0.012;
      s.vel = dx * 0.012 * 60;
    };
    const up = () => {
      s.drag = false;
      el.style.cursor = "grab";
    };
    el.style.cursor = "grab";
    el.addEventListener("pointerdown", down);
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
    return () => {
      el.removeEventListener("pointerdown", down);
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
    };
  }, [gl]);

  useFrame(({ clock }, dt) => {
    const o = g.current;
    if (!o) return;
    const s = st.current;
    const now = clock.elapsedTime;
    if (s.born < 0) s.born = now;
    const t = reduced ? 1 : Math.min(1, (now - s.born) / 1.1);

    if (!s.drag) {
      // Coast after a flick, then settle back into a slow turntable.
      s.vel += ((reduced ? 0 : 0.28) - s.vel) * Math.min(1, dt * 1.5);
      s.yaw += s.vel * dt;
    }
    const intro = (1 - t) ** 3;
    o.rotation.y = s.yaw - intro * 2.4;
    o.scale.setScalar(backOut(t) * (1 + meter.level * 0.02));

    const groove = meter.playing && !reduced;
    o.position.y = groove ? meter.beat * 0.035 : 0;
    o.rotation.z = groove ? Math.sin(now * 2.2) * 0.035 : 0;
    o.rotation.x = 0.1 + (groove ? meter.beat * 0.025 : 0);
  });

  return <group ref={g}>{children}</group>;
}

/* ── Materials ─────────────────────────────────────────────── */

function finish(color: string, f: Finish) {
  const m = new THREE.MeshPhysicalMaterial({ color });
  switch (f) {
    case "matte": // soft-touch polycarbonate
      Object.assign(m, { roughness: 0.58, clearcoat: 0.08, clearcoatRoughness: 0.6 });
      m.normalMap = repeated(grainNormal(), 9);
      m.normalScale.setScalar(0.35);
      break;
    case "satin":
      Object.assign(m, { roughness: 0.52, clearcoat: 0.35, clearcoatRoughness: 0.35 });
      m.normalMap = repeated(grainNormal(), 9);
      m.normalScale.setScalar(0.18);
      m.roughnessMap = repeated(smudgeRoughness(), 2);
      break;
    case "gloss": // piano-black / gloss ABS, with the faint haze of handling
      Object.assign(m, { roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.08 });
      m.roughnessMap = repeated(smudgeRoughness(), 2);
      m.clearcoatRoughnessMap = m.roughnessMap;
      break;
    case "anodized": // bead-blasted aluminium
      Object.assign(m, { metalness: 1, roughness: 0.42 });
      m.normalMap = repeated(grainNormal(), 14);
      m.normalScale.setScalar(0.12);
      m.roughnessMap = repeated(smudgeRoughness(), 1.5);
      break;
    case "chrome":
      Object.assign(m, { metalness: 1, roughness: 0.14 });
      m.roughnessMap = repeated(smudgeRoughness(), 2);
      break;
    case "brushed":
      Object.assign(m, { metalness: 1, roughness: 0.32, anisotropy: 0.75 });
      m.roughnessMap = repeated(brushedRoughness(), 1, 6);
      break;
  }
  return m;
}

function cushionMat(look: HeadphoneLook["cushion"]) {
  if (look.fabric === "knit") {
    const m = new THREE.MeshPhysicalMaterial({
      color: look.color,
      roughness: 0.92,
      sheen: 1,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color("#ffffff"),
    });
    m.normalMap = repeated(weaveNormal(), 3.2);
    m.normalScale.setScalar(0.7);
    return m;
  }
  // Protein leatherette: pebbled, a little sheen where it stretches.
  const m = new THREE.MeshPhysicalMaterial({
    color: look.color,
    roughness: 0.5,
    clearcoat: 0.22,
    clearcoatRoughness: 0.45,
    sheen: 0.35,
    sheenRoughness: 0.5,
    sheenColor: new THREE.Color("#6a6a70"),
  });
  m.normalMap = repeated(leatherNormal(), 2.4);
  m.normalScale.setScalar(0.55);
  return m;
}

type Mats = ReturnType<typeof useLookMaterials>;

function useLookMaterials(look: HeadphoneLook) {
  return useDisposable(() => {
    const cloth = new THREE.MeshStandardMaterial({ color: "#0b0b0c", roughness: 1 });
    cloth.normalMap = repeated(weaveNormal(), 9);
    cloth.normalScale.setScalar(0.8);
    return {
      shell: finish(look.shell.color, look.shell.finish),
      face: finish(look.face.color, look.face.finish),
      ring: look.ring ? finish(look.ring.color, look.ring.finish) : null,
      cushion: cushionMat(look.cushion),
      band: finish(look.band.color, look.band.style === "canopy" ? "chrome" : look.shell.finish),
      pad: look.band.style === "canopy" ? cushionMat({ ...look.cushion, color: look.band.color }) : cushionMat(look.cushion),
      steel: finish("#cfd0d3", "brushed"),
      polished: finish("#d9dadd", "chrome"),
      cloth,
      dark: new THREE.MeshStandardMaterial({ color: "#050505", roughness: 0.6 }),
      stitch: new THREE.MeshStandardMaterial({ color: "#2b2b2e", roughness: 0.9 }),
      tick: new THREE.MeshStandardMaterial({ color: "#3a3b3e", roughness: 0.5, metalness: 0.6 }),
      led: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#5dd5ff", emissiveIntensity: 2.2 }),
      print: look.wordmark
        ? new THREE.MeshPhysicalMaterial({
            color: look.wordmark.color,
            alphaMap: wordmarkAlpha(look.wordmark.text),
            transparent: true,
            roughness: 0.3,
            clearcoat: 0.6,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
          })
        : null,
    };
  }, [look]);
}

/* ── Over-ear / on-ear ─────────────────────────────────────── */

function Headphones({ model, ringColor }: { model: HeadphoneModel; ringColor: string }) {
  const L = model.look;
  const onEar = model.kind === "onear";
  const mats = useLookMaterials(L);
  const loop = useMemo(() => new Loop(L.cup), [L]);

  const head = onEar ? 0.6 : 0.68; // half the gap between the cushions
  const zMid = L.cushion.thick + L.cup.depth * 0.5;
  const gap = 0.045;
  const sx = head + zMid;
  const telescopic = L.slider === "telescopic";
  const yokeTop = L.cup.ry + (telescopic ? 0.02 : gap + 0.035);
  const bandBase = yokeTop + (onEar ? 0.2 : 0.26);
  const H = L.band.height;
  const lift = -(bandBase + H - L.cup.ry) / 2;

  return (
    <group position-y={lift}>
      <Headband sx={sx} base={bandBase} H={H} look={L} mats={mats} />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Slider side={side} x={sx} from={yokeTop} to={bandBase + 0.06} look={L} mats={mats} />
          <group position-x={side * head} rotation-y={(side * Math.PI) / 2}>
            <Cup side={side} loop={loop} look={L} mats={mats} ringColor={ringColor} />
            {!telescopic && <Yoke loop={loop} z={zMid} gap={gap} mats={mats} />}
          </group>
        </group>
      ))}
    </group>
  );
}

/** Squared-off arch from (-w, base) over the top to (w, base). */
class Arch extends THREE.Curve<THREE.Vector3> {
  constructor(
    private w: number,
    private base: number,
    private h: number,
  ) {
    super();
  }
  getPoint(u: number, out = new THREE.Vector3()) {
    const th = Math.PI * (1 - u);
    const c = Math.cos(th);
    return out.set(this.w * Math.sign(c) * Math.abs(c) ** 0.72, this.base + this.h * Math.max(0, Math.sin(th)) ** 0.85, 0);
  }
}

function Headband({ sx, base, H, look, mats }: { sx: number; base: number; H: number; look: HeadphoneLook; mats: Mats }) {
  const canopy = look.band.style === "canopy";
  const W = look.band.width;
  const parts = useDisposable(() => {
    const path = samplePath(new Arch(sx, base + 0.04, H - 0.04), 220);
    const thick = canopy ? 0.008 : 0.026;
    const band = sweepPath(path, superSection(thick, canopy ? 0.045 : W / 2, canopy ? 6 : 7, 40), 1);
    // Under the band: a stitched leather pad, or AirPods Max's knit canopy.
    const span = path.slice(Math.round(path.length * 0.13), Math.round(path.length * 0.87));
    const padT = canopy ? 0.01 : 0.038;
    const padPath = offsetPath(span, -(canopy ? 0.11 : thick + padT * 0.85));
    const pad = sweepPath(padPath, superSection(padT, canopy ? W / 2 : W * 0.43, canopy ? 8 : 2.6, 48), 1);
    // Running stitch along both edges of the pad.
    const stitches: THREE.Matrix4[] = [];
    if (!canopy) {
      const line = offsetPath(padPath, -padT * 0.45);
      let acc = 0;
      for (let i = 1; i < line.length; i++) {
        acc += line[i].distanceTo(line[i - 1]);
        if (acc < 0.026) continue;
        acc = 0;
        const t = new THREE.Vector3().subVectors(line[i], line[i - 1]).normalize();
        const q = basis(t, new THREE.Vector3(-t.y, t.x, 0), new THREE.Vector3(0, 0, 1));
        for (const z of [-1, 1])
          stitches.push(new THREE.Matrix4().compose(new THREE.Vector3(line[i].x, line[i].y, z * (W * 0.43 - 0.022)), q, new THREE.Vector3(1, 1, 1)));
      }
    }
    return {
      band,
      pad,
      stitches,
      stitchGeo: new THREE.BoxGeometry(0.016, 0.006, 0.004),
      housing: canopy ? new THREE.CylinderGeometry(0.03, 0.03, 0.09, 32) : roundedBox(0.075, 0.15, W * 0.92, 0.03),
      top: base + H,
      thick,
    };
  }, [sx, base, H, look]);

  const inst = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = inst.current;
    if (!m) return;
    parts.stitches.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
  }, [parts]);

  return (
    <group>
      <mesh geometry={parts.band} material={mats.band} />
      <mesh geometry={parts.pad} material={mats.pad} />
      {parts.stitches.length > 0 && <instancedMesh ref={inst} args={[parts.stitchGeo, mats.stitch, parts.stitches.length]} />}
      {mats.print && !canopy && (
        <mesh position={[0, parts.top + parts.thick + 0.0015, 0]} rotation-x={-Math.PI / 2} material={mats.print}>
          <planeGeometry args={[W * 0.9, W * 0.225]} />
        </mesh>
      )}
      {/* Hinge housings where the sliders disappear into the band. */}
      {[-1, 1].map((s) => (
        <mesh key={s} geometry={parts.housing} position={[s * sx, base + (canopy ? 0.04 : 0.03), 0]} material={canopy ? mats.polished : mats.band} />
      ))}
    </group>
  );
}

function Slider({ side, x, from, to, look, mats }: { side: number; x: number; from: number; to: number; look: HeadphoneLook; mats: Mats }) {
  const len = to - from;
  const telescopic = look.slider === "telescopic";
  const count = telescopic ? 0 : Math.floor((len - 0.08) / 0.03);
  const geo = useDisposable(
    () => ({
      arm: telescopic ? new THREE.CylinderGeometry(0.016, 0.016, len, 32) : roundedBox(0.016, len, 0.085, 0.006),
      tick: new THREE.BoxGeometry(0.002, 0.003, 0.05),
    }),
    [len, telescopic],
  );
  const ticks = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const m = ticks.current;
    if (!m) return;
    for (let i = 0; i < count; i++) m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(side * 0.0095, from + 0.04 + i * 0.03, 0));
    m.instanceMatrix.needsUpdate = true;
  }, [count, from, side]);
  return (
    <group position-x={side * x}>
      <mesh geometry={geo.arm} position-y={from + len / 2} material={telescopic ? mats.polished : mats.steel} />
      {count > 0 && <instancedMesh ref={ticks} args={[geo.tick, mats.tick, count]} />}
      {telescopic && (
        <mesh position-y={from} material={mats.shell}>
          <sphereGeometry args={[0.032, 32, 24]} />
        </mesh>
      )}
    </group>
  );
}

/** Fork that holds the cup at two pivots, front and back. Built in cup space. */
function Yoke({ loop, z, gap, mats }: { loop: Loop; z: number; gap: number; mats: Mats }) {
  const parts = useDisposable(() => {
    const pts: THREE.Vector3[] = [];
    const p = new THREE.Vector2(), n = new THREE.Vector2();
    for (let i = 0; i <= 120; i++) {
      loop.at(-0.015 + (i / 120) * 0.53, p, n);
      pts.push(new THREE.Vector3(p.x + n.x * gap, p.y + n.y * gap, z));
    }
    const arm = sweepPath(pts, superSection(0.013, 0.026, 4, 28), 1);
    const pins = [0, 0.5].map((u) => {
      loop.at(u, p, n);
      return { pos: new THREE.Vector3(p.x + (n.x * gap) / 2, p.y + (n.y * gap) / 2, z), rot: Math.atan2(n.y, n.x) };
    });
    loop.at(0.25, p, n);
    return {
      arm,
      pins,
      pin: new THREE.CylinderGeometry(0.012, 0.012, gap + 0.006, 24),
      collar: roundedBox(0.11, 0.05, 0.05, 0.018),
      top: p.y + gap + 0.012,
    };
  }, [loop, z, gap]);
  return (
    <group>
      <mesh geometry={parts.arm} material={mats.shell} />
      {parts.pins.map((pin, i) => (
        <mesh key={i} geometry={parts.pin} position={pin.pos} rotation-z={pin.rot - Math.PI / 2} material={mats.shell} />
      ))}
      {/* Collar where the slider meets the fork. */}
      <mesh geometry={parts.collar} position={[0, parts.top + 0.012, z]} material={mats.shell} />
    </group>
  );
}

interface CupProps {
  side: number;
  loop: Loop;
  look: HeadphoneLook;
  mats: Mats;
  ringColor: string;
}

/** Built in local space: z = 0 is the face against the head, +z points away from it. */
function Cup({ side, loop, look, mats, ringColor }: CupProps) {
  const plate = useRef<THREE.Group>(null);
  const cT = look.cushion.thick;
  const D = look.cup.depth;
  const R = (look.cup.rx + look.cup.ry) / 2;
  const top = cT + D;

  const geo = useDisposable(() => {
    // Cushion: a pillowy tube with leather pleats gathering on the inner edge.
    const w = look.cushion.width;
    const cushion = sweep(
      loop,
      (u) =>
        Array.from({ length: 40 }, (_, j): Ring => {
          const a = (j / 39) * Math.PI * 2;
          const c = Math.cos(a), s = Math.sin(a);
          const pe = 2 / 2.8;
          let n = (w / 2) * Math.sign(c) * Math.abs(c) ** pe - w / 2 + 0.012;
          const z = (cT / 2) * Math.sign(s) * Math.abs(s) ** pe + cT / 2;
          const inner = Math.max(0, -c) * Math.max(0, 1 - Math.abs(s) * 1.2);
          n += 0.0045 * Math.sin(u * Math.PI * 2 * 46) * inner;
          return [1, n, z - (s < 0 ? 0.004 * Math.max(0, -c) : 0)];
        }),
      240,
    );

    // Shell: tapered side, filleted edge, then a groove and the face plate.
    const re = 0.045;
    const wall: Ring[] = [];
    for (let i = 0; i <= 12; i++) {
      const s = i / 12;
      wall.push([1 + 0.03 * Math.sin(Math.PI * s * 0.85) - 0.02 * s, 0, cT + s * (D - re)]);
    }
    const k1 = wall[wall.length - 1][0];
    const kc = k1 - re / R;
    for (let i = 1; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      wall.push([kc + (re / R) * Math.cos(a), 0, cT + D - re + re * Math.sin(a)]);
    }
    const shell = sweep(loop, () => wall, 180);

    const g = 0.012 / R;
    const face: Ring[] = [
      [kc, 0, top],
      [kc - g * 0.5, 0, top - 0.006],
      [kc - g * 1.6, 0, top - 0.008],
      [kc - g * 2.2, 0, top - 0.002],
      [kc - g * 2.4, 0, top + 0.002],
    ];
    const k0 = kc - g * 2.6;
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      face.push([k0 * (1 - t), 0, top + 0.003 + 0.004 * (1 - (1 - t) ** 2)]);
    }
    const plate = sweep(loop, () => face, 180);

    const ringK = kc - g * 1.1;
    const ring = sweep(
      loop,
      () =>
        Array.from({ length: 16 }, (_, j): Ring => {
          const a = (j / 15) * Math.PI * 2;
          return [ringK, 0.0075 * Math.cos(a), top - 0.003 + 0.0075 * Math.sin(a)];
        }),
      180,
    );

    const cloth = new THREE.ShapeGeometry(outlineShape(loop, 0.66 - look.cushion.width / R / 2));

    // The cushion's sewn seam, running round its outer wall.
    const seam = sweep(
      loop,
      () =>
        Array.from({ length: 10 }, (_, j): Ring => {
          const a = (j / 9) * Math.PI * 2;
          return [1, 0.0125 + 0.0026 * Math.cos(a), cT * 0.52 + 0.0026 * Math.sin(a)];
        }),
      200,
    );

    const p = new THREE.Vector2(), nr = new THREE.Vector2();
    // Two noise-cancelling mic ports on the outer plate, just inside the accent ring.
    const mics = [0.06, 0.44].map((u) => {
      loop.at(u, p, nr);
      const k = kc - g * 4;
      return new THREE.Vector3(p.x * k, p.y * k, top + 0.0088);
    });

    // Controls on the right cup's lower-back edge.
    const z = cT + D * 0.42;
    const at = (u: number, out: number) => {
      loop.at(u, p, nr);
      const pos = new THREE.Vector3(p.x * 1.025 + nr.x * out, p.y * 1.025 + nr.y * out, z);
      const nn = new THREE.Vector3(nr.x, nr.y, 0);
      const tt = new THREE.Vector3(-nr.y, nr.x, 0);
      return { pos, q: basis(nn, tt, new THREE.Vector3(0, 0, 1)) };
    };
    return {
      cushion,
      shell,
      plate,
      ring,
      cloth,
      seam,
      mics,
      mic: new THREE.CircleGeometry(0.0055, 20),
      controls: [0.6, 0.635, 0.67].map((u) => at(u, 0.002)),
      led: at(0.7, 0.001),
      port: at(0.75, -0.002),
      button: roundedBox(0.012, 0.042, 0.026, 0.006),
      slot: roundedBox(0.01, 0.034, 0.012, 0.005),
      dot: new THREE.SphereGeometry(0.005, 12, 12),
      print: new THREE.PlaneGeometry(1, 0.25),
    };
  }, [loop, look]);

  useFrame(() => {
    // The face plate "pumps" like a driver on every kick.
    if (plate.current) plate.current.position.z = meter.playing ? meter.beat * 0.012 : 0;
  });

  const wm = Math.min(look.cup.rx, look.cup.ry) * 1.15;

  return (
    <group>
      <mesh geometry={geo.cushion} material={mats.cushion} />
      <mesh geometry={geo.seam} material={mats.stitch} />
      <mesh geometry={geo.cloth} material={mats.cloth} position-z={0.05} />
      <mesh geometry={geo.shell} material={mats.shell} />
      <group ref={plate}>
        <mesh geometry={geo.plate} material={mats.face} />
        {mats.ring && <mesh geometry={geo.ring} material={mats.ring} />}
        {geo.mics.map((pos, i) => (
          <mesh key={i} geometry={geo.mic} position={pos} material={mats.dark} />
        ))}
        {mats.print && <mesh geometry={geo.print} position-z={top + 0.0082} scale={[wm, wm, 1]} material={mats.print} />}
      </group>
      {side === 1 && (
        <>
          {geo.controls.map((c, i) => (
            <mesh key={i} geometry={geo.button} position={c.pos} quaternion={c.q} material={mats.shell} />
          ))}
          <mesh geometry={geo.dot} position={geo.led.pos} material={mats.led} />
          <mesh geometry={geo.slot} position={geo.port.pos} quaternion={geo.port.q} material={mats.dark} />
        </>
      )}
      <SoundRings z={top + 0.03} radius={R * 0.95} color={ringColor} scaleX={look.cup.rx / look.cup.ry} />
    </group>
  );
}

/* ── Earbuds in an open case ───────────────────────────────── */

function Earbuds({ look, ringColor }: { look: HeadphoneLook; ringColor: string }) {
  const b = look.buds!;
  const lid = useRef<THREE.Group>(null);
  const buds = useRef<THREE.Group>(null);
  const born = useRef(-1);

  const parts = useDisposable(() => {
    const plastic = finish(look.shell.color, "gloss");
    plastic.normalMap = repeated(grainNormal(), 30);
    plastic.normalScale.setScalar(0.04);
    const loop = new Loop({ rx: 0.3, ry: 0.11, n: 3.4 });
    const fil = 0.07;
    const lower: Ring[] = [[0, 0, 0]];
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (i / 8) * (Math.PI / 2);
      lower.push([1 - fil / 0.2 + (fil / 0.2) * Math.cos(a), 0, fil + fil * Math.sin(a)]);
    }
    lower.push([1, 0, 0.3]);
    const upper: Ring[] = [[1, 0, 0]];
    for (let i = 0; i <= 8; i++) {
      const a = (i / 8) * (Math.PI / 2);
      upper.push([1 - fil / 0.2 + (fil / 0.2) * Math.cos(a), 0, 0.12 - fil + fil * Math.sin(a)]);
    }
    upper.push([0, 0, 0.12]);
    // Bud head: a smooth bulb, the way AirPods are turned.
    const bulb: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = -Math.PI / 2 + (i / 24) * Math.PI;
      bulb.push(new THREE.Vector2(Math.cos(a) * 0.085 * (1 - 0.15 * Math.max(0, Math.sin(a))), Math.sin(a) * 0.09));
    }
    return {
      plastic,
      caseMat: finish(b.case, "gloss"),
      tipMat: new THREE.MeshPhysicalMaterial({ color: "#d9dadc", roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), transmission: 0.15, thickness: 0.02 }),
      grille: new THREE.MeshStandardMaterial({ color: "#151517", roughness: 0.7, metalness: 0.3 }),
      cavity: new THREE.MeshPhysicalMaterial({ color: "#e9e9e7", roughness: 0.35, side: THREE.DoubleSide }),
      led: new THREE.MeshStandardMaterial({ color: "#ffffff", emissive: "#38e07a", emissiveIntensity: 2.5 }),
      lower: sweep(loop, () => lower, 160),
      upper: sweep(loop, () => upper, 160),
      inner: new THREE.ShapeGeometry(outlineShape(loop, 0.9)),
      head: new THREE.LatheGeometry(bulb, 48),
      mesh: new THREE.CircleGeometry(0.025, 32),
      tip: new THREE.SphereGeometry(0.05, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      stem: new THREE.CapsuleGeometry(0.024, 0.22, 12, 32),
      mic: new THREE.CylinderGeometry(0.017, 0.017, 0.012, 24),
      dot: new THREE.SphereGeometry(0.006, 12, 12),
    };
  }, [look]);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (born.current < 0) born.current = now;
    const t = Math.min(1, Math.max(0, (now - born.current - 0.3) / 0.8));
    if (lid.current) lid.current.rotation.x = -1.95 * backOut(t);
    if (buds.current) {
      const rise = backOut(Math.max(0, Math.min(1, (now - born.current - 0.6) / 0.9)));
      buds.current.position.y = -0.02 + rise * 0.36 + Math.sin(now * 1.6) * 0.01 + (meter.playing ? meter.beat * 0.02 : 0);
    }
  });

  return (
    <group position-y={-0.12}>
      {/* Case, built lying in XY and stood up: local z is up. */}
      <group position-y={-0.24} rotation-x={-Math.PI / 2}>
        <mesh geometry={parts.lower} material={parts.caseMat} />
        <mesh geometry={parts.inner} material={parts.cavity} position-z={0.298} />
        <mesh geometry={parts.dot} position={[0, -0.113, 0.17]} material={parts.led} />
        <group ref={lid} position={[0, 0.11, 0.3]}>
          <mesh geometry={parts.upper} material={parts.caseMat} position={[0, -0.11, 0]} />
          {/* The lid's inside, seen once it swings open. */}
          <mesh geometry={parts.inner} material={parts.cavity} position={[0, -0.11, 0.002]} />
        </group>
      </group>
      <group ref={buds}>
        {[-1, 1].map((side) => (
          <group key={side} position-x={side * 0.2} rotation={[0.1, side * -0.35, side * -0.1]}>
            <mesh geometry={parts.head} material={parts.plastic} rotation-z={(side * Math.PI) / 2} scale={[1, 1, 0.92]} />
            {/* Speaker mesh, facing the ear. */}
            <mesh geometry={parts.mesh} position={[side * -0.07, 0.005, 0.02]} rotation-y={(side * -Math.PI) / 2} material={parts.grille} />
            {b.tip && <mesh geometry={parts.tip} position={[side * -0.085, 0, 0.015]} rotation-z={(side * Math.PI) / 2} material={parts.tipMat} />}
            {b.stem && (
              <>
                <mesh geometry={parts.stem} position={[side * 0.012, -0.15, 0.01]} rotation-x={0.08} material={parts.plastic} />
                <mesh geometry={parts.mic} position={[side * 0.012, -0.285, 0.021]} rotation-x={0.08} material={parts.grille} />
              </>
            )}
            <group rotation-y={(side * Math.PI) / 2}>
              <SoundRings z={0.06} radius={0.08} color={ringColor} />
            </group>
          </group>
        ))}
      </group>
    </group>
  );
}

/* ── Wired earphones ───────────────────────────────────────── */

/** In-ear buds on a Y-cable with an inline remote, ending in a USB-C or 3.5 mm plug. */
function Wired({ look, ringColor }: { look: HeadphoneLook; ringColor: string }) {
  const sway = useRef<THREE.Group>(null);
  const jack = look.plug === "jack";

  const parts = useDisposable(() => {
    const plastic = finish(look.shell.color, "gloss");
    plastic.normalMap = repeated(grainNormal(), 30);
    plastic.normalScale.setScalar(0.04);
    const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const left = new THREE.CatmullRomCurve3([v(-0.18, 0.19, 0), v(-0.16, 0.06, 0.03), v(-0.08, -0.05, 0.045), v(0, -0.11, 0.03)]);
    const right = new THREE.CatmullRomCurve3([v(0.18, 0.19, 0), v(0.165, 0.05, 0.035), v(0.075, -0.055, 0.04), v(0, -0.11, 0.03)]);
    const main = new THREE.CatmullRomCurve3([v(0, -0.14, 0.03), v(0.02, -0.27, 0.06), v(0.11, -0.4, 0.05), v(0.15, -0.445, 0.01), v(0.15, -0.46, 0)]);
    const cable = (c: THREE.Curve<THREE.Vector3>) => new THREE.TubeGeometry(c, 160, 0.0065, 10);
    // Inline remote sits on the right lead, aligned with it.
    const at = right.getPointAt(0.42);
    const tan = right.getTangentAt(0.42);
    const remoteQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    const bulb: THREE.Vector2[] = [];
    for (let i = 0; i <= 24; i++) {
      const a = -Math.PI / 2 + (i / 24) * Math.PI;
      bulb.push(new THREE.Vector2(Math.cos(a) * 0.08 * (1 - 0.15 * Math.max(0, Math.sin(a))), Math.sin(a) * 0.085));
    }
    return {
      plastic,
      cord: finish(look.shell.color, "satin"),
      steel: finish("#cfd0d3", "brushed"),
      chrome: finish("#e2e3e5", "chrome"),
      ringMat: new THREE.MeshStandardMaterial({ color: "#1a1a1c", roughness: 0.5 }),
      tipMat: new THREE.MeshPhysicalMaterial({ color: "#d9dadc", roughness: 0.55, sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), transmission: 0.15, thickness: 0.02 }),
      grille: new THREE.MeshStandardMaterial({ color: "#151517", roughness: 0.7, metalness: 0.3 }),
      left: cable(left),
      right: cable(right),
      main: cable(main),
      remote: new THREE.CapsuleGeometry(0.016, 0.07, 8, 24),
      remoteAt: at,
      remoteQ,
      splitter: new THREE.CylinderGeometry(0.012, 0.014, 0.05, 24),
      head: new THREE.LatheGeometry(bulb, 48),
      housing: new THREE.CapsuleGeometry(0.026, 0.1, 10, 28),
      relief: new THREE.CylinderGeometry(0.008, 0.014, 0.05, 20),
      tip: new THREE.SphereGeometry(0.048, 32, 24, 0, Math.PI * 2, 0, Math.PI / 2),
      mesh: new THREE.CircleGeometry(0.024, 32),
      body: jack ? new THREE.CylinderGeometry(0.021, 0.021, 0.1, 32) : roundedBox(0.058, 0.12, 0.028, 0.012),
      plugTip: jack ? new THREE.CylinderGeometry(0.0175, 0.0175, 0.07, 32) : roundedBox(0.042, 0.04, 0.014, 0.006),
      band: new THREE.CylinderGeometry(0.0178, 0.0178, 0.004, 32),
    };
  }, [look]);

  useFrame(({ clock }) => {
    const g = sway.current;
    if (!g) return;
    const t = clock.elapsedTime;
    // Hangs from the buds and swings a little; bounces on the beat.
    g.rotation.z = Math.sin(t * 1.1) * 0.025;
    g.position.y = 0.04 + (meter.playing ? meter.beat * 0.02 : 0);
  });

  const plugY = jack ? -0.51 : -0.52;
  return (
    <group ref={sway} position-y={0.04}>
      {[-1, 1].map((side) => (
        <group key={side} position={[side * 0.17, 0.4, 0]} rotation={[0.08, side * -0.35, 0]}>
          <mesh geometry={parts.head} material={parts.plastic} rotation-z={(side * Math.PI) / 2} scale={[1, 1, 0.92]} />
          <mesh geometry={parts.mesh} position={[side * -0.066, 0.004, 0.018]} rotation-y={(side * -Math.PI) / 2} material={parts.grille} />
          <mesh geometry={parts.tip} position={[side * -0.08, 0, 0.012]} rotation-z={(side * Math.PI) / 2} material={parts.tipMat} />
          <mesh geometry={parts.housing} position={[side * 0.01, -0.1, 0]} material={parts.plastic} />
          <mesh geometry={parts.relief} position={[side * 0.01, -0.185, 0]} material={parts.cord} />
          <group rotation-y={(side * Math.PI) / 2}>
            <SoundRings z={0.06} radius={0.075} color={ringColor} />
          </group>
        </group>
      ))}
      <mesh geometry={parts.left} material={parts.cord} />
      <mesh geometry={parts.right} material={parts.cord} />
      <mesh geometry={parts.main} material={parts.cord} />
      <mesh geometry={parts.remote} position={parts.remoteAt} quaternion={parts.remoteQ} material={parts.plastic} />
      <mesh geometry={parts.splitter} position={[0, -0.125, 0.03]} material={parts.plastic} />
      <group position={[0.15, plugY, 0]}>
        <mesh geometry={parts.body} material={parts.plastic} />
        {jack ? (
          <>
            <mesh geometry={parts.plugTip} position-y={-0.085} material={parts.chrome} />
            {[-0.07, -0.088, -0.104].map((y) => (
              <mesh key={y} geometry={parts.band} position-y={y} material={parts.ringMat} />
            ))}
          </>
        ) : (
          <mesh geometry={parts.plugTip} position-y={-0.075} material={parts.steel} />
        )}
      </group>
    </group>
  );
}

/* ── Sound rings ───────────────────────────────────────────── */

const RINGS = 5;

/** Ripples that leave the cup on each beat. Pooled; nothing is allocated per frame. */
function SoundRings({ z, radius, color, scaleX = 1 }: { z: number; radius: number; color: string; scaleX?: number }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const life = useRef(new Float32Array(RINGS).fill(1));
  const st = useRef({ next: 0, armed: true });
  const geo = useDisposable(() => new THREE.TorusGeometry(1, 0.008, 8, 96), []);
  const mats = useDisposable(
    () => Array.from({ length: RINGS }, () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false })),
    [color],
  );

  useFrame((_, dt) => {
    const s = st.current;
    if (!meter.playing) s.armed = true;
    else if (meter.beat > 0.85 && s.armed) {
      life.current[s.next] = 0;
      s.next = (s.next + 1) % RINGS;
      s.armed = false;
    } else if (meter.beat < 0.5) s.armed = true;

    for (let i = 0; i < RINGS; i++) {
      const m = refs.current[i];
      if (!m) continue;
      const l = (life.current[i] = Math.min(1, life.current[i] + dt / 1.1));
      const k = radius * (0.9 + l * 1.1);
      m.scale.set(k * scaleX, k, 1);
      m.position.z = z + l * 0.25;
      mats[i].opacity = (1 - l) ** 1.5 * 0.8;
      m.visible = l < 1;
    }
  });

  return (
    <>
      {mats.map((mat, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} geometry={geo} material={mat} visible={false} userData={{ noShadow: true }} />
      ))}
    </>
  );
}

/* ── Utilities ─────────────────────────────────────────────── */

function backOut(t: number) {
  const c = 1.4;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
}

/** useMemo for GPU resources: disposes whatever the factory returned when deps change or on unmount. */
function useDisposable<T>(factory: () => T, deps: React.DependencyList): T {
  const value = useMemo(factory, deps);
  useEffect(() => () => dispose(value), [value]);
  return value;
}

/** Geometries and materials are freed; shared textures and plain math objects are left alone. */
function dispose(v: unknown) {
  if (!v || typeof v !== "object") return;
  if (v instanceof THREE.BufferGeometry || v instanceof THREE.Material) return v.dispose();
  if (Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype) Object.values(v).forEach(dispose);
}
