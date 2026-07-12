# Cross-Platform Released Surfaces Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Windows, macOS, and Linux execute one release contract for all shipped Tracevane surfaces.

**Architecture:** A small Node orchestrator selects existing commands by gate level and platform. GitHub Actions runs the quick gate on three native OS runners; platform live and external-service smokes remain explicit.

**Tech Stack:** Node.js, npm scripts, node:test, GitHub Actions.

## Global Constraints

- Reuse existing tests/smokes; do not create a second test framework.
- Quick CI must not require external account credentials or paid model calls.
- Missing optional tools may degrade only where the product also degrades; discovered shells and required core services must pass.

---

### Task 1: Gate manifest and dry-run contract

**Files:**
- Create: `scripts/cross-platform-release-gate.mjs`
- Test: `tests/system/cross-platform-release-gate.test.mjs`
- Modify: `package.json`

- [ ] Add a failing test importing the manifest and asserting Windows/macOS/Linux cover build, supervisor, gateway, channel, files, terminal, and IDE categories without shell syntax.
- [ ] Implement `--quick`, `--full`, `--dry-run`, sequential command execution, fail-fast output, and platform validation using `spawn(process.execPath, ...)`/npm executable resolution already used by project scripts.
- [ ] Add `release:cross-platform:quick`, `release:cross-platform:quick:dry`, and `release:cross-platform:full` scripts.
- [ ] Run the manifest test and quick dry-run.

### Task 2: Native OS workflow

**Files:**
- Create: `.github/workflows/cross-platform-release.yml`
- Test: `tests/system/cross-platform-release-workflow.test.mjs`

- [ ] Add a failing static test asserting a matrix of `windows-latest`, `macos-latest`, `ubuntu-latest`, Node 22, `npm ci`, and the quick gate.
- [ ] Add the minimal workflow with concurrency cancellation and no secrets.
- [ ] Run workflow contract test and `git diff --check`.

### Task 3: Windows evidence and platform audit

**Files:**
- Modify: `docs/研究先行开发清单.md`

- [ ] Run the Windows quick gate.
- [ ] Run `smoke:supervisor:windows`, `smoke:model-gateway:protocol-matrix`, Channel focused tests, `smoke:ide:terminal-manager`, and `ide:rc:quick:dry`.
- [ ] Record exact Windows evidence and leave macOS/Linux status pending CI rather than claiming local success.
- [ ] Run final typecheck/build/system regression and code review before merge.
