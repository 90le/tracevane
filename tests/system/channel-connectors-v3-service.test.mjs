import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as channelConnectorsServiceModule from "../../dist/apps/api/modules/channel-connectors/service.js";
import {
  createTracevaneContext,
  createTracevaneRequestHandler,
} from "../../dist/apps/api/index.js";

const {
  createChannelConnectorsDaemonPlan,
  createChannelConnectorsService,
  resolveChannelConnectorsPaths,
} = channelConnectorsServiceModule;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const daemonEntry = path.join(
  repoRoot,
  "dist",
  "apps",
  "api",
  "modules",
  "channel-connectors",
  "daemon.js",
);

function createConfig(root) {
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  return {
    pluginId: "tracevane",
    pluginName: "Tracevane",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot,
    openclawConfigFile: path.join(openclawRoot, "openclaw.json"),
    projectRoot: path.join(root, "workspace"),
    webDistDir: path.join(root, "web-dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: { standalone: { enabled: true, port: 3760 }, gateway: { enabled: true, basePath: "/tracevane" } },
  };
}

function managerStatus(overrides = {}) {
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
  const manager = overrides.manager ?? managerStatus();
  return {
    ok: overrides.ok ?? manager.errorCode === null,
    action: request.action,
    manager,
    commands: overrides.commands ?? [],
    templateWritten: overrides.templateWritten ?? false,
    configCurrent: overrides.configCurrent ?? manager.configCurrent,
  };
}

function ensureDaemonEntry(config) {
  const daemonEntry = path.join(
    config.projectRoot,
    "dist",
    "apps",
    "api",
    "modules",
    "channel-connectors",
    "daemon.js",
  );
  fs.mkdirSync(path.dirname(daemonEntry), { recursive: true });
  fs.writeFileSync(daemonEntry, "// fixture\n", "utf8");
  return daemonEntry;
}

function managementRequest({ origin, remoteAddress = "127.0.0.1", authorization } = {}) {
  return {
    url: "/api/channel-connectors/daemon/service",
    headers: {
      ...(origin === undefined ? {} : { origin }),
      ...(authorization ? { authorization } : {}),
    },
    socket: { remoteAddress },
  };
}

function legacyCommandResult(command, overrides = {}) {
  return {
    ...command,
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    errorCode: null,
    errorMessage: null,
    durationMs: 1,
    error: null,
    ...overrides,
  };
}

function decodeWindowsTaskAction(template) {
  const encoded = template.match(/-EncodedCommand ([A-Za-z0-9+/=]+)/)?.[1];
  assert.ok(encoded, "Windows task action must contain an encoded PowerShell command");
  return Buffer.from(encoded, "base64").toString("utf16le");
}

function createLogger() {
  return { info() {}, warn() {}, error() {}, debug() {} };
}

async function withHttpServer(handler, task) {
  const server = http.createServer(async (req, res) => {
    const handled = await handler(req, res);
    if (!handled && !res.writableEnded) {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await task(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function requestJson(url, options = {}) {
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
    body,
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}

function waitForChildExit(child, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`child ${child.pid ?? "unknown"} did not exit`));
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

test("Channel Connectors persists only v3 resources and redacts generated runtime mappings", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-v3-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const config = createConfig(root);
  const service = createChannelConnectorsService(config, {
    homeDir: root,
    now: () => new Date("2026-07-10T12:00:00.000Z"),
  });
  const initial = service.getV3Config();
  assert.equal(initial.config.version, 3);
  assert.equal(initial.config.targets[0].id, "default-codex");

  const candidate = structuredClone(initial.config);
  candidate.accounts.push({
    id: "feishu-main",
    platform: "feishu",
    displayName: "Feishu main",
    lifecycle: "enabled",
    externalAccountId: "cli_example",
    botId: null,
    credentials: { appId: "cli_example", appSecret: "secret-value" },
    transport: { apiUrl: "https://open.feishu.cn" },
    security: { allowPrivateAttachmentUrls: false, allowedAttachmentHosts: [] },
    advanced: {},
  });
  candidate.deliveryPolicies.push({
    id: "feishu-main-policy",
    accountRef: "feishu-main",
    defaultTargetRef: "default-codex",
    defaultSessionPolicy: { mode: "persistent", busyGuard: true, attachmentStaging: true },
    defaultAccessPolicy: { allowlist: [], adminUsers: [], disabledCommands: [], mentionRequired: false },
    rules: [],
  });

  const plan = service.planV3Config({ config: candidate, expectedRevision: initial.revision });
  assert.equal(plan.ok, true);
  assert.ok(plan.planId);
  const saved = service.saveV3Config(candidate);
  assert.equal(saved.config.accounts[0].credentials.appSecret, "[redacted]");
  assert.deepEqual(service.getAccountSecrets("feishu-main").secrets, {
    appId: "cli_example",
    appSecret: "secret-value",
  });

  const daemon = service.getDaemonConfig();
  assert.equal(daemon.config.deliveryConfig.version, 3);
  assert.equal(daemon.config.projects.length, 1);
  assert.equal(daemon.config.projects[0].platformBindings[0].metadata.appSecret, "[redacted]");
  assert.doesNotMatch(daemon.preview, /secret-value/);
  const persisted = fs.readFileSync(saved.configPath, "utf8");
  assert.match(persisted, /"version": 3/);
  assert.doesNotMatch(persisted, /platformBindings/);
});

test("Channel Connectors Windows compatibility plan is a shared current-user Scheduled Task", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane channel 计划-"));
  try {
    const config = createConfig(root);
    const homeDir = path.join(root, "用户 主目录");
    const plan = createChannelConnectorsDaemonPlan(config, {
      platform: "win32",
      homeDir,
      windowsUserId: "TRACEVANE\\测试用户",
    });

    assert.equal(plan.platform, "win32");
    assert.equal(plan.supported, true);
    assert.equal(plan.supervisor, "scheduled-task");
    assert.equal(plan.serviceName, "TracevaneChannelConnectors");
    assert.equal(plan.managementEndpoint, "http://127.0.0.1:18797");
    assert.match(plan.selectedTemplate.servicePath, /TracevaneChannelConnectors\.xml$/);
    assert.match(plan.selectedTemplate.template, /<LogonType>InteractiveToken<\/LogonType>/);
    assert.match(plan.selectedTemplate.template, /TRACEVANE\\测试用户/);
    const taskAction = decodeWindowsTaskAction(plan.selectedTemplate.template);
    const payload = taskAction.match(/'--payload'\s+'([A-Za-z0-9+/]+={0,2})'/u)?.[1];
    assert.ok(payload, "Windows task action must contain one encoded argv payload");
    const decodedPayload = JSON.parse(Buffer.from(payload, "base64").toString("utf8"));
    assert.equal(
      decodedPayload.entryPath,
      path.join(
        config.projectRoot,
        "dist",
        "apps",
        "api",
        "modules",
        "channel-connectors",
        "daemon.js",
      ),
    );
    assert.deepEqual(decodedPayload.args, ["--config", plan.configPath]);
    assert.match(taskAction, /'--host-pid'\s+\(\[string\]\$PID\)/u);
    assert.match(plan.selectedTemplate.template, /<Command>powershell\.exe<\/Command>/i);
    assert.match(plan.selectedTemplate.template, /-WindowStyle Hidden/);
    assert.doesNotMatch(plan.selectedTemplate.template, /managementToken|proxyPassword|appSecret/);

    const status = plan.selectedTemplate.commands.status ?? [];
    assert.equal(status.length, 1);
    assert.equal(status[0].command, "powershell.exe");
    assert.equal(status[0].kind, "windows-task-status");
    assert.deepEqual(status[0].args.slice(0, 6), [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-WindowStyle",
      "Hidden",
      "-EncodedCommand",
    ]);

    assert.equal(
      typeof channelConnectorsServiceModule.createChannelConnectorsServiceDefinition,
      "function",
    );
    const definition = channelConnectorsServiceModule.createChannelConnectorsServiceDefinition(
      config,
      { homeDir },
    );
    assert.equal(definition.id, "channel-connectors");
    assert.equal(definition.healthUrl, "http://127.0.0.1:18797/status");
    assert.equal(definition.args.length, 0);
    assert.equal(definition.configPath, plan.configPath);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Channel Connectors writes private config before one injected session start", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-manager-"));
  const previousWorkspace = process.env.TRACEVANE_CHANNEL_CONNECTORS_DIR;
  process.env.TRACEVANE_CHANNEL_CONNECTORS_DIR = path.join(root, "decoy-env-root");
  try {
    const config = createConfig(root);
    ensureDaemonEntry(config);
    const homeDir = path.join(root, "explicit-home");
    const expectedPaths = resolveChannelConnectorsPaths(config, homeDir);
    const managerCalls = [];
    const legacyCalls = [];
    let disposeCalls = 0;
    const manager = {
      async manage(definition, request) {
        managerCalls.push({ definition, request });
        assert.equal(definition.configPath, expectedPaths.configPath);
        assert.equal(fs.existsSync(definition.configPath), true);
        const privateConfig = JSON.parse(fs.readFileSync(definition.configPath, "utf8"));
        assert.equal(privateConfig.version, 1);
        assert.equal(privateConfig.deliveryConfig.version, 3);
        return managedResponse(request, {
          manager: managerStatus({ active: true, state: "running" }),
        });
      },
      async dispose() {
        disposeCalls += 1;
      },
    };
    const service = createChannelConnectorsService(config, {
      homeDir,
      platform: "win32",
      manager,
      commandRunner: async (command) => {
        legacyCalls.push(command);
        return legacyCommandResult(command);
      },
    });

    const response = await service.manageDaemonService({
      action: "start",
      mode: "session",
      apply: true,
      runCommands: false,
    });

    assert.deepEqual(managerCalls.map(({ request }) => request), [
      { action: "start", mode: "session", apply: true },
    ]);
    assert.equal(legacyCalls.length, 0);
    assert.equal(disposeCalls, 0);
    assert.equal(response.applied, true);
    assert.equal(response.configWritten, true);
    assert.equal(response.templateWritten, false);
    assert.deepEqual(response.manager, managerCalls[0].request.action === "start"
      ? managerStatus({ active: true, state: "running" })
      : null);
    assert.equal(response.serviceManager.state, response.manager.state);
    assert.equal(response.serviceManager.configCurrent, response.manager.configCurrent);
    assert.equal(response.installed, response.manager.installed);
    assert.equal(response.commandsRun.length, 0);
    assert.equal(expectedPaths.rootDir.startsWith(homeDir), true);
    assert.equal(fs.existsSync(path.join(root, "decoy-env-root")), false);
  } finally {
    if (previousWorkspace === undefined) delete process.env.TRACEVANE_CHANNEL_CONNECTORS_DIR;
    else process.env.TRACEVANE_CHANNEL_CONNECTORS_DIR = previousWorkspace;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Channel Connectors maps missing persistent restart without running End", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-restart-"));
  try {
    const config = createConfig(root);
    ensureDaemonEntry(config);
    const managerCalls = [];
    const manager = {
      async manage(_definition, request) {
        managerCalls.push(request);
        const query = {
          label: "Query scheduled task",
          command: "schtasks.exe",
          args: ["/Query", "/TN", "TracevaneChannelConnectors", "/HResult"],
          ok: false,
          exitCode: -2147024894,
          stdout: "",
          stderr: "",
          errorCode: "task-not-found",
          errorMessage: "Persistent service is not installed.",
          durationMs: 2,
        };
        return managedResponse(request, {
          ok: false,
          manager: managerStatus({
            mode: "persistent",
            supervisor: "scheduled-task",
            active: false,
            state: "not-installed",
            configCurrent: false,
            errorCode: "task-not-found",
            errorMessage: "Persistent service is not installed.",
          }),
          commands: [query],
          configCurrent: false,
        });
      },
      async dispose() {
        assert.fail("injected manager is caller-owned");
      },
    };
    const service = createChannelConnectorsService(config, {
      homeDir: root,
      platform: "win32",
      manager,
      commandRunner: async () => assert.fail("legacy runner must not execute"),
    });
    const response = await service.manageDaemonService({
      action: "restart",
      mode: "persistent",
      apply: true,
    });

    assert.deepEqual(managerCalls, [
      { action: "restart", mode: "persistent", apply: true },
    ]);
    assert.equal(response.ok, false);
    assert.equal(response.manager.errorCode, "task-not-found");
    assert.equal(response.serviceManager.errorCode, "task-not-found");
    assert.equal(response.commandsRun[0].error, "Persistent service is not installed.");
    assert.equal(response.commandsRun[0].durationMs, 2);
    assert.doesNotMatch(JSON.stringify(response.commandsRun), /\/End/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Channel lifecycle management rejects untrusted browser origins before side effects", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-auth-"));
  try {
    const config = createConfig(root);
    ensureDaemonEntry(config);
    fs.writeFileSync(config.openclawConfigFile, JSON.stringify({
      gateway: { auth: { mode: "token", token: "trusted-management-token" } },
    }), "utf8");
    let managerCalls = 0;
    let legacyCalls = 0;
    let fetchCalls = 0;
    const manager = {
      async manage(_definition, request) {
        managerCalls += 1;
        return managedResponse(request);
      },
      async dispose() {
        assert.fail("injected manager is caller-owned");
      },
    };
    const service = createChannelConnectorsService(config, {
      homeDir: root,
      platform: "win32",
      manager,
      commandRunner: async (command) => {
        legacyCalls += 1;
        return legacyCommandResult(command);
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("blocked request must not fetch");
      },
    });
    const privateConfigPath = resolveChannelConnectorsPaths(config, root).configPath;

    for (const origin of ["https://evil.example", "null", "not an origin"]) {
      await assert.rejects(
        () => service.manageDaemonService(
          { action: "start", mode: "session", apply: true },
          managementRequest({ origin }),
        ),
        (error) => error?.statusCode === 403,
      );
    }
    await assert.rejects(
      () => service.manageAgentSessions(
        { action: "reap-idle" },
        managementRequest({ origin: "https://evil.example" }),
      ),
      (error) => error?.statusCode === 403,
    );
    assert.equal(managerCalls, 0);
    assert.equal(legacyCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(fs.existsSync(privateConfigPath), false);

    await service.manageDaemonService(
      { action: "status", mode: "session", apply: true },
      managementRequest(),
    );
    await service.manageDaemonService(
      { action: "status", mode: "session", apply: true },
      managementRequest({ origin: "http://127.0.0.1:5173" }),
    );
    await service.manageDaemonService(
      { action: "status", mode: "session", apply: true },
      managementRequest({
        origin: "https://remote.example",
        remoteAddress: "203.0.113.7",
        authorization: "Bearer trusted-management-token",
      }),
    );
    assert.equal(managerCalls, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Channel lifecycle and V3 apply routes enforce the trusted management boundary", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-route-auth-"));
  try {
    const config = createConfig(root);
    fs.writeFileSync(config.openclawConfigFile, JSON.stringify({
      gateway: { auth: { mode: "token", token: "route-management-token" } },
    }), "utf8");
    const ctx = createTracevaneContext({ config, logger: createLogger() });
    const initial = ctx.services.channelConnectors.getV3Config();
    const persisted = ctx.services.channelConnectors.saveV3Config(initial.config);
    const candidate = structuredClone(persisted.config);
    candidate.targets[0].name = "Planned route candidate";
    const planned = ctx.services.channelConnectors.planV3Config({
      config: candidate,
      expectedRevision: persisted.revision,
    });
    assert.ok(planned.planId);
    const paths = resolveChannelConnectorsPaths(config, root);
    const nativeBefore = fs.readFileSync(paths.nativeConfigPath, "utf8");
    const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });

    await withHttpServer(handler, async (baseUrl) => {
      for (const origin of ["https://evil.example", "null", "not an origin"]) {
        const blocked = await requestJson(`${baseUrl}/api/channel-connectors/daemon/service`, {
          method: "POST",
          headers: { origin },
          body: { action: "status", mode: "session", apply: true },
        });
        assert.equal(blocked.status, 403, origin);
      }

      for (const headers of [
        {},
        { origin: "http://127.0.0.1:5173" },
        {
          origin: "https://remote.example",
          authorization: "Bearer route-management-token",
        },
      ]) {
        const allowed = await requestJson(`${baseUrl}/api/channel-connectors/daemon/service`, {
          method: "POST",
          headers,
          body: { action: "status", mode: "session", apply: true },
        });
        assert.equal(allowed.status, 200, JSON.stringify(headers));
      }

      const blockedApply = await requestJson(`${baseUrl}/api/channel-connectors/config/v3/apply`, {
        method: "PUT",
        headers: { origin: "https://evil.example" },
        body: {
          planId: planned.planId,
          config: candidate,
          rollbackOnFailure: true,
        },
      });
      assert.equal(blockedApply.status, 403);

      const blockedAgentMutation = await requestJson(`${baseUrl}/api/channel-connectors/agent-sessions`, {
        method: "POST",
        headers: { origin: "https://evil.example" },
        body: { action: "reap-idle" },
      });
      assert.equal(blockedAgentMutation.status, 403);
    });

    assert.equal(fs.readFileSync(paths.nativeConfigPath, "utf8"), nativeBefore);
    assert.equal(fs.existsSync(paths.configPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("untrusted V3 apply performs zero manager config or reload side effects", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-apply-auth-"));
  try {
    const config = createConfig(root);
    let managerCalls = 0;
    let fetchCalls = 0;
    const service = createChannelConnectorsService(config, {
      homeDir: root,
      manager: {
        async manage(_definition, request) {
          managerCalls += 1;
          return managedResponse(request);
        },
        async dispose() {
          assert.fail("injected manager is caller-owned");
        },
      },
      fetchImpl: async () => {
        fetchCalls += 1;
        throw new Error("untrusted apply must not fetch");
      },
    });
    const initial = service.getV3Config();
    const persisted = service.saveV3Config(initial.config);
    const candidate = structuredClone(persisted.config);
    candidate.targets[0].name = "Unauthorized candidate";
    const planned = service.planV3Config({
      config: candidate,
      expectedRevision: persisted.revision,
    });
    const paths = resolveChannelConnectorsPaths(config, root);
    const nativeBefore = fs.readFileSync(paths.nativeConfigPath, "utf8");

    await assert.rejects(
      () => service.applyV3Config(
        { planId: planned.planId, config: candidate },
        managementRequest({ remoteAddress: "203.0.113.10" }),
      ),
      (error) => error?.statusCode === 403,
    );
    assert.equal(managerCalls, 0);
    assert.equal(fetchCalls, 0);
    assert.equal(fs.readFileSync(paths.nativeConfigPath, "utf8"), nativeBefore);
    assert.equal(fs.existsSync(paths.configPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("Channel reload posts once only for a running same-mode owner", async () => {
  for (const fixture of [
    { state: "running", apply: true, expectedFetches: 1, expectedOk: true },
    { state: "stopped", apply: true, expectedFetches: 0, expectedOk: false },
    { state: "unknown", apply: true, expectedFetches: 0, expectedOk: false },
    { state: "degraded", apply: true, expectedFetches: 0, expectedOk: false },
    { state: "failed", apply: true, expectedFetches: 0, expectedOk: false },
    { state: "running", apply: false, expectedFetches: 0, expectedOk: true },
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-reload-"));
    try {
      const config = createConfig(root);
      const managerCalls = [];
      const fetchCalls = [];
      const active = fixture.state === "running" ? true
        : fixture.state === "stopped" ? false
          : null;
      const manager = {
        async manage(_definition, request) {
          managerCalls.push(request);
          return managedResponse(request, {
            manager: managerStatus({
              mode: "persistent",
              supervisor: "scheduled-task",
              installed: true,
              active,
              state: fixture.state,
              errorCode: fixture.state === "failed" ? "runtime-not-ready" : null,
              errorMessage: fixture.state === "failed" ? "not ready" : null,
            }),
          });
        },
        async dispose() {
          assert.fail("injected manager is caller-owned");
        },
      };
      const service = createChannelConnectorsService(config, {
        homeDir: root,
        manager,
        managementEndpoint: "http://fixture.channel.invalid",
        managementToken: "server-only-management-secret",
        fetchImpl: async (url, init = {}) => {
          fetchCalls.push({ url: String(url), init });
          return new Response(JSON.stringify({
            ok: true,
            checkedAt: "2026-07-12T00:00:00.000Z",
            status: "applied",
            mode: "when-idle",
            activeRuns: 0,
            activeTurns: 0,
            configUpdatedAt: "2026-07-12T00:00:00.000Z",
            appliedAt: "2026-07-12T00:00:00.000Z",
            restartRequiredReason: null,
            error: null,
          }), { status: 200, headers: { "content-type": "application/json" } });
        },
      });
      const response = await service.manageDaemonService({
        action: "reload",
        mode: "persistent",
        apply: fixture.apply,
      });

      assert.deepEqual(managerCalls, [{
        action: "status",
        mode: "persistent",
        apply: fixture.apply,
      }], `${fixture.state}:${fixture.apply}`);
      assert.equal(fetchCalls.length, fixture.expectedFetches, `${fixture.state}:${fixture.apply}`);
      assert.equal(response.ok, fixture.expectedOk, `${fixture.state}:${fixture.apply}`);
      if (fetchCalls.length) {
        assert.equal(fetchCalls[0].url, "http://fixture.channel.invalid/reload");
        assert.equal(fetchCalls[0].init.method, "POST");
        assert.equal(
          fetchCalls[0].init.headers.authorization,
          "Bearer server-only-management-secret",
        );
      }
      if (!fixture.apply) {
        assert.equal(response.configWritten, false);
        assert.equal(response.applied, false);
        assert.equal(fs.existsSync(resolveChannelConnectorsPaths(config, root).configPath), false);
      }
      assert.doesNotMatch(response.plan.selectedTemplate.template, /server-only-management-secret/);
      assert.doesNotMatch(JSON.stringify(response.commandsRun), /server-only-management-secret/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("Channel agent-session proxy keeps the management token server-side", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-agent-token-"));
  try {
    const config = createConfig(root);
    const fetchCalls = [];
    const service = createChannelConnectorsService(config, {
      homeDir: root,
      managementEndpoint: "http://fixture.agent.invalid",
      managementToken: "agent-server-secret",
      manager: {
        async manage(_definition, request) {
          return managedResponse(request);
        },
        async dispose() {
          assert.fail("injected manager is caller-owned");
        },
      },
      fetchImpl: async (url, init = {}) => {
        fetchCalls.push({ url: String(url), init });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await service.getAgentSessions();
    await service.manageAgentSessions({ action: "reap-idle" });

    assert.equal(fetchCalls.length, 2);
    assert.equal(fetchCalls[0].init.method, "GET");
    assert.equal(fetchCalls[1].init.method, "POST");
    for (const call of fetchCalls) {
      assert.equal(call.init.headers.authorization, "Bearer agent-server-secret");
      assert.doesNotMatch(String(call.init.body || ""), /agent-server-secret/);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("persistent Channel status and start accept one stable native runtime pid", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-persistent-probe-"));
  try {
    const config = createConfig(root);
    ensureDaemonEntry(config);
    const commands = [];
    let probes = 0;
    const options = {
      homeDir: root,
      platform: "win32",
      windowsUserId: "TRACEVANE\\Fixture",
      managementEndpoint: "http://fixture.persistent.invalid",
      commandRunner: async (command) => {
        commands.push(command);
        if (command.kind === "windows-task-status") {
          return legacyCommandResult(command, {
            stdout: '{"state":4,"enabled":true}\n',
          });
        }
        return legacyCommandResult(command);
      },
      fetchImpl: async () => {
        probes += 1;
        return new Response(JSON.stringify({
          ok: true,
          implementation: "tracevane-native",
          pid: process.pid,
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    };
    const plan = createChannelConnectorsDaemonPlan(config, options);
    fs.mkdirSync(path.dirname(plan.selectedTemplate.servicePath), { recursive: true });
    fs.writeFileSync(
      plan.selectedTemplate.servicePath,
      plan.selectedTemplate.template,
      "utf8",
    );
    fs.mkdirSync(path.dirname(plan.runtimeFile), { recursive: true });
    fs.writeFileSync(
      plan.runtimeFile,
      `${JSON.stringify({ version: 1, pid: process.pid })}\n`,
      "utf8",
    );
    const service = createChannelConnectorsService(config, options);

    const status = await service.manageDaemonService({
      action: "status",
      mode: "persistent",
      apply: true,
    });
    const started = await service.manageDaemonService({
      action: "start",
      mode: "persistent",
      apply: true,
    });

    assert.equal(status.ok, true);
    assert.equal(status.manager.state, "running");
    assert.equal(status.manager.active, true);
    assert.equal(started.ok, true);
    assert.equal(started.manager.state, "running");
    assert.equal(probes, 4);
    assert.equal(commands.every((command) => command.kind === "windows-task-status"), true);
    assert.doesNotMatch(JSON.stringify(commands), /\/Run|\/End|\/Create/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("failed V3 reload restores native and private config through the fixture endpoint", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-rollback-"));
  try {
    const config = createConfig(root);
    const managerCalls = [];
    const fetchCalls = [];
    let reloadCalls = 0;
    const service = createChannelConnectorsService(config, {
      homeDir: root,
      managementEndpoint: "http://fixture.rollback.invalid",
      manager: {
        async manage(_definition, request) {
          managerCalls.push(request);
          return managedResponse(request, {
            manager: managerStatus({ active: true, state: "running" }),
          });
        },
        async dispose() {
          assert.fail("injected manager is caller-owned");
        },
      },
      fetchImpl: async (url) => {
        fetchCalls.push(String(url));
        if (String(url).endsWith("/status")) {
          return new Response(JSON.stringify({
            ok: true,
            implementation: "tracevane-native",
            pid: 9001,
            projects: 1,
            platformBindings: 0,
            octoConnections: [],
            feishuConnections: [],
            activeRuns: [],
            agentRuns: [],
            autoCompacts: [],
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        reloadCalls += 1;
        const ok = reloadCalls > 1;
        return new Response(JSON.stringify({
          ok,
          checkedAt: "2026-07-12T00:00:00.000Z",
          status: ok ? "applied" : "failed",
          mode: ok ? "immediate" : "when-idle",
          activeRuns: 0,
          activeTurns: 0,
          configUpdatedAt: null,
          appliedAt: ok ? "2026-07-12T00:00:00.000Z" : null,
          restartRequiredReason: null,
          error: ok ? null : "fixture reload failed",
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    });
    const initial = service.getV3Config();
    const persisted = service.saveV3Config(initial.config);
    const paths = resolveChannelConnectorsPaths(config, root);
    fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
    fs.writeFileSync(paths.configPath, service.getDaemonConfig().preview, "utf8");
    const nativeBefore = fs.readFileSync(paths.nativeConfigPath, "utf8");
    const privateBefore = fs.readFileSync(paths.configPath, "utf8");
    const candidate = structuredClone(persisted.config);
    candidate.targets[0].name = "Rollback candidate";
    const planned = service.planV3Config({
      config: candidate,
      expectedRevision: persisted.revision,
    });

    const result = await service.applyV3Config({
      planId: planned.planId,
      config: candidate,
      rollbackOnFailure: true,
    });

    assert.equal(result.ok, false);
    assert.equal(result.rolledBack, true);
    assert.equal(fs.readFileSync(paths.nativeConfigPath, "utf8"), nativeBefore);
    assert.equal(fs.readFileSync(paths.configPath, "utf8"), privateBefore);
    assert.deepEqual(managerCalls, [
      { action: "status", mode: "session", apply: true },
      { action: "status", mode: "session", apply: true },
      { action: "status", mode: "session", apply: true },
    ]);
    assert.deepEqual(fetchCalls, [
      "http://fixture.rollback.invalid/status",
      "http://fixture.rollback.invalid/reload",
      "http://fixture.rollback.invalid/reload",
    ]);
    assert.equal(fetchCalls.some((url) => url.includes("127.0.0.1:18797")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("V3 apply without mode keeps one discovered session or persistent owner", async () => {
  for (const ownerMode of ["session", "persistent"]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-owner-mode-"));
    try {
      const config = createConfig(root);
      const managerCalls = [];
      const fetchCalls = [];
      const service = createChannelConnectorsService(config, {
        homeDir: root,
        managementEndpoint: "http://fixture.owner.invalid",
        manager: {
          async manage(_definition, request) {
            managerCalls.push(request);
            const running = request.mode === ownerMode;
            return managedResponse(request, {
              manager: managerStatus({
                mode: request.mode,
                supervisor: request.mode === "session" ? "session" : "scheduled-task",
                installed: request.mode === "persistent",
                active: running,
                state: running ? "running" : "stopped",
              }),
            });
          },
          async dispose() {
            assert.fail("injected manager is caller-owned");
          },
        },
        fetchImpl: async (url) => {
          fetchCalls.push(String(url));
          if (String(url).endsWith("/status")) {
            return new Response(JSON.stringify({
              ok: true,
              implementation: "tracevane-native",
              pid: 9020,
              octoConnections: [],
              feishuConnections: [],
              activeRuns: [],
              agentRuns: [],
              autoCompacts: [],
            }), { status: 200, headers: { "content-type": "application/json" } });
          }
          return new Response(JSON.stringify({
            ok: true,
            checkedAt: "2026-07-12T00:00:00.000Z",
            status: "applied",
            mode: "when-idle",
            activeRuns: 0,
            activeTurns: 0,
            configUpdatedAt: null,
            appliedAt: "2026-07-12T00:00:00.000Z",
            restartRequiredReason: null,
            error: null,
          }), { status: 200, headers: { "content-type": "application/json" } });
        },
      });
      const initial = service.getV3Config();
      const persisted = service.saveV3Config(initial.config);
      const candidate = structuredClone(persisted.config);
      candidate.targets[0].name = `${ownerMode} owner candidate`;
      const planned = service.planV3Config({
        config: candidate,
        expectedRevision: persisted.revision,
      });

      const result = await service.applyV3Config({
        planId: planned.planId,
        config: candidate,
      });
      assert.equal(result.accepted, true, ownerMode);
      assert.equal(result.rolledBack, false, ownerMode);
      const expectedResolution = ownerMode === "session"
        ? ["session"]
        : ["session", "persistent"];
      assert.deepEqual(
        managerCalls.slice(0, -1).map((call) => call.mode),
        expectedResolution,
        ownerMode,
      );
      assert.equal(managerCalls.at(-1).mode, ownerMode);
      assert.deepEqual(fetchCalls, [
        "http://fixture.owner.invalid/status",
        "http://fixture.owner.invalid/reload",
      ]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test("V3 apply plan is consumed once before asynchronous owner discovery", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-plan-consume-"));
  let releaseOwner;
  const ownerGate = new Promise((resolve) => { releaseOwner = resolve; });
  try {
    const config = createConfig(root);
    let managerCalls = 0;
    const service = createChannelConnectorsService(config, {
      homeDir: root,
      managementEndpoint: "http://fixture.consume.invalid",
      manager: {
        async manage(_definition, request) {
          managerCalls += 1;
          if (managerCalls === 1) await ownerGate;
          return managedResponse(request, {
            manager: managerStatus({ active: true, state: "running" }),
          });
        },
        async dispose() {
          assert.fail("injected manager is caller-owned");
        },
      },
      fetchImpl: async (url) => new Response(JSON.stringify(
        String(url).endsWith("/status")
          ? {
              ok: true,
              implementation: "tracevane-native",
              pid: 9301,
              octoConnections: [],
              feishuConnections: [],
              activeRuns: [],
              agentRuns: [],
              autoCompacts: [],
            }
          : {
              ok: true,
              status: "applied",
              mode: "when-idle",
              activeRuns: 0,
              activeTurns: 0,
              error: null,
            },
      ), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const initial = service.getV3Config();
    const persisted = service.saveV3Config(initial.config);
    const candidate = structuredClone(persisted.config);
    candidate.targets[0].name = "Consume once candidate";
    const planned = service.planV3Config({
      config: candidate,
      expectedRevision: persisted.revision,
    });
    const payload = { planId: planned.planId, config: candidate };

    const first = service.applyV3Config(payload);
    while (managerCalls === 0) await new Promise((resolve) => setTimeout(resolve, 0));
    const second = service.applyV3Config(payload);
    const secondBeforeRelease = await Promise.race([
      second.then(
        () => ({ state: "fulfilled" }),
        (error) => ({ state: "rejected", error }),
      ),
      new Promise((resolve) => setTimeout(() => resolve({ state: "pending" }), 100)),
    ]);
    releaseOwner();
    const outcomes = await Promise.allSettled([first, second]);

    assert.equal(secondBeforeRelease.state, "rejected");
    assert.match(secondBeforeRelease.error.message, /missing or expired/);
    assert.equal(outcomes.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(outcomes.filter((item) => item.status === "rejected").length, 1);
  } finally {
    releaseOwner?.();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("V3 apply restores both configs when manager reload throws", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-throw-rollback-"));
  try {
    const config = createConfig(root);
    let managerCalls = 0;
    const service = createChannelConnectorsService(config, {
      homeDir: root,
      managementEndpoint: "http://fixture.throw.invalid",
      manager: {
        async manage(_definition, request) {
          managerCalls += 1;
          if (managerCalls === 2) throw new Error("fixture manager reload exploded");
          return managedResponse(request, {
            manager: managerStatus({ active: true, state: "running" }),
          });
        },
        async dispose() {
          assert.fail("injected manager is caller-owned");
        },
      },
      fetchImpl: async (url) => new Response(JSON.stringify(
        String(url).endsWith("/status")
          ? {
              ok: true,
              implementation: "tracevane-native",
              pid: 9401,
              octoConnections: [],
              feishuConnections: [],
              activeRuns: [],
              agentRuns: [],
              autoCompacts: [],
            }
          : {
              ok: true,
              status: "applied",
              mode: "immediate",
              activeRuns: 0,
              activeTurns: 0,
              error: null,
            },
      ), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const initial = service.getV3Config();
    const persisted = service.saveV3Config(initial.config);
    const paths = resolveChannelConnectorsPaths(config, root);
    fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
    fs.writeFileSync(paths.configPath, service.getDaemonConfig().preview, "utf8");
    const nativeBefore = fs.readFileSync(paths.nativeConfigPath, "utf8");
    const privateBefore = fs.readFileSync(paths.configPath, "utf8");
    const candidate = structuredClone(persisted.config);
    candidate.targets[0].name = "Throw rollback candidate";
    const planned = service.planV3Config({
      config: candidate,
      expectedRevision: persisted.revision,
    });

    const result = await service.applyV3Config({
      planId: planned.planId,
      config: candidate,
      rollbackOnFailure: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.rolledBack, true);
    assert.match(result.reload.error, /manager reload exploded/);
    assert.equal(result.rollbackReload?.ok, true);
    assert.equal(fs.readFileSync(paths.nativeConfigPath, "utf8"), nativeBefore);
    assert.equal(fs.readFileSync(paths.configPath, "utf8"), privateBefore);
    assert.deepEqual(managerCalls, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("private daemon config provisions management auth for a persistent child without leaking it", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-management-auth-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const secret = "task8-management-e2e-secret";
  const portLease = http.createServer();
  await new Promise((resolve, reject) => {
    portLease.once("error", reject);
    portLease.listen(0, "127.0.0.1", resolve);
  });
  const leasedAddress = portLease.address();
  assert.ok(leasedAddress && typeof leasedAddress === "object");
  const port = leasedAddress.port;
  await new Promise((resolve, reject) => {
    portLease.close((error) => error ? reject(error) : resolve());
  });

  const config = createConfig(root);
  ensureDaemonEntry(config);
  const manager = {
    async manage(_definition, request) {
      return managedResponse(request, {
        manager: managerStatus({ active: true, state: "running", pid: 8123 }),
      });
    },
    async dispose() {
      assert.fail("injected manager is caller-owned");
    },
  };
  const service = createChannelConnectorsService(config, {
    homeDir: root,
    managementEndpoint: `http://127.0.0.1:${port}`,
    managementToken: secret,
    manager,
  });
  const managed = await service.manageDaemonService({
    action: "start",
    mode: "persistent",
    apply: true,
  });
  const paths = resolveChannelConnectorsPaths(config, root);
  const childEnv = { ...process.env };
  delete childEnv.TRACEVANE_DAEMON_MANAGEMENT_TOKEN;
  const child = spawn(process.execPath, [daemonEntry, "--config", paths.configPath], {
    cwd: paths.rootDir,
    env: childEnv,
    stdio: ["ignore", "ignore", "pipe"],
    windowsHide: true,
  });
  let childStderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { childStderr += chunk; });
  const childExit = waitForChildExit(child);
  try {
    const endpoint = `http://127.0.0.1:${port}`;
    let publicStatus = null;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline && !publicStatus) {
      try {
        const response = await fetch(`${endpoint}/status`, {
          signal: AbortSignal.timeout(250),
        });
        if (response.ok) publicStatus = await response.json();
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    }
    assert.ok(publicStatus, childStderr || "daemon did not expose public status");
    assert.equal(publicStatus.implementation, "tracevane-native");
    assert.doesNotMatch(JSON.stringify(publicStatus), new RegExp(secret));

    for (const route of ["/reload", "/agent-sessions"]) {
      const response = await fetch(`${endpoint}${route}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(route === "/reload" ? { mode: "immediate" } : { action: "status" }),
      });
      assert.equal(response.status, 401, route);
      assert.doesNotMatch(await response.text(), new RegExp(secret));
    }

    for (const route of ["/reload", "/agent-sessions"]) {
      const response = await fetch(`${endpoint}${route}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${secret}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(route === "/reload" ? { mode: "immediate" } : { action: "status" }),
      });
      assert.equal(response.status, 200, route);
      assert.doesNotMatch(await response.text(), new RegExp(secret));
    }

    const privateRaw = fs.readFileSync(paths.configPath, "utf8");
    const privateConfig = JSON.parse(privateRaw);
    assert.equal(privateConfig.management.token, secret);
    if (process.platform !== "win32") {
      assert.equal(fs.statSync(paths.configPath).mode & 0o777, 0o600);
    }
    const publicConfig = service.getDaemonConfig();
    assert.ok(
      publicConfig.config.management.token === undefined
        || publicConfig.config.management.token === "[redacted]",
    );
    for (const evidence of [
      publicConfig,
      managed,
      managed.plan.selectedTemplate,
      managed.commandsRun,
      fs.readFileSync(paths.runtimeFile, "utf8"),
      fs.readFileSync(paths.logFile, "utf8"),
    ]) {
      assert.doesNotMatch(JSON.stringify(evidence), new RegExp(secret));
    }
  } finally {
    if (child.exitCode === null) child.kill("SIGTERM");
    await childExit;
  }
});

test("Channel daemon import is inert and config CLI parsing is strict", () => {
  const configPath = path.join(os.tmpdir(), "配置 路径", "channel config.json");
  const moduleUrl = pathToFileURL(daemonEntry).href;
  const script = [
    `const daemon = await import(${JSON.stringify(moduleUrl)});`,
    `const expected = ${JSON.stringify(path.resolve(configPath))};`,
    `if (daemon.parseChannelConnectorsDaemonConfigPath(["--config", ${JSON.stringify(configPath)}]) !== expected) process.exit(2);`,
    `if (daemon.parseChannelConnectorsDaemonConfigPath(["--config=${configPath.replaceAll("\\", "\\\\")}"]) !== expected) process.exit(3);`,
    `for (const argv of [[], ["--unknown"], ["--config"], ["--config", "a", "--config", "b"], ["--config=a", "extra"]]) {`,
    `  let failed = false; try { daemon.parseChannelConnectorsDaemonConfigPath(argv); } catch { failed = true; }`,
    `  if (!failed) process.exit(4);`,
    `}`,
    `process.stdout.write("imported-and-strict");`,
  ].join("\n");
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
    cwd: repoRoot,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout, "imported-and-strict");
});

test("Channel daemon runtime cleanup deletes matching PID and preserves mismatches", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-runtime-owner-"));
  try {
    const runtimePath = path.join(root, "runtime.json");
    const daemon = await import(pathToFileURL(daemonEntry).href);
    fs.writeFileSync(runtimePath, JSON.stringify({ pid: 1234, marker: "matching" }), "utf8");
    assert.equal(
      daemon.cleanupChannelConnectorsRuntimeMetadata(runtimePath, 1234),
      true,
    );
    assert.equal(fs.existsSync(runtimePath), false);

    const mismatched = `${JSON.stringify({ pid: 5678, marker: "preserve" })}\n`;
    fs.writeFileSync(runtimePath, mismatched, "utf8");
    assert.equal(
      daemon.cleanupChannelConnectorsRuntimeMetadata(runtimePath, 1234),
      false,
    );
    assert.equal(fs.readFileSync(runtimePath, "utf8"), mismatched);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("foreign status process cannot make an EADDRINUSE Channel session ready", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-channel-port-owner-"));
  const foreign = http.createServer((_req, res) => {
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({
      ok: true,
      implementation: "tracevane-native",
      pid: process.pid,
    }));
  });
  await new Promise((resolve, reject) => {
    foreign.once("error", reject);
    foreign.listen(0, "127.0.0.1", resolve);
  });
  const foreignAddress = foreign.address();
  assert.ok(foreignAddress && typeof foreignAddress === "object");
  const foreignEndpoint = `http://127.0.0.1:${foreignAddress.port}`;
  let service;
  try {
    const config = createConfig(root);
    config.projectRoot = repoRoot;
    service = createChannelConnectorsService(config, {
      homeDir: root,
      platform: "win32",
      managementEndpoint: foreignEndpoint,
    });
    const paths = resolveChannelConnectorsPaths(config, root);
    fs.mkdirSync(path.dirname(paths.configPath), { recursive: true });
    fs.writeFileSync(paths.configPath, service.getDaemonConfig().preview, "utf8");

    const directChild = spawn(process.execPath, [daemonEntry, "--config", paths.configPath], {
      cwd: paths.rootDir,
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let directStderr = "";
    directChild.stderr.setEncoding("utf8");
    directChild.stderr.on("data", (chunk) => { directStderr += chunk; });
    const directExit = await waitForChildExit(directChild);
    assert.notEqual(directExit.code, 0);
    assert.match(directStderr, /EADDRINUSE|address already in use/i);
    assert.equal(fs.existsSync(paths.runtimeFile), false);

    const managed = await service.manageDaemonService({
      action: "start",
      mode: "session",
      apply: true,
    });
    assert.equal(managed.ok, false);
    assert.notEqual(managed.manager.state, "running");
    assert.equal(managed.manager.active, null);
    assert.equal(managed.manager.errorCode, "runtime-not-ready");
    const afterFailure = await service.manageDaemonService({
      action: "status",
      mode: "session",
      apply: false,
    });
    assert.equal(afterFailure.manager.active, false);
    assert.equal(afterFailure.manager.state, "stopped");
    assert.equal(fs.existsSync(paths.runtimeFile), false);
  } finally {
    if (service) {
      await service.manageDaemonService({
        action: "stop",
        mode: "session",
        apply: true,
      }).catch(() => undefined);
    }
    await new Promise((resolve) => foreign.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
