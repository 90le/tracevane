import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createOpenClawCliShim,
  ensureOpenClawCliAvailable,
  writeOpenClawRecoveryInstallManifest,
} from "../../dist/apps/api/modules/openclaw-recovery/cli-bootstrap.js";
import { createOpenClawRecoveryDaemon } from "../../dist/apps/api/modules/openclaw-recovery/daemon.js";
import {
  isOpenClawGatewayProcess,
  parseLsofListeners,
  parseSsListeners,
} from "../../dist/apps/api/modules/openclaw-recovery/gateway-runtime.js";
import {
  assessOpenClawGatewayServiceStatus,
  parseOpenClawGatewayStatus,
} from "../../dist/apps/api/modules/openclaw-recovery/gateway-service.js";
import {
  probeOpenClawGateway,
  probeOpenClawGatewayDeep,
} from "../../dist/apps/api/modules/openclaw-recovery/probe.js";
import {
  createOpenClawConfigBackup,
  inspectTracevaneWebBundle,
  pruneDeprecatedOpenClawPluginResidue,
  pruneMissingOpenClawPluginLoadPaths,
  pruneInvalidOpenClawConfigFromValidation,
  repairOpenClawGatewayAuthSecretRefDrift,
  repairOpenClawPluginConfigFromFindings,
  restoreOpenClawRecoveryBackup,
} from "../../dist/apps/api/modules/openclaw-recovery/repair.js";
import { createOpenClawRecoveryService } from "../../dist/apps/api/modules/openclaw-recovery/service.js";
import {
  appendRecoveryEvent,
  buildDefaultRecoveryState,
  createRecoveryEvent,
  listRecoveryBackupsPage,
  listRecoveryEventsPage,
  readRecoveryState,
  writeRecoveryState,
} from "../../dist/apps/api/modules/openclaw-recovery/store.js";
import * as recoverySupervisor from "../../dist/apps/api/modules/openclaw-recovery/supervisor.js";
import {
  createServiceLaunchArguments,
  createSessionSupervisor,
  createSupervisorPlan,
} from "../../dist/apps/api/modules/supervisor/index.js";
import {
  OPENCLAW_RECOVERY_DEFAULT_PORT,
  OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
} from "../../dist/types/openclaw-recovery.js";
import * as recoveryDaemonEntry from "../../dist/apps/api/openclaw-recovery-daemon.js";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const CURRENT_TRACEVANE_VERSION = JSON.parse(
  fs.readFileSync(path.join(rootDir, "package.json"), "utf8"),
).version;
const temporaryRoots = new Set();

afterEach(() => {
  for (const root of temporaryRoots) {
    fs.rmSync(root, { force: true, maxRetries: 3, recursive: true });
  }
  temporaryRoots.clear();
});

