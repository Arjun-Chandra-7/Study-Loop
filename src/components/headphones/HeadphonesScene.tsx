"use client";
/* eslint-disable react-hooks/immutability, react-hooks/use-memo, react-hooks/exhaustive-deps --
   three.js objects are mutated in place every frame (the R3F model), outside React's render. */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { CupShape, HeadphoneModel } from "@/lib/headphones/catalog";
import { meter } from "@/lib/headphones/store";

/**
 * Procedural headphones. Every model is built from the same few parts —
 * extruded cup outlines, a swept headband, yokes and sliders — with the
 * catalog entry choosing silhouette, proportions and finish.
 *
 * Loaded client-only (next/dynamic) so three never touches the server bundle.
 */

interface SceneProps {
  model: HeadphoneModel;
  ringColor: string;
  reduced: boolean;
}

export default function HeadphonesScene({ model, ringColor, reduced }: SceneProps) {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.2, 6], fov: 30 }}
      gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
      style={{ touchAction: "pan-y" }}
    >
      <Studio />
      <ambientLight intensity={0.25} />
      <directionalLight position={[3, 5, 4]} intensity={1.8} />
      <directionalLight position={[-4, 1.5, -3]} intensity={1.1} color={ringColor} />
      <Fit kind={model.kind} />
      <Rig key={model.id} reduced={reduced}>
        {model.kind === "earbuds" ? <Earbuds model={model} ringColor={ringColor} /> : <Headband model={model} ringColor={ringColor} />}
      </Rig>
      <FloorShadow y={model.kind === "earbuds" ? -0.95 : -1.2} />
    </Canvas>
  );
}

/* ── Stage ─────────────────────────────────────────────────── */

/** Soft studio reflections without fetching an HDR. */
function Studio() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.7;
    return () => {
      scene.environment = null;
      env.dispose();
      pmrem.dispose();
    };
  }, [gl, scene]);
  return null;
}

/** Pull the camera back until the front view fits whatever box the card gives us. */
function Fit({ kind }: { kind: HeadphoneModel["kind"] }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    const [w, h] = kind === "earbuds" ? [2.2, 2.7] : [3.9, 3.2];
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
    const aspect = size.width / Math.max(1, size.height);
    cam.position.z = Math.max(h / 2 / t, w / 2 / (t * aspect));
    cam.lookAt(0, 0, 0);
    cam.updateProjectionMatrix();
  }, [camera, size, kind]);
  return null;
}

function FloorShadow({ y }: { y: number }) {
  const tex = useDisposable(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const g = c.getContext("2d")!;
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, "rgba(0,0,0,0.55)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }, []);
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={y} scale={[3, 1.4, 1]}>
      <planeGeometry />
      <meshBasicMaterial map={tex} transparent depthWrite={false} />
    </mesh>
  );
}

/**
 * Entrance (spin-in with a little overshoot), idle turntable, drag to spin,
 * and a head-bob on every beat.
 */
function Rig({ children, reduced }: { children: React.ReactNode; reduced: boolean }) {
  const g = useRef<THREE.Group>(null);
  const { gl } = useThree();
  const st = useRef({ born: -1, yaw: -0.5, vel: 0, drag: false, lastX: 0 });

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
      s.vel += ((reduced ? 0 : 0.35) - s.vel) * Math.min(1, dt * 1.5);
      s.yaw += s.vel * dt;
    }
    const intro = (1 - t) ** 3;
    o.rotation.y = s.yaw - intro * 2.4;
    o.scale.setScalar(backOut(t) * (1 + meter.level * 0.025));

    const groove = meter.playing && !reduced;
    o.position.y = groove ? meter.beat * 0.05 : 0;
    o.rotation.z = groove ? Math.sin(now * 2.2) * 0.045 : 0;
    o.rotation.x = 0.12 + (groove ? meter.beat * 0.03 : 0);
  });

  return <group ref={g}>{children}</group>;
}

/* ── Over-ear / on-ear ─────────────────────────────────────── */

