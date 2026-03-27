import { fetchWithRetry } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import { cachePackument, getCachedPackument } from "../store/packument-store.js";
import type { NpmPackument } from "./types.js";

const NPM_REGISTRY = "https://registry.npmjs.org";

/** In-memory cache for current process (avoids repeated DB reads) */
const memoryCache = new Map<string, NpmPackument>();

let useCache = true;
let npmToken: string | undefined;

export function setNpmCacheEnabled(enabled: boolean): void {
  useCache = enabled;
}

export function setNpmToken(token: string | undefined): void {
  npmToken = token;
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

  const token = npmToken ?? process.env.NPM_TOKEN;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetchWithRetry(url, { headers });

  if (response.status === 401) {
    throw new Error(`Unauthorized: ${name} — check your npm token`);
  }

  if (response.status === 403) {
    throw new Error(`Forbidden: no access to ${name} — check your npm token permissions`);
  }

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
