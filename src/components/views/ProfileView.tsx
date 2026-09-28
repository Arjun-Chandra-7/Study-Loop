"use client";

import Image from "next/image";
import { motion } from "motion/react";
import { useSyncExternalStore } from "react";
import { isBluetoothAvailable } from "@/lib/sensors/bluetooth";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { SimPanel } from "../cockpit/SimPanel";
import { Icon } from "../ui/Icon";

const noopSubscribe = () => () => {};

export function ProfileView() {
  const s = useStudyLoop();
  const r = s.reading;
  const bt = useSyncExternalStore(noopSubscribe, isBluetoothAvailable, () => false);

  const connLabel = { connected: "Connected", connecting: "Connecting…", disconnected: "Disconnected" }[r.connection];

  return (
    <div className="profile">
      <section className="profile__band">
        <div className="profile__render" aria-hidden>
          <Image src="/media/studyloop-band.png" alt="" fill sizes="320px" className="profile__img" />
        </div>
        <div className="profile__facts">
          <p className="eyebrow">
            <span className="eyebrow__rule" aria-hidden />
            Your band
          </p>
          <h2 className="h-section">{r.deviceName ?? "StudyLoop SL-01"}</h2>
          <dl className="spec-list">
            <div>
              <dt>Link</dt>
              <dd>
                <span className={`link-dot link-dot--${r.connection}`} aria-hidden /> {connLabel}
              </dd>
            </div>
            <div>
              <dt>Battery</dt>
              <dd className="tnum">
                {r.battery != null && r.connection === "connected" ? `${r.battery}%` : "—"}
                {r.battery != null && r.battery <= 15 && r.connection === "connected" && (
                  <span className="chip chip--action">Charge soon</span>
                )}
              </dd>
            </div>
            <div>
              <dt>Sensors</dt>
              <dd>PPG · EDA (2 electrodes)</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{s.providerKind === "mock" ? "Simulated" : "Bluetooth LE"}</dd>
            </div>
          </dl>
          <button type="button" className="btn btn--ghost btn--sm" onClick={engine.toggleConnection}>
            <Icon name={r.connection === "disconnected" ? "link" : "unlink"} size={16} />
            {r.connection === "disconnected" ? "Connect" : "Disconnect"}
          </button>
          {s.providerError && (
            <p className="small notice notice--inline" role="alert">
              <Icon name="alert" size={14} /> {s.providerError}
            </p>
          )}
        </div>
      </section>

      <section className="profile__settings">
        <div className="field">
          <span className="label">Data source</span>
          <div className="seg seg--wide" role="radiogroup" aria-label="Data source">
            {(["mock", "bluetooth"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={s.providerKind === k}
                disabled={k === "bluetooth" && !bt}
                onClick={() => engine.setProvider(k)}
              >
                {s.providerKind === k && <motion.span layoutId="seg-provider" className="seg__thumb" />}
                <span>{k === "mock" ? "Simulated band" : bt ? "Bluetooth band" : "Bluetooth (unsupported)"}</span>
              </button>
            ))}
          </div>
        </div>
        <SimPanel />
        <div className="toggles">
          <Toggle label="Quiet mode" hint="Dims everything except the timer and state." on={s.quiet} onChange={engine.toggleQuiet} />
          <Toggle label="Research layer" hint="Shows experimental context in coral." on={s.research} onChange={engine.toggleResearch} />
        </div>
      </section>
    </div>
  );
}

function Toggle({ label, hint, on, onChange }: { label: string; hint: string; on: boolean; onChange: () => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="toggle" onClick={onChange}>
      <span className="toggle__text">
        <span>{label}</span>
        <span className="small muted">{hint}</span>
      </span>
      <span className="toggle__track" aria-hidden>
        <motion.span className="toggle__thumb" layout transition={{ type: "spring", stiffness: 500, damping: 34 }} />
      </span>
    </button>
  );
}

export function ProfileFoot() {
  return (
    <div className="foot">
      <p className="foot__status">StudyLoop is a study tool, not a medical device. It does not diagnose stress or any condition.</p>
    </div>
  );
}