function makeConfig() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-recovery-"));
  temporaryRoots.add(root);
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  const projectRoot = path.join(root, "tracevane");
  fs.mkdirSync(projectRoot, { recursive: true });
  const missingPluginPath = path.join(root, "missing-plugin-path");
  const openclawConfigFile = path.join(openclawRoot, "openclaw.json");
  fs.writeFileSync(
    openclawConfigFile,
    `${JSON.stringify(
      {
        agents: {
          defaults: {
            llm: "legacy-bad-key",
            sandbox: { mode: "off" },
          },
        },
        tools: {
          exec: {
            mode: "legacy",
            security: "default",
            ask: "never",
          },
        },
        plugins: {
          load: {
            paths: [projectRoot, missingPluginPath],
          },
          entries: {
            tracevane: {
              enabled: true,
              config: {
                keep: "plugin-config",
              },
            },
            alpha: {
              enabled: true,
              config: {},
            },
          },
          providerParams: {
            keep: true,
          },
        },
        channels: {
          customProvider: {
            extensionField: "preserve",
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return {
    pluginId: "tracevane",
    pluginName: "Tracevane",
    version: CURRENT_TRACEVANE_VERSION,
    port: 3760,
    autoStart: false,
    openclawRoot,
    openclawConfigFile,
    projectRoot,
    webDistDir: path.join(root, "tracevane/apps/web/dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "/tracevane",
    transport: {
      preferredMode: "gateway",
      standalone: { enabled: false, port: 3760 },
      gateway: { enabled: true, basePath: "/tracevane" },
    },
  };
}

function listenProbeServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      resolve({ server, port: address.port });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function reserveLoopbackPort() {
  const { server, port } = await listenProbeServer((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  await closeServer(server);
  return port;
}

async function fetchWhenListening(url, init, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let latestError;
  while (Date.now() < deadline) {
    try {
      return await fetch(url, init);
    } catch (error) {
      latestError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw latestError || new Error(`server did not listen at ${url}`);
}

async function waitForFile(filePath, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.fail(`file was not created before timeout: ${filePath}`);
}

function sharedManagerStatus(overrides = {}) {
  return {
    mode: "session",
    supervisor: "session",
    installed: false,
    enabled: null,
    active: false,
    state: "stopped",
    configCurrent: true,
    checkedAt: "2026-07-12T00:00:00.000Z",
    errorCode: null,
    errorMessage: null,
    ...overrides,
  };
}

function managedResponse(request, overrides = {}) {
  const manager = overrides.manager || sharedManagerStatus();
  return {
    ok: overrides.ok ?? manager.errorCode === null,
    action: request.action,
    manager,
    commands: overrides.commands || [],
    templateWritten: overrides.templateWritten ?? false,
    configCurrent: overrides.configCurrent ?? manager.configCurrent,
  };
}

function createFakeServiceManager(respond) {
  const calls = [];
  let disposeCalls = 0;
  return {
    calls,
    get disposeCalls() {
      return disposeCalls;
    },
    manager: {
      async manage(definition, request) {
        calls.push({ definition, request });
        return respond(definition, request, calls.length - 1);
      },
      async dispose() {
        disposeCalls += 1;
      },
    },
  };
}

test("recovery exports one trusted definition with dedicated runtime and control port", () => {
  assert.equal(
    typeof recoverySupervisor.createOpenClawRecoveryServiceDefinition,
    "function",
  );

  const config = makeConfig();
  const root = path.dirname(config.openclawRoot);
  config.projectRoot = path.join(root, "Trace vane 项目 & workers");
  config.openclawConfigFile = path.join(config.openclawRoot, "配置 & prod.json");
  fs.mkdirSync(config.projectRoot, { recursive: true });
  fs.writeFileSync(config.openclawConfigFile, "{}\n", "utf8");

  const definition = recoverySupervisor.createOpenClawRecoveryServiceDefinition(
    config,
    { mode: "persistent", platform: "win32" },
  );
  assert.equal(OPENCLAW_RECOVERY_DEFAULT_PORT, 18798);
  assert.deepEqual(
    {
      id: definition.id,
      displayName: definition.displayName,
      serviceName: definition.serviceName,
      windowsTaskName: definition.windowsTaskName,
      launchdLabel: definition.launchdLabel,
      entryPath: definition.entryPath,
      workingDirectory: definition.workingDirectory,
      configPath: definition.configPath,
      runtimePath: definition.runtimePath,
      logPath: definition.logPath,
      healthUrl: definition.healthUrl,
    },
    {
      id: "openclaw-recovery",
      displayName: "Tracevane Recovery Daemon",
      serviceName: "tracevane-recovery.service",
      windowsTaskName: "TracevaneRecovery",
      launchdLabel: "dev.openclaw.tracevane.recovery",
      entryPath: path.join(
        config.projectRoot,
        "dist",
        "apps",
        "api",
        "openclaw-recovery-daemon.js",
      ),
      workingDirectory: config.projectRoot,
      configPath: config.openclawConfigFile,
      runtimePath: path.join(
        config.openclawRoot,
        "tracevane",
        "recovery",
        "daemon-runtime.json",
      ),
      logPath: path.join(
        config.openclawRoot,
        "tracevane",
        "recovery",
        "daemon.log",
      ),
      healthUrl: "http://127.0.0.1:18798/health",
    },
  );
  assert.deepEqual(definition.args, [
    "--project-root",
    config.projectRoot,
    "--openclaw-root",
    config.openclawRoot,
    "--control-port",
    "18798",
    "--supervisor",
    "scheduled-task",
    "--service-name",
    OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
  ]);
  const launchArgs = createServiceLaunchArguments(definition);
  assert.equal(launchArgs.filter((item) => item === "--config").length, 1);
  assert.equal(launchArgs.at(-1), config.openclawConfigFile);
  assert.notEqual(
    definition.runtimePath,
    path.join(config.openclawRoot, "tracevane", "recovery", "state.json"),
  );
});

test("recovery compatibility plans are byte-for-byte shared plans on all three platforms", () => {
  assert.equal(
    typeof recoverySupervisor.createOpenClawRecoveryServiceDefinition,
    "function",
  );
  const config = makeConfig();
  const root = path.dirname(config.openclawRoot);
  config.projectRoot = path.join(root, "Trace vane 项目 & workers");
  config.openclawConfigFile = path.join(config.openclawRoot, "配置 & prod.json");
  fs.mkdirSync(config.projectRoot, { recursive: true });
  fs.writeFileSync(config.openclawConfigFile, "{}\n", "utf8");
  const homeDir = path.join(root, "home 用户");
  const windowsUserId = "TESTDOMAIN\\测试 User & Ops";
  const secretProxy = "http://proxy-user:proxy-secret@127.0.0.1:18080";
  const previousProxy = process.env.HTTP_PROXY;
  process.env.HTTP_PROXY = secretProxy;

  try {
    const compatibility = recoverySupervisor.createOpenClawRecoveryDaemonServicePlan(
      config,
      { homeDir, windowsUserId },
    );
    const cases = [
      ["linux", "linux"],
      ["darwin", "darwin"],
      ["win32", "win32"],
    ];
    for (const [platform, templatePlatform] of cases) {
      const definition = recoverySupervisor.createOpenClawRecoveryServiceDefinition(
        config,
        { mode: "persistent", platform },
      );
      const expected = createSupervisorPlan(
        definition,
        platform,
        homeDir,
        { windowsUserId },
      );
      const actual = compatibility.templates.find(
        (template) => template.platform === templatePlatform,
      );
      assert.ok(actual, platform);
      assert.equal(actual.content, expected.template, platform);
      assert.equal(actual.configPath, expected.configPath, platform);
      assert.equal(actual.serviceName, expected.serviceName, platform);
      assert.equal(actual.supervisor, expected.supervisor, platform);
      assert.deepEqual(actual.commands, expected.commands, platform);
    }
    const serialized = JSON.stringify(compatibility);
    assert.equal(serialized.includes(secretProxy), false);
    assert.doesNotMatch(serialized, /HTTP_PROXY|HTTPS_PROXY|proxy-secret/i);
    const windows = compatibility.templates.find(
      (template) => template.platform === "win32",
    );
    assert.equal(
      windows.commands.status?.[0]?.args.includes("/HResult"),
      true,
    );
  } finally {
    if (previousProxy === undefined) delete process.env.HTTP_PROXY;
    else process.env.HTTP_PROXY = previousProxy;
  }
});

test("recovery service defaults status and applied start to one injected session manager", async () => {
  const config = makeConfig();
  const fake = createFakeServiceManager((_definition, request) =>
    managedResponse(request, {
      manager: request.action === "start"
        ? sharedManagerStatus({ active: true, state: "running" })
        : sharedManagerStatus(),
    }));
  const service = createOpenClawRecoveryService(config, {
    daemonServiceManager: fake.manager,
  });

  const status = await service.getDaemonService();
  const started = await service.applyDaemonServiceAction({
    action: "start",
    apply: true,
  });

  assert.deepEqual(
    fake.calls.map(({ request }) => request),
    [
      { action: "status", mode: "session", apply: false },
      { action: "start", mode: "session", apply: true },
    ],
  );
  assert.equal(status.manager.mode, "session");
  assert.equal(status.activeState, "inactive");
  assert.equal(started.ok, true);
  assert.equal(started.service.manager.state, "running");
  assert.equal(started.service.activeState, "active");
  assert.equal(fake.calls[0].definition.id, "openclaw-recovery");
  assert.equal(fake.calls[0].definition.healthUrl, "http://127.0.0.1:18798/health");
  assert.equal(fake.disposeCalls, 0);
});

test("recovery persistent restart preserves task-not-found and never invents a stop command", async () => {
  const config = makeConfig();
  const query = {
    label: "Query scheduled task",
    command: "schtasks.exe",
    args: ["/Query", "/TN", "TracevaneRecovery", "/HResult"],
    ok: false,
    exitCode: -2147024894,
    stdout: "",
    stderr: "计划任务不存在",
    errorCode: "task-not-found",
    errorMessage: "Scheduled task is not installed.",
    durationMs: 1,
  };
  const fake = createFakeServiceManager((_definition, request) =>
    managedResponse(request, {
      ok: false,
      manager: sharedManagerStatus({
        mode: "persistent",
        supervisor: "scheduled-task",
        state: "not-installed",
        configCurrent: true,
        errorCode: "task-not-found",
        errorMessage: "Persistent service is not installed.",
      }),
      commands: [query],
    }));
  const service = createOpenClawRecoveryService(config, {
    daemonServiceManager: fake.manager,
  });

  const response = await service.applyDaemonServiceAction({
    action: "restart",
    mode: "persistent",
    runCommands: true,
  });

  assert.deepEqual(fake.calls[0].request, {
    action: "restart",
    mode: "persistent",
    apply: true,
  });
  assert.equal(response.ok, false);
  assert.equal(response.service.manager.errorCode, "task-not-found");
  assert.equal(response.commands.length, 1);
  assert.equal(response.commands[0].status, -2147024894);
  assert.equal(response.commands.some(({ args }) => args.includes("/End")), false);
  assert.equal(fake.disposeCalls, 0);
});

test("recovery passes ensure-running and repair through the shared persistent manager", async () => {
  const config = makeConfig();
  const fake = createFakeServiceManager((_definition, request, index) =>
    managedResponse(request, {
      ok: index === 0,
      manager: index === 0
        ? sharedManagerStatus({
            mode: "persistent",
            supervisor: "systemd-user",
            installed: true,
            enabled: true,
            active: true,
            state: "running",
          })
        : sharedManagerStatus({
            mode: "persistent",
            supervisor: "systemd-user",
            installed: true,
            enabled: true,
            active: null,
            state: "stale-config",
            configCurrent: false,
            errorCode: "stale-config",
            errorMessage: "Persistent service template is stale.",
          }),
    }));
  const service = createOpenClawRecoveryService(config, {
    daemonServiceManager: fake.manager,
  });

  const ensured = await service.applyDaemonServiceAction({
    action: "ensure-running",
    mode: "persistent",
    apply: true,
  });
  const repaired = await service.applyDaemonServiceAction({
    action: "repair",
    mode: "persistent",
    apply: true,
  });

  assert.deepEqual(
    fake.calls.map(({ request }) => request.action),
    ["ensure-running", "repair"],
  );
  assert.equal(ensured.service.manager.state, "running");
  assert.equal(ensured.service.enabledState, "enabled");
  assert.equal(repaired.service.manager.state, "stale-config");
  assert.equal(repaired.service.activeState, "stale-config");
  assert.equal(repaired.error, "Persistent service template is stale.");
  assert.equal(fake.disposeCalls, 0);
});

test("recovery maps shared readiness failure to degraded legacy compatibility state", async () => {
  const config = makeConfig();
  const fake = createFakeServiceManager((_definition, request) =>
    managedResponse(request, {
      ok: false,
      manager: sharedManagerStatus({
        mode: "persistent",
        supervisor: "launchd-user",
        installed: true,
        enabled: true,
        active: null,
        state: "degraded",
        errorCode: "runtime-not-ready",
        errorMessage: "Persistent service did not become ready.",
      }),
    }));
  const service = createOpenClawRecoveryService(config, {
    daemonServiceManager: fake.manager,
  });

  const response = await service.applyDaemonServiceAction({
    action: "start",
    mode: "persistent",
    apply: true,
  });

  assert.equal(response.ok, false);
  assert.equal(response.service.manager.active, null);
  assert.equal(response.service.activeState, "degraded");
  assert.equal(response.service.enabledState, "enabled");
  assert.equal(response.error, "Persistent service did not become ready.");
});

test("recovery daemon check uses injected domain I/O instead of real external probes", async () => {
  const config = makeConfig();
  const probeCalls = [];
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: null,
    gatewayProbe: async (port, timeoutMs) => {
      probeCalls.push({ port, timeoutMs });
      return true;
    },
    captureInstallManifest: async () => null,
  });

  await daemon.checkOnce();

  assert.deepEqual(probeCalls, [
    { port: config.gatewayPort, timeoutMs: 500 },
  ]);
});

test("recovery daemon parseArgs resolves trusted flags before environment fallbacks", () => {
  assert.equal(
    typeof recoveryDaemonEntry.parseOpenClawRecoveryDaemonArgs,
    "function",
  );
  assert.equal(
    typeof recoveryDaemonEntry.resolveOpenClawRecoveryDaemonLaunch,
    "function",
  );
  const config = makeConfig();
  const args = [
    "--project-root",
    config.projectRoot,
    "--openclaw-root",
    config.openclawRoot,
    "--control-port",
    "18798",
    "--supervisor",
    "scheduled-task",
    "--service-name",
    "tracevane-recovery.service",
    "--config",
    config.openclawConfigFile,
  ];
  const parsed = recoveryDaemonEntry.parseOpenClawRecoveryDaemonArgs(args);
  assert.deepEqual(parsed, {
    projectRoot: config.projectRoot,
    openclawRoot: config.openclawRoot,
    controlPort: "18798",
    supervisor: "scheduled-task",
    serviceName: "tracevane-recovery.service",
    configPath: config.openclawConfigFile,
  });
  const launch = recoveryDaemonEntry.resolveOpenClawRecoveryDaemonLaunch(
    args,
    {
      OPENCLAW_STATE_DIR: path.join(path.dirname(config.openclawRoot), "decoy-state"),
      OPENCLAW_RECOVERY_CONTROL_PORT: "19999",
      OPENCLAW_RECOVERY_SUPERVISOR: "systemd-user",
      OPENCLAW_RECOVERY_SERVICE_NAME: "decoy.service",
    },
  );
  assert.equal(launch.config.projectRoot, path.resolve(config.projectRoot));
  assert.equal(launch.config.openclawRoot, path.resolve(config.openclawRoot));
  assert.equal(
    launch.config.openclawConfigFile,
    path.resolve(config.openclawConfigFile),
  );
  assert.deepEqual(launch.daemonOptions, {
    controlPort: 18798,
    supervisor: "scheduled-task",
    serviceName: "tracevane-recovery.service",
  });

  const environmentLaunch = recoveryDaemonEntry.resolveOpenClawRecoveryDaemonLaunch(
    [],
    {
      OPENCLAW_STATE_DIR: config.openclawRoot,
      OPENCLAW_RECOVERY_CONTROL_PORT: "18888",
      OPENCLAW_RECOVERY_SUPERVISOR: "launchd-user",
      OPENCLAW_RECOVERY_SERVICE_NAME: "environment.service",
    },
  );
  assert.equal(environmentLaunch.config.openclawRoot, config.openclawRoot);
  assert.equal(environmentLaunch.daemonOptions.controlPort, 18888);
  assert.equal(environmentLaunch.daemonOptions.supervisor, "launchd-user");
  assert.equal(environmentLaunch.daemonOptions.serviceName, "environment.service");
  assert.equal(
    recoveryDaemonEntry.resolveOpenClawRecoveryDaemonLaunch([], {}).daemonOptions.controlPort,
    18798,
  );
  assert.throws(
    () => recoveryDaemonEntry.parseOpenClawRecoveryDaemonArgs(["--unknown", "value"]),
    /unknown|option/i,
  );
});

test("recovery control health is minimal and unauthenticated while control routes stay protected", async () => {
  const config = makeConfig();
  const port = await reserveLoopbackPort();
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: port,
    gatewayProbe: async () => true,
    captureInstallManifest: async () => null,
    logger: { info() {}, warn() {}, error() {} },
  });

  try {
    await daemon.start();
    const baseUrl = `http://127.0.0.1:${port}`;
    const health = await fetchWhenListening(`${baseUrl}/health`);
    assert.equal(health.status, 200);
    assert.equal(health.headers.get("access-control-allow-origin"), null);
    assert.deepEqual(await health.json(), { ok: true, status: "ready" });

    const unauthorized = await fetch(`${baseUrl}/status`);
    assert.equal(unauthorized.status, 401);
    const token = fs.readFileSync(
      path.join(config.openclawRoot, "tracevane", "recovery", "token"),
      "utf8",
    ).trim();
    const authorized = await fetch(`${baseUrl}/status`, {
      headers: {
        "x-openclaw-recovery-token": token,
        origin: "http://127.0.0.1:5173",
      },
    });
    assert.equal(authorized.status, 200);
    const blockedOrigin = await fetch(`${baseUrl}/status`, {
      headers: {
        "x-openclaw-recovery-token": token,
        origin: "https://evil.example",
      },
    });
    assert.equal(blockedOrigin.status, 403);
  } finally {
    await daemon.stop();
  }
});

