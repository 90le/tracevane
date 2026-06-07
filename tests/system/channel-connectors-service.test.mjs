import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
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
  renameChannelConnectorAgentSession,
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
  attachExtractedOctoAttachments,
} from "../../dist/apps/api/modules/channel-connectors/octo-adapter.js";
import {
  uploadAndSendOctoMedia,
  shouldDirectUploadOctoMedia,
  sendOctoHeartbeat,
} from "../../dist/apps/api/modules/channel-connectors/octo-transport.js";
import {
  addFeishuMessageReaction,
  downloadFeishuMessageResource,
  downloadFeishuMessageResourceToFile,
  listFeishuChatMembers,
  removeFeishuMessageReaction,
  sendFeishuTextMessage,
  uploadAndSendFeishuMedia,
} from "../../dist/apps/api/modules/channel-connectors/feishu-transport.js";
import {
  parseChannelConnectorByteSize,
  prepareChannelConnectorAttachmentStagingTarget,
  stageChannelConnectorAttachmentData,
  stageChannelConnectorAttachmentUrl,
} from "../../dist/apps/api/modules/channel-connectors/attachment-staging.js";
import {
  splitChannelConnectorTextChunks,
} from "../../dist/apps/api/modules/channel-connectors/text-chunks.js";
import {
  prepareChannelConnectorGroupBufferedReply,
  readChannelConnectorReplyBuffers,
} from "../../dist/apps/api/modules/channel-connectors/reply-buffer-store.js";
import {
  channelConnectorGatewaySecretCandidates,
  resolveChannelConnectorGatewayClientKey,
} from "../../dist/apps/api/modules/channel-connectors/gateway-secret.js";
import {
  evaluateChannelConnectorGovernance,
} from "../../dist/apps/api/modules/channel-connectors/governance-policy.js";
import {
  handleChannelConnectorCommand,
  listChannelConnectorGatewayModels,
  parseChannelConnectorCommand,
  resolveChannelConnectorEffectiveProject,
} from "../../dist/apps/api/modules/channel-connectors/command-router.js";
import {
  getChannelConnectorSessionControl,
} from "../../dist/apps/api/modules/channel-connectors/session-control-store.js";
import {
  appendChannelConnectorConversationHistory,
  clearChannelConnectorConversationHistory,
  compactChannelConnectorConversationHistory,
  getChannelConnectorConversationHistory,
  renderChannelConnectorConversationHistoryContext,
} from "../../dist/apps/api/modules/channel-connectors/conversation-history-store.js";
import {
  createOctoX25519KeyPair,
  decodeOctoConnectPacket,
  encodeOctoConnackPacket,
} from "../../dist/apps/api/modules/channel-connectors/octo-wukong.js";
import {
  countChannelConnectorVisualAttachments,
  resolveChannelConnectorVisualTurnProject,
} from "../../dist/apps/api/modules/channel-connectors/visual-model-routing.js";
import {
  extractChannelConnectorOutboundFiles,
  resolveChannelConnectorOutboundFiles,
} from "../../dist/apps/api/modules/channel-connectors/outbound-files.js";

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

function encodeVariableLength(length) {
  const output = [];
  let remaining = Math.max(0, Math.floor(length));
  do {
    let digit = remaining % 0x80;
    remaining = Math.floor(remaining / 0x80);
    if (remaining > 0) digit |= 0x80;
    output.push(digit);
  } while (remaining > 0);
  return Buffer.from(output);
}

function octoPacket(packetType, flags, body = Buffer.alloc(0)) {
  return Buffer.concat([
    Buffer.from([(packetType << 4) | (flags & 0x0f)]),
    encodeVariableLength(body.length),
    body,
  ]);
}

function octoString(value) {
  const raw = Buffer.from(String(value || ""), "utf8");
  const length = Buffer.alloc(2);
  length.writeInt16BE(raw.length, 0);
  return Buffer.concat([length, raw]);
}

function octoInt32(value) {
  const buffer = Buffer.alloc(4);
  buffer.writeInt32BE(value, 0);
  return buffer;
}

function octoInt64(value) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(value), 0);
  return buffer;
}

function publicKeyFromOctoRaw(rawBase64) {
  return crypto.createPublicKey({
    format: "der",
    type: "spki",
    key: Buffer.concat([
      Buffer.from("302a300506032b656e032100", "hex"),
      Buffer.from(rawBase64, "base64"),
    ]),
  });
}

function encryptOctoPayload(serverPrivateKey, clientPublicKeyBase64, salt, payload) {
  const sharedSecret = crypto.diffieHellman({
    privateKey: serverPrivateKey,
    publicKey: publicKeyFromOctoRaw(clientPublicKeyBase64),
  });
  const keyHex = crypto.createHash("md5").update(sharedSecret.toString("base64")).digest("hex").slice(0, 16);
  const key = Buffer.from(keyHex, "utf8");
  const iv = Buffer.from(salt.slice(0, 16), "utf8");
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  return Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(payload), "utf8")),
    cipher.final(),
  ]).toString("base64");
}

