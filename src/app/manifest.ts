import type { MetadataRoute } from "next";

/**
 * Web app manifest: makes StudyLoop installable to a phone's home screen as a standalone app
 * (its own icon, full-screen, no browser chrome). Colours match the app's warm near-black theme.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "StudyLoop",
    short_name: "StudyLoop",
    description: "A study wearable and session interface that shows how your body responds while you learn.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0c0b08",
    theme_color: "#0c0b08",
    categories: ["education", "health", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
