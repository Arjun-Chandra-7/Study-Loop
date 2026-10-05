import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify won't redirect to "localhost", so local dev runs at 127.0.0.1; let it load dev assets.
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        // The PWA service worker: served as JS, scoped to the whole site, never cached by the browser
        // so a new deploy's worker is picked up immediately.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