function Headband({ model, ringColor }: { model: HeadphoneModel; ringColor: string }) {
  const L = model.look;
  const onEar = model.kind === "onear";
  const R = L.cupSize;
  const head = onEar ? 0.62 : 0.7;
  const cushionT = onEar ? 0.2 : 0.26;
  const bevel = 0.07;
  // Where the yoke / slider meets the cup, measured outward from the inner face.
  const mid = cushionT + bevel + L.cupDepth * 0.45;
  const sx = head + mid;
  const yokeTop = R + 0.1;
  const bandBase = yokeTop + (L.sliders ? 0.32 : 0.04);
  const H = onEar ? 1.0 : 1.1;
  const lift = -(bandBase + H - R) / 2 + 0.05;

  const mats = useMaterials(model);
  const band = useDisposable(() => new THREE.TubeGeometry(new Arc(sx, bandBase, H, 0, 1), 120, L.band, 18), [sx, bandBase, H, L.band]);
  const pad = useDisposable(
    () => new THREE.TubeGeometry(new Arc(sx - 0.04, bandBase - 0.02, H - L.band * 1.6, 0.16, 0.84), 90, L.canopy ? 0.05 : L.band * 0.95, 14),
    [sx, bandBase, H, L.band, L.canopy],
  );

  return (
    <group position-y={lift}>
      <mesh geometry={band} material={mats.shell} scale={[1, 1, L.canopy ? 1 : 2.3]} />
      <mesh geometry={pad} material={L.canopy ? mats.knit : mats.cushion} scale={[1, 1, L.canopy ? 5.5 : 2.9]} />
      {[-1, 1].map((side) => (
        <group key={side}>
          {L.sliders && (
            <mesh position={[side * sx, (bandBase + (L.cup === "rect" ? R : yokeTop)) / 2, 0]} material={mats.metal}>
              <cylinderGeometry args={[0.028, 0.028, bandBase - (L.cup === "rect" ? R : yokeTop) + 0.04, 16]} />
            </mesh>
          )}
          <Cup side={side} x={head} model={model} cushionT={cushionT} bevel={bevel} mid={mid} ringColor={ringColor} mats={mats} />
        </group>
      ))}
    </group>
  );
}

interface CupProps {
  side: number;
  x: number;
  model: HeadphoneModel;
  cushionT: number;
  bevel: number;
  mid: number;
  ringColor: string;
  mats: Materials;
}

/** Built in local space: z = 0 is the face against the head, +z points away from it. */
function Cup({ side, x, model, cushionT, bevel, mid, ringColor, mats }: CupProps) {
  const L = model.look;
  const R = L.cupSize;
  const cup = L.cup;
  const outer = cushionT + bevel * 2 + L.cupDepth;
  const plate = useRef<THREE.Group>(null);

  const geo = useDisposable(
    () => ({
      shell: extrude(shape(cup, R), L.cupDepth, bevel, 0.05),
      cushion: extrude(shape(cup, R * 0.98, [R * (model.kind === "onear" ? 0.42 : 0.56)]), cushionT * 0.4, cushionT * 0.3, 0.07, 10),
      fabric: extrude(shape(cup, R * 0.62), 0.01, 0, 0),
      ring: extrude(shape(cup, R * 0.9, [R * 0.82]), 0.02, 0.008, 0.006),
      plate: extrude(shape(cup, R * 0.8), 0.015, 0.012, 0.012),
      emblem: extrude(shape("round", R * 0.13), 0.01, 0.01, 0.01),
    }),
    [cup, R, L.cupDepth, cushionT, bevel, model.kind],
  );
  const yoke = useDisposable(() => new THREE.TorusGeometry(R + 0.06, 0.035, 14, 64, Math.PI), [R]);

  useFrame(() => {
    // The outer plate "pumps" like a driver on every kick.
    if (plate.current) plate.current.position.z = outer - 0.005 + (meter.playing ? meter.beat * 0.03 : 0);
  });

  return (
    <group position-x={side * x} rotation-y={(side * Math.PI) / 2}>
      <mesh geometry={geo.cushion} material={mats.cushion} position-z={cushionT * 0.3} />
      <mesh geometry={geo.fabric} material={mats.fabric} position-z={cushionT * 0.35} />
      <mesh geometry={geo.shell} material={mats.shell} position-z={cushionT + bevel} />
      {cup !== "rect" && (
        <mesh geometry={yoke} material={mats.shell} position-z={mid} scale={[cup === "oval" ? 0.85 : 1, 1, 1]} />
      )}
      <group ref={plate} position-z={outer}>
        <mesh geometry={geo.plate} material={mats.plate} />
        <mesh geometry={geo.ring} material={mats.accent} position-z={-0.01} />
        <mesh geometry={geo.emblem} material={mats.accent} position-z={0.02} />
      </group>
      <SoundRings z={outer + 0.05} radius={R} color={ringColor} scaleX={cup === "round" ? 1 : 0.8} />
    </group>
  );
}

