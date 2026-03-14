import { TOP_NPM_PACKAGES } from "./data/top-npm-packages.js";
import type { SecuritySignal } from "./types.js";

export function detectTyposquatting(name: string, version: string): SecuritySignal[] {
  const signals: SecuritySignal[] = [];
  const packageId = `${name}@${version}`;

  // Skip if the package itself is in the popular list
  if (TOP_NPM_PACKAGES.includes(name)) return signals;

  // Strip scope for comparison
  const baseName = name.startsWith("@") ? (name.split("/")[1] ?? name) : name;

  for (const popular of TOP_NPM_PACKAGES) {
    const popularBase = popular.startsWith("@") ? (popular.split("/")[1] ?? popular) : popular;

    const dist = levenshteinDistance(baseName, popularBase);
    if (dist > 0 && dist <= 2) {
      signals.push({
        category: "typosquatting",
        severity: dist === 1 ? "high" : "medium",
        packageId,
        name,
        version,
        title: `Possible typosquat of "${popular}"`,
        description: `Package name "${name}" is ${dist} edit(s) away from popular package "${popular}"`,
        details: {
          similarTo: popular,
          editDistance: dist,
        },
      });
    }
  }

  return signals;
}

export function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;

  // Optimization: if length difference > 2, can't be within distance 2
  if (Math.abs(m - n) > 2) return Math.abs(m - n);

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] =
          1 +
          Math.min(
            dp[i - 1][j], // deletion
            dp[i][j - 1], // insertion
            dp[i - 1][j - 1], // substitution
          );
      }
    }
  }

  return dp[m][n];
}
