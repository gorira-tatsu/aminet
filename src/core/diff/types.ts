import type { LicenseCategory } from "../graph/types.js";
import type { LicenseReference } from "../license/metadata.js";
import type { ReportVulnerability } from "../report/types.js";
import type { SecuritySignal } from "../security/types.js";
import type { NormalizedAdvisory } from "../vulnerability/advisory-types.js";

export interface DependencyDiff {
  added: DiffEntry[];
  removed: DiffEntry[];
  updated: DiffEntry[];
  licenseChanged: LicenseChange[];
  newVulnerabilities: VulnChange[];
  resolvedVulnerabilities: VulnChange[];
  newSecuritySignals: SecuritySignalChange[];
  resolvedSecuritySignals: SecuritySignalChange[];
  notes?: string[];
  summary: DiffSummary;
}

export interface DiffEntry {
  name: string;
  version: string;
  previousVersion?: string;
  declaredVersion?: string | null;
  previousDeclaredVersion?: string | null;
  resolvedVersion?: string | null;
  previousResolvedVersion?: string | null;
  license: string | null;
  licenseCategory: LicenseCategory;
  licenseDetails?: LicenseReference[];
  depth: number;
}

export interface LicenseChange {
  name: string;
  version: string;
  previousLicense: string | null;
  previousCategory: LicenseCategory;
  previousLicenseDetails?: LicenseReference[];
  newLicense: string | null;
  newCategory: LicenseCategory;
  newLicenseDetails?: LicenseReference[];
}

export interface VulnChange {
  packageId: string;
  name: string;
  version: string;
  vulnerabilities: ReviewVulnerability[];
}

export interface ReviewVulnerability extends ReportVulnerability {
  fixedVersion?: string | null;
  sources?: NormalizedAdvisory["sources"];
  references?: NormalizedAdvisory["references"];
}

export interface SecuritySignalChange {
  packageId: string;
  name: string;
  version: string;
  signals: SecuritySignal[];
}

export interface DiffSummary {
  addedCount: number;
  removedCount: number;
  updatedCount: number;
  skippedCount: number;
  newVulnCount: number;
  resolvedVulnCount: number;
  licenseChangeCount: number;
  newSecuritySignalCount: number;
  resolvedSecuritySignalCount: number;
  riskLevel: "none" | "low" | "medium" | "high" | "critical";
}
