// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ demo: false, recovery: null as object | null }));
vi.mock("@/lib/intro", () => ({ useIntroDone: () => true }));
vi.mock("@/lib/demo", () => ({ isDemo: () => state.demo, startDemo: vi.fn() }));
vi.mock("@/lib/useStudyLoop", () => ({ useStudyLoop: () => ({ recovery: state.recovery }) }));

const { FirstRun } = await import("../FirstRun");

beforeEach(() => {
  localStorage.clear();
  state.demo = false;
  state.recovery = null;
  window.matchMedia = ((q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof matchMedia;
});
afterEach(cleanup);

describe("FirstRun", () => {
  it("explains StudyLoop once to a first-time visitor", async () => {
    render(<FirstRun />);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Wear")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /got it/i }));
    expect(localStorage.getItem("sl-seen-how")).toBe("1");
    cleanup();
    render(<FirstRun />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stays out of the demo tour and the crash prompt", () => {
    state.demo = true;
    render(<FirstRun />);
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    state.demo = false;
    state.recovery = {};
    render(<FirstRun />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
