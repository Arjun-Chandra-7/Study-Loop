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
/** A token request already on its way, shared by parallel track reads. */
let pending: Promise<string> | null = null;

async function accessToken(): Promise<string> {
  const { clientId, clientSecret } = musicConfig().spotify;
  if (!clientId || !clientSecret) {
    throw new ApiError(503, "spotify_not_configured", "Spotify import isn't set up on this server yet. Add tracks by name instead.");
  }
  if (token && token.expires > Date.now() + 30_000) return token.value;
  pending ??= newAccessToken(clientId, clientSecret).finally(() => (pending = null));
  return pending;
}

async function newAccessToken(clientId: string, clientSecret: string): Promise<string> {
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
    if (userToken && /not be registered|developer\.spotify\.com\/dashboard|user may not/i.test(reason)) {
      // Development mode: only the app's few allow-listed Spotify accounts may sign in.
      log("spotify_failed", { stage: "fetch", status: 403, reason: "user_not_allowlisted" });
      throw new ApiError(
        403,
        "spotify_not_allowlisted",
        "Spotify only lets a few approved accounts connect to StudyLoop. Open the playlist in the Spotify app, select all songs (Ctrl/Cmd+A), copy (Ctrl/Cmd+C) and paste them here instead.",
      );
    }
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
    const embedded = await fetchEmbed(ref).catch(() => null);
    if (embedded?.tracks.length) return embedded;
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
  // Spotify's public player page lists the songs to anyone, signed in or not, on any device.
  const embedded = await fetchEmbed(ref).catch((e) => {
    log("spotify_failed", { stage: "embed", message: e instanceof Error ? e.message.slice(0, 120) : "unknown" });
    return null;
  });
  if (embedded?.tracks.length) return embedded;
  const pl = await get<{ name: string }>(`/playlists/${ref.id}?fields=name`);
  // Spotify only lists a playlist's songs to a signed-in Spotify user, not to an app on its own.
  if (!userToken) {
    throw new ApiError(
      409,
      "spotify_login_required",
      `Spotify only shares “${pl.name.slice(0, 80)}” with approved accounts. Open it in the Spotify app, select all songs (Ctrl/Cmd+A), copy (Ctrl/Cmd+C) and paste them here.`,
    );
  }
  try {
    await readPlaylistPages(`/playlists/${ref.id}/items?limit=50&additional_types=track`, userToken, tracks);
  } catch (e) {
    // Older API surface: same data under /tracks.
    if (!(e instanceof ApiError) || e.code !== "spotify_not_found") throw e;
    await readPlaylistPages(`/playlists/${ref.id}/tracks?limit=50&additional_types=track`, userToken, tracks).catch((e2) => {
      if (e2 instanceof ApiError && e2.code === "spotify_not_found") {
        throw new ApiError(
          403,
          "spotify_playlist_forbidden",
          "Spotify only lets StudyLoop read playlists you made yourself. Open this one in the Spotify app, select all songs (Ctrl/Cmd+A), copy (Ctrl/Cmd+C) and paste them here.",
        );
      }
      throw e2;
    });
  }
  return { name: pl.name, tracks: tracks.slice(0, MAX_TRACKS) };
}

interface EmbedTrack {
  uri?: string;
  title?: string;
  subtitle?: string;
  duration?: number;
  entityType?: string;
}
interface EmbedEntity {
  name?: string;
  coverArt?: { sources?: { url: string; width?: number | null }[] } | null;
  trackList?: EmbedTrack[];
}

/**
 * A playlist or album as Spotify's public embed player shows it (up to 100 songs). Spotify's API
 * only lists a playlist's songs to a few approved, signed-in accounts; the player shows them to
 * everyone. Each song is then read through the API for its artwork, where Spotify allows it.
 */
