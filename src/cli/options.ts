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
  // Phase 5: Multi-source vulnerabilities + License intelligence
  vulnSources?: string; // comma-separated: osv,ghsa,npm-audit
  enhancedLicense?: boolean; // ClearlyDefined license intelligence
  // Phase 6: Trust score + Freshness
  trustScore?: boolean; // enable trust score computation
  freshness?: boolean; // enable dependency freshness analysis
  minTrustScore?: number; // CI: fail if any package below this score
  // Phase 7: Supply chain defense
  phantom?: boolean; // detect phantom dependencies
  provenance?: boolean; // check npm provenance attestations
  pinning?: boolean; // analyze version pinning strategy
  // Private package support
  excludePackages?: string; // comma-separated package names or wildcards
  npmToken?: string;
  // Ecosystem
  ecosystem?: "npm" | "pypi"; // package ecosystem (auto-detected from file)
}

export interface ReviewOptions extends AnalyzeOptions {
  base?: string;
  head?: string;
  prNumber?: string;
  repo?: string;
  updateComment?: boolean;
}
