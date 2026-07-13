# Cross-Platform Dev Smoke Tooling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Bash, Linux-path, and external `with_server.py` requirements from Tracevane’s common development and browser-smoke entrypoints on Windows, macOS, and Linux.

**Architecture:** Replace shell orchestration with small Node runners that own child processes, wait on HTTP readiness, forward environment through spawn options, and clean up process trees using the already introduced cross-platform process helpers. Keep individual Playwright smoke files unchanged and migrate npm aliases mechanically to one composable runner.

**Tech Stack:** Node.js 22+, npm workspaces, Vite, Playwright, Node test runner.

## Global Constraints

- Do not change application behavior or smoke assertions in this sub-project.
- Do not require Bash, WSL, `/home/...`, `setsid`, `curl`, `lsof`, `fuser`, or an external Python helper.
- Preserve existing default ports and per-script port isolation.
- Always clean up owned API/Vite children on success, failure, Ctrl+C, and timeout.
- Never kill an unowned process merely because it occupies a port.
- Preserve unrelated package.json changes in the dirty worktree.

---

### Task 1: Build a reusable Node server harness

**Files:**
- Create: `scripts/lib/with-server.mjs`
- Create: `tests/system/with-server-script.test.mjs`

**Interfaces:**
- Produces: `withServer(options, callback)`, `waitForHttp(url, options)`, and `stopOwnedProcess(child)`.

- [ ] **Step 1: Write failing lifecycle tests**

```js
test("withServer starts, waits, invokes, and cleans up", async () => {
  let called = false;
  await withServer({ command: process.execPath, args: [fixtureServer], url, timeoutMs: 5_000 }, async () => {
    called = true;
    assert.equal((await fetch(url)).status, 200);
  });
  assert.equal(called, true);
  await assert.rejects(fetch(url));
});
```

- [ ] **Step 2: Run and confirm the module is missing**

Run: `node --test tests/system/with-server-script.test.mjs`

Expected: FAIL.

- [ ] **Step 3: Implement direct process ownership**

```js
export async function withServer({ command, args, cwd, env, url, timeoutMs }, callback) {
  const child = spawn(command, args, { cwd, env: { ...process.env, ...env }, stdio: "inherit", windowsHide: true });
  try {
    await waitForHttp(url, { timeoutMs });
    return await callback();
  } finally {
    await stopOwnedProcess(child);
  }
}
```

Windows cleanup uses `taskkill /PID <ownedPid> /T /F`; POSIX cleanup signals the owned group. No port-owner discovery is allowed.

- [ ] **Step 4: Run the harness test**

Run: `node --test tests/system/with-server-script.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/lib/with-server.mjs tests/system/with-server-script.test.mjs
git commit -m "test(tooling): add cross-platform server harness"
```

### Task 2: Replace the Vite smoke shell scripts

**Files:**
- Create: `scripts/dev-web-smoke.mjs`
- Create: `scripts/dev-web-smoke-external-api.mjs`
- Delete: `scripts/dev-web-smoke.sh`
- Delete: `scripts/dev-web-smoke-external-api.sh`
- Modify: `package.json`
- Create: `tests/system/dev-web-smoke-script.test.mjs`

- [ ] **Step 1: Write source-contract tests**

```js
assert.doesNotMatch(read("package.json"), /bash scripts\/dev-web-smoke/);
assert.match(read("scripts/dev-web-smoke.mjs"), /TRACEVANE_VITE_CACHE_DIR/);
assert.match(read("scripts/dev-web-smoke-external-api.mjs"), /start-standalone-api\.mjs/);
```

- [ ] **Step 2: Run and observe failure**

Run: `node --test tests/system/dev-web-smoke-script.test.mjs`

Expected: FAIL while package scripts still reference Bash.

- [ ] **Step 3: Port cache cleanup and process startup to Node**

Use `fs.rmSync`, `fs.readdirSync`, direct `process.execPath` invocation of Vite’s JavaScript CLI, the shared HTTP wait, and owned process cleanup. Preserve `TRACEVANE_SMOKE_DISABLE_WATCH`, `TRACEVANE_SMOKE_SKIP_OPTIMIZE`, and `TRACEVANE_SMOKE_FORCE_OPTIMIZE` semantics.

- [ ] **Step 4: Run focused checks**

Run: `node --test tests/system/dev-web-smoke-script.test.mjs`

Expected: PASS.

Run: `npm run dev:web:smoke`

Expected: Vite becomes ready on the requested port without Bash.

- [ ] **Step 5: Commit**

```bash
git add scripts/dev-web-smoke.mjs scripts/dev-web-smoke-external-api.mjs scripts/dev-web-smoke.sh scripts/dev-web-smoke-external-api.sh package.json tests/system/dev-web-smoke-script.test.mjs
git commit -m "test(tooling): port Vite smoke launchers to Node"
```

### Task 3: Add a composable browser-smoke runner

**Files:**
- Create: `scripts/run-browser-smoke.mjs`
- Create: `tests/system/run-browser-smoke-script.test.mjs`

