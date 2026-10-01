import "server-only";
import { musicConfig } from "./config";
import { ApiError } from "./http";
import { log } from "./log";

/**
 * Spotify is a metadata source only: titles, artists, artwork, durations. StudyLoop never
 * requests audio from Spotify; the listener supplies audio they have the right to use.
 * Uses the client-credentials flow, so only public playlists/albums/tracks can be read.
 */
const API = "https://api.spotify.com/v1";
const MAX_TRACKS = 100;

export type SpotifyRef = { kind: "playlist" | "album" | "track"; id: string };

export interface ImportedTrack {
  spotifyTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  artworkUrl: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
}

export function parseSpotifyUrl(input: string): SpotifyRef {
  const s = input.trim();
  const uri = /^spotify:(playlist|album|track):([A-Za-z0-9]{22})$/.exec(s);
  if (uri) return { kind: uri[1] as SpotifyRef["kind"], id: uri[2] };
  let url: URL;
  try {
    url = new URL(s);
  } catch {
    throw invalid();
  }
  if (url.protocol !== "https:" || url.hostname !== "open.spotify.com") throw invalid();
  const m = /^\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?(playlist|album|track)\/([A-Za-z0-9]{22})\/?$/i.exec(url.pathname);
  if (!m) throw invalid();
  return { kind: m[1].toLowerCase() as SpotifyRef["kind"], id: m[2] };
}

const invalid = () =>
  new ApiError(400, "invalid_spotify_link", "Paste a Spotify playlist, album or track link (open.spotify.com/…).");

let token: { value: string; expires: number } | null = null;

async function accessToken(): Promise<string> {
  const { clientId, clientSecret } = musicConfig().spotify;
  if (!clientId || !clientSecret) {
    throw new ApiError(503, "spotify_not_configured", "Spotify import isn't set up on this server yet. Add tracks by name instead.");
  }
  if (token && token.expires > Date.now() + 30_000) return token.value;
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    log("spotify_failed", { stage: "token", status: res.status });
    throw new ApiError(502, "spotify_unavailable", "Spotify didn't respond. Try again in a moment.");
  }
  const body = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
  return token.value;
}

/** `userToken`: the listener's own Spotify token (needed for playlist contents). */
async function get<T>(url: string, userToken?: string): Promise<T> {
  const res = await fetch(url.startsWith("http") ? url : `${API}${url}`, {
    headers: { Authorization: `Bearer ${userToken ?? (await accessToken())}` },
    cache: "no-store",
  });
  if (userToken && res.status === 401) {
    throw new ApiError(409, "spotify_login_required", "Your Spotify connection expired. Connect Spotify again to import this playlist.");
  }
  if (res.status === 403) {
    // Spotify refuses developer-mode apps whose owner lacks Premium, for every endpoint.
    const reason = await res.text().catch(() => "");
    if (/premium/i.test(reason)) {
      log("spotify_failed", { stage: "fetch", status: 403, reason: "app_owner_needs_premium" });
      throw new ApiError(503, "spotify_app_blocked", "Spotify import is unavailable right now: Spotify hasn't enabled StudyLoop's access yet. Add tracks by name instead.");
    }
  }
  if (res.status === 404 || res.status === 403 || res.status === 400) {
    throw new ApiError(404, "spotify_not_found", "Spotify couldn't share that link. Only public playlists, albums and tracks can be imported.");
  }
  if (res.status === 429) throw new ApiError(429, "spotify_rate_limited", "Spotify is busy. Try again in a minute.");
  if (!res.ok) {
    log("spotify_failed", { stage: "fetch", status: res.status });
    throw new ApiError(502, "spotify_unavailable", "Spotify didn't respond. Try again in a moment.");
  }
  return (await res.json()) as T;
}

interface SpTrack {
  id: string | null;
  name: string;
  type?: string;
  is_local?: boolean;
  duration_ms?: number;
  artists?: { name: string }[];
  album?: { name: string; images?: { url: string; width?: number }[] };
  external_urls?: { spotify?: string };
}
type Page<T> = { items: T[]; next: string | null };

