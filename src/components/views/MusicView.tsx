"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { clock } from "@/lib/format";
import { MusicApiError } from "@/lib/music/client";
import { player, usePlayer } from "@/lib/music/player";
import { trackStatus } from "@/lib/music/status";
import { STUDY_MODES, type TrackView } from "@/lib/music/types";
import { useMusicLibrary } from "@/lib/music/useMusicLibrary";
import { Icon } from "../ui/Icon";

/** What the file picker offers; the server re-checks content, not just the name. */
const ACCEPT = ".mp3,.wav,.m4a,.flac,audio/mpeg,audio/wav,audio/x-wav,audio/mp4,audio/x-m4a,audio/flac";

type Library = ReturnType<typeof useMusicLibrary>;

/**
 * Music for study: bring a Spotify playlist (titles only), add audio you own, and listen to it
 * as Original, No Lyrics, Vocals Only or Beats Only. Separation happens out of sight.
 */
export function MusicView() {
  const lib = useMusicLibrary();
  const p = usePlayer();
  const [view, setView] = useState<"library" | "queue">("library");
  const upNext = Math.max(0, p.queue.length - p.index - 1);

  return (
    <div className="music" data-has-track={p.track ? "" : undefined}>
      <div className="music__lib">
        <h2 className="eyebrow music__eyebrow">
          <span className="eyebrow__rule" aria-hidden />
          Music for study
        </h2>
        <div className="music__bar">
          <div className="seg music__tabs" role="tablist" aria-label="Music">
            {(["library", "queue"] as const).map((v) => (
              <button key={v} id={`music-tab-${v}`} type="button" role="tab" aria-selected={view === v} aria-controls="music-panel" onClick={() => setView(v)}>
                {view === v && <span className="seg__thumb" aria-hidden />}
                <span>{v === "library" ? "Library" : `Up next${upNext ? ` · ${upNext}` : ""}`}</span>
              </button>
            ))}
          </div>
          <div className="music__bar-actions">
            <button type="button" className="icon-btn" aria-label="Shuffle play" title="Shuffle play" disabled={!lib.playable.length} onClick={() => void lib.playAll(true)}>
              <Icon name="shuffle" size={16} />
            </button>
            <button type="button" className="btn btn--sm btn--ghost" disabled={!lib.playable.length} onClick={() => void lib.playAll(false)}>
              <Icon name="play" size={14} />
              Play all
            </button>
          </div>
        </div>
        <div id="music-panel" className="music__panel" role="tabpanel" aria-labelledby={`music-tab-${view}`}>
          {view === "library" ? (
            <>
              <ImportBar lib={lib} />
              <TrackList lib={lib} currentId={p.track?.id ?? null} audible={p.playing} />
            </>
          ) : (
            <QueueList />
          )}
        </div>
      </div>
      <NowPlaying />
    </div>
  );
}

function ImportBar({ lib }: { lib: Library }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [manual, setManual] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const id = useId();

  const run = async (e: FormEvent, fn: () => Promise<string>) => {
    e.preventDefault();
    setBusy(true);
    setNote(null);
    try {
      setNote({ ok: true, text: await fn() });
    } catch (err) {
      setNote({ ok: false, text: err instanceof MusicApiError ? err.message : "Something went wrong. Try again." });
    } finally {
      setBusy(false);
    }
  };

  const doImport = (e: FormEvent) =>
    run(e, async () => {
      const r = await lib.importSpotify(url);
      setUrl("");
      const from = r.playlistName ? ` from ${r.playlistName}` : "";
      return r.added ? `Added ${r.added} track${r.added === 1 ? "" : "s"}${from}.` : `Those tracks are already in your music.`;
    });

  const doAdd = (e: FormEvent) =>
    run(e, async () => {
      await lib.addTrack(title, artist);
      setTitle("");
      setArtist("");
      setManual(false);
      return "Track added. Now add its audio.";
    });

  return (
    <div className="music-import">
      <form className="music-import__row" onSubmit={doImport}>
        <label className="sr-only" htmlFor={`${id}-url`}>
          Spotify playlist, album or track link
        </label>
        <input
          id={`${id}-url`}
          className="input"
          type="url"
          inputMode="url"
          placeholder="Paste a Spotify playlist link"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
        <button type="submit" className="btn btn--solid" disabled={busy || !url.trim()}>
          Import
        </button>
        <button
          type="button"
          className="btn btn--ghost music-import__toggle"
          aria-expanded={manual}
          aria-label="Not on Spotify? Add a track by name"
          onClick={() => setManual((m) => !m)}
        >
          <Icon name={manual ? "minus" : "plus"} size={14} />
          By name
        </button>
      </form>
      {manual && (
        <form className="music-import__row" onSubmit={doAdd}>
          <label className="sr-only" htmlFor={`${id}-title`}>
            Track name
          </label>
          <input id={`${id}-title`} className="input" placeholder="Track name" value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} required />
          <label className="sr-only" htmlFor={`${id}-artist`}>
            Artist
          </label>
          <input id={`${id}-artist`} className="input" placeholder="Artist" value={artist} maxLength={200} onChange={(e) => setArtist(e.target.value)} />
          <button type="submit" className="btn btn--ghost" disabled={busy || !title.trim()}>
            Add
          </button>
        </form>
      )}
      <p className={`music-import__note small ${note && !note.ok ? "is-error" : ""}`} role="status" aria-live="polite">
        {note && !note.ok && <Icon name="alert" size={14} />}
        {note?.text}
      </p>
    </div>
  );
}