function encodeOctoRecvPacket(input) {
  const encrypted = Buffer.from(encryptOctoPayload(
    input.serverPrivateKey,
    input.clientPublicKeyBase64,
    input.salt,
    input.payload,
  ), "utf8");
  const body = Buffer.concat([
    Buffer.from([0]),
    octoString(""),
    octoString(input.fromUid || "route-user"),
    octoString(input.channelId || input.fromUid || "route-user"),
    Buffer.from([input.channelType || 1]),
    octoInt32(0),
    octoString(""),
    octoInt64(input.messageId || 1001),
    octoInt32(input.messageSeq || 1),
    octoInt32(input.timestamp || Math.floor(Date.now() / 1000)),
    encrypted,
  ]);
  return octoPacket(5, 0, body);
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
          { id: "gateway-gpt-5", object: "model", aliases: ["vision-main"], features: { text: true, vision: true, tools: true } },
          { id: "gateway-glm-5", object: "model", features: { text: true, vision: false } },
          { id: "gateway-gpt-5", object: "model", features: { vision: true } },
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
      const contentType = String(req.headers["content-type"] || "");
      const body = contentType.includes("multipart/form-data")
        ? { raw: bodyRaw }
        : req.method === "PUT"
          ? { raw: bodyRaw }
          : bodyRaw
            ? JSON.parse(bodyRaw)
            : {};
      requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization,
        xCosSecurityToken: req.headers["x-cos-security-token"],
        host: req.headers.host,
        contentLength: req.headers["content-length"],
        contentType,
        body,
      });
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-1", im_token: "im-token-1", ws_url: "wss://octo.example/ws" }));
        return;
      }
      if (req.url?.startsWith("/v1/bot/upload/credentials")) {
        res.end(JSON.stringify({
          bucket: "studio-bucket-123",
          region: "ap-beijing",
          key: "im-test/chat/1742547600/uuid_report.pdf",
          credentials: {
            tmpSecretId: "tmp-id",
            tmpSecretKey: "tmp-key",
            sessionToken: "session-token",
          },
          startTime: 1742547600,
          expiredTime: 1742549400,
          cdnBaseUrl: "https://cdn.example.test",
        }));
        return;
      }
      if (req.method === "PUT" && req.url?.startsWith("/im-test/chat/")) {
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.url === "/v1/bot/file/upload") {
        res.end(JSON.stringify({ url: "https://cdn.example.test/studio-octo-upload" }));
        return;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/sendMessage" || req.url === "/v1/bot/heartbeat") {
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
      const contentType = String(req.headers["content-type"] || "");
      const body = bodyRaw
        ? contentType.includes("multipart/form-data")
          ? { raw: bodyRaw }
          : JSON.parse(bodyRaw)
        : {};
      requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization,
        contentType,
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
      if (req.url === "/open-apis/im/v1/images" && req.method === "POST") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { image_key: "img_uploaded_1" },
        }));
        return;
      }
      if (req.url === "/open-apis/im/v1/files" && req.method === "POST") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { file_key: "file_uploaded_1" },
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
      if (/^\/open-apis\/im\/v1\/messages\/[^/]+\/resources\/[^?]+/.test(req.url || "") && req.method === "GET") {
        const body = Buffer.from(req.url?.includes("type=image") ? "mock-image-bytes" : "mock-file-bytes");
        res.setHeader("content-type", req.url?.includes("type=image") ? "image/png" : "application/octet-stream");
        res.setHeader("content-length", String(body.length));
        res.end(body);
        return;
      }
      if (req.url?.startsWith("/open-apis/im/v1/chats/oc_chat/members") && req.method === "GET") {
        const url = new URL(req.url, "http://127.0.0.1");
        const pageToken = url.searchParams.get("page_token");
        if (!pageToken) {
          res.end(JSON.stringify({
            code: 0,
            msg: "success",
            data: {
              has_more: true,
              page_token: "page-2",
              items: [
                { member_id: "ou_admin", name: "Admin" },
                { member_id: "ou_user_1", name: "Alice" },
              ],
            },
          }));
          return;
        }
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: {
            has_more: false,
            page_token: "",
            items: [
              { member_id: "ou_user_2", name: "Bob" },
              { member_id: "ou_user_1", name: "Alice Duplicate" },
            ],
          },
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

test("native Channel Connectors buffers long group replies without truncating stored content", () => {
  const root = makeTempRoot();
  const bufferPath = path.join(root, "state", "channel-reply-buffers.json");
  const longReply = `${"群聊长回复".repeat(260)}\nfinal line`;
  const buffered = prepareChannelConnectorGroupBufferedReply({
    filePath: bufferPath,
    bindingId: "octo-codex",
    sessionKey: "dmwork:group:group-a",
    messageId: "m-long-reply",
    platform: "octo",
    replyText: longReply,
    isGroup: true,
    thresholdRunes: 200,
    previewRunes: 80,
    now: new Date("2026-06-06T08:00:00.000Z"),
  });
  assert.equal(buffered.buffered, true);
  assert.ok(buffered.bufferId);
  assert.equal(buffered.originalRunes, Array.from(longReply).length);
  assert.ok(buffered.previewRunes <= 80);
  assert.match(buffered.replyText, /Studio 已缓存完整回复/);
  assert.doesNotMatch(buffered.replyText, /final line$/);
  assert.equal(fs.statSync(bufferPath).mode & 0o777, 0o600);
  const stored = readChannelConnectorReplyBuffers(bufferPath);
  assert.equal(stored.records.length, 1);
  assert.equal(stored.records[0].id, buffered.bufferId);
  assert.equal(stored.records[0].replyText, longReply);

  const direct = prepareChannelConnectorGroupBufferedReply({
    filePath: bufferPath,
    bindingId: "octo-codex",
    sessionKey: "dmwork:dm:user-a",
    messageId: "m-dm-long-reply",
    platform: "octo",
    replyText: longReply,
    isGroup: false,
    thresholdRunes: 200,
  });
  assert.equal(direct.buffered, false);
  assert.equal(direct.replyText, longReply);
  assert.equal(readChannelConnectorReplyBuffers(bufferPath).records.length, 1);
});

test("native Channel Connectors governance policy enforces allowlist, banned words, and rate limits", () => {
  const root = makeTempRoot();
  const statePath = path.join(root, "state", "channel-governance.json");
  const binding = {
    id: "feishu-live",
    platform: "feishu",
    accountId: "cli_test",
    botId: "bot_test",
    displayName: "Feishu Live",
    agent: "codex",
    enabled: true,
    allowlist: ["ou_allowed"],
    adminUsers: ["ou_admin"],
    metadata: {
      bannedWords: ["blocked phrase"],
      rateLimitPerMinute: 2,
      rateLimitWindowSeconds: 60,
    },
  };
  const blockedUser = evaluateChannelConnectorGovernance({
    binding,
    platform: "feishu",
    fromUid: "ou_guest",
    content: "hello",
    statePath,
    now: new Date("2026-06-06T08:00:00.000Z"),
  });
  assert.equal(blockedUser.allowed, false);
  assert.equal(blockedUser.skippedReason, "channel_user_not_allowed");

  const blockedWord = evaluateChannelConnectorGovernance({
    binding,
    platform: "feishu",
    fromUid: "ou_admin",
    content: "contains BLOCKED PHRASE",
    statePath,
    now: new Date("2026-06-06T08:00:01.000Z"),
  });
  assert.equal(blockedWord.allowed, false);
  assert.equal(blockedWord.skippedReason, "channel_banned_word");

  const first = evaluateChannelConnectorGovernance({
    binding,
    platform: "feishu",
    fromUid: "ou_allowed",
    content: "one",
    statePath,
    now: new Date("2026-06-06T08:00:02.000Z"),
  });
  const second = evaluateChannelConnectorGovernance({
    binding,
    platform: "feishu",
    fromUid: "ou_allowed",
    content: "two",
    statePath,
    now: new Date("2026-06-06T08:00:03.000Z"),
  });
  const third = evaluateChannelConnectorGovernance({
    binding,
    platform: "feishu",
    fromUid: "ou_allowed",
    content: "three",
    statePath,
    now: new Date("2026-06-06T08:00:04.000Z"),
  });
  assert.equal(first.allowed, true);
  assert.equal(first.rateLimit.remaining, 1);
  assert.equal(second.allowed, true);
  assert.equal(second.rateLimit.remaining, 0);
  assert.equal(third.allowed, false);
  assert.equal(third.skippedReason, "channel_rate_limited");
  assert.equal(fs.statSync(statePath).mode & 0o777, 0o600);
});

test("native Channel Connectors stages attachments under sanitized local paths", async () => {
  assert.equal(parseChannelConnectorByteSize("512mb", 1), 512 * 1024 * 1024);
  assert.equal(parseChannelConnectorByteSize("2gb", 1), 2 * 1024 * 1024 * 1024);
  assert.equal(parseChannelConnectorByteSize("0", 1), Number.POSITIVE_INFINITY);
  assert.equal(parseChannelConnectorByteSize("unlimited", 1), Number.POSITIVE_INFINITY);
  assert.equal(parseChannelConnectorByteSize("bad-size", 123), 123);

  const root = makeTempRoot();
  const staged = stageChannelConnectorAttachmentData({
    attachment: {
      kind: "file",
      platform: "feishu",
      fileName: "../../report final?.txt",
      fileKey: "private-file-key",
    },
    data: Buffer.from("hello attachment", "utf8"),
    rootDir: root,
    messageId: "om/../../message",
    index: 0,
    mimeType: "text/plain",
    maxBytes: 1024,
    now: new Date("2026-06-06T08:00:00.000Z"),
  });
  assert.ok(staged.localPath);
  assert.equal(staged.mimeType, "text/plain");
  assert.equal(staged.size, Buffer.byteLength("hello attachment"));
  assert.equal(staged.stagedAt, "2026-06-06T08:00:00.000Z");
  assert.equal(staged.stagingError, null);
  assert.equal(staged.localPath.startsWith(path.join(root, "attachments")), true);
  assert.doesNotMatch(staged.localPath, /\.\./);
  assert.equal(path.basename(staged.localPath), "1-report final_.txt");
  assert.equal(fs.readFileSync(staged.localPath, "utf8"), "hello attachment");
  assert.throws(() => stageChannelConnectorAttachmentData({
    attachment: {
      kind: "image",
      platform: "feishu",
      imageKey: "img-key",
    },
    data: Buffer.alloc(3),
    rootDir: root,
    messageId: "om-size",
    index: 0,
    mimeType: "image/png",
    maxBytes: 2,
  }), /Attachment exceeds size limit/);

  await withServer(async (req, res) => {
    if (req.url === "/artifact.bin") {
      const body = Buffer.from("downloaded octo attachment", "utf8");
      res.setHeader("content-type", "application/octet-stream");
      res.setHeader("content-length", String(body.length));
      res.end(body);
      return true;
    }
    if (req.url === "/too-large.bin") {
      const body = Buffer.from("larger than limit", "utf8");
      res.setHeader("content-type", "application/octet-stream");
      res.setHeader("content-length", String(body.length));
      res.end(body);
      return true;
    }
    return false;
  }, async (baseUrl) => {
    const privateRejected = await stageChannelConnectorAttachmentUrl({
      attachment: {
        kind: "file",
        platform: "octo",
        url: `${baseUrl}/artifact.bin`,
        fileName: "artifact.bin",
      },
      url: `${baseUrl}/artifact.bin`,
      rootDir: root,
      messageId: "octo-private-default",
      index: 0,
      maxBytes: 1024,
    });
    assert.equal(privateRejected.ok, false);
    assert.match(privateRejected.error, /private network/);

    const urlStaged = await stageChannelConnectorAttachmentUrl({
      attachment: {
        kind: "file",
        platform: "octo",
        url: `${baseUrl}/artifact.bin`,
        fileName: "../../龙虾 计划(最终版)?.bin",
      },
      url: `${baseUrl}/artifact.bin`,
      rootDir: root,
      messageId: "octo-url/../../message",
      index: 1,
      maxBytes: 1024,
      allowPrivateNetwork: true,
      now: new Date("2026-06-06T08:01:00.000Z"),
    });
    assert.equal(urlStaged.ok, true);
    assert.equal(urlStaged.attachment.platform, "octo");
    assert.equal(urlStaged.attachment.size, Buffer.byteLength("downloaded octo attachment"));
    assert.equal(urlStaged.attachment.stagedAt, "2026-06-06T08:01:00.000Z");
    assert.ok(urlStaged.attachment.localPath);
    assert.doesNotMatch(urlStaged.attachment.localPath, /\.\./);
    assert.equal(path.basename(urlStaged.attachment.localPath), "2-龙虾 计划(最终版)_.bin");
    assert.equal(fs.readFileSync(urlStaged.attachment.localPath, "utf8"), "downloaded octo attachment");

    const tooLarge = await stageChannelConnectorAttachmentUrl({
      attachment: {
        kind: "file",
        platform: "octo",
        url: `${baseUrl}/too-large.bin`,
        fileName: "too-large.bin",
      },
      url: `${baseUrl}/too-large.bin`,
      rootDir: root,
      messageId: "octo-too-large",
      index: 2,
      maxBytes: 4,
      allowPrivateNetwork: true,
    });
    assert.equal(tooLarge.ok, false);
    assert.match(tooLarge.error, /exceeds size limit/);
    assert.equal(tooLarge.localPath, null);
    assert.equal(tooLarge.attachment.localPath, undefined);
  });
});

test("native Channel Connectors resolves outbound file manifests under the Agent workdir", () => {
  const root = makeTempRoot();
  const workDir = path.join(root, "workspace");
  const runtimeDir = path.join(root, "runtime");
  fs.mkdirSync(path.join(workDir, "exports"), { recursive: true });
  fs.mkdirSync(path.join(runtimeDir, "attachments", "m1"), { recursive: true });
  fs.writeFileSync(path.join(workDir, "exports", "report.txt"), "report body", "utf8");
  fs.writeFileSync(path.join(runtimeDir, "attachments", "m1", "received.bin"), "received body", "utf8");
  fs.writeFileSync(path.join(root, "outside.txt"), "outside", "utf8");

  const extracted = extractChannelConnectorOutboundFiles([
    "报告已生成。",
    "```studio-channel-files",
    JSON.stringify([
      { path: "exports/report.txt", name: "final-report.txt", caption: "报告文件" },
      { path: path.join(runtimeDir, "attachments", "m1", "received.bin"), name: "received.bin" },
      { path: path.join(root, "outside.txt"), name: "outside.txt" },
    ]),
    "```",
  ].join("\n"));

  assert.equal(extracted.replyText, "报告已生成。");
  assert.equal(extracted.files.length, 3);
  assert.deepEqual(extracted.errors, []);

  const resolved = resolveChannelConnectorOutboundFiles({
    files: extracted.files,
    workDir,
    allowedRootDirs: [runtimeDir],
    maxBytes: 1024,
  });
  assert.equal(resolved.files.length, 2);
  assert.equal(resolved.files[0].fileName, "final-report.txt");
  assert.equal(resolved.files[0].mimeType, "text/plain");
  assert.equal(resolved.files[0].size, Buffer.byteLength("report body"));
  assert.equal(resolved.files[0].caption, "报告文件");
  assert.equal(resolved.files[1].fileName, "received.bin");
  assert.equal(resolved.files[1].mimeType, "application/octet-stream");
  assert.match(resolved.errors.join("\n"), /outside the allowed Agent file roots/);

  const yoloResolved = resolveChannelConnectorOutboundFiles({
    files: [{ path: path.join(root, "outside.txt"), name: "outside original.txt" }],
    workDir,
    allowedRootDirs: [runtimeDir],
    allowAnyPath: true,
    maxBytes: 1024,
  });
  assert.equal(yoloResolved.files.length, 1);
  assert.equal(yoloResolved.files[0].fileName, "outside original.txt");
  assert.deepEqual(yoloResolved.errors, []);

  const invalid = extractChannelConnectorOutboundFiles([
    "bad",
    "```studio-channel-files",
    "{nope",
    "```",
  ].join("\n"));
  assert.equal(invalid.replyText, "bad");
  assert.equal(invalid.files.length, 0);
  assert.match(invalid.errors.join("\n"), /JSON/);
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

  const mediaUrlMessage = await service.dispatchOctoIncoming({
    bindingId: "octo-default",
    dryRun: true,
    message: {
      messageId: "m-image-media-url",
      fromUid: "user-1",
      channelId: "user-1",
      channelType: 1,
      payload: {
        type: 2,
        mediaUrl: "https://cdn.example.test/inbound-image.png",
        name: "inbound-image.png",
        size: 123,
      },
    },
  });
  assert.equal(mediaUrlMessage.accepted, true);
  assert.equal(mediaUrlMessage.incoming.content, "[image]");
  assert.equal(mediaUrlMessage.incoming.attachments.length, 1);
  assert.equal(mediaUrlMessage.incoming.attachments[0].kind, "image");
  assert.equal(mediaUrlMessage.incoming.attachments[0].url, "https://cdn.example.test/inbound-image.png");
  assert.equal(mediaUrlMessage.incoming.attachments[0].fileName, "inbound-image.png");

  const richTextMessage = await service.dispatchOctoIncoming({
    bindingId: "octo-default",
    dryRun: true,
    message: {
      messageId: "m-rich-text",
      fromUid: "user-1",
      channelId: "user-1",
      channelType: 1,
      payload: {
        type: 14,
        content: [
          { type: "text", text: "上图：" },
          { type: "image", url: "https://cdn.example.test/rich-a.png", name: "rich-a.png", size: 456 },
          { type: "text", text: "下图" },
        ],
        mediaUrls: ["https://cdn.example.test/rich-b.png"],
      },
    },
  });
  assert.equal(richTextMessage.accepted, true);
  assert.equal(richTextMessage.incoming.content, "上图：[图片]下图");
  assert.equal(richTextMessage.incoming.attachments.length, 2);
  assert.equal(richTextMessage.incoming.attachments[0].kind, "image");
  assert.equal(richTextMessage.incoming.attachments[0].url, "https://cdn.example.test/rich-a.png");
  assert.equal(richTextMessage.incoming.attachments[0].fileName, "rich-a.png");
  assert.equal(richTextMessage.incoming.attachments[1].url, "https://cdn.example.test/rich-b.png");

  const gifMessage = attachExtractedOctoAttachments({
    messageId: "m-gif-daemon-ready",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: {
      type: 3,
      url: "https://cdn.example.test/loop.gif",
      name: "loop.gif",
    },
  });
  assert.equal(gifMessage.attachments.length, 1);
  assert.equal(gifMessage.attachments[0].kind, "image");
  assert.equal(gifMessage.attachments[0].url, "https://cdn.example.test/loop.gif");

  const daemonReadyImage = attachExtractedOctoAttachments({
    messageId: "m-image-daemon-ready",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: {
      type: 2,
      mediaUrl: "https://cdn.example.test/daemon-image.png",
      name: "daemon-image.png",
    },
  });
  assert.equal(daemonReadyImage.attachments.length, 1);
  assert.equal(daemonReadyImage.attachments[0].kind, "image");
  assert.equal(daemonReadyImage.attachments[0].url, "https://cdn.example.test/daemon-image.png");

  const daemonReadyImageWithoutUrl = attachExtractedOctoAttachments({
    messageId: "m-image-daemon-no-url",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: {
      type: 2,
      name: "no-url.png",
    },
  });
  assert.equal(daemonReadyImageWithoutUrl.attachments.length, 1);
  assert.equal(daemonReadyImageWithoutUrl.attachments[0].kind, "image");
  assert.equal(daemonReadyImageWithoutUrl.attachments[0].url, null);

  const rawAttachmentMessage = await service.dispatchOctoIncoming({
    bindingId: "octo-default",
    dryRun: true,
    message: {
      messageId: "m-file-raw-url",
      fromUid: "user-1",
      channelId: "user-1",
      channelType: 1,
      payload: {
        type: 8,
        name: "report.pdf",
      },
      attachments: [{
        kind: "file",
        platform: "octo",
        fileName: "report.pdf",
        download_url: "https://cdn.example.test/report.pdf",
      }],
    },
  });
  assert.equal(rawAttachmentMessage.accepted, true);
  assert.equal(rawAttachmentMessage.incoming.attachments.length, 1);
  assert.equal(rawAttachmentMessage.incoming.attachments[0].url, "https://cdn.example.test/report.pdf");

  const denied = await service.dispatchOctoIncoming({
    bindingId: "octo-default",
    dryRun: true,
    message: {
      messageId: "m-denied",
      fromUid: "user-2",
      channelId: "user-2",
      channelType: 1,
      payload: {
        type: 1,
        content: "hi",
      },
    },
  });
  assert.equal(denied.accepted, false);
  assert.equal(denied.skippedReason, "channel_user_not_allowed");
  assert.equal(denied.agentDispatch.status, "skipped");
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

test("Octo transport sends CC-compatible REST heartbeat", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const result = await sendOctoHeartbeat({
      apiUrl,
      botToken: "octo-token",
    });
    assert.equal(result.ok, true);
    assert.equal(result.action, "heartbeat");
    assert.equal(result.requestCount, 1);
    const request = requests.find((item) => item.path === "/v1/bot/heartbeat");
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.authorization, "Bearer octo-token");
  });
});

test("Octo transport upload strategy switches direct upload by size", () => {
  assert.equal(shouldDirectUploadOctoMedia({ apiUrl: "https://octo.test", botToken: "token" }, 1024), false);
  assert.equal(shouldDirectUploadOctoMedia({ apiUrl: "https://octo.test", botToken: "token" }, 9 * 1024 * 1024), true);
  assert.equal(shouldDirectUploadOctoMedia({ apiUrl: "https://octo.test", botToken: "token", uploadStrategy: "direct" }, 1), true);
  assert.equal(shouldDirectUploadOctoMedia({ apiUrl: "https://octo.test", botToken: "token", uploadStrategy: "multipart" }, 99 * 1024 * 1024), false);
  assert.equal(shouldDirectUploadOctoMedia({
    apiUrl: "https://octo.test",
    botToken: "token",
    directUploadMinBytes: 1,
  }, 1), true);
});

test("Octo transport smoke probes STS upload credentials without exposing secrets", async () => {
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
            id: "octo-sts",
            platform: "octo",
            accountId: "octo-account",
            botId: "robot-1",
            displayName: "Octo STS",
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
      bindingId: "octo-sts",
      action: "upload-credentials",
      fileName: "龙虾 计划(最终版).pdf",
    });

    assert.equal(result.transport.ok, true);
    assert.equal(result.transport.action, "upload-credentials");
    assert.equal(result.transport.fileName, "龙虾 计划(最终版).pdf");
    assert.equal(result.transport.uploadBucket, "studio-bucket-123");
    assert.equal(result.transport.uploadRegion, "ap-beijing");
    assert.equal(result.transport.uploadKey, "im-test/chat/1742547600/uuid_report.pdf");
    assert.equal(result.transport.uploadCdnBaseUrl, "https://cdn.example.test");
    assert.equal(result.transport.uploadExpiredTime, 1742549400);
    assert.deepEqual(result.transport.uploadCredentialKeys, ["tmpSecretId", "tmpSecretKey", "sessionToken"]);
    assert.equal(JSON.stringify(result.transport).includes("tmp-key"), false);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].authorization, "Bearer test-token");
    assert.equal(
      requests[0].path,
      `/v1/bot/upload/credentials?filename=${encodeURIComponent("龙虾 计划(最终版).pdf")}`,
    );
  });
});

test("Octo transport direct uploads through COS STS and sends media", async () => {
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
            id: "octo-direct-upload",
            platform: "octo",
            accountId: "octo-account",
            botId: "robot-1",
            displayName: "Octo Direct Upload",
            agentProfileId: initial.defaultAgentProfileId,
            enabled: true,
            allowlist: [],
            adminUsers: [],
            metadata: {
              apiUrl,
              botToken: "test-token",
              cosUploadBaseUrl: apiUrl,
            },
          },
        ],
      },
    });

    const result = await service.runOctoTransportSmoke({
      bindingId: "octo-direct-upload",
      action: "direct-upload-and-send-media",
      channelId: "user-2",
      channelType: 1,
      content: "direct body",
      fileName: "龙虾 大文件.pdf",
      mimeType: "application/pdf",
    });

    assert.equal(result.transport.ok, true);
    assert.equal(result.transport.action, "direct-upload-and-send-media");
    assert.equal(result.transport.requestCount, 3);
    assert.equal(result.transport.mediaUrl, "https://cdn.example.test/im-test/chat/1742547600/uuid_report.pdf");
    assert.equal(result.transport.fileName, "龙虾 大文件.pdf");
    assert.equal(result.transport.mimeType, "application/pdf");
    assert.equal(result.transport.size, Buffer.byteLength("direct body"));
    assert.equal(result.transport.uploadBucket, "studio-bucket-123");
    assert.equal(result.transport.uploadRegion, "ap-beijing");
    assert.equal(result.transport.uploadKey, "im-test/chat/1742547600/uuid_report.pdf");
    assert.deepEqual(result.transport.uploadCredentialKeys, ["tmpSecretId", "tmpSecretKey", "sessionToken"]);
    assert.equal(JSON.stringify(result.transport).includes("tmp-key"), false);
    assert.equal(JSON.stringify(result.transport).includes("session-token"), false);

    assert.equal(requests.length, 3);
    assert.equal(requests[0].method, "GET");
    assert.equal(requests[0].path, `/v1/bot/upload/credentials?filename=${encodeURIComponent("龙虾 大文件.pdf")}`);
    assert.equal(requests[1].method, "PUT");
    assert.equal(requests[1].path, "/im-test/chat/1742547600/uuid_report.pdf");
    assert.match(requests[1].authorization, /q-sign-algorithm=sha1/);
    assert.match(requests[1].authorization, /q-ak=tmp-id/);
    assert.match(requests[1].authorization, /q-signature=/);
    assert.equal(requests[1].xCosSecurityToken, "session-token");
    assert.equal(requests[1].contentType, "application/pdf");
    assert.equal(requests[1].body.raw, "direct body");
    assert.equal(requests[2].path, "/v1/bot/sendMessage");
    assert.deepEqual(requests[2].body, {
      channel_id: "user-2",
      channel_type: 1,
      payload: {
        type: 8,
        url: "https://cdn.example.test/im-test/chat/1742547600/uuid_report.pdf",
        name: "龙虾 大文件.pdf",
        size: Buffer.byteLength("direct body"),
      },
    });
  });
});

