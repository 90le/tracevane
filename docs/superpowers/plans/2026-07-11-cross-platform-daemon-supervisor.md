# Cross-Platform Daemon Supervisor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Model Gateway, Channel Connectors, and OpenClaw Recovery usable in development sessions and persistently manageable through the current user supervisor on Windows, macOS, and Linux.

**Architecture:** Introduce one thin supervisor core shared by the three existing daemon services. It has a session mode owned by the Tracevane API and a persistent mode backed by Windows Task Scheduler, macOS LaunchAgent, or Linux systemd user units; public APIs expose structured lifecycle state and stable error codes instead of parsing localized command text in the UI.

**Tech Stack:** Node.js 22+, TypeScript, Node child_process/fs/http APIs, Windows `schtasks.exe`, macOS `launchctl`, Linux `systemctl --user`, React 19, TanStack Query, Node test runner.

## Global Constraints

- Support native Windows, macOS, and Linux; WSL is treated as a separate Linux environment.
- Default to current-user services and least privilege; do not require administrator/root privileges.
- Development defaults to session mode and must not silently install persistent OS services.
- Persistent installation must be explicit, idempotent, repairable, and uninstallable.
- Never accept arbitrary command, args, cwd, or environment values from the browser.
- Never persist secrets or proxy credentials in task XML, plist, unit files, process arguments, UI evidence, or logs.
- Preserve the existing daemon entrypoints, ports, runtime files, root guards, and public routes unless a task explicitly extends their response contract.
- Do not add a third-party service-manager dependency; reuse Node and native OS managers.
- Use TDD for every behavior change and preserve unrelated dirty-worktree changes.

---

## File Structure

### New shared supervisor files

- `types/supervisor.ts`: public lifecycle/action/error-code types shared by API and web.
- `apps/api/modules/supervisor/contracts.ts`: internal `ServiceDefinition`, adapter, runner, and session interfaces.
- `apps/api/modules/supervisor/command-runner.ts`: fixed-command execution, timeout handling, output bounding, and stable error classification.
- `apps/api/modules/supervisor/platform-plans.ts`: systemd, launchd, and Task Scheduler template/command generation.
- `apps/api/modules/supervisor/session-supervisor.ts`: API-owned child lifecycle with PID/runtime identity and graceful shutdown.
- `apps/api/modules/supervisor/service-manager.ts`: install/start/stop/restart/status/repair/uninstall orchestration and normalized snapshots.
- `apps/api/modules/supervisor/index.ts`: narrow exports for the three services.

### Existing integration files

- `types/model-gateway.ts`, `types/channel-connectors.ts`, `types/openclaw-recovery.ts`: alias common types and add normalized lifecycle fields without removing existing response fields in the first migration.
- `apps/api/modules/model-gateway/supervisor.ts`, `service.ts`: replace duplicated platform planning and lifecycle execution with the shared manager.
- `apps/api/modules/openclaw-recovery/supervisor.ts`, `supervisor-command.ts`, `service.ts`: migrate to the shared manager.
- `apps/api/modules/channel-connectors/service.ts`: replace the unsupported Windows branch and duplicated systemd/launchd planning.
- `apps/web/src/features/model-gateway/views/DaemonServicePanel.tsx`, `apps/web/src/features/channel-connectors/views/DaemonServicePanel.tsx`, `apps/web/src/features/recovery/views/RecoveryServicePanel.tsx`: state-driven controls and structured errors.
- `docs/研究先行开发清单.md`, `README.md`: external-contract record and supported lifecycle instructions.

### New tests

- `tests/system/supervisor-contract.test.mjs`: public state/action/error-code contract.
- `tests/system/supervisor-platform-plans.test.mjs`: deterministic templates for all three platforms.
- `tests/system/supervisor-command-runner.test.mjs`: exit, timeout, localized output, redaction, and bounded evidence.
- `tests/system/supervisor-session.test.mjs`: session child start/restart/stop/ownership.
- `tests/system/supervisor-windows-live.smoke.mjs`: opt-in real Task Scheduler lifecycle.
- `tests/system/supervisor-macos-live.smoke.mjs`: opt-in real LaunchAgent lifecycle.
- `tests/system/supervisor-linux-live.smoke.mjs`: opt-in real systemd user lifecycle.
- `tests/system/web-daemon-service-panels.test.mjs`: consistent UI state/action rules.

