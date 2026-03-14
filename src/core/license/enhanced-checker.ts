import { Semaphore } from "../../utils/concurrency.js";
import { logger } from "../../utils/logger.js";
import type { DependencyGraph, PackageNode } from "../graph/types.js";
import { cacheLicenseIntelligence, getCachedLicenseIntelligence } from "../store/license-store.js";
import { fetchClearlyDefinedLicense } from "./clearlydefined-client.js";

export interface EnhancedLicense {
  declared: string | null;
  discovered: string | null;
  confidence: "high" | "medium" | "low";
  mismatch: boolean;
  attributionParties: string[];
}

export interface EnhancedLicenseResult {
  results: Map<string, EnhancedLicense>;
  mismatches: Array<{
    packageId: string;
    declared: string;
    discovered: string;
  }>;
}

export async function checkEnhancedLicenses(
  graph: DependencyGraph,
  useCache = true,
): Promise<EnhancedLicenseResult> {
  const results = new Map<string, EnhancedLicense>();
  const mismatches: EnhancedLicenseResult["mismatches"] = [];
  const uncachedNodes: PackageNode[] = [];

  for (const node of graph.nodes.values()) {
    if (node.depth === 0) continue;

    // Check cache
    if (useCache) {
      const cached = getCachedLicenseIntelligence(node.name, node.version);
      if (cached) {
        results.set(node.id, cached);
        if (cached.mismatch && cached.declared && cached.discovered) {
          mismatches.push({
            packageId: node.id,
            declared: cached.declared,
            discovered: cached.discovered,
          });
        }
        continue;
      }
    }
    uncachedNodes.push(node);
  }

  const semaphore = new Semaphore(3);
  const tasks = uncachedNodes.map((node) =>
    semaphore.run(async () => {
      try {
        const enhanced = await fetchClearlyDefinedLicense(node.name, node.version);
        if (!enhanced) return;

        results.set(node.id, enhanced);
        cacheLicenseIntelligence(node.name, node.version, enhanced);

        if (enhanced.mismatch && enhanced.declared && enhanced.discovered) {
          mismatches.push({
            packageId: node.id,
            declared: enhanced.declared,
            discovered: enhanced.discovered,
          });
        }
      } catch (error) {
        logger.debug(
          `Enhanced license check failed for ${node.id}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }),
  );

  await Promise.allSettled(tasks);

  return { results, mismatches };
}
