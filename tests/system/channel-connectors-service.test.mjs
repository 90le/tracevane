import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import {
  createStudioContext,
  createStudioRequestHandler,
} from "../../dist/apps/api/index.js";
import {
  createChannelConnectorsService,
  resolveChannelConnectorsPaths,
} from "../../dist/apps/api/modules/channel-connectors/service.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-channel-connectors-"));
}

function createStudioConfig(root) {
  const openclawRoot = path.join(root, ".openclaw");
  fs.mkdirSync(openclawRoot, { recursive: true });
  return {
    pluginId: "studio",
    pluginName: "OpenClaw Studio",
    version: "0.1.0",
    port: 3760,
    autoStart: true,
    openclawRoot,
    openclawConfigFile: path.join(openclawRoot, "openclaw.json"),
    projectRoot: path.join(root, "studio"),
    webDistDir: path.join(root, "studio/apps/web-vue/dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: "/studio" },
    },
  };
}

function createLogger() {
  return {
    info() {},
    warn() {},
    error() {},
    debug() {},
  };
}

function requestJson(url, options = {}) {
  const body = options.body === undefined ? null : JSON.stringify(options.body);
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: options.method || "GET",
      headers: body ? {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      } : {},
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      assert.ok(address && typeof address === "object");
      const port = address.port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.once("error", reject);
  });
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  if (lastError) throw lastError;
  throw new Error("Timed out waiting for condition");
}

async function withServer(handler, task) {
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

test("native Channel Connectors status keeps daemon and binding policy separate from Model Gateway", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const status = await service.getStatus();
  assert.equal(status.ok, true);
  assert.equal(status.phase, "native-config-f2");
  assert.equal(status.implementation, "studio-native");
  assert.equal(status.lifecycle.studioRuntimeDependency, false);
  assert.equal(status.lifecycle.openclawRuntimeDependency, false);
  assert.equal(status.lifecycle.modelRelayOwner, "studio-gateway-daemon");
  assert.equal(status.lifecycle.channelDaemonOwner, "studio-native-channel-daemon");
  assert.equal(status.bindingPolicy.model, "platform-account-or-bot-to-agent");
  assert.equal(status.bindingPolicy.wechatPersonal.maxAgentsPerAccount, 1);
  assert.deepEqual(status.bindingPolicy.supportedAgents.slice(0, 3), ["codex", "claude-code", "opencode"]);
  assert.ok(status.bindingPolicy.supportedAgents.includes("gemini"));
  assert.ok(status.bindingPolicy.supportedPlatforms.includes("octo"));
  assert.ok(status.bindingPolicy.supportedPlatforms.includes("discord"));
  assert.match(status.paths.root, /channel-connectors\/daemon/);
  assert.match(status.paths.nativeConfig, /channel-connectors\/config\.json/);
  assert.match(status.referenceSources.join("\n"), /CC archived reference implementation/);
});

test("native Channel Connectors config preview targets Studio Gateway without cc-connect TOML", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const preview = service.getDaemonConfig();
  assert.equal(preview.ready, true);
  assert.deepEqual(preview.missing, []);
  assert.equal(preview.gatewayEndpoint, "http://127.0.0.1:18796/v1");
  assert.match(preview.nativeConfigPath, /channel-connectors\/config\.json/);
  assert.equal(preview.config.gateway.clientKeyRef, "studio-gateway-client-key");
  assert.equal(preview.config.projects[0].agent, "codex");
  assert.equal(preview.config.projects[0].permissionMode, "suggest");
  assert.equal(preview.config.projects[0].platformBindings.length, 0);
  assert.match(preview.preview, /"implementation"|"gateway"|"projects"/);
  assert.doesNotMatch(preview.preview, /cc-connect|codex-stack|CPA|\[\[projects\.platforms\]\]/);
});

test("native Channel Connectors store persists agent profiles and derives daemon runtime", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const initial = service.getNativeConfig();
  assert.equal(initial.config.agentProfiles[0].id, "default-codex");
  assert.ok(initial.supportedAgents.includes("claude-code"));
  assert.ok(initial.permissionModes.includes("full-auto"));

  const saved = service.saveNativeConfig({
    config: {
      ...initial.config,
      defaultAgentProfileId: "claude-main",
      agentProfiles: [
        {
          id: "claude-main",
          name: "Claude main",
          agent: "claude-code",
          model: "gpt-5",
          workDir: path.join(root, "workspace"),
          permissionMode: "auto-edit",
          gatewayEndpoint: "http://127.0.0.1:18796/v1",
          gatewayKeyRef: "studio-gateway-client-key",
          appProfileRef: "claude",
        },
      ],
      platformBindings: [
        {
          id: "octo-bot-a",
          platform: "octo",
          accountId: "octo-account",
          botId: "bot-a",
          displayName: "Octo Bot A",
          agentProfileId: "claude-main",
          enabled: true,
          allowlist: ["user-a", "user-b"],
          adminUsers: ["admin-a"],
        },
      ],
    },
  });

  assert.equal(saved.config.agentProfiles[0].agent, "claude-code");
  assert.equal(fs.existsSync(saved.configPath), true);

  const preview = service.getDaemonConfig();
  assert.equal(preview.config.projects[0].id, "claude-main");
  assert.equal(preview.config.projects[0].agent, "claude-code");
  assert.equal(preview.config.projects[0].model, "gpt-5");
  assert.equal(preview.config.projects[0].permissionMode, "auto-edit");
  assert.equal(preview.config.projects[0].platformBindings[0].platform, "octo");
  assert.equal(preview.config.projects[0].platformBindings[0].agent, "claude-code");
  assert.deepEqual(preview.config.projects[0].platformBindings[0].allowlist, ["user-a", "user-b"]);
});

