import type { ReportEntry } from "../report/types.js";
import { getLicenseAlternatives } from "./spdx.js";

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
    const alternatives = getLicenseAlternatives(license);
    if (alternatives.length === 0) continue;

    const matchedDenied = [...new Set(alternatives.flat().filter((part) => deniedSet.has(part)))];
    if (matchedDenied.length === 0) {
      continue;
    }

    const hasSafeAlternative = alternatives.some(
      (alternative) => !alternative.some((part) => deniedSet.has(part)),
    );

    violations.push({
      packageId: entry.id,
      license,
      deniedIds: matchedDenied,
      isOrExpression: hasSafeAlternative,
    });
  }

  return violations;
}
