"use client";

import { useState } from "react";
import { MusicApiError, musicApi } from "@/lib/music/client";
import { songLoop, vibeEngine } from "@/lib/music/vibe/engine";
import type { BeatPlaylist, SongBeat } from "@/lib/music/vibe/songs";
import { useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../../ui/Icon";
import { FEEL, useLoopPlayer } from "./shared";

/** Is this playlist the one playing, and on which song? */
export function usePlaylistPlayback(p: BeatPlaylist) {
  const player = useLoopPlayer();
  const ours = player.loop?.playlistId === p.id && Boolean(player.loop?.queue);
  return { ours, playing: ours && player.playing, now: ours ? (player.loop?.index ?? 0) : null };
}

/** Start (or pause) the playlist, from song `i`. */
export function playPlaylist(p: BeatPlaylist, i = 0, physio = "stable" as Parameters<typeof vibeEngine.play>[1]) {
  const snap = vibeEngine.getSnapshot();
  if (snap.loop?.playlistId === p.id && (snap.loop.index ?? 0) === i && snap.loop.queue) return void vibeEngine.toggle();
  void vibeEngine.play(songLoop(p.songs, i, { name: p.name, id: p.id }), physio);
}

function Cover({ url, size = 56 }: { url: string | null | undefined; size?: number }) {
  return (
    <span className="bp-cover" style={{ width: size, height: size }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- Spotify's CDN artwork, shown as-is */}
      {url ? <img src={url} alt="" width={size} height={size} loading="lazy" /> : <Icon name="music" size={Math.round(size * 0.4)} />}
    </span>
  );
}

/** A beat playlist: same songs as the original, each one played as its beat. */
export function BeatPlaylistView({ playlist, onSaved }: { playlist: BeatPlaylist; onSaved?: () => void }) {
  const s = useStudyLoop();
  const { ours, playing, now } = usePlaylistPlayback(playlist);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const guesses = playlist.songs.filter((x) => !x.known || x.source === "basic").length;
  const current = playlist.songs[now ?? 0];

  const save = async (song: SongBeat) => {
    try {
      const loop = await musicApi.saveLoop({ name: `${song.title} beat`, playlistName: song.artist || null, profile: song.profile });
      setSavedKeys((k) => [...k, song.query]);
      if (ours && playlist.songs[now ?? -1] === song) vibeEngine.markSaved(loop.id, loop.name);
      onSaved?.();
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "Couldn't save that one. Try again.");
    }
  };

  return (
    <section className="card beats__card bp" aria-label={playlist.name}>
      <div className="beats__top">
        <div className="bp__head">
          <Cover url={playlist.artworkUrl} size={64} />
          <div className="beats__meta">
            <p className="label">
              Beat playlist · {playlist.songs.length} song{playlist.songs.length === 1 ? "" : "s"}
            </p>
            <p className="beats__name">{playlist.name}</p>
            <p className="small muted beats__summary">{ours && current ? `Now: ${current.title} · ${current.profile.summary}` : "Same songs, same order, each one as its beat."}</p>
          </div>
        </div>
        <div className="beats__actions">
          {playlist.songs.length > 1 && (
            <button type="button" className="btn btn--sm btn--ghost" aria-label="Previous song" disabled={!ours} onClick={() => void vibeEngine.skip(-1)}>
              <Icon name="prev" size={14} />
            </button>
          )}
          <button
            type="button"
            className="play-btn play-btn--lg"
            aria-label={playing ? `Pause ${playlist.name}` : `Play ${playlist.name}`}
            data-running={playing || undefined}
            onClick={() => (ours ? void vibeEngine.toggle() : playPlaylist(playlist, 0, s.physio))}
          >
            <Icon name={playing ? "pause" : "play"} size={20} />
          </button>
          {playlist.songs.length > 1 && (
            <button type="button" className="btn btn--sm btn--ghost" aria-label="Next song" disabled={!ours} onClick={() => void vibeEngine.skip(1)}>
              <Icon name="next" size={14} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <p className="small is-error" role="alert">
          {error}
        </p>
      )}

      <ol className="songs" aria-label={`Songs in ${playlist.name}`} data-lenis-prevent>
        {playlist.songs.map((song, i) => {
          const isNow = ours && now === i;
          const saved = savedKeys.includes(song.query);
          return (
            <li key={`${song.query}-${i}`} className="mqueue songs__row" data-now={isNow || undefined}>
              <span className="mqueue__n tnum" aria-hidden>
                {isNow && playing ? (
                  <span className="songs__eq">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  i + 1
                )}
              </span>
              <button type="button" className="mqueue__main songs__main" onClick={() => playPlaylist(playlist, i, s.physio)} aria-label={`${isNow && playing ? "Pause" : "Play"} ${song.title}`}>
                <Cover url={song.artworkUrl} size={36} />
                <span className="songs__text">
                  <span className="card__title">{song.title}</span>
                  <span className="small muted songs__facts">
                    {[song.artist, `${song.profile.tempoBpm} BPM`, `${song.profile.key} ${song.profile.mode}`, FEEL[song.profile.drumFeel]].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </button>
              <span className="songs__end">
                {(!song.known || song.source === "basic") && <span className="chip chip--muted">Best guess</span>}
                {playlist.id !== "demo" && (
                  <button type="button" className="btn btn--sm btn--ghost" disabled={saved} aria-label={saved ? `${song.title} is in Saved beats` : `Save ${song.title}`} onClick={() => void save(song)}>
                    <Icon name={saved ? "check" : "plus"} size={14} />
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ol>
      {guesses > 0 && (
        <p className="small muted beats__note">
          <b>Best guess</b> means we couldn&apos;t place that exact song, so its beat follows the title and artist instead.
        </p>
      )}
    </section>
  );
}

export { Cover };
