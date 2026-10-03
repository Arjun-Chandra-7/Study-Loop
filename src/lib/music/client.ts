"use client";

import { getFirebaseAuth } from "../firebase";
import type { VibeProfile } from "./vibe/profile";
import type { SongBeat } from "./vibe/songs";

export class MusicApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

async function idToken(): Promise<string> {
  const user = getFirebaseAuth()?.currentUser;
  if (!user) throw new MusicApiError(401, "unauthorized", "Sign in to start making Loops.");
  return user.getIdToken();
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers, Authorization: `Bearer ${await idToken()}` },
    });
  } catch (e) {
    if (e instanceof MusicApiError) throw e;
    throw new MusicApiError(0, "offline", "Can't reach StudyLoop right now. Check your connection and try again.");
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    throw new MusicApiError(res.status, body?.error?.code ?? "internal", body?.error?.message ?? "That one slipped on our side. Give it another try.");
  }
  return body as T;
}

export interface SavedLoop {
  id: string;
  name: string;
  playlistName: string | null;
  profile: VibeProfile;
  createdAt: number;
}

export const musicApi = {
  importSpotify: (url: string, spotifyToken?: string | null) =>
    call<{ added: number; total: number; playlistName: string | null }>("/api/music/import", {
      method: "POST",
      body: JSON.stringify({ url, ...(spotifyToken ? { spotifyToken } : {}) }),
    }),
  spotifyConfig: () => call<{ clientId: string | null }>("/api/music/spotify/config"),
  playlists: () => call<{ playlists: { name: string; count: number }[] }>("/api/music/vibe?list=1").then((r) => r.playlists),
  vibe: (playlist: string | null, refresh = false) =>
    call<{ profile: VibeProfile; source: "ai" | "basic"; playlistName: string | null; trackCount: number }>(
      `/api/music/vibe?${new URLSearchParams({ ...(playlist ? { playlist } : {}), ...(refresh ? { refresh: "1" } : {}) })}`,
    ),
  songs: (songs: string[]) => call<{ songs: SongBeat[] }>("/api/music/songs", { method: "POST", body: JSON.stringify({ songs }) }).then((r) => r.songs),
  loops: () => call<{ loops: SavedLoop[] }>("/api/music/loops").then((r) => r.loops),
  saveLoop: (loop: { name: string; playlistName: string | null; profile: VibeProfile }) =>
    call<{ loop: SavedLoop }>("/api/music/loops", { method: "POST", body: JSON.stringify(loop) }).then((r) => r.loop),
  renameLoop: (id: string, name: string) =>
    call<{ loop: SavedLoop }>(`/api/music/loops/${id}`, { method: "PATCH", body: JSON.stringify({ name }) }).then((r) => r.loop),
  deleteLoop: (id: string) => call<null>(`/api/music/loops/${id}`, { method: "DELETE" }),
};
