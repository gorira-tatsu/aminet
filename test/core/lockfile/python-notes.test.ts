import { describe, expect, it } from "vitest";
import { buildPythonManifestNotes } from "../../../src/core/lockfile/python-notes.js";

describe("buildPythonManifestNotes", () => {
  it("formats aligned analyze notes for best-effort, marker skips, and directives", () => {
    const notes = buildPythonManifestNotes(
      {
        name: "demo",
        version: "1.0.0",
        dependencies: new Map([["urllib3", ""]]),
        devDependencies: new Map(),
        skipped: [
          {
            name: "typing-extensions",
            spec: 'typing-extensions; python_version < "3.11"',
            reason: "marker",
          },
          { spec: "-r base.txt", reason: "directive" },
          { spec: "-e .", reason: "directive" },
        ],
        bestEffortDependencies: ["urllib3"],
      },
      { mode: "analyze" },
    );

    expect(notes).toEqual([
      "Best-effort Python resolution: urllib3. Unpinned direct specs use the latest compatible PyPI release as a stand-in and may not match the exact environment.",
      "Skipped marker-gated Python dependencies: typing-extensions. Environment-specific requirements are not evaluated.",
      "Ignored requirements.txt directives: -r base.txt, -e .. Only direct package specifiers are analyzed.",
    ]);
  });

  it("caps long note lists and keeps review-specific dev messaging last", () => {
    const notes = buildPythonManifestNotes(
      {
        name: "demo",
        version: "1.0.0",
        dependencies: new Map(),
        devDependencies: new Map([
          ["pytest", ">=8.0"],
          ["ruff", "0.12.0"],
        ]),
        skipped: [
          { spec: "-r base.txt", reason: "directive" },
          { spec: "-e .", reason: "directive" },
          { spec: "--index-url https://example.invalid/simple", reason: "directive" },
          { spec: "--extra-index-url https://example.invalid/extra", reason: "directive" },
        ],
        bestEffortDependencies: ["urllib3", "httpx", "fastapi", "pydantic"],
      },
      { includeDev: true, mode: "review" },
    );

    expect(notes).toEqual([
      "Best-effort Python resolution: urllib3, httpx, fastapi (+1 more). Unpinned direct specs use the latest compatible PyPI release as a stand-in and may not match the exact environment.",
      "Ignored requirements.txt directives: -r base.txt, -e ., --index-url https://example.invalid/simple (+1 more). Only direct package specifiers are analyzed.",
      "Included 2 Python optional/dev dependencies in review mode.",
    ]);
  });
});
