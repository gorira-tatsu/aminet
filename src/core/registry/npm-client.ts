import { fetchWithRetry } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import { cachePackument, getCachedPackument } from "../store/packument-store.js";
import type { NpmPackument } from "./types.js";

const NPM_REGISTRY = "https://registry.npmjs.org";

/** In-memory cache for current process (avoids repeated DB reads) */
const memoryCache = new Map<string, NpmPackument>();

let useCache = true;

export function setNpmCacheEnabled(enabled: boolean): void {
  useCache = enabled;
}

export async function getPackument(name: string): Promise<NpmPackument> {
  // Check in-memory cache first
  const memCached = memoryCache.get(name);
  if (memCached) return memCached;

  // Check SQLite cache
  if (useCache) {
    const dbCached = getCachedPackument(name) as NpmPackument | null;
    if (dbCached) {
      memoryCache.set(name, dbCached);
      return dbCached;
    }
  }

  const encodedName = name.startsWith("@")
    ? `@${encodeURIComponent(name.slice(1))}`
    : encodeURIComponent(name);

  const url = `${NPM_REGISTRY}/${encodedName}`;
  logger.debug(`Fetching packument: ${name}`);

  const response = await fetchWithRetry(url, {
    headers: { Accept: "application/json" },
  });

  if (response.status === 404) {
    throw new Error(`Package not found: ${name}`);
  }

  if (!response.ok) {
    throw new Error(`Failed to fetch ${name}: ${response.status} ${response.statusText}`);
  }

  const packument = (await response.json()) as NpmPackument;

  // Always write to DB (even with --no-cache, builds cache for next run)
  cachePackument(name, packument);
  memoryCache.set(name, packument);

  return packument;
}

export function clearPackumentCache(): void {
  memoryCache.clear();
}
