"use client";

import { getRedirectResult, onAuthStateChanged, signInWithPopup, signInWithRedirect, signOut as fbSignOut, updateProfile, type User } from "firebase/auth";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { exitDemo, isDemo } from "./demo";
import { firebaseConfigured, getFirebaseAuth, googleProvider } from "./firebase";

type Status = "loading" | "signed-in" | "signed-out";

type AuthState = {
  status: Status;
  user: User | null;
  configured: boolean;
  /** Error code from a sign-in that came back through a full-page redirect. */
  redirectError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  /** The photo to show: the one they chose, else their Google photo. */
  photo: string | null;
  /** Their Google account photo (to switch back to). */
  googlePhoto: string | null;
  /** Save a new profile photo URL (null = back to the Google photo). */
  setPhoto: (url: string | null) => Promise<void>;
};

const REDIRECT_INSTEAD = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

const AuthContext = createContext<AuthState | null>(null);

/** The guest a hackathon judge plays in demo mode: no Firebase account behind it. */
const DEMO_USER = {
  uid: "demo",
  displayName: "Hackathon judge",
  email: "Demo mode · nothing is saved",
  photoURL: null,
  providerData: [],
} as unknown as User;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<Status>(firebaseConfigured ? "loading" : "signed-out");
  const [redirectError, setRedirectError] = useState<string | null>(null);
  // Bumped after profile edits: Firebase updates the same User object in place.
  const [, setVersion] = useState(0);

  useEffect(() => {
    if (isDemo()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- demo mode is only knowable on the client
      setUser(DEMO_USER);
      setStatus("signed-in");
      return;
    }
    const auth = getFirebaseAuth();
    if (!auth) return;
    // A redirect sign-in that failed comes back here silently unless we ask for its result.
    getRedirectResult(auth).catch((err: { code?: string }) => setRedirectError(err.code ?? "auth/internal-error"));
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setStatus(u ? "signed-in" : "signed-out");
    });
  }, []);

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuth();
    if (!auth) throw Object.assign(new Error("Sign-in isn't configured"), { code: "app/not-configured" });
    setRedirectError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      // Popups blocked or unsupported here (some phones, strict privacy settings):
      // fall back to a full-page redirect, which comes back through getRedirectResult.
      if (REDIRECT_INSTEAD.has((err as { code?: string }).code ?? "")) {
        await signInWithRedirect(auth, googleProvider);
        return;
      }
      throw err;
    }
  };

  const signOut = async () => {
    if (isDemo()) return exitDemo();
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
    <AuthContext.Provider value={{ status, user, configured: firebaseConfigured, redirectError, signInWithGoogle, signOut, photo, googlePhoto, setPhoto }}>
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
