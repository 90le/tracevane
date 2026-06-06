import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { WebSocketServer } from "ws";

import {
  createStudioContext,
  createStudioRequestHandler,
} from "../../dist/apps/api/index.js";
import {
  createChannelConnectorsService,
  resolveChannelConnectorsPaths,
} from "../../dist/apps/api/modules/channel-connectors/service.js";
import {
  buildChannelConnectorAgentProcessRequest,
  defaultChannelConnectorAgentProcessRunner,
  runChannelConnectorAgentTurn,
} from "../../dist/apps/api/modules/channel-connectors/agent-runner.js";
import {
  clearChannelConnectorAgentSessionsForConversation,
  getChannelConnectorAgentSession,
  upsertChannelConnectorAgentSession,
} from "../../dist/apps/api/modules/channel-connectors/agent-session-store.js";
import {
  buildChannelConnectorCommandSurface,
  extractChannelConnectorCommandFromActionValue,
  extractChannelConnectorSurfaceActionPayload,
  renderChannelConnectorCommandSurfaceFeishu,
} from "../../dist/apps/api/modules/channel-connectors/command-surface.js";
import {
  buildFeishuSessionKey,
  parseChannelConnectorFeishuWebhook,
} from "../../dist/apps/api/modules/channel-connectors/feishu-adapter.js";
import {
  addFeishuMessageReaction,
  removeFeishuMessageReaction,
  sendFeishuTextMessage,
} from "../../dist/apps/api/modules/channel-connectors/feishu-transport.js";
import {
  splitChannelConnectorTextChunks,
} from "../../dist/apps/api/modules/channel-connectors/text-chunks.js";
import {
  channelConnectorGatewaySecretCandidates,
  resolveChannelConnectorGatewayClientKey,
} from "../../dist/apps/api/modules/channel-connectors/gateway-secret.js";
import {
  handleChannelConnectorCommand,
  listChannelConnectorGatewayModels,
  resolveChannelConnectorEffectiveProject,
} from "../../dist/apps/api/modules/channel-connectors/command-router.js";
import {
  getChannelConnectorSessionControl,
} from "../../dist/apps/api/modules/channel-connectors/session-control-store.js";
import {
  createOctoX25519KeyPair,
  decodeOctoConnectPacket,
  encodeOctoConnackPacket,
} from "../../dist/apps/api/modules/channel-connectors/octo-wukong.js";

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

async function withMockGatewayModelsServer(task) {
  const requests = [];
  const server = http.createServer((req, res) => {
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization || null,
    });
    res.setHeader("content-type", "application/json");
    if (req.url === "/v1/models") {
      res.end(JSON.stringify({
        object: "list",
        data: [
          { id: "gateway-gpt-5", object: "model" },
          { id: "gateway-glm-5", object: "model" },
          { id: "gateway-gpt-5", object: "model" },
        ],
      }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not_found" }));
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await task({
      baseUrl: `http://127.0.0.1:${address.port}`,
      requests,
    });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function withMockOctoServer(task) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("end", () => {
      const bodyRaw = Buffer.concat(chunks).toString("utf8");
      const body = bodyRaw ? JSON.parse(bodyRaw) : {};
      requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization,
        body,
      });
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-1", im_token: "im-token-1", ws_url: "wss://octo.example/ws" }));
        return;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/sendMessage") {
        res.end(JSON.stringify({ ok: true, message_id: 123 }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: "not_found" }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await task(`http://127.0.0.1:${address.port}`, requests);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

async function withMockFeishuServer(task) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("end", () => {
      const bodyRaw = Buffer.concat(chunks).toString("utf8");
      const body = bodyRaw ? JSON.parse(bodyRaw) : {};
      requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization,
        body,
      });
      res.setHeader("content-type", "application/json");
      if (req.url === "/open-apis/auth/v3/tenant_access_token/internal") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          tenant_access_token: "tenant-token-1",
          expire: 7200,
        }));
        return;
      }
      if (req.url === "/open-apis/im/v1/messages?receive_id_type=chat_id" && req.method === "POST") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { message_id: "om_sent_1" },
        }));
        return;
      }
      if (req.url?.startsWith("/open-apis/im/v1/messages/") && req.method === "PATCH") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { message_id: req.url.split("/").pop() },
        }));
        return;
      }
      if (/^\/open-apis\/im\/v1\/messages\/[^/]+\/reactions$/.test(req.url || "") && req.method === "POST") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { reaction_id: "reaction-1" },
        }));
        return;
      }
      if (/^\/open-apis\/im\/v1\/messages\/[^/]+\/reactions\/[^/]+$/.test(req.url || "") && req.method === "DELETE") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: {},
        }));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 404, msg: "not_found" }));
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  try {
    await task(`http://127.0.0.1:${address.port}`, requests);
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
  assert.match(status.paths.root, /\.config\/openclaw-studio\/channel-connectors\/daemon/);
  assert.equal(status.paths.root.startsWith(config.openclawRoot), false);
  assert.match(status.paths.nativeConfig, /channel-connectors\/config\.json/);
  assert.equal(status.paths.nativeConfig.startsWith(config.openclawRoot), false);
  assert.match(status.service.plan.selectedTemplate.template, /^WorkingDirectory=\/.+channel-connectors\/daemon$/m);
  assert.doesNotMatch(status.service.plan.selectedTemplate.template, /^WorkingDirectory="/m);
  assert.match(status.referenceSources.join("\n"), /CC archived reference implementation/);
});

test("native Channel Connectors text chunking follows CC UTF-8 safe boundaries", () => {
  assert.deepEqual(splitChannelConnectorTextChunks("hello", 10), ["hello"]);
  assert.deepEqual(splitChannelConnectorTextChunks("你好世界测试一二三四", 5), ["你好世界测", "试一二三四"]);
  assert.deepEqual(splitChannelConnectorTextChunks("😀😁😂🤣😄😅", 3), ["😀😁😂", "🤣😄😅"]);
  assert.deepEqual(splitChannelConnectorTextChunks("abcde\nfghij", 8), ["abcde\n", "fghij"]);
  assert.deepEqual(splitChannelConnectorTextChunks("你好\n世界测试一二三四", 5)[0], "你好\n");
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
  assert.match(preview.nativeConfigPath, /\.config\/openclaw-studio\/channel-connectors\/config\.json/);
  assert.equal(preview.nativeConfigPath.startsWith(config.openclawRoot), false);
  assert.equal(preview.config.gateway.clientKeyRef, "studio-gateway-client-key");
  assert.equal(preview.config.projects[0].agent, "codex");
  assert.equal(preview.config.projects[0].permissionMode, "suggest");
  assert.equal(preview.config.projects[0].platformBindings.length, 0);
  assert.match(preview.preview, /"implementation"|"gateway"|"projects"/);
  assert.doesNotMatch(preview.preview, /cc-connect|codex-stack|CPA|\[\[projects\.platforms\]\]/);
});

test("native Channel Connectors resolves Studio Gateway client key from OpenClaw studio secrets", () => {
  const root = makeTempRoot();
  const oldHome = process.env.HOME;
  const oldStudioGatewayKey = process.env.STUDIO_GATEWAY_API_KEY;
  const oldOpenClawGatewayKey = process.env.OPENCLAW_STUDIO_GATEWAY_API_KEY;
  try {
    process.env.HOME = root;
    delete process.env.STUDIO_GATEWAY_API_KEY;
    delete process.env.OPENCLAW_STUDIO_GATEWAY_API_KEY;
    const runtimeConfig = {
      paths: {
        root: path.join(root, ".config", "openclaw-studio", "channel-connectors", "daemon"),
      },
    };
    const secretPath = path.join(root, ".openclaw", "studio", "model-gateway", "secrets.json");
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, JSON.stringify({
      secrets: {
        "gateway:client-api-key": { value: "sk-channel-gateway-test" },
      },
    }));
    assert.ok(channelConnectorGatewaySecretCandidates(runtimeConfig).includes(secretPath));
    assert.equal(resolveChannelConnectorGatewayClientKey(runtimeConfig), "sk-channel-gateway-test");
  } finally {
    if (oldHome === undefined) delete process.env.HOME;
    else process.env.HOME = oldHome;
    if (oldStudioGatewayKey === undefined) delete process.env.STUDIO_GATEWAY_API_KEY;
    else process.env.STUDIO_GATEWAY_API_KEY = oldStudioGatewayKey;
    if (oldOpenClawGatewayKey === undefined) delete process.env.OPENCLAW_STUDIO_GATEWAY_API_KEY;
    else process.env.OPENCLAW_STUDIO_GATEWAY_API_KEY = oldOpenClawGatewayKey;
  }
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
          metadata: {
            apiUrl: "https://im.example.test/api",
            botToken: "test-token",
          },
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
  assert.equal(saved.config.platformBindings[0].metadata.botToken, "test-token");
  assert.equal(preview.config.projects[0].platformBindings[0].metadata.botToken, "[redacted]");
  assert.match(preview.preview, /"botToken": "\[redacted\]"/);
  assert.doesNotMatch(preview.preview, /test-token/);
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

test("Octo adapter dry-run dispatch resolves binding, session key, and reply plan", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const initial = service.getNativeConfig().config;
  service.saveNativeConfig({
    config: {
      ...initial,
      agentProfiles: [
        {
          id: "codex-main",
          name: "Codex main",
          agent: "codex",
          model: "gpt-5",
          workDir: config.projectRoot,
          permissionMode: "suggest",
          gatewayEndpoint: "http://127.0.0.1:18796/v1",
          gatewayKeyRef: "studio-gateway-client-key",
          appProfileRef: "codex",
        },
      ],
      defaultAgentProfileId: "codex-main",
      platformBindings: [
        {
          id: "octo-default",
          platform: "octo",
          accountId: "octo-account",
          botId: "octo-bot",
          displayName: "Octo Bot",
          agentProfileId: "codex-main",
          enabled: true,
          allowlist: ["user-1"],
          adminUsers: ["admin-1"],
        },
      ],
    },
  });

  const result = await service.dispatchOctoIncoming({
    bindingId: "octo-default",
    dryRun: true,
    replyText: "收到\n\nmodel · effort · 剩余 80%",
    message: {
      messageId: "m-1",
      fromUid: "user-1",
      channelId: "user-1",
      channelType: 1,
      payload: {
        type: 1,
        content: "hi",
      },
    },
  });

  assert.equal(result.accepted, true);
  assert.equal(result.skippedReason, null);
  assert.equal(result.sessionKey, "dmwork:dm:user-1");
  assert.equal(result.incoming.content, "hi");
  assert.equal(result.agentDispatch.status, "dry-run");
  assert.equal(result.agentDispatch.agent, "codex");
  assert.equal(result.agentDispatch.model, "gpt-5");
  assert.equal(result.replyPlan.channelId, "user-1");
  assert.deepEqual(result.replyPlan.chunks, ["收到"]);
  assert.equal(result.eventStored.written, true);
  assert.equal(fs.existsSync(result.eventStored.path), true);
  assert.match(fs.readFileSync(result.eventStored.path, "utf8"), /"sessionKey":"dmwork:dm:user-1"/);
});

