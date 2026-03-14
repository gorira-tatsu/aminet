import { describe, expect, it } from "bun:test";
import { renderMarkdownComment } from "../../../src/cli/output/markdown.js";
import type { DependencyDiff } from "../../../src/core/diff/types.js";

function makeEmptyDiff(): DependencyDiff {
  return {
    added: [],
    removed: [],
    updated: [],
    licenseChanged: [],
    newVulnerabilities: [],
    resolvedVulnerabilities: [],
    newSecuritySignals: [],
    resolvedSecuritySignals: [],
    summary: {
      addedCount: 0,
      removedCount: 0,
      updatedCount: 0,
      newVulnCount: 0,
      resolvedVulnCount: 0,
      newSecuritySignalCount: 0,
      resolvedSecuritySignalCount: 0,
      licenseChangeCount: 0,
      riskLevel: "none",
    },
  };
}

describe("renderMarkdownComment", () => {
  it("includes ami-review marker", () => {
    const diff = makeEmptyDiff();
    const md = renderMarkdownComment(diff);
    expect(md).toContain("<!-- ami-review -->");
  });

  it("includes summary table", () => {
    const diff = makeEmptyDiff();
    diff.summary.addedCount = 3;
    diff.added = [
      { name: "a", version: "1.0.0", license: "MIT", licenseCategory: "permissive", depth: 1 },
      { name: "b", version: "2.0.0", license: "ISC", licenseCategory: "permissive", depth: 1 },
      { name: "c", version: "3.0.0", license: null, licenseCategory: "unknown", depth: 2 },
    ];
    const md = renderMarkdownComment(diff);
    expect(md).toContain("| Added | 3 |");
    expect(md).toContain("## ami Dependency Review");
  });

  it("renders new dependencies section", () => {
    const diff = makeEmptyDiff();
    diff.added = [
      {
        name: "lodash",
        version: "4.17.21",
        license: "MIT",
        licenseCategory: "permissive",
        depth: 1,
      },
    ];
    diff.summary.addedCount = 1;
    const md = renderMarkdownComment(diff);
    expect(md).toContain("### New Dependencies");
    expect(md).toContain("lodash");
    expect(md).toContain("4.17.21");
  });

  it("renders vulnerability changes", () => {
    const diff = makeEmptyDiff();
    diff.newVulnerabilities = [
      {
        packageId: "pkg@1.0.0",
        name: "pkg",
        version: "1.0.0",
        vulnerabilities: [{ id: "GHSA-123", summary: "Bad stuff", severity: "HIGH", aliases: [] }],
      },
    ];
    diff.summary.newVulnCount = 1;
    const md = renderMarkdownComment(diff);
    expect(md).toContain("### New Vulnerabilities");
    expect(md).toContain("GHSA-123");
    expect(md).toContain("HIGH");
  });

  it("renders license changes", () => {
    const diff = makeEmptyDiff();
    diff.licenseChanged = [
      {
        name: "pkg",
        version: "2.0.0",
        previousLicense: "MIT",
        previousCategory: "permissive",
        newLicense: "GPL-3.0",
        newCategory: "copyleft",
      },
    ];
    diff.summary.licenseChangeCount = 1;
    const md = renderMarkdownComment(diff);
    expect(md).toContain("### License Changes");
    expect(md).toContain("MIT");
    expect(md).toContain("GPL-3.0");
  });

  it("includes risk level", () => {
    const diff = makeEmptyDiff();
    diff.summary.riskLevel = "critical";
    const md = renderMarkdownComment(diff);
    expect(md).toContain(":red_circle:");
    expect(md).toContain("Critical");
  });

  it("renders security signal changes", () => {
    const diff = makeEmptyDiff();
    diff.newSecuritySignals = [
      {
        packageId: "pkg@1.0.0",
        name: "pkg",
        version: "1.0.0",
        signals: [
          {
            category: "install-script",
            severity: "high",
            packageId: "pkg@1.0.0",
            name: "pkg",
            version: "1.0.0",
            title: "Install script present",
            description: "postinstall script detected",
          },
        ],
      },
    ];
    diff.summary.newSecuritySignalCount = 1;

    const md = renderMarkdownComment(diff);
    expect(md).toContain("### New Security Signals");
    expect(md).toContain("Install script present");
    expect(md).toContain("HIGH");
  });
});
