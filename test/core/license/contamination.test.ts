import { describe, expect, it } from "bun:test";
import type { DependencyGraph, PackageNode } from "../../../src/core/graph/types.js";
import { traceContaminationPaths } from "../../../src/core/license/contamination.js";

function makeGraph(
  nodeList: Partial<PackageNode>[],
  edges: Array<{ from: string; to: string }>,
): DependencyGraph {
  const nodes = new Map<string, PackageNode>();
  for (const n of nodeList) {
    const node: PackageNode = {
      id: n.id ?? "unknown",
      name: n.name ?? "unknown",
      version: n.version ?? "0.0.0",
      license: n.license ?? null,
      licenseCategory: n.licenseCategory ?? "unknown",
      depth: n.depth ?? 0,
      parents: n.parents ?? new Set(),
      dependencies: n.dependencies ?? new Map(),
    };
    nodes.set(node.id, node);
  }

  return {
    root: nodeList[0]?.id ?? "root@0.0.0",
    nodes,
    edges: edges.map((e) => ({ ...e, versionRange: "*" })),
  };
}

describe("traceContaminationPaths", () => {
  it("finds path to copyleft package", () => {
    const graph = makeGraph(
      [
        { id: "root@1.0.0", name: "root", depth: 0, license: "MIT", licenseCategory: "permissive" },
        { id: "mid@1.0.0", name: "mid", depth: 1, license: "MIT", licenseCategory: "permissive" },
        {
          id: "gpl-dep@1.0.0",
          name: "gpl-dep",
          depth: 2,
          license: "GPL-3.0",
          licenseCategory: "copyleft",
        },
      ],
      [
        { from: "root@1.0.0", to: "mid@1.0.0" },
        { from: "mid@1.0.0", to: "gpl-dep@1.0.0" },
      ],
    );

    const result = traceContaminationPaths(graph);
    expect(result.paths).toHaveLength(1);
    expect(result.paths[0].targetId).toBe("gpl-dep@1.0.0");
    expect(result.paths[0].targetLicense).toBe("GPL-3.0");
    expect(result.paths[0].path).toEqual(["root@1.0.0", "mid@1.0.0", "gpl-dep@1.0.0"]);
    expect(result.paths[0].depth).toBe(2);
    expect(result.affectedPackageCount).toBe(1);
  });

  it("finds multiple paths to same copyleft package", () => {
    const graph = makeGraph(
      [
        { id: "root@1.0.0", name: "root", depth: 0, license: "MIT", licenseCategory: "permissive" },
        { id: "a@1.0.0", name: "a", depth: 1, license: "MIT", licenseCategory: "permissive" },
        { id: "b@1.0.0", name: "b", depth: 1, license: "MIT", licenseCategory: "permissive" },
        { id: "gpl@1.0.0", name: "gpl", depth: 2, license: "GPL-3.0", licenseCategory: "copyleft" },
      ],
      [
        { from: "root@1.0.0", to: "a@1.0.0" },
        { from: "root@1.0.0", to: "b@1.0.0" },
        { from: "a@1.0.0", to: "gpl@1.0.0" },
        { from: "b@1.0.0", to: "gpl@1.0.0" },
      ],
    );

    const result = traceContaminationPaths(graph);
    expect(result.paths.length).toBe(2);
    expect(result.affectedPackageCount).toBe(1); // Same GPL package
  });

  it("respects maxPathsPerNode limit", () => {
    // Create 5 paths to one GPL node - should only get 3
    const graph = makeGraph(
      [
        { id: "root@1.0.0", name: "root", depth: 0, license: "MIT", licenseCategory: "permissive" },
        { id: "a@1.0.0", name: "a", depth: 1, license: "MIT", licenseCategory: "permissive" },
        { id: "b@1.0.0", name: "b", depth: 1, license: "MIT", licenseCategory: "permissive" },
        { id: "c@1.0.0", name: "c", depth: 1, license: "MIT", licenseCategory: "permissive" },
        { id: "d@1.0.0", name: "d", depth: 1, license: "MIT", licenseCategory: "permissive" },
        { id: "gpl@1.0.0", name: "gpl", depth: 2, license: "GPL-3.0", licenseCategory: "copyleft" },
      ],
      [
        { from: "root@1.0.0", to: "a@1.0.0" },
        { from: "root@1.0.0", to: "b@1.0.0" },
        { from: "root@1.0.0", to: "c@1.0.0" },
        { from: "root@1.0.0", to: "d@1.0.0" },
        { from: "a@1.0.0", to: "gpl@1.0.0" },
        { from: "b@1.0.0", to: "gpl@1.0.0" },
        { from: "c@1.0.0", to: "gpl@1.0.0" },
        { from: "d@1.0.0", to: "gpl@1.0.0" },
      ],
    );

    const result = traceContaminationPaths(graph);
    expect(result.paths.length).toBe(3); // Max 3 per node
  });

  it("returns empty for no copyleft packages", () => {
    const graph = makeGraph(
      [
        { id: "root@1.0.0", name: "root", depth: 0, license: "MIT", licenseCategory: "permissive" },
        { id: "dep@1.0.0", name: "dep", depth: 1, license: "MIT", licenseCategory: "permissive" },
      ],
      [{ from: "root@1.0.0", to: "dep@1.0.0" }],
    );

    const result = traceContaminationPaths(graph);
    expect(result.paths).toHaveLength(0);
    expect(result.affectedPackageCount).toBe(0);
  });
});