test("Octo adapter follows group direction and mention rendering rules", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const initial = service.getNativeConfig().config;
  service.saveNativeConfig({
    config: {
      ...initial,
      agentProfiles: [
        {
          id: "claude-main",
          name: "Claude main",
          agent: "claude-code",
          model: "gpt-5",
          workDir: config.projectRoot,
          permissionMode: "auto-edit",
          gatewayEndpoint: "http://127.0.0.1:18796/v1",
          gatewayKeyRef: "studio-gateway-client-key",
          appProfileRef: "claude",
        },
      ],
      defaultAgentProfileId: "claude-main",
      platformBindings: [
        {
          id: "octo-group",
          platform: "octo",
          accountId: "octo-account",
          botId: "robot-1",
          displayName: "Octo Group Bot",
          agentProfileId: "claude-main",
          enabled: true,
          allowlist: [],
          adminUsers: [],
        },
      ],
    },
  });

  const ignored = await service.dispatchOctoIncoming({
    bindingId: "octo-group",
    dryRun: true,
    message: {
      messageId: "g-ignored",
      fromUid: "user-2",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "not for the bot",
      },
    },
  });
  assert.equal(ignored.accepted, false);
  assert.equal(ignored.skippedReason, "octo_group_message_not_directed");
  assert.equal(ignored.sessionKey, "dmwork:group:group-a");

  const directed = await service.dispatchOctoIncoming({
    bindingId: "octo-group",
    dryRun: true,
    replyText: "@Alice 已处理",
    message: {
      messageId: "g-1",
      fromUid: "user-2",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "@OctoBot status",
        mention: { uids: ["robot-1"] },
      },
      members: [
        { uid: "user-3", name: "Alice" },
        { uid: "robot-1", name: "OctoBot" },
      ],
    },
  });

  assert.equal(directed.accepted, true);
  assert.equal(directed.sessionKey, "dmwork:group:group-a");
  assert.equal(directed.incoming.content, "status");
  assert.deepEqual(directed.replyPlan.mentionUids, ["user-3"]);
  assert.deepEqual(directed.replyPlan.chunks, ["已处理"]);
  assert.deepEqual(directed.replyPlan.payloads[0].payload.mention.uids, ["user-3"]);
});

test("Octo transport smoke registers bot through binding metadata", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const config = createStudioConfig(root);
    const service = createChannelConnectorsService(config, {
      now: () => new Date("2026-06-06T08:00:00.000Z"),
    });
    const initial = service.getNativeConfig().config;
    service.saveNativeConfig({
      config: {
        ...initial,
        platformBindings: [
          {
            id: "octo-transport",
            platform: "octo",
            accountId: "octo-account",
            botId: "robot-1",
            displayName: "Octo Transport",
            agentProfileId: initial.defaultAgentProfileId,
            enabled: true,
            allowlist: [],
            adminUsers: [],
            metadata: {
              apiUrl,
              botToken: "test-token",
            },
          },
        ],
      },
    });

    const result = await service.runOctoTransportSmoke({
      bindingId: "octo-transport",
      action: "register",
    });

    assert.equal(result.transport.ok, true);
    assert.equal(result.transport.action, "register");
    assert.equal(result.transport.robotId, "robot-1");
    assert.equal(result.transport.imToken, "im-token-1");
    assert.equal(result.transport.wsUrl, "wss://octo.example/ws");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, "/v1/bot/register");
    assert.equal(requests[0].authorization, "Bearer test-token");
  });
});

test("Octo incoming can send rendered reply through REST transport when opted in", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const config = createStudioConfig(root);
    const service = createChannelConnectorsService(config, {
      now: () => new Date("2026-06-06T08:00:00.000Z"),
    });
    const initial = service.getNativeConfig().config;
    service.saveNativeConfig({
      config: {
        ...initial,
        agentProfiles: [
          {
            id: "codex-main",
            name: "Codex main",
            agent: "codex",
            model: "gpt-5",
            workDir: config.projectRoot,
            permissionMode: "suggest",
            gatewayEndpoint: "http://127.0.0.1:18796/v1",
            gatewayKeyRef: "studio-gateway-client-key",
            appProfileRef: "codex",
          },
        ],
        defaultAgentProfileId: "codex-main",
        platformBindings: [
          {
            id: "octo-send",
            platform: "octo",
            accountId: "octo-account",
            botId: "robot-1",
            displayName: "Octo Send",
            agentProfileId: "codex-main",
            enabled: true,
            allowlist: [],
            adminUsers: [],
            metadata: {
              apiUrl,
              botToken: "test-token",
            },
          },
        ],
      },
    });

    const result = await service.dispatchOctoIncoming({
      bindingId: "octo-send",
      sendReply: true,
      replyText: "@Alice 完成",
      message: {
        messageId: "m-send-1",
        fromUid: "user-2",
        channelId: "group-a",
        channelType: 2,
        payload: {
          type: 1,
          content: "@OctoBot run",
          mention: { uids: ["robot-1"] },
        },
        members: [
          { uid: "user-3", name: "Alice" },
          { uid: "robot-1", name: "OctoBot" },
        ],
      },
    });

    assert.equal(result.accepted, true);
    assert.equal(result.skippedReason, null);
    assert.equal(result.agentDispatch.status, "not-ready");
    assert.equal(result.transport.ok, true);
    assert.equal(result.transport.action, "send-message");
    assert.equal(result.transport.requestCount, 1);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, "/v1/bot/sendMessage");
    assert.equal(requests[0].authorization, "Bearer test-token");
    assert.deepEqual(requests[0].body, {
      channel_id: "group-a",
      channel_type: 2,
      payload: {
        type: 1,
        content: "完成",
        mention: {
          uids: ["user-3"],
        },
      },
    });
  });
});

