"use client";

import { AnimatePresence, motion } from "motion/react";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { CATALOG } from "@/lib/headphones/catalog";
import { headphones, meter, useHeadphones } from "@/lib/headphones/store";
import { usePalette } from "@/lib/prefs";
import { useReducedMotionSafe } from "@/lib/useReducedMotionSafe";

const HeadphonesScene = dynamic(() => import("../headphones/HeadphonesScene"), { ssr: false });

/** How long the green "Connected" moment holds before the model takes over. */
const HELLO_MS = 1700;

/** Right vertical card — the headphones you're wearing, in 3D, dancing when music plays. */
export function HeadphonesCard() {
  const hp = useHeadphones();
  const pal = usePalette();
  const reduced = useReducedMotionSafe();
  const connected = hp.status === "connected" && !!hp.model;

  // Each new device gets its own hello; `shown` remembers which one already had it.
  const key = connected ? `${hp.model!.id}:${hp.label}` : null;
  const [shown, setShown] = useState<string | null>(null);
  const hello = key !== null && shown !== key && !reduced;
  useEffect(() => {
    // Unplugging clears the memory, so plugging back in says hello again.
    const t = setTimeout(() => setShown(key), key && !reduced ? HELLO_MS : 0);
    return () => clearTimeout(t);
  }, [key, reduced]);

  return (
    <section
      className="card hp-card"
      data-state={hp.status}
      data-hello={hello || undefined}
      data-playing={(connected && hp.playing) || undefined}
      aria-label="Headphones"
    >
      <header className="card__head hp-card__head">
        <p className="card__title">Headphones</p>
        <span className="hp-card__status">
          <StatusChip status={hp.status} playing={connected && hp.playing} preview={hp.preview} />
          {hp.preview && (
            <button type="button" className="hp-card__x" onClick={() => headphones.preview(null)} aria-label="Exit preview" title="Exit preview">
              <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden>
                <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </span>
      </header>

      {/* The stage owns all the room: model, hello, empty state and the name bar overlay it. */}
      <div className="hp-card__stage">
        {connected && !hello && (
          <motion.div
            className="hp-card__canvas"
            initial={reduced ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <HeadphonesScene model={hp.model!} ringColor={pal.measuredHi} reduced={reduced} />
          </motion.div>
        )}
        <AnimatePresence>{hello && <Hello key={key} label={hp.label ?? ""} />}</AnimatePresence>
        {!connected && <Empty status={hp.status} />}
        {connected && hp.playing && !hello && !reduced && <Notes />}
        <LevelGlow on={connected && hp.music !== "off"} />
        {connected && !hello && (
          <div className="hp-card__bar">
            <div className="hp-card__name">
              {hp.model!.brand && <span className="hp-card__brand">{hp.model!.brand}</span>}
              <span className="hp-card__model">{withoutBrand(hp.label ?? "", hp.model!.brand)}</span>
            </div>
            <MusicButton preview={hp.preview} music={hp.music} />
          </div>
        )}
      </div>
    </section>
  );
}

/** "boAt Rockerz 460" under a "boAt" eyebrow reads as "Rockerz 460". */
function withoutBrand(label: string, brand: string) {
  return brand && label.toLowerCase().startsWith(brand.toLowerCase() + " ") ? label.slice(brand.length + 1) : label;
}

function StatusChip({ status, playing, preview }: { status: string; playing: boolean; preview: boolean }) {
  if (status === "connected")
    return (
      <span className="chip hp-chip hp-chip--ok">
        {playing ? <Bars /> : <span className="hp-chip__dot" />}
        {preview ? "Preview" : playing ? "Playing" : "Connected"}
      </span>
    );
  const text: Record<string, string> = {
    searching: "Searching",
    none: "Not connected",
    locked: "Off",
    denied: "Blocked",
    unsupported: "Unavailable",
  };
  return <span className="chip chip--outline">{text[status] ?? "Off"}</span>;
}

/** The Apple-style moment: green halo, check draws in, "Connected". */
function Hello({ label }: { label: string }) {
  return (
    <motion.div
      className="hp-hello"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9, filter: "blur(6px)" }}
      transition={{ duration: 0.35 }}
      role="status"
    >
      <div className="hp-hello__mark">
        {[0, 1].map((i) => (
          <motion.span
            key={i}
            className="hp-hello__halo"
            initial={{ scale: 0.6, opacity: 0.7 }}
            animate={{ scale: 2.4, opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.15 + i * 0.3, ease: "easeOut" }}
          />
        ))}
        <motion.span
          className="hp-hello__disc"
          initial={{ scale: 0.3, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 18 }}
        >
          <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden>
            <motion.path
              d="M5.5 12.5l4.2 4.2L18.5 8"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.6}
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.45, delay: 0.25, ease: [0.65, 0, 0.35, 1] }}
            />
          </svg>
        </motion.span>
      </div>
      <motion.p
        className="hp-hello__title"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35, duration: 0.4 }}
      >
        Connected
      </motion.p>
      <motion.p
        className="hp-hello__label"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.4 }}
      >
        {label}
      </motion.p>
    </motion.div>
  );
}

