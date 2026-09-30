"use client";

import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { firebaseConfigured, getFirebaseAuth, googleProvider } from "./firebase";

type Status = "loading" | "signed-in" | "signed-out";

type AuthState = {
  status: Status;
  user: User | null;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>(firebaseConfigured ? "loading" : "signed-out");

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setStatus(u ? "signed-in" : "signed-out");
    });
  }, []);

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw Object.assign(new Error("Sign-in isn't configured"), { code: "app/not-configured" });
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      // Some browsers block popups outright; fall back to a full-page redirect.
      if ((err as { code?: string }).code === "auth/popup-blocked") {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw err;
    }
  };

  const signOut = async () => {
    const auth = getFirebaseAuth();
    if (auth) await fbSignOut(auth);
  };

  return (
    <AuthContext.Provider value={{ status, user, configured: firebaseConfigured, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** "Arjun Chandra" → "AC"; falls back to the email's first letter. */
export function initials(user: User | null): string {
  const name = user?.displayName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  }
  return (user?.email?.[0] ?? "·").toUpperCase();
}
