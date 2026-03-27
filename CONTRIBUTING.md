# Contributing to aminet

Thanks for contributing.

## Prerequisites

- Node.js `>=20`
- Git
- pnpm `>=10`

## Setup

```bash
git clone https://github.com/gorira-tatsu/aminet.git
cd aminet
pnpm install
pnpm build
```

## Development commands

```bash
pnpm lint
pnpm test
node dist/index.js --help
```

Useful targeted commands:

```bash
node dist/index.js analyze express@4.21.2 --security --trust-score
node dist/index.js review package.json --base HEAD~1 --security
```

## Project layout

- `src/cli`: command entrypoints and renderers
- `src/core`: analysis engines, stores, and report builders
- `src/utils`: shared HTTP, logging, and concurrency helpers
- `test`: unit and regression coverage
- `.claude/skills`: canonical skill definitions tracked in the repository
- `.codex/skills`: symlink to `.claude/skills` so Codex can use the same project skills

## Branching strategy

This project uses a **main / stg / feature-branch** workflow:

```text
main          (production — always releasable)
 └─ stg       (staging — integration branch for the next release)
     ├─ feat/xxx
     ├─ fix/yyy
     └─ docs/zzz
```

| Branch | Purpose | Merges into |
|--------|---------|-------------|
| `main` | Production releases. Protected. | — |
| `stg` | Staging. All feature branches target this. Must stay stable. | `main` (when ready to release) |
| `feat/*`, `fix/*`, `docs/*`, etc. | Individual changes. Created from `stg`. | `stg` via pull request |

### Workflow

1. Create a feature branch from `stg`: `git checkout -b feat/my-feature stg`
2. Develop, commit, and push the branch
3. Open a pull request targeting `stg`
4. After review and CI pass, merge into `stg`
5. When `stg` is stable and ready to release, merge `stg` into `main` and tag a release

### Rules

- Never push directly to `main` or `stg` from day-to-day development.
  Exception: approved release automation (for example `/release`) may perform controlled merges or pushes.
- Always create a pull request for changes
- Keep `stg` stable — do not merge broken or incomplete work
- Rebase or merge from `stg` if your branch falls behind

## Code quality

This project uses [Biome](https://biomejs.dev/) for linting and formatting. Run it before every commit:

```bash
pnpm lint          # lint + format check
pnpm lint --write  # auto-fix lint and format issues
```

All code must pass `pnpm lint` with zero errors before merging. CI will enforce this once the lint workflow is in place (see #15).

## Pull request expectations

- Keep changes scoped
- Add or update tests for behavior changes
- Update user-facing documentation when commands, flags, or output change
- Run `pnpm lint` and `pnpm test` before opening a PR

## Commit and review hygiene

- Prefer small commits with clear messages
- Describe user-visible impact in the PR summary
- Call out any cache, output, or schema changes explicitly
- Include sample CLI output when changing review or reporting behavior

## Adding a new analysis check

When adding a new analyzer or signal:

1. Put core logic under `src/core`
2. Thread results into the report builder if user-visible
3. Add renderer coverage if output changes
4. Add unit or regression tests under `test`
5. Document new CLI flags or output fields in `README.md`

## Reporting security issues

Use the private process documented in [`SECURITY.md`](./SECURITY.md).
