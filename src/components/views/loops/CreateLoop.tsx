"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { MusicApiError, musicApi } from "@/lib/music/client";
import { spotifyToken, startSpotifyLogin, takePendingImport } from "@/lib/music/spotifyAuth";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { beatParams } from "@/lib/music/vibe/profile";
import { useAuth } from "@/lib/auth";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../../ui/Icon";
import { FEEL, loopName, nice, STATE_WORD, useLoopPlayer } from "./shared";

type Vibe = Awaited<ReturnType<typeof musicApi.vibe>>;

/** Survives tab switches (the view unmounts; the Loop keeps playing) — for the same signed-in person only. */
const memo: { uid: string | null; lists: { name: string; count: number }[] | null; playlist: string | null; vibe: Vibe | null } = {
  uid: null,
  lists: null,
  playlist: null,
  vibe: null,
};

function memoFor(uid: string | null) {
  if (memo.uid !== uid) Object.assign(memo, { uid, lists: null, playlist: null, vibe: null });
  return memo;
}

const message = (e: unknown, fallback: string) => (e instanceof MusicApiError ? e.message : fallback);

/** Bring a playlist, hear its Loop. */
export function CreateLoop({ onSaved }: { onSaved: () => void }) {
  const s = useStudyLoop();
  const player = useLoopPlayer();
  const { user } = useAuth();
  memoFor(user?.uid ?? null);
  const [lists, setLists] = useState(memo.lists);
  const [playlist, setPlaylist] = useState(memo.playlist);
  const [vibe, setVibe] = useState(memo.vibe);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [note, setNote] = useState<{ ok: boolean; text: string; connect?: boolean } | null>(null);
  const [importing, setImporting] = useState(false);
  const [savedFor, setSavedFor] = useState<object | null>(null);
  const id = useId();

  const choose = (name: string | null) => {
    memo.playlist = name;
    setPlaylist(name);
  };

  const load = async (name: string | null, refresh = false) => {
    setBusy(true);
    setError(null);
    try {
      const v = await musicApi.vibe(name, refresh);
      memo.vibe = v;
      setVibe(v);
      // Already listening to this playlist's Loop? Swap in the fresh take right away.
      if (vibeEngine.playing && vibeEngine.getSnapshot().loop?.playlistName === name) {
        await vibeEngine.play({ name: loopName(v.profile), playlistName: name, profile: v.profile }, engine.getSnapshot().physio);
      }
    } catch (e) {
      setError(message(e, "We couldn't read that playlist just now. Give it another go."));
    } finally {
      setBusy(false);
    }
  };

  const refreshLists = async (prefer?: string | null) => {
    const ls = await musicApi.playlists();
    memo.lists = ls;
    setLists(ls);
    const keep = prefer ?? (memo.playlist && ls.some((l) => l.name === memo.playlist) ? memo.playlist : null);
    const pick = keep ?? ls[0]?.name ?? null;
    if (pick !== memo.playlist || !memo.vibe || prefer) {
      choose(pick);
      if (pick) await load(pick);
    }
  };

  const importLink = async (link: string) => {
    setImporting(true);
    setNote(null);
    try {
      const r = await musicApi.importSpotify(link, await spotifyToken());
      setUrl("");
      setNote({ ok: true, text: r.added ? `Got it — ${r.total} songs${r.playlistName ? ` from ${r.playlistName}` : ""}. Your Loop is ready below.` : "You already have this one. Here's its Loop." });
      await refreshLists(r.playlistName);
    } catch (e) {
      const apiErr = e instanceof MusicApiError ? e : null;
      setNote({ ok: false, text: apiErr?.message ?? "That didn't go through. Try again.", connect: apiErr?.code === "spotify_login_required" });
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    let live = true;
    const pending = takePendingImport(); // back from "Connect Spotify": finish what they started
    void (async () => {
      try {
        if (pending) {
          setUrl(pending);
          await importLink(pending);
        } else if (live) {
          await refreshLists();
        }
      } catch (e) {
        if (live) setError(message(e, "We couldn't load your playlists. Refresh to try again."));
      }
    })();
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once on mount
  }, []);

  const connectSpotify = async () => {
    try {
      const { clientId } = await musicApi.spotifyConfig();
      if (!clientId) throw new Error();
      await startSpotifyLogin(clientId, url.trim() || null);
    } catch {
      setNote({ ok: false, text: "Spotify isn't hooked up on this server yet." });
    }
  };

  const p = vibe?.profile;
  const params = p ? beatParams(p, s.physio) : null;
  const thisIsPlaying = player.playing && player.loop?.playlistName === playlist && player.loop?.profile === p;
  const saved = savedFor === p || (thisIsPlaying && Boolean(player.loop?.savedId));

  const start = async () => {
    if (!p) return;
    if (thisIsPlaying) return vibeEngine.stop();
    await vibeEngine.play({ name: loopName(p), playlistName: playlist, profile: p }, s.physio);
  };

  const save = async () => {
    if (!p) return;
    try {
      const loop = await musicApi.saveLoop({ name: loopName(p), playlistName: playlist, profile: p });
      setSavedFor(p);
      if (thisIsPlaying) vibeEngine.markSaved(loop.id, loop.name);
      onSaved();
    } catch (e) {
      setError(message(e, "Couldn't save that Loop. Try again."));
    }
  };

  return (
    <div className="beats">
      <form
        className="music-import__row"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void importLink(url);
        }}
      >
        <label className="sr-only" htmlFor={`${id}-url`}>
          Spotify playlist link
        </label>
        <input id={`${id}-url`} className="input" type="url" inputMode="url" placeholder="Paste a Spotify playlist link" value={url} onChange={(e) => setUrl(e.target.value)} required />
        <button type="submit" className="btn btn--solid" disabled={importing || !url.trim()}>
          {importing ? "Reading…" : "Make a Loop"}
        </button>
      </form>
      {note && (
        <p className={`music-import__note small ${note.ok ? "" : "is-error"}`} role="status" aria-live="polite">
          {!note.ok && <Icon name="alert" size={14} />}
          {note.text}
        </p>
      )}
      {note?.connect && (
        <button type="button" className="btn btn--sm btn--primary music-import__connect" onClick={() => void connectSpotify()}>
          Connect Spotify
        </button>
      )}

      {lists && !lists.length ? (
        <div className="loops-empty">
          <Icon name="music" size={22} />
          <p className="loops-empty__title">Let&apos;s make your first Loop</p>
          <p className="small muted">
            Paste any Spotify playlist above — your study mix, your late-night favourites, anything. We&apos;ll read its vibe and shape a Loop that
            eases off the moment stress creeps in.
          </p>
        </div>
      ) : (
        <>
          {lists && lists.length > 1 && (
            <div className="beats__row">
              <label className="sr-only" htmlFor={`${id}-pl`}>
                Playlist
              </label>
              <select
                id={`${id}-pl`}
                className="input beats__select"
                value={playlist ?? ""}
                disabled={busy}
                onChange={(e) => {
                  choose(e.target.value);
                  void load(e.target.value);
                }}
              >
                {lists.map((l) => (
                  <option key={l.name} value={l.name}>
                    {l.name} · {l.count} songs
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <p className="small is-error" role="alert">
              {error}
            </p>
          )}

          <section className="card beats__card" aria-label="Your Loop" aria-busy={busy}>
            {!p ? (
              <p className="small muted" role="status">
                Listening to your playlist…
              </p>
            ) : (
              <>
                <div className="beats__top">
                  <div className="beats__meta">
                    <p className="label">{vibe!.source === "ai" ? "The vibe we heard" : "A quick read of your vibe"}{playlist ? ` · ${playlist}` : ""}</p>
                    <p className="beats__name">{loopName(p)}</p>
                  </div>
                  <div className="beats__actions">
                    <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => void load(playlist, true)}>
                      Try something else?
                    </button>
                    <button type="button" className="btn btn--sm btn--ghost" disabled={saved} aria-label={saved ? "In Your Loops" : "Save to Your Loops"} onClick={() => void save()}>
                      <Icon name={saved ? "check" : "plus"} size={14} />
                      {saved ? "Saved" : "Save"}
                    </button>
                    <button type="button" className="play-btn play-btn--lg" aria-label={thisIsPlaying ? "Pause this Loop" : "Play this Loop"} onClick={() => void start()} data-running={thisIsPlaying || undefined}>
                      <Icon name={thisIsPlaying ? "pause" : "play"} size={20} />
                    </button>
                  </div>
                </div>
                <ul className="beats__chips" aria-label="What's in it">
                  <li className="chip chip--outline tnum">{params!.bpm} BPM</li>
                  <li className="chip chip--outline">
                    {p.key} {p.mode}
                  </li>
                  <li className="chip chip--outline">{FEEL[p.drumFeel]}</li>
                  {p.palette.map((i) => (
                    <li key={i} className="chip chip--outline">
                      {nice(i)}
                    </li>
                  ))}
                  {p.moods.map((m) => (
                    <li key={m} className="chip chip--muted">
                      {m}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
