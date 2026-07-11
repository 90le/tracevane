import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createServiceManager,
} from "../../dist/apps/api/modules/supervisor/service-manager.js";
import {
  createSupervisorPlan,
} from "../../dist/apps/api/modules/supervisor/platform-plans.js";

const REQUIRED_MANAGER_FIELDS = [
  "active",
  "checkedAt",
  "configCurrent",
  "enabled",
  "errorCode",
  "errorMessage",
  "installed",
  "mode",
  "state",
  "supervisor",
];

function fixtureDefinition(root) {
  return {
    id: "model-gateway",
    displayName: "Fixture",
    serviceName: "tracevane-fixture.service",
    windowsTaskName: "TracevaneFixture",
    launchdLabel: "dev.tracevane.fixture",
    entryPath: path.join(root, "fixture.mjs"),
    workingDirectory: root,
    configPath: path.join(root, "config.json"),
    runtimePath: path.join(root, "runtime.json"),
    logPath: path.join(root, "fixture.log"),
    healthUrl: "http://127.0.0.1:1/status",
    args: [],
  };
}

function sessionStatus(overrides = {}) {
  return {
    mode: "session",
    supervisor: "session",
    installed: false,
    enabled: null,
    active: false,
    state: "stopped",
    configCurrent: true,
    checkedAt: "2026-07-11T00:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    pid: null,
    restartCount: 0,
    ...overrides,
  };
}

function createFakeSession(options = {}) {
  const calls = [];
  const log = options.log ?? [];
  let current = options.initial ?? sessionStatus();
  return {
    calls,
    session: {
      async status(serviceId) {
        calls.push(["status", serviceId]);
        log.push("session:status");
        return options.onStatus?.(serviceId, current) ?? current;
      },
      async start(definition) {
        calls.push(["start", definition.id]);
        log.push("session:start");
        current = options.onStart?.(definition, current) ?? sessionStatus({
          active: true,
          state: "running",
          pid: 1234,
        });
        return current;
      },
      async stop(serviceId) {
        calls.push(["stop", serviceId]);
        log.push("session:stop");
        current = options.onStop?.(serviceId, current) ?? sessionStatus();
        return current;
      },
      async dispose() {
        calls.push(["dispose"]);
        log.push("session:dispose");
      },
    },
  };
}

function commandResult(command, overrides = {}) {
  return {
    ...command,
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    errorCode: null,
    errorMessage: null,
    durationMs: 1,
    ...overrides,
  };
}

function recordingFileSystem(log) {
  return {
    async readFile(...args) {
      log.push(["readFile", args[0]]);
      return fs.promises.readFile(...args);
    },
    async mkdir(...args) {
      log.push(["mkdir", args[0]]);
      return fs.promises.mkdir(...args);
    },
    async writeFile(...args) {
      log.push(["writeFile", args[0]]);
      return fs.promises.writeFile(...args);
    },
    async rename(...args) {
      log.push(["rename", args[0], args[1]]);
      return fs.promises.rename(...args);
    },
    async unlink(...args) {
      log.push(["unlink", args[0]]);
      return fs.promises.unlink(...args);
    },
  };
}