test("native Channel Connectors agent runner builds gateway-backed Codex turns", async () => {
  const root = makeTempRoot();
  const workDir = path.join(root, "work");
  const project = {
    id: "codex-main",
    name: "Codex main",
    workDir,
    agent: "codex",
    model: "gpt-5",
    permissionMode: "auto-edit",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "codex",
    platformBindings: [],
  };
  const binding = {
    id: "octo-codex",
    platform: "octo",
    accountId: "octo-account",
    botId: "robot-1",
    displayName: "Octo Codex",
    agent: "codex",
    enabled: true,
    allowlist: [],
    adminUsers: [],
    metadata: {},
  };
  const message = {
    messageId: "m-runner-1",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: { type: 1, content: "hi codex" },
  };

  const processRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(processRequest);
  assert.equal(processRequest.command, "codex");
  assert.equal(processRequest.agent, "codex");
  assert.deepEqual(processRequest.args.slice(0, 4), ["exec", "--skip-git-repo-check", "--full-auto", "--model"]);
  assert.equal(processRequest.args.includes("--json"), true);
  assert.equal(processRequest.args.includes("--cd"), true);
  assert.equal(processRequest.args.at(-1), "-");
  assert.equal(processRequest.cwd, workDir);
  assert.equal(processRequest.stdin, "hi codex");
  assert.equal(processRequest.env.OPENAI_API_KEY, "sk-local");
  assert.equal(processRequest.env.OPENAI_BASE_URL, project.gatewayEndpoint);
  assert.ok(processRequest.env.CODEX_HOME);
  assert.match(processRequest.env.PATH, /\.npm-global\/bin/);
  assert.match(processRequest.env.PATH, /\.local\/bin/);
  assert.equal(processRequest.sessionMode, "new");
  assert.equal(processRequest.codexThreadId, null);
  assert.ok(!processRequest.args.join("\n").includes("sk-local"));
  const codexConfigPath = path.join(processRequest.env.CODEX_HOME, "config.toml");
  assert.equal(fs.existsSync(codexConfigPath), true);
  const codexConfig = fs.readFileSync(codexConfigPath, "utf8");
  assert.match(codexConfig, /model_provider = "studio_gateway"/);
  assert.match(codexConfig, /experimental_bearer_token = "sk-local"/);
  assert.equal(fs.statSync(codexConfigPath).mode & 0o777, 0o600);
  for (const cleanupPath of processRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const missingKeyRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: null,
  });
  assert.ok(missingKeyRequest);
  assert.ok(missingKeyRequest.env.CODEX_HOME);
  const missingKeyConfig = fs.readFileSync(path.join(missingKeyRequest.env.CODEX_HOME, "config.toml"), "utf8");
  assert.match(missingKeyConfig, /\[model_providers\.studio_gateway\]/);
  assert.doesNotMatch(missingKeyConfig, /experimental_bearer_token/);
  for (const cleanupPath of missingKeyRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const missingKeyResult = await runChannelConnectorAgentTurn({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: null,
  });
  assert.equal(missingKeyResult.status, "failed");
  assert.equal(missingKeyResult.attempted, false);
  assert.match(missingKeyResult.error, /Gateway client key is missing/);
  assert.doesNotMatch(missingKeyResult.error, /provider/i);

  const agentRuntimeDir = path.join(root, "state", "agent-runtime", "codex-main");
  const resumeRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    agentRuntimeDir,
    session: { codexThreadId: "019e9b49-0b62-7132-845a-f19aba1484b7" },
  });
  assert.ok(resumeRequest);
  assert.deepEqual(resumeRequest.args.slice(0, 2), ["exec", "resume"]);
  assert.equal(resumeRequest.args.includes("--cd"), false);
  assert.equal(resumeRequest.args.at(-3), "019e9b49-0b62-7132-845a-f19aba1484b7");
  assert.equal(resumeRequest.args.at(-2), "--json");
  assert.equal(resumeRequest.args.at(-1), "-");
  assert.equal(resumeRequest.sessionMode, "resume");
  assert.equal(resumeRequest.codexThreadId, "019e9b49-0b62-7132-845a-f19aba1484b7");
  assert.equal(resumeRequest.cleanupPaths?.length || 0, 0);
  assert.equal(resumeRequest.env.CODEX_HOME, path.join(agentRuntimeDir, "codex-home"));
  assert.equal(fs.existsSync(path.join(resumeRequest.env.CODEX_HOME, "config.toml")), true);

  let turnCleanupPath = null;
  const result = await runChannelConnectorAgentTurn({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async (request) => {
      assert.equal(request.command, "codex");
      assert.equal(request.stdin, "hi codex");
      assert.ok(request.env.CODEX_HOME);
      turnCleanupPath = request.cleanupPaths?.[0] || null;
      assert.equal(fs.existsSync(path.join(request.env.CODEX_HOME, "config.toml")), true);
      return {
        exitCode: 0,
        signal: null,
        stdout: [
          '{"type":"thread.started","thread_id":"019e9b45-8ab3-7f41-99a0-a9e7d0f2abf5"}',
          '{"type":"item.completed","item":{"type":"agent_message","text":"hello from codex"}}',
          "",
        ].join("\n"),
        stderr: "",
        durationMs: 12,
        timedOut: false,
        error: null,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "completed");
  assert.equal(result.replyText, "hello from codex");
  assert.equal(result.progress.eventCount, 2);
  assert.equal(result.progress.latest?.type, "assistant");
  assert.equal(result.progress.latest?.text, "hello from codex");
  assert.equal(result.progress.summary, "hello from codex");
  assert.equal(result.session.resumed, false);
  assert.equal(result.session.codexThreadId, "019e9b45-8ab3-7f41-99a0-a9e7d0f2abf5");
  assert.ok(turnCleanupPath);
  assert.equal(fs.existsSync(turnCleanupPath), false);

  const claudeRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "claude-code", permissionMode: "plan" },
    binding: { ...binding, agent: "claude-code" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(claudeRequest);
  assert.equal(claudeRequest.command, "claude");
  assert.equal(claudeRequest.agent, "claude-code");
  assert.equal(claudeRequest.args.includes("--input-format"), true);
  assert.equal(claudeRequest.args.includes("stream-json"), true);
  assert.equal(claudeRequest.args.includes("--permission-mode"), true);
  assert.equal(claudeRequest.args.includes("plan"), true);
  assert.match(claudeRequest.stdin, /"content":"hi codex"/);
  assert.equal(claudeRequest.env.ANTHROPIC_API_KEY, "sk-local");
  assert.equal(claudeRequest.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:18796");

  const opencodeRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", permissionMode: "yolo" },
    binding: { ...binding, agent: "opencode" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(opencodeRequest);
  assert.equal(opencodeRequest.command, "opencode");
  assert.equal(opencodeRequest.agent, "opencode");
  assert.deepEqual(opencodeRequest.args.slice(0, 3), ["run", "--format", "json"]);
  assert.equal(opencodeRequest.args.includes("--thinking"), true);
  assert.equal(opencodeRequest.args.at(-1), "hi codex");

  const attachmentRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message: {
      ...message,
      messageId: "m-runner-image",
      payload: { type: 2, content: "", name: "diagram.png", url: "https://example.invalid/diagram.png" },
      attachments: [{
        kind: "image",
        platform: "feishu",
        key: "feishu-private-image-key",
        imageKey: "feishu-private-image-key",
        fileName: "diagram.png",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(attachmentRequest);
  assert.match(attachmentRequest.stdin, /\[image\]/);
  assert.match(attachmentRequest.stdin, /Studio attachment summary/);
  assert.match(attachmentRequest.stdin, /image: diagram\.png/);
  assert.doesNotMatch(attachmentRequest.stdin, /feishu-private-image-key/);
  for (const cleanupPath of attachmentRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const failed = await runChannelConnectorAgentTurn({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async () => ({
      exitCode: 1,
      signal: null,
      stdout: '{"type":"turn.failed","error":{"message":"tool denied"}}\n',
      stderr: "permission denied",
      durationMs: 22,
      timedOut: false,
      error: null,
    }),
  });
  assert.equal(failed.ok, false);
  assert.equal(failed.status, "failed");
  assert.equal(failed.replyText, null);
  assert.equal(failed.progress.eventCount, 1);
  assert.equal(failed.progress.latest?.type, "failed");
  assert.equal(failed.progress.latest?.text, "tool denied");
  assert.equal(failed.progress.summary, "tool denied");

  const failedWithoutStderr = await runChannelConnectorAgentTurn({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async () => ({
      exitCode: 1,
      signal: null,
      stdout: [
        '{"type":"error","message":"unexpected status 503 Service Unavailable: No enabled Model Gateway provider offers model gpt-5.5"}',
        '{"type":"turn.failed","error":{"message":"No enabled Model Gateway provider offers model gpt-5.5"}}',
        "",
      ].join("\n"),
      stderr: "",
      durationMs: 22,
      timedOut: false,
      error: null,
    }),
  });
  assert.equal(failedWithoutStderr.ok, false);
  assert.match(failedWithoutStderr.error, /No enabled Model Gateway provider offers model gpt-5\.5/);
  assert.doesNotMatch(failedWithoutStderr.error, /Agent process exited/);
});

test("native Channel Connectors session store persists Codex thread ids by IM session", () => {
  const root = makeTempRoot();
  const storePath = path.join(root, "state", "channel-sessions.json");
  const lookup = {
    bindingId: "octo-codex",
    projectId: "codex-main",
    sessionKey: "dmwork:dm:user-1",
    agent: "codex",
    model: "gpt-5",
    workDir: path.join(root, "work"),
  };

  assert.equal(getChannelConnectorAgentSession(storePath, lookup), null);
  const first = upsertChannelConnectorAgentSession(storePath, {
    ...lookup,
    codexThreadId: "thread-a",
    messageId: "message-1",
    status: "completed",
    now: new Date("2026-06-06T08:00:00.000Z"),
  });
  assert.equal(first.codexThreadId, "thread-a");
  assert.equal(first.turnCount, 1);
  assert.equal(first.lastMessageId, "message-1");
  assert.equal(fs.statSync(storePath).mode & 0o777, 0o600);

  const second = upsertChannelConnectorAgentSession(storePath, {
    ...lookup,
    messageId: "message-2",
    status: "failed",
    now: new Date("2026-06-06T08:01:00.000Z"),
  });
  assert.equal(second.codexThreadId, "thread-a");
  assert.equal(second.turnCount, 2);
  assert.equal(second.lastMessageId, "message-2");
  assert.equal(second.lastStatus, "failed");

  const loaded = getChannelConnectorAgentSession(storePath, lookup);
  assert.equal(loaded?.codexThreadId, "thread-a");
  assert.equal(loaded?.turnCount, 2);

  const switchedModel = getChannelConnectorAgentSession(storePath, {
    ...lookup,
    model: "gpt-5.5",
  });
  assert.equal(switchedModel?.codexThreadId, "thread-a");
  assert.equal(switchedModel?.turnCount, 2);

  const deleted = clearChannelConnectorAgentSessionsForConversation(storePath, {
    bindingId: lookup.bindingId,
    sessionKey: lookup.sessionKey,
  });
  assert.equal(deleted, 1);
  assert.equal(getChannelConnectorAgentSession(storePath, lookup), null);
});

test("native Channel Connectors IM commands switch agent, model, and permission per session", async () => {
  const root = makeTempRoot();
  const stateDir = path.join(root, "state");
  const controlsPath = path.join(stateDir, "channel-session-controls.json");
  const agentSessionsPath = path.join(stateDir, "channel-sessions.json");
  const codexProject = {
    id: "codex-main",
    name: "Codex main",
    workDir: path.join(root, "codex-work"),
    agent: "codex",
    model: "gpt-5",
    permissionMode: "suggest",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "codex",
    platformBindings: [],
  };
  const claudeProject = {
    id: "claude-main",
    name: "Claude main",
    workDir: path.join(root, "claude-work"),
    agent: "claude-code",
    model: "claude-sonnet",
    permissionMode: "plan",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "claude",
    platformBindings: [],
  };
  fs.mkdirSync(path.join(codexProject.workDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(claudeProject.workDir, "src"), { recursive: true });
  const binding = {
    id: "octo-codex",
    platform: "octo",
    accountId: "octo-account",
    botId: "robot-1",
    displayName: "Octo Codex",
    agent: "codex",
    enabled: true,
    allowlist: [],
    adminUsers: ["admin-1"],
    metadata: {},
  };
  const runtimeConfig = {
    version: 1,
    management: { host: "127.0.0.1", port: 18797 },
    paths: {
      root,
      state: stateDir,
      log: path.join(root, "logs", "channel.log"),
      runtime: path.join(root, "runtime.json"),
      octoEvents: path.join(stateDir, "octo-events.jsonl"),
    },
    gateway: {
      endpoint: "http://127.0.0.1:18796/v1",
      clientKeyRef: "studio-gateway-client-key",
    },
    projects: [codexProject, claudeProject],
  };
  const baseContext = {
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    controlsPath,
    agentSessionsPath,
    gatewayClientKey: "sk-local",
    listModels: async () => ["gpt-5", "gpt-5.5", "claude-sonnet"],
  };
  const message = (content, fromUid = "admin-1") => ({
    messageId: `m-${content.replace(/[^a-z0-9]+/gi, "-")}-${fromUid}`,
    fromUid,
    channelId: fromUid,
    channelType: 1,
    payload: { type: 1, content },
  });

  const help = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/help"),
  });
  assert.equal(help.handled, true);
  assert.equal(help.ok, true);
  assert.match(help.replyText, /\/mode/);
  assert.match(help.replyText, /\/stream/);
  assert.match(help.replyText, /\/tools/);

  for (const alias of ["/command", "/cmd"]) {
    const aliasHelp = await handleChannelConnectorCommand({
      ...baseContext,
      message: message(alias),
    });
    assert.equal(aliasHelp.handled, true);
    assert.equal(aliasHelp.action, "help");
    assert.match(aliasHelp.replyText, /Studio Channel Commands/);
  }

  const listSlashCommands = [
    ["/status", "status"],
    ["/agent", "list"],
    ["/model", "list"],
    ["/mode", "list"],
    ["/dir", "list"],
    ["/display", "list"],
    ["/stream", "list"],
    ["/tools", "list"],
  ];
  for (const [command, action] of listSlashCommands) {
    const result = await handleChannelConnectorCommand({
      ...baseContext,
      message: message(command),
    });
    assert.equal(result.handled, true);
    assert.equal(result.action, action);
    assert.equal(result.ok, true);
    assert.match(result.replyText, /\S/);
  }

  const denied = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/mode yolo", "user-2"),
  });
  assert.equal(denied.handled, true);
  assert.equal(denied.ok, false);
  assert.match(denied.replyText, /没有管理/);

  const mode = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/mode yolo"),
  });
  assert.equal(mode.ok, true);
  assert.equal(mode.control.permissionMode, "yolo");

  const model = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/model 2"),
  });
  assert.equal(model.ok, true);
  assert.equal(model.control.model, "gpt-5.5");

  const streamOff = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/stream off"),
  });
  assert.equal(streamOff.ok, true);
  assert.equal(streamOff.control.streamMessages, false);
  assert.match(streamOff.replyText, /流式\/进度消息：关闭/);

  const toolsOff = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/tools off"),
  });
  assert.equal(toolsOff.ok, true);
  assert.equal(toolsOff.control.toolMessages, false);
  assert.match(toolsOff.replyText, /工具\/思考消息：关闭/);

  const displayDefault = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/display default"),
  });
  assert.equal(displayDefault.ok, true);
  assert.equal(displayDefault.control.streamMessages, null);
  assert.equal(displayDefault.control.toolMessages, null);

  const passthrough = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/compact"),
  });
  assert.equal(passthrough.handled, false);
  assert.equal(passthrough.action, "passthrough");
  assert.equal(passthrough.passthroughText, "/compact");

  const nativePassthrough = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/native /help"),
  });
  assert.equal(nativePassthrough.handled, false);
  assert.equal(nativePassthrough.passthroughText, "/help");

  const badNative = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/native"),
  });
  assert.equal(badNative.handled, true);
  assert.equal(badNative.ok, false);
  assert.match(badNative.replyText, /\/native/);

  const agent = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/agent claude-code"),
  });
  assert.equal(agent.ok, true);
  assert.equal(agent.control.activeProjectId, "claude-main");
  assert.equal(agent.control.model, null);
  assert.equal(agent.control.permissionMode, null);

  const cd = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/cd src"),
  });
  assert.equal(cd.ok, true);
  assert.equal(cd.control.workDir, path.join(claudeProject.workDir, "src"));

  const cdDefault = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/cd default"),
  });
  assert.equal(cdDefault.ok, true);
  assert.equal(cdDefault.control.workDir, null);

  const cdByIndex = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/cd 1"),
  });
  assert.equal(cdByIndex.ok, true);
  assert.equal(cdByIndex.control.workDir, path.join(claudeProject.workDir, "src"));

  const dir = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/dir"),
  });
  assert.equal(dir.ok, true);
  assert.match(dir.replyText, /当前工作目录/);

  const control = getChannelConnectorSessionControl(controlsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  });
  const effective = resolveChannelConnectorEffectiveProject(runtimeConfig, codexProject, control);
  assert.equal(effective.id, "claude-main");
  assert.equal(effective.agent, "claude-code");
  assert.equal(effective.model, "claude-sonnet");
  assert.equal(effective.permissionMode, "plan");
  assert.equal(effective.workDir, path.join(claudeProject.workDir, "src"));

  upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: effective.id,
    sessionKey: baseContext.sessionKey,
    agent: effective.agent,
    model: effective.model,
    workDir: effective.workDir,
    codexThreadId: "thread-before-reset",
    messageId: "m-before-reset",
    status: "completed",
  });
  const next = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/new"),
  });
  assert.equal(next.ok, true);
  assert.equal(getChannelConnectorSessionControl(controlsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  })?.workDir, path.join(claudeProject.workDir, "src"));
  assert.equal(getChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: effective.id,
    sessionKey: baseContext.sessionKey,
    agent: effective.agent,
    model: effective.model,
    workDir: effective.workDir,
  }), null);

  upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: effective.id,
    sessionKey: baseContext.sessionKey,
    agent: effective.agent,
    model: effective.model,
    workDir: effective.workDir,
    codexThreadId: "thread-before-reset",
    messageId: "m-before-reset",
    status: "completed",
  });
  const reset = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/reset"),
  });
  assert.equal(reset.ok, true);
  assert.equal(getChannelConnectorSessionControl(controlsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  }), null);
  assert.equal(getChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: effective.id,
    sessionKey: baseContext.sessionKey,
    agent: effective.agent,
    model: effective.model,
    workDir: effective.workDir,
  }), null);
});

