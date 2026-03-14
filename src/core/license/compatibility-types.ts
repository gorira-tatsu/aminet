export type CompatibilityResult = "compatible" | "incompatible" | "one-way" | "unknown";

export interface CompatibilityCheck {
  licenseA: string;
  licenseB: string;
  result: CompatibilityResult;
  combinedLicense?: string;
  explanation: string;
}

export interface IncompatiblePair {
  licenseA: string;
  licenseB: string;
  packageA: string;
  packageB: string;
  explanation: string;
}

export interface CompatibilityWarning {
  type: "incompatible" | "one-way";
  packages: string[];
  licenses: string[];
  explanation: string;
}
