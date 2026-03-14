import type { EnhancedLicense } from "../license/enhanced-checker.js";
import { TTL } from "./config.js";
import { getDatabase } from "./database.js";

interface LicenseIntelligenceRow {
  declared_license: string | null;
  discovered_license: string | null;
  confidence: string;
  attribution_parties: string | null;
  fetched_at: number;
}

export function getCachedLicenseIntelligence(
  name: string,
  version: string,
  ecosystem = "npm",
): EnhancedLicense | null {
  const db = getDatabase();
  try {
    const row = db
      .query<LicenseIntelligenceRow, [string, string, string]>(
        "SELECT declared_license, discovered_license, confidence, attribution_parties, fetched_at FROM license_intelligence WHERE ecosystem = ? AND name = ? AND version = ?",
      )
      .get(ecosystem, name, version);

    if (!row) return null;

    const age = Date.now() - row.fetched_at;
    if (age > TTL.licenseIntelligence) return null;

    const declared = row.declared_license;
    const discovered = row.discovered_license;

    return {
      declared,
      discovered,
      confidence: row.confidence as "high" | "medium" | "low",
      mismatch:
        declared !== null &&
        discovered !== null &&
        declared.toUpperCase() !== discovered.toUpperCase(),
      attributionParties: row.attribution_parties ? JSON.parse(row.attribution_parties) : [],
    };
  } catch {
    return null;
  }
}

export function cacheLicenseIntelligence(
  name: string,
  version: string,
  data: EnhancedLicense,
  ecosystem = "npm",
): void {
  const db = getDatabase();
  try {
    db.run(
      `INSERT OR REPLACE INTO license_intelligence (ecosystem, name, version, declared_license, discovered_license, confidence, attribution_parties, fetched_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ecosystem,
        name,
        version,
        data.declared,
        data.discovered,
        data.confidence,
        data.attributionParties.length > 0 ? JSON.stringify(data.attributionParties) : null,
        Date.now(),
      ],
    );
  } catch {
    // Table might not exist yet
  }
}
