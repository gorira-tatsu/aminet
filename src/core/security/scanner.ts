import { logger } from "../../utils/logger.js";
import type { DependencyGraph } from "../graph/types.js";
import { getPackument } from "../registry/npm-client.js";
import { cacheSecuritySignals, getCachedSecuritySignals } from "../store/security-store.js";
import { detectDeprecated } from "./deprecated.js";
import { detectInstallScripts } from "./install-scripts.js";
import { assessMaintainerRisk } from "./maintainer-risk.js";
import { detectPublishAnomalies } from "./publish-anomaly.js";
import type { SecurityScanResult, SecuritySignal } from "./types.js";
import { detectTyposquatting } from "./typosquatting.js";

export async function scanSecuritySignals(graph: DependencyGraph): Promise<SecurityScanResult> {
  const allSignals: SecuritySignal[] = [];

  for (const node of graph.nodes.values()) {
    if (node.depth === 0) continue; // Skip root

    // Check cache first
    const cached = getCachedSecuritySignals(node.name, node.version);
    if (cached) {
      allSignals.push(...cached);
      continue;
    }

    const signals: SecuritySignal[] = [];

    try {
      const packument = await getPackument(node.name);
      const versionInfo = packument.versions?.[node.version];

      if (versionInfo) {
        // Install scripts
        signals.push(...detectInstallScripts(node.name, node.version, versionInfo));

        // Deprecated
        signals.push(...detectDeprecated(node.name, node.version, versionInfo));
      }

      // Typosquatting
      signals.push(...detectTyposquatting(node.name, node.version));

      // Maintainer risk
      signals.push(...assessMaintainerRisk(node.name, node.version, packument));

      // Publish anomalies
      signals.push(...detectPublishAnomalies(node.name, node.version, packument));
    } catch (error) {
      logger.debug(
        `Security scan failed for ${node.id}: ${error instanceof Error ? error.message : error}`,
      );
    }

    // Cache results
    cacheSecuritySignals(node.name, node.version, signals);
    allSignals.push(...signals);
  }

  return {
    signals: allSignals,
    summary: buildSummary(allSignals),
  };
}

function buildSummary(signals: SecuritySignal[]): SecurityScanResult["summary"] {
  let criticalCount = 0;
  let highCount = 0;
  let mediumCount = 0;
  let lowCount = 0;
  let infoCount = 0;

  for (const s of signals) {
    switch (s.severity) {
      case "critical":
        criticalCount++;
        break;
      case "high":
        highCount++;
        break;
      case "medium":
        mediumCount++;
        break;
      case "low":
        lowCount++;
        break;
      case "info":
        infoCount++;
        break;
    }
  }

  return { criticalCount, highCount, mediumCount, lowCount, infoCount };
}
