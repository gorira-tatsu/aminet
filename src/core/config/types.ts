export interface AmiConfig {
  denyLicenses?: string[];
  allowLicenses?: string[]; // whitelist: anything not listed triggers a warning
  licenseOverrides?: Record<string, string>; // "pkg@version": "SPDX-ID"
  failOnVuln?: string;
  failOnLicense?: string;
  depth?: number;
  concurrency?: number;
  deepLicenseCheck?: boolean;
  security?: boolean;
  excludePackages?: string[]; // exact names or wildcards (e.g., "@scope/*")
  npmToken?: string;
}
