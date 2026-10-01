import type { Metadata, Viewport } from "next";
import { Instrument_Serif, Michroma } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import "./globals.css";

// Editorial accent — taglines, research statements, transitions.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
  style: ["normal", "italic"],
});

// Stand-in for ASTROZ until the licensed file is dropped into /public/fonts.
const michroma = Michroma({
  variable: "--font-display-fallback",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://study-loop-alpha.vercel.app"),
  title: "StudyLoop — Focus, measured differently",
  description:
    "A study wearable and session interface that shows how your physiology changes while you learn.",
  openGraph: {
    title: "StudyLoop — Focus, measured differently",
    description: "A study wearable that shows how your heart rate and skin conductance change while you learn.",
    siteName: "StudyLoop",
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: "#090909",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" className={`${instrumentSerif.variable} ${michroma.variable}`}>
      <head>
        {/* Satoshi is distributed by Fontshare, not Google Fonts. */}
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700&display=swap"
        />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
