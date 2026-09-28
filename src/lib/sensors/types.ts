export type ConnectionState = "disconnected" | "connecting" | "connected";
export type SignalQuality = "good" | "fair" | "poor" | "none";

/** One live reading from the band. Values are null when unavailable. */
export interface SensorReading {
  t: number;
  connection: ConnectionState;
  /** 0–100 */
  battery: number | null;
  /** beats per minute, from PPG */
  hr: number | null;
  /** skin conductance in microsiemens, from EDA electrodes */
  eda: number | null;
  quality: SignalQuality;
  deviceName: string | null;
}

export type ReadingListener = (reading: SensorReading) => void;

/**
 * The only surface the UI talks to. The mock and the real BLE band both
 * implement it, so hardware can replace simulation without UI changes.
 */
export interface SensorProvider {
  readonly kind: "mock" | "bluetooth";
  connect(): Promise<void>;
  disconnect(): void;
  subscribe(listener: ReadingListener): () => void;
  getReading(): SensorReading;
  dispose(): void;
}

export type MockScenario =
  | "normal"
  | "elevated"
  | "recovery"
  | "poorSignal"
  | "lowBattery"
  | "disconnected";

export const EMPTY_READING: SensorReading = {
  t: 0,
  connection: "disconnected",
  battery: null,
  hr: null,
  eda: null,
  quality: "none",
  deviceName: null,
};
