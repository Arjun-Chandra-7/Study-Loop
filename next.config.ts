import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Spotify won't redirect to "localhost", so local dev runs at 127.0.0.1; let it load dev assets.
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
