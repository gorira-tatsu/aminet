import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("py-resolver", () => {
  it("fetches latest metadata for root range specifiers", async () => {
    const getPyPIPackage = vi.fn(async (name: string, version?: string) => ({
      info: {
        name,
        version: version ?? "9.9.9",
        license: "MIT",
        summary: "",
        requires_dist: null,
        classifiers: [],
        home_page: null,
        author: null,
      },
    }));

    vi.doMock("../../../src/core/registry/pypi-client.js", () => ({
      getPyPIPackage,
      extractLicenseFromPyPI: () => "MIT",
      parsePep508: vi.fn(),
    }));

    const { resolvePythonDependencyGraph } = await import("../../../src/core/graph/py-resolver.js");

    await resolvePythonDependencyGraph("django", ">=4.0,<5.0");

    expect(getPyPIPackage).toHaveBeenCalledWith("django");
    expect(getPyPIPackage).not.toHaveBeenCalledWith("django", ">=4.0,<5.0");
  });

  it("skips direct-reference dependencies instead of resolving latest PyPI metadata", async () => {
    const getPyPIPackage = vi.fn(async (name: string, version?: string) => ({
      info: {
        name,
        version: version ?? "1.0.0",
        license: "MIT",
        summary: "",
        requires_dist: ["demo @ https://example.com/demo-1.0.0.tar.gz"],
        classifiers: [],
        home_page: null,
        author: null,
      },
    }));

    vi.doMock("../../../src/core/registry/pypi-client.js", () => ({
      getPyPIPackage,
      extractLicenseFromPyPI: () => "MIT",
      parsePep508: (spec: string) => {
        if (spec.startsWith("demo @ ")) {
          return {
            name: "demo",
            versionSpec: "@ https://example.com/demo-1.0.0.tar.gz",
            hasMarker: false,
          };
        }
        return null;
      },
    }));

    const { resolvePythonDependencyGraph } = await import("../../../src/core/graph/py-resolver.js");

    const graph = await resolvePythonDependencyGraph("rootpkg", "latest");

    expect(getPyPIPackage).toHaveBeenCalledTimes(1);
    expect(graph.nodes.size).toBe(1);
    expect(graph.edges).toHaveLength(0);
  });

  it("resolves a simple dependency chain and preserves edges", async () => {
    const packages = new Map([
      [
        "rootpkg",
        {
          info: {
            name: "rootpkg",
            version: "1.0.0",
            license: "MIT",
            summary: "",
            requires_dist: ["dep-b==2.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        },
      ],
      [
        "dep-b@2.0.0",
        {
          info: {
            name: "dep-b",
            version: "2.0.0",
            license: "Apache-2.0",
            summary: "",
            requires_dist: ["dep-c>=3.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        },
      ],
      [
        "dep-c",
        {
          info: {
            name: "dep-c",
            version: "3.1.0",
            license: "BSD-3-Clause",
            summary: "",
            requires_dist: null,
            classifiers: [],
            home_page: null,
            author: null,
          },
        },
      ],
    ]);

    const getPyPIPackage = vi.fn(async (name: string, version?: string) => {
      const key = version ? `${name}@${version}` : name;
      return packages.get(key)!;
    });

    vi.doMock("../../../src/core/registry/pypi-client.js", () => ({
      getPyPIPackage,
      extractLicenseFromPyPI: (info: { license: string | null }) => info.license,
      parsePep508: (spec: string) => {
        if (spec === "dep-b==2.0.0")
          return { name: "dep-b", versionSpec: "==2.0.0", hasMarker: false };
        if (spec === "dep-c>=3.0.0")
          return { name: "dep-c", versionSpec: ">=3.0.0", hasMarker: false };
        return null;
      },
    }));

    const { resolvePythonDependencyGraph } = await import("../../../src/core/graph/py-resolver.js");
    const graph = await resolvePythonDependencyGraph("rootpkg", "latest", { maxDepth: 4 });

    expect(graph.root).toBe("rootpkg@1.0.0");
    expect(graph.nodes.size).toBe(3);
    expect(graph.edges).toEqual([
      { from: "rootpkg@1.0.0", to: "dep-b@2.0.0", versionRange: "==2.0.0" },
      { from: "dep-b@2.0.0", to: "dep-c@3.1.0", versionRange: ">=3.0.0" },
    ]);
  });

  it("respects maxDepth and stops traversing deeper dependencies", async () => {
    const getPyPIPackage = vi.fn(async (name: string, version?: string) => {
      if (name === "rootpkg") {
        return {
          info: {
            name: "rootpkg",
            version: "1.0.0",
            license: "MIT",
            summary: "",
            requires_dist: ["dep-b==2.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        };
      }
      if (name === "dep-b" && version === "2.0.0") {
        return {
          info: {
            name: "dep-b",
            version: "2.0.0",
            license: "MIT",
            summary: "",
            requires_dist: ["dep-c==3.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        };
      }
      throw new Error(`unexpected fetch for ${name}@${version ?? "latest"}`);
    });

    vi.doMock("../../../src/core/registry/pypi-client.js", () => ({
      getPyPIPackage,
      extractLicenseFromPyPI: (info: { license: string | null }) => info.license,
      parsePep508: (spec: string) => {
        if (spec === "dep-b==2.0.0")
          return { name: "dep-b", versionSpec: "==2.0.0", hasMarker: false };
        if (spec === "dep-c==3.0.0")
          return { name: "dep-c", versionSpec: "==3.0.0", hasMarker: false };
        return null;
      },
    }));

    const { resolvePythonDependencyGraph } = await import("../../../src/core/graph/py-resolver.js");
    const graph = await resolvePythonDependencyGraph("rootpkg", "latest", { maxDepth: 1 });

    expect(graph.nodes.has("dep-b@2.0.0")).toBe(true);
    expect(graph.nodes.has("dep-c@3.0.0")).toBe(false);
    expect(getPyPIPackage).toHaveBeenCalledTimes(2);
  });

  it("handles circular dependencies without infinite recursion", async () => {
    const getPyPIPackage = vi.fn(async (name: string, version?: string) => {
      if (name === "rootpkg") {
        return {
          info: {
            name: "rootpkg",
            version: "1.0.0",
            license: "MIT",
            summary: "",
            requires_dist: ["dep-b==2.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        };
      }
      if (name === "dep-b" && version === "2.0.0") {
        return {
          info: {
            name: "dep-b",
            version: "2.0.0",
            license: "MIT",
            summary: "",
            requires_dist: ["rootpkg==1.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        };
      }
      if (name === "rootpkg" && version === "1.0.0") {
        return {
          info: {
            name: "rootpkg",
            version: "1.0.0",
            license: "MIT",
            summary: "",
            requires_dist: ["dep-b==2.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        };
      }
      throw new Error(`unexpected fetch for ${name}@${version ?? "latest"}`);
    });

    vi.doMock("../../../src/core/registry/pypi-client.js", () => ({
      getPyPIPackage,
      extractLicenseFromPyPI: (info: { license: string | null }) => info.license,
      parsePep508: (spec: string) => {
        if (spec === "dep-b==2.0.0")
          return { name: "dep-b", versionSpec: "==2.0.0", hasMarker: false };
        if (spec === "rootpkg==1.0.0")
          return { name: "rootpkg", versionSpec: "==1.0.0", hasMarker: false };
        return null;
      },
    }));

    const { resolvePythonDependencyGraph } = await import("../../../src/core/graph/py-resolver.js");
    const graph = await resolvePythonDependencyGraph("rootpkg", "latest", { maxDepth: 5 });

    expect(graph.nodes.size).toBe(2);
    expect(graph.edges).toEqual([
      { from: "rootpkg@1.0.0", to: "dep-b@2.0.0", versionRange: "==2.0.0" },
      { from: "dep-b@2.0.0", to: "rootpkg@1.0.0", versionRange: "==1.0.0" },
    ]);
  });

  it("continues resolving remaining dependencies when one transitive fetch fails", async () => {
    const getPyPIPackage = vi.fn(async (name: string, version?: string) => {
      if (name === "rootpkg") {
        return {
          info: {
            name: "rootpkg",
            version: "1.0.0",
            license: "MIT",
            summary: "",
            requires_dist: ["good==1.0.0", "missing==2.0.0"],
            classifiers: [],
            home_page: null,
            author: null,
          },
        };
      }
      if (name === "good" && version === "1.0.0") {
        return {
          info: {
            name: "good",
            version: "1.0.0",
            license: "MIT",
            summary: "",
            requires_dist: null,
            classifiers: [],
            home_page: null,
            author: null,
          },
        };
      }
      throw new Error("PyPI package not found: missing@2.0.0");
    });

    vi.doMock("../../../src/core/registry/pypi-client.js", () => ({
      getPyPIPackage,
      extractLicenseFromPyPI: (info: { license: string | null }) => info.license,
      parsePep508: (spec: string) => {
        if (spec === "good==1.0.0")
          return { name: "good", versionSpec: "==1.0.0", hasMarker: false };
        if (spec === "missing==2.0.0")
          return { name: "missing", versionSpec: "==2.0.0", hasMarker: false };
        return null;
      },
    }));

    const { resolvePythonDependencyGraph } = await import("../../../src/core/graph/py-resolver.js");
    const graph = await resolvePythonDependencyGraph("rootpkg", "latest");

    expect(graph.nodes.size).toBe(2);
    expect(graph.nodes.has("good@1.0.0")).toBe(true);
    expect(graph.nodes.has("missing@2.0.0")).toBe(false);
    expect(graph.edges).toEqual([
      { from: "rootpkg@1.0.0", to: "good@1.0.0", versionRange: "==1.0.0" },
    ]);
  });

  it("returns only the root node when the package has no dependencies", async () => {
    const getPyPIPackage = vi.fn(async () => ({
      info: {
        name: "solo",
        version: "1.2.3",
        license: "MIT",
        summary: "",
        requires_dist: null,
        classifiers: [],
        home_page: null,
        author: null,
      },
    }));

    vi.doMock("../../../src/core/registry/pypi-client.js", () => ({
      getPyPIPackage,
      extractLicenseFromPyPI: (info: { license: string | null }) => info.license,
      parsePep508: vi.fn(),
    }));

    const { resolvePythonDependencyGraph } = await import("../../../src/core/graph/py-resolver.js");
    const graph = await resolvePythonDependencyGraph("solo", "latest");

    expect(graph.root).toBe("solo@1.2.3");
    expect(graph.nodes.size).toBe(1);
    expect(graph.edges).toHaveLength(0);
  });
});