/* ── Earbuds in an open case ───────────────────────────────── */

function Earbuds({ model, ringColor }: { model: HeadphoneModel; ringColor: string }) {
  const mats = useMaterials(model);
  const stem = /airpods/i.test(model.name);
  const lid = useRef<THREE.Group>(null);
  const buds = useRef<THREE.Group>(null);
  const born = useRef(-1);

  const geo = useDisposable(() => {
    const base = extrude(roundRect(new THREE.Shape(), 0.78, 0.4, 0.34), 0.48, 0.05, 0.05, 8);
    const top = extrude(roundRect(new THREE.Shape(), 0.78, 0.17, 0.16), 0.48, 0.05, 0.05, 8);
    base.center();
    top.center();
    return { base, top };
  }, []);

  useFrame(({ clock }) => {
    const now = clock.elapsedTime;
    if (born.current < 0) born.current = now;
    const t = Math.min(1, (now - born.current - 0.35) / 0.8);
    if (lid.current) lid.current.rotation.x = -1.95 * backOut(Math.max(0, t));
    if (buds.current) {
      const rise = backOut(Math.max(0, Math.min(1, (now - born.current - 0.7) / 0.9)));
      buds.current.position.y = -0.5 + rise * 1.25 + Math.sin(now * 1.6) * 0.03 + (meter.playing ? meter.beat * 0.05 : 0);
    }
  });

  return (
    <group position-y={-0.1}>
      <group position-y={-0.48}>
        <mesh geometry={geo.base} material={mats.shell} />
        <mesh position={[0, 0.42, 0]} rotation-x={-Math.PI / 2} material={mats.fabric}>
          <planeGeometry args={[1.3, 0.34]} />
        </mesh>
        <mesh position={[0, 0.05, 0.3]} material={mats.led}>
          <sphereGeometry args={[0.025, 16, 16]} />
        </mesh>
        {/* Lid hinges on the back edge. */}
        <group ref={lid} position={[0, 0.44, -0.27]}>
          <mesh geometry={geo.top} material={mats.shell} position={[0, 0.0, 0.27]} />
        </group>
      </group>
      <group ref={buds} position-z={0.3}>
        {[-1, 1].map((side) => (
          <group key={side} position-x={side * 0.36} rotation={[0.15, side * -0.5, side * -0.18]}>
            <mesh material={mats.shell} scale={[1, 0.92, 1.12]}>
              <sphereGeometry args={[0.17, 40, 32]} />
            </mesh>
            <mesh position={[side * -0.1, 0, 0.06]} rotation-y={side * -1.2} material={stem ? mats.metal : mats.cushion} scale={[1, 1, 0.5]}>
              <cylinderGeometry args={[0.07, 0.07, 0.02, 24]} />
            </mesh>
            {stem ? (
              <mesh position={[0.02 * side, -0.27, 0.04]} rotation-x={0.12} material={mats.shell}>
                <capsuleGeometry args={[0.048, 0.34, 8, 20]} />
              </mesh>
            ) : (
              <mesh position={[side * 0.06, -0.1, 0.1]} material={mats.accent} scale={[1, 0.6, 1]}>
                <sphereGeometry args={[0.07, 24, 16]} />
              </mesh>
            )}
            <group rotation-y={(side * Math.PI) / 2}>
              <SoundRings z={0.1} radius={0.16} color={ringColor} />
            </group>
          </group>
        ))}
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
  const geo = useDisposable(() => new THREE.TorusGeometry(1, 0.012, 8, 72), []);
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
      m.position.z = z + l * 0.35;
      mats[i].opacity = (1 - l) ** 1.5 * 0.85;
      m.visible = l < 1;
    }
  });

  return (
    <>
      {mats.map((mat, i) => (
        <mesh key={i} ref={(m) => void (refs.current[i] = m)} geometry={geo} material={mat} visible={false} />
      ))}
    </>
  );
}

