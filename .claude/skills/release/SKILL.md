---
name: release
description: Merge stg into main, bump version, tag, and trigger the npm publish workflow. Use this skill when the user says "/release", asks to "release a new version", "merge stg to main", "cut a release", "publish to npm", or wants to create a new release. Also triggers for "ship it", "deploy to production", or "tag a release".
argument-hint: "[--version <semver>] [--dry-run] — e.g., --version 0.2.0, or omit for auto-detection"
allowed-tools: [Read, Glob, Grep, Edit, Bash(gh pr:*), Bash(gh api:*), Bash(gh run:*), Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(git tag:*), Bash(git checkout:*), Bash(git merge:*), Bash(git push:*), Bash(git fetch:*), Bash(git pull:*), Bash(node:*), Bash(pnpm build:*), Bash(pnpm test:*), Bash(pnpm lint:*)]
---

# Release Manager

Merge `stg` into `main`, bump the version, create a git tag, and trigger the npm publish workflow. This is a high-stakes operation with mandatory confirmation steps at every destructive action.

## Language rule

**ALL output must be in English.** This includes the release summary, changelog preview, commit messages, and all user-facing output.

## Arguments

The user invoked this with: $ARGUMENTS

Parse the arguments:
- **`--version <semver>`** — explicit version to release (e.g., `0.2.0`). Skips auto-detection.
- **`--dry-run`** — run all checks and show what would happen, but do not merge, tag, or push.
- **Empty** — auto-detect version bump from commit history.

## Workflow

### Step 1: Pre-flight checks

Verify the environment is ready for a release:

```bash
# Working directory must be clean
git status --porcelain

# Fetch latest remote state
git fetch origin main stg --tags

# Verify stg exists and is ahead of main
git log --oneline origin/main..origin/stg
```

Check for blockers:
- **Dirty working directory** → abort, ask user to commit or stash
- **stg is not ahead of main** → nothing to release
- **Open "must-merge" PRs** → warn (check for PRs targeting stg with "release-blocker" label)

```bash
gh pr list --base stg --state open --json number,title,labels --jq '.[] | select(.labels[]?.name == "release-blocker") | "#\(.number): \(.title)"'
```

If `--dry-run`, prefix all subsequent steps with "[DRY RUN]" and skip destructive actions.

### Step 2: Determine version bump

Get the current version and last release tag:

```bash
# Current version from package.json
node -e "console.log(require('./package.json').version)"

# Last release tag
git describe --tags --abbrev=0 origin/main
```

If `--version` was provided, use it. Otherwise, analyze commits since the last tag:

```bash
git log --oneline origin/main..origin/stg
```

Apply semantic versioning rules:

| Commit prefix | Bump | Example |
|--------------|------|---------|
| `feat:` (any) | **minor** | 0.1.3 → 0.2.0 |
| `fix:` only (no feat) | **patch** | 0.1.3 → 0.1.4 |
| `BREAKING CHANGE:` or `feat!:` / `fix!:` | **major** | 0.1.3 → 1.0.0 |
| `docs:`, `chore:`, `test:`, `ci:` only | **patch** | 0.1.3 → 0.1.4 |

### Step 3: Generate changelog preview

Collect and group commits:

```bash
git log --format="- %s (%h)" origin/main..origin/stg
```

Group into categories:

```md
### Features
- feat: add Python package support (f097758)
- feat: include devDependencies by default (abc1234)

### Bug Fixes
- fix: detect dependency updates in monorepo (def5678)

### Other Changes
- docs: add branching strategy (ghi9012)
- chore: add project skills (jkl3456)
```

### Step 4: Confirmation gate

Present a release summary and **ask for explicit confirmation**:

```md
## Release Preview

**Version**: 0.1.3 → 0.2.0
**Tag**: v0.2.0
**Commits**: 5 commits from stg

### Changelog
<grouped changelog from Step 3>

### Actions that will be taken
1. Update package.json version to 0.2.0
2. Commit version bump on stg
3. Merge stg → main (fast-forward)
4. Create and push tag v0.2.0
5. publish.yml will auto-trigger on tag push

**Proceed with release? (yes/no)**
```

If the user does not confirm, abort. Do not proceed without explicit "yes".

If `--dry-run`, show the preview and stop here.

### Step 5: Bump version

```bash
git checkout stg
git pull origin stg
```

Update the `version` field in `package.json` using the Edit tool.

Run full CI locally to catch any issues:

```bash
pnpm build
pnpm lint
pnpm test
```

If any step fails, **abort the release** and report the failure. Do not continue.

Commit the version bump:

```bash
git add package.json
git commit -m "chore: bump version to <new-version>"
git push origin stg
```

### Step 6: Merge stg → main

```bash
git checkout main
git pull origin main
git merge origin/stg --ff-only
```

If fast-forward is not possible (main has diverged), **stop and warn the user**. This should not happen in the normal workflow but requires manual resolution if it does.

```bash
git push origin main
```

### Step 7: Ensure no active publish workflow

```bash
gh run list --workflow=publish.yml --limit=20 --json status,conclusion,url \
  --jq '.[] | select(.status != "completed")'
```

If any run is still in progress, stop and ask the user whether to wait before tagging.

### Step 8: Tag and push

```bash
git tag -a "v<new-version>" -m "Release v<new-version>"
git push origin "v<new-version>"
```

This triggers the `publish.yml` workflow which will:
1. Run CI (lint, test, build)
2. Publish to npm with provenance
3. Create a GitHub Release with auto-generated notes

### Step 9: Report results

Wait briefly for the workflow to start, then report:

```bash
# Check if the publish workflow was triggered
gh run list --workflow=publish.yml --limit=1 --json databaseId,status,conclusion,url
```

```md
## Release Summary

**Version**: v<new-version>
**Tag**: v<new-version>
**npm**: publishing... (triggered by tag push)

### Changelog
<grouped changelog>

### Links
- [GitHub Release](https://github.com/<owner>/<repo>/releases/tag/v<new-version>)
- [Publish Workflow](<workflow-run-url>)
- [npm Package](https://www.npmjs.com/package/aminet)

### Next steps
- Monitor the publish workflow for completion
- Verify the package is available on npm: `npm view aminet@<new-version>`
```

## Important guidelines

- **Never skip confirmation** — the confirmation gate in Step 4 is mandatory. A release cannot be triggered without explicit user approval.
- **Fast-forward only** — the merge to main must be `--ff-only`. If it fails, do not force-push or create a merge commit without user approval.
- **No direct npm publish** — rely on the existing publish.yml workflow triggered by tag push. Do not run `npm publish` directly.
- **Abort on CI failure** — if build, lint, or tests fail in Step 5, abort immediately. Do not release broken code.
- **One release at a time** — if a publish workflow is already running, warn the user and wait.
- **Tag format** — always use `v` prefix: `v0.2.0`, not `0.2.0`. This matches the existing tag convention and the publish.yml trigger pattern (`v*`).
