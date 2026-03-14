import type { NpmPackument } from "../registry/types.js";
import type { SecuritySignal } from "../security/types.js";

export interface ProvenanceResult {
  packageId: string;
  hasProvenance: boolean;
  sourceRepo: string | null;
  transparency: "full" | "partial" | "none";
}

export function checkProvenance(
  name: string,
  version: string,
  packument: NpmPackument,
  depsdevProvenance?: Array<{ sourceRepository: string; verified: boolean }>,
): ProvenanceResult {
  const versionInfo = packument.versions?.[version];
  const hasRegistryAttestations = !!(versionInfo?.dist as Record<string, unknown>)?.attestations;

  const hasSlsaProvenance = depsdevProvenance !== undefined && depsdevProvenance.length > 0;

  const sourceRepo = depsdevProvenance?.[0]?.sourceRepository ?? null;

  let transparency: ProvenanceResult["transparency"] = "none";
  if (hasRegistryAttestations && hasSlsaProvenance) {
    transparency = "full";
  } else if (hasRegistryAttestations || hasSlsaProvenance) {
    transparency = "partial";
  }

  return {
    packageId: `${name}@${version}`,
    hasProvenance: hasRegistryAttestations || hasSlsaProvenance,
    sourceRepo,
    transparency,
  };
}

export function provenanceToSignal(result: ProvenanceResult): SecuritySignal | null {
  if (result.hasProvenance) return null;

  return {
    category: "no-provenance",
    severity: "info",
    packageId: result.packageId,
    name: result.packageId.split("@")[0],
    version: result.packageId.includes("@")
      ? result.packageId.slice(result.packageId.lastIndexOf("@") + 1)
      : "",
    title: "No provenance attestation",
    description:
      "This package has no SLSA provenance or npm attestation, making it harder to verify its build origin.",
  };
}
