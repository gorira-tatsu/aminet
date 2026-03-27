import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCycloneDxBom } from "../../../src/cli/output/cyclonedx.js";
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

describe("buildCycloneDxBom", () => {
  it("produces valid CycloneDX structure", () => {
    const { report, graph } = makeTestData();
    const bom = buildCycloneDxBom(report, graph);

    expect(bom.bomFormat).toBe("CycloneDX");
    expect(bom.specVersion).toBe("1.5");
    expect(bom.version).toBe(1);
    expect(bom.serialNumber).toMatch(/^urn:uuid:/);
  });

  it("includes components with purl", () => {
    const { report, graph } = makeTestData();
    const bom = buildCycloneDxBom(report, graph);

    // Root is excluded, only express
    expect(bom.components).toHaveLength(1);
    expect(bom.components[0].name).toBe("express");
    expect(bom.components[0].purl).toBe("pkg:npm/express@4.21.2");
    expect(bom.components[0].type).toBe("library");
  });

  it("includes license info", () => {
    const { report, graph } = makeTestData();
    const bom = buildCycloneDxBom(report, graph);

    expect(bom.components[0].licenses).toHaveLength(1);
    expect(bom.components[0].licenses![0].license.id).toBe("MIT");
  });

  it("includes dependencies", () => {
    const { report, graph } = makeTestData();
    const bom = buildCycloneDxBom(report, graph);

    expect(bom.dependencies.length).toBeGreaterThan(0);
  });

  it("uses the current aminet version in tool metadata", () => {
    const { report, graph } = makeTestData();
    const bom = buildCycloneDxBom(report, graph);

    expect(bom.metadata.tools[0].version).toBe(packageVersion);
  });
});
