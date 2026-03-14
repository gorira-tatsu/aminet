import { readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { logger } from "../../utils/logger.js";
import { extractImports } from "./import-parser.js";

export interface PhantomDependency {
  importedName: string;
  usedInFiles: string[];
  risk: "high" | "medium" | "low";
}

const SCAN_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const IGNORE_DIRS = new Set(["node_modules", ".git", "dist", "build", "out", ".next", "coverage"]);

export async function scanPhantomDependencies(
  projectDir: string,
  declaredDeps: Record<string, string>,
): Promise<PhantomDependency[]> {
  const declaredSet = new Set(Object.keys(declaredDeps));
  const usageMap = new Map<string, string[]>();

  // Scan source files
  const files = await collectSourceFiles(projectDir);
  logger.debug(`Scanning ${files.length} source files for phantom dependencies`);

  for (const file of files) {
    try {
      const imports = await extractImports(file);
      for (const pkg of imports) {
        if (declaredSet.has(pkg)) continue;

        // Track usage
        const existing = usageMap.get(pkg) ?? [];
        existing.push(file);
        usageMap.set(pkg, existing);
      }
    } catch {
      // Skip files we can't read
    }
  }

  // Convert to results with risk assessment
  const phantoms: PhantomDependency[] = [];
  for (const [name, files] of usageMap) {
    // Skip common false positives
    if (isLikelyFalsePositive(name)) continue;

    phantoms.push({
      importedName: name,
      usedInFiles: files,
      risk: assessRisk(name, files.length),
    });
  }

  // Sort by risk (high first), then by usage count
  phantoms.sort((a, b) => {
    const riskOrder = { high: 0, medium: 1, low: 2 };
    return riskOrder[a.risk] - riskOrder[b.risk] || b.usedInFiles.length - a.usedInFiles.length;
  });

  return phantoms;
}

async function collectSourceFiles(dir: string, maxDepth = 10): Promise<string[]> {
  if (maxDepth <= 0) return [];

  const files: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
        const subFiles = await collectSourceFiles(join(dir, entry.name), maxDepth - 1);
        files.push(...subFiles);
      } else if (entry.isFile() && SCAN_EXTENSIONS.has(extname(entry.name))) {
        files.push(join(dir, entry.name));
      }
    }
  } catch {
    // Directory not readable
  }

  return files;
}

function assessRisk(_name: string, usageCount: number): "high" | "medium" | "low" {
  // High risk: widely used but undeclared
  if (usageCount >= 5) return "high";
  if (usageCount >= 2) return "medium";
  return "low";
}

function isLikelyFalsePositive(name: string): boolean {
  // TypeScript path aliases often look like packages
  if (name.startsWith("~") || name.startsWith("#")) return true;
  // Common aliases
  if (name === "src" || name === "test" || name === "tests" || name === "lib") return true;
  return false;
}
