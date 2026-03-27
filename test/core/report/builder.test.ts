import { describe, expect, test } from "vitest";
import type { DependencyGraph } from "../../../src/core/graph/types.js";
import { buildReport } from "../../../src/core/report/builder.js";
import type { VulnerabilityResult } from "../../../src/core/vulnerability/types.js";

function makeGraph(nodes: Parameters<typeof Map<string, any>>[0][]): DependencyGraph {
  const nodesMap = new Map(
    nodes.map(([id, data]) => [
      id as string,
      {
        id: id as string,
        name: (data as any).name ?? (id as string).split("@")[0],
        version: (data as any).version ?? (id as string).split("@")[1],
        license: (data as any).license ?? "MIT",
        licenseCategory: (data as any).licenseCategory ?? "permissive",
        depth: (data as any).depth ?? 0,
        parents: new Set<string>(),
        dependencies: new Map<string, string>(),
      },
    ]),
  );
  return { root: nodes[0][0] as string, nodes: nodesMap, edges: [] };
}

describe("buildReport", () => {
  test("builds report from graph with no vulnerabilities", () => {
    const graph = makeGraph([
      ["root@1.0.0", { depth: 0 }],
      ["dep-a@2.0.0", { depth: 1 }],
    ]);

    const report = buildReport(graph, []);

    expect(report.root).toBe("root@1.0.0");
    expect(report.totalPackages).toBe(2);
    expect(report.entries).toHaveLength(2);
    expect(report.summary.vulnerabilityCount).toBe(0);
    expect(report.summary.licenseCounts.permissive).toBe(2);
  });

  test("counts vulnerability severities correctly", () => {
    const graph = makeGraph([["pkg@1.0.0", { depth: 0 }]]);

    const vulns: VulnerabilityResult[] = [
      {
        packageId: "pkg@1.0.0",
        name: "pkg",
        version: "1.0.0",
        vulnerabilities: [
          {
            id: "GHSA-1",
            summary: "Critical vuln",
            severity: [{ type: "CVSS_V3", score: "9.5" }],
          },
          {
            id: "GHSA-2",
            summary: "High vuln",
            severity: [{ type: "CVSS_V3", score: "7.5" }],
          },
          {
            id: "GHSA-3",
            summary: "Medium vuln",
            severity: [{ type: "CVSS_V3", score: "5.0" }],
          },
          {
            id: "GHSA-4",
            summary: "Low vuln",
            severity: [{ type: "CVSS_V3", score: "2.0" }],
          },
        ] as any,
      },
    ];

    const report = buildReport(graph, vulns);

    expect(report.summary.vulnerabilityCount).toBe(4);
    expect(report.summary.criticalCount).toBe(1);
    expect(report.summary.highCount).toBe(1);
    expect(report.summary.mediumCount).toBe(1);
    expect(report.summary.lowCount).toBe(1);
  });

  test("counts license categories correctly", () => {
    const graph = makeGraph([
      ["root@1.0.0", { depth: 0, license: "MIT", licenseCategory: "permissive" }],
      ["gpl-pkg@1.0.0", { depth: 1, license: "GPL-3.0", licenseCategory: "copyleft" }],
      ["lgpl-pkg@1.0.0", { depth: 1, license: "LGPL-2.1", licenseCategory: "weak-copyleft" }],
      ["unknown-pkg@1.0.0", { depth: 1, license: null, licenseCategory: "unknown" }],
    ]);

    const report = buildReport(graph, []);

    expect(report.summary.licenseCounts.permissive).toBe(1);
    expect(report.summary.licenseCounts.copyleft).toBe(1);
    expect(report.summary.licenseCounts["weak-copyleft"]).toBe(1);
    expect(report.summary.licenseCounts.unknown).toBe(1);
  });

  test("sorts entries by depth then name", () => {
    const graph = makeGraph([
      ["root@1.0.0", { depth: 0 }],
      ["zebra@1.0.0", { depth: 1 }],
      ["alpha@1.0.0", { depth: 1 }],
      ["deep@1.0.0", { depth: 2 }],
    ]);

    const report = buildReport(graph, []);

    expect(report.entries.map((e) => e.id)).toEqual([
      "root@1.0.0",
      "alpha@1.0.0",
      "zebra@1.0.0",
      "deep@1.0.0",
    ]);
  });

  test("handles empty graph", () => {
    const graph: DependencyGraph = {
      root: "empty@0.0.0",
      nodes: new Map(),
      edges: [],
    };

    const report = buildReport(graph, []);

    expect(report.totalPackages).toBe(0);
    expect(report.entries).toHaveLength(0);
    expect(report.summary.vulnerabilityCount).toBe(0);
  });

  test("attaches optional data from options", () => {
    const graph = makeGraph([["pkg@1.0.0", { depth: 0 }]]);

    const report = buildReport(graph, [], {
      securitySummary: {
        criticalCount: 1,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
        infoCount: 0,
      },
    });

    expect(report.securitySummary).toBeDefined();
    expect(report.securitySummary!.criticalCount).toBe(1);
  });

  test("uses database_specific severity as fallback", () => {
    const graph = makeGraph([["pkg@1.0.0", { depth: 0 }]]);

    const vulns: VulnerabilityResult[] = [
      {
        packageId: "pkg@1.0.0",
        name: "pkg",
        version: "1.0.0",
        vulnerabilities: [
          {
            id: "GHSA-5",
            summary: "DB severity",
            database_specific: { severity: "high" },
          },
        ] as any,
      },
    ];

    const report = buildReport(graph, vulns);
    expect(report.entries[0].vulnerabilities[0].severity).toBe("HIGH");
  });
});
