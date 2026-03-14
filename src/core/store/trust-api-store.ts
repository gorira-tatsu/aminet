import { logger } from "../../utils/logger.js";
import type { DepsdevProjectInfo, DepsdevVersionInfo } from "../trust/depsdev-types.js";
import { TTL } from "./config.js";
import { getDatabase } from "./database.js";

interface NpmDownloadsRow {
  weekly_downloads: number | null;
  fetched_at: number;
}

interface DepsdevVersionRow {
  data: string | null;
  fetched_at: number;
}

interface DepsdevProjectRow {
  data: string | null;
  fetched_at: number;
}

export function getCachedNpmDownloads(name: string, ecosystem = "npm"): number | null | undefined {
  const db = getDatabase();
  const row = db
    .query<NpmDownloadsRow, [string, string]>(
      "SELECT weekly_downloads, fetched_at FROM npm_downloads_cache WHERE ecosystem = ? AND name = ?",
    )
    .get(ecosystem, name);

  if (!row) return undefined;

  const age = Date.now() - row.fetched_at;
  if (age > TTL.npmDownloads) {
    logger.debug(`npm downloads cache expired: ${name} (${Math.round(age / 1000)}s old)`);
    return undefined;
  }

  logger.debug(`npm downloads cache hit: ${name}`);
  return row.weekly_downloads;
}

export function cacheNpmDownloads(
  name: string,
  weeklyDownloads: number | null,
  ecosystem = "npm",
): void {
  const db = getDatabase();
  db.run(
    `INSERT OR REPLACE INTO npm_downloads_cache (ecosystem, name, weekly_downloads, fetched_at)
     VALUES (?, ?, ?, ?)`,
    [ecosystem, name, weeklyDownloads, Date.now()],
  );
}

export function getCachedDepsdevVersion(
  name: string,
  version: string,
  ecosystem = "npm",
): DepsdevVersionInfo | null | undefined {
  const db = getDatabase();
  const row = db
    .query<DepsdevVersionRow, [string, string, string]>(
      "SELECT data, fetched_at FROM depsdev_versions_cache WHERE ecosystem = ? AND name = ? AND version = ?",
    )
    .get(ecosystem, name, version);

  if (!row) return undefined;

  const age = Date.now() - row.fetched_at;
  if (age > TTL.depsdevVersion) {
    logger.debug(
      `deps.dev version cache expired: ${name}@${version} (${Math.round(age / 1000)}s old)`,
    );
    return undefined;
  }

  logger.debug(`deps.dev version cache hit: ${name}@${version}`);
  return row.data ? (JSON.parse(row.data) as DepsdevVersionInfo) : null;
}

export function cacheDepsdevVersion(
  name: string,
  version: string,
  data: DepsdevVersionInfo | null,
  ecosystem = "npm",
): void {
  const db = getDatabase();
  db.run(
    `INSERT OR REPLACE INTO depsdev_versions_cache (ecosystem, name, version, data, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
    [ecosystem, name, version, data ? JSON.stringify(data) : null, Date.now()],
  );
}

export function getCachedDepsdevProject(projectId: string): DepsdevProjectInfo | null | undefined {
  const db = getDatabase();
  const row = db
    .query<DepsdevProjectRow, [string]>(
      "SELECT data, fetched_at FROM depsdev_projects_cache WHERE project_id = ?",
    )
    .get(projectId);

  if (!row) return undefined;

  const age = Date.now() - row.fetched_at;
  if (age > TTL.depsdevProject) {
    logger.debug(`deps.dev project cache expired: ${projectId} (${Math.round(age / 1000)}s old)`);
    return undefined;
  }

  logger.debug(`deps.dev project cache hit: ${projectId}`);
  return row.data ? (JSON.parse(row.data) as DepsdevProjectInfo) : null;
}

export function cacheDepsdevProject(projectId: string, data: DepsdevProjectInfo | null): void {
  const db = getDatabase();
  db.run(
    `INSERT OR REPLACE INTO depsdev_projects_cache (project_id, data, fetched_at)
     VALUES (?, ?, ?)`,
    [projectId, data ? JSON.stringify(data) : null, Date.now()],
  );
}
