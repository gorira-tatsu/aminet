import { logger } from "../../utils/logger.js";
import { TTL } from "./config.js";
import { getDatabase } from "./database.js";
import { packumentHash } from "./hash.js";

interface PackumentRow {
  ecosystem: string;
  name: string;
  hash: string;
  data: string;
  fetched_at: number;
}

export function getCachedPackument(name: string, ecosystem = "npm"): unknown | null {
  const db = getDatabase();
  const row = db
    .query<PackumentRow, [string, string]>(
      "SELECT data, fetched_at FROM packuments WHERE ecosystem = ? AND name = ?",
    )
    .get(ecosystem, name);

  if (!row) return null;

  const age = Date.now() - row.fetched_at;
  if (age > TTL.packument) {
    logger.debug(`Packument cache expired: ${name} (${Math.round(age / 1000)}s old)`);
    return null;
  }

  logger.debug(`Packument cache hit: ${name}`);
  return JSON.parse(row.data);
}

export function cachePackument(name: string, data: unknown, ecosystem = "npm"): void {
  const db = getDatabase();
  const hash = packumentHash(ecosystem, name);

  db.run(
    `INSERT OR REPLACE INTO packuments (ecosystem, name, hash, data, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
    [ecosystem, name, hash, JSON.stringify(data), Date.now()],
  );
}
