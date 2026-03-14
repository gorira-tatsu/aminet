export type SignalSeverity = "critical" | "high" | "medium" | "low" | "info";
export type SignalCategory =
  | "install-script"
  | "typosquatting"
  | "maintainer-risk"
  | "publish-anomaly"
  | "deprecated";

export interface SecuritySignal {
  category: SignalCategory;
  severity: SignalSeverity;
  packageId: string;
  name: string;
  version: string;
  title: string;
  description: string;
  details?: Record<string, unknown>;
}

export interface SecurityScanResult {
  signals: SecuritySignal[];
  summary: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
    infoCount: number;
  };
}
