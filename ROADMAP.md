# aminet Roadmap

## Current release shape

### 0.3.x

- Python manifest review support for `requirements.txt` and `pyproject.toml`
- clearer best-effort and marker-skipped messaging across analyze and review output
- stronger parser coverage for real-world `pyproject.toml` layouts
- better private registry guidance in `init`, README, and the GitHub Action
- clearer degraded-mode behavior when the persistent cache is unavailable

### 0.4.x

- analyze support for `poetry.lock`, `pdm.lock`, and `uv.lock`
- broader output consistency across npm and PyPI workflows
- tighter semantics around Python lockfile-backed version pinning

## Python lockfile support strategy

- `requirements.txt` and `pyproject.toml` are the primary review inputs for Python projects.
- `poetry.lock`, `pdm.lock`, and `uv.lock` are supported for `analyze`.
- When a `pyproject.toml` review has an adjacent or explicit Python lockfile, aminet uses it to pin direct dependency versions where possible.
- Python lockfiles are not first-class `review` inputs yet; the review contract remains manifest-first so the changed direct dependencies are explicit in the PR diff.

## 1.0 release criteria

aminet should not be considered `1.0` until all of the following are true:

1. Core workflows are stable:
   - npm `analyze` and `review`
   - Python `analyze` for manifests and supported lockfiles
   - Python `review` for `requirements.txt` and `pyproject.toml`
2. Output contracts are stable:
   - JSON shape is treated as a compatibility surface
   - review comment sections and key fields are consistent across npm and PyPI
   - unsupported and best-effort cases are called out explicitly instead of failing silently
3. Operational behavior is stable:
   - private registry authentication and skip-pattern guidance is documented
   - degraded cache mode is understandable and non-fatal for analyze/review
   - release notes and action examples stay aligned with shipped behavior
4. Validation is broad enough:
   - regression coverage exists for npm and Python review flows
   - parser fixtures cover realistic `pyproject.toml` and lockfile layouts
   - the default `pnpm build`, `pnpm lint`, and `pnpm test` workflow is green before release