test("recovery health listener binds before the initial gateway check settles", async () => {
  const config = makeConfig();
  const port = await reserveLoopbackPort();
  let releaseProbe;
  const probeGate = new Promise((resolve) => {
    releaseProbe = resolve;
  });
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: port,
    gatewayProbe: async () => probeGate,
    captureInstallManifest: async () => null,
    logger: { info() {}, warn() {}, error() {} },
  });
  const starting = daemon.start();

  try {
    const health = await fetchWhenListening(
      `http://127.0.0.1:${port}/health`,
      undefined,
      500,
    );
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, status: "ready" });
  } finally {
    releaseProbe(true);
    await starting;
    await daemon.stop();
  }
});

test("concurrent recovery daemon starts share one bind and initial check", async () => {
  const config = makeConfig();
  const port = await reserveLoopbackPort();
  let releaseProbe;
  const probeGate = new Promise((resolve) => {
    releaseProbe = resolve;
  });
  let probeCalls = 0;
  let manifestCalls = 0;
  let intervalCalls = 0;
  const originalSetInterval = globalThis.setInterval;
  const originalClearInterval = globalThis.clearInterval;
  globalThis.setInterval = () => {
    intervalCalls += 1;
    return { unref() {} };
  };
  globalThis.clearInterval = () => {};
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: port,
    gatewayProbe: async () => {
      probeCalls += 1;
      return probeGate;
    },
    captureInstallManifest: async () => {
      manifestCalls += 1;
      return null;
    },
    logger: { info() {}, warn() {}, error() {} },
  });
  const first = daemon.start();
  const second = daemon.start();

  try {
    const health = await fetchWhenListening(
      `http://127.0.0.1:${port}/health`,
    );
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, status: "ready" });
    await new Promise((resolve) => setImmediate(resolve));
    releaseProbe(true);
    await Promise.all([first, second]);
    assert.equal(probeCalls, 1);
    assert.equal(manifestCalls, 1);
    assert.equal(intervalCalls, 1);
  } finally {
    releaseProbe(true);
    await Promise.allSettled([first, second]);
    await daemon.stop();
    globalThis.setInterval = originalSetInterval;
    globalThis.clearInterval = originalClearInterval;
  }
});