test("native Channel Connectors model menus can read live Gateway model lists", async () => {
  await withMockGatewayModelsServer(async ({ baseUrl, requests }) => {
    const models = await listChannelConnectorGatewayModels(`${baseUrl}/v1`, "studio-client-key");
    assert.deepEqual(models, ["gateway-gpt-5", "gateway-glm-5"]);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].path, "/v1/models");
    assert.equal(requests[0].authorization, "Bearer studio-client-key");
  });
});

test("native Channel Connectors command surface loads Gateway models when request omits models", async () => {
  await withMockGatewayModelsServer(async ({ baseUrl, requests }) => {
    const root = makeTempRoot();
    const config = createStudioConfig(root);
    const service = createChannelConnectorsService(config, {
      now: () => new Date("2026-06-06T08:00:00.000Z"),
    });
    const native = service.getNativeConfig().config;
    service.saveNativeConfig({
      config: {
        ...native,
        agentProfiles: [
          {
            ...native.agentProfiles[0],
            id: "codex-gateway",
            name: "Codex Gateway",
            model: "profile-fallback-model",
            gatewayEndpoint: `${baseUrl}/v1`,
          },
        ],
        defaultAgentProfileId: "codex-gateway",
        platformBindings: [
          {
            id: "feishu-gateway",
            platform: "feishu",
            accountId: "cli_gateway",
            botId: "feishu-gateway-bot",
            displayName: "Feishu Gateway Bot",
            agentProfileId: "codex-gateway",
            enabled: true,
            allowlist: [],
            adminUsers: [],
            metadata: {
              verificationToken: "gateway-token",
            },
          },
        ],
      },
    });

    const surface = await service.getCommandSurface({
      bindingId: "feishu-gateway",
      sessionKey: "feishu:chat:user",
      view: "model",
      renderer: "all",
    });
    assert.equal(surface.binding.id, "feishu-gateway");
    assert.equal(surface.surface.current.model, "profile-fallback-model");
    assert.equal(requests.some((request) => request.path === "/v1/models"), true);
    const cardRaw = JSON.stringify(surface.feishuCard);
    assert.match(cardRaw, /Studio Model/);
    assert.match(cardRaw, /act:\/model gateway-gpt-5/);
    assert.match(cardRaw, /act:\/model gateway-glm-5/);
  });
});

test("native Channel Connectors command surface renders text and Feishu card actions", () => {
  const root = makeTempRoot();
  const stateDir = path.join(root, "state");
  const codexProject = {
    id: "codex-main",
    name: "Codex main",
    workDir: path.join(root, "codex-work"),
    agent: "codex",
    model: "gpt-5",
    permissionMode: "suggest",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "codex",
    platformBindings: [],
  };
  const claudeProject = {
    id: "claude-main",
    name: "Claude main",
    workDir: path.join(root, "claude-work"),
    agent: "claude-code",
    model: "claude-sonnet",
    permissionMode: "plan",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "claude",
    platformBindings: [],
  };
  fs.mkdirSync(path.join(codexProject.workDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(codexProject.workDir, "packages"), { recursive: true });
  fs.mkdirSync(path.join(claudeProject.workDir, "src"), { recursive: true });
  const binding = {
    id: "octo-codex",
    platform: "octo",
    accountId: "octo-account",
    botId: "robot-1",
    displayName: "Octo Codex",
    agent: "codex",
    enabled: true,
    allowlist: [],
    adminUsers: ["admin-1"],
    metadata: {},
  };
  codexProject.platformBindings = [binding];
  const runtimeConfig = {
    version: 1,
    management: { host: "127.0.0.1", port: 18797 },
    paths: {
      root,
      state: stateDir,
      log: path.join(root, "logs", "channel.log"),
      runtime: path.join(root, "runtime.json"),
      octoEvents: path.join(stateDir, "octo-events.jsonl"),
    },
    gateway: {
      endpoint: "http://127.0.0.1:18796/v1",
      clientKeyRef: "studio-gateway-client-key",
    },
    projects: [codexProject, claudeProject],
  };

  const surface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    models: ["gpt-5", "gpt-5.5"],
  });

  assert.equal(surface.current.bindingId, "octo-codex");
  assert.equal(surface.current.projectId, "codex-main");
  assert.equal(surface.current.streamMessages, true);
  assert.equal(surface.current.toolMessages, true);
  assert.match(surface.textFallback, /skills\/native/);
  assert.match(surface.textFallback, /\/agent claude-main/);
  const nativeSection = surface.sections.find((section) => section.id === "native");
  assert.ok(nativeSection);
  assert.equal(nativeSection.actions[0].nativePassthrough, true);
  assert.equal(nativeSection.actions[0].command, "/native /help");

  const feishu = renderChannelConnectorCommandSurfaceFeishu(surface);
  assert.equal(feishu.config.wide_screen_mode, true);
  assert.equal(feishu.header.title.content, "Studio Channel Menu");
  const raw = JSON.stringify(feishu);
  assert.match(raw, /column_set/);
  assert.match(raw, /surface_action_id/);
  assert.match(raw, /surface_action_kind/);
  assert.match(raw, /nav:\/help model/);
  assert.match(raw, /session_key/);
  assert.match(raw, /当前 Agent/);
  assert.match(raw, /\/help model/);
  assert.match(raw, /\/help display/);
  assert.match(raw, /New Session/);
  assert.doesNotMatch(raw, /\/mode yolo/);
  assert.ok(feishu.elements.some((element) => element.tag === "column_set" && element.flex_mode === "bisect"));

  const sessionSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "session",
    selectedViewId: "session",
  });
  const sessionCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(sessionSurface));
  assert.match(sessionCardRaw, /Studio Session/);
  assert.match(sessionCardRaw, /act:\/status/);
  assert.match(sessionCardRaw, /act:\/new/);
  assert.match(sessionCardRaw, /act:\/reset/);
  assert.match(sessionCardRaw, /New Session 只断开 Agent 续接/);
  assert.match(sessionCardRaw, /nav:\/help session/);

  const agentPickerSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "agent",
    selectedViewId: "agent",
  });
  const agentCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(agentPickerSurface));
  assert.match(agentCardRaw, /Studio Agent/);
  assert.match(agentCardRaw, /select_static/);
  assert.match(agentCardRaw, /act:\/agent claude-main/);
  assert.match(agentCardRaw, /nav:\/help agent/);

  const workdirPickerSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "workdir",
    selectedViewId: "workdir",
  });
  const workdirCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(workdirPickerSurface));
  assert.match(workdirCardRaw, /Studio WorkDir/);
  assert.match(workdirCardRaw, /select_static/);
  assert.ok(workdirCardRaw.includes(`act:/cd ${path.join(codexProject.workDir, "src")}`));
  assert.match(workdirCardRaw, /act:\/cd default/);
  assert.match(workdirCardRaw, /nav:\/help workdir/);

  const modelSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    models: ["gpt-5", "gpt-5.5"],
    selectedSectionId: "model",
  });
  const modelHelpRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(modelSurface));
  assert.match(modelHelpRaw, /nav:\/model/);
  assert.match(modelHelpRaw, /模型选择器/);
  assert.doesNotMatch(modelHelpRaw, /act:\/model gpt-5\.5/);
  assert.match(modelHelpRaw, /act:\/model default/);
  assert.doesNotMatch(modelHelpRaw, /\/mode yolo/);

  const modelPickerSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    models: ["gpt-5", "gpt-5.5"],
    selectedSectionId: "model",
    selectedViewId: "model",
  });
  const modelCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(modelPickerSurface));
  assert.match(modelCardRaw, /Studio Model/);
  assert.match(modelCardRaw, /select_static/);
  assert.match(modelCardRaw, /act:\/model gpt-5\.5/);
  assert.match(modelCardRaw, /Profile 默认模型/);
  assert.match(modelCardRaw, /nav:\/help model/);
  assert.match(modelCardRaw, /initial_option/);
  assert.doesNotMatch(modelCardRaw, /\/mode yolo/);

  const modePickerSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "mode",
    selectedViewId: "mode",
  });
  const modeCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(modePickerSurface));
  assert.match(modeCardRaw, /Studio Permission/);
  assert.match(modeCardRaw, /select_static/);
  assert.match(modeCardRaw, /act:\/mode yolo/);
  assert.match(modeCardRaw, /nav:\/help mode/);

  const displaySurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "display",
    selectedViewId: "display",
  });
  const displayCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(displaySurface));
  assert.match(displayCardRaw, /Studio Display/);
  assert.match(displayCardRaw, /act:\/stream on/);
  assert.match(displayCardRaw, /act:\/stream off/);
  assert.match(displayCardRaw, /act:\/tools on/);
  assert.match(displayCardRaw, /act:\/tools off/);
  assert.match(displayCardRaw, /act:\/display default/);
  assert.match(displayCardRaw, /nav:\/help display/);

  const parsed = extractChannelConnectorCommandFromActionValue({
    action: "act:/agent claude-main",
    command: "/agent claude-main",
    session_key: "dmwork:dm:admin-1",
  });
  assert.equal(parsed, "/agent claude-main");
  const payload = extractChannelConnectorSurfaceActionPayload({
    action: "act:/model gpt-5.5",
    command: "/model gpt-5.5",
    binding_id: "octo-codex",
    session_key: "dmwork:dm:admin-1",
    surface_action_id: "model-gpt-5.5",
    surface_action_kind: "act",
    surface_section_id: "model",
  });
  assert.deepEqual(payload, {
    command: "/model gpt-5.5",
    rawAction: "act:/model gpt-5.5",
    actionKind: "act",
    bindingId: "octo-codex",
    sessionKey: "dmwork:dm:admin-1",
    actionId: "model-gpt-5.5",
    targetSectionId: "model",
    targetViewId: "model",
  });
  const navPayload = extractChannelConnectorSurfaceActionPayload("nav:/help session");
  assert.equal(navPayload.command, "/help session");
  assert.equal(navPayload.actionKind, "nav");
  assert.equal(navPayload.targetSectionId, "session");
  assert.equal(navPayload.targetViewId, "help");
  const selectPayload = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      event_id: "evt_select",
    },
    event: {
      action: {
        option: "act:/mode yolo",
        value: {
          binding_id: "octo-codex",
          session_key: "dmwork:dm:admin-1",
          surface_view_id: "mode",
        },
      },
    },
  });
  assert.deepEqual(selectPayload.actionValue, {
    binding_id: "octo-codex",
    session_key: "dmwork:dm:admin-1",
    surface_view_id: "mode",
    action: "act:/mode yolo",
    command: "act:/mode yolo",
  });
  const noisyActionPayload = extractChannelConnectorSurfaceActionPayload({
    action: "select_static",
    command: "act:/mode yolo",
    binding_id: "octo-codex",
  });
  assert.equal(noisyActionPayload.command, "/mode yolo");
  assert.equal(noisyActionPayload.actionKind, "act");
  assert.equal(noisyActionPayload.targetViewId, "mode");
});