test("Octo upload-and-send media auto routes large files to direct upload", async () => {
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
            id: "octo-auto-upload",
            platform: "octo",
            accountId: "octo-account",
            botId: "robot-1",
            displayName: "Octo Auto Upload",
            agentProfileId: initial.defaultAgentProfileId,
            enabled: true,
            allowlist: [],
            adminUsers: [],
            metadata: {
              apiUrl,
              botToken: "test-token",
              cosUploadBaseUrl: apiUrl,
              octoDirectUploadMinBytes: 1,
            },
          },
        ],
      },
    });

    const result = await service.runOctoTransportSmoke({
      bindingId: "octo-auto-upload",
      action: "upload-and-send-media",
      channelId: "user-2",
      channelType: 1,
      content: "auto direct body",
      fileName: "auto-direct.pdf",
      mimeType: "application/pdf",
    });

    assert.equal(result.transport.ok, true);
    assert.equal(result.transport.action, "direct-upload-and-send-media");
    assert.equal(result.transport.requestCount, 3);
    assert.equal(requests[0].path, `/v1/bot/upload/credentials?filename=${encodeURIComponent("auto-direct.pdf")}`);
    assert.equal(requests[1].method, "PUT");
    assert.equal(requests[2].path, "/v1/bot/sendMessage");
  });
});

test("Octo transport preserves outbound upload file names", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const result = await uploadAndSendOctoMedia({
      apiUrl,
      botToken: "octo-token",
    }, {
      channelId: "user-2",
      channelType: 1,
      data: Buffer.from("named file"),
      fileName: "龙虾 计划(最终版).md",
      mimeType: "text/markdown",
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, "upload-and-send-media");
    assert.equal(result.fileName, "龙虾 计划(最终版).md");
    assert.equal(requests[0].path, "/v1/bot/file/upload");
    assert.match(requests[0].body.raw, /filename="龙虾 计划\(最终版\)\.md"/);
    assert.equal(requests[1].path, "/v1/bot/sendMessage");
    assert.equal(requests[1].body.payload.name, "龙虾 计划(最终版).md");
  });
});

