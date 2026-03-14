/** TTL values in milliseconds */
export const TTL = {
  /** Packument TTL: 1 hour (new versions get published) */
  packument: envInt("AMI_TTL_PACKUMENT", 60 * 60 * 1000),

  /** Package metadata: immutable (name@version never changes) */
  package: Infinity,

  /** Vulnerability data: 6 hours (new CVEs discovered over time) */
  vulnerability: envInt("AMI_TTL_VULN", 6 * 60 * 60 * 1000),
} as const;

function envInt(key: string, defaultValue: number): number {
  const val = process.env[key];
  if (val === undefined) return defaultValue;
  const parsed = parseInt(val, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}
