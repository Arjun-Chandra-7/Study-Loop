import type { Metadata, Viewport } from "next";
import { Mona_Sans } from "next/font/google";
import { AuthProvider } from "@/lib/auth";
import { prePaintScript } from "@/lib/palettes";
import "./globals.css";

// One family for everything: GitHub's Mona Sans, variable in weight and width.
// Interface text sits at normal width; headings use the expanded width (see tokens.css).
const mona = Mona_Sans({
  variable: "--font-mona",
  subsets: ["latin"],
  axes: ["wdth"],
  display: "swap",
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
  themeColor: "#0c0b08",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning className={mona.variable}>
      <head>
        {/* Apply the saved colour palette before first paint. */}
        <script dangerouslySetInnerHTML={{ __html: prePaintScript() }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
