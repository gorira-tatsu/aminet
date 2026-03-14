import type { LicenseCategory } from "../graph/types.js";

export interface LicenseComponent {
  spdxId: string;
  category: LicenseCategory;
}

export type SpdxExpression =
  | { type: "license"; id: string }
  | { type: "and"; left: SpdxExpression; right: SpdxExpression }
  | { type: "or"; left: SpdxExpression; right: SpdxExpression };

type Token =
  | { type: "lparen" }
  | { type: "rparen" }
  | { type: "and" }
  | { type: "or" }
  | { type: "license"; value: string };

const PERMISSIVE_LICENSES = new Set([
  "MIT",
  "ISC",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "Apache-2.0",
  "Unlicense",
  "CC0-1.0",
  "0BSD",
  "BlueOak-1.0.0",
  "Artistic-2.0",
  "Zlib",
  "PSF-2.0",
  "Python-2.0",
  "X11",
  "CC-BY-3.0",
  "CC-BY-4.0",
  "BSL-1.0",
  "W3C",
]);

const COPYLEFT_LICENSES = new Set([
  "GPL-2.0",
  "GPL-2.0-only",
  "GPL-2.0-or-later",
  "GPL-3.0",
  "GPL-3.0-only",
  "GPL-3.0-or-later",
  "AGPL-3.0",
  "AGPL-3.0-only",
  "AGPL-3.0-or-later",
  "EUPL-1.1",
  "EUPL-1.2",
  "SSPL-1.0",
  "OSL-3.0",
]);

const WEAK_COPYLEFT_LICENSES = new Set([
  "LGPL-2.0",
  "LGPL-2.0-only",
  "LGPL-2.0-or-later",
  "LGPL-2.1",
  "LGPL-2.1-only",
  "LGPL-2.1-or-later",
  "LGPL-3.0",
  "LGPL-3.0-only",
  "LGPL-3.0-or-later",
  "MPL-2.0",
  "EPL-1.0",
  "EPL-2.0",
  "CDDL-1.0",
  "CDDL-1.1",
  "CPL-1.0",
]);

export function parseSpdxExpression(expr: string): SpdxExpression | null {
  const tokens = tokenize(expr);
  if (tokens.length === 0) return null;

  let index = 0;

  const parseOr = (): SpdxExpression | null => {
    let left = parseAnd();
    if (!left) return null;

    while (tokens[index]?.type === "or") {
      index++;
      const right = parseAnd();
      if (!right) return null;
      left = { type: "or", left, right };
    }

    return left;
  };

  const parseAnd = (): SpdxExpression | null => {
    let left = parsePrimary();
    if (!left) return null;

    while (tokens[index]?.type === "and") {
      index++;
      const right = parsePrimary();
      if (!right) return null;
      left = { type: "and", left, right };
    }

    return left;
  };

  const parsePrimary = (): SpdxExpression | null => {
    const token = tokens[index];
    if (!token) return null;

    if (token.type === "license") {
      index++;
      return { type: "license", id: token.value };
    }

    if (token.type === "lparen") {
      index++;
      const expression = parseOr();
      if (!expression || tokens[index]?.type !== "rparen") {
        return null;
      }
      index++;
      return expression;
    }

    return null;
  };

  const parsed = parseOr();
  if (!parsed || index !== tokens.length) {
    return null;
  }
  return parsed;
}

export function parseLicenseComponents(expr: string): LicenseComponent[] {
  const parsed = parseSpdxExpression(expr);
  if (!parsed) {
    const normalized = expr.trim();
    return normalized ? [{ spdxId: normalized, category: classifySimpleLicense(normalized) }] : [];
  }

  const seen = new Set<string>();
  const components: LicenseComponent[] = [];
  visitLeaves(parsed, (licenseId) => {
    if (seen.has(licenseId)) return;
    seen.add(licenseId);
    components.push({ spdxId: licenseId, category: classifySimpleLicense(licenseId) });
  });
  return components;
}

export function getLicenseAlternatives(expr: string): string[][] {
  const parsed = parseSpdxExpression(expr);
  if (!parsed) {
    const normalized = expr.trim();
    return normalized ? [[normalized]] : [];
  }
  return expandAlternatives(parsed);
}

