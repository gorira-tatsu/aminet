import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

describe("composite action regression coverage", () => {
  it("documents Python manifests and forwards Python review arguments", () => {
    const action = YAML.parse(
      readFileSync(join(import.meta.dirname, "../../action.yml"), "utf-8"),
    ) as {
      inputs: Record<string, { description?: string }>;
      runs: {
        steps: Array<{ name?: string; run?: string }>;
      };
    };

    expect(action.inputs.path.description).toContain("requirements.txt");
    expect(action.inputs.path.description).toContain("pyproject.toml");
    expect(action.inputs["lockfile-path"].description).toContain("lockfile");
    expect(action.inputs["lockfile-path"].description).toContain("pyproject.toml");
    expect(action.inputs["lockfile-path"].description).toContain("uv.lock");

    const reviewStep = action.runs.steps.find((step) => step.name === "Run aminet review");
    const forwardedPath = '"$' + '{{ inputs.path }}"';
    const forwardedLockfile = 'ARGS+=("--lockfile-path" "$' + '{{ inputs.lockfile-path }}")';

    expect(reviewStep?.run).toContain(forwardedPath);
    expect(reviewStep?.run).toContain(forwardedLockfile);
    expect(reviewStep?.run).toContain('ARGS+=("--no-dev")');
  });
});
