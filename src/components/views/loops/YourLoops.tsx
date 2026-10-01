"use client";

import { useEffect, useState } from "react";
import { MusicApiError, musicApi, type SavedLoop } from "@/lib/music/client";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { engine } from "@/lib/useStudyLoop";
import { Icon } from "../../ui/Icon";
import { FEEL, useLoopPlayer } from "./shared";

/** Loops they saved, ready to play again. */
export function YourLoops({ version, onCreate }: { version: number; onCreate: () => void }) {
  const player = useLoopPlayer();
  const [loops, setLoops] = useState<SavedLoop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    let live = true;
    musicApi.loops().then(
      (ls) => live && setLoops(ls),
      (e) => live && setError(e instanceof MusicApiError ? e.message : "We couldn't load your Loops. Refresh to try again."),
    );
    return () => {
      live = false;
    };
  }, [version]);

  const play = (l: SavedLoop) => {
    const current = player.loop?.savedId === l.id && player.playing;
    if (current) return vibeEngine.stop();
    void vibeEngine.play({ name: l.name, playlistName: l.playlistName, profile: l.profile, savedId: l.id }, engine.getSnapshot().physio);
  };

  const rename = async (l: SavedLoop) => {
    setEditing(null);
    const name = draft.trim();
    if (!name || name === l.name) return;
    try {
      const updated = await musicApi.renameLoop(l.id, name);
      setLoops((ls) => ls?.map((x) => (x.id === l.id ? updated : x)) ?? ls);
      if (player.loop?.savedId === l.id) vibeEngine.markSaved(l.id, updated.name);
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "Couldn't rename that Loop.");
    }
  };

  const remove = async (l: SavedLoop) => {
    try {
      await musicApi.deleteLoop(l.id);
      setLoops((ls) => ls?.filter((x) => x.id !== l.id) ?? ls);
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "Couldn't remove that Loop.");
    }
  };

  if (error) {
    return (
      <p className="small is-error" role="alert">
        {error}
      </p>
    );
  }
  if (!loops) {
    return (
      <p className="small muted" role="status">
        Gathering your Loops…
      </p>
    );
  }
  if (!loops.length) {
    return (
      <div className="loops-empty">
        <Icon name="music" size={22} />
        <p className="loops-empty__title">Your collection starts here</p>
        <p className="small muted">When a Loop clicks, save it. It&apos;ll be right here whenever you sit down to study.</p>
        <button type="button" className="btn btn--sm btn--primary" onClick={onCreate}>
          Make a Loop
        </button>
      </div>
    );
  }
  return (
    <ul className="music__list" aria-label="Your Loops" data-lenis-prevent>
      {loops.map((l) => {
        const on = player.playing && player.loop?.savedId === l.id;
        return (
          <li key={l.id} className="loop-card" data-playing={on || undefined}>
            <button type="button" className="play-btn" aria-label={on ? `Pause ${l.name}` : `Play ${l.name}`} onClick={() => play(l)} data-running={on || undefined}>
              <Icon name={on ? "pause" : "play"} size={16} />
            </button>
            <div className="loop-card__text">
              {editing === l.id ? (
                <input
                  className="input loop-card__rename"
                  aria-label="Loop name"
                  value={draft}
                  maxLength={60}
                  autoFocus
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => void rename(l)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void rename(l);
                    if (e.key === "Escape") setEditing(null);
                  }}
                />
              ) : (
                <p className="card__title">{l.name}</p>
              )}
              <p className="card__sub">
                {[l.playlistName, `${l.profile.tempoBpm} BPM`, FEEL[l.profile.drumFeel]].filter(Boolean).join(" · ")}
              </p>
            </div>
            <div className="loop-card__actions">
              <button
                type="button"
                className="icon-btn"
                aria-label={`Rename ${l.name}`}
                onClick={() => {
                  setDraft(l.name);
                  setEditing(l.id);
                }}
              >
                <Icon name="edit" size={14} />
              </button>
              <button type="button" className="icon-btn" aria-label={`Remove ${l.name}`} onClick={() => void remove(l)}>
                <Icon name="close" size={14} />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
