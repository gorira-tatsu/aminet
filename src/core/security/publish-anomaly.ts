import type { NpmPackument } from "../registry/types.js";
import type { SecuritySignal } from "./types.js";

export function detectPublishAnomalies(
  name: string,
  version: string,
  packument: NpmPackument,
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];
  const packageId = `${name}@${version}`;

  if (!packument.time) return signals;

  const timeEntries = Object.entries(packument.time)
    .filter(([key]) => key !== "created" && key !== "modified")
    .map(([ver, ts]) => ({ version: ver, timestamp: new Date(ts).getTime() }))
    .sort((a, b) => a.timestamp - b.timestamp);

  if (timeEntries.length === 0) return signals;

  // Check for version burst: 3+ versions within 1 hour
  for (let i = 0; i < timeEntries.length - 2; i++) {
    const window = timeEntries.slice(i, i + 3);
    const span = window[2].timestamp - window[0].timestamp;
    if (span <= 3600_000) {
      // Only report if the target version is in this burst
      const burstVersions = window.map((w) => w.version);
      if (burstVersions.includes(version)) {
        signals.push({
          category: "publish-anomaly",
          severity: "medium",
          packageId,
          name,
          version,
          title: "Rapid version burst detected",
          description: `3 versions published within 1 hour: ${burstVersions.join(", ")}`,
          details: {
            burstVersions,
            spanMs: span,
          },
        });
        break; // One signal per package
      }
    }
  }

  // Check for dormancy: 365+ days since previous version
  const currentEntry = timeEntries.find((e) => e.version === version);
  if (currentEntry) {
    const idx = timeEntries.indexOf(currentEntry);
    if (idx > 0) {
      const previousEntry = timeEntries[idx - 1];
      const gap = currentEntry.timestamp - previousEntry.timestamp;
      const dayGap = gap / (1000 * 60 * 60 * 24);
      if (dayGap >= 365) {
        signals.push({
          category: "publish-anomaly",
          severity: "medium",
          packageId,
          name,
          version,
          title: "Published after long dormancy",
          description: `Version ${version} published ${Math.floor(dayGap)} days after previous version ${previousEntry.version}`,
          details: {
            previousVersion: previousEntry.version,
            daysSincePrevious: Math.floor(dayGap),
          },
        });
      }
    }
  }

  // Check for new package: first publish within 7 days
  const created = packument.time.created
    ? new Date(packument.time.created).getTime()
    : timeEntries[0]?.timestamp;
  if (created) {
    const age = Date.now() - created;
    const ageDays = age / (1000 * 60 * 60 * 24);
    if (ageDays <= 7) {
      signals.push({
        category: "publish-anomaly",
        severity: "low",
        packageId,
        name,
        version,
        title: "Recently created package",
        description: `Package was first published ${Math.floor(ageDays)} day(s) ago`,
        details: {
          createdAt: new Date(created).toISOString(),
          ageDays: Math.floor(ageDays),
        },
      });
    }
  }

  return signals;
}
