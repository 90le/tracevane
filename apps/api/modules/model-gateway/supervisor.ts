import os from "node:os";
import path from "node:path";
import type { StudioServerConfig } from "../../../../types/api.js";
import {
  MODEL_GATEWAY_DAEMON_SERVICE_NAME,
  type ModelGatewayDaemonServiceAction,
  type ModelGatewayDaemonServiceCommand,
  type ModelGatewayDaemonServicePlan,
  type ModelGatewayDaemonServiceTemplate,
  type ModelGatewaySupervisorKind,
} from "../../../../types/model-gateway.js";

const LAUNCHD_LABEL = "dev.openclaw.studio.model-gateway";
const WINDOWS_TASK_NAME = "OpenClawStudioModelGateway";

function normalizeHome(config: StudioServerConfig): string {
  const openclawRoot = path.resolve(config.openclawRoot);
  return path.basename(openclawRoot) === ".openclaw"
    ? path.dirname(openclawRoot)
    : process.env.HOME || os.homedir();
}

function daemonEntryPath(config: StudioServerConfig): string {
  return path.join(config.projectRoot, "dist", "apps", "api", "model-gateway-daemon.js");
}

function quoteSystemdValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function command(label: string, commandName: string, args: string[]): ModelGatewayDaemonServiceCommand {
  return { label, command: commandName, args };
}

function launchdUserDomain(): string {
  return typeof process.getuid === "function" ? `gui/${process.getuid()}` : "gui/$UID";
}

function buildSystemdTemplate(options: {
  nodePath: string;
  daemonEntry: string;
  projectRoot: string;
  openclawRoot: string;
}): string {
  return [
    "[Unit]",
    "Description=OpenClaw Studio Model Gateway",
    "After=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${quoteSystemdValue(options.projectRoot)}`,
    `Environment=${quoteSystemdValue(`OPENCLAW_STATE_DIR=${options.openclawRoot}`)}`,
    `ExecStart=${quoteSystemdValue(options.nodePath)} ${quoteSystemdValue(options.daemonEntry)}`,
    "Restart=always",
    "RestartSec=2",
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
    "    <Description>OpenClaw Studio Model Gateway</Description>",
    "  </RegistrationInfo>",
    "  <Triggers>",
    "    <LogonTrigger>",
    "      <Enabled>true</Enabled>",
    "    </LogonTrigger>",
    "  </Triggers>",
    "  <Principals>",
    "    <Principal id=\"Author\">",
    "      <LogonType>InteractiveToken</LogonType>",
    "      <RunLevel>LeastPrivilege</RunLevel>",
    "    </Principal>",
    "  </Principals>",
    "  <Settings>",
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    "    <RestartOnFailure>",
    "      <Interval>PT30S</Interval>",
    "      <Count>999</Count>",
    "    </RestartOnFailure>",
    "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>",
    "  </Settings>",
    "  <Actions Context=\"Author\">",
    "    <Exec>",
    `      <Command>${escapeXml(options.nodePath)}</Command>`,
    `      <Arguments>${escapeXml(options.daemonEntry)}</Arguments>`,
    `      <WorkingDirectory>${escapeXml(options.projectRoot)}</WorkingDirectory>`,
    "    </Exec>",
    "  </Actions>",
    "</Task>",
    `<!-- OPENCLAW_STATE_DIR=${escapeXml(options.openclawRoot)} -->`,
    "",
  ].join("\n");
}

function commandsFor(supervisor: ModelGatewaySupervisorKind, configPath: string): Partial<Record<ModelGatewayDaemonServiceAction, ModelGatewayDaemonServiceCommand[]>> {
  if (supervisor === "systemd-user") {
    return {
      install: [
        command("Reload user systemd units", "systemctl", ["--user", "daemon-reload"]),
        command("Enable daemon service", "systemctl", ["--user", "enable", MODEL_GATEWAY_DAEMON_SERVICE_NAME]),
      ],
      start: [command("Start daemon service", "systemctl", ["--user", "start", MODEL_GATEWAY_DAEMON_SERVICE_NAME])],
      stop: [command("Stop daemon service", "systemctl", ["--user", "stop", MODEL_GATEWAY_DAEMON_SERVICE_NAME])],
      restart: [command("Restart daemon service", "systemctl", ["--user", "restart", MODEL_GATEWAY_DAEMON_SERVICE_NAME])],
      status: [
        command("Check daemon active state", "systemctl", ["--user", "is-active", MODEL_GATEWAY_DAEMON_SERVICE_NAME]),
        command("Check daemon enabled state", "systemctl", ["--user", "is-enabled", MODEL_GATEWAY_DAEMON_SERVICE_NAME]),
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
  supervisor: ModelGatewaySupervisorKind,
  platform: ModelGatewayDaemonServiceTemplate["platform"],
  configPath: string,
  options: {
    nodePath: string;
    daemonEntry: string;
    projectRoot: string;
    openclawRoot: string;
  },
): ModelGatewayDaemonServiceTemplate {
  const template = supervisor === "systemd-user"
    ? buildSystemdTemplate(options)
    : supervisor === "launchd-user"
      ? buildLaunchdTemplate(options)
      : buildWindowsTaskTemplate(options);
  return {
    supervisor,
    platform,
    serviceName: supervisor === "launchd-user"
      ? LAUNCHD_LABEL
      : supervisor === "scheduled-task"
        ? WINDOWS_TASK_NAME
        : MODEL_GATEWAY_DAEMON_SERVICE_NAME,
    configPath,
    template,
    commands: commandsFor(supervisor, configPath),
  };
}

export function createModelGatewayDaemonServicePlan(config: StudioServerConfig): ModelGatewayDaemonServicePlan {
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
      path.join(home, ".config", "systemd", "user", MODEL_GATEWAY_DAEMON_SERVICE_NAME),
      common,
    ),
    templateFor(
      "launchd-user",
      "macos",
      path.join(home, "Library", "LaunchAgents", `${LAUNCHD_LABEL}.plist`),
      common,
    ),
    templateFor(
      "scheduled-task",
      "windows",
      path.join(home, "AppData", "Roaming", "OpenClaw", "Studio", `${WINDOWS_TASK_NAME}.xml`),
      common,
    ),
  ];

  const supervisor: ModelGatewaySupervisorKind = process.platform === "darwin"
    ? "launchd-user"
    : process.platform === "win32"
      ? "scheduled-task"
      : "systemd-user";
  const selectedTemplate = templates.find((item) => item.supervisor === supervisor) || templates[0];

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
      "CLI takeover should keep using the daemon loopback endpoint, not the OpenClaw single-port mount.",
      "Restart guarantees require the selected OS/user supervisor to be installed and enabled.",
    ],
  };
}
