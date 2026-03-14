import type { NpmVersionInfo } from "../registry/types.js";
import type { SecuritySignal } from "./types.js";

export function detectDeprecated(
  name: string,
  version: string,
  versionInfo: NpmVersionInfo,
): SecuritySignal[] {
  const signals: SecuritySignal[] = [];

  if (versionInfo.deprecated) {
    signals.push({
      category: "deprecated",
      severity: "low",
      packageId: `${name}@${version}`,
      name,
      version,
      title: "Package is deprecated",
      description: `${name}@${version}: ${versionInfo.deprecated}`,
      details: {
        deprecationMessage: versionInfo.deprecated,
      },
    });
  }

  return signals;
}
