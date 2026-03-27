---
name: test-create
description: Create tests for source files, modules, or features using Vitest. Use this skill when the user says "/test-create", asks to "write tests", "add tests", "create a test file", "test this module", or wants to generate unit or integration tests. Also triggers for "cover this file with tests", "add test coverage", or "write tests for the recent changes".
argument-hint: "<source-file-or-module> [--type unit|integration] [--update]"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash(pnpm test:*), Bash(pnpm lint:*), Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git branch:*)]
---

# Test Creator

Generate well-structured Vitest tests for source files, modules, or features. Tests follow project conventions and established testing best practices.

## Language rule

**ALL output must be in English.** This includes:
- Test descriptions and names
- Comments inside test files
- The summary report back to the user

This rule is non-negotiable regardless of the user's language.

## Arguments

The user invoked this with: $ARGUMENTS

## Parsing the arguments

Determine the target from the arguments:
- **File path provided** (e.g., `src/core/trust/scorer.ts`) — create or update tests for that file
- **Module or feature name** (e.g., `lockfile parser`, `trust scorer`) — search `src/` for matching files
- **`--update` flag** — update an existing test file rather than creating from scratch
- **`--type integration`** — create an integration test in `test/integration/`
- **Empty** — auto-detect from recent changes:
  ```bash
  git diff --name-only HEAD~3 -- 'src/**/*.ts'
  ```
  Offer the user a choice of which changed files to test.

## Project test conventions

These conventions are non-negotiable. Every generated test must follow them:

1. **File naming**: `*.test.ts` (never `.spec.ts`)
2. **File location**: mirrors source structure. `src/foo/bar.ts` → `test/foo/bar.test.ts`
3. **Integration tests**: go in `test/integration/`
4. **Import style**: relative paths with `.js` extension:
   ```typescript
   import { fn } from "../../../src/core/module.js";
   ```
5. **Import vitest**: destructure from `"vitest"`:
   ```typescript
   import { describe, expect, test, vi } from "vitest";
   ```
   Use `test` or `it` — either is acceptable; match existing tests in the same area.
6. **Module-level `vi.mock()`**: must appear before the import of the mocked module:
   ```typescript
   vi.mock("../../src/core/graph/resolver.js", () => ({
     resolveDependencyGraph: vi.fn().mockResolvedValue(...)
   }));

   import { resolveDependencyGraph } from "../../src/core/graph/resolver.js";
   ```
7. **Fixture path resolution**: use `import.meta.dirname`:
   ```typescript
   const FIXTURES = join(import.meta.dirname, "../fixtures/npm");
   ```
8. **Database tests**: use in-memory SQLite with setup/teardown:
   ```typescript
   let db: DatabaseLike;
   beforeEach(() => {
     db = createDatabase(":memory:");
     runMigrations(db);
     setDatabase(db);
   });
   afterEach(() => {
     closeDatabase();
   });
   ```
9. **HTTP mock tests**: save and restore `globalThis.fetch`:
   ```typescript
   const originalFetch = globalThis.fetch;
   afterEach(() => {
     globalThis.fetch = originalFetch;
   });
   ```
10. **Run commands**: `pnpm test` for unit tests, `pnpm test:integration` for integration tests
11. **Lint**: `pnpm lint` (Biome)

## Best practices (mandatory)

