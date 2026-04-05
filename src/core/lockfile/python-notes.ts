import type { ParsedPythonManifest, SkippedPythonDependency } from "./python-parser.js";

interface BuildPythonManifestNotesOptions {
  includeDev?: boolean;
  mode: "analyze" | "review";
}

export function buildPythonManifestNotes(
  parsed: ParsedPythonManifest,
  options: BuildPythonManifestNotesOptions,
): string[] {
  const notes: string[] = [];

  if (parsed.bestEffortDependencies.length > 0) {
    notes.push(
      `Best-effort Python resolution: ${formatList(parsed.bestEffortDependencies)}. Unpinned direct specs use the latest compatible PyPI release as a stand-in and may not match the exact environment.`,
    );
  }

  const markerSkipped = summarizeSkipped(parsed.skipped, "marker");
  if (markerSkipped.length > 0) {
    notes.push(
      `Skipped marker-gated Python dependencies: ${formatList(markerSkipped)}. Environment-specific requirements are not evaluated.`,
    );
  }

  const directiveSkipped = summarizeSkipped(parsed.skipped, "directive");
  if (directiveSkipped.length > 0) {
    notes.push(
      `Ignored requirements.txt directives: ${formatList(directiveSkipped)}. Only direct package specifiers are analyzed.`,
    );
  }

  if (options.mode === "review" && options.includeDev && parsed.devDependencies.size > 0) {
    notes.push(
      `Included ${parsed.devDependencies.size} Python optional/dev dependencies in review mode.`,
    );
  }

  return notes;
}

function summarizeSkipped(
  skipped: SkippedPythonDependency[],
  reason: SkippedPythonDependency["reason"],
): string[] {
  return skipped
    .filter((entry) => entry.reason === reason)
    .map((entry) => entry.name ?? entry.spec)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function formatList(values: string[]): string {
  if (values.length <= 3) {
    return values.join(", ");
  }

  return `${values.slice(0, 3).join(", ")} (+${values.length - 3} more)`;
}