function Empty({ status }: { status: string }) {
  const copy: Record<string, { title: string; body: string }> = {
    locked: { title: "See what you're wearing", body: "Reads your audio device's name only. Nothing is recorded." },
    denied: { title: "Audio access is blocked", body: "Allow microphone access in site settings to read device names." },
    searching: { title: "Looking for headphones…", body: "" },
    none: { title: "No headphones found", body: "Plug in or pair a set. It appears here on its own." },
    unsupported: { title: "Can't see audio devices", body: "This browser doesn't expose them. Try Chrome or Edge." },
  };
  const c = copy[status] ?? copy.searching;
  return (
    <div className="hp-empty">
      <div className="hp-empty__glyph" data-scan={status === "searching" || status === "none" || undefined}>
        <span className="hp-empty__pulse" />
        <span className="hp-empty__pulse" />
        <HeadphonesGlyph />
      </div>
      <p className="hp-empty__title">{c.title}</p>
      {c.body && <p className="hp-empty__body">{c.body}</p>}
      <div className="hp-empty__actions">
        {status === "locked" && (
          <button type="button" className="btn btn--primary hp-empty__cta" onClick={headphones.requestAccess}>
            Detect
          </button>
        )}
        <PreviewPicker />
      </div>
    </div>
  );
}

function PreviewPicker() {
  return (
    <label className="hp-card__picker">
      <span className="sr-only">Preview a model</span>
      <select value="" onChange={(e) => headphones.preview(e.target.value || null)}>
        <option value="">Preview a model</option>
        {CATALOG.map((m) => (
          <option key={m.id} value={m.id}>
            {m.brand} {m.name}
          </option>
        ))}
      </select>
    </label>
  );
}

function MusicButton({ preview, music }: { preview: boolean; music: string }) {
  const [err, setErr] = useState(false);
  const on = music !== "off";
  if (music === "app")
    return (
      <span className="hp-music" data-on title="StudyLoop's 40 Hz beats are playing">
        <NoteGlyph />
        40 Hz
      </span>
    );
  const click = async () => {
    setErr(false);
    if (on) return meter.stop();
    if (preview) return meter.demo(true);
    try {
      await meter.share();
    } catch {
      setErr(true);
    }
  };
  return (
    <button
      type="button"
      className="hp-music"
      data-on={on || undefined}
      onClick={click}
      title={preview ? "Play a demo beat" : "Share a tab or system audio so the card can move to your music"}
    >
      <NoteGlyph />
      {on ? "Stop" : err ? "No audio" : preview ? "Demo" : "Sync"}
    </button>
  );
}

/** Notes float out of the cups, one per beat-ish, capped so it stays cute rather than busy. */
function Notes() {
  const [notes, setNotes] = useState<{ id: number; x: number; drift: number; glyph: string; rot: number }[]>([]);
  useEffect(() => {
    let raf = 0;
    let id = 0;
    let last = 0;
    let armed = true;
    const loop = (now: number) => {
      if (meter.beat < 0.5) armed = true;
      if (armed && meter.beat > 0.85 && now - last > 380) {
        armed = false;
        last = now;
        const side = id % 2 ? 1 : -1;
        setNotes((n) => [
          ...n.slice(-7),
          {
            id: id++,
            x: 50 + side * (22 + Math.random() * 12),
            drift: side * (10 + Math.random() * 18),
            glyph: ["♪", "♫", "♩", "♬"][Math.floor(Math.random() * 4)],
            rot: side * (8 + Math.random() * 14),
          },
        ]);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);
  return (
    <div className="hp-notes" aria-hidden>
      {notes.map((n) => (
        <motion.span
          key={n.id}
          className="hp-note"
          style={{ left: `${n.x}%` }}
          initial={{ y: 0, x: 0, opacity: 0, scale: 0.5, rotate: 0 }}
          animate={{ y: -90, x: n.drift, opacity: [0, 1, 1, 0], scale: [0.5, 1.1, 1], rotate: n.rot }}
          transition={{ duration: 1.8, ease: "easeOut" }}
          onAnimationComplete={() => setNotes((all) => all.filter((m) => m.id !== n.id))}
        >
          {n.glyph}
        </motion.span>
      ))}
    </div>
  );
}

/** A floor glow that breathes with loudness. Written straight to a CSS variable, not React state. */
function LevelGlow({ on }: { on: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const loop = () => {
      ref.current?.style.setProperty("--lvl", (meter.level * 0.7 + meter.beat * 0.3).toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [on]);
  return <span ref={ref} className="hp-glow" data-on={on || undefined} aria-hidden />;
}

function Bars() {
  return (
    <span className="hp-bars" aria-hidden>
      <i />
      <i />
      <i />
    </span>
  );
}

function HeadphonesGlyph() {
  return (
    <svg viewBox="0 0 48 48" width="44" height="44" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
      <path d="M8 30v-6a16 16 0 0132 0v6" />
      <rect x="6" y="28" width="9" height="13" rx="4" />
      <rect x="33" y="28" width="9" height="13" rx="4" />
    </svg>
  );
}

function NoteGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <path d="M6 12.2V3.6l7-1.6v8.2a2 2 0 11-1.2-1.8V4.6L7.2 5.7v6.5A2 2 0 116 12.2z" />
    </svg>
  );
}
