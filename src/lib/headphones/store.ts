"use client";

import { useSyncExternalStore } from "react";
import { gammaBeats } from "../music/gamma";
import { cleanLabel, findModel, identify, type HeadphoneModel } from "./catalog";

/**
 * Which headphones are on, and is anything playing through them.
 *
 * Browsers can't see Bluetooth audio devices directly, but the OS exposes
 * the active output as a media device. Its label ("boAt Rockerz 450") is
 * only readable once the user has granted audio-capture permission, so
 * detection is one tap the first time and automatic after that.
 *
 * Playback is equally private: a page can't hear other apps. The meter
 * follows StudyLoop's own 40 Hz beats automatically, and otherwise listens
 * to a tab/system audio share the user starts, or a demo beat.
 */

export type HeadphoneStatus = "unsupported" | "locked" | "denied" | "searching" | "none" | "connected";
export type MusicSource = "off" | "app" | "shared" | "demo";

export interface HeadphoneSnapshot {
  status: HeadphoneStatus;
  /** Device name as the OS reports it, prefixes stripped. */
  label: string | null;
  model: HeadphoneModel | null;
  /** True when showing a model picked from the preview list, not a real device. */
  preview: boolean;
  music: MusicSource;
  playing: boolean;
}

const SERVER: HeadphoneSnapshot = { status: "searching", label: null, model: null, preview: false, music: "off", playing: false };

type Listener = () => void;

class Headphones {
  private snap: HeadphoneSnapshot = SERVER;
  private listeners = new Set<Listener>();
  private real: Pick<HeadphoneSnapshot, "status" | "label" | "model"> = { status: "searching", label: null, model: null };
  private previewModel: HeadphoneModel | null = null;
  private perm: PermissionStatus | null = null;
  private unGamma: (() => void) | null = null;

  subscribe = (fn: Listener) => {
    this.listeners.add(fn);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(fn);
      if (this.listeners.size === 0) this.stop();
    };
  };
  getSnapshot = () => this.snap;
  getServerSnapshot = () => SERVER;

  private emit() {
    const pm = this.previewModel;
    const next: HeadphoneSnapshot = pm
      ? { ...this.snap, status: "connected", label: `${pm.brand} ${pm.name}`.trim(), model: pm, preview: true }
      : { ...this.snap, ...this.real, preview: false };
    next.music = meter.source;
    next.playing = meter.playing;
    const same = (Object.keys(next) as (keyof HeadphoneSnapshot)[]).every((k) => next[k] === this.snap[k]);
    if (same) return;
    this.snap = next;
    this.listeners.forEach((l) => l());
  }

  private start() {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.enumerateDevices) {
      this.real = { status: "unsupported", label: null, model: null };
      this.emit();
      return;
    }
    md.addEventListener("devicechange", this.scan);
    this.unGamma = gammaBeats.subscribe(this.onGamma);
    this.onGamma();
    navigator.permissions
      ?.query({ name: "microphone" as PermissionName })
      .then((p) => {
        this.perm = p;
        p.onchange = this.scan;
      })
      .catch(() => {});

    // ?headphones=<catalog id>&music=1 — deterministic preview for demos and screenshots.
    const q = new URLSearchParams(location.search);
    const pid = q.get("headphones");
    if (pid) this.preview(pid);
    if (q.get("music") === "1") meter.demo(true);
    this.scan();
  }

  private stop() {
    navigator.mediaDevices?.removeEventListener("devicechange", this.scan);
    if (this.perm) this.perm.onchange = null;
    this.unGamma?.();
    meter.stop();
  }

  scan = async () => {
    let devices: MediaDeviceInfo[];
    try {
      devices = await navigator.mediaDevices.enumerateDevices();
    } catch {
      this.real = { status: "unsupported", label: null, model: null };
      return this.emit();
    }
    const audio = devices.filter((d) => d.kind === "audiooutput" || d.kind === "audioinput");
    if (!audio.some((d) => d.label)) {
      // Labels are hidden until permission is granted.
      this.real = { status: this.perm?.state === "denied" ? "denied" : "locked", label: null, model: null };
      return this.emit();
    }

    const outs = audio.filter((d) => d.kind === "audiooutput");
    const def = outs.find((d) => d.deviceId === "default");
    const defName = def ? cleanLabel(def.label) : "";
    let hit: { label: string; model: HeadphoneModel } | null = null;

    if (defName && !/^default$/i.test(defName)) {
      // Chrome names the active output ("Default - X"); trust it, even when X is a speaker.
      const m = identify(def!.label);
      if (m) hit = { label: defName, model: m };
    } else {
      // No named default (Linux, Firefox): any worn device on the list counts.
      const rest = [...outs, ...audio.filter((d) => d.kind === "audioinput")].filter(
        (d) => d.deviceId !== "default" && d.deviceId !== "communications",
      );
      for (const d of rest) {
        const m = identify(d.label);
        if (m) {
          hit = { label: cleanLabel(d.label), model: m };
          break;
        }
      }
    }
    this.real = hit ? { status: "connected", ...hit } : { status: "none", label: null, model: null };
    this.emit();
  };

  /** One tap: ask for audio permission so device labels become readable. */
  requestAccess = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      this.real = { status: "denied", label: null, model: null };
      return this.emit();
    }
    await this.scan();
  };

  preview = (id: string | null) => {
    this.previewModel = id ? findModel(id) : null;
    if (!this.previewModel && meter.source === "demo") meter.demo(false);
    this.emit();
  };

  /** In-app beats take over an idle meter, and hand it back when they stop. */
  private onGamma = () => {
    const on = gammaBeats.getSnapshot();
    if (on && meter.source === "off") meter.app();
    else if (!on && meter.source === "app") meter.stop();
  };

  /** Called by the meter when its public state changes. */
  sync = () => this.emit();
}

