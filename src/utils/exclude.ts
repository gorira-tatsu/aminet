/**
 * Parse exclude-packages from CLI (comma-separated string) and config (string array),
 * returning a deduplicated array of patterns.
 */
export function parseExcludePackages(cliOption?: string, configOption?: string[]): string[] {
  const patterns: string[] = [];
  if (cliOption) {
    patterns.push(
      ...cliOption
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
  }
  if (configOption) {
    patterns.push(...configOption);
  }
  return [...new Set(patterns)];
}

/**
 * Check if a package name matches any of the exclude patterns.
 * Supports exact match and wildcard patterns (e.g., "@scope/*").
 * Regex metacharacters other than `*` are escaped to prevent unexpected matches.
 */
export function isExcludedPackage(name: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    if (pattern.includes("*")) {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
      return regex.test(name);
    }
    return name === pattern;
  });
}
