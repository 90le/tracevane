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
import { createSupervisorPlan } from "./platform-plans.js";
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
  probe?: (url: string) => Promise<boolean>;
  platform?: NodeJS.Platform;
  homeDir?: string;
  fs?: Pick<
    typeof nativeFs,
    "mkdir" | "readFile" | "rename" | "unlink" | "writeFile"
  >;
  windowsUserId?: CreateSupervisorPlanOptions["windowsUserId"];
  commandTimeoutMs?: number;
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
  templateExists: boolean;
}

interface CommandSequenceResult {
  ok: boolean;
  commands: SupervisorCommandResult[];
  failure: SupervisorCommandResult | null;
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

function uninstallCommands(plan: SupervisorPlan): SupervisorCommand[] {
  if (plan.supervisor === "launchd-user") {
    return [...(plan.commands.uninstall ?? [])];
  }
  return [
    ...(plan.commands.stop ?? []),
    ...(plan.commands.uninstall ?? []),
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
  const commandTimeoutMs = Math.max(0, dependencies.commandTimeoutMs ?? 5_000);
  const secrets = dependencies.redact?.filter(Boolean) ?? [];

  async function probeHealth(url: string): Promise<boolean> {
    try {
      return await probe(url);
    } catch {
      return false;
    }
  }

  async function writeTemplateAtomic(plan: SupervisorPlan): Promise<void> {
    if (secrets.some((secret) => plan.template.includes(secret))) {
      throw new Error("Persistent service template contains a redacted value.");
    }
    const paths = platform === "win32" ? path.win32 : path.posix;
    const directory = paths.dirname(plan.configPath);
    const temporaryPath = paths.join(
      directory,
      `.${paths.basename(plan.configPath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    await fileSystem.mkdir(directory, { recursive: true });
    try {
      await fileSystem.writeFile(temporaryPath, plan.template, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await fileSystem.rename(temporaryPath, plan.configPath);
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

  async function runSequence(
    commands: SupervisorCommand[],
    action: TracevaneServiceAction,
  ): Promise<CommandSequenceResult> {
    const results: SupervisorCommandResult[] = [];
    for (const command of commands) {
      const rawResult = await runner(command, {
        timeoutMs: commandTimeoutMs,
        platform,
        action,
        redact: secrets,
      });
      const result = normalizeCommandEvidence(
        platform,
        command,
        rawResult,
        secrets,
      );
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
    let template: string;
    try {
      template = await fileSystem.readFile(plan.configPath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return {
        manager: persistentManagerStatus(plan, {}),
        commands: [],
        templateExists: false,
      };
    }

    const configCurrent = template === plan.template;
    const results: SupervisorCommandResult[] = [];
    if (plan.supervisor === "systemd-user") {
      let active: boolean | null = null;
      let enabled: boolean | null = null;
      let failed = false;
      for (const command of plan.commands.status ?? []) {
        const rawResult = await runner(command, {
          timeoutMs: commandTimeoutMs,
          platform,
          action: "status",
          redact: secrets,
        });
        let result = normalizeCommandEvidence(
          platform,
          command,
          rawResult,
          secrets,
        );
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
      const rawResult = await runner(command, {
        timeoutMs: commandTimeoutMs,
        platform,
        action: "status",
        redact: secrets,
      });
      let result = normalizeCommandEvidence(
        platform,
        command,
        rawResult,
        secrets,
      );
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
          errorCode: "task-not-found",
          errorMessage: stableErrorMessage("task-not-found"),
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
      return {
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
        templateExists: false,
      };
    }
  }

  async function manageService(
    definition: ServiceDefinition,
    request: ManageServiceRequest,
  ): Promise<ManageServiceResponse> {
      if (request.mode === "session") {
        let manager: TracevaneServiceManagerStatus;
        let transitionCommands: SupervisorCommandResult[] = [];
        if (!request.apply || request.action === "preview" || request.action === "status") {
          manager = await session.status(definition.id);
        } else if (request.action === "start" || request.action === "ensure-running") {
          const plan = createSupervisorPlan(definition, platform, homeDir, {
            windowsUserId: dependencies.windowsUserId,
          });
          const inspection = await inspectPersistent(plan);
          transitionCommands = inspection.commands;
          if (
            inspection.manager.installed &&
            inspection.manager.state === "unknown" &&
            inspection.manager.errorCode !== null
          ) {
            return {
              ok: false,
              action: request.action,
              manager: inspection.manager,
              commands: transitionCommands,
              templateWritten: false,
              configCurrent: inspection.manager.configCurrent,
            };
          }
          if (inspection.manager.installed) {
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
          }
          manager = await session.start(definition);
        } else if (request.action === "stop") {
          manager = await session.stop(definition.id);
        } else if (request.action === "restart") {
          manager = await session.stop(definition.id);
          if (manager.active === false && manager.state === "stopped") {
            const plan = createSupervisorPlan(definition, platform, homeDir, {
              windowsUserId: dependencies.windowsUserId,
            });
            const inspection = await inspectPersistent(plan);
            transitionCommands = inspection.commands;
            if (
              inspection.manager.installed &&
              inspection.manager.state === "unknown" &&
              inspection.manager.errorCode !== null
            ) {
              return {
                ok: false,
                action: request.action,
                manager: inspection.manager,
                commands: transitionCommands,
                templateWritten: false,
                configCurrent: inspection.manager.configCurrent,
              };
            }
            if (inspection.manager.installed) {
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
            }
            manager = await session.start(definition);
          }
        } else {
          manager = await session.status(definition.id);
        }
        manager = normalizeManagerStatus(manager);
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
        request.action === "status" &&
        inspection.manager.installed &&
        inspection.manager.configCurrent &&
        inspection.manager.active === null &&
        inspection.manager.errorCode === null &&
        await probeHealth(definition.healthUrl)
      ) {
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
        return {
          ok: true,
          action: request.action,
          manager: sessionReadyStatus(),
          commands: inspection.commands,
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
      let effectiveAction = request.action;
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
          if (inspection.manager.active === null) {
            running = await probeHealth(definition.healthUrl);
          }
          if (running) {
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
              commands: inspection.commands,
              templateWritten: false,
              configCurrent: true,
            };
          }
          effectiveAction = "start";
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
        if (inspection.manager.active === null) {
          running = await probeHealth(definition.healthUrl);
        }
        if (running) {
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
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: true,
          };
        }
      }
      const lifecycleAction =
        effectiveAction === "install" || effectiveAction === "repair"
          ? effectiveAction
          : null;
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

        try {
          await writeTemplateAtomic(plan);
        } catch {
          const manager = persistentManagerStatus(plan, {
            installed: inspection.manager.installed,
            enabled: inspection.manager.enabled,
            active: inspection.manager.active,
            state: "failed",
            configCurrent: false,
            errorCode: "template-invalid",
            errorMessage: "Persistent service template could not be written.",
          });
          return {
            ok: false,
            action: request.action,
            manager,
            commands: inspection.commands,
            templateWritten: false,
            configCurrent: false,
          };
        }

        const sequence = await runSequence(
          lifecycleCommands(plan, lifecycleAction),
          effectiveAction,
        );
        if (!sequence.ok) {
          const errorCode = classifySupervisorFailure(sequence.failure!);
          const manager = persistentManagerStatus(plan, {
            installed: true,
            enabled: null,
            active: null,
            state: "failed",
            configCurrent: true,
            errorCode,
            errorMessage: stableErrorMessage(errorCode),
          });
          return {
            ok: false,
            action: request.action,
            manager,
            commands: [...inspection.commands, ...sequence.commands],
            templateWritten: true,
            configCurrent: true,
          };
        }

        const ready = await probeHealth(definition.healthUrl);
        const manager = persistentManagerStatus(plan, {
          installed: true,
          enabled: true,
          active: ready,
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
        if (effectiveAction === "start" || effectiveAction === "restart") {
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
        }

        const sequence = await runSequence(
          plan.commands[effectiveAction] ?? [],
          effectiveAction,
        );
        if (!sequence.ok) {
          const errorCode = classifySupervisorFailure(sequence.failure!);
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
            commands: [...inspection.commands, ...sequence.commands],
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }

        if (effectiveAction === "stop") {
          return {
            ok: true,
            action: request.action,
            manager: persistentManagerStatus(plan, {
              installed: true,
              enabled: inspection.manager.enabled,
              active: false,
              state: "stopped",
              configCurrent: inspection.manager.configCurrent,
              errorCode: null,
              errorMessage: null,
            }),
            commands: [...inspection.commands, ...sequence.commands],
            templateWritten: false,
            configCurrent: inspection.manager.configCurrent,
          };
        }

        const ready = await probeHealth(definition.healthUrl);
        return {
          ok: ready,
          action: request.action,
          manager: persistentManagerStatus(plan, {
            installed: true,
            enabled: inspection.manager.enabled,
            active: ready,
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
        const sequence = await runSequence(
          uninstallCommands(plan),
          request.action,
        );
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
        return {
          ok: true,
          action: request.action,
          manager: sessionReadyStatus(),
          commands: [...inspection.commands, ...sequence.commands],
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
