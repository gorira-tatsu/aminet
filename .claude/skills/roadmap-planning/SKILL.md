---
name: roadmap-planning
description: Plan long-term milestones and version roadmaps from the current state of issues, pull requests, release history, and project goals. Use this skill when the user says "/roadmap-planning", asks to "plan the next milestone", "decide what goes into the next version", "make a roadmap", "group issues by release", "plan 0.x.y / 1.0", or wants a phased release plan across multiple future versions.
argument-hint: "[target version or horizon] — e.g. '0.3.x', 'next 3 releases', 'toward 1.0'"
allowed-tools: [Read, Glob, Grep, Bash(gh issue:*), Bash(gh pr:*), Bash(git log:*), Bash(git diff:*), Bash(git status:*), Bash(git branch:*), Bash(node:*)]
---

# Roadmap Planner

Build a practical milestone plan from the repository's current state. This skill is read-only. It does not create issues, milestones, or pull requests by itself. It produces a structured plan the user can review, then execute with other skills.

## Arguments

The user invoked this with: $ARGUMENTS

Interpret the argument as one of:
- a specific target version, such as `0.3.0` or `1.0`
- a planning horizon, such as `next 2 releases` or `next quarter`
- empty, meaning "plan the next sensible milestone from the current state"

## Workflow

### Step 1: Clarify the planning frame

Infer the planning frame from the request:
- **Patch release**: stabilize, fix regressions, close high-confidence gaps
- **Minor release**: land a coherent feature theme with supporting fixes
- **Major release / 1.0**: define release criteria, blockers, and de-risking work
- **Long-range roadmap**: split work across multiple versions or phases

If the user did not specify a target, infer one from the unreleased change set and the state of open issues.

### Step 2: Inventory the current state

Collect the current project signals:

```bash
gh issue list --state open --limit 100
gh pr list --state open --limit 100
git log --oneline --decorate -30
git branch --show-current
node -e "console.log(require('./package.json').version)"
```

When useful, inspect individual issues or PRs for details:

```bash
gh issue view <number>
gh pr view <number>
```

Build a short inventory:
- open issues that are clearly actionable
- open PRs that are close to merge
- recently shipped items that change the planning baseline
- known rough edges or recurring failure modes

### Step 3: Group work into themes

Cluster the inventory into release themes. Prefer 3-5 themes, not a long backlog dump.

Typical themes:
- **Core functionality**
- **Quality / test coverage**
- **DX / CLI ergonomics**
- **Release / CI / packaging**
- **Ecosystem support** such as npm vs PyPI

For each theme, identify:
- what user outcome it improves
- whether it is feature work, stabilization, or operational hygiene
- whether it depends on another theme landing first

### Step 4: Decide milestone shape

Turn the themes into a milestone proposal.

Use these heuristics:
- Put **must-fix regressions**, **broken flows**, and **release trust issues** in the nearest milestone
- Put **cohesive follow-on fixes** with the feature they stabilize
- Defer speculative work or broad refactors unless they unblock a clear release goal
- Keep the next milestone small enough to finish with confidence
- For long-range plans, make each future milestone have one clear headline

When targeting a version, classify candidates as:
- **Must have**
- **Should have**
- **Could wait**

### Step 5: Identify sequencing and risks

Call out:
- prerequisite relationships
- work that is high uncertainty
- work that should not share a release because of scope or risk
- release criteria that must be true before cutting that version

Examples:
- "Do not expand Python support further until `pyproject.toml` parsing is trustworthy"
- "Close version/reporting drift before another release"
- "Ship private package support only with a tested token flow"

### Step 6: Present the plan

Use this output format:

```md
## Roadmap Plan: <target or horizon>

### Planning Baseline
- Current version: `<version>`
- Open issues: `<count>`
- Open PRs: `<count>`
- Immediate context: <1-2 sentence summary>

### Proposed Milestones
#### <milestone name>
- Goal: <user-facing goal>
- Include:
  - #<n> <title>
  - #<n> <title>
- Defer:
  - #<n> <title>
- Risks:
  - <risk>

#### <next milestone name>
- Goal: <goal>
- Include:
  - ...

### Cross-Cutting Themes
- <theme>: <why it matters>

### Recommended Next Version
- Suggested version: `<semver>`
- Why: <short rationale>

### Release Criteria
1. <criterion>
2. <criterion>
3. <criterion>

### Suggested Execution Order
1. <step>
2. <step>
3. <step>
```

## Guidelines

- Be opinionated enough to reduce ambiguity, but keep the plan grounded in the actual repo state
- Prefer milestone proposals over raw issue lists
- Keep the next milestone narrow; do not front-load the entire backlog
- Distinguish clearly between work that is **required for confidence** and work that is merely attractive
- If the repo state suggests a hidden problem, say so explicitly
- If the next step should be creating issues, milestones, or PRs, recommend the follow-up skill rather than doing it here
