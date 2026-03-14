import type { ReportEntry } from "../report/types.js";

export interface DenyListViolation {
  packageId: string;
  license: string;
  deniedIds: string[];
  isOrExpression: boolean; // OR expression: warning (can choose non-denied side)
}

export function checkDenyList(entries: ReportEntry[], denied: string[]): DenyListViolation[] {
  if (denied.length === 0) return [];

  const deniedSet = new Set(denied.map((d) => d.trim()));
  const violations: DenyListViolation[] = [];

  for (const entry of entries) {
    if (!entry.license) continue;

    const license = entry.license;

    if (license.includes(" OR ")) {
      const parts = license.split(" OR ").map((p) => p.trim());
      const matchedDenied = parts.filter((p) => deniedSet.has(p));
      if (matchedDenied.length > 0) {
        violations.push({
          packageId: entry.id,
          license,
          deniedIds: matchedDenied,
          isOrExpression: true,
        });
      }
    } else if (license.includes(" AND ")) {
      const parts = license.split(" AND ").map((p) => p.trim());
      const matchedDenied = parts.filter((p) => deniedSet.has(p));
      if (matchedDenied.length > 0) {
        violations.push({
          packageId: entry.id,
          license,
          deniedIds: matchedDenied,
          isOrExpression: false,
        });
      }
    } else {
      if (deniedSet.has(license)) {
        violations.push({
          packageId: entry.id,
          license,
          deniedIds: [license],
          isOrExpression: false,
        });
      }
    }
  }

  return violations;
}
