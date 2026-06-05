import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
  type OpenClawRecoveryCommand,
  type OpenClawRecoveryDaemonServiceAction,
  type OpenClawRecoveryCommandSnapshot,
  type OpenClawRecoveryDaemonServicePlan,
  type OpenClawRecoveryDaemonServiceSnapshot,
  type OpenClawRecoveryDaemonServiceTemplate,
  type OpenClawRecoverySupervisorKind,
} from "../../../../types/openclaw-recovery.js";
import { runOpenClawRecoveryServiceCommand } from "./supervisor-command.js";

const LAUNCHD_LABEL = "dev.openclaw.studio.recovery";
const WINDOWS_TASK_NAME = "OpenClawStudioRecovery";

function normalizeHome(config: StudioServerConfig): string {
  const openclawRoot = path.resolve(config.openclawRoot);
  return path.basename(openclawRoot) === ".openclaw"
    ? path.dirname(openclawRoot)
    : process.env.HOME || os.homedir();
}

function daemonEntryPath(config: StudioServerConfig): string {
  return path.join(
    config.projectRoot,
    "dist",
    "apps",
    "api",
    "openclaw-recovery-daemon.js",
  );
}

function quoteSystemdValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeSystemdPath(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/ /g, "\\x20");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function command(
  label: string,
  commandName: string,
  args: string[],
): OpenClawRecoveryCommand {
  return { label, command: commandName, args };
}

function launchdUserDomain(): string {
  return typeof process.getuid === "function"
    ? `gui/${process.getuid()}`
    : "gui/$UID";
}

