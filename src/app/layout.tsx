import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/lib/auth";
import { prePaintScript } from "@/lib/palettes";
import "./globals.css";

// One family for everything: GitHub's Mona Sans, variable in weight, width and optical size.
// Interface text sits at normal width; headings use the expanded width (see tokens.css).
// Self-hosted from GitHub's own release (SIL OFL, see fonts/OFL.txt): the Google Fonts build
// mis-spaces some letters at text sizes ("o nly"), and lacks the optical-size axis.
const mona = localFont({
  src: "./fonts/MonaSansVF.woff2",
  variable: "--font-mona",
  weight: "200 900",
  style: "normal",
  display: "swap",
  declarations: [{ prop: "font-stretch", value: "75% 125%" }],
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
