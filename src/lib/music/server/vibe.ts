import "server-only";
import { createHash } from "node:crypto";
import { google } from "@ai-sdk/google";
import { groq } from "@ai-sdk/groq";
import { generateText, Output, type LanguageModel } from "ai";
import { fromModel, VibeProfileModelSchema, VibeProfileSchema, type VibeProfile } from "../vibe/profile";
import { q } from "./db";
import { ApiError } from "./http";
import { log } from "./log";

/**
 * Which model reads the vibe: Groq when GROQ_API_KEY is set, else Google Gemini when GOOGLE_GENERATIVE_AI_API_KEY is set (free tier
 * works), otherwise the Vercel AI Gateway. Returns [model, id used in the cache key].
 */
export function vibeModel(): [LanguageModel, string] {
  if (modelOverride) return [modelOverride, "test"];
  if (process.env.GROQ_API_KEY) {
    const id = process.env.MUSIC_VIBE_GROQ_MODEL || "openai/gpt-oss-120b";
    return [groq(id), `groq/${id}`];
  }
  if (process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    const id = process.env.MUSIC_VIBE_GEMINI_MODEL || "gemini-3.8-flash";
    return [google(id), `google/${id}`];
  }
  return ["anthropic/claude-sonnet-5.5", "gateway/anthropic/claude-sonnet-5.5"];
}
const MAX_TRACKS = 60;

let modelOverride: LanguageModel | null = null;
/** Tests only. */
export function setVibeModelForTests(m: LanguageModel | null) {
  modelOverride = m;
}

export interface VibeResult {
  profile: VibeProfile;
  /** "ai": read by the model; "basic": keyword fallback when the AI Gateway isn't available. */
  source: "ai" | "basic";
  playlistName: string | null;
  trackCount: number;
  cached: boolean;
}

/**
 * The vibe of one imported playlist (or the whole library when `playlist` is null), read by a model
 * from titles and artists only. Cached per exact track list, so each playlist costs one call.
 */
export async function playlistVibe(uid: string, playlist: string | null, refresh = false): Promise<VibeResult> {
  const tracks = await q.all<{ title: string; artist: string }>(
    `SELECT title, artist FROM music_tracks WHERE user_id = ? AND (?::text IS NULL OR playlist_name = ?)
     ORDER BY created_at DESC LIMIT ${MAX_TRACKS}`,
    uid, playlist, playlist,
  );
  if (!tracks.length) throw new ApiError(409, "no_tracks", "Import a Spotify playlist first.");
  const list = tracks.map((t) => `${t.title} — ${t.artist}`);
  const [model, modelId] = vibeModel();
  const key = createHash("sha256").update(JSON.stringify([modelId, list])).digest("hex");

  if (!refresh) {
    const hit = await q.get<{ profile_json: string }>("SELECT profile_json FROM music_vibes WHERE user_id = ? AND key = ?", uid, key);
    if (hit) return { profile: VibeProfileSchema.parse(JSON.parse(hit.profile_json)), source: "ai", playlistName: playlist, trackCount: tracks.length, cached: true };
  }

  const t0 = Date.now();
  let profile: VibeProfile;
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: VibeProfileModelSchema }),
      system:
        "You are a music producer designing an original, lyric-free study beat that carries the feel of a listener's playlist. " +
        "From the song titles and artists, infer the typical tempo, key, harmony, groove and instrumentation of these songs, " +
        "then describe a calm, focus-friendly beat in that style. Never reproduce or reference specific melodies. " +
        "Keep energy moderate: this plays while studying.",
      prompt: `Playlist${playlist ? ` "${playlist}"` : ""} (${tracks.length} songs):\n${list.join("\n")}`,
    });
    profile = fromModel(output);
  } catch (e) {
    // Keep the music playing: a simpler reading from keywords, not cached so the AI one replaces it later.
    log("vibe_failed", { model: modelId, error: (e as Error).name, detail: (e as Error).message.slice(0, 200) });
    return { profile: basicVibe(list), source: "basic", playlistName: playlist, trackCount: tracks.length, cached: false };
  }
  await q.run(
    `INSERT INTO music_vibes (user_id, key, playlist_name, profile_json, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (user_id, key) DO UPDATE SET profile_json = excluded.profile_json, created_at = excluded.created_at`,
    uid, key, playlist, JSON.stringify(profile), Date.now(),
  );
  log("vibe_generated", { model: modelId, tracks: tracks.length, ms: Date.now() - t0 });
  return { profile, source: "ai", playlistName: playlist, trackCount: tracks.length, cached: false };
}

/** Fallback vibe from keywords in titles/artists, varied deterministically per playlist. */
export function basicVibe(list: string[]): VibeProfile {
  const text = list.join(" ").toLowerCase();
  const h = createHash("sha256").update(text).digest();
  const has = (re: RegExp) => re.test(text);
  const folk = has(/coke studio|sufi|qawwali|dhol|bhangra|punjab|rahat|nusrat|atif/);
  const hiphop = has(/seedhe maut|divine|krsna|rap|hip.?hop|drill|mc /);
  const lofi = has(/lo-?fi|chill|slowed/);
  const progressions = [[1, 5, 6, 4], [6, 4, 1, 5], [1, 6, 4, 5], [2, 5, 1, 6], [1, 4, 6, 5]];
  const keys = ["C", "D", "E", "F", "G", "A"] as const;
  return {
    summary: folk ? "Folk and Sufi-tinged grooves with warm strings" : hiphop ? "Laid-back hip-hop pocket with mellow keys" : "Warm, mellow indie feel with soft keys and guitar",
    moods: folk ? ["soulful", "warm"] : hiphop ? ["focused", "steady"] : ["calm", "warm"],
    tempoBpm: hiphop ? 86 : lofi ? 74 : 80,
    key: keys[h[0] % keys.length],
    mode: h[1] % 3 === 0 ? "major" : "minor",
    progression: progressions[h[2] % progressions.length],
    drumFeel: folk ? "dholak_groove" : hiphop ? "boom_bap" : "lofi",
    palette: folk ? ["sitar", "strings"] : hiphop ? ["rhodes", "pad"] : ["rhodes", "acoustic_guitar"],
    energy: hiphop ? 0.5 : 0.35,
    warmth: 0.7,
    swing: hiphop ? 0.2 : 0.3,
  };
}

/** Imported playlists, for the picker. */
export async function playlists(uid: string): Promise<{ name: string; count: number }[]> {
  return q.all<{ name: string; count: number }>(
    `SELECT playlist_name AS name, COUNT(*)::int AS count FROM music_tracks
     WHERE user_id = ? AND playlist_name IS NOT NULL GROUP BY playlist_name ORDER BY MAX(created_at) DESC`,
    uid,
  );
}
