import test from "node:test";
import assert from "node:assert/strict";
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

test("CC Bridge status keeps daemon and binding policy separate from Model Gateway", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    binaryResolver: () => null,
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const status = await service.getStatus();
  assert.equal(status.ok, true);
  assert.equal(status.phase, "f1-service-control");
  assert.equal(status.lifecycle.studioRuntimeDependency, false);
  assert.equal(status.lifecycle.openclawRuntimeDependency, false);
  assert.equal(status.lifecycle.modelRelayOwner, "studio-gateway-daemon");
  assert.equal(status.lifecycle.ccBridgeOwner, "cc-bridge-daemon");
  assert.equal(status.bindingPolicy.model, "platform-account-or-bot-to-agent");
  assert.equal(status.bindingPolicy.wechatPersonal.maxAgentsPerAccount, 1);
  assert.deepEqual(status.bindingPolicy.supportedAgents, ["codex", "claude-code", "opencode"]);
  assert.match(status.paths.root, /channel-connectors\/cc-bridge/);
});

test("CC Bridge config preview targets Studio Gateway and stays incomplete until platforms exist", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    binaryResolver: () => "/usr/local/bin/cc-connect",
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const preview = service.getCcBridgeConfig();
  assert.equal(preview.ready, false);
  assert.deepEqual(preview.missing, ["projects.platforms"]);
  assert.match(preview.preview, /base_url = "http:\/\/127\.0\.0\.1:18796\/v1"/);
  assert.match(preview.preview, /agent_types = \["codex", "claudecode", "opencode"\]/);
  assert.match(preview.preview, /provider_refs = \["studio-gateway"\]/);
  assert.match(preview.preview, /F2\/F3 will add one or more \[\[projects\.platforms\]\]/);
  assert.doesNotMatch(preview.preview, /codex-stack|CPA/);
});

test("CC Bridge service management is guarded before binary and platform config are ready", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    binaryResolver: () => null,
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const install = await service.manageCcBridgeService({
    action: "install",
    apply: true,
    runCommands: true,
  });
  assert.equal(install.ok, false);
  assert.equal(install.skippedReason, "cc_connect_binary_missing");
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
      binaryResolver: () => null,
      now: () => new Date("2026-06-06T08:00:00.000Z"),
    },
  });
  const handler = createStudioRequestHandler(ctx);

  await withServer(handler, async (baseUrl) => {
    const status = await requestJson(`${baseUrl}/api/channel-connectors/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.phase, "f1-service-control");

    const service = await requestJson(`${baseUrl}/api/channel-connectors/cc-bridge/service`);
    assert.equal(service.status, 200);
    assert.equal(service.body.plan.serviceName, "openclaw-studio-cc-bridge.service");

    const preview = await requestJson(`${baseUrl}/api/channel-connectors/cc-bridge/service`, {
      method: "POST",
      body: { action: "preview" },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.action, "preview");
    assert.match(preview.body.config.preview, /studio-gateway/);
  });
});
