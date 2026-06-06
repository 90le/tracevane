import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME,
  CHANNEL_CONNECTOR_AGENT_IDS,
  CHANNEL_CONNECTOR_PLATFORM_IDS,
  type ChannelConnectorsBindingPolicy,
  type ChannelConnectorsDaemonAction,
  type ChannelConnectorsDaemonCommand,
  type ChannelConnectorsDaemonCommandResult,
  type ChannelConnectorsDaemonConfigResponse,
  type ChannelConnectorsDaemonManagerStatus,
  type ChannelConnectorsDaemonPlan,
  type ChannelConnectorsDaemonRequest,
  type ChannelConnectorsDaemonResponse,
  type ChannelConnectorsDaemonRuntimeConfig,
  type ChannelConnectorsDaemonTemplate,
  type ChannelConnectorsLogsResponse,
  type ChannelConnectorsNativeConfig,
  type ChannelConnectorsNativeConfigResponse,
  type ChannelConnectorsSaveNativeConfigRequest,
  type ChannelConnectorsStatusResponse,
  type ChannelConnectorAgentId,
  type ChannelConnectorPermissionMode,
  type ChannelConnectorPlatformId,
} from "../../../../types/channel-connectors.js";

const execFileAsync = promisify(execFile);
const DAEMON_ACTIONS: readonly ChannelConnectorsDaemonAction[] = [
  "preview",
  "install",
  "ensure-running",
  "start",
  "stop",
  "restart",
  "status",
];
const MANAGEMENT_PORT = 18797;
const PERMISSION_MODES: readonly ChannelConnectorPermissionMode[] = [
  "suggest",
  "read-only",
  "auto-edit",
  "full-auto",
  "plan",
  "yolo",
];

export type ChannelConnectorsDaemonCommandRunner = (
  command: ChannelConnectorsDaemonCommand,
) => Promise<ChannelConnectorsDaemonCommandResult>;

export interface ChannelConnectorsServiceOptions {
  homeDir?: string;
  commandRunner?: ChannelConnectorsDaemonCommandRunner;
  now?: () => Date;
}

export interface ChannelConnectorsService {
  getStatus(): Promise<ChannelConnectorsStatusResponse>;
  getNativeConfig(): ChannelConnectorsNativeConfigResponse;
  saveNativeConfig(payload?: ChannelConnectorsSaveNativeConfigRequest): ChannelConnectorsNativeConfigResponse;
  getDaemonConfig(): ChannelConnectorsDaemonConfigResponse;
  getDaemonService(): Promise<ChannelConnectorsDaemonResponse>;
  manageDaemonService(payload?: ChannelConnectorsDaemonRequest): Promise<ChannelConnectorsDaemonResponse>;
  getDaemonLogs(limit?: number): ChannelConnectorsLogsResponse;
}

interface ChannelConnectorsPaths {
  workspaceDir: string;
  nativeConfigPath: string;
  rootDir: string;
  configPath: string;
  stateDir: string;
  logDir: string;
  logFile: string;
  runtimeFile: string;
}

function normalizeHomeDir(value: string | undefined): string {
  const trimmed = String(value || "").trim();
  return trimmed || os.homedir();
}

export function resolveChannelConnectorsPaths(
  config: StudioServerConfig,
): ChannelConnectorsPaths {
  const workspaceDir = path.join(config.openclawRoot, "studio", "channel-connectors");
  const rootDir = path.join(workspaceDir, "daemon");
  const logDir = path.join(rootDir, "logs");
  return {
    workspaceDir,
    nativeConfigPath: path.join(workspaceDir, "config.json"),
    rootDir,
    configPath: path.join(rootDir, "config.json"),
    stateDir: path.join(rootDir, "state"),
    logDir,
    logFile: path.join(logDir, "channel-connectors.log"),
    runtimeFile: path.join(rootDir, "runtime.json"),
  };
}