---

### Task 1: Establish the normalized public lifecycle contract

**Files:**
- Create: `types/supervisor.ts`
- Modify: `types/model-gateway.ts`
- Modify: `types/channel-connectors.ts`
- Modify: `types/openclaw-recovery.ts`
- Create: `tests/system/supervisor-contract.test.mjs`

**Interfaces:**
- Produces: `TracevaneSupervisorKind`, `TracevaneServiceMode`, `TracevaneServiceState`, `TracevaneServiceAction`, `TracevaneSupervisorErrorCode`, `TracevaneServiceManagerStatus`.
- Existing feature-specific types remain exported as aliases or extensions so current clients continue to compile.

- [ ] **Step 1: Write the failing contract test**

```js
test("all daemon domains expose the normalized supervisor contract", () => {
  const source = read("types/supervisor.ts");
  assert.match(source, /"session" \| "persistent"/);
  assert.match(source, /"not-installed"/);
  assert.match(source, /"stale-config"/);
  assert.match(source, /"task-not-found"/);
  assert.match(source, /"permission-denied"/);
  for (const file of ["types/model-gateway.ts", "types/channel-connectors.ts", "types/openclaw-recovery.ts"]) {
    assert.match(read(file), /TracevaneServiceManagerStatus/);
  }
});
```

- [ ] **Step 2: Run the test and verify the missing contract fails**

Run: `node --test tests/system/supervisor-contract.test.mjs`

Expected: FAIL because `types/supervisor.ts` does not exist.

- [ ] **Step 3: Add the exact common contract**

```ts
export type TracevaneSupervisorKind = "systemd-user" | "launchd-user" | "scheduled-task" | "session" | "none" | "unknown";
export type TracevaneServiceMode = "session" | "persistent";
export type TracevaneServiceState = "not-installed" | "stopped" | "starting" | "running" | "degraded" | "failed" | "stale-config" | "unknown";
export type TracevaneServiceAction = "preview" | "install" | "ensure-running" | "start" | "stop" | "restart" | "repair" | "uninstall" | "status";
export type TracevaneSupervisorErrorCode = "task-not-found" | "permission-denied" | "command-not-found" | "command-timeout" | "template-invalid" | "runtime-not-ready" | "stale-config" | "unsupported-platform" | "unknown";

export interface TracevaneServiceManagerStatus {
  mode: TracevaneServiceMode;
  supervisor: TracevaneSupervisorKind;
  installed: boolean;
  enabled: boolean | null;
  active: boolean | null;
  state: TracevaneServiceState;
  configCurrent: boolean;
  checkedAt: string;
  errorCode: TracevaneSupervisorErrorCode | null;
  errorMessage: string | null;
}
```

- [ ] **Step 4: Alias or extend the common contract in all three domains**

```ts
import type { TracevaneServiceManagerStatus, TracevaneSupervisorKind } from "./supervisor.js";

export type ModelGatewaySupervisorKind = TracevaneSupervisorKind;
export interface ModelGatewayDaemonServiceManagerStatus extends TracevaneServiceManagerStatus {
  checked: boolean;
  reachable: boolean | null;
  lastError: string | null;
}
```

Apply the same extension pattern to Channel Connectors and add `manager: TracevaneServiceManagerStatus` to the recovery snapshot while retaining its current flat fields during migration.

- [ ] **Step 5: Run type and contract checks**

Run: `npm run typecheck`

Expected: PASS.

