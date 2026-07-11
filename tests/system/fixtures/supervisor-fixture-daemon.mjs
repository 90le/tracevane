import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const FIXTURE_ENTRY_PATH = fileURLToPath(import.meta.url);
const HEARTBEAT_INTERVAL_MS = 100;
const HEARTBEAT_FRESH_MS = 2_500;
const POLL_INTERVAL_MS = 100;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizedPath(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
      normalizedPath(process.argv[1]) === normalizedPath(FIXTURE_ENTRY_PATH),
  );
}

function readConfigArgument() {
  const index = process.argv.lastIndexOf("--config");
  assert.ok(index >= 0, "fixture daemon requires --config");
  assert.ok(process.argv[index + 1], "fixture daemon requires a config path");
  return process.argv[index + 1];
}

function startFixtureDaemon() {
  const config = JSON.parse(fs.readFileSync(readConfigArgument(), "utf8"));
  assert.equal(typeof config.heartbeatPath, "string");
  assert.equal(typeof config.instanceName, "string");
  assert.equal(typeof config.ownerPid, "number");

  const startedAt = Date.now();
  const token = randomUUID();
  const temporaryPath = `${config.heartbeatPath}.${process.pid}.tmp`;
  let sequence = 0;

  fs.mkdirSync(path.dirname(config.heartbeatPath), { recursive: true });

  function writeHeartbeat() {
    sequence += 1;
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify({
        heartbeatAt: Date.now(),
        instanceName: config.instanceName,
        ownerPid: config.ownerPid,
        pid: process.pid,
        sequence,
        startedAt,
        token,
      })}\n`,
      "utf8",
    );
    fs.renameSync(temporaryPath, config.heartbeatPath);
  }

  writeHeartbeat();
  const timer = setInterval(() => {
    try {
      writeHeartbeat();
    } catch {
      clearInterval(timer);
      process.exit(1);
    }
  }, HEARTBEAT_INTERVAL_MS);

  let stopping = false;
  const stop = () => {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    process.exit(0);
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
}

if (isMainModule()) {
  startFixtureDaemon();
}

function titleCase(value) {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

function createFixtureContext(platformSlug) {
  const ownerPid = process.pid;
  const instanceName = `${platformSlug}-${ownerPid}`;
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), `tracevane-supervisor-${instanceName}-`),
  );
  const heartbeatPath = path.join(root, "heartbeat.json");
  const configPath = path.join(root, "fixture-config.json");
  const definition = {
    id: "model-gateway",
    displayName: `Tracevane Supervisor Live ${instanceName}`,
    serviceName: `tracevane-test-${platformSlug}-${ownerPid}.service`,
    windowsTaskName: `TracevaneTest-${titleCase(platformSlug)}-${ownerPid}`,
    launchdLabel: `dev.tracevane.test.${platformSlug}.${ownerPid}`,
    entryPath: FIXTURE_ENTRY_PATH,
    workingDirectory: root,
    configPath,
    runtimePath: path.join(root, "runtime.json"),
    logPath: path.join(root, "fixture.log"),
    healthUrl: `http://127.0.0.1:1/tracevane-supervisor-${ownerPid}`,
    args: [],
  };

  fs.writeFileSync(
    configPath,
    `${JSON.stringify({ heartbeatPath, instanceName, ownerPid }, null, 2)}\n`,
    { encoding: "utf8", mode: 0o600 },
  );

  return {
    definition,
    heartbeatPath,
    instanceName,
    ownerPid,
    root,
  };
}

function processIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "EPERM") return true;
    if (error?.code === "ESRCH") return false;
    throw error;
  }
}

