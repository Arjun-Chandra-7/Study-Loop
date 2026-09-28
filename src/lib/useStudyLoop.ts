"use client";

import { useEffect, useSyncExternalStore } from "react";
import { engine } from "./engine";

export function useStudyLoop() {
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, () => engine.serverSnapshot);
}

/** Mount once at the app root. */
export function useEngineLifecycle() {
  useEffect(() => {
    engine.start();
    return () => engine.stop();
  }, []);
}

export { engine };
