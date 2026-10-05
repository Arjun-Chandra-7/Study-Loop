"use client";

import { Avatar } from "../ui/Avatar";
import { useStudyLoop } from "@/lib/useStudyLoop";

const CONN_LABEL = { connected: "Band 1", connecting: "Pairing…", disconnected: "No band" } as const;

/** Lives in the top-right notch: link · battery · account. */
export function StatusCapsule() {
  const { reading } = useStudyLoop();
  const battery = reading.battery;
  const low = battery != null && battery <= 15;
  const status =
    reading.connection === "connected"
      ? `Band connected${battery != null ? `, battery ${battery} percent` : ""}`
      : reading.connection === "connecting"
        ? "Connecting to band"
        : "Band disconnected";

  return (
    <div className="status-capsule" role="status" aria-label={status}>
      <span className={`link-dot link-dot--${reading.connection}`} aria-hidden />
      <span className="status-capsule__name">{CONN_LABEL[reading.connection]}</span>
      <span className={`battery ${low ? "battery--low" : ""}`} aria-hidden>
        <span className="battery__track">
          <span
            className="battery__fill"
            style={{ transform: `scaleX(${reading.connection === "connected" && battery != null ? battery / 100 : 0})` }}
          />
        </span>
        <span className="battery__num">
          {reading.connection === "connected" && battery != null ? `${battery}%` : "—"}
        </span>
      </span>
      <Avatar size="sm" />
    </div>
  );
}
