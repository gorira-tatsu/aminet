import { afterEach, describe, expect, it, vi } from "vitest";
import { renderTable } from "../../../src/cli/output/table.js";

describe("renderTable", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

  afterEach(() => {
    logSpy.mockClear();
  });

  it("renders analysis notes without rewriting their wording", () => {
    renderTable({
      root: "python-app@1.2.3",
      totalPackages: 1,
      directDependencies: 1,
      maxDepth: 1,
      entries: [],
      analysisNotes: [
        "Best-effort Python resolution: urllib3. Unpinned direct specs use the latest compatible PyPI release as a stand-in and may not match the exact environment.",
        "Skipped marker-gated Python dependencies: typing-extensions. Environment-specific requirements are not evaluated.",
      ],
      summary: {
        licenseCounts: {
          permissive: 0,
          copyleft: 0,
          "weak-copyleft": 0,
          unknown: 0,
        },
        vulnerabilityCount: 0,
        criticalCount: 0,
        highCount: 0,
        mediumCount: 0,
        lowCount: 0,
      },
    });

    const output = logSpy.mock.calls
      .map((call) => call.map((value) => String(value)).join(" "))
      .join("\n");

    expect(output).toContain("Analysis Notes:");
    expect(output).toContain(
      "Best-effort Python resolution: urllib3. Unpinned direct specs use the latest compatible PyPI release as a stand-in and may not match the exact environment.",
    );
    expect(output).toContain(
      "Skipped marker-gated Python dependencies: typing-extensions. Environment-specific requirements are not evaluated.",
    );
  });
});