test("Octo transport smoke uploads and sends media through binding metadata", async () => {
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
            id: "octo-media",
            platform: "octo",
            accountId: "octo-account",
            botId: "robot-1",
            displayName: "Octo Media",
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
      bindingId: "octo-media",
      action: "upload-and-send-media",
      channelId: "user-2",
      channelType: 1,
      content: "mock image bytes",
      fileName: "diagram.png",
      mimeType: "image/png",
    });

    assert.equal(result.transport.ok, true);
    assert.equal(result.transport.action, "upload-and-send-media");
    assert.equal(result.transport.requestCount, 2);
    assert.equal(result.transport.mediaUrl, "https://cdn.example.test/studio-octo-upload");
    assert.equal(result.transport.fileName, "diagram.png");
    assert.equal(result.transport.mimeType, "image/png");
    assert.equal(result.transport.size, Buffer.byteLength("mock image bytes"));
    assert.equal(requests.length, 2);
    assert.equal(requests[0].path, "/v1/bot/file/upload");
    assert.equal(requests[0].authorization, "Bearer test-token");
    assert.match(requests[0].contentType, /multipart\/form-data/);
    assert.match(requests[0].body.raw, /name="file"; filename="diagram\.png"/);
    assert.match(requests[0].body.raw, /mock image bytes/);
    assert.equal(requests[1].path, "/v1/bot/sendMessage");
    assert.deepEqual(requests[1].body, {
      channel_id: "user-2",
      channel_type: 1,
      payload: {
        type: 2,
        url: "https://cdn.example.test/studio-octo-upload",
        name: "diagram.png",
        size: Buffer.byteLength("mock image bytes"),
      },
    });
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
  assert.match(processRequest.stdin, /^hi codex/);
  assert.match(processRequest.stdin, /studio-channel-files/);
  assert.doesNotMatch(processRequest.stdin, /cc-connect/);
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

  const codexReasoningRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, reasoningEffort: "high" },
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(codexReasoningRequest);
  assert.equal(codexReasoningRequest.args.includes('model_reasoning_effort="high"'), true);
  const codexReasoningConfig = fs.readFileSync(path.join(codexReasoningRequest.env.CODEX_HOME, "config.toml"), "utf8");
  assert.match(codexReasoningConfig, /model_reasoning_effort = "high"/);
  for (const cleanupPath of codexReasoningRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const historyRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    historyContext: [
      "[Studio IM history context]",
      "1. user: earlier question",
      "2. assistant: earlier answer",
    ].join("\n"),
  });
  assert.ok(historyRequest);
  assert.match(historyRequest.stdin, /^\[Studio IM history context\]/);
  assert.match(historyRequest.stdin, /earlier question/);
  assert.match(historyRequest.stdin, /\n\nhi codex\n\n\[Studio outbound file policy\]/);
  assert.doesNotMatch(historyRequest.stdin, /cc-connect/);
  for (const cleanupPath of historyRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const groupRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message: {
      messageId: "m-group-1",
      fromUid: "user-2",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "@Studio hi group",
        mention: { uids: ["robot-1"] },
        reply: { messageId: "m-parent-1" },
      },
      members: [
        { uid: "user-2", name: "Alice" },
        { uid: "robot-1", name: "Studio" },
      ],
    },
    sessionKey: "dmwork:group:group-a",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(groupRequest);
  assert.match(groupRequest.stdin, /\[Studio group context\]/);
  assert.match(groupRequest.stdin, /Channel: group-a \(type 2\)/);
  assert.match(groupRequest.stdin, /Sender: user-2/);
  assert.match(groupRequest.stdin, /Mentioned users: robot-1/);
  assert.match(groupRequest.stdin, /Reply to message: m-parent-1/);
  assert.match(groupRequest.stdin, /Known members: Alice\(user-2\), Studio\(robot-1\)/);
  assert.match(groupRequest.stdin, /\n\nhi group\n\n\[Studio outbound file policy\]/);
  assert.doesNotMatch(groupRequest.stdin, /cc-connect/);
  for (const cleanupPath of groupRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
      assert.match(request.stdin, /^hi codex/);
      assert.match(request.stdin, /studio-channel-files/);
      assert.doesNotMatch(request.stdin, /cc-connect/);
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
    project: { ...project, agent: "claude-code", permissionMode: "plan", reasoningEffort: "xhigh" },
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
  assert.equal(claudeRequest.args.includes("--effort"), true);
  assert.equal(claudeRequest.args.includes("max"), true);
  const claudeInput = JSON.parse(claudeRequest.stdin);
  assert.match(claudeInput.message.content, /^hi codex/);
  assert.match(claudeInput.message.content, /studio-channel-files/);
  assert.doesNotMatch(claudeRequest.stdin, /cc-connect/);
  assert.equal(claudeRequest.env.ANTHROPIC_API_KEY, "sk-local");
  assert.equal(claudeRequest.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:18796");

  const opencodeRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", permissionMode: "yolo", reasoningEffort: "high" },
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
  assert.equal(opencodeRequest.args.includes("--variant"), true);
  assert.equal(opencodeRequest.args.includes("high"), true);
  assert.match(opencodeRequest.args.at(-1), /^hi codex/);
  assert.match(opencodeRequest.args.at(-1), /studio-channel-files/);
  assert.doesNotMatch(opencodeRequest.args.at(-1), /cc-connect/);

  const codexNativeHelpRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: null,
    historyContext: "[Studio IM history context]\n1. user: should not leak",
    nativeCommand: "/help exec",
  });
  assert.ok(codexNativeHelpRequest);
  assert.equal(codexNativeHelpRequest.command, "codex");
  assert.deepEqual(codexNativeHelpRequest.args, ["exec", "--help"]);
  assert.equal(codexNativeHelpRequest.stdin, "");
  assert.equal(codexNativeHelpRequest.nativeCommand, "/help exec");
  assert.equal(codexNativeHelpRequest.env.OPENAI_API_KEY, undefined);

  const codexNativeResult = await runChannelConnectorAgentTurn({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: null,
    nativeCommand: "/help",
    historyContext: "[Studio IM history context]\n1. user: should not leak",
    processRunner: async (request) => {
      assert.equal(request.command, "codex");
      assert.deepEqual(request.args, ["--help"]);
      assert.equal(request.stdin, "");
      assert.equal(request.nativeCommand, "/help");
      assert.equal(request.env.OPENAI_API_KEY, undefined);
      return {
        exitCode: 0,
        signal: null,
        stdout: "Codex CLI help\n",
        stderr: "",
        durationMs: 8,
        timedOut: false,
        cancelled: false,
        error: null,
      };
    },
  });
  assert.equal(codexNativeResult.ok, true);
  assert.equal(codexNativeResult.replyText, "Codex CLI help");

  const codexUnsupportedNative = await runChannelConnectorAgentTurn({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    nativeCommand: "/compact",
  });
  assert.equal(codexUnsupportedNative.attempted, false);
  assert.equal(codexUnsupportedNative.status, "failed");
  assert.match(codexUnsupportedNative.error, /not supported through the non-interactive exec runner/);
  assert.match(codexUnsupportedNative.error, /must not be sent as ordinary model text/);

  const claudeNativeRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "claude-code", permissionMode: "plan" },
    binding: { ...binding, agent: "claude-code" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    historyContext: "[Studio IM history context]\n1. user: should not leak",
    nativeCommand: "/help",
  });
  assert.ok(claudeNativeRequest);
  assert.equal(claudeNativeRequest.nativeCommand, "/help");
  assert.match(claudeNativeRequest.stdin, /"content":"\/help"/);
  assert.doesNotMatch(claudeNativeRequest.stdin, /should not leak/);

  const opencodeNativeRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", permissionMode: "yolo" },
    binding: { ...binding, agent: "opencode" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    historyContext: "[Studio IM history context]\n1. user: should not leak",
    nativeCommand: "/help",
  });
  assert.ok(opencodeNativeRequest);
  assert.equal(opencodeNativeRequest.nativeCommand, "/help");
  assert.equal(opencodeNativeRequest.args.at(-1), "/help");
  assert.doesNotMatch(opencodeNativeRequest.args.join(" "), /should not leak/);

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
  assert.match(attachmentRequest.stdin, /studio-channel-files/);
  assert.match(attachmentRequest.stdin, /image: diagram\.png/);
  assert.match(attachmentRequest.stdin, /Do not infer visual contents/);
  assert.doesNotMatch(attachmentRequest.stdin, /feishu-private-image-key/);
  assert.doesNotMatch(attachmentRequest.stdin, /cc-connect/);
  for (const cleanupPath of attachmentRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const visionImagePath = path.join(workDir, ".studio-agent-attachments", "vision.png");
  fs.mkdirSync(path.dirname(visionImagePath), { recursive: true });
  fs.writeFileSync(visionImagePath, Buffer.from("fake-png"));
  const visionAttachmentRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, model: "gmn-vision" },
    binding,
    message: {
      ...message,
      messageId: "m-runner-vision-image",
      payload: { type: 2, content: "", name: "vision.png" },
      attachments: [{
        kind: "image",
        platform: "feishu",
        fileName: "vision.png",
        mimeType: "image/png",
        localPath: visionImagePath,
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: true },
  });
  assert.ok(visionAttachmentRequest);
  const visionImageArgIndex = visionAttachmentRequest.args.indexOf("--image");
  assert.notEqual(visionImageArgIndex, -1);
  assert.equal(visionAttachmentRequest.args[visionImageArgIndex + 1], visionImagePath);
  assert.match(visionAttachmentRequest.stdin, /native --image arguments/);
  assert.doesNotMatch(visionAttachmentRequest.stdin, /Studio visual attachment policy/);
  for (const cleanupPath of visionAttachmentRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const resumeVisionAttachmentRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, model: "gmn-vision" },
    binding,
    message: {
      ...message,
      messageId: "m-runner-resume-vision-image",
      payload: { type: 2, content: "", name: "vision.png" },
      attachments: [{
        kind: "image",
        platform: "feishu",
        fileName: "vision.png",
        mimeType: "image/png",
        localPath: visionImagePath,
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    session: { codexThreadId: "thread-vision" },
    modelCapabilities: { vision: true },
  });
  assert.ok(resumeVisionAttachmentRequest);
  assert.equal(resumeVisionAttachmentRequest.sessionMode, "resume");
  const resumeImageArgIndex = resumeVisionAttachmentRequest.args.indexOf("--image");
  const resumeThreadArgIndex = resumeVisionAttachmentRequest.args.indexOf("thread-vision");
  assert.notEqual(resumeImageArgIndex, -1);
  assert.ok(resumeImageArgIndex < resumeThreadArgIndex);
  assert.equal(resumeVisionAttachmentRequest.args[resumeImageArgIndex + 1], visionImagePath);
  for (const cleanupPath of resumeVisionAttachmentRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const stagedLocalPath = path.join(workDir, ".studio-agent-attachments", "report.txt");
  const stagedAttachmentRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message: {
      ...message,
      messageId: "m-runner-staged-file",
      payload: { type: 8, content: "", name: "report.txt" },
      attachments: [{
        kind: "file",
        platform: "feishu",
        fileName: "report.txt",
        size: 123,
        localPath: stagedLocalPath,
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(stagedAttachmentRequest);
  assert.match(stagedAttachmentRequest.stdin, /\[file: report\.txt\]/);
  assert.match(stagedAttachmentRequest.stdin, new RegExp(stagedLocalPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(stagedAttachmentRequest.stdin, /Staged files are available locally/);
  assert.doesNotMatch(stagedAttachmentRequest.stdin, /Binary download\/staging is not enabled/);
  for (const cleanupPath of stagedAttachmentRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  let nonVisionRunnerCalled = false;
  const nonVisionImageResult = await runChannelConnectorAgentTurn({
    project: { ...project, model: "glm-5" },
    binding,
    message: {
      ...message,
      messageId: "m-runner-non-vision-image",
      payload: { type: 2, content: "", name: "photo.jpg", url: "https://example.invalid/photo.jpg" },
      attachments: [{
        kind: "image",
        platform: "octo",
        fileName: "photo.jpg",
        localPath: path.join(workDir, ".studio-agent-attachments", "photo.jpg"),
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async (request) => {
      nonVisionRunnerCalled = true;
      assert.match(request.stdin, /Studio visual attachment policy/);
      assert.match(request.stdin, /current model glm-5 is not marked as vision-capable/);
      assert.match(request.stdin, /must not describe, classify, OCR, or infer visual contents/);
      assert.match(request.stdin, /ask what they want to do next/);
      assert.match(request.stdin, /\[image\]/);
      assert.match(request.stdin, /photo\.jpg/);
      return {
        exitCode: 0,
        signal: null,
        stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"已收到并保存图片，但当前模型不支持视觉理解。你希望我接下来做什么？"}}\n',
        stderr: "",
        durationMs: 9,
        timedOut: false,
        error: null,
      };
    },
  });
  assert.equal(nonVisionRunnerCalled, true);
  assert.equal(nonVisionImageResult.attempted, true);
  assert.equal(nonVisionImageResult.ok, true);
  assert.equal(nonVisionImageResult.status, "completed");
  assert.match(nonVisionImageResult.replyText, /已收到并保存图片/);
  assert.match(nonVisionImageResult.replyText, /当前模型不支持视觉理解/);
  assert.match(nonVisionImageResult.replyText, /接下来做什么/);
  assert.equal(nonVisionImageResult.command, "codex");

  const catalogNonVisionRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, model: "gpt-5.3-codex-spark" },
    binding,
    message: {
      ...message,
      messageId: "m-runner-catalog-non-vision-image",
      payload: { type: 2, content: "", name: "spark-photo.jpg", url: "https://example.invalid/spark-photo.jpg" },
      attachments: [{
        kind: "image",
        platform: "octo",
        fileName: "spark-photo.jpg",
        localPath: path.join(workDir, ".studio-agent-attachments", "spark-photo.jpg"),
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: false },
  });
  assert.ok(catalogNonVisionRequest);
  assert.match(catalogNonVisionRequest.stdin, /Studio visual attachment policy/);
  assert.match(catalogNonVisionRequest.stdin, /current model gpt-5\.3-codex-spark is not marked as vision-capable/);
  assert.equal(catalogNonVisionRequest.args.includes("--image"), false);
  for (const cleanupPath of catalogNonVisionRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  let attachmentOnlyRunnerCalled = false;
  const attachmentOnlyResult = await runChannelConnectorAgentTurn({
    project: { ...project, model: "gmn-vision" },
    binding,
    message: {
      ...message,
      messageId: "m-runner-attachment-only",
      payload: { type: 1, content: "" },
      attachments: [{
        kind: "image",
        platform: "octo",
        fileName: "vision.png",
        mimeType: "image/png",
        localPath: visionImagePath,
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: true },
    processRunner: async (request) => {
      attachmentOnlyRunnerCalled = true;
      assert.equal(request.args.includes("--image"), true);
      assert.match(request.stdin, /native --image arguments/);
      return {
        exitCode: 0,
        signal: null,
        stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"图片已查看"}}\n',
        stderr: "",
        durationMs: 6,
        timedOut: false,
        error: null,
      };
    },
  });
  assert.equal(attachmentOnlyRunnerCalled, true);
  assert.equal(attachmentOnlyResult.attempted, true);
  assert.equal(attachmentOnlyResult.ok, true);
  assert.equal(attachmentOnlyResult.replyText, "图片已查看");

  let nonVisionFileRunnerCalled = false;
  const nonVisionFileResult = await runChannelConnectorAgentTurn({
    project: { ...project, model: "glm-5" },
    binding,
    message: {
      ...message,
      messageId: "m-runner-non-vision-file",
      payload: { type: 8, content: "", name: "report.txt" },
      attachments: [{
        kind: "file",
        platform: "octo",
        fileName: "report.txt",
        mimeType: "text/plain",
        localPath: stagedLocalPath,
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async (request) => {
      nonVisionFileRunnerCalled = true;
      assert.match(request.stdin, /\[file: report\.txt\]/);
      assert.match(request.stdin, new RegExp(stagedLocalPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      return {
        exitCode: 0,
        signal: null,
        stdout: '{"type":"item.completed","item":{"type":"agent_message","text":"file received"}}\n',
        stderr: "",
        durationMs: 8,
        timedOut: false,
        error: null,
      };
    },
  });
  assert.equal(nonVisionFileRunnerCalled, true);
  assert.equal(nonVisionFileResult.attempted, true);
  assert.equal(nonVisionFileResult.ok, true);
  assert.equal(nonVisionFileResult.replyText, "file received");

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

test("native Channel Connectors conversation history stores sanitized session context", () => {
  const root = makeTempRoot();
  const historyPath = path.join(root, "state", "channel-history.json");
  const lookup = {
    bindingId: "octo-codex",
    sessionKey: "dmwork:dm:user-1",
  };

  appendChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "m-1",
    role: "user",
    text: "请记住这个编号 A-123",
    attachments: [{
      kind: "file",
      platform: "feishu",
      fileName: "payload.zip",
      fileKey: "private-file-key",
      localPath: path.join(root, "payload.zip"),
      size: 42,
    }],
    status: "completed",
    now: new Date("2026-06-06T08:00:00.000Z"),
  });
  appendChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "m-1",
    role: "assistant",
    text: "我记住了 A-123",
    status: "completed",
    now: new Date("2026-06-06T08:00:01.000Z"),
  });
  appendChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "m-2",
    role: "user",
    text: "新问题",
    status: "completed",
    maxEntriesPerConversation: 3,
    now: new Date("2026-06-06T08:00:02.000Z"),
  });

  const entries = getChannelConnectorConversationHistory(historyPath, lookup, 10);
  assert.equal(entries.length, 3);
  const context = renderChannelConnectorConversationHistoryContext(entries);
  assert.match(context, /Studio IM history context/);
  assert.match(context, /我记住了 A-123/);
  assert.match(context, /新问题/);
  assert.match(context, /payload\.zip|A-123/);
  assert.doesNotMatch(context, /private-file-key/);
  assert.equal(fs.statSync(historyPath).mode & 0o777, 0o600);

  const compacted = compactChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "compact-1",
    summaryText: "用户要求记住编号 A-123，并上传过 payload.zip；下一轮继续围绕新问题处理。",
    now: new Date("2026-06-06T08:00:03.000Z"),
  });
  assert.equal(compacted.beforeEntries, 3);
  assert.equal(compacted.afterEntries, 1);
  assert.equal(compacted.summaryEntry.status, "compact-summary");
  const compactEntries = getChannelConnectorConversationHistory(historyPath, lookup, 10);
  assert.equal(compactEntries.length, 1);
  const compactContext = renderChannelConnectorConversationHistoryContext(compactEntries);
  assert.match(compactContext, /Compact summaries/);
  assert.match(compactContext, /compact summary/);
  assert.match(compactContext, /A-123/);

  const cleared = clearChannelConnectorConversationHistory(historyPath, lookup);
  assert.equal(cleared, 1);
  assert.deepEqual(getChannelConnectorConversationHistory(historyPath, lookup), []);
});

test("native Channel Connectors IM commands switch agent, model, and permission per session", async () => {
  const root = makeTempRoot();
  const stateDir = path.join(root, "state");
  const controlsPath = path.join(stateDir, "channel-session-controls.json");
  const agentSessionsPath = path.join(stateDir, "channel-sessions.json");
  const conversationHistoryPath = path.join(stateDir, "channel-history.json");
  const replyBuffersPath = path.join(stateDir, "channel-reply-buffers.json");
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
    conversationHistoryPath,
    replyBuffersPath,
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
  assert.match(help.replyText, /\*\*会话\*\*/);
  assert.match(help.replyText, /普通消息会交给当前 Agent/);
  assert.match(help.replyText, /`\/status`/);
  assert.match(help.replyText, /\/mode/);
  assert.match(help.replyText, /\/reasoning/);
  assert.match(help.replyText, /\/stream/);
  assert.match(help.replyText, /\/tools/);
  assert.match(help.replyText, /\/name/);
  assert.match(help.replyText, /\/search/);
  assert.match(help.replyText, /\/buffer/);
  assert.match(help.replyText, /`\/usage`/);
  assert.match(help.replyText, /`\/compact`/);
  assert.match(help.replyText, /`\/stop`/);
  assert.match(help.replyText, /`\/native \/help`/);
  assert.equal(parseChannelConnectorCommand("%help")?.name, "help");
  assert.equal(parseChannelConnectorCommand("/%help")?.name, "help");

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
    ["/reasoning", "list"],
    ["/dir", "list"],
    ["/display", "list"],
    ["/stream", "list"],
    ["/tools", "list"],
    ["/buffer", "list"],
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

  const usageWithoutRuntime = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/usage"),
  });
  assert.equal(usageWithoutRuntime.handled, true);
  assert.equal(usageWithoutRuntime.action, "usage");
  assert.equal(usageWithoutRuntime.ok, false);
  assert.match(usageWithoutRuntime.replyText, /还没有可统计/);

  let usageCalled = false;
  const usage = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/usage"),
    summarizeUsage: async (scope) => {
      usageCalled = true;
      assert.equal(scope.bindingId, "octo-codex");
      assert.equal(scope.sessionKey, "dmwork:dm:admin-1");
      assert.equal(scope.project.id, "codex-main");
      assert.equal(scope.command, "/usage");
      return {
        source: "gateway-runtime-window",
        requests: 2,
        successfulRequests: 2,
        failedRequests: 0,
        inputTokens: 11,
        outputTokens: 7,
        totalTokens: 18,
        cacheReadTokens: 3,
        cacheCreationTokens: 1,
        lastRequestAt: "2026-06-06T08:03:00.000Z",
        providers: ["gmn"],
        models: ["gpt-5.4-mini"],
        requestIds: ["req-1", "req-2"],
      };
    },
  });
  assert.equal(usageCalled, true);
  assert.equal(usage.handled, true);
  assert.equal(usage.action, "usage");
  assert.equal(usage.ok, true);
  assert.match(usage.replyText, /Tokens: input 11 · output 7 · total 18/);
  assert.match(usage.replyText, /Cache: read 3 · write 1/);
  assert.match(usage.replyText, /gpt-5\.4-mini/);
  assert.match(usage.replyText, /Studio Gateway runtime log/);

  let stopCalled = false;
  const stopped = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/stop"),
    stopActiveRun: (scope) => {
      stopCalled = true;
      assert.equal(scope.bindingId, "octo-codex");
      assert.equal(scope.sessionKey, "dmwork:dm:admin-1");
      return {
        stopped: true,
        runId: "run-1",
        messageId: "msg-active",
        agent: "codex",
        model: "gpt-5",
        error: null,
      };
    },
  });
  assert.equal(stopCalled, true);
  assert.equal(stopped.handled, true);
  assert.equal(stopped.action, "stop");
  assert.equal(stopped.ok, true);
  assert.match(stopped.replyText, /已请求停止当前 Agent 运行/);
  assert.match(stopped.replyText, /Agent=codex/);

  const noActiveRun = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/stop"),
  });
  assert.equal(noActiveRun.handled, true);
  assert.equal(noActiveRun.action, "stop");
  assert.equal(noActiveRun.ok, false);
  assert.match(noActiveRun.replyText, /没有正在运行的 Agent/);

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

  const currentSessionRecord = upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "codex-main",
    sessionKey: baseContext.sessionKey,
    agent: "codex",
    model: "gpt-5.5",
    workDir: codexProject.workDir,
    codexThreadId: "thread-named-session",
    messageId: "m-named-session",
    status: "completed",
  });
  const named = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/name Sprint Alpha"),
  });
  assert.equal(named.ok, true);
  assert.equal(named.control.sessionName, "Sprint Alpha");
  assert.equal(getChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "codex-main",
    sessionKey: baseContext.sessionKey,
    agent: "codex",
    model: "gpt-5.5",
    workDir: codexProject.workDir,
  }).name, "Sprint Alpha");
  const missingIndexedName = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/name 1"),
  });
  assert.equal(missingIndexedName.ok, false);
  assert.match(missingIndexedName.replyText, /\/name <名称>/);
  const renamedByHelper = renameChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
    sessionId: currentSessionRecord.id,
    name: "Sprint Beta",
  });
  assert.equal(renamedByHelper.name, "Sprint Beta");
  const listNamed = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/list"),
  });
  assert.match(listNamed.replyText, /Sprint Beta/);
  const searchNamed = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/search beta"),
  });
  assert.equal(searchNamed.ok, true);
  assert.match(searchNamed.replyText, /Sprint Beta/);
  const reasoningList = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/reasoning"),
  });
  assert.equal(reasoningList.ok, true);
  assert.match(reasoningList.replyText, /xhigh/);
  const badReasoning = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/reasoning minimal"),
  });
  assert.equal(badReasoning.ok, false);
  assert.doesNotMatch(badReasoning.replyText, /minimal/);
  const reasoning = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/reasoning 4"),
  });
  assert.equal(reasoning.ok, true);
  assert.equal(reasoning.control.reasoningEffort, "xhigh");
  assert.match(reasoning.replyText, /已断开旧 Agent 续接：1/);
  assert.equal(getChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "codex-main",
    sessionKey: baseContext.sessionKey,
    agent: "codex",
    model: "gpt-5.5",
    workDir: codexProject.workDir,
  }), null);

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

  const sameSessionReply = `完整群聊回复 ${"buffer内容".repeat(80)}`;
  const sameSessionBuffer = prepareChannelConnectorGroupBufferedReply({
    filePath: replyBuffersPath,
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
    messageId: "m-buffer-same-session",
    platform: "octo",
    replyText: sameSessionReply,
    isGroup: true,
    thresholdRunes: 20,
    previewRunes: 40,
    now: new Date("2026-06-06T09:00:00.000Z"),
  });
  const otherSessionBuffer = prepareChannelConnectorGroupBufferedReply({
    filePath: replyBuffersPath,
    bindingId: binding.id,
    sessionKey: "dmwork:dm:other-user",
    messageId: "m-buffer-other-session",
    platform: "octo",
    replyText: `其它会话回复 ${"secret".repeat(80)}`,
    isGroup: true,
    thresholdRunes: 20,
    previewRunes: 40,
    now: new Date("2026-06-06T09:01:00.000Z"),
  });
  assert.ok(sameSessionBuffer.bufferId);
  assert.ok(otherSessionBuffer.bufferId);
  const bufferList = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/buffer"),
  });
  assert.equal(bufferList.ok, true);
  assert.match(bufferList.replyText, new RegExp(sameSessionBuffer.bufferId));
  assert.doesNotMatch(bufferList.replyText, new RegExp(otherSessionBuffer.bufferId));
  const bufferLatest = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/buffer latest"),
  });
  assert.equal(bufferLatest.ok, true);
  assert.equal(bufferLatest.action, "show");
  assert.match(bufferLatest.replyText, /Studio Reply Buffer/);
  assert.match(bufferLatest.replyText, new RegExp(sameSessionBuffer.bufferId));
  assert.match(bufferLatest.replyText, /完整群聊回复/);
  const bufferByPrefix = await handleChannelConnectorCommand({
    ...baseContext,
    message: message(`/buffer ${sameSessionBuffer.bufferId.slice(0, 18)}`),
  });
  assert.equal(bufferByPrefix.ok, true);
  assert.equal(bufferByPrefix.action, "show");
  assert.equal(bufferByPrefix.replyText, bufferLatest.replyText);
  const otherSessionDenied = await handleChannelConnectorCommand({
    ...baseContext,
    message: message(`/buffer ${otherSessionBuffer.bufferId}`),
  });
  assert.equal(otherSessionDenied.ok, false);
  assert.doesNotMatch(otherSessionDenied.replyText, /其它会话回复/);

  const compactWithoutRuntime = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/compact"),
  });
  assert.equal(compactWithoutRuntime.handled, true);
  assert.equal(compactWithoutRuntime.action, "compact");
  assert.equal(compactWithoutRuntime.ok, false);
  assert.match(compactWithoutRuntime.replyText, /未启用 Studio compact/);

  let compactCalled = false;
  const compact = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/compact"),
    compactConversation: async (scope) => {
      compactCalled = true;
      assert.equal(scope.bindingId, "octo-codex");
      assert.equal(scope.sessionKey, "dmwork:dm:admin-1");
      assert.equal(scope.project.id, "codex-main");
      assert.equal(scope.command, "/compact");
      return {
        ok: true,
        beforeEntries: 6,
        afterEntries: 1,
        sessionsCleared: 2,
        summaryText: "compact summary from gateway",
        error: null,
      };
    },
  });
  assert.equal(compactCalled, true);
  assert.equal(compact.handled, true);
  assert.equal(compact.action, "compact");
  assert.equal(compact.ok, true);
  assert.match(compact.replyText, /history: 6 -> 1/);
  assert.match(compact.replyText, /cleared 2/);

  const passthrough = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/agent-native-command"),
  });
  assert.equal(passthrough.handled, false);
  assert.equal(passthrough.action, "passthrough");
  assert.equal(passthrough.passthroughText, "/agent-native-command");

  const nativePassthrough = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/native /help"),
  });
  assert.equal(nativePassthrough.handled, false);
  assert.equal(nativePassthrough.passthroughText, "/help");
  assert.equal(nativePassthrough.nativeCommand, "/help");

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
  assert.equal(agent.control.reasoningEffort, null);
  assert.equal(agent.control.permissionMode, null);

  const cd = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/cd src"),
  });
  assert.equal(cd.ok, true);
  assert.equal(cd.control.workDir, path.join(claudeProject.workDir, "src"));
  assert.deepEqual(cd.control.workDirHistory, [claudeProject.workDir]);

  const cdDefault = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/cd default"),
  });
  assert.equal(cdDefault.ok, true);
  assert.equal(cdDefault.control.workDir, null);
  assert.deepEqual(cdDefault.control.workDirHistory, [path.join(claudeProject.workDir, "src")]);

  const cdByIndex = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/cd 1"),
  });
  assert.equal(cdByIndex.ok, true);
  assert.equal(cdByIndex.control.workDir, path.join(claudeProject.workDir, "src"));
  assert.deepEqual(cdByIndex.control.workDirHistory, [claudeProject.workDir]);

  const cdPrevious = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/dir -"),
  });
  assert.equal(cdPrevious.ok, true);
  assert.equal(cdPrevious.control.workDir, null);
  assert.deepEqual(cdPrevious.control.workDirHistory, [path.join(claudeProject.workDir, "src")]);

  const cdHistory = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/dir 1"),
  });
  assert.equal(cdHistory.ok, true);
  assert.equal(cdHistory.control.workDir, path.join(claudeProject.workDir, "src"));
  assert.deepEqual(cdHistory.control.workDirHistory, [claudeProject.workDir]);

  const dir = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/dir"),
  });
  assert.equal(dir.ok, true);
  assert.match(dir.replyText, /当前工作目录/);
  assert.match(dir.replyText, /最近目录/);
  assert.match(dir.replyText, /\/dir <路径\|序号\|->/);

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
    codexThreadId: "thread-current-session",
    messageId: "m-current-session",
    status: "completed",
    name: "Claude review thread",
  });
  appendChannelConnectorConversationHistory(conversationHistoryPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
    messageId: "m-history-current-1",
    role: "user",
    text: "first current history entry",
  });
  appendChannelConnectorConversationHistory(conversationHistoryPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
    messageId: "m-history-current-2",
    role: "assistant",
    text: "second current history entry",
    status: "completed",
  });
  const current = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/current"),
  });
  assert.equal(current.ok, true);
  assert.match(current.replyText, /Session name: Claude review thread/);
  assert.match(current.replyText, /History entries: 2/);
  assert.match(current.replyText, /Agent session id:/);
  assert.match(current.replyText, /Actions: \/list/);
  const historyOne = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/history 1"),
  });
  assert.equal(historyOne.ok, true);
  assert.match(historyOne.replyText, /Studio Session History \(last 1\/1\)/);
  assert.doesNotMatch(historyOne.replyText, /first current history entry/);
  assert.match(historyOne.replyText, /second current history entry/);

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
  appendChannelConnectorConversationHistory(conversationHistoryPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
    messageId: "m-history-before-new",
    role: "user",
    text: "old context before new",
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
  assert.deepEqual(getChannelConnectorConversationHistory(conversationHistoryPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  }), []);

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
  appendChannelConnectorConversationHistory(conversationHistoryPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
    messageId: "m-history-before-reset",
    role: "assistant",
    text: "old context before reset",
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
  assert.deepEqual(getChannelConnectorConversationHistory(conversationHistoryPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  }), []);
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

