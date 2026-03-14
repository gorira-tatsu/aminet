import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../src/core/config/loader.js";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `ami-config-test-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns empty object when no config file exists", () => {
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  test("loads config from ami.config.json", () => {
    const configData = {
      denyLicenses: ["GPL-3.0"],
      depth: 5,
      concurrency: 3,
    };
    writeFileSync(join(tmpDir, "ami.config.json"), JSON.stringify(configData));

    const config = loadConfig(tmpDir);
    expect(config.denyLicenses).toEqual(["GPL-3.0"]);
    expect(config.depth).toBe(5);
    expect(config.concurrency).toBe(3);
  });

  test("returns empty object for invalid JSON", () => {
    writeFileSync(join(tmpDir, "ami.config.json"), "not json{");
    const config = loadConfig(tmpDir);
    expect(config).toEqual({});
  });

  test("loads all config fields", () => {
    const configData = {
      denyLicenses: ["GPL-3.0", "AGPL-3.0"],
      allowLicenses: ["MIT", "ISC"],
      licenseOverrides: { "pkg@1.0.0": "MIT" },
      failOnVuln: "high",
      failOnLicense: "copyleft",
      depth: 10,
      concurrency: 5,
      deepLicenseCheck: true,
    };
    writeFileSync(join(tmpDir, "ami.config.json"), JSON.stringify(configData));

    const config = loadConfig(tmpDir);
    expect(config.denyLicenses).toEqual(["GPL-3.0", "AGPL-3.0"]);
    expect(config.allowLicenses).toEqual(["MIT", "ISC"]);
    expect(config.licenseOverrides).toEqual({ "pkg@1.0.0": "MIT" });
    expect(config.failOnVuln).toBe("high");
    expect(config.failOnLicense).toBe("copyleft");
    expect(config.deepLicenseCheck).toBe(true);
  });
});
