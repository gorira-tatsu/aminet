export interface DepsdevVersionInfo {
  versionKey: {
    system: string;
    name: string;
    version: string;
  };
  publishedAt?: string;
  isDefault?: boolean;
  licenses?: string[];
  advisoryKeys?: Array<{ id: string }>;
  links?: Array<{ label: string; url: string }>;
  slsaProvenances?: Array<{
    sourceRepository: string;
    commit: string;
    verified: boolean;
    buildDefinition?: string;
  }>;
  registries?: string[];
  relatedProjects?: Array<{
    projectKey: { id: string };
    relationProvenance: string;
    relationType: string;
  }>;
}

export interface DepsdevProjectInfo {
  projectKey: { id: string };
  openIssuesCount?: number;
  starsCount?: number;
  forksCount?: number;
  license?: string;
  description?: string;
  homepage?: string;
  scorecard?: OpenSSFScorecard;
}

export interface OpenSSFScorecard {
  date: string;
  score: number;
  checks: ScorecardCheck[];
}

export interface ScorecardCheck {
  name: string;
  score: number;
  reason: string;
  details: string[];
}