test("native Channel Connectors store rejects duplicate personal WeChat agent bindings", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const initial = service.getNativeConfig().config;

  assert.throws(() => service.saveNativeConfig({
    config: {
      ...initial,
      agentProfiles: [
        {
          id: "codex-main",
          name: "Codex main",
          agent: "codex",
          model: null,
          workDir: config.projectRoot,
          permissionMode: "suggest",
          gatewayEndpoint: "http://127.0.0.1:18796/v1",
          gatewayKeyRef: "studio-gateway-client-key",
          appProfileRef: "codex",
        },
        {
          id: "claude-main",
          name: "Claude main",
          agent: "claude-code",
          model: null,
          workDir: config.projectRoot,
          permissionMode: "suggest",
          gatewayEndpoint: "http://127.0.0.1:18796/v1",
          gatewayKeyRef: "studio-gateway-client-key",
          appProfileRef: "claude",
        },
      ],
      platformBindings: [
        {
          id: "wechat-a",
          platform: "wechat",
          accountId: "wx-account",
          botId: null,
          displayName: "WeChat A",
          agentProfileId: "codex-main",
          enabled: true,
          allowlist: [],
          adminUsers: [],
        },
        {
          id: "wechat-b",
          platform: "wechat",
          accountId: "wx-account",
          botId: null,
          displayName: "WeChat B",
          agentProfileId: "claude-main",
          enabled: true,
          allowlist: [],
          adminUsers: [],
        },
      ],
    },
  }), /Personal WeChat account wx-account can bind only one agent profile/);
});

test("native Channel Connectors service management is guarded before daemon entry is built", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const install = await service.manageDaemonService({
    action: "install",
    apply: true,
    runCommands: true,
  });
  assert.equal(install.ok, false);
  assert.equal(install.skippedReason, "native_daemon_entry_missing");
  assert.equal(install.commandsRun.length, 0);
  assert.equal(install.installed, false);

  const paths = resolveChannelConnectorsPaths(config);
  assert.equal(fs.existsSync(paths.configPath), false);
});

test("Channel Connectors routes are registered under /api/channel-connectors", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({
    config,
    logger: createLogger(),
    channelConnectorsOptions: {
      now: () => new Date("2026-06-06T08:00:00.000Z"),
    },
  });
  const handler = createStudioRequestHandler(ctx);

  await withServer(handler, async (baseUrl) => {
    const status = await requestJson(`${baseUrl}/api/channel-connectors/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.phase, "native-config-f2");
    assert.equal(status.body.implementation, "studio-native");

    const configStore = await requestJson(`${baseUrl}/api/channel-connectors/config`);
    assert.equal(configStore.status, 200);
    assert.equal(configStore.body.config.defaultAgentProfileId, "default-codex");

    const savedConfig = await requestJson(`${baseUrl}/api/channel-connectors/config`, {
      method: "PUT",
      body: {
        config: {
          ...configStore.body.config,
          agentProfiles: [
            {
              ...configStore.body.config.agentProfiles[0],
              id: "opencode-main",
              name: "OpenCode main",
              agent: "opencode",
              model: "gpt-5",
            },
          ],
          defaultAgentProfileId: "opencode-main",
        },
      },
    });
    assert.equal(savedConfig.status, 200);
    assert.equal(savedConfig.body.config.agentProfiles[0].agent, "opencode");

    const service = await requestJson(`${baseUrl}/api/channel-connectors/daemon/service`);
    assert.equal(service.status, 200);
    assert.equal(service.body.plan.serviceName, "openclaw-studio-channel-connectors.service");

    const preview = await requestJson(`${baseUrl}/api/channel-connectors/daemon/service`, {
      method: "POST",
      body: { action: "preview" },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.action, "preview");
    assert.match(preview.body.config.preview, /studio-gateway-client-key/);
  });
});

test("native Channel Connectors daemon entry exposes health and writes runtime", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const runtimeConfig = service.getDaemonConfig().config;
  runtimeConfig.management.port = await findFreePort();
  const configPath = path.join(root, "daemon-config.json");
  fs.mkdirSync(path.dirname(runtimeConfig.paths.log), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2), "utf8");

  const daemonEntry = path.resolve("dist/apps/api/modules/channel-connectors/daemon.js");
  const child = spawn(process.execPath, [daemonEntry, "--config", configPath], {
    cwd: path.resolve("."),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  try {
    const health = await waitFor(async () => {
      const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/health`);
      return response.status === 200 ? response.body : null;
    });
    assert.equal(health.ok, true);
    assert.equal(fs.existsSync(runtimeConfig.paths.runtime), true);
    assert.equal(fs.existsSync(runtimeConfig.paths.log), true);
    assert.match(fs.readFileSync(runtimeConfig.paths.log, "utf8"), /Studio native Channel Connectors daemon started/);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => {
      child.once("exit", resolve);
      setTimeout(resolve, 1000);
    });
  }

  assert.equal(stderr.trim(), "");
});
