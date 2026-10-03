"use client";

import { useId, useState, type FormEvent } from "react";
import { MusicApiError, musicApi } from "@/lib/music/client";
import { isDemo } from "@/lib/demo";
import { songLoop, vibeEngine } from "@/lib/music/vibe/engine";
import { basicSong, DEMO_SONGS, MAX_SONGS, parseSongs, songKey, type SongBeat } from "@/lib/music/vibe/songs";
import { useAuth } from "@/lib/auth";
import { useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../../ui/Icon";
import { FEEL, useLoopPlayer } from "./shared";

interface Saved {
  text: string;
  songs: SongBeat[] | null;
}

const storeKey = (uid: string | null) => `sl-songs:${uid ?? "anon"}`;

/** What they typed and what we read, kept across tab switches and reloads, per person. */
function recall(uid: string | null): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(uid)) ?? "null");
    if (v && typeof v.text === "string") return { text: v.text, songs: Array.isArray(v.songs) ? v.songs : null };
  } catch {}
  return { text: "", songs: null };
}
function remember(uid: string | null, v: Saved) {
  try {
    localStorage.setItem(storeKey(uid), JSON.stringify(v));
  } catch {}
}

/** Demo mode has no account: the three built-in songs, and a quick guess for anything else. */
const offline = (list: string[]) => list.map((q) => DEMO_SONGS.find((d) => songKey(d.query) === songKey(q) || songKey(d.title) === songKey(q)) ?? basicSong(q));

const EXAMPLE = DEMO_SONGS.map((s) => s.query).join("\n");

