"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import { MusicApiError, musicApi } from "@/lib/music/client";
import { player } from "@/lib/music/player";
import { vibeEngine } from "@/lib/music/vibe/engine";
import { beatParams, type VibeProfile } from "@/lib/music/vibe/profile";
import type { PhysioState } from "@/lib/sensors/classify";
import { engine, useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../ui/Icon";

// Beats follow the band wherever you are in the app, and give way to the track player.
if (typeof window !== "undefined") {
  engine.subscribe(() => vibeEngine.setState(engine.getSnapshot().physio));
  player.subscribe(() => {
    if (player.getSnapshot().playing && vibeEngine.playing) vibeEngine.stop();
  });
}

const subscribe = (fn: () => void) => {
  vibeEngine.listeners.add(fn);
  return () => vibeEngine.listeners.delete(fn);
};

const STATE_WORD: Record<PhysioState, string> = {
  stable: "Calm",
  changing: "Shifting",
  elevated: "Stress rising",
  recovering: "Recovering",
  poor: "Weak band signal",
  none: "No band connected",
};

const FEEL: Record<VibeProfile["drumFeel"], string> = {
  lofi: "Lo-fi groove",
  dholak_groove: "Dholak groove",
  boom_bap: "Boom-bap",
  downtempo: "Downtempo",
  ambient: "Ambient",
};

const nice = (s: string) => s.replace(/_/g, " ");

type Vibe = Awaited<ReturnType<typeof musicApi.vibe>>;

/** Survives tab switches (the view unmounts; the beat keeps playing). */
const memo: { lists: { name: string; count: number }[] | null; playlist: string | null; vibe: Vibe | null } = {
  lists: null,
  playlist: null,
  vibe: null,
};

/**
 * Original, lyric-free study beats in the style of an imported playlist, generated live in the
 * browser and reshaped by the band's stress reading. No song audio is used.
 */
export function StudyBeats() {
  const s = useStudyLoop();
  const playing = useSyncExternalStore(subscribe, () => vibeEngine.playing, () => false);
  const [lists, setLists] = useState(memo.lists);
  const [playlist, setPlaylist] = useState(memo.playlist);
  const [vibe, setVibe] = useState(memo.vibe);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();

  const load = async (name: string | null, refresh = false) => {
    setBusy(true);
    setError(null);
    try {
      const v = await musicApi.vibe(name, refresh);
      memo.vibe = v;
      setVibe(v);
      if (vibeEngine.playing) await vibeEngine.play(v.profile, engine.getSnapshot().physio);
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "Couldn't read that playlist. Try again.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    let live = true;
    musicApi.playlists().then(
      (ls) => {
        if (!live) return;
        memo.lists = ls;
        setLists(ls);
        // Keep the playlist you picked if it still exists; otherwise start with the newest.
        const keepPick = memo.playlist && ls.some((l) => l.name === memo.playlist) && memo.vibe;
        if (keepPick) return;
        const first = ls[0]?.name ?? null;
        memo.playlist = first;
        setPlaylist(first);
        if (first) void load(first);
      },
      (e) => live && setError(e instanceof MusicApiError ? e.message : "Couldn't load your playlists."),
    );
    return () => {
      live = false;
    };
  }, []);

  const toggle = async () => {
    if (!vibe) return;
    if (playing) return vibeEngine.stop();
    player.pause();
    await vibeEngine.play(vibe.profile, s.physio);
  };

  if (lists && !lists.length) {
    return (
      <div className="music-empty">
        <Icon name="music" size={20} />
        <p className="small muted">Import a Spotify playlist in Library first. Study beats are made in its style.</p>
      </div>
    );
  }

  const p = vibe?.profile;
  const params = p ? beatParams(p, s.physio) : null;

  return (
    <div className="beats">
      <div className="beats__row">
        <label className="sr-only" htmlFor={`${id}-pl`}>
          Playlist
        </label>
        <select
          id={`${id}-pl`}
          className="input beats__select"
          value={playlist ?? ""}
          disabled={!lists || busy}
          onChange={(e) => {
            memo.playlist = e.target.value;
            setPlaylist(e.target.value);
            void load(e.target.value);
          }}
        >
          {(lists ?? []).map((l) => (
            <option key={l.name} value={l.name}>
              {l.name} · {l.count} songs
            </option>
          ))}
        </select>
        <button type="button" className="btn btn--sm btn--ghost" disabled={!vibe || busy} onClick={() => void load(playlist, true)} title="Read the vibe again for a fresh take">
          New take
        </button>
      </div>

      {error && (
        <p className="small is-error" role="alert">
          {error}
        </p>
      )}

      <section className="card beats__card" aria-label="Study beats" aria-busy={busy}>
        {!p ? (
          <p className="small muted" role="status">
            {busy || !lists ? "Reading your playlist's vibe…" : "Pick a playlist."}
          </p>
        ) : (
          <>
            <div className="beats__top">
              <div className="beats__meta">
                <p className="label">{vibe!.source === "ai" ? "Your playlist's vibe" : "Basic vibe"}</p>
                <p className="beats__summary">{p.summary}</p>
              </div>
              <button type="button" className="play-btn" aria-label={playing ? "Stop study beats" : "Play study beats"} onClick={() => void toggle()} data-running={playing || undefined}>
                <Icon name={playing ? "pause" : "play"} size={18} />
              </button>
            </div>
            <ul className="beats__chips" aria-label="Beat details">
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
            <p className={`beats__state state-word state-word--${s.physio === "elevated" ? "failed" : s.physio === "stable" || s.physio === "recovering" ? "completed" : "queued"}`} aria-live="polite">
              <Icon name={s.physio === "elevated" ? "rise" : s.physio === "recovering" ? "recover" : "heart"} size={14} />
              <span>
                <b>{STATE_WORD[s.physio]}</b> · {params!.label}
              </span>
            </p>
          </>
        )}
      </section>
      <p className="small muted beats__note">
        An original beat made live in the style of your playlist{vibe?.source === "basic" ? " (basic reading: smart vibe reading isn't switched on yet)" : ""}. No song audio is used. It slows and softens when the band reads stress.
      </p>
    </div>
  );
}