test("native Channel Connectors Feishu webhook parses live envelopes and reuses command router", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  fs.mkdirSync(path.join(root, "codex-work", "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "claude-work", "src"), { recursive: true });
  const initial = service.getNativeConfig().config;
  service.saveNativeConfig({
    config: {
      ...initial,
      agentProfiles: [
        {
          id: "feishu-codex",
          name: "Feishu Codex",
          agent: "codex",
          model: "gpt-5",
          workDir: path.join(root, "codex-work"),
          permissionMode: "suggest",
          gatewayEndpoint: "http://127.0.0.1:18796/v1",
          gatewayKeyRef: "studio-gateway-client-key",
          appProfileRef: "codex",
        },
        {
          id: "feishu-claude",
          name: "Feishu Claude",
          agent: "claude-code",
          model: "claude-sonnet",
          workDir: path.join(root, "claude-work"),
          permissionMode: "plan",
          gatewayEndpoint: "http://127.0.0.1:18796/v1",
          gatewayKeyRef: "studio-gateway-client-key",
          appProfileRef: "claude",
        },
      ],
      defaultAgentProfileId: "feishu-codex",
      platformBindings: [
        {
          id: "feishu-main",
          platform: "feishu",
          accountId: "cli_test",
          botId: "bot_test",
          displayName: "Feishu Main",
          agentProfileId: "feishu-codex",
          enabled: true,
          allowlist: [],
          adminUsers: ["ou_admin"],
          metadata: {
            verificationToken: "verify-token",
          },
        },
      ],
    },
  });

  const parsed = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card" },
      action: {
        value: {
          action: "/status",
          binding_id: "feishu-main",
          session_key: "feishu:oc_chat:ou_admin",
        },
      },
    },
  });
  assert.equal(parsed.kind, "card-action");
  assert.equal(parsed.fromUid, "ou_admin");
  assert.equal(parsed.channelId, "oc_chat");
  assert.equal(parsed.messageId, "om_card");

  const parsedNormalizedWsCard = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_ws_card",
      token: "verify-token",
    },
    event: {
      operator: { openId: "ou_admin" },
      chatId: "oc_chat",
      messageId: "om_card_ws",
      action: {
        value: {
          action: "nav:/help model",
          command: "/help model",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(parsedNormalizedWsCard.kind, "card-action");
  assert.equal(parsedNormalizedWsCard.fromUid, "ou_admin");
  assert.equal(parsedNormalizedWsCard.channelId, "oc_chat");
  assert.equal(parsedNormalizedWsCard.messageId, "om_card_ws");
  assert.equal(extractChannelConnectorCommandFromActionValue(parsedNormalizedWsCard.actionValue), "/help model");

  const challenge = await service.dispatchFeishuWebhook({
    type: "url_verification",
    app_id: "cli_test",
    token: "verify-token",
    challenge: "challenge-value",
  });
  assert.equal(challenge.accepted, true);
  assert.equal(challenge.verification.ok, true);
  assert.deepEqual(challenge.feishuResponse, { challenge: "challenge-value" });
  assert.equal(challenge.eventStored.written, true);

  const badToken = await service.dispatchFeishuWebhook({
    type: "url_verification",
    app_id: "cli_test",
    token: "wrong-token",
    challenge: "challenge-value",
  });
  assert.equal(badToken.accepted, false);
  assert.equal(badToken.skippedReason, "feishu_verification_token_mismatch");
  assert.equal(badToken.feishuResponse, null);

  const parsedMessage = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_parse",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_msg_parse",
        chat_id: "oc_chat",
        chat_type: "group",
        root_id: "om_root",
        parent_id: "om_parent",
        thread_id: "om_thread",
        message_type: "text",
        content: JSON.stringify({ text: "/status" }),
      },
    },
  });
  assert.equal(parsedMessage.rootId, "om_root");
  assert.equal(parsedMessage.parentId, "om_parent");
  assert.equal(parsedMessage.threadId, "om_thread");
  assert.equal(buildFeishuSessionKey(parsedMessage), "feishu:oc_chat:root:om_root");
  assert.equal(buildFeishuSessionKey({ ...parsedMessage, rootId: null }), "feishu:oc_chat:root:om_msg_parse");
  assert.equal(buildFeishuSessionKey(parsedMessage, { threadIsolation: false }), "feishu:oc_chat:ou_admin");

  const parsedImage = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_img_parse",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_img_parse",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "image",
        content: JSON.stringify({ image_key: "img-key-1" }),
      },
    },
  });
  assert.equal(parsedImage.messageType, "image");
  assert.equal(parsedImage.text, "[image]");
  assert.equal(parsedImage.attachments.length, 1);
  assert.equal(parsedImage.attachments[0].kind, "image");
  assert.equal(parsedImage.attachments[0].imageKey, "img-key-1");
  assert.equal(parsedImage.directed, true);

  const parsedFile = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_file_parse",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_file_parse",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "file",
        content: JSON.stringify({ file_key: "file-key-1", file_name: "report.pdf" }),
      },
    },
  });
  assert.equal(parsedFile.text, "[file: report.pdf]");
  assert.equal(parsedFile.attachments[0].kind, "file");
  assert.equal(parsedFile.attachments[0].fileKey, "file-key-1");
  assert.equal(parsedFile.attachments[0].fileName, "report.pdf");

  const parsedAudio = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_audio_parse",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_audio_parse",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "audio",
        content: JSON.stringify({ file_key: "audio-key-1", duration: 3200 }),
      },
    },
  });
  assert.equal(parsedAudio.text, "[voice: 3s]");
  assert.equal(parsedAudio.attachments[0].kind, "audio");
  assert.equal(parsedAudio.attachments[0].durationMs, 3200);

  const slashMessage = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_msg",
        chat_id: "oc_chat",
        chat_type: "p2p",
        root_id: "om_root",
        parent_id: "om_parent",
        thread_id: "om_thread",
        message_type: "text",
        content: JSON.stringify({ text: "/mode yolo" }),
      },
    },
  });
  assert.equal(slashMessage.accepted, true);
  assert.equal(slashMessage.eventKind, "message");
  assert.equal(slashMessage.sessionKey, "feishu:oc_chat:ou_admin");
  assert.equal(slashMessage.incoming.content, "/mode yolo");
  assert.equal(slashMessage.incoming.rootId, "om_root");
  assert.equal(slashMessage.incoming.parentId, "om_parent");
  assert.equal(slashMessage.incoming.threadId, "om_thread");
  assert.equal(slashMessage.commandAction.command, "/mode yolo");
  assert.equal(slashMessage.commandAction.commandResult.ok, true);
  assert.equal(slashMessage.commandAction.surface.current.permissionMode, "yolo");
  assert.match(slashMessage.feishuResponse.toast.content, /已切换本会话权限模式/);
  assert.match(JSON.stringify(slashMessage.feishuResponse.card.data), /Studio Permission/);

  const slashThreadMessage = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_thread_status",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_msg_thread_status",
        chat_id: "oc_chat",
        chat_type: "group",
        root_id: "om_thread_root",
        parent_id: "om_thread_parent",
        thread_id: "om_thread_id",
        message_type: "text",
        content: JSON.stringify({ text: "/status" }),
      },
    },
  });
  assert.equal(slashThreadMessage.accepted, true);
  assert.equal(slashThreadMessage.sessionKey, "feishu:oc_chat:root:om_thread_root");
  assert.equal(slashThreadMessage.commandAction.command, "/status");
  assert.equal(slashThreadMessage.incoming.rootId, "om_thread_root");
  assert.equal(slashThreadMessage.incoming.parentId, "om_thread_parent");
  assert.equal(slashThreadMessage.incoming.threadId, "om_thread_id");
  assert.match(JSON.stringify(slashThreadMessage.feishuResponse.card.data), /feishu:oc_chat:root:om_thread_root/);
  const feishuLog = fs.readFileSync(slashThreadMessage.eventStored.path, "utf8");
  assert.match(feishuLog, /"rootId":"om_thread_root"/);
  assert.match(feishuLog, /"threadId":"om_thread_id"/);

  const imageDryRunMessage = await service.dispatchFeishuWebhook({
    dryRun: true,
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_img_dry_run",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_img_dry_run",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "image",
        content: JSON.stringify({ image_key: "img-key-dry-run" }),
      },
    },
  });
  assert.equal(imageDryRunMessage.accepted, true);
  assert.equal(imageDryRunMessage.agentDispatch.status, "dry-run");
  assert.equal(imageDryRunMessage.incoming.content, "[image]");
  assert.equal(imageDryRunMessage.incoming.messageType, "image");
  assert.equal(imageDryRunMessage.incoming.attachments.length, 1);
  assert.equal(imageDryRunMessage.incoming.attachments[0].imageKey, "img-key-dry-run");
  const imageLog = fs.readFileSync(imageDryRunMessage.eventStored.path, "utf8");
  assert.match(imageLog, /"messageType":"image"/);
  assert.match(imageLog, /"attachmentKinds":\["image"\]/);

  const slashModelMessage = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_model",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_msg_model",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "/model" }),
      },
    },
  });
  assert.equal(slashModelMessage.accepted, true);
  assert.equal(slashModelMessage.commandAction.command, "/model");
  assert.equal(slashModelMessage.commandAction.commandResult.action, "list");
  assert.match(JSON.stringify(slashModelMessage.feishuResponse.card.data), /Studio Model/);
  assert.match(JSON.stringify(slashModelMessage.feishuResponse.card.data), /select_static/);

  const slashNewMessage = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_new",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_msg_new",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "/new" }),
      },
    },
  });
  assert.equal(slashNewMessage.accepted, true);
  assert.equal(slashNewMessage.commandAction.command, "/new");
  assert.equal(slashNewMessage.commandAction.commandResult.ok, true);
  assert.match(slashNewMessage.commandAction.commandResult.replyText, /已开启新的 Agent 会话/);
  assert.match(JSON.stringify(slashNewMessage.feishuResponse.card.data), /Studio Session/);

  const slashResetMessage = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_reset",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_msg_reset",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "/reset" }),
      },
    },
  });
  assert.equal(slashResetMessage.accepted, true);
  assert.equal(slashResetMessage.commandAction.command, "/reset");
  assert.equal(slashResetMessage.commandAction.commandResult.ok, true);
  assert.match(slashResetMessage.commandAction.commandResult.replyText, /已重置本 IM 会话/);
  assert.match(JSON.stringify(slashResetMessage.feishuResponse.card.data), /Studio Session/);

  const statusCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_status",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_status" },
      action: {
        value: {
          action: "act:/status",
          command: "/status",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(statusCardAction.accepted, true);
  assert.equal(statusCardAction.commandAction.command, "/status");
  assert.equal(statusCardAction.commandAction.commandResult.ok, true);
  assert.match(statusCardAction.feishuResponse.toast.content, /Studio Channel Status/);
  const statusCardRaw = JSON.stringify(statusCardAction.feishuResponse.card.data);
  assert.match(statusCardRaw, /当前状态/);
  assert.match(statusCardRaw, /Studio Channel Status/);
  assert.match(statusCardRaw, /Agent:/);
  assert.doesNotMatch(statusCardAction.feishuResponse.toast.content, /菜单已更新/);

  const newSessionCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_new_session",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_new_session" },
      action: {
        value: {
          action: "act:/new",
          command: "/new",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(newSessionCardAction.accepted, true);
  assert.equal(newSessionCardAction.commandAction.command, "/new");
  assert.equal(newSessionCardAction.commandAction.commandResult.ok, true);
  assert.match(newSessionCardAction.commandAction.commandResult.replyText, /已开启新的 Agent 会话/);
  assert.match(newSessionCardAction.feishuResponse.toast.content, /已开启新的 Agent 会话/);
  const newSessionCardRaw = JSON.stringify(newSessionCardAction.feishuResponse.card.data);
  assert.match(newSessionCardRaw, /Studio Session/);
  assert.match(newSessionCardRaw, /新会话已开启/);
  assert.match(newSessionCardRaw, /已开启新的 Agent 会话/);
  assert.match(newSessionCardRaw, /act:\/reset/);

  const resetSessionCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_reset_session",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_reset_session" },
      action: {
        value: {
          action: "act:/reset",
          command: "/reset",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(resetSessionCardAction.accepted, true);
  assert.equal(resetSessionCardAction.commandAction.command, "/reset");
  assert.equal(resetSessionCardAction.commandAction.commandResult.ok, true);
  assert.match(resetSessionCardAction.commandAction.commandResult.replyText, /已重置本 IM 会话/);
  assert.match(resetSessionCardAction.feishuResponse.toast.content, /已重置本 IM 会话/);
  const resetSessionCardRaw = JSON.stringify(resetSessionCardAction.feishuResponse.card.data);
  assert.match(resetSessionCardRaw, /Studio Session/);
  assert.match(resetSessionCardRaw, /会话已重置/);
  assert.match(resetSessionCardRaw, /已重置本 IM 会话/);
  assert.match(resetSessionCardRaw, /act:\/new/);

  const cardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_2",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_2" },
      action: {
        value: {
          action: "act:/native /help",
          command: "/native /help",
        },
      },
    },
  });
  assert.equal(cardAction.accepted, true);
  assert.equal(cardAction.eventKind, "card-action");
  assert.equal(cardAction.commandAction.command, "/native /help");
  assert.equal(cardAction.commandAction.commandResult.handled, false);
  assert.equal(cardAction.commandAction.commandResult.passthroughText, "/help");
  assert.match(cardAction.feishuResponse.toast.content, /\/help/);

  const menuCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_3",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_3" },
      action: {
        value: {
          action: "nav:/help model",
          command: "/help model",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(menuCardAction.accepted, true);
  assert.equal(menuCardAction.commandAction.command, "/help model");
  assert.equal(menuCardAction.feishuResponse.card.type, "raw");
  assert.match(JSON.stringify(menuCardAction.feishuResponse.card.data), /\/model default/);
  assert.doesNotMatch(JSON.stringify(menuCardAction.feishuResponse.card.data), /\/mode yolo/);

  const modelPickerCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_4",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_3" },
      action: {
        value: {
          action: "nav:/model",
          command: "/model",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(modelPickerCardAction.accepted, true);
  assert.equal(modelPickerCardAction.commandAction.command, "/model");
  assert.match(JSON.stringify(modelPickerCardAction.feishuResponse.card.data), /Studio Model/);
  assert.match(JSON.stringify(modelPickerCardAction.feishuResponse.card.data), /select_static/);
  assert.match(JSON.stringify(modelPickerCardAction.feishuResponse.card.data), /act:\/model gpt-5/);

  const modeSelectCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_5",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_3" },
      action: {
        option: "act:/mode yolo",
        value: {
          binding_id: "feishu-main",
          surface_view_id: "mode",
        },
      },
    },
  });
  assert.equal(modeSelectCardAction.accepted, true);
  assert.equal(modeSelectCardAction.commandAction.command, "/mode yolo");
  assert.equal(modeSelectCardAction.commandAction.surface.current.permissionMode, "yolo");
  assert.match(JSON.stringify(modeSelectCardAction.feishuResponse.card.data), /Studio Permission/);
  assert.match(JSON.stringify(modeSelectCardAction.feishuResponse.card.data), /select_static/);

  const agentSelectCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_6",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_3" },
      action: {
        option: "act:/agent feishu-claude",
        value: {
          binding_id: "feishu-main",
          surface_view_id: "agent",
        },
      },
    },
  });
  assert.equal(agentSelectCardAction.accepted, true);
  assert.equal(agentSelectCardAction.commandAction.command, "/agent feishu-claude");
  assert.equal(agentSelectCardAction.commandAction.surface.current.projectId, "feishu-claude");
  assert.equal(agentSelectCardAction.commandAction.surface.current.agent, "claude-code");
  assert.match(JSON.stringify(agentSelectCardAction.feishuResponse.card.data), /Studio Agent/);
  assert.match(JSON.stringify(agentSelectCardAction.feishuResponse.card.data), /select_static/);

  const workdirSelectCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_7",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_3" },
      action: {
        option: `act:/cd ${path.join(root, "claude-work", "src")}`,
        value: {
          binding_id: "feishu-main",
          surface_view_id: "workdir",
        },
      },
    },
  });
  assert.equal(workdirSelectCardAction.accepted, true);
  assert.equal(workdirSelectCardAction.commandAction.command, `/cd ${path.join(root, "claude-work", "src")}`);
  assert.equal(workdirSelectCardAction.commandAction.commandResult.ok, true);
  assert.match(workdirSelectCardAction.commandAction.commandResult.replyText, /claude-work\/src/);
  assert.equal(workdirSelectCardAction.commandAction.surface.current.workDir, path.join(root, "claude-work", "src"));
  assert.match(JSON.stringify(workdirSelectCardAction.feishuResponse.card.data), /Studio WorkDir/);
  assert.match(JSON.stringify(workdirSelectCardAction.feishuResponse.card.data), /select_static/);

  const backToSessionCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_8",
      token: "verify-token",
    },
    event: {
      operator: { openId: "ou_admin" },
      chatId: "oc_chat",
      messageId: "om_card_3",
      action: {
        value: {
          action: "nav:/help session",
          command: "/help session",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(backToSessionCardAction.accepted, true);
  assert.equal(backToSessionCardAction.commandAction.command, "/help session");
  assert.match(JSON.stringify(backToSessionCardAction.feishuResponse.card.data), /New Session/);
  assert.doesNotMatch(JSON.stringify(backToSessionCardAction.feishuResponse.card.data), /\/model default/);
});

test("native Channel Connectors Feishu transport sends replies and reuses tenant token cache", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const config = createStudioConfig(root);
    const service = createChannelConnectorsService(config, {
      now: () => new Date("2026-06-06T08:00:00.000Z"),
    });
    const initial = service.getNativeConfig().config;
    service.saveNativeConfig({
      config: {
        ...initial,
        agentProfiles: [
          {
            id: "feishu-codex",
            name: "Feishu Codex",
            agent: "codex",
            model: "gpt-5",
            workDir: root,
            permissionMode: "suggest",
            gatewayEndpoint: "http://127.0.0.1:18796/v1",
            gatewayKeyRef: "studio-gateway-client-key",
            appProfileRef: "codex",
          },
        ],
        defaultAgentProfileId: "feishu-codex",
        platformBindings: [
          {
            id: "feishu-send",
            platform: "feishu",
            accountId: "cli_send",
            botId: "bot_send",
            displayName: "Feishu Send",
            agentProfileId: "feishu-codex",
            enabled: true,
            allowlist: [],
            adminUsers: [],
            metadata: {
              apiUrl,
              appSecret: "test-secret",
              verificationToken: "verify-send",
            },
          },
        ],
      },
    });

    const send = await service.runFeishuTransportSmoke({
      bindingId: "feishu-send",
      action: "send-message",
      channelId: "oc_chat",
      content: "hello feishu",
    });
    assert.equal(send.transport.ok, true);
    assert.equal(send.transport.action, "send-message");
    assert.equal(send.transport.requestCount, 2);
    assert.equal(send.transport.tokenCache, "miss");
    assert.equal(send.transport.messageId, "om_sent_1");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[0].body.app_id, "cli_send");
    assert.equal(requests[0].body.app_secret, "test-secret");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[1].authorization, "Bearer tenant-token-1");
    assert.equal(requests[1].body.receive_id, "oc_chat");
    assert.equal(requests[1].body.msg_type, "text");
    assert.equal(JSON.parse(requests[1].body.content).text, "hello feishu");

    const card = await service.runFeishuTransportSmoke({
      bindingId: "feishu-send",
      action: "send-card",
      channelId: "oc_chat",
      content: "card menu",
    });
    assert.equal(card.transport.ok, true);
    assert.equal(card.transport.action, "send-card");
    assert.equal(card.transport.requestCount, 1);
    assert.equal(card.transport.tokenCache, "hit");
    assert.equal(card.transport.messageId, "om_sent_1");
    assert.equal(requests[2].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[2].authorization, "Bearer tenant-token-1");
    assert.equal(requests[2].body.receive_id, "oc_chat");
    assert.equal(requests[2].body.msg_type, "interactive");
    assert.match(JSON.parse(requests[2].body.content).elements[0].content, /card menu/);

    const patch = await service.runFeishuTransportSmoke({
      bindingId: "feishu-send",
      action: "patch-card",
      messageId: "om_card",
      content: "patched card",
    });
    assert.equal(patch.transport.ok, true);
    assert.equal(patch.transport.action, "patch-card");
    assert.equal(patch.transport.requestCount, 1);
    assert.equal(patch.transport.tokenCache, "hit");
    assert.equal(requests.length, 4);
    assert.equal(requests[3].path, "/open-apis/im/v1/messages/om_card");
    assert.equal(requests[3].method, "PATCH");
    assert.equal(requests[3].authorization, "Bearer tenant-token-1");
    assert.match(JSON.parse(requests[3].body.content).elements[0].content, /patched card/);

    const webhook = await service.dispatchFeishuWebhook({
      sendReply: true,
      schema: "2.0",
      header: {
        event_type: "im.message.receive_v1",
        app_id: "cli_send",
        event_id: "evt_send",
        token: "verify-send",
      },
      event: {
        sender: { sender_id: { open_id: "ou_user" } },
        message: {
          message_id: "om_msg",
          chat_id: "oc_chat",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "/status" }),
        },
      },
    });
    assert.equal(webhook.accepted, true);
    assert.equal(webhook.transport.ok, true);
    assert.equal(webhook.transport.action, "send-card");
    assert.equal(webhook.transport.tokenCache, "hit");
    assert.equal(webhook.transport.requestCount, 1);
    assert.equal(requests.length, 5);
    assert.equal(requests[4].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[4].body.msg_type, "interactive");
    const webhookCard = JSON.parse(requests[4].body.content);
    assert.match(webhookCard.header.title.content, /Studio Session/);
    assert.match(JSON.stringify(webhookCard), /Studio Channel Status/);
  });
});

