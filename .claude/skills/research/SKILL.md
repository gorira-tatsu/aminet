---
name: research
description: Research best practices, patterns, and conventions for a given topic before implementation. Use this skill when the user says "/research", asks to "research best practices", "investigate how to", "what's the best way to", "look up conventions for", or wants to understand the right approach before coding. Also triggers for "how should we implement", "what do other projects do for", or "find patterns for".
argument-hint: "<topic> — e.g., 'error handling in TypeScript', 'SQLite migration patterns', 'Vitest mocking strategies'"
allowed-tools: [Read, Glob, Grep, WebSearch, WebFetch, Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git branch:*)]
---

# Best Practice Researcher

Research best practices, patterns, and conventions for a given topic. Produces a structured, actionable summary with cited sources that relates findings back to this project's existing patterns.

This skill is read-only — it does not create or modify any files. Its output is a research report the user can act on.

## Language rule

**ALL output must be in English.** This includes:
- The research summary
- All analysis and recommendations
- Cited source descriptions

This rule is non-negotiable regardless of the user's language.

## Arguments

The user invoked this with: $ARGUMENTS

If no topic was provided, ask the user what they want to research.

## Workflow

### Step 1: Understand the research question

Parse the topic from the arguments. Clarify scope if needed:
- **Broad topic** (e.g., "error handling") — ask whether the user means in source code, tests, CLI output, or all of the above
- **Specific topic** (e.g., "Vitest mocking for fetch calls") — proceed directly
- **Implementation-oriented** (e.g., "how to add SPDX SBOM export") — research the standard/spec, then look at how similar projects implement it

Formulate 2-3 specific search queries that will yield authoritative results.

### Step 2: Search external sources

Search the web for authoritative guidance. Prioritize sources in this order:

1. **Official documentation** — the library/tool/spec's own docs (e.g., vitest.dev, nodejs.org, spdx.dev)
2. **Widely-cited guides** — established community references (e.g., goldbergyoni/javascript-testing-best-practices, Google style guides, OWASP)
3. **Reputable technical blogs** — posts from recognized experts or organizations, with concrete code examples
4. **GitHub discussions/issues** — real-world problems and solutions from popular repositories

```text
WebSearch: "<specific query>"
WebFetch: "<most relevant result URL>"
```

Aim for 3-5 high-quality sources. Discard results that are:
- Older than 2 years (for fast-moving topics like frameworks, tools)
- From content farms or SEO-optimized filler sites
- Lacking concrete code examples

### Step 3: Search the codebase for existing patterns

Look for how this project already handles the topic (or related topics):

```bash
git log --oneline -20 --all --grep="<topic keyword>"
```

Search source and test files for relevant patterns:
```text
Grep: "<pattern related to topic>"
Glob: "src/**/*<keyword>*"
```

Read the most relevant files to understand the established conventions. Pay attention to:
- How imports are structured
- Error handling patterns
- Configuration approaches
- Test patterns for the area in question

### Step 4: Synthesize findings

Organize findings into three categories:

1. **Community consensus** — practices that multiple authoritative sources agree on. These are safe to follow.
2. **Opinionated preferences** — practices where reasonable people disagree. Note the trade-offs of each approach.
3. **Project-specific conventions** — patterns already established in this codebase that should be followed for consistency, even if they differ from the most common community practice.

Identify any conflicts between external best practices and the project's existing patterns.

### Step 5: Present the research report

Use this exact output format:

```markdown
## Research: <Topic>

### Summary
<2-3 sentence overview of the key finding>

### Sources
1. [<Title>](<URL>) — <1-line description of what this source covers>
2. [<Title>](<URL>) — <1-line description>
3. [<Title>](<URL>) — <1-line description>

### Community Consensus
<Practices that multiple sources agree on. Numbered list with brief explanations.>

1. **<Practice name>** — <explanation>
   - Source: [<name>](<url>)
2. **<Practice name>** — <explanation>
   - Source: [<name>](<url>)

### Opinionated / Debated
<Practices where approaches differ. Present trade-offs fairly.>

| Approach | Pros | Cons | Advocated by |
|----------|------|------|-------------|
| ... | ... | ... | [source](url) |

### This Project's Existing Patterns
<What the codebase already does. Reference specific files.>

- **<Pattern>**: found in `<file path>` — <description>
- **<Pattern>**: found in `<file path>` — <description>

### Recommendations
<Actionable recommendations that balance best practices with project consistency.>

1. **<Recommendation>** — <why, and how it fits with the project>
2. **<Recommendation>** — <why>

### Conflicts / Watch-outs
<Tensions between external best practices and project conventions. Omit if none.>
```

## Guidelines

- **Always cite sources**: every claim must link to a URL. If you cannot find a source, explicitly state it is based on general knowledge.
- **Distinguish consensus from opinion**: do not present debated practices as universal truth. Use the table format for contested topics.
- **Stay current**: prefer sources from the last 2 years. Flag older sources as potentially outdated.
- **Be concrete**: include code snippets from sources when they illustrate a point. Abstract advice without examples is not useful.
- **Relate to the project**: every recommendation should explain how it applies to this specific codebase, referencing existing files or patterns.
- **Do not implement**: this skill produces a research report only. Do not create or modify files. If the user wants to implement findings, they should use a separate skill or ask directly.
- **Scope control**: if the topic is too broad, tell the user and suggest sub-topics. Research one focused area well rather than everything superficially.
