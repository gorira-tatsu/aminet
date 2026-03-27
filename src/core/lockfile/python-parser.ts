import { parsePep508 } from "../registry/pypi-client.js";

/**
 * Parse a requirements.txt file and return a map of package name to version specifier.
 *
 * Handles:
 * - Pinned versions: `requests==2.31.0`
 * - Range specifiers: `flask>=2.0`
 * - Comments (`#`) and empty lines
 * - Skips `-r` includes, `-e` editables, and `--` flags
 */
export function parseRequirementsTxt(content: string): Map<string, string> {
  const packages = new Map<string, string>();

  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();

    // Skip empty lines
    if (line === "") continue;

    // Skip comments
    if (line.startsWith("#")) continue;

    // Skip -r includes, -e editables, and -- flags
    if (line.startsWith("-r ") || line.startsWith("-r\t")) continue;
    if (line.startsWith("-e ") || line.startsWith("-e\t")) continue;
    if (line.startsWith("--")) continue;

    // Strip inline comments: "requests==2.31.0 # pinned"
    const commentIdx = line.indexOf(" #");
    const cleaned = commentIdx !== -1 ? line.slice(0, commentIdx).trim() : line;
    if (cleaned === "") continue;

    // Use PEP 508 parser for the dependency spec
    const parsed = parsePep508(cleaned);
    if (!parsed) continue;

    const { name, versionSpec } = parsed;

    // For pinned versions (==X.Y.Z), extract just the version number
    const pinnedMatch = versionSpec.match(/^==\s*(.+)$/);
    if (pinnedMatch) {
      packages.set(name, pinnedMatch[1].trim());
    } else {
      // Keep the full specifier string for ranges
      packages.set(name, versionSpec);
    }
  }

  return packages;
}

/**
 * Parse a pyproject.toml [project] section using regex-based parsing (no TOML library).
 *
 * Extracts:
 * - `[project].name` and `[project].version`
 * - `[project].dependencies` array
 * - `[project.optional-dependencies].dev` array for dev deps
 */
export function parsePyprojectDependencies(content: string): {
  name?: string;
  version?: string;
  dependencies: Map<string, string>;
  devDependencies: Map<string, string>;
} {
  const dependencies = new Map<string, string>();
  const devDependencies = new Map<string, string>();

  const name = extractStringField(content, "project", "name");
  const version = extractStringField(content, "project", "version");

  // Extract [project].dependencies array
  const depsArray = extractTomlArray(content, "project", "dependencies");
  for (const dep of depsArray) {
    addParsedDep(dep, dependencies);
  }

  // Extract [project.optional-dependencies].dev array
  const devDepsArray = extractTomlArray(content, "project.optional-dependencies", "dev");
  for (const dep of devDepsArray) {
    addParsedDep(dep, devDependencies);
  }

  return {
    name: name ?? undefined,
    version: version ?? undefined,
    dependencies,
    devDependencies,
  };
}

/**
 * Parse a PEP 508 dependency string and add it to the given map.
 */
function addParsedDep(dep: string, map: Map<string, string>): void {
  const parsed = parsePep508(dep);
  if (!parsed) return;

  const { name, versionSpec } = parsed;
  const pinnedMatch = versionSpec.match(/^==\s*(.+)$/);
  if (pinnedMatch) {
    map.set(name, pinnedMatch[1].trim());
  } else {
    map.set(name, versionSpec);
  }
}

/**
 * Extract a simple string field from a TOML section.
 * e.g. extractStringField(content, "project", "name") finds `name = "foo"` under `[project]`.
 */
function extractStringField(content: string, section: string, field: string): string | null {
  const sectionPattern = new RegExp(`^\\[${escapeRegex(section)}\\]\\s*$`, "m");
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) return null;

  const afterSection = content.slice(sectionMatch.index + sectionMatch[0].length);

  // Find the next section header (or end of string)
  const nextSectionMatch = afterSection.match(/^\[/m);
  const sectionContent = nextSectionMatch
    ? afterSection.slice(0, nextSectionMatch.index)
    : afterSection;

  // Match field = "value" or field = 'value'
  const fieldPattern = new RegExp(`^${escapeRegex(field)}\\s*=\\s*["']([^"']*)["']`, "m");
  const fieldMatch = fieldPattern.exec(sectionContent);
  return fieldMatch ? fieldMatch[1] : null;
}

/**
 * Extract an array value from a TOML section.
 * Handles multi-line arrays like:
 *   dependencies = [
 *     "requests>=2.20",
 *     "flask>=2.0",
 *   ]
 * and single-line arrays like:
 *   dependencies = ["requests>=2.20", "flask>=2.0"]
 */
function extractTomlArray(content: string, section: string, field: string): string[] {
  const sectionPattern = new RegExp(`^\\[${escapeRegex(section)}\\]\\s*$`, "m");
  const sectionMatch = sectionPattern.exec(content);
  if (!sectionMatch) return [];

  const afterSection = content.slice(sectionMatch.index + sectionMatch[0].length);

  // Find the next section header (or end of string)
  const nextSectionMatch = afterSection.match(/^\[/m);
  const sectionContent = nextSectionMatch
    ? afterSection.slice(0, nextSectionMatch.index)
    : afterSection;

  // Find the field assignment: field = [...]
  const fieldStart = new RegExp(`^${escapeRegex(field)}\\s*=\\s*\\[`, "m");
  const fieldMatch = fieldStart.exec(sectionContent);
  if (!fieldMatch) return [];

  // Find the content between [ and ]
  const bracketStart = fieldMatch.index + fieldMatch[0].length;
  const remaining = sectionContent.slice(bracketStart);

  // Find the closing bracket, skipping brackets inside quoted strings
  // (e.g., "package[extras]>=1.0")
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

  // Extract quoted strings from the array content
  const items: string[] = [];
  const stringPattern = /["']([^"']*)["']/g;
  for (const m of arrayContent.matchAll(stringPattern)) {
    const value = m[1].trim();
    if (value !== "") {
      items.push(value);
    }
  }

  return items;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
