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

1. Minimum supported workflows are stable:
   - npm `analyze` and `review` for `package.json`, including supported npm lockfiles for pinned versions
   - Python `analyze` for `requirements.txt`, `pyproject.toml`, `poetry.lock`, `pdm.lock`, and `uv.lock`
   - Python `review` for `requirements.txt` and `pyproject.toml`, with Python lockfiles used only to pin direct dependency versions
   - the GitHub Action documents and supports the same manifest-first review contract as the CLI
2. Compatibility guarantees for `1.x` are explicit:
   - documented CLI flags and GitHub Action inputs are treated as stable within `1.x`
   - JSON output keys and the meaning of existing fields are treated as a compatibility surface
   - PR review comments may gain additive detail, but the summary, risk level, and primary change sections remain stable
   - best-effort resolution, skipped inputs, unavailable registries, and degraded cache behavior are surfaced explicitly instead of failing silently
3. Documentation and operations are release-grade:
   - `README.md`, `ROADMAP.md`, and `action.yml` examples agree on supported workflows and constraints
   - private registry authentication versus intentional exclusion is documented for both CLI and Action usage
   - release notes call out user-visible changes to CLI behavior, JSON output, and PR comment structure
4. Validation is broad enough:
   - regression coverage exists for npm and Python `analyze` and `review` flows
   - parser fixtures cover realistic `package.json`, `requirements.txt`, `pyproject.toml`, and supported lockfile layouts
   - PR comment rendering and output-format tests cover the documented compatibility surface
   - the default `pnpm build`, `pnpm lint`, and `pnpm test` workflow is green before a `1.0` release candidate

## 1.0 graduation checklist

- [ ] Supported workflow matrix is documented and matches shipped behavior
- [ ] CLI flags, Action inputs, and JSON fields intended for `1.x` stability are called out in docs
- [ ] npm and Python review output use the same contract for risk summaries, notes, and unsupported-case messaging
- [ ] private registry and degraded-cache behavior are documented and covered by regression tests
- [ ] release automation and release notes are ready to communicate breaking changes before `1.0`

## Post-1.0 candidates

- standalone Python lockfile review inputs, if the product contract expands beyond manifest-first review
- deeper ecosystem parity work that is helpful but not required for the initial `1.0` guarantee
- additional registries, SBOM/reporting formats, and supply-chain checks beyond the documented `1.0` scope