function mapTrack(t: SpTrack, album?: SpTrack["album"]): ImportedTrack | null {
  if (!t || !t.id || t.is_local || (t.type && t.type !== "track")) return null;
  const a = t.album ?? album;
  // Smallest image that's still crisp at 2x the 48px card thumbnail.
  const images = [...(a?.images ?? [])].sort((x, y) => (x.width ?? 0) - (y.width ?? 0));
  const art = images.find((i) => (i.width ?? 0) >= 96) ?? images.at(-1);
  return {
    spotifyTrackId: t.id,
    title: t.name.slice(0, 200),
    artist: (t.artists ?? []).map((x) => x.name).join(", ").slice(0, 200),
    album: a?.name?.slice(0, 200) ?? null,
    artworkUrl: art?.url && /^https:\/\/i\.scdn\.co\//.test(art.url) ? art.url : null,
    durationMs: t.duration_ms ?? null,
    spotifyUrl: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
  };
}

async function readPlaylistPages(first: string, userToken: string, tracks: ImportedTrack[]) {
  let next: string | null = first;
  while (next && tracks.length < MAX_TRACKS) {
    // Newer responses call the entry `item`, older ones `track`.
    const page: Page<{ item?: SpTrack | null; track?: SpTrack | null }> = await get(next, userToken);
    for (const it of page.items) {
      const t = it.item ?? it.track;
      const m = t && mapTrack(t);
      if (m) tracks.push(m);
    }
    next = page.next;
  }
}

export async function fetchSpotify(ref: SpotifyRef, userToken?: string): Promise<{ name: string | null; tracks: ImportedTrack[] }> {
  if (ref.kind === "track") {
    const t = mapTrack(await get<SpTrack>(`/tracks/${ref.id}`));
    return { name: null, tracks: t ? [t] : [] };
  }
  const tracks: ImportedTrack[] = [];
  if (ref.kind === "album") {
    const al = await get<{ name: string; images?: { url: string; width?: number }[]; tracks: Page<SpTrack> }>(`/albums/${ref.id}`);
    let page: Page<SpTrack> | null = al.tracks;
    while (page && tracks.length < MAX_TRACKS) {
      for (const t of page.items) {
        const m = mapTrack(t, { name: al.name, images: al.images });
        if (m) tracks.push(m);
      }
      page = page.next ? await get<Page<SpTrack>>(page.next) : null;
    }
    return { name: al.name, tracks: tracks.slice(0, MAX_TRACKS) };
  }
  const pl = await get<{ name: string }>(`/playlists/${ref.id}?fields=name`);
  // Spotify only lists a playlist's songs to a signed-in Spotify user, not to an app on its own.
  if (!userToken) {
    throw new ApiError(409, "spotify_login_required", `Connect Spotify to import “${pl.name.slice(0, 80)}”. Spotify only shares a playlist's songs with a signed-in listener.`);
  }
  try {
    await readPlaylistPages(`/playlists/${ref.id}/items?limit=50&additional_types=track`, userToken, tracks);
  } catch (e) {
    // Older API surface: same data under /tracks.
    if (!(e instanceof ApiError) || e.code !== "spotify_not_found") throw e;
    await readPlaylistPages(`/playlists/${ref.id}/tracks?limit=50&additional_types=track`, userToken, tracks).catch((e2) => {
      if (e2 instanceof ApiError && e2.code === "spotify_not_found") {
        throw new ApiError(403, "spotify_playlist_forbidden", "Spotify didn't let StudyLoop read this playlist's songs. Try a playlist you created, or import its albums or tracks.");
      }
      throw e2;
    });
  }
  return { name: pl.name, tracks: tracks.slice(0, MAX_TRACKS) };
}

/** Tests only. */
export function resetSpotifyToken() {
  token = null;
}

/** Public Spotify app id, for the browser's PKCE login (the secret never leaves the server). */
export function spotifyClientId(): string | null {
  return musicConfig().spotify.clientId;
}
