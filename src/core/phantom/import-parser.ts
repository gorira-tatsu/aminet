import { readFile } from "node:fs/promises";

// Regex patterns for import extraction
const ES_IMPORT_RE = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g;
const REQUIRE_RE = /(?:require|import)\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Node.js built-in modules (prefix-free)
const NODE_BUILTINS = new Set([
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
]);

/**
 * Extract bare import specifiers from a source file.
 * Returns unique package names (not subpaths).
 */
export async function extractImports(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, "utf-8");
  return extractImportsFromSource(content);
}

export function extractImportsFromSource(source: string): string[] {
  const imports = new Set<string>();

  for (const re of [ES_IMPORT_RE, REQUIRE_RE]) {
    re.lastIndex = 0;
    for (let match = re.exec(source); match !== null; match = re.exec(source)) {
      const specifier = match[1];
      const pkgName = extractPackageName(specifier);
      if (pkgName && !isBuiltinOrRelative(specifier)) {
        imports.add(pkgName);
      }
    }
  }

  return [...imports];
}

/**
 * Extract package name from an import specifier.
 * "lodash/fp" → "lodash"
 * "@scope/pkg/sub" → "@scope/pkg"
 * "./relative" → null
 */
function extractPackageName(specifier: string): string | null {
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    return null;
  }

  if (specifier.startsWith("@")) {
    // Scoped package: @scope/name or @scope/name/subpath
    const parts = specifier.split("/");
    if (parts.length < 2) return null;
    return `${parts[0]}/${parts[1]}`;
  }

  // Unscoped: name or name/subpath
  return specifier.split("/")[0];
}

function isBuiltinOrRelative(specifier: string): boolean {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return true;
  if (specifier.startsWith("node:")) return true;
  if (specifier.startsWith("bun:")) return true;

  const pkgName = specifier.split("/")[0];
  return NODE_BUILTINS.has(pkgName);
}
