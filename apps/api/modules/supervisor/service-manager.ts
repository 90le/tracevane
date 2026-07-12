import { randomUUID } from "node:crypto";
import { promises as nativeFs } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import type {
  TracevaneServiceAction,
  TracevaneServiceManagerStatus,
  TracevaneServiceMode,
} from "../../../../types/supervisor.js";
import {
  classifySupervisorFailure,
  runSupervisorCommand,
  type RunSupervisorCommandOptions,
  type SupervisorCommandResult,
} from "./command-runner.js";
import type {
  CreateSupervisorPlanOptions,
  ServiceDefinition,
  SupervisorCommand,
  SupervisorPlan,
} from "./contracts.js";
import {
  createServiceLaunchArguments,
  createSupervisorPlan,
} from "./platform-plans.js";
import {
  getProcessSessionSupervisor,
  type SessionSupervisor,
} from "./session-supervisor.js";

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

export interface CreateServiceManagerDependencies {
  session?: SessionSupervisor;
  runner?: (
    command: SupervisorCommand,
    options: RunSupervisorCommandOptions,
  ) => Promise<SupervisorCommandResult>;
  probe?: (url: string, expectedPid?: number | null) => Promise<boolean>;
  shutdownProbe?: (url: string) => Promise<boolean>;
  processIsAlive?: (pid: number) => boolean;
  platform?: NodeJS.Platform;
  homeDir?: string;
  fs?: Pick<
    typeof nativeFs,
    "mkdir" | "readFile" | "rename" | "unlink" | "writeFile"
  >;
  windowsUserId?: CreateSupervisorPlanOptions["windowsUserId"];
  commandTimeoutMs?: number;
  runtimeProofTimeoutMs?: number;
  redact?: string[];
}

export interface ServiceManager {
  manage(
    definition: ServiceDefinition,
    request: ManageServiceRequest,
  ): Promise<ManageServiceResponse>;
  dispose(): Promise<void>;
}

interface PersistentInspection {
  manager: TracevaneServiceManagerStatus;
  commands: SupervisorCommandResult[];
  templateExists: boolean | null;
}

interface CommandSequenceResult {
  ok: boolean;
  commands: SupervisorCommandResult[];
  failure: SupervisorCommandResult | null;
}

interface PersistentStopProof {
  stopped: boolean;
  commands: SupervisorCommandResult[];
}

interface PersistentStartProof {
  ready: boolean;
  commands: SupervisorCommandResult[];
}

interface WindowsScheduledTaskSnapshot {
  state: 0 | 1 | 2 | 3 | 4;
  enabled: boolean;
}

function parseWindowsScheduledTaskSnapshot(
  stdout: string,
): WindowsScheduledTaskSnapshot | null {
  try {
    const parsed = JSON.parse(stdout.trim().replace(/^\uFEFF/u, "")) as {
      state?: unknown;
      enabled?: unknown;
    };
    if (
      !Number.isInteger(parsed.state) ||
      Number(parsed.state) < 0 ||
      Number(parsed.state) > 4 ||
      typeof parsed.enabled !== "boolean"
    ) {
      return null;
    }
    return {
      state: parsed.state as WindowsScheduledTaskSnapshot["state"],
      enabled: parsed.enabled,
    };
  } catch {
    return null;
  }
}

function persistentManagerStatus(
  plan: SupervisorPlan,
  values: Partial<TracevaneServiceManagerStatus>,
): TracevaneServiceManagerStatus {
  return {
    mode: "persistent",
    supervisor: plan.supervisor,
    installed: false,
    enabled: false,
    active: false,
    state: "not-installed",
    configCurrent: false,
    checkedAt: new Date().toISOString(),
    errorCode: "task-not-found",
    errorMessage: "Persistent service is not installed.",
    ...values,
  };
}

function lifecycleCommands(
  plan: SupervisorPlan,
  action: "install" | "repair",
): SupervisorCommand[] {
  if (plan.supervisor === "launchd-user") {
    return [...(plan.commands[action === "install" ? "start" : "repair"] ?? [])];
  }
  return [
    ...(plan.commands[action] ?? []),
    ...(plan.commands[action === "install" ? "start" : "restart"] ?? []),
  ];
}

function systemdPostUnlinkCommands(plan: SupervisorPlan): SupervisorCommand[] {
  if (plan.supervisor !== "systemd-user") return [];
  return (plan.commands.uninstall ?? []).filter((command) =>
    command.command === "systemctl" &&
    command.args.length === 2 &&
    command.args[0] === "--user" &&
    command.args[1] === "daemon-reload"
  );
}

function uninstallCommands(plan: SupervisorPlan): SupervisorCommand[] {
  if (plan.supervisor === "launchd-user") {
    return [...(plan.commands.uninstall ?? [])];
  }
  const postUnlinkCommands = systemdPostUnlinkCommands(plan);
  return [
    ...(plan.commands.stop ?? []),
    ...(plan.commands.uninstall ?? []).filter((command) =>
      !postUnlinkCommands.includes(command)
    ),
  ];
}

function sessionReadyStatus(): TracevaneServiceManagerStatus {
  return {
    mode: "session",
    supervisor: "session",
    installed: false,
    enabled: null,
    active: false,
    state: "stopped",
    configCurrent: true,
    checkedAt: new Date().toISOString(),
    errorCode: null,
    errorMessage: null,
  };
}

function normalizeCommandEvidence(
  platform: NodeJS.Platform,
  command: SupervisorCommand,
  result: SupervisorCommandResult,
  secrets: string[],
): SupervisorCommandResult {
  const sanitize = (value: string): string => {
    let redacted = value;
    for (const secret of secrets) {
      redacted = redacted.replaceAll(secret, "[REDACTED]");
    }
    const bytes = Buffer.from(redacted, "utf8");
    if (bytes.byteLength <= 16 * 1024) return redacted;
    const retained = bytes.subarray(0, 16 * 1024);
    for (let omitted = 0; omitted <= 3; omitted += 1) {
      try {
        return new TextDecoder("utf-8", { fatal: true }).decode(
          retained.subarray(0, retained.byteLength - omitted),
        );
      } catch {
        // Back up only enough to avoid splitting a UTF-8 code point.
      }
    }
    return "";
  };
  const evidence: SupervisorCommandResult = {
    ...result,
    label: sanitize(command.label),
    command: sanitize(command.command),
    args: command.args.map(sanitize),
    kind: command.kind,
    stdout: sanitize(result.stdout),
    stderr: sanitize(result.stderr),
    errorMessage: result.errorCode === null
      ? null
      : stableErrorMessage(result.errorCode),
  };
  if (
    platform === "darwin" &&
    command.command === "launchctl" &&
    command.args.length === 2 &&
    command.args[0] === "bootout" &&
    result.exitCode === 3 &&
    (result.errorCode === null || result.errorCode === "unknown")
  ) {
    return {
      ...evidence,
      ok: true,
      errorCode: null,
      errorMessage: null,
    };
  }
  return evidence;
}

function stableErrorMessage(
  code: TracevaneServiceManagerStatus["errorCode"],
): string | null {
  switch (code) {
    case null:
      return null;
    case "task-not-found":
      return "Persistent service is not installed.";
    case "permission-denied":
      return "Supervisor command permission denied.";
    case "command-not-found":
      return "Supervisor command is not available.";
    case "command-timeout":
      return "Supervisor command timed out.";
    case "template-invalid":
      return "Persistent service template is invalid.";
    case "address-in-use":
      return "Service address is already in use by another process.";
    case "runtime-not-ready":
      return "Persistent service did not become ready.";
    case "stale-config":
      return "Persistent service template is stale.";
    case "unsupported-platform":
      return "Persistent supervisor platform is unsupported.";
    default:
      return "Persistent supervisor operation failed.";
  }
}

function normalizeManagerStatus(
  status: TracevaneServiceManagerStatus,
): TracevaneServiceManagerStatus {
  return {
    mode: status.mode,
    supervisor: status.supervisor,
    installed: status.installed,
    enabled: status.enabled,
    active: status.active,
    state: status.state,
    configCurrent: status.configCurrent,
    checkedAt: status.checkedAt,
    errorCode: status.errorCode,
    errorMessage: stableErrorMessage(status.errorCode),
  };
}

function hasUntrustedStatus(status: TracevaneServiceManagerStatus): boolean {
  return status.state === "unknown" && status.errorCode !== null;
}

function templateReadFailure(
  plan: SupervisorPlan,
  error: unknown,
): PersistentInspection {
  const permissionDenied = (error as NodeJS.ErrnoException).code === "EACCES";
  const errorCode = permissionDenied ? "permission-denied" : "template-invalid";
  return {
    manager: persistentManagerStatus(plan, {
      installed: false,
      enabled: null,
      active: null,
      state: permissionDenied ? "unknown" : "failed",
      configCurrent: false,
      errorCode,
      errorMessage: stableErrorMessage(errorCode),
    }),
    commands: [],
    templateExists: null,
  };
}

function hasUntrustedInspection(inspection: PersistentInspection): boolean {
  return inspection.templateExists === null || hasUntrustedStatus(inspection.manager);
}

function scheduledTaskMayOwnRuntime(
  plan: SupervisorPlan,
  manager: TracevaneServiceManagerStatus,
  runtimePid: number | null,
  processIsAlive: (pid: number) => boolean,
): boolean {
  return plan.supervisor === "scheduled-task" &&
    (manager.active === true ||
      manager.state === "starting" ||
      (manager.state === "stale-config" && manager.active === null) ||
      (runtimePid !== null && processIsAlive(runtimePid)));
}