test("native Channel Connectors Feishu transport splits long text replies", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_long_text",
      appSecret: "test-secret",
    };
    const content = `${"你".repeat(3800)}${"好".repeat(6)}`;
    const result = await sendFeishuTextMessage(transport, {
      chatId: "oc_chat",
      content,
    }, cachePath);

    assert.equal(result.ok, true);
    assert.equal(result.action, "send-message");
    assert.equal(result.requestCount, 3);
    assert.equal(result.tokenCache, "miss");
    assert.equal(result.chunkCount, 2);
    assert.deepEqual(result.messageIds, ["om_sent_1", "om_sent_1"]);
    assert.equal(result.messageId, "om_sent_1");
    assert.equal(requests.length, 3);
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[2].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(Array.from(JSON.parse(requests[1].body.content).text).length, 3800);
    assert.equal(JSON.parse(requests[2].body.content).text, "好".repeat(6));

    const cached = await sendFeishuTextMessage(transport, {
      chatId: "oc_chat",
      content: "short",
    }, cachePath);
    assert.equal(cached.ok, true);
    assert.equal(cached.requestCount, 1);
    assert.equal(cached.tokenCache, "hit");
    assert.equal(cached.chunkCount, 1);
  });
});

test("native Channel Connectors Feishu transport manages processing reactions", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_react",
      appSecret: "test-secret",
    };
    const added = await addFeishuMessageReaction(transport, {
      messageId: "om_processing",
      emojiType: "OnIt",
    }, cachePath);
    assert.equal(added.ok, true);
    assert.equal(added.action, "add-reaction");
    assert.equal(added.reactionId, "reaction-1");
    assert.equal(added.requestCount, 2);
    assert.equal(added.tokenCache, "miss");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages/om_processing/reactions");
    assert.equal(requests[1].method, "POST");
    assert.equal(requests[1].authorization, "Bearer tenant-token-1");
    assert.deepEqual(requests[1].body.reaction_type, { emoji_type: "OnIt" });

    const removed = await removeFeishuMessageReaction(transport, {
      messageId: "om_processing",
      reactionId: "reaction-1",
    }, cachePath);
    assert.equal(removed.ok, true);
    assert.equal(removed.action, "remove-reaction");
    assert.equal(removed.requestCount, 1);
    assert.equal(removed.tokenCache, "hit");
    assert.equal(requests.length, 3);
    assert.equal(requests[2].path, "/open-apis/im/v1/messages/om_processing/reactions/reaction-1");
    assert.equal(requests[2].method, "DELETE");
    assert.equal(requests[2].authorization, "Bearer tenant-token-1");
  });
});

