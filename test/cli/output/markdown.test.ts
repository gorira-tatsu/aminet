import { describe, expect, it } from "vitest";
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
  it("includes aminet-review marker", () => {
    const diff = makeEmptyDiff();
    const md = renderMarkdownComment(diff);
    expect(md).toContain("<!-- aminet-review -->");
  });

  it("includes summary table", () => {
    const diff = makeEmptyDiff();
    diff.summary.addedCount = 3;
    diff.added = [
      {
        name: "a",
        version: "1.0.0",
        license: "MIT",
        licenseCategory: "permissive",
        licenseDetails: [],
        depth: 1,
      },
      {
        name: "b",
        version: "2.0.0",
        license: "ISC",
        licenseCategory: "permissive",
        licenseDetails: [],
        depth: 1,
      },
      {
        name: "c",
        version: "3.0.0",
        license: null,
        licenseCategory: "unknown",
        licenseDetails: [],
        depth: 2,
      },
    ];
    const md = renderMarkdownComment(diff);
    expect(md).toContain("| Added | 3 |");
    expect(md).toContain("## aminet Dependency Review");
  });

  it("renders new dependencies section", () => {
    const diff = makeEmptyDiff();
    diff.added = [
      {
        name: "lodash",
        version: "4.17.21",
        declaredVersion: "^4.17.0",
        resolvedVersion: "4.17.21",
        license: "MIT",
        licenseCategory: "permissive",
        licenseDetails: [],
        depth: 1,
      },
    ];
    diff.summary.addedCount = 1;
    const md = renderMarkdownComment(diff);
    expect(md).toContain("### New Dependencies");
    expect(md).toContain("lodash");
    expect(md).toContain("4.17.21");
    expect(md).toContain("^4.17.0");
  });

  it("renders vulnerability changes", () => {
    const diff = makeEmptyDiff();
    diff.newVulnerabilities = [
      {
        packageId: "pkg@1.0.0",
        name: "pkg",
        version: "1.0.0",
        vulnerabilities: [
          {
            id: "GHSA-123",
            summary: "Bad stuff",
            severity: "HIGH",
            aliases: ["CVE-2025-0001"],
            fixedVersion: "1.0.1",
            sources: ["ghsa"],
            references: [],
          },
        ],
      },
    ];
    diff.summary.newVulnCount = 1;
    const md = renderMarkdownComment(diff);
    expect(md).toContain("### New Vulnerabilities");
    expect(md).toContain("GHSA-123");
    expect(md).toContain("HIGH");
    expect(md).toContain("1.0.1");
    expect(md).toContain("CVE-2025-0001");
  });

  it("renders license changes", () => {
    const diff = makeEmptyDiff();
    diff.licenseChanged = [
      {
        name: "pkg",
        version: "2.0.0",
        previousLicense: "MIT",
        previousCategory: "permissive",
        previousLicenseDetails: [],
        newLicense: "GPL-3.0",
        newCategory: "copyleft",
        newLicenseDetails: [
          {
            spdxId: "GPL-3.0",
            displayName: "GNU General Public License v3.0 only",
            category: "copyleft",
            osiApproved: true,
            fsfStatus: "free",
            originalTextUrl: "https://spdx.org/licenses/GPL-3.0.html#licenseText",
            japaneseTextUrl: "https://github.com/opensource-jp/licenses/tree/master/GPL-3.0",
          },
        ],
      },
    ];
    diff.summary.licenseChangeCount = 1;
    const md = renderMarkdownComment(diff);
    expect(md).toContain("### License Changes");
    expect(md).toContain("MIT");
    expect(md).toContain("GPL-3.0");
    expect(md).toContain("### License Alerts");
    expect(md).toContain("[EN](https://spdx.org/licenses/GPL-3.0.html#licenseText)");
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

  it("renders analysis notes when present", () => {
    const diff = makeEmptyDiff();
    diff.notes = [
      "Best-effort resolution was used for: fastapi.",
      "Skipped marker-gated Python dependencies: typing-extensions.",
    ];

    const md = renderMarkdownComment(diff);
    expect(md).toContain("### Analysis Notes");
    expect(md).toContain("Best-effort resolution was used for: fastapi.");
    expect(md).toContain("Skipped marker-gated Python dependencies: typing-extensions.");
  });

  it("renders declared and resolved versions for updated dependencies", () => {
    const diff = makeEmptyDiff();
    diff.updated = [
      {
        name: "react",
        version: "18.3.2",
        previousVersion: "18.3.1",
        declaredVersion: "^18.2.0",
        previousDeclaredVersion: "^18.2.0",
        resolvedVersion: "18.3.2",
        previousResolvedVersion: "18.3.1",
        license: "MIT",
        licenseCategory: "permissive",
        licenseDetails: [],
        depth: 1,
      },
      {
        name: "lodash",
        version: "4.17.21",
        previousVersion: "4.17.20",
        declaredVersion: "^4.17.21",
        previousDeclaredVersion: "^4.17.20",
        resolvedVersion: "4.17.21",
        previousResolvedVersion: "4.17.20",
        license: "MIT",
        licenseCategory: "permissive",
        licenseDetails: [],
        depth: 1,
      },
    ];
    diff.summary.updatedCount = 2;

    const md = renderMarkdownComment(diff);
    expect(md).toContain("### Updated Dependencies");
    expect(md).toContain("| Package | Declared | Resolved | License |");
    expect(md).toContain("| react | ^18.2.0 → ^18.2.0 | 18.3.1 → 18.3.2 | MIT |");
    expect(md).toContain("| lodash | ^4.17.20 → ^4.17.21 | 4.17.20 → 4.17.21 | MIT |");
  });

  it("hides info-only security signals from the markdown body", () => {
    const diff = makeEmptyDiff();
    diff.newSecuritySignals = [
      {
        packageId: "pkg@1.0.0",
        name: "pkg",
        version: "1.0.0",
        signals: [
          {
            category: "deprecated",
            severity: "info",
            packageId: "pkg@1.0.0",
            name: "pkg",
            version: "1.0.0",
            title: "No signals",
            description: "placeholder",
          },
        ],
      },
    ];
    diff.summary.newSecuritySignalCount = 1;

    const md = renderMarkdownComment(diff);
    expect(md).not.toContain("### New Security Signals");
    expect(md).not.toContain("No signals");
  });
});