async function fetchEmbed(ref: SpotifyRef): Promise<{ name: string | null; tracks: ImportedTrack[] } | null> {
  const res = await fetch(`https://open.spotify.com/embed/${ref.kind}/${ref.id}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StudyLoop)", "Accept-Language": "en" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (res.status === 404) throw new ApiError(404, "spotify_not_found", "Spotify couldn't find that link. Check it's a public playlist, album or song.");
  if (!res.ok) throw new Error(`embed ${res.status}`);
  const html = await res.text();
  const json = /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (!json) throw new Error("embed without data");
  const entity = (JSON.parse(json) as { props?: { pageProps?: { state?: { data?: { entity?: EmbedEntity } } } } }).props?.pageProps?.state?.data?.entity;
  if (!entity) throw new Error("embed without entity");
  const cover = entity.coverArt?.sources?.find((s) => /^https:\/\/i\.scdn\.co\//.test(s.url))?.url ?? null;
  const basic: ImportedTrack[] = [];
  for (const t of entity.trackList ?? []) {
    const id = /^spotify:track:([A-Za-z0-9]{22})$/.exec(t.uri ?? "")?.[1];
    if (!id || !t.title || (t.entityType && t.entityType !== "track")) continue;
    basic.push({
      spotifyTrackId: id,
      title: t.title.slice(0, 200),
      artist: (t.subtitle ?? "").replace(/\s+/g, " ").trim().slice(0, 200),
      album: ref.kind === "album" ? (entity.name ?? null) : null,
      artworkUrl: cover,
      durationMs: t.duration ?? null,
      spotifyUrl: `https://open.spotify.com/track/${id}`,
    });
    if (basic.length >= MAX_TRACKS) break;
  }
  // Song artwork and albums, best effort: the songs are already known without them.
  const full = await fetchTracks(basic.map((t) => t.spotifyTrackId)).catch(() => []);
  const byId = new Map(full.map((t) => [t.spotifyTrackId, t]));
  const tracks = basic.map((t) => {
    const f = byId.get(t.spotifyTrackId);
    return f ? { ...t, album: f.album ?? t.album, artworkUrl: f.artworkUrl ?? t.artworkUrl } : t;
  });
  return { name: entity.name?.slice(0, 120) ?? null, tracks };
}

const TRACK_LINK =/(?:open\.spotify\.com\/(?:intl-[a-z]{2}(?:-[a-z]{2})?\/)?track\/|spotify:track:)([A-Za-z0-9]{22})/g;
const ANY_LINK = /(?:https?:\/\/\S+|spotify:[a-z]+:[A-Za-z0-9]+)/g;

/**
 * A pasted list of songs: Spotify track links (what the Spotify app copies when you select songs
 * and press Ctrl/Cmd+C, one link per song, sometimes run together), and/or "Title — Artist" lines.
 */
export function parseSongList(text: string): { trackIds: string[]; names: string[] } {
  const trackIds = [...new Set([...text.matchAll(TRACK_LINK)].map((m) => m[1]))];
  const names = [
    ...new Set(
      text
        .replace(ANY_LINK, "\n")
        .split(/\r?\n/)
        .map((l) =>
          l
            .replace(/^\s*(?:\d{1,3}[.)]|[-*•])\s+/, "") // "1. ", "- ", "• "
            .replace(/\s+/g, " ")
            .trim(),
        )
        .filter((l) => l.length >= 2 && l.length <= 200 && /\p{L}/u.test(l)),
    ),
  ];
  return { trackIds, names };
}

/**
 * Tracks by id, read one by one with the app's own credentials: no listener sign-in, so it works
 * for everyone. (Spotify removed the batch /tracks endpoint for development-mode apps.)
 */
export async function fetchTracks(ids: string[]): Promise<ImportedTrack[]> {
  const out: (ImportedTrack | null)[] = new Array(ids.length).fill(null);
  let next = 0;
  const worker = async () => {
    while (next < ids.length) {
      const i = next++;
      try {
        out[i] = mapTrack(await get<SpTrack>(`/tracks/${ids[i]}`));
      } catch (e) {
        // One missing or region-locked song shouldn't sink the whole list.
        if (!(e instanceof ApiError) || e.code !== "spotify_not_found") throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, ids.length) }, worker));
  return out.filter((t): t is ImportedTrack => t !== null);
}

/** Tests only. */
export function resetSpotifyToken() {
  pending = null;
  token = null;
}

/** Public Spotify app id, for the browser's PKCE login (the secret never leaves the server). */
export function spotifyClientId(): string | null {
  return musicConfig().spotify.clientId;
}
