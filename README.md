# aminet

[![npm version](https://img.shields.io/npm/v/aminet)](https://www.npmjs.com/package/aminet)
[![npm downloads](https://img.shields.io/npm/dm/aminet)](https://www.npmjs.com/package/aminet)
[![Dependency Review](https://github.com/gorira-tatsu/aminet/actions/workflows/ami-review.yml/badge.svg)](https://github.com/gorira-tatsu/aminet/actions/workflows/ami-review.yml)
[![Publish](https://github.com/gorira-tatsu/aminet/actions/workflows/publish.yml/badge.svg)](https://github.com/gorira-tatsu/aminet/actions/workflows/publish.yml)

`aminet` is a Node-executable CLI and GitHub Action for reviewing npm and Python dependency risk.

It analyzes dependency graphs, vulnerabilities, licenses, security signals, trust, freshness, provenance, and version pinning, then renders the result as terminal output, machine-readable JSON, SBOMs, or PR review comments.

## Status

- Early project, pre-`1.0`
- License: MIT
- CLI and review output may still evolve

## GitHub Action

The main distribution target is GitHub Actions. `aminet` is designed to review npm dependency changes in pull requests and post or update a focused review comment.

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

- `path`: manifest path, usually `package.json`
- `depth`: maximum dependency depth to resolve
- `dev`: include devDependencies in review (default: `"true"`)
- `deny-license`: comma-separated SPDX IDs to block
- `fail-on-vuln`: fail the job at or above a severity threshold
- `security`: enable deeper security checks
- `version`: pin the published `aminet` CLI version explicitly
- `lockfile-path`: explicit path to lockfile (for monorepos)
- `exclude-packages`: comma-separated packages to skip (supports wildcards like `@scope/*`)
- `npm-token`: npm auth token for private registry access

For monorepo usage where `package.json` is in a sub-package:

```yaml
      - uses: gorira-tatsu/aminet@v0.1.3
        with:
          path: packages/frontend/package.json
          lockfile-path: pnpm-lock.yaml
```

The review command automatically walks up parent directories to find lockfiles and reads the correct workspace section from pnpm lockfiles. Use `lockfile-path` when auto-detection does not work for your layout.

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

If your project has private packages, provide an npm token and optionally exclude packages that should not be analyzed:

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
npx aminet analyze requests --ecosystem pypi
```

Review dependency changes in a branch (includes devDependencies by default):

```bash
npx aminet review package.json --base HEAD~1 --security
npx aminet review package.json --base HEAD~1 --no-dev  # exclude devDependencies
```

Review with private packages (skip or authenticate):

```bash
npx aminet review package.json --base HEAD~1 --exclude-packages "@scope/*"
NPM_TOKEN=xxx npx aminet review package.json --base HEAD~1
```

Generate a config file interactively:

```bash
npx aminet init                    # interactive prompts
npx aminet init --defaults         # non-interactive with sensible defaults
npx aminet init --defaults --merge # merge defaults into existing config
npx aminet init --defaults --force # overwrite existing config
```

Cache maintenance:

```bash
npx aminet cache stats
npx aminet cache prune
```

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
## aminet Dependency Review

| Metric | Count |
|--------|-------|
| Added | 1 |
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

### Updated Dependencies
| Package | Declared | Resolved | License |
|---------|----------|----------|---------|
| react | ^18.2.0 -> ^18.3.0 | 18.3.1 -> 18.3.2 | MIT |
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
- `pyproject.toml` with PEP 621 `[project].dependencies`

**Limitations:**
- **Pinned versions (`==`) are scanned accurately.** Range specifiers resolve to the latest compatible version from PyPI, which may not match your actual environment. These are marked as best-effort in the analysis.
- Dependencies with environment markers (e.g., `; python_version < '3.8'`) are skipped with a warning.
- `poetry.lock`, `pdm.lock`, and `uv.lock` are not yet supported.
- The `review` command does not yet support Python files.

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