test("local recovery daemon cannot recursively create a session owner", async () => {
  const config = makeConfig();
  const fake = createFakeServiceManager((_definition, request) =>
    managedResponse(request, {
      manager: sharedManagerStatus({ active: true, state: "running" }),
    }));
  const service = createOpenClawRecoveryService(config, {
    runtimeHost: "local-daemon",
    daemonServiceManager: fake.manager,
  });

  const response = await service.applyDaemonServiceAction({
    action: "start",
    mode: "session",
    apply: true,
  });

  assert.equal(response.ok, false);
  assert.equal(response.service.manager.errorCode, "runtime-not-ready");
  assert.match(response.error, /cannot create another session owner/i);
  assert.deepEqual(fake.calls, []);
});

test("direct recovery daemon removes only matching runtime metadata and preserves domain state", async () => {
  const config = makeConfig();
  const recoveryRoot = path.join(
    config.openclawRoot,
    "tracevane",
    "recovery",
  );
  const runtimePath = path.join(recoveryRoot, "daemon-runtime.json");
  const statePath = path.join(recoveryRoot, "state.json");
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: null,
    supervisor: "scheduled-task",
    serviceName: "tracevane-recovery-fixture.service",
    gatewayProbe: async () => true,
    captureInstallManifest: async () => null,
    logger: { info() {}, warn() {}, error() {} },
  });

  try {
    await daemon.start();
    assert.equal(fs.existsSync(runtimePath), true);
    const runtime = JSON.parse(fs.readFileSync(runtimePath, "utf8"));
    assert.equal(runtime.pid, process.pid);
    assert.equal(runtime.supervisor, "scheduled-task");
    assert.equal(runtime.serviceName, "tracevane-recovery-fixture.service");
    assert.equal("daemon" in runtime, false);
    assert.equal(fs.existsSync(statePath), true);
    const stateBeforeStop = fs.readFileSync(statePath, "utf8");

    await daemon.stop();

    assert.equal(fs.existsSync(runtimePath), false);
    assert.equal(fs.existsSync(statePath), true);
    assert.equal(fs.readFileSync(statePath, "utf8"), stateBeforeStop);
  } finally {
    await daemon.stop();
  }
});

test("direct recovery daemon retains mismatched runtime metadata", async () => {
  const config = makeConfig();
  const recoveryRoot = path.join(
    config.openclawRoot,
    "tracevane",
    "recovery",
  );
  const runtimePath = path.join(recoveryRoot, "daemon-runtime.json");
  const statePath = path.join(recoveryRoot, "state.json");
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: null,
    gatewayProbe: async () => true,
    captureInstallManifest: async () => null,
    logger: { info() {}, warn() {}, error() {} },
  });

  try {
    await daemon.start();
    fs.writeFileSync(
      runtimePath,
      `${JSON.stringify({ pid: process.pid + 1, sentinel: true })}\n`,
      "utf8",
    );
    const stateBeforeStop = fs.readFileSync(statePath, "utf8");

    await daemon.stop();

    assert.deepEqual(JSON.parse(fs.readFileSync(runtimePath, "utf8")), {
      pid: process.pid + 1,
      sentinel: true,
    });
    assert.equal(fs.readFileSync(statePath, "utf8"), stateBeforeStop);
  } finally {
    await daemon.stop();
    fs.rmSync(path.dirname(config.openclawRoot), {
      recursive: true,
      force: true,
    });
  }
});

test("shared session shutdown removes Recovery runtime metadata but preserves state", async () => {
  const config = makeConfig();
  const recoveryRoot = path.join(
    config.openclawRoot,
    "tracevane",
    "recovery",
  );
  const runtimePath = path.join(recoveryRoot, "daemon-runtime.json");
  const statePath = path.join(recoveryRoot, "state.json");
  const fixturePath = path.join(config.projectRoot, "recovery-session-fixture.mjs");
  fs.writeFileSync(
    fixturePath,
    [
      'import fs from "node:fs";',
      'import path from "node:path";',
      'const [runtimePath, statePath] = process.argv.slice(2);',
      'fs.mkdirSync(path.dirname(runtimePath), { recursive: true });',
      'fs.writeFileSync(runtimePath, JSON.stringify({ pid: process.pid }), "utf8");',
      'fs.writeFileSync(statePath, JSON.stringify({ domain: "preserve", daemon: { pid: process.pid } }), "utf8");',
      'setInterval(() => {}, 1000);',
      "",
    ].join("\n"),
    "utf8",
  );
  const definition = recoverySupervisor.createOpenClawRecoveryServiceDefinition(
    config,
    { mode: "session" },
  );
  definition.entryPath = fixturePath;
  definition.runtimePath = runtimePath;
  definition.args = [runtimePath, statePath];
  const session = createSessionSupervisor({
    stopGraceMs: 500,
    terminateOwnedTree: async (pid, force) => {
      try {
        process.kill(pid, force ? "SIGKILL" : "SIGTERM");
      } catch (error) {
        if (error?.code !== "ESRCH") throw error;
      }
    },
  });

  try {
    await session.start(definition);
    await waitForFile(runtimePath);
    await waitForFile(statePath);
    const stateBeforeStop = fs.readFileSync(statePath, "utf8");

    await session.stop("openclaw-recovery");

    assert.equal(fs.existsSync(runtimePath), false);
    assert.equal(fs.readFileSync(statePath, "utf8"), stateBeforeStop);
  } finally {
    await session.dispose();
    fs.rmSync(path.dirname(config.openclawRoot), {
      recursive: true,
      force: true,
    });
  }
});