export function renderSpdxExpression(
  expr: string,
  renderLicense: (licenseId: string) => string,
): string {
  const parsed = parseSpdxExpression(expr);
  if (!parsed) {
    return renderLicense(expr.trim());
  }
  return renderNode(parsed, renderLicense);
}

export function classifyLicense(spdxId: string): LicenseCategory {
  const normalized = spdxId.trim();
  if (!normalized) return "unknown";

  const parsed = parseSpdxExpression(normalized);
  if (!parsed) {
    return classifySimpleLicense(normalized);
  }

  return classifyExpression(parsed);
}

function classifySimpleLicense(spdxId: string): LicenseCategory {
  const normalized = spdxId.trim();

  if (PERMISSIVE_LICENSES.has(normalized)) return "permissive";
  if (COPYLEFT_LICENSES.has(normalized)) return "copyleft";
  if (WEAK_COPYLEFT_LICENSES.has(normalized)) return "weak-copyleft";

  return "unknown";
}

function classifyExpression(expression: SpdxExpression): LicenseCategory {
  switch (expression.type) {
    case "license":
      return classifySimpleLicense(expression.id);
    case "or":
      return chooseMostPermissive([
        classifyExpression(expression.left),
        classifyExpression(expression.right),
      ]);
    case "and":
      return chooseMostRestrictive([
        classifyExpression(expression.left),
        classifyExpression(expression.right),
      ]);
  }
}

function chooseMostPermissive(categories: LicenseCategory[]): LicenseCategory {
  if (categories.includes("permissive")) return "permissive";
  if (categories.includes("weak-copyleft")) return "weak-copyleft";
  if (categories.includes("copyleft")) return "copyleft";
  return "unknown";
}

function chooseMostRestrictive(categories: LicenseCategory[]): LicenseCategory {
  if (categories.includes("copyleft")) return "copyleft";
  if (categories.includes("weak-copyleft")) return "weak-copyleft";
  if (categories.includes("permissive")) return "permissive";
  return "unknown";
}

function expandAlternatives(expression: SpdxExpression): string[][] {
  switch (expression.type) {
    case "license":
      return [[expression.id]];
    case "or":
      return [...expandAlternatives(expression.left), ...expandAlternatives(expression.right)];
    case "and": {
      const left = expandAlternatives(expression.left);
      const right = expandAlternatives(expression.right);
      const combinations: string[][] = [];
      for (const lhs of left) {
        for (const rhs of right) {
          combinations.push([...lhs, ...rhs]);
        }
      }
      return combinations;
    }
  }
}

function renderNode(
  expression: SpdxExpression,
  renderLicense: (licenseId: string) => string,
  parentType?: SpdxExpression["type"],
): string {
  if (expression.type === "license") {
    return renderLicense(expression.id);
  }

  const currentType = expression.type;
  const operator = currentType === "and" ? " AND " : " OR ";
  const rendered = `${renderNode(expression.left, renderLicense, currentType)}${operator}${renderNode(expression.right, renderLicense, currentType)}`;
  if (!parentType || parentType === currentType) {
    return rendered;
  }
  return `(${rendered})`;
}

function visitLeaves(expression: SpdxExpression, visitor: (licenseId: string) => void): void {
  switch (expression.type) {
    case "license":
      visitor(expression.id);
      return;
    case "and":
    case "or":
      visitLeaves(expression.left, visitor);
      visitLeaves(expression.right, visitor);
  }
}

function tokenize(expr: string): Token[] {
  const normalized = expr.trim();
  if (!normalized) return [];

  const raw = normalized.match(/\(|\)|[^\s()]+/g) ?? [];
  const tokens: Token[] = [];

  for (let i = 0; i < raw.length; i++) {
    const part = raw[i];
    if (part === "(") {
      tokens.push({ type: "lparen" });
      continue;
    }
    if (part === ")") {
      tokens.push({ type: "rparen" });
      continue;
    }
    if (part === "AND") {
      tokens.push({ type: "and" });
      continue;
    }
    if (part === "OR") {
      tokens.push({ type: "or" });
      continue;
    }

    const licenseParts = [part];
    while (i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next === "(" || next === ")" || next === "AND" || next === "OR") {
        break;
      }
      i++;
      licenseParts.push(raw[i]);
    }
    tokens.push({ type: "license", value: licenseParts.join(" ") });
  }

  return tokens;
}