function readHeartbeat(context) {
  try {
    const heartbeat = JSON.parse(
      fs.readFileSync(context.heartbeatPath, "utf8"),
    );
    if (
      heartbeat.instanceName !== context.instanceName ||
      heartbeat.ownerPid !== context.ownerPid ||
      !Number.isSafeInteger(heartbeat.pid) ||
      heartbeat.pid <= 0 ||
      typeof heartbeat.token !== "string" ||
      !Number.isFinite(heartbeat.heartbeatAt)
    ) {
      return null;
    }
    return heartbeat;
  } catch (error) {
    if (error?.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function waitForHeartbeat(context, options = {}) {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const deadline = Date.now() + timeoutMs;
  let lastHeartbeat = null;

  while (Date.now() < deadline) {
    lastHeartbeat = readHeartbeat(context);
    if (
      lastHeartbeat &&
      lastHeartbeat.token !== options.excludeToken &&
      Date.now() - lastHeartbeat.heartbeatAt <= HEARTBEAT_FRESH_MS &&
      processIsAlive(lastHeartbeat.pid)
    ) {
      return lastHeartbeat;
    }
    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `fixture heartbeat did not become ready within ${timeoutMs}ms; last=${
      JSON.stringify(lastHeartbeat)
    }`,
  );
}

async function waitForProcessExit(pid, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!processIsAlive(pid)) return;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`fixture pid ${pid} did not exit within ${timeoutMs}ms`);
}

function readFreshLiveHeartbeat(context) {
  const heartbeat = readHeartbeat(context);
  if (
    !heartbeat ||
    Date.now() - heartbeat.heartbeatAt > HEARTBEAT_FRESH_MS ||
    !processIsAlive(heartbeat.pid)
  ) {
    return null;
  }
  return heartbeat;
}

async function assertNoFreshLiveHeartbeat(context, quietPeriodMs = 1_250) {
  await sleep(quietPeriodMs);
  const heartbeat = readFreshLiveHeartbeat(context);
  assert.equal(
    heartbeat,
    null,
    `fixture daemon remained alive: ${JSON.stringify(heartbeat)}`,
  );
}

async function killFixtureProcess(pid) {
  assert.equal(processIsAlive(pid), true, `fixture pid ${pid} must be alive`);
  process.kill(pid, "SIGKILL");
  await waitForProcessExit(pid);
}

function heartbeatProbe(context) {
  return async () => {
    try {
      await waitForHeartbeat(context);
      return true;
    } catch {
      return false;
    }
  };
}

function responseEvidence(response) {
  return JSON.stringify({
    action: response.action,
    commands: response.commands.map((command) => ({
      args: command.args,
      command: command.command,
      errorCode: command.errorCode,
      exitCode: command.exitCode,
      label: command.label,
      ok: command.ok,
      stderr: command.stderr,
      stdout: command.stdout,
    })),
    manager: response.manager,
    ok: response.ok,
    templateWritten: response.templateWritten,
  }, null, 2);
}

function assertActionSucceeded(response, action) {
  assert.equal(response.action, action);
  assert.equal(
    response.ok,
    true,
    `${action} failed:\n${responseEvidence(response)}`,
  );
  assert.equal(response.manager.errorCode, null, responseEvidence(response));
}

function uniqueCommands(commands) {
  const seen = new Set();
  return commands.filter((command) => {
    const key = JSON.stringify([
      command.label,
      command.command,
      command.args,
    ]);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function assertCleanupCommandIsScoped(command, plan, context) {
  const serviceTargeted = command.args.some((argument) =>
    argument === plan.serviceName ||
    argument === plan.configPath ||
    argument.endsWith(`/${plan.serviceName}`)
  );
  const userReload = command.command === "systemctl" &&
    command.args.includes("--user") &&
    command.args.includes("daemon-reload");
  assert.ok(
    serviceTargeted || userReload,
    `refusing unscoped cleanup command for ${context.instanceName}: ${
      JSON.stringify(command)
    }`,
  );
}

async function runCommandsBestEffort(
  commands,
  plan,
  context,
  runSupervisorCommand,
  action,
) {
  const results = [];
  for (const command of uniqueCommands(commands)) {
    assertCleanupCommandIsScoped(command, plan, context);
    try {
      results.push(await runSupervisorCommand(command, {
        action,
        platform: plan.platform,
        timeoutMs: 15_000,
      }));
    } catch (error) {
      results.push({
        ...command,
        error: error instanceof Error ? error.message : String(error),
        ok: false,
      });
    }
  }
  return results;
}

function infrastructureFailure(result) {
  return [
    "command-not-found",
    "command-timeout",
    "permission-denied",
  ].includes(result.errorCode);
}

function failedCommandResult(command, error) {
  return {
    ...command,
    errorCode: "unknown",
    errorMessage: error instanceof Error ? error.message : String(error),
    exitCode: null,
    ok: false,
    stderr: "",
    stdout: "",
  };
}

async function runInspectionCommand(plan, runSupervisorCommand, command) {
  try {
    return await runSupervisorCommand(command, {
      action: "status",
      platform: plan.platform,
      timeoutMs: 15_000,
    });
  } catch (error) {
    return failedCommandResult(command, error);
  }
}

export async function inspectNativeAbsence(plan, runSupervisorCommand) {
  const statusCommands = plan.platform === "linux"
    ? [{
      args: [
        "--user",
        "show",
        plan.serviceName,
        "--property=LoadState",
        "--value",
      ],
      command: "systemctl",
      label: "Check user service load state",
    }]
    : plan.commands.status ?? [];
  const results = [];
  for (const command of statusCommands) {
    results.push(
      await runInspectionCommand(plan, runSupervisorCommand, command),
    );
  }

  if (results.length === 0 || results.some(infrastructureFailure)) {
    return { absent: false, results };
  }
  if (plan.platform === "win32") {
    return {
      absent: results[0].ok === false &&
        results[0].errorCode === "task-not-found",
      results,
    };
  }
  if (plan.platform === "darwin") {
    return {
      absent: results[0].ok === false &&
        results[0].exitCode === 113 &&
        !infrastructureFailure(results[0]),
      results,
    };
  }

  return {
    absent: results[0].ok === true &&
      results[0].errorCode === null &&
      results[0].stdout.trim() === "not-found",
    results,
  };
}

function assertCleanupPlanIsUnique(plan, context) {
  assert.ok(
    plan.serviceName.includes(String(context.ownerPid)),
    `refusing cleanup for non-unique service ${plan.serviceName}`,
  );
  assert.match(
    plan.template,
    new RegExp(String(context.ownerPid)),
    "fixture plan must contain the owning test PID",
  );
}

function commandSequenceSucceeded(commands, results) {
  return commands.length > 0 &&
    results.length === uniqueCommands(commands).length &&
    results.every((result) => result.ok === true);
}

function systemdReloadCommands(plan) {
  return uniqueCommands(
    Object.values(plan.commands)
      .flat()
      .filter((command) =>
        command.command === "systemctl" &&
        command.args.includes("--user") &&
        command.args.includes("daemon-reload")
      ),
  );
}

function nativeInspectionEvidence(inspection) {
  return JSON.stringify(inspection.results, null, 2);
}

export async function cleanupNativeSupervisorRegistration({
  context,
  plan,
  runSupervisorCommand,
}) {
  assertCleanupPlanIsUnique(plan, context);
  let inspection = await inspectNativeAbsence(plan, runSupervisorCommand);
  const alreadyAbsent = inspection.absent;

  if (!alreadyAbsent) {
    let stopConfirmed = false;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const liveBeforeStop = readFreshLiveHeartbeat(context);
      const stopCommands = uniqueCommands(plan.commands.stop ?? []);
      const stopResults = await runCommandsBestEffort(
        stopCommands,
        plan,
        context,
        runSupervisorCommand,
        "stop",
      );
      let daemonExited = true;
      if (liveBeforeStop) {
        try {
          await waitForProcessExit(liveBeforeStop.pid, 5_000);
        } catch {
          daemonExited = false;
        }
      }

      await sleep(1_250);
      const liveAfterStop = readFreshLiveHeartbeat(context);
      inspection = await inspectNativeAbsence(plan, runSupervisorCommand);
      stopConfirmed = commandSequenceSucceeded(stopCommands, stopResults) &&
        daemonExited &&
        liveAfterStop === null;
      if (stopConfirmed) break;
    }

    if (!stopConfirmed) {
      throw new Error(
        `could not confirm native supervisor stop; status=${
          nativeInspectionEvidence(inspection)
        }`,
      );
    }

    if (!inspection.absent) {
      const uninstallCommands = uniqueCommands(plan.commands.uninstall ?? []);
      const uninstallResults = await runCommandsBestEffort(
        uninstallCommands,
        plan,
        context,
        runSupervisorCommand,
        "uninstall",
      );
      inspection = await inspectNativeAbsence(plan, runSupervisorCommand);
      if (
        !commandSequenceSucceeded(uninstallCommands, uninstallResults) &&
        !inspection.absent
      ) {
        throw new Error(
          `could not unregister native supervisor; status=${
            nativeInspectionEvidence(inspection)
          }`,
        );
      }
    }
  }

  await assertNoFreshLiveHeartbeat(context);

  fs.rmSync(plan.configPath, { force: true });
  const reloadCommands = systemdReloadCommands(plan);
  if (reloadCommands.length > 0) {
    const reloadResults = await runCommandsBestEffort(
      reloadCommands,
      plan,
      context,
      runSupervisorCommand,
      "uninstall",
    );
    if (!commandSequenceSucceeded(reloadCommands, reloadResults)) {
      throw new Error(
        `could not reload native supervisor after template removal: ${
          JSON.stringify(reloadResults, null, 2)
        }`,
      );
    }
  }

  inspection = await inspectNativeAbsence(plan, runSupervisorCommand);
  if (!inspection.absent) {
    throw new Error(
      `native supervisor remained after cleanup: ${
        nativeInspectionEvidence(inspection)
      }`,
    );
  }
  assert.equal(fs.existsSync(plan.configPath), false);
}

async function removeRoot(root) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      fs.rmSync(root, { force: true, recursive: true });
      return;
    } catch (error) {
      lastError = error;
      if (!["EBUSY", "ENOTEMPTY", "EPERM"].includes(error?.code)) throw error;
      await sleep(100);
    }
  }
  throw lastError;
}

