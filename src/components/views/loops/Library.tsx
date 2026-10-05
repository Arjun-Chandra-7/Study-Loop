"use client";

import { useEffect, useState } from "react";
import { isDemo } from "@/lib/demo";
import { MusicApiError, musicApi } from "@/lib/music/client";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { demoPlaylist, type BeatPlaylist } from "@/lib/music/vibe/songs";
import { useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../../ui/Icon";
import { BeatPlaylistView, Cover, playPlaylist, usePlaylistPlayback } from "./BeatPlaylistView";
import { YourLoops } from "./YourLoops";

function PlaylistRow({
  p,
  open,
  onOpen,
  onRename,
  onRemove,
}: {
  p: BeatPlaylist;
  open: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const s = useStudyLoop();
  const { ours, playing } = usePlaylistPlayback(p);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.name);
  const editable = p.id !== "demo";
  const finish = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== p.name) onRename(draft.trim());
  };

  return (
    <li className="lib-item" data-open={open || undefined}>
      <div className="loop-card lib-row" data-playing={playing || undefined}>
        <button
          type="button"
          className="play-btn"
          aria-label={playing ? `Pause ${p.name}` : `Play ${p.name}`}
          data-running={playing || undefined}
          onClick={() => (ours ? void vibeEngine.toggle() : playPlaylist(p, 0, s.physio))}
        >
          <Icon name={playing ? "pause" : "play"} size={16} />
        </button>
        {editing ? (
          <input
            className="input loop-card__rename"
            aria-label="Playlist name"
            value={draft}
            maxLength={120}
            autoFocus
            onChange={(e) => setDraft(e.target.value)}
            onBlur={finish}
            onKeyDown={(e) => {
              if (e.key === "Enter") finish();
              if (e.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <button type="button" className="lib-row__main" onClick={onOpen} aria-expanded={open} aria-label={`${open ? "Close" : "Open"} ${p.name}`}>
            <Cover url={p.artworkUrl} size={44} />
            <span className="loop-card__text">
              <span className="card__title">{p.name}</span>
              <span className="card__sub">
                {p.songs.length} song{p.songs.length === 1 ? "" : "s"} · {p.sourceUrl?.startsWith("list:") ? "pasted songs" : p.sourceUrl ? "from Spotify" : "demo"}
              </span>
            </span>
          </button>
        )}
        {editable && (
          <div className="loop-card__actions">
            <button
              type="button"
              className="icon-btn"
              aria-label={`Rename ${p.name}`}
              onClick={() => {
                setDraft(p.name);
                setEditing(true);
              }}
            >
              <Icon name="edit" size={14} />
            </button>
            <button type="button" className="icon-btn" aria-label={`Remove ${p.name}`} onClick={onRemove}>
              <Icon name="close" size={14} />
            </button>
          </div>
        )}
      </div>
      {open && <BeatPlaylistView playlist={p} />}
    </li>
  );
}

/** Everything they've made: beat playlists first, then single beats they kept. */
export function Library({ version, onCreate }: { version: number; onCreate: () => void }) {
  const demo = typeof window !== "undefined" && isDemo();
  const [playlists, setPlaylists] = useState<BeatPlaylist[] | null>(demo ? [demoPlaylist()] : null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (demo) return;
    let live = true;
    musicApi.beatPlaylists().then(
      (ps) => live && setPlaylists(ps),
      (e) => live && setError(e instanceof MusicApiError ? e.message : "We couldn't load your Library. Refresh to try again."),
    );
    return () => {
      live = false;
    };
  }, [version, demo]);

  const rename = async (p: BeatPlaylist, name: string) => {
    try {
      const updated = await musicApi.renameBeatPlaylist(p.id, name);
      setPlaylists((ps) => ps?.map((x) => (x.id === p.id ? updated : x)) ?? ps);
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "Couldn't rename that playlist.");
    }
  };
  const remove = async (p: BeatPlaylist) => {
    try {
      await musicApi.deleteBeatPlaylist(p.id);
      if (vibeEngine.getSnapshot().loop?.playlistId === p.id) vibeEngine.stop();
      setPlaylists((ps) => ps?.filter((x) => x.id !== p.id) ?? ps);
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "Couldn't remove that playlist.");
    }
  };

  return (
    <div className="beats lib" data-lenis-prevent>
      <h3 className="label lib__heading">Beat playlists</h3>
      {error && (
        <p className="small is-error" role="alert">
          {error}
        </p>
      )}
      {!playlists && !error ? (
        <p className="small muted" role="status">
          Gathering your Library…
        </p>
      ) : playlists && !playlists.length ? (
        <div className="loops-empty">
          <Icon name="music" size={22} />
          <p className="loops-empty__title">Your Library starts here</p>
          <p className="small muted">Paste a Spotify playlist and it comes back as beats, saved right here for every study session.</p>
          <button type="button" className="btn btn--sm btn--primary" onClick={onCreate}>
            Make beats
          </button>
        </div>
      ) : (
        <ul className="lib__list" aria-label="Beat playlists">
          {playlists?.map((p) => (
            <PlaylistRow key={p.id} p={p} open={open === p.id} onOpen={() => setOpen((o) => (o === p.id ? null : p.id))} onRename={(n) => void rename(p, n)} onRemove={() => void remove(p)} />
          ))}
        </ul>
      )}
      {!demo && (
        <>
          <h3 className="label lib__heading">Saved beats</h3>
          <YourLoops version={version} />
        </>
      )}
    </div>
  );
}