test("recovery daemon listen failure cleans matching runtime metadata without deleting state", async () => {
  const daemonSource = fs.readFileSync(
    path.join(rootDir, "apps/api/modules/openclaw-recovery/daemon.ts"),
    "utf8",
  );
  assert.match(daemonSource, /controlServer[\s\S]*?once\("error"/);

  const config = makeConfig();
  const occupied = await listenProbeServer((_request, response) => {
    response.writeHead(204);
    response.end();
  });
  const recoveryRoot = path.join(
    config.openclawRoot,
    "tracevane",
    "recovery",
  );
  const runtimePath = path.join(recoveryRoot, "daemon-runtime.json");
  const statePath = path.join(recoveryRoot, "state.json");
  writeRecoveryState(config, {
    ...buildDefaultRecoveryState(config),
    notes: ["bind-failure-sentinel"],
  });
  const stateBeforeStart = fs.readFileSync(statePath, "utf8");
  const daemon = createOpenClawRecoveryDaemon(config, {
    controlPort: occupied.port,
    gatewayProbe: async () => true,
    captureInstallManifest: async () => null,
    logger: { info() {}, warn() {}, error() {} },
  });

  try {
    await assert.rejects(daemon.start(), (error) => error?.code === "EADDRINUSE");
    assert.equal(fs.existsSync(runtimePath), false);
    assert.equal(fs.existsSync(statePath), true);
    assert.equal(fs.readFileSync(statePath, "utf8"), stateBeforeStart);
    assert.equal(
      fs.readdirSync(recoveryRoot).some((name) => name.endsWith(".tmp")),
      false,
    );
  } finally {
    await daemon.stop();
    await closeServer(occupied.server);
  }
});

test("recovery daemon entrypoint cleans up on termination and abnormal failures", () => {
  const source = fs.readFileSync(
    path.join(rootDir, "apps/api/openclaw-recovery-daemon.ts"),
    "utf8",
  );
  for (const reason of [
    "SIGINT",
    "SIGTERM",
    "uncaughtException",
    "unhandledRejection",
  ]) {
    assert.match(source, new RegExp(`process\\.once\\(["']${reason}["']`));
  }
  assert.match(source, /await daemon\.stop\(\)[\s\S]*?process\.exit/);
  assert.ok(
    source.indexOf('process.once("SIGINT"')
      < source.indexOf("await daemon.start()"),
    "termination cleanup must be armed before startup writes runtime metadata",
  );
});

test("recovery repair creates backups before pruning dynamic validation paths", () => {
  const config = makeConfig();

  const backupPath = createOpenClawConfigBackup(config);
  const changedKeys = pruneInvalidOpenClawConfigFromValidation(config, [
    {
      path: "agents.defaults.llm",
      message: "agents.defaults.llm is not allowed",
    },
    {
      path: "tools.exec.mode",
      message: "tools.exec.mode cannot be combined with tools.exec.security or tools.exec.ask",
    },
    {
      path: "plugins.entries.tracevane.config.keep",
      message: "unsupported plugin config field",
    },
    {
      path: "channels.customProvider.extensionField",
      message: "unsupported channel field",
    },
  ]);

  assert.ok(backupPath);
  assert.equal(fs.existsSync(backupPath), true);
  assert.deepEqual(changedKeys, ["agents.defaults.llm", "tools.exec.mode"]);

  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal("llm" in repaired.agents.defaults, false);
  assert.equal("mode" in repaired.tools.exec, false);
  assert.equal(repaired.tools.exec.security, "default");
  assert.equal(repaired.tools.exec.ask, "never");
  assert.equal(repaired.plugins.entries.tracevane.config.keep, "plugin-config");
  assert.equal(repaired.plugins.entries.alpha.enabled, true);
  assert.equal(repaired.plugins.providerParams.keep, true);
  assert.equal(repaired.channels.customProvider.extensionField, "preserve");

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  assert.equal(backup.agents.defaults.llm, "legacy-bad-key");
});

test("recovery backups restore runtime env sidecars with openclaw config", () => {
  const config = makeConfig();
  const secretPath = path.join(config.openclawRoot, "tracevane-local-secrets.json");
  const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  openclawConfig.secrets = {
    providers: {
      "tracevane-local": {
        source: "file",
        path: secretPath,
        mode: "json",
      },
    },
  };
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(openclawConfig, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, ".env"),
    "OPENCLAW_GATEWAY_TOKEN=before-env\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "OPENCLAW_GATEWAY_TOKEN=before-systemd\n",
    "utf8",
  );
  fs.writeFileSync(
    secretPath,
    `${JSON.stringify({ gatewayAuthToken: "before-secret", keep: true }, null, 2)}\n`,
    "utf8",
  );

  const backupPath = createOpenClawConfigBackup(config);
  const mutated = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  mutated.gateway = { auth: { token: "after-config" } };
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(mutated, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, ".env"),
    "OPENCLAW_GATEWAY_TOKEN=after-env\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "OPENCLAW_GATEWAY_TOKEN=after-systemd\n",
    "utf8",
  );
  fs.writeFileSync(
    secretPath,
    `${JSON.stringify({ gatewayAuthToken: "after-secret", keep: false }, null, 2)}\n`,
    "utf8",
  );

  restoreOpenClawRecoveryBackup(config, backupPath);

  const restored = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  const restoredSecret = JSON.parse(fs.readFileSync(secretPath, "utf8"));
  assert.equal(restored.agents.defaults.llm, "legacy-bad-key");
  assert.equal(
    fs.readFileSync(path.join(config.openclawRoot, ".env"), "utf8"),
    "OPENCLAW_GATEWAY_TOKEN=before-env\n",
  );
  assert.equal(
    fs.readFileSync(path.join(config.openclawRoot, "gateway.systemd.env"), "utf8"),
    "OPENCLAW_GATEWAY_TOKEN=before-systemd\n",
  );
  assert.deepEqual(restoredSecret, {
    gatewayAuthToken: "before-secret",
    keep: true,
  });
});

