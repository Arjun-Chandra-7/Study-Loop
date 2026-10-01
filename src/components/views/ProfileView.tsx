"use client";

import { motion } from "motion/react";
import { useRef, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/lib/auth";
import { uploadProfilePhoto } from "@/lib/profilePhoto";
import { isBluetoothAvailable } from "@/lib/sensors/bluetooth";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Avatar } from "../ui/Avatar";
import { BandSpec } from "../ui/BandSpec";
import { Icon } from "../ui/Icon";

const noopSubscribe = () => () => {};

export function ProfileView() {
  const s = useStudyLoop();
  const { user, signOut, photo, googlePhoto, setPhoto } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoNote, setPhotoNote] = useState<string | null>(null);
  const customPhoto = Boolean(photo && photo !== googlePhoto);

  const changePhoto = async (file: File) => {
    setPhotoBusy(true);
    setPhotoNote(null);
    try {
      await setPhoto(await uploadProfilePhoto(file));
      setPhotoNote("Looking good. Your new photo is saved.");
    } catch (e) {
      setPhotoNote(e instanceof Error ? e.message : "Couldn't save your photo. Try again.");
    } finally {
      setPhotoBusy(false);
    }
  };
  const r = s.reading;
  const bt = useSyncExternalStore(noopSubscribe, isBluetoothAvailable, () => false);

  const connLabel = { connected: "Connected", connecting: "Connecting…", disconnected: "Disconnected" }[r.connection];

  return (
    <div className="profile">
      <section className="profile__me" aria-label="You">
        <Avatar size="lg" />
        <div className="profile__me-text">
          <p className="h-section">{user?.displayName ?? "Welcome back"}</p>
          <p className="small muted">{user?.email}</p>
          <div className="btn-row">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void changePhoto(f);
              }}
            />
            <button type="button" className="btn btn--ghost btn--sm" disabled={photoBusy} onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={14} />
              {photoBusy ? "Saving…" : "Change photo"}
            </button>
            {customPhoto && googlePhoto && (
              <button type="button" className="btn btn--ghost btn--sm" disabled={photoBusy} onClick={() => void setPhoto(null)}>
                Use my Google photo
              </button>
            )}
            <button type="button" className="btn btn--ghost btn--sm" onClick={signOut}>
              Sign out
            </button>
          </div>
          {photoNote && (
            <p className="small muted" role="status">
              {photoNote}
            </p>
          )}
        </div>
        <div className="profile__render">
          <BandSpec live={r.connection === "connected"} />
        </div>
      </section>

      <section className="profile__band">
        <div className="profile__facts">
          <p className="eyebrow">
            <span className="eyebrow__rule" aria-hidden />
            Your band
          </p>
          <h2 className="h-section">
            {r.deviceName ?? "StudyLoop SL-01"}
            {s.providerKind === "mock" && r.connection !== "disconnected" && <span className="chip chip--outline">Simulated</span>}
          </h2>
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
              <dt>Connection</dt>
              <dd>Bluetooth LE</dd>
            </div>
          </dl>
          <div className="btn-row">
            <button
              type="button"
              className="btn btn--solid btn--sm"
              onClick={engine.toggleConnection}
              title="Testing build: connects a simulated SL-01 with live heart rate and EDA"
            >
              <Icon name={r.connection === "disconnected" ? "band" : "unlink"} size={16} />
              {r.connection === "disconnected" ? "Pair your band" : "Disconnect"}
            </button>
            {bt && r.connection === "disconnected" && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void engine.connectBluetooth()}>
                <Icon name="bluetooth" size={16} />
                Use a real band
              </button>
            )}
          </div>
          {s.providerError && (
            <p className="small notice notice--inline" role="alert">
              <Icon name="alert" size={14} /> {s.providerError}
            </p>
          )}
        </div>
      </section>

      <section className="profile__settings">
        <div className="toggles">
          <Toggle label="Quiet mode" hint="Dims everything except the timer and state." on={s.quiet} onChange={engine.toggleQuiet} />
          <Toggle label="Research layer" hint="Shows experimental context in orange." on={s.research} onChange={engine.toggleResearch} />
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