export function createServiceManager(
  dependencies: CreateServiceManagerDependencies = {},
): ServiceManager {
  const session = dependencies.session ?? getProcessSessionSupervisor();
  const platform = dependencies.platform ?? process.platform;
  const homeDir = dependencies.homeDir ?? os.homedir();
  const fileSystem = dependencies.fs ?? nativeFs;
  const runner = dependencies.runner ?? runSupervisorCommand;
  const probe = dependencies.probe ?? (async (url: string) => {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  });
  const shutdownProbe = dependencies.shutdownProbe ?? (async (url: string) => {
    try {
      await fetch(url, {
        signal: AbortSignal.timeout(500),
      });
      return true;
    } catch {
      return false;
    }
  });
  const commandTimeoutMs = Math.max(0, dependencies.commandTimeoutMs ?? 5_000);
  const runtimeProofTimeoutMs = Math.max(
    0,
    dependencies.runtimeProofTimeoutMs ?? 8_000,
  );
  const secrets = dependencies.redact?.filter(Boolean) ?? [];

  async function probeHealth(
    url: string,
    expectedPid?: number | null,
  ): Promise<boolean> {
    try {
      return await probe(url, expectedPid);
    } catch {
      return false;
    }
  }

  async function probeShutdownHealth(url: string): Promise<boolean> {
    try {
      return await shutdownProbe(url);
    } catch {
      return false;
    }
  }

  async function readRuntimePid(runtimePath: string): Promise<number | null> {
    try {
      const raw = await fileSystem.readFile(runtimePath, "utf8");
      const parsed = JSON.parse(String(raw)) as { pid?: unknown };
      return Number.isSafeInteger(parsed.pid) && Number(parsed.pid) > 0
        ? Number(parsed.pid)
        : null;
    } catch {
      return null;
    }
  }

  async function inspectLiveRuntimeOwnership(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
  ): Promise<{ pid: number; ownedBySession: boolean } | null> {
    if (plan.supervisor !== "scheduled-task") return null;
    const pid = await readRuntimePid(definition.runtimePath);
    if (pid === null || !processIsAlive(pid)) return null;
    const observed = await session.status(definition.id);
    return {
      pid,
      ownedBySession: observed.errorCode === null &&
        observed.active === true &&
        observed.state === "running" &&
        observed.pid === pid,
    };
  }

  function liveRuntimeConflictResponse(
    plan: SupervisorPlan,
    inspection: PersistentInspection,
    action: TracevaneServiceAction,
    message: string,
  ): ManageServiceResponse {
    return {
      ok: false,
      action,
      manager: persistentManagerStatus(plan, {
        installed: inspection.manager.installed,
        enabled: inspection.manager.enabled,
        active: null,
        state: "degraded",
        configCurrent: inspection.manager.configCurrent,
        errorCode: "runtime-not-ready",
        errorMessage: message,
      }),
      commands: inspection.commands,
      templateWritten: false,
      configCurrent: inspection.manager.configCurrent,
    };
  }

  const processIsAlive = dependencies.processIsAlive ?? ((pid: number): boolean => {
    try {
      process.kill(pid, 0);
      return true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EPERM") return true;
      if (code === "ESRCH") return false;
      return true;
    }
  });

  async function verifyRecordedRuntimeStopped(
    definition: ServiceDefinition,
    runtimePid: number,
  ): Promise<boolean> {
    const deadline = Date.now() + runtimeProofTimeoutMs;
    while (true) {
      const processStopped = !processIsAlive(runtimePid);
      const endpointStopped = processStopped &&
        !(await probeShutdownHealth(definition.healthUrl));
      if (processStopped && endpointStopped) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function verifyRecordedProcessStopped(
    runtimePid: number,
  ): Promise<boolean> {
    const deadline = Date.now() + runtimeProofTimeoutMs;
    while (true) {
      if (!processIsAlive(runtimePid)) return true;
      if (Date.now() >= deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function verifyScheduledTaskInactive(
    plan: SupervisorPlan,
    deadline = Date.now() + runtimeProofTimeoutMs,
  ): Promise<PersistentStopProof> {
    let lastCommands: SupervisorCommandResult[] = [];
    while (true) {
      const native = await inspectPersistent(plan);
      lastCommands = native.commands;
      if (
        native.manager.installed &&
        native.manager.active === false &&
        !hasUntrustedStatus(native.manager)
      ) {
        return { stopped: true, commands: lastCommands };
      }
      if (Date.now() >= deadline) {
        return { stopped: false, commands: lastCommands };
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  async function verifyScheduledTaskStoppedAfterSessionTransition(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
    originalSessionPid: number,
    observedRuntimePid: number | null,
    keepSessionRunning: boolean,
  ): Promise<PersistentStopProof> {
    const deadline = Date.now() + runtimeProofTimeoutMs;
    const commands: SupervisorCommandResult[] = [];
    let candidate = observedRuntimePid;

    while (true) {
      if (
        candidate !== null &&
        candidate !== originalSessionPid &&
        processIsAlive(candidate)
      ) {
        while (processIsAlive(candidate)) {
          if (Date.now() >= deadline) return { stopped: false, commands };
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      if (!keepSessionRunning) {
        while (await probeShutdownHealth(definition.healthUrl)) {
          if (Date.now() >= deadline) return { stopped: false, commands };
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      const native = await verifyScheduledTaskInactive(plan, deadline);
      commands.push(...native.commands);
      if (!native.stopped) return { stopped: false, commands };

      const postStopRuntimePid = await readRuntimePid(definition.runtimePath);
      if (
        postStopRuntimePid === null ||
        postStopRuntimePid === originalSessionPid ||
        !processIsAlive(postStopRuntimePid)
      ) {
        return { stopped: true, commands };
      }
      candidate = postStopRuntimePid;
    }
  }

  async function verifyPersistentRuntimeStopped(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
    runtimePid: number | null,
  ): Promise<PersistentStopProof> {
    let processStopped = false;
    let endpointStopped = false;
    if (runtimePid !== null) {
      const deadline = Date.now() + Math.max(5_000, commandTimeoutMs);
      while (true) {
        processStopped = !processIsAlive(runtimePid);
        endpointStopped = processStopped &&
          !(await probeShutdownHealth(definition.healthUrl));
        if (processStopped && endpointStopped) break;
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    } else {
      endpointStopped = !(await probeShutdownHealth(definition.healthUrl));
    }

    const native = await inspectPersistent(plan);
    const nativeStopped = native.manager.installed &&
      native.manager.active === false &&
      !hasUntrustedStatus(native.manager);
    return {
      stopped: runtimePid !== null &&
        processStopped &&
        endpointStopped &&
        nativeStopped,
      commands: native.commands,
    };
  }

  async function verifyPersistentRuntimeStarted(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
    requireCurrentConfig = true,
    timeoutMs = runtimeProofTimeoutMs,
  ): Promise<PersistentStartProof> {
    if (plan.supervisor !== "scheduled-task") {
      return {
        ready: await probeHealth(definition.healthUrl),
        commands: [],
      };
    }

    const deadline = Date.now() + Math.max(0, timeoutMs);
    let lastNativeInspection: PersistentInspection | null = null;
    while (true) {
      const candidate = await readRuntimePid(definition.runtimePath);
      if (candidate !== null && processIsAlive(candidate)) {
        const ownedRuntimeReady = await probeHealth(
          definition.healthUrl,
          candidate,
        );
        const native = await inspectPersistent(plan);
        lastNativeInspection = native;
        const nativeRunning = native.manager.installed &&
          native.manager.active === true &&
          (requireCurrentConfig
            ? native.manager.state === "running" &&
              native.manager.configCurrent &&
              native.manager.errorCode === null
            : (native.manager.state === "running" || native.manager.state === "stale-config") &&
              (native.manager.errorCode === null || native.manager.errorCode === "stale-config"));
        if (ownedRuntimeReady && nativeRunning) {
          return {
            ready: true,
            commands: native.commands,
          };
        }
      }
      if (Date.now() >= deadline) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const native = lastNativeInspection ?? await inspectPersistent(plan);
    return {
      ready: false,
      commands: native.commands,
    };
  }

  async function stopScheduledTaskForRollback(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
    inspection: PersistentInspection,
    action: TracevaneServiceAction,
  ): Promise<{ stopped: boolean; commands: SupervisorCommandResult[] }> {
    const runtimePid = await readRuntimePid(definition.runtimePath);
    if (!scheduledTaskMayOwnRuntime(
      plan,
      inspection.manager,
      runtimePid,
      processIsAlive,
    )) {
      return { stopped: true, commands: [] };
    }
    const stop = await runSequence(plan.commands.stop ?? [], action);
    if (!stop.ok) return { stopped: false, commands: stop.commands };
    const proof = await verifyPersistentRuntimeStopped(
      definition,
      plan,
      runtimePid,
    );
    return {
      stopped: proof.stopped,
      commands: [...stop.commands, ...proof.commands],
    };
  }

  async function restoreScheduledTaskAfterFailedRepair(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
    previousTemplate: string,
    action: TracevaneServiceAction,
    restartPreviousOwner: boolean,
  ): Promise<{ restored: boolean; commands: SupervisorCommandResult[] }> {
    try {
      await writeTextAtomic(plan.configPath, previousTemplate);
    } catch {
      return { restored: false, commands: [] };
    }
    const commands: SupervisorCommandResult[] = [];
    const registration = await runSequence(plan.commands.repair ?? [], action);
    commands.push(...registration.commands);
    if (!registration.ok) return { restored: false, commands };
    if (!restartPreviousOwner) return { restored: true, commands };

    const start = await runSequence(plan.commands.start ?? [], action);
    commands.push(...start.commands);
    if (!start.ok) return { restored: false, commands };
    const proof = await verifyPersistentRuntimeStarted(definition, plan, false);
    commands.push(...proof.commands);
    return { restored: proof.ready, commands };
  }

  async function rollbackActiveScheduledRepair(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
    previousTemplate: string,
    postFailureInspection: PersistentInspection,
    action: TracevaneServiceAction,
  ): Promise<{ restored: boolean; commands: SupervisorCommandResult[] }> {
    const stopped = await stopScheduledTaskForRollback(
      definition,
      plan,
      postFailureInspection,
      action,
    );
    if (!stopped.stopped) {
      return { restored: false, commands: stopped.commands };
    }
    const restored = await restoreScheduledTaskAfterFailedRepair(
      definition,
      plan,
      previousTemplate,
      action,
      true,
    );
    return {
      restored: restored.restored,
      commands: [...stopped.commands, ...restored.commands],
    };
  }

  async function writeTemplateAtomic(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
  ): Promise<void> {
    if (templateContainsRedactedValue(definition, plan)) {
      throw new Error("Persistent service template contains a redacted value.");
    }
    await writeTextAtomic(plan.configPath, plan.template);
  }

  function templateContainsRedactedValue(
    definition: ServiceDefinition,
    plan: SupervisorPlan,
  ): boolean {
    const rawLaunchValues = [
      process.execPath,
      ...createServiceLaunchArguments(definition),
    ];
    return secrets.some((secret) =>
      plan.template.includes(secret) ||
      rawLaunchValues.some((value) => value.includes(secret))
    );
  }

  async function writeTextAtomic(
    targetPath: string,
    content: string,
  ): Promise<void> {
    const paths = platform === "win32" ? path.win32 : path.posix;
    const directory = paths.dirname(targetPath);
    const temporaryPath = paths.join(
      directory,
      `.${paths.basename(targetPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    await fileSystem.mkdir(directory, { recursive: true });
    try {
      await fileSystem.writeFile(temporaryPath, content, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await fileSystem.rename(temporaryPath, targetPath);
    } catch (error) {
      try {
        await fileSystem.unlink(temporaryPath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") {
          // Preserve the original write/rename failure.
        }
      }
      throw error;
    }
  }

  async function executeCommand(
    command: SupervisorCommand,
    action: TracevaneServiceAction,
  ): Promise<SupervisorCommandResult> {
    let rawResult: SupervisorCommandResult;
    try {
      rawResult = await runner(command, {
        timeoutMs: commandTimeoutMs,
        platform,
        action,
        redact: secrets,
      });
    } catch {
      rawResult = {
        ...command,
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        errorCode: "unknown",
        errorMessage: stableErrorMessage("unknown"),
        durationMs: 0,
      };
    }
    return normalizeCommandEvidence(
      platform,
      command,
      rawResult,
      secrets,
    );
  }

  async function runSequence(
    commands: SupervisorCommand[],
    action: TracevaneServiceAction,
  ): Promise<CommandSequenceResult> {
    const results: SupervisorCommandResult[] = [];
    for (const command of commands) {
      const result = await executeCommand(command, action);
      results.push(result);
      if (!result.ok) {
        return { ok: false, commands: results, failure: result };
      }
    }
    return { ok: true, commands: results, failure: null };
  }

  async function inspectPersistent(
    plan: SupervisorPlan,
  ): Promise<PersistentInspection> {
    let template: string | null = null;
    let templateExists = true;
    try {
      template = await fileSystem.readFile(plan.configPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        return templateReadFailure(plan, error);
      }
      templateExists = false;
      if (plan.supervisor !== "scheduled-task") {
        return {
          manager: persistentManagerStatus(plan, {}),
          commands: [],
          templateExists,
        };
      }
    }

    const configCurrent = templateExists && template === plan.template;
    const results: SupervisorCommandResult[] = [];
    if (plan.supervisor === "scheduled-task") {
      const statusCommand = plan.commands.status?.[0];
      if (!statusCommand) {
        return {
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: null,
            active: null,
            state: "unknown",
            configCurrent,
            errorCode: "unknown",
            errorMessage: stableErrorMessage("unknown"),
          }),
          commands: results,
          templateExists,
        };
      }
      let result = await executeCommand(statusCommand, "status");
      results.push(result);
      if (!result.ok) {
        const errorCode = classifySupervisorFailure(result);
        if (errorCode === "task-not-found") {
          return {
            manager: persistentManagerStatus(plan, { configCurrent }),
            commands: results,
            templateExists,
          };
        }
        return {
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: null,
            active: null,
            state: "unknown",
            configCurrent,
            errorCode,
            errorMessage: stableErrorMessage(errorCode),
          }),
          commands: results,
          templateExists,
        };
      }

      const snapshot = parseWindowsScheduledTaskSnapshot(result.stdout);
      if (!snapshot) {
        result = {
          ...result,
          ok: false,
          errorCode: "unknown",
          errorMessage: stableErrorMessage("unknown"),
        };
        results[results.length - 1] = result;
        return {
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: null,
            active: null,
            state: "unknown",
            configCurrent,
            errorCode: "unknown",
            errorMessage: stableErrorMessage("unknown"),
          }),
          commands: results,
          templateExists,
        };
      }

      const active = snapshot.state === 4
        ? true
        : snapshot.state === 1 || snapshot.state === 3
          ? false
          : null;
      const state = snapshot.state === 0
          ? "unknown"
        : !configCurrent
          ? "stale-config"
          : snapshot.state === 2
            ? "starting"
            : snapshot.state === 4
              ? "running"
              : "stopped";
      const errorCode = snapshot.state === 0
          ? "unknown"
        : !configCurrent
          ? "stale-config"
          : null;
      return {
        manager: persistentManagerStatus(plan, {
          installed: true,
          enabled: snapshot.enabled,
          active,
          state,
          configCurrent,
          errorCode,
          errorMessage: stableErrorMessage(errorCode),
        }),
        commands: results,
        templateExists,
      };
    }
    if (plan.supervisor === "systemd-user") {
      let active: boolean | null = null;
      let enabled: boolean | null = null;
      let failed = false;
      for (const command of plan.commands.status ?? []) {
        let result = await executeCommand(command, "status");
        const token = result.stdout.trim();
        const isActive = command.args.includes("is-active");
        const recognized = isActive
          ? token === "active" || token === "inactive" || token === "failed"
          : token === "enabled" || token === "disabled";
        const stableFailure =
          result.errorCode === "command-not-found" ||
          result.errorCode === "permission-denied" ||
          result.errorCode === "command-timeout";
        if (recognized && !stableFailure) {
          result = {
            ...result,
            ok: true,
            errorCode: null,
            errorMessage: null,
          };
          if (isActive) {
            active = token === "active";
            failed = token === "failed";
          } else {
            enabled = token === "enabled";
          }
        }
        results.push(result);
        if (!result.ok) {
          const errorCode = classifySupervisorFailure(result);
          return {
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled,
              active,
              state: "unknown",
              configCurrent,
              errorCode,
              errorMessage: stableErrorMessage(errorCode),
            }),
            commands: results,
            templateExists: true,
          };
        }
      }

      const state = !configCurrent
        ? "stale-config"
        : failed
          ? "failed"
          : active === true
            ? "running"
            : active === false
              ? "stopped"
              : "unknown";
      const errorCode = !configCurrent
        ? "stale-config"
        : failed
          ? "runtime-not-ready"
          : null;
      return {
        manager: persistentManagerStatus(plan, {
          installed: true,
          enabled,
          active,
          state,
          configCurrent,
          errorCode,
          errorMessage: stableErrorMessage(errorCode),
        }),
        commands: results,
        templateExists: true,
      };
    }

    for (const command of plan.commands.status ?? []) {
      let result = await executeCommand(command, "status");
      if (
        platform === "darwin" &&
        command.command === "launchctl" &&
        command.args.length === 2 &&
        command.args[0] === "print" &&
        result.exitCode === 113 &&
        (result.errorCode === null || result.errorCode === "unknown")
      ) {
        result = {
          ...result,
          ok: true,
          errorCode: null,
          errorMessage: null,
        };
        results.push(result);
        const errorCode = configCurrent ? null : "stale-config";
        return {
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: null,
            active: false,
            state: configCurrent ? "stopped" : "stale-config",
            configCurrent,
            errorCode,
            errorMessage: stableErrorMessage(errorCode),
          }),
          commands: results,
          templateExists: true,
        };
      }
      results.push(result);
      if (!result.ok) {
        const errorCode = classifySupervisorFailure(result);
        if (errorCode === "task-not-found") {
          return {
            manager: persistentManagerStatus(plan, {
              configCurrent,
            }),
            commands: results,
            templateExists: true,
          };
        }
        return {
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: null,
            active: null,
            state: "unknown",
            configCurrent,
            errorCode,
            errorMessage: stableErrorMessage(errorCode),
          }),
          commands: results,
          templateExists: true,
        };
      }
    }

    return {
      manager: persistentManagerStatus(plan, {
        installed: true,
        enabled: null,
        active: null,
        state: configCurrent ? "unknown" : "stale-config",
        configCurrent,
        errorCode: configCurrent ? null : "stale-config",
        errorMessage: configCurrent ? null : "Persistent service template is stale.",
      }),
      commands: results,
      templateExists: true,
    };
  }

  async function inspectTemplateOnly(
    plan: SupervisorPlan,
  ): Promise<PersistentInspection> {
    try {
      const template = await fileSystem.readFile(plan.configPath, "utf8");
      const configCurrent = template === plan.template;
      return {
        manager: persistentManagerStatus(plan, {
          installed: true,
          enabled: null,
          active: null,
          state: configCurrent ? "unknown" : "stale-config",
          configCurrent,
          errorCode: configCurrent ? null : "stale-config",
          errorMessage: configCurrent ? null : stableErrorMessage("stale-config"),
        }),
        commands: [],
        templateExists: true,
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {
          manager: persistentManagerStatus(plan, {}),
          commands: [],
          templateExists: false,
        };
      }
      return templateReadFailure(plan, error);
    }
  }

  async function finishRunningNoOp(
    definition: ServiceDefinition,
    request: ManageServiceRequest,
    plan: SupervisorPlan,
    inspection: PersistentInspection,
  ): Promise<ManageServiceResponse | null> {
    let sessionStatus = await session.status(definition.id);
    let stoppedSessionOwner = false;
    if (sessionStatus.active !== false || sessionStatus.state !== "stopped") {
      sessionStatus = await session.stop(definition.id);
      stoppedSessionOwner = true;
      if (sessionStatus.active !== false || sessionStatus.state !== "stopped") {
        return {
          ok: false,
          action: request.action,
          manager: {
            ...normalizeManagerStatus(sessionStatus),
            errorCode: sessionStatus.errorCode ?? "runtime-not-ready",
            errorMessage: "Session owner did not stop.",
          },
          commands: inspection.commands,
          templateWritten: false,
          configCurrent: true,
        };
      }
    }

    let verificationCommands: SupervisorCommandResult[] = [];
    if (plan.supervisor === "scheduled-task") {
      const proof = await verifyPersistentRuntimeStarted(definition, plan);
      verificationCommands = proof.commands;
      if (!proof.ready) return null;
    } else if (
      stoppedSessionOwner &&
      inspection.manager.active === null &&
      !(await probeHealth(definition.healthUrl))
    ) {
      return null;
    }

    return {
      ok: true,
      action: request.action,
      manager: persistentManagerStatus(plan, {
        installed: true,
        enabled: inspection.manager.enabled,
        active: true,
        state: "running",
        configCurrent: true,
        errorCode: null,
        errorMessage: null,
      }),
      commands: [...inspection.commands, ...verificationCommands],
      templateWritten: false,
      configCurrent: true,
    };
  }

  async function manageService(
    definition: ServiceDefinition,
    request: ManageServiceRequest,
  ): Promise<ManageServiceResponse> {
      if (request.mode === "session") {
        let manager: TracevaneServiceManagerStatus;
        let sessionStarted = false;
        let sessionOwnerPid: number | null = null;
        let transitionCommands: SupervisorCommandResult[] = [];
        if (!request.apply || request.action === "preview" || request.action === "status") {
          const observed = await session.status(definition.id);
          manager = observed;
          sessionOwnerPid = observed.pid;
        } else if (request.action === "start" || request.action === "ensure-running") {
          const plan = createSupervisorPlan(definition, platform, homeDir, {
            windowsUserId: dependencies.windowsUserId,
          });
          const inspection = await inspectPersistent(plan);
          transitionCommands = inspection.commands;
          if (hasUntrustedInspection(inspection)) {
            return {
              ok: false,
              action: request.action,
              manager: inspection.manager,
              commands: transitionCommands,
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
          const liveRuntime = inspection.manager.active !== true
            ? await inspectLiveRuntimeOwnership(definition, plan)
            : null;
          if (liveRuntime && !liveRuntime.ownedBySession) {
            return liveRuntimeConflictResponse(
              plan,
              inspection,
              request.action,
              "A recorded runtime is still alive but is not owned by the session supervisor.",
            );
          }
          const runtimePid = plan.supervisor === "scheduled-task"
            ? await readRuntimePid(definition.runtimePath)
            : null;
          const nativeTaskMayOwnRuntime = scheduledTaskMayOwnRuntime(
            plan,
            inspection.manager,
            null,
            processIsAlive,
          );
          if (
            liveRuntime?.ownedBySession &&
            runtimePid !== null &&
            runtimePid !== liveRuntime.pid &&
            processIsAlive(runtimePid) &&
            !nativeTaskMayOwnRuntime
          ) {
            return liveRuntimeConflictResponse(
              plan,
              inspection,
              request.action,
              "The recorded runtime changed after session ownership was verified.",
            );
          }
          if (
            inspection.manager.installed &&
            (!liveRuntime?.ownedBySession || nativeTaskMayOwnRuntime)
          ) {
            const persistentMayOwnRuntime = scheduledTaskMayOwnRuntime(
              plan,
              inspection.manager,
              runtimePid,
              processIsAlive,
            );
            const stopped = await runSequence(
              plan.commands.stop ?? [],
              "stop",
            );
            transitionCommands = [...transitionCommands, ...stopped.commands];
            if (!stopped.ok) {
              const errorCode = classifySupervisorFailure(stopped.failure!);
              return {
                ok: false,
                action: request.action,
                manager: persistentManagerStatus(plan, {
                  installed: true,
                  enabled: inspection.manager.enabled,
                  active: inspection.manager.active,
                  state: "failed",
                  configCurrent: inspection.manager.configCurrent,
                  errorCode,
                  errorMessage: stableErrorMessage(errorCode),
                }),
                commands: transitionCommands,
                templateWritten: false,
                configCurrent: inspection.manager.configCurrent,
              };
            }
            if (persistentMayOwnRuntime) {
              const proof = liveRuntime?.ownedBySession
                ? await verifyScheduledTaskStoppedAfterSessionTransition(
                  definition,
                  plan,
                  liveRuntime.pid,
                  runtimePid,
                  true,
                )
                : await verifyPersistentRuntimeStopped(
                  definition,
                  plan,
                  runtimePid,
                );
              transitionCommands = [...transitionCommands, ...proof.commands];
              if (!proof.stopped) {
                return {
                  ok: false,
                  action: request.action,
                  manager: persistentManagerStatus(plan, {
                    installed: true,
                    enabled: inspection.manager.enabled,
                    active: null,
                    state: "degraded",
                    configCurrent: inspection.manager.configCurrent,
                    errorCode: "runtime-not-ready",
                    errorMessage: stableErrorMessage("runtime-not-ready"),
                  }),
                  commands: transitionCommands,
                  templateWritten: false,
                  configCurrent: inspection.manager.configCurrent,
                };
              }
            }
          }
          const started = await session.start(definition);
          manager = started;
          sessionStarted = true;
          sessionOwnerPid = started.pid;
        } else if (request.action === "stop") {
          manager = await session.stop(definition.id);
        } else if (request.action === "restart") {
          const plan = createSupervisorPlan(definition, platform, homeDir, {
            windowsUserId: dependencies.windowsUserId,
          });
          const inspection = await inspectPersistent(plan);
          transitionCommands = inspection.commands;
          if (hasUntrustedInspection(inspection)) {
            return {
              ok: false,
              action: request.action,
              manager: inspection.manager,
              commands: transitionCommands,
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
          const liveRuntime = inspection.manager.active !== true
            ? await inspectLiveRuntimeOwnership(definition, plan)
            : null;
          if (liveRuntime && !liveRuntime.ownedBySession) {
            return liveRuntimeConflictResponse(
              plan,
              inspection,
              request.action,
              "A recorded runtime is still alive but is not owned by the session supervisor.",
            );
          }
          const preStopRuntimePid = plan.supervisor === "scheduled-task"
            ? await readRuntimePid(definition.runtimePath)
            : null;
          const nativeTaskMayOwnRuntime = scheduledTaskMayOwnRuntime(
            plan,
            inspection.manager,
            null,
            processIsAlive,
          );
          if (
            liveRuntime?.ownedBySession &&
            preStopRuntimePid !== null &&
            preStopRuntimePid !== liveRuntime.pid &&
            processIsAlive(preStopRuntimePid) &&
            !nativeTaskMayOwnRuntime
          ) {
            return liveRuntimeConflictResponse(
              plan,
              inspection,
              request.action,
              "The recorded runtime changed after session ownership was verified.",
            );
          }
          manager = await session.stop(definition.id);
          if (manager.active === false && manager.state === "stopped") {
            const runtimePid = plan.supervisor === "scheduled-task"
              ? await readRuntimePid(definition.runtimePath)
              : null;
            const persistentRuntimePid = liveRuntime?.ownedBySession &&
                runtimePid === liveRuntime.pid
              ? null
              : runtimePid;
            const persistentMayOwnRuntime = scheduledTaskMayOwnRuntime(
              plan,
              inspection.manager,
              persistentRuntimePid,
              processIsAlive,
            );
            if (
              liveRuntime?.ownedBySession &&
              runtimePid !== null &&
              runtimePid !== liveRuntime.pid &&
              processIsAlive(runtimePid) &&
              !nativeTaskMayOwnRuntime
            ) {
              return liveRuntimeConflictResponse(
                plan,
                inspection,
                request.action,
                "The recorded runtime changed while the session owner was stopping.",
              );
            }
            if (
              liveRuntime?.ownedBySession &&
              !(nativeTaskMayOwnRuntime
                ? await verifyRecordedProcessStopped(liveRuntime.pid)
                : await verifyRecordedRuntimeStopped(definition, liveRuntime.pid))
            ) {
              return liveRuntimeConflictResponse(
                plan,
                inspection,
                request.action,
                "The previous session runtime did not stop; restart was not attempted.",
              );
            }
            if (
              inspection.manager.installed &&
              (!liveRuntime?.ownedBySession || scheduledTaskMayOwnRuntime(
                plan,
                inspection.manager,
                null,
                processIsAlive,
              ))
            ) {
              const stopped = await runSequence(
                plan.commands.stop ?? [],
                "stop",
              );
              transitionCommands = [...transitionCommands, ...stopped.commands];
              if (!stopped.ok) {
                const errorCode = classifySupervisorFailure(stopped.failure!);
                return {
                  ok: false,
                  action: request.action,
                  manager: persistentManagerStatus(plan, {
                    installed: true,
                    enabled: inspection.manager.enabled,
                    active: inspection.manager.active,
                    state: "failed",
                    configCurrent: inspection.manager.configCurrent,
                    errorCode,
                    errorMessage: stableErrorMessage(errorCode),
                  }),
                  commands: transitionCommands,
                  templateWritten: false,
                  configCurrent: inspection.manager.configCurrent,
                };
              }
              if (persistentMayOwnRuntime) {
                const proof = liveRuntime?.ownedBySession
                  ? await verifyScheduledTaskStoppedAfterSessionTransition(
                    definition,
                    plan,
                    liveRuntime.pid,
                    runtimePid,
                    false,
                  )
                  : await verifyPersistentRuntimeStopped(
                    definition,
                    plan,
                    runtimePid,
                  );
                transitionCommands = [...transitionCommands, ...proof.commands];
                if (!proof.stopped) {
                  return {
                    ok: false,
                    action: request.action,
                    manager: persistentManagerStatus(plan, {
                      installed: true,
                      enabled: inspection.manager.enabled,
                      active: null,
                      state: "degraded",
                      configCurrent: inspection.manager.configCurrent,
                      errorCode: "runtime-not-ready",
                      errorMessage: stableErrorMessage("runtime-not-ready"),
                    }),
                    commands: transitionCommands,
                    templateWritten: false,
                    configCurrent: inspection.manager.configCurrent,
                  };
                }
              }
            }
            if (liveRuntime?.ownedBySession && !nativeTaskMayOwnRuntime) {
              const finalRuntimePid = await readRuntimePid(definition.runtimePath);
              if (
                finalRuntimePid !== null &&
                finalRuntimePid !== liveRuntime.pid &&
                processIsAlive(finalRuntimePid)
              ) {
                return liveRuntimeConflictResponse(
                  plan,
                  inspection,
                  request.action,
                  "The recorded runtime changed before the session restart completed.",
                );
              }
            }
            const started = await session.start(definition);
            manager = started;
            sessionStarted = true;
            sessionOwnerPid = started.pid;
          }
        } else {
          manager = await session.status(definition.id);
        }
        manager = normalizeManagerStatus(manager);
        const inspectReadiness = sessionStarted ||
          (request.action === "status" && request.apply);
        if (inspectReadiness) {
          const processRunning = manager.errorCode === null &&
            manager.active === true &&
            manager.state === "running";
          const viableOwner = processRunning &&
            Number.isInteger(sessionOwnerPid) &&
            Number(sessionOwnerPid) > 0;
          const ready = viableOwner && await probeHealth(
            definition.healthUrl,
            sessionOwnerPid,
          );
          if (ready) {
            const ownedStatus = await session.status(definition.id);
            const owned = normalizeManagerStatus(ownedStatus);
            const ownedPid = ownedStatus.pid;
            if (
              owned.errorCode === null &&
              owned.active === true &&
              owned.state === "running" &&
              ownedPid === sessionOwnerPid
            ) {
              manager = owned;
            } else {
              manager = {
                ...owned,
                active: null,
                state: "degraded",
                errorCode: "runtime-not-ready",
                errorMessage: "Session service did not become ready.",
              };
            }
          } else if (
            manager.errorCode === null &&
            (sessionStarted || processRunning)
          ) {
            const observed = sessionStarted && viableOwner
              ? normalizeManagerStatus(await session.status(definition.id))
              : manager;
            manager = observed.errorCode !== null
              ? observed
              : {
                  ...manager,
                  active: null,
                  state: "degraded",
                  errorCode: "runtime-not-ready",
                  errorMessage: "Session service did not become ready.",
                };
          }
        }
        if (
          sessionStarted &&
          !(manager.errorCode === null && manager.active === true && manager.state === "running")
        ) {
          try {
            const cleanup = normalizeManagerStatus(await session.stop(definition.id));
            if (cleanup.active !== false || cleanup.state !== "stopped") {
              manager = {
                ...cleanup,
                errorCode: cleanup.errorCode ?? "runtime-not-ready",
                errorMessage: "Session readiness failed and cleanup was not confirmed.",
              };
            }
          } catch (error) {
            manager = {
              ...manager,
              errorCode: manager.errorCode ?? "runtime-not-ready",
              errorMessage: `Session readiness failed and cleanup threw: ${
                error instanceof Error ? error.message : String(error)
              }`,
            };
          }
        }
        return {
          ok: manager.errorCode === null,
          action: request.action,
          manager,
          commands: transitionCommands,
          templateWritten: false,
          configCurrent: manager.configCurrent,
        };
      }

      const plan = createSupervisorPlan(definition, platform, homeDir, {
        windowsUserId: dependencies.windowsUserId,
      });
      if (
        request.apply &&
        (request.action === "install" ||
          request.action === "repair" ||
          request.action === "ensure-running") &&
        templateContainsRedactedValue(definition, plan)
      ) {
        return {
          ok: false,
          action: request.action,
          manager: persistentManagerStatus(plan, {
            installed: false,
            enabled: null,
            active: null,
            state: "failed",
            configCurrent: false,
            errorCode: "template-invalid",
            errorMessage: stableErrorMessage("template-invalid"),
          }),
          commands: [],
          templateWritten: false,
          configCurrent: false,
        };
      }
      if (!request.apply || request.action === "preview") {
        const preview = await inspectTemplateOnly(plan);
        return {
          ok: preview.manager.errorCode === null,
          action: request.action,
          manager: preview.manager,
          commands: [],
          templateWritten: false,
          configCurrent: preview.manager.configCurrent,
        };
      }
      const inspection = await inspectPersistent(plan);
      if (
        (request.action === "install" ||
          request.action === "ensure-running" ||
          request.action === "uninstall") &&
        hasUntrustedInspection(inspection)
      ) {
        return {
          ok: false,
          action: request.action,
          manager: inspection.manager,
          commands: inspection.commands,
          templateWritten: false,
          configCurrent: inspection.manager.configCurrent,
        };
      }
      let sessionOwnedLiveRuntimePid: number | null = null;
      if (
        plan.supervisor === "scheduled-task" &&
        inspection.manager.active !== true
      ) {
        const liveRuntime = await inspectLiveRuntimeOwnership(definition, plan);
        if (
          liveRuntime &&
          !liveRuntime.ownedBySession &&
          (!inspection.manager.installed ||
            (request.action !== "stop" && request.action !== "uninstall"))
        ) {
          return liveRuntimeConflictResponse(
            plan,
            inspection,
            request.action,
            "The native task is absent but its recorded runtime is still alive and cannot be attributed to the session supervisor.",
          );
        }
        if (liveRuntime?.ownedBySession) {
          sessionOwnedLiveRuntimePid = liveRuntime.pid;
        }
      }
      if (
        request.action === "status" &&
        inspection.manager.installed &&
        inspection.manager.configCurrent &&
        plan.supervisor === "scheduled-task" &&
        inspection.manager.active === false &&
        inspection.manager.errorCode === null &&
        sessionOwnedLiveRuntimePid === null
      ) {
        const runtimePid = await readRuntimePid(definition.runtimePath);
        if (runtimePid !== null && processIsAlive(runtimePid)) {
          return {
            ok: false,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled: inspection.manager.enabled,
              active: null,
              state: "degraded",
              configCurrent: true,
              errorCode: "runtime-not-ready",
              errorMessage: "Scheduled task is stopped but its recorded runtime is still alive.",
            }),
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: true,
          };
        }
      }
      if (
        request.action === "status" &&
        inspection.manager.installed &&
        inspection.manager.configCurrent &&
        plan.supervisor === "scheduled-task" &&
        inspection.manager.active === true &&
        inspection.manager.errorCode === null
      ) {
        const sessionOwner = await session.status(definition.id);
        const sessionStopped = sessionOwner.active === false &&
          sessionOwner.state === "stopped";
        const proof = sessionStopped
          ? await verifyPersistentRuntimeStarted(definition, plan, true, 0)
          : { ready: false, commands: [] };
        let ready = proof.ready;
        if (ready) {
          const confirmedSession = await session.status(definition.id);
          ready = confirmedSession.active === false &&
            confirmedSession.state === "stopped";
        }
        return {
          ok: ready,
          action: request.action,
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: inspection.manager.enabled,
            active: ready ? true : null,
            state: ready ? "running" : "degraded",
            configCurrent: true,
            errorCode: ready ? null : "runtime-not-ready",
            errorMessage: ready ? null : stableErrorMessage("runtime-not-ready"),
          }),
          commands: [...inspection.commands, ...proof.commands],
          templateWritten: false,
          configCurrent: true,
        };
      }
      if (
        request.action === "status" &&
        inspection.manager.installed &&
        inspection.manager.configCurrent &&
        plan.supervisor !== "scheduled-task" &&
        inspection.manager.active === null &&
        inspection.manager.errorCode === null
      ) {
        const sessionOwner = await session.status(definition.id);
        if (
          sessionOwner.active !== false ||
          sessionOwner.state !== "stopped"
        ) {
          return {
            ok: true,
            action: request.action,
            manager: inspection.manager,
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: true,
          };
        }
        let ready = await probeHealth(definition.healthUrl);
        if (ready) {
          const confirmedSession = await session.status(definition.id);
          ready = confirmedSession.active === false &&
            confirmedSession.state === "stopped";
        }
        if (!ready && plan.supervisor !== "launchd-user") {
          return {
            ok: true,
            action: request.action,
            manager: inspection.manager,
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: true,
          };
        }
        return {
          ok: ready,
          action: request.action,
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: inspection.manager.enabled,
            active: ready ? true : null,
            state: ready ? "running" : "degraded",
            configCurrent: true,
            errorCode: ready ? null : "runtime-not-ready",
            errorMessage: ready ? null : stableErrorMessage("runtime-not-ready"),
          }),
          commands: inspection.commands,
          templateWritten: false,
          configCurrent: true,
        };
      }
      if (
        request.apply &&
        request.action === "uninstall" &&
        !inspection.manager.installed
      ) {
        try {
          await fileSystem.unlink(plan.configPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            return {
              ok: false,
              action: request.action,
              manager: persistentManagerStatus(plan, {
                installed: false,
                enabled: false,
                active: false,
                state: "failed",
                configCurrent: inspection.manager.configCurrent,
                errorCode: "template-invalid",
                errorMessage: "Persistent service template could not be removed.",
              }),
              commands: inspection.commands,
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
        }
        const postUnlinkSequence = await runSequence(
          systemdPostUnlinkCommands(plan),
          request.action,
        );
        if (!postUnlinkSequence.ok) {
          const errorCode = classifySupervisorFailure(
            postUnlinkSequence.failure!,
          );
          return {
            ok: false,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled: false,
              active: false,
              state: "failed",
              configCurrent: false,
              errorCode,
              errorMessage: stableErrorMessage(errorCode),
            }),
            commands: [
              ...inspection.commands,
              ...postUnlinkSequence.commands,
            ],
            templateWritten: false,
            configCurrent: false,
          };
        }
        return {
          ok: true,
          action: request.action,
          manager: sessionReadyStatus(),
          commands: [
            ...inspection.commands,
            ...postUnlinkSequence.commands,
          ],
          templateWritten: false,
          configCurrent: true,
        };
      }
      if (
        request.action === "repair" &&
        (!inspection.manager.installed ||
          (inspection.manager.errorCode !== null &&
            inspection.manager.errorCode !== "stale-config" &&
            inspection.manager.errorCode !== "runtime-not-ready"))
      ) {
        return {
          ok: false,
          action: request.action,
          manager: inspection.manager,
          commands: inspection.commands,
          templateWritten: false,
          configCurrent: inspection.manager.configCurrent,
        };
      }
      if (
        (request.action === "start" ||
          request.action === "restart" ||
          request.action === "stop") &&
        hasUntrustedStatus(inspection.manager)
      ) {
        return {
          ok: false,
          action: request.action,
          manager: inspection.manager,
          commands: inspection.commands,
          templateWritten: false,
          configCurrent: inspection.manager.configCurrent,
        };
      }
      if (
        request.apply &&
        plan.supervisor === "scheduled-task" &&
        inspection.manager.installed &&
        inspection.manager.active !== true &&
        (request.action === "start" ||
          request.action === "restart" ||
          request.action === "ensure-running" ||
          request.action === "install")
      ) {
        const recordedRuntimePid = await readRuntimePid(definition.runtimePath);
        if (
          recordedRuntimePid !== null &&
          processIsAlive(recordedRuntimePid) &&
          recordedRuntimePid !== sessionOwnedLiveRuntimePid &&
          !(
            sessionOwnedLiveRuntimePid !== null &&
            scheduledTaskMayOwnRuntime(
              plan,
              inspection.manager,
              null,
              processIsAlive,
            )
          )
        ) {
          return {
            ok: false,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled: inspection.manager.enabled,
              active: null,
              state: "degraded",
              configCurrent: inspection.manager.configCurrent,
              errorCode: "runtime-not-ready",
              errorMessage: "Scheduled task is not Running but its recorded runtime is still alive.",
            }),
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }
      }
      let effectiveAction = request.action;
      if (
        request.action === "restart" &&
        plan.supervisor === "scheduled-task" &&
        inspection.manager.active === false
      ) {
        effectiveAction = "start";
      }
      let sessionOwnerVerifiedStopped = false;
      if (request.apply && request.action === "ensure-running") {
        if (!inspection.manager.installed) {
          effectiveAction = "install";
        } else if (!inspection.manager.configCurrent) {
          effectiveAction = "repair";
        } else if (inspection.manager.errorCode !== null) {
          return {
            ok: false,
            action: request.action,
            manager: inspection.manager,
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        } else {
          let running = inspection.manager.active === true;
          if (
            inspection.manager.active === null &&
            sessionOwnedLiveRuntimePid === null
          ) {
            running = await probeHealth(definition.healthUrl);
          }
          const needsEnable = plan.supervisor === "scheduled-task" &&
            inspection.manager.enabled === false;
          if (running && !needsEnable) {
            const response = await finishRunningNoOp(
              definition,
              request,
              plan,
              inspection,
            );
            if (response) {
              return response;
            }
            sessionOwnerVerifiedStopped = true;
          }
          effectiveAction = inspection.manager.active === true && !needsEnable
            ? "restart"
            : "start";
        }
      }
      if (
        request.apply &&
        request.action === "start" &&
        inspection.manager.installed &&
        inspection.manager.configCurrent &&
        inspection.manager.errorCode === null
      ) {
        let running = inspection.manager.active === true;
        if (
          inspection.manager.active === null &&
          sessionOwnedLiveRuntimePid === null
        ) {
          running = await probeHealth(definition.healthUrl);
        }
        const needsEnable = plan.supervisor === "scheduled-task" &&
          inspection.manager.enabled === false;
        if (running && !needsEnable) {
          const response = await finishRunningNoOp(
            definition,
            request,
            plan,
            inspection,
          );
          if (response) {
            return response;
          }
          sessionOwnerVerifiedStopped = true;
        }
        if (sessionOwnerVerifiedStopped && inspection.manager.active === true) {
          effectiveAction = "restart";
        }
      }
      if (
        request.apply &&
        request.action === "install" &&
        inspection.manager.installed
      ) {
        if (!inspection.manager.configCurrent) {
          effectiveAction = "repair";
        } else if (inspection.manager.errorCode !== null) {
          return {
            ok: false,
            action: request.action,
            manager: inspection.manager,
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        } else {
          let running = inspection.manager.active === true;
          if (
            inspection.manager.active === null &&
            sessionOwnedLiveRuntimePid === null
          ) {
            running = await probeHealth(definition.healthUrl);
          }
          const needsEnable = plan.supervisor === "scheduled-task" &&
            inspection.manager.enabled === false;
          if (running && !needsEnable) {
            const response = await finishRunningNoOp(
              definition,
              request,
              plan,
              inspection,
            );
            if (response) return response;
            sessionOwnerVerifiedStopped = true;
          }
          effectiveAction = inspection.manager.active === true && !needsEnable
            ? "restart"
            : "start";
        }
      }
      if (
        request.apply &&
        plan.supervisor === "scheduled-task" &&
        inspection.manager.state === "starting" &&
        sessionOwnedLiveRuntimePid !== null &&
        effectiveAction === "start"
      ) {
        effectiveAction = "restart";
      }
      const lifecycleAction =
        effectiveAction === "install" || effectiveAction === "repair"
          ? effectiveAction
          : null;
      if (
        request.apply &&
        lifecycleAction &&
        templateContainsRedactedValue(definition, plan)
      ) {
        return {
          ok: false,
          action: request.action,
          manager: persistentManagerStatus(plan, {
            installed: inspection.manager.installed,
            enabled: inspection.manager.enabled,
            active: inspection.manager.active,
            state: "failed",
            configCurrent: inspection.manager.configCurrent,
            errorCode: "template-invalid",
            errorMessage: stableErrorMessage("template-invalid"),
          }),
          commands: inspection.commands,
          templateWritten: false,
          configCurrent: inspection.manager.configCurrent,
        };
      }
      let previousLifecycleTemplate: string | null = null;
      if (request.apply && lifecycleAction) {
        try {
          previousLifecycleTemplate = String(
            await fileSystem.readFile(plan.configPath, "utf8"),
          );
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            return {
              ok: false,
              action: request.action,
              manager: persistentManagerStatus(plan, {
                installed: inspection.manager.installed,
                enabled: inspection.manager.enabled,
                active: inspection.manager.active,
                state: "failed",
                configCurrent: false,
                errorCode: "template-invalid",
                errorMessage: stableErrorMessage("template-invalid"),
              }),
              commands: inspection.commands,
              templateWritten: false,
              configCurrent: false,
            };
          }
        }
      }
      if (
        request.apply &&
        lifecycleAction === "repair" &&
        plan.supervisor === "scheduled-task" &&
        inspection.manager.installed &&
        previousLifecycleTemplate === null
      ) {
        return {
          ok: false,
          action: request.action,
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: inspection.manager.enabled,
            active: inspection.manager.active,
            state: "failed",
            configCurrent: false,
            errorCode: "template-invalid",
            errorMessage: "Persistent service template is missing; repair was not applied because the existing task cannot be rolled back safely.",
          }),
          commands: inspection.commands,
          templateWritten: false,
          configCurrent: false,
        };
      }
      if (request.apply && lifecycleAction) {
        const stopped = await session.stop(definition.id);
        if (stopped.active !== false || stopped.state !== "stopped") {
          const manager: TracevaneServiceManagerStatus = {
            ...normalizeManagerStatus(stopped),
            errorCode: stopped.errorCode ?? "runtime-not-ready",
            errorMessage: "Session owner did not stop.",
          };
          return {
            ok: false,
            action: request.action,
            manager,
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }
        const lifecycleRuntimePid = plan.supervisor === "scheduled-task"
          ? await readRuntimePid(definition.runtimePath)
          : null;
        const persistentRuntimePid = sessionOwnedLiveRuntimePid !== null &&
            lifecycleRuntimePid === sessionOwnedLiveRuntimePid
          ? null
          : lifecycleRuntimePid;
        const persistentMayOwnRuntime = lifecycleAction === "repair" &&
          scheduledTaskMayOwnRuntime(
            plan,
            inspection.manager,
            persistentRuntimePid,
            processIsAlive,
          );
        if (
          sessionOwnedLiveRuntimePid !== null &&
          !(persistentMayOwnRuntime
            ? await verifyRecordedProcessStopped(sessionOwnedLiveRuntimePid)
            : await verifyRecordedRuntimeStopped(
              definition,
              sessionOwnedLiveRuntimePid,
            ))
        ) {
          return liveRuntimeConflictResponse(
            plan,
            inspection,
            request.action,
            "The previous session runtime did not stop; persistent installation was not attempted.",
          );
        }

        let lifecyclePrefixCommands: SupervisorCommandResult[] = [];
        let persistentStoppedForLifecycle = false;
        if (
          plan.supervisor === "scheduled-task" &&
          persistentMayOwnRuntime
        ) {
          const stopSequence = await runSequence(
            plan.commands.stop ?? [],
            effectiveAction,
          );
          lifecyclePrefixCommands = stopSequence.commands;
          if (!stopSequence.ok) {
            const errorCode = classifySupervisorFailure(stopSequence.failure!);
            return {
              ok: false,
              action: request.action,
              manager: persistentManagerStatus(plan, {
                installed: true,
                enabled: inspection.manager.enabled,
                active: inspection.manager.active,
                state: "failed",
                configCurrent: inspection.manager.configCurrent,
                errorCode,
                errorMessage: stableErrorMessage(errorCode),
              }),
              commands: [...inspection.commands, ...lifecyclePrefixCommands],
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
          const proof = sessionOwnedLiveRuntimePid !== null
            ? await verifyScheduledTaskStoppedAfterSessionTransition(
              definition,
              plan,
              sessionOwnedLiveRuntimePid,
              lifecycleRuntimePid,
              false,
            )
            : await verifyPersistentRuntimeStopped(
              definition,
              plan,
              lifecycleRuntimePid,
            );
          lifecyclePrefixCommands = [
            ...lifecyclePrefixCommands,
            ...proof.commands,
          ];
          if (!proof.stopped) {
            return {
              ok: false,
              action: request.action,
              manager: persistentManagerStatus(plan, {
                installed: true,
                enabled: inspection.manager.enabled,
                active: null,
                state: "degraded",
                configCurrent: inspection.manager.configCurrent,
                errorCode: "runtime-not-ready",
                errorMessage: stableErrorMessage("runtime-not-ready"),
              }),
              commands: [...inspection.commands, ...lifecyclePrefixCommands],
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
          persistentStoppedForLifecycle = true;
        }

        try {
          await writeTemplateAtomic(definition, plan);
        } catch {
          const recoveryCommands: SupervisorCommandResult[] = [];
          let previousOwnerRestored = false;
          if (
            plan.supervisor === "scheduled-task" &&
            persistentStoppedForLifecycle &&
            previousLifecycleTemplate !== null
          ) {
            const restoreStart = await runSequence(
              plan.commands.start ?? [],
              effectiveAction,
            );
            recoveryCommands.push(...restoreStart.commands);
            if (restoreStart.ok) {
              const restoreProof = await verifyPersistentRuntimeStarted(
                definition,
                plan,
                false,
              );
              recoveryCommands.push(...restoreProof.commands);
              previousOwnerRestored = restoreProof.ready;
            }
          }
          const manager = persistentManagerStatus(plan, {
            installed: inspection.manager.installed,
            enabled: inspection.manager.enabled,
            active: previousOwnerRestored
              ? true
              : persistentStoppedForLifecycle
                ? null
              : inspection.manager.active,
            state: "failed",
            configCurrent: inspection.manager.configCurrent,
            errorCode: "template-invalid",
            errorMessage: "Persistent service template could not be written.",
          });
          return {
            ok: false,
            action: request.action,
            manager,
            commands: [
              ...inspection.commands,
              ...lifecyclePrefixCommands,
              ...recoveryCommands,
            ],
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }

        let sequence: CommandSequenceResult;
        if (plan.supervisor === "scheduled-task") {
          const registration = await runSequence(
            plan.commands[lifecycleAction] ?? [],
            effectiveAction,
          );
          if (!registration.ok) {
            const rollbackCommands: SupervisorCommandResult[] = [];
            let rollbackOk = false;
            let postFailureInspection: PersistentInspection | null = null;

            if (inspection.manager.installed && previousLifecycleTemplate !== null) {
              const restored = await restoreScheduledTaskAfterFailedRepair(
                definition,
                plan,
                previousLifecycleTemplate,
                effectiveAction,
                persistentStoppedForLifecycle,
              );
              rollbackCommands.push(...restored.commands);
              rollbackOk = restored.restored;
            } else {
              postFailureInspection = await inspectPersistent(plan);
              rollbackCommands.push(...postFailureInspection.commands);
              if (!postFailureInspection.manager.installed) {
                try {
                  if (previousLifecycleTemplate === null) {
                    await fileSystem.unlink(plan.configPath);
                  } else {
                    await writeTextAtomic(plan.configPath, previousLifecycleTemplate);
                  }
                  rollbackOk = true;
                } catch (error) {
                  rollbackOk = previousLifecycleTemplate === null &&
                    (error as NodeJS.ErrnoException).code === "ENOENT";
                }
              }
            }

            const failureCode = classifySupervisorFailure(registration.failure!);
            if (!inspection.manager.installed && postFailureInspection?.manager.installed) {
              return {
                ok: false,
                action: request.action,
                manager: persistentManagerStatus(plan, {
                  installed: true,
                  enabled: postFailureInspection.manager.enabled,
                  active: null,
                  state: "failed",
                  configCurrent: false,
                  errorCode: failureCode,
                  errorMessage: stableErrorMessage(failureCode),
                }),
                commands: [
                  ...inspection.commands,
                  ...lifecyclePrefixCommands,
                  ...registration.commands,
                  ...rollbackCommands,
                ],
                templateWritten: true,
                configCurrent: false,
              };
            }

            const errorCode = rollbackOk ? failureCode : "template-invalid";
            const installed = inspection.manager.installed;
            const rolledBackConfigCurrent = installed
              ? false
              : previousLifecycleTemplate === plan.template;
            return {
              ok: false,
              action: request.action,
              manager: persistentManagerStatus(plan, {
                installed,
                enabled: installed ? inspection.manager.enabled : false,
                active: installed
                  ? persistentStoppedForLifecycle
                    ? rollbackOk ? true : null
                    : inspection.manager.active
                  : false,
                state: "failed",
                configCurrent: rolledBackConfigCurrent,
                errorCode: installed ? errorCode : failureCode,
                errorMessage: installed
                  ? stableErrorMessage(errorCode)
                  : stableErrorMessage(failureCode),
              }),
              commands: [
                ...inspection.commands,
                ...lifecyclePrefixCommands,
                ...registration.commands,
                ...rollbackCommands,
              ],
              templateWritten: false,
              configCurrent: rolledBackConfigCurrent,
            };
          }

          const activation = await runSequence(
            plan.commands.start ?? [],
            effectiveAction,
          );
          sequence = {
            ok: activation.ok,
            commands: [
              ...lifecyclePrefixCommands,
              ...registration.commands,
              ...activation.commands,
            ],
            failure: activation.failure,
          };
          if (!activation.ok) {
            let postFailureInspection = await inspectPersistent(plan);
            const postFailureCommands = [...postFailureInspection.commands];
            const errorCode = classifySupervisorFailure(activation.failure!);
            const rollbackCommands: SupervisorCommandResult[] = [];
            let finalInspectionCommands: SupervisorCommandResult[] = [];
            if (
              lifecycleAction === "repair" &&
              persistentStoppedForLifecycle &&
              previousLifecycleTemplate !== null
            ) {
              const rollback = await rollbackActiveScheduledRepair(
                definition,
                plan,
                previousLifecycleTemplate,
                postFailureInspection,
                effectiveAction,
              );
              rollbackCommands.push(...rollback.commands);
              if (rollback.restored) {
                return {
                  ok: false,
                  action: request.action,
                  manager: persistentManagerStatus(plan, {
                    installed: true,
                    enabled: inspection.manager.enabled,
                    active: true,
                    state: "failed",
                    configCurrent: false,
                    errorCode,
                    errorMessage: stableErrorMessage(errorCode),
                  }),
                  commands: [
                    ...inspection.commands,
                    ...sequence.commands,
                    ...postFailureCommands,
                    ...rollbackCommands,
                  ],
                  templateWritten: false,
                  configCurrent: false,
                };
              }
              postFailureInspection = await inspectPersistent(plan);
              finalInspectionCommands = postFailureInspection.commands;
            }
            return {
              ok: false,
              action: request.action,
              manager: persistentManagerStatus(plan, {
                installed: postFailureInspection.manager.installed,
                enabled: postFailureInspection.manager.enabled,
                active: postFailureInspection.manager.active,
                state: "degraded",
                configCurrent: postFailureInspection.manager.configCurrent,
                errorCode,
                errorMessage: stableErrorMessage(errorCode),
              }),
              commands: [
                ...inspection.commands,
                ...sequence.commands,
                ...postFailureCommands,
                ...rollbackCommands,
                ...finalInspectionCommands,
              ],
              templateWritten: postFailureInspection.manager.configCurrent,
              configCurrent: postFailureInspection.manager.configCurrent,
            };
          }
        } else {
          sequence = await runSequence(
            lifecycleCommands(plan, lifecycleAction),
            effectiveAction,
          );
          if (!sequence.ok) {
            let rollbackOk = true;
            try {
              if (previousLifecycleTemplate === null) {
                try {
                  await fileSystem.unlink(plan.configPath);
                } catch (error) {
                  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
                }
              } else {
                await writeTextAtomic(plan.configPath, previousLifecycleTemplate);
              }
            } catch {
              rollbackOk = false;
            }
            const errorCode = rollbackOk
              ? classifySupervisorFailure(sequence.failure!)
              : "template-invalid";
            const manager = persistentManagerStatus(plan, {
              installed: inspection.manager.installed,
              enabled: inspection.manager.enabled,
              active: inspection.manager.active,
              state: "failed",
              configCurrent: rollbackOk
                ? inspection.manager.configCurrent
                : false,
              errorCode,
              errorMessage: stableErrorMessage(errorCode),
            });
            return {
              ok: false,
              action: request.action,
              manager,
              commands: [...inspection.commands, ...sequence.commands],
              templateWritten: false,
              configCurrent: rollbackOk
                ? inspection.manager.configCurrent
                : false,
            };
          }
        }

        const startProof = await verifyPersistentRuntimeStarted(
          definition,
          plan,
        );
        sequence = {
          ...sequence,
          commands: [...sequence.commands, ...startProof.commands],
        };
        const ready = startProof.ready;
        if (
          !ready &&
          plan.supervisor === "scheduled-task" &&
          lifecycleAction === "repair" &&
          persistentStoppedForLifecycle &&
          previousLifecycleTemplate !== null
        ) {
          const postFailureInspection = await inspectPersistent(plan);
          const rollback = await rollbackActiveScheduledRepair(
            definition,
            plan,
            previousLifecycleTemplate,
            postFailureInspection,
            effectiveAction,
          );
          sequence = {
            ...sequence,
            commands: [
              ...sequence.commands,
              ...postFailureInspection.commands,
              ...rollback.commands,
            ],
          };
          if (rollback.restored) {
            return {
              ok: false,
              action: request.action,
              manager: persistentManagerStatus(plan, {
                installed: true,
                enabled: inspection.manager.enabled,
                active: true,
                state: "degraded",
                configCurrent: false,
                errorCode: "runtime-not-ready",
                errorMessage: "New service did not become ready; the previous service was restored.",
              }),
              commands: [...inspection.commands, ...sequence.commands],
              templateWritten: false,
              configCurrent: false,
            };
          }
          const finalInspection = await inspectPersistent(plan);
          return {
            ok: false,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: finalInspection.manager.installed,
              enabled: finalInspection.manager.enabled,
              active: finalInspection.manager.active,
              state: "degraded",
              configCurrent: finalInspection.manager.configCurrent,
              errorCode: "runtime-not-ready",
              errorMessage: "Persistent service did not become ready and rollback was not confirmed.",
            }),
            commands: [
              ...inspection.commands,
              ...sequence.commands,
              ...finalInspection.commands,
            ],
            templateWritten: finalInspection.manager.configCurrent,
            configCurrent: finalInspection.manager.configCurrent,
          };
        }
        const manager = persistentManagerStatus(plan, {
          installed: true,
          enabled: true,
          active: ready ? true : null,
          state: ready ? "running" : "degraded",
          configCurrent: true,
          errorCode: ready ? null : "runtime-not-ready",
          errorMessage: ready ? null : "Persistent service did not become ready.",
        });
        return {
          ok: ready,
          action: request.action,
          manager,
          commands: [...inspection.commands, ...sequence.commands],
          templateWritten: true,
          configCurrent: true,
        };
      }
      if (
        request.apply &&
        (effectiveAction === "start" ||
          effectiveAction === "restart" ||
          effectiveAction === "stop") &&
        inspection.manager.installed &&
        (effectiveAction === "stop" || inspection.manager.configCurrent)
      ) {
        let observedRuntimePid = plan.supervisor === "scheduled-task"
          ? await readRuntimePid(definition.runtimePath)
          : null;
        let persistentRuntimePid = sessionOwnedLiveRuntimePid !== null &&
            observedRuntimePid === sessionOwnedLiveRuntimePid
          ? null
          : observedRuntimePid;
        let persistentMayOwnRuntime = scheduledTaskMayOwnRuntime(
          plan,
          inspection.manager,
          persistentRuntimePid,
          processIsAlive,
        );
        const nativeTaskMayOwnRuntime = scheduledTaskMayOwnRuntime(
          plan,
          inspection.manager,
          null,
          processIsAlive,
        );
        if (
          (effectiveAction === "start" || effectiveAction === "restart") &&
          !sessionOwnerVerifiedStopped
        ) {
          if (
            persistentRuntimePid !== null &&
            processIsAlive(persistentRuntimePid) &&
            !nativeTaskMayOwnRuntime
          ) {
            return liveRuntimeConflictResponse(
              plan,
              inspection,
              request.action,
              "A recorded runtime appeared or changed before the session owner stopped.",
            );
          }
          const stopped = await session.stop(definition.id);
          if (stopped.active !== false || stopped.state !== "stopped") {
            const manager: TracevaneServiceManagerStatus = {
              ...normalizeManagerStatus(stopped),
              errorCode: stopped.errorCode ?? "runtime-not-ready",
              errorMessage: "Session owner did not stop.",
            };
            return {
              ok: false,
              action: request.action,
              manager,
              commands: inspection.commands,
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
          observedRuntimePid = plan.supervisor === "scheduled-task"
            ? await readRuntimePid(definition.runtimePath)
            : null;
          persistentRuntimePid = sessionOwnedLiveRuntimePid !== null &&
              observedRuntimePid === sessionOwnedLiveRuntimePid
            ? null
            : observedRuntimePid;
          persistentMayOwnRuntime = scheduledTaskMayOwnRuntime(
            plan,
            inspection.manager,
            persistentRuntimePid,
            processIsAlive,
          );
          if (
            persistentRuntimePid !== null &&
            processIsAlive(persistentRuntimePid) &&
            !nativeTaskMayOwnRuntime
          ) {
            return liveRuntimeConflictResponse(
              plan,
              inspection,
              request.action,
              "A recorded runtime appeared or changed while the session owner was stopping.",
            );
          }
          if (
            sessionOwnedLiveRuntimePid !== null &&
            !(nativeTaskMayOwnRuntime
              ? await verifyRecordedProcessStopped(sessionOwnedLiveRuntimePid)
              : await verifyRecordedRuntimeStopped(
                definition,
                sessionOwnedLiveRuntimePid,
              ))
          ) {
            return liveRuntimeConflictResponse(
              plan,
              inspection,
              request.action,
              "The previous session runtime did not stop; persistent takeover was not attempted.",
            );
          }
        }
        let sequence: CommandSequenceResult;
        let persistentStopped = false;
        if (
          plan.supervisor === "scheduled-task" &&
          effectiveAction === "restart" &&
          persistentMayOwnRuntime
        ) {
          const stopSequence = await runSequence(
            plan.commands.stop ?? [],
            "restart",
          );
          if (!stopSequence.ok) {
            sequence = stopSequence;
          } else {
            const proof = sessionOwnedLiveRuntimePid !== null
              ? await verifyScheduledTaskStoppedAfterSessionTransition(
                definition,
                plan,
                sessionOwnedLiveRuntimePid,
                observedRuntimePid,
                false,
              )
              : await verifyPersistentRuntimeStopped(
                definition,
                plan,
                persistentRuntimePid,
              );
            if (!proof.stopped) {
              return {
                ok: false,
                action: request.action,
                manager: persistentManagerStatus(plan, {
                  installed: true,
                  enabled: inspection.manager.enabled,
                  active: null,
                  state: "degraded",
                  configCurrent: inspection.manager.configCurrent,
                  errorCode: "runtime-not-ready",
                  errorMessage: stableErrorMessage("runtime-not-ready"),
                }),
                commands: [
                  ...inspection.commands,
                  ...stopSequence.commands,
                  ...proof.commands,
                ],
                templateWritten: false,
                configCurrent: inspection.manager.configCurrent,
              };
            }
            persistentStopped = true;
            const startSequence = await runSequence(
              plan.commands.start ?? [],
              "restart",
            );
            sequence = {
              ok: startSequence.ok,
              commands: [
                ...stopSequence.commands,
                ...proof.commands,
                ...startSequence.commands,
              ],
              failure: startSequence.failure,
            };
          }
        } else {
          sequence = await runSequence(
            plan.commands[effectiveAction] ?? [],
            effectiveAction,
          );
        }
        const scheduledTaskEnabled = plan.supervisor === "scheduled-task" &&
            sequence.commands.some((command) =>
              command.ok &&
              command.args[0]?.toUpperCase() === "/CHANGE" &&
              command.args.some((argument) => argument.toUpperCase() === "/ENABLE")
            )
          ? true
          : inspection.manager.enabled;
        if (!sequence.ok) {
          const errorCode = classifySupervisorFailure(sequence.failure!);
          return {
            ok: false,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled: scheduledTaskEnabled,
              active: persistentStopped ? false : inspection.manager.active,
              state: "failed",
              configCurrent: inspection.manager.configCurrent,
              errorCode,
              errorMessage: stableErrorMessage(errorCode),
            }),
            commands: [...inspection.commands, ...sequence.commands],
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }

        if (effectiveAction === "stop") {
          let stopped = true;
          if (persistentMayOwnRuntime) {
            const proof = sessionOwnedLiveRuntimePid !== null
              ? await verifyScheduledTaskStoppedAfterSessionTransition(
                definition,
                plan,
                sessionOwnedLiveRuntimePid,
                observedRuntimePid,
                true,
              )
              : await verifyPersistentRuntimeStopped(
                definition,
                plan,
                persistentRuntimePid,
              );
            sequence = {
              ...sequence,
              commands: [...sequence.commands, ...proof.commands],
            };
            stopped = proof.stopped;
          }
          return {
            ok: stopped,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled: inspection.manager.enabled,
              active: stopped ? false : null,
              state: stopped ? "stopped" : "degraded",
              configCurrent: inspection.manager.configCurrent,
              errorCode: stopped ? null : "runtime-not-ready",
              errorMessage: stopped ? null : stableErrorMessage("runtime-not-ready"),
            }),
            commands: [...inspection.commands, ...sequence.commands],
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }

        const startProof = await verifyPersistentRuntimeStarted(
          definition,
          plan,
        );
        sequence = {
          ...sequence,
          commands: [...sequence.commands, ...startProof.commands],
        };
        const ready = startProof.ready;
        return {
          ok: ready,
          action: request.action,
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: scheduledTaskEnabled,
            active: ready ? true : null,
            state: ready ? "running" : "degraded",
            configCurrent: true,
            errorCode: ready ? null : "runtime-not-ready",
            errorMessage: ready ? null : stableErrorMessage("runtime-not-ready"),
          }),
          commands: [...inspection.commands, ...sequence.commands],
          templateWritten: false,
          configCurrent: true,
        };
      }
      if (
        request.apply &&
        request.action === "uninstall" &&
        inspection.manager.installed &&
        (inspection.manager.errorCode === null ||
          inspection.manager.errorCode === "stale-config" ||
          inspection.manager.errorCode === "runtime-not-ready")
      ) {
        let sequence: CommandSequenceResult;
        if (plan.supervisor === "scheduled-task") {
          const observedRuntimePid = await readRuntimePid(definition.runtimePath);
          const persistentRuntimePid = sessionOwnedLiveRuntimePid !== null &&
              observedRuntimePid === sessionOwnedLiveRuntimePid
            ? null
            : observedRuntimePid;
          const persistentMayOwnRuntime = scheduledTaskMayOwnRuntime(
            plan,
            inspection.manager,
            persistentRuntimePid,
            processIsAlive,
          );
          let stopCommands: SupervisorCommandResult[] = [];
          if (persistentMayOwnRuntime) {
            const stopSequence = await runSequence(
              plan.commands.stop ?? [],
              request.action,
            );
            stopCommands = stopSequence.commands;
            if (!stopSequence.ok) {
              sequence = stopSequence;
            } else {
              const proof = sessionOwnedLiveRuntimePid !== null
                ? await verifyScheduledTaskStoppedAfterSessionTransition(
                  definition,
                  plan,
                  sessionOwnedLiveRuntimePid,
                  observedRuntimePid,
                  true,
                )
                : await verifyPersistentRuntimeStopped(
                  definition,
                  plan,
                  persistentRuntimePid,
                );
              stopCommands = [...stopCommands, ...proof.commands];
              if (!proof.stopped) {
                return {
                  ok: false,
                  action: request.action,
                  manager: persistentManagerStatus(plan, {
                    installed: true,
                    enabled: inspection.manager.enabled,
                    active: null,
                    state: "degraded",
                    configCurrent: inspection.manager.configCurrent,
                    errorCode: "runtime-not-ready",
                    errorMessage: stableErrorMessage("runtime-not-ready"),
                  }),
                  commands: [...inspection.commands, ...stopCommands],
                  templateWritten: false,
                  configCurrent: inspection.manager.configCurrent,
                };
              }
              const uninstallSequence = await runSequence(
                plan.commands.uninstall ?? [],
                request.action,
              );
              sequence = {
                ok: uninstallSequence.ok,
                commands: [...stopCommands, ...uninstallSequence.commands],
                failure: uninstallSequence.failure,
              };
            }
          } else {
            sequence = await runSequence(
              plan.commands.uninstall ?? [],
              request.action,
            );
          }
        } else {
          sequence = await runSequence(
            uninstallCommands(plan),
            request.action,
          );
        }
        if (!sequence.ok) {
          const errorCode = classifySupervisorFailure(sequence.failure!);
          const manager = persistentManagerStatus(plan, {
            installed: true,
            enabled: inspection.manager.enabled,
            active: inspection.manager.active,
            state: "failed",
            configCurrent: inspection.manager.configCurrent,
            errorCode,
            errorMessage: stableErrorMessage(errorCode),
          });
          return {
            ok: false,
            action: request.action,
            manager,
            commands: [...inspection.commands, ...sequence.commands],
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }
        try {
          await fileSystem.unlink(plan.configPath);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
            const manager = persistentManagerStatus(plan, {
              installed: true,
              enabled: false,
              active: false,
              state: "failed",
              configCurrent: inspection.manager.configCurrent,
              errorCode: "template-invalid",
              errorMessage: "Persistent service template could not be removed.",
            });
            return {
              ok: false,
              action: request.action,
              manager,
              commands: [...inspection.commands, ...sequence.commands],
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
        }
        const postUnlinkSequence = await runSequence(
          systemdPostUnlinkCommands(plan),
          request.action,
        );
        if (!postUnlinkSequence.ok) {
          const errorCode = classifySupervisorFailure(
            postUnlinkSequence.failure!,
          );
          return {
            ok: false,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled: false,
              active: false,
              state: "failed",
              configCurrent: false,
              errorCode,
              errorMessage: stableErrorMessage(errorCode),
            }),
            commands: [
              ...inspection.commands,
              ...sequence.commands,
              ...postUnlinkSequence.commands,
            ],
            templateWritten: false,
            configCurrent: false,
          };
        }
        return {
          ok: true,
          action: request.action,
          manager: sessionReadyStatus(),
          commands: [
            ...inspection.commands,
            ...sequence.commands,
            ...postUnlinkSequence.commands,
          ],
          templateWritten: false,
          configCurrent: true,
        };
      }
      return {
        ok: inspection.manager.errorCode === null,
        action: request.action,
        manager: inspection.manager,
        commands: inspection.commands,
        templateWritten: false,
        configCurrent: inspection.manager.configCurrent,
      };
  }

  const operationQueues = new Map<ServiceDefinition["id"], Promise<void>>();
  let disposed = false;
  let disposal: Promise<void> | null = null;

  return {
    manage(definition, request) {
      if (disposed) {
        return Promise.reject(new Error("Service manager has been disposed."));
      }
      const previous = operationQueues.get(definition.id) ?? Promise.resolve();
      const operation = previous
        .catch(() => undefined)
        .then(() => manageService(definition, request));
      const tail = operation.then(
        () => undefined,
        () => undefined,
      );
      operationQueues.set(definition.id, tail);
      return operation.finally(() => {
        if (operationQueues.get(definition.id) === tail) {
          operationQueues.delete(definition.id);
        }
      });
    },

    dispose() {
      if (disposal) return disposal;
      disposed = true;
      const pending = [...operationQueues.values()];
      disposal = (async () => {
        await Promise.allSettled(pending);
        operationQueues.clear();
        await session.dispose();
      })();
      return disposal;
    },
  };
}
