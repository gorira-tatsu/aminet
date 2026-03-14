import type { NpmPackument } from "../registry/types.js";

export interface FreshnessReport {
  packageId: string;
  name: string;
  currentVersion: string;
  latestVersion: string;
  versionsBehind: number;
  daysSinceCurrentPublish: number | null;
  status: "current" | "minor-behind" | "major-behind" | "outdated" | "abandoned";
}

export function analyzeFreshness(
  name: string,
  version: string,
  packument: NpmPackument,
): FreshnessReport {
  const latestVersion = packument["dist-tags"]?.latest ?? version;
  const allVersions = Object.keys(packument.versions);

  // Count versions published after current version
  const currentIdx = allVersions.indexOf(version);
  const latestIdx = allVersions.indexOf(latestVersion);
  const versionsBehind = currentIdx >= 0 && latestIdx >= 0 ? latestIdx - currentIdx : 0;

  // Days since the current version was published
  let daysSinceCurrentPublish: number | null = null;
  if (packument.time?.[version]) {
    const publishDate = new Date(packument.time[version]);
    daysSinceCurrentPublish = Math.floor(
      (Date.now() - publishDate.getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  // Days since any version was published (for abandoned check)
  let daysSinceAnyPublish: number | null = null;
  if (packument.time?.modified) {
    daysSinceAnyPublish = Math.floor(
      (Date.now() - new Date(packument.time.modified).getTime()) / (24 * 60 * 60 * 1000),
    );
  }

  const status = classifyStatus(version, latestVersion, versionsBehind, daysSinceAnyPublish);

  return {
    packageId: `${name}@${version}`,
    name,
    currentVersion: version,
    latestVersion,
    versionsBehind: Math.max(0, versionsBehind),
    daysSinceCurrentPublish,
    status,
  };
}

function classifyStatus(
  current: string,
  latest: string,
  _versionsBehind: number,
  daysSinceAnyPublish: number | null,
): FreshnessReport["status"] {
  // Abandoned: no publish in 2+ years
  if (daysSinceAnyPublish !== null && daysSinceAnyPublish > 730) {
    return "abandoned";
  }

  if (current === latest) {
    return "current";
  }

  // Parse major versions
  const currentMajor = parseMajor(current);
  const latestMajor = parseMajor(latest);

  if (currentMajor !== null && latestMajor !== null) {
    const majorDiff = latestMajor - currentMajor;
    if (majorDiff >= 3) return "outdated";
    if (majorDiff >= 1) return "major-behind";
  }

  return "minor-behind";
}

function parseMajor(version: string): number | null {
  const match = version.match(/^(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}