/** Type the songs you love; hear each one as a beat. */
export function CreateLoop({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const s = useStudyLoop();
  const player = useLoopPlayer();
  const [initial] = useState<Saved>(() => {
    if (typeof window === "undefined") return { text: "", songs: null };
    const saved = recall(uid);
    // A judge lands on the songs the tour is already playing.
    return saved.songs || !isDemo() ? saved : { text: EXAMPLE, songs: DEMO_SONGS };
  });
  const [text, setText] = useState(initial.text);
  const [songs, setSongs] = useState<SongBeat[] | null>(initial.songs);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedKeys, setSavedKeys] = useState<string[]>([]);
  const id = useId();

  const list = parseSongs(text);
  const ours = Boolean(songs && player.loop?.queue === songs);
  const now = ours ? (player.loop?.index ?? 0) : null;

  const make = async () => {
    if (!list.length) return;
    setBusy(true);
    setError(null);
    try {
      const read = isDemo() ? offline(list) : await musicApi.songs(list);
      setSongs(read);
      remember(uid, { text, songs: read });
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "We couldn't read those songs just now. Give it another go.");
    } finally {
      setBusy(false);
    }
  };

  const playAt = (i: number) => {
    if (!songs) return;
    if (ours && now === i) return void vibeEngine.toggle();
    void vibeEngine.play(songLoop(songs, i), s.physio);
  };

  const save = async (song: SongBeat) => {
    try {
      const loop = await musicApi.saveLoop({ name: `${song.title} beat`, playlistName: song.artist || null, profile: song.profile });
      setSavedKeys((k) => [...k, song.query]);
      if (ours && songs?.[now ?? -1] === song) vibeEngine.markSaved(loop.id, loop.name);
      onSaved();
    } catch (e) {
      setError(e instanceof MusicApiError ? e.message : "Couldn't save that one. Try again.");
    }
  };

  const current = songs?.[now ?? 0];
  const guesses = songs?.filter((x) => !x.known || x.source === "basic").length ?? 0;

  return (
    <div className="beats">
      <form
        className="songs-form"
        onSubmit={(e: FormEvent) => {
          e.preventDefault();
          void make();
        }}
      >
        <label className="label" htmlFor={`${id}-songs`}>
          Your songs
        </label>
        <textarea
          id={`${id}-songs`}
          className="input songs-form__input"
          rows={4}
          placeholder={"One song per line, like\nGet Lucky — Daft Punk\nLet It Be — The Beatles"}
          value={text}
          onChange={(e) => setText(e.target.value)}
          data-lenis-prevent
        />
        <div className="songs-form__row">
          <span className="small muted tnum">
            {list.length ? `${list.length} song${list.length === 1 ? "" : "s"}` : `Up to ${MAX_SONGS} songs`}
          </span>
          {!text.trim() && (
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setText(EXAMPLE)}>
              Try an example
            </button>
          )}
          <button type="submit" className="btn btn--solid" disabled={busy || !list.length}>
            {busy ? "Listening…" : "Make my Loop"}
          </button>
        </div>
      </form>

      {error && (
        <p className="small is-error" role="alert">
          {error}
        </p>
      )}

      {!songs ? (
        <div className="loops-empty">
          <Icon name="music" size={22} />
          <p className="loops-empty__title">Your songs, as study beats</p>
          <p className="small muted">
            Type the songs you love. We read each one, its tempo, key, chords and groove, and play a lyric-free beat that sounds like it, one after
            another. When stress climbs, it slows and softens with you.
          </p>
        </div>
      ) : (
        <section className="card beats__card" aria-label="Your Loop" aria-busy={busy}>
          <div className="beats__top">
            <div className="beats__meta">
              <p className="label">
                Your Loop · {songs.length} song{songs.length === 1 ? "" : "s"}
              </p>
              <p className="beats__name">{current?.title ?? "Your songs"}</p>
              {current && <p className="small muted beats__summary">{current.profile.summary}</p>}
            </div>
            <div className="beats__actions">
              {songs.length > 1 && (
                <button type="button" className="btn btn--sm btn--ghost" aria-label="Previous song" disabled={!ours} onClick={() => void vibeEngine.skip(-1)}>
                  <Icon name="prev" size={14} />
                </button>
              )}
              <button
                type="button"
                className="play-btn play-btn--lg"
                aria-label={ours && player.playing ? "Pause" : "Play your Loop"}
                data-running={(ours && player.playing) || undefined}
                onClick={() => (ours ? void vibeEngine.toggle() : playAt(0))}
              >
                <Icon name={ours && player.playing ? "pause" : "play"} size={20} />
              </button>
              {songs.length > 1 && (
                <button type="button" className="btn btn--sm btn--ghost" aria-label="Next song" disabled={!ours} onClick={() => void vibeEngine.skip(1)}>
                  <Icon name="next" size={14} />
                </button>
              )}
            </div>
          </div>

          <ol className="songs" aria-label="Songs in your Loop">
            {songs.map((song, i) => {
              const isNow = ours && now === i;
              const saved = savedKeys.includes(song.query);
              return (
                <li key={`${song.query}-${i}`} className="mqueue songs__row" data-now={isNow || undefined}>
                  <span className="mqueue__n tnum" aria-hidden>
                    {isNow && player.playing ? <span className="songs__eq"><i /><i /><i /></span> : i + 1}
                  </span>
                  <button type="button" className="mqueue__main" onClick={() => playAt(i)} aria-label={`${isNow && player.playing ? "Pause" : "Play"} ${song.title}`}>
                    <span className="card__title">{song.title}</span>
                    <span className="small muted songs__facts">
                      {[song.artist, `${song.profile.tempoBpm} BPM`, `${song.profile.key} ${song.profile.mode}`, FEEL[song.profile.drumFeel]].filter(Boolean).join(" · ")}
                    </span>
                  </button>
                  <span className="songs__end">
                    {(!song.known || song.source === "basic") && <span className="chip chip--muted">Best guess</span>}
                    <button type="button" className="btn btn--sm btn--ghost" disabled={saved} aria-label={saved ? `${song.title} is in Your Loops` : `Save ${song.title}`} onClick={() => void save(song)}>
                      <Icon name={saved ? "check" : "plus"} size={14} />
                    </button>
                  </span>
                </li>
              );
            })}
          </ol>
          {guesses > 0 && (
            <p className="small muted beats__note">
              <b>Best guess</b> means we didn&apos;t recognise that exact song, so its beat follows the title and artist instead.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
