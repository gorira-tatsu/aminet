import type { NpmVersionInfo } from "../registry/types.js";
import { classifyLicense } from "./spdx.js";
import type { LicenseInfo } from "./types.js";

export function extractLicense(versionInfo: NpmVersionInfo): LicenseInfo {
  const raw = versionInfo.license;

  if (!raw) {
    return { spdxId: null, category: "unknown", raw: null };
  }

  // String format: "MIT"
  if (typeof raw === "string") {
    const spdxId = normalizeSpdxId(raw);
    return { spdxId, category: classifyLicense(spdxId), raw };
  }

  // Legacy object format: { type: "MIT", url: "..." }
  if (typeof raw === "object" && !Array.isArray(raw) && raw.type) {
    const spdxId = normalizeSpdxId(raw.type);
    return { spdxId, category: classifyLicense(spdxId), raw: raw.type };
  }

  // Legacy array format: [{ type: "MIT" }, { type: "Apache-2.0" }]
  if (Array.isArray(raw)) {
    const types = raw.filter((l) => l.type).map((l) => normalizeSpdxId(l.type));
    if (types.length === 0) {
      return { spdxId: null, category: "unknown", raw: JSON.stringify(raw) };
    }
    const spdxId = types.join(" OR ");
    return {
      spdxId,
      category: classifyLicense(spdxId),
      raw: JSON.stringify(raw),
    };
  }

  return { spdxId: null, category: "unknown", raw: String(raw) };
}

function normalizeSpdxId(id: string): string {
  // Remove wrapping parentheses
  let normalized = id.trim();
  if (normalized.startsWith("(") && normalized.endsWith(")")) {
    normalized = normalized.slice(1, -1);
  }
  return normalized;
}
