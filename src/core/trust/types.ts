export interface TrustScore {
  overall: number;
  breakdown: {
    popularity: number;
    maintenance: number;
    security: number;
    community: number;
    maturity: number;
  };
  signals: TrustSignal[];
  hasProvenance: boolean;
  scorecardScore: number | null;
}

export interface TrustSignal {
  category: string;
  level: "positive" | "neutral" | "warning" | "critical";
  message: string;
}

export interface TrustInput {
  name: string;
  version: string;
  weeklyDownloads: number | null;
  maintainerCount: number;
  hasGithubRepo: boolean;
  packageAgeMs: number | null;
  daysSinceLastPublish: number | null;
  versionCount: number;
  hasProvenance: boolean;
  scorecardScore: number | null;
  knownVulnCount: number;
  deprecatedVersionRatio: number;
}
