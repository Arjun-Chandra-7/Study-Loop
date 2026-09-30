import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in — StudyLoop",
  description: "Sign in with Google to start a StudyLoop session.",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
