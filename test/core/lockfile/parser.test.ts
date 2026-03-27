import { describe, expect, it } from "vitest";
import { parseLockfile } from "../../../src/core/lockfile/parser.js";

describe("parseLockfile", () => {
  describe("bun.lock", () => {
    it("parses packages from bun.lock format", () => {
      const content = JSON.stringify({
        lockfileVersion: 1,
        packages: {
          express: ["express@4.21.2", "", {}],
          "@types/node": ["@types/node@20.11.0", "", {}],
          semver: ["semver@7.6.0", "", {}],
        },
      });

      const result = parseLockfile("bun.lock", content);
      expect(result).not.toBeNull();
      expect(result!.format).toBe("bun.lock");
      expect(result!.packages.get("express")).toBe("4.21.2");
      expect(result!.packages.get("@types/node")).toBe("20.11.0");
      expect(result!.packages.get("semver")).toBe("7.6.0");
    });

    it("handles empty packages", () => {
      const content = JSON.stringify({ lockfileVersion: 1, packages: {} });
      const result = parseLockfile("bun.lock", content);
      expect(result).not.toBeNull();
      expect(result!.packages.size).toBe(0);
    });

    it("returns null for invalid JSON", () => {
      const result = parseLockfile("bun.lock", "not json");
      expect(result).toBeNull();
    });
  });

  describe("package-lock.json", () => {
    it("parses v2/v3 format with packages map", () => {
      const content = JSON.stringify({
        lockfileVersion: 3,
        packages: {
          "": { name: "my-app", version: "1.0.0" },
          "node_modules/express": { version: "4.21.2" },
          "node_modules/@types/node": { version: "20.11.0" },
        },
      });

      const result = parseLockfile("package-lock.json", content);
      expect(result).not.toBeNull();
      expect(result!.format).toBe("package-lock.json");
      expect(result!.packages.get("express")).toBe("4.21.2");
      expect(result!.packages.get("@types/node")).toBe("20.11.0");
    });

    it("parses v1 format with dependencies", () => {
      const content = JSON.stringify({
        lockfileVersion: 1,
        dependencies: {
          express: { version: "4.21.2" },
          debug: { version: "4.3.4" },
        },
      });

      const result = parseLockfile("package-lock.json", content);
      expect(result).not.toBeNull();
      expect(result!.packages.get("express")).toBe("4.21.2");
      expect(result!.packages.get("debug")).toBe("4.3.4");
    });

    it("returns null for unknown filename", () => {
      const result = parseLockfile("yarn.lock", "");
      expect(result).toBeNull();
    });
  });

  describe("pnpm-lock.yaml", () => {
    it("parses importer dependencies from pnpm lockfiles", () => {
      const content = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      express:
        specifier: ^4.21.2
        version: 4.21.2
      "@types/node":
        specifier: ^20.11.0
        version: 20.11.0
    devDependencies:
      vitest:
        specifier: ^3.2.4
        version: 3.2.4
`;

      const result = parseLockfile("pnpm-lock.yaml", content);
      expect(result).not.toBeNull();
      expect(result!.format).toBe("pnpm-lock.yaml");
      expect(result!.packages.get("express")).toBe("4.21.2");
      expect(result!.packages.get("@types/node")).toBe("20.11.0");
      expect(result!.packages.get("vitest")).toBe("3.2.4");
    });

    it("normalizes versions with peer suffixes", () => {
      const content = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      eslint:
        specifier: ^9.0.0
        version: 9.39.1(@types/node@25.5.0)
`;

      const result = parseLockfile("pnpm-lock.yaml", content);
      expect(result?.packages.get("eslint")).toBe("9.39.1");
    });

    it("reads workspace importer when workspacePath is provided", () => {
      const content = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      root-pkg:
        specifier: ^1.0.0
        version: 1.0.0
  packages/frontend:
    dependencies:
      react:
        specifier: ^18.3.0
        version: 18.3.1
    devDependencies:
      vitest:
        specifier: ^3.2.0
        version: 3.2.4
`;

      const result = parseLockfile("pnpm-lock.yaml", content, "packages/frontend");
      expect(result).not.toBeNull();
      expect(result!.packages.get("react")).toBe("18.3.1");
      expect(result!.packages.get("vitest")).toBe("3.2.4");
      expect(result!.packages.has("root-pkg")).toBe(false);
    });

    it("falls back to root importer when workspace path not found", () => {
      const content = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      express:
        specifier: ^4.21.0
        version: 4.21.2
`;

      const result = parseLockfile("pnpm-lock.yaml", content, "packages/nonexistent");
      expect(result).not.toBeNull();
      expect(result!.packages.get("express")).toBe("4.21.2");
    });

    it("reads root importer when no workspacePath provided", () => {
      const content = `
lockfileVersion: '9.0'
importers:
  .:
    dependencies:
      express:
        specifier: ^4.21.0
        version: 4.21.2
  packages/lib:
    dependencies:
      lodash:
        specifier: ^4.17.0
        version: 4.17.21
`;

      const result = parseLockfile("pnpm-lock.yaml", content);
      expect(result).not.toBeNull();
      expect(result!.packages.get("express")).toBe("4.21.2");
      expect(result!.packages.has("lodash")).toBe(false);
    });
  });
});
