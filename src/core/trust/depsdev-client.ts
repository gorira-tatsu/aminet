import { Semaphore } from "../../utils/concurrency.js";
import { fetchWithRetry } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import {
  cacheDepsdevProject,
  cacheDepsdevVersion,
  getCachedDepsdevProject,
  getCachedDepsdevVersion,
} from "../store/trust-api-store.js";
import type { DepsdevProjectInfo, DepsdevVersionInfo } from "./depsdev-types.js";

const DEPSDEV_API = "https://api.deps.dev/v3alpha";

export async function fetchDepsdevVersion(
  name: string,
  version: string,
): Promise<DepsdevVersionInfo | null> {
  const cached = getCachedDepsdevVersion(name, version);
  if (cached !== undefined) {
    return cached;
  }

  const encodedName = encodeURIComponent(name);
  const encodedVersion = encodeURIComponent(version);
  const url = `${DEPSDEV_API}/systems/npm/packages/${encodedName}/versions/${encodedVersion}`;

  try {
    const response = await fetchWithRetry(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug(`deps.dev: no data for ${name}@${version}`);
        cacheDepsdevVersion(name, version, null);
        return null;
      }
      logger.debug(`deps.dev query failed for ${name}@${version}: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as DepsdevVersionInfo;
    cacheDepsdevVersion(name, version, data);
    return data;
  } catch (error) {
    logger.debug(
      `deps.dev request error for ${name}@${version}: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

export async function fetchDepsdevProject(projectId: string): Promise<DepsdevProjectInfo | null> {
  const cached = getCachedDepsdevProject(projectId);
  if (cached !== undefined) {
    return cached;
  }

  const encodedId = encodeURIComponent(projectId);
  const url = `${DEPSDEV_API}/projects/${encodedId}`;

  try {
    const response = await fetchWithRetry(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      if (response.status === 404) {
        cacheDepsdevProject(projectId, null);
      }
      logger.debug(`deps.dev project query failed for ${projectId}: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as DepsdevProjectInfo;
    cacheDepsdevProject(projectId, data);
    return data;
  } catch (error) {
    logger.debug(
      `deps.dev project request error for ${projectId}: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

export interface DepsdevBatchResult {
  versionInfo: DepsdevVersionInfo | null;
  scorecardScore: number | null;
  hasGithubRepo: boolean;
}

/**
 * Fetch deps.dev version + project (scorecard) data for multiple packages.
 * Uses concurrency control. Only fetches project data when version fetch succeeds
 * and a GitHub project link exists.
 */
export async function fetchDepsdevBatch(
  packages: Array<{ name: string; version: string }>,
  concurrency = 5,
): Promise<Map<string, DepsdevBatchResult>> {
  const results = new Map<string, DepsdevBatchResult>();
  if (packages.length === 0) return results;

  const semaphore = new Semaphore(concurrency);

  const tasks = packages.map((pkg) =>
    semaphore.run(async () => {
      const key = `${pkg.name}@${pkg.version}`;

      const versionInfo = await fetchDepsdevVersion(pkg.name, pkg.version);

      let scorecardScore: number | null = null;
      let hasGithubRepo = false;

      if (versionInfo?.relatedProjects && versionInfo.relatedProjects.length > 0) {
        const githubProject = versionInfo.relatedProjects.find((p) =>
          p.projectKey.id.startsWith("github.com/"),
        );
        if (githubProject) {
          hasGithubRepo = true;
          const project = await fetchDepsdevProject(githubProject.projectKey.id);
          if (project?.scorecard) {
            scorecardScore = project.scorecard.score;
          }
        }
      }

      results.set(key, { versionInfo, scorecardScore, hasGithubRepo });
    }),
  );

  await Promise.allSettled(tasks);
  return results;
}
