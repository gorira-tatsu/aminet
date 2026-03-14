import { describe, expect, it } from "bun:test";
import type { DependencyGraph, PackageNode } from "../../../src/core/graph/types.js";
import {
  checkCompatibility,
  checkTreeCompatibility,
} from "../../../src/core/license/compatibility.js";

describe("checkCompatibility", () => {
  it("same license is compatible", () => {
    const result = checkCompatibility("MIT", "MIT");
    expect(result.result).toBe("compatible");
  });

  it("MIT and GPL-3.0 is one-way", () => {
    const result = checkCompatibility("MIT", "GPL-3.0");
    expect(result.result).toBe("one-way");
    expect(result.combinedLicense).toBe("GPL-3.0");
  });

  it("GPL-3.0 and MIT is one-way (bidirectional lookup)", () => {
    const result = checkCompatibility("GPL-3.0", "MIT");
    expect(result.result).toBe("one-way");
  });

  it("Apache-2.0 and GPL-2.0 is incompatible", () => {
    const result = checkCompatibility("Apache-2.0", "GPL-2.0");
    expect(result.result).toBe("incompatible");
    expect(result.explanation).toContain("patent");
  });

  it("Apache-2.0 and GPL-3.0 is one-way", () => {
    const result = checkCompatibility("Apache-2.0", "GPL-3.0");
    expect(result.result).toBe("one-way");
    expect(result.combinedLicense).toBe("GPL-3.0");
  });

  it("GPL-2.0 and GPL-3.0 is incompatible (without -or-later)", () => {
    const result = checkCompatibility("GPL-2.0", "GPL-3.0");
    expect(result.result).toBe("incompatible");
  });

  it("GPL-2.0-or-later and GPL-3.0 is compatible", () => {
    const result = checkCompatibility("GPL-2.0-or-later", "GPL-3.0");
    expect(result.result).toBe("compatible");
  });

  it("LGPL-2.1 and MIT is compatible", () => {
    const result = checkCompatibility("LGPL-2.1", "MIT");
    expect(result.result).toBe("compatible");
  });

  it("MPL-2.0 and GPL-3.0 is compatible", () => {
    const result = checkCompatibility("MPL-2.0", "GPL-3.0");
    expect(result.result).toBe("compatible");
  });

  it("MIT and Apache-2.0 is compatible", () => {
    const result = checkCompatibility("MIT", "Apache-2.0");
    expect(result.result).toBe("compatible");
  });

  it("unknown licenses return unknown", () => {
    const result = checkCompatibility("CustomLicense-1.0", "WeirdLicense-2.0");
    expect(result.result).toBe("unknown");
  });
});

describe("checkTreeCompatibility", () => {
  it("finds incompatible license pairs in tree", () => {
    const nodes = new Map<string, PackageNode>();
    nodes.set("root@1.0.0", {
      id: "root@1.0.0",
      name: "root",
      version: "1.0.0",
      license: null,
      licenseCategory: "unknown",
      depth: 0,
      parents: new Set(),
      dependencies: new Map(),
    });
    nodes.set("apache-lib@1.0.0", {
      id: "apache-lib@1.0.0",
      name: "apache-lib",
      version: "1.0.0",
      license: "Apache-2.0",
      licenseCategory: "permissive",
      depth: 1,
      parents: new Set(["root@1.0.0"]),
      dependencies: new Map(),
    });
    nodes.set("dep@1.0.0", {
      id: "dep@1.0.0",
      name: "dep",
      version: "1.0.0",
      license: "GPL-2.0",
      licenseCategory: "copyleft",
      depth: 1,
      parents: new Set(["root@1.0.0"]),
      dependencies: new Map(),
    });

    const graph: DependencyGraph = {
      root: "root@1.0.0",
      nodes,
      edges: [
        { from: "root@1.0.0", to: "apache-lib@1.0.0", versionRange: "*" },
        { from: "root@1.0.0", to: "dep@1.0.0", versionRange: "*" },
      ],
    };

    const pairs = checkTreeCompatibility(graph);
    expect(pairs.length).toBeGreaterThan(0);
    const apacheGpl = pairs.find(
      (p) =>
        (p.licenseA === "Apache-2.0" && p.licenseB === "GPL-2.0") ||
        (p.licenseA === "GPL-2.0" && p.licenseB === "Apache-2.0"),
    );
    expect(apacheGpl).toBeDefined();
  });

  it("returns empty for compatible tree", () => {
    const nodes = new Map<string, PackageNode>();
    nodes.set("root@1.0.0", {
      id: "root@1.0.0",
      name: "root",
      version: "1.0.0",
      license: "MIT",
      licenseCategory: "permissive",
      depth: 0,
      parents: new Set(),
      dependencies: new Map(),
    });
    nodes.set("dep@1.0.0", {
      id: "dep@1.0.0",
      name: "dep",
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
      edges: [{ from: "root@1.0.0", to: "dep@1.0.0", versionRange: "*" }],
    };

    const pairs = checkTreeCompatibility(graph);
    expect(pairs).toHaveLength(0);
  });
});
