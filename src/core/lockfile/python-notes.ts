import type { ParsedPythonManifest, SkippedPythonDependency } from "./python-parser.js";

interface BuildPythonManifestNotesOptions {
  includeDev?: boolean;
  mode: "analyze" | "review";
}

export interface PythonDependencyNoteOptions {
  bestEffortDependencies: string[];
  markerSkipped: string[];
  directiveSkipped: string[];
  includedOptionalDevCount?: number;
  reviewMode?: boolean;
}

export function buildPythonDependencyNotes(options: PythonDependencyNoteOptions): string[] {
  const notes: string[] = [];
  const bestEffortDependencies = uniqueValues(options.bestEffortDependencies);
  const markerSkipped = uniqueValues(options.markerSkipped);
  const directiveSkipped = uniqueValues(options.directiveSkipped);

  if (bestEffortDependencies.length > 0) {
    notes.push(
      `Best-effort Python resolution: ${formatList(bestEffortDependencies)}. Unpinned direct specs use the latest compatible PyPI release as a stand-in and may not match the exact environment.`,
    );
  }

  if (markerSkipped.length > 0) {
    notes.push(
      `Skipped marker-gated Python dependencies: ${formatList(markerSkipped)}. Environment-specific requirements are not evaluated.`,
    );
  }

  if (directiveSkipped.length > 0) {
    notes.push(
      `Ignored requirements.txt directives: ${formatList(directiveSkipped)}; only direct package specifiers are analyzed.`,
    );
  }

  if ((options.includedOptionalDevCount ?? 0) > 0) {
    notes.push(
      `Included ${options.includedOptionalDevCount} Python optional/dev dependencies${options.reviewMode ? " in review mode" : ""}.`,
    );
  }

  return notes;
}

export function buildPythonManifestNotes(
  parsed: ParsedPythonManifest,
  options: BuildPythonManifestNotesOptions,
): string[] {
  const includeScopes: Set<"prod" | "dev"> = options.includeDev
    ? new Set(["prod", "dev"])
    : new Set(["prod"]);
  const includedBestEffort = parsed.bestEffortDependencies.filter(
    (name) =>
      parsed.dependencies.has(name) || (options.includeDev && parsed.devDependencies.has(name)),
  );
  const markerSkipped = summarizeSkipped(parsed.skipped, "marker", includeScopes);
  const directiveSkipped = summarizeSkipped(parsed.skipped, "directive", includeScopes);
  return buildPythonDependencyNotes({
    bestEffortDependencies: includedBestEffort,
    markerSkipped,
    directiveSkipped,
    includedOptionalDevCount:
      options.mode === "review" && options.includeDev ? parsed.devDependencies.size : 0,
    reviewMode: options.mode === "review",
  });
}

function summarizeSkipped(
  skipped: SkippedPythonDependency[],
  reason: SkippedPythonDependency["reason"],
  includeScopes: Set<"prod" | "dev">,
): string[] {
  return [
    ...new Set(
      skipped
        .filter((entry) => entry.reason === reason && includeScopes.has(entry.scope ?? "prod"))
        .map((entry) => entry.name ?? entry.spec),
    ),
  ];
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values)];
}

function formatList(values: string[]): string {
  if (values.length <= 3) {
    return values.join(", ");
  }

  return `${values.slice(0, 3).join(", ")} (+${values.length - 3} more)`;
}
