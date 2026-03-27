---
name: pr-notify
description: Comment on related GitHub issues when a PR is created or updated. Use this skill when the user says "/pr-notify", asks to "notify issues about this PR", "comment on related issues", "link PR to issues", or wants to update issue threads with PR status. Also use proactively after creating a PR that references issues, to keep issue threads informed.
argument-hint: "[#issue1 #issue2 ...] — specific issues, or omit to auto-detect from PR"
allowed-tools: [Bash(gh issue:*), Bash(gh pr:*), Bash(gh api:*), Bash(git log:*), Bash(git branch:*), Read, Grep]
---

# PR Notification to Issues

Post informative comments on GitHub issues that are related to the current PR, keeping issue threads up to date with development progress.

Every comment includes a hidden HTML marker (`<!-- pr-notify:PR#N -->`) so the skill can find and update its own comments on subsequent runs instead of posting duplicates.

## Arguments

The user invoked this with: $ARGUMENTS

## Workflow

### Step 1: Identify the current PR and its base

Fetch the PR metadata including the base branch (needed for commit range):

```bash
gh pr view --json number,title,body,state,url,headRefName,baseRefName
```

If no PR exists for the current branch, inform the user and suggest creating one first (or using `/issue-pr pr`).

Store the values for later use:
- `PR_NUMBER`, `PR_TITLE`, `PR_BODY`, `PR_STATE`, `PR_URL`
- `HEAD_REF` (the feature branch)
- `BASE_REF` (the target branch, e.g., `stg` or `main`)

### Step 2: Find related issues

Collect issue numbers from multiple sources:

1. **Explicit arguments**: If the user passed `#5 #6`, use those and skip auto-detection
2. **PR body**: Scan for patterns like `Closes #N`, `Fixes #N`, `Resolves #N`, `Related to #N`, standalone `#N`
3. **Commit messages**: Use `BASE_REF` from Step 1 to get the correct commit range:
   ```bash
   git log origin/$BASE_REF..HEAD --oneline
   ```
   Scan each line for `#N` references.
4. **Branch name**: Extract issue number if branch follows `feat/123-description` or `fix/issue-123` pattern

Deduplicate the collected issue numbers. Filter out the PR's own number (a PR and issue can share a number).

If no issues are found, tell the user and suggest passing issue numbers explicitly.

### Step 3: Build the comment body

Use a fixed HTML marker to identify comments from this skill. This enables idempotent updates — running `/pr-notify` multiple times for the same PR will update the existing comment rather than creating duplicates.

**Marker format:** `<!-- pr-notify:PR#<pr-number> -->`

**Comment template:**

```markdown
<!-- pr-notify:PR#<pr-number> -->
### PR Update: #<pr-number> — <pr-title>

**Status**: <Open|Merged|Closed>
**Branch**: `<head-ref>` → `<base-ref>`

**Summary of changes:**
<2-3 bullet points describing what this PR does, derived from PR body or commits>

[View PR](<pr-url>)
```

### Step 4: Post or update comments

For each related issue:

1. **Check for existing comment** from this PR:
   ```bash
   gh api repos/{owner}/{repo}/issues/<issue-number>/comments \
     --jq '.[] | select(.body | contains("<!-- pr-notify:PR#<pr-number> -->")) | .id'
   ```

2. **If an existing comment is found**, update it:
   ```bash
   gh api repos/{owner}/{repo}/issues/comments/<comment-id> \
     -X PATCH -f body="<new-body>"
   ```

3. **If no existing comment**, create a new one:
   ```bash
   gh issue comment <issue-number> --body "<body>"
   ```

This ensures the skill is idempotent — safe to run repeatedly without spamming issue threads.

### Step 5: Report results

Show the user which issues were notified and whether each was a new comment or an update:

```text
Notified issues:
- #5 — <issue title> (new comment)
- #6 — <issue title> (updated existing)
```

## Edge cases

- **No PR found**: Tell the user to create a PR first
- **No related issues found**: Tell the user no issue references were detected, and suggest passing issue numbers explicitly
- **Closed issues**: Still notify — the comment is useful as a historical record
- **Permission errors**: If the bot/user lacks comment permission on an issue, warn and continue with the remaining issues

## When to use proactively

If you just created a PR (e.g., via `/issue-pr pr`) and the PR body contains `Closes #N` or similar references, suggest running `/pr-notify` to keep those issue threads informed. The goal is to make issue threads self-documenting — anyone following an issue should see when a PR is opened for it.
