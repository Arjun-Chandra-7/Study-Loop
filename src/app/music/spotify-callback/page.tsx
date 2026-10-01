"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { completeSpotifyLogin, rememberPendingImport } from "@/lib/music/spotifyAuth";

/** Spotify sends the listener back here after "Connect Spotify"; we finish PKCE and return to Music. */
export default function SpotifyCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeSpotifyLogin(location.search)
      .then(({ importUrl }) => {
        rememberPendingImport(importUrl);
        router.replace("/");
      })
      .catch((e: Error) => setError(e.message));
  }, [router]);

  return (
    <main className="spotify-callback">
      {error ? (
        <div role="alert">
          <p className="body">{error}</p>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              rememberPendingImport(null);
              router.replace("/");
            }}
          >
            Back to StudyLoop
          </button>
        </div>
      ) : (
        <p className="body muted" role="status">
          Connecting Spotify…
        </p>
      )}
    </main>
  );
}
