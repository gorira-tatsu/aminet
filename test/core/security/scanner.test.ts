import { Database } from "bun:sqlite";
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { DependencyGraph } from "../../../src/core/graph/types.js";
import type { NpmPackument } from "../../../src/core/registry/types.js";
import { scanSecuritySignals } from "../../../src/core/security/scanner.js";
import { closeDatabase, setDatabase } from "../../../src/core/store/database.js";
import { runMigrations } from "../../../src/core/store/migrations.js";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  runMigrations(db);
  setDatabase(db);
});

afterEach(() => {
  closeDatabase();
});

function makeGraph(name: string, version: string): DependencyGraph {
  const rootId = "root@0.0.0";
  const nodeId = `${name}@${version}`;

  return {
    root: rootId,
    nodes: new Map([
      [
        rootId,
        {
          id: rootId,
          name: "root",
          version: "0.0.0",
          license: null,
          licenseCategory: "unknown",
          depth: 0,
          parents: new Set(),
          dependencies: new Map([[name, version]]),
        },
      ],
      [
        nodeId,
        {
          id: nodeId,
          name,
          version,
          license: "MIT",
          licenseCategory: "permissive",
          depth: 1,
          parents: new Set([rootId]),
          dependencies: new Map(),
        },
      ],
    ]),
    edges: [{ from: rootId, to: nodeId, versionRange: version }],
  };
}

function makePackument(name: string, version: string): NpmPackument {
  const now = new Date();

  return {
    name,
    "dist-tags": { latest: version },
    maintainers: [{ name: "maintainer-1" }],
    versions: {
      [version]: {
        name,
        version,
        deprecated: "deprecated",
        scripts: {
          postinstall: "node install.js",
        },
      },
    },
    time: {
      created: new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString(),
      modified: now.toISOString(),
      [version]: now.toISOString(),
    },
  };
}

describe("scanSecuritySignals", () => {
  test("uses shared packuments when provided", async () => {
    const name = "scanner-shared-map-pkg";
    const version = "1.0.0";
    const graph = makeGraph(name, version);
    const packuments = new Map([[name, makePackument(name, version)]]);

    const result = await scanSecuritySignals(graph, packuments);
    const categories = result.signals.map((signal) => signal.category);

    expect(categories).toContain("install-script");
    expect(categories).toContain("deprecated");
  });
});
