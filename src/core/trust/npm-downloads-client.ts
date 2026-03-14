import { Semaphore } from "../../utils/concurrency.js";
import { fetchWithRetry } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import { cacheNpmDownloads, getCachedNpmDownloads } from "../store/trust-api-store.js";

const NPM_DOWNLOADS_API = "https://api.npmjs.org/downloads/point/last-week";
const BULK_BATCH_SIZE = 128;

export async function fetchWeeklyDownloads(name: string): Promise<number | null> {
  const cached = getCachedNpmDownloads(name);
  if (cached !== undefined) {
    return cached;
  }

  const url = `${NPM_DOWNLOADS_API}/${encodeURIComponent(name)}`;

  try {
    const response = await fetchWithRetry(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        cacheNpmDownloads(name, null);
        return null;
      }
      logger.debug(`npm downloads query failed for ${name}: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as { downloads?: number };
    const downloads = data.downloads ?? null;
    cacheNpmDownloads(name, downloads);
    return downloads;
  } catch (error) {
    logger.debug(
      `npm downloads request error for ${name}: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

/**
 * Fetch weekly downloads for multiple packages in bulk.
 * The npm downloads API supports comma-separated unscoped package names in a single request.
 * Scoped packages (@scope/name) must be fetched individually.
 */
export async function fetchWeeklyDownloadsBatch(
  names: string[],
  concurrency = 3,
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  if (names.length === 0) return results;

  const unique = [...new Set(names)];
  const uncached: string[] = [];

  for (const name of unique) {
    const cached = getCachedNpmDownloads(name);
    if (cached === undefined) {
      uncached.push(name);
      continue;
    }
    if (cached != null) {
      results.set(name, cached);
    }
  }

  const unscoped = uncached.filter((n) => !n.startsWith("@"));
  const scoped = uncached.filter((n) => n.startsWith("@"));

  // Unscoped: bulk fetch in batches of BULK_BATCH_SIZE
  for (let i = 0; i < unscoped.length; i += BULK_BATCH_SIZE) {
    const batch = unscoped.slice(i, i + BULK_BATCH_SIZE);
    const url = `${NPM_DOWNLOADS_API}/${batch.join(",")}`;

    try {
      const response = await fetchWithRetry(
        url,
        { headers: { Accept: "application/json" } },
        { timeout: 15000, maxRetries: 1 },
      );

      if (!response.ok) {
        logger.debug(`npm bulk downloads query failed: ${response.status}`);
        continue;
      }

      const data = (await response.json()) as Record<string, { downloads?: number } | null>;

      // When querying a single package the response shape is { downloads: N }
      // When querying multiple the response is { pkg: { downloads: N }, ... }
      if (batch.length === 1 && "downloads" in data) {
        const dl = (data as unknown as { downloads?: number }).downloads;
        cacheNpmDownloads(batch[0], dl ?? null);
        if (dl != null) results.set(batch[0], dl);
      } else {
        const seen = new Set<string>();
        for (const [pkg, info] of Object.entries(data)) {
          seen.add(pkg);
          if (info?.downloads != null) {
            cacheNpmDownloads(pkg, info.downloads);
            results.set(pkg, info.downloads);
          } else {
            cacheNpmDownloads(pkg, null);
          }
        }
        for (const pkg of batch) {
          if (!seen.has(pkg)) {
            cacheNpmDownloads(pkg, null);
          }
        }
      }
    } catch (error) {
      logger.debug(`npm bulk downloads error: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Scoped: individual fetch with concurrency control
  if (scoped.length > 0) {
    const semaphore = new Semaphore(concurrency);
    const tasks = scoped.map((name) =>
      semaphore.run(async () => {
        const dl = await fetchWeeklyDownloads(name);
        if (dl != null) results.set(name, dl);
      }),
    );
    await Promise.allSettled(tasks);
  }

  return results;
}