test("not installed + status/session delegates only to session status", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-status-"));
  const { calls, session } = createFakeSession();
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    session,
    runner: async () => {
      assert.fail("session status must not execute persistent commands");
    },
    probe: async () => {
      assert.fail("session status must not health-check");
    },
  });

  try {
    const response = await manager.manage(fixtureDefinition(root), {
      action: "status",
      mode: "session",
      apply: true,
    });

    assert.equal(response.ok, true);
    assert.equal(response.action, "status");
    assert.deepEqual(response.commands, []);
    assert.equal(response.templateWritten, false);
    assert.equal(response.configCurrent, true);
    assert.deepEqual(Object.keys(response.manager).sort(), REQUIRED_MANAGER_FIELDS);
    assert.deepEqual(response.manager, {
      mode: "session",
      supervisor: "session",
      installed: false,
      enabled: null,
      active: false,
      state: "stopped",
      configCurrent: true,
      checkedAt: "2026-07-11T00:00:00.000Z",
      errorCode: null,
      errorMessage: null,
    });
    assert.deepEqual(calls, [["status", "model-gateway"]]);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("not installed + start/session starts one API-owned child", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-start-"));
  const { calls, session } = createFakeSession();
  const commandCalls = [];
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    session,
    runner: async (...args) => {
      commandCalls.push(args);
      assert.fail("a missing persistent template must not run a command");
    },
    probe: async () => true,
  });

  try {
    const response = await manager.manage(fixtureDefinition(root), {
      action: "start",
      mode: "session",
      apply: true,
    });

    assert.equal(response.ok, true);
    assert.equal(response.manager.mode, "session");
    assert.equal(response.manager.state, "running");
    assert.deepEqual(calls, [["start", "model-gateway"]]);
    assert.deepEqual(commandCalls, []);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("apply false returns session status without lifecycle mutation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-dry-"));
  const { calls, session } = createFakeSession();
  const manager = createServiceManager({
    platform: "linux",
    homeDir: root,
    session,
    runner: async () => assert.fail("dry-run must not run commands"),
    probe: async () => assert.fail("dry-run must not probe readiness"),
  });

  try {
    const response = await manager.manage(fixtureDefinition(root), {
      action: "start",
      mode: "session",
      apply: false,
    });

    assert.equal(response.ok, true);
    assert.equal(response.manager.state, "stopped");
    assert.deepEqual(calls, [["status", "model-gateway"]]);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("not installed + restart/persistent reports task-not-found without a mutator", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-missing-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const commandCalls = [];
  const { session } = createFakeSession();
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => {
      commandCalls.push(command);
      return commandResult(command, {
        ok: false,
        exitCode: -2147024894,
        stderr: "错误：系统找不到指定的计划任务。",
      });
    },
    probe: async () => assert.fail("a missing task must not be probed"),
  });

  try {
    const response = await manager.manage(definition, {
      action: "restart",
      mode: "persistent",
      apply: true,
    });

    assert.equal(response.ok, false);
    assert.equal(response.manager.state, "not-installed");
    assert.equal(response.manager.errorCode, "task-not-found");
    assert.equal(response.manager.errorMessage, "Persistent service is not installed.");
    assert.equal(response.configCurrent, true);
    assert.equal(response.templateWritten, false);
    assert.equal(response.commands.length, 1);
    assert.deepEqual(commandCalls.map(({ args }) => args), [
      ["/Query", "/TN", definition.windowsTaskName, "/HResult"],
    ]);
    assert.doesNotMatch(
      JSON.stringify(commandCalls),
      /\/End|\/Run|\/Create|\/Delete/,
    );
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("not installed + install stops session, atomically writes, registers, starts once, and becomes ready", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-install-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  const order = [];
  const fileOps = [];
  const { calls, session } = createFakeSession({
    log: order,
    initial: sessionStatus({ active: true, state: "running", pid: 4321 }),
  });
  const commandCalls = [];
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    fs: recordingFileSystem(fileOps),
    runner: async (command) => {
      order.push(`command:${command.label}`);
      commandCalls.push(command);
      return commandResult(command);
    },
    probe: async (url) => {
      order.push("probe");
      assert.equal(url, definition.healthUrl);
      return true;
    },
  });

  try {
    const response = await manager.manage(definition, {
      action: "install",
      mode: "persistent",
      apply: true,
    });

    assert.equal(response.ok, true);
    assert.equal(response.templateWritten, true);
    assert.equal(response.configCurrent, true);
    assert.equal(response.manager.mode, "persistent");
    assert.equal(response.manager.state, "running");
    assert.equal(response.manager.active, true);
    assert.equal(response.manager.enabled, true);
    assert.equal(response.manager.errorCode, null);
    assert.deepEqual(calls, [["stop", "model-gateway"]]);
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), ["/Create", "/Run"]);
    assert.equal(commandCalls.filter(({ args }) => args.includes("/Run")).length, 1);
    assert.deepEqual(order, [
      "session:stop",
      "command:Register scheduled task",
      "command:Run scheduled task",
      "probe",
    ]);
    assert.equal(fs.readFileSync(plan.configPath, "utf8"), plan.template);
    const write = fileOps.find(([operation]) => operation === "writeFile");
    const rename = fileOps.find(([operation]) => operation === "rename");
    assert.ok(write);
    assert.ok(rename);
    assert.equal(path.dirname(write[1]), path.dirname(plan.configPath));
    assert.notEqual(write[1], plan.configPath);
    assert.deepEqual(rename.slice(1), [write[1], plan.configPath]);
    assert.deepEqual(
      fs.readdirSync(path.dirname(plan.configPath)),
      [path.basename(plan.configPath)],
    );
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stale template + ordinary restart returns stale-config without a mutator", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-stale-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, `${plan.template}<!-- stale -->\n`, "utf8");
  const commandCalls = [];
  const { calls, session } = createFakeSession();
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => {
      commandCalls.push(command);
      return commandResult(command, { stdout: "任務已就緒" });
    },
    probe: async () => assert.fail("a stale ordinary restart must not probe"),
  });

  try {
    const response = await manager.manage(definition, {
      action: "restart",
      mode: "persistent",
      apply: true,
    });

    assert.equal(response.ok, false);
    assert.equal(response.manager.state, "stale-config");
    assert.equal(response.manager.errorCode, "stale-config");
    assert.equal(response.manager.configCurrent, false);
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), ["/Query"]);
    assert.deepEqual(calls, []);
    assert.doesNotMatch(JSON.stringify(commandCalls), /\/End|\/Run|\/Create/);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stale template + repair atomically replaces, registers, restarts once, and becomes ready", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-repair-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, "stale template fixture", "utf8");
  const order = [];
  const fileOps = [];
  const { session } = createFakeSession({ log: order });
  const commandCalls = [];
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    fs: recordingFileSystem(fileOps),
    runner: async (command) => {
      order.push(`command:${command.args[0]}`);
      commandCalls.push(command);
      return commandResult(command);
    },
    probe: async () => {
      order.push("probe");
      return true;
    },
  });

  try {
    const response = await manager.manage(definition, {
      action: "repair",
      mode: "persistent",
      apply: true,
    });

    assert.equal(response.ok, true);
    assert.equal(response.templateWritten, true);
    assert.equal(response.configCurrent, true);
    assert.equal(response.manager.state, "running");
    assert.equal(fs.readFileSync(plan.configPath, "utf8"), plan.template);
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), [
      "/Query",
      "/Create",
      "/End",
      "/Run",
    ]);
    assert.equal(commandCalls.filter(({ args }) => args.includes("/Run")).length, 1);
    assert.deepEqual(order, [
      "command:/Query",
      "session:stop",
      "command:/Create",
      "command:/End",
      "command:/Run",
      "probe",
    ]);
    assert.equal(fileOps.filter(([operation]) => operation === "rename").length, 1);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistent running + uninstall stops, unregisters, removes, and returns session-ready", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-uninstall-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const order = [];
  const fileOps = [];
  const { calls, session } = createFakeSession({ log: order });
  const commandCalls = [];
  const fileSystem = recordingFileSystem(fileOps);
  const originalUnlink = fileSystem.unlink;
  fileSystem.unlink = async (...args) => {
    order.push("unlink");
    return originalUnlink(...args);
  };
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    fs: fileSystem,
    runner: async (command) => {
      order.push(`command:${command.args[0]}`);
      commandCalls.push(command);
      return commandResult(command);
    },
    probe: async () => true,
  });

  try {
    const response = await manager.manage(definition, {
      action: "uninstall",
      mode: "persistent",
      apply: true,
    });

    assert.equal(response.ok, true);
    assert.equal(response.templateWritten, false);
    assert.equal(response.configCurrent, true);
    assert.deepEqual(response.manager, {
      mode: "session",
      supervisor: "session",
      installed: false,
      enabled: null,
      active: false,
      state: "stopped",
      configCurrent: true,
      checkedAt: response.manager.checkedAt,
      errorCode: null,
      errorMessage: null,
    });
    assert.match(response.manager.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), [
      "/Query",
      "/End",
      "/Delete",
    ]);
    assert.deepEqual(order, [
      "command:/Query",
      "command:/End",
      "command:/Delete",
      "unlink",
    ]);
    assert.equal(fs.existsSync(plan.configPath), false);
    assert.deepEqual(calls, []);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("session start refuses to create an owner when persistent stop fails", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-to-session-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const order = [];
  const { calls, session } = createFakeSession({ log: order });
  const commandCalls = [];
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => {
      order.push(`command:${command.args[0]}`);
      commandCalls.push(command);
      if (command.args.includes("/End")) {
        return commandResult(command, {
          ok: false,
          exitCode: -2147024891,
          stderr: "拒绝访问。",
          errorCode: "permission-denied",
          errorMessage: "Supervisor command permission denied.",
        });
      }
      return commandResult(command);
    },
    probe: async () => false,
  });

  try {
    const response = await manager.manage(definition, {
      action: "start",
      mode: "session",
      apply: true,
    });

    assert.equal(response.ok, false);
    assert.equal(response.manager.mode, "persistent");
    assert.equal(response.manager.errorCode, "permission-denied");
    assert.equal(response.manager.errorMessage, "Supervisor command permission denied.");
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), ["/Query", "/End"]);
    assert.deepEqual(calls, []);
    assert.deepEqual(order, ["command:/Query", "command:/End"]);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("launchd install normalizes exact bootout exit 3 and executes one closed start plan", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-launchd-"));
  const definition = fixtureDefinition(root);
  const commandCalls = [];
  const { session } = createFakeSession();
  const manager = createServiceManager({
    platform: "darwin",
    homeDir: root,
    session,
    runner: async (command) => {
      commandCalls.push(command);
      if (command.args[0] === "bootout") {
        return commandResult(command, {
          ok: false,
          exitCode: 3,
          stderr: "未找到服务",
          errorCode: "unknown",
          errorMessage: "Supervisor command failed.",
        });
      }
      return commandResult(command);
    },
    probe: async () => true,
  });

  try {
    const response = await manager.manage(definition, {
      action: "install",
      mode: "persistent",
      apply: true,
    });

    assert.equal(response.ok, true);
    assert.equal(response.manager.state, "running");
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), [
      "bootout",
      "bootstrap",
      "enable",
      "kickstart",
    ]);
    assert.equal(commandCalls.filter(({ args }) => args[0] === "bootout").length, 1);
    assert.equal(response.commands[0].ok, true);
    assert.equal(response.commands[0].exitCode, 3);
    assert.equal(response.commands[0].errorCode, null);
    assert.equal(response.commands[0].errorMessage, null);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("systemd status classifies only exact machine tokens", async () => {
  const scenarios = [
    {
      name: "active enabled",
      activeToken: "active\n",
      enabledToken: "enabled\n",
      expected: { active: true, enabled: true, state: "running", errorCode: null },
    },
    {
      name: "inactive disabled",
      activeToken: "inactive\n",
      activeExit: 3,
      enabledToken: "disabled\n",
      enabledExit: 1,
      expected: { active: false, enabled: false, state: "stopped", errorCode: null },
    },
    {
      name: "failed enabled",
      activeToken: "failed\n",
      activeExit: 3,
      enabledToken: "enabled\n",
      expected: {
        active: false,
        enabled: true,
        state: "failed",
        errorCode: "runtime-not-ready",
      },
    },
    {
      name: "localized prose",
      activeToken: "正在运行\n",
      enabledToken: "已启用\n",
      expected: { active: null, enabled: null, state: "unknown", errorCode: null },
    },
  ];

  for (const scenario of scenarios) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-systemd-"));
    const definition = fixtureDefinition(root);
    const plan = createSupervisorPlan(definition, "linux", root);
    fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
    fs.writeFileSync(plan.configPath, plan.template, "utf8");
    const { session } = createFakeSession();
    const manager = createServiceManager({
      platform: "linux",
      homeDir: root,
      session,
      runner: async (command) => {
        const active = command.args.includes("is-active");
        const exitCode = active
          ? scenario.activeExit ?? 0
          : scenario.enabledExit ?? 0;
        return commandResult(command, {
          ok: exitCode === 0,
          exitCode,
          stdout: active ? scenario.activeToken : scenario.enabledToken,
          errorCode: exitCode === 0 ? null : "unknown",
          errorMessage: exitCode === 0 ? null : "Supervisor command failed.",
        });
      },
      probe: async () => false,
    });

    try {
      const response = await manager.manage(definition, {
        action: "status",
        mode: "persistent",
        apply: true,
      });
      assert.deepEqual(
        {
          active: response.manager.active,
          enabled: response.manager.enabled,
          state: response.manager.state,
          errorCode: response.manager.errorCode,
        },
        scenario.expected,
        scenario.name,
      );
      assert.equal(
        response.ok,
        scenario.expected.errorCode === null,
        `${scenario.name}: response ok`,
      );
      assert.equal(response.commands.length, 2, scenario.name);
    } finally {
      await manager.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("Windows and launchd status ignore localized prose and launchd uses a fixed absence exit", async () => {
  for (const scenario of [
    {
      platform: "win32",
      result: { ok: true, exitCode: 0, stdout: "任务正在运行\n" },
      expected: { installed: true, active: null, state: "unknown", errorCode: null },
    },
    {
      platform: "darwin",
      result: { ok: true, exitCode: 0, stdout: "服务正在运行\n" },
      expected: { installed: true, active: null, state: "unknown", errorCode: null },
    },
    {
      platform: "darwin",
      result: {
        ok: false,
        exitCode: 113,
        stdout: "",
        stderr: "找不到服务",
        errorCode: "unknown",
        errorMessage: "Supervisor command failed.",
      },
      expected: {
        installed: false,
        active: false,
        state: "not-installed",
        errorCode: "task-not-found",
      },
    },
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-localized-"));
    const definition = fixtureDefinition(root);
    const plan = createSupervisorPlan(
      definition,
      scenario.platform,
      root,
      { windowsUserId: "TEST\\Fixture" },
    );
    fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
    fs.writeFileSync(plan.configPath, plan.template, "utf8");
    const { session } = createFakeSession();
    const manager = createServiceManager({
      platform: scenario.platform,
      homeDir: root,
      windowsUserId: "TEST\\Fixture",
      session,
      runner: async (command) => commandResult(command, scenario.result),
      probe: async () => false,
    });
    try {
      const response = await manager.manage(definition, {
        action: "status",
        mode: "persistent",
        apply: true,
      });
      assert.deepEqual(
        {
          installed: response.manager.installed,
          active: response.manager.active,
          state: response.manager.state,
          errorCode: response.manager.errorCode,
        },
        scenario.expected,
        `${scenario.platform}:${scenario.result.exitCode}`,
      );
      assert.doesNotMatch(response.manager.errorMessage ?? "", /找不到|正在运行/);
    } finally {
      await manager.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("successful persistent start with failed readiness returns degraded", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-degraded-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "linux", root);
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const order = [];
  const { calls, session } = createFakeSession({ log: order });
  const commandCalls = [];
  const manager = createServiceManager({
    platform: "linux",
    homeDir: root,
    session,
    runner: async (command) => {
      const action = command.args.at(-2) ?? command.args.at(-1);
      order.push(`command:${action}`);
      commandCalls.push(command);
      if (command.args.includes("is-active")) {
        return commandResult(command, {
          ok: false,
          exitCode: 3,
          stdout: "inactive\n",
          errorCode: "unknown",
          errorMessage: "Supervisor command failed.",
        });
      }
      if (command.args.includes("is-enabled")) {
        return commandResult(command, { stdout: "enabled\n" });
      }
      return commandResult(command);
    },
    probe: async () => {
      order.push("probe");
      return false;
    },
  });

  try {
    const response = await manager.manage(definition, {
      action: "start",
      mode: "persistent",
      apply: true,
    });

    assert.equal(response.ok, false);
    assert.equal(response.templateWritten, false);
    assert.equal(response.manager.state, "degraded");
    assert.equal(response.manager.errorCode, "runtime-not-ready");
    assert.equal(response.manager.errorMessage, "Persistent service did not become ready.");
    assert.deepEqual(calls, [["stop", "model-gateway"]]);
    assert.equal(commandCalls.filter(({ args }) => args.includes("start")).length, 1);
    assert.deepEqual(commandCalls.map(({ args }) => args.at(-2) ?? args.at(-1)), [
      "is-active",
      "is-enabled",
      "start",
    ]);
    assert.deepEqual(order, [
      "command:is-active",
      "command:is-enabled",
      "session:stop",
      "command:start",
      "probe",
    ]);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("ensure-running persistent chooses install, repair, start, or no-op", async () => {
  const scenarios = [
    {
      name: "missing",
      template: null,
      activeToken: null,
      expectedCommands: ["daemon-reload", "enable", "start"],
      templateWritten: true,
      sessionStops: 1,
      probes: 1,
    },
    {
      name: "stale",
      template: "stale",
      activeToken: "active",
      expectedCommands: [
        "is-active",
        "is-enabled",
        "daemon-reload",
        "enable",
        "restart",
      ],
      templateWritten: true,
      sessionStops: 1,
      probes: 1,
    },
    {
      name: "stopped",
      template: "current",
      activeToken: "inactive",
      expectedCommands: ["is-active", "is-enabled", "start"],
      templateWritten: false,
      sessionStops: 1,
      probes: 1,
    },
    {
      name: "running",
      template: "current",
      activeToken: "active",
      expectedCommands: ["is-active", "is-enabled"],
      templateWritten: false,
      sessionStops: 0,
      probes: 0,
    },
  ];

  for (const scenario of scenarios) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-ensure-"));
    const definition = fixtureDefinition(root);
    const plan = createSupervisorPlan(definition, "linux", root);
    if (scenario.template !== null) {
      fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
      fs.writeFileSync(
        plan.configPath,
        scenario.template === "current" ? plan.template : "stale fixture",
        "utf8",
      );
    }
    const commandCalls = [];
    let probes = 0;
    const { calls, session } = createFakeSession();
    const manager = createServiceManager({
      platform: "linux",
      homeDir: root,
      session,
      runner: async (command) => {
        commandCalls.push(command);
        if (command.args.includes("is-active")) {
          const inactive = scenario.activeToken === "inactive";
          return commandResult(command, {
            ok: !inactive,
            exitCode: inactive ? 3 : 0,
            stdout: `${scenario.activeToken}\n`,
            errorCode: inactive ? "unknown" : null,
            errorMessage: inactive ? "Supervisor command failed." : null,
          });
        }
        if (command.args.includes("is-enabled")) {
          return commandResult(command, { stdout: "enabled\n" });
        }
        return commandResult(command);
      },
      probe: async () => {
        probes += 1;
        return true;
      },
    });

    try {
      const response = await manager.manage(definition, {
        action: "ensure-running",
        mode: "persistent",
        apply: true,
      });
      assert.equal(response.ok, true, scenario.name);
      assert.equal(response.manager.state, "running", scenario.name);
      assert.equal(response.templateWritten, scenario.templateWritten, scenario.name);
      assert.deepEqual(
        commandCalls.map(({ args }) => args[1]),
        scenario.expectedCommands,
        scenario.name,
      );
      assert.equal(
        calls.filter(([operation]) => operation === "stop").length,
        scenario.sessionStops,
        scenario.name,
      );
      assert.equal(probes, scenario.probes, scenario.name);
    } finally {
      await manager.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("concurrent install and start serialize per service and produce one persistent start", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-race-"));
  const definition = fixtureDefinition(root);
  let releaseRegister;
  let signalRegister;
  const registerGate = new Promise((resolve) => {
    releaseRegister = resolve;
  });
  const registerEntered = new Promise((resolve) => {
    signalRegister = resolve;
  });
  let running = false;
  const commandCalls = [];
  const { calls, session } = createFakeSession();
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => {
      commandCalls.push(command);
      if (command.args.includes("/Create")) {
        signalRegister();
        await registerGate;
      }
      if (command.args.includes("/Run")) running = true;
      return commandResult(command);
    },
    probe: async () => running,
  });

  try {
    const installing = manager.manage(definition, {
      action: "install",
      mode: "persistent",
      apply: true,
    });
    await registerEntered;
    const starting = manager.manage(definition, {
      action: "start",
      mode: "persistent",
      apply: true,
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(
      commandCalls.map(({ args }) => args[0]),
      ["/Create"],
      "start must remain queued while install is registering",
    );

    releaseRegister();
    const [installed, started] = await Promise.all([installing, starting]);
    assert.equal(installed.ok, true);
    assert.equal(started.ok, true);
    assert.equal(started.manager.state, "running");
    assert.equal(commandCalls.filter(({ args }) => args.includes("/Run")).length, 1);
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), [
      "/Create",
      "/Run",
      "/Query",
    ]);
    assert.equal(calls.filter(([operation]) => operation === "stop").length, 1);
  } finally {
    releaseRegister();
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistent apply false and preview perform no command or lifecycle mutation", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-preview-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const { calls, session } = createFakeSession();
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async () => assert.fail("preview must not execute status or mutator commands"),
    probe: async () => assert.fail("preview must not probe readiness"),
  });

  try {
    for (const request of [
      { action: "install", mode: "persistent", apply: false },
      { action: "preview", mode: "persistent", apply: true },
    ]) {
      const response = await manager.manage(definition, request);
      assert.equal(response.ok, true);
      assert.equal(response.templateWritten, false);
      assert.equal(response.configCurrent, true);
      assert.equal(response.manager.mode, "persistent");
      assert.equal(response.manager.installed, true);
      assert.equal(response.manager.active, null);
      assert.equal(response.manager.enabled, null);
      assert.equal(response.manager.state, "unknown");
      assert.deepEqual(response.commands, []);
    }
    assert.deepEqual(calls, []);
    assert.equal(fs.readFileSync(plan.configPath, "utf8"), plan.template);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("atomic template write cleans temporary files after write or rename failure", async () => {
  for (const failureStage of ["writeFile", "rename"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-write-fail-"));
    const definition = fixtureDefinition(root);
    const plan = createSupervisorPlan(definition, "win32", root, {
      windowsUserId: "TEST\\Fixture",
    });
    const fileOps = [];
    const fileSystem = recordingFileSystem(fileOps);
    const original = fileSystem[failureStage];
    fileSystem[failureStage] = async (...args) => {
      if (failureStage === "writeFile") await original(...args);
      const error = new Error(`${failureStage} fixture failure`);
      error.code = "EIO";
      throw error;
    };
    const { session } = createFakeSession();
    const manager = createServiceManager({
      platform: "win32",
      homeDir: root,
      windowsUserId: "TEST\\Fixture",
      session,
      fs: fileSystem,
      runner: async () => assert.fail("failed atomic write must not run commands"),
      probe: async () => assert.fail("failed atomic write must not probe"),
    });

    try {
      const response = await manager.manage(definition, {
        action: "install",
        mode: "persistent",
        apply: true,
      });
      assert.equal(response.ok, false, failureStage);
      assert.equal(response.templateWritten, false, failureStage);
      assert.equal(response.manager.errorCode, "template-invalid", failureStage);
      assert.equal(fs.existsSync(plan.configPath), false, failureStage);
      assert.deepEqual(
        fs.readdirSync(path.dirname(plan.configPath)),
        [],
        `${failureStage}: temporary file cleanup`,
      );
      assert.equal(
        fileOps.some(([operation]) => operation === "unlink"),
        true,
        `${failureStage}: cleanup attempted`,
      );
    } finally {
      await manager.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("launchd bootout exit 3 never masks permission or timeout failures", async () => {
  for (const failure of [
    {
      errorCode: "permission-denied",
      errorMessage: "Supervisor command permission denied.",
      localized: "权限被拒绝",
    },
    {
      errorCode: "command-timeout",
      errorMessage: "Supervisor command timed out.",
      localized: "命令执行超时",
    },
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-launchd-fail-"));
    const definition = fixtureDefinition(root);
    const commandCalls = [];
    const { session } = createFakeSession();
    const manager = createServiceManager({
      platform: "darwin",
      homeDir: root,
      session,
      runner: async (command) => {
        commandCalls.push(command);
        return commandResult(command, {
          ok: false,
          exitCode: 3,
          stderr: failure.localized,
          errorCode: failure.errorCode,
          errorMessage: failure.localized,
        });
      },
      probe: async () => assert.fail("failed bootout must not probe"),
    });

    try {
      const response = await manager.manage(definition, {
        action: "install",
        mode: "persistent",
        apply: true,
      });
      assert.equal(response.ok, false, failure.errorCode);
      assert.equal(response.manager.errorCode, failure.errorCode);
      assert.equal(response.manager.errorMessage, failure.errorMessage);
      assert.deepEqual(commandCalls.map(({ args }) => args[0]), ["bootout"]);
      assert.equal(response.commands[0].ok, false);
      assert.equal(response.commands[0].errorCode, failure.errorCode);
    } finally {
      await manager.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("session-to-persistent transition refuses writes and commands when session stop remains active", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-session-stop-fail-"));
  const definition = fixtureDefinition(root);
  const fileOps = [];
  const { calls, session } = createFakeSession({
    initial: sessionStatus({ active: true, state: "running", pid: 777 }),
    onStop: () => sessionStatus({
      active: true,
      state: "failed",
      pid: 777,
      errorCode: "permission-denied",
      errorMessage: "拒绝终止进程",
    }),
  });
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    fs: recordingFileSystem(fileOps),
    runner: async () => assert.fail("persistent command must wait for session shutdown"),
    probe: async () => assert.fail("refused transition must not probe"),
  });

  try {
    const response = await manager.manage(definition, {
      action: "install",
      mode: "persistent",
      apply: true,
    });
    assert.equal(response.ok, false);
    assert.equal(response.manager.mode, "session");
    assert.equal(response.manager.active, true);
    assert.equal(response.manager.state, "failed");
    assert.equal(response.manager.errorCode, "permission-denied");
    assert.equal(response.manager.errorMessage, "Session owner did not stop.");
    assert.deepEqual(calls, [["stop", "model-gateway"]]);
    assert.equal(fileOps.some(([operation]) => operation === "writeFile"), false);
    assert.deepEqual(fs.readdirSync(root), []);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("session responses expose only required manager fields with stable errors", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-shape-"));
  const { session } = createFakeSession({
    initial: sessionStatus({
      active: true,
      state: "failed",
      pid: 9123,
      restartCount: 4,
      errorCode: "permission-denied",
      errorMessage: "本地化 fixture failure",
    }),
  });
  const manager = createServiceManager({
    platform: "linux",
    homeDir: root,
    session,
  });
  try {
    const response = await manager.manage(fixtureDefinition(root), {
      action: "status",
      mode: "session",
      apply: true,
    });
    assert.equal(response.ok, false);
    assert.deepEqual(Object.keys(response.manager).sort(), REQUIRED_MANAGER_FIELDS);
    assert.equal(response.manager.errorCode, "permission-denied");
    assert.equal(response.manager.errorMessage, "Supervisor command permission denied.");
    assert.equal("pid" in response.manager, false);
    assert.equal("restartCount" in response.manager, false);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("command evidence is bounded, fixed-command-only, and redacts trusted secrets", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-secret-"));
  const secret = "tracevane-fixture-secret-9f7a";
  const definition = fixtureDefinition(root);
  const receivedRedactions = [];
  const { session } = createFakeSession();
  const manager = createServiceManager({
    platform: "linux",
    homeDir: root,
    session,
    redact: [secret],
    runner: async (command, options) => {
      receivedRedactions.push(options.redact);
      return commandResult(command, {
        label: secret,
        command: secret,
        args: [secret],
        stdout: `${secret}${"x".repeat(20 * 1024)}`,
        stderr: secret,
      });
    },
    probe: async () => true,
  });
  try {
    const response = await manager.manage(definition, {
      action: "install",
      mode: "persistent",
      apply: true,
    });
    assert.equal(response.ok, true);
    assert.equal(JSON.stringify(response).includes(secret), false);
    assert.equal(
      response.commands.every(
        ({ stdout, stderr }) =>
          Buffer.byteLength(stdout, "utf8") <= 16 * 1024 &&
          Buffer.byteLength(stderr, "utf8") <= 16 * 1024,
      ),
      true,
    );
    assert.equal(response.commands.every(({ stdout }) => stdout.includes("[REDACTED]")), true);
    assert.equal(response.commands.every(({ stderr }) => stderr === "[REDACTED]"), true);
    assert.equal(
      receivedRedactions.every((values) => values?.includes(secret)),
      true,
    );
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dispose rejects new work, waits in-flight operations, then disposes session", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-dispose-"));
  const definition = fixtureDefinition(root);
  let releaseRegister;
  let signalRegister;
  const registerGate = new Promise((resolve) => {
    releaseRegister = resolve;
  });
  const registerEntered = new Promise((resolve) => {
    signalRegister = resolve;
  });
  const order = [];
  const { session } = createFakeSession({ log: order });
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => {
      order.push(`command:${command.args[0]}`);
      if (command.args.includes("/Create")) {
        signalRegister();
        await registerGate;
      }
      return commandResult(command);
    },
    probe: async () => true,
  });
  const installing = manager.manage(definition, {
    action: "install",
    mode: "persistent",
    apply: true,
  });
  let disposing;
  try {
    await registerEntered;
    disposing = manager.dispose();
    let settled = false;
    void disposing.then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false, "dispose must wait for the in-flight install");
    assert.equal(order.includes("session:dispose"), false);
    await assert.rejects(
      manager.manage(definition, {
        action: "status",
        mode: "session",
        apply: true,
      }),
      /disposed/,
    );

    releaseRegister();
    assert.equal((await installing).ok, true);
    await disposing;
    assert.deepEqual(order, [
      "session:stop",
      "command:/Create",
      "command:/Run",
      "session:dispose",
    ]);
    assert.equal(manager.dispose(), disposing);
  } finally {
    releaseRegister();
    await Promise.allSettled([installing, disposing]);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("uninstall is idempotent for missing task or template and never runs a mutator", async () => {
  for (const templateState of ["missing", "residual"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-uninstall-missing-"));
    const definition = fixtureDefinition(root);
    const plan = createSupervisorPlan(definition, "win32", root, {
      windowsUserId: "TEST\\Fixture",
    });
    if (templateState === "residual") {
      fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
      fs.writeFileSync(plan.configPath, plan.template, "utf8");
    }
    const commandCalls = [];
    const { calls, session } = createFakeSession();
    const manager = createServiceManager({
      platform: "win32",
      homeDir: root,
      windowsUserId: "TEST\\Fixture",
      session,
      runner: async (command) => {
        commandCalls.push(command);
        assert.equal(command.args.includes("/Query"), true);
        return commandResult(command, {
          ok: false,
          exitCode: -2147024894,
          stderr: "找不到计划任务",
        });
      },
      probe: async () => assert.fail("missing uninstall must not probe"),
    });

    try {
      const response = await manager.manage(definition, {
        action: "uninstall",
        mode: "persistent",
        apply: true,
      });
      assert.equal(response.ok, true, templateState);
      assert.equal(response.manager.mode, "session", templateState);
      assert.equal(response.manager.state, "stopped", templateState);
      assert.equal(response.manager.errorCode, null, templateState);
      assert.equal(fs.existsSync(plan.configPath), false, templateState);
      assert.deepEqual(
        commandCalls.map(({ args }) => args[0]),
        templateState === "residual" ? ["/Query"] : [],
        templateState,
      );
      assert.doesNotMatch(
        JSON.stringify(commandCalls),
        /\/End|\/Run|\/Create|\/Delete/,
      );
      assert.deepEqual(calls, [], templateState);
    } finally {
      await manager.dispose();
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("repair refuses a missing persistent target without register or restart mutators", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-repair-missing-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const commandCalls = [];
  const { calls, session } = createFakeSession();
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => {
      commandCalls.push(command);
      if (!command.args.includes("/Query")) {
        assert.fail("repair must not mutate a missing target");
      }
      return commandResult(command, {
        ok: false,
        exitCode: -2147024894,
        stderr: "计划任务不存在",
      });
    },
    probe: async () => assert.fail("missing repair must not probe"),
  });
  try {
    const response = await manager.manage(definition, {
      action: "repair",
      mode: "persistent",
      apply: true,
    });
    assert.equal(response.ok, false);
    assert.equal(response.manager.state, "not-installed");
    assert.equal(response.manager.errorCode, "task-not-found");
    assert.equal(response.templateWritten, false);
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), ["/Query"]);
    assert.deepEqual(calls, []);
    assert.equal(fs.readFileSync(plan.configPath, "utf8"), plan.template);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("restart session refuses persistent stop when persistent status is not trustworthy", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-session-restart-status-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const commandCalls = [];
  const { calls, session } = createFakeSession({
    initial: sessionStatus({ active: true, state: "running", pid: 8123 }),
  });
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => {
      commandCalls.push(command);
      if (!command.args.includes("/Query")) {
        assert.fail("untrusted status must block persistent stop");
      }
      return commandResult(command, {
        ok: false,
        exitCode: -2147024891,
        stderr: "拒绝访问",
        errorCode: "permission-denied",
        errorMessage: "拒绝访问",
      });
    },
    probe: async () => false,
  });
  try {
    const response = await manager.manage(definition, {
      action: "restart",
      mode: "session",
      apply: true,
    });
    assert.equal(response.ok, false);
    assert.equal(response.manager.mode, "persistent");
    assert.equal(response.manager.errorCode, "permission-denied");
    assert.equal(response.manager.errorMessage, "Supervisor command permission denied.");
    assert.deepEqual(commandCalls.map(({ args }) => args[0]), ["/Query"]);
    assert.deepEqual(calls, [["stop", "model-gateway"]]);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("successful health probe establishes running when native status is indeterminate", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-manager-status-probe-"));
  const definition = fixtureDefinition(root);
  const plan = createSupervisorPlan(definition, "win32", root, {
    windowsUserId: "TEST\\Fixture",
  });
  fs.mkdirSync(path.dirname(plan.configPath), { recursive: true });
  fs.writeFileSync(plan.configPath, plan.template, "utf8");
  const { session } = createFakeSession();
  let probes = 0;
  const manager = createServiceManager({
    platform: "win32",
    homeDir: root,
    windowsUserId: "TEST\\Fixture",
    session,
    runner: async (command) => commandResult(command, {
      stdout: "任务状态不可稳定解析",
    }),
    probe: async () => {
      probes += 1;
      return true;
    },
  });
  try {
    const response = await manager.manage(definition, {
      action: "status",
      mode: "persistent",
      apply: true,
    });
    assert.equal(response.ok, true);
    assert.equal(response.manager.active, true);
    assert.equal(response.manager.state, "running");
    assert.equal(response.manager.errorCode, null);
    assert.equal(probes, 1);
  } finally {
    await manager.dispose();
    fs.rmSync(root, { recursive: true, force: true });
  }
});
