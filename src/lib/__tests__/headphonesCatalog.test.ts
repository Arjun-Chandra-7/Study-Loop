import { describe, expect, it } from "vitest";
import { displayName, identify } from "../headphones/catalog";

const id = (label: string) => identify(label)?.id ?? null;

describe("identify", () => {
  it("matches named Bluetooth models", () => {
    expect(id("boAt Rockerz 460")).toBe("boat-rockerz-4xx");
    expect(id("Default - WH-1000XM4 (Bluetooth)")).toBe("sony-wh1000xm");
    expect(id("Headphones (boAt Rockerz 450)")).toBe("boat-rockerz-4xx");
    expect(id("AirPods Pro")).toBe("airpods-pro");
    expect(id("AirPods Max")).toBe("airpods-max");
  });

  it("treats USB-C audio as wired earphones (Linux / PipeWire labels)", () => {
    expect(id("USB-Audio Analog Stereo")).toBe("generic-wired-usbc");
    expect(id("USB-Audio Mono")).toBe("generic-wired-usbc");
    expect(id("USB-C to 3.5mm Headphone Jack Adapter")).toBe("generic-wired-usbc");
    expect(id("USB Audio DAC (12d1:3a06)")).toBe("generic-wired-usbc");
  });

  it("treats a sound card's headphone port as jack earphones", () => {
    expect(id("Headphones (Realtek(R) Audio)")).toBe("generic-wired-jack");
    expect(id("External Headphones")).toBe("generic-wired-jack");
  });

  it("ignores speakers and built-in outputs", () => {
    expect(id("Ryzen HD Audio Controller Analog Stereo")).toBeNull();
    expect(id("Speakers (Realtek(R) Audio)")).toBeNull();
    expect(id("MacBook Pro Speakers")).toBeNull();
    expect(id("HDMI / DisplayPort 1 Output")).toBeNull();
  });

  it("falls back to a generic set for unknown Bluetooth names", () => {
    expect(id("Headphones (Soundcore Life Q30)")).toBe("generic-overear");
    expect(id("Galaxy Buds2 Pro")).toBe("galaxy-buds");
  });
});

describe("displayName", () => {
  it("replaces meaningless OS labels for wired sets", () => {
    expect(displayName("USB-Audio Analog", identify("USB-Audio Analog Stereo")!)).toBe("USB-C earphones");
    expect(displayName("External Headphones", identify("External Headphones")!)).toBe("Wired earphones");
  });

  it("keeps real product names", () => {
    expect(displayName("boAt Rockerz 460", identify("boAt Rockerz 460")!)).toBe("boAt Rockerz 460");
  });
});