test("gateway deep probe validates the Tracevane control route without breaking light probe", async () => {
  const { server, port } = await listenProbeServer((request, response) => {
    if (request.url === "/tracevane") {
      response.writeHead(401);
      response.end("auth required");
      return;
    }
    response.writeHead(404);
    response.end("root not found");
  });

  try {
    const light = await probeOpenClawGateway(port, 500);
    const deep = await probeOpenClawGatewayDeep({
      port,
      timeoutMs: 500,
      controlUiBasePath: "/tracevane",
    });

    assert.equal(light, true);
    assert.equal(deep.ok, true);
    assert.equal(deep.connected, true);
    assert.deepEqual(
      deep.checks.map((check) => [check.path, check.ok, check.statusCode]),
      [["/", true, 404], ["/tracevane", true, 401]],
    );
  } finally {
    await closeServer(server);
  }
});

test("gateway deep probe reports connected route failures without forcing process takeover", async () => {
  const { server, port } = await listenProbeServer((request, response) => {
    response.writeHead(request.url === "/tracevane" ? 404 : 200);
    response.end("ok");
  });

  try {
    const deep = await probeOpenClawGatewayDeep({
      port,
      timeoutMs: 500,
      controlUiBasePath: "/tracevane",
    });

    assert.equal(deep.ok, false);
    assert.equal(deep.connected, true);
    assert.match(deep.error, /\/tracevane returned HTTP 404/);
  } finally {
    await closeServer(server);
  }
});

test("gateway service status parser detects service hosting repair cases", () => {
  const healthy = parseOpenClawGatewayStatus(JSON.stringify({
    service: {
      loaded: true,
      command: {
        sourcePath: "/tmp/openclaw-gateway.service",
        programArguments: ["node", "openclaw", "gateway", "--port", "31879"],
      },
      runtime: {
        status: "running",
        state: "active",
        subState: "running",
        pid: 1234,
      },
      configAudit: { ok: true, issues: [] },
    },
    gateway: { port: 31879 },
    rpc: { ok: true },
  }));
  const failed = parseOpenClawGatewayStatus(JSON.stringify({
    service: {
      loaded: false,
      command: {
        sourcePath: "/tmp/missing-openclaw-gateway.service",
        programArguments: ["node", "openclaw", "status"],
      },
      runtime: {
        status: "failed",
        state: "failed",
        subState: "dead",
        pid: null,
      },
      configAudit: {
        ok: false,
        issues: [{ message: "service args do not match config" }],
      },
    },
    gateway: { port: 9999 },
    rpc: { ok: false },
  }));

  assert.equal(
    assessOpenClawGatewayServiceStatus(healthy, {
      expectedPort: 31879,
      sourcePathExists: true,
    }).needsRepair,
    false,
  );

  const assessment = assessOpenClawGatewayServiceStatus(failed, {
    expectedPort: 31879,
    sourcePathExists: false,
  });
  assert.equal(assessment.needsRepair, true);
  assert.equal(assessment.shouldInstall, true);
  assert.equal(assessment.shouldStart, true);
  assert.ok(assessment.reasons.includes("service_not_loaded"));
  assert.ok(assessment.reasons.includes("service_command_missing_gateway"));
  assert.ok(assessment.reasons.includes("gateway_port_mismatch"));
});

test("tracevane web bundle inspection detects missing and rebuilt static assets", () => {
  const config = makeConfig();

  const missing = inspectTracevaneWebBundle(config);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ["webDistDir", "index.html", "assets"]);

  const assetsDir = path.join(config.webDistDir, "assets");
  fs.mkdirSync(assetsDir, { recursive: true });
  fs.writeFileSync(path.join(config.webDistDir, "index.html"), "<div id=\"app\"></div>\n", "utf8");
  fs.writeFileSync(path.join(assetsDir, "index-test.js"), "console.log('ok');\n", "utf8");

  const ready = inspectTracevaneWebBundle(config);
  assert.equal(ready.ok, true);
  assert.equal(ready.assetCount, 1);
  assert.deepEqual(ready.missing, []);
});

test("recovery history and config backup lists are paginated", () => {
  const config = makeConfig();
  const backupsDir = path.join(config.openclawRoot, "tracevane", "recovery", "backups");
  fs.mkdirSync(backupsDir, { recursive: true });

  for (let index = 0; index < 15; index += 1) {
    appendRecoveryEvent(
      config,
      createRecoveryEvent({
        kind: "repair_started",
        severity: "info",
        title: `event ${index}`,
        summary: "test event",
        status: "succeeded",
        occurredAt: `2026-06-05T00:00:${String(index).padStart(2, "0")}.000Z`,
      }),
    );
  }
  for (let index = 0; index < 12; index += 1) {
    fs.writeFileSync(
      path.join(
        backupsDir,
        `openclaw-20260605T0000${String(index).padStart(2, "0")}000Z.json`,
      ),
      "{}\n",
      "utf8",
    );
  }

  const eventPage = listRecoveryEventsPage(config, 2, 5);
  const backupPage = listRecoveryBackupsPage(config, 2, 5);

  assert.equal(eventPage.events.length, 5);
  assert.equal(eventPage.pagination.page, 2);
  assert.equal(eventPage.pagination.totalEntries, 15);
  assert.equal(eventPage.pagination.hasPreviousPage, true);
  assert.equal(eventPage.pagination.hasNextPage, true);
  assert.equal(backupPage.backups.length, 5);
  assert.equal(backupPage.pagination.page, 2);
  assert.equal(backupPage.pagination.totalEntries, 12);
});

test("plugin repair disables bad entries and removes missing absolute load paths", () => {
  const config = makeConfig();
  const changedKeys = [
    ...pruneMissingOpenClawPluginLoadPaths(config),
    ...repairOpenClawPluginConfigFromFindings(config, [
      {
        path: "plugins.entries.alpha",
        message: "plugin alpha failed to load",
      },
      {
        path: "plugins.entries.tracevane",
        message: "plugin tracevane failed to load",
      },
    ]),
  ];

  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));

  assert.ok(changedKeys.includes("plugins.load.paths"));
  assert.ok(changedKeys.includes("plugins.entries.alpha.enabled"));
  assert.equal(repaired.plugins.entries.alpha.enabled, false);
  assert.equal(repaired.plugins.entries.tracevane.enabled, true);
  assert.deepEqual(repaired.plugins.load.paths, [config.projectRoot]);
});

