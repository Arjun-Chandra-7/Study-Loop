"use client";

/**
 * "Connect Spotify": Authorization Code with PKCE, entirely in the browser (no client secret).
 * Spotify only lists a playlist's songs to a signed-in Spotify user, so playlist import sends the
 * listener's own access token with the import request; the server uses it once and never stores it.
 * Tokens live in sessionStorage, so they end with the browser tab.
 * https://developer.spotify.com/documentation/web-api/tutorials/code-pkce-flow
 */
const KEY = "studyloop:spotify";
const PENDING = "studyloop:spotify-pending";
export const OPEN_MUSIC = "studyloop:open-music";
const SCOPES = "playlist-read-private playlist-read-collaborative";

interface Tokens {
  access: string;
  refresh: string | null;
  expires: number;
  clientId: string;
}
interface Pending {
  verifier: string;
  state: string;
  clientId: string;
  importUrl: string | null;
}

const store = {
  get<T>(k: string): T | null {
    try {
      return JSON.parse(sessionStorage.getItem(k) ?? "null") as T | null;
    } catch {
      return null;
    }
  },
  set(k: string, v: unknown) {
    try {
      sessionStorage.setItem(k, JSON.stringify(v));
    } catch {}
  },
  drop(k: string) {
    try {
      sessionStorage.removeItem(k);
    } catch {}
  },
};

/** Spotify rejects "localhost" redirect URIs; locally, open the app at http://127.0.0.1:<port>. */
export const redirectUri = () => `${location.origin}/music/spotify-callback`;

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const randomString = (n: number) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function startSpotifyLogin(clientId: string, importUrl: string | null) {
  const verifier = randomString(48);
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const state = randomString(16);
  store.set(PENDING, { verifier, state, clientId, importUrl } satisfies Pending);
  const q = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    scope: SCOPES,
    redirect_uri: redirectUri(),
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });
  location.assign(`https://accounts.spotify.com/authorize?${q}`);
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string; expires_in: number }> {
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  if (!res.ok) throw new Error(`Spotify token request failed (${res.status})`);
  return res.json();
}

/** Finish the redirect. Returns the playlist link to import next, if the login started from one. */
export async function completeSpotifyLogin(search: string): Promise<{ importUrl: string | null }> {
  const params = new URLSearchParams(search);
  const pending = store.get<Pending>(PENDING);
  store.drop(PENDING);
  if (params.get("error")) throw new Error(params.get("error") === "access_denied" ? "Spotify connection was cancelled." : "Spotify didn't connect.");
  const code = params.get("code");
  if (!pending || !code || params.get("state") !== pending.state) throw new Error("This Spotify sign-in link is no longer valid. Try connecting again.");
  const t = await tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: pending.clientId,
    code_verifier: pending.verifier,
  });
  store.set(KEY, { access: t.access_token, refresh: t.refresh_token ?? null, expires: Date.now() + t.expires_in * 1000, clientId: pending.clientId } satisfies Tokens);
  return { importUrl: pending.importUrl };
}

/** A usable access token, refreshed if needed; null if the listener hasn't connected Spotify. */
export async function spotifyToken(): Promise<string | null> {
  const t = store.get<Tokens>(KEY);
  if (!t) return null;
  if (t.expires > Date.now() + 60_000) return t.access;
  if (!t.refresh) return null;
  try {
    const r = await tokenRequest({ grant_type: "refresh_token", refresh_token: t.refresh, client_id: t.clientId });
    store.set(KEY, { ...t, access: r.access_token, refresh: r.refresh_token ?? t.refresh, expires: Date.now() + r.expires_in * 1000 });
    return r.access_token;
  } catch {
    store.drop(KEY);
    return null;
  }
}

export const spotifyConnected = () => Boolean(store.get<Tokens>(KEY));
export const disconnectSpotify = () => store.drop(KEY);

/** After the Spotify redirect: land back on the Music tab and resume the import. */
export function takePendingImport(): string | null {
  const v = store.get<string>(OPEN_MUSIC);
  store.drop(OPEN_MUSIC);
  return v;
}
export const rememberPendingImport = (url: string | null) => store.set(OPEN_MUSIC, url ?? "");
