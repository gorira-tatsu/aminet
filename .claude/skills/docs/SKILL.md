---
name: docs
description: Generate or update project documentation based on code changes. Use this skill when the user says "/docs", asks to update documentation, wants to document recent changes, or needs to generate README, CONTRIBUTING, or API docs. Also triggers when the user mentions "update the docs", "write documentation", or "document this".
argument-hint: "[target] — e.g., README, CONTRIBUTING, API, or omit to auto-detect"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git branch:*), Bash(git merge-base:*), Bash(node dist/*)]
---

# Documentation Generator

Generate or update project documentation by analyzing code changes and existing docs.

## Arguments

The user invoked this with: $ARGUMENTS

## How to determine what to document

1. **If a target is specified** (e.g., `README`, `CONTRIBUTING`, `API`), focus on that file
2. **If no target**, auto-detect what needs updating:
   - Determine the diff base: find the merge-base with the default branch rather than using a fixed `HEAD~N`. This stays accurate regardless of branch age or merge strategy.
     ```bash
     BASE=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master 2>/dev/null || echo "HEAD~5")
     git diff --name-only "$BASE"
     ```
   - Check which source files changed and whether docs cover those areas
   - Prioritize: new CLI flags, new features, changed behavior, new configuration options

## Workflow

### Step 1: Gather context

Collect information from the most authoritative sources first:

1. **CLI --help output** — this is the single source of truth for flags, options, and subcommands. Run `node dist/index.js <command> --help` (or the project's equivalent) to get the current state. If the project hasn't been built yet, read `src/index.ts` or the command registration file directly.
2. **Config schema / types** — read the config type definitions (e.g., `src/core/config/types.ts`) to know every available config field and its type.
3. **Existing docs** — read the target documentation file(s) to understand current style, tone, and structure.
4. **Git history** — run `git log --oneline "$BASE"..HEAD` and `git diff --stat "$BASE"` to see what changed since branching.
5. **Source files** — read relevant source files only when --help or types don't fully explain the behavior.

The reason for this order: --help and type definitions are always in sync with the code. Documentation and commit messages can lag behind.

### Step 2: Identify documentation gaps

Compare what the code does now vs what the docs describe. Look for:
- New CLI commands or flags not documented
- Changed behavior not reflected in docs
- New configuration options missing from docs
- Outdated examples or version numbers
- Missing sections for new features

### Step 3: Write or update documentation

Match the language and conventions of the existing docs:
- If the existing README is in English, write in English
- If the project has Japanese docs, write in Japanese
- If mixed, follow the convention of the specific file being edited

Follow these writing conventions:
- Use clear, pragmatic tone focused on user value
- Include concrete CLI examples with actual commands
- Show example output where helpful
- Use tables for structured information (options, flags, config fields)
- Keep sections concise — prefer short paragraphs over walls of text
- Use imperative mood for instructions ("Run this command", not "You can run this command")

### Step 4: Present changes

After editing, show a brief summary of what was updated and why. If there are remaining gaps, mention them so the user can decide whether to address them.

## Target-specific guidance

### README
- Focus on user-facing features: installation, quick start, CLI usage, Action usage
- Cross-check every flag and option against `--help` output before writing
- Keep examples up to date with current flags and output format
- Update version numbers if relevant

### CONTRIBUTING
- Development setup, prerequisites, commands
- Branching strategy (main/stg/feature-branch workflow)
- PR expectations and commit conventions

### API
- Exported functions, interfaces, and types
- Configuration options and their effects — derive from the config type definition, not memory
- Integration points (CLI, Action, config file)

## Style rules

- Use GitHub-flavored markdown
- Code blocks should specify the language (`bash`, `yaml`, `json`, `typescript`)
- Do not add emoji unless the existing docs use them
- Match the heading hierarchy of the existing document