function TrackList({ lib, currentId, audible }: { lib: Library; currentId: string | null; audible: boolean }) {
  if (lib.loadError) {
    return (
      <div className="music-empty" role="alert">
        <Icon name="alert" size={18} />
        <p className="small">{lib.loadError}</p>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void lib.reload()}>
          Try again
        </button>
      </div>
    );
  }
  if (!lib.tracks) {
    return (
      <p className="music-empty small muted" role="status">
        Loading your music…
      </p>
    );
  }
  if (!lib.tracks.length) {
    return (
      <div className="music-empty">
        <Icon name="music" size={20} />
        <p className="small muted">
          Nothing here yet. Import a Spotify playlist or add a track by name, then add audio you own for each track.
        </p>
      </div>
    );
  }
  return (
    <ul className="music__list" aria-label="Your music" data-lenis-prevent>
      {lib.tracks.map((t) => (
        <TrackCard key={t.id} track={t} lib={lib} current={t.id === currentId} audible={t.id === currentId && audible} />
      ))}
    </ul>
  );
}

function TrackCard({ track, lib, current, audible }: { track: TrackView; lib: Library; current: boolean; audible: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const status = trackStatus(track, lib.uploads[track.id]);
  const error = lib.errors[track.id];
  const busy = ["uploading", "queued", "processing", "finalizing"].includes(status.key);
  // Waiting in line isn't work happening, so it gets words but no moving bar.
  const working = busy && status.key !== "queued";
  const duration = track.audio?.durationS ?? (track.durationMs ? track.durationMs / 1000 : null);

  return (
    <li className="mtrack" data-status={status.key} data-playing={current || undefined}>
      <div className="mtrack__art" aria-hidden>
        {track.artworkUrl ? (
          // Spotify-hosted album art, shown as-is with attribution below.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.artworkUrl} alt="" width={48} height={48} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <Icon name="music" size={20} />
        )}
      </div>
      <div className="mtrack__meta">
        <p className="card__title">{track.title}</p>
        <p className="card__sub">
          {[track.artist, duration ? clock(duration * 1000) : null].filter(Boolean).join(" · ")}
          {track.spotifyUrl && (
            <>
              {" · "}
              <a href={track.spotifyUrl} target="_blank" rel="noopener noreferrer" className="mtrack__spotify">
                Spotify
              </a>
            </>
          )}
        </p>
      </div>

      <div className="mtrack__status">
        <p className={`mtrack__state state-word state-word--${status.key}`} aria-live="polite">
          <Icon name={status.icon} size={14} />
          <span>{status.label}</span>
          {status.progress !== null && <span className="tnum mtrack__pct">{Math.round(status.progress * 100)}%</span>}
        </p>
        {working && (
          <div
            className={`progress mtrack__bar ${status.progress === null ? "progress--indeterminate" : ""}`}
            role="progressbar"
            aria-label={status.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={status.progress === null ? undefined : Math.round(status.progress * 100)}
          >
            <span className="progress__fill" style={{ transform: `scaleX(${status.progress ?? 1})` }} />
          </div>
        )}
        {(status.detail || error) && (
          <p className={`mtrack__detail small ${error || status.key === "failed" ? "is-error" : "muted"}`} role={error ? "alert" : undefined}>
            {error ?? status.detail}
          </p>
        )}
      </div>

      <div className="mtrack__actions">
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void lib.upload(track.id, f);
          }}
        />
        {!busy && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => fileRef.current?.click()} aria-label={`${track.audio ? "Replace" : "Add"} audio for ${track.title}`}>
            <Icon name="upload" size={14} />
            {track.audio ? "Replace" : "Add audio"}
          </button>
        )}
        {(status.key === "ready" || status.key === "failed") && (
          <button type="button" className="btn btn--sm btn--primary" onClick={() => void lib.process(track.id)} aria-label={`${status.key === "failed" ? "Try processing again" : "Process"} ${track.title}`}>
            {status.key === "failed" ? "Try again" : "Process track"}
          </button>
        )}
        {track.audio && !current && (
          <button
            type="button"
            className="icon-btn"
            onClick={() => player.addToQueue(track)}
            aria-label={`Add ${track.title} to queue`}
            title="Add to queue"
          >
            <Icon name="queue" size={16} />
          </button>
        )}
        {track.audio && (
          <button
            type="button"
            className="icon-btn mtrack__play"
            onClick={() => (current ? player.toggle() : void lib.play(track.id))}
            aria-label={`${audible ? "Pause" : "Play"} ${track.title}`}
          >
            <Icon name={audible ? "pause" : "play"} size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function NowPlaying() {
  const p = usePlayer();
  const id = useId();
  if (!p.track) {
    return (
      <section className="card music-player music-player--empty" aria-label="Now playing">
        <p className="label">Now playing</p>
        <p className="small muted">Pick a track to start. Once it&apos;s processed you can switch between study versions while it plays.</p>
      </section>
    );
  }
  const current = STUDY_MODES.find((m) => m.id === p.mode)!;
  const enabled = STUDY_MODES.filter((m) => p.available.includes(m.id));

  // Radio-group keyboard pattern: arrows move between available versions, Tab leaves the group.
  const onModeKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step || enabled.length < 2) return;
    e.preventDefault();
    const i = enabled.findIndex((m) => m.id === p.mode);
    const next = enabled[(i + step + enabled.length) % enabled.length];
    player.setMode(next.id);
    e.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-mode="${next.id}"]`)?.focus();
  };

  return (
    <section className="card music-player" aria-label="Now playing" data-lenis-prevent>
      <div className="music-player__top">
        <div className="music-player__title">
          <p className="label">
            Now playing
            {p.loading && <span className="chip chip--muted">Loading…</span>}
          </p>
          <p className="music-player__name">{p.track.title}</p>
          <p className="card__sub">{p.track.artist}</p>
        </div>
        <div className="music-player__transport">
          <button type="button" className="icon-btn transport-toggle" aria-label="Shuffle" aria-pressed={p.shuffle} title={p.shuffle ? "Shuffle on" : "Shuffle off"} onClick={() => player.toggleShuffle()}>
            <Icon name="shuffle" size={16} />
          </button>
          <button type="button" className="icon-btn" aria-label="Previous" title="Previous" onClick={() => void player.previous()}>
            <Icon name="prev" size={16} />
          </button>
          <button type="button" className="play-btn" aria-label={p.playing ? "Pause" : "Play"} onClick={() => player.toggle()} data-running={p.playing || undefined}>
            <Icon name={p.playing ? "pause" : "play"} size={18} />
          </button>
          <button type="button" className="icon-btn" aria-label="Next" title="Next" disabled={!player.hasNext()} onClick={() => void player.next()}>
            <Icon name="next" size={16} />
          </button>
          <button
            type="button"
            className="icon-btn transport-toggle"
            aria-label={`Repeat: ${p.repeat === "off" ? "off" : p.repeat === "all" ? "all" : "this track"}`}
            aria-pressed={p.repeat !== "off"}
            title={p.repeat === "off" ? "Repeat off" : p.repeat === "all" ? "Repeat all" : "Repeat one"}
            onClick={() => player.cycleRepeat()}
          >
            <Icon name={p.repeat === "one" ? "repeatOne" : "repeat"} size={16} />
          </button>
        </div>
      </div>

      <div className="mode-grid" role="radiogroup" aria-labelledby={`${id}-mode`} aria-describedby={`${id}-hint`}>
        <p id={`${id}-mode`} className="label mode-grid__label">
          Study version
        </p>
        {STUDY_MODES.map((m) => {
          const available = p.available.includes(m.id);
          const active = p.mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              data-mode={m.id}
              aria-checked={active}
              tabIndex={active ? 0 : -1}
              disabled={!available}
              className="mode"
              onClick={() => player.setMode(m.id)}
              onKeyDown={onModeKey}
              title={available ? m.hint : "Process this track to unlock"}
            >
              <span className="mode__dot" aria-hidden />
              <span className="mode__name">{m.label}</span>
            </button>
          );
        })}
        <p id={`${id}-hint`} className="mode-grid__hint small muted">
          {enabled.length < STUDY_MODES.length ? "Process this track to unlock the other versions." : `${current.label}: ${current.hint.toLowerCase()}.`}
        </p>
      </div>

      <div className="music-player__seek tnum small muted">
        <span>{clock(p.time * 1000)}</span>
        <input
          type="range"
          className="scrub"
          min={0}
          max={p.duration || 0}
          step={0.1}
          value={Math.min(p.time, p.duration || 0)}
          onChange={(e) => player.seek(Number(e.target.value))}
          aria-label="Position"
          aria-valuetext={`${clock(p.time * 1000)} of ${clock(p.duration * 1000)}`}
          disabled={!p.duration}
          style={{ ["--pct" as string]: `${p.duration ? (p.time / p.duration) * 100 : 0}%` }}
        />
        <span>{clock(p.duration * 1000)}</span>
        <button type="button" className="icon-btn music-player__mute" aria-label={p.muted ? "Unmute" : "Mute"} onClick={() => player.toggleMute()}>
          <Icon name={p.muted || p.volume === 0 ? "mute" : "volume"} size={16} />
        </button>
        <input
          type="range"
          className="scrub scrub--volume"
          min={0}
          max={1}
          step={0.05}
          value={p.muted ? 0 : p.volume}
          onChange={(e) => player.setVolume(Number(e.target.value))}
          aria-label="Volume"
          aria-valuetext={`${Math.round((p.muted ? 0 : p.volume) * 100)}%`}
          style={{ ["--pct" as string]: `${(p.muted ? 0 : p.volume) * 100}%` }}
        />
      </div>
      {p.error && (
        <p className="small is-error" role="alert">
          {p.error}
        </p>
      )}
    </section>
  );
}

function QueueList() {
  const p = usePlayer();
  if (!p.queue.length) {
    return (
      <div className="music-empty">
        <Icon name="queue" size={20} />
        <p className="small muted">Nothing queued. Press play on a track, or add tracks to the queue from your library.</p>
      </div>
    );
  }
  return (
    <ol className="music__list music-queue" aria-label="Queue" data-lenis-prevent>
      {p.queue.map((t, i) => {
        const now = i === p.index;
        return (
          <li key={t.id} className="mqueue" data-now={now || undefined} data-played={i < p.index || undefined}>
            <span className="mqueue__n tnum" aria-hidden>
              {now ? <Icon name={p.playing ? "wave" : "pause"} size={14} /> : i + 1}
            </span>
            <button type="button" className="mqueue__main" onClick={() => void player.jumpTo(i)} aria-current={now || undefined} aria-label={`${now ? "Now playing: " : "Play "}${t.title}${t.artist ? ` by ${t.artist}` : ""}`}>
              <span className="card__title">{t.title}</span>
              <span className="card__sub">{t.artist}</span>
            </button>
            {!now && (
              <button type="button" className="icon-btn" aria-label={`Remove ${t.title} from queue`} onClick={() => player.removeFromQueue(i)}>
                <Icon name="close" size={14} />
              </button>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function MusicFoot() {
  return (
    <div className="foot foot--legend">
      <p>
        <span className="legend__swatch legend__swatch--measured" aria-hidden />
        <b>Your audio</b> stays private to your account
      </p>
      <p>
        <span className="legend__swatch legend__swatch--action" aria-hidden />
        <b>Spotify</b> provides titles and artwork only — StudyLoop never plays or copies Spotify audio
      </p>
    </div>
  );
}
