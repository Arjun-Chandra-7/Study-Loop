"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { MusicApiError, musicApi } from "@/lib/music/client";
import { isDemo } from "@/lib/demo";
import { spotifyToken, startSpotifyLogin, takePendingImport } from "@/lib/music/spotifyAuth";
import { demoPlaylist, type BeatPlaylist } from "@/lib/music/vibe/songs";
import { useAuth } from "@/lib/auth";
import { Icon } from "../../ui/Icon";
import { BeatPlaylistView } from "./BeatPlaylistView";

/** The playlist just made, kept across tab switches for the same signed-in person. */
const memo: { uid: string | null; playlist: BeatPlaylist | null } = { uid: null, playlist: null };

/** What's happening while a playlist turns into beats; one long request, told in steps. */
const STEPS = ["Finding your songs…", "Reading each song’s tempo, key and groove…", "Building your beats…"];

/** Paste a Spotify link; get the same playlist back as beats, saved to your library. */
export function CreateLoop({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  if (memo.uid !== uid) Object.assign(memo, { uid, playlist: null });
  const [playlist, setPlaylist] = useState<BeatPlaylist | null>(() => memo.playlist ?? (typeof window !== "undefined" && isDemo() ? demoPlaylist() : null));
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [note, setNote] = useState<{ ok: boolean; text: string; connect?: boolean } | null>(null);
  const id = useId();

  useEffect(() => {
    if (!busy) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- restart the steps for each request
    setStep(0);
    const t = setInterval(() => setStep((n) => Math.min(STEPS.length - 1, n + 1)), 3500);
    return () => clearInterval(t);
  }, [busy]);

  const make = async (link: string) => {
    if (!link.trim()) return;
    setNote(null);
    if (isDemo()) {
      setPlaylist(demoPlaylist());
      setNote({ ok: true, text: "Demo mode can’t reach Spotify, so here’s a demo playlist made the same way." });
      return;
    }
    setBusy(true);
    try {
      const { playlist: p, updated } = await musicApi.makeBeatPlaylist(link, await spotifyToken());
      memo.playlist = p;
      setPlaylist(p);
      setUrl("");
      setNote({
        ok: true,
        text: `${updated ? "Refreshed" : "Saved to your Library"}: ${p.name}, ${p.songs.length} song${p.songs.length === 1 ? "" : "s"} as beats.`,
      });
      onSaved();
    } catch (e) {
      const apiErr = e instanceof MusicApiError ? e : null;
      setNote({ ok: false, text: apiErr?.message ?? "That didn’t go through. Try again.", connect: apiErr?.code === "spotify_login_required" });
    } finally {
      setBusy(false);
    }
  };

  // Back from "Connect Spotify": finish the import they started.
  useEffect(() => {
    const pending = takePendingImport();
    if (pending) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- resume the link they pasted before connecting
      setUrl(pending);
      void make(pending);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const connectSpotify = async () => {
    try {
      const { clientId } = await musicApi.spotifyConfig();
      if (!clientId) throw new Error();
      await startSpotifyLogin(clientId, url.trim() || null);
    } catch {
      setNote({ ok: false, text: "Spotify isn’t hooked up on this server yet." });
    }
  };

  return (
    <div className="beats">
      <form
        className="music-import__row"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void make(url);
        }}
      >
        <label className="sr-only" htmlFor={`${id}-url`}>
          Spotify link or songs
        </label>
        <textarea
          id={`${id}-url`}
          className="input music-import__text"
          rows={Math.min(6, Math.max(1, url.split("\n").length))}
          placeholder="Paste a Spotify link, or the songs themselves"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            // Enter makes beats; Shift+Enter starts a new line in a typed list.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void make(url);
            }
          }}
          required
          disabled={busy}
          spellCheck={false}
        />
        <button type="submit" className="btn btn--solid" disabled={busy || !url.trim()}>
          {busy ? "Working…" : "Make beats"}
        </button>
      </form>
      <p className="music-import__tip small">
        Any playlist, on any device: open it in Spotify, press <kbd>Ctrl/⌘ A</kbd> then <kbd>Ctrl/⌘ C</kbd>, and paste here. Or type songs as “Title — Artist”, one per line.
      </p>

      {busy && (
        <p className="music-import__note small bp-progress" role="status" aria-live="polite">
          <span className="bp-progress__dot" aria-hidden />
          {STEPS[step]}
        </p>
      )}
      {note && !busy && (
        <p className={`music-import__note small ${note.ok ? "" : "is-error"}`} role="status" aria-live="polite">
          <Icon name={note.ok ? "check" : "alert"} size={14} />
          {note.text}
        </p>
      )}
      {note?.connect && !busy && (
        <button type="button" className="btn btn--sm btn--primary music-import__connect" onClick={() => void connectSpotify()}>
          Connect Spotify
        </button>
      )}

      {playlist ? (
        <BeatPlaylistView playlist={playlist} onSaved={onSaved} />
      ) : (
        <div className="loops-empty">
          <Icon name="music" size={22} />
          <p className="loops-empty__title">Your playlist, as study beats</p>
          <p className="small muted">
            Paste any Spotify playlist, or its songs. StudyLoop finds every song, reads its tempo, key, chords and groove, and builds the same playlist as
            lyric-free beats that sound like the originals, arranged to flow. It’s saved to your Library, and it eases off when stress climbs.
          </p>
        </div>
      )}
    </div>
  );
}
