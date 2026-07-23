import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CreateSupervisorPlanOptions,
  ServiceDefinition,
  SupervisorCommand,
  SupervisorPlan,
} from "./contracts.js";

function command(
  label: string,
  commandName: string,
  args: string[],
): SupervisorCommand {
  return { label, command: commandName, args };
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeSystemdValue(value: string): string {
  return value
    .replace(/%/g, "%%")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function quoteSystemdToken(value: string): string {
  return `"${escapeSystemdValue(value)}"`;
}

function quoteSystemdExecToken(value: string): string {
  return quoteSystemdToken(value.replaceAll("$", () => "$$"));
}

function quoteWindowsArgument(value: string): string {
  if (value && !/[\s"]/u.test(value)) return value;

  let result = '"';
  let backslashes = 0;
  for (const character of value) {
    if (character === "\\") {
      backslashes += 1;
      continue;
    }
    if (character === '"') {
      result += "\\".repeat((backslashes * 2) + 1);
      result += '"';
    } else {
      result += "\\".repeat(backslashes);
      result += character;
    }
    backslashes = 0;
  }
  return `${result}${"\\".repeat(backslashes * 2)}"`;
}

function quotePowerShellLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function encodePowerShellCommand(lines: string[]): string {
  return Buffer.from(lines.join("\n"), "utf16le").toString("base64");
}

function powershellCommand(
  label: string,
  encodedCommand: string,
  kind?: SupervisorCommand["kind"],
): SupervisorCommand {
  return {
    label,
    command: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-EncodedCommand",
      encodedCommand,
    ],
    ...(kind ? { kind } : {}),
  };
}

export function createServiceLaunchArguments(
  definition: ServiceDefinition,
): string[] {
  return [
    definition.entryPath,
    ...definition.args,
    "--config",
    definition.configPath,
  ];
}

function buildSystemdTemplate(
  definition: ServiceDefinition,
  args: string[],
): string {
  return [
    "[Unit]",
    `Description=${quoteSystemdToken(definition.displayName)}`,
    "After=network-online.target",
    "",
    "[Service]",
    "Type=simple",
    `WorkingDirectory=${escapeSystemdValue(definition.workingDirectory)}`,
    `ExecStart=${[process.execPath, ...args].map(quoteSystemdExecToken).join(" ")}`,
    "Restart=on-failure",
    "RestartSec=5",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}

function buildLaunchdTemplate(
  definition: ServiceDefinition,
  args: string[],
): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    "  <key>Label</key>",
    `  <string>${escapeXml(definition.launchdLabel)}</string>`,
    "  <key>ProgramArguments</key>",
    "  <array>",
    ...[process.execPath, ...args].map(
      (argument) => `    <string>${escapeXml(argument)}</string>`,
    ),
    "  </array>",
    "  <key>WorkingDirectory</key>",
    `  <string>${escapeXml(definition.workingDirectory)}</string>`,
    "  <key>RunAtLoad</key>",
    "  <true/>",
    "  <key>KeepAlive</key>",
    "  <true/>",
    "  <key>ThrottleInterval</key>",
    "  <integer>5</integer>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

function buildWindowsTaskTemplate(
  definition: ServiceDefinition,
  args: string[],
  windowsUserId: string,
): string {
  const watchdogPath = fileURLToPath(
    new URL("./windows-service-watchdog.js", import.meta.url),
  );
  const watchdogPayload = Buffer.from(JSON.stringify({
    entryPath: args[0],
    args: args.slice(1),
  }), "utf8").toString("base64");
  const watchdogCommand = encodePowerShellCommand([
    "$ErrorActionPreference = 'Stop'",
    `& ${quotePowerShellLiteral(process.execPath)} ${quotePowerShellLiteral(watchdogPath)} ` +
    `${quotePowerShellLiteral("--host-pid")} ([string]$PID) ` +
    `${quotePowerShellLiteral("--payload")} ${quotePowerShellLiteral(watchdogPayload)}`,
    "if ($null -eq $LASTEXITCODE) { exit 1 }",
    "exit $LASTEXITCODE",
  ]);
  const argumentLine = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-EncodedCommand",
    watchdogCommand,
  ]
    .map(quoteWindowsArgument)
    .join(" ");
  const escapedUserId = escapeXml(windowsUserId);
  return [
    '<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    "  <RegistrationInfo>",
    `    <Description>${escapeXml(definition.displayName)}</Description>`,
    "  </RegistrationInfo>",
    "  <Triggers>",
    "    <LogonTrigger>",
    "      <Enabled>true</Enabled>",
    `      <UserId>${escapedUserId}</UserId>`,
    "    </LogonTrigger>",
    "  </Triggers>",
    "  <Principals>",
    '    <Principal id="Author">',
    `      <UserId>${escapedUserId}</UserId>`,
    "      <LogonType>InteractiveToken</LogonType>",
    "      <RunLevel>LeastPrivilege</RunLevel>",
    "    </Principal>",
    "  </Principals>",
    "  <Settings>",
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
    "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>",
    "    <AllowStartOnDemand>true</AllowStartOnDemand>",
    "    <StartWhenAvailable>true</StartWhenAvailable>",
    "    <RestartOnFailure>",
    "      <Interval>PT1M</Interval>",
    "      <Count>255</Count>",
    "    </RestartOnFailure>",
    "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>",
    "  </Settings>",
    '  <Actions Context="Author">',
    "    <Exec>",
    "      <Command>powershell.exe</Command>",
    `      <Arguments>${escapeXml(argumentLine)}</Arguments>`,
    `      <WorkingDirectory>${escapeXml(definition.workingDirectory)}</WorkingDirectory>`,
    "    </Exec>",
    "  </Actions>",
    "</Task>",
    "",
  ].join("\n");
}

function currentWindowsUserId(
  options: CreateSupervisorPlanOptions,
): string {
  if (options.windowsUserId?.trim()) return options.windowsUserId;
  const username = process.env.USERNAME?.trim() || os.userInfo().username;
  const domain = process.env.USERDOMAIN?.trim();
  return domain ? `${domain}\\${username}` : username;
}

function systemdCommands(
  serviceName: string,
): SupervisorPlan["commands"] {
  const reload = command(
    "Reload user systemd units",
    "systemctl",
    ["--user", "daemon-reload"],
  );
  const enable = command(
    "Enable user service",
    "systemctl",
    ["--user", "enable", serviceName],
  );
  return {
    install: [reload, enable],
    start: [command("Start user service", "systemctl", ["--user", "start", serviceName])],
    stop: [command("Stop user service", "systemctl", ["--user", "stop", serviceName])],
    restart: [command("Restart user service", "systemctl", ["--user", "restart", serviceName])],
    repair: [reload, enable],
    uninstall: [
      command("Disable user service", "systemctl", ["--user", "disable", serviceName]),
      reload,
    ],
    status: [
      command("Check user service active state", "systemctl", ["--user", "is-active", serviceName]),
      command("Check user service enabled state", "systemctl", ["--user", "is-enabled", serviceName]),
    ],
  };
}

function launchdUserDomain(): string {
  return `gui/${typeof process.getuid === "function" ? process.getuid() : 501}`;
}

function launchdCommands(
  definition: ServiceDefinition,
  configPath: string,
): SupervisorPlan["commands"] {
  const domain = launchdUserDomain();
  const target = `${domain}/${definition.launchdLabel}`;
  const bootout = command("Boot out LaunchAgent", "launchctl", ["bootout", target]);
  const bootstrap = command("Bootstrap LaunchAgent", "launchctl", ["bootstrap", domain, configPath]);
  const enable = command("Enable LaunchAgent", "launchctl", ["enable", target]);
  const kickstart = command("Start LaunchAgent", "launchctl", ["kickstart", "-k", target]);
  const install = [bootout, bootstrap, enable];
  const start = [...install, kickstart];
  return {
    install,
    start,
    stop: [bootout],
    restart: start,
    repair: start,
    uninstall: [bootout],
    status: [command("Print LaunchAgent status", "launchctl", ["print", target])],
  };
}

function windowsCommands(
  definition: ServiceDefinition,
  configPath: string,
): SupervisorPlan["commands"] {
  const taskStatusCommand = encodePowerShellCommand([
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    "try {",
    "  $scheduler = New-Object -ComObject 'Schedule.Service'",
    "  $scheduler.Connect()",
    `  $task = $scheduler.GetFolder('\\').GetTask(${quotePowerShellLiteral(definition.windowsTaskName)})`,
    "  $snapshot = [pscustomobject]@{ state = [int]$task.State; enabled = [bool]$task.Enabled }",
    "  [Console]::WriteLine(($snapshot | ConvertTo-Json -Compress))",
    "} catch {",
    "  exit $_.Exception.HResult",
    "}",
  ]);
  const register = command("Register scheduled task", "schtasks.exe", [
    "/Create",
    "/TN",
    definition.windowsTaskName,
    "/XML",
    configPath,
    "/F",
  ]);
  const enable = command("Enable scheduled task", "schtasks.exe", [
    "/Change",
    "/TN",
    definition.windowsTaskName,
    "/ENABLE",
  ]);
  const run = command("Run scheduled task", "schtasks.exe", [
    "/Run",
    "/TN",
    definition.windowsTaskName,
  ]);
  return {
    install: [register],
    start: [enable, run],
    stop: [command("Stop scheduled task", "schtasks.exe", ["/End", "/TN", definition.windowsTaskName])],
    restart: [
      command("Stop scheduled task", "schtasks.exe", ["/End", "/TN", definition.windowsTaskName]),
      enable,
      run,
    ],
    repair: [register],
    uninstall: [command("Delete scheduled task", "schtasks.exe", ["/Delete", "/TN", definition.windowsTaskName, "/F"])],
    status: [powershellCommand(
      "Inspect scheduled task state",
      taskStatusCommand,
      "windows-task-status",
    )],
  };
}

function fingerprintPlan(
  definition: ServiceDefinition,
  plan: Omit<SupervisorPlan, "fingerprint">,
  args: string[],
): string {
  return createHash("sha256")
    .update(JSON.stringify({
      version: 1,
      platform: plan.platform,
      supervisor: plan.supervisor,
      serviceName: plan.serviceName,
      templateConfigPath: plan.configPath,
      nodePath: process.execPath,
      entryPath: definition.entryPath,
      workingDirectory: definition.workingDirectory,
      configPath: definition.configPath,
      launchArguments: args,
      template: plan.template,
    }))
    .digest("hex");
}

export function createSupervisorPlan(
  definition: ServiceDefinition,
  platform: NodeJS.Platform,
  homeDir: string,
  options: CreateSupervisorPlanOptions = {},
): SupervisorPlan {
  const args = createServiceLaunchArguments(definition);
  let plan: Omit<SupervisorPlan, "fingerprint">;

  if (platform === "linux") {
    plan = {
      platform,
      supervisor: "systemd-user",
      serviceName: definition.serviceName,
      configPath: path.posix.join(
        homeDir,
        ".config",
        "systemd",
        "user",
        definition.serviceName,
      ),
      template: buildSystemdTemplate(definition, args),
      commands: systemdCommands(definition.serviceName),
    };
  } else if (platform === "darwin") {
    const configPath = path.posix.join(
      homeDir,
      "Library",
      "LaunchAgents",
      `${definition.launchdLabel}.plist`,
    );
    plan = {
      platform,
      supervisor: "launchd-user",
      serviceName: definition.launchdLabel,
      configPath,
      template: buildLaunchdTemplate(definition, args),
      commands: launchdCommands(definition, configPath),
    };
  } else if (platform === "win32") {
    const configPath = path.win32.join(
      homeDir,
      "AppData",
      "Roaming",
      "OpenClaw",
      "Tracevane",
      `${definition.windowsTaskName}.xml`,
    );
    plan = {
      platform,
      supervisor: "scheduled-task",
      serviceName: definition.windowsTaskName,
      configPath,
      template: buildWindowsTaskTemplate(
        definition,
        args,
        currentWindowsUserId(options),
      ),
      commands: windowsCommands(definition, configPath),
    };
  } else {
    throw new Error(`Unsupported supervisor platform: ${platform}`);
  }

  return {
    ...plan,
    fingerprint: fingerprintPlan(definition, plan, args),
  };
}
