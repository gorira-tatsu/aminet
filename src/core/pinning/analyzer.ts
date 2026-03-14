import type { LockfileResult } from "../lockfile/parser.js";

export interface PinningReport {
  totalDependencies: number;
  exactPinned: number;
  caretRange: number;
  tildeRange: number;
  wildcardOrStar: number;
  gitOrUrl: number;
  other: number;
  driftRiskScore: number;
  recommendations: PinningRecommendation[];
}

export interface PinningRecommendation {
  name: string;
  currentRange: string;
  suggestion: string;
  reason: string;
}

export function analyzeVersionPinning(
  dependencies: Record<string, string>,
  lockfile: LockfileResult | null,
): PinningReport {
  const entries = Object.entries(dependencies);
  let exactPinned = 0;
  let caretRange = 0;
  let tildeRange = 0;
  let wildcardOrStar = 0;
  let gitOrUrl = 0;
  let other = 0;
  const recommendations: PinningRecommendation[] = [];

  for (const [name, range] of entries) {
    const category = categorizeRange(range);

    switch (category) {
      case "exact":
        exactPinned++;
        break;
      case "caret":
        caretRange++;
        break;
      case "tilde":
        tildeRange++;
        break;
      case "wildcard":
        wildcardOrStar++;
        recommendations.push({
          name,
          currentRange: range,
          suggestion: "Pin to exact version or use ^ range",
          reason: "Wildcard ranges allow any version, risking breaking changes",
        });
        break;
      case "git":
        gitOrUrl++;
        recommendations.push({
          name,
          currentRange: range,
          suggestion: "Pin to specific commit hash or tag",
          reason: "Git dependencies without pinning can change unpredictably",
        });
        break;
      default:
        other++;
    }
  }

  // If no lockfile, recommend adding one
  if (!lockfile && entries.length > 0) {
    recommendations.unshift({
      name: "(project)",
      currentRange: "-",
      suggestion: "Add a lockfile (bun.lock or package-lock.json)",
      reason: "Lockfiles ensure reproducible installs regardless of version ranges",
    });
  }

  const driftRiskScore = computeDriftRisk(
    entries.length,
    exactPinned,
    caretRange,
    tildeRange,
    wildcardOrStar,
    gitOrUrl,
    lockfile !== null,
  );

  return {
    totalDependencies: entries.length,
    exactPinned,
    caretRange,
    tildeRange,
    wildcardOrStar,
    gitOrUrl,
    other,
    driftRiskScore,
    recommendations,
  };
}

function categorizeRange(
  range: string,
): "exact" | "caret" | "tilde" | "wildcard" | "git" | "other" {
  const trimmed = range.trim();

  // Git/URL dependencies
  if (
    trimmed.startsWith("git") ||
    trimmed.startsWith("http") ||
    trimmed.startsWith("github:") ||
    (trimmed.includes("/") && !trimmed.startsWith("@"))
  ) {
    return "git";
  }

  // Wildcard
  if (trimmed === "*" || trimmed === "latest" || trimmed.includes("x") || trimmed === "") {
    return "wildcard";
  }

  // Caret range
  if (trimmed.startsWith("^")) return "caret";

  // Tilde range
  if (trimmed.startsWith("~")) return "tilde";

  // Range operators
  if (
    trimmed.includes(">=") ||
    trimmed.includes("<=") ||
    trimmed.includes(" - ") ||
    trimmed.includes("||")
  ) {
    return "other";
  }

  // Exact version: starts with digit (e.g., "1.2.3")
  if (/^\d/.test(trimmed)) return "exact";

  return "other";
}

function computeDriftRisk(
  total: number,
  _exact: number,
  caret: number,
  tilde: number,
  wildcard: number,
  git: number,
  hasLockfile: boolean,
): number {
  if (total === 0) return 0;

  // Weight: wildcard = 100, git = 80, caret = 40, tilde = 20, exact = 0
  const rawScore = (wildcard * 100 + git * 80 + caret * 40 + tilde * 20) / total;

  // Lockfile reduces risk by 50%
  const adjustedScore = hasLockfile ? rawScore * 0.5 : rawScore;

  return Math.round(Math.min(100, adjustedScore));
}