/**
 * Audio meter. Level and beat are read every frame by the 3D scene, so they
 * live outside React; only `playing` and `source` flow through the store.
 */
class Meter {
  /** Smoothed loudness, 0–1. */
  level = 0;
  /** Kick envelope: jumps to 1 on a beat, decays. */
  beat = 0;
  source: MusicSource = "off";
  playing = false;

  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private stream: MediaStream | null = null;
  private bins: Uint8Array<ArrayBuffer> | null = null;
  private raf = 0;
  private avgBass = 0;
  private lastBeat = 0;
  private lastLoud = 0;
  private t0 = 0;
  private step = -1;

  /** Share a tab or the system's audio. Chrome needs a video track to offer audio; it's dropped at once. */
  share = async () => {
    this.stop();
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      systemAudio: "include",
    } as DisplayMediaStreamOptions);
    const tracks = stream.getAudioTracks();
    stream.getVideoTracks().forEach((t) => t.stop());
    if (!tracks.length) throw new Error("no-audio");
    this.stream = stream;
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.6;
    this.ctx.createMediaStreamSource(new MediaStream(tracks)).connect(this.analyser);
    this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    tracks[0].addEventListener("ended", () => this.stop());
    this.run("shared");
  };

  demo = (on: boolean) => {
    this.stop();
    if (on) this.run("demo");
  };

  /** StudyLoop's own 40 Hz layer is a steady tone, so it gets a calm synthetic pulse. */
  app = () => {
    this.stop();
    this.run("app");
  };

  stop = () => {
    cancelAnimationFrame(this.raf);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.ctx?.close().catch(() => {});
    this.stream = this.ctx = this.analyser = this.bins = null;
    this.level = this.beat = 0;
    this.set("off", false);
  };

  private run(source: MusicSource) {
    this.t0 = performance.now();
    this.step = -1;
    this.set(source, source !== "shared");
    const loop = (now: number) => {
      this.tick(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tick(now: number) {
    this.beat *= 0.9;
    if (this.source === "demo" || this.source === "app") {
      // Demo: ~112 bpm with a softer off-beat. App: an unhurried 72 bpm breath.
      const demo = this.source === "demo";
      const t = (now - this.t0) / 1000;
      const step = Math.floor((t * (demo ? 112 : 72)) / 60);
      if (step !== this.step) {
        this.step = step;
        this.beat = demo && step % 2 ? 0.7 : 1;
      }
      this.level += ((demo ? 0.5 : 0.3) + 0.2 * Math.sin(t * 1.3) + 0.25 * this.beat - this.level) * 0.2;
      return;
    }
    if (!this.analyser || !this.bins) return;
    this.analyser.getByteFrequencyData(this.bins);
    const n = this.bins.length;
    let all = 0;
    for (let i = 0; i < n; i++) all += this.bins[i];
    // ~0–250 Hz carries the kick at 48 kHz / 1024 bins.
    let bass = 0;
    for (let i = 1; i < 12; i++) bass += this.bins[i];
    bass /= 11 * 255;
    const lvl = all / (n * 255);
    this.level += (Math.min(1, lvl * 3) - this.level) * 0.25;
    this.avgBass += (bass - this.avgBass) * 0.05;
    if (bass > this.avgBass * 1.3 && bass > 0.25 && now - this.lastBeat > 260) {
      this.beat = 1;
      this.lastBeat = now;
    }
    if (lvl > 0.02) this.lastLoud = now;
    const playing = now - this.lastLoud < 1500;
    if (playing !== this.playing) this.set(this.source, playing);
  }

  private set(source: MusicSource, playing: boolean) {
    if (source === this.source && playing === this.playing) return;
    this.source = source;
    this.playing = playing;
    headphones.sync();
  }
}

export const meter = new Meter();
export const headphones = new Headphones();

export function useHeadphones() {
  return useSyncExternalStore(headphones.subscribe, headphones.getSnapshot, headphones.getServerSnapshot);
}
