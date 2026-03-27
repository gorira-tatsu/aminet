import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildSpdxDocument } from "../../../src/cli/output/spdx.js";
import type { DependencyGraph } from "../../../src/core/graph/types.js";
import type { Report } from "../../../src/core/report/types.js";

const packageVersion = JSON.parse(
  readFileSync(new URL("../../../package.json", import.meta.url), "utf-8"),
).version as string;

function makeTestData() {
  const nodes = new Map();
  nodes.set("root@1.0.0", {
    id: "root@1.0.0",
    name: "root",
    version: "1.0.0",
    license: null,
    licenseCategory: "unknown",
    depth: 0,
    parents: new Set(),
    dependencies: new Map([["express", "^4.0.0"]]),
  });
  nodes.set("express@4.21.2", {
    id: "express@4.21.2",
    name: "express",
    version: "4.21.2",
    license: "MIT",
    licenseCategory: "permissive",
    depth: 1,
    parents: new Set(["root@1.0.0"]),
    dependencies: new Map(),
  });

  const graph: DependencyGraph = {
    root: "root@1.0.0",
    nodes,
    edges: [{ from: "root@1.0.0", to: "express@4.21.2", versionRange: "^4.0.0" }],
  };

  const report: Report = {
    root: "root@1.0.0",
    totalPackages: 2,
    directDependencies: 1,
    maxDepth: 1,
    entries: [
      {
        name: "root",
        version: "1.0.0",
        id: "root@1.0.0",
        depth: 0,
        license: null,
        licenseCategory: "unknown",
        vulnerabilities: [],
      },
      {
        name: "express",
        version: "4.21.2",
        id: "express@4.21.2",
        depth: 1,
        license: "MIT",
        licenseCategory: "permissive",
        vulnerabilities: [],
      },
    ],
    summary: {
      licenseCounts: { permissive: 1, copyleft: 0, "weak-copyleft": 0, unknown: 1 },
      vulnerabilityCount: 0,
      criticalCount: 0,
      highCount: 0,
      mediumCount: 0,
      lowCount: 0,
    },
  };

  return { graph, report };
}

describe("buildSpdxDocument", () => {
  it("produces valid SPDX 2.3 structure", () => {
    const { report, graph } = makeTestData();
    const doc = buildSpdxDocument(report, graph);

    expect(doc.spdxVersion).toBe("SPDX-2.3");
    expect(doc.dataLicense).toBe("CC0-1.0");
    expect(doc.SPDXID).toBe("SPDXRef-DOCUMENT");
  });

  it("includes packages with SPDX IDs", () => {
    const { report, graph } = makeTestData();
    const doc = buildSpdxDocument(report, graph);

    expect(doc.packages).toHaveLength(1); // root excluded
    expect(doc.packages[0].name).toBe("express");
    expect(doc.packages[0].SPDXID).toMatch(/^SPDXRef-Package-/);
    expect(doc.packages[0].licenseConcluded).toBe("MIT");
  });

  it("includes relationships", () => {
    const { report, graph } = makeTestData();
    const doc = buildSpdxDocument(report, graph);

    // Should have DESCRIBES + DEPENDS_ON
    const dependsOn = doc.relationships.filter((r) => r.relationshipType === "DEPENDS_ON");
    expect(dependsOn.length).toBeGreaterThan(0);
  });

  it("includes purl in external refs", () => {
    const { report, graph } = makeTestData();
    const doc = buildSpdxDocument(report, graph);

    const expressRef = doc.packages[0].externalRefs.find((r) => r.referenceType === "purl");
    expect(expressRef).toBeDefined();
    expect(expressRef!.referenceLocator).toBe("pkg:npm/express@4.21.2");
  });

  it("uses the current aminet version in creation info", () => {
    const { report, graph } = makeTestData();
    const doc = buildSpdxDocument(report, graph);

    expect(doc.creationInfo.creators).toContain(`Tool: aminet-${packageVersion}`);
  });
});
