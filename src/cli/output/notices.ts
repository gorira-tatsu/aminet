import { getContextNotes } from "../../core/license/context-notes.js";
import type { Report } from "../../core/report/types.js";

export function renderNotices(report: Report): void {
  const lines: string[] = [];

  lines.push("THIRD-PARTY SOFTWARE NOTICES");
  lines.push("===========================");
  lines.push(`Generated for: ${report.root}`);
  lines.push("");

  // License summary
  const licenseBuckets = new Map<string, string[]>();
  for (const entry of report.entries) {
    const lic = entry.license ?? "UNKNOWN";
    const bucket = licenseBuckets.get(lic) ?? [];
    bucket.push(entry.id);
    licenseBuckets.set(lic, bucket);
  }

  lines.push("LICENSE SUMMARY");
  lines.push("--------------");

  const sortedLicenses = Array.from(licenseBuckets.entries()).sort(
    (a, b) => b[1].length - a[1].length,
  );
  for (const [license, pkgs] of sortedLicenses) {
    lines.push(`${license}: ${pkgs.length} package(s)`);
  }
  lines.push("");

  // Context notes
  const allLicenses = report.entries.map((e) => e.license).filter((l): l is string => l !== null);
  const contextNotes = getContextNotes(allLicenses);
  if (contextNotes.length > 0) {
    lines.push("LICENSE NOTES");
    lines.push("-------------");
    for (const cn of contextNotes) {
      lines.push(`${cn.license}: ${cn.note}`);
    }
    lines.push("");
  }

  // Package details
  lines.push("PACKAGE DETAILS");
  lines.push("---------------");
  for (const entry of report.entries) {
    lines.push(`${entry.id} - ${entry.license ?? "UNKNOWN"}`);
  }

  console.log(lines.join("\n"));
}

export function renderNoticesJson(report: Report): void {
  const allLicenses = report.entries.map((e) => e.license).filter((l): l is string => l !== null);
  const contextNotes = getContextNotes(allLicenses);

  const output = {
    root: report.root,
    totalPackages: report.totalPackages,
    packages: report.entries.map((e) => ({
      id: e.id,
      name: e.name,
      version: e.version,
      license: e.license,
    })),
    contextNotes: contextNotes.map((cn) => ({
      license: cn.license,
      note: cn.note,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}
