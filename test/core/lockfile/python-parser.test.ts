import { describe, expect, it } from "vitest";
import {
  parsePyprojectDependencies,
  parseRequirementsTxt,
} from "../../../src/core/lockfile/python-parser.js";

describe("python-parser", () => {
  describe("parseRequirementsTxt", () => {
    it("parses pinned versions", () => {
      const result = parseRequirementsTxt("requests==2.31.0\nflask==3.0.0\n");
      expect(result.get("requests")).toBe("2.31.0");
      expect(result.get("flask")).toBe("3.0.0");
    });

    it("parses range specifiers", () => {
      const result = parseRequirementsTxt("django>=4.0,<5.0\nnumpy>=1.21\n");
      expect(result.get("django")).toBe(">=4.0,<5.0");
      expect(result.get("numpy")).toBe(">=1.21");
    });

    it("skips comments and empty lines", () => {
      const content = `# This is a comment
requests==2.31.0

# Another comment
flask==3.0.0
`;
      const result = parseRequirementsTxt(content);
      expect(result.size).toBe(2);
    });

    it("skips -r, -e, and -- directives", () => {
      const content = `-r base.txt
-e .
--index-url https://pypi.org/simple
requests==2.31.0
`;
      const result = parseRequirementsTxt(content);
      expect(result.size).toBe(1);
      expect(result.get("requests")).toBe("2.31.0");
    });

    it("handles packages with no version spec", () => {
      const result = parseRequirementsTxt("requests\n");
      expect(result.get("requests")).toBe("");
    });
  });

  describe("parsePyprojectDependencies", () => {
    it("parses [project].dependencies", () => {
      const content = `
[project]
name = "my-app"
version = "1.0.0"
dependencies = [
  "requests>=2.20",
  "flask==3.0.0",
]
`;
      const result = parsePyprojectDependencies(content);
      expect(result.name).toBe("my-app");
      expect(result.version).toBe("1.0.0");
      expect(result.dependencies.get("requests")).toBe(">=2.20");
      expect(result.dependencies.get("flask")).toBe("3.0.0");
    });

    it("returns empty map when no dependencies section", () => {
      const content = `
[project]
name = "empty"
version = "0.1.0"
`;
      const result = parsePyprojectDependencies(content);
      expect(result.dependencies.size).toBe(0);
    });
  });
});
