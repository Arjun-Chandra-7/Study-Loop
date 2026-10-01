"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { useAuth } from "@/lib/auth";

/** What went wrong and how to fix it — next to the button, never a bare "Oops". */
function describe(code: string | undefined): string {
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "The Google window closed before we finished. Hit the button whenever you’re ready.";
    case "auth/network-request-failed":
      return "Couldn’t reach Google. Check your connection and try again.";
    case "auth/unauthorized-domain":
      return "This address isn’t allowed to sign in yet. Add it in Firebase under Authentication → Settings → Authorized domains.";
    case "auth/operation-not-allowed":
      return "Google sign-in is turned off for this project. Enable it in Firebase under Authentication → Sign-in method.";
    case "app/not-configured":
      return "Sign-in isn’t set up on this build: the Firebase keys are missing.";
    default:
      return "Google sign-in didn’t quite finish. Let’s try that again.";
  }
}

function GoogleMark() {
  return (
    <span className="g-mark" aria-hidden>
      <svg viewBox="0 0 48 48" width="18" height="18">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
      </svg>
    </span>
  );
}

export default function LoginPage() {
  const { status, configured, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(configured ? null : describe("app/not-configured"));

  useEffect(() => {
    if (status === "signed-in") router.replace("/");
  }, [status, router]);

  // Firebase can take ~12s to report a closed popup. When focus comes back to this
  // page and nobody signed in, hand the button back right away; a sign-in that
  // completes later still redirects through the auth state above.
  useEffect(() => {
    if (!pending) return;
    let timer: number | undefined;
    const onFocus = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setPending(false), 1500);
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.clearTimeout(timer);
    };
  }, [pending]);

  const start = async () => {
    setError(null);
    setPending(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(describe((err as { code?: string }).code));
      setPending(false);
    }
  };

  const busy = pending || status === "signed-in";

  return (
    <main className="login">
      <div className="login__visual">
        <Image src="/media/studyloop-band.png" alt="" fill sizes="(max-width: 759px) 100vw, 55vw" preload className="login__img" />
        <div className="login__logo">
          <Logo />
        </div>
        <ul className="login__facts" aria-label="What the band measures">
          <li>
            <Icon name="heart" size={16} />
            <span>
              <b>PPG</b> heart rate
            </span>
          </li>
          <li>
            <Icon name="eda" size={16} />
            <span>
              <b>EDA</b> skin conductance
            </span>
          </li>
          <li>
            <Icon name="band" size={16} />
            <span>
              <b>One button</b> no screen
            </span>
          </li>
        </ul>
      </div>

      <div className="login__panel">
        <div className="login__body">
          <p className="eyebrow">
            <span className="eyebrow__rule" aria-hidden />
            Sign in
          </p>
          <h1 className="display login__title">Study with a signal.</h1>
          <p className="serif login__serif">Your sessions, under your name.</p>

          <div className="login__card">
            <button
              type="button"
              className="btn btn--primary btn--lg login__cta"
              onClick={start}
              disabled={busy || !configured}
              aria-describedby={error ? "login-error" : undefined}
            >
              <GoogleMark />
              {busy ? "Opening Google…" : "Continue with Google"}
            </button>
            <p id="login-error" className="small login__error" role="alert">
              {error}
            </p>
            <ul className="login__notes">
              <li>
                <Icon name="user" size={16} />
                StudyLoop reads only your name, email and profile photo.
              </li>
              <li>
                <Icon name="baseline" size={16} />
                Sessions, baselines and insights stay under your account.
              </li>
              <li>
                <Icon name="check" size={16} />
                Sign out any time from your profile.
              </li>
            </ul>
          </div>
        </div>
        <p className="small muted login__fine">StudyLoop is a study tool, not a medical device.</p>
      </div>
    </main>
  );
}
