import path from "node:path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(root, "src"),
      "server-only": path.resolve(root, "src/lib/music/__tests__/server-only-stub.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    environment: "node",
    testTimeout: 30_000,
    // Each database-backed file starts its own in-process Postgres; under a full parallel run that can outlast the 10s default.
    hookTimeout: 30_000,
    env: { MUSIC_LOG: "off" },
  },
});
