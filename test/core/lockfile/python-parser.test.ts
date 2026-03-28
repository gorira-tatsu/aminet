import { describe, expect, it } from "vitest";
import {
  parsePyprojectDependencies,
  parsePyprojectManifest,
  parseRequirementsManifest,
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

    it("skips marker-gated dependencies", () => {
      const result = parseRequirementsTxt(
        'typing-extensions>=4.0 ; python_version < "3.11"\nrequests==2.31.0\n',
      );
      expect(result.has("typing-extensions")).toBe(false);
      expect(result.get("requests")).toBe("2.31.0");
    });

    it("strips inline comments from requirements entries", () => {
      const result = parseRequirementsTxt("requests==2.31.0 # pinned\nflask>=3.0 # range\n");
      expect(result.get("requests")).toBe("2.31.0");
      expect(result.get("flask")).toBe(">=3.0");
    });

    it("tracks skipped directives and best-effort requirements", () => {
      const result = parseRequirementsManifest(`-r base.txt\nrequests\nurllib3>=2.0\n`);
      expect(result.skipped).toEqual([{ spec: "-r base.txt", reason: "directive" }]);
      expect(result.bestEffortDependencies).toEqual(["requests", "urllib3"]);
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

    it("skips marker-gated pyproject dependencies", () => {
      const content = `
[project]
name = "marker-test"
version = "1.0.0"
dependencies = [
  "requests>=2.20",
  "typing-extensions>=4.0; python_version < '3.11'",
]
`;
      const result = parsePyprojectDependencies(content);
      expect(result.dependencies.has("requests")).toBe(true);
      expect(result.dependencies.has("typing-extensions")).toBe(false);
    });

    it("parses dev optional dependencies", () => {
      const content = `
[project]
name = "optional-dev"
version = "1.0.0"

[project.optional-dependencies]
dev = [
  "pytest>=8.0",
  "ruff==0.5.0",
]
`;
      const result = parsePyprojectDependencies(content);
      expect(result.devDependencies.get("pytest")).toBe(">=8.0");
      expect(result.devDependencies.get("ruff")).toBe("0.5.0");
    });

    it("handles multi-line arrays with trailing commas", () => {
      const content = `
[project]
name = "multiline"
version = "1.0.0"
dependencies = [
  "requests>=2.20",
  "flask==3.0.0",
]
`;
      const result = parsePyprojectDependencies(content);
      expect(result.dependencies.get("requests")).toBe(">=2.20");
      expect(result.dependencies.get("flask")).toBe("3.0.0");
    });

    it("returns empty maps for malformed TOML instead of throwing", () => {
      const result = parsePyprojectDependencies(`
[project
name = "broken"
dependencies = [
  "requests>=2.20",
`);
      expect(result.name).toBeUndefined();
      expect(result.version).toBeUndefined();
      expect(result.dependencies.size).toBe(0);
      expect(result.devDependencies.size).toBe(0);
    });

    it("parses dependency-groups as dev dependencies", () => {
      const result = parsePyprojectManifest(`
[project]
name = "dep-groups"
version = "1.0.0"
dependencies = ["requests>=2.31"]

[dependency-groups]
dev = ["pytest>=8.0"]
docs = ["mkdocs==1.6.0"]
`);

      expect(result.dependencies.get("requests")).toBe(">=2.31");
      expect(result.devDependencies.get("pytest")).toBe(">=8.0");
      expect(result.devDependencies.get("mkdocs")).toBe("1.6.0");
    });

    it("parses Poetry dependencies and groups", () => {
      const result = parsePyprojectManifest(`
[tool.poetry]
name = "poetry-app"
version = "2.0.0"

[tool.poetry.dependencies]
python = "^3.12"
fastapi = "^0.116.0"
uvicorn = { version = "==0.35.0" }
typing-extensions = { version = "^4.15.0", markers = "python_version < '3.11'" }

[tool.poetry.group.dev.dependencies]
pytest = "^8.4.0"
ruff = { version = "==0.12.0" }
`);

      expect(result.name).toBe("poetry-app");
      expect(result.version).toBe("2.0.0");
      expect(result.dependencies.get("fastapi")).toBe("^0.116.0");
      expect(result.dependencies.get("uvicorn")).toBe("0.35.0");
      expect(result.dependencies.has("python")).toBe(false);
      expect(result.devDependencies.get("pytest")).toBe("^8.4.0");
      expect(result.devDependencies.get("ruff")).toBe("0.12.0");
      expect(result.skipped).toEqual([
        {
          name: "typing-extensions",
          spec: 'typing-extensions = { version = "^4.15.0", markers = "python_version < \'3.11\'" }',
          reason: "marker",
        },
      ]);
    });

    it("parses legacy Poetry dev-dependencies", () => {
      const result = parsePyprojectManifest(`
[tool.poetry]
name = "legacy-poetry"
version = "1.0.0"

[tool.poetry.dependencies]
fastapi = "^0.116.0"

[tool.poetry.dev-dependencies]
pytest = "^8.4.0"
black = "25.1.0"
`);

      expect(result.dependencies.get("fastapi")).toBe("^0.116.0");
      expect(result.devDependencies.get("pytest")).toBe("^8.4.0");
      expect(result.devDependencies.get("black")).toBe("25.1.0");
    });

    it("does not mark four-part pinned versions as best-effort", () => {
      const result = parseRequirementsManifest("demo==1.2.3.4\n");
      expect(result.bestEffortDependencies).toEqual([]);
    });
  });
});
