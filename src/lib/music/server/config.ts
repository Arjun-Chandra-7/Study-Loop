import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";

/** Files shared with the worker. Resolved from the repo root so `next dev`/`next start` and the worker agree. */
export const PIPELINE_FILE = path.join(process.cwd(), "worker", "pipeline.json");
export const SCHEMA_FILE = path.join(process.cwd(), "worker", "schema.sql");

export interface Pipeline {
  pipelineVersion: number;
  model: string;
  modelVersion: string;
  modelSignatures: string[];
  params: Record<string, unknown>;
}

const mb = (name: string, fallback: number) => Number(process.env[name] ?? fallback) * 1024 * 1024;

export function musicConfig() {
  return {
    // Runtime storage, not part of the build: keep the bundler from tracing it.
    dataDir: path.resolve(/*turbopackIgnore: true*/ process.env.MUSIC_DATA_DIR || path.join(process.cwd(), ".data", "music")),
    maxUploadBytes: mb("MUSIC_MAX_UPLOAD_MB", 150),
    maxDurationS: Number(process.env.MUSIC_MAX_DURATION_S ?? 15 * 60),
    urlTtlS: Number(process.env.MUSIC_URL_TTL_S ?? 2 * 60 * 60),
    signingSecret: process.env.MUSIC_SIGNING_SECRET || null,
    spotify: {
      clientId: process.env.SPOTIFY_CLIENT_ID || null,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || null,
    },
  };
}

let pipeline: Pipeline | null = null;

/** The processing identity the worker runs (worker/pipeline.json). Part of every cache key. */
export function loadPipeline(): Pipeline {
  pipeline ??= JSON.parse(readFileSync(PIPELINE_FILE, "utf8")) as Pipeline;
  return pipeline;
}
