"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

/** Renders the app only for a signed-in user; everyone else goes to /login. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signed-out") router.replace("/login");
  }, [status, router]);

  if (status !== "signed-in") {
    return (
      <p className="sr-only" role="status">
        {status === "loading" ? "Checking your sign-in…" : "Redirecting to sign in…"}
      </p>
    );
  }
  return <>{children}</>;
}