test("native Channel Connectors visual turns select Gateway vision models from catalog", async () => {
  const root = makeTempRoot();
  const project = {
    id: "codex-main",
    name: "Codex main",
    workDir: path.join(root, "work"),
    agent: "codex",
    model: "gateway-glm-5",
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
  const imageMessage = {
    messageId: "m-visual-route",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: { type: 2, content: "", name: "photo.jpg" },
    attachments: [{
      kind: "image",
      platform: "octo",
      fileName: "photo.jpg",
    }],
  };
  const catalog = [
    { id: "gateway-glm-5", aliases: [], providerIds: ["glm"], features: { text: true, vision: false } },
    { id: "gpt-5.2", aliases: [], providerIds: ["gmn"], healthyProviderIds: [], openCircuitProviderIds: ["gmn"], features: { text: true, vision: true, responses: true } },
    { id: "gmn-vision", aliases: ["vision-gpt-5.5"], providerIds: ["gmn"], healthyProviderIds: ["gmn"], openCircuitProviderIds: [], features: { text: true, vision: true, responses: true } },
  ];
  const selected = await resolveChannelConnectorVisualTurnProject({
    project,
    binding,
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => catalog,
  });
  assert.equal(countChannelConnectorVisualAttachments(imageMessage), 1);
  assert.equal(selected.switched, true);
  assert.equal(selected.originalModel, "gateway-glm-5");
  assert.equal(selected.project.model, "gmn-vision");
  assert.deepEqual(selected.modelCapabilities, { vision: true });
  assert.equal(selected.reason, "current-model-non-vision");

  const noHealthyVision = await resolveChannelConnectorVisualTurnProject({
    project,
    binding,
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => [
      { id: "gateway-glm-5", aliases: [], providerIds: ["glm"], healthyProviderIds: ["glm"], openCircuitProviderIds: [], features: { text: true, vision: false } },
      { id: "gpt-5.2", aliases: [], providerIds: ["gmn"], healthyProviderIds: [], openCircuitProviderIds: ["gmn"], features: { text: true, vision: true, responses: true } },
    ],
  });
  assert.equal(noHealthyVision.switched, false);
  assert.equal(noHealthyVision.project.model, "gateway-glm-5");
  assert.equal(noHealthyVision.reason, "current-model-non-vision");

  const currentVision = await resolveChannelConnectorVisualTurnProject({
    project: { ...project, model: "vision-gpt-5.5" },
    binding,
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => catalog,
  });
  assert.equal(currentVision.switched, false);
  assert.equal(currentVision.project.model, "vision-gpt-5.5");
  assert.deepEqual(currentVision.modelCapabilities, { vision: true });

  const disabled = await resolveChannelConnectorVisualTurnProject({
    project,
    binding: { ...binding, metadata: { autoVisionModel: false } },
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => catalog,
  });
  assert.equal(disabled.switched, false);
  assert.equal(disabled.reason, "disabled-by-binding");
  assert.equal(disabled.project.model, "gateway-glm-5");

  const catalogUnavailable = await resolveChannelConnectorVisualTurnProject({
    project,
    binding,
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => {
      throw new Error("offline");
    },
  });
  assert.equal(catalogUnavailable.switched, false);
  assert.equal(catalogUnavailable.reason, "catalog-unavailable");
  assert.equal(catalogUnavailable.catalogError, "offline");

  const textOnly = await resolveChannelConnectorVisualTurnProject({
    project,
    binding,
    message: {
      ...imageMessage,
      payload: { type: 1, content: "hello" },
      attachments: [],
    },
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => {
      throw new Error("should not be called");
    },
  });
  assert.equal(textOnly.switched, false);
  assert.equal(textOnly.reason, null);
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
  const recentWorkDir = path.join(root, "recent-work");
  fs.mkdirSync(recentWorkDir, { recursive: true });
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
    agentSession: {
      started: true,
      id: "codex-session-1",
      name: "Frontend Fix",
      turnCount: 3,
      codexThreadId: "thread-codex-1",
      lastStatus: "ok",
      lastMessageId: "msg-3",
      createdAt: "2026-06-06T08:00:00.000Z",
      updatedAt: "2026-06-06T08:01:00.000Z",
    },
    sessionList: [
      {
        id: "codex-session-1",
        name: "Frontend Fix",
        projectId: "codex-main",
        agent: "codex",
        model: "gpt-5",
        workDir: codexProject.workDir,
        codexThreadId: "thread-codex-1",
        turnCount: 3,
        createdAt: "2026-06-06T08:00:00.000Z",
        updatedAt: "2026-06-06T08:01:00.000Z",
        lastMessageId: "msg-3",
        lastStatus: "ok",
        active: true,
      },
      {
        id: "claude-session-1",
        projectId: "claude-main",
        agent: "claude-code",
        model: "claude-sonnet",
        workDir: claudeProject.workDir,
        codexThreadId: null,
        turnCount: 1,
        createdAt: "2026-06-06T07:58:00.000Z",
        updatedAt: "2026-06-06T07:59:00.000Z",
        lastMessageId: "msg-claude-1",
        lastStatus: "ok",
        active: false,
      },
    ],
    history: [
      {
        role: "user",
        text: "上一轮问题",
        attachmentSummaries: [],
        status: null,
        createdAt: "2026-06-06T08:00:00.000Z",
        messageId: "msg-1",
      },
      {
        role: "assistant",
        text: "上一轮回答",
        attachmentSummaries: ["file, note.txt"],
        status: "ok",
        createdAt: "2026-06-06T08:00:10.000Z",
        messageId: "msg-2",
      },
    ],
  });

  assert.equal(surface.current.bindingId, "octo-codex");
  assert.equal(surface.current.projectId, "codex-main");
  assert.equal(surface.current.streamMessages, true);
  assert.equal(surface.current.toolMessages, true);
  assert.match(surface.textFallback, /skills 命令/);
  assert.match(surface.textFallback, /\*\*当前会话\*\*/);
  assert.match(surface.textFallback, /Reasoning: default/);
  assert.match(surface.textFallback, /\*\*快捷操作\*\*/);
  assert.match(surface.textFallback, /`\/status`/);
  assert.match(surface.textFallback, /`\/native \/help`/);
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
  assert.match(raw, /会话/);
  assert.match(raw, /配置/);
  assert.match(raw, /显示/);
  assert.match(raw, /nav:\/help session/);
  assert.match(raw, /\/help model/);
  assert.match(raw, /\/help display/);
  assert.match(raw, /\/help buffer/);
  assert.match(raw, /New Session/);
  assert.doesNotMatch(raw, /act:\/reset/);
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
  assert.match(sessionCardRaw, /nav:\/current/);
  assert.match(sessionCardRaw, /nav:\/list/);
  assert.match(sessionCardRaw, /nav:\/history/);
  assert.match(sessionCardRaw, /act:\/stop/);
  assert.match(sessionCardRaw, /act:\/new/);
  assert.match(sessionCardRaw, /act:\/reset/);
  assert.match(sessionCardRaw, /查看当前状态、续接列表、history 和 usage/);
  assert.doesNotMatch(sessionCardRaw, /Status 查看当前 IM session/);
  assert.match(sessionCardRaw, /nav:\/help session/);

  const currentSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "session",
    selectedViewId: "current",
    agentSession: surface.session,
    sessionList: surface.sessionList,
    history: surface.history,
  });
  const currentCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(currentSurface));
  assert.match(currentCardRaw, /Studio Current Session/);
  assert.match(currentCardRaw, /Session name/);
  assert.match(currentCardRaw, /Frontend Fix/);
  assert.match(currentCardRaw, /Session id/);
  assert.match(currentCardRaw, /History/);
  assert.match(currentCardRaw, /thread-codex-1/);
  assert.match(currentCardRaw, /nav:\/list/);
  assert.match(currentCardRaw, /nav:\/history/);
  assert.match(currentCardRaw, /act:\/usage/);
  assert.match(currentCardRaw, /"action":"nav:\/help"/);

  const sessionListSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "session",
    selectedViewId: "sessions",
    agentSession: surface.session,
    sessionList: surface.sessionList,
    history: surface.history,
  });
  const sessionListCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(sessionListSurface));
  assert.match(sessionListCardRaw, /Studio Agent Sessions/);
  assert.match(sessionListCardRaw, /Frontend Fix/);
  assert.match(sessionListCardRaw, /codex-main/);
  assert.match(sessionListCardRaw, /session codex-session-1/);
  assert.match(sessionListCardRaw, /thread thread-codex-1/);
  assert.match(sessionListCardRaw, /claude-main/);
  assert.match(sessionListCardRaw, /act:\/switch 1/);
  assert.match(sessionListCardRaw, /nav:\/current/);
  assert.match(sessionListCardRaw, /nav:\/history/);

  const historySurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "session",
    selectedViewId: "history",
    agentSession: surface.session,
    sessionList: surface.sessionList,
    history: surface.history,
  });
  const historyCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(historySurface));
  assert.match(historyCardRaw, /Studio Session History/);
  assert.match(historyCardRaw, /最近 2 条 IM history/);
  assert.match(historyCardRaw, /\[U\] User/);
  assert.match(historyCardRaw, /\[A\] Assistant/);
  assert.match(historyCardRaw, /上一轮问题/);
  assert.match(historyCardRaw, /file, note\.txt/);
  assert.match(historyCardRaw, /nav:\/current/);
  assert.match(historyCardRaw, /nav:\/list/);
  assert.match(historyCardRaw, /"action":"nav:\/help"/);

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
    control: {
      id: "octo-codex|dmwork%3Adm%3Aadmin-1",
      bindingId: "octo-codex",
      sessionKey: "dmwork:dm:admin-1",
      activeProjectId: null,
      model: null,
      permissionMode: null,
      workDir: null,
      workDirHistory: [recentWorkDir],
      streamMessages: null,
      toolMessages: null,
      createdAt: "2026-06-06T08:00:00.000Z",
      updatedAt: "2026-06-06T08:00:00.000Z",
      lastCommand: "/dir",
    },
    selectedSectionId: "workdir",
    selectedViewId: "workdir",
  });
  assert.deepEqual(workdirPickerSurface.current.workDirHistory, [recentWorkDir]);
  const workdirCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(workdirPickerSurface));
  assert.match(workdirCardRaw, /Studio WorkDir/);
  assert.match(workdirCardRaw, /select_static/);
  assert.match(workdirCardRaw, /最近目录/);
  assert.match(workdirCardRaw, /act:\/dir -/);
  assert.match(workdirCardRaw, /act:\/dir 1/);
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
  assert.match(modelHelpRaw, /"action":"nav:\/help"/);
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
  assert.match(modelCardRaw, /"action":"nav:\/help"/);
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
  assert.match(modeCardRaw, /act:\/reasoning xhigh/);
  assert.match(modeCardRaw, /选择推理强度/);
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

  const groupDisplaySurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:group:chat-1",
    displayDefaults: {
      streamMessages: false,
      toolMessages: false,
    },
    selectedSectionId: "display",
    selectedViewId: "display",
  });
  assert.equal(groupDisplaySurface.current.streamMessages, false);
  assert.equal(groupDisplaySurface.current.toolMessages, false);
  const groupDisplayCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(groupDisplaySurface));
  assert.match(groupDisplayCardRaw, /流式\/进度消息：关闭/);
  assert.match(groupDisplayCardRaw, /工具\/思考消息：关闭/);

  const bufferSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    selectedSectionId: "buffer",
    selectedViewId: "buffer",
  });
  const bufferCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(bufferSurface));
  assert.match(bufferCardRaw, /Studio Reply Buffer/);
  assert.match(bufferCardRaw, /act:\/buffer/);
  assert.match(bufferCardRaw, /act:\/buffer latest/);
  assert.match(bufferCardRaw, /nav:\/help buffer/);

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
  const bufferNavPayload = extractChannelConnectorSurfaceActionPayload("nav:/help buffer");
  assert.equal(bufferNavPayload.targetSectionId, "buffer");
  assert.equal(bufferNavPayload.targetViewId, "help");
  const bufferActionPayload = extractChannelConnectorSurfaceActionPayload("act:/buffer latest");
  assert.equal(bufferActionPayload.command, "/buffer latest");
  assert.equal(bufferActionPayload.targetSectionId, "buffer");
  assert.equal(bufferActionPayload.targetViewId, "buffer");
  const historyNavPayload = extractChannelConnectorSurfaceActionPayload("nav:/history");
  assert.equal(historyNavPayload.command, "/history");
  assert.equal(historyNavPayload.targetSectionId, "session");
  assert.equal(historyNavPayload.targetViewId, "history");
  const sessionListNavPayload = extractChannelConnectorSurfaceActionPayload("nav:/list");
  assert.equal(sessionListNavPayload.command, "/list");
  assert.equal(sessionListNavPayload.targetSectionId, "session");
  assert.equal(sessionListNavPayload.targetViewId, "sessions");
  const sessionSwitchPayload = extractChannelConnectorSurfaceActionPayload("act:/switch 1");
  assert.equal(sessionSwitchPayload.command, "/switch 1");
  assert.equal(sessionSwitchPayload.targetSectionId, "session");
  assert.equal(sessionSwitchPayload.targetViewId, "sessions");
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
          allowlist: ["ou_admin"],
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

  const parsedPercentHelp = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_percent_help",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_percent_help",
        chat_id: "oc_group",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "%help" }),
      },
    },
  });
  assert.equal(parsedPercentHelp.kind, "message");
  assert.equal(parsedPercentHelp.chatType, "group");
  assert.equal(parsedPercentHelp.directed, true);

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

  const deniedUser = await service.dispatchFeishuWebhook({
    dryRun: true,
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_denied",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_guest" } },
      message: {
        message_id: "om_msg_denied",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "text",
        content: JSON.stringify({ text: "hello" }),
      },
    },
  });
  assert.equal(deniedUser.accepted, false);
  assert.equal(deniedUser.skippedReason, "channel_user_not_allowed");
  assert.equal(deniedUser.agentDispatch.status, "skipped");

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
  assert.match(slashNewMessage.feishuResponse.toast.content, /已开启新的 Agent 会话/);
  assert.equal(slashNewMessage.feishuResponse.card, undefined);

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
  assert.match(slashResetMessage.feishuResponse.toast.content, /已重置本 IM 会话/);
  assert.equal(slashResetMessage.feishuResponse.card, undefined);

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
  assert.match(statusCardAction.feishuResponse.toast.content, /状态已刷新/);
  const statusCardRaw = JSON.stringify(statusCardAction.feishuResponse.card.data);
  assert.match(statusCardRaw, /当前状态/);
  assert.match(statusCardRaw, /已刷新当前会话状态/);
  assert.doesNotMatch(statusCardRaw, /Studio Channel Status/);
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
  assert.equal(newSessionCardAction.feishuResponse, null);

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
  assert.equal(resetSessionCardAction.feishuResponse, null);

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
  assert.equal(cardAction.feishuResponse, null);

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

  const historyPath = path.join(resolveChannelConnectorsPaths(config).stateDir, "channel-history.json");
  appendChannelConnectorConversationHistory(historyPath, {
    bindingId: "feishu-main",
    sessionKey: "feishu:oc_chat:ou_admin",
    messageId: "om_history_user",
    role: "user",
    text: "历史里的真实用户消息",
    status: null,
    now: new Date("2026-06-06T08:00:05.000Z"),
  });
  appendChannelConnectorConversationHistory(historyPath, {
    bindingId: "feishu-main",
    sessionKey: "feishu:oc_chat:ou_admin",
    messageId: "om_history_assistant",
    role: "assistant",
    text: "历史里的真实助手回复",
    status: "ok",
    now: new Date("2026-06-06T08:00:10.000Z"),
  });
  const historyCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_history",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_history" },
      action: {
        value: {
          action: "nav:/history",
          command: "/history",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(historyCardAction.accepted, true);
  assert.equal(historyCardAction.commandAction.command, "/history");
  assert.match(JSON.stringify(historyCardAction.feishuResponse.card.data), /Studio Session History/);
  assert.match(JSON.stringify(historyCardAction.feishuResponse.card.data), /历史里的真实用户消息/);
  assert.match(JSON.stringify(historyCardAction.feishuResponse.card.data), /历史里的真实助手回复/);

  const feishuAgentSessionsPath = path.join(resolveChannelConnectorsPaths(config).stateDir, "channel-sessions.json");
  upsertChannelConnectorAgentSession(feishuAgentSessionsPath, {
    bindingId: "feishu-main",
    projectId: "feishu-codex",
    sessionKey: "feishu:oc_chat:ou_admin",
    agent: "codex",
    model: "gpt-5",
    workDir: path.join(root, "codex-work"),
    codexThreadId: "codex-thread-1",
    messageId: "om_session_codex",
    status: "ok",
    now: new Date("2026-06-06T08:00:15.000Z"),
  });
  upsertChannelConnectorAgentSession(feishuAgentSessionsPath, {
    bindingId: "feishu-main",
    projectId: "feishu-claude",
    sessionKey: "feishu:oc_chat:ou_admin",
    agent: "claude-code",
    model: "claude-sonnet",
    workDir: path.join(root, "claude-work"),
    codexThreadId: null,
    messageId: "om_session_claude",
    status: "ok",
    now: new Date("2026-06-06T08:00:20.000Z"),
  });
  const sessionListCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_sessions",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_sessions" },
      action: {
        value: {
          action: "nav:/list",
          command: "/list",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(sessionListCardAction.accepted, true);
  assert.equal(sessionListCardAction.commandAction.command, "/list");
  assert.equal(sessionListCardAction.commandAction.commandResult.action, "list");
  assert.match(JSON.stringify(sessionListCardAction.feishuResponse.card.data), /Studio Agent Sessions/);
  assert.match(JSON.stringify(sessionListCardAction.feishuResponse.card.data), /feishu-claude/);
  assert.match(JSON.stringify(sessionListCardAction.feishuResponse.card.data), /act:\/switch 1/);

  const sessionSwitchCardAction = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_switch_session",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_sessions" },
      action: {
        value: {
          action: "act:/switch 1",
          command: "/switch 1",
          binding_id: "feishu-main",
        },
      },
    },
  });
  assert.equal(sessionSwitchCardAction.accepted, true);
  assert.equal(sessionSwitchCardAction.commandAction.command, "/switch 1");
  assert.equal(sessionSwitchCardAction.commandAction.commandResult.ok, true);
  assert.equal(sessionSwitchCardAction.commandAction.surface.current.projectId, "feishu-claude");
  assert.equal(sessionSwitchCardAction.commandAction.surface.current.model, "claude-sonnet");
  assert.match(sessionSwitchCardAction.commandAction.commandResult.replyText, /已切换本 IM 会话 Agent session/);
  assert.match(JSON.stringify(sessionSwitchCardAction.feishuResponse.card.data), /Studio Agent Sessions/);
  assert.match(JSON.stringify(sessionSwitchCardAction.feishuResponse.card.data), /"type":"primary"/);

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

    const post = await service.runFeishuTransportSmoke({
      bindingId: "feishu-send",
      action: "send-post",
      channelId: "oc_chat",
      content: "**hello**\n\n```text\nfeishu markdown\n```",
    });
    assert.equal(post.transport.ok, true);
    assert.equal(post.transport.action, "send-post");
    assert.equal(post.transport.requestCount, 1);
    assert.equal(post.transport.tokenCache, "hit");
    assert.equal(post.transport.messageId, "om_sent_1");
    assert.equal(requests[2].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[2].authorization, "Bearer tenant-token-1");
    assert.equal(requests[2].body.receive_id, "oc_chat");
    assert.equal(requests[2].body.msg_type, "post");
    assert.equal(JSON.parse(requests[2].body.content).zh_cn.content[0][0].tag, "md");
    assert.match(JSON.parse(requests[2].body.content).zh_cn.content[0][0].text, /feishu markdown/);

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
    assert.equal(requests[3].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[3].authorization, "Bearer tenant-token-1");
    assert.equal(requests[3].body.receive_id, "oc_chat");
    assert.equal(requests[3].body.msg_type, "interactive");
    assert.match(JSON.parse(requests[3].body.content).elements[0].content, /card menu/);

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
    assert.equal(requests.length, 5);
    assert.equal(requests[4].path, "/open-apis/im/v1/messages/om_card");
    assert.equal(requests[4].method, "PATCH");
    assert.equal(requests[4].authorization, "Bearer tenant-token-1");
    assert.match(JSON.parse(requests[4].body.content).elements[0].content, /patched card/);

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
    assert.equal(requests.length, 6);
    assert.equal(requests[5].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[5].body.msg_type, "interactive");
    const webhookCard = JSON.parse(requests[5].body.content);
    assert.match(webhookCard.header.title.content, /Studio Session/);
    assert.match(JSON.stringify(webhookCard), /已刷新当前会话状态/);
    assert.doesNotMatch(JSON.stringify(webhookCard), /Studio Channel Status/);

    const cardNew = await service.dispatchFeishuWebhook({
      sendReply: true,
      schema: "2.0",
      header: {
        event_type: "card.action.trigger",
        app_id: "cli_send",
        event_id: "evt_card_new",
        token: "verify-send",
      },
      event: {
        operator: { open_id: "ou_user" },
        context: { open_chat_id: "oc_chat", open_message_id: "om_card_new" },
        action: {
          value: {
            action: "act:/new",
            command: "/new",
            binding_id: "feishu-send",
          },
        },
      },
    });
    assert.equal(cardNew.accepted, true);
    assert.equal(cardNew.commandAction.command, "/new");
    assert.equal(cardNew.transport.ok, true);
    assert.equal(cardNew.transport.action, "send-message");
    assert.equal(cardNew.transport.tokenCache, "hit");
    assert.equal(cardNew.transport.requestCount, 1);
    assert.equal(cardNew.feishuResponse, null);
    assert.equal(requests.length, 7);
    assert.equal(requests[6].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[6].body.msg_type, "text");
    assert.match(JSON.parse(requests[6].body.content).text, /已开启新的 Agent 会话/);
  });
});

