---
name: docs
description: Generate or update project documentation based on code changes. Use this skill when the user says "/docs", asks to update documentation, wants to document recent changes, or needs to generate README, CONTRIBUTING, or API docs. Also triggers when the user mentions "update the docs", "write documentation", "document this", "add comments", or "document the code".
argument-hint: "[target] — e.g., README, CONTRIBUTING, API, code-comments, or omit to auto-detect"
allowed-tools: [Read, Write, Edit, Glob, Grep, Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(git branch:*), Bash(git merge-base:*), Bash(node dist/*), Bash(pnpm build:*)]
---

# Documentation Generator

Generate or update project documentation by analyzing code changes and existing docs. This includes both external documentation files (README, CONTRIBUTING, API docs) and in-code documentation (JSDoc comments, inline comments explaining non-obvious logic).

## Language rule

**ALL documentation must be written in English.** This includes:
- README, CONTRIBUTING, and all markdown files
- JSDoc comments and inline code comments
- Commit messages related to documentation changes
- API documentation

This rule is non-negotiable regardless of the user's language.

## Arguments

The user invoked this with: $ARGUMENTS

Compute the diff base before any branch-specific handling so it is always available later:

```bash
BASE=$(git merge-base HEAD origin/main 2>/dev/null || git merge-base HEAD origin/master 2>/dev/null || echo "HEAD~5")
```

## How to determine what to document

1. **If a target is specified** (e.g., `README`, `CONTRIBUTING`, `API`), focus on that file
2. **If no target**, auto-detect what needs updating:
   - Determine the diff base: find the merge-base with the default branch rather than using a fixed `HEAD~N`. This stays accurate regardless of branch age or merge strategy.
     ```bash
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

### code-comments (in-code documentation)

When the target is `code-comments` or the user asks to "add comments to the code" / "document the code":

1. **Identify files that need documentation** — focus on:
   - Public functions/classes with no JSDoc
   - Complex logic with no inline explanation
   - Non-obvious algorithms, workarounds, or business rules
   - Files changed in recent commits that lack documentation

2. **Add JSDoc comments** to exported functions and interfaces:
   ```typescript
   /**
    * Resolve a Python dependency graph starting from a root package using BFS.
    *
    * Fetches package metadata from PyPI, parses `requires_dist` for transitive
    * dependencies, and builds a full dependency graph. Environment-marker-only
    * dependencies are skipped.
    *
    * @param rootName - PyPI package name (e.g., "flask")
    * @param rootVersion - Version specifier (e.g., "3.0.0", ">=2.0", or "latest")
    * @param options - Resolution options (maxDepth, concurrency)
    * @returns Complete dependency graph with nodes and edges
    */
   ```

3. **Add inline comments** only where the logic is non-obvious:
   - Explain *why*, not *what* — the code already shows what it does
   - Good: `// Strip extras like [redis] before looking up the package name`
   - Bad: `// Set x to 5` or `// Loop through items`

4. **Do not over-comment** — avoid:
   - Restating what the code already says clearly
   - Comments on trivial getters/setters
   - Commented-out code
   - Comments that will become stale quickly (e.g., "added in v0.1.3")

## Documentation guidelines

Follow the [Google developer documentation style guide](https://developers.google.com/style) principles:

### Tone and voice
- Use **second person** ("you") when addressing the user
- Use **active voice** and **present tense**
- Be **direct and concise** — say what you mean in as few words as possible
- Use **imperative mood** for instructions ("Run this command", not "You should run this command")

### Structure
- Lead with the most important information
- Use headings to create scannable structure
- Keep paragraphs short (2-4 sentences max)
- Use lists for 3+ related items
- Use tables for structured comparisons

### Technical writing
- Define acronyms on first use
- Use code font for: file names, commands, flags, function names, variable names, config keys
- Include concrete examples with realistic values, not `foo`/`bar`
- Show both the command and expected output where helpful
- Link to related sections rather than repeating information

### Code examples
- Every example must be copy-pasteable and runnable
- Use comments sparingly in examples — only to highlight the key point
- Show the simplest possible example first, then add complexity

## Style rules

- Use GitHub-flavored markdown
- Code blocks should specify the language (`bash`, `yaml`, `json`, `typescript`)
- Do not add emoji unless the existing docs use them
- Match the heading hierarchy of the existing document
- **Write everything in English**
