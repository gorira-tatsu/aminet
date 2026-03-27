---
name: issue-pr
description: Create GitHub issues and pull requests using the gh CLI. Use this skill when the user says "/issue-pr", asks to "create an issue", "open a PR", "file a bug", "create a pull request", "make issues for these", or wants to batch-create multiple issues from a plan. Also triggers for "open PR targeting stg" or "create issues from this list".
argument-hint: "issue <title> [--label <label>] | pr [--base <branch>] | issues <list>"
allowed-tools: [Bash(gh issue:*), Bash(gh pr:*), Bash(git log:*), Bash(git diff:*), Bash(git branch:*), Bash(git push:*), Bash(git remote:*), Read, Glob, Grep]
---

# GitHub Issue & PR Creator

Create GitHub issues and pull requests with proper formatting, labels, and cross-references.

## Arguments

The user invoked this with: $ARGUMENTS

## Parsing the arguments

Determine the mode from the first word:
- `issue` — create a single issue
- `pr` — create a pull request
- `issues` — batch-create multiple issues
- If empty or ambiguous, ask the user what they want to create

## Safety: preview before creating

Issues and PRs are visible to the team and hard to undo cleanly. By default, always show a preview of what will be created and ask for confirmation before running the `gh` command. This applies to all modes.

The only exception is when the user explicitly says "just create it", "no preview", or similar — then proceed directly.

**Example preview format:**
```
## Preview: PR

Title: feat: add private package support
Base: stg <- feat/private-package-support
Body: [rendered summary]
Labels: (none)
Closes: #5

Create this PR? [y/n]
```

## Mode: Create Issue

**Usage:** `/issue-pr issue "title" [--label bug|enhancement|...] [--body "description"]`

### Steps

1. If title or body is missing, infer from conversation context or ask
2. Check for existing open issues with similar titles to avoid duplicates:
   ```bash
   gh issue list --state open --search "<title keywords>"
   ```
   If a close match exists, warn the user before proceeding.
3. Determine the appropriate label from context:
   - Bug reports → `bug`
   - New features → `enhancement`
   - Documentation → `documentation`
4. Check if the repo has issue templates (`.github/ISSUE_TEMPLATE/`). If templates exist, structure the body to match the relevant template's sections.
5. Show preview, then create on confirmation:
   ```bash
   gh issue create --title "<title>" --label "<label>" --body "<body>"
   ```
6. Report the issue URL back to the user

## Mode: Create PR

**Usage:** `/issue-pr pr [--base <branch>]`

### Steps

1. **Check for existing PR**: Before anything else, check if a PR already exists for this branch:
   ```bash
   gh pr view --json number,url 2>/dev/null
   ```
   If one exists, show its URL and ask if the user wants to update it or create a new one.

2. **Detect base branch**: Use `--base` if provided. Otherwise, detect intelligently:
   ```bash
   git branch -r | grep -E 'origin/(stg|staging|develop|main|master)' | head -5
   ```
   Priority order: `stg` > `staging` > `develop` > `main` > `master`.
   If multiple candidates exist, show the options and ask the user.

3. **Gather context**:
   - `git log <base>..HEAD --oneline` to see commits in this branch
   - `git diff <base>...HEAD --stat` to see changed files
   - Read commit messages to understand the changes

4. **Load PR template**: Check for `.github/pull_request_template.md`. If it exists, use its structure for the PR body. If not, use this default:
   ```markdown
   ## Summary
   <1-3 bullet points summarizing the changes>

   ## Testing
   - [ ] Lint passes
   - [ ] Tests pass

   ## Notes
   <any additional context>
   ```

5. **Link related issues**: Scan commit messages for issue references (`#N`, `Closes #N`, `Fixes #N`) and include them in the PR body.

6. **Preview and create**:
   - Show the full preview (title, base, body, linked issues)
   - On confirmation, push the branch if needed: `git push -u origin <branch>`
   - Create the PR: `gh pr create --base <base> --title "..." --body "..."`

7. Report the PR URL back to the user.

## Mode: Batch Create Issues

**Usage:** `/issue-pr issues` (reads from conversation context or a provided list)

### Steps

1. Parse the list of issues from conversation context or explicit argument text
2. Show a numbered preview of all issues to be created
3. After confirmation, create each using the single-issue flow
4. Report all created issue URLs as a summary table

## Rules

- Always write issue and PR content in **English**
- Use conventional commit prefixes in PR titles when applicable (`feat:`, `fix:`, `docs:`, `chore:`)
- Never create duplicate issues — always check existing open issues first
- Include `Closes #N` in PR body when the PR resolves a known issue
- For PRs, always check if the branch needs pushing before creating
- Default to preview mode. Only skip preview when the user explicitly opts out.
