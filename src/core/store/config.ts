/** TTL values in milliseconds */
export const TTL = {
  /** Packument TTL: 1 hour (new versions get published) */
  packument: envInt("AMI_TTL_PACKUMENT", 60 * 60 * 1000),

  /** Package metadata: immutable (name@version never changes) */
  package: Infinity,

  /** Vulnerability data: 6 hours (new CVEs discovered over time) */
  vulnerability: envInt("AMI_TTL_VULN", 6 * 60 * 60 * 1000),

  /** Security signal data: refresh daily */
  securitySignals: envInt("AMI_TTL_SECURITY_SIGNALS", 24 * 60 * 60 * 1000),

  /** License intelligence: refresh weekly */
  licenseIntelligence: envInt("AMI_TTL_LICENSE_INTELLIGENCE", 7 * 24 * 60 * 60 * 1000),

  /** Trust scores: refresh daily */
  trustScore: envInt("AMI_TTL_TRUST_SCORE", 24 * 60 * 60 * 1000),

  /** npm weekly downloads: refresh daily */
  npmDownloads: envInt("AMI_TTL_NPM_DOWNLOADS", 24 * 60 * 60 * 1000),

  /** deps.dev version metadata: refresh every 3 days */
  depsdevVersion: envInt("AMI_TTL_DEPSDEV_VERSION", 3 * 24 * 60 * 60 * 1000),

  /** deps.dev project metadata: refresh every 7 days */
  depsdevProject: envInt("AMI_TTL_DEPSDEV_PROJECT", 7 * 24 * 60 * 60 * 1000),
} as const;

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
