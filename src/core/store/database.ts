import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { logger } from "../../utils/logger.js";
import { createDatabase, type DatabaseLike } from "./adapter.js";
import { runMigrations } from "./migrations.js";

const DB_DIR = join(homedir(), ".aminet");
const DB_PATH = join(DB_DIR, "aminet.db");

let instance: DatabaseLike | null = null;
let persistentCacheAvailable = true;
let persistentCacheFailureReason: string | null = null;
let warnedPersistentCacheFailure = false;

class NullQuery<T, P extends unknown[]> {
  get(..._params: P): T | null {
    return null;
  }

  all(..._params: P): T[] {
    return [];
  }
}

class NullStatement {
  run(..._params: unknown[]): { changes: number } {
    return { changes: 0 };
  }
}

class NullDatabase implements DatabaseLike {
  exec(_sql: string): void {}

  run(_sql: string, _params: unknown[] = []): { changes: number } {
    return { changes: 0 };
  }

  query<T, P extends unknown[]>(_sql: string): NullQuery<T, P> {
    return new NullQuery<T, P>();
  }

  prepare(_sql: string): NullStatement {
    return new NullStatement();
  }

  transaction<T>(fn: () => T): () => T {
    return () => fn();
  }

  close(): void {}
}

/** Get or create the singleton database connection */
export function getDatabase(dbPath?: string): DatabaseLike {
  if (instance) return instance;

  const path = dbPath ?? DB_PATH;

  try {
    if (path !== ":memory:") {
      if (!existsSync(DB_DIR)) {
        mkdirSync(DB_DIR, { recursive: true });
      }
    }

    logger.debug(`Opening database: ${path}`);
    const db = createDatabase(path);

    // Performance optimizations
    db.exec("PRAGMA journal_mode = WAL");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA cache_size = -64000"); // 64MB
    db.exec("PRAGMA busy_timeout = 5000");

    runMigrations(db);

    persistentCacheAvailable = true;
    persistentCacheFailureReason = null;
    instance = db;
    return db;
  } catch (error) {
    persistentCacheAvailable = false;
    persistentCacheFailureReason =
      error instanceof Error ? error.message : "Failed to initialize persistent cache";
    instance = new NullDatabase();

    if (!warnedPersistentCacheFailure) {
      logger.warn(
        `Persistent cache unavailable for this run: ${persistentCacheFailureReason}. Analyze and review will continue without the on-disk cache.`,
      );
      warnedPersistentCacheFailure = true;
    }

    return instance;
  }
}

/** Close and reset the singleton (for testing) */
export function closeDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
  persistentCacheAvailable = true;
  persistentCacheFailureReason = null;
  warnedPersistentCacheFailure = false;
}

/** Reset singleton without closing (for test DI) */
export function setDatabase(db: DatabaseLike): void {
  instance = db;
  persistentCacheAvailable = true;
  persistentCacheFailureReason = null;
}

export function isPersistentCacheAvailable(): boolean {
  return persistentCacheAvailable;
}

export function getPersistentCacheFailureReason(): string | null {
  return persistentCacheFailureReason;
}