test("native Channel Connectors Feishu transport downloads message resources", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_resource",
      appSecret: "test-secret",
    };

    const image = await downloadFeishuMessageResource(transport, {
      messageId: "om_resource",
      fileKey: "img key/1",
      resourceType: "image",
      maxBytes: 1024,
    }, cachePath);
    assert.equal(image.ok, true);
    assert.equal(image.requestCount, 2);
    assert.equal(image.tokenCache, "miss");
    assert.equal(image.mimeType, "image/png");
    assert.equal(image.data.toString("utf8"), "mock-image-bytes");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages/om_resource/resources/img%20key%2F1?type=image");
    assert.equal(requests[1].authorization, "Bearer tenant-token-1");

    const file = await downloadFeishuMessageResource(transport, {
      messageId: "om_resource",
      fileKey: "file-key",
      resourceType: "file",
      maxBytes: 1024,
    }, cachePath);
    assert.equal(file.ok, true);
    assert.equal(file.requestCount, 1);
    assert.equal(file.tokenCache, "hit");
    assert.equal(file.mimeType, "application/octet-stream");
    assert.equal(file.data.toString("utf8"), "mock-file-bytes");
    assert.equal(requests[2].path, "/open-apis/im/v1/messages/om_resource/resources/file-key?type=file");

    const streamed = await downloadFeishuMessageResourceToFile(transport, {
      messageId: "om_stream",
      fileKey: "img-stream",
      resourceType: "image",
      maxBytes: 1024,
      target: (mimeType) => prepareChannelConnectorAttachmentStagingTarget({
        attachment: {
          kind: "image",
          platform: "feishu",
          imageKey: "img-stream",
        },
        rootDir: path.join(root, "streamed"),
        messageId: "om_stream",
        index: 0,
        mimeType,
      }),
    }, cachePath);
    assert.equal(streamed.ok, true);
    assert.equal(streamed.requestCount, 1);
    assert.equal(streamed.tokenCache, "hit");
    assert.equal(streamed.mimeType, "image/png");
    assert.ok(streamed.localPath.endsWith(".png"));
    assert.equal(fs.readFileSync(streamed.localPath, "utf8"), "mock-image-bytes");
    assert.equal(requests[3].path, "/open-apis/im/v1/messages/om_stream/resources/img-stream?type=image");

    const tooLarge = await downloadFeishuMessageResourceToFile(transport, {
      messageId: "om_stream_large",
      fileKey: "file-large",
      resourceType: "file",
      maxBytes: 2,
      target: () => ({
        localPath: path.join(root, "too-large.bin"),
        tempPath: path.join(root, "too-large.bin.tmp"),
      }),
    }, cachePath);
    assert.equal(tooLarge.ok, false);
    assert.match(tooLarge.error || "", /exceeds size limit/);
    assert.equal(fs.existsSync(path.join(root, "too-large.bin")), false);
    assert.equal(fs.existsSync(path.join(root, "too-large.bin.tmp")), false);
  });
});