Run: `node --test tests/system/supervisor-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the contract**

```bash
git add types/supervisor.ts types/model-gateway.ts types/channel-connectors.ts types/openclaw-recovery.ts tests/system/supervisor-contract.test.mjs
git commit -m "feat(supervisor): define shared lifecycle contract"
```

### Task 2: Generate deterministic platform plans

**Files:**
- Create: `apps/api/modules/supervisor/contracts.ts`
- Create: `apps/api/modules/supervisor/platform-plans.ts`
- Create: `apps/api/modules/supervisor/index.ts`
- Create: `tests/system/supervisor-platform-plans.test.mjs`

**Interfaces:**
- Consumes: Task 1 common enums.
- Produces: `createSupervisorPlan(definition, platform, homeDir)` and `ServiceDefinition`.

- [ ] **Step 1: Write failing plan tests for Linux, macOS, and Windows**

```js
test("platform plans are user-scoped and pass config as an argument", () => {
  const definition = fixtureDefinition("C:/Trace vane/项目");
  const windows = createSupervisorPlan(definition, "win32", "C:/Users/Test User");
  assert.equal(windows.supervisor, "scheduled-task");
  assert.match(windows.template, /<LogonTrigger>/);
  assert.match(windows.template, /<RestartOnFailure>/);
  assert.match(windows.template, /--config/);
  assert.doesNotMatch(windows.template, /OPENCLAW_STATE_DIR=/);
  assert.doesNotMatch(windows.template, /HTTP_PROXY|HTTPS_PROXY/);

  const mac = createSupervisorPlan(definition, "darwin", "/Users/test");
  assert.match(mac.template, /<key>KeepAlive<\/key>/);
  assert.match(mac.template, /<key>RunAtLoad<\/key>/);

  const linux = createSupervisorPlan(definition, "linux", "/home/test");
  assert.match(linux.template, /^Restart=on-failure$/m);
  assert.match(linux.template, /^WantedBy=default\.target$/m);
});
```

- [ ] **Step 2: Run and observe the missing module failure**

Run: `npm run build:api && node --test tests/system/supervisor-platform-plans.test.mjs`

Expected: FAIL because the shared supervisor plan module is absent.

- [ ] **Step 3: Define the internal service boundary**

```ts
export interface ServiceDefinition {
  id: "model-gateway" | "channel-connectors" | "openclaw-recovery";
  displayName: string;
  serviceName: string;
  windowsTaskName: string;
  launchdLabel: string;
  entryPath: string;
  workingDirectory: string;
  configPath: string;
  runtimePath: string;
  logPath: string;
  healthUrl: string;
  args: string[];
}

