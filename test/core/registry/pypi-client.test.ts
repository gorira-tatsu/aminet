import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { fetchWithRetry } = vi.hoisted(() => ({
  fetchWithRetry: vi.fn(),
}));

vi.mock("../../../src/utils/http.js", () => ({
  fetchWithRetry,
}));

import {
  clearPyPICache,
  extractLicenseFromPyPI,
  getPyPIPackage,
  parsePep508,
} from "../../../src/core/registry/pypi-client.js";

beforeEach(() => {
  clearPyPICache();
  fetchWithRetry.mockReset();
});

afterEach(() => {
  clearPyPICache();
});

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

    it("returns the first matching SPDX classifier when multiple are present", () => {
      const result = extractLicenseFromPyPI({
        name: "test",
        version: "1.0.0",
        license: "BSD-2-Clause",
        summary: "",
        requires_dist: null,
        classifiers: [
          "License :: OSI Approved :: MIT License",
          "License :: OSI Approved :: Apache Software License",
        ],
        home_page: null,
        author: null,
      });
      expect(result).toBe("MIT");
    });
  });

  describe("getPyPIPackage", () => {
    it("returns a cached result without fetching again", async () => {
      const payload = {
        info: {
          name: "requests",
          version: "2.31.0",
          license: "Apache-2.0",
          summary: "",
          requires_dist: null,
          classifiers: [],
          home_page: null,
          author: null,
        },
        releases: {},
      };
      fetchWithRetry.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => payload,
      });

      const first = await getPyPIPackage("requests", "2.31.0");
      const second = await getPyPIPackage("requests", "2.31.0");

      expect(first).toEqual(payload);
      expect(second).toBe(first);
      expect(fetchWithRetry).toHaveBeenCalledTimes(1);
    });

    it("throws a descriptive error on 404", async () => {
      fetchWithRetry.mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
      });

      await expect(getPyPIPackage("missing", "1.0.0")).rejects.toThrow(
        "PyPI package not found: missing@1.0.0",
      );
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
