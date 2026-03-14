import { logger } from "../../utils/logger.js";
import type { NpmPackument } from "../registry/types.js";
import type { DepsdevBatchResult } from "./depsdev-client.js";
import { fetchDepsdevProject, fetchDepsdevVersion } from "./depsdev-client.js";
import { fetchWeeklyDownloads } from "./npm-downloads-client.js";
import type { TrustInput } from "./types.js";

export interface TrustInputSources {
  weeklyDownloads?: number | null;
  depsdev?: DepsdevBatchResult | null;
}

export function buildTrustInput(
  name: string,
  version: string,
  packument: NpmPackument,
  sources: TrustInputSources = {},
): TrustInput {
  const depsdev = sources.depsdev ?? null;
  const weeklyDownloads = sources.weeklyDownloads ?? null;

  // Extract data from packument
  const maintainerCount = packument.maintainers?.length ?? 0;
  const versionKeys = Object.keys(packument.versions);
  const versionCount = versionKeys.length;

  // Package age from time metadata
  let packageAgeMs: number | null = null;
  let daysSinceLastPublish: number | null = null;
  if (packument.time) {
    const created = packument.time.created;
    if (created) {
      packageAgeMs = Date.now() - new Date(created).getTime();
    }

    const modified = packument.time.modified;
    if (modified) {
      daysSinceLastPublish = (Date.now() - new Date(modified).getTime()) / (24 * 60 * 60 * 1000);
    }
  }

  // Deprecated version ratio
  let deprecatedCount = 0;
  for (const v of Object.values(packument.versions)) {
    if (v.deprecated) deprecatedCount++;
  }
  const deprecatedVersionRatio = versionCount > 0 ? deprecatedCount / versionCount : 0;

  return {
    name,
    version,
    weeklyDownloads,
    maintainerCount,
    hasGithubRepo: depsdev?.hasGithubRepo ?? false,
    packageAgeMs,
    daysSinceLastPublish,
    versionCount,
    hasProvenance: (depsdev?.versionInfo?.slsaProvenances?.length ?? 0) > 0,
    scorecardScore: depsdev?.scorecardScore ?? null,
    knownVulnCount: depsdev?.versionInfo?.advisoryKeys?.length ?? 0,
    deprecatedVersionRatio,
  };
}

export async function collectTrustData(
  name: string,
  version: string,
  packument: NpmPackument,
): Promise<TrustInput> {
  // Parallel fetch: deps.dev + npm downloads
  const [depsdevResult, downloadsResult] = await Promise.allSettled([
    fetchDepsdevVersion(name, version),
    fetchWeeklyDownloads(name),
  ]);

  const depsdev = depsdevResult.status === "fulfilled" ? depsdevResult.value : null;
  const weeklyDownloads = downloadsResult.status === "fulfilled" ? downloadsResult.value : null;

  // Fetch scorecard from related project if available
  let scorecardScore: number | null = null;
  let hasGithubRepo = false;

  if (depsdev?.relatedProjects && depsdev.relatedProjects.length > 0) {
    const githubProject = depsdev.relatedProjects.find((p) =>
      p.projectKey.id.startsWith("github.com/"),
    );
    if (githubProject) {
      hasGithubRepo = true;
      try {
        const project = await fetchDepsdevProject(githubProject.projectKey.id);
        if (project?.scorecard) {
          scorecardScore = project.scorecard.score;
        }
      } catch {
        logger.debug(`Failed to fetch scorecard for ${name}`);
      }
    }
  }

  return buildTrustInput(name, version, packument, {
    weeklyDownloads,
    depsdev: {
      versionInfo: depsdev,
      scorecardScore,
      hasGithubRepo,
    },
  });
}
