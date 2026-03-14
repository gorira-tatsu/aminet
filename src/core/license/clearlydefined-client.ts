import { fetchWithRetry } from "../../utils/http.js";
import { logger } from "../../utils/logger.js";
import type { ClearlyDefinedDefinition } from "./clearlydefined-types.js";
import type { EnhancedLicense } from "./enhanced-checker.js";

const CLEARLYDEFINED_API = "https://api.clearlydefined.io";

export async function fetchClearlyDefinedLicense(
  name: string,
  version: string,
): Promise<EnhancedLicense | null> {
  // ClearlyDefined uses format: npm/npmjs/-/name/version
  // For scoped packages: npm/npmjs/@scope/name/version
  const encodedName = name.startsWith("@") ? name.replace("/", "/") : `-/${name}`;

  const url = `${CLEARLYDEFINED_API}/definitions/npm/npmjs/${encodedName}/${version}`;

  try {
    const response = await fetchWithRetry(
      url,
      {
        headers: { Accept: "application/json" },
      },
      {
        timeout: 8000,
        maxRetries: 1,
        maxRateLimitRetries: 1,
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        logger.debug(`ClearlyDefined: no data for ${name}@${version}`);
        return null;
      }
      logger.debug(`ClearlyDefined query failed for ${name}@${version}: ${response.status}`);
      return null;
    }

    const data = (await response.json()) as ClearlyDefinedDefinition;
    return mapToEnhancedLicense(data);
  } catch (error) {
    logger.debug(
      `ClearlyDefined request error for ${name}@${version}: ${error instanceof Error ? error.message : error}`,
    );
    return null;
  }
}

function mapToEnhancedLicense(def: ClearlyDefinedDefinition): EnhancedLicense {
  const declared = def.licensed?.declared ?? null;
  const discoveredExpressions = def.licensed?.facets?.core?.discovered?.expressions ?? [];
  const discovered = discoveredExpressions.length > 0 ? discoveredExpressions[0] : null;
  const attributionParties = def.licensed?.facets?.core?.attribution?.parties ?? [];

  const toolScore = def.licensed?.toolScore?.total ?? 0;
  let confidence: "high" | "medium" | "low";
  if (toolScore >= 80) {
    confidence = "high";
  } else if (toolScore >= 50) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  const mismatch =
    declared !== null &&
    discovered !== null &&
    normalizeLicenseId(declared) !== normalizeLicenseId(discovered);

  return {
    declared,
    discovered,
    confidence,
    mismatch,
    attributionParties,
  };
}

function normalizeLicenseId(id: string): string {
  return id
    .replace(/-only$/, "")
    .replace(/-or-later$/, "+")
    .toUpperCase();
}