test("native Channel Connectors process runner streams progress events from agent JSONL", async () => {
  const root = makeTempRoot();
  const progress = [];
  const childScript = [
    "process.stdout.write(JSON.stringify({type:'thread.started',thread_id:'thread-progress'})+'\\n');",
    "setTimeout(()=>{",
    "process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'progress reply'}})+'\\n');",
    "}, 25);",
  ].join("");

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: "",
    env: {},
    timeoutMs: 1000,
    agent: "codex",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(progress.length, 2);
  assert.equal(progress[0].type, "session");
  assert.equal(progress[0].text, "thread-progress");
  assert.equal(progress[1].type, "assistant");
  assert.equal(progress[1].text, "progress reply");
  assert.equal(result.progressEvents?.length, 2);
});

test("native Channel Connectors process runner maps Codex command execution progress", async () => {
  const root = makeTempRoot();
  const progress = [];
  const childScript = [
    "process.stdout.write(JSON.stringify({type:'item.started',item:{type:'command_execution',command:'pwd'}})+'\\n');",
    "process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'pwd',exit_code:0,output:'/tmp/project'}})+'\\n');",
    "process.stdout.write(JSON.stringify({type:'turn.failed',error:{message:'未正常接收到prompt参数。',type:'upstream_error',code:'1213'}})+'\\n');",
  ].join("");

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: "",
    env: {},
    timeoutMs: 1000,
    agent: "codex",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(progress.length, 3);
  assert.equal(progress[0].type, "tool");
  assert.equal(progress[0].rawType, "item.started");
  assert.equal(progress[0].itemType, "command_execution");
  assert.match(progress[0].text, /command_execution started/);
  assert.match(progress[0].text, /pwd/);
  assert.equal(progress[1].type, "tool");
  assert.equal(progress[1].rawType, "item.completed");
  assert.match(progress[1].text, /exit=0/);
  assert.match(progress[1].text, /\/tmp\/project/);
  assert.equal(progress[2].type, "failed");
  assert.equal(progress[2].text, "未正常接收到prompt参数。 (type=upstream_error, code=1213)");
  assert.equal(result.progressEvents?.length, 3);
});

