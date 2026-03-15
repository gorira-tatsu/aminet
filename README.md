# aminet

[![npm version](https://img.shields.io/npm/v/aminet)](https://www.npmjs.com/package/aminet)
[![npm downloads](https://img.shields.io/npm/dm/aminet)](https://www.npmjs.com/package/aminet)
[![Dependency Review](https://github.com/gorira-tatsu/aminet/actions/workflows/ami-review.yml/badge.svg)](https://github.com/gorira-tatsu/aminet/actions/workflows/ami-review.yml)
[![Publish](https://github.com/gorira-tatsu/aminet/actions/workflows/publish.yml/badge.svg)](https://github.com/gorira-tatsu/aminet/actions/workflows/publish.yml)

`aminet` is a Node-executable CLI and GitHub Action for reviewing npm dependency risk.

It analyzes dependency graphs, vulnerabilities, licenses, security signals, trust, freshness, provenance, and version pinning, then renders the result as terminal output, machine-readable JSON, SBOMs, or PR review comments.

## Status

- Early project, pre-`1.0`
- License: MIT
- CLI and review output may still evolve

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

## Requirements

- Node.js `>=20`
- pnpm `>=10`
- npm ecosystem input (`package.json`, `pnpm-lock.yaml`, or `package-lock.json`)

## Local setup

```bash
pnpm install
pnpm build
node dist/index.js --help
```

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

Review dependency changes in a branch:

```bash
npx aminet review package.json --base HEAD~1 --security
```

Cache maintenance:

```bash
npx aminet cache stats
npx aminet cache prune
```

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

## CLI commands

Top-level commands:

- `analyze`: dependency graph analysis for packages or local manifests
- `ci`: JSON-oriented CI alias for `analyze`
- `review`: PR review mode for direct dependency changes
- `cache`: local cache inspection and pruning

Use the built-in help for the complete option set:

```bash
node dist/index.js analyze --help
node dist/index.js review --help
```

## GitHub Action

This repository includes a composite action in [`action.yml`](./action.yml).

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

For remote usage after tagged releases are published, replace `uses: ./` with `uses: gorira-tatsu/aminet@v0.1.1`.

## Releasing

The intended release flow is tag-driven with npm trusted publishing.

1. Update `package.json` to the release version
2. Commit and push `main`
3. Create and push a `v<version>` tag
4. GitHub Actions publishes the matching npm package and creates a GitHub Release

One-time prerequisite: configure npm trusted publishing for `gorira-tatsu/aminet` and the publish workflow in npm package settings.

## Distribution

- npmjs.org is the canonical package registry for `aminet`
- GitHub Releases are the canonical release log and link back to npm
- GitHub Packages is intentionally not used for now

## Output modes

`analyze` can render:

- human-readable table output
- JSON
- dependency tree output
- Mermaid and Graphviz graphs
- CycloneDX 1.5 SBOM
- SPDX 2.3 SBOM
- third-party notices output

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
