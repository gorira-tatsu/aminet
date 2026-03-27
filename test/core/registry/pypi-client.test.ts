import { describe, expect, it } from "vitest";
import { extractLicenseFromPyPI, parsePep508 } from "../../../src/core/registry/pypi-client.js";

describe("pypi-client", () => {
  describe("extractLicenseFromPyPI", () => {
    it("extracts license from classifier", () => {
      const result = extractLicenseFromPyPI({
        name: "test",
        version: "1.0.0",
        license: null,
        summary: "",
        requires_dist: null,
        classifiers: ["License :: OSI Approved :: MIT License"],
        home_page: null,
        author: null,
      });
      expect(result).toBe("MIT");
    });

    it("falls back to license field when no classifier matches", () => {
      const result = extractLicenseFromPyPI({
        name: "test",
        version: "1.0.0",
        license: "BSD-2-Clause",
        summary: "",
        requires_dist: null,
        classifiers: ["Programming Language :: Python :: 3"],
        home_page: null,
        author: null,
      });
      expect(result).toBe("BSD-2-Clause");
    });

    it("returns null when no license info available", () => {
      const result = extractLicenseFromPyPI({
        name: "test",
        version: "1.0.0",
        license: null,
        summary: "",
        requires_dist: null,
        classifiers: [],
        home_page: null,
        author: null,
      });
      expect(result).toBeNull();
    });
  });

  describe("parsePep508", () => {
    it("parses simple package name", () => {
      const result = parsePep508("requests");
      expect(result).toEqual({ name: "requests", versionSpec: "", hasMarker: false });
    });

    it("parses package with version spec", () => {
      const result = parsePep508("requests>=2.20.0");
      expect(result).toEqual({ name: "requests", versionSpec: ">=2.20.0", hasMarker: false });
    });

    it("parses package with parenthesized version", () => {
      const result = parsePep508("numpy (>=1.21,<2.0)");
      expect(result).toEqual({ name: "numpy", versionSpec: ">=1.21,<2.0", hasMarker: false });
    });

    it("detects environment markers", () => {
      const result = parsePep508("typing-extensions; python_version < '3.8'");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("typing-extensions");
      expect(result!.hasMarker).toBe(true);
    });

    it("handles extras", () => {
      const result = parsePep508("black[jupyter]>=23.0");
      expect(result).not.toBeNull();
      expect(result!.name).toBe("black");
      expect(result!.versionSpec).toBe(">=23.0");
    });

    it("returns null for empty string", () => {
      expect(parsePep508("")).toBeNull();
    });
  });
});
