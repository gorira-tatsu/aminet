import { describe, expect, it } from "vitest";
import {
  buildDefaultConfig,
  mergeConfigs,
  normalizeThresholdInput,
  parseBooleanInput,
} from "../../../src/cli/commands/init.js";

describe("init command helpers", () => {
  describe("buildDefaultConfig", () => {
    it("returns a valid config with expected defaults", () => {
      const config = buildDefaultConfig();
      expect(config.failOnVuln).toBe("high");
      expect(config.security).toBe(true);
      expect(config.concurrency).toBe(5);
      expect(config.deepLicenseCheck).toBe(false);
      expect(config.denyLicenses).toEqual([]);
      expect(config.allowLicenses).toEqual([]);
      expect(config.excludePackages).toEqual([]);
    });

    it("does not include npmToken or licenseOverrides", () => {
      const config = buildDefaultConfig();
      expect(config.npmToken).toBeUndefined();
      expect(config.licenseOverrides).toBeUndefined();
    });
  });

  describe("mergeConfigs", () => {
    it("preserves existing values over defaults", () => {
      const existing = { failOnVuln: "critical", denyLicenses: ["GPL-3.0"] };
      const defaults = buildDefaultConfig();
      const merged = mergeConfigs(existing, defaults);

      expect(merged.failOnVuln).toBe("critical");
      expect(merged.denyLicenses).toEqual(["GPL-3.0"]);
      expect(merged.security).toBe(true); // from defaults
      expect(merged.concurrency).toBe(5); // from defaults
    });

    it("fills in missing fields from defaults", () => {
      const existing = { security: false };
      const defaults = buildDefaultConfig();
      const merged = mergeConfigs(existing, defaults);

      expect(merged.security).toBe(false); // existing wins
      expect(merged.failOnVuln).toBe("high"); // from defaults
    });

    it("does not drop existing fields not in defaults", () => {
      const existing = { npmToken: "tok_123", failOnVuln: "low" };
      const defaults = buildDefaultConfig();
      const merged = mergeConfigs(existing, defaults);

      expect(merged.npmToken).toBe("tok_123");
    });
  });

  describe("parseBooleanInput", () => {
    it("accepts common truthy values", () => {
      expect(parseBooleanInput("y", false)).toBe(true);
      expect(parseBooleanInput("YES", false)).toBe(true);
      expect(parseBooleanInput("1", false)).toBe(true);
    });

    it("accepts common falsy values", () => {
      expect(parseBooleanInput("n", true)).toBe(false);
      expect(parseBooleanInput("No", true)).toBe(false);
      expect(parseBooleanInput("0", true)).toBe(false);
    });

    it("falls back on empty input", () => {
      expect(parseBooleanInput("", true)).toBe(true);
      expect(parseBooleanInput("   ", false)).toBe(false);
    });

    it("rejects unrecognized input", () => {
      expect(parseBooleanInput("maybe", true)).toBeNull();
    });
  });

  describe("normalizeThresholdInput", () => {
    it("normalizes valid values", () => {
      const allowed = new Set(["low", "medium", "high", "critical"]);
      expect(normalizeThresholdInput("HIGH", allowed)).toBe("high");
      expect(normalizeThresholdInput(" critical ", allowed)).toBe("critical");
    });

    it("allows empty input for optional prompts", () => {
      const allowed = new Set(["copyleft", "weak-copyleft"]);
      expect(normalizeThresholdInput("", allowed)).toBe("");
    });

    it("rejects invalid threshold values", () => {
      const allowed = new Set(["low", "medium", "high", "critical"]);
      expect(normalizeThresholdInput("hgh", allowed)).toBeNull();
    });
  });
});
