"use client";

import { vibeEngine } from "@/lib/music/vibe/engine";
import { useStudyLoop } from "@/lib/useStudyLoop";
import { Icon } from "../../ui/Icon";
import { FEEL, STATE_WORD, useLoopPlayer } from "./shared";

/** Whatever Loop is loaded, live: tempo, feel, and how it's responding to you. */
export function NowPlaying() {
  const s = useStudyLoop();
  const { playing, loop, params } = useLoopPlayer();

  if (!loop) {
    return (
      <section className="card music-player music-player--empty" aria-label="Now playing">
        <p className="label">Now playing</p>
        <p className="small muted">Nothing&apos;s playing yet. Start a Loop and it&apos;ll settle in here — its tempo, its mood, and how it&apos;s responding to you.</p>
      </section>
    );
  }

  const song = loop.queue?.[loop.index ?? 0];
  const many = (loop.queue?.length ?? 0) > 1;

  return (
    <section className="card music-player" aria-label="Now playing" data-lenis-prevent>
      <div className="music-player__top">
        <div className="music-player__title">
          <p className="label">
            Now playing
            {playing && <span className="live-dot" aria-hidden />}
          </p>
          <p className="music-player__name">{loop.name}</p>
          <p className="card__sub">
            {song
              ? [song.artist, `song ${(loop.index ?? 0) + 1} of ${loop.queue!.length}`].filter(Boolean).join(" · ")
              : loop.playlistName
                ? `From ${loop.playlistName}`
                : "Your Loop"}
          </p>
        </div>
        <div className="music-player__ctl">
          {many && (
            <button type="button" className="btn btn--sm btn--ghost" aria-label="Previous song" onClick={() => void vibeEngine.skip(-1)}>
              <Icon name="prev" size={14} />
            </button>
          )}
          <button type="button" className="play-btn play-btn--lg" aria-label={playing ? "Pause" : "Play"} onClick={() => void vibeEngine.toggle()} data-running={playing || undefined}>
            <Icon name={playing ? "pause" : "play"} size={20} />
          </button>
          {many && (
            <button type="button" className="btn btn--sm btn--ghost" aria-label="Next song" onClick={() => void vibeEngine.skip(1)}>
              <Icon name="next" size={14} />
            </button>
          )}
        </div>
      </div>
      <p className="small muted">{loop.profile.summary}</p>
      <dl className="np-stats">
        <div>
          <dt>Tempo</dt>
          <dd className="tnum">{params?.bpm ?? loop.profile.tempoBpm} BPM</dd>
        </div>
        <div>
          <dt>Key</dt>
          <dd>
            {loop.profile.key} {loop.profile.mode}
          </dd>
        </div>
        <div>
          <dt>Groove</dt>
          <dd>{FEEL[loop.profile.drumFeel]}</dd>
        </div>
      </dl>
      <p className="beats__state" aria-live="polite">
        <Icon name={s.physio === "elevated" ? "rise" : s.physio === "recovering" ? "recover" : "heart"} size={14} />
        <span>
          <b>{STATE_WORD[s.physio]}</b> · {params?.label ?? "Following the song's feel"}
        </span>
      </p>
    </section>
  );
}