export interface SupervisorPlan {
  platform: NodeJS.Platform;
  supervisor: TracevaneSupervisorKind;
  serviceName: string;
  configPath: string;
  template: string;
  commands: Partial<Record<TracevaneServiceAction, SupervisorCommand[]>>;
  fingerprint: string;
}
```

- [ ] **Step 4: Implement plan generation with tokenized arguments**

Windows must execute `process.execPath` with arguments `[entryPath, ...args, "--config", configPath]`, use `InteractiveToken` and `LeastPrivilege`, and include `AllowStartOnDemand`, `RestartOnFailure`, `ExecutionTimeLimit=PT0S`, `StartWhenAvailable`, and battery-safe settings. macOS must use a `ProgramArguments` array. Linux must quote unit values without invoking a shell.

- [ ] **Step 5: Verify paths with spaces and CJK**

Run: `npm run build:api && node --test tests/system/supervisor-platform-plans.test.mjs`

Expected: PASS with no lossy path transformation.

- [ ] **Step 6: Commit platform planning**

```bash
git add apps/api/modules/supervisor tests/system/supervisor-platform-plans.test.mjs
git commit -m "feat(supervisor): generate user service plans"
```

### Task 3: Execute native commands with structured errors

**Files:**
- Create: `apps/api/modules/supervisor/command-runner.ts`
- Create: `tests/system/supervisor-command-runner.test.mjs`

**Interfaces:**
- Produces: `runSupervisorCommand(command, options)` and `classifySupervisorFailure(result)`.
- Output is bounded to 16 KiB per stream and contains `errorCode`; raw localized output is diagnostic-only.

- [ ] **Step 1: Write failing tests for timeout, missing command, task absence, and redaction**

```js
test("runner classifies Windows task absence without parsing localized text", async () => {
  const result = await runSupervisorCommand(
    { label: "Query task", command: process.execPath, args: [fixtureExitScript, "1", "任務不存在"] },
    { timeoutMs: 2_000, platform: "win32", action: "status", redact: ["secret-value"] },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, "task-not-found");
  assert.equal(result.stderr.includes("�"), false);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run build:api && node --test tests/system/supervisor-command-runner.test.mjs`

Expected: FAIL because the runner does not exist.

- [ ] **Step 3: Implement direct spawn, bounded buffers, timeout, and error codes**

```ts
export interface SupervisorCommandResult extends SupervisorCommand {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  errorCode: TracevaneSupervisorErrorCode | null;
  errorMessage: string | null;
  durationMs: number;
}

export async function runSupervisorCommand(
  command: SupervisorCommand,
  options: { timeoutMs: number; platform: NodeJS.Platform; action: TracevaneServiceAction; redact?: string[] },
): Promise<SupervisorCommandResult>;
```

On Windows, task existence is determined by the query exit code and requested task identity, not by searching localized stdout for English words. Return stable messages such as `Scheduled task is not installed.`; retain decoded raw output only after replacement-character-safe decoding and redaction.

- [ ] **Step 4: Run runner tests**

Run: `npm run build:api && node --test tests/system/supervisor-command-runner.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit command execution**

```bash
git add apps/api/modules/supervisor/command-runner.ts tests/system/supervisor-command-runner.test.mjs
git commit -m "fix(supervisor): normalize native command failures"
```

### Task 4: Add API-owned session supervision

**Files:**
- Create: `apps/api/modules/supervisor/session-supervisor.ts`
- Create: `tests/system/supervisor-session.test.mjs`
- Modify: `scripts/start-standalone-api.mjs`

**Interfaces:**
- Produces: `SessionSupervisor.start`, `.status`, `.stop`, `.dispose`.
- A session child is never detached and must exit with the owning API process.

- [ ] **Step 1: Write failing lifecycle tests**

```js
test("session supervisor owns one child and stops it gracefully", async () => {
  const supervisor = createSessionSupervisor({ restartDelayMs: 25 });
  const first = await supervisor.start(fixtureDefinition(root));
  const second = await supervisor.start(fixtureDefinition(root));
  assert.equal(second.pid, first.pid);
  assert.equal((await supervisor.status("model-gateway")).state, "running");
  await supervisor.stop("model-gateway");
  assert.equal((await supervisor.status("model-gateway")).state, "stopped");
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm run build:api && node --test tests/system/supervisor-session.test.mjs`

Expected: FAIL because session supervision is absent.

- [ ] **Step 3: Implement ownership and restart limits**

```ts
export interface SessionSupervisor {
  start(definition: ServiceDefinition): Promise<TracevaneServiceManagerStatus>;
  status(serviceId: ServiceDefinition["id"]): Promise<TracevaneServiceManagerStatus>;
  stop(serviceId: ServiceDefinition["id"]): Promise<TracevaneServiceManagerStatus>;
  dispose(): Promise<void>;
}
```

Use direct `spawn(process.execPath, [entryPath, ...args])`, bounded restart backoff, a single child per service ID, graceful `SIGTERM`, Windows tree termination only for the owned PID, and exit hooks in `start-standalone-api.mjs`.

- [ ] **Step 4: Verify lifecycle and leaked-process cleanup**

Run: `npm run build:api && node --test tests/system/supervisor-session.test.mjs`

Expected: PASS and no fixture child remains after the test.

- [ ] **Step 5: Commit session mode**

```bash
git add apps/api/modules/supervisor/session-supervisor.ts scripts/start-standalone-api.mjs tests/system/supervisor-session.test.mjs
git commit -m "feat(supervisor): add development session lifecycle"
```

### Task 5: Orchestrate persistent lifecycle and safe mode transitions

**Files:**
- Create: `apps/api/modules/supervisor/service-manager.ts`
- Create: `tests/system/supervisor-service-manager.test.mjs`

**Interfaces:**
- Consumes: Tasks 2-4.
- Produces: `createServiceManager(dependencies)` and `manage(definition, request)`.

- [ ] **Step 1: Write failing orchestration tests**

Cover these exact transitions:

```text
not installed + status       -> session status, no filesystem writes
not installed + start/session -> one API-owned child
not installed + restart/persistent -> errorCode task-not-found, no /End call
not installed + install      -> write current template, register, start, health-check
stale template + repair      -> replace template, restart, health-check
session running + install    -> stop session, install persistent, start once
persistent running + uninstall -> stop, unregister, remove template, return session-ready
```

- [ ] **Step 2: Run and verify transition failures**

Run: `npm run build:api && node --test tests/system/supervisor-service-manager.test.mjs`

Expected: FAIL because orchestration is absent.

- [ ] **Step 3: Implement the manager request boundary**

```ts
export interface ManageServiceRequest {
  action: TracevaneServiceAction;
  mode: TracevaneServiceMode;
  apply: boolean;
}

export interface ManageServiceResponse {
  ok: boolean;
  action: TracevaneServiceAction;
  manager: TracevaneServiceManagerStatus;
  commands: SupervisorCommandResult[];
  templateWritten: boolean;
  configCurrent: boolean;
}
```

Never auto-install during `status`, page load, or session start. Persistent `restart` must return `task-not-found` when absent; UI will offer install instead. Mode transitions must verify the old owner stopped before starting the new owner.

- [ ] **Step 4: Run orchestration tests**

Run: `npm run build:api && node --test tests/system/supervisor-service-manager.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit orchestration**

```bash
git add apps/api/modules/supervisor/service-manager.ts tests/system/supervisor-service-manager.test.mjs
git commit -m "feat(supervisor): orchestrate session and persistent modes"
```

### Task 6: Migrate Model Gateway

**Files:**
- Modify: `apps/api/modules/model-gateway/supervisor.ts`
- Modify: `apps/api/modules/model-gateway/service.ts`
- Modify: `apps/api/model-gateway-daemon.ts`
- Modify: `tests/system/model-gateway-service.test.mjs`

**Interfaces:**
- Model Gateway keeps `/api/model-gateway/daemon-service`.
- Request adds optional `mode`; response adds normalized `manager` fields while retaining current fields for compatibility.

- [ ] **Step 1: Add failing Windows/session regression tests**

```js
test("model gateway uses session mode when persistent service is absent", async () => {
  const result = await service.manageDaemonService(undefined, { action: "start", mode: "session", apply: true });
  assert.equal(result.serviceManager.mode, "session");
  assert.equal(result.serviceManager.state, "running");
  assert.equal(result.commandsRun.length, 0);
});

test("model gateway persistent restart does not run a missing Windows task", async () => {
  const result = await service.manageDaemonService(undefined, { action: "restart", mode: "persistent", apply: true });
  assert.equal(result.serviceManager.errorCode, "task-not-found");
  assert.equal(calls.some((call) => call.args.includes("/End")), false);
});
```

- [ ] **Step 2: Run targeted tests and observe failure**

Run: `npm run build:api && node --test --test-name-pattern "model gateway.*(session|Windows|persistent)" tests/system/model-gateway-service.test.mjs`

Expected: FAIL on missing mode behavior.

- [ ] **Step 3: Replace duplicated lifecycle logic with a Model Gateway definition**

```ts
function modelGatewayServiceDefinition(config: TracevaneServerConfig): ServiceDefinition {
  const paths = resolveModelGatewayPaths(config);
  return {
    id: "model-gateway",
    displayName: "Tracevane Model Gateway",
    serviceName: MODEL_GATEWAY_DAEMON_SERVICE_NAME,
    windowsTaskName: "TracevaneModelGateway",
    launchdLabel: "dev.openclaw.tracevane.model-gateway",
    entryPath: path.join(config.projectRoot, "dist", "apps", "api", "model-gateway-daemon.js"),
    workingDirectory: config.projectRoot,
    configPath: paths.daemonConfig,
    runtimePath: paths.daemonRuntime,
    logPath: paths.daemonLog,
    healthUrl: "http://127.0.0.1:18796/api/model-gateway/status",
    args: [],
  };
}
```

Remove Windows environment comments from the task template; the daemon must resolve state from its explicit config path.

- [ ] **Step 4: Run the complete Model Gateway service slice**

Run: `npm run build:api && node --test tests/system/model-gateway-service.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Model Gateway migration**

```bash
git add apps/api/modules/model-gateway apps/api/model-gateway-daemon.ts tests/system/model-gateway-service.test.mjs
git commit -m "feat(model-gateway): use cross-platform supervisor"
```

### Task 7: Migrate OpenClaw Recovery

**Files:**
- Modify: `apps/api/modules/openclaw-recovery/supervisor.ts`
- Delete: `apps/api/modules/openclaw-recovery/supervisor-command.ts`
- Modify: `apps/api/modules/openclaw-recovery/service.ts`
- Modify: `apps/api/openclaw-recovery-daemon.ts`
- Modify: `tests/system/openclaw-recovery-contract.test.mjs`
- Modify: `tests/system/openclaw-recovery-daemon.test.mjs`

**Interfaces:**
- Recovery keeps `/api/openclaw-recovery/daemon-service`.
- The response retains `service` and `commands`, adding `service.manager`.

- [ ] **Step 1: Add failing missing-task and session-mode tests**

```js
assert.equal(status.service.installed, false);
assert.equal(status.service.manager.mode, "session");
assert.equal(status.service.manager.state, "running");
assert.equal(restartWithoutInstall.service.manager.errorCode, "task-not-found");
assert.equal(restartWithoutInstall.commands.some((item) => item.args.includes("/End")), false);
```

- [ ] **Step 2: Run the Recovery slice and observe failure**

Run: `npm run build:api && node --test tests/system/openclaw-recovery-contract.test.mjs tests/system/openclaw-recovery-daemon.test.mjs`

Expected: FAIL because Recovery has no common manager/session state.

- [ ] **Step 3: Define and wire the Recovery service**

Use service ID `openclaw-recovery`, Windows task `TracevaneRecovery`, launchd label `dev.openclaw.tracevane.recovery`, existing daemon entry, port `18797`, existing runtime file, and explicit config args. Delete the feature-local command runner only after all calls use `runSupervisorCommand`.

- [ ] **Step 4: Run Recovery tests**

Run: `npm run build:api && node --test tests/system/openclaw-recovery-contract.test.mjs tests/system/openclaw-recovery-daemon.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Recovery migration**

```bash
git add apps/api/modules/openclaw-recovery apps/api/openclaw-recovery-daemon.ts tests/system/openclaw-recovery-contract.test.mjs tests/system/openclaw-recovery-daemon.test.mjs
git commit -m "feat(recovery): use cross-platform supervisor"
```

### Task 8: Migrate Channel Connectors and complete Windows support

**Files:**
- Modify: `apps/api/modules/channel-connectors/service.ts`
- Modify: `apps/api/modules/channel-connectors/daemon.ts`
- Modify: `tests/system/channel-connectors-v3-service.test.mjs`
- Modify: `tests/system/channel-connectors-persistent-live-script.test.mjs`

**Interfaces:**
- Channel Connectors keeps `/api/channel-connectors/daemon/service` and its reload action.
- Persistent lifecycle uses the shared manager; reload remains a domain action sent to the existing management endpoint.

- [ ] **Step 1: Replace the old unsupported assertion with failing Windows plan tests**

```js
test("Channel Connectors exposes a Windows scheduled-task plan", () => {
  const plan = createChannelConnectorsDaemonPlan(config, { platform: "win32", homeDir });
  assert.equal(plan.supported, true);
  assert.equal(plan.supervisor, "scheduled-task");
  assert.match(plan.selectedTemplate.template, /TracevaneChannelConnectors/);
  assert.match(plan.selectedTemplate.template, /--config/);
});
```

- [ ] **Step 2: Run and observe the current unsupported result**

Run: `npm run build:api && node --test tests/system/channel-connectors-v3-service.test.mjs`

Expected: FAIL because Windows currently returns `unsupported_supervisor`.

- [ ] **Step 3: Add the Channel Connectors definition and shared lifecycle**

Use service ID `channel-connectors`, Windows task `TracevaneChannelConnectors`, existing systemd name, launchd label without `.service`, existing `--config` argument, existing management endpoint, runtime file, and log file. Keep `reload` outside `TracevaneServiceAction`; execute it only after manager state is running.

- [ ] **Step 4: Run Channel Connectors tests**

Run: `npm run build:api && node --test tests/system/channel-connectors-v3-service.test.mjs tests/system/channel-connectors-persistent-live-script.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit Channel Connectors migration**

```bash
git add apps/api/modules/channel-connectors/service.ts apps/api/modules/channel-connectors/daemon.ts tests/system/channel-connectors-v3-service.test.mjs tests/system/channel-connectors-persistent-live-script.test.mjs
git commit -m "feat(channel-connectors): add Windows supervisor support"
```

### Task 9: Make all three service panels state-driven

**Files:**
- Modify: `apps/web/src/features/model-gateway/views/DaemonServicePanel.tsx`
- Modify: `apps/web/src/features/channel-connectors/views/DaemonServicePanel.tsx`
- Modify: `apps/web/src/features/recovery/views/RecoveryServicePanel.tsx`
- Create: `tests/system/web-daemon-service-panels.test.mjs`
- Modify: `tests/system/web-model-gateway.test.mjs`
- Modify: `tests/system/web-channel-connectors.test.mjs`
- Modify: `tests/system/openclaw-recovery-contract.test.mjs`

**Interfaces:**
- Consumes: normalized manager status from Tasks 6-8.
- Produces: identical action semantics and Chinese copy across panels.

- [ ] **Step 1: Write failing UI source-contract tests**

```js
for (const panel of panels) {
  assert.match(panel, /会话托管/);
  assert.match(panel, /系统守护/);
  assert.match(panel, /安装并启动/);
  assert.match(panel, /修复并重启/);
  assert.match(panel, /errorCode/);
}
assert.doesNotMatch(modelPanel, /cmd\.stderr \|\| cmd\.error/);
assert.doesNotMatch(recoveryPanel, /failed\?\.stderr \|\| failed\?\.error/);
```

- [ ] **Step 2: Run and confirm copy/state failures**

Run: `node --test tests/system/web-daemon-service-panels.test.mjs`

Expected: FAIL because the panels always expose restart and render raw stderr.

- [ ] **Step 3: Implement the action matrix**

```ts
function primaryAction(manager: TracevaneServiceManagerStatus): "install" | "start" | "restart" | "repair" {
  if (!manager.installed && manager.mode === "persistent") return "install";
  if (manager.state === "stale-config") return "repair";
  if (manager.state === "stopped") return "start";
  return "restart";
}
```

Display mode, supervisor, installation, auto-start, health, and last structured error. Session mode copy must say it stops with the dev API. Persistent install/repair/stop remains confirmation-gated. Raw command output moves behind an expandable diagnostics section.

- [ ] **Step 4: Run web tests and typecheck**

Run: `npm run typecheck:web`

Expected: PASS.

Run: `node --test tests/system/web-daemon-service-panels.test.mjs tests/system/web-model-gateway.test.mjs tests/system/web-channel-connectors.test.mjs tests/system/openclaw-recovery-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit UI state semantics**

```bash
git add apps/web/src/features/model-gateway/views/DaemonServicePanel.tsx apps/web/src/features/channel-connectors/views/DaemonServicePanel.tsx apps/web/src/features/recovery/views/RecoveryServicePanel.tsx tests/system/web-daemon-service-panels.test.mjs tests/system/web-model-gateway.test.mjs tests/system/web-channel-connectors.test.mjs tests/system/openclaw-recovery-contract.test.mjs
git commit -m "fix(web): align daemon controls with lifecycle state"
```

### Task 10: Add opt-in real platform lifecycle smoke tests

**Files:**
- Create: `tests/system/fixtures/supervisor-fixture-daemon.mjs`
- Create: `tests/system/supervisor-windows-live.smoke.mjs`
- Create: `tests/system/supervisor-macos-live.smoke.mjs`
- Create: `tests/system/supervisor-linux-live.smoke.mjs`
- Modify: `package.json`

**Interfaces:**
- Live tests use unique names containing the current PID and always unregister in `finally`.
- They run only when the corresponding `TRACEVANE_*_SUPERVISOR_LIVE=1` flag is set.

- [ ] **Step 1: Add guarded smoke tests**

Each test performs this exact sequence:

```text
preview -> install -> status installed -> start -> wait for heartbeat
kill daemon -> wait for OS restart -> restart -> stop -> uninstall
assert template/task/unit/plist removed in finally
```

- [ ] **Step 2: Add scripts**

```json
{
  "test:supervisor": "npm run build:api && node --test tests/system/supervisor-*.test.mjs",
  "smoke:supervisor:windows": "node tests/system/supervisor-windows-live.smoke.mjs",
  "smoke:supervisor:macos": "node tests/system/supervisor-macos-live.smoke.mjs",
  "smoke:supervisor:linux": "node tests/system/supervisor-linux-live.smoke.mjs"
}
```

- [ ] **Step 3: Run the local platform smoke**

Windows PowerShell:

```powershell
$env:TRACEVANE_WINDOWS_SUPERVISOR_LIVE = "1"
npm run smoke:supervisor:windows
```

Expected: PASS; Task Scheduler contains no `TracevaneTest-*` task afterward.

macOS/Linux runs use the matching flag and npm script. On unavailable platforms, tests must report SKIP, not PASS.

- [ ] **Step 4: Commit live smoke coverage**

```bash
git add tests/system/fixtures tests/system/supervisor-*-live.smoke.mjs package.json
git commit -m "test(supervisor): cover native user service lifecycle"
```

### Task 11: Document, verify, and remove duplicated supervisor code

**Files:**
- Modify: `README.md`
- Modify: `docs/研究先行开发清单.md`
- Modify: `apps/api/modules/model-gateway/supervisor.ts`
- Modify: `apps/api/modules/openclaw-recovery/supervisor.ts`
- Modify: `apps/api/modules/channel-connectors/service.ts`

- [ ] **Step 1: Document supported modes and commands**

Document session versus persistent mode, current-user scope, install/repair/uninstall behavior, WSL/native dependency separation, and live-smoke environment flags. Record the Microsoft Task Scheduler, Apple launchd, and systemd contracts in the research checklist.

- [ ] **Step 2: Delete superseded template builders and command runners**

Search:

```bash
rg -n "buildWindowsTaskTemplate|buildSystemdTemplate|buildLaunchdTemplate|Supervisor is not supported on this platform yet|Buffer\.concat\(.+\)\.toString\(\"utf8\"\)" apps/api/modules
```

Expected: no feature-local supervisor template builder, no Windows unsupported message, and no feature-local native command decoder remain.

- [ ] **Step 3: Run the focused verification set**

```bash
npm run typecheck
npm run build
npm run test:supervisor
node --test tests/system/model-gateway-service.test.mjs tests/system/channel-connectors-v3-service.test.mjs tests/system/openclaw-recovery-contract.test.mjs tests/system/openclaw-recovery-daemon.test.mjs
node --test tests/system/web-daemon-service-panels.test.mjs tests/system/web-model-gateway.test.mjs tests/system/web-channel-connectors.test.mjs
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Manually verify the three panels on native Windows**

Verify session mode on initial dev start, explicit install, running status, restart, stop, repair after changing the recorded fingerprint, uninstall, and absence of replacement-character mojibake. Capture screenshots for Model Gateway, Channel Connectors, and Recovery.

- [ ] **Step 5: Commit completion docs and cleanup**

```bash
git add README.md docs/研究先行开发清单.md apps/api/modules/model-gateway/supervisor.ts apps/api/modules/openclaw-recovery/supervisor.ts apps/api/modules/channel-connectors/service.ts
git commit -m "docs(supervisor): record cross-platform lifecycle support"
```

---

## Test Point Summary

### Contract tests

- Stable mode/state/action/error-code vocabulary across all three services.
- Existing response fields remain compatible during migration.
- Browser cannot supply executable paths, command arguments, cwd, or environment.

### Unit/system tests

- Windows/macOS/Linux template generation with spaces, CJK, XML characters, and long paths.
- Task/unit/plist fingerprint detects stale Node path, project move, config move, and entrypoint change.
- Missing task never triggers stop/restart commands.
- Localized output never controls lifecycle decisions.
- Timeout, command absence, permission failure, readiness failure, and invalid template have distinct error codes.
- Secrets and proxy credentials are absent from templates, arguments, results, and logs.
- Session supervisor prevents duplicate children and cleans up on API exit.
- Session-to-persistent and persistent-to-session transitions cannot run two owners.

### Real OS smoke tests

- Install, query, start, health, crash restart, explicit restart, stop, repair, uninstall.
- Current-user non-admin execution.
- Login auto-start configuration.
- Cleanup succeeds after both pass and failure.
- Windows zh-CN output, macOS LaunchAgent domain, Linux systemd user availability.

### UI tests

- Uninstalled shows “安装并启动”, not “重启”.
- Stopped shows “启动”; stale config shows “修复并重启”.
- Session/persistent mode is visible.
- Structured Chinese errors are shown; raw command evidence is secondary.
- Stop/install/repair/restart retain confirmation and danger copy.

## Self-Review

- Spec coverage: all three daemons, all three OS supervisors, session fallback, persistent lifecycle, Windows task absence, output encoding, UI semantics, security, repair/uninstall, live verification, and documentation are assigned to explicit tasks.
- Placeholder scan: no TBD/TODO/follow-up placeholders remain.
- Type consistency: every integration consumes the common `TracevaneServiceManagerStatus`, `ServiceDefinition`, `ManageServiceRequest`, and `ManageServiceResponse` defined in earlier tasks.
