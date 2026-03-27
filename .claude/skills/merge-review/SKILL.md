---
name: merge-review
description: Review a PR's merge readiness for the stg branch. Use this skill when the user says "/merge-review", asks to "check if this PR is ready to merge", "review for stg", "pre-merge check", or wants to validate a PR meets all quality gates before merging into stg. Also triggers for "is this ready to merge" or "merge checklist".
argument-hint: "[PR number] — omit to use the current branch's PR"
allowed-tools: [Read, Glob, Grep, Bash(grep:*), Bash(gh pr:*), Bash(gh api:*), Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git branch:*)]
---

# Merge Readiness Reviewer

Review a PR to determine if it meets all quality gates for merging into `stg`. This skill is read-only — it reports a checklist of pass/fail checks but does not perform the merge itself.

## Language rule

**ALL output must be in English.** This includes the checklist report, all analysis, and notes.

## Arguments

The user invoked this with: $ARGUMENTS

## Workflow

### Step 1: Identify the PR

If a PR number was provided, use it. Otherwise, detect from the current branch:

```bash
gh pr view --json number,title,headRefName,baseRefName,url,state,mergeable
```

If no PR exists for the current branch, inform the user.

**Gate check**: Verify the PR targets `stg`. If it targets `main`, stop and tell the user:
> This PR targets `main`. Direct merges to `main` should use the `/release` skill instead. PRs should target `stg` per the branching strategy.

If the PR targets another branch (e.g., a feature branch), proceed but note it in the report.

### Step 2: Check CI status

```bash
gh pr checks <PR> --json name,state,conclusion
```

Verify all required checks have passed. Match by category rather than exact job name:
- **Lint & Format** — any check name matching `lint` or `format`
- **Typecheck** — any check name matching `typecheck`, `tsc`, or `build` when the job is dedicated to type validation
- **Test** — any check name matching `test`

If CI hasn't run yet (pending), note it as "pending" rather than "fail".

### Step 3: Review commit conventions

Fetch the commits in this PR:

```bash
gh pr view <PR> --json commits --jq '.commits[].messageHeadline'
```

Verify each commit message starts with a conventional prefix:
- `feat:`, `fix:`, `docs:`, `chore:`, `test:`, `ci:`, `refactor:`, `perf:`, `style:`, `build:`

Flag commits that don't follow the convention. This is a warning, not a blocker — some merge commits or initial commits may not follow the pattern.

### Step 4: Review code changes

Fetch the diff:

```bash
gh pr diff <PR>
```

Scan for common issues:

| Issue | How to detect | Severity |
|-------|--------------|----------|
| Debug logging left in | `console.log`, `console.debug`, `debugger` in non-test files | warn |
| TODO/FIXME without issue | `// TODO` or `// FIXME` not followed by `#<number>` | warn |
| Commented-out code blocks | Multi-line comments containing code patterns | warn |
| Potential secrets | Strings matching API key/token patterns, `.env` files in diff | block |
| New source files without tests | New `src/**/*.ts` files with no corresponding `test/**/*.test.ts` | warn |
| Large files added | Any single file addition > 500 lines | info |

For detecting new source files without tests:
```bash
# Get list of new source files in the PR
gh pr diff <PR> --name-only | grep '^src/.*\.ts$'
```

Then check for corresponding test files.

### Step 5: Check for conflicts

```bash
gh pr view <PR> --json mergeable,mergeStateStatus
```

Check:
- `mergeable` — is the PR mergeable without conflicts?
- `mergeStateStatus` — is it `CLEAN`, `UNSTABLE`, `BLOCKED`, or `BEHIND`?

If the branch is behind `stg`, note that a rebase/merge is needed.

### Step 6: Report checklist

Present the results in this format:

```markdown
## Merge Review: PR #<number> — <title>

**Branch**: `<head>` → `<base>`
**Author**: @<author>

| Check | Status | Notes |
|-------|--------|-------|
| CI: Lint & Format | ✅ pass / ❌ fail / ⏳ pending | |
| CI: Typecheck | ✅ pass / ❌ fail / ⏳ pending | |
| CI: Test | ✅ pass / ❌ fail / ⏳ pending | |
| Commit conventions | ✅ pass / ⚠️ warn | N/M commits follow convention |
| No debug artifacts | ✅ pass / ⚠️ warn | Found console.log in <file> |
| No secrets in diff | ✅ pass / 🚫 block | |
| Test coverage for new files | ✅ pass / ⚠️ warn | Missing tests for <file> |
| No merge conflicts | ✅ pass / ❌ fail | |
| Branch up to date | ✅ pass / ⚠️ behind | Needs rebase from stg |

### Verdict: ✅ Ready to merge / ⚠️ Ready with warnings / ❌ Needs fixes

<If warnings exist, list them with recommended actions>
<If blocks exist, list them as must-fix items>
```

## Guidelines

- This skill is **read-only** — never merge, push, or modify code
- `warn` items don't block the merge but should be acknowledged
- `block` items (secrets, failing CI) must be resolved before merge
- If CI is still running, recommend waiting rather than merging immediately
- For docs-only or chore PRs, missing tests is expected — don't flag as warn
- Be pragmatic: a PR with 1 non-conventional commit among 10 good ones is fine
