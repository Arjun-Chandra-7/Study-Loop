import "server-only";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { musicConfig, SCHEMA_FILE } from "./config";
import { ApiError } from "./http";
import { log } from "./log";

/**
 * The music library lives in SQLite (built into Node 22+) next to the files it describes.
 * The schema is shared with the Python worker: worker/schema.sql.
 */
let db: DatabaseSync | null = null;
let dbPath: string | null = null;

export function getDb(): DatabaseSync {
  const { dataDir } = musicConfig();
  const file = path.join(dataDir, "music.db");
  if (db && dbPath === file) return db;
  db?.close();
  db = null;
  try {
    mkdirSync(path.join(dataDir, "tmp"), { recursive: true });
    const opened = new DatabaseSync(file);
    opened.exec("PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON;");
    opened.exec(readFileSync(SCHEMA_FILE, "utf8"));
    db = opened;
  } catch (e) {
    // Read-only or missing storage (e.g. a serverless deploy): the rest of the app keeps working.
    log("storage_failed", { error: (e as Error).name, code: (e as { code?: string }).code });
    throw new ApiError(503, "storage_unavailable", "Your music library isn't available on this server.");
  }
  dbPath = file;
  return db;
}

/** Test hook: forget the open handle so the next call re-reads MUSIC_DATA_DIR. */
export function closeDb() {
  db?.close();
  db = null;
  dbPath = null;
}

type Params = SQLInputValue[];

export const q = {
  get<T>(sql: string, ...params: Params): T | undefined {
    return getDb().prepare(sql).get(...params) as T | undefined;
  },
  all<T>(sql: string, ...params: Params): T[] {
    return getDb().prepare(sql).all(...params) as T[];
  },
  run(sql: string, ...params: Params) {
    return getDb().prepare(sql).run(...params);
  },
};

export function tx<T>(fn: () => T): T {
  const d = getDb();
  d.exec("BEGIN IMMEDIATE");
  try {
    const out = fn();
    d.exec("COMMIT");
    return out;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

export const newId = () => crypto.randomUUID().replaceAll("-", "");
