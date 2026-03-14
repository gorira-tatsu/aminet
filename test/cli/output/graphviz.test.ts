import { describe, expect, test } from "bun:test";
import { renderGraphviz } from "../../../src/cli/output/graphviz.js";
import type { DependencyGraph, PackageNode } from "../../../src/core/graph/types.js";
import type { VulnerabilityResult } from "../../../src/core/vulnerability/types.js";

function makeGraph(): DependencyGraph {
  const nodes = new Map<string, PackageNode>();
  nodes.set("express@4.21.2", {
    id: "express@4.21.2",
    name: "express",
    version: "4.21.2",
    license: "MIT",
    licenseCategory: "permissive",
    depth: 0,
    parents: new Set(),
    dependencies: new Map([["qs", "6.5.2"]]),
  });
  nodes.set("qs@6.5.2", {
    id: "qs@6.5.2",
    name: "qs",
    version: "6.5.2",
    license: "BSD-3-Clause",
    licenseCategory: "permissive",
    depth: 1,
    parents: new Set(["express@4.21.2"]),
    dependencies: new Map(),
  });

  return {
    root: "express@4.21.2",
    nodes,
    edges: [{ from: "express@4.21.2", to: "qs@6.5.2", versionRange: "6.5.2" }],
  };
}

describe("renderGraphviz", () => {
  test("produces valid DOT syntax", () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(" "));

    renderGraphviz(makeGraph(), []);

    console.log = originalLog;
    const dot = output.join("\n");

    expect(dot).toContain("digraph dependencies");
    expect(dot).toContain("rankdir=LR");
    expect(dot).toContain("express@4.21.2");
    expect(dot).toContain("qs@6.5.2");
    expect(dot).toContain("->");
    expect(dot).toContain("}");
  });

  test("marks vulnerable packages red", () => {
    const vulns: VulnerabilityResult[] = [
      {
        packageId: "qs@6.5.2",
        name: "qs",
        version: "6.5.2",
        vulnerabilities: [{ id: "GHSA-123" } as any],
      },
    ];

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(" "));

    renderGraphviz(makeGraph(), vulns);

    console.log = originalLog;
    const dot = output.join("\n");

    expect(dot).toContain("#FF6B6B");
    expect(dot).toContain("1 vuln");
  });

  test("produces layered output with rank=same", () => {
    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(" "));

    renderGraphviz(makeGraph(), []);

    console.log = originalLog;
    const dot = output.join("\n");

    // Layer 0 should group express
    expect(dot).toContain("rank=same");
    expect(dot).toContain("// Layer 0");
    expect(dot).toContain("// Layer 1");
  });

  test("groups nodes at same depth in rank=same subgraphs", () => {
    // Create a graph with multiple nodes at depth 1
    const nodes = new Map<string, PackageNode>();
    nodes.set("root@1.0.0", {
      id: "root@1.0.0",
      name: "root",
      version: "1.0.0",
      license: "MIT",
      licenseCategory: "permissive",
      depth: 0,
      parents: new Set(),
      dependencies: new Map([
        ["a", "1.0.0"],
        ["b", "1.0.0"],
      ]),
    });
    nodes.set("a@1.0.0", {
      id: "a@1.0.0",
      name: "a",
      version: "1.0.0",
      license: "MIT",
      licenseCategory: "permissive",
      depth: 1,
      parents: new Set(["root@1.0.0"]),
      dependencies: new Map(),
    });
    nodes.set("b@1.0.0", {
      id: "b@1.0.0",
      name: "b",
      version: "1.0.0",
      license: "ISC",
      licenseCategory: "permissive",
      depth: 1,
      parents: new Set(["root@1.0.0"]),
      dependencies: new Map(),
    });

    const graph: DependencyGraph = {
      root: "root@1.0.0",
      nodes,
      edges: [
        { from: "root@1.0.0", to: "a@1.0.0", versionRange: "1.0.0" },
        { from: "root@1.0.0", to: "b@1.0.0", versionRange: "1.0.0" },
      ],
    };

    const output: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => output.push(args.join(" "));

    renderGraphviz(graph, []);

    console.log = originalLog;
    const dot = output.join("\n");

    // Layer 1 should contain both a and b
    const layer1Match = dot.match(/\/\/ Layer 1\n\s*\{ rank=same; (.+); \}/);
    expect(layer1Match).not.toBeNull();
    expect(layer1Match![1]).toContain("a@1.0.0");
    expect(layer1Match![1]).toContain("b@1.0.0");
  });
});
