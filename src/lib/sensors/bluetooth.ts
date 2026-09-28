import type { ReadingListener, SensorProvider, SensorReading } from "./types";
import { EMPTY_READING } from "./types";

/**
 * Real band over Web Bluetooth.
 *
 * Heart rate and battery use the standard GATT services, so any compliant
 * PPG strap works today. EDA uses a StudyLoop vendor service; the UUIDs
 * below are placeholders until firmware publishes its GATT table.
 */
export const STUDYLOOP_EDA_SERVICE = "7a1f0001-5d3c-4c2a-9f1e-5354554459aa";
export const STUDYLOOP_EDA_CHAR = "7a1f0002-5d3c-4c2a-9f1e-5354554459aa";

// Minimal structural types — avoids a dependency on @types/web-bluetooth.
interface Char extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<Char>;
  readValue(): Promise<DataView>;
}
interface Service {
  getCharacteristic(uuid: string | number): Promise<Char>;
}
interface Server {
  connected: boolean;
  getPrimaryService(uuid: string | number): Promise<Service>;
  disconnect(): void;
}
interface Device extends EventTarget {
  name?: string;
  gatt?: { connect(): Promise<Server> };
}
interface BluetoothLike {
  requestDevice(opts: unknown): Promise<Device>;
}

export function isBluetoothAvailable() {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

export class BluetoothSensorProvider implements SensorProvider {
  readonly kind = "bluetooth" as const;
  private listeners = new Set<ReadingListener>();
  private reading: SensorReading = { ...EMPTY_READING };
  private server: Server | null = null;
  private device: Device | null = null;

  async connect() {
    if (!isBluetoothAvailable()) throw new Error("Web Bluetooth is not available in this browser.");
    const bt = (navigator as unknown as { bluetooth: BluetoothLike }).bluetooth;
    this.patch({ connection: "connecting" });
    try {
      this.device = await bt.requestDevice({
        filters: [{ services: ["heart_rate"] }, { namePrefix: "StudyLoop" }],
        optionalServices: ["battery_service", STUDYLOOP_EDA_SERVICE],
      });
      this.device.addEventListener("gattserverdisconnected", this.onDrop);
      const server = await this.device.gatt!.connect();
      this.server = server;
      this.patch({ connection: "connected", deviceName: this.device.name ?? "Band" });

      const hr = await (await server.getPrimaryService("heart_rate")).getCharacteristic(
        "heart_rate_measurement",
      );
      hr.addEventListener("characteristicvaluechanged", (e) => {
        const v = (e.target as Char).value;
        if (v) this.onHeartRate(v);
      });
      await hr.startNotifications();

      await this.optional(async () => {
        const bat = await (await server.getPrimaryService("battery_service")).getCharacteristic(
          "battery_level",
        );
        this.patch({ battery: (await bat.readValue()).getUint8(0) });
      });

      await this.optional(async () => {
        const eda = await (await server.getPrimaryService(STUDYLOOP_EDA_SERVICE)).getCharacteristic(
          STUDYLOOP_EDA_CHAR,
        );
        eda.addEventListener("characteristicvaluechanged", (e) => {
          const v = (e.target as Char).value;
          if (v) this.patch({ eda: v.getFloat32(0, true) });
        });
        await eda.startNotifications();
      });
    } catch (err) {
      this.patch({ connection: "disconnected" });
      throw err;
    }
  }

  disconnect() {
    this.server?.disconnect();
    this.onDrop();
  }

  subscribe(listener: ReadingListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getReading() {
    return this.reading;
  }

  dispose() {
    this.device?.removeEventListener("gattserverdisconnected", this.onDrop);
    this.disconnect();
    this.listeners.clear();
  }

  private onDrop = () => {
    this.server = null;
    this.patch({ connection: "disconnected", hr: null, eda: null, quality: "none" });
  };

  /** Parses the standard Heart Rate Measurement characteristic (0x2A37). */
  private onHeartRate(v: DataView) {
    const flags = v.getUint8(0);
    const hr = flags & 0x01 ? v.getUint16(1, true) : v.getUint8(1);
    const contactSupported = (flags & 0x04) !== 0;
    const contact = (flags & 0x02) !== 0;
    const quality: SensorReading["quality"] = !contactSupported ? "fair" : contact ? "good" : "poor";
    this.patch({ hr, quality });
  }

  private async optional(fn: () => Promise<void>) {
    try {
      await fn();
    } catch {
      // Service absent on this device — leave the value null.
    }
  }

  private patch(p: Partial<SensorReading>) {
    this.reading = { ...this.reading, t: Date.now(), ...p };
    for (const l of this.listeners) l(this.reading);
  }
}