test("native Channel Connectors Feishu transport lists chat members with pagination", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_members",
      appSecret: "test-secret",
    };
    const result = await listFeishuChatMembers(transport, {
      chatId: "oc_chat",
      pageSize: 2,
      maxPages: 5,
    }, cachePath);
    assert.equal(result.ok, true);
    assert.equal(result.requestCount, 3);
    assert.equal(result.tokenCache, "miss");
    assert.equal(result.pageCount, 2);
    assert.equal(result.hasMore, false);
    assert.deepEqual(result.members, [
      { uid: "ou_admin", name: "Admin" },
      { uid: "ou_user_1", name: "Alice" },
      { uid: "ou_user_2", name: "Bob" },
    ]);
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/chats/oc_chat/members?member_id_type=open_id&page_size=2");
    assert.equal(requests[1].authorization, "Bearer tenant-token-1");
    assert.equal(requests[2].path, "/open-apis/im/v1/chats/oc_chat/members?member_id_type=open_id&page_size=2&page_token=page-2");

    const cached = await listFeishuChatMembers(transport, {
      chatId: "oc_chat",
      pageSize: 2,
      maxPages: 1,
    }, cachePath);
    assert.equal(cached.ok, true);
    assert.equal(cached.tokenCache, "hit");
    assert.equal(cached.requestCount, 1);
    assert.equal(cached.pageCount, 1);
    assert.equal(cached.hasMore, true);
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

test("native Channel Connectors Feishu transport uploads and sends images or files", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_media",
      appSecret: "test-secret",
    };

    const image = await uploadAndSendFeishuMedia(transport, {
      chatId: "oc_chat",
      data: Buffer.from("fake-png-bytes"),
      fileName: "diagram.png",
      mimeType: "image/png",
    }, cachePath);

    assert.equal(image.ok, true);
    assert.equal(image.action, "upload-and-send-media");
    assert.equal(image.requestCount, 3);
    assert.equal(image.imageKey, "img_uploaded_1");
    assert.equal(image.fileName, "diagram.png");
    assert.equal(image.mimeType, "image/png");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/images");
    assert.match(requests[1].contentType, /multipart\/form-data/);
    assert.match(requests[1].body.raw, /name="image_type"/);
    assert.match(requests[1].body.raw, /name="image"; filename="diagram\.png"/);
    assert.equal(requests[2].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[2].body.msg_type, "image");
    assert.deepEqual(JSON.parse(requests[2].body.content), { image_key: "img_uploaded_1" });

    const file = await uploadAndSendFeishuMedia(transport, {
      chatId: "oc_chat",
      data: Buffer.from("zip-bytes"),
      fileName: "archive.zip",
      mimeType: "application/zip",
    }, cachePath);

    assert.equal(file.ok, true);
    assert.equal(file.action, "upload-and-send-media");
    assert.equal(file.requestCount, 2);
    assert.equal(file.fileKey, "file_uploaded_1");
    assert.equal(file.fileName, "archive.zip");
    assert.equal(file.mimeType, "application/zip");
    assert.equal(requests[3].path, "/open-apis/im/v1/files");
    assert.match(requests[3].contentType, /multipart\/form-data/);
    assert.match(requests[3].body.raw, /name="file_type"/);
    assert.match(requests[3].body.raw, /name="file"; filename="archive\.zip"/);
    assert.equal(requests[4].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[4].body.msg_type, "file");
    assert.deepEqual(JSON.parse(requests[4].body.content), { file_key: "file_uploaded_1" });
  });
});

