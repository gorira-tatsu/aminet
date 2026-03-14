import type { LicenseCategory } from "../graph/types.js";
import type { IncompatiblePair } from "../license/compatibility-types.js";
import type { ContaminationPath } from "../license/contamination.js";
import type { SecuritySignal } from "../security/types.js";

export interface ReportEntry {
  name: string;
  version: string;
  id: string;
  depth: number;
  license: string | null;
  licenseCategory: LicenseCategory;
  vulnerabilities: ReportVulnerability[];
}

export interface ReportVulnerability {
  id: string;
  summary: string;
  severity: string | null;
  aliases: string[];
}

export interface ReportContextNote {
  license: string;
  note: string;
}

export interface Report {
  root: string;
  totalPackages: number;
  directDependencies: number;
  maxDepth: number;
  entries: ReportEntry[];
  summary: ReportSummary;
  contextNotes?: ReportContextNote[];
  securitySignals?: SecuritySignal[];
  securitySummary?: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
  contaminationPaths?: ContaminationPath[];
  licenseIncompatibilities?: IncompatiblePair[];
}

export interface ReportSummary {
  licenseCounts: Record<LicenseCategory, number>;
  vulnerabilityCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}
