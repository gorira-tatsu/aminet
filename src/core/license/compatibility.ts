import type { DependencyGraph } from "../graph/types.js";
import type {
  CompatibilityCheck,
  CompatibilityResult,
  IncompatiblePair,
} from "./compatibility-types.js";
import { getLicenseAlternatives } from "./spdx.js";

interface CompatibilityRule {
  a: string;
  b: string;
  result: CompatibilityResult;
  combinedLicense?: string;
  explanation: string;
}

const COMPATIBILITY_RULES: CompatibilityRule[] = [
  // MIT combinations
  {
    a: "MIT",
    b: "GPL-3.0",
    result: "one-way",
    combinedLicense: "GPL-3.0",
    explanation: "MIT code can be included in GPL-3.0 projects, but not vice versa",
  },
  {
    a: "MIT",
    b: "GPL-3.0-only",
    result: "one-way",
    combinedLicense: "GPL-3.0-only",
    explanation: "MIT code can be included in GPL-3.0 projects, but not vice versa",
  },
  {
    a: "MIT",
    b: "GPL-2.0",
    result: "one-way",
    combinedLicense: "GPL-2.0",
    explanation: "MIT code can be included in GPL-2.0 projects, but not vice versa",
  },
  {
    a: "MIT",
    b: "GPL-2.0-only",
    result: "one-way",
    combinedLicense: "GPL-2.0-only",
    explanation: "MIT code can be included in GPL-2.0 projects, but not vice versa",
  },
  {
    a: "MIT",
    b: "LGPL-2.1",
    result: "compatible",
    explanation: "MIT and LGPL-2.1 are compatible when LGPL is used as a library",
  },
  {
    a: "MIT",
    b: "MPL-2.0",
    result: "compatible",
    explanation: "MIT and MPL-2.0 are compatible; MPL applies only to MPL-licensed files",
  },
  {
    a: "MIT",
    b: "Apache-2.0",
    result: "compatible",
    explanation: "MIT and Apache-2.0 are fully compatible",
  },

  // Apache-2.0 combinations
  {
    a: "Apache-2.0",
    b: "GPL-2.0",
    result: "incompatible",
    explanation: "Apache-2.0 patent clause conflicts with GPL-2.0 terms",
  },
  {
    a: "Apache-2.0",
    b: "GPL-2.0-only",
    result: "incompatible",
    explanation: "Apache-2.0 patent clause conflicts with GPL-2.0 terms",
  },
  {
    a: "Apache-2.0",
    b: "GPL-3.0",
    result: "one-way",
    combinedLicense: "GPL-3.0",
    explanation:
      "Apache-2.0 code can be included in GPL-3.0 projects (FSF confirmed compatibility)",
  },
  {
    a: "Apache-2.0",
    b: "GPL-3.0-only",
    result: "one-way",
    combinedLicense: "GPL-3.0-only",
    explanation:
      "Apache-2.0 code can be included in GPL-3.0 projects (FSF confirmed compatibility)",
  },
  {
    a: "Apache-2.0",
    b: "LGPL-2.1",
    result: "incompatible",
    explanation: "Apache-2.0 patent clause conflicts with LGPL-2.1 terms",
  },
  {
    a: "Apache-2.0",
    b: "MPL-2.0",
    result: "compatible",
    explanation: "Apache-2.0 and MPL-2.0 are compatible",
  },

  // GPL cross-version
  {
    a: "GPL-2.0",
    b: "GPL-3.0",
    result: "incompatible",
    explanation: "GPL-2.0-only and GPL-3.0 are incompatible without 'or later' clause",
  },
  {
    a: "GPL-2.0-only",
    b: "GPL-3.0",
    result: "incompatible",
    explanation: "GPL-2.0-only and GPL-3.0 are incompatible",
  },
  {
    a: "GPL-2.0-only",
    b: "GPL-3.0-only",
    result: "incompatible",
    explanation: "GPL-2.0-only and GPL-3.0-only are incompatible",
  },
  {
    a: "GPL-2.0-or-later",
    b: "GPL-3.0",
    result: "compatible",
    combinedLicense: "GPL-3.0",
    explanation: "GPL-2.0-or-later allows upgrading to GPL-3.0",
  },

  // LGPL
  {
    a: "LGPL-2.1",
    b: "GPL-3.0",
    result: "one-way",
    combinedLicense: "GPL-3.0",
    explanation: "LGPL-2.1 can be upgraded to GPL-3.0 per Section 3",
  },

  // MPL
  {
    a: "MPL-2.0",
    b: "GPL-3.0",
    result: "compatible",
    explanation: "MPL-2.0 Section 3.3 allows combination with GPL-3.0",
  },
  {
    a: "MPL-2.0",
    b: "GPL-2.0",
    result: "compatible",
    explanation: "MPL-2.0 Section 3.3 allows combination with GPL-2.0+",
  },
  {
    a: "MPL-2.0",
    b: "LGPL-2.1",
    result: "compatible",
    explanation: "MPL-2.0 and LGPL-2.1 are compatible",
  },

  // BSD
  {
    a: "BSD-2-Clause",
    b: "GPL-3.0",
    result: "one-way",
    combinedLicense: "GPL-3.0",
    explanation: "BSD code can be included in GPL-3.0 projects, but not vice versa",
  },
  {
    a: "BSD-3-Clause",
    b: "GPL-3.0",
    result: "one-way",
    combinedLicense: "GPL-3.0",
    explanation: "BSD code can be included in GPL-3.0 projects, but not vice versa",
  },
  {
    a: "ISC",
    b: "GPL-3.0",
    result: "one-way",
    combinedLicense: "GPL-3.0",
    explanation: "ISC code can be included in GPL-3.0 projects, but not vice versa",
  },
];

