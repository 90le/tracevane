import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import {
  OPENCLAW_RECOVERY_DEFAULT_PORT,
  OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
  type OpenClawRecoveryDaemonServicePlan,
  type OpenClawRecoveryDaemonServiceTemplate,
  type OpenClawRecoverySupervisorKind,
} from "../../../../types/openclaw-recovery.js";
import type { TracevaneServiceMode } from "../../../../types/supervisor.js";
import {
  createSupervisorPlan,
  type ServiceDefinition,
  type SupervisorPlan,
} from "../supervisor/index.js";
import {
  resolveOpenClawRecoveryPaths,
  resolveRecoveryHome,
} from "./paths.js";

const LAUNCHD_LABEL = "dev.openclaw.tracevane.recovery";
const WINDOWS_TASK_NAME = "TracevaneRecovery";

export interface CreateOpenClawRecoveryServiceDefinitionOptions {
  mode?: TracevaneServiceMode;
  platform?: NodeJS.Platform;
  port?: number;
}

export interface CreateOpenClawRecoveryDaemonServicePlanOptions {
  homeDir?: string;
  port?: number;
  windowsUserId?: string;
}

function persistentSupervisor(
  platform: NodeJS.Platform,
): OpenClawRecoverySupervisorKind {
  if (platform === "darwin") return "launchd-user";
  if (platform === "win32") return "scheduled-task";
  return "systemd-user";
}

export function createOpenClawRecoveryServiceDefinition(
  config: TracevaneServerConfig,
  options: CreateOpenClawRecoveryServiceDefinitionOptions = {},
): ServiceDefinition {
  const mode = options.mode ?? "session";
  const platform = options.platform ?? process.platform;
  const port = options.port ?? OPENCLAW_RECOVERY_DEFAULT_PORT;
  const paths = resolveOpenClawRecoveryPaths(config);
  const supervisor = mode === "session"
    ? "session"
    : persistentSupervisor(platform);

  return {
    id: "openclaw-recovery",
    displayName: "Tracevane Recovery Daemon",
    serviceName: OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
    windowsTaskName: WINDOWS_TASK_NAME,
    launchdLabel: LAUNCHD_LABEL,
    entryPath: path.join(
      config.projectRoot,
      "dist",
      "apps",
      "api",
      "openclaw-recovery-daemon.js",
    ),
    workingDirectory: config.projectRoot,
    configPath: config.openclawConfigFile,
    runtimePath: paths.runtimePath,
    logPath: paths.logPath,
    healthUrl: `http://127.0.0.1:${port}/health`,
    args: [
      "--project-root",
      config.projectRoot,
      "--openclaw-root",
      config.openclawRoot,
      "--control-port",
      String(port),
      "--supervisor",
      supervisor,
      "--service-name",
      OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
    ],
  };
}

function compatibilityTemplate(
  platform: NodeJS.Platform,
  plan: SupervisorPlan,
): OpenClawRecoveryDaemonServiceTemplate {
  return {
    supervisor: plan.supervisor,
    platform,
    serviceName: plan.serviceName,
    configPath: plan.configPath,
    content: plan.template,
    commands: plan.commands,
  };
}

export function createOpenClawRecoveryDaemonServicePlan(
  config: TracevaneServerConfig,
  options: CreateOpenClawRecoveryDaemonServicePlanOptions = {},
): OpenClawRecoveryDaemonServicePlan {
  const homeDir = options.homeDir ?? resolveRecoveryHome(config);
  const port = options.port ?? OPENCLAW_RECOVERY_DEFAULT_PORT;
  const definitions = {
    linux: createOpenClawRecoveryServiceDefinition(config, {
      mode: "persistent",
      platform: "linux",
      port,
    }),
    darwin: createOpenClawRecoveryServiceDefinition(config, {
      mode: "persistent",
      platform: "darwin",
      port,
    }),
    win32: createOpenClawRecoveryServiceDefinition(config, {
      mode: "persistent",
      platform: "win32",
      port,
    }),
  };
  const templates = [
    compatibilityTemplate(
      "linux",
      createSupervisorPlan(definitions.linux, "linux", homeDir),
    ),
    compatibilityTemplate(
      "darwin",
      createSupervisorPlan(definitions.darwin, "darwin", homeDir),
    ),
    compatibilityTemplate(
      "win32",
      createSupervisorPlan(definitions.win32, "win32", homeDir, {
        windowsUserId: options.windowsUserId,
      }),
    ),
  ];
  const selectedPlatform = process.platform === "darwin"
    ? "darwin"
    : process.platform === "win32"
      ? "win32"
      : "linux";
  const selectedTemplate = templates.find(
    (template) => template.platform === selectedPlatform,
  )!;
  const definition = definitions[selectedPlatform];

  return {
    platform: process.platform,
    supported: true,
    supervisor: selectedTemplate.supervisor,
    serviceName: selectedTemplate.serviceName,
    nodePath: process.execPath,
    daemonEntry: definition.entryPath,
    stateDir: config.openclawRoot,
    selectedTemplate,
    templates,
    notes: [
      "Development defaults to an API-owned session supervisor.",
      "Persistent installation is explicit and current-user scoped.",
      "Templates contain trusted launch state only; secrets and proxy credentials are not persisted.",
    ],
  };
}
