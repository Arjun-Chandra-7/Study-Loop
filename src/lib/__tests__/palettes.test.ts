// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { PALETTES, PREFS_KEY, prePaintScript } from "../palettes";

describe("pre-paint palette script", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("style");
    delete document.documentElement.dataset.palette;
  });

  it("applies the saved palette's colours to <html> before React loads", () => {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ palette: "lagoon" }));
    new Function(prePaintScript())();
    const root = document.documentElement;
    expect(root.dataset.palette).toBe("lagoon");
    expect(root.style.getPropertyValue("--m-500")).toBe(PALETTES.lagoon.measured);
    expect(root.style.getPropertyValue("--action-rgb")).toBe("217 164 65");
  });

  it("leaves the default alone when nothing (or junk) is saved", () => {
    new Function(prePaintScript())();
    localStorage.setItem(PREFS_KEY, "{not json");
    new Function(prePaintScript())();
    expect(document.documentElement.dataset.palette).toBeUndefined();
    expect(document.documentElement.style.getPropertyValue("--m-500")).toBe("");
  });
});
