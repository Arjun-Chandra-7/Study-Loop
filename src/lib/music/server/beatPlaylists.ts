import "server-only";
import type { BeatPlaylist, SongBeat } from "../vibe/songs";
import { newId, q } from "./db";
import { ApiError } from "./http";
import { importTracks } from "./library";
import { log } from "./log";
import { readSongs } from "./songs";
import { fetchSpotify, parseSpotifyUrl, type SpotifyRef } from "./spotify";

const MAX_PLAYLISTS = 50;
const ID = /^[a-f0-9]{32}$/;

interface Row {
  id: string;
  name: string;
  source_url: string | null;
  artwork_url: string | null;
  songs_json: string;
  created_at: number;
}
const toPlaylist = (r: Row): BeatPlaylist => ({
  id: r.id,
  name: r.name,
  sourceUrl: r.source_url,
  artworkUrl: r.artwork_url,
  songs: JSON.parse(r.songs_json),
  createdAt: r.created_at,
});

const canonical = (ref: SpotifyRef) => `https://open.spotify.com/${ref.kind}/${ref.id}`;

/**
 * Paste a Spotify link, get it back as beats: every song is found, its tracks go into the library,
 * each song is read for its beat, and the result is saved as a playlist in StudyLoop. Importing the
 * same link again refreshes that playlist instead of making a second one.
 */
export async function createFromSpotify(uid: string, url: unknown, spotifyToken?: string): Promise<{ playlist: BeatPlaylist; updated: boolean }> {
  if (typeof url !== "string") throw new ApiError(400, "invalid_spotify_link", "Paste a Spotify link.");
  const ref = parseSpotifyUrl(url);
  const { name, tracks } = await fetchSpotify(ref, spotifyToken);
  if (!tracks.length) throw new ApiError(404, "spotify_empty", "That link has no songs StudyLoop can turn into beats.");
  await importTracks(uid, name, tracks);

  const read = await readSongs(tracks.map((t) => (t.artist ? `${t.title} — ${t.artist}` : t.title)));
  // Keep Spotify's own names and artwork: the model only adds how each song is built.
  const songs: SongBeat[] = read.map((s, i) => ({ ...s, title: tracks[i].title, artist: tracks[i].artist, artworkUrl: tracks[i].artworkUrl, spotifyUrl: tracks[i].spotifyUrl }));
  const title = (name ?? (tracks.length === 1 ? tracks[0].title : "Imported songs")).slice(0, 120);
  const source = canonical(ref);
  const now = Date.now();

  const existing = await q.get<{ id: string }>("SELECT id FROM music_beat_playlists WHERE user_id = ? AND source_url = ?", uid, source);
  if (!existing) {
    const count = (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM music_beat_playlists WHERE user_id = ?", uid))!.n;
    if (count >= MAX_PLAYLISTS) throw new ApiError(409, "too_many", `You have ${MAX_PLAYLISTS} beat playlists. Remove one you don't play anymore to make room.`);
  }
  const row = await q.get<Row>(
    `INSERT INTO music_beat_playlists (id, user_id, name, source_url, artwork_url, songs_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, source_url) DO UPDATE SET artwork_url = excluded.artwork_url, songs_json = excluded.songs_json, created_at = excluded.created_at
     RETURNING *`,
    existing?.id ?? newId(), uid, title, source, songs.find((s) => s.artworkUrl)?.artworkUrl ?? null, JSON.stringify(songs), now,
  );
  log("beat_playlist_saved", { songs: songs.length, guesses: songs.filter((s) => s.source === "basic" || !s.known).length, updated: Boolean(existing) });
  return { playlist: toPlaylist(row!), updated: Boolean(existing) };
}

export async function listBeatPlaylists(uid: string): Promise<BeatPlaylist[]> {
  const playlists = (await q.all<Row>("SELECT * FROM music_beat_playlists WHERE user_id = ? ORDER BY created_at DESC", uid)).map(toPlaylist);
  // Songs the model couldn't read when the playlist was made get another read now, and the playlist is updated.
  return Promise.all(playlists.map((p) => (p.songs.some((s) => s.source === "basic") ? reread(uid, p) : p)));
}

async function reread(uid: string, p: BeatPlaylist): Promise<BeatPlaylist> {
  const stale = p.songs.filter((s) => s.source === "basic");
  const read = await readSongs(stale.map((s) => s.query));
  const fresh = new Map(stale.map((s, i) => [s.query, read[i]]));
  let changed = false;
  const songs = p.songs.map((s) => {
    const r = fresh.get(s.query);
    if (!r || r.source !== "ai") return s;
    changed = true;
    // Keep Spotify's own names and artwork, take the new reading.
    return { ...s, known: r.known, profile: r.profile, source: "ai" as const };
  });
  if (!changed) return p;
  await q.run("UPDATE music_beat_playlists SET songs_json = ? WHERE id = ? AND user_id = ?", JSON.stringify(songs), p.id, uid);
  log("beat_playlist_reread", { songs: stale.length });
  return { ...p, songs };
}

export async function renameBeatPlaylist(uid: string, id: string, name: unknown): Promise<BeatPlaylist> {
  const clean = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  if (!clean) throw new ApiError(400, "bad_request", "Give your playlist a name.");
  const row = ID.test(id) ? await q.get<Row>("UPDATE music_beat_playlists SET name = ? WHERE id = ? AND user_id = ? RETURNING *", clean, id, uid) : undefined;
  if (!row) throw new ApiError(404, "not_found", "That playlist isn't in your library.");
  return toPlaylist(row);
}

export async function deleteBeatPlaylist(uid: string, id: string): Promise<void> {
  const row = ID.test(id) ? await q.get("DELETE FROM music_beat_playlists WHERE id = ? AND user_id = ? RETURNING id", id, uid) : undefined;
  if (!row) throw new ApiError(404, "not_found", "That playlist isn't in your library.");
}