Apply all of these when generating tests. Based on [goldbergyoni/javascript-testing-best-practices](https://github.com/goldbergyoni/javascript-testing-best-practices) and [Vitest community patterns](https://www.projectrules.ai/rules/vitest).

1. **3-part test naming**: `"<what is tested> — <scenario> — <expected result>"`. When a single `describe` block establishes the "what", the `test` name can cover just scenario and result.

2. **AAA pattern**: Arrange, Act, Assert — each clearly separated with blank lines between sections when the test is longer than 3 lines.

3. **Black-box testing**: test the public API (exported functions and their return values), not internal implementation details. If something is not exported, don't test it directly.

4. **Prefer stubs/spies over mocks**: use `vi.fn()` for simple stubs and `vi.spyOn()` to observe calls. Reserve full `vi.mock()` for external dependencies that perform I/O (network, file system, database).

5. **Realistic input data**: use domain-appropriate values. For this project:
   - Package names: `express`, `lodash`, `@types/node`, `flask`, `requests`
   - Versions: `4.21.2`, `^2.0.0`, `>=1.26,<3`
   - Licenses: `MIT`, `Apache-2.0`, `GPL-3.0`, `BSD-3-Clause`
   - Vulnerability IDs: `GHSA-xxxx-yyyy`, `CVE-2025-0001`
   - Never use `foo`, `bar`, `test123`, or placeholder values.

6. **Test categorization**: use `describe` blocks for the unit under test, nested `describe` for scenarios when there are multiple groups.

7. **Focused test data**: only include data fields relevant to what the test verifies. Use helper functions with sensible defaults:
   ```typescript
   function makeNode(overrides: Partial<PackageNode> = {}): PackageNode {
     return {
       id: "express@4.21.2",
       name: "express",
       version: "4.21.2",
       license: "MIT",
       licenseCategory: "permissive",
       depth: 0,
       parents: new Set(),
       dependencies: new Map(),
       ...overrides,
     };
   }
   ```

8. **Keep tests flat**: no loops, conditionals, or complex logic inside test bodies. If you need to test multiple inputs, write separate `test()` calls or use `test.each()`.

9. **One behavior per test**: each test verifies one logical behavior. Multiple `expect()` calls are fine when they assert different aspects of the same behavior.

10. **Clean up**: use `afterEach` for mocks (`vi.restoreAllMocks()`), database connections (`closeDatabase()`), and global state (`globalThis.fetch = originalFetch`).

## Workflow

### Step 1: Identify the target source file(s)

Resolve the argument to one or more source files. If ambiguous, list candidates and ask.

Read the source file to understand its exports, dependencies, and complexity.

### Step 2: Analyze the source file

For each target file, determine:
- **Exported functions/classes** — these are the public API to test
- **Dependencies** — what does it import? Which are internal vs external (network, DB, file system)?
- **Complexity** — pure functions vs stateful, sync vs async, error paths
- **Edge cases** — null/undefined inputs, empty arrays, boundary values

Read the file fully. Identify every exported function and its signature.

### Step 3: Classify the test type

Based on the source analysis, choose the primary test pattern:

| Pattern | When to use | Setup needed |
|---------|-------------|-------------|
| **Pure logic** | Function takes data, returns data, no side effects | None |
| **Parser** | String/file input → structured output | Inline test data or fixtures |
| **Database** | Uses SQLite stores | `beforeEach`/`afterEach` with `:memory:` DB |
| **HTTP / external API** | Calls `fetch` or external services | Mock `globalThis.fetch` or `vi.mock()` the client module |
| **Integration** | Tests multiple modules working together | Fixtures + mocked network layer |
| **Renderer / output** | Constructs data → verifies string output | Helper function to build input data |
| **Config / file system** | Reads/writes files or config | Temp directory or inline mocks |

A single test file may combine patterns (e.g., some pure logic tests + some mock tests).

### Step 4: Check for existing tests

Before creating a new file, check if tests already exist:

```bash
# Find existing test for the source file
```

If a test file exists and `--update` was not passed, inform the user and ask whether to:
- Add new tests to the existing file
- Replace the existing file
- Abort

If `--update` was passed, read the existing tests and add missing coverage.

### Step 5: Generate the test file

Create the test file at the correct location. Structure:

1. **Imports** — vitest functions, then source module, then types
2. **Mocks** (if needed) — `vi.mock()` calls before imports of mocked modules
3. **Helper functions** — `makeInput()` or test data builders at the top
4. **`describe` block** — named after the function/module under test
5. **Tests** — ordered: happy path → edge cases → error cases

### Step 6: Run tests

```bash
pnpm test -- --run test/path/to/new.test.ts
```

If tests fail:
1. Read the error output carefully
2. Fix the test (not the source code — tests should pass against the current source)
3. Re-run until green

### Step 7: Run lint

```bash
pnpm lint
```

Fix formatting issues if any.

### Step 8: Report results

```md
## Test Creation Summary

### Created
- `test/core/trust/scorer.test.ts` — 8 tests for `computeTrustScore`

### Coverage
- Happy path: <scenarios>
- Edge cases: <scenarios>
- Error cases: <scenarios>

### Verification
- Tests: N passed, 0 failed
- Lint: clean
```

## Important guidelines

- Never modify source files — only create or edit test files
- If a source function has a bug, write a test that documents the current behavior and note it for the user
- When mocking, mock at the boundary (module level), not deep internals
- Prefer testing observable behavior (return values, thrown errors, side effects) over implementation details
- If the source file has no exports, suggest refactoring before testing
- For integration tests, prefer real OSS fixture files over synthetic data. Store them in `test/fixtures/<ecosystem>/`
