"use client";

import { useCallback, useEffect, useState } from "react";
import { MusicApiError, musicApi } from "./client";
import { player } from "./player";
import type { JobView, StudyMode, TrackView } from "./types";

const POLL_MS = 1500;
export const isActive = (job: JobView | null) =>
  job?.status === "queued" || job?.status === "processing" || job?.status === "finalizing";

function without<T>(record: Record<string, T>, key: string): Record<string, T> {
  const next = { ...record };
  delete next[key];
  return next;
}

const message = (e: unknown) => (e instanceof MusicApiError ? e.message : "Something went wrong. Try again.");

export function useMusicLibrary(api = musicApi) {
  const [tracks, setTracks] = useState<TrackView[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** Per-track upload progress (0–1) while a file is being sent. */
  const [uploads, setUploads] = useState<Record<string, number>>({});
  /** Per-track errors from upload / process requests (job failures live on the job). */
  const [errors, setErrors] = useState<Record<string, string>>({});

  const patch = useCallback((t: TrackView) => setTracks((ts) => ts?.map((x) => (x.id === t.id ? t : x)) ?? [t]), []);
  const setError = (id: string, msg: string | null) => setErrors((e) => (msg ? { ...e, [id]: msg } : without(e, id)));

  const reload = useCallback(
    () =>
      api.tracks().then(
        (ts) => {
          setTracks(ts);
          setLoadError(null);
        },
        (e) => setLoadError(message(e)),
      ),
    [api],
  );

  useEffect(() => {
    let live = true;
    api.tracks().then(
      (ts) => live && setTracks(ts),
      (e) => live && setLoadError(message(e)),
    );
    return () => {
      live = false;
    };
  }, [api]);

  // Let the shared player fetch fresh links when old ones expire.
  useEffect(() => {
    player.refetch = (id) => api.versions(id);
  }, [api]);

  // Poll only the jobs that are still moving.
  const activeJobs = (tracks ?? []).filter((t) => isActive(t.job)).map((t) => `${t.id}:${t.job!.id}`).join(",");
  useEffect(() => {
    if (!activeJobs) return;
    let stopped = false;
    const tick = async () => {
      for (const pair of activeJobs.split(",")) {
        const [trackId, jobId] = pair.split(":");
        try {
          const job = await api.job(jobId);
          if (stopped) return;
          setTracks((ts) => ts?.map((t) => (t.id === trackId ? { ...t, job } : t)) ?? ts);
          if (job.status === "completed" && player.getSnapshot().track?.id === trackId) {
            player.update(await api.versions(trackId));
          }
        } catch {
          // Transient: keep the last known state and try again next tick.
        }
      }
    };
    const id = setInterval(tick, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [activeJobs, api]);

  const importSpotify = async (url: string) => {
    const r = await api.importSpotify(url);
    setTracks(r.tracks);
    return r;
  };

  const addTrack = async (title: string, artist: string) => {
    const t = await api.addTrack(title, artist);
    setTracks((ts) => [t, ...(ts ?? [])]);
    return t;
  };

  const upload = async (trackId: string, file: File) => {
    setError(trackId, null);
    setUploads((u) => ({ ...u, [trackId]: 0 }));
    try {
      patch(await api.upload(trackId, file, (f) => setUploads((u) => ({ ...u, [trackId]: f }))));
    } catch (e) {
      setError(trackId, message(e));
    } finally {
      setUploads((u) => without(u, trackId));
    }
  };

  const process = async (trackId: string) => {
    setError(trackId, null);
    try {
      const job = await api.process(trackId);
      setTracks((ts) => ts?.map((t) => (t.id === trackId ? { ...t, job } : t)) ?? ts);
      if (job.status === "completed" && player.getSnapshot().track?.id === trackId) {
        player.update(await api.versions(trackId));
      }
    } catch (e) {
      setError(trackId, message(e));
    }
  };

  const play = async (trackId: string, mode?: StudyMode) => {
    const track = tracks?.find((t) => t.id === trackId);
    if (!track) return;
    setError(trackId, null);
    try {
      player.open(track, await api.versions(trackId), { mode, autoplay: true });
    } catch (e) {
      setError(trackId, message(e));
    }
  };

  return { tracks, loadError, uploads, errors, reload, importSpotify, addTrack, upload, process, play };
}
