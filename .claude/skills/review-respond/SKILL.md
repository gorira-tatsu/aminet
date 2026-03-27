---
name: review-respond
description: Respond to GitHub PR review comments by reading feedback, applying code fixes, and pushing updates. Use this skill when the user says "/review-respond", asks to "address PR reviews", "fix review comments", "respond to PR feedback", or wants to handle code review suggestions on a pull request. Also use when the user mentions "review came in" or "address the review".
argument-hint: "[PR number] — omit to use the current branch's PR"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash(gh pr:*), Bash(gh api:*), Bash(git add:*), Bash(git commit:*), Bash(git push:*), Bash(git diff:*), Bash(git log:*), Bash(git branch:*), Bash(git status:*), Bash(pnpm build:*), Bash(pnpm test:*), Bash(pnpm lint:*)]
---

# PR Review Responder

Read PR review comments, analyze them, apply code fixes, and push updates.

## Language rule

**ALL output must be in English.** This includes:
- Commit messages
- PR reply comments
- Code comments and documentation added or modified as part of fixes
- The summary report back to the user

This rule is non-negotiable regardless of the reviewer's language or the user's language.

## Arguments

The user invoked this with: $ARGUMENTS

## Workflow

### Step 1: Identify the PR

If a PR number was provided, use it. Otherwise, detect from the current branch:

```bash
gh pr view --json number,title,headRefName,url
```

If no PR exists for the current branch, inform the user.

### Step 2: Fetch all review comments

Fetch both review-level comments and inline code comments:

```bash
# Review-level comments (approve/request changes/comment)
gh pr view <PR> --json reviews --jq '.reviews[] | "[\(.state)] \(.author.login): \(.body)"'

# Inline code comments
gh api repos/{owner}/{repo}/pulls/<PR>/comments --jq '.[] | "[\(.path):\(.line // .original_line)] \(.user.login): \(.body)"'
```

### Step 3: Categorize each comment

For each comment, determine the action needed:

| Category | Action |
|----------|--------|
| **Code fix needed** | The reviewer pointed out a bug, missing logic, or improvement. Apply the fix. |
| **Suggestion with code block** | Reviewer provided a `suggestion` code block. Evaluate and apply if valid. |
| **Question / clarification** | No code change needed. Note for the user to respond manually. |
| **Style / nitpick** | Apply if straightforward. Skip if subjective. |
| **Already addressed** | Comment was about something already fixed. Skip. |

### Step 4: Apply fixes

For each actionable comment:

1. Read the file mentioned in the comment
2. Understand the context and the reviewer's concern
3. Apply the fix — prefer the reviewer's suggestion if one was provided, but verify it's correct first
4. If the fix requires changes in multiple places (e.g., the same pattern appears elsewhere), fix all occurrences

Group related fixes logically. Avoid fixing things that would conflict with other pending comments.

### Step 5: Verify

After all fixes are applied:

```bash
pnpm build
pnpm lint
pnpm test
```

If the build, lint, or tests fail, investigate and fix before proceeding.

### Step 6: Commit and push

Create a single commit with all review fixes:

```bash
git add <changed files>
git commit -m "fix: address PR review feedback

<brief summary of changes made>

Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>"

git push
```

### Step 7: Reply to each review comment on GitHub

After pushing fixes, reply to each addressed review comment on the PR **in English**:

```bash
# Reply to an inline review comment
gh api repos/{owner}/{repo}/pulls/<PR>/comments/<comment_id>/replies \
  -f body="Fixed — <brief explanation of what was changed and why>"

# Reply to a review-level comment
gh pr comment <PR> --body "Addressed review feedback from @reviewer:
- <fix 1 summary>
- <fix 2 summary>"
```

Reply guidelines:
- Keep replies concise (1-2 sentences per fix)
- Reference the specific change made (e.g., "Switched to `relative()` for repo-relative paths")
- For skipped suggestions, explain why (e.g., "Skipped — this would break X because Y")
- For questions, provide a clear answer or flag for the user

### Step 8: Report results

Summarize what was done:

```md
## Review Response Summary

### Applied fixes
- [file:line] Description of fix (from @reviewer) — replied on PR
- [file:line] Description of fix (from @reviewer) — replied on PR

### Skipped (manual response needed)
- [file:line] @reviewer asked: "question..." → needs human reply

### Verification
- Build: pass/fail
- Lint: pass/fail
- Tests: pass/fail
```

## Important guidelines

- Always read the full context of a file before making changes — don't blindly apply suggestions without understanding the surrounding code
- If a suggestion would introduce a bug or conflict with project conventions, skip it and flag it for the user
- Don't engage in opinion-based debates through code changes. If a comment is about stylistic preference, apply it if reasonable or flag it for the user
- When multiple reviewers comment on the same area, resolve conflicts by choosing the approach that best matches project conventions
- Keep the commit message concise but descriptive enough to understand what changed
