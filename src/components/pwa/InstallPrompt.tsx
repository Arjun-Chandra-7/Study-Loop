"use client";

import { useEffect, useState } from "react";
import "./pwa.css";

const DISMISS_KEY = "sl-install-dismissed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const dismissed = () => {
  try {
    return localStorage.getItem(DISMISS_KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * A small, dismissible "install this app" banner. On Android/Chrome it uses the real
 * `beforeinstallprompt` event; on iOS Safari (which has no such event) it shows the
 * Share → "Add to Home Screen" instructions. Never shown once the app is installed.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIOS, setIsIOS] = useState(false);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone || dismissed()) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as Window & { MSStream?: unknown }).MSStream;
    const isSafari = ios && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
    if (isSafari) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time, browser-only platform check on mount
      setIsIOS(true);
      setShow(true);
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // keep it from showing on its own; we show our button
      setDeferred(e as BeforeInstallPromptEvent);
      setShow(true);
    };
    const onInstalled = () => setShow(false);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const close = () => {
    setShow(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {}
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="pwa-install" role="dialog" aria-label="Install StudyLoop">
      <div className="pwa-install__body">
        <span className="pwa-install__icon" aria-hidden>
          {/* Simple home-screen glyph */}
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 3 10v10a1 1 0 0 0 1 1h5v-6h6v6h5a1 1 0 0 0 1-1V10z" />
          </svg>
        </span>
        <div className="pwa-install__text">
          <b>Install StudyLoop</b>
          {isIOS ? (
            <span>
              Tap the Share button <span aria-hidden>⎋</span>, then <b>Add to Home Screen</b>.
            </span>
          ) : (
            <span>Add it to your home screen for a full-screen, app-like experience.</span>
          )}
        </div>
      </div>
      <div className="pwa-install__actions">
        {!isIOS && (
          <button type="button" className="pwa-install__go" onClick={() => void install()}>
            Install
          </button>
        )}
        <button type="button" className="pwa-install__close" onClick={close} aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
