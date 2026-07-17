import os from "node:os";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import {
  MODEL_GATEWAY_DAEMON_SERVICE_NAME,
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
  type ModelGatewayDaemonServicePlan,
  type ModelGatewayDaemonServiceTemplate,
} from "../../../../types/model-gateway.js";
import type { TracevaneServiceMode } from "../../../../types/supervisor.js";
import {
  createSupervisorPlan,
  type ServiceDefinition,
  type SupervisorPlan,
} from "../supervisor/index.js";

const LAUNCHD_LABEL = "dev.openclaw.tracevane.model-gateway";
const WINDOWS_TASK_NAME = "TracevaneModelGateway";

export interface CreateModelGatewayServiceDefinitionOptions {
  mode?: TracevaneServiceMode;
  platform?: NodeJS.Platform;
  host?: string;
  port?: number;
}

export interface CreateModelGatewayDaemonServicePlanOptions {
  homeDir?: string;
  host?: string;
  port?: number;
}

export function resolveModelGatewaySupervisorHome(
  config: TracevaneServerConfig,
): string {
  const openclawRoot = path.resolve(config.openclawRoot);
  return path.basename(openclawRoot) === ".openclaw"
    ? path.dirname(openclawRoot)
    : process.env.HOME || os.homedir();
}

function persistentSupervisor(platform: NodeJS.Platform): string {
  if (platform === "darwin") return "launchd-user";
  if (platform === "win32") return "scheduled-task";
  return "systemd-user";
}

export function createModelGatewayServiceDefinition(
  config: TracevaneServerConfig,
  options: CreateModelGatewayServiceDefinitionOptions = {},
): ServiceDefinition {
  const mode = options.mode ?? "session";
  const platform = options.platform ?? process.platform;
  const host = options.host ?? MODEL_GATEWAY_DEFAULT_HOST;
  const port = options.port ?? MODEL_GATEWAY_DEFAULT_PORT;
  const supervisor = mode === "session"
    ? "session"
    : persistentSupervisor(platform);
  const stateRoot = path.join(
    config.openclawRoot,
    "tracevane",
    "model-gateway",
  );

  return {
    id: "model-gateway",
    displayName: "Tracevane Model Gateway",
    serviceName: MODEL_GATEWAY_DAEMON_SERVICE_NAME,
    windowsTaskName: WINDOWS_TASK_NAME,
    launchdLabel: LAUNCHD_LABEL,
    entryPath: path.join(
      config.projectRoot,
      "dist",
      "apps",
      "api",
      "model-gateway-daemon.js",
    ),
    workingDirectory: config.projectRoot,
    configPath: config.openclawConfigFile,
    runtimePath: path.join(stateRoot, "daemon-runtime.json"),
    logPath: path.join(stateRoot, "logs", "daemon.log"),
    healthUrl:
      `http://127.0.0.1:${port}/api/model-gateway/status`,
    args: [
      "--state-dir",
      config.openclawRoot,
      "--host",
      host,
      "--port",
      String(port),
      "--supervisor",
      supervisor,
      "--service-name",
      MODEL_GATEWAY_DAEMON_SERVICE_NAME,
    ],
  };
}

function compatibilityTemplate(
  platform: ModelGatewayDaemonServiceTemplate["platform"],
  plan: SupervisorPlan,
): ModelGatewayDaemonServiceTemplate {
  return {
    supervisor: plan.supervisor,
    platform,
    serviceName: plan.serviceName,
    configPath: plan.configPath,
    template: plan.template,
    commands: plan.commands,
  };
}

export function createModelGatewayDaemonServicePlan(
  config: TracevaneServerConfig,
  options: CreateModelGatewayDaemonServicePlanOptions = {},
): ModelGatewayDaemonServicePlan {
  const homeDir = options.homeDir ?? resolveModelGatewaySupervisorHome(config);
  const host = options.host ?? MODEL_GATEWAY_DEFAULT_HOST;
  const port = options.port ?? MODEL_GATEWAY_DEFAULT_PORT;
  const definitions = {
    linux: createModelGatewayServiceDefinition(config, {
      mode: "persistent",
      platform: "linux",
      host,
      port,
    }),
    macos: createModelGatewayServiceDefinition(config, {
      mode: "persistent",
      platform: "darwin",
      host,
      port,
    }),
    windows: createModelGatewayServiceDefinition(config, {
      mode: "persistent",
      platform: "win32",
      host,
      port,
    }),
  };
  const templates = [
    compatibilityTemplate(
      "linux",
      createSupervisorPlan(definitions.linux, "linux", homeDir),
    ),
    compatibilityTemplate(
      "macos",
      createSupervisorPlan(definitions.macos, "darwin", homeDir),
    ),
    compatibilityTemplate(
      "windows",
      createSupervisorPlan(definitions.windows, "win32", homeDir),
    ),
  ];
  const selectedPlatform = process.platform === "darwin"
    ? "macos"
    : process.platform === "win32"
      ? "windows"
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