export function checkCompatibility(a: string, b: string): CompatibilityCheck {
  if (a === b) {
    return {
      licenseA: a,
      licenseB: b,
      result: "compatible",
      explanation: "Same license",
    };
  }

  // Search rules in both directions
  const rule = COMPATIBILITY_RULES.find(
    (r) => (r.a === a && r.b === b) || (r.a === b && r.b === a),
  );

  if (rule) {
    return {
      licenseA: a,
      licenseB: b,
      result: rule.result,
      combinedLicense: rule.combinedLicense,
      explanation: rule.explanation,
    };
  }

  return {
    licenseA: a,
    licenseB: b,
    result: "unknown",
    explanation: `No known compatibility rule for ${a} and ${b}`,
  };
}

export function checkTreeCompatibility(graph: DependencyGraph): IncompatiblePair[] {
  const incompatible: IncompatiblePair[] = [];
  const seen = new Set<string>();
  const licensedNodes = [...graph.nodes.values()].filter((node) => node.depth > 0 && node.license);

  for (let i = 0; i < licensedNodes.length; i++) {
    for (let j = i + 1; j < licensedNodes.length; j++) {
      const nodeA = licensedNodes[i];
      const nodeB = licensedNodes[j];
      const pairKey = [nodeA.id, nodeB.id].sort().join(":");
      if (seen.has(pairKey)) continue;
      seen.add(pairKey);

      const conflict = findExpressionConflict(nodeA.license!, nodeB.license!);
      if (!conflict) continue;

      incompatible.push({
        licenseA: conflict.licenseA,
        licenseB: conflict.licenseB,
        packageA: nodeA.id,
        packageB: nodeB.id,
        explanation: conflict.explanation,
      });
    }
  }

  return incompatible;
}

function findExpressionConflict(
  licenseA: string,
  licenseB: string,
): { licenseA: string; licenseB: string; explanation: string } | null {
  const alternativesA = getLicenseAlternatives(licenseA);
  const alternativesB = getLicenseAlternatives(licenseB);
  let firstConflict: { licenseA: string; licenseB: string; explanation: string } | null = null;

  for (const alternativeA of alternativesA) {
    for (const alternativeB of alternativesB) {
      const conflict = findAlternativeConflict(alternativeA, alternativeB);
      if (!conflict) {
        return null;
      }
      firstConflict ??= conflict;
    }
  }

  return firstConflict;
}

function findAlternativeConflict(
  alternativeA: string[],
  alternativeB: string[],
): { licenseA: string; licenseB: string; explanation: string } | null {
  for (const licenseA of alternativeA) {
    for (const licenseB of alternativeB) {
      const check = checkCompatibility(licenseA, licenseB);
      if (check.result === "incompatible") {
        return {
          licenseA,
          licenseB,
          explanation: check.explanation,
        };
      }
    }
  }
  return null;
}
