"use client";

import { onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, updateProfile, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { firebaseConfigured, getFirebaseAuth, googleProvider } from "./firebase";

type Status = "loading" | "signed-in" | "signed-out";

type AuthState = {
  status: Status;
  user: User | null;
  configured: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** The photo to show: the one they chose, else their Google photo. */
  photo: string | null;
  /** Their Google account photo (to switch back to). */
  googlePhoto: string | null;
  /** Save a new profile photo URL (null = back to the Google photo). */
  setPhoto: (url: string | null) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>(firebaseConfigured ? "loading" : "signed-out");
  // Bumped after profile edits: Firebase updates the same User object in place.
  const [, setVersion] = useState(0);

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

  const googlePhoto = user?.providerData.find((p) => p.providerId === "google.com")?.photoURL ?? null;
  const photo = user?.photoURL ?? googlePhoto;

  const setPhoto = async (url: string | null) => {
    const current = getFirebaseAuth()?.currentUser;
    if (!current) return;
    await updateProfile(current, { photoURL: url ?? googlePhoto });
    setVersion((v) => v + 1);
  };

  return (
    <AuthContext.Provider value={{ status, user, configured: firebaseConfigured, signInWithGoogle, signOut, photo, googlePhoto, setPhoto }}>
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
