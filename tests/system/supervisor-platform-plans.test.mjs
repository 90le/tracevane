import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import {
  createServiceLaunchArguments,
  createSupervisorPlan,
} from "../../dist/apps/api/modules/supervisor/index.js";

function fixtureDefinition(root = "C:/Trace vane/项目 & workers") {
  return {
    id: "model-gateway",
    displayName: "Tracevane Gateway & Workers",
    serviceName: "tracevane-model-gateway.service",
    windowsTaskName: "TracevaneModelGateway",
    launchdLabel: "dev.tracevane.model-gateway",
    entryPath: `${root}/dist/apps/api/daemon worker.js`,
    workingDirectory: root,
    configPath: `${root}/配置/runtime & prod.json`,
    runtimePath: `${root}/runtime/model-gateway.json`,
    logPath: `${root}/logs/model gateway.log`,
    healthUrl: "http://127.0.0.1:18796/health",
    args: ["--mode", "service worker", "--label", 'alpha "beta"'],
  };
}

function quoteSystemdToken(value) {
  return `"${value
    .replaceAll("$", () => "$$")
    .replaceAll("%", "%%")
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t")}"`;
}

test("systemd plans preserve literal dollar paths with CJK, spaces, percent, and quotes", () => {
  const definition = fixtureDefinition('/opt/${NAME}/项目 % workers');
  definition.args.push("--literal", '配置/${NAME}/space % "quote"');
  const plan = createSupervisorPlan(definition, "linux", "/home/测试 user");
  const expectedExecStart = [
    process.execPath,
    definition.entryPath,
    ...definition.args,
    "--config",
    definition.configPath,
  ].map(quoteSystemdToken).join(" ");

  assert.match(
    plan.template,
    new RegExp(`^ExecStart=${escapeRegExp(expectedExecStart)}$`, "m"),
  );
  assert.match(plan.template, /\$\$\{NAME\}/);
  assert.match(plan.template, /%%/);
  assert.match(plan.template, /\\"quote\\"/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateWindowsTaskXml(template) {
  if (process.platform !== "win32") return;
  const script = [
    '$ErrorActionPreference = "Stop"',
    "$xml = [Console]::In.ReadToEnd()",
    '$service = New-Object -ComObject "Schedule.Service"',
    "$service.Connect()",
    "$task = $service.NewTask(0)",
    "$task.XmlText = $xml",
    'Write-Output "validated"',
  ].join("; ");
  const output = execFileSync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    { input: template, encoding: "utf8" },
  );
  assert.match(output, /validated/);
}

test("platform plans are user-scoped and pass config as an argument", () => {
  const definition = fixtureDefinition();
  assert.deepEqual(createServiceLaunchArguments(definition), [
    definition.entryPath,
    ...definition.args,
    "--config",
    definition.configPath,
  ]);
  const previousHttpProxy = process.env.HTTP_PROXY;
  const previousStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.HTTP_PROXY = "http://proxy-user:proxy-secret@127.0.0.1:18080";
  process.env.OPENCLAW_STATE_DIR = "C:/secret-state";

  try {
    const windows = createSupervisorPlan(
      definition,
      "win32",
      "C:/Users/Test User",
    );
    assert.equal(windows.platform, "win32");
    assert.equal(windows.supervisor, "scheduled-task");
    assert.equal(windows.serviceName, definition.windowsTaskName);
    assert.match(windows.template, /^<Task version="1\.4"/);
    assert.equal(
      windows.configPath,
      "C:\\Users\\Test User\\AppData\\Roaming\\OpenClaw\\Tracevane\\TracevaneModelGateway.xml",
    );
    assert.match(windows.template, /<LogonTrigger>/);
    assert.match(windows.template, /<LogonType>InteractiveToken<\/LogonType>/);
    assert.match(windows.template, /<RunLevel>LeastPrivilege<\/RunLevel>/);
    assert.match(windows.template, /<AllowStartOnDemand>true<\/AllowStartOnDemand>/);
    assert.match(windows.template, /<RestartOnFailure>/);
    assert.match(windows.template, /<Interval>PT1M<\/Interval>/);
    assert.match(windows.template, /<ExecutionTimeLimit>PT0S<\/ExecutionTimeLimit>/);
    assert.match(windows.template, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
    assert.match(windows.template, /<DisallowStartIfOnBatteries>false<\/DisallowStartIfOnBatteries>/);
    assert.match(windows.template, /<StopIfGoingOnBatteries>false<\/StopIfGoingOnBatteries>/);
    assert.match(windows.template, /--config/);
    assert.match(windows.template, /项目/);
    assert.match(windows.template, /&amp;/);
    assert.match(windows.template, /&quot;/);
    assert.doesNotMatch(windows.template, /OPENCLAW_STATE_DIR=/);
    assert.doesNotMatch(windows.template, /HTTP_PROXY|HTTPS_PROXY|proxy-secret/i);
    assert.deepEqual(windows.commands.install?.[0], {
      label: "Register scheduled task",
      command: "schtasks.exe",
      args: [
        "/Create",
        "/TN",
        definition.windowsTaskName,
        "/XML",
        windows.configPath,
        "/F",
      ],
    });
    assert.deepEqual(
      [...new Set(Object.values(windows.commands).flat().map(({ command }) => command))],
      ["schtasks.exe"],
    );
    validateWindowsTaskXml(windows.template);

    const mac = createSupervisorPlan(definition, "darwin", "/Users/test user");
    assert.equal(mac.supervisor, "launchd-user");
    assert.equal(mac.serviceName, definition.launchdLabel);
    assert.equal(
      mac.configPath,
      "/Users/test user/Library/LaunchAgents/dev.tracevane.model-gateway.plist",
    );
    assert.match(mac.template, /<key>ProgramArguments<\/key>\n  <array>/);
    for (const token of [
      process.execPath,
      definition.entryPath,
      ...definition.args,
      "--config",
      definition.configPath,
    ]) {
      const escaped = token
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&apos;");
      assert.match(mac.template, new RegExp(`<string>${escapeRegExp(escaped)}<\\/string>`));
    }
    assert.match(mac.template, /<key>KeepAlive<\/key>/);
    assert.match(mac.template, /<key>RunAtLoad<\/key>/);
    assert.doesNotMatch(mac.template, /EnvironmentVariables|OPENCLAW_STATE_DIR|HTTP_PROXY|proxy-secret/i);
    assert.equal(mac.commands.install?.every(({ command }) => command === "launchctl"), true);

    const linux = createSupervisorPlan(definition, "linux", "/home/测试 user");
    assert.equal(linux.supervisor, "systemd-user");
    assert.equal(linux.serviceName, definition.serviceName);
    assert.equal(
      linux.configPath,
      "/home/测试 user/.config/systemd/user/tracevane-model-gateway.service",
    );
    const expectedExecStart = [
      process.execPath,
      definition.entryPath,
      ...definition.args,
      "--config",
      definition.configPath,
    ].map(quoteSystemdToken).join(" ");
    assert.match(linux.template, new RegExp(`^ExecStart=${escapeRegExp(expectedExecStart)}$`, "m"));
    assert.match(linux.template, /^Restart=on-failure$/m);
    assert.match(linux.template, /^WantedBy=default\.target$/m);
    assert.doesNotMatch(linux.template, /Environment=|OPENCLAW_STATE_DIR|HTTP_PROXY|proxy-secret/i);
    assert.doesNotMatch(linux.template, /\/bin\/(?:ba)?sh|cmd\.exe|powershell/i);
    assert.equal(linux.commands.install?.every(({ command }) => command === "systemctl"), true);
  } finally {
    if (previousHttpProxy === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = previousHttpProxy;
    if (previousStateDir === undefined) delete process.env.OPENCLAW_STATE_DIR;
    else process.env.OPENCLAW_STATE_DIR = previousStateDir;
  }
});

test("windows tasks bind the logon trigger and principal to one current user", () => {
  const windowsUserId = "TESTDOMAIN\\Test User & Ops";
  const plan = createSupervisorPlan(
    fixtureDefinition(),
    "win32",
    "C:/Users/Test User",
    { windowsUserId },
  );
  const escapedUserId = "TESTDOMAIN\\Test User &amp; Ops";

  assert.match(
    plan.template,
    new RegExp(`<LogonTrigger>[\\s\\S]*?<UserId>${escapeRegExp(escapedUserId)}<\\/UserId>[\\s\\S]*?<\\/LogonTrigger>`),
  );
  assert.match(
    plan.template,
    new RegExp(`<Principal id="Author">[\\s\\S]*?<UserId>${escapeRegExp(escapedUserId)}<\\/UserId>[\\s\\S]*?<\\/Principal>`),
  );
  assert.equal(
    [...plan.template.matchAll(new RegExp(`<UserId>${escapeRegExp(escapedUserId)}<\\/UserId>`, "g"))].length,
    2,
  );
});

test("windows status queries request stable HRESULT exit codes", () => {
  const definition = fixtureDefinition();
  const plan = createSupervisorPlan(
    definition,
    "win32",
    "C:/Users/Test User",
    { windowsUserId: "TESTDOMAIN\\Test User" },
  );

  assert.deepEqual(plan.commands.status, [
    {
      label: "Query scheduled task",
      command: "schtasks.exe",
      args: ["/Query", "/TN", definition.windowsTaskName, "/HResult"],
    },
  ]);
});

test("launchd lifecycle actions always rebuild a booted current-user agent", () => {
  const plan = createSupervisorPlan(
    fixtureDefinition("/opt/Trace vane/项目"),
    "darwin",
    "/Users/test",
  );
  const domain = `gui/${typeof process.getuid === "function" ? process.getuid() : 501}`;
  const target = `${domain}/dev.tracevane.model-gateway`;
  const bootout = { command: "launchctl", args: ["bootout", target] };
  const bootstrap = { command: "launchctl", args: ["bootstrap", domain, plan.configPath] };
  const enable = { command: "launchctl", args: ["enable", target] };
  const kickstart = { command: "launchctl", args: ["kickstart", "-k", target] };
  const nativeSequence = (action) => plan.commands[action]?.map(
    ({ command, args }) => ({ command, args }),
  );

  assert.deepEqual(nativeSequence("install"), [bootout, bootstrap, enable]);
  for (const action of ["start", "restart", "repair"]) {
    assert.deepEqual(
      nativeSequence(action),
      [bootout, bootstrap, enable, kickstart],
      action,
    );
  }
  assert.deepEqual(nativeSequence("stop"), [bootout]);
  assert.deepEqual(nativeSequence("uninstall"), [bootout]);
  assert.doesNotMatch(JSON.stringify(plan.commands), /"disable"/);
});

test("fingerprints deterministically cover every persisted launch input", () => {
  const definition = fixtureDefinition("/opt/Trace vane/项目");
  const plan = createSupervisorPlan(definition, "linux", "/home/test");
  const repeated = createSupervisorPlan(
    structuredClone(definition),
    "linux",
    "/home/test",
  );

  assert.match(plan.fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(repeated.fingerprint, plan.fingerprint);
  assert.deepEqual(repeated, plan);
  const reordered = Object.fromEntries(Object.entries(definition).reverse());
  assert.equal(
    createSupervisorPlan(reordered, "linux", "/home/test").fingerprint,
    plan.fingerprint,
  );

  for (const mutate of [
    (copy) => { copy.entryPath += ".next"; },
    (copy) => { copy.workingDirectory += "/moved"; },
    (copy) => { copy.configPath += ".next"; },
    (copy) => { copy.args.push("--new-mode"); },
    (copy) => { copy.displayName += " Next"; },
  ]) {
    const changed = structuredClone(definition);
    mutate(changed);
    assert.notEqual(
      createSupervisorPlan(changed, "linux", "/home/test").fingerprint,
      plan.fingerprint,
    );
  }

  assert.notEqual(
    createSupervisorPlan(definition, "linux", "/home/other").fingerprint,
    plan.fingerprint,
  );

  const originalExecPath = process.execPath;
  try {
    process.execPath = `${originalExecPath}.next`;
    assert.notEqual(
      createSupervisorPlan(definition, "linux", "/home/test").fingerprint,
      plan.fingerprint,
    );
  } finally {
    process.execPath = originalExecPath;
  }
});