function readTextIfExists(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeTextAtomic(filePath: string, content: string): void {
  ensureParentDir(filePath);
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(tempPath, content, "utf8");
  fs.renameSync(tempPath, filePath);
}

function normalizeAction(value: unknown): ChannelConnectorsDaemonAction {
  return DAEMON_ACTIONS.includes(value as ChannelConnectorsDaemonAction)
    ? value as ChannelConnectorsDaemonAction
    : "preview";
}

function quoteSystemdArg(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function quoteLaunchdString(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function gatewayEndpoint(): string {
  return "http://127.0.0.1:18796/v1";
}

function normalizeString(value: unknown, fallback = ""): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || fallback;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const output: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      output.push(normalized);
    }
  }
  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAgentId(value: unknown): value is ChannelConnectorAgentId {
  return (CHANNEL_CONNECTOR_AGENT_IDS as readonly string[]).includes(String(value));
}

function isPlatformId(value: unknown): value is ChannelConnectorPlatformId {
  return (CHANNEL_CONNECTOR_PLATFORM_IDS as readonly string[]).includes(String(value));
}

function isPermissionMode(value: unknown): value is ChannelConnectorPermissionMode {
  return (PERMISSION_MODES as readonly string[]).includes(String(value));
}

function defaultNativeConfig(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorsNativeConfig {
  return {
    version: 1,
    updatedAt: now.toISOString(),
    defaultAgentProfileId: "default-codex",
    agentProfiles: [
      {
        id: "default-codex",
        name: "Default Codex",
        agent: "codex",
        model: null,
        workDir: config.projectRoot || process.cwd(),
        permissionMode: "suggest",
        gatewayEndpoint: gatewayEndpoint(),
        gatewayKeyRef: "studio-gateway-client-key",
        appProfileRef: "default",
      },
    ],
    platformBindings: [],
  };
}

function normalizeNativeConfig(
  input: unknown,
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
  strict = false,
): ChannelConnectorsNativeConfig {
  const fallback = defaultNativeConfig(config, paths, now);
  if (!isRecord(input)) {
    if (strict) throw new Error("Channel Connectors config must be an object.");
    return fallback;
  }

  const rawProfiles = Array.isArray(input.agentProfiles) ? input.agentProfiles : [];
  if (strict && rawProfiles.length === 0) throw new Error("At least one agent profile is required.");

  const profileIds = new Set<string>();
  const agentProfiles: ChannelConnectorsNativeConfig["agentProfiles"] = [];
  for (let index = 0; index < rawProfiles.length; index += 1) {
    const raw = rawProfiles[index];
    if (!isRecord(raw)) continue;
    const id = slugify(normalizeString(raw.id, normalizeString(raw.name)), `profile-${index + 1}`);
    if (profileIds.has(id)) {
      if (strict) throw new Error(`Duplicate agent profile id: ${id}`);
      continue;
    }
    const agent = raw.agent;
    if (strict && !isAgentId(agent)) throw new Error(`Unsupported agent id for profile ${id}.`);
    const permissionMode = raw.permissionMode;
    if (strict && !isPermissionMode(permissionMode)) throw new Error(`Unsupported permission mode for profile ${id}.`);
    const workDir = normalizeString(raw.workDir, fallback.agentProfiles[0].workDir);
    if (strict && !workDir) throw new Error(`workDir is required for profile ${id}.`);
    profileIds.add(id);
    agentProfiles.push({
      id,
      name: normalizeString(raw.name, id),
      agent: isAgentId(agent) ? agent : "codex",
      model: normalizeString(raw.model) || null,
      workDir,
      permissionMode: isPermissionMode(permissionMode) ? permissionMode : "suggest",
      gatewayEndpoint: normalizeString(raw.gatewayEndpoint, gatewayEndpoint()),
      gatewayKeyRef: "studio-gateway-client-key",
      appProfileRef: normalizeString(raw.appProfileRef, "default"),
    });
  }

  if (agentProfiles.length === 0) agentProfiles.push(...fallback.agentProfiles);
  const validProfileIds = new Set(agentProfiles.map((profile) => profile.id));
  const defaultAgentProfileId = validProfileIds.has(normalizeString(input.defaultAgentProfileId))
    ? normalizeString(input.defaultAgentProfileId)
    : agentProfiles[0].id;

  const rawBindings = Array.isArray(input.platformBindings) ? input.platformBindings : [];
  const bindingIds = new Set<string>();
  const wechatAccountAgents = new Map<string, string>();
  const platformBindings: ChannelConnectorsNativeConfig["platformBindings"] = [];
  for (let index = 0; index < rawBindings.length; index += 1) {
    const raw = rawBindings[index];
    if (!isRecord(raw)) continue;
    const id = slugify(normalizeString(raw.id, normalizeString(raw.displayName)), `binding-${index + 1}`);
    if (bindingIds.has(id)) {
      if (strict) throw new Error(`Duplicate platform binding id: ${id}`);
      continue;
    }
    const platform = raw.platform;
    if (strict && !isPlatformId(platform)) throw new Error(`Unsupported platform id for binding ${id}.`);
    const agentProfileId = normalizeString(raw.agentProfileId, defaultAgentProfileId);
    if (strict && !validProfileIds.has(agentProfileId)) {
      throw new Error(`Binding ${id} references unknown agent profile: ${agentProfileId}`);
    }
    const effectiveProfileId = validProfileIds.has(agentProfileId) ? agentProfileId : defaultAgentProfileId;
    const accountId = normalizeString(raw.accountId);
    if (strict && !accountId) throw new Error(`accountId is required for binding ${id}.`);
    const platformId = isPlatformId(platform) ? platform : "octo";
    if (platformId === "wechat") {
      const existingAgent = wechatAccountAgents.get(accountId);
      if (existingAgent && existingAgent !== effectiveProfileId) {
        throw new Error(`Personal WeChat account ${accountId} can bind only one agent profile.`);
      }
      if (accountId) wechatAccountAgents.set(accountId, effectiveProfileId);
    }

    bindingIds.add(id);
    platformBindings.push({
      id,
      platform: platformId,
      accountId,
      botId: normalizeString(raw.botId) || null,
      displayName: normalizeString(raw.displayName, id),
      agentProfileId: effectiveProfileId,
      enabled: raw.enabled !== false,
      allowlist: stringList(raw.allowlist),
      adminUsers: stringList(raw.adminUsers),
      metadata: isRecord(raw.metadata) ? raw.metadata : undefined,
    });
  }

  return {
    version: 1,
    updatedAt: normalizeString(input.updatedAt, now.toISOString()),
    defaultAgentProfileId,
    agentProfiles,
    platformBindings,
  };
}

function readNativeConfig(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorsNativeConfig {
  const raw = readTextIfExists(paths.nativeConfigPath);
  if (!raw) return defaultNativeConfig(config, paths, now);
  try {
    return normalizeNativeConfig(JSON.parse(raw), config, paths, now, false);
  } catch {
    return defaultNativeConfig(config, paths, now);
  }
}

function writeNativeConfig(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  value: ChannelConnectorsNativeConfig,
  now: Date,
): ChannelConnectorsNativeConfig {
  const normalized = normalizeNativeConfig(
    {
      ...value,
      updatedAt: now.toISOString(),
    },
    config,
    paths,
    now,
    true,
  );
  writeTextAtomic(paths.nativeConfigPath, `${JSON.stringify(normalized, null, 2)}\n`);
  return normalized;
}

function daemonEntryPath(config: StudioServerConfig): string {
  return path.join(config.projectRoot, "dist", "apps", "api", "modules", "channel-connectors", "daemon.js");
}

function managementEndpoint(): string {
  return `http://127.0.0.1:${MANAGEMENT_PORT}`;
}

function buildRuntimeConfig(
  nativeConfig: ChannelConnectorsNativeConfig,
  paths: ChannelConnectorsPaths,
): ChannelConnectorsDaemonRuntimeConfig {
  return {
    version: 1,
    management: {
      host: "127.0.0.1",
      port: MANAGEMENT_PORT,
    },
    paths: {
      root: paths.rootDir,
      state: paths.stateDir,
      log: paths.logFile,
      runtime: paths.runtimeFile,
    },
    gateway: {
      endpoint: gatewayEndpoint(),
      clientKeyRef: "studio-gateway-client-key",
    },
    projects: [
      ...nativeConfig.agentProfiles.map((profile) => ({
        id: profile.id,
        name: profile.name,
        workDir: profile.workDir,
        agent: profile.agent,
        model: profile.model,
        permissionMode: profile.permissionMode,
        appProfileRef: profile.appProfileRef,
        platformBindings: nativeConfig.platformBindings
          .filter((binding) => binding.agentProfileId === profile.id)
          .map((binding) => ({
            id: binding.id,
            platform: binding.platform,
            accountId: binding.accountId,
            botId: binding.botId,
            displayName: binding.displayName,
            agent: profile.agent,
            enabled: binding.enabled,
            allowlist: binding.allowlist,
            adminUsers: binding.adminUsers,
          })),
      })),
    ],
  };
}

function buildConfigResponse(config: StudioServerConfig, paths: ChannelConnectorsPaths, now: Date): ChannelConnectorsDaemonConfigResponse {
  const nativeConfig = readNativeConfig(config, paths, now);
  const runtimeConfig = buildRuntimeConfig(nativeConfig, paths);
  const preview = `${JSON.stringify(runtimeConfig, null, 2)}\n`;
  return {
    ok: true,
    checkedAt: now.toISOString(),
    ready: true,
    nativeConfigPath: paths.nativeConfigPath,
    configPath: paths.configPath,
    gatewayEndpoint: gatewayEndpoint(),
    managementEndpoint: managementEndpoint(),
    config: runtimeConfig,
    preview,
    missing: [],
  };
}

function buildSystemdTemplate(serviceName: string, paths: ChannelConnectorsPaths, nodePath: string, daemonEntry: string): string {
  return [
    "[Unit]",
    "Description=OpenClaw Studio Channel Connectors",
    "After=network-online.target",
    "Wants=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${quoteSystemdArg(paths.rootDir)}`,
    `ExecStart=${quoteSystemdArg(nodePath)} ${quoteSystemdArg(daemonEntry)} --config ${quoteSystemdArg(paths.configPath)}`,
    "Restart=on-failure",
    "RestartSec=10",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

function buildLaunchdTemplate(serviceName: string, paths: ChannelConnectorsPaths, nodePath: string, daemonEntry: string): string {
  const label = serviceName.replace(/\.service$/, "");
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>Label</key>",
    `  <string>${quoteLaunchdString(label)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    `    <string>${quoteLaunchdString(nodePath)}</string>`,
    `    <string>${quoteLaunchdString(daemonEntry)}</string>`,
    "    <string>--config</string>",
    `    <string>${quoteLaunchdString(paths.configPath)}</string>`,
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${quoteLaunchdString(paths.rootDir)}</string>`,
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

export function createChannelConnectorsDaemonPlan(
  config: StudioServerConfig,
  options: ChannelConnectorsServiceOptions = {},
): ChannelConnectorsDaemonPlan {
  const paths = resolveChannelConnectorsPaths(config);
  const homeDir = normalizeHomeDir(options.homeDir);
  const serviceName = CHANNEL_CONNECTORS_DAEMON_SERVICE_NAME;
  const nodePath = process.execPath;
  const daemonEntry = daemonEntryPath(config);
  const platform = process.platform === "linux"
    ? "linux"
    : process.platform === "darwin"
      ? "macos"
      : process.platform === "win32"
        ? "windows"
        : "unknown";
  const supervisor = platform === "linux"
    ? "systemd-user"
    : platform === "macos"
      ? "launchd-user"
      : platform === "windows"
        ? "scheduled-task"
        : "none";

  const linuxServicePath = path.join(homeDir, ".config", "systemd", "user", serviceName);
  const launchdServicePath = path.join(homeDir, "Library", "LaunchAgents", serviceName.replace(/\.service$/, ".plist"));
  const unsupportedServicePath = path.join(paths.rootDir, serviceName);
  const launchdDomain = typeof process.getuid === "function" ? `gui/${process.getuid()}` : "gui/501";
  const launchdLabel = serviceName.replace(/\.service$/, "");

  const linuxTemplate: ChannelConnectorsDaemonTemplate = {
    supervisor: "systemd-user",
    platform: "linux",
    serviceName,
    servicePath: linuxServicePath,
    template: buildSystemdTemplate(serviceName, paths, nodePath, daemonEntry),
    commands: {
      install: [
        { label: "Reload user systemd", command: "systemctl", args: ["--user", "daemon-reload"] },
        { label: "Enable Channel Connectors service", command: "systemctl", args: ["--user", "enable", serviceName] },
      ],
      start: [
        { label: "Start Channel Connectors service", command: "systemctl", args: ["--user", "start", serviceName] },
      ],
      stop: [
        { label: "Stop Channel Connectors service", command: "systemctl", args: ["--user", "stop", serviceName] },
      ],
      restart: [
        { label: "Restart Channel Connectors service", command: "systemctl", args: ["--user", "restart", serviceName] },
      ],
      status: [
        { label: "Check Channel Connectors active state", command: "systemctl", args: ["--user", "is-active", serviceName] },
        { label: "Check Channel Connectors enabled state", command: "systemctl", args: ["--user", "is-enabled", serviceName] },
      ],
      "ensure-running": [
        { label: "Reload user systemd", command: "systemctl", args: ["--user", "daemon-reload"] },
        { label: "Enable Channel Connectors service", command: "systemctl", args: ["--user", "enable", serviceName] },
        { label: "Start Channel Connectors service", command: "systemctl", args: ["--user", "start", serviceName] },
      ],
    },
  };

  const launchdTemplate: ChannelConnectorsDaemonTemplate = {
    supervisor: "launchd-user",
    platform: "macos",
    serviceName,
    servicePath: launchdServicePath,
    template: buildLaunchdTemplate(serviceName, paths, nodePath, daemonEntry),
    commands: {
      install: [
        { label: "Bootstrap LaunchAgent", command: "launchctl", args: ["bootstrap", launchdDomain, launchdServicePath] },
      ],
      start: [
        { label: "Start LaunchAgent", command: "launchctl", args: ["kickstart", "-k", `${launchdDomain}/${launchdLabel}`] },
      ],
      stop: [
        { label: "Stop LaunchAgent", command: "launchctl", args: ["bootout", launchdDomain, launchdServicePath] },
      ],
      restart: [
        { label: "Restart LaunchAgent", command: "launchctl", args: ["kickstart", "-k", `${launchdDomain}/${launchdLabel}`] },
      ],
      status: [
        { label: "Print LaunchAgent", command: "launchctl", args: ["print", `${launchdDomain}/${launchdLabel}`] },
      ],
    },
  };

  const unsupportedTemplate: ChannelConnectorsDaemonTemplate = {
    supervisor,
    platform,
    serviceName,
    servicePath: unsupportedServicePath,
    template: "# Unsupported platform for Studio native Channel Connectors service.\n",
    commands: {},
  };

  const templates = [linuxTemplate, launchdTemplate, unsupportedTemplate];
  const selectedTemplate = platform === "linux"
    ? linuxTemplate
    : platform === "macos"
      ? launchdTemplate
      : unsupportedTemplate;
  const notes = [
    "Channel Connectors is a Studio-native daemon.",
    "CC and OpenClaw implementations are reference sources only.",
    "Studio and OpenClaw are not runtime dependencies after the native daemon is supervised.",
  ];
  if (platform === "windows") notes.push("Windows scheduled-task support remains a native-daemon follow-up.");

  return {
    platform: process.platform,
    supported: platform === "linux" || platform === "macos",
    supervisor,
    serviceName,
    nodePath,
    daemonEntry,
    rootDir: paths.rootDir,
    configPath: paths.configPath,
    stateDir: paths.stateDir,
    logFile: paths.logFile,
    runtimeFile: paths.runtimeFile,
    managementEndpoint: managementEndpoint(),
    selectedTemplate,
    templates,
    notes,
  };
}

async function runDefaultCommand(command: ChannelConnectorsDaemonCommand): Promise<ChannelConnectorsDaemonCommandResult> {
  try {
    const result = await execFileAsync(command.command, command.args, {
      timeout: 30_000,
      encoding: "utf8",
    });
    return {
      ...command,
      ok: true,
      exitCode: 0,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: null,
    };
  } catch (error) {
    const shaped = error as Error & {
      code?: string | number;
      stdout?: string;
      stderr?: string;
    };
    return {
      ...command,
      ok: false,
      exitCode: typeof shaped.code === "number" ? shaped.code : null,
      stdout: shaped.stdout || "",
      stderr: shaped.stderr || "",
      error: shaped.message || "Command failed.",
    };
  }
}

function summarizeManager(
  plan: ChannelConnectorsDaemonPlan,
  commandsRun: ChannelConnectorsDaemonCommandResult[],
): ChannelConnectorsDaemonManagerStatus {
  if (!plan.supported) {
    return {
      checked: true,
      reachable: false,
      active: null,
      enabled: null,
      lastError: "Supervisor is not supported on this platform yet.",
    };
  }
  const statusCommands = commandsRun.filter((result) => {
    const args = result.args.join(" ");
    return args.includes("is-active")
      || args.includes("is-enabled")
      || result.label.toLowerCase().includes("active")
      || result.label.toLowerCase().includes("enabled")
      || result.command === "launchctl";
  });
  if (!statusCommands.length) {
    return {
      checked: false,
      reachable: null,
      active: null,
      enabled: null,
      lastError: null,
    };
  }
  const activeResult = statusCommands.find((result) => result.args.includes("is-active"));
  const enabledResult = statusCommands.find((result) => result.args.includes("is-enabled"));
  const lastFailed = [...statusCommands].reverse().find((result) => !result.ok);
  return {
    checked: true,
    reachable: statusCommands.some((result) => result.ok),
    active: activeResult ? activeResult.ok && activeResult.stdout.trim() === "active" : null,
    enabled: enabledResult ? enabledResult.ok && enabledResult.stdout.trim() === "enabled" : null,
    lastError: lastFailed?.stderr || lastFailed?.error || null,
  };
}

function isTemplateCurrent(plan: ChannelConnectorsDaemonPlan): boolean {
  return readTextIfExists(plan.selectedTemplate.servicePath) === plan.selectedTemplate.template;
}

function isConfigCurrent(configPreview: ChannelConnectorsDaemonConfigResponse): boolean {
  return readTextIfExists(configPreview.configPath) === configPreview.preview;
}

function actionWritesFiles(action: ChannelConnectorsDaemonAction): boolean {
  return action === "install" || action === "ensure-running" || action === "start" || action === "restart";
}

function blockingReason(plan: ChannelConnectorsDaemonPlan, action: ChannelConnectorsDaemonAction): string | null {
  if (action === "preview" || action === "status" || action === "stop") return null;
  if (!plan.supported) return "unsupported_supervisor";
  if (!fs.existsSync(plan.daemonEntry)) return "native_daemon_entry_missing";
  return null;
}

function tailLines(filePath: string, limit: number): { exists: boolean; lines: string[] } {
  const raw = readTextIfExists(filePath);
  if (raw === null) return { exists: false, lines: [] };
  const normalizedLimit = Math.max(1, Math.min(500, Math.floor(limit || 120)));
  const lines = raw.split(/\r?\n/);
  return {
    exists: true,
    lines: lines.slice(Math.max(0, lines.length - normalizedLimit)).filter((line) => line.length > 0),
  };
}

function bindingPolicy(): ChannelConnectorsBindingPolicy {
  return {
    model: "platform-account-or-bot-to-agent",
    supportedAgents: [...CHANNEL_CONNECTOR_AGENT_IDS],
    supportedPlatforms: [...CHANNEL_CONNECTOR_PLATFORM_IDS],
    multiBot: {
      allowed: true,
      unit: "platform-account-or-bot",
    },
    wechatPersonal: {
      maxAgentsPerAccount: 1,
    },
  };
}

function buildNativeConfigResponse(
  config: StudioServerConfig,
  paths: ChannelConnectorsPaths,
  now: Date,
): ChannelConnectorsNativeConfigResponse {
  return {
    ok: true,
    checkedAt: now.toISOString(),
    configPath: paths.nativeConfigPath,
    config: readNativeConfig(config, paths, now),
    supportedAgents: [...CHANNEL_CONNECTOR_AGENT_IDS],
    supportedPlatforms: [...CHANNEL_CONNECTOR_PLATFORM_IDS],
    permissionModes: [...PERMISSION_MODES],
  };
}

export function createChannelConnectorsService(
  config: StudioServerConfig,
  options: ChannelConnectorsServiceOptions = {},
): ChannelConnectorsService {
  const now = () => (options.now ? options.now() : new Date());
  const runCommand = (command: ChannelConnectorsDaemonCommand) =>
    options.commandRunner ? options.commandRunner(command) : runDefaultCommand(command);

  function currentConfig(): ChannelConnectorsDaemonConfigResponse {
    return buildConfigResponse(config, resolveChannelConnectorsPaths(config), now());
  }

  function currentNativeConfig(): ChannelConnectorsNativeConfigResponse {
    return buildNativeConfigResponse(config, resolveChannelConnectorsPaths(config), now());
  }

  function saveNativeConfig(payload: ChannelConnectorsSaveNativeConfigRequest = {}): ChannelConnectorsNativeConfigResponse {
    if (!payload.config) throw new Error("Channel Connectors config payload is required.");
    const paths = resolveChannelConnectorsPaths(config);
    const saved = writeNativeConfig(config, paths, payload.config, now());
    return {
      ok: true,
      checkedAt: now().toISOString(),
      configPath: paths.nativeConfigPath,
      config: saved,
      supportedAgents: [...CHANNEL_CONNECTOR_AGENT_IDS],
      supportedPlatforms: [...CHANNEL_CONNECTOR_PLATFORM_IDS],
      permissionModes: [...PERMISSION_MODES],
    };
  }

  async function response(
    input: {
      action: ChannelConnectorsDaemonAction;
      applied?: boolean;
      templateWritten?: boolean;
      configWritten?: boolean;
      commandsRun?: ChannelConnectorsDaemonCommandResult[];
      skippedReason?: string | null;
      diagnostics?: string[];
    },
  ): Promise<ChannelConnectorsDaemonResponse> {
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const configPreview = currentConfig();
    const commandsRun = input.commandsRun || [];
    const installed = fs.existsSync(plan.selectedTemplate.servicePath);
    const serviceManager = summarizeManager(plan, commandsRun);
    return {
      ok: input.skippedReason ? false : commandsRun.every((result) => result.ok),
      checkedAt: now().toISOString(),
      action: input.action,
      applied: input.applied === true,
      templateWritten: input.templateWritten === true,
      configWritten: input.configWritten === true,
      templateCurrent: isTemplateCurrent(plan),
      configCurrent: isConfigCurrent(configPreview),
      installed,
      skippedReason: input.skippedReason || null,
      plan,
      config: configPreview,
      commandsRun,
      serviceManager,
      diagnostics: input.diagnostics || [],
    };
  }

  async function runStatusCommands(plan: ChannelConnectorsDaemonPlan): Promise<ChannelConnectorsDaemonCommandResult[]> {
    const commands = plan.selectedTemplate.commands.status || [];
    const results: ChannelConnectorsDaemonCommandResult[] = [];
    for (const command of commands) results.push(await runCommand(command));
    return results;
  }

  async function getDaemonService(): Promise<ChannelConnectorsDaemonResponse> {
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const commandsRun = plan.supported ? await runStatusCommands(plan) : [];
    return response({
      action: "status",
      commandsRun,
    });
  }

  async function manageDaemonService(payload: ChannelConnectorsDaemonRequest = {}): Promise<ChannelConnectorsDaemonResponse> {
    const action = normalizeAction(payload.action);
    const plan = createChannelConnectorsDaemonPlan(config, options);
    const guard = blockingReason(plan, action);
    const diagnostics: string[] = [];
    if (guard === "native_daemon_entry_missing") {
      diagnostics.push("Run npm run build:api before installing or starting the native Channel Connectors daemon.");
    }
    if (guard === "unsupported_supervisor") {
      diagnostics.push("The current OS supervisor is not supported by Studio native Channel Connectors F1.");
    }
    if (guard) {
      return response({
        action,
        skippedReason: guard,
        diagnostics,
      });
    }

    const apply = payload.apply === true;
    const configPreview = currentConfig();
    let templateWritten = false;
    let configWritten = false;
    if (apply && actionWritesFiles(action)) {
      fs.mkdirSync(plan.rootDir, { recursive: true });
      fs.mkdirSync(plan.stateDir, { recursive: true });
      fs.mkdirSync(path.dirname(plan.logFile), { recursive: true });
      if (!isConfigCurrent(configPreview)) {
        writeTextAtomic(configPreview.configPath, configPreview.preview);
        configWritten = true;
      }
      if (!isTemplateCurrent(plan)) {
        writeTextAtomic(plan.selectedTemplate.servicePath, plan.selectedTemplate.template);
        templateWritten = true;
      }
    }

    const commandsRun: ChannelConnectorsDaemonCommandResult[] = [];
    const shouldRunCommands = payload.runCommands === true
      || (payload.runCommands !== false && apply && action !== "preview" && action !== "status");
    if (action === "status") {
      commandsRun.push(...await runStatusCommands(plan));
    } else if (shouldRunCommands) {
      const commands = plan.selectedTemplate.commands[action] || [];
      for (const command of commands) commandsRun.push(await runCommand(command));
      if (action !== "stop") commandsRun.push(...await runStatusCommands(plan));
    }

    return response({
      action,
      applied: templateWritten || configWritten || commandsRun.length > 0,
      templateWritten,
      configWritten,
      commandsRun,
      diagnostics,
    });
  }

  async function getStatus(): Promise<ChannelConnectorsStatusResponse> {
    const service = await getDaemonService();
    return {
      ok: true,
      checkedAt: now().toISOString(),
      phase: "native-config-f2",
      implementation: "studio-native",
      referenceSources: [
        "CC archived reference implementation",
        "OpenClaw channel/runtime behavior",
        "Studio Gateway daemon contract",
      ],
      runtimeChain: [
        "IM channel",
        "Studio native Channel daemon",
        "local CLI Agent bot",
        "Studio Gateway daemon",
        "upstream provider",
      ],
      bindingPolicy: bindingPolicy(),
      paths: {
        root: service.plan.rootDir,
        nativeConfig: resolveChannelConnectorsPaths(config).nativeConfigPath,
        config: service.plan.configPath,
        state: service.plan.stateDir,
        log: service.plan.logFile,
        runtime: service.plan.runtimeFile,
      },
      lifecycle: {
        studioRuntimeDependency: false,
        openclawRuntimeDependency: false,
        modelRelayOwner: "studio-gateway-daemon",
        channelDaemonOwner: "studio-native-channel-daemon",
      },
      service,
    };
  }

  function getDaemonLogs(limit = 120): ChannelConnectorsLogsResponse {
    const paths = resolveChannelConnectorsPaths(config);
    const log = tailLines(paths.logFile, limit);
    return {
      ok: true,
      checkedAt: now().toISOString(),
      logFile: paths.logFile,
      exists: log.exists,
      lines: log.lines,
    };
  }

  return {
    getStatus,
    getNativeConfig: currentNativeConfig,
    saveNativeConfig,
    getDaemonConfig: currentConfig,
    getDaemonService,
    manageDaemonService,
    getDaemonLogs,
  };
}
