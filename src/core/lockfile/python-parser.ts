import type { TomlTable, TomlValue } from "smol-toml";
import { parse as parseToml } from "smol-toml";
import { parsePep508 } from "../registry/pypi-client.js";

export interface SkippedPythonDependency {
  name?: string;
  spec: string;
  reason: "directive" | "marker";
}

export interface ParsedPythonManifest {
  name?: string;
  version?: string;
  dependencies: Map<string, string>;
  devDependencies: Map<string, string>;
  skipped: SkippedPythonDependency[];
  bestEffortDependencies: string[];
}

const DEV_LIKE_GROUPS = ["dev", "test", "tests", "docs", "doc", "lint", "typing", "typecheck"];

/**
 * Parse a requirements.txt file and return a map of package name to version specifier.
 */
export function parseRequirementsTxt(content: string): Map<string, string> {
  return parseRequirementsManifest(content).dependencies;
}

export function parseRequirementsManifest(content: string): ParsedPythonManifest {
  const packages = new Map<string, string>();
  const skipped: SkippedPythonDependency[] = [];

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    if (line === "" || line.startsWith("#")) continue;

    if (line.startsWith("-r ") || line.startsWith("-r\t")) {
      skipped.push({ spec: line, reason: "directive" });
      continue;
    }
    if (line.startsWith("-e ") || line.startsWith("-e\t")) {
      skipped.push({ spec: line, reason: "directive" });
      continue;
    }
    if (line.startsWith("--")) {
      skipped.push({ spec: line, reason: "directive" });
      continue;
    }

    const commentIdx = line.indexOf(" #");
    const cleaned = commentIdx !== -1 ? line.slice(0, commentIdx).trim() : line;
    if (cleaned === "") continue;

    addParsedDep(cleaned, packages, skipped);
  }

  return {
    dependencies: packages,
    devDependencies: new Map(),
    skipped,
    bestEffortDependencies: collectBestEffortDependencies(packages),
  };
}

/**
 * Parse a pyproject.toml file and return production/dev dependencies plus metadata.
 *
 * Supported sections:
 * - [project]
 * - [project.optional-dependencies]
 * - [dependency-groups]
 * - [tool.poetry.dependencies]
 * - [tool.poetry.dev-dependencies]
 * - [tool.poetry.group.<name>.dependencies]
 */
export function parsePyprojectDependencies(content: string): {
  name?: string;
  version?: string;
  dependencies: Map<string, string>;
  devDependencies: Map<string, string>;
} {
  const parsed = parsePyprojectManifest(content);
  return {
    name: parsed.name,
    version: parsed.version,
    dependencies: parsed.dependencies,
    devDependencies: parsed.devDependencies,
  };
}

export function parsePyprojectManifest(content: string): ParsedPythonManifest {
  const dependencies = new Map<string, string>();
  const devDependencies = new Map<string, string>();
  const skipped: SkippedPythonDependency[] = [];
  const parsedToml = safeParseToml(content);

  const name =
    readStringPath(parsedToml, ["project", "name"]) ??
    readStringPath(parsedToml, ["tool", "poetry", "name"]);
  const version =
    readStringPath(parsedToml, ["project", "version"]) ??
    readStringPath(parsedToml, ["tool", "poetry", "version"]);

  for (const dep of readStringArrayPath(parsedToml, ["project", "dependencies"])) {
    addParsedDep(dep, dependencies, skipped);
  }

  for (const group of DEV_LIKE_GROUPS) {
    for (const dep of readStringArrayPath(parsedToml, [
      "project",
      "optional-dependencies",
      group,
    ])) {
      addParsedDep(dep, devDependencies, skipped);
    }
    for (const dep of readDependencyGroup(
      group,
      readTablePath(parsedToml, ["dependency-groups"]),
    )) {
      addParsedDep(dep, devDependencies, skipped);
    }
  }

  parsePoetryDependencySection(
    readTablePath(parsedToml, ["tool", "poetry", "dependencies"]),
    dependencies,
    skipped,
  );
  parsePoetryDependencySection(
    readTablePath(parsedToml, ["tool", "poetry", "dev-dependencies"]),
    devDependencies,
    skipped,
  );
  for (const group of DEV_LIKE_GROUPS) {
    parsePoetryDependencySection(
      readTablePath(parsedToml, ["tool", "poetry", "group", group, "dependencies"]),
      devDependencies,
      skipped,
    );
  }

  return {
    name: name ?? undefined,
    version: version ?? undefined,
    dependencies,
    devDependencies,
    skipped,
    bestEffortDependencies: [
      ...new Set([
        ...collectBestEffortDependencies(dependencies),
        ...collectBestEffortDependencies(devDependencies),
      ]),
    ],
  };
}

