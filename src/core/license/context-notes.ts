import { parseLicenseComponents } from "./spdx.js";

export interface LicenseContextNote {
  license: string;
  note: string;
}

const CONTEXT_NOTES: Record<string, string> = {
  "GPL-2.0":
    "Requires source disclosure when distributing binaries. SaaS use typically does not trigger GPL obligations.",
  "GPL-2.0-only":
    "Requires source disclosure when distributing binaries. SaaS use typically does not trigger GPL obligations.",
  "GPL-2.0-or-later":
    "Requires source disclosure when distributing binaries. SaaS use typically does not trigger GPL obligations.",
  "GPL-3.0":
    "Requires source disclosure when distributing binaries. SaaS use typically does not trigger GPL obligations.",
  "GPL-3.0-only":
    "Requires source disclosure when distributing binaries. SaaS use typically does not trigger GPL obligations.",
  "GPL-3.0-or-later":
    "Requires source disclosure when distributing binaries. SaaS use typically does not trigger GPL obligations.",
  "AGPL-3.0":
    "Network use triggers source disclosure. Most restrictive copyleft for SaaS deployments.",
  "AGPL-3.0-only":
    "Network use triggers source disclosure. Most restrictive copyleft for SaaS deployments.",
  "AGPL-3.0-or-later":
    "Network use triggers source disclosure. Most restrictive copyleft for SaaS deployments.",
  "LGPL-2.0": "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-2.0-only":
    "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-2.0-or-later":
    "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-2.1": "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-2.1-only":
    "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-2.1-or-later":
    "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-3.0": "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-3.0-only":
    "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
  "LGPL-3.0-or-later":
    "Dynamic linking avoids copyleft obligations. npm dependencies are typically safe.",
};

export function getContextNote(spdxId: string): string | null {
  return CONTEXT_NOTES[spdxId] ?? null;
}

export function getContextNotes(licenses: string[]): LicenseContextNote[] {
  const seen = new Set<string>();
  const notes: LicenseContextNote[] = [];

  for (const license of licenses) {
    for (const { spdxId: id } of parseLicenseComponents(license)) {
      if (seen.has(id)) continue;
      seen.add(id);
      const note = getContextNote(id);
      if (note) {
        notes.push({ license: id, note });
      }
    }
  }

  return notes;
}