**Interfaces:**
- CLI: `node scripts/run-browser-smoke.mjs --web-port 5176 [--api-port 3894] [--external-api] -- <test command...>`.

- [ ] **Step 1: Write argument and cleanup tests**

Test default ports, explicit ports, `--external-api`, child exit propagation, readiness timeout, and cleanup after a failing smoke command.

- [ ] **Step 2: Run and confirm failure**

Run: `node --test tests/system/run-browser-smoke-script.test.mjs`

Expected: FAIL because the runner is absent.

- [ ] **Step 3: Implement the exact CLI boundary**

```js
const options = parseArgs({ options: {
  "web-port": { type: "string", default: "5176" },
  "api-port": { type: "string" },
  "external-api": { type: "boolean", default: false },
}, allowPositionals: true });
```

Reject missing post-`--` commands, non-numeric ports, port collisions, and unknown options with exit code 2.

- [ ] **Step 4: Run tests**

Run: `node --test tests/system/run-browser-smoke-script.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/run-browser-smoke.mjs tests/system/run-browser-smoke-script.test.mjs
git commit -m "test(tooling): add composable browser smoke runner"
```

### Task 4: Migrate package smoke aliases mechanically

**Files:**
- Modify: `package.json`
- Modify: `tests/system/run-browser-smoke-script.test.mjs`

- [ ] **Step 1: Add a failing forbidden-pattern audit**

```js
for (const pattern of [/python \/home\//, /exec bash scripts\//, /\$\{TRACEVANE_.*:-/, /^TRACEVANE_.*=/m]) {
  assert.doesNotMatch(JSON.stringify(pkg.scripts), pattern);
}
```

- [ ] **Step 2: Run and confirm current Linux-only aliases fail**

Run: `node --test tests/system/run-browser-smoke-script.test.mjs`

Expected: FAIL with the current `/home/binbin/.agents/.../with_server.py` aliases.

- [ ] **Step 3: Replace each browser smoke alias**

Example conversion:

```json
"smoke:file-manager:online-editor": "node scripts/run-browser-smoke.mjs --web-port 5176 -- node tests/file-manager/file-manager-online-editor.smoke.mjs",
"smoke:ide:lsp-diagnostics": "node scripts/run-browser-smoke.mjs --external-api --api-port 3894 --web-port 5194 -- node tests/ide-workbench/ide-lsp-diagnostics.smoke.mjs"
```

Preserve every current test file and unique port. Do not consolidate or rename public npm aliases in this task.

- [ ] **Step 4: Run the audit and representative smokes**

```bash
node --test tests/system/run-browser-smoke-script.test.mjs
npm run smoke:file-manager:online-editor
npm run smoke:ide:workbench-layout
npm run smoke:ide:lsp-diagnostics
```

Expected: all PASS on native Windows; no Bash or Python helper process starts.

- [ ] **Step 5: Commit**

```bash
git add package.json tests/system/run-browser-smoke-script.test.mjs
git commit -m "test(tooling): make browser smoke aliases cross-platform"
```

### Task 5: Final platform audit and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/研究先行开发清单.md`
- Modify: `package.json`

- [ ] **Step 1: Audit remaining common scripts**

Run:

```bash
rg -n "bash |setsid|tmux|pgrep|lsof|fuser|/home/|\$\{TRACEVANE_.*:-" package.json scripts
```

Expected: only explicitly documented platform-specific release/maintenance scripts remain; no `dev:*`, `test:*`, `smoke:file-manager:*`, or `smoke:ide:*` alias depends on them.

- [ ] **Step 2: Document native commands and environment syntax**

Document `npm ci`, `npm run dev:restart`, port overrides for PowerShell and POSIX shells, platform-specific `node_modules`, and the Node smoke runner.

- [ ] **Step 3: Run final tooling verification**

```bash
node --test tests/system/with-server-script.test.mjs tests/system/dev-web-smoke-script.test.mjs tests/system/run-browser-smoke-script.test.mjs
npm run typecheck
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/研究先行开发清单.md package.json
git commit -m "docs(tooling): document native three-OS workflow"
```

---

## Test Point Summary

- Server readiness success, timeout, early exit, and callback failure.
- Owned process-tree cleanup on Windows and POSIX.
- No killing unrelated port owners.
- Vite optimize-cache cleanup and timestamp cleanup remain deterministic.
- External API proxy mode preserves API/web port pairing.
- Every current browser-smoke npm alias preserves its test file and port.
- No `/home` path, Bash invocation, POSIX inline environment assignment, or shell parameter expansion remains in common aliases.
- Representative File Manager, IDE, LSP external API, and responsive smokes pass on native Windows; macOS/Linux run the same commands unchanged.

## Self-Review

- Spec coverage: dev startup, Vite smoke, external API smoke, package aliases, port isolation, cleanup, documentation, and three-OS invocation are assigned.
- Placeholder scan: no TBD/TODO/follow-up placeholders remain.
- Type consistency: all runners consume the same `withServer`, `waitForHttp`, and `stopOwnedProcess` exports defined in Task 1.

