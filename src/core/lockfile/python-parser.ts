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

  const name =
    extractStringField(content, "project", "name") ??
    extractStringField(content, "tool.poetry", "name");
  const version =
    extractStringField(content, "project", "version") ??
    extractStringField(content, "tool.poetry", "version");

  for (const dep of extractTomlArray(content, "project", "dependencies")) {
    addParsedDep(dep, dependencies, skipped);
  }

  for (const group of DEV_LIKE_GROUPS) {
    for (const dep of extractTomlArray(content, "project.optional-dependencies", group)) {
      addParsedDep(dep, devDependencies, skipped);
    }
    for (const dep of extractTomlArray(content, "dependency-groups", group)) {
      addParsedDep(dep, devDependencies, skipped);
    }
  }

  parsePoetryDependencySection(content, "tool.poetry.dependencies", dependencies, skipped);
  parsePoetryDependencySection(content, "tool.poetry.dev-dependencies", devDependencies, skipped);
  for (const group of DEV_LIKE_GROUPS) {
    parsePoetryDependencySection(
      content,
      `tool.poetry.group.${group}.dependencies`,
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
  content: string,
  section: string,
  map: Map<string, string>,
  skipped: SkippedPythonDependency[],
): void {
  const sectionContent = extractSectionContent(content, section);
  if (!sectionContent) return;

  for (const rawLine of sectionContent.split("\n")) {
    const line = rawLine.trim();
    if (line === "" || line.startsWith("#")) continue;

    const simpleMatch = line.match(/^([A-Za-z0-9._-]+)\s*=\s*["']([^"']+)["']/);
    if (simpleMatch) {
      const name = simpleMatch[1];
      if (name.toLowerCase() === "python") continue;
      map.set(name, normalizePythonVersionSpec(simpleMatch[2]));
      continue;
    }

    const inlineTableMatch = line.match(/^([A-Za-z0-9._-]+)\s*=\s*\{(.+)\}$/);
    if (!inlineTableMatch) continue;

    const name = inlineTableMatch[1];
    if (name.toLowerCase() === "python") continue;

    const tableBody = inlineTableMatch[2];
    const markerMatch = tableBody.match(/markers\s*=\s*["']([^"']+)["']/);
    if (markerMatch) {
      skipped.push({ name, spec: line, reason: "marker" });
      continue;
    }

    const versionMatch = tableBody.match(/version\s*=\s*["']([^"']+)["']/);
    if (versionMatch) {
      map.set(name, normalizePythonVersionSpec(versionMatch[1]));
    }
  }
}

function extractSectionContent(content: string, section: string): string | null {
  const sectionPattern = new RegExp(`^\\[${escapeRegex(section)}\\]\\s*$`, "m");
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) return null;

  const afterSection = content.slice(sectionMatch.index + sectionMatch[0].length);
  const nextSectionMatch = afterSection.match(/^\[/m);
  return nextSectionMatch ? afterSection.slice(0, nextSectionMatch.index) : afterSection;
}

/**
 * Extract a simple string field from a TOML section.
 */
function extractStringField(content: string, section: string, field: string): string | null {
  const sectionContent = extractSectionContent(content, section);
  if (!sectionContent) return null;

  const fieldPattern = new RegExp(`^${escapeRegex(field)}\\s*=\\s*["']([^"']*)["']`, "m");
  const fieldMatch = fieldPattern.exec(sectionContent);
  return fieldMatch ? fieldMatch[1] : null;
}

/**
 * Extract an array value from a TOML section.
 */
function extractTomlArray(content: string, section: string, field: string): string[] {
  const sectionContent = extractSectionContent(content, section);
  if (!sectionContent) return [];

  const fieldStart = new RegExp(`^${escapeRegex(field)}\\s*=\\s*\\[`, "m");
  const fieldMatch = fieldStart.exec(sectionContent);
  if (!fieldMatch) return [];

  const bracketStart = fieldMatch.index + fieldMatch[0].length;
  const remaining = sectionContent.slice(bracketStart);

  let closingBracket = -1;
  let inString = false;
  let stringChar = "";
  for (let i = 0; i < remaining.length; i++) {
    const ch = remaining[i];
    if (inString) {
      if (ch === stringChar) inString = false;
    } else if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
    } else if (ch === "]") {
      closingBracket = i;
      break;
    }
  }
  if (closingBracket === -1) return [];

  const arrayContent = remaining.slice(0, closingBracket);
  const items: string[] = [];
  const stringPattern = /["']([^"']*)["']/g;
  for (const match of arrayContent.matchAll(stringPattern)) {
    const value = match[1].trim();
    if (value !== "") items.push(value);
  }

  return items;
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

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