/* ── Geometry & materials ──────────────────────────────────── */

type Materials = ReturnType<typeof useMaterials>;

function useMaterials(model: HeadphoneModel) {
  const L = model.look;
  return useDisposable(() => {
    const shell = new THREE.MeshPhysicalMaterial({
      color: L.shell,
      metalness: L.metal,
      roughness: 0.62 - L.gloss * 0.48,
      clearcoat: L.gloss,
      clearcoatRoughness: 0.18,
    });
    return {
      shell,
      plate: new THREE.MeshPhysicalMaterial({
        color: L.shell,
        metalness: Math.min(1, L.metal + 0.1),
        roughness: 0.45 - L.gloss * 0.3,
        clearcoat: 1,
        clearcoatRoughness: 0.08,
      }),
      accent: new THREE.MeshPhysicalMaterial({ color: L.accent, metalness: 0.75, roughness: 0.28, clearcoat: 0.6 }),
      metal: new THREE.MeshStandardMaterial({ color: "#c8c9cc", metalness: 1, roughness: 0.22 }),
      cushion: new THREE.MeshPhysicalMaterial({ color: L.cushion, roughness: 0.92, sheen: 1, sheenRoughness: 0.6, sheenColor: new THREE.Color("#5a5a60") }),
      knit: new THREE.MeshPhysicalMaterial({ color: L.accent, roughness: 1, sheen: 1, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.9 }),
      fabric: new THREE.MeshStandardMaterial({ color: "#0b0b0c", roughness: 1 }),
      led: new THREE.MeshBasicMaterial({ color: "#34d26a" }),
    };
  }, [L]);
}

/** Cup outline (in XY), optionally with holes, for extrusion. */
function shape(cup: CupShape, r: number, holes: number[] = []) {
  const s = trace(new THREE.Shape(), cup, r);
  s.holes = holes.map((h) => trace(new THREE.Path(), cup, h));
  return s;
}

function trace<T extends THREE.Path>(p: T, cup: CupShape, r: number): T {
  if (cup === "round") p.absarc(0, 0, r, 0, Math.PI * 2, false);
  else if (cup === "oval") p.absellipse(0, 0, r * 0.78, r, 0, Math.PI * 2, false, 0);
  else roundRect(p, r * 0.8, r, r * 0.42);
  return p;
}

/** Rounded rectangle centred on the origin, given half-width and half-height. */
function roundRect<T extends THREE.Path>(p: T, hw: number, hh: number, rad: number): T {
  const r = Math.min(rad, hw, hh);
  p.moveTo(-hw + r, -hh);
  p.lineTo(hw - r, -hh);
  p.quadraticCurveTo(hw, -hh, hw, -hh + r);
  p.lineTo(hw, hh - r);
  p.quadraticCurveTo(hw, hh, hw - r, hh);
  p.lineTo(-hw + r, hh);
  p.quadraticCurveTo(-hw, hh, -hw, hh - r);
  p.lineTo(-hw, -hh + r);
  p.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return p;
}

function extrude(s: THREE.Shape, depth: number, bevelThickness: number, bevelSize: number, bevelSegments = 6) {
  return new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: bevelThickness > 0,
    bevelThickness,
    bevelSize,
    bevelSegments,
    curveSegments: 64,
  });
}

/** Headband sweep: a squared-off arch from (-w, base) over the top to (w, base). */
class Arc extends THREE.Curve<THREE.Vector3> {
  constructor(
    private w: number,
    private base: number,
    private h: number,
    private from: number,
    private to: number,
  ) {
    super();
  }
  getPoint(u: number, out = new THREE.Vector3()) {
    const th = Math.PI * (1 - (this.from + (this.to - this.from) * u));
    const c = Math.cos(th);
    return out.set(this.w * Math.sign(c) * Math.abs(c) ** 0.75, this.base + this.h * Math.max(0, Math.sin(th)) ** 0.9, 0);
  }
}

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

function dispose(v: unknown) {
  if (!v || typeof v !== "object") return;
  if ("dispose" in v && typeof v.dispose === "function") return v.dispose();
  Object.values(v).forEach(dispose);
}