function addParsedDep(
  dep: string,
  map: Map<string, string>,
  skipped: SkippedPythonDependency[],
): void {
  const parsed = parsePep508(dep);
  if (!parsed) return;

  const { name, versionSpec, hasMarker } = parsed;
  if (hasMarker) {
    skipped.push({ name, spec: dep, reason: "marker" });
    return;
  }

  map.set(name, normalizePythonVersionSpec(versionSpec));
}

function parsePoetryDependencySection(
  section: TomlTable | undefined,
  map: Map<string, string>,
  skipped: SkippedPythonDependency[],
): void {
  if (!section) return;

  for (const [name, value] of Object.entries(section)) {
    if (name.toLowerCase() === "python") continue;

    const parsed = parsePoetryDependencyValue(name, value, skipped);
    if (parsed !== null) {
      map.set(name, normalizePythonVersionSpec(parsed));
    }
  }
}

function parsePoetryDependencyValue(
  name: string,
  value: TomlValue,
  skipped: SkippedPythonDependency[],
): string | null {
  if (typeof value === "string") return value;

  if (isTomlTable(value)) {
    if (hasPoetryMarker(value)) {
      skipped.push({ name, spec: renderPoetryDependencySpec(name, value), reason: "marker" });
      return null;
    }

    const version = readStringPath(value, ["version"]);
    return version ?? null;
  }

  if (Array.isArray(value)) {
    if (value.some((entry) => isTomlTable(entry) && hasPoetryMarker(entry))) {
      skipped.push({ name, spec: renderPoetryDependencySpec(name, value), reason: "marker" });
      return null;
    }

    if (value.some((entry) => typeof entry === "string" || hasPoetryVersion(entry))) {
      return "";
    }
  }

  return null;
}

function safeParseToml(content: string): TomlTable | undefined {
  try {
    return parseToml(content);
  } catch {
    return undefined;
  }
}

function readDependencyGroup(
  group: string,
  dependencyGroups: TomlTable | undefined,
  seen = new Set<string>(),
): string[] {
  if (!dependencyGroups || seen.has(group)) return [];

  seen.add(group);

  const value = dependencyGroups[group];
  if (!Array.isArray(value)) return [];

  const resolved: string[] = [];
  for (const entry of value) {
    if (typeof entry === "string") {
      resolved.push(entry);
      continue;
    }

    if (!isTomlTable(entry)) continue;

    const includedGroup = readStringPath(entry, ["include-group"]);
    if (includedGroup) {
      resolved.push(...readDependencyGroup(includedGroup, dependencyGroups, seen));
    }
  }

  return resolved;
}

function readValuePath(root: TomlTable | undefined, path: string[]): TomlValue | undefined {
  let current: TomlValue | undefined = root;
  for (const segment of path) {
    if (!isTomlTable(current)) return undefined;
    current = current[segment];
  }

  return current;
}

function readStringPath(root: TomlTable | undefined, path: string[]): string | undefined {
  const value = readValuePath(root, path);
  return typeof value === "string" ? value : undefined;
}

function readStringArrayPath(root: TomlTable | undefined, path: string[]): string[] {
  const value = readValuePath(root, path);
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function readTablePath(root: TomlTable | undefined, path: string[]): TomlTable | undefined {
  const value = readValuePath(root, path);
  return isTomlTable(value) ? value : undefined;
}

function hasPoetryMarker(value: TomlTable): boolean {
  return typeof value.markers === "string";
}

function hasPoetryVersion(value: TomlValue): boolean {
  return isTomlTable(value) && typeof value.version === "string";
}

function renderPoetryDependencySpec(name: string, value: TomlValue): string {
  return `${name} = ${renderTomlValue(value)}`;
}

function renderTomlValue(value: TomlValue): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry) => renderTomlValue(entry)).join(", ")}]`;
  }
  if (isTomlTable(value)) {
    return `{ ${Object.entries(value)
      .map(([key, entry]) => `${key} = ${renderTomlValue(entry)}`)
      .join(", ")} }`;
  }

  return String(value);
}

function isTomlTable(value: TomlValue | undefined): value is TomlTable {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectBestEffortDependencies(packages: Map<string, string>): string[] {
  return [...packages.entries()]
    .filter(([, spec]) => isBestEffortVersionSpec(spec))
    .map(([name]) => name)
    .sort();
}

function isBestEffortVersionSpec(versionSpec: string): boolean {
  const trimmed = normalizePythonVersionSpec(versionSpec).trim();
  if (trimmed === "" || trimmed.toLowerCase() === "latest") return true;
  return !/^\d+(?:\.\d+)*(?:[A-Za-z0-9._+-]+)?$/.test(trimmed);
}

function normalizePythonVersionSpec(versionSpec: string): string {
  const trimmed = versionSpec.trim();
  const pinnedMatch = trimmed.match(/^==\s*(.+)$/);
  return pinnedMatch ? pinnedMatch[1].trim() : trimmed;
}
