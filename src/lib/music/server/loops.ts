import "server-only";
import { VibeProfileSchema, type VibeProfile } from "../vibe/profile";
import { newId, q } from "./db";
import { ApiError } from "./http";
import { log } from "./log";

/** Loops a listener saved, so they can come back to a vibe they liked. */
export interface SavedLoop {
  id: string;
  name: string;
  playlistName: string | null;
  profile: VibeProfile;
  createdAt: number;
}

const MAX_LOOPS = 100;
const ID = /^[a-f0-9]{32}$/;

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, 60) : "");

interface Row {
  id: string;
  name: string;
  playlist_name: string | null;
  profile_json: string;
  created_at: number;
}
const toLoop = (r: Row): SavedLoop => ({
  id: r.id,
  name: r.name,
  playlistName: r.playlist_name,
  profile: JSON.parse(r.profile_json),
  createdAt: r.created_at,
});

export async function listLoops(uid: string): Promise<SavedLoop[]> {
  return (await q.all<Row>("SELECT * FROM music_loops WHERE user_id = ? ORDER BY created_at DESC", uid)).map(toLoop);
}

export async function saveLoop(uid: string, body: { name?: unknown; playlistName?: unknown; profile?: unknown }): Promise<SavedLoop> {
  const parsed = VibeProfileSchema.safeParse(body.profile);
  if (!parsed.success) throw new ApiError(400, "bad_request", "That loop couldn't be saved. Try playing it again first.");
  const name = cleanName(body.name) || "My Loop";
  const playlist = typeof body.playlistName === "string" ? body.playlistName.slice(0, 200) : null;
  const count = (await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM music_loops WHERE user_id = ?", uid))!.n;
  if (count >= MAX_LOOPS) throw new ApiError(409, "too_many", `You've saved ${MAX_LOOPS} Loops — remove one you don't play anymore to make room.`);
  const id = newId();
  const now = Date.now();
  await q.run(
    "INSERT INTO music_loops (id, user_id, name, playlist_name, profile_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    id, uid, name, playlist, JSON.stringify(parsed.data), now,
  );
  log("loop_saved", { loopId: id });
  return { id, name, playlistName: playlist, profile: parsed.data, createdAt: now };
}

export async function renameLoop(uid: string, id: string, name: unknown): Promise<SavedLoop> {
  const clean = cleanName(name);
  if (!clean) throw new ApiError(400, "bad_request", "Give your Loop a name.");
  const row = ID.test(id)
    ? await q.get<Row>("UPDATE music_loops SET name = ? WHERE id = ? AND user_id = ? RETURNING *", clean, id, uid)
    : undefined;
  if (!row) throw new ApiError(404, "not_found", "That Loop isn't in your collection.");
  return toLoop(row);
}

export async function deleteLoop(uid: string, id: string): Promise<void> {
  const row = ID.test(id) ? await q.get("DELETE FROM music_loops WHERE id = ? AND user_id = ? RETURNING id", id, uid) : undefined;
  if (!row) throw new ApiError(404, "not_found", "That Loop isn't in your collection.");
}