test("native Channel Connectors Feishu transport retries transient JSON failures", async () => {
  const requests = [];
  let sendAttempts = 0;
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
        sendAttempts += 1;
        if (sendAttempts === 1) {
          res.statusCode = 503;
          res.end(JSON.stringify({ code: 503, msg: "temporary unavailable" }));
          return;
        }
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { message_id: "om_sent_after_retry" },
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
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const result = await sendFeishuTextMessage({
      apiUrl: `http://127.0.0.1:${address.port}`,
      appId: "cli_retry",
      appSecret: "test-secret",
    }, {
      chatId: "oc_chat",
      content: "retry me",
    }, cachePath);

    assert.equal(result.ok, true);
    assert.equal(result.action, "send-message");
    assert.equal(result.requestCount, 3);
    assert.equal(result.messageId, "om_sent_after_retry");
    assert.equal(sendAttempts, 2);
    assert.equal(requests.length, 3);
    assert.equal(requests[1].authorization, "Bearer tenant-token-1");
    assert.equal(requests[2].authorization, "Bearer tenant-token-1");
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
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

test("native Channel Connectors process runner cancels active child processes", async () => {
  const root = makeTempRoot();
  const controller = new AbortController();
  const childScript = [
    "process.stdout.write(JSON.stringify({type:'turn.started'})+'\\n');",
    "setInterval(()=>{}, 1000);",
  ].join("");
  const resultPromise = defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: "",
    env: {},
    timeoutMs: 5000,
    signal: controller.signal,
    agent: "codex",
  });
  setTimeout(() => controller.abort(), 50);
  const result = await resultPromise;

  assert.equal(result.cancelled, true);
  assert.equal(result.timedOut, false);
  assert.equal(result.error, "Agent process cancelled.");
  assert.equal(result.progressEvents?.[0]?.type, "running");
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
  assert.match(daemonSource, /clients\.indexOf\(currentClient\)/);
  assert.match(daemonSource, /clients\.splice\(index,\s*1\)/);
  assert.match(daemonSource, /watchdog_non_connected_/);
  assert.match(daemonSource, /watchdog_connected_idle_/);
  assert.match(daemonSource, /watchdog_zero_inbound_/);
  assert.match(daemonSource, /DEFAULT_FEISHU_PING_TIMEOUT_SECONDS\s*=\s*10/);
  assert.match(daemonSource, /DEFAULT_FEISHU_CONNECTED_IDLE_RENEW_MS\s*=\s*5\s*\*\s*60_?000/);
  assert.match(daemonSource, /MIN_FEISHU_CONNECTED_IDLE_RENEW_MS\s*=\s*60_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MS\s*=\s*30_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MAX\s*=\s*1/);
  assert.match(daemonSource, /DEFAULT_FEISHU_WATCHDOG_RESTART_MS\s*=\s*45_?000/);
  assert.match(daemonSource, /MIN_FEISHU_WATCHDOG_RESTART_MS\s*=\s*10_?000/);
  assert.match(daemonSource, /feishuPingTimeoutSeconds/);
  assert.match(daemonSource, /const pingTimeout = feishuPingTimeoutSeconds\(group\)/);
  assert.match(daemonSource, /const feishuWsConfig = pingTimeout > 0 \? \{ pingTimeout \} : undefined/);
  assert.match(daemonSource, /\.\.\.\(feishuWsConfig \? \{ wsConfig: feishuWsConfig \} : \{\}\)/);
  assert.match(daemonSource, /pingTimeoutSeconds: feishuPingTimeoutSeconds\(group\)/);
  assert.match(daemonSource, /feishuConnectedIdleRenewMs/);
  assert.match(daemonSource, /feishuZeroInboundRenewMs/);
  assert.match(daemonSource, /feishuZeroInboundRenewMax/);
  assert.match(daemonSource, /feishuWatchdogRestartMs/);
  assert.match(daemonSource, /lifecycleReceivedMessages/);
  assert.match(daemonSource, /lifecycleLastReceivedAt/);
  assert.match(daemonSource, /suppressZeroInboundRenewal/);
  assert.match(daemonSource, /lastWatchdogRestartAt/);
  assert.match(daemonSource, /lastWatchdogRestartReason/);
  assert.match(daemonSource, /latestFeishuLifecycleActivityAt/);
  assert.match(daemonSource, /group\.lifecycleReceivedMessages === 0/);
  assert.match(daemonSource, /group\.lifecycleReceivedMessages > 0/);
  assert.match(daemonSource, /reason\.startsWith\("watchdog_connected_idle_"\)/);
  assert.match(daemonSource, /!\s*group\.suppressZeroInboundRenewal/);
  assert.match(daemonSource, /feishu_ping_timeout_seconds/);
  assert.match(daemonSource, /feishu_connected_idle_renew_ms/);
  assert.match(daemonSource, /feishu_zero_inbound_renew_ms/);
  assert.match(daemonSource, /zeroInboundRenewals/);
  assert.match(daemonSource, /feishu_watchdog_restart_ms/);
  assert.match(daemonSource, /lastReceivedAt/);
  assert.match(daemonSource, /Feishu WebSocket zero-inbound startup renewal threshold elapsed/);
  assert.match(daemonSource, /Feishu WebSocket reconnecting/);
  assert.match(daemonSource, /Feishu WebSocket reconnected/);
  assert.match(daemonSource, /sendFeishuTextMessage/);
  assert.match(daemonSource, /sendFeishuCardMessage/);
  assert.match(daemonSource, /patchFeishuCardMessage/);
  assert.match(daemonSource, /listFeishuChatMembers/);
  assert.match(daemonSource, /loadFeishuGroupMembers/);
  assert.match(daemonSource, /groupMemberCount/);
  assert.match(daemonSource, /function channelConnectorProgressDefaults/);
  assert.match(daemonSource, /function feishuProgressDefaults/);
  assert.match(daemonSource, /function octoProgressDefaults/);
  assert.match(daemonSource, /function channelConnectorStreamMessagesEnabled/);
  assert.match(daemonSource, /function shouldSendChannelProgressEvent/);
  assert.match(daemonSource, /shouldSendFeishuProgressEvent/);
  assert.match(daemonSource, /function normalizeFeishuCommandContent/);
  assert.match(daemonSource, /normalizeString\(input\.command\.action\)\.toLowerCase\(\) === "help"/);
  assert.match(daemonSource, /renderFeishuProgressCard/);
  assert.match(daemonSource, /function formatProgressToolInput/);
  assert.match(daemonSource, /function formatTodoWriteProgressInput/);
  assert.match(daemonSource, /function renderFeishuProgressEntry/);
  assert.match(daemonSource, /function renderPlainProgressEntry/);
  assert.match(daemonSource, /function renderPlainProgressMessage/);
  assert.match(daemonSource, /function progressKindIcon/);
  assert.match(daemonSource, /function progressResultIcon/);
  assert.match(daemonSource, /function renderAgentFailureReply/);
  assert.match(daemonSource, /function renderFeishuFinalReplyCard/);
  assert.match(daemonSource, /function sendFeishuFinalReply/);
  assert.match(daemonSource, /FEISHU_FINAL_REPLY_CARD_MAX_RUNES\s*=\s*12_000/);
  assert.match(daemonSource, /schema:\s*"2\.0"/);
  assert.match(daemonSource, /body:\s*\{\s*elements:/);
  assert.match(daemonSource, /replace\(\/!\\\[/);
  assert.match(daemonSource, /sendFeishuPostMessage/);
  assert.match(daemonSource, /send-final-post-after-card/);
  assert.match(daemonSource, /function renderFeishuProgressCardEventElements/);
  assert.match(daemonSource, /function feishuProgressCardStatusTag/);
  assert.doesNotMatch(daemonSource, /Studio Progress/);
  assert.doesNotMatch(daemonSource, /Studio Reply/);
  assert.doesNotMatch(daemonSource, /最终回复/);
  assert.match(daemonSource, /send-final-card/);
  assert.match(daemonSource, /send-final-text-after-card/);
  assert.match(daemonSource, /replyCardAttempted/);
  assert.match(daemonSource, /text_tag color='blue'/);
  assert.match(daemonSource, /text_tag color='turquoise'/);
  assert.match(daemonSource, /in_progress\|running\|started\|pending/);
  assert.match(daemonSource, /sendOrPatchFeishuProgressCard/);
  assert.match(daemonSource, /agent\.progress\.card/);
  assert.match(daemonSource, /renderOctoProgressText/);
  assert.match(daemonSource, /agent\.progress\.reply/);
  assert.match(daemonSource, /event\.type === "failed" \|\| event\.type === "error" \|\| event\.type === "tool"/);
  assert.match(daemonSource, /工具调用[^\n]+inlineProgressCode\(parsed\.toolName\)/);
  assert.match(daemonSource, /exit[^\n]+inlineProgressCode\(parsed\.exitCode\)/);
  assert.match(daemonSource, /event\.type === "running"/);
  assert.match(daemonSource, /\["reasoning",\s*"tool",\s*"failed",\s*"error"\]\.includes\(event\.type\)/);
  assert.match(daemonSource, /event\.type === "completed"[\s\S]{0,40}return;/);
  assert.match(daemonSource, /replyRequestCount/);
  assert.match(daemonSource, /progressCardSendCount/);
  assert.match(daemonSource, /ingressToAgentStartMs/);
  assert.match(daemonSource, /firstProgressLatencyMs/);
  assert.match(daemonSource, /sincePreviousProgressMs/);
  assert.match(daemonSource, /agentElapsedMs/);
  assert.match(daemonSource, /isOctoGroupChannel\(message\.channelType\)/);
  assert.match(daemonSource, /shouldSendChannelProgressEvent\(control,\s*event,\s*progressDefaults\)/);
  assert.match(daemonSource, /shouldSendFeishuProgressEvent\(control,\s*event,\s*progressDefaults\)/);
  assert.match(daemonSource, /channelConnectorStreamMessagesEnabled\(control,\s*progressDefaults\)/);
  assert.match(daemonSource, /jsonErrorEnvelopeMessage/);
  assert.match(daemonSource, /renderChannelConnectorCommandSurfaceFeishu/);
  assert.match(daemonSource, /shouldSendFeishuCommandCard/);
  assert.match(daemonSource, /\["new",\s*"reset",\s*"show",\s*"stop",\s*"passthrough"\]\.includes\(action\)/);
  assert.match(daemonSource, /stopLatestActiveRunForSession/);
  assert.match(daemonSource, /const activeRunCancels = new Map\(\)/);
  assert.match(daemonSource, /for \(const entry of activeRunCancels\.values\(\)\)\s*entry\.controller\.abort\(\)/);
  assert.match(daemonSource, /activeRunCancels\.set\(activeRunId/);
  assert.match(daemonSource, /activeRunCancels\.delete\(activeRunId\)/);
  assert.match(daemonSource, /signal:\s*abortController\.signal/);
  assert.match(daemonSource, /sendFeishuCommandTextReplyInBackground/);
  assert.match(daemonSource, /replyTransportAction\s*=\s*"send-message-async"/);
  assert.match(daemonSource, /eventKind:\s*"channel\.command\.reply"/);
  assert.match(daemonSource, /replyQueued/);
  assert.match(daemonSource, /!shouldSendCard && parsed\.kind === "card-action"/);
  assert.match(daemonSource, /return response \|\| undefined/);
  assert.doesNotMatch(daemonSource, /Studio 已收到操作/);
  assert.match(daemonSource, /loadFeishuSeenMessages/);
  assert.match(daemonSource, /seedFeishuSeenMessagesFromEventLog/);
  assert.match(daemonSource, /FEISHU_SEEN_MESSAGE_TTL_MS\s*=\s*24\s*\*\s*60\s*\*\s*60_?000/);
  assert.match(daemonSource, /dispatchFeishuParsedEventInBackground/);
  assert.match(daemonSource, /feishu_event_duplicate/);
  assert.match(daemonSource, /function feishuDedupeKey/);
  assert.match(daemonSource, /parsed\.kind === "message"/);
  const dedupeFunction = daemonSource.slice(
    daemonSource.indexOf("function feishuDedupeKey"),
    daemonSource.indexOf("async function dispatchOctoMessage"),
  );
  assert.ok(dedupeFunction.indexOf("feishu:message") < dedupeFunction.indexOf("feishu:event"));
  assert.doesNotMatch(daemonSource, /`feishu:\$\{group\.key\}:\$\{messageId\}:\$\{binding\.id\}`/);
  assert.doesNotMatch(daemonSource, /const lastActivityAt = group\.lastReceivedAt \|\| group\.lastConnectedAt/);
  const messageHandler = daemonSource.slice(
    daemonSource.indexOf('"im.message.receive_v1"'),
    daemonSource.indexOf('"card.action.trigger"'),
  );
  assert.match(messageHandler, /dispatchFeishuParsedEventInBackground/);
  assert.doesNotMatch(messageHandler, /await dispatchFeishuParsedEvent/);
  const botMenuHandler = daemonSource.slice(
    daemonSource.indexOf('"application.bot.menu_v6"'),
    daemonSource.indexOf('"im.message.recalled_v1"'),
  );
  assert.match(botMenuHandler, /dispatchFeishuParsedEventInBackground/);
  assert.doesNotMatch(botMenuHandler, /await dispatchFeishuParsedEvent/);
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
    assert.equal(botMenuNew.body.feishuCard, null);

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
    assert.equal(botMenuReset.body.feishuCard, null);

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

test("native Channel Connectors Octo long connection follows CC Go heartbeat and jitter contract", () => {
  const socketSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/octo-wukong.ts"),
    "utf8",
  );
  const daemonSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/daemon.ts"),
    "utf8",
  );

  assert.match(socketSource, /DEFAULT_OCTO_HEARTBEAT_MS\s*=\s*30_000/);
  assert.match(socketSource, /DEFAULT_OCTO_PONG_TIMEOUT_MS\s*=\s*10_000/);
  assert.match(socketSource, /DEFAULT_OCTO_RECONNECT_MS\s*=\s*3_000/);
  assert.match(socketSource, /DEFAULT_OCTO_RECONNECT_JITTER_MS\s*=\s*3_000/);
  assert.match(socketSource, /crypto\.randomInt\(0,\s*jitterMs\s*\+\s*1\)/);
  assert.match(daemonSource, /heartbeatMs:\s*octoHeartbeatMs\(binding\)/);
  assert.match(daemonSource, /pongTimeoutMs:\s*octoPongTimeoutMs\(binding\)/);
  assert.match(daemonSource, /reconnectMs:\s*octoReconnectMs\(binding\)/);
  assert.match(daemonSource, /reconnectJitterMs:\s*octoReconnectJitterMs\(binding\)/);
  assert.match(daemonSource, /DEFAULT_OCTO_REST_HEARTBEAT_MS\s*=\s*5\s*\*\s*60_?000/);
  assert.match(daemonSource, /sendOctoHeartbeat\(transport\)/);
  assert.match(daemonSource, /octoRestHeartbeatMs\(binding\)/);
  assert.match(daemonSource, /restHeartbeatIntervalMs/);
  assert.match(daemonSource, /restHeartbeatSuccesses/);
  assert.match(daemonSource, /restHeartbeatFailures/);
  assert.match(daemonSource, /restHeartbeatLastOkAt/);
  assert.match(daemonSource, /restHeartbeatLastErrorAt/);
  assert.match(daemonSource, /restHeartbeatLastError/);
  assert.match(daemonSource, /"octo_rest_heartbeat_ms"/);
  assert.match(daemonSource, /"octo_heartbeat_ms"/);
  assert.match(daemonSource, /"octo_reconnect_jitter_ms"/);
});

test("native Channel Connectors daemon queues same-session messages while an Agent run is active", () => {
  const daemonSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/daemon.ts"),
    "utf8",
  );

  assert.match(daemonSource, /function latestActiveRunForSession/);
  assert.match(daemonSource, /function acquireChannelSessionAgentRun/);
  assert.match(daemonSource, /channelSessionAgentRunQueues/);
  assert.match(daemonSource, /function queuedAgentRunReply/);
  assert.match(daemonSource, /本条已加入队列/);
  assert.match(daemonSource, /eventKind:\s*"channel\.agent\.queued"/);
  assert.match(daemonSource, /需要中断当前任务可以发送 `\/stop`/);
  assert.match(daemonSource, /channelSessionParallelAgentRunsEnabled/);
  assert.match(daemonSource, /"allow_session_parallel_runs"/);
});

test("native Channel Connectors daemon serializes same-session Octo Agent turns", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-queue-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', async () => {",
    "  const marker = stdin.includes('second queued turn') ? 'second' : 'first';",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ event: 'start', marker, at: Date.now(), stdin })}\\n`);",
    "  if (marker === 'first') await delay(650);",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ event: 'end', marker, at: Date.now() })}\\n`);",
    "  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: `thread-${marker}` })}\\n`);",
    "  process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: `${marker} done` } })}\\n`);",
    "  process.stdout.write('{\"type\":\"turn.completed\"}\\n');",
    "});",
    "",
  ].join("\n"), { mode: 0o755 });

  const wsConnects = [];
  let inboundSent = false;
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  const wsAddress = wss.address();
  assert.ok(wsAddress && typeof wsAddress === "object");
  const wsUrl = `ws://127.0.0.1:${wsAddress.port}/ws`;
  wss.on("connection", (socket) => {
    let connected = false;
    socket.on("message", (data) => {
      if (connected) return;
      const packet = decodeOctoConnectPacket(Buffer.isBuffer(data) ? data : Buffer.from(data));
      connected = true;
      wsConnects.push(packet);
      const serverKey = createOctoX25519KeyPair();
      const salt = "abcdef1234567890";
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      if (!inboundSent) {
        inboundSent = true;
        setTimeout(() => {
          if (socket.readyState !== 1) return;
          socket.send(encodeOctoRecvPacket({
            serverPrivateKey: serverKey.privateKey,
            clientPublicKeyBase64: packet.clientPublicKeyBase64,
            salt,
            messageId: 2001,
            messageSeq: 1,
            fromUid: "queue-user",
            channelId: "queue-user",
            channelType: 1,
            payload: {
              type: 1,
              content: "first queued turn",
            },
          }));
          socket.send(encodeOctoRecvPacket({
            serverPrivateKey: serverKey.privateKey,
            clientPublicKeyBase64: packet.clientPublicKeyBase64,
            salt,
            messageId: 2002,
            messageSeq: 2,
            fromUid: "queue-user",
            channelId: "queue-user",
            channelType: 1,
            payload: {
              type: 1,
              content: "second queued turn",
            },
          }));
        }, 50);
      }
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
      if (req.url === "/v1/models") {
        res.end(JSON.stringify({
          object: "list",
          data: [
            { id: "gpt-5", object: "model", features: { text: true } },
          ],
        }));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-queue", im_token: "im-token-queue", ws_url: wsUrl }));
        return true;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/sendMessage" || req.url === "/v1/bot/heartbeat") {
        res.end(JSON.stringify({ ok: true, message_id: `octo-${requests.length}` }));
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
              id: "codex-queue",
              name: "Codex Queue",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-queue",
          platformBindings: [
            {
              id: "octo-queue",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Queue",
              agentProfileId: "codex-queue",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                octoHeartbeatMs: 30_000,
                octoPongTimeoutMs: 10_000,
                octoReconnectMs: 3_000,
                octoReconnectJitterMs: 0,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const configPath = path.join(root, "daemon-queue-config.json");
      fs.mkdirSync(path.dirname(runtimeConfig.paths.log), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2), "utf8");

      const daemonEntry = path.resolve("dist/apps/api/modules/channel-connectors/daemon.js");
      const child = spawn(process.execPath, [daemonEntry, "--config", configPath], {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH || ""}`,
          STUDIO_GATEWAY_API_KEY: "sk-test-gateway",
          STUDIO_TEST_CODEX_CAPTURE: capturePath,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      try {
        const connectedStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-queue" && item.connected);
          return connected ? response.body : null;
        }, 5000);
        assert.equal(connectedStatus.ok, true);
        assert.equal(wsConnects.length, 1);

        const capture = await waitFor(() => {
          if (!fs.existsSync(capturePath)) return null;
          const lines = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
          if (lines.length < 4) return null;
          return lines.map((line) => JSON.parse(line));
        }, 10_000);
        const starts = capture.filter((item) => item.event === "start");
        const ends = capture.filter((item) => item.event === "end");
        assert.deepEqual(starts.map((item) => item.marker), ["first", "second"]);
        assert.deepEqual(ends.map((item) => item.marker), ["first", "second"]);
        assert.ok(
          starts[1].at >= ends[0].at,
          `second turn started before first turn ended: ${JSON.stringify(capture)}`,
        );
        assert.match(starts[0].stdin, /first queued turn/);
        assert.match(starts[1].stdin, /second queued turn/);

        const finalStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const first = response.body?.agentRuns?.find?.((item) => item.messageId === "2001" && item.ok);
          const second = response.body?.agentRuns?.find?.((item) => item.messageId === "2002" && item.ok);
          return first && second ? response.body : null;
        }, 5000);
        assert.equal(finalStatus.ok, true);
        const replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.match(replyContents, /本条已加入队列/);
        assert.match(replyContents, /first done/);
        assert.match(replyContents, /second done/);
        const octoEvents = fs.readFileSync(runtimeConfig.paths.octoEvents, "utf8")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "channel.agent.queued"
            && event.messageId === "2002"
            && event.sessionKey === "dmwork:dm:queue-user";
        }));
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

test("native Channel Connectors daemon registers Octo and opens WuKongIM WebSocket", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ argv: process.argv.slice(2), stdin, cwd: process.cwd(), openaiBaseUrl: process.env.OPENAI_BASE_URL, hasCodexHome: Boolean(process.env.CODEX_HOME) })}\\n`);",
    "  process.stdout.write('{\"type\":\"thread.started\",\"thread_id\":\"thread-octo-vision\"}\\n');",
    "  process.stdout.write('{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"图片已查看\"}}\\n');",
    "  process.stdout.write('{\"type\":\"turn.completed\"}\\n');",
    "});",
    "",
  ].join("\n"), { mode: 0o755 });

  const wsConnects = [];
  let inboundImageUrl = "";
  let inboundSent = false;
  const wss = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolve, reject) => {
    wss.once("listening", resolve);
    wss.once("error", reject);
  });
  const wsAddress = wss.address();
  assert.ok(wsAddress && typeof wsAddress === "object");
  const wsUrl = `ws://127.0.0.1:${wsAddress.port}/ws`;
  wss.on("connection", (socket) => {
    let connected = false;
    socket.on("message", (data) => {
      if (connected) return;
      const packet = decodeOctoConnectPacket(Buffer.isBuffer(data) ? data : Buffer.from(data));
      connected = true;
      wsConnects.push(packet);
      const serverKey = createOctoX25519KeyPair();
      const salt = "1234567890abcdef";
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      if (!inboundSent) {
        inboundSent = true;
        setTimeout(() => {
          if (socket.readyState !== 1 || !inboundImageUrl) return;
          socket.send(encodeOctoRecvPacket({
            serverPrivateKey: serverKey.privateKey,
            clientPublicKeyBase64: packet.clientPublicKeyBase64,
            salt,
            messageId: 1001,
            messageSeq: 1,
            fromUid: "route-user",
            channelId: "route-user",
            channelType: 1,
            payload: {
              type: 2,
              content: "",
              name: "red.png",
              url: inboundImageUrl,
              size: 68,
            },
          }));
        }, 50);
      }
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
      if (req.url === "/v1/models") {
        res.end(JSON.stringify({
          object: "list",
          data: [
            { id: "glm-5", object: "model", features: { text: true, vision: false } },
            { id: "gpt-5.5", object: "model", aliases: ["gmn-vision"], features: { text: true, vision: true, responses: true } },
          ],
        }));
        return true;
      }
      if (req.url === "/media/red.png") {
        res.setHeader("content-type", "image/png");
        res.end(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADUlEQVR42mP8z8BQDwAFgwJ/lpJr1QAAAABJRU5ErkJggg==", "base64"));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-1", im_token: "im-token-1", ws_url: wsUrl }));
        return true;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/sendMessage") {
        res.end(JSON.stringify({ ok: true, message_id: "octo-sent-1" }));
        return true;
      }
      return false;
    }, async (apiUrl) => {
      inboundImageUrl = `${apiUrl}/media/red.png`;
      const initial = service.getNativeConfig().config;
      service.saveNativeConfig({
        config: {
          ...initial,
          agentProfiles: [
            {
              id: "codex-ws",
              name: "Codex WS",
              agent: "codex",
              model: "glm-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: `${apiUrl}/v1`,
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
                allowPrivateAttachmentUrls: true,
                attachmentMaxBytes: 1024,
                octoHeartbeatMs: 30_000,
                octoPongTimeoutMs: 10_000,
                octoReconnectMs: 3_000,
                octoReconnectJitterMs: 0,
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
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH || ""}`,
          STUDIO_GATEWAY_API_KEY: "sk-test-gateway",
          STUDIO_TEST_CODEX_CAPTURE: capturePath,
        },
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
        const capture = await waitFor(() => {
          if (!fs.existsSync(capturePath)) return null;
          const lines = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
          return lines.length ? lines.map((line) => JSON.parse(line)) : null;
        }, 8000);
        assert.equal(capture.length, 1);
        assert.equal(capture[0].argv.includes("--image"), true);
        const imageArgIndex = capture[0].argv.indexOf("--image");
        const imageArgPath = capture[0].argv[imageArgIndex + 1];
        assert.match(imageArgPath, new RegExp(`${path.sep}attachments${path.sep}1001${path.sep}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
        assert.equal(path.basename(imageArgPath).endsWith("red.png"), true);
        assert.equal(capture[0].argv.includes("--model"), true);
        assert.equal(capture[0].argv[capture[0].argv.indexOf("--model") + 1], "gpt-5.5");
        assert.equal(capture[0].openaiBaseUrl, `${apiUrl}/v1`);
        assert.match(capture[0].stdin, /native --image arguments/);
        assert.doesNotMatch(capture[0].stdin, /Studio visual attachment policy/);
        const finalStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => item.messageId === "1001");
          return run ? response.body : null;
        }, 8000);
        const run = finalStatus.agentRuns.find((item) => item.messageId === "1001");
        assert.equal(run.ok, true);
        const octoEvents = fs.readFileSync(runtimeConfig.paths.octoEvents, "utf8")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "agent.model.selected"
            && event.messageId === "1001"
            && event.originalModel === "glm-5"
            && event.selectedModel === "gpt-5.5";
        }));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "agent.attachments.staged"
            && event.messageId === "1001"
            && event.stagedCount === 1;
        }));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "agent.visual.input"
            && event.messageId === "1001"
            && event.model === "gpt-5.5"
            && event.visualInputMode === "codex-native-image"
            && event.imageCount === 1
            && Array.isArray(event.localPaths)
            && event.localPaths[0] === imageArgPath;
        }));
        assert.equal(requests.some((request) => request.path === "/v1/models"), true);
        assert.equal(requests.some((request) => request.path === "/media/red.png"), true);
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
