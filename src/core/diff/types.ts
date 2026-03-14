import type { LicenseCategory } from "../graph/types.js";
import type { ReportVulnerability } from "../report/types.js";

export interface DependencyDiff {
  added: DiffEntry[];
  removed: DiffEntry[];
  updated: DiffEntry[];
  licenseChanged: LicenseChange[];
  newVulnerabilities: VulnChange[];
  resolvedVulnerabilities: VulnChange[];
  summary: DiffSummary;
}

export interface DiffEntry {
  name: string;
  version: string;
  previousVersion?: string;
  license: string | null;
  licenseCategory: LicenseCategory;
  depth: number;
}

export interface LicenseChange {
  name: string;
  version: string;
  previousLicense: string | null;
  previousCategory: LicenseCategory;
  newLicense: string | null;
  newCategory: LicenseCategory;
}

export interface VulnChange {
  packageId: string;
  name: string;
  version: string;
  vulnerabilities: ReportVulnerability[];
}

export interface DiffSummary {
  addedCount: number;
  removedCount: number;
  updatedCount: number;
  newVulnCount: number;
  resolvedVulnCount: number;
  licenseChangeCount: number;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
}
