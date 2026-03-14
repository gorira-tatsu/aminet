export interface AnalyzeOptions {
  json?: boolean;
  tree?: boolean;
  dot?: boolean;
  mermaid?: boolean;
  depth?: number;
  concurrency?: number;
  dev?: boolean;
  verbose?: boolean;
  file?: boolean;
  noCache?: boolean;
  ci?: boolean;
  failOnVuln?: string; // severity threshold: low/medium/high/critical
  failOnLicense?: string; // category: copyleft/weak-copyleft
  denyLicense?: string; // comma-separated SPDX IDs to deny
  notices?: boolean; // output NOTICE/attribution list
  deepLicenseCheck?: boolean; // verify LICENSE files from tarballs
  // Phase 2: SBOM
  cyclonedx?: boolean; // output CycloneDX 1.5 SBOM
  spdx?: boolean; // output SPDX 2.3 SBOM
  // Phase 3: Security
  security?: boolean; // enable security deep analysis
  // Phase 4: License enhancement
  licenseReport?: boolean; // contamination paths + compatibility check
}

export interface ReviewOptions extends AnalyzeOptions {
  base?: string;
  head?: string;
  prNumber?: string;
  repo?: string;
  updateComment?: boolean;
}