test("recovery repair migrates gateway auth token to env SecretRef and syncs runtime env files", () => {
  const config = makeConfig();
  const secretPath = path.join(config.openclawRoot, "tracevane-local-secrets.json");
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        gateway: {
          auth: {
            mode: "token",
            token: "plain-token-123",
          },
        },
        secrets: {
          providers: {
            "tracevane-local": {
              source: "file",
              path: secretPath,
              mode: "json",
            },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  fs.writeFileSync(
    secretPath,
    `${JSON.stringify({ gatewayAuthToken: "stale-secret", keep: "yes" }, null, 2)}\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, ".env"),
    "OTHER=1\nOPENCLAW_GATEWAY_TOKEN=stale-env\nOPENCLAW_DISCORD_BOT_TOKEN=discord\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "OPENCLAW_GATEWAY_TOKEN=stale-systemd\nOPENCLAW_DISCORD_BOT_TOKEN=discord\n",
    "utf8",
  );

  const changedKeys = repairOpenClawGatewayAuthSecretRefDrift(config);
  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  const env = fs.readFileSync(path.join(config.openclawRoot, ".env"), "utf8");
  const systemdEnv = fs.readFileSync(
    path.join(config.openclawRoot, "gateway.systemd.env"),
    "utf8",
  );
  const secrets = JSON.parse(fs.readFileSync(secretPath, "utf8"));

  assert.ok(changedKeys.includes("gateway.auth.token"));
  assert.ok(changedKeys.includes("env.OPENCLAW_GATEWAY_TOKEN"));
  assert.ok(changedKeys.includes("gateway.systemd.env.OPENCLAW_GATEWAY_TOKEN"));
  assert.ok(changedKeys.includes("env.OPENCLAW_DISCORD_BOT_TOKEN"));
  assert.ok(changedKeys.includes("gateway.systemd.env.OPENCLAW_DISCORD_BOT_TOKEN"));
  assert.ok(changedKeys.includes("secrets.providers.tracevane-local.gatewayAuthToken"));
  assert.deepEqual(repaired.gateway.auth.token, {
    source: "env",
    provider: "default",
    id: "OPENCLAW_GATEWAY_TOKEN",
  });
  assert.match(env, /OPENCLAW_GATEWAY_TOKEN=plain-token-123/);
  assert.match(systemdEnv, /OPENCLAW_GATEWAY_TOKEN=plain-token-123/);
  assert.doesNotMatch(env, /OPENCLAW_DISCORD_BOT_TOKEN/);
  assert.doesNotMatch(systemdEnv, /OPENCLAW_DISCORD_BOT_TOKEN/);
  assert.equal(secrets.gatewayAuthToken, undefined);
  assert.equal(secrets.keep, "yes");
});

test("recovery repair prunes deprecated OpenClaw plugin residue conservatively", () => {
  const config = makeConfig();
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        plugins: {
          allow: ["tracevane", "discord", "acpx", "codex"],
          entries: {
            tracevane: { enabled: true },
            discord: { enabled: true },
            acpx: { enabled: true },
            codex: { enabled: true },
          },
        },
        channels: {
          discord: { enabled: true },
          feishu: { enabled: true },
        },
        bindings: [
          {
            agentId: "main",
            match: { channel: "discord" },
          },
          {
            type: "acp",
            agentId: "main",
            match: { channel: "feishu" },
            acp: { backend: "acpx" },
          },
          {
            type: "acp",
            agentId: "main",
            match: { channel: "feishu" },
            acp: { backend: "codex" },
          },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const pluginDir = path.join(config.openclawRoot, "plugins");
  fs.mkdirSync(pluginDir, { recursive: true });
  fs.writeFileSync(
    path.join(pluginDir, "installs.json"),
    `${JSON.stringify(
      {
        hostContractVersion: CURRENT_TRACEVANE_VERSION,
        installs: {
          discord: { version: CURRENT_TRACEVANE_VERSION },
          codex: { version: "2026.6.8" },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const changedKeys = pruneDeprecatedOpenClawPluginResidue(config);
  const repaired = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  const backups = fs.readdirSync(path.join(pluginDir, "legacy-backups"));

  assert.ok(changedKeys.includes("plugins.allow"));
  assert.ok(changedKeys.includes("plugins.entries.discord"));
  assert.ok(changedKeys.includes("plugins.entries.acpx"));
  assert.ok(changedKeys.includes("channels.discord"));
  assert.ok(changedKeys.includes("bindings.deprecatedPlugin"));
  assert.ok(changedKeys.includes("plugins.installs.legacyIndex"));
  assert.deepEqual(repaired.plugins.allow, ["tracevane", "codex"]);
  assert.equal(repaired.plugins.entries.tracevane.enabled, true);
  assert.equal(repaired.plugins.entries.codex.enabled, true);
  assert.equal(repaired.plugins.entries.discord, undefined);
  assert.equal(repaired.plugins.entries.acpx, undefined);
  assert.equal(repaired.channels.discord, undefined);
  assert.equal(repaired.channels.feishu.enabled, true);
  assert.equal(repaired.bindings.length, 1);
  assert.equal(repaired.bindings[0].acp.backend, "codex");
  assert.equal(fs.existsSync(path.join(pluginDir, "installs.json")), false);
  assert.equal(backups.length, 1);
  assert.match(backups[0], /^installs-.*\.json\.bak$/);
});

test("recovery keeps current plugin install index when no deprecated plugin residue is present", () => {
  const config = makeConfig();
  fs.writeFileSync(
    config.openclawConfigFile,
    `${JSON.stringify(
      {
        plugins: {
          allow: ["tracevane", "codex"],
          entries: {
            tracevane: { enabled: true },
            codex: { enabled: true },
          },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  const pluginDir = path.join(config.openclawRoot, "plugins");
  fs.mkdirSync(pluginDir, { recursive: true });
  const installIndex = path.join(pluginDir, "installs.json");
  fs.writeFileSync(
    installIndex,
    `${JSON.stringify(
      {
        hostContractVersion: "2026.6.8",
        installs: {
          codex: { version: "2026.6.8" },
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const changedKeys = pruneDeprecatedOpenClawPluginResidue(config);

  assert.deepEqual(changedKeys, []);
  assert.equal(fs.existsSync(installIndex), true);
  assert.equal(fs.existsSync(path.join(pluginDir, "legacy-backups")), false);
});

test("CLI bootstrap restores openclaw from install manifest when PATH entry is missing", async () => {
  if (process.platform === "win32") return;
  const config = makeConfig();
  const fakeCli = path.join(config.projectRoot, "fake-openclaw.mjs");
  fs.writeFileSync(
    fakeCli,
    "console.log('OpenClaw 2099.1.1 (fake)');\n",
    "utf8",
  );
  writeOpenClawRecoveryInstallManifest(config, {
    version: 1,
    updatedAt: "2026-06-05T00:00:00.000Z",
    cliPath: path.join(config.projectRoot, "missing-openclaw"),
    cliRealPath: fakeCli,
    cliVersion: "2099.1.1",
    nodePath: process.execPath,
    packageManager: "unknown",
    packageName: "openclaw",
    packageSpec: "openclaw@2099.1.1",
    npmPrefix: "",
    installKind: "npm-global",
    projectRoot: config.projectRoot,
  });

  const commands = [];
  const originalPath = process.env.PATH;
  process.env.PATH = path.join(config.projectRoot, "empty-bin");
  try {
    const result = await ensureOpenClawCliAvailable(
      config,
      { allowCliReinstall: false, cliReinstallTimeoutMs: 1 },
      commands,
    );

    assert.equal(result.ok, true);
    assert.equal(result.action, "shim");
    assert.equal(commands.at(-1).ok, true);
    assert.equal(commands.some((command) => command.error.includes("ENOENT")), true);
  } finally {
    process.env.PATH = originalPath;
  }
});

test("CLI bootstrap shim executes shell wrapper manifests directly", () => {
  if (process.platform === "win32") return;
  const config = makeConfig();
  const fakeCli = path.join(config.projectRoot, "fake-openclaw");
  fs.writeFileSync(
    fakeCli,
    "#!/bin/sh\necho 'OpenClaw 2099.2.0 (fake-shell)'\n",
    { encoding: "utf8", mode: 0o755 },
  );
  fs.chmodSync(fakeCli, 0o755);

  const shimPath = createOpenClawCliShim(config, {
    version: 1,
    updatedAt: "2026-06-05T00:00:00.000Z",
    cliPath: fakeCli,
    cliRealPath: fakeCli,
    cliVersion: "2099.2.0",
    nodePath: process.execPath,
    packageManager: "npm",
    packageName: "openclaw",
    packageSpec: "openclaw@2099.2.0",
    npmPrefix: "",
    installKind: "path",
    projectRoot: config.projectRoot,
  });

  const output = execFileSync(shimPath, ["--version"], { encoding: "utf8" });

  assert.match(output, /OpenClaw 2099\.2\.0/);
  assert.doesNotMatch(fs.readFileSync(shimPath, "utf8"), new RegExp(process.execPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("gateway runtime discovery parses listeners and only trusts OpenClaw gateway processes", () => {
  const lsof = [
    "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME",
    "node 1234 binbin 23u IPv4 1 0t0 TCP 127.0.0.1:31879 (LISTEN)",
    "nginx 4321 root 6u IPv4 2 0t0 TCP *:31879 (LISTEN)",
  ].join("\n");
  const ss = [
    "State Recv-Q Send-Q Local Address:Port Peer Address:Port Process",
    "LISTEN 0 511 127.0.0.1:31879 0.0.0.0:* users:((\"node\",pid=1234,fd=23))",
  ].join("\n");

  assert.deepEqual(
    parseLsofListeners(lsof, 31879).map((listener) => listener.pid),
    [1234, 4321],
  );
  assert.deepEqual(
    parseSsListeners(ss, 31879).map((listener) => listener.pid),
    [1234],
  );
  assert.deepEqual(
    isOpenClawGatewayProcess({
      pid: 1234,
      command: "node",
      process: {
        pid: 1234,
        ppid: 1,
        command: "node",
        args: "/opt/openclaw/dist/index.js gateway --port 31879",
      },
    }),
    { safe: true, reason: "openclaw-gateway" },
  );
  assert.equal(
    isOpenClawGatewayProcess({
      pid: 4321,
      command: "nginx",
      process: {
        pid: 4321,
        ppid: 1,
        command: "nginx",
        args: "nginx: master process",
      },
    }).safe,
    false,
  );
});

test("recovery status is read-only and returns default daemon state without CLI output", async () => {
  const config = makeConfig();
  const service = createOpenClawRecoveryService(config);

  const status = await service.getStatus();

  assert.equal(status.status, "unknown");
  assert.equal(status.daemon.pid, null);
  assert.equal(status.policy.failureThresholdMs, 180000);
  assert.equal(status.service.serviceName.length > 0, true);
  assert.equal(status.probe.gatewayReachable, null);
  assert.equal(status.lastRepair, null);
});

test("recovery live manager overrides persisted legacy service fields", async () => {
  const config = makeConfig();
  const state = buildDefaultRecoveryState(config);
  writeRecoveryState(config, {
    ...state,
    service: {
      ...state.service,
      installed: true,
      activeState: "active",
      enabledState: "enabled",
      lastCheckedAt: "2026-06-05T00:00:00.000Z",
    },
  });
  const liveManager = sharedManagerStatus({
    checkedAt: "2026-07-12T08:00:00.000Z",
  });
  const fake = createFakeServiceManager((_definition, request) =>
    managedResponse(request, { manager: liveManager }));
  const service = createOpenClawRecoveryService(config, {
    daemonServiceManager: fake.manager,
  });

  const status = await service.getStatus();

  assert.equal(status.service.installed, false);
  assert.equal(status.service.activeState, "inactive");
  assert.equal(status.service.enabledState, "unknown");
  assert.equal(status.service.lastCheckedAt, liveManager.checkedAt);
  assert.deepEqual(status.service.manager, liveManager);
});

test("old Recovery snapshots deep-fill partial and null managers", () => {
  for (const storedManager of [
    {
      mode: "persistent",
      supervisor: "scheduled-task",
      installed: true,
      state: "stale-config",
      configCurrent: false,
    },
    null,
  ]) {
    const config = makeConfig();
    const statePath = path.join(
      config.openclawRoot,
      "tracevane",
      "recovery",
      "state.json",
    );
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      `${JSON.stringify({
        service: {
          manager: storedManager,
          installed: true,
          activeState: "active",
          enabledState: "enabled",
          lastCheckedAt: "2026-06-05T00:00:00.000Z",
        },
      })}\n`,
      "utf8",
    );

    const restored = readRecoveryState(config);
    assert.deepEqual(
      Object.keys(restored.service.manager).sort(),
      [
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
      ],
    );
    assert.equal(typeof restored.service.manager.checkedAt, "string");
    assert.equal(
      ["session", "persistent"].includes(restored.service.manager.mode),
      true,
    );
    if (storedManager) {
      assert.equal(restored.service.manager.mode, "persistent");
      assert.equal(restored.service.manager.supervisor, "scheduled-task");
      assert.equal(restored.service.manager.installed, true);
      assert.equal(restored.service.manager.state, "stale-config");
      assert.equal(restored.service.manager.active, null);
      assert.equal(restored.service.manager.enabled, null);
      assert.equal(restored.service.manager.errorCode, null);
      assert.equal(restored.service.manager.errorMessage, null);
    } else {
      assert.equal(restored.service.manager.mode, "session");
      assert.equal(restored.service.manager.state, "stopped");
    }
  }
});

test("system and event hot paths no longer call diagnostics by default", () => {
  const systemService = fs.readFileSync(
    path.join(rootDir, "apps/api/modules/system/service.ts"),
    "utf8",
  );
  const runtimeSummaryBody = systemService.match(/async getRuntimeSummary\(\)[\s\S]*?\n    async getTerminalActionSuggestions/)?.[0] || "";
  const listEventsBody = systemService.match(/async listEvents\(limit = 100\)[\s\S]*?\n    async getEventSummary/)?.[0] || "";
  const eventSummaryBody = systemService.match(/async getEventSummary\(limit = 100\)[\s\S]*?\n  \};/)?.[0] || "";

  assert.doesNotMatch(runtimeSummaryBody, /getDiagnostics\(/);
  assert.doesNotMatch(listEventsBody, /getDiagnostics\(/);
  assert.doesNotMatch(eventSummaryBody, /getDiagnostics\(/);
  assert.match(listEventsBody, /systemEventWriter\.listPersistedEvents\(limit\)/);
  assert.match(eventSummaryBody, /buildSystemEventSummaryCards\(/);
  assert.match(eventSummaryBody, /systemEventWriter\.listPersistedEvents\(limit\)/);
});
