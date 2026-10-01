import { requireUser } from "@/lib/music/server/auth";
import { route } from "@/lib/music/server/http";
import { spotifyClientId } from "@/lib/music/server/spotify";

/** What the browser needs to start "Connect Spotify" (PKCE): only the public client id. */
export const GET = route("spotify.config", async (req) => {
  await requireUser(req);
  return Response.json({ clientId: spotifyClientId() });
});
