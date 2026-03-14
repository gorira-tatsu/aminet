import type { NpmPackument } from "../registry/types.js";
import type { SecuritySignal } from "./types.js";

export function assessMaintainerRisk(
  name: string,
  version: string,
  packument: NpmPackument,
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];
  const packageId = `${name}@${version}`;

  const maintainers = packument.maintainers;
  if (!maintainers || maintainers.length === 0) {
    signals.push({
      category: "maintainer-risk",
      severity: "medium",
      packageId,
      name,
      version,
      title: "No maintainer information",
      description: "Package has no maintainer information available",
      details: { maintainerCount: 0 },
    });
    return signals;
  }

  if (maintainers.length === 1) {
    signals.push({
      category: "maintainer-risk",
      severity: "info",
      packageId,
      name,
      version,
      title: "Single maintainer (bus factor = 1)",
      description: `Package "${name}" has only one maintainer: ${maintainers[0].name}`,
      details: {
        maintainerCount: 1,
        maintainers: maintainers.map((m) => m.name),
      },
    });
  }

  return signals;
}
