import type { TrustInput, TrustScore, TrustSignal } from "./types.js";

const WEIGHTS = {
  popularity: 0.15,
  maintenance: 0.25,
  security: 0.3,
  community: 0.15,
  maturity: 0.15,
};

export function computeTrustScore(input: TrustInput): TrustScore {
  const signals: TrustSignal[] = [];

  // Popularity (15%): log-scale downloads
  const popularity = scorePopularity(input, signals);

  // Maintenance (25%): last publish recency, version activity
  const maintenance = scoreMaintenance(input, signals);

  // Security (30%): scorecard, vulns, provenance
  const security = scoreSecurity(input, signals);

  // Community (15%): maintainer count, GitHub presence
  const community = scoreCommunity(input, signals);

  // Maturity (15%): age, version stability
  const maturity = scoreMaturity(input, signals);

  const overall = Math.round(
    popularity * WEIGHTS.popularity +
      maintenance * WEIGHTS.maintenance +
      security * WEIGHTS.security +
      community * WEIGHTS.community +
      maturity * WEIGHTS.maturity,
  );

  return {
    overall: Math.max(0, Math.min(100, overall)),
    breakdown: { popularity, maintenance, security, community, maturity },
    signals,
    hasProvenance: input.hasProvenance,
    scorecardScore: input.scorecardScore,
  };
}

function scorePopularity(input: TrustInput, signals: TrustSignal[]): number {
  if (input.weeklyDownloads === null) return 50;

  const dl = input.weeklyDownloads;
  // Log scale: 10M+ = 100, 1M = 90, 100K = 75, 10K = 60, 1K = 45, 100 = 30, <10 = 10
  let score: number;
  if (dl >= 10_000_000) {
    score = 100;
    signals.push({
      category: "popularity",
      level: "positive",
      message: "Very popular package (10M+ weekly downloads)",
    });
  } else if (dl >= 1_000_000) {
    score = 85 + Math.log10(dl / 1_000_000) * 15;
    signals.push({
      category: "popularity",
      level: "positive",
      message: `Popular package (${formatDownloads(dl)} weekly downloads)`,
    });
  } else if (dl >= 100_000) {
    score = 70 + Math.log10(dl / 100_000) * 15;
  } else if (dl >= 10_000) {
    score = 55 + Math.log10(dl / 10_000) * 15;
  } else if (dl >= 1_000) {
    score = 40 + Math.log10(dl / 1_000) * 15;
  } else if (dl >= 100) {
    score = 25 + Math.log10(dl / 100) * 15;
  } else {
    score = Math.max(5, dl * 2.5);
    if (dl < 50) {
      signals.push({
        category: "popularity",
        level: "warning",
        message: `Very low download count (${dl} weekly)`,
      });
    }
  }

  return Math.round(Math.min(100, score));
}

function scoreMaintenance(input: TrustInput, signals: TrustSignal[]): number {
  let score = 50;

  if (input.daysSinceLastPublish !== null) {
    if (input.daysSinceLastPublish <= 30) {
      score = 100;
    } else if (input.daysSinceLastPublish <= 90) {
      score = 85;
    } else if (input.daysSinceLastPublish <= 180) {
      score = 70;
    } else if (input.daysSinceLastPublish <= 365) {
      score = 55;
    } else if (input.daysSinceLastPublish <= 730) {
      score = 35;
      signals.push({
        category: "maintenance",
        level: "warning",
        message: "No updates in over 1 year",
      });
    } else {
      score = 15;
      signals.push({
        category: "maintenance",
        level: "critical",
        message: `No updates in ${Math.round(input.daysSinceLastPublish / 365)} years`,
      });
    }
  }

  return score;
}

function scoreSecurity(input: TrustInput, signals: TrustSignal[]): number {
  let score = 70; // Default when no data

  // OpenSSF Scorecard (0-10 → 0-100)
  if (input.scorecardScore !== null) {
    score = input.scorecardScore * 10;
    if (input.scorecardScore >= 7) {
      signals.push({
        category: "security",
        level: "positive",
        message: `Good OpenSSF Scorecard: ${input.scorecardScore}/10`,
      });
    } else if (input.scorecardScore < 4) {
      signals.push({
        category: "security",
        level: "warning",
        message: `Low OpenSSF Scorecard: ${input.scorecardScore}/10`,
      });
    }
  }

  // Vuln history penalty
  if (input.knownVulnCount > 0) {
    score = Math.max(0, score - input.knownVulnCount * 10);
    signals.push({
      category: "security",
      level: "warning",
      message: `${input.knownVulnCount} known vulnerability/ies`,
    });
  }

  // Provenance bonus
  if (input.hasProvenance) {
    score = Math.min(100, score + 10);
    signals.push({
      category: "security",
      level: "positive",
      message: "Has SLSA provenance attestation",
    });
  }

  return Math.max(0, Math.min(100, score));
}

function scoreCommunity(input: TrustInput, signals: TrustSignal[]): number {
  let score = 40;

  if (input.maintainerCount >= 3) {
    score += 30;
    signals.push({
      category: "community",
      level: "positive",
      message: `${input.maintainerCount} maintainers`,
    });
  } else if (input.maintainerCount >= 2) {
    score += 20;
  } else if (input.maintainerCount === 1) {
    score += 5;
    signals.push({
      category: "community",
      level: "neutral",
      message: "Single maintainer (bus factor risk)",
    });
  }

  if (input.hasGithubRepo) {
    score += 30;
  } else {
    signals.push({
      category: "community",
      level: "warning",
      message: "No linked GitHub repository",
    });
  }

  return Math.min(100, score);
}

function scoreMaturity(input: TrustInput, signals: TrustSignal[]): number {
  let score = 30;

  // Package age
  if (input.packageAgeMs !== null) {
    const ageYears = input.packageAgeMs / (365.25 * 24 * 60 * 60 * 1000);
    if (ageYears >= 5) {
      score += 40;
      signals.push({
        category: "maturity",
        level: "positive",
        message: `Established package (${Math.round(ageYears)} years old)`,
      });
    } else if (ageYears >= 2) {
      score += 30;
    } else if (ageYears >= 1) {
      score += 20;
    } else if (ageYears < 0.083) {
      // Less than 1 month
      score -= 10;
      signals.push({
        category: "maturity",
        level: "warning",
        message: "Very new package (less than 1 month old)",
      });
    }
  }

  // Version count as stability indicator
  if (input.versionCount >= 20) {
    score += 20;
  } else if (input.versionCount >= 10) {
    score += 15;
  } else if (input.versionCount >= 5) {
    score += 10;
  } else if (input.versionCount <= 1) {
    signals.push({ category: "maturity", level: "warning", message: "Only 1 version published" });
  }

  // High deprecated version ratio
  if (input.deprecatedVersionRatio > 0.5) {
    score -= 15;
    signals.push({
      category: "maturity",
      level: "warning",
      message: "Over 50% of versions are deprecated",
    });
  }

  return Math.max(0, Math.min(100, score));
}

function formatDownloads(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
