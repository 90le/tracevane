# Linux Daemon systemd Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make all three Tracevane Linux user daemons generate valid systemd units and allow malformed inactive units to be uninstalled, then publish v0.2.2.

**Architecture:** Fix the shared supervisor template and uninstall command selection used by model-gateway, channel-connectors, and openclaw-recovery. Keep daemon-specific code unchanged; prove the behavior in the existing supervisor tests and with Ubuntu 24.04 `systemd-analyze verify`.

**Tech Stack:** TypeScript, Node.js test runner, systemd user units, Bash release tooling, Git/GitHub CLI.

## Global Constraints

- Fix all three daemons through their shared supervisor implementation.
- Preserve safe uninstall ordering: disable, unlink unit, then daemon-reload.
- Add no dependency or new abstraction beyond the shared escaping helper.
- Publish patch version `0.2.2`, tag `v0.2.2`, and update all generated release metadata/assets.

---

### Task 1: Reproduce invalid unit generation and broken uninstall

**Files:**
- Modify: `tests/system/supervisor-platform-plans.test.mjs`
- Modify: `tests/system/supervisor-service-manager.test.mjs`

**Interfaces:**
- Consumes: `createSupervisorPlan(definition, "linux", homeDir)`
- Produces: regression coverage for valid `WorkingDirectory=` and inactive malformed-unit uninstall

- [x] **Step 1: Add a failing template assertion**

Assert that the Linux template contains an unquoted absolute working directory:

```js
assert.match(
  plan.template,
  /^WorkingDirectory=\/opt\/\$\{NAME\}\/项目 %% workers$/m,
);
assert.doesNotMatch(plan.template, /^WorkingDirectory="/m);
```

- [x] **Step 2: Verify the template test fails**

Run:

```bash
npm run build:api
node --test --test-name-pattern="systemd plans preserve" tests/system/supervisor-platform-plans.test.mjs
```

Expected: FAIL because the current line starts with `WorkingDirectory="`.

- [x] **Step 3: Add a failing uninstall regression**

Create an installed Linux fixture whose status is `inactive`/`enabled`; make `systemctl stop` fail if invoked, then assert uninstall succeeds, never invokes stop, disables the unit, unlinks it, and reloads systemd.

- [x] **Step 4: Verify the uninstall test fails**

Run:

```bash
node --test --test-name-pattern="inactive malformed systemd unit" tests/system/supervisor-service-manager.test.mjs
```

Expected: FAIL because uninstall currently calls `systemctl --user stop` even when status proved the unit inactive.

### Task 2: Apply the shared minimal fix

**Files:**
- Modify: `apps/api/modules/supervisor/platform-plans.ts`
- Modify: `apps/api/modules/supervisor/service-manager.ts`

**Interfaces:**
- Consumes: all three daemon `ServiceDefinition` values
- Produces: one valid Linux systemd template path and one safe inactive-unit uninstall path

- [x] **Step 1: Render `WorkingDirectory` as a setting value, not an Exec token**

Factor the existing systemd escaping body into an unquoted value helper. Keep quotes for `Description` and `ExecStart`, but emit:

```ts
`WorkingDirectory=${escapeSystemdValue(definition.workingDirectory)}`
```

- [x] **Step 2: Skip the unnecessary stop command for a proven inactive systemd unit**

Pass the inspected active state into `uninstallCommands` and omit `plan.commands.stop` only when `plan.supervisor === "systemd-user"` and `active === false`.

- [x] **Step 3: Verify targeted tests pass**

Run:

```bash
npm run build:api
node --test tests/system/supervisor-platform-plans.test.mjs tests/system/supervisor-service-manager.test.mjs
```

Expected: PASS.

- [x] **Step 4: Validate with the native Linux parser**

Generate the corrected fixture unit and run Ubuntu 24.04:

```bash
systemd-analyze verify tracevane-fixture.service
```

Expected: exit 0 with no Tracevane unit error.

### Task 3: Verify the three shared consumers and release gate

**Files:**
- Modify: `tests/system/supervisor-service-manager.test.mjs`
- Modify: `tests/system/model-gateway-protocol-matrix-smoke-script.test.mjs`

**Interfaces:**
- Consumes: shared supervisor implementation
- Produces: cross-daemon and build evidence

- [x] **Step 0: Remove the pre-existing cross-platform fixture blocker**

Make the Win32 atomic-write assertions host-independent by checking the
recorded temporary path directly. Include child stdout/stderr in protocol
matrix test failures so GitHub Actions reports the actual child-stage error.

- [ ] **Step 1: Run supervisor and three-daemon contract coverage**

```bash
npm run test:supervisor
node --test tests/system/supervisor-contract.test.mjs
```

Expected: all Linux/shared supervisor tests pass; any pre-existing unrelated platform failure is reported separately.

- [x] **Step 2: Run typechecks and build**

```bash
npm run typecheck
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit the fix**

```bash
git add apps/api/modules/supervisor/platform-plans.ts apps/api/modules/supervisor/service-manager.ts tests/system/supervisor-platform-plans.test.mjs tests/system/supervisor-service-manager.test.mjs docs/superpowers/plans/2026-07-23-linux-daemon-systemd-fix.md
git commit -m "fix: generate valid Linux daemon units"
```

### Task 4: Build and publish v0.2.2

**Files:**
- Modify/generated: version sources listed by `pack.sh`
- Create/generated: `release/tracevane-0.2.2/`
- Create/generated: `release/tracevane-0.2.2.tar.gz`
- Modify/generated: `release/version.json`, `release/tracevane-version.json`, `release/tracevane-latest.json`, `release/SHA256SUMS`

**Interfaces:**
- Consumes: verified source tree at version `0.2.1`
- Produces: source/repository version `0.2.2`, tag `v0.2.2`, GitHub Release assets

- [ ] **Step 1: Build the official patch release**

```bash
./pack.sh 0.2.2
```

Expected: API/web builds pass and `release/tracevane-0.2.2.tar.gz` is created.

- [ ] **Step 2: Verify generated versions, checksum, archive, and release gate**

```bash
npm run release:cross-platform:quick
sha256sum -c release/SHA256SUMS
tar -tzf release/tracevane-0.2.2.tar.gz
```

Expected: all checks pass and archive paths start with `tracevane-0.2.2/`.

- [ ] **Step 3: Commit release artifacts**

```bash
git add package.json package-lock.json apps/api/package.json apps/api/config.ts apps/web/package.json apps/web/vite.config.ts openclaw.plugin.json index.html install-tracevane.sh release
git commit -m "release: v0.2.2"
```

- [ ] **Step 4: Merge, tag, and push**

Fast-forward `codex/fix-linux-daemons` into updated `main`, rerun the targeted checks on `main`, create annotated tag `v0.2.2`, and push `main` plus the tag.

- [ ] **Step 5: Create GitHub Release and monitor CI**

Upload `tracevane-0.2.2.tar.gz`, `install-tracevane.sh`,
`SHA256SUMS`, `tracevane-latest.json`, and `tracevane-version.json` to a
non-draft GitHub Release titled `Tracevane v0.2.2`. Wait for the pushed
commit's cross-platform workflow and Pages deployment to finish, then verify
repository/release/tag versions all report `0.2.2`.
