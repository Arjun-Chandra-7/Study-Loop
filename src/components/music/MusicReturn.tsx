"use client";

import { useEffect } from "react";
import { OPEN_MUSIC } from "@/lib/music/spotifyAuth";
import { engine } from "@/lib/useStudyLoop";

/** Coming back from "Connect Spotify": reopen the Music tab (the import resumes there). */
export function MusicReturn() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem(OPEN_MUSIC) !== null) engine.setTab("music");
    } catch {}
  }, []);
  return null;
}
