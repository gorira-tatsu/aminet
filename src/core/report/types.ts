import type { FreshnessReport } from "../freshness/analyzer.js";
import type { LicenseCategory } from "../graph/types.js";
import type { IncompatiblePair } from "../license/compatibility-types.js";
import type { ContaminationPath } from "../license/contamination.js";
import type { EnhancedLicense } from "../license/enhanced-checker.js";
import type { LicenseReference } from "../license/metadata.js";
import type { PhantomDependency } from "../phantom/scanner.js";
import type { PinningReport } from "../pinning/analyzer.js";
import type { ProvenanceResult } from "../provenance/checker.js";
import type { SecuritySignal } from "../security/types.js";
import type { TrustScore } from "../trust/types.js";
import type { NormalizedAdvisory } from "../vulnerability/advisory-types.js";

export interface ReportEntry {
  name: string;
  version: string;
  id: string;
  depth: number;
  license: string | null;
  licenseCategory: LicenseCategory;
  licenseDetails?: LicenseReference[];
  vulnerabilities: ReportVulnerability[];
  advisories?: NormalizedAdvisory[];
  trustScore?: TrustScore;
  freshness?: FreshnessReport;
  enhancedLicense?: EnhancedLicense;
  provenance?: ProvenanceResult;
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

export interface DeepLicenseMismatch {
  packageId: string;
  declared: string;
  detected: string;
}

export interface Report {
  root: string;
  totalPackages: number;
  directDependencies: number;
  maxDepth: number;
  entries: ReportEntry[];
  summary: ReportSummary;
  analysisNotes?: string[];
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
  phantomDeps?: PhantomDependency[];
  provenanceResults?: ProvenanceResult[];
  pinningReport?: PinningReport;
  deepLicenseMismatches?: DeepLicenseMismatch[];
}

export interface ReportSummary {
  licenseCounts: Record<LicenseCategory, number>;
  vulnerabilityCount: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
}