function buildSystemdTemplate(options: {
  nodePath: string;
  daemonEntry: string;
  projectRoot: string;
  openclawRoot: string;
}): string {
  return [
    "[Unit]",
    "Description=OpenClaw Studio Recovery Daemon",
    "After=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${escapeSystemdPath(options.projectRoot)}`,
    `Environment=${quoteSystemdValue(`OPENCLAW_STATE_DIR=${options.openclawRoot}`)}`,
    `ExecStart=${quoteSystemdValue(options.nodePath)} ${quoteSystemdValue(options.daemonEntry)}`,
    "Restart=always",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

function buildLaunchdTemplate(options: {
  nodePath: string;
  daemonEntry: string;
  projectRoot: string;
  openclawRoot: string;
}): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
    "<plist version=\"1.0\">",
    "<dict>",
    "  <key>Label</key>",
    `  <string>${escapeXml(LAUNCHD_LABEL)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    `    <string>${escapeXml(options.nodePath)}</string>`,
    `    <string>${escapeXml(options.daemonEntry)}</string>`,
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${escapeXml(options.projectRoot)}</string>`,
    "  <key>EnvironmentVariables</key>",
    "  <dict>",
    "    <key>OPENCLAW_STATE_DIR</key>",
    `    <string>${escapeXml(options.openclawRoot)}</string>`,
    "  </dict>",
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

function buildWindowsTaskTemplate(options: {
  nodePath: string;
  daemonEntry: string;
  projectRoot: string;
  openclawRoot: string;
}): string {
  return [
    "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
    "<Task version=\"1.4\" xmlns=\"http://schemas.microsoft.com/windows/2004/02/mit/task\">",
    "  <RegistrationInfo>",
    "    <Description>OpenClaw Studio Recovery Daemon</Description>",
    "  </RegistrationInfo>",
    "  <Triggers><LogonTrigger><Enabled>true</Enabled></LogonTrigger></Triggers>",
    "  <Principals><Principal id=\"Author\"><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>",
    "  <Settings>",
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    "    <RestartOnFailure><Interval>PT30S</Interval><Count>999</Count></RestartOnFailure>",
    "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>",
    "  </Settings>",
    "  <Actions Context=\"Author\"><Exec>",
    `    <Command>${escapeXml(options.nodePath)}</Command>`,
    `    <Arguments>${escapeXml(options.daemonEntry)}</Arguments>`,
    `    <WorkingDirectory>${escapeXml(options.projectRoot)}</WorkingDirectory>`,
    "  </Exec></Actions>",
    "</Task>",
    `<!-- OPENCLAW_STATE_DIR=${escapeXml(options.openclawRoot)} -->`,
    "",
  ].join("\n");
}

function commandsFor(
  supervisor: OpenClawRecoverySupervisorKind,
  configPath: string,
): Partial<Record<OpenClawRecoveryDaemonServiceAction, OpenClawRecoveryCommand[]>> {
  if (supervisor === "systemd-user") {
    return {
      install: [
        command("Reload user systemd units", "systemctl", ["--user", "daemon-reload"]),
        command("Enable recovery service", "systemctl", ["--user", "enable", OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME]),
      ],
      start: [command("Start recovery service", "systemctl", ["--user", "start", OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME])],
      stop: [command("Stop recovery service", "systemctl", ["--user", "stop", OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME])],
      restart: [command("Restart recovery service", "systemctl", ["--user", "restart", OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME])],
      status: [
        command("Check recovery active state", "systemctl", ["--user", "is-active", OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME]),
        command("Check recovery enabled state", "systemctl", ["--user", "is-enabled", OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME]),
      ],
    };
  }
  if (supervisor === "launchd-user") {
    const domain = launchdUserDomain();
    return {
      install: [
        command("Bootstrap launchd agent", "launchctl", ["bootstrap", domain, configPath]),
        command("Enable launchd agent", "launchctl", ["enable", `${domain}/${LAUNCHD_LABEL}`]),
      ],
      start: [command("Kickstart launchd agent", "launchctl", ["kickstart", "-k", `${domain}/${LAUNCHD_LABEL}`])],
      stop: [command("Bootout launchd agent", "launchctl", ["bootout", `${domain}/${LAUNCHD_LABEL}`])],
      restart: [command("Restart launchd agent", "launchctl", ["kickstart", "-k", `${domain}/${LAUNCHD_LABEL}`])],
      status: [command("Print launchd agent status", "launchctl", ["print", `${domain}/${LAUNCHD_LABEL}`])],
    };
  }
  if (supervisor === "scheduled-task") {
    return {
      install: [command("Create scheduled task", "schtasks.exe", ["/Create", "/TN", WINDOWS_TASK_NAME, "/XML", configPath, "/F"])],
      start: [command("Run scheduled task", "schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME])],
      stop: [command("Stop scheduled task", "schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME])],
      restart: [
        command("Stop scheduled task", "schtasks.exe", ["/End", "/TN", WINDOWS_TASK_NAME]),
        command("Run scheduled task", "schtasks.exe", ["/Run", "/TN", WINDOWS_TASK_NAME]),
      ],
      status: [command("Query scheduled task", "schtasks.exe", ["/Query", "/TN", WINDOWS_TASK_NAME])],
    };
  }
  return {};
}

function templateFor(
  supervisor: OpenClawRecoverySupervisorKind,
  platform: OpenClawRecoveryDaemonServiceTemplate["platform"],
  configPath: string,
  options: {
    nodePath: string;
    daemonEntry: string;
    projectRoot: string;
    openclawRoot: string;
  },
): OpenClawRecoveryDaemonServiceTemplate {
  const template =
    supervisor === "systemd-user"
      ? buildSystemdTemplate(options)
      : supervisor === "launchd-user"
        ? buildLaunchdTemplate(options)
        : buildWindowsTaskTemplate(options);
  return {
    supervisor,
    platform,
    serviceName:
      supervisor === "launchd-user"
        ? LAUNCHD_LABEL
        : supervisor === "scheduled-task"
          ? WINDOWS_TASK_NAME
          : OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
    configPath,
    content: template,
    commands: commandsFor(supervisor, configPath),
  };
}

export function createOpenClawRecoveryDaemonServicePlan(
  config: StudioServerConfig,
): OpenClawRecoveryDaemonServicePlan {
  const home = normalizeHome(config);
  const nodePath = process.execPath;
  const daemonEntry = daemonEntryPath(config);
  const common = {
    nodePath,
    daemonEntry,
    projectRoot: config.projectRoot,
    openclawRoot: config.openclawRoot,
  };
  const templates = [
    templateFor(
      "systemd-user",
      "linux",
      path.join(home, ".config", "systemd", "user", OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME),
      common,
    ),
    templateFor(
      "launchd-user",
      "darwin",
      path.join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`),
      common,
    ),
    templateFor(
      "scheduled-task",
      "win32",
      path.join(home, "AppData", "Roaming", "OpenClaw", "Studio", `${WINDOWS_TASK_NAME}.xml`),
      common,
    ),
  ];

  const supervisor: OpenClawRecoverySupervisorKind =
    process.platform === "darwin"
      ? "launchd-user"
      : process.platform === "win32"
        ? "scheduled-task"
        : "systemd-user";
  const selectedTemplate =
    templates.find((item) => item.supervisor === supervisor) || templates[0];

  return {
    platform: process.platform,
    supported: true,
    supervisor,
    serviceName: selectedTemplate.serviceName,
    nodePath,
    daemonEntry,
    stateDir: config.openclawRoot,
    selectedTemplate,
    templates,
    notes: [
      "Install writes only the selected user-service template unless runCommands is true.",
      "The daemon repairs OpenClaw from outside the OpenClaw gateway and Studio process lifecycle.",
      "Healthy monitoring uses loopback probes and defers CLI diagnostics until sustained failure or manual action.",
    ],
  };
}

function firstText(value: string): string {
  return value.trim().split(/\s+/).find(Boolean) || "";
}

function serviceManagerState(
  supervisor: OpenClawRecoverySupervisorKind,
  commands: OpenClawRecoveryCommandSnapshot[],
): Pick<OpenClawRecoveryDaemonServiceSnapshot, "activeState" | "enabledState"> {
  if (!commands.length) {
    return {
      activeState: "unknown",
      enabledState: "unknown",
    };
  }
  if (supervisor === "systemd-user") {
    const active = commands.find((item) => item.args.includes("is-active"));
    const enabled = commands.find((item) => item.args.includes("is-enabled"));
    return {
      activeState: firstText(`${active?.stdout || ""}\n${active?.stderr || ""}`) || (active?.ok ? "active" : "unknown"),
      enabledState: firstText(`${enabled?.stdout || ""}\n${enabled?.stderr || ""}`) || (enabled?.ok ? "enabled" : "unknown"),
    };
  }
  if (supervisor === "launchd-user") {
    const status = commands.find((item) => item.command === "launchctl");
    return {
      activeState: status?.ok ? "running" : "unknown",
      enabledState: status?.ok ? "enabled" : "unknown",
    };
  }
  if (supervisor === "scheduled-task") {
    const status = commands.find((item) => item.command.toLowerCase().includes("schtasks"));
    const text = `${status?.stdout || ""}\n${status?.stderr || ""}`.toLowerCase();
    return {
      activeState: text.includes("running") ? "running" : status?.ok ? "ready" : "unknown",
      enabledState: text.includes("disabled") ? "disabled" : status?.ok ? "enabled" : "unknown",
    };
  }
  return {
    activeState: "unknown",
    enabledState: "unknown",
  };
}

function commandFailure(commands: OpenClawRecoveryCommandSnapshot[]): string {
  const failed = commands.find((item) => !item.ok);
  if (!failed) return "";
  return [
    failed.error,
    failed.stderr,
    failed.stdout,
  ].filter(Boolean).join("\n").trim().slice(0, 800) || `${failed.command} failed`;
}

async function runStatusCommands(
  plan: OpenClawRecoveryDaemonServicePlan,
): Promise<OpenClawRecoveryCommandSnapshot[]> {
  const commands = plan.selectedTemplate.commands.status || [];
  const results: OpenClawRecoveryCommandSnapshot[] = [];
  for (const item of commands) {
    results.push(await runOpenClawRecoveryServiceCommand(item, 3_000));
  }
  return results;
}

export async function getRecoveryDaemonServiceSnapshot(
  config: StudioServerConfig,
  options: { includeTemplate?: boolean; probe?: boolean } = {},
): Promise<OpenClawRecoveryDaemonServiceSnapshot> {
  const plan = createOpenClawRecoveryDaemonServicePlan(config);
  const statusCommands = options.probe === true ? await runStatusCommands(plan) : [];
  const state = serviceManagerState(plan.supervisor, statusCommands);
  return {
    supervisor: plan.supervisor,
    serviceName: plan.serviceName,
    configPath: plan.selectedTemplate.configPath,
    installed: fs.existsSync(plan.selectedTemplate.configPath),
    activeState: state.activeState,
    enabledState: state.enabledState,
    lastCheckedAt: statusCommands.length ? new Date().toISOString() : null,
    ...(options.includeTemplate ? { template: plan.selectedTemplate } : {}),
  };
}

export async function applyRecoveryDaemonServiceAction(
  config: StudioServerConfig,
  action: OpenClawRecoveryDaemonServiceAction,
): Promise<{
  service: OpenClawRecoveryDaemonServiceSnapshot;
  commands: OpenClawRecoveryCommandSnapshot[];
  error: string;
}> {
  const plan = createOpenClawRecoveryDaemonServicePlan(config);
  const commands: OpenClawRecoveryCommandSnapshot[] = [];

  if (action === "install") {
    fs.mkdirSync(path.dirname(plan.selectedTemplate.configPath), { recursive: true });
    fs.writeFileSync(plan.selectedTemplate.configPath, plan.selectedTemplate.content, "utf8");
  }

  const actionCommands = plan.selectedTemplate.commands[action] || [];
  const actionResults: OpenClawRecoveryCommandSnapshot[] = [];
  for (const item of actionCommands) {
    const result = await runOpenClawRecoveryServiceCommand(item, 10_000);
    actionResults.push(result);
    commands.push(result);
  }

  const statusCommands = await runStatusCommands(plan);
  commands.push(...statusCommands);
  const managerState = serviceManagerState(plan.supervisor, commands);
  const service: OpenClawRecoveryDaemonServiceSnapshot = {
    supervisor: plan.supervisor,
    serviceName: plan.serviceName,
    configPath: plan.selectedTemplate.configPath,
    installed: fs.existsSync(plan.selectedTemplate.configPath),
    activeState: managerState.activeState,
    enabledState: managerState.enabledState,
    lastCheckedAt: new Date().toISOString(),
    template: plan.selectedTemplate,
  };
  return {
    service,
    commands,
    error: commandFailure(actionResults),
  };
}
