# aminet

[![npm version](https://img.shields.io/npm/v/aminet)](https://www.npmjs.com/package/aminet)
[![npm downloads](https://img.shields.io/npm/dm/aminet)](https://www.npmjs.com/package/aminet)
[![Dependency Review](https://github.com/gorira-tatsu/aminet/actions/workflows/ami-review.yml/badge.svg)](https://github.com/gorira-tatsu/aminet/actions/workflows/ami-review.yml)
[![Publish](https://github.com/gorira-tatsu/aminet/actions/workflows/publish.yml/badge.svg)](https://github.com/gorira-tatsu/aminet/actions/workflows/publish.yml)

`aminet` is a Node-executable CLI and GitHub Action for reviewing npm and Python dependency risk.

It analyzes dependency graphs, vulnerabilities, licenses, security signals, trust, freshness, provenance, and version pinning, then renders the result as terminal output, machine-readable JSON, SBOMs, or PR review comments.

Roadmap and 1.0 criteria live in [`ROADMAP.md`](./ROADMAP.md).

## Status

- Early project, pre-`1.0`
- License: MIT
- CLI and review output may still evolve
- The intended `1.x` guarantees are tracked in [`ROADMAP.md`](./ROADMAP.md)

## 1.0 Target

Before `1.0`, aminet is still allowed to refine CLI behavior and review presentation. The `1.0` target is to make the following contract explicit and stable:

- minimum workflows: npm `analyze`/`review`, Python `analyze` for manifests and supported lockfiles, and Python `review` for `requirements.txt`/`pyproject.toml`
- compatibility surface: documented CLI flags, GitHub Action inputs, JSON fields, and the primary PR comment sections
- operational expectations: explicit messaging for best-effort resolution, skipped inputs, private registries, and degraded cache mode
- release gate: documentation, regression tests, and release notes stay aligned with shipped behavior

The longer checklist and post-`1.0` candidates live in [`ROADMAP.md`](./ROADMAP.md).

## GitHub Action

The main distribution target is GitHub Actions. `aminet` is designed to review dependency changes in pull requests and post or update a focused review comment for npm and supported Python manifest workflows.

This repository ships a composite action in [`action.yml`](./action.yml).

Use the released action from another repository:

```yaml
name: Dependency review

on:
  pull_request:
    paths:
      - "package.json"
      - "pnpm-lock.yaml"
      - "package-lock.json"

jobs:
  aminet:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: gorira-tatsu/aminet@v0.1.3
        with:
          path: package.json
          security: "true"
```

This action is strongest when you want:

- PR comments focused on changed direct dependencies
- vulnerability, license, and supply chain checks during review
- one lightweight workflow step instead of custom shell glue

Common inputs:

- `path`: manifest path, usually `package.json`, `requirements.txt`, or `pyproject.toml`
- `depth`: maximum dependency depth to resolve
- `dev`: include devDependencies in review (default: `"true"`)
- `deny-license`: comma-separated SPDX IDs to block
- `fail-on-vuln`: fail the job at or above a severity threshold
- `security`: enable deeper security checks
- `version`: pin the published `aminet` CLI version explicitly
- `comment-id`: override the stable PR comment identifier used for updates (default: manifest path)
- `comment-prefix`: override the human-readable label shown in the PR comment title (default: manifest path)
- `lockfile-path`: explicit path to lockfile (for monorepos, or to pin `pyproject.toml` review with `poetry.lock`, `pdm.lock`, or `uv.lock`)
- `exclude-packages`: comma-separated packages to skip intentionally (supports wildcards like `@scope/*`)
- `npm-token`: npm auth token for private registries when private packages should be analyzed

Capability guide:

| Surface | Supported inputs |
|---------|------------------|
| `analyze` CLI | `package.json`, `pnpm-lock.yaml`, `package-lock.json`, `bun.lock`, `requirements.txt`, `pyproject.toml`, `poetry.lock`, `pdm.lock`, `uv.lock` |
| `review` CLI | `package.json`, `requirements.txt`, `pyproject.toml` |
| GitHub Action | wraps `review`; use `path` with `package.json`, `requirements.txt`, or `pyproject.toml` |

For Python projects, the Action does not accept standalone Python lockfiles through `path`. Use `lockfile-path` to pin a `pyproject.toml` review with `poetry.lock`, `pdm.lock`, or `uv.lock`.

For monorepo usage where `package.json` is in a sub-package:

```yaml
      - uses: gorira-tatsu/aminet@v0.1.3
        with:
          path: packages/frontend/package.json
          lockfile-path: pnpm-lock.yaml
```

For matrix-based monorepo review, each manifest can keep its own compact PR comment while remaining easy to identify:

```yaml
strategy:
  matrix:
    path:
      - package.json
      - apps/backend/package.json
      - apps/frontend/package.json

steps:
  - uses: gorira-tatsu/aminet@v0.3.0
    with:
      path: ${{ matrix.path }}
      comment-prefix: ${{ matrix.path }}
      security: "true"
```

By default, aminet uses the manifest path as both the comment update key and the displayed label. Use `comment-id` only when you need to override the update key, and `comment-prefix` when you want a shorter or friendlier title while still showing the actual manifest path inside the comment body.

The review command automatically walks up parent directories to find lockfiles and reads the correct workspace section from pnpm lockfiles. Use `lockfile-path` when auto-detection does not work for your layout.

For Python review from a manifest:

```yaml
      - uses: gorira-tatsu/aminet@v0.2.1
        with:
          path: pyproject.toml
          lockfile-path: uv.lock
          security: "true"
```

For Python review from `requirements.txt`:

```yaml
      - uses: gorira-tatsu/aminet@v0.2.1
        with:
          path: requirements.txt
          security: "true"
```

For repository-local usage during development:

```yaml
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: ./
        with:
          path: package.json
          security: "true"
```

If you want explicit version pinning instead of relying on the action tag:

```yaml
      - uses: gorira-tatsu/aminet@v0.1.3
        with:
          version: "0.1.3"
          path: package.json
          fail-on-vuln: high
          deny-license: GPL-3.0,AGPL-3.0
```

If your project has private packages, choose one of these modes:

- authenticate private packages with `npm-token` / `NPM_TOKEN` when you want them included in analysis
- skip internal packages with `exclude-packages` when they should be intentionally out of scope
- combine both when some private packages should be analyzed and others should be skipped

Action examples:

Authenticate private packages:

```yaml
      - uses: gorira-tatsu/aminet@v0.1.3
        with:
          path: package.json
          npm-token: ${{ secrets.NPM_TOKEN }}
```

Skip internal packages intentionally:

```yaml
      - uses: gorira-tatsu/aminet@v0.1.3
        with:
          path: package.json
          exclude-packages: "@my-org/internal-*"
```

Authenticate and skip selected packages:

```yaml
      - uses: gorira-tatsu/aminet@v0.1.3
        with:
          path: package.json
          npm-token: ${{ secrets.NPM_TOKEN }}
          exclude-packages: "@my-org/internal-*"
```

## CLI

The CLI is still the underlying engine for local analysis, CI experiments, and debugging outside pull request workflows.

## Install

Official distribution is through npmjs.org.

```bash
npx aminet --help
npm install -g aminet
pnpm add -g aminet
```

## Quick start

Analyze a published package:

```bash
npx aminet analyze express@4.21.2 --security --trust-score --freshness
```

Analyze a local project:

```bash
npx aminet analyze package.json --security --enhanced-license --json
```

Analyze Python dependencies:

```bash
npx aminet analyze requirements.txt
npx aminet analyze pyproject.toml
npx aminet analyze uv.lock
npx aminet analyze requests --ecosystem pypi
```

Review dependency changes in a branch (includes devDependencies by default):

```bash
npx aminet review package.json --base HEAD~1 --security
npx aminet review package.json --base HEAD~1 --no-dev  # exclude devDependencies
npx aminet review requirements.txt --base HEAD~1 --security
npx aminet review pyproject.toml --base HEAD~1 --lockfile-path uv.lock
```

Capability summary:

- `analyze` accepts standalone Python lockfiles (`poetry.lock`, `pdm.lock`, `uv.lock`) and reads the adjacent `pyproject.toml`.
- `review` accepts `requirements.txt` and `pyproject.toml`, not standalone Python lockfiles.
- the GitHub Action wraps `review`, so Python lockfiles are passed through `lockfile-path` rather than `path`.

Review with private packages:

```bash
NPM_TOKEN=xxx npx aminet review package.json --base HEAD~1
npx aminet review package.json --base HEAD~1 --exclude-packages "@scope/*"
NPM_TOKEN=xxx npx aminet review package.json --base HEAD~1 --exclude-packages "@scope/internal-*"
```

Generate a config file interactively:

```bash
npx aminet init                    # interactive prompts
npx aminet init --defaults         # non-interactive with sensible defaults
npx aminet init --defaults --merge # merge defaults into existing config
npx aminet init --defaults --force # overwrite existing config
```

`init` does not embed private registry secrets by default. Use `NPM_TOKEN` in the environment when private packages should be analyzed, or `excludePackages` when internal packages should be skipped instead.

Cache maintenance:

```bash
npx aminet cache stats
npx aminet cache prune
```

If native SQLite bindings are unavailable, `analyze` and `review` still run, but aminet disables DB-backed caching in that environment. `aminet cache ...` subcommands still require the on-disk database and will exit non-zero until persistent cache support is available.

## CLI commands

Top-level commands:

- `analyze`: dependency graph analysis for packages or local manifests
- `ci`: JSON-oriented CI alias for `analyze`
- `review`: PR review mode for direct dependency changes
- `init`: generate `aminet.config.json` interactively
- `cache`: local cache inspection and pruning

Use the built-in help for the complete option set:

```bash
npx aminet analyze --help
npx aminet review --help
```

## Configuration

Place an `aminet.config.json` in your project root to set defaults:

```json
{
  "excludePackages": ["@my-org/*", "@internal/legacy-lib"],
  "npmToken": "npm_...",
  "denyLicenses": ["GPL-3.0", "AGPL-3.0"],
  "allowLicenses": ["MIT", "ISC", "Apache-2.0"],
  "depth": 5,
  "concurrency": 5,
  "security": true,
  "deepLicenseCheck": false
}
```

All fields are optional. CLI flags and Action inputs override config file values. For `npmToken`, the resolution order is: CLI `--npm-token` > `NPM_TOKEN` environment variable > config file.

## What `aminet` does

- Analyze a package or project dependency graph
- Review pull request dependency changes and post GitHub comments
- Flag vulnerability, license, and supply chain concerns
- Generate SPDX and CycloneDX SBOM output
- Produce third-party notices output

## Feature overview

- Vulnerability scanning via OSV, GHSA, and npm audit
- License categorization, deny-list checks, compatibility checks, and deep tarball license verification
- Enhanced license intelligence via ClearlyDefined
- Trust scoring from packument data, downloads, and deps.dev metadata
- Freshness analysis for outdated or abandoned dependencies
- Provenance checks for npm attestations
- Phantom dependency detection
- Version pinning analysis
- PR review comments focused on changed direct dependencies

## Example outputs

Representative analyze modes:

```bash
npx aminet analyze express@4.21.2 --json
npx aminet analyze express@4.21.2 --cyclonedx
npx aminet analyze express@4.21.2 --spdx
npx aminet analyze express@4.21.2 --notices
```

Representative review mode:

```text
## aminet Dependency Review — `apps/frontend/package.json`
Target: `apps/frontend/package.json`

**Summary**: 1 updated dependency, 2 new vulnerabilities, 1 license change

**Risk Level**: :red_circle: Critical

### Key Alerts

- 2 critical/high vulnerability alerts introduced
- 1 dependency license alerts require review

<details>
<summary>Detailed review</summary>

| Metric | Count |
|--------|-------|
| Added | 0 |
| Removed | 0 |
| Updated | 1 |
| New Vulnerabilities | 2 |
| Resolved Vulnerabilities | 1 |
| New Security Signals | 1 |
| Resolved Security Signals | 0 |
| License Changes | 1 |

### New Vulnerabilities
| Package | Version | Severity | Advisory | Fixed | Source | Summary |
|---------|---------|----------|----------|-------|--------|---------|
| minimist | 1.2.8 | CRITICAL | GHSA-... | 1.2.6 | osv | Prototype Pollution |
</details>
```

## Output modes

`analyze` can render:

- human-readable table output
- JSON
- dependency tree output
- Mermaid and Graphviz graphs
- CycloneDX 1.5 SBOM
- SPDX 2.3 SBOM
- third-party notices output

## Python support (experimental)

aminet can analyze Python dependencies from `requirements.txt` and `pyproject.toml` files. The ecosystem is auto-detected from the file name, or you can pass `--ecosystem pypi` explicitly.

**Supported input formats:**
- `requirements.txt` with pinned (`==`) or range specifiers
- `pyproject.toml` with these supported scopes:
  - PEP 621 `[project].dependencies`
  - `[project.optional-dependencies]` for dev-like groups: `dev`, `test`, `tests`, `docs`, `doc`, `lint`, `typing`, `typecheck`
  - `[dependency-groups]` for the same dev-like groups, including `include-group`
  - Poetry `[tool.poetry.dependencies]`, `[tool.poetry.dev-dependencies]`, and `[tool.poetry.group.<name>.dependencies]`
- `poetry.lock`, `pdm.lock`, and `uv.lock` for `analyze`

**Limitations:**
- **Pinned versions (`==`) are scanned accurately.** Range specifiers resolve to the latest compatible version from PyPI, which may not match your actual environment. These are marked as best-effort in the analysis.
- Dependencies with environment markers (e.g., `; python_version < '3.8'`) are skipped with a warning.
- Poetry dependencies without a version-bearing specifier, such as local `path` or `git` sources, are currently out of scope for `pyproject.toml` parsing.
- `requirements.txt` directives such as `-r`, `-e`, and `--index-url` are ignored and surfaced as analysis/review notes instead of being treated as package dependencies.
- Python lockfiles are currently `analyze` inputs, not standalone `review` inputs.
- `review` supports `requirements.txt` and `pyproject.toml`. When a `pyproject.toml` review has an adjacent or explicit Python lockfile, aminet uses it to pin direct dependency versions where possible.

For the longer-term compatibility target, see [`ROADMAP.md`](./ROADMAP.md).

## Requirements

- Node.js `>=20`
- pnpm `>=10`
- npm ecosystem input (`package.json`, `pnpm-lock.yaml`, or `package-lock.json`) or Python input (`requirements.txt`, `pyproject.toml`)

## Local setup

```bash
pnpm install
pnpm build
node dist/index.js --help
```

## Releasing

The intended release flow is tag-driven with npm trusted publishing.

1. Update `package.json` to the release version
2. Commit and push `main`
3. Create and push a `v<version>` tag
4. GitHub Actions publishes the matching npm package and creates a GitHub Release

You can also run the publish workflow manually with `workflow_dispatch` against a branch or tag. When you provide `tag_name`, it must still match `package.json`.

One-time prerequisite: configure npm trusted publishing for `gorira-tatsu/aminet` and the publish workflow in npm package settings.

## Distribution

- npmjs.org is the canonical package registry for `aminet`
- GitHub Releases are the canonical release log and link back to npm
- GitHub Packages is intentionally not used for now

## Development workflow

Run the main checks before opening a PR:

```bash
pnpm lint
pnpm test
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for contributor workflow details.

## Packaging notes

The published package exposes an `aminet` executable through `dist/index.js` with a Node shebang.

- `npx aminet ...` is the recommended zero-install UX
- `pnpm dlx aminet ...` works, but may run with cache disabled when native SQLite bindings are unavailable
- `pnpm add -g aminet` exposes `aminet ...` globally
- repository-local development can use `node dist/index.js ...` after `pnpm build`

## Security reporting

Do not report vulnerabilities in public issues. See [`SECURITY.md`](./SECURITY.md).