test("native Channel Connectors service management is guarded before daemon entry is built", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const homeDir = path.join(root, "home");
  const service = createChannelConnectorsService(config, {
    homeDir,
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

  const paths = resolveChannelConnectorsPaths(config, homeDir);
  assert.equal(fs.existsSync(paths.configPath), false);
});

test("native Channel Connectors daemon owns Feishu long-connection ingress", () => {
  const daemonSource = fs.readFileSync(
    path.resolve("dist/apps/api/modules/channel-connectors/daemon.js"),
    "utf8",
  );
  assert.match(daemonSource, /WSClient/);
  assert.match(daemonSource, /EventDispatcher/);
  assert.match(daemonSource, /im\.message\.receive_v1/);
  assert.match(daemonSource, /card\.action\.trigger/);
  assert.match(daemonSource, /application\.bot\.menu_v6/);
  assert.match(daemonSource, /createFeishuGroups/);
  assert.match(daemonSource, /feishuGroupKey/);
  assert.match(daemonSource, /feishuConnections/);
  assert.match(daemonSource, /startFeishuWatchdog/);
  assert.match(daemonSource, /restartFeishuGroupClient/);
  assert.match(daemonSource, /watchdog_non_connected_/);
  assert.match(daemonSource, /sendFeishuTextMessage/);
  assert.match(daemonSource, /sendFeishuCardMessage/);
  assert.match(daemonSource, /patchFeishuCardMessage/);
  assert.match(daemonSource, /shouldSendFeishuProgressEvent/);
  assert.match(daemonSource, /renderFeishuProgressCard/);
  assert.match(daemonSource, /sendOrPatchFeishuProgressCard/);
  assert.match(daemonSource, /agent\.progress\.card/);
  assert.match(daemonSource, /jsonErrorEnvelopeMessage/);
  assert.match(daemonSource, /renderChannelConnectorCommandSurfaceFeishu/);
  assert.match(daemonSource, /function feishuDedupeKey/);
  assert.match(daemonSource, /parsed\.kind === "message"/);
  assert.doesNotMatch(daemonSource, /`feishu:\$\{group\.key\}:\$\{messageId\}:\$\{binding\.id\}`/);
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
          platformBindings: [
            {
              id: "octo-route",
              platform: "octo",
              accountId: "octo-route-account",
              botId: "octo-route-bot",
              displayName: "Octo Route Bot",
              agentProfileId: "opencode-main",
              enabled: true,
              allowlist: [],
              adminUsers: [],
            },
            {
              id: "feishu-route",
              platform: "feishu",
              accountId: "cli_route",
              botId: "feishu-route-bot",
              displayName: "Feishu Route Bot",
              agentProfileId: "opencode-main",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                verificationToken: "route-token",
              },
            },
          ],
        },
      },
    });
    assert.equal(savedConfig.status, 200);
    assert.equal(savedConfig.body.config.agentProfiles[0].agent, "opencode");

    const commandSurface = await requestJson(`${baseUrl}/api/channel-connectors/commands/surface`, {
      method: "POST",
      body: {
        bindingId: "octo-route",
        sessionKey: "dmwork:dm:route-user",
        section: "model",
        view: "model",
        renderer: "all",
        models: ["gpt-5", "gpt-5.5"],
      },
    });
    assert.equal(commandSurface.status, 200);
    assert.equal(commandSurface.body.binding.id, "octo-route");
    assert.equal(commandSurface.body.agentProfile.agent, "opencode");
    assert.equal(commandSurface.body.surface.current.projectId, "opencode-main");
    assert.match(commandSurface.body.textFallback, /\/native \/help/);
    assert.equal(commandSurface.body.surface.selectedViewId, "model");
    assert.match(JSON.stringify(commandSurface.body.feishuCard), /select_static/);
    assert.match(JSON.stringify(commandSurface.body.feishuCard), /\/model gpt-5\.5/);

    const action = await requestJson(`${baseUrl}/api/channel-connectors/commands/action`, {
      method: "POST",
      body: {
        actionValue: {
          action: "/mode yolo",
          binding_id: "octo-route",
          session_key: "dmwork:dm:route-user",
          surface_action_id: "mode-yolo",
        },
        fromUid: "route-user",
        channelId: "route-user",
        renderer: "all",
        models: ["gpt-5", "gpt-5.5"],
      },
    });
    assert.equal(action.status, 200);
    assert.equal(action.body.accepted, true);
    assert.equal(action.body.command, "/mode yolo");
    assert.equal(action.body.commandResult.ok, true);
    assert.equal(action.body.surface.current.permissionMode, "yolo");
    assert.match(JSON.stringify(action.body.feishuCard), /Studio Permission/);
    assert.match(JSON.stringify(action.body.feishuCard), /act:\/mode yolo/);

    const displayAction = await requestJson(`${baseUrl}/api/channel-connectors/commands/action`, {
      method: "POST",
      body: {
        actionValue: {
          action: "act:/stream off",
          binding_id: "octo-route",
          session_key: "dmwork:dm:route-user",
          surface_action_id: "stream-off",
          surface_section_id: "display",
          surface_view_id: "display",
        },
        fromUid: "route-user",
        channelId: "route-user",
        renderer: "all",
        models: ["gpt-5", "gpt-5.5"],
      },
    });
    assert.equal(displayAction.status, 200);
    assert.equal(displayAction.body.accepted, true);
    assert.equal(displayAction.body.commandResult.ok, true);
    assert.equal(displayAction.body.surface.current.streamMessages, false);
    assert.match(JSON.stringify(displayAction.body.feishuCard), /Studio Display/);
    assert.match(JSON.stringify(displayAction.body.feishuCard), /流式\/进度消息：关闭/);

    const cardAction = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/card-action`, {
      method: "POST",
      body: {
        actionValue: {
          action: "cmd:/native /help",
          binding_id: "octo-route",
          session_key: "dmwork:dm:route-user",
        },
        fromUid: "route-user",
        channelId: "route-user",
      },
    });
    assert.equal(cardAction.status, 200);
    assert.equal(cardAction.body.accepted, true);
    assert.equal(cardAction.body.command, "/native /help");
    assert.equal(cardAction.body.commandResult.handled, false);
    assert.equal(cardAction.body.commandResult.passthroughText, "/help");

    const botMenu = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/bot-menu`, {
      method: "POST",
      body: {
        bindingId: "octo-route",
        eventKey: "/status",
        fromUid: "route-user",
        channelId: "route-user",
      },
    });
    assert.equal(botMenu.status, 200);
    assert.equal(botMenu.body.accepted, true);
    assert.equal(botMenu.body.command, "/status");
    assert.match(botMenu.body.commandResult.replyText, /Studio Channel Status/);
    assert.match(JSON.stringify(botMenu.body.feishuCard), /Studio Session/);

    const botMenuNew = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/bot-menu`, {
      method: "POST",
      body: {
        bindingId: "octo-route",
        eventKey: "new",
        fromUid: "route-user",
        channelId: "route-user",
      },
    });
    assert.equal(botMenuNew.status, 200);
    assert.equal(botMenuNew.body.accepted, true);
    assert.equal(botMenuNew.body.command, "/new");
    assert.match(botMenuNew.body.commandResult.replyText, /已开启新的 Agent 会话/);
    assert.match(JSON.stringify(botMenuNew.body.feishuCard), /Studio Session/);

    const botMenuReset = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/bot-menu`, {
      method: "POST",
      body: {
        bindingId: "octo-route",
        eventKey: "reset",
        fromUid: "route-user",
        channelId: "route-user",
      },
    });
    assert.equal(botMenuReset.status, 200);
    assert.equal(botMenuReset.body.accepted, true);
    assert.equal(botMenuReset.body.command, "/reset");
    assert.match(botMenuReset.body.commandResult.replyText, /已重置本 IM 会话/);
    assert.match(JSON.stringify(botMenuReset.body.feishuCard), /Studio Session/);

    const feishuWebhook = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/webhook`, {
      method: "POST",
      body: {
        type: "url_verification",
        app_id: "cli_route",
        token: "route-token",
        challenge: "route-challenge",
      },
    });
    assert.equal(feishuWebhook.status, 200);
    assert.deepEqual(feishuWebhook.body, { challenge: "route-challenge" });

    const badFeishuWebhook = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/webhook`, {
      method: "POST",
      body: {
        type: "url_verification",
        app_id: "cli_route",
        token: "wrong-token",
        challenge: "route-challenge",
      },
    });
    assert.equal(badFeishuWebhook.status, 403);
    assert.equal(badFeishuWebhook.body.error, "feishu_webhook_verification_failed");
    assert.equal(badFeishuWebhook.body.skippedReason, "feishu_verification_token_mismatch");
    assert.equal(badFeishuWebhook.body.challenge, undefined);

    const feishuTransportSmoke = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/transport-smoke`, {
      method: "POST",
      body: {
        bindingId: "feishu-route",
        action: "tenant-token",
      },
    });
    assert.equal(feishuTransportSmoke.status, 200);
    assert.equal(feishuTransportSmoke.body.adapter, "feishu");
    assert.equal(feishuTransportSmoke.body.transport.error, "feishu_transport_config_missing");

    const octoSmoke = await requestJson(`${baseUrl}/api/channel-connectors/adapters/octo/incoming`, {
      method: "POST",
      body: {
        bindingId: "octo-route",
        dryRun: true,
        message: {
          messageId: "route-m-1",
          fromUid: "route-user",
          channelId: "route-user",
          channelType: 1,
          payload: {
            type: 1,
            content: "hello from route",
          },
        },
      },
    });
    assert.equal(octoSmoke.status, 200);
    assert.equal(octoSmoke.body.adapter, "octo");
    assert.equal(octoSmoke.body.accepted, true);
    assert.equal(octoSmoke.body.sessionKey, "dmwork:dm:route-user");
    assert.equal(octoSmoke.body.agentDispatch.agent, "opencode");

    const transportSmoke = await requestJson(`${baseUrl}/api/channel-connectors/adapters/octo/transport-smoke`, {
      method: "POST",
      body: {
        bindingId: "octo-route",
        action: "register",
      },
    });
    assert.equal(transportSmoke.status, 200);
    assert.equal(transportSmoke.body.adapter, "octo");
    assert.equal(transportSmoke.body.transport.error, "octo_transport_config_missing");

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

test("native Channel Connectors daemon registers Octo and opens WuKongIM WebSocket", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });

  const wsConnects = [];
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  const wsAddress = wss.address();
  assert.ok(wsAddress && typeof wsAddress === "object");
  const wsUrl = `ws://127.0.0.1:${wsAddress.port}/ws`;
  wss.on("connection", (socket) => {
    socket.on("message", (data) => {
      const packet = decodeOctoConnectPacket(Buffer.isBuffer(data) ? data : Buffer.from(data));
      wsConnects.push(packet);
      const serverKey = createOctoX25519KeyPair();
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt: "1234567890abcdef",
      }));
    });
  });

  try {
    const requests = [];
    await withServer(async (req, res) => {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
      await new Promise((resolve) => req.on("end", resolve));
      const bodyRaw = Buffer.concat(chunks).toString("utf8");
      requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization,
        body: bodyRaw ? JSON.parse(bodyRaw) : {},
      });
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-1", im_token: "im-token-1", ws_url: wsUrl }));
        return true;
      }
      return false;
    }, async (apiUrl) => {
      const initial = service.getNativeConfig().config;
      service.saveNativeConfig({
        config: {
          ...initial,
          agentProfiles: [
            {
              id: "codex-ws",
              name: "Codex WS",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: "http://127.0.0.1:18796/v1",
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-ws",
          platformBindings: [
            {
              id: "octo-ws",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo WS",
              agentProfileId: "codex-ws",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const configPath = path.join(root, "daemon-ws-config.json");
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
        const status = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-ws" && item.connected);
          return connected ? response.body : null;
        }, 5000);
        assert.equal(status.ok, true);
        assert.deepEqual(status.activeRuns, []);
        assert.deepEqual(status.agentRuns, []);
        assert.equal(wsConnects.length, 1);
        assert.equal(wsConnects[0].uid, "robot-1");
        assert.equal(wsConnects[0].token, "im-token-1");
        const cachePath = path.join(runtimeConfig.paths.state, "octo-credentials.json");
        const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        assert.equal(cache.bindings["octo-ws"].robotId, "robot-1");
        assert.equal(cache.bindings["octo-ws"].imToken, "im-token-1");
        assert.equal(cache.bindings["octo-ws"].wsUrl, wsUrl);
        assert.equal(requests[0].path, "/v1/bot/register");
      } finally {
        child.kill("SIGTERM");
        await new Promise((resolve) => {
          child.once("exit", resolve);
          setTimeout(resolve, 1000);
        });
      }

      assert.equal(stderr.trim(), "");
    });
  } finally {
    await new Promise((resolve, reject) => {
      wss.close((error) => error ? reject(error) : resolve());
    });
  }
});