async function cleanupLiveFixture({
  context,
  manager,
  plan,
  runSupervisorCommand,
}) {
  const cleanupErrors = [];
  let nativeCleanupSucceeded = plan === null;

  try {
    if (plan && runSupervisorCommand) {
      await cleanupNativeSupervisorRegistration({
        context,
        plan,
        runSupervisorCommand,
      });
      nativeCleanupSucceeded = true;
    } else if (plan) {
      throw new Error(
        "native supervisor cleanup requires the supervisor command runner",
      );
    }
  } catch (error) {
    cleanupErrors.push(error);
  } finally {
    if (manager) {
      try {
        await manager.dispose();
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
    if (nativeCleanupSucceeded) {
      try {
        await removeRoot(context.root);
        assert.equal(fs.existsSync(context.root), false);
      } catch (error) {
        cleanupErrors.push(error);
      }
    }
  }

  if (cleanupErrors.length > 0) {
    throw new AggregateError(cleanupErrors, "live supervisor cleanup failed");
  }
}

async function executeLifecycle(
  manager,
  context,
  plan,
  osRestartTimeoutMs,
  runSupervisorCommand,
) {
  const actions = [];
  const manage = async (action, apply = true) => {
    actions.push(action);
    return manager.manage(context.definition, {
      action,
      apply,
      mode: "persistent",
    });
  };

  const preview = await manage("preview", false);
  assert.equal(preview.action, "preview");
  assert.equal(preview.commands.length, 0);
  assert.equal(preview.manager.installed, false);
  assert.equal(preview.manager.errorCode, "task-not-found");
  assert.equal(fs.existsSync(plan.configPath), false);

  const install = await manage("install");
  assertActionSucceeded(install, "install");
  assert.equal(install.manager.installed, true);
  assert.equal(install.manager.active, true);
  assert.equal(install.manager.state, "running");
  assert.equal(install.templateWritten, true);
  assert.equal(fs.existsSync(plan.configPath), true);

  const status = await manage("status");
  assertActionSucceeded(status, "status");
  assert.equal(status.manager.installed, true);
  assert.equal(status.manager.configCurrent, true);

  const started = await manage("start");
  assertActionSucceeded(started, "start");
  assert.equal(started.manager.active, true);
  assert.equal(started.manager.state, "running");

  const firstHeartbeat = await waitForHeartbeat(context);
  await killFixtureProcess(firstHeartbeat.pid);

  const osRestartedHeartbeat = await waitForHeartbeat(context, {
    excludeToken: firstHeartbeat.token,
    timeoutMs: osRestartTimeoutMs,
  });
  assert.notEqual(osRestartedHeartbeat.pid, firstHeartbeat.pid);

  const restarted = await manage("restart");
  assertActionSucceeded(restarted, "restart");
  await waitForProcessExit(osRestartedHeartbeat.pid);
  const managerRestartedHeartbeat = await waitForHeartbeat(context, {
    excludeToken: osRestartedHeartbeat.token,
    timeoutMs: 30_000,
  });
  assert.notEqual(managerRestartedHeartbeat.pid, osRestartedHeartbeat.pid);

  const stopped = await manage("stop");
  assertActionSucceeded(stopped, "stop");
  assert.equal(stopped.manager.active, false);
  assert.equal(stopped.manager.state, "stopped");
  await waitForProcessExit(managerRestartedHeartbeat.pid);
  await assertNoFreshLiveHeartbeat(context);

  const uninstalled = await manage("uninstall");
  assertActionSucceeded(uninstalled, "uninstall");
  assert.equal(uninstalled.manager.installed, false);
  assert.equal(fs.existsSync(plan.configPath), false);
  const nativeAbsence = await inspectNativeAbsence(
    plan,
    runSupervisorCommand,
  );
  assert.equal(
    nativeAbsence.absent,
    true,
    `native registration remained after uninstall: ${
      nativeInspectionEvidence(nativeAbsence)
    }`,
  );
  assert.equal(readFreshLiveHeartbeat(context), null);

  assert.deepEqual(actions, [
    "preview",
    "install",
    "status",
    "start",
    "restart",
    "stop",
    "uninstall",
  ]);

  return {
    firstPid: firstHeartbeat.pid,
    managerRestartedPid: managerRestartedHeartbeat.pid,
    nativeName: plan.serviceName,
    osRestartedPid: osRestartedHeartbeat.pid,
  };
}

export async function runSupervisorLiveLifecycle({
  osRestartTimeoutMs,
  platform,
  platformSlug,
}) {
  assert.equal(process.platform, platform);
  assert.ok(Number.isFinite(osRestartTimeoutMs) && osRestartTimeoutMs > 0);
  const context = createFixtureContext(platformSlug);
  let manager = null;
  let plan = null;
  let runSupervisorCommand = null;
  let result;
  let lifecycleError;

  try {
    const [supervisor, runner] = await Promise.all([
      import("../../../dist/apps/api/modules/supervisor/index.js"),
      import("../../../dist/apps/api/modules/supervisor/command-runner.js"),
    ]);
    runSupervisorCommand = runner.runSupervisorCommand;
    plan = supervisor.createSupervisorPlan(
      context.definition,
      platform,
      os.homedir(),
    );
    manager = supervisor.createServiceManager({
      commandTimeoutMs: 15_000,
      homeDir: os.homedir(),
      platform,
      probe: heartbeatProbe(context),
    });
    result = await executeLifecycle(
      manager,
      context,
      plan,
      osRestartTimeoutMs,
      runSupervisorCommand,
    );
  } catch (error) {
    lifecycleError = error;
  }

  let cleanupError;
  try {
    await cleanupLiveFixture({
      context,
      manager,
      plan,
      runSupervisorCommand,
    });
  } catch (error) {
    cleanupError = error;
  }

  if (lifecycleError && cleanupError) {
    throw new AggregateError(
      [lifecycleError, cleanupError],
      "live supervisor lifecycle and cleanup both failed",
    );
  }
  if (lifecycleError) throw lifecycleError;
  if (cleanupError) throw cleanupError;
  return result;
}
