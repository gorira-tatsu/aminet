import { describe, expect, it } from "bun:test";
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
});
