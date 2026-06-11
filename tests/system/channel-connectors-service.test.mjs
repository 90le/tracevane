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
  isChannelConnectorProcessProgressEvent,
  runChannelConnectorAgentTurn,
} from "../../dist/apps/api/modules/channel-connectors/agent-runner.js";
import {
  clearChannelConnectorAgentSessionsForConversation,
  getChannelConnectorAgentSession,
  listChannelConnectorAgentSessionsForConversation,
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
  sendOctoReadReceipt,
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
  channelConnectorCommandAliasesFromMetadata,
  handleChannelConnectorCommand,
  listChannelConnectorGatewayModels,
  listChannelConnectorCommandAliasesForBinding,
  matchChannelConnectorCommandPrefix,
  matchChannelConnectorSubCommand,
  parseChannelConnectorCommand,
  resolveChannelConnectorBindingCommandAlias,
  resolveChannelConnectorCommandAlias,
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
  channelConnectorCompactGatewayUrl,
  compactChannelConnectorConversation,
} from "../../dist/apps/api/modules/channel-connectors/conversation-compact.js";
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
import {
  extractChannelConnectorOutboundMessages,
} from "../../dist/apps/api/modules/channel-connectors/outbound-messages.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-channel-connectors-"));
}

function feishuDeleteModeCheckerName(sessionId) {
  return `delete_sel_${Buffer.from(sessionId, "utf8").toString("hex")}`;
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
  const deadline = performance.now() + timeoutMs;
  let lastError = null;
  while (performance.now() < deadline) {
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

async function waitForJsonFile(filePath, timeoutMs = 5000) {
  return await waitFor(() => {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }, timeoutMs);
}

async function waitForJsonLines(filePath, predicate, timeoutMs = 5000) {
  return await waitFor(() => {
    if (!fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, "utf8")
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    return predicate(lines) ? lines : null;
  }, timeoutMs);
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

async function withMockOctoServer(task, options = {}) {
  const requests = [];
  const fileUploadStatus = Number.isInteger(options.fileUploadStatus) ? options.fileUploadStatus : 200;
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
      if (req.method === "POST" && req.url === "/v1/bot/readReceipt") {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups") {
        res.end(JSON.stringify([
          { group_no: "group-1", name: "Studio Group" },
          { group_no: "group-2", name: "Build Group" },
        ]));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1") {
        res.end(JSON.stringify({ group_no: "group-1", name: "Studio Group", notice: "Ship", creator: "user-owner" }));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/members") {
        res.end(JSON.stringify({
          members: [
            { uid: "user-1", name: "Alice", role: 1, robot: 0 },
            { uid: "robot-1", name: "Studio Bot", role: 2, robot: 1 },
          ],
        }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/v1/bot/space/members")) {
        res.end(JSON.stringify([{ uid: "user-1", name: "Alice", robot: 0 }]));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/createGroup") {
        res.end(JSON.stringify({ group_no: "group-new", name: body.name || "Group Name" }));
        return;
      }
      if (req.method === "PUT" && req.url === "/v1/bot/groups/group-1/info") {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/groups/group-1/members/add") {
        res.end(JSON.stringify({ ok: true, added: Array.isArray(body.members) ? body.members.length : 0 }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/groups/group-1/members/remove") {
        res.end(JSON.stringify({ ok: true, removed: Array.isArray(body.members) ? body.members.length : 0 }));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/threads") {
        res.end(JSON.stringify([{ short_id: "thread-1", name: "Thread One", creator_uid: "user-1", status: 1 }]));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/threads/thread-1") {
        res.end(JSON.stringify({ short_id: "thread-1", name: "Thread One", creator_uid: "user-1", status: 1 }));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/threads/thread-1/members") {
        res.end(JSON.stringify([{ uid: "user-1", name: "Alice" }]));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/groups/group-1/threads") {
        res.end(JSON.stringify({ short_id: "thread-new", name: body.name || "Thread Name", creator_uid: "robot-1" }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/groups/group-1/threads/thread-1/join") {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/groups/group-1/threads/thread-1/leave") {
        res.end(JSON.stringify({ ok: true }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/events/event-1/ack") {
        res.end(JSON.stringify({ status: 200 }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/messages/sync") {
        const payload = Buffer.from(JSON.stringify({ type: 1, content: "history hello" }), "utf8").toString("base64");
        res.end(`{"start_message_seq":1,"end_message_seq":1,"pull_mode":1,"messages":[{"message_id":12345678901234567,"message_seq":1,"from_uid":"user-1","channel_id":"group-1","channel_type":2,"timestamp":1742547600,"payload":"${payload}"}]}`);
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/v1/bot/file/download/chat/hello.txt")) {
        res.statusCode = 302;
        res.setHeader("location", "https://cdn.example.test/chat/hello.txt");
        res.end();
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
        if (fileUploadStatus !== 200) {
          res.statusCode = fileUploadStatus;
          res.end(JSON.stringify({ error: "legacy_upload_unavailable" }));
          return;
        }
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
  assert.equal(typeof status.runtime.reachable, "boolean");
  assert.equal(status.runtime.checkedAt, "2026-06-06T08:00:00.000Z");
  assert.ok(Array.isArray(status.runtime.autoCompacts));
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

test("native Channel Connectors extracts outbound IM message manifests", () => {
  const extracted = extractChannelConnectorOutboundMessages([
    "我会通知她们。",
    "```studio-channel-messages",
    JSON.stringify([
      { platform: "octo", target: "dm:user-1", content: "请介绍一下你的能力" },
      { platform: "octo", target: "group:group-a", content: "大家看这里", mentionUids: ["user-2"] },
      { platform: "octo", target: "thread:group-a____topic-1", content: "Thread ping", mentionAll: true },
      { platform: "feishu", chatId: "oc_chat", content: "Feishu ping" },
    ]),
    "```",
  ].join("\n"));

  assert.equal(extracted.replyText, "我会通知她们。");
  assert.deepEqual(extracted.errors, []);
  assert.equal(extracted.messages.length, 4);
  assert.deepEqual(extracted.messages.map((message) => [message.platform, message.channelId, message.channelType, message.chatId, message.content]), [
    ["octo", "user-1", 1, null, "请介绍一下你的能力"],
    ["octo", "group-a", 2, null, "大家看这里"],
    ["octo", "group-a____topic-1", 5, null, "Thread ping"],
    ["feishu", "", null, "oc_chat", "Feishu ping"],
  ]);
  assert.deepEqual(extracted.messages[1].mentionUids, ["user-2"]);
  assert.equal(extracted.messages[2].mentionAll, true);

  const invalid = extractChannelConnectorOutboundMessages([
    "bad",
    "```studio-channel-messages",
    "{nope",
    "```",
  ].join("\n"));
  assert.equal(invalid.replyText, "bad");
  assert.equal(invalid.messages.length, 0);
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
          disabledCommands: ["whoami", "deploy"],
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
  assert.deepEqual(saved.config.platformBindings[0].disabledCommands, ["whoami", "deploy"]);
  assert.deepEqual(preview.config.projects[0].platformBindings[0].disabledCommands, ["whoami", "deploy"]);
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

test("Octo adapter normalizes mixed-case account identity like the Octo plugin", async () => {
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
          id: "octo-mixed-case",
          platform: "octo",
          accountId: "27xIxHrNV0Qc3ee2129_bot",
          botId: "27xIxHrNV0Qc3ee2129_bot",
          displayName: "Octo mixed-case BotFather bot",
          agentProfileId: "codex-main",
          enabled: true,
          allowlist: [],
          adminUsers: [],
        },
      ],
    },
  });

  const resolvedByLowercaseRequest = await service.dispatchOctoIncoming({
    accountId: "27xixhrnv0qc3ee2129_bot",
    botId: "27xixhrnv0qc3ee2129_bot",
    dryRun: true,
    message: {
      messageId: "mixed-case-directed",
      fromUid: "user-1",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "@studio status",
        mention: { uids: ["27xixhrnv0qc3ee2129_bot"] },
      },
    },
  });

  assert.equal(resolvedByLowercaseRequest.accepted, true);
  assert.equal(resolvedByLowercaseRequest.binding.id, "octo-mixed-case");
  assert.equal(resolvedByLowercaseRequest.incoming.directed, true);

  const selfMessage = await service.dispatchOctoIncoming({
    bindingId: "octo-mixed-case",
    dryRun: true,
    message: {
      messageId: "mixed-case-self",
      fromUid: "27xixhrnv0qc3ee2129_bot",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "self echo",
      },
    },
  });

  assert.equal(selfMessage.accepted, false);
  assert.equal(selfMessage.skippedReason, "octo_self_message");
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

  const broadcast = await service.dispatchOctoIncoming({
    bindingId: "octo-group",
    dryRun: true,
    message: {
      messageId: "g-broadcast",
      fromUid: "user-2",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "@所有人 status",
        mention: { all: 1, ais: 1, humans: 1 },
      },
    },
  });
  assert.equal(broadcast.accepted, false);
  assert.equal(broadcast.skippedReason, "octo_group_message_not_directed");

  const aiMention = await service.dispatchOctoIncoming({
    bindingId: "octo-group",
    dryRun: true,
    message: {
      messageId: "g-ai-mention",
      fromUid: "user-2",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "@所有AI status",
        mention: { ais: 1 },
      },
    },
  });
  assert.equal(aiMention.accepted, true);
  assert.equal(aiMention.incoming.directed, true);

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

test("Octo transport sends read receipt with message ids", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const result = await sendOctoReadReceipt({
      apiUrl,
      botToken: "octo-token",
    }, {
      channelId: "group-1",
      channelType: 2,
      messageIds: ["12345678901234567"],
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, "read-receipt");
    const request = requests.find((item) => item.path === "/v1/bot/readReceipt");
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.authorization, "Bearer octo-token");
    assert.deepEqual(request.body, {
      channel_id: "group-1",
      channel_type: 2,
      message_ids: ["12345678901234567"],
    });
  });
});

test("Octo transport upload strategy defaults to direct upload and honors overrides", () => {
  assert.equal(shouldDirectUploadOctoMedia({ apiUrl: "https://octo.test", botToken: "token" }, 1024), true);
  assert.equal(shouldDirectUploadOctoMedia({
    apiUrl: "https://octo.test",
    botToken: "token",
    directUploadMinBytes: 8 * 1024 * 1024,
  }, 1024), false);
  assert.equal(shouldDirectUploadOctoMedia({
    apiUrl: "https://octo.test",
    botToken: "token",
    directUploadMinBytes: 8 * 1024 * 1024,
  }, 9 * 1024 * 1024), true);
  assert.equal(shouldDirectUploadOctoMedia({ apiUrl: "https://octo.test", botToken: "token", uploadStrategy: "direct" }, 1), true);
  assert.equal(shouldDirectUploadOctoMedia({ apiUrl: "https://octo.test", botToken: "token", uploadStrategy: "multipart" }, 99 * 1024 * 1024), false);
  assert.equal(shouldDirectUploadOctoMedia({
    apiUrl: "https://octo.test",
    botToken: "token",
    directUploadMinBytes: 1,
  }, 1), true);
});

test("Octo transport smoke covers Bot API groups, members, history, threads, and files", async () => {
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
            id: "octo-api",
            platform: "octo",
            accountId: "octo-account",
            botId: "robot-1",
            displayName: "Octo API",
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

    const smoke = (payload) => service.runOctoTransportSmoke({ bindingId: "octo-api", ...payload });
    const groups = await smoke({ action: "list-groups" });
    assert.equal(groups.transport.ok, true);
    assert.equal(groups.transport.action, "list-groups");
    assert.equal(groups.transport.itemCount, 2);
    assert.equal(groups.transport.data[0].group_no, "group-1");

    const groupInfo = await smoke({ action: "group-info", groupNo: "group-1" });
    assert.equal(groupInfo.transport.data.name, "Studio Group");

    const members = await smoke({ action: "group-members", groupNo: "group-1" });
    assert.equal(members.transport.itemCount, 2);
    assert.equal(members.transport.data[1].robot, 1);

    const space = await smoke({ action: "space-members", keyword: "Alice", limit: 1 });
    assert.equal(space.transport.itemCount, 1);
    assert.ok(requests.some((request) => request.path === "/v1/bot/space/members?keyword=Alice&limit=1"));

    const readReceipt = await smoke({ action: "read-receipt", channelId: "group-1", channelType: 2 });
    assert.equal(readReceipt.transport.ok, true);
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/readReceipt"
      && request.body.channel_id === "group-1"
      && request.body.channel_type === 2
    ));

    const createdGroup = await smoke({
      action: "create-group",
      name: "New Group",
      members: ["user-1"],
      creator: "user-owner",
    });
    assert.equal(createdGroup.transport.data.group_no, "group-new");

    const updatedGroup = await smoke({ action: "update-group", groupNo: "group-1", name: "Renamed", notice: "Notice" });
    assert.equal(updatedGroup.transport.ok, true);

    const added = await smoke({ action: "add-group-members", groupNo: "group-1", members: ["user-2", "user-3"] });
    assert.equal(added.transport.data.added, 2);

    const removed = await smoke({ action: "remove-group-members", groupNo: "group-1", members: ["user-2"] });
    assert.equal(removed.transport.data.removed, 1);

    const threads = await smoke({ action: "list-threads", groupNo: "group-1" });
    assert.equal(threads.transport.itemCount, 1);
    assert.equal(threads.transport.data[0].short_id, "thread-1");

    const threadInfo = await smoke({ action: "thread-info", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(threadInfo.transport.data.name, "Thread One");

    const threadMembers = await smoke({ action: "thread-members", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(threadMembers.transport.data[0].uid, "user-1");

    const createdThread = await smoke({ action: "create-thread", groupNo: "group-1", name: "New Thread" });
    assert.equal(createdThread.transport.data.short_id, "thread-new");

    const joined = await smoke({ action: "join-thread", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(joined.transport.ok, true);

    const left = await smoke({ action: "leave-thread", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(left.transport.ok, true);

    const ack = await smoke({ action: "event-ack", eventId: "event-1" });
    assert.equal(ack.transport.data.status, 200);

    const history = await smoke({ action: "sync-messages", channelId: "group-1", channelType: 2, limit: 10 });
    assert.equal(history.transport.itemCount, 1);
    assert.equal(history.transport.data.messages[0].message_id, "12345678901234567");
    assert.equal(history.transport.data.messages[0].payload.content, "history hello");

    const download = await smoke({ action: "file-download-url", filePath: "chat/hello.txt", fileName: "hello.txt" });
    assert.equal(download.transport.mediaUrl, "https://cdn.example.test/chat/hello.txt");
    assert.equal(download.transport.data.location, "https://cdn.example.test/chat/hello.txt");
  });
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
      cosUploadBaseUrl: apiUrl,
    }, {
      channelId: "user-2",
      channelType: 1,
      data: Buffer.from("named file"),
      fileName: "龙虾 计划(最终版).md",
      mimeType: "text/markdown",
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, "direct-upload-and-send-media");
    assert.equal(result.fileName, "龙虾 计划(最终版).md");
    assert.equal(
      requests[0].path,
      `/v1/bot/upload/credentials?filename=${encodeURIComponent("龙虾 计划(最终版).md")}`,
    );
    assert.equal(requests[1].method, "PUT");
    assert.equal(requests[2].path, "/v1/bot/sendMessage");
    assert.equal(requests[2].body.payload.name, "龙虾 计划(最终版).md");
  });
});

test("Octo auto upload falls back to direct upload when legacy multipart is gone", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const result = await uploadAndSendOctoMedia({
      apiUrl,
      botToken: "octo-token",
      cosUploadBaseUrl: apiUrl,
      directUploadMinBytes: 8 * 1024 * 1024,
    }, {
      channelId: "user-2",
      channelType: 1,
      data: Buffer.from("hello"),
      fileName: "hello.txt",
      mimeType: "text/plain",
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, "direct-upload-and-send-media");
    assert.equal(result.fileName, "hello.txt");
    assert.equal(result.requestCount, 4);
    assert.equal(requests[0].path, "/v1/bot/file/upload");
    assert.equal(requests[1].path, `/v1/bot/upload/credentials?filename=${encodeURIComponent("hello.txt")}`);
    assert.equal(requests[2].method, "PUT");
    assert.equal(requests[3].path, "/v1/bot/sendMessage");
    assert.equal(requests[3].body.payload.name, "hello.txt");
  }, { fileUploadStatus: 410 });
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
              cosUploadBaseUrl: apiUrl,
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
    assert.equal(result.transport.action, "direct-upload-and-send-media");
    assert.equal(result.transport.requestCount, 3);
    assert.equal(result.transport.mediaUrl, "https://cdn.example.test/im-test/chat/1742547600/uuid_report.pdf");
    assert.equal(result.transport.fileName, "diagram.png");
    assert.equal(result.transport.mimeType, "image/png");
    assert.equal(result.transport.size, Buffer.byteLength("mock image bytes"));
    assert.equal(requests.length, 3);
    assert.equal(requests[0].path, `/v1/bot/upload/credentials?filename=${encodeURIComponent("diagram.png")}`);
    assert.equal(requests[0].authorization, "Bearer test-token");
    assert.equal(requests[1].method, "PUT");
    assert.equal(requests[1].path, "/im-test/chat/1742547600/uuid_report.pdf");
    assert.equal(requests[1].body.raw, "mock image bytes");
    assert.equal(requests[2].path, "/v1/bot/sendMessage");
    assert.deepEqual(requests[2].body, {
      channel_id: "user-2",
      channel_type: 1,
      payload: {
        type: 2,
        url: "https://cdn.example.test/im-test/chat/1742547600/uuid_report.pdf",
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

  const channelSkillRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    channelSkillContext: [
      "[Studio IM channel skills]",
      "Current IM platform: octo.",
      "Available platform skills in this binding:",
      "- /octo-send: Send Octo DM, group, thread, and mention messages",
    ].join("\n"),
  });
  assert.ok(channelSkillRequest);
  assert.match(channelSkillRequest.stdin, /^\[Studio IM channel skills\]/);
  assert.match(channelSkillRequest.stdin, /\/octo-send: Send Octo DM, group, thread, and mention messages/);
  assert.match(channelSkillRequest.stdin, /\n\nhi codex\n\n\[Studio outbound file policy\]/);
  for (const cleanupPath of channelSkillRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
  assert.equal(result.progress.latest?.phase, "final");
  assert.equal(isChannelConnectorProcessProgressEvent(result.progress.latest), false);
  assert.equal(result.session.resumed, false);
  assert.equal(result.session.codexThreadId, "019e9b45-8ab3-7f41-99a0-a9e7d0f2abf5");
  assert.ok(turnCleanupPath);
  assert.equal(fs.existsSync(turnCleanupPath), false);

  const manifestResult = await runChannelConnectorAgentTurn({
    project,
    binding,
    message: {
      ...message,
      messageId: "m-runner-manifest",
      payload: { type: 1, content: "发一个文件给我" },
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async () => ({
      exitCode: 0,
      signal: null,
      stdout: [
        JSON.stringify({ type: "thread.started", thread_id: "019e9b45-manifest" }),
        JSON.stringify({ type: "item.completed", item: { type: "function_call_output", call_id: "read-file", content: [{ type: "output_text", text: "tool output should not be final reply" }] } }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "给你发一个 TOOLS.md 文件，里面是小丘的角色分工图和工具使用规范：" } }),
        JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "```studio-channel-files\n[{\"path\":\"workspace/TOOLS.md\",\"name\":\"TOOLS.md\",\"caption\":\"小丘角色分工与工具规范\"}]\n```" } }),
        "",
      ].join("\n"),
      stderr: "",
      durationMs: 12,
      timedOut: false,
      error: null,
    }),
  });
  assert.equal(manifestResult.ok, true);
  assert.match(manifestResult.replyText, /规范：\n\n```studio-channel-files\n\[/);
  assert.doesNotMatch(manifestResult.replyText, /tool output should not be final reply/);
  const manifest = extractChannelConnectorOutboundFiles(manifestResult.replyText);
  assert.equal(manifest.replyText, "给你发一个 TOOLS.md 文件，里面是小丘的角色分工图和工具使用规范：");
  assert.equal(manifest.files.length, 1);
  assert.equal(manifest.files[0].path, "workspace/TOOLS.md");
  assert.equal(manifest.files[0].name, "TOOLS.md");

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
  assert.equal(claudeRequest.permissionMode, "plan");
  assert.equal(claudeRequest.args.includes("--input-format"), true);
  assert.equal(claudeRequest.args.includes("stream-json"), true);
  assert.equal(claudeRequest.args.includes("--verbose"), true);
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

  const claudeResumeRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "claude-code", permissionMode: "plan" },
    binding: { ...binding, agent: "claude-code" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    session: { agentNativeSessionId: "claude-session-1" },
  });
  assert.ok(claudeResumeRequest);
  assert.equal(claudeResumeRequest.sessionMode, "resume");
  const claudeResumeArgIndex = claudeResumeRequest.args.indexOf("--resume");
  assert.notEqual(claudeResumeArgIndex, -1);
  assert.equal(claudeResumeRequest.args[claudeResumeArgIndex + 1], "claude-session-1");
  assert.equal(claudeResumeRequest.agentNativeSessionId, "claude-session-1");

  const claudeTurnResult = await runChannelConnectorAgentTurn({
    project: { ...project, agent: "claude-code", permissionMode: "plan" },
    binding: { ...binding, agent: "claude-code" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async (request) => {
      assert.equal(request.command, "claude");
      assert.equal(request.sessionMode, "new");
      return {
        exitCode: 0,
        signal: null,
        stdout: [
          '{"type":"system","session_id":"claude-session-created"}',
          '{"type":"result","result":"hello from claude","session_id":"claude-session-created"}',
          "",
        ].join("\n"),
        stderr: "",
        durationMs: 10,
        timedOut: false,
        error: null,
      };
    },
  });
  assert.equal(claudeTurnResult.ok, true);
  assert.equal(claudeTurnResult.replyText, "hello from claude");
  assert.equal(claudeTurnResult.session.agentNativeSessionId, "claude-session-created");
  assert.equal(claudeTurnResult.session.codexThreadId, null);

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
  const opencodeModelArgIndex = opencodeRequest.args.indexOf("--model");
  assert.notEqual(opencodeModelArgIndex, -1);
  assert.equal(opencodeRequest.args[opencodeModelArgIndex + 1], "studio-gateway/gpt-5");
  assert.equal(opencodeRequest.args.includes("--thinking"), true);
  assert.equal(opencodeRequest.args.includes("--variant"), true);
  assert.equal(opencodeRequest.args.includes("high"), true);
  assert.match(opencodeRequest.env.XDG_CONFIG_HOME, /studio-channel-opencode-/);
  assert.match(opencodeRequest.env.XDG_DATA_HOME, /studio-channel-opencode-/);
  const opencodeConfigPath = path.join(opencodeRequest.env.XDG_CONFIG_HOME, "opencode", "opencode.json");
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodeConfigPath, "utf8"));
  assert.equal(opencodeConfig.model, "studio-gateway/gpt-5");
  assert.equal(opencodeConfig.provider["studio-gateway"].options.baseURL, project.gatewayEndpoint);
  assert.equal(opencodeConfig.provider["studio-gateway"].options.apiKey, "sk-local");
  assert.equal(opencodeConfig.provider["studio-gateway"].models["gpt-5"].name, "gpt-5");
  assert.equal(fs.statSync(opencodeConfigPath).mode & 0o777, 0o600);
  assert.match(opencodeRequest.args.at(-1), /^hi codex/);
  assert.match(opencodeRequest.args.at(-1), /studio-channel-files/);
  assert.doesNotMatch(opencodeRequest.args.at(-1), /cc-connect/);
  for (const cleanupPath of opencodeRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const opencodeSlashModelRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", model: "mlamp/deepseek-v4-flash" },
    binding: { ...binding, agent: "opencode" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(opencodeSlashModelRequest);
  const slashModelArgIndex = opencodeSlashModelRequest.args.indexOf("--model");
  assert.equal(opencodeSlashModelRequest.args[slashModelArgIndex + 1], "studio-gateway/mlamp/deepseek-v4-flash");
  const slashModelConfig = JSON.parse(fs.readFileSync(path.join(opencodeSlashModelRequest.env.XDG_CONFIG_HOME, "opencode", "opencode.json"), "utf8"));
  assert.equal(slashModelConfig.model, "studio-gateway/mlamp/deepseek-v4-flash");
  assert.equal(slashModelConfig.provider["studio-gateway"].models["mlamp/deepseek-v4-flash"].name, "mlamp/deepseek-v4-flash");
  for (const cleanupPath of opencodeSlashModelRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const opencodeStaleSessionRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode" },
    binding: { ...binding, agent: "opencode" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    agentRuntimeDir: path.join(root, "state", "agent-runtime", "opencode-main"),
    session: { agentNativeSessionId: "ses_stale_global_opencode" },
  });
  assert.ok(opencodeStaleSessionRequest);
  assert.equal(opencodeStaleSessionRequest.args.includes("--session"), false);
  assert.equal(opencodeStaleSessionRequest.sessionMode, "new");
  assert.equal(opencodeStaleSessionRequest.agentNativeSessionId, null);
  for (const cleanupPath of opencodeStaleSessionRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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

  const claudeUnsupportedNativeCompact = await runChannelConnectorAgentTurn({
    project: { ...project, agent: "claude-code" },
    binding: { ...binding, agent: "claude-code" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    nativeCommand: "/compact",
  });
  assert.equal(claudeUnsupportedNativeCompact.attempted, false);
  assert.equal(claudeUnsupportedNativeCompact.status, "failed");
  assert.match(claudeUnsupportedNativeCompact.error, /one-shot runner/);
  assert.match(claudeUnsupportedNativeCompact.error, /live interactive Agent session/);

  const opencodeUnsupportedNativeCompact = await runChannelConnectorAgentTurn({
    project: { ...project, agent: "opencode" },
    binding: { ...binding, agent: "opencode" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    nativeCommand: "/compact",
  });
  assert.equal(opencodeUnsupportedNativeCompact.attempted, false);
  assert.equal(opencodeUnsupportedNativeCompact.status, "failed");
  assert.match(opencodeUnsupportedNativeCompact.error, /one-shot runner/);
  assert.match(opencodeUnsupportedNativeCompact.error, /live interactive Agent session/);

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
  assert.ok(resumeThreadArgIndex < resumeImageArgIndex);
  assert.equal(resumeVisionAttachmentRequest.args[resumeImageArgIndex + 1], visionImagePath);
  assert.equal(resumeVisionAttachmentRequest.args.at(-2), "--json");
  assert.equal(resumeVisionAttachmentRequest.args.at(-1), "-");
  for (const cleanupPath of resumeVisionAttachmentRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const claudeVisionAttachmentRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "claude-code", model: "claude-sonnet" },
    binding: { ...binding, agent: "claude-code" },
    message: {
      ...message,
      messageId: "m-runner-claude-vision-image",
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
  assert.ok(claudeVisionAttachmentRequest);
  assert.equal(claudeVisionAttachmentRequest.command, "claude");
  assert.equal(claudeVisionAttachmentRequest.args.includes("--image"), false);
  const claudeVisionInput = JSON.parse(claudeVisionAttachmentRequest.stdin);
  assert.equal(Array.isArray(claudeVisionInput.message.content), true);
  assert.equal(claudeVisionInput.message.content[0].type, "image");
  assert.equal(claudeVisionInput.message.content[0].source.type, "base64");
  assert.equal(claudeVisionInput.message.content[0].source.media_type, "image/png");
  assert.equal(claudeVisionInput.message.content[0].source.data, Buffer.from("fake-png").toString("base64"));
  assert.equal(claudeVisionInput.message.content[1].type, "text");
  assert.match(claudeVisionInput.message.content[1].text, /native image content blocks/);
  assert.match(claudeVisionInput.message.content[1].text, /Studio attachment summary/);
  assert.doesNotMatch(claudeVisionInput.message.content[1].text, /Studio visual attachment policy/);

  const opencodeVisionAttachmentRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", model: "gmn-vision" },
    binding: { ...binding, agent: "opencode" },
    message: {
      ...message,
      messageId: "m-runner-opencode-vision-image",
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
  assert.ok(opencodeVisionAttachmentRequest);
  assert.equal(opencodeVisionAttachmentRequest.command, "opencode");
  const opencodeFileArgIndex = opencodeVisionAttachmentRequest.args.indexOf("--file");
  const opencodePromptSeparatorIndex = opencodeVisionAttachmentRequest.args.indexOf("--");
  assert.notEqual(opencodeFileArgIndex, -1);
  assert.notEqual(opencodePromptSeparatorIndex, -1);
  assert.ok(opencodeFileArgIndex < opencodePromptSeparatorIndex);
  assert.equal(opencodeVisionAttachmentRequest.args[opencodeFileArgIndex + 1], visionImagePath);
  assert.match(opencodeVisionAttachmentRequest.args.at(-1), /native --file arguments/);
  assert.doesNotMatch(opencodeVisionAttachmentRequest.args.at(-1), /Studio visual attachment policy/);
  const opencodeVisionConfigPath = path.join(opencodeVisionAttachmentRequest.env.XDG_CONFIG_HOME, "opencode", "opencode.json");
  const opencodeVisionConfig = JSON.parse(fs.readFileSync(opencodeVisionConfigPath, "utf8"));
  const opencodeVisionModelConfig = opencodeVisionConfig.provider["studio-gateway"].models["gmn-vision"];
  assert.equal(opencodeVisionModelConfig.attachment, true);
  assert.deepEqual(opencodeVisionModelConfig.modalities, { input: ["text", "image"], output: ["text"] });
  assert.deepEqual(opencodeVisionModelConfig.limit, { context: 200000, output: 8192 });
  assert.equal(opencodeVisionModelConfig.tool_call, true);

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

  const opencodeEnvelopeFailure = await runChannelConnectorAgentTurn({
    project: { ...project, agent: "opencode" },
    binding: { ...binding, agent: "opencode" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    processRunner: async (request) => {
      const modelArgIndex = request.args.indexOf("--model");
      assert.equal(request.args[modelArgIndex + 1], "studio-gateway/gpt-5");
      return {
        exitCode: 1,
        signal: null,
        stdout: JSON.stringify({
          type: "error",
          error: {
            name: "UnknownError",
            data: {
              message: "Unexpected server error. Check server logs for details.",
              ref: "err_opencode_gateway",
            },
          },
        }) + "\n",
        stderr: "",
        durationMs: 22,
        timedOut: false,
        error: null,
      };
    },
  });
  assert.equal(opencodeEnvelopeFailure.ok, false);
  assert.match(opencodeEnvelopeFailure.error, /Unexpected server error/);
  assert.match(opencodeEnvelopeFailure.error, /name=UnknownError/);
  assert.match(opencodeEnvelopeFailure.error, /ref=err_opencode_gateway/);
  assert.doesNotMatch(opencodeEnvelopeFailure.error, /^error$/);
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
    agentNativeSessionId: "thread-a",
    codexThreadId: "thread-a",
    messageId: "message-1",
    status: "completed",
    now: new Date("2026-06-06T08:00:00.000Z"),
  });
  assert.equal(first.agentNativeSessionId, "thread-a");
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
  assert.equal(loaded?.agentNativeSessionId, "thread-a");
  assert.equal(loaded?.codexThreadId, "thread-a");
  assert.equal(loaded?.turnCount, 2);

  const switchedModel = getChannelConnectorAgentSession(storePath, {
    ...lookup,
    model: "gpt-5.5",
  });
  assert.equal(switchedModel?.codexThreadId, "thread-a");
  assert.equal(switchedModel?.turnCount, 2);

  const claudeLookup = {
    ...lookup,
    projectId: "claude-main",
    agent: "claude-code",
    model: "claude-sonnet",
  };
  const claude = upsertChannelConnectorAgentSession(storePath, {
    ...claudeLookup,
    agentNativeSessionId: "claude-session-a",
    messageId: "message-claude-1",
    status: "completed",
    now: new Date("2026-06-06T08:02:00.000Z"),
  });
  assert.equal(claude.agentNativeSessionId, "claude-session-a");
  assert.equal(claude.codexThreadId, null);

  const deleted = clearChannelConnectorAgentSessionsForConversation(storePath, {
    bindingId: lookup.bindingId,
    sessionKey: lookup.sessionKey,
  });
  assert.equal(deleted, 2);
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

test("native Channel Connectors compact posts to Gateway and clears stale Agent sessions", async () => {
  const root = makeTempRoot();
  const historyPath = path.join(root, "state", "channel-history.json");
  const agentSessionsPath = path.join(root, "state", "channel-sessions.json");
  const lookup = {
    bindingId: "octo-codex",
    sessionKey: "dmwork:dm:user-1",
  };
  const workDir = path.join(root, "work");
  const project = {
    id: "codex-main",
    name: "Codex main",
    workDir,
    agent: "codex",
    model: "gpt-5",
    permissionMode: "suggest",
    gatewayEndpoint: "",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "codex",
    platformBindings: [],
  };

  appendChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "m-compact-user",
    role: "user",
    text: "继续处理 TOOLS.md 和文件发送能力。",
    now: new Date("2026-06-06T08:00:00.000Z"),
  });
  appendChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "m-compact-assistant",
    role: "assistant",
    text: "已确认需要复刻 CC Go 的文件能力。",
    status: "completed",
    now: new Date("2026-06-06T08:00:01.000Z"),
  });
  upsertChannelConnectorAgentSession(agentSessionsPath, {
    ...lookup,
    projectId: project.id,
    agent: project.agent,
    model: project.model,
    workDir,
    agentNativeSessionId: "thread-codex-before-compact",
    codexThreadId: "thread-codex-before-compact",
    messageId: "m-compact-assistant",
    status: "completed",
  });
  upsertChannelConnectorAgentSession(agentSessionsPath, {
    ...lookup,
    projectId: "claude-main",
    agent: "claude-code",
    model: "claude-sonnet",
    workDir,
    agentNativeSessionId: "claude-before-compact",
    messageId: "m-claude-before-compact",
    status: "completed",
  });
  upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: lookup.bindingId,
    sessionKey: "dmwork:dm:other-user",
    projectId: project.id,
    agent: project.agent,
    model: project.model,
    workDir,
    agentNativeSessionId: "thread-other-session",
    codexThreadId: "thread-other-session",
    messageId: "m-other",
    status: "completed",
  });

  const requests = [];
  await withServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    await new Promise((resolve) => req.on("end", resolve));
    const raw = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization || null,
      body: raw ? JSON.parse(raw) : {},
    });
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/v1/responses/compact") {
      res.end(JSON.stringify({
        output_text: "compact summary from gateway: 继续文件发送能力，保留 TOOLS.md 背景。",
      }));
      return true;
    }
    return false;
  }, async (baseUrl) => {
    assert.equal(channelConnectorCompactGatewayUrl(`${baseUrl}/v1`), `${baseUrl}/v1/responses/compact`);
    const result = await compactChannelConnectorConversation({
      historyPath,
      agentSessionsPath,
      gatewayEndpoint: `${baseUrl}/v1`,
      gatewayClientKey: "sk-test-compact-client",
      ...lookup,
      project: {
        ...project,
        gatewayEndpoint: `${baseUrl}/v1`,
      },
      now: new Date("2026-06-06T08:00:02.000Z"),
    });
    assert.equal(result.ok, true);
    assert.equal(result.beforeEntries, 2);
    assert.equal(result.afterEntries, 1);
    assert.equal(result.sessionsCleared, 2);
    assert.match(result.summaryText, /compact summary from gateway/);
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(requests[0].path, "/v1/responses/compact");
  assert.equal(requests[0].authorization, "Bearer sk-test-compact-client");
  assert.equal(requests[0].body.model, "gpt-5");
  assert.equal(requests[0].body.stream, false);
  assert.equal(requests[0].body.metadata.studio_channel_compact, true);
  assert.match(requests[0].body.input, /Summarize this Studio IM conversation/);
  assert.match(requests[0].body.input, /TOOLS\.md/);

  const compactEntries = getChannelConnectorConversationHistory(historyPath, lookup, 10);
  assert.equal(compactEntries.length, 1);
  assert.equal(compactEntries[0].status, "compact-summary");
  assert.match(compactEntries[0].text, /继续文件发送能力/);
  assert.equal(getChannelConnectorAgentSession(agentSessionsPath, {
    ...lookup,
    projectId: project.id,
    agent: project.agent,
    model: project.model,
    workDir,
  }), null);
  assert.equal(getChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: lookup.bindingId,
    sessionKey: "dmwork:dm:other-user",
    projectId: project.id,
    agent: project.agent,
    model: project.model,
    workDir,
  })?.codexThreadId, "thread-other-session");
});

test("native Channel Connectors service slash compact works for Feishu and Octo command smoke", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const connectorPaths = resolveChannelConnectorsPaths(config);
  const historyPath = path.join(connectorPaths.stateDir, "channel-history.json");
  const agentSessionsPath = path.join(connectorPaths.stateDir, "channel-sessions.json");
  const secretPath = path.join(root, ".config", "openclaw-studio", "model-gateway", "secrets.json");
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, JSON.stringify({
    secrets: {
      "gateway:client-api-key": { value: "sk-service-compact-key" },
    },
  }));
  fs.mkdirSync(path.join(root, "codex-work"), { recursive: true });

  const requests = [];
  await withServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    await new Promise((resolve) => req.on("end", resolve));
    const raw = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization || null,
      body: raw ? JSON.parse(raw) : {},
    });
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/v1/responses/compact") {
      res.end(JSON.stringify({ output_text: "service compact summary from gateway" }));
      return true;
    }
    return false;
  }, async (baseUrl) => {
    const initial = service.getNativeConfig().config;
    service.saveNativeConfig({
      config: {
        ...initial,
        gateway: {
          ...initial.gateway,
          endpoint: `${baseUrl}/v1`,
        },
        agentProfiles: [
          {
            id: "codex-main",
            name: "Codex main",
            agent: "codex",
            model: "gpt-5",
            workDir: path.join(root, "codex-work"),
            permissionMode: "suggest",
            gatewayEndpoint: `${baseUrl}/v1`,
            gatewayKeyRef: "studio-gateway-client-key",
            appProfileRef: "codex",
          },
        ],
        defaultAgentProfileId: "codex-main",
        platformBindings: [
          {
            id: "feishu-main",
            platform: "feishu",
            accountId: "cli_test",
            botId: "bot_test",
            displayName: "Feishu Main",
            agentProfileId: "codex-main",
            enabled: true,
            allowlist: ["ou_admin"],
            adminUsers: ["ou_admin"],
            metadata: { verificationToken: "verify-token" },
          },
          {
            id: "octo-main",
            platform: "octo",
            accountId: "octo-account",
            botId: "octo-bot",
            displayName: "Octo Main",
            agentProfileId: "codex-main",
            enabled: true,
            allowlist: ["user-1"],
            adminUsers: ["user-1"],
          },
        ],
      },
    });

    const workDir = path.join(root, "codex-work");
    const feishuLookup = { bindingId: "feishu-main", sessionKey: "feishu:oc_chat:ou_admin" };
    const octoLookup = { bindingId: "octo-main", sessionKey: "dmwork:dm:user-1" };
    for (const [lookup, prefix] of [[feishuLookup, "feishu"], [octoLookup, "octo"]]) {
      appendChannelConnectorConversationHistory(historyPath, {
        ...lookup,
        messageId: `${prefix}-history-user`,
        role: "user",
        text: `${prefix} context before compact`,
      });
      appendChannelConnectorConversationHistory(historyPath, {
        ...lookup,
        messageId: `${prefix}-history-assistant`,
        role: "assistant",
        text: `${prefix} assistant context before compact`,
        status: "completed",
      });
      upsertChannelConnectorAgentSession(agentSessionsPath, {
        ...lookup,
        projectId: "codex-main",
        agent: "codex",
        model: "gpt-5",
        workDir,
        agentNativeSessionId: `${prefix}-thread-before-compact`,
        codexThreadId: `${prefix}-thread-before-compact`,
        messageId: `${prefix}-message-before-compact`,
        status: "completed",
      });
    }

    const feishuCompact = await service.dispatchFeishuWebhook({
      schema: "2.0",
      header: {
        event_type: "im.message.receive_v1",
        app_id: "cli_test",
        event_id: "evt_feishu_compact",
        token: "verify-token",
      },
      event: {
        sender: { sender_id: { open_id: "ou_admin" } },
        message: {
          message_id: "om_feishu_compact",
          chat_id: "oc_chat",
          chat_type: "p2p",
          message_type: "text",
          content: JSON.stringify({ text: "/compact" }),
        },
      },
    });
    assert.equal(feishuCompact.accepted, true);
    assert.equal(feishuCompact.commandAction.commandResult.ok, true);
    assert.equal(feishuCompact.commandAction.commandResult.action, "compact");
    assert.match(feishuCompact.commandAction.commandResult.replyText, /已压缩当前 IM 会话上下文/);
    assert.match(feishuCompact.feishuResponse.toast.content, /已压缩当前 IM 会话上下文/);
    assert.equal(feishuCompact.feishuResponse.card, undefined);

    const octoCompact = await service.dispatchOctoIncoming({
      bindingId: "octo-main",
      dryRun: false,
      sendReply: false,
      message: {
        messageId: "m-octo-compact",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/compact" },
      },
    });
    assert.equal(octoCompact.accepted, true);
    assert.equal(octoCompact.agentDispatch.status, "skipped");
    assert.equal(octoCompact.commandAction.commandResult.ok, true);
    assert.equal(octoCompact.commandAction.commandResult.action, "compact");
    assert.match(octoCompact.replyPlan.chunks.join("\n"), /已压缩当前 IM 会话上下文/);

    const compactRequests = requests.filter((request) => request.path === "/v1/responses/compact");
    assert.equal(compactRequests.length, 2);
    assert.deepEqual(compactRequests.map((request) => request.authorization), [
      "Bearer sk-service-compact-key",
      "Bearer sk-service-compact-key",
    ]);
    assert.deepEqual(compactRequests.map((request) => request.body.metadata.agent), ["codex", "codex"]);

    const compactRequestsBeforeDryRun = requests.filter((request) => request.path === "/v1/responses/compact").length;
    const dryRunCompact = await service.dispatchOctoIncoming({
      bindingId: "octo-main",
      dryRun: true,
      sendReply: false,
      message: {
        messageId: "m-octo-compact-dry-run",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/compact" },
      },
    });
    assert.equal(dryRunCompact.accepted, true);
    assert.equal(dryRunCompact.agentDispatch.status, "dry-run");
    assert.equal(dryRunCompact.commandAction.commandResult.action, "show");
    assert.match(dryRunCompact.replyPlan.chunks.join("\n"), /未执行状态修改/);
    assert.equal(
      requests.filter((request) => request.path === "/v1/responses/compact").length,
      compactRequestsBeforeDryRun,
    );

    for (const lookup of [feishuLookup, octoLookup]) {
      const entries = getChannelConnectorConversationHistory(historyPath, lookup, 10);
      assert.equal(entries.length, 1);
      assert.equal(entries[0].status, "compact-summary");
      assert.match(entries[0].text, /service compact summary/);
      assert.equal(getChannelConnectorAgentSession(agentSessionsPath, {
        ...lookup,
        projectId: "codex-main",
        agent: "codex",
        model: "gpt-5",
        workDir,
      }), null);
    }

    appendChannelConnectorConversationHistory(historyPath, {
      ...octoLookup,
      messageId: "octo-history-before-new",
      role: "user",
      text: "context before /new",
    });
    upsertChannelConnectorAgentSession(agentSessionsPath, {
      ...octoLookup,
      projectId: "codex-main",
      agent: "codex",
      model: "gpt-5",
      workDir,
      codexThreadId: "octo-thread-before-new",
      messageId: "m-before-new",
      status: "completed",
    });
    const octoNew = await service.dispatchOctoIncoming({
      bindingId: "octo-main",
      dryRun: false,
      sendReply: false,
      message: {
        messageId: "m-octo-new",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/new" },
      },
    });
    assert.equal(octoNew.commandAction.commandResult.ok, true);
    assert.equal(octoNew.commandAction.commandResult.action, "new");
    assert.match(octoNew.replyPlan.chunks.join("\n"), /已开启新的 Agent 会话/);
    assert.deepEqual(getChannelConnectorConversationHistory(historyPath, octoLookup, 10), []);

    appendChannelConnectorConversationHistory(historyPath, {
      ...octoLookup,
      messageId: "octo-history-before-reset",
      role: "assistant",
      text: "context before /reset",
    });
    upsertChannelConnectorAgentSession(agentSessionsPath, {
      ...octoLookup,
      projectId: "codex-main",
      agent: "codex",
      model: "gpt-5",
      workDir,
      codexThreadId: "octo-thread-before-reset",
      messageId: "m-before-reset",
      status: "completed",
    });
    const octoReset = await service.dispatchOctoIncoming({
      bindingId: "octo-main",
      dryRun: false,
      sendReply: false,
      message: {
        messageId: "m-octo-reset",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/reset" },
      },
    });
    assert.equal(octoReset.commandAction.commandResult.ok, true);
    assert.equal(octoReset.commandAction.commandResult.action, "reset");
    assert.match(octoReset.replyPlan.chunks.join("\n"), /已重置本 IM 会话/);
    assert.deepEqual(getChannelConnectorConversationHistory(historyPath, octoLookup, 10), []);
  });
});

test("native Channel Connectors IM commands switch agent, model, and permission per session", async () => {
  const root = makeTempRoot();
  const stateDir = path.join(root, "state");
  const controlsPath = path.join(stateDir, "channel-session-controls.json");
  const customCommandsPath = path.join(stateDir, "channel-custom-commands.json");
  const commandAliasesPath = path.join(stateDir, "channel-command-aliases.json");
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
  fs.mkdirSync(path.join(codexProject.workDir, ".codex", "skills", "release-notes"), { recursive: true });
  fs.writeFileSync(
    path.join(codexProject.workDir, ".codex", "skills", "release-notes", "SKILL.md"),
    [
      "---",
      "name: Release Notes",
      "description: Draft concise release notes",
      "---",
      "Write release notes from the provided change list.",
    ].join("\n"),
    "utf8",
  );
  fs.mkdirSync(path.join(claudeProject.workDir, "src"), { recursive: true });
  fs.mkdirSync(path.join(claudeProject.workDir, ".claude", "commands"), { recursive: true });
  fs.mkdirSync(path.join(claudeProject.workDir, ".claude", "skills", "triage"), { recursive: true });
  fs.writeFileSync(
    path.join(claudeProject.workDir, ".claude", "commands", "review-code.md"),
    "Review target {{1}} with notes {{2*:no extra notes}}",
    "utf8",
  );
  fs.writeFileSync(
    path.join(claudeProject.workDir, ".claude", "skills", "triage", "SKILL.md"),
    "---\ndescription: Triage bug reports\n---\nClassify severity and next actions.",
    "utf8",
  );
  const octoPlatformSkillDir = path.join(root, "platform-skills", "octo");
  fs.mkdirSync(path.join(octoPlatformSkillDir, "octo-send"), { recursive: true });
  fs.writeFileSync(
    path.join(octoPlatformSkillDir, "octo-send", "SKILL.md"),
    "---\nname: Octo Send\ndescription: Send Octo DM, group, thread, and mention messages\n---\nUse Studio Octo channel transport for DM, group, thread, and mention work.",
    "utf8",
  );
  const feishuPlatformSkillDir = path.join(root, "platform-skills", "feishu");
  fs.mkdirSync(path.join(feishuPlatformSkillDir, "feishu-card"), { recursive: true });
  fs.writeFileSync(
    path.join(feishuPlatformSkillDir, "feishu-card", "SKILL.md"),
    "---\nname: Feishu Card\ndescription: Build Feishu card and message workflows\n---\nUse Studio Feishu channel transport for card and message work.",
    "utf8",
  );
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
    metadata: { channelSkillDirs: [octoPlatformSkillDir] },
  };
  const feishuBinding = {
    ...binding,
    id: "feishu-codex",
    platform: "feishu",
    accountId: "feishu-app",
    botId: "feishu-bot",
    displayName: "Feishu Codex",
    metadata: { channelSkillDirs: [feishuPlatformSkillDir] },
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
    commandAliasesPath,
    customCommandsPath,
    agentSessionsPath,
    conversationHistoryPath,
    replyBuffersPath,
    gatewayClientKey: "sk-local",
    listModels: async () => ["gpt-5", "gpt-5.5", "claude-sonnet"],
    listModelCatalog: async () => [
      {
        id: "gpt-5",
        contextWindow: 128000,
        maxOutputTokens: 8192,
        aliases: ["gpt-main"],
        providerIds: ["gmn"],
        healthyProviderIds: ["gmn"],
        openCircuitProviderIds: [],
        features: { text: true, tools: true, reasoning: true },
      },
      {
        id: "gpt-5.5",
        contextWindow: 256000,
        maxOutputTokens: 16384,
        aliases: [],
        providerIds: ["gmn"],
        healthyProviderIds: ["gmn"],
        openCircuitProviderIds: [],
        features: { text: true, tools: true, reasoning: true, vision: true },
      },
    ],
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
  assert.match(help.replyText, /^Studio Channel/);
  assert.match(help.replyText, /普通消息会交给当前 Agent/);
  assert.match(help.replyText, /`\/status`/);
  assert.match(help.replyText, /`\/whoami`/);
  assert.match(help.replyText, /`\/version`/);
  assert.match(help.replyText, /\/mode/);
  assert.match(help.replyText, /\/reasoning/);
  assert.match(help.replyText, /\/thinking/);
  assert.match(help.replyText, /\/process/);
  assert.match(help.replyText, /\/tools/);
  assert.match(help.replyText, /\/quiet/);
  assert.match(help.replyText, /`\/help session`/);
  assert.match(help.replyText, /`\/help buffer`/);
  assert.match(help.replyText, /`\/help commands`/);
  assert.match(help.replyText, /`\/help native`/);
  assert.match(help.replyText, /`\/compact`/);
  assert.match(help.replyText, /`\/stop`/);
  assert.match(help.replyText, /`\/native \/help`/);
  assert.match(help.replyText, /`\/skills`/);
  assert.match(help.replyText, /\*\*常用命令\*\*/);
  assert.match(help.replyText, /\*\*分组帮助\*\*/);
  assert.match(help.replyText, /- `\/help session` - 会话、history、usage、权限批准/);
  assert.doesNotMatch(help.replyText, /\| 命令 \| 作用 \|/);
  const sessionHelp = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/help session"),
  });
  assert.equal(sessionHelp.handled, true);
  assert.equal(sessionHelp.ok, true);
  assert.match(sessionHelp.replyText, /Studio Channel \/ session\n\n- `\/whoami` - /);
  assert.doesNotMatch(sessionHelp.replyText, /\| 命令 \| 作用 \|/);
  assert.match(sessionHelp.replyText, /`\/whoami`/);
  assert.match(sessionHelp.replyText, /`\/version`/);
  assert.match(sessionHelp.replyText, /`\/name <名称>`/);
  assert.match(sessionHelp.replyText, /`\/search <关键字>`/);
  assert.ok(sessionHelp.replyText.includes("`/delete <序号|sessionId前缀|1,3-5>`"));
  assert.match(sessionHelp.replyText, /`\/usage`/);
  assert.match(sessionHelp.replyText, /先尝试 live persistent Agent 原生 compact/);
  assert.match(sessionHelp.replyText, /Gateway `\/responses\/compact`/);
  assert.match(sessionHelp.replyText, /`\/approve`/);
  assert.match(sessionHelp.replyText, /返回：`\/help`/);
  const displayHelp = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/help display"),
  });
  assert.equal(displayHelp.handled, true);
  assert.equal(displayHelp.ok, true);
  assert.match(displayHelp.replyText, /Studio Channel \/ display\n\n- `\/display` - /);
  assert.doesNotMatch(displayHelp.replyText, /\| 命令 \| 作用 \|/);
  assert.ok(displayHelp.replyText.includes("`/quiet [quiet|compact|full]`"));
  assert.doesNotMatch(displayHelp.replyText, /`\/buffer <id\|前缀\|latest>`/);
  const bufferHelp = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/help buffer"),
  });
  assert.equal(bufferHelp.handled, true);
  assert.equal(bufferHelp.ok, true);
  assert.match(bufferHelp.replyText, /Studio Channel \/ buffer\n\n- `\/buffer` - /);
  assert.ok(bufferHelp.replyText.includes("`/buffer <id|前缀|latest>`"));
  assert.match(bufferHelp.replyText, /`\/quiet compact`/);
  assert.doesNotMatch(bufferHelp.replyText, /\| 命令 \| 作用 \|/);
  const commandsHelp = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/help commands"),
  });
  assert.equal(commandsHelp.handled, true);
  assert.equal(commandsHelp.ok, true);
  assert.match(commandsHelp.replyText, /Studio Channel \/ commands/);
  assert.match(commandsHelp.replyText, /`\/commands add <名称> <prompt 模板>`/);
  assert.match(commandsHelp.replyText, /`\/commands addexec \[--work-dir <目录>\] <名称> <shell 命令>`/);
  assert.match(commandsHelp.replyText, /`\/skills`/);
  assert.doesNotMatch(commandsHelp.replyText, /\| 命令 \| 作用 \|/);
  const nativeHelp = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/help native"),
  });
  assert.equal(nativeHelp.handled, true);
  assert.equal(nativeHelp.ok, true);
  assert.match(nativeHelp.replyText, /Studio Channel \/ native/);
  assert.match(nativeHelp.replyText, /`\/native \/compact`/);
  assert.match(nativeHelp.replyText, /Codex one-shot/);
  assert.doesNotMatch(nativeHelp.replyText, /`\/commands add <名称> <prompt 模板>`/);
  assert.doesNotMatch(nativeHelp.replyText, /\| 命令 \| 作用 \|/);
  assert.equal(parseChannelConnectorCommand("%help")?.name, "help");
  assert.equal(parseChannelConnectorCommand("/%help")?.name, "help");
  assert.equal(matchChannelConnectorCommandPrefix("stat"), "status");
  assert.equal(matchChannelConnectorCommandPrefix("myid"), "whoami");
  assert.equal(matchChannelConnectorCommandPrefix("ver"), "version");
  assert.equal(matchChannelConnectorCommandPrefix("hist"), "history");
  assert.equal(matchChannelConnectorCommandPrefix("quo"), "usage");
  assert.equal(matchChannelConnectorCommandPrefix("qui"), "quiet");
  assert.equal(matchChannelConnectorCommandPrefix("n"), null);
  assert.equal(matchChannelConnectorCommandPrefix("s"), null);
  assert.equal(matchChannelConnectorSubCommand("l", ["list", "add", "del", "delete"]), "list");
  assert.equal(matchChannelConnectorSubCommand("d", ["list", "add", "del", "delete"]), "d");
  const aliases = channelConnectorCommandAliasesFromMetadata({
    aliases: {
      帮助: "/help",
      新建: "/new",
    },
    commandAliases: [
      { name: "状态", command: "/status" },
      "模型=>/model",
    ],
  });
  assert.deepEqual(aliases.map((alias) => [alias.name, alias.command, alias.source]), [
    ["帮助", "/help", "metadata"],
    ["新建", "/new", "metadata"],
    ["状态", "/status", "metadata"],
    ["模型", "/model", "metadata"],
  ]);
  assert.deepEqual(resolveChannelConnectorCommandAlias("帮助", aliases), {
    content: "/help",
    matchedAlias: { name: "帮助", command: "/help", source: "metadata" },
  });
  assert.deepEqual(resolveChannelConnectorCommandAlias("新建 sprint", aliases), {
    content: "/new sprint",
    matchedAlias: { name: "新建", command: "/new", source: "metadata" },
  });
  assert.deepEqual(resolveChannelConnectorCommandAlias("普通消息", aliases), {
    content: "普通消息",
    matchedAlias: null,
  });
  const aliasListEmpty = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/alias"),
  });
  assert.equal(aliasListEmpty.handled, true);
  assert.equal(aliasListEmpty.ok, true);
  assert.match(aliasListEmpty.replyText, /暂无别名配置/);
  const addAlias = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/alias add 快捷 status"),
  });
  assert.equal(addAlias.handled, true);
  assert.equal(addAlias.ok, true);
  assert.match(addAlias.replyText, /已添加命令别名：快捷 -> \/status/);
  assert.deepEqual(listChannelConnectorCommandAliasesForBinding(binding, commandAliasesPath).map((alias) => [alias.name, alias.command, alias.source]), [
    ["快捷", "/status", "store"],
  ]);
  assert.deepEqual(resolveChannelConnectorBindingCommandAlias(binding, "快捷 now", commandAliasesPath), {
    content: "/status now",
    matchedAlias: { name: "快捷", command: "/status", source: "store" },
  });
  const aliasList = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/alias"),
  });
  assert.match(aliasList.replyText, /快捷 -> \/status \[store\]/);
  const nonAdminAddAlias = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/alias add 非法 /help", "user-2"),
  });
  assert.equal(nonAdminAddAlias.ok, false);
  assert.match(nonAdminAddAlias.replyText, /没有管理/);
  const metadataProtectedAlias = await handleChannelConnectorCommand({
    ...baseContext,
    binding: {
      ...binding,
      metadata: { aliases: { 帮助: "/help" } },
    },
    message: message("/alias add 帮助 /status"),
  });
  assert.equal(metadataProtectedAlias.ok, false);
  assert.match(metadataProtectedAlias.replyText, /来自 binding metadata/);
  const deleteMetadataAlias = await handleChannelConnectorCommand({
    ...baseContext,
    binding: {
      ...binding,
      metadata: { aliases: { 帮助: "/help" } },
    },
    message: message("/alias del 帮助"),
  });
  assert.equal(deleteMetadataAlias.ok, false);
  assert.match(deleteMetadataAlias.replyText, /不能通过 \/alias del 删除/);
  const deleteAlias = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/alias del 快捷"),
  });
  assert.equal(deleteAlias.ok, true);
  assert.match(deleteAlias.replyText, /已删除命令别名：快捷/);
  assert.deepEqual(listChannelConnectorCommandAliasesForBinding(binding, commandAliasesPath), []);

  for (const alias of ["/menu", "/start"]) {
    const aliasHelp = await handleChannelConnectorCommand({
      ...baseContext,
      message: message(alias),
    });
    assert.equal(aliasHelp.handled, true);
    assert.equal(aliasHelp.action, "help");
    assert.match(aliasHelp.replyText, /^Studio Channel/);
  }

  const whoami = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/whoami"),
  });
  assert.equal(whoami.handled, true);
  assert.equal(whoami.ok, true);
  assert.equal(whoami.action, "show");
  assert.match(whoami.replyText, /Studio Whoami/);
  assert.match(whoami.replyText, /User ID: admin-1/);
  assert.match(whoami.replyText, /Channel ID: admin-1/);
  assert.match(whoami.replyText, /Platform: octo/);
  assert.match(whoami.replyText, /Binding: octo-codex/);
  assert.match(whoami.replyText, /Session key: dmwork:dm:admin-1/);
  assert.match(whoami.replyText, /Can manage session: yes/);
  const myid = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/myid", "user-2"),
  });
  assert.equal(myid.handled, true);
  assert.equal(myid.ok, true);
  assert.match(myid.replyText, /User ID: user-2/);
  assert.match(myid.replyText, /Can manage session: no/);
  const commandAclBinding = {
    ...binding,
    disabledCommands: ["whoami", "daily", "release-notes"],
  };
  const blockedMyid = await handleChannelConnectorCommand({
    ...baseContext,
    binding: commandAclBinding,
    message: message("/myid", "user-2"),
  });
  assert.equal(blockedMyid.handled, true);
  assert.equal(blockedMyid.ok, false);
  assert.equal(blockedMyid.action, "show");
  assert.match(blockedMyid.replyText, /禁用命令 \/whoami/);
  const adminBypassesDisabledMyid = await handleChannelConnectorCommand({
    ...baseContext,
    binding: commandAclBinding,
    message: message("/myid"),
  });
  assert.equal(adminBypassesDisabledMyid.handled, true);
  assert.equal(adminBypassesDisabledMyid.ok, true);
  assert.match(adminBypassesDisabledMyid.replyText, /Can manage session: yes/);
  const wildcardDisabledStatus = await handleChannelConnectorCommand({
    ...baseContext,
    binding: {
      ...binding,
      disabledCommands: ["*"],
    },
    message: message("/status", "user-2"),
  });
  assert.equal(wildcardDisabledStatus.handled, true);
  assert.equal(wildcardDisabledStatus.ok, false);
  assert.match(wildcardDisabledStatus.replyText, /已禁用所有命令/);
  const metadataDisabledVersion = await handleChannelConnectorCommand({
    ...baseContext,
    binding: {
      ...binding,
      metadata: { disabled_commands: "version" },
    },
    message: message("/version", "user-2"),
  });
  assert.equal(metadataDisabledVersion.handled, true);
  assert.equal(metadataDisabledVersion.ok, false);
  assert.match(metadataDisabledVersion.replyText, /禁用命令 \/version/);
  const version = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/version"),
  });
  assert.equal(version.handled, true);
  assert.equal(version.ok, true);
  assert.equal(version.action, "show");
  assert.match(version.replyText, /Studio Channel Version/);
  assert.match(version.replyText, /Studio: 0\.1\.70/);
  assert.match(version.replyText, /Node: v/);
  assert.match(version.replyText, /Platform: /);
  assert.match(version.replyText, /Binding: octo-codex \(octo\)/);
  assert.match(version.replyText, /Daemon config: v1/);
  assert.match(version.replyText, /Runtime root: /);

  const abbreviatedStatus = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/stat"),
  });
  assert.equal(abbreviatedStatus.handled, true);
  assert.equal(abbreviatedStatus.action, "status");
  assert.equal(abbreviatedStatus.ok, true);
  assert.match(abbreviatedStatus.replyText, /Context budget:/);
  assert.match(abbreviatedStatus.replyText, /Window: 128000 tokens; no usage\/history estimate yet\./);
  assert.match(abbreviatedStatus.replyText, /Auto compact threshold: 115200 tokens/);

  const statusWithUsage = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/status"),
    summarizeUsage: async (scope) => {
      assert.equal(scope.bindingId, "octo-codex");
      assert.equal(scope.sessionKey, "dmwork:dm:admin-1");
      assert.equal(scope.project.id, "codex-main");
      assert.equal(scope.command, "/status");
      return {
        source: "gateway-runtime-window",
        requests: 1,
        successfulRequests: 1,
        failedRequests: 0,
        inputTokens: 60,
        outputTokens: 20,
        totalTokens: 80,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        lastRequestAt: "2026-06-09T08:00:00.000Z",
        providers: ["gmn"],
        models: ["gpt-5"],
        requestIds: ["req-status"],
      };
    },
  });
  assert.equal(statusWithUsage.ok, true);
  assert.match(statusWithUsage.replyText, /Used: 80 \/ 128000 tokens/);
  assert.match(statusWithUsage.replyText, /Remaining: 127920 tokens; source: Gateway usage\./);
  assert.match(statusWithUsage.replyText, /Compact plan: native-first with live persistent Agent session; Studio fallback otherwise\./);

  const abbreviatedHistory = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/hist"),
  });
  assert.equal(abbreviatedHistory.handled, true);
  assert.equal(abbreviatedHistory.action, "show");
  assert.equal(abbreviatedHistory.ok, true);

  const ambiguousCommandPrefix = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/s"),
  });
  assert.equal(ambiguousCommandPrefix.handled, false);
  assert.equal(ambiguousCommandPrefix.passthroughText, "/s");

  const codexCommands = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands"),
  });
  assert.equal(codexCommands.handled, true);
  assert.equal(codexCommands.action, "list");
  assert.match(codexCommands.replyText, /当前 Agent 没有可用的自定义命令/);
  assert.match(codexCommands.replyText, /codex/);

  const addCommand = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands add daily Summarize {{1}} with {{2*:no notes}}"),
  });
  assert.equal(addCommand.handled, true);
  assert.equal(addCommand.action, "set");
  assert.equal(addCommand.ok, true);
  assert.match(addCommand.replyText, /已添加自定义命令 \/daily/);

  const addedCommand = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/daily release blockers"),
  });
  assert.equal(addedCommand.handled, false);
  assert.equal(addedCommand.command, "daily");
  assert.equal(addedCommand.passthroughText, "Summarize release with blockers");
  assert.equal(addedCommand.audit.kind, "custom-prompt");
  assert.equal(addedCommand.audit.source, "config");
  assert.equal(addedCommand.audit.name, "daily");
  assert.equal(addedCommand.audit.argsCount, 2);
  assert.equal(addedCommand.audit.argsPreview, "release blockers");
  const blockedCustomCommand = await handleChannelConnectorCommand({
    ...baseContext,
    binding: commandAclBinding,
    message: message("/daily release blockers", "user-2"),
  });
  assert.equal(blockedCustomCommand.handled, true);
  assert.equal(blockedCustomCommand.ok, false);
  assert.equal(blockedCustomCommand.command, "daily");
  assert.match(blockedCustomCommand.replyText, /禁用命令 \/daily/);

  const listConfigCommands = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands list"),
  });
  assert.equal(listConfigCommands.handled, true);
  assert.equal(listConfigCommands.action, "list");
  assert.match(listConfigCommands.replyText, /\/daily/);
  assert.doesNotMatch(listConfigCommands.replyText, /\[agent\].*daily/);

  const abbreviatedConfigCommands = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands l"),
  });
  assert.equal(abbreviatedConfigCommands.handled, true);
  assert.equal(abbreviatedConfigCommands.action, "list");
  assert.match(abbreviatedConfigCommands.replyText, /\/daily/);

  const ambiguousCommandsSubcommand = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands d daily"),
  });
  assert.equal(ambiguousCommandsSubcommand.handled, true);
  assert.equal(ambiguousCommandsSubcommand.ok, false);
  assert.match(ambiguousCommandsSubcommand.replyText, /\/commands del/);

  const claudeCommands = await handleChannelConnectorCommand({
    ...baseContext,
    project: claudeProject,
    message: message("/commands"),
  });
  assert.equal(claudeCommands.handled, true);
  assert.equal(claudeCommands.action, "list");
  assert.match(claudeCommands.replyText, /\/review-code \[agent\]/);
  assert.match(claudeCommands.replyText, /Review target/);

  const codexSkills = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/skills"),
  });
  assert.equal(codexSkills.handled, true);
  assert.equal(codexSkills.action, "list");
  assert.match(codexSkills.replyText, /Studio Skills \(codex · octo\)/);
  assert.match(codexSkills.replyText, /\/release-notes/);
  assert.match(codexSkills.replyText, /Draft concise release notes/);
  assert.match(codexSkills.replyText, /\/octo-send \[binding\]/);
  assert.match(codexSkills.replyText, /Send Octo DM, group, thread, and mention messages/);
  assert.doesNotMatch(codexSkills.replyText, /\/feishu-card/);

  const codexSkillRun = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/release_notes bug fix list"),
  });
  assert.equal(codexSkillRun.handled, false);
  assert.equal(codexSkillRun.command, "release-notes");
  assert.match(codexSkillRun.passthroughText, /The user is asking you to execute the following skill/);
  assert.match(codexSkillRun.passthroughText, /## Skill: Release Notes/);
  assert.match(codexSkillRun.passthroughText, /Write release notes from the provided change list/);
  assert.match(codexSkillRun.passthroughText, /## User Arguments:\nbug fix list/);
  assert.equal(codexSkillRun.audit.kind, "skill");
  assert.equal(codexSkillRun.audit.source, "skill");
  assert.equal(codexSkillRun.audit.name, "release-notes");
  assert.equal(codexSkillRun.audit.argsPreview, "bug fix list");
  const octoSkillRun = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/octo_send @user hello"),
  });
  assert.equal(octoSkillRun.handled, false);
  assert.equal(octoSkillRun.command, "octo-send");
  assert.match(octoSkillRun.passthroughText, /## Skill: Octo Send/);
  assert.match(octoSkillRun.passthroughText, /Use Studio Octo channel transport/);
  assert.equal(octoSkillRun.audit.kind, "skill");
  assert.equal(octoSkillRun.audit.name, "octo-send");
  assert.equal(octoSkillRun.audit.commandPreview, path.join(octoPlatformSkillDir, "octo-send"));
  const feishuSkills = await handleChannelConnectorCommand({
    ...baseContext,
    binding: feishuBinding,
    message: message("/skills"),
  });
  assert.equal(feishuSkills.handled, true);
  assert.match(feishuSkills.replyText, /Studio Skills \(codex · feishu\)/);
  assert.match(feishuSkills.replyText, /\/feishu-card \[binding\]/);
  assert.doesNotMatch(feishuSkills.replyText, /\/octo-send/);
  const blockedOctoSkillRun = await handleChannelConnectorCommand({
    ...baseContext,
    binding: {
      ...binding,
      disabledCommands: ["octo-send"],
    },
    message: message("/octo_send @user hello", "user-2"),
  });
  assert.equal(blockedOctoSkillRun.handled, true);
  assert.equal(blockedOctoSkillRun.ok, false);
  assert.equal(blockedOctoSkillRun.command, "octo-send");
  assert.match(blockedOctoSkillRun.replyText, /禁用命令 \/octo-send/);
  const blockedSkillRun = await handleChannelConnectorCommand({
    ...baseContext,
    binding: commandAclBinding,
    message: message("/release_notes bug fix list", "user-2"),
  });
  assert.equal(blockedSkillRun.handled, true);
  assert.equal(blockedSkillRun.ok, false);
  assert.equal(blockedSkillRun.command, "release-notes");
  assert.match(blockedSkillRun.replyText, /禁用命令 \/release-notes/);

  const claudeSkills = await handleChannelConnectorCommand({
    ...baseContext,
    project: claudeProject,
    message: message("/skills"),
  });
  assert.equal(claudeSkills.handled, true);
  assert.match(claudeSkills.replyText, /\/triage/);
  assert.match(claudeSkills.replyText, /Triage bug reports/);

  const addClaudeOverride = await handleChannelConnectorCommand({
    ...baseContext,
    project: claudeProject,
    message: message("/commands add review-code Config review {{args}}"),
  });
  assert.equal(addClaudeOverride.ok, false);
  assert.match(addClaudeOverride.replyText, /已存在/);

  const claudeAgentCommand = await handleChannelConnectorCommand({
    ...baseContext,
    project: claudeProject,
    message: message("/review_code src auth module"),
  });
  assert.equal(claudeAgentCommand.handled, false);
  assert.equal(claudeAgentCommand.action, "passthrough");
  assert.equal(claudeAgentCommand.command, "review-code");
  assert.equal(claudeAgentCommand.passthroughText, "Review target src with notes auth module");
  assert.equal(claudeAgentCommand.nativeCommand, null);
  assert.equal(claudeAgentCommand.audit.kind, "agent-command");
  assert.equal(claudeAgentCommand.audit.source, "agent");
  assert.equal(claudeAgentCommand.audit.name, "review-code");
  assert.equal(claudeAgentCommand.audit.argsPreview, "src auth module");

  const deniedAddExec = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands addexec status git status", "user-2"),
  });
  assert.equal(deniedAddExec.handled, true);
  assert.equal(deniedAddExec.ok, false);
  assert.match(deniedAddExec.replyText, /没有管理/);

  const addExec = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands addexec --work-dir . xstat node -e \"console.log('exec:' + process.cwd().split('/').pop() + ':{{args}}')\""),
  });
  assert.equal(addExec.handled, true);
  assert.equal(addExec.action, "set");
  assert.equal(addExec.ok, true);
  assert.match(addExec.replyText, /已添加 shell 命令 \/xstat/);

  const listExecCommands = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands"),
  });
  assert.equal(listExecCommands.handled, true);
  assert.match(listExecCommands.replyText, /\/xstat \[shell\]/);

  const deniedExecRun = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/xstat alpha", "user-2"),
  });
  assert.equal(deniedExecRun.handled, true);
  assert.equal(deniedExecRun.ok, false);
  assert.match(deniedExecRun.replyText, /没有管理/);

  const execRun = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/xstat alpha beta"),
  });
  assert.equal(execRun.handled, true);
  assert.equal(execRun.action, "show");
  assert.equal(execRun.ok, true);
  assert.match(execRun.replyText, /shell command \/xstat completed/);
  assert.match(execRun.replyText, /exec:.*:alpha beta/);
  assert.equal(execRun.audit.kind, "custom-exec");
  assert.equal(execRun.audit.source, "config");
  assert.equal(execRun.audit.name, "xstat");
  assert.equal(execRun.audit.argsCount, 2);
  assert.equal(execRun.audit.argsPreview, "alpha beta");
  assert.equal(execRun.audit.exec.exitCode, 0);
  assert.equal(execRun.audit.exec.signal, null);
  assert.equal(execRun.audit.exec.timedOut, false);
  assert.equal(execRun.audit.exec.error, null);
  assert.match(execRun.audit.exec.workDir, /codex-work$/);
  assert.match(execRun.audit.exec.commandPreview, /alpha beta/);
  assert.ok(execRun.audit.exec.elapsedMs >= 0);
  assert.ok(execRun.audit.exec.stdoutBytes > 0);
  assert.equal(execRun.audit.exec.stderrBytes, 0);
  assert.match(execRun.audit.exec.stdoutPreview, /exec:.*:alpha beta/);

  const fastProgressEvents = [];
  const fastExecRun = await handleChannelConnectorCommand({
    ...baseContext,
    onCommandProgress: (event) => {
      fastProgressEvents.push(event);
      return { handled: true };
    },
    message: message("/xstat quick"),
  });
  assert.equal(fastExecRun.handled, true);
  assert.equal(fastExecRun.ok, true);
  assert.equal(fastProgressEvents.length, 0);
  assert.equal(fastExecRun.progressHandled, false);

  const addSlowExec = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands addexec slow node -e \"setTimeout(()=>console.log('slow done'), 700)\""),
  });
  assert.equal(addSlowExec.handled, true);
  assert.equal(addSlowExec.ok, true);
  const slowProgressEvents = [];
  const slowExecRun = await handleChannelConnectorCommand({
    ...baseContext,
    onCommandProgress: (event) => {
      slowProgressEvents.push(event);
      return {
        handled: true,
        suppressFinalReply: event.type === "completed",
      };
    },
    message: message("/slow"),
  });
  assert.equal(slowExecRun.handled, true);
  assert.equal(slowExecRun.ok, true);
  assert.equal(slowExecRun.progressHandled, true);
  assert.equal(slowExecRun.suppressReply, true);
  assert.match(slowExecRun.replyText, /slow done/);
  assert.deepEqual(slowProgressEvents.map((event) => event.type), ["started", "completed"]);
  assert.equal(slowProgressEvents[0].commandName, "slow");
  assert.match(slowProgressEvents[0].commandPreview, /setTimeout/);
  assert.match(slowProgressEvents[0].workDir, /codex-work$/);
  assert.equal(slowProgressEvents[0].outputPreview, null);
  assert.equal(slowProgressEvents[1].exitCode, 0);
  assert.match(slowProgressEvents[1].outputPreview, /slow done/);

  const duplicateBuiltin = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands add status should not override builtin"),
  });
  assert.equal(duplicateBuiltin.ok, false);
  assert.match(duplicateBuiltin.replyText, /已存在/);

  const deniedCustomCommandMutation = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands add denied nope", "user-2"),
  });
  assert.equal(deniedCustomCommandMutation.handled, true);
  assert.equal(deniedCustomCommandMutation.ok, false);
  assert.match(deniedCustomCommandMutation.replyText, /没有管理/);

  const delCommand = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/commands del daily"),
  });
  assert.equal(delCommand.handled, true);
  assert.equal(delCommand.ok, true);
  assert.match(delCommand.replyText, /已删除自定义命令 \/daily/);

  const removedCommand = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/daily release blockers"),
  });
  assert.equal(removedCommand.handled, false);
  assert.equal(removedCommand.passthroughText, "/daily release blockers");

  const missingCodexAgentCommand = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/review-code src"),
  });
  assert.equal(missingCodexAgentCommand.handled, false);
  assert.equal(missingCodexAgentCommand.passthroughText, "/review-code src");

  const traversalAgentCommand = await handleChannelConnectorCommand({
    ...baseContext,
    project: claudeProject,
    message: message("/../secret"),
  });
  assert.equal(traversalAgentCommand.handled, false);
  assert.equal(traversalAgentCommand.passthroughText, "/../secret");

  const listSlashCommands = [
    ["/status", "status"],
    ["/agent", "list"],
    ["/model", "list"],
    ["/mode", "list"],
    ["/reasoning", "list"],
    ["/dir", "list"],
    ["/display", "list"],
    ["/thinking", "list"],
    ["/process", "list"],
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

  const quotaAlias = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/quo"),
  });
  assert.equal(quotaAlias.handled, true);
  assert.equal(quotaAlias.action, "usage");
  assert.equal(quotaAlias.ok, false);

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

  let permissionAction = null;
  const approvedPermission = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/approve"),
    hasPendingPermissionRequest: () => true,
    respondPermissionRequest: (scope) => {
      permissionAction = scope.action;
      assert.equal(scope.bindingId, "octo-codex");
      assert.equal(scope.sessionKey, "dmwork:dm:admin-1");
      return {
        handled: true,
        ok: true,
        replyText: "已允许：Bash (perm-1)",
        requestId: "perm-1",
        toolName: "Bash",
        suppressReply: true,
      };
    },
  });
  assert.equal(permissionAction, "allow");
  assert.equal(approvedPermission.handled, true);
  assert.equal(approvedPermission.action, "permission");
  assert.equal(approvedPermission.ok, true);
  assert.equal(approvedPermission.suppressReply, true);
  assert.match(approvedPermission.replyText, /已允许/);

  let deniedPermissionAction = null;
  const deniedPermission = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("deny"),
    hasPendingPermissionRequest: () => true,
    respondPermissionRequest: (scope) => {
      deniedPermissionAction = scope.action;
      return {
        handled: true,
        ok: true,
        replyText: "已拒绝：Write (perm-2)",
        requestId: "perm-2",
        toolName: "Write",
      };
    },
  });
  assert.equal(deniedPermissionAction, "deny");
  assert.equal(deniedPermission.handled, true);
  assert.equal(deniedPermission.action, "permission");
  assert.match(deniedPermission.replyText, /已拒绝/);

  let questionAnswer = null;
  let permissionHijackedByQuestion = false;
  const answeredQuestion = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("allow"),
    hasPendingQuestionRequest: () => true,
    respondQuestionRequest: (scope) => {
      questionAnswer = scope.answer;
      assert.equal(scope.bindingId, "octo-codex");
      assert.equal(scope.sessionKey, "dmwork:dm:admin-1");
      return {
        handled: true,
        ok: true,
        replyText: "已回答：Which database? -> allow",
        requestId: "ask-1",
        toolName: "AskUserQuestion",
      };
    },
    hasPendingPermissionRequest: () => true,
    respondPermissionRequest: () => {
      permissionHijackedByQuestion = true;
      return {
        handled: true,
        ok: false,
        replyText: "should not be used",
        requestId: "perm-x",
        toolName: "Bash",
      };
    },
  });
  assert.equal(questionAnswer, "allow");
  assert.equal(permissionHijackedByQuestion, false);
  assert.equal(answeredQuestion.handled, true);
  assert.equal(answeredQuestion.action, "permission");
  assert.equal(answeredQuestion.ok, true);
  assert.match(answeredQuestion.replyText, /Which database/);

  let questionStoppedRun = false;
  const stopDuringQuestion = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/stop"),
    hasPendingQuestionRequest: () => true,
    respondQuestionRequest: () => {
      throw new Error("stop should not be treated as a question answer");
    },
    stopActiveRun: () => {
      questionStoppedRun = true;
      return {
        stopped: true,
        runId: "run-question",
        messageId: "msg-question",
        agent: "claude-code",
        model: "claude-sonnet",
        error: null,
      };
    },
  });
  assert.equal(questionStoppedRun, true);
  assert.equal(stopDuringQuestion.handled, true);
  assert.equal(stopDuringQuestion.action, "stop");

  const plainYesWithoutPending = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("yes"),
    hasPendingPermissionRequest: () => false,
  });
  assert.equal(plainYesWithoutPending.handled, false);
  assert.equal(plainYesWithoutPending.passthroughText, null);

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
  const deleteOne = upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "claude-main",
    sessionKey: baseContext.sessionKey,
    agent: "claude-code",
    model: "claude-sonnet",
    workDir: claudeProject.workDir,
    agentNativeSessionId: "claude-delete-one",
    messageId: "m-delete-one",
    status: "completed",
    name: "Delete One",
    now: new Date("2026-06-06T09:01:00.000Z"),
  });
  const deleteTwo = upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "codex-main",
    sessionKey: baseContext.sessionKey,
    agent: "codex",
    model: "gpt-5",
    workDir: path.join(root, "delete-two-work"),
    codexThreadId: "thread-delete-two",
    messageId: "m-delete-two",
    status: "completed",
    name: "Delete Two",
    now: new Date("2026-06-06T09:02:00.000Z"),
  });
  const deleteThree = upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "claude-main",
    sessionKey: baseContext.sessionKey,
    agent: "claude-code",
    model: "claude-sonnet",
    workDir: path.join(root, "delete-three-work"),
    agentNativeSessionId: "claude-delete-three",
    messageId: "m-delete-three",
    status: "completed",
    name: "Delete Three",
    now: new Date("2026-06-06T09:03:00.000Z"),
  });
  const deleteFour = upsertChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "codex-main",
    sessionKey: baseContext.sessionKey,
    agent: "codex",
    model: "gpt-5",
    workDir: path.join(root, "delete-four-work"),
    codexThreadId: "thread-delete-four",
    messageId: "m-delete-four",
    status: "completed",
    name: "Delete Four",
    now: new Date("2026-06-06T09:04:00.000Z"),
  });
  const deleteExact = await handleChannelConnectorCommand({
    ...baseContext,
    message: message(`/delete ${deleteOne.id}`),
  });
  assert.equal(deleteExact.ok, true);
  assert.match(deleteExact.replyText, /已删除 Agent session：Delete One/);
  assert.equal(listChannelConnectorAgentSessionsForConversation(agentSessionsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  }).some((record) => record.id === deleteOne.id), false);
  const deleteIdList = await handleChannelConnectorCommand({
    ...baseContext,
    message: message(`/delete ${deleteThree.id},${deleteFour.id}`),
  });
  assert.equal(deleteIdList.ok, true);
  assert.match(deleteIdList.replyText, /已删除 Agent session：Delete Three/);
  assert.match(deleteIdList.replyText, /已删除 Agent session：Delete Four/);
  assert.equal(listChannelConnectorAgentSessionsForConversation(agentSessionsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  }).some((record) => record.id === deleteThree.id || record.id === deleteFour.id), false);
  const deleteBatchRecords = listChannelConnectorAgentSessionsForConversation(agentSessionsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  });
  assert.equal(deleteBatchRecords[0].id, currentSessionRecord.id);
  assert.equal(deleteBatchRecords[1].id, deleteTwo.id);
  const deleteBatch = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/delete 1-2"),
  });
  assert.equal(deleteBatch.ok, true);
  assert.match(deleteBatch.replyText, /禁止删除当前 Agent session：Sprint Beta/);
  assert.match(deleteBatch.replyText, /已删除 Agent session：Delete Two/);
  assert.ok(getChannelConnectorAgentSession(agentSessionsPath, {
    bindingId: binding.id,
    projectId: "codex-main",
    sessionKey: baseContext.sessionKey,
    agent: "codex",
    model: "gpt-5.5",
    workDir: codexProject.workDir,
  }));
  assert.equal(listChannelConnectorAgentSessionsForConversation(agentSessionsPath, {
    bindingId: binding.id,
    sessionKey: baseContext.sessionKey,
  }).some((record) => record.id === deleteTwo.id), false);
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

  const thinkingOff = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/thinking off"),
  });
  assert.equal(thinkingOff.ok, true);
  assert.equal(thinkingOff.control.thinkingMessages, false);
  assert.equal(thinkingOff.control.processMessages, null);
  assert.equal(thinkingOff.control.toolMessages, null);
  assert.match(thinkingOff.replyText, /思考消息：关闭/);

  const processOff = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/process off"),
  });
  assert.equal(processOff.ok, true);
  assert.equal(processOff.control.thinkingMessages, false);
  assert.equal(processOff.control.processMessages, false);
  assert.equal(processOff.control.toolMessages, null);
  assert.match(processOff.replyText, /过程回复：关闭/);

  const toolsOff = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/tools off"),
  });
  assert.equal(toolsOff.ok, true);
  assert.equal(toolsOff.control.thinkingMessages, false);
  assert.equal(toolsOff.control.processMessages, false);
  assert.equal(toolsOff.control.toolMessages, false);
  assert.match(toolsOff.replyText, /工具消息：关闭/);

  const displayDefault = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/display default"),
  });
  assert.equal(displayDefault.ok, true);
  assert.equal(displayDefault.control.thinkingMessages, null);
  assert.equal(displayDefault.control.processMessages, null);
  assert.equal(displayDefault.control.toolMessages, null);

  const quietOn = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/quiet"),
  });
  assert.equal(quietOn.ok, true);
  assert.equal(quietOn.control.thinkingMessages, false);
  assert.equal(quietOn.control.processMessages, false);
  assert.equal(quietOn.control.toolMessages, false);
  assert.match(quietOn.replyText, /Quiet mode ON/);

  const quietOff = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/quiet"),
  });
  assert.equal(quietOff.ok, true);
  assert.equal(quietOff.control.thinkingMessages, null);
  assert.equal(quietOff.control.processMessages, null);
  assert.equal(quietOff.control.toolMessages, null);
  assert.match(quietOff.replyText, /Quiet mode OFF/);

  const compactDisplay = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/quiet compact"),
  });
  assert.equal(compactDisplay.ok, true);
  assert.equal(compactDisplay.control.thinkingMessages, false);
  assert.equal(compactDisplay.control.processMessages, false);
  assert.equal(compactDisplay.control.toolMessages, false);
  assert.match(compactDisplay.replyText, /Compact display ON/);

  const fullDisplay = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/quiet full"),
  });
  assert.equal(fullDisplay.ok, true);
  assert.equal(fullDisplay.control.thinkingMessages, null);
  assert.equal(fullDisplay.control.processMessages, null);
  assert.equal(fullDisplay.control.toolMessages, null);
  assert.match(fullDisplay.replyText, /Quiet mode OFF/);

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
  assert.match(compact.replyText, /Studio compact 已压缩/);
  assert.match(compact.replyText, /history: 6 -> 1/);
  assert.match(compact.replyText, /cleared 2/);

  let nativeCompactCalled = false;
  let nativeFallbackCalled = false;
  const nativeCompact = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/compact"),
    nativeCompactConversation: async (scope) => {
      nativeCompactCalled = true;
      assert.equal(scope.bindingId, "octo-codex");
      assert.equal(scope.sessionKey, "dmwork:dm:admin-1");
      assert.equal(scope.project.id, "codex-main");
      assert.equal(scope.command, "/compact");
      assert.equal(scope.message.messageId, "m--compact-admin-1");
      return {
        attempted: true,
        ok: true,
        fallbackAllowed: false,
        replyText: "Codex compact 已完成。",
        error: null,
      };
    },
    compactConversation: async () => {
      nativeFallbackCalled = true;
      throw new Error("fallback should not run after native compact success");
    },
  });
  assert.equal(nativeCompactCalled, true);
  assert.equal(nativeFallbackCalled, false);
  assert.equal(nativeCompact.ok, true);
  assert.match(nativeCompact.replyText, /Agent 原生 compact 已完成/);
  assert.match(nativeCompact.replyText, /Codex compact 已完成/);

  let fallbackAfterNativeFailure = false;
  const nativeFailureFallback = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/compact"),
    nativeCompactConversation: async () => ({
      attempted: true,
      ok: false,
      fallbackAllowed: true,
      replyText: null,
      error: "native compact unavailable",
    }),
    compactConversation: async () => {
      fallbackAfterNativeFailure = true;
      return {
        ok: true,
        beforeEntries: 4,
        afterEntries: 1,
        sessionsCleared: 1,
        summaryText: "fallback summary",
        error: null,
      };
    },
  });
  assert.equal(fallbackAfterNativeFailure, true);
  assert.equal(nativeFailureFallback.ok, true);
  assert.match(nativeFailureFallback.replyText, /已降级 Studio compact/);
  assert.match(nativeFailureFallback.replyText, /native compact unavailable/);

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

  const nativeCompactNoContract = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/native /compact"),
  });
  assert.equal(nativeCompactNoContract.handled, true);
  assert.equal(nativeCompactNoContract.action, "compact");
  assert.equal(nativeCompactNoContract.ok, false);
  assert.equal(nativeCompactNoContract.passthroughText, null);
  assert.equal(nativeCompactNoContract.nativeCommand, null);
  assert.match(nativeCompactNoContract.replyText, /未启用 Agent 原生 compact contract/);

  let forcedNativeCompactCalled = false;
  const nativeCompactForced = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/native /compact"),
    nativeCompactConversation: async (scope) => {
      forcedNativeCompactCalled = true;
      assert.equal(scope.command, "/compact");
      assert.equal(scope.project.id, "codex-main");
      return {
        attempted: true,
        ok: true,
        fallbackAllowed: false,
        replyText: "Codex compact 已完成。",
        error: null,
      };
    },
    compactConversation: async () => {
      throw new Error("forced /native /compact must not use Studio fallback");
    },
  });
  assert.equal(forcedNativeCompactCalled, true);
  assert.equal(nativeCompactForced.handled, true);
  assert.equal(nativeCompactForced.action, "compact");
  assert.equal(nativeCompactForced.ok, true);
  assert.equal(nativeCompactForced.nativeCommand, null);
  assert.match(nativeCompactForced.replyText, /Agent 原生 compact 已完成/);

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
    customCommands: [
      {
        name: "daily",
        description: "Summarize release status",
        source: "config",
      },
      {
        name: "review-code",
        description: "Review code changes",
        source: "agent",
      },
    ],
    skills: [
      {
        name: "release-notes",
        displayName: "Release Notes",
        description: "Draft concise release notes",
        source: path.join(codexProject.workDir, ".codex", "skills", "release-notes"),
      },
    ],
  });

  assert.equal(surface.current.bindingId, "octo-codex");
  assert.equal(surface.current.projectId, "codex-main");
  assert.equal(surface.current.thinkingMessages, true);
  assert.equal(surface.current.processMessages, true);
  assert.equal(surface.current.toolMessages, true);
  assert.match(surface.textFallback, /skills 命令/);
  assert.match(surface.textFallback, /^Studio Channel/);
  assert.match(surface.textFallback, /\*\*当前会话\*\*/);
  assert.match(surface.textFallback, /- Agent: codex-main \(codex\)/);
  assert.match(surface.textFallback, /- Reasoning: default/);
  assert.match(surface.textFallback, /快捷操作/);
  assert.match(surface.textFallback, /- `\/status` - Status:/);
  assert.match(surface.textFallback, /\*\*菜单入口\*\*/);
  assert.match(surface.textFallback, /- 会话: `\/help session`  `\/help buffer`/);
  assert.match(surface.textFallback, /\*\*常用命令\*\*/);
  assert.match(surface.textFallback, /`\/status`/);
  assert.match(surface.textFallback, /`\/native \/help`/);
  assert.match(surface.textFallback, /`\/native \/compact`/);
  assert.match(surface.textFallback, /`\/help agent`/);
  assert.match(surface.textFallback, /`\/help native`/);
  const nativeSection = surface.sections.find((section) => section.id === "native");
  assert.ok(nativeSection);
  assert.equal(nativeSection.actions[0].nativePassthrough, true);
  assert.equal(nativeSection.actions[0].command, "/native /help");
  assert.equal(nativeSection.actions[1].nativePassthrough, true);
  assert.equal(nativeSection.actions[1].command, "/native /compact");

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
  assert.match(raw, /命令/);
  assert.match(raw, /nav:\/help session/);
  assert.match(raw, /nav:\/help commands/);
  assert.match(raw, /\/help model/);
  assert.match(raw, /\/help display/);
  assert.match(raw, /\/help commands/);
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
  assert.match(sessionCardRaw, /act:\/whoami/);
  assert.match(sessionCardRaw, /act:\/version/);
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
  assert.match(sessionListCardRaw, /act:\/delete 2/);
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
      thinkingMessages: null,
      processMessages: null,
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

  const commandsSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
    customCommands: surface.sections.find((section) => section.id === "commands").actions
      .filter((item) => item.id.startsWith("custom-command-"))
      .map((item) => ({
        name: item.command.replace(/^\//, ""),
        description: item.description || "",
        source: item.id.includes("-agent-") ? "agent" : "config",
      })),
    skills: surface.sections.find((section) => section.id === "commands").actions
      .filter((item) => item.id.startsWith("skill-"))
      .map((item) => ({
        name: item.command.replace(/^\//, ""),
        displayName: item.label,
        description: item.description || "",
        source: path.join(codexProject.workDir, ".codex", "skills"),
      })),
    selectedSectionId: "commands",
    selectedViewId: "commands",
  });
  const commandsCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(commandsSurface));
  assert.match(commandsCardRaw, /Studio Commands/);
  assert.match(commandsCardRaw, /act:\/daily/);
  assert.match(commandsCardRaw, /act:\/review-code/);
  assert.match(commandsCardRaw, /act:\/release-notes/);
  assert.match(commandsCardRaw, /List Skills/);
  assert.match(commandsCardRaw, /\/commands add <名称> <prompt 模板>/);
  assert.match(commandsCardRaw, /\/commands addexec \[--work-dir <目录>\] <名称> <shell 命令>/);
  assert.match(commandsCardRaw, /nav:\/help commands/);

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
  assert.match(displayCardRaw, /act:\/quiet quiet/);
  assert.match(displayCardRaw, /act:\/thinking on/);
  assert.match(displayCardRaw, /act:\/thinking off/);
  assert.match(displayCardRaw, /act:\/process on/);
  assert.match(displayCardRaw, /act:\/process off/);
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
      thinkingMessages: false,
      processMessages: false,
      toolMessages: false,
    },
    selectedSectionId: "display",
    selectedViewId: "display",
  });
  assert.equal(groupDisplaySurface.current.thinkingMessages, false);
  assert.equal(groupDisplaySurface.current.processMessages, false);
  assert.equal(groupDisplaySurface.current.toolMessages, false);
  const groupDisplayCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(groupDisplaySurface));
  assert.match(groupDisplayCardRaw, /思考消息：关闭/);
  assert.match(groupDisplayCardRaw, /过程回复：关闭/);
  assert.match(groupDisplayCardRaw, /工具消息：关闭/);
  assert.match(groupDisplayCardRaw, /act:\/quiet full/);

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
  const permissionPayload = extractChannelConnectorSurfaceActionPayload({
    action: "act:/approve",
    command: "/approve",
    surface_action_kind: "act",
    surface_action_id: "permission-approve",
  });
  assert.equal(permissionPayload.command, "/approve");
  assert.equal(permissionPayload.actionKind, "act");
  assert.equal(permissionPayload.actionId, "permission-approve");
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
      create_time: "1780732800000",
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
        create_time: "1780732801",
        content: JSON.stringify({ text: "/status" }),
      },
    },
  });
  assert.equal(parsedMessage.rootId, "om_root");
  assert.equal(parsedMessage.parentId, "om_parent");
  assert.equal(parsedMessage.threadId, "om_thread");
  assert.equal(parsedMessage.eventCreateTimeMs, 1780732800000);
  assert.equal(parsedMessage.messageCreateTimeMs, 1780732801000);
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

  const staleMessage = await service.dispatchFeishuWebhook({
    dryRun: true,
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_stale",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_msg_stale",
        chat_id: "oc_chat",
        chat_type: "p2p",
        message_type: "text",
        create_time: "1780732500000",
        content: JSON.stringify({ text: "stale" }),
      },
    },
  });
  assert.equal(staleMessage.accepted, false);
  assert.equal(staleMessage.skippedReason, "feishu_event_stale");
  assert.equal(staleMessage.agentDispatch.status, "skipped");
  assert.equal(staleMessage.incoming, null);
  const staleLog = fs.readFileSync(staleMessage.eventStored.path, "utf8");
  assert.match(staleLog, /"messageCreateTimeMs":1780732500000/);

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
  const feishuCodexSession = upsertChannelConnectorAgentSession(feishuAgentSessionsPath, {
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
  const feishuClaudeSession = upsertChannelConnectorAgentSession(feishuAgentSessionsPath, {
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
  const feishuDeleteSession = upsertChannelConnectorAgentSession(feishuAgentSessionsPath, {
    bindingId: "feishu-main",
    projectId: "feishu-codex",
    sessionKey: "feishu:oc_chat:ou_admin",
    agent: "codex",
    model: "gpt-5",
    workDir: path.join(root, "codex-work-delete"),
    codexThreadId: "codex-thread-delete",
    messageId: "om_session_delete",
    status: "ok",
    name: "Feishu Delete",
    now: new Date("2026-06-06T08:00:25.000Z"),
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
  assert.match(JSON.stringify(sessionListCardAction.feishuResponse.card.data), /delete_mode_form/);
  assert.match(JSON.stringify(sessionListCardAction.feishuResponse.card.data), /delete_mode_submit/);

  const deleteModeFormSubmit = await service.dispatchFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "card.action.trigger",
      app_id: "cli_test",
      event_id: "evt_card_delete_mode_submit",
      token: "verify-token",
    },
    event: {
      operator: { open_id: "ou_admin" },
      context: { open_chat_id: "oc_chat", open_message_id: "om_card_sessions" },
      action: {
        name: "delete_mode_submit",
        value: {
          binding_id: "feishu-main",
          session_key: "feishu:oc_chat:ou_admin",
        },
        form_value: {
          [feishuDeleteModeCheckerName(feishuDeleteSession.id)]: true,
          [feishuDeleteModeCheckerName(feishuCodexSession.id)]: false,
        },
      },
    },
  });
  assert.equal(deleteModeFormSubmit.accepted, true);
  assert.equal(deleteModeFormSubmit.commandAction.command, `/delete ${feishuDeleteSession.id}`);
  assert.equal(deleteModeFormSubmit.commandAction.commandResult.ok, true);
  assert.match(deleteModeFormSubmit.commandAction.commandResult.replyText, /已删除 Agent session：Feishu Delete/);
  assert.equal(listChannelConnectorAgentSessionsForConversation(feishuAgentSessionsPath, {
    bindingId: "feishu-main",
    sessionKey: "feishu:oc_chat:ou_admin",
  }).some((record) => record.id === feishuDeleteSession.id), false);

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

test("native Channel Connectors Feishu transport-smoke uploads and sends files through service", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const config = createStudioConfig(root);
    const service = createChannelConnectorsService(config, {
      now: () => new Date("2026-06-06T08:05:00.000Z"),
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
            id: "feishu-media",
            platform: "feishu",
            accountId: "cli_media",
            botId: "bot_media",
            displayName: "Feishu Media",
            agentProfileId: "feishu-codex",
            enabled: true,
            allowlist: [],
            adminUsers: [],
            metadata: {
              apiUrl,
              appSecret: "test-secret",
              verificationToken: "verify-media",
            },
          },
        ],
      },
    });

    const smokeContent = "Studio Feishu media smoke";
    const result = await service.runFeishuTransportSmoke({
      bindingId: "feishu-media",
      action: "upload-and-send-media",
      channelId: "oc_chat",
      content: smokeContent,
      fileName: "Studio 文件名 保留测试.md",
      mimeType: "text/markdown",
    });

    assert.equal(result.transport.ok, true);
    assert.equal(result.transport.action, "upload-and-send-media");
    assert.equal(result.transport.requestCount, 3);
    assert.equal(result.transport.tokenCache, "hit");
    assert.equal(result.transport.fileKey, "file_uploaded_1");
    assert.equal(result.transport.fileName, "Studio 文件名 保留测试.md");
    assert.equal(result.transport.mimeType, "text/markdown");
    assert.equal(result.transport.size, Buffer.byteLength(smokeContent));
    assert.equal(result.transport.messageId, "om_sent_1");
    assert.equal(requests.length, 3);
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[0].body.app_id, "cli_media");
    assert.equal(requests[1].path, "/open-apis/im/v1/files");
    assert.match(requests[1].contentType, /multipart\/form-data/);
    assert.match(requests[1].body.raw, /name="file"; filename="Studio 文件名 保留测试\.md"/);
    assert.equal(requests[2].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[2].authorization, "Bearer tenant-token-1");
    assert.equal(requests[2].body.receive_id, "oc_chat");
    assert.equal(requests[2].body.msg_type, "file");
    assert.deepEqual(JSON.parse(requests[2].body.content), { file_key: "file_uploaded_1" });
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
  assert.equal(progress[1].phase, "final");
  assert.equal(isChannelConnectorProcessProgressEvent(progress[1]), false);
  assert.equal(result.progressEvents?.length, 2);
});

test("native Channel Connectors process progress only includes intermediate assistant text", () => {
  const base = {
    checkedAt: new Date(0).toISOString(),
    type: "assistant",
    rawType: "assistant",
    itemType: "text",
    text: "assistant text",
  };

  assert.equal(isChannelConnectorProcessProgressEvent({ ...base, phase: "intermediate" }), true);
  assert.equal(isChannelConnectorProcessProgressEvent({ ...base, phase: "final" }), false);
  assert.equal(isChannelConnectorProcessProgressEvent({ ...base, phase: null }), false);
  assert.equal(isChannelConnectorProcessProgressEvent({
    ...base,
    rawType: "item/agentMessage/delta",
    itemType: "agentMessage",
    phase: null,
  }), false);
  assert.equal(isChannelConnectorProcessProgressEvent({ ...base, type: "tool", phase: "intermediate" }), false);
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
    "process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'user_message',text:'Recent messages in this IM session before this turn:\\nsecret'}})+'\\n');",
    "process.stdout.write(JSON.stringify({type:'item.started',item:{type:'command_execution',command:'pwd'}})+'\\n');",
    "process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'command_execution',command:'pwd',exit_code:0,output:'/tmp/project'}})+'\\n');",
    "process.stdout.write(JSON.stringify({type:'item.completed',item:{type:'function_call_output',call_id:'read-file-1',content:[{type:'output_text',text:'  alpha\\n  beta\\n\\ngamma'}]}})+'\\n');",
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
  assert.equal(progress.length, 4);
  assert.equal(progress[0].type, "tool");
  assert.equal(progress[0].rawType, "item.started");
  assert.equal(progress[0].itemType, "command_execution");
  assert.match(progress[0].text, /command_execution started/);
  assert.match(progress[0].text, /pwd/);
  assert.equal(progress[1].type, "tool");
  assert.equal(progress[1].rawType, "item.completed");
  assert.match(progress[1].text, /exit=0/);
  assert.match(progress[1].text, /\/tmp\/project/);
  assert.equal(progress[2].type, "tool");
  assert.equal(progress[2].itemType, "function_call_output");
  assert.match(progress[2].text, /read-file-1 completed/);
  assert.match(progress[2].text, /output:\n  alpha\n  beta\n\ngamma/);
  assert.equal(progress[3].type, "failed");
  assert.equal(progress[3].text, "未正常接收到prompt参数。 (type=upstream_error, code=1213)");
  assert.equal(result.progressEvents?.length, 4);
});

test("native Channel Connectors process runner maps Codex agent messages before later tools as process progress", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "thread.started", thread_id: "thread-process-reply" }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "准备执行第一条命令。" } }),
    JSON.stringify({ type: "item.started", item: { type: "command_execution", command: "pwd" } }),
    JSON.stringify({ type: "item.completed", item: { type: "command_execution", command: "pwd", exit_code: 0, output: "/tmp/project" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "最终总结。" } }),
    JSON.stringify({ type: "turn.completed" }),
    "",
  ].join("\n");
  const childScript = `process.stdout.write(${JSON.stringify(stdout)});`;

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
  const assistantProgress = progress.filter((event) => event.type === "assistant");
  assert.deepEqual(assistantProgress.map((event) => event.text), ["准备执行第一条命令。", "最终总结。"]);
  assert.deepEqual(assistantProgress.map((event) => event.phase), ["intermediate", "final"]);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[0]), true);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[1]), false);
  assert.equal(progress.at(-1).type, "completed");
});

test("native Channel Connectors process runner maps Claude Code stream-json progress", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "system", session_id: "claude-session-1" }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "thinking", thinking: "I should inspect the file." },
          { type: "tool_use", id: "toolu_read_1", name: "Read", input: { file_path: "TOOLS.md" } },
          { type: "text", text: "我会读取文件。" },
        ],
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        content: [
          { type: "tool_result", tool_use_id: "toolu_read_1", content: [{ type: "text", text: "line 1" }, { type: "text", text: "line 2" }] },
        ],
      },
    }),
    JSON.stringify({ type: "result", result: "完成\n\n下一步可以发送文件。", session_id: "claude-session-1" }),
    "",
  ].join("\n");
  const childScript = `process.stdout.write(${JSON.stringify(stdout)});`;

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: "",
    env: {},
    timeoutMs: 1000,
    agent: "claude-code",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(progress.length, 6);
  assert.equal(progress[0].type, "session");
  assert.equal(progress[0].text, "claude-session-1");
  assert.equal(progress[1].type, "reasoning");
  assert.equal(progress[1].text, "I should inspect the file.");
  assert.equal(progress[2].type, "tool");
  assert.equal(progress[2].itemType, "tool_use");
  assert.equal(progress[2].toolName, "Read");
  assert.equal(progress[2].toolCallId, "toolu_read_1");
  assert.match(progress[2].text, /Read/);
  assert.match(progress[2].text, /TOOLS\.md/);
  assert.equal(progress[3].type, "assistant");
  assert.equal(progress[3].text, "我会读取文件。");
  assert.equal(progress[3].phase, "intermediate");
  assert.equal(isChannelConnectorProcessProgressEvent(progress[3]), true);
  assert.equal(progress[4].type, "tool");
  assert.equal(progress[4].itemType, "tool_result");
  assert.equal(progress[4].toolName, "Read");
  assert.equal(progress[4].toolCallId, "toolu_read_1");
  assert.equal(progress[4].text, "line 1\nline 2");
  assert.equal(progress[5].type, "completed");
  assert.equal(progress[5].text, "完成\n\n下一步可以发送文件。");
  assert.equal(result.progressEvents?.length, 6);
});

test("native Channel Connectors process runner maps Claude text before later tools as process progress", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "system", session_id: "claude-text-before-tool" }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "先说明一下，我会读取文件。" },
        ],
      },
    }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", name: "Read", input: { file_path: "TOOLS.md" } },
        ],
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        content: [
          { type: "tool_result", content: [{ type: "text", text: "line 1" }] },
        ],
      },
    }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "最终回复。" },
        ],
      },
    }),
    JSON.stringify({ type: "result", result: "最终回复。", session_id: "claude-text-before-tool" }),
    "",
  ].join("\n");
  const childScript = `process.stdout.write(${JSON.stringify(stdout)});`;

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: "",
    env: {},
    timeoutMs: 1000,
    agent: "claude-code",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  const assistantProgress = progress.filter((event) => event.type === "assistant");
  assert.deepEqual(assistantProgress.map((event) => event.text), ["先说明一下，我会读取文件。", "最终回复。"]);
  assert.deepEqual(assistantProgress.map((event) => event.phase), ["intermediate", "final"]);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[0]), true);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[1]), false);
  assert.equal(progress.at(-1).type, "completed");
});

test("native Channel Connectors process runner maps OpenCode JSON progress without leaking final text", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "step_start", part: { type: "step-start", sessionID: "opencode-session-1" } }),
    JSON.stringify({ type: "reasoning", part: { type: "reasoning", text: "I should inspect the directory." } }),
    JSON.stringify({
      type: "tool_use",
      part: {
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          title: "List files",
          input: { command: "ls" },
          output: "file-a\nfile-b",
        },
      },
    }),
    JSON.stringify({ type: "text", messageID: "assistant-message-1", timestamp: 2, part: { type: "text", messageID: "assistant-message-1", text: "第一次工具完成。" } }),
    JSON.stringify({
      type: "tool_use",
      part: {
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          title: "Print cwd",
          input: { command: "pwd" },
          output: "/tmp/project",
        },
      },
    }),
    JSON.stringify({ type: "text", messageID: "assistant-message", timestamp: 2, part: { type: "text", messageID: "assistant-message", text: "OpenCode done." } }),
    JSON.stringify({ type: "step_finish", part: { type: "step-finish", reason: "done" } }),
    "",
  ].join("\n");
  const childScript = `process.stdout.write(${JSON.stringify(stdout)});`;

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: "",
    env: {},
    timeoutMs: 1000,
    agent: "opencode",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(progress.length, 9);
  assert.equal(progress[0].type, "session");
  assert.equal(progress[0].text, "opencode-session-1");
  assert.equal(progress[1].type, "reasoning");
  assert.equal(progress[1].text, "I should inspect the directory.");
  assert.equal(progress[2].type, "tool");
  assert.equal(progress[2].rawType, "tool_use");
  assert.equal(progress[2].toolName, "bash");
  assert.match(progress[2].text, /bash/);
  assert.match(progress[2].text, /List files/);
  assert.equal(progress[3].type, "tool");
  assert.equal(progress[3].rawType, "tool_result");
  assert.equal(progress[3].toolName, "bash");
  assert.match(progress[3].text, /output:\nfile-a\nfile-b/);
  assert.equal(progress[4].type, "assistant");
  assert.equal(progress[4].text, "第一次工具完成。");
  assert.equal(progress[4].phase, "intermediate");
  assert.equal(isChannelConnectorProcessProgressEvent(progress[4]), true);
  assert.equal(progress[5].type, "tool");
  assert.equal(progress[5].rawType, "tool_use");
  assert.equal(progress[5].toolName, "bash");
  assert.match(progress[5].text, /Print cwd/);
  assert.equal(progress[6].type, "tool");
  assert.equal(progress[6].rawType, "tool_result");
  assert.equal(progress[6].toolName, "bash");
  assert.match(progress[6].text, /output:\n\/tmp\/project/);
  assert.equal(progress[7].type, "assistant");
  assert.equal(progress[7].text, "OpenCode done.");
  assert.equal(progress[7].phase, "final");
  assert.equal(isChannelConnectorProcessProgressEvent(progress[7]), false);
  assert.equal(progress[8].type, "completed");
  assert.equal(progress[8].text, "done");
  assert.equal(result.progressEvents?.length, 9);
});

test("native Channel Connectors process runner keeps Claude Code final text out of process progress", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "system", session_id: "claude-final-session" }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "text", text: "最终回复\n\n不是过程回复。" },
        ],
      },
    }),
    JSON.stringify({ type: "result", result: "最终回复\n\n不是过程回复。", session_id: "claude-final-session" }),
    "",
  ].join("\n");
  const childScript = `process.stdout.write(${JSON.stringify(stdout)});`;

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: "",
    env: {},
    timeoutMs: 1000,
    agent: "claude-code",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(progress.length, 3);
  assert.equal(progress[1].type, "assistant");
  assert.equal(progress[1].text, "最终回复\n\n不是过程回复。");
  assert.equal(progress[1].phase, "final");
  assert.equal(isChannelConnectorProcessProgressEvent(progress[1]), false);
  assert.equal(progress[2].type, "completed");
  assert.equal(progress[2].text, "最终回复\n\n不是过程回复。");
});

test("native Channel Connectors process runner answers Claude Code permission requests", async () => {
  const root = makeTempRoot();
  const progress = [];
  const childScript = [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "let asked = false;",
    "function write(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (!asked && message.type === 'user') {",
    "    asked = true;",
    "    write({ type: 'control_request', request_id: 'perm-allow-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'pwd' } } });",
    "    return;",
    "  }",
    "  if (message.type === 'control_response') {",
    "    write({ type: 'result', result: JSON.stringify(message.response.response), session_id: 'claude-permission-session' });",
    "    process.exit(0);",
    "  }",
    "});",
  ].join("");

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: `${JSON.stringify({ type: "user", message: { role: "user", content: "run pwd" } })}\n`,
    env: {},
    timeoutMs: 1000,
    agent: "claude-code",
    permissionMode: "yolo",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(progress.length, 2);
  assert.equal(progress[0].type, "tool");
  assert.equal(progress[0].rawType, "control_request");
  assert.match(progress[0].text, /can_use_tool: Bash/);
  assert.equal(progress[1].type, "completed");
  assert.match(progress[1].text, /"behavior":"allow"/);
  assert.match(progress[1].text, /"updatedInput":\{"command":"pwd"\}/);
});

test("native Channel Connectors process runner denies Claude Code tools in read-only mode", async () => {
  const root = makeTempRoot();
  const progress = [];
  const childScript = [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "let asked = false;",
    "function write(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (!asked && message.type === 'user') {",
    "    asked = true;",
    "    write({ type: 'control_request', request_id: 'perm-deny-1', request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: 'TOOLS.md', content: 'unsafe' } } });",
    "    return;",
    "  }",
    "  if (message.type === 'control_response') {",
    "    write({ type: 'result', result: JSON.stringify(message.response.response), session_id: 'claude-permission-session' });",
    "    process.exit(0);",
    "  }",
    "});",
  ].join("");

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: `${JSON.stringify({ type: "user", message: { role: "user", content: "write file" } })}\n`,
    env: {},
    timeoutMs: 1000,
    agent: "claude-code",
    permissionMode: "read-only",
    onProgress: (event) => progress.push(event),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(progress.at(-1)?.type, "completed");
  assert.match(progress.at(-1)?.text || "", /"behavior":"deny"/);
  assert.match(progress.at(-1)?.text || "", /read-only/);
});

test("native Channel Connectors process runner waits for interactive Claude Code permission decisions", async () => {
  const root = makeTempRoot();
  const childScript = [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "let asked = false;",
    "function write(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (!asked && message.type === 'user') {",
    "    asked = true;",
    "    write({ type: 'control_request', request_id: 'perm-interactive-1', request: { subtype: 'can_use_tool', tool_name: 'Bash', input: { command: 'ls' } } });",
    "    return;",
    "  }",
    "  if (message.type === 'control_response') {",
    "    write({ type: 'result', result: JSON.stringify(message.response.response), session_id: 'claude-interactive-session' });",
    "    process.exit(0);",
    "  }",
    "});",
  ].join("");
  const seenRequests = [];

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: `${JSON.stringify({ type: "user", message: { role: "user", content: "list files" } })}\n`,
    env: {},
    timeoutMs: 1000,
    agent: "claude-code",
    permissionMode: "suggest",
    resolvePermission: async (request) => {
      seenRequests.push(request);
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { behavior: "allow", updatedInput: request.input };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(seenRequests.length, 1);
  assert.equal(seenRequests[0].requestId, "perm-interactive-1");
  assert.equal(seenRequests[0].toolName, "Bash");
  assert.match(result.stdout, /"behavior\\":\\"allow/);
});

test("native Channel Connectors process runner routes Claude Code AskUserQuestion through IM answers", async () => {
  const root = makeTempRoot();
  const childScript = [
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "let asked = false;",
    "function write(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "rl.on('line', (line) => {",
    "  const message = JSON.parse(line);",
    "  if (!asked && message.type === 'user') {",
    "    asked = true;",
    "    write({ type: 'control_request', request_id: 'ask-1', request: { subtype: 'can_use_tool', tool_name: 'AskUserQuestion', input: { questions: [{ question: 'Which database?', options: [{ label: 'PostgreSQL' }, { label: 'SQLite' }] }] } } });",
    "    return;",
    "  }",
    "  if (message.type === 'control_response') {",
    "    write({ type: 'result', result: JSON.stringify(message.response.response), session_id: 'claude-ask-session' });",
    "    process.exit(0);",
    "  }",
    "});",
  ].join("");
  const seenRequests = [];

  const result = await defaultChannelConnectorAgentProcessRunner({
    command: process.execPath,
    args: ["-e", childScript],
    cwd: root,
    stdin: `${JSON.stringify({ type: "user", message: { role: "user", content: "choose a database" } })}\n`,
    env: {},
    timeoutMs: 1000,
    agent: "claude-code",
    permissionMode: "yolo",
    resolvePermission: async (request) => {
      seenRequests.push(request);
      return {
        behavior: "allow",
        updatedInput: {
          ...request.input,
          answers: {
            "Which database?": "SQLite",
          },
        },
      };
    },
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.error, null);
  assert.equal(seenRequests.length, 1);
  assert.equal(seenRequests[0].requestId, "ask-1");
  assert.equal(seenRequests[0].toolName, "AskUserQuestion");
  assert.match(result.stdout, /Which database/);
  assert.match(result.stdout, /SQLite/);
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
  assert.match(daemonSource, /runFeishuGroupClientLoop/);
  assert.match(daemonSource, /waitForFeishuWsCycleEnd/);
  assert.match(daemonSource, /getFeishuWsReconnectDelayMs/);
  assert.match(daemonSource, /FEISHU_WS_RECONNECT_INITIAL_DELAY_MS\s*=\s*1_?000/);
  assert.match(daemonSource, /FEISHU_WS_RECONNECT_MAX_DELAY_MS\s*=\s*30_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_RECONNECTING_RECYCLE_MS\s*=\s*5_?000/);
  assert.match(daemonSource, /MIN_FEISHU_RECONNECTING_RECYCLE_MS\s*=\s*5_?000/);
  assert.match(daemonSource, /MAX_FEISHU_RECONNECTING_RECYCLE_MS\s*=\s*60_?000/);
  assert.match(daemonSource, /FEISHU_WS_RECONNECT_EXHAUSTED_RE/);
  assert.match(daemonSource, /DEFAULT_FEISHU_HANDSHAKE_TIMEOUT_MS\s*=\s*15_?000/);
  assert.match(daemonSource, /FEISHU_WS_AUTORECONNECT_DISABLED_ERROR/);
  assert.match(daemonSource, /startFeishuWatchdog/);
  assert.doesNotMatch(daemonSource, /function restartFeishuGroupClient/);
  assert.match(daemonSource, /clients\.indexOf\(client\)/);
  assert.match(daemonSource, /clients\.splice\(index,\s*1\)/);
  assert.doesNotMatch(daemonSource, /watchdog_non_connected_/);
  assert.doesNotMatch(daemonSource, /watchdog_connected_idle_/);
  assert.doesNotMatch(daemonSource, /watchdog_ingress_unverified_/);
  assert.doesNotMatch(daemonSource, /watchdog_zero_inbound_/);
  assert.match(daemonSource, /DEFAULT_FEISHU_PING_TIMEOUT_SECONDS\s*=\s*3/);
  assert.match(daemonSource, /MIN_FEISHU_PING_TIMEOUT_SECONDS\s*=\s*1/);
  assert.match(daemonSource, /MAX_FEISHU_PING_TIMEOUT_SECONDS\s*=\s*60/);
  assert.match(daemonSource, /DEFAULT_FEISHU_PING_INTERVAL_MS\s*=\s*10_?000/);
  assert.match(daemonSource, /MIN_FEISHU_PING_INTERVAL_MS\s*=\s*10_?000/);
  assert.match(daemonSource, /MAX_FEISHU_PING_INTERVAL_MS\s*=\s*120_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_PONG_TIMEOUT_MS\s*=\s*8_?000/);
  assert.match(daemonSource, /MIN_FEISHU_PONG_TIMEOUT_MS\s*=\s*3_?000/);
  assert.match(daemonSource, /MAX_FEISHU_PONG_TIMEOUT_MS\s*=\s*600_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_TRANSPORT_STALE_MARGIN_MS\s*=\s*5_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_STALE_EVENT_MAX_AGE_MS\s*=\s*2\s*\*\s*60_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_CONNECTED_IDLE_RENEW_MS\s*=\s*0/);
  assert.match(daemonSource, /MIN_FEISHU_CONNECTED_IDLE_RENEW_MS\s*=\s*60_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS\s*=\s*0/);
  assert.match(daemonSource, /MIN_FEISHU_VERIFIED_INGRESS_SILENT_RENEW_MS\s*=\s*120_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MS\s*=\s*0/);
  assert.match(daemonSource, /MIN_FEISHU_ZERO_INBOUND_RENEW_MS\s*=\s*60_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_ZERO_INBOUND_RENEW_MAX\s*=\s*0/);
  assert.match(daemonSource, /DEFAULT_FEISHU_WATCHDOG_RESTART_MS\s*=\s*0/);
  assert.match(daemonSource, /MIN_FEISHU_WATCHDOG_RESTART_MS\s*=\s*60_?000/);
  assert.match(daemonSource, /DEFAULT_FEISHU_INGRESS_UNVERIFIED_AFTER_MS\s*=\s*0/);
  assert.match(daemonSource, /DEFAULT_FEISHU_INGRESS_UNVERIFIED_RENEW_MAX\s*=\s*0/);
  assert.match(daemonSource, /feishuPingTimeoutSeconds/);
  assert.match(daemonSource, /feishuPingIntervalMs/);
  assert.match(daemonSource, /feishuPongTimeoutMs/);
  assert.match(daemonSource, /feishuIngressUnverifiedAfterMs/);
  assert.match(daemonSource, /feishuIngressUnverifiedRenewMax/);
  assert.match(daemonSource, /feishuIngressUnverifiedRenewDelayMs/);
  assert.match(daemonSource, /acquireFeishuGroupLock/);
  assert.match(daemonSource, /releaseFeishuGroupLock/);
  assert.match(daemonSource, /feishu-ws-global-locks/);
  assert.match(daemonSource, /os\.homedir\(\)/);
  assert.match(daemonSource, /processIsAlive/);
  assert.match(daemonSource, /feishu_ws_lock_held_by_pid_/);
  assert.match(daemonSource, /feishuPingTimeoutSeconds/);
  assert.match(daemonSource, /sdk_ping_timeout_seconds/);
  assert.match(daemonSource, /sdk_ping_interval_ms/);
  assert.match(daemonSource, /function feishuReconnectingRecycleMs/);
  assert.match(daemonSource, /feishu_reconnecting_recycle_ms/);
  assert.doesNotMatch(daemonSource, /const pingTimeout = feishuPingTimeoutSeconds\(group\)/);
  assert.doesNotMatch(daemonSource, /feishuWsConfig/);
  assert.doesNotMatch(daemonSource, /wsConfig:\s*feishuWsConfig/);
  assert.match(daemonSource, /wsConfig:\s*\{\s*pingTimeout:\s*pingTimeoutSeconds\s*\}/);
  assert.doesNotMatch(daemonSource, /autoReconnect:\s*true/);
  assert.match(daemonSource, /handshakeTimeoutMs:\s*DEFAULT_FEISHU_HANDSHAKE_TIMEOUT_MS/);
  assert.match(daemonSource, /attachFeishuControlFrameProbe/);
  assert.match(daemonSource, /function clampFeishuSdkPingLoop/);
  assert.match(daemonSource, /setFeishuClientPingIntervalMs/);
  assert.match(daemonSource, /sdk_transport_stale_/);
  assert.match(daemonSource, /Feishu WebSocket transport stale; recycling client/);
  assert.match(daemonSource, /function feishuFrameType/);
  assert.match(daemonSource, /function markFeishuControlFrame/);
  assert.match(daemonSource, /function feishuClientPingIntervalMs/);
  assert.match(daemonSource, /function feishuPongTimeoutState/);
  assert.match(daemonSource, /function feishuTransportStaleState/);
  assert.match(daemonSource, /function feishuStaleEventState/);
  assert.match(daemonSource, /function feishuOutOfOrderEventState/);
  assert.match(daemonSource, /function updateFeishuConversationWatermark/);
  assert.match(daemonSource, /feishu_event_stale/);
  assert.match(daemonSource, /feishu_event_out_of_order/);
  assert.match(daemonSource, /pingTimeoutSeconds: feishuPingTimeoutSeconds\(group\)/);
  assert.match(daemonSource, /pongTimeoutMs:\s*feishuPongTimeoutMs\(group\)/);
  assert.match(daemonSource, /pingIntervalMs:\s*group\.pingIntervalMs/);
  assert.match(daemonSource, /transportStaleAfterMs/);
  assert.match(daemonSource, /transportStaleForMs/);
  assert.match(daemonSource, /sentPings:\s*group\.sentPings/);
  assert.match(daemonSource, /receivedPongs:\s*group\.receivedPongs/);
  assert.match(daemonSource, /reconnectingRecycleAfterMs:\s*feishuReconnectingRecycleMs\(group\)/);
  assert.match(daemonSource, /feishuConnectedIdleRenewMs/);
  assert.match(daemonSource, /feishuVerifiedIngressSilentRenewMs/);
  assert.match(daemonSource, /feishuZeroInboundRenewMs/);
  assert.match(daemonSource, /feishuZeroInboundRenewMax/);
  assert.match(daemonSource, /feishuWatchdogRestartMs/);
  assert.match(daemonSource, /watchdogRestartAfterMs:\s*feishuWatchdogRestartMs\(group\)/);
  assert.match(daemonSource, /if \(value <= 0\)\s*return 0;/);
  assert.doesNotMatch(daemonSource, /restartAfterMs > 0 && unhealthyForMs >= restartAfterMs/);
  assert.match(daemonSource, /lifecycleReceivedMessages/);
  assert.match(daemonSource, /lifecycleLastReceivedAt/);
  assert.match(daemonSource, /lifecycleDispatcherCallbacks/);
  assert.match(daemonSource, /lifecycleLastDispatcherCallbackAt/);
  assert.match(daemonSource, /suppressZeroInboundRenewal/);
  assert.match(daemonSource, /lastWatchdogRestartAt/);
  assert.match(daemonSource, /lastWatchdogRestartReason/);
  assert.match(daemonSource, /lastReconnectingAt/);
  assert.match(daemonSource, /reconnectingRecycles/);
  assert.match(daemonSource, /lastReconnectingRecycleAt/);
  assert.match(daemonSource, /lastReconnectingRecycleReason/);
  assert.match(daemonSource, /sdk_pong_timeout_/);
  assert.match(daemonSource, /Feishu WebSocket pong timeout; recycling client/);
  assert.match(daemonSource, /connected = sdkConnected && !pongTimeoutState\.overdue && !transportStaleState\.stale/);
  assert.match(daemonSource, /connection\.pongOverdue !== true/);
  assert.match(daemonSource, /nowMs - lastPingMs/);
  assert.doesNotMatch(daemonSource, /group\.receivedMessages === 0/);
  assert.match(daemonSource, /group\.lifecycleDispatcherCallbacks === 0/);
  assert.match(daemonSource, /group\.lifecycleRawEventFrames === 0/);
  assert.match(daemonSource, /group\.lifecycleReceivedMessages > 0/);
  assert.match(daemonSource, /Feishu WebSocket SDK reported terminal error/);
  assert.match(daemonSource, /Feishu WebSocket connection ended; recreating client/);
  assert.match(daemonSource, /Feishu WebSocket start failed; retrying/);
  assert.match(daemonSource, /Feishu WebSocket reconnecting exceeded limit; recycling client/);
  assert.match(daemonSource, /status\?\.state === "reconnecting"/);
  assert.match(daemonSource, /group\.recycleCurrentClient\(`sdk_reconnecting_timeout_\$\{recycleAfterMs\}ms`\)/);
  const feishuConnectionStateBlock = daemonSource.slice(
    daemonSource.indexOf("function feishuConnectionState"),
    daemonSource.indexOf("function updateFeishuRuntime"),
  );
  assert.match(feishuConnectionStateBlock, /pingTimeoutSeconds:\s*feishuPingTimeoutSeconds\(group\)/);
  assert.match(feishuConnectionStateBlock, /pongTimeoutMs:\s*feishuPongTimeoutMs\(group\)/);
  assert.match(feishuConnectionStateBlock, /transportVerified/);
  assert.match(feishuConnectionStateBlock, /pongWaitingForMs/);
  assert.match(feishuConnectionStateBlock, /pongOverdue/);
  assert.match(feishuConnectionStateBlock, /sdkConnected/);
  assert.match(feishuConnectionStateBlock, /transportStale/);
  assert.match(feishuConnectionStateBlock, /lastPongAt:\s*group\.lastPongAt/);
  assert.match(feishuConnectionStateBlock, /lastPingAt:\s*group\.lastPingAt/);
  assert.match(feishuConnectionStateBlock, /reconnectingRecycleAfterMs:\s*feishuReconnectingRecycleMs\(group\)/);
  assert.match(feishuConnectionStateBlock, /watchdogRestartAfterMs:\s*feishuWatchdogRestartMs\(group\)/);
  assert.match(feishuConnectionStateBlock, /zeroInboundRenewMax:\s*feishuZeroInboundRenewMax\(group\)/);
  assert.match(feishuConnectionStateBlock, /ingressUnverifiedRenewMax:\s*feishuIngressUnverifiedRenewMax\(group\)/);
  assert.match(feishuConnectionStateBlock, /ingressUnverifiedRenewDelayMs:\s*feishuIngressUnverifiedRenewDelayMs\(group\)/);
  assert.match(feishuConnectionStateBlock, /verifiedIngressSilentRenewAfterMs/);
  assert.match(feishuConnectionStateBlock, /verifiedIngressSilentRenewals/);
  assert.match(feishuConnectionStateBlock, /ingressVerified/);
  assert.match(feishuConnectionStateBlock, /ingressState/);
  assert.match(feishuConnectionStateBlock, /lifecycleDispatcherCallbacks/);
  assert.match(feishuConnectionStateBlock, /lifecycleLastDispatcherCallbackAt/);
  assert.match(feishuConnectionStateBlock, /rawEventFrames/);
  assert.match(feishuConnectionStateBlock, /lifecycleRawEventFrames/);
  assert.match(feishuConnectionStateBlock, /lastRawEventFrameAt/);
  assert.match(feishuConnectionStateBlock, /lastReconnectingAt/);
  assert.match(feishuConnectionStateBlock, /reconnectingRecycles/);
  assert.match(feishuConnectionStateBlock, /lockAcquired/);
  assert.doesNotMatch(daemonSource, /!\s*group\.suppressZeroInboundRenewal/);
  assert.match(daemonSource, /feishu_ping_timeout_seconds/);
  assert.match(daemonSource, /feishu_connected_idle_renew_ms/);
  assert.match(daemonSource, /feishu_verified_ingress_silent_renew_ms/);
  assert.match(daemonSource, /feishu_zero_inbound_renew_ms/);
  assert.match(daemonSource, /feishu_ingress_unverified_renew_max/);
  assert.match(daemonSource, /zeroInboundRenewals/);
  assert.match(daemonSource, /ingressUnverifiedRenewals/);
  assert.match(daemonSource, /startup_ingress_unverified_/);
  assert.match(daemonSource, /Feishu WebSocket startup ingress validation missing; recycling client/);
  assert.match(daemonSource, /Feishu WebSocket startup ingress validation cycle ended; recreating client/);
  assert.match(daemonSource, /feishu_watchdog_restart_ms/);
  assert.match(daemonSource, /lastReceivedAt/);
  assert.doesNotMatch(daemonSource, /Feishu WebSocket ingress-unverified renewal threshold elapsed/);
  assert.doesNotMatch(daemonSource, /Feishu WebSocket verified-ingress silent renewal threshold elapsed/);
  assert.doesNotMatch(daemonSource, /Feishu WebSocket zero-inbound startup renewal threshold elapsed/);
  assert.match(daemonSource, /Feishu WebSocket reconnecting/);
  assert.match(daemonSource, /Feishu WebSocket reconnected/);
  assert.match(daemonSource, /sendFeishuTextMessage/);
  assert.match(daemonSource, /sendFeishuCardMessage/);
  assert.match(daemonSource, /patchFeishuCardMessage/);
  assert.match(daemonSource, /function renderFeishuAskUserQuestionCard/);
  assert.match(daemonSource, /function renderFeishuPermissionCard/);
  assert.match(daemonSource, /return renderFeishuAskUserQuestionCard\(request\)/);
  assert.match(daemonSource, /Claude Code 提问/);
  assert.match(daemonSource, /askq:\$\{input\.requestId\}:\$\{optionNumber\}/);
  assert.match(daemonSource, /allow \/ deny 会作为答案文本处理/);
  assert.match(daemonSource, /function sendFeishuPermissionPrompt/);
  assert.match(daemonSource, /function renderPlainPermissionPrompt/);
  assert.match(daemonSource, /function renderPlainPermissionState/);
  assert.match(daemonSource, /function isPermissionApprovalProgressEvent/);
  assert.match(daemonSource, /allowed-all/);
  assert.match(daemonSource, /function upsertFeishuPermissionProgressEntry/);
  assert.match(daemonSource, /kind:\s*"permission"/);
  assert.match(daemonSource, /permissionProgressStatusLabel/);
  assert.match(daemonSource, /renderFeishuProgressPermissionActions/);
  assert.match(daemonSource, /suppressReplyOnResolve:\s*feishuCardsEnabled\(binding\)/);
  assert.match(daemonSource, /command\.suppressReply !== true/);
  assert.match(daemonSource, /if \(input\.command\.suppressReply === true\)[\s\S]{0,40}return null;/);
  assert.match(daemonSource, /action:\s*`act:\$\{input\.command\}`/);
  assert.match(daemonSource, /permission-approve/);
  assert.match(daemonSource, /permission-deny/);
  assert.match(daemonSource, /permission-allow-all/);
  assert.match(daemonSource, /\["new", "reset", "show", "stop", "permission", "passthrough"\]/);
  assert.match(daemonSource, /listFeishuChatMembers/);
  assert.match(daemonSource, /loadFeishuGroupMembers/);
  assert.match(daemonSource, /groupMemberCount/);
  assert.match(daemonSource, /function channelConnectorProgressDefaults/);
  assert.match(daemonSource, /function feishuProgressDefaults/);
  assert.match(daemonSource, /function octoProgressDefaults/);
  assert.match(daemonSource, /function channelConnectorThinkingMessagesEnabled/);
  assert.match(daemonSource, /function channelConnectorProcessMessagesEnabled/);
  assert.match(daemonSource, /function channelConnectorToolMessagesEnabled/);
  assert.match(daemonSource, /function shouldSendChannelProgressEvent/);
  assert.match(daemonSource, /shouldSendFeishuProgressEvent/);
  assert.match(daemonSource, /function isVisibleChannelProgressEvent/);
  assert.match(daemonSource, /rawType === "turn\.started" \|\| rawType === "turn\/started"/);
  assert.match(daemonSource, /text === "codex turn started" \|\| text === "codex app-server turn started"/);
  assert.match(daemonSource, /if \(!isVisibleChannelProgressEvent\(event\)\)\s*return false;/);
  assert.match(daemonSource, /function normalizeFeishuCommandContent/);
  assert.match(daemonSource, /normalizeString\(input\.command\.action\)\.toLowerCase\(\) === "help"/);
  assert.match(daemonSource, /renderFeishuProgressCard/);
  assert.match(daemonSource, /function formatProgressToolInput/);
  assert.match(daemonSource, /function formatTodoWriteProgressInput/);
  assert.match(daemonSource, /function progressEventToolDirection/);
  assert.match(daemonSource, /function progressToolUseLabel/);
  assert.match(daemonSource, /function progressToolResultLabel/);
  assert.match(daemonSource, /function recentFeishuProgressToolName/);
  assert.match(daemonSource, /rawType\.includes\("tool_use"\)/);
  assert.match(daemonSource, /itemType\.includes\("tool_use"\)/);
  assert.match(daemonSource, /rawType\.includes\("tool_result"\)/);
  assert.match(daemonSource, /itemType\.includes\("tool_result"\)/);
  assert.match(daemonSource, /progressEventToolDirection\(event\) === "use" \? "tool_use" : "tool_result"/);
  assert.match(daemonSource, /const pureClaudeToolResult = entry\.kind === "tool_result"/);
  assert.match(daemonSource, /normalizeString\(entry\.rawType\)\.toLowerCase\(\) === "user"/);
  assert.match(daemonSource, /const firstLineIsToolName = Boolean\(firstToolName\)/);
  assert.match(daemonSource, /const bodyLines = pureClaudeToolResult \? lines : firstLineIsToolName \? lines\.slice\(1\) : lines/);
  assert.match(daemonSource, /const statusMatch = line\.match\(\/\^status=\(\.\+\)\$\/i\)/);
  assert.match(daemonSource, /function renderFeishuProgressEntry/);
  assert.match(daemonSource, /function renderPlainProgressEntry/);
  assert.match(daemonSource, /function renderPlainProgressMessage/);
  assert.match(daemonSource, /function isRecoverableToolResultErrorProgressEvent/);
  assert.match(daemonSource, /event\.type !== "failed" && event\.type !== "error"/);
  assert.match(daemonSource, /normalizeString\(event\.rawType\)\.toLowerCase\(\) === "user"/);
  assert.match(daemonSource, /normalizeString\(event\.itemType\)\.toLowerCase\(\) === "tool_result"/);
  assert.match(daemonSource, /kind === "tool_result" && isRecoverableToolResultErrorProgressEvent\(event\)/);
  assert.match(daemonSource, /if \(kind === "assistant"\)[\s\S]{0,40}return "💬";/);
  assert.match(daemonSource, /if \(event\.type === "assistant"\)[\s\S]{0,40}return "过程回复"/);
  assert.match(daemonSource, /isChannelConnectorProcessProgressEvent/);
  assert.match(daemonSource, /return shouldSendChannelProgressEvent\(control,\s*event,\s*defaults\);/);
  assert.match(daemonSource, /event\.type === "assistant"[\s\S]{0,180}isChannelConnectorProcessProgressEvent\(event\)[\s\S]{0,140}channelConnectorProcessMessagesEnabled\(control,\s*defaults\)/);
  assert.match(daemonSource, /event\.type === "reasoning"[\s\S]{0,100}channelConnectorThinkingMessagesEnabled\(control,\s*defaults\)/);
  assert.match(daemonSource, /event\.type === "tool"[\s\S]{0,100}channelConnectorToolMessagesEnabled\(control,\s*defaults\)/);
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
  assert.match(daemonSource, /function renderFeishuCommandProgressCard/);
  assert.match(daemonSource, /function formatCommandProgressText/);
  assert.match(daemonSource, /eventKind:\s*"channel\.command\.progress"/);
  assert.match(daemonSource, /patch-command-progress-card/);
  assert.match(daemonSource, /send-command-progress-card/);
  assert.match(daemonSource, /send-command-progress-text/);
  assert.match(daemonSource, /formatCommandProgressText\(event\)/);
  assert.match(daemonSource, /event\.type === "started"/);
  assert.match(daemonSource, /suppressFinalReply:\s*handled && feishuCardsEnabled\(binding\) && commandProgressIsTerminal\(event\)/);
  assert.match(daemonSource, /octoPermissionPending/);
  assert.match(daemonSource, /octoPermissionBufferedProgress/);
  assert.match(daemonSource, /queueOctoPermissionStateReply/);
  assert.match(daemonSource, /agent\.permission\.prompt/);
  assert.match(daemonSource, /agent\.permission\.reply/);
  assert.match(daemonSource, /octoPermissionPending && !fromPermissionBuffer/);
  assert.match(daemonSource, /if \(!isAskUserQuestionRequest\(request\)\)\s+octoPermissionPending = true;/);
  assert.match(daemonSource, /if \(permissionStateContinuesRun\(status\)\)\s*\{\s*flushOctoPermissionBufferedProgress\(\);/);
  assert.match(daemonSource, /if \(isPermissionApprovalProgressEvent\(event\)\)\s+return;/);
  assert.match(daemonSource, /renderPlainPermissionPrompt\(request,\s*prompt\)/);
  assert.match(daemonSource, /renderPlainPermissionState\(change\)/);
  assert.match(daemonSource, /event\.type === "failed" \|\| event\.type === "error" \|\| event\.type === "tool"/);
  assert.match(daemonSource, /title:\s*"过程回复"/);
  assert.match(daemonSource, /progressToolUseLabel\(parsed\.toolName\)/);
  assert.match(daemonSource, /progressToolResultLabel\(parsed\.toolName\)/);
  assert.match(daemonSource, /formatPlainProgressToolResult\(parsed\.output\)/);
  assert.match(daemonSource, /writestdin/);
  assert.match(daemonSource, /spawnagent/);
  assert.match(daemonSource, /updateplan/);
  assert.match(daemonSource, /"applypatch", "patch"/);
  assert.match(daemonSource, /权限策略/);
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
  assert.match(daemonSource, /progressThinkingEnabled:\s*channelConnectorThinkingMessagesEnabled\(control,\s*progressDefaults\)/);
  assert.match(daemonSource, /progressProcessEnabled:\s*channelConnectorProcessMessagesEnabled\(control,\s*progressDefaults\)/);
  assert.match(daemonSource, /progressToolsEnabled:\s*channelConnectorToolMessagesEnabled\(control,\s*progressDefaults\)/);
  assert.match(daemonSource, /jsonErrorEnvelopeMessage/);
  assert.match(daemonSource, /renderChannelConnectorCommandSurfaceFeishu/);
  assert.match(daemonSource, /shouldSendFeishuCommandCard/);
  assert.match(daemonSource, /\["new",\s*"reset",\s*"show",\s*"stop",\s*"permission",\s*"passthrough"\]\.includes\(action\)/);
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
  assert.doesNotMatch(daemonSource, /return response \|\| undefined/);
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
  const cardActionHandler = daemonSource.slice(
    daemonSource.indexOf('"card.action.trigger"'),
    daemonSource.indexOf('"application.bot.menu_v6"'),
  );
  assert.match(cardActionHandler, /dispatchFeishuParsedEventInBackground/);
  assert.doesNotMatch(cardActionHandler, /await dispatchFeishuParsedEvent/);
  assert.doesNotMatch(cardActionHandler, /return response \|\| undefined/);
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
              metadata: {
                aliases: {
                  帮助: "/help",
                  状态: "/status",
                },
              },
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
                aliases: {
                  帮助: "/help",
                  状态: "/status",
                },
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
          action: "act:/process off",
          binding_id: "octo-route",
          session_key: "dmwork:dm:route-user",
          surface_action_id: "process-off",
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
    assert.equal(displayAction.body.surface.current.processMessages, false);
    assert.match(JSON.stringify(displayAction.body.feishuCard), /Studio Display/);
    assert.match(JSON.stringify(displayAction.body.feishuCard), /过程回复：关闭/);

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

    const feishuAliasWebhook = await requestJson(`${baseUrl}/api/channel-connectors/adapters/feishu/webhook`, {
      method: "POST",
      body: {
        bindingId: "feishu-route",
        dryRun: true,
        studioDebugResponse: true,
        schema: "2.0",
        header: {
          event_type: "im.message.receive_v1",
          app_id: "cli_route",
          event_id: "evt_alias_status",
          token: "route-token",
        },
        event: {
          sender: {
            sender_id: {
              open_id: "route-user",
            },
          },
          message: {
            message_id: "om_alias_status",
            chat_id: "route-user",
            chat_type: "p2p",
            message_type: "text",
            content: JSON.stringify({ text: "状态" }),
          },
        },
      },
    });
    assert.equal(feishuAliasWebhook.status, 200);
    assert.equal(feishuAliasWebhook.body.accepted, false);
    assert.equal(feishuAliasWebhook.body.skippedReason, "feishu_transport_config_missing");
    assert.equal(feishuAliasWebhook.body.commandAction.accepted, true);
    assert.equal(feishuAliasWebhook.body.commandAction.command, "/status");
    assert.equal(feishuAliasWebhook.body.commandAction.commandResult.action, "show");
    assert.match(feishuAliasWebhook.body.commandAction.commandResult.replyText, /Dry-run/);
    assert.equal(feishuAliasWebhook.body.incoming.content, "/status");

    const octoAliasIncoming = await requestJson(`${baseUrl}/api/channel-connectors/adapters/octo/incoming`, {
      method: "POST",
      body: {
        bindingId: "octo-route",
        dryRun: true,
        message: {
          messageId: "octo-alias-status",
          fromUid: "route-user",
          channelId: "route-user",
          channelType: 1,
          payload: {
            type: 1,
            content: "状态",
          },
        },
      },
    });
    assert.equal(octoAliasIncoming.status, 200);
    assert.equal(octoAliasIncoming.body.accepted, true);
    assert.equal(octoAliasIncoming.body.commandAction.command, "/status");
    assert.equal(octoAliasIncoming.body.commandAction.commandResult.action, "show");
    assert.match(octoAliasIncoming.body.commandAction.commandResult.replyText, /Dry-run/);
    assert.equal(octoAliasIncoming.body.incoming.content, "/status");

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

    const routesSource = fs.readFileSync(path.resolve("apps/api/modules/channel-connectors/routes.ts"), "utf8");
    assert.match(routesSource, /\/api\/channel-connectors\/agent-sessions/);
    assert.match(routesSource, /getAgentSessions/);
    assert.match(routesSource, /manageAgentSessions/);
    const webApiSource = fs.readFileSync(path.resolve("apps/web-vue/src/features/channel-connectors/api.ts"), "utf8");
    assert.match(webApiSource, /fetchChannelConnectorAgentSessions/);
    assert.match(webApiSource, /manageChannelConnectorAgentSessions/);
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
  assert.ok(runtimeConfig.projects[0]);
  runtimeConfig.projects[0].platformBindings.push({
    id: "octo-persistent-status",
    platform: "octo",
    accountId: "octo-account",
    botId: null,
    displayName: "Octo Persistent Status",
    agent: runtimeConfig.projects[0].agent,
    enabled: true,
    allowlist: [],
    adminUsers: [],
    metadata: {
      agentSessionDriver: "persistent",
    },
  });
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
    const status = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.agentSessionDriver.defaultMode, "one-shot");
    assert.equal(status.body.agentSessionDriver.implementation, "native-cli-session-drivers");
    assert.equal(status.body.agentSessionDriver.persistentDriverReady, true);
    assert.equal(status.body.agentSessionDriver.policy.idleTimeoutMs, 600000);
    assert.equal(status.body.agentSessionDriver.policy.maxSessions, 8);
    assert.equal(status.body.agentSessionDriver.policy.fallbackOnCrash, true);
    assert.equal(status.body.agentSessionDriver.activeSessions.length, 0);
    assert.equal(status.body.agentSessionDriver.requestedPersistentBindings.length, 1);
    assert.equal(status.body.agentSessionDriver.requestedPersistentBindings[0].requestedMode, "persistent");
    assert.equal(status.body.agentSessionDriver.requestedPersistentBindings[0].effectiveMode, "persistent");
    assert.equal(status.body.agentSessionDriver.requestedPersistentBindings[0].reason, "codex-app-server-experimental");
    const runtime = await waitForJsonFile(runtimeConfig.paths.runtime);
    assert.equal(runtime.agentSessionDriver.requestedPersistentBindings.length, 1);
    assert.equal(runtime.agentSessionDriver.requestedPersistentBindings[0].effectiveMode, "persistent");
    assert.equal(runtime.agentSessionDriver.policy.idleTimeoutMs, 600000);
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

test("native Channel Connectors daemon keeps Feishu dispatcher parity diagnostics", () => {
  const daemonSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/daemon.ts"),
    "utf8",
  );

  assert.match(daemonSource, /function feishuDispatcherVerificationToken/);
  assert.match(daemonSource, /function feishuDispatcherEncryptKey/);
  assert.match(daemonSource, /verificationToken:\s*verificationToken \|\| undefined/);
  assert.match(daemonSource, /encryptKey:\s*encryptKey \|\| undefined/);
  assert.match(daemonSource, /function markFeishuDispatcherCallback/);
  assert.match(daemonSource, /dispatcherCallbacks/);
  assert.match(daemonSource, /lastDispatcherCallbackAt/);
  assert.match(daemonSource, /lastDispatcherEventType/);
  assert.match(daemonSource, /lifecycleDispatcherCallbacks/);
  assert.match(daemonSource, /lifecycleLastDispatcherCallbackAt/);
  assert.match(daemonSource, /resetFeishuLifecycleIngressEvidence/);
  assert.match(daemonSource, /dispatcherVerificationConfigured/);
  assert.match(daemonSource, /dispatcherEncryptConfigured/);
  assert.match(daemonSource, /chat\.access_event\.bot_p2p_chat_entered_v1/);
  assert.match(daemonSource, /p2p_chat\.created_v1/);
});

test("native Channel Connectors daemon queues same-session messages while an Agent run is active", () => {
  const daemonSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/daemon.ts"),
    "utf8",
  );

  assert.match(daemonSource, /function latestActiveRunForSession/);
  assert.match(daemonSource, /function acquireChannelSessionAgentRun/);
  assert.match(daemonSource, /createChannelConnectorAgentSessionDriverPool/);
  assert.match(daemonSource, /createNativeCliSessionDriverFactory/);
  assert.match(daemonSource, /createCodexAppServerSessionDriverFactory/);
  assert.match(daemonSource, /function runChannelConnectorAgentTurnWithSessionDriver/);
  assert.match(daemonSource, /effectiveAgentSessionDriverMode/);
  assert.match(daemonSource, /runChannelConnectorAgentTurnWithSessionDriver\(\{/);
  assert.match(daemonSource, /permissionMode:\s*input\.project\.permissionMode/);
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
        }, 5000);
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
        }, 10_000);
        assert.equal(finalStatus.ok, true);
        const replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.match(replyContents, /本条已加入队列/);
        assert.match(replyContents, /first done/);
        assert.match(replyContents, /second done/);
        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => {
            return event.eventKind === "channel.agent.queued"
              && event.messageId === "2002"
              && event.sessionKey === "dmwork:dm:queue-user";
          });
        });
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

test("native Channel Connectors daemon enriches Octo group turns with Bot API context and file download URLs", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-octo-context-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ argv: process.argv.slice(2), stdin })}\\n`);",
    "  process.stdout.write('{\"type\":\"thread.started\",\"thread_id\":\"thread-octo-context\"}\\n');",
    "  process.stdout.write('{\"type\":\"item.completed\",\"item\":{\"type\":\"agent_message\",\"text\":\"context ok\"}}\\n');",
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
            messageId: 3001,
            messageSeq: 8,
            fromUid: "user-1",
            channelId: "group-1",
            channelType: 2,
            payload: {
              type: 8,
              content: "",
              name: "hello.txt",
              file_path: "chat/hello.txt",
              size: 12,
              mention: { uids: ["robot-1"] },
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
      if (req.url === "/media/hello.txt") {
        res.setHeader("content-type", "text/plain");
        res.end("hello octo\n");
        return true;
      }
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
        res.end(JSON.stringify({ robot_id: "robot-1", im_token: "im-token-1", ws_url: wsUrl }));
        return true;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/members") {
        res.end(JSON.stringify({
          members: [
            { uid: "user-1", name: "Alice", role: 1, robot: 0 },
            { uid: "robot-1", name: "Studio Bot", role: 2, robot: 1 },
          ],
        }));
        return true;
      }
      if (req.method === "POST" && req.url === "/v1/bot/messages/sync") {
        const payload = Buffer.from(JSON.stringify({ type: 1, content: "history hello" }), "utf8").toString("base64");
        res.end(`{"start_message_seq":1,"end_message_seq":7,"pull_mode":1,"messages":[{"message_id":"2999","message_seq":7,"from_uid":"user-1","channel_id":"group-1","channel_type":2,"timestamp":1742547600,"payload":"${payload}"}]}`);
        return true;
      }
      if (req.method === "GET" && req.url?.startsWith("/v1/bot/file/download/chat/hello.txt")) {
        res.statusCode = 302;
        res.setHeader("location", `http://${req.headers.host}/media/hello.txt`);
        res.end();
        return true;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/sendMessage" || req.url === "/v1/bot/heartbeat") {
        res.end(JSON.stringify({ ok: true, message_id: `octo-context-${requests.length}` }));
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
              id: "codex-octo-context",
              name: "Codex Octo Context",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-octo-context",
          platformBindings: [
            {
              id: "octo-context",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Context",
              agentProfileId: "codex-octo-context",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                allowPrivateAttachmentUrls: true,
                attachmentMaxBytes: 1024,
                octoHistorySyncLimit: 3,
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
      const configPath = path.join(root, "daemon-octo-context-config.json");
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
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-context" && item.connected);
          return connected ? response.body : null;
        }, 5000);
        assert.equal(status.ok, true);
        assert.equal(wsConnects.length, 1);

        const capture = await waitFor(() => {
          if (!fs.existsSync(capturePath)) return null;
          const lines = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
          return lines.length ? lines.map((line) => JSON.parse(line)) : null;
        }, 8000);
        assert.equal(capture.length, 1);
        assert.match(capture[0].stdin, /Studio group context/);
        assert.match(capture[0].stdin, /Known members: Alice\(user-1\), Studio Bot\(robot-1\)/);
        assert.match(capture[0].stdin, /Octo Bot API recent channel history/);
        assert.match(capture[0].stdin, /history hello/);
        assert.match(capture[0].stdin, /file: hello\.txt, 11 bytes, local:/);
        assert.match(capture[0].stdin, /Staged files are available locally/);

        const finalStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => item.messageId === "3001");
          return run ? response.body : null;
        }, 8000);
        const run = finalStatus.agentRuns.find((item) => item.messageId === "3001");
        assert.equal(run.ok, true);
        const requestPaths = requests.map((request) => request.path);
        assert.equal(requestPaths.includes("/v1/bot/groups/group-1/members"), true);
        assert.equal(requestPaths.includes("/v1/bot/messages/sync"), true);
        assert.equal(requestPaths.some((item) => item?.startsWith("/v1/bot/file/download/chat/hello.txt")), true);
        assert.equal(requestPaths.includes("/media/hello.txt"), true);
        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => event.eventKind === "channel.octo.members.loaded" && event.messageId === "3001")
            && events.some((event) => event.eventKind === "channel.octo.history.synced" && event.messageId === "3001")
            && events.some((event) => event.eventKind === "agent.attachments.staged" && event.messageId === "3001");
        }, 10_000);
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "channel.octo.members.loaded"
            && event.memberCount === 2
            && event.error === null;
        }));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "channel.octo.history.synced"
            && event.includedCount === 1
            && event.error === null;
        }));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "agent.attachments.staged"
            && event.stagedCount === 1
            && event.downloadUrlAttemptCount === 1
            && event.downloadUrlResolvedCount === 1;
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

test("native Channel Connectors daemon runs Codex app-server when persistent session metadata is enabled", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-appserver-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const lines = [];",
    "let nextTurn = 1;",
    "function emit(value) { process.stdout.write(`${JSON.stringify(value)}\\n`); }",
    "function record(value) { fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify(value)}\\n`); }",
    "if (process.argv[2] !== 'app-server') {",
    "  record({ mode: 'fallback-exec', argv: process.argv.slice(2) });",
    "  process.exit(23);",
    "}",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    "  for (const raw of chunk.split(/\\r?\\n/)) {",
    "    if (!raw.trim()) continue;",
    "    const message = JSON.parse(raw);",
    "    record({ mode: 'app-server', method: message.method, id: message.id || null, params: message.params || null, codexHome: process.env.CODEX_HOME, openaiBaseUrl: process.env.OPENAI_BASE_URL });",
    "    if (message.method === 'initialize') {",
    "      emit({ id: message.id, result: { userAgent: 'fake-codex-app-server', codexHome: process.env.CODEX_HOME || '', platformFamily: 'unix', platformOs: 'linux' } });",
    "    } else if (message.method === 'initialized') {",
    "      // notification",
    "    } else if (message.method === 'thread/start') {",
    "      emit({ id: message.id, result: { thread: { id: 'thread-persistent-1', sessionId: 'thread-persistent-1', turns: [], cwd: message.params.cwd }, model: message.params.model, modelProvider: 'studio_gateway', cwd: message.params.cwd, approvalPolicy: message.params.approvalPolicy, sandbox: { type: 'readOnly', networkAccess: false } } });",
    "      emit({ method: 'thread/started', params: { thread: { id: 'thread-persistent-1' } } });",
    "    } else if (message.method === 'turn/start') {",
    "      const turnId = `turn-${nextTurn++}`;",
    "      emit({ id: message.id, result: { turn: { id: turnId, status: 'running', items: [] } } });",
    "      setTimeout(() => {",
    "        emit({ method: 'turn/started', params: { threadId: message.params.threadId, turn: { id: turnId, status: 'running' } } });",
    "        emit({ method: 'item/agentMessage/delta', params: { threadId: message.params.threadId, turnId, itemId: 'agent-1', delta: 'persistent ok' } });",
    "        emit({ method: 'item/completed', params: { threadId: message.params.threadId, turnId, item: { type: 'agentMessage', id: 'agent-1', text: 'persistent ok' } } });",
    "        emit({ method: 'turn/completed', params: { threadId: message.params.threadId, turn: { id: turnId, status: 'completed', items: [] } } });",
    "      }, 10);",
    "    } else if (message.method === 'thread/compact/start') {",
    "      const turnId = `compact-${nextTurn++}`;",
    "      emit({ id: message.id, result: { turn: { id: turnId, status: 'running', items: [] } } });",
    "      setTimeout(() => {",
    "        emit({ method: 'turn/started', params: { threadId: message.params.threadId, turn: { id: turnId, status: 'running' } } });",
    "        emit({ method: 'item/completed', params: { threadId: message.params.threadId, turnId, item: { type: 'contextCompaction', id: 'compact-1' } } });",
    "        emit({ method: 'thread/compacted', params: { threadId: message.params.threadId } });",
    "        emit({ method: 'turn/completed', params: { threadId: message.params.threadId, turn: { id: turnId, status: 'completed', items: [] } } });",
    "      }, 10);",
    "    } else {",
    "      emit({ id: message.id, error: { code: -32601, message: `unexpected ${message.method}` } });",
    "    }",
    "  }",
    "});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });

  const wsConnects = [];
  let inboundSent = false;
  let sendInbound = null;
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
      const salt = "fedcba0987654321";
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      sendInbound = (messageId, fromUid, content) => {
        if (socket.readyState !== 1) throw new Error("Octo fake socket is not open");
        socket.send(encodeOctoRecvPacket({
          serverPrivateKey: serverKey.privateKey,
          clientPublicKeyBase64: packet.clientPublicKeyBase64,
          salt,
          messageId,
          messageSeq: messageId - 3000,
          fromUid,
          channelId: fromUid,
          channelType: 1,
          payload: {
            type: 1,
            content,
          },
        }));
      };
      if (!inboundSent) {
        inboundSent = true;
        setTimeout(() => {
          if (socket.readyState !== 1) return;
          sendInbound(
            3001,
            "persistent-user",
            "hello persistent session with a deliberately long context budget prelude that should push the next turn past the automatic compact threshold",
          );
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
          data: [{
            id: "gpt-5",
            object: "model",
            contextWindow: 60,
            maxOutputTokens: 8,
          }],
        }));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-persistent", im_token: "im-token-persistent", ws_url: wsUrl }));
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
              id: "codex-persistent",
              name: "Codex Persistent",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "read-only",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-persistent",
          platformBindings: [
            {
              id: "octo-persistent",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Persistent",
              agentProfileId: "codex-persistent",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                agentSessionDriver: "persistent",
                octoReconnectJitterMs: 0,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const configPath = path.join(root, "daemon-persistent-config.json");
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
          STUDIO_CHANNEL_AGENT_SESSION_IDLE_TIMEOUT_MS: "1500",
          STUDIO_CHANNEL_AGENT_SESSION_REAP_INTERVAL_MS: "100",
          STUDIO_CHANNEL_AGENT_SESSION_MAX_SESSIONS: "3",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString("utf8");
      });

      try {
        await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-persistent" && item.connected);
          return connected ? response.body : null;
        }, 5000);

        const status = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => item.messageId === "3001" && item.ok);
          const session = response.body?.agentSessionDriver?.activeSessions?.find?.((item) => item.bindingId === "octo-persistent");
          return run && session ? response.body : null;
        }, 10_000);
        assert.equal(status.agentSessionDriver.requestedPersistentBindings[0].effectiveMode, "persistent");
        assert.equal(status.agentSessionDriver.policy.idleTimeoutMs, 1500);
        assert.equal(status.agentSessionDriver.policy.maxSessions, 3);
        assert.equal(status.agentSessionDriver.activeSessions[0].sessionId.includes("codex-app-server:"), true);
        assert.equal(status.agentSessionDriver.activeSessions[0].permissionMode, "read-only");
        assert.equal(status.agentSessionDriver.activeSessions[0].turnCount, 1);
        const poolKey = status.agentSessionDriver.activeSessions[0].poolKey;

        const sessionStatus = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/agent-sessions`);
        assert.equal(sessionStatus.status, 200);
        assert.equal(sessionStatus.body.policy.idleTimeoutMs, 1500);
        assert.equal(sessionStatus.body.reaped, undefined);
        assert.equal(sessionStatus.body.activeSessions.find((item) => item.poolKey === poolKey).permissionMode, "read-only");
        assert.equal(sessionStatus.body.activeSessions.some((item) => item.poolKey === poolKey), true);

        assert.ok(sendInbound);
        sendInbound(3002, "persistent-user", "second normal turn after threshold");
        const autoCompactCapture = await waitFor(() => {
          if (!fs.existsSync(capturePath)) return null;
          const lines = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
          const capture = lines.map((line) => JSON.parse(line));
          const compactIndex = capture.findIndex((item) => item.method === "thread/compact/start");
          const turnStarts = capture
            .map((item, index) => ({ item, index }))
            .filter(({ item }) => item.method === "turn/start");
          return compactIndex >= 0 && turnStarts.length >= 2 ? { capture, compactIndex, secondTurnIndex: turnStarts[1].index } : null;
        }, 5000);
        assert.ok(
          autoCompactCapture.compactIndex < autoCompactCapture.secondTurnIndex,
          `auto compact did not run before second turn: ${JSON.stringify(autoCompactCapture.capture)}`,
        );
        const autoCompactStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const autoCompact = response.body?.autoCompacts?.find?.((item) => item.messageId === "3002" && item.action === "native" && item.ok === true);
          const secondRun = response.body?.agentRuns?.find?.((item) => item.messageId === "3002" && item.ok);
          return autoCompact && secondRun ? response.body : null;
        }, 5000);
        assert.equal(autoCompactStatus.autoCompacts[0].cooldownUntil, null);
        assert.equal(autoCompactStatus.autoCompacts[0].usedTokens >= autoCompactStatus.autoCompacts[0].effectiveUsedTokens, true);
        assert.equal(requests.filter((request) => request.path === "/v1/responses/compact").length, 0);

        sendInbound(3003, "persistent-user", "third normal turn should use auto compact baseline");
        const postBaselineCapture = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const thirdRun = response.body?.agentRuns?.find?.((item) => item.messageId === "3003" && item.ok);
          if (!thirdRun || !fs.existsSync(capturePath)) return null;
          const lines = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
          return lines.map((line) => JSON.parse(line));
        }, 5000);
        assert.equal(
          postBaselineCapture.filter((item) => item.method === "thread/compact/start").length,
          1,
          `auto compact baseline should prevent immediate repeat compact: ${JSON.stringify(postBaselineCapture)}`,
        );

        sendInbound(3004, "persistent-user", "/compact");
        await waitFor(() => {
          if (!fs.existsSync(capturePath)) return null;
          const lines = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
          const capture = lines.map((line) => JSON.parse(line));
          return capture.filter((item) => item.method === "thread/compact/start").length >= 2 ? capture : null;
        }, 5000);
        const nativeCompactReply = await waitFor(() => {
          const replyContents = requests
            .filter((request) => request.path === "/v1/bot/sendMessage")
            .map((request) => request.body?.payload?.content || "")
            .join("\n");
          return /Agent 原生 compact 已完成/.test(replyContents) ? replyContents : null;
        }, 5000);
        assert.match(nativeCompactReply, /Codex compact 已完成/);
        assert.equal(requests.filter((request) => request.path === "/v1/responses/compact").length, 0);

        const reapedStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/agent-sessions`);
          const activeSessions = response.body?.activeSessions || [];
          return activeSessions.some((item) => item.poolKey === poolKey) ? null : response.body;
        }, 10_000);
        assert.equal(reapedStatus.activeSessions.some((item) => item.poolKey === poolKey), false);
        assert.match(fs.readFileSync(runtimeConfig.paths.log, "utf8"), /Reaped idle persistent Agent sessions/);

        const capture = fs.readFileSync(capturePath, "utf8")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        assert.equal(capture.some((item) => item.mode === "fallback-exec"), false);
        assert.ok(capture.some((item) => item.method === "initialize"));
        assert.ok(capture.some((item) => item.method === "thread/start" && item.params.sandbox === "read-only"));
        assert.ok(capture.some((item) => item.method === "turn/start" && item.params.sandboxPolicy?.type === "readOnly"));
        assert.ok(capture.some((item) => item.codexHome && String(item.codexHome).includes("codex-home")));
        const replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.match(replyContents, /persistent ok/);
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

test("native Channel Connectors daemon isolates Codex app-server persistent sessions by IM session", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-appserver-isolation-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "let nextTurn = 1;",
    "const threadId = `thread-${process.pid}`;",
    "function emit(value) { process.stdout.write(`${JSON.stringify(value)}\\n`); }",
    "function record(value) { fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ pid: process.pid, ...value })}\\n`); }",
    "if (process.argv[2] !== 'app-server') {",
    "  record({ mode: 'fallback-exec', argv: process.argv.slice(2) });",
    "  process.exit(23);",
    "}",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    "  for (const raw of chunk.split(/\\r?\\n/)) {",
    "    if (!raw.trim()) continue;",
    "    const message = JSON.parse(raw);",
    "    record({ mode: 'app-server', method: message.method, id: message.id || null, params: message.params || null, codexHome: process.env.CODEX_HOME });",
    "    if (message.method === 'initialize') {",
    "      emit({ id: message.id, result: { userAgent: 'fake-codex-app-server', codexHome: process.env.CODEX_HOME || '', platformFamily: 'unix', platformOs: 'linux' } });",
    "    } else if (message.method === 'initialized') {",
    "      // notification",
    "    } else if (message.method === 'thread/start') {",
    "      emit({ id: message.id, result: { thread: { id: threadId, sessionId: threadId, turns: [], cwd: message.params.cwd }, model: message.params.model, modelProvider: 'studio_gateway', cwd: message.params.cwd, approvalPolicy: message.params.approvalPolicy, sandbox: { type: 'readOnly', networkAccess: false } } });",
    "      emit({ method: 'thread/started', params: { thread: { id: threadId } } });",
    "    } else if (message.method === 'turn/start') {",
    "      const turnId = `turn-${nextTurn++}`;",
    "      emit({ id: message.id, result: { turn: { id: turnId, status: 'running', items: [] } } });",
    "      setTimeout(() => {",
    "        emit({ method: 'turn/started', params: { threadId: message.params.threadId, turn: { id: turnId, status: 'running' } } });",
    "        emit({ method: 'item/agentMessage/delta', params: { threadId: message.params.threadId, turnId, itemId: `agent-${process.pid}`, delta: `persistent ${process.pid}` } });",
    "        emit({ method: 'item/completed', params: { threadId: message.params.threadId, turnId, item: { type: 'agentMessage', id: `agent-${process.pid}`, text: `persistent ${process.pid}` } } });",
    "        emit({ method: 'turn/completed', params: { threadId: message.params.threadId, turn: { id: turnId, status: 'completed', items: [] } } });",
    "      }, 10);",
    "    } else {",
    "      emit({ id: message.id, error: { code: -32601, message: `unexpected ${message.method}` } });",
    "    }",
    "  }",
    "});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });

  let sendInbound = null;
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
      const serverKey = createOctoX25519KeyPair();
      const salt = "fedcba0987654321";
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      sendInbound = (messageId, fromUid, content) => {
        if (socket.readyState !== 1) throw new Error("Octo fake socket is not open");
        socket.send(encodeOctoRecvPacket({
          serverPrivateKey: serverKey.privateKey,
          clientPublicKeyBase64: packet.clientPublicKeyBase64,
          salt,
          messageId,
          messageSeq: messageId - 5100,
          fromUid,
          channelId: fromUid,
          channelType: 1,
          payload: {
            type: 1,
            content,
          },
        }));
      };
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
        res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-5", object: "model" }] }));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-isolation", im_token: "im-token-isolation", ws_url: wsUrl }));
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
              id: "codex-persistent-isolation",
              name: "Codex Persistent Isolation",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "read-only",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-persistent-isolation",
          platformBindings: [
            {
              id: "octo-persistent-isolation",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Persistent Isolation",
              agentProfileId: "codex-persistent-isolation",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                agentSessionDriver: "persistent",
                octoReconnectJitterMs: 0,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const configPath = path.join(root, "daemon-persistent-isolation-config.json");
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
        await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-persistent-isolation" && item.connected);
          return connected && sendInbound ? response.body : null;
        }, 5000);

        sendInbound(5101, "persistent-user-a", "hello from persistent user a");
        sendInbound(5102, "persistent-user-b", "hello from persistent user b");

        const status = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const runs = response.body?.agentRuns?.filter?.((item) => ["5101", "5102"].includes(item.messageId) && item.ok) || [];
          const sessions = response.body?.agentSessionDriver?.activeSessions?.filter?.((item) => item.bindingId === "octo-persistent-isolation") || [];
          return runs.length === 2 && sessions.length === 2 ? response.body : null;
        }, 10_000);
        const sessions = status.agentSessionDriver.activeSessions
          .filter((item) => item.bindingId === "octo-persistent-isolation")
          .sort((left, right) => left.sessionKey.localeCompare(right.sessionKey));
        assert.equal(new Set(sessions.map((item) => item.poolKey)).size, 2);
        assert.equal(new Set(sessions.map((item) => item.sessionId)).size, 2);
        assert.deepEqual(sessions.map((item) => item.turnCount), [1, 1]);
        assert.deepEqual(sessions.map((item) => item.permissionMode), ["read-only", "read-only"]);

        const killedPoolKey = sessions[0].poolKey;
        const keptPoolKey = sessions[1].poolKey;
        const killStatus = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/agent-sessions`, {
          method: "POST",
          body: {
            action: "kill",
            poolKey: killedPoolKey,
            reason: "test-isolation-kill",
          },
        });
        assert.equal(killStatus.status, 200);
        assert.equal(killStatus.body.killed.killed, true);
        assert.equal(killStatus.body.activeSessions.some((item) => item.poolKey === killedPoolKey), false);
        assert.equal(killStatus.body.activeSessions.some((item) => item.poolKey === keptPoolKey), true);

        const capture = fs.readFileSync(capturePath, "utf8")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        assert.equal(capture.some((item) => item.mode === "fallback-exec"), false);
        const threadStarts = capture.filter((item) => item.method === "thread/start");
        assert.equal(threadStarts.length, 2);
        assert.equal(new Set(threadStarts.map((item) => item.pid)).size, 2);
        assert.equal(new Set(threadStarts.map((item) => item.codexHome)).size, 2);
        const replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.doesNotMatch(replyContents, /已加入队列/);
        assert.match(replyContents, /persistent/);
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

test("native Channel Connectors daemon falls back to one-shot when Codex app-server crashes", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-appserver-crash-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "function emit(value) { process.stdout.write(`${JSON.stringify(value)}\\n`); }",
    "function record(value) { fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ pid: process.pid, ...value })}\\n`); }",
    "if (process.argv[2] !== 'app-server') {",
    "  record({ mode: 'fallback-exec', argv: process.argv.slice(2), codexHome: process.env.CODEX_HOME });",
    "  emit({ type: 'thread.started', thread_id: 'thread-fallback-after-crash' });",
    "  emit({ type: 'item.completed', item: { type: 'agent_message', text: 'fallback one-shot ok' } });",
    "  process.exit(0);",
    "}",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    "  for (const raw of chunk.split(/\\r?\\n/)) {",
    "    if (!raw.trim()) continue;",
    "    const message = JSON.parse(raw);",
    "    record({ mode: 'app-server', method: message.method, id: message.id || null, params: message.params || null, codexHome: process.env.CODEX_HOME });",
    "    if (message.method === 'initialize') {",
    "      emit({ id: message.id, result: { userAgent: 'fake-crashing-codex-app-server', codexHome: process.env.CODEX_HOME || '', platformFamily: 'unix', platformOs: 'linux' } });",
    "    } else if (message.method === 'initialized') {",
    "      // notification",
    "    } else if (message.method === 'thread/start') {",
    "      emit({ id: message.id, result: { thread: { id: 'thread-crash-1', sessionId: 'thread-crash-1', turns: [], cwd: message.params.cwd }, model: message.params.model, modelProvider: 'studio_gateway', cwd: message.params.cwd, approvalPolicy: message.params.approvalPolicy, sandbox: { type: 'readOnly', networkAccess: false } } });",
    "      emit({ method: 'thread/started', params: { thread: { id: 'thread-crash-1' } } });",
    "    } else if (message.method === 'turn/start') {",
    "      setTimeout(() => process.exit(42), 10);",
    "    } else {",
    "      emit({ id: message.id, error: { code: -32601, message: `unexpected ${message.method}` } });",
    "    }",
    "  }",
    "});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });

  let sendInbound = null;
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
      const serverKey = createOctoX25519KeyPair();
      const salt = "fedcba0987654321";
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      sendInbound = (messageId, fromUid, content) => {
        if (socket.readyState !== 1) throw new Error("Octo fake socket is not open");
        socket.send(encodeOctoRecvPacket({
          serverPrivateKey: serverKey.privateKey,
          clientPublicKeyBase64: packet.clientPublicKeyBase64,
          salt,
          messageId,
          messageSeq: messageId - 5200,
          fromUid,
          channelId: fromUid,
          channelType: 1,
          payload: {
            type: 1,
            content,
          },
        }));
      };
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
        res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-5", object: "model" }] }));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-crash", im_token: "im-token-crash", ws_url: wsUrl }));
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
              id: "codex-persistent-crash",
              name: "Codex Persistent Crash",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "read-only",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-persistent-crash",
          platformBindings: [
            {
              id: "octo-persistent-crash",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Persistent Crash",
              agentProfileId: "codex-persistent-crash",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                agentSessionDriver: "persistent",
                octoReconnectJitterMs: 0,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const configPath = path.join(root, "daemon-persistent-crash-config.json");
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
        await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-persistent-crash" && item.connected);
          return connected && sendInbound ? response.body : null;
        }, 5000);

        sendInbound(5201, "persistent-crash-user", "trigger persistent app-server crash");

        const status = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => item.messageId === "5201" && item.ok);
          const eventTypes = response.body?.agentSessionDriver?.recentEvents?.map?.((event) => event.type) || [];
          return run && eventTypes.includes("turn.fallback") ? response.body : null;
        }, 10_000);
        assert.equal(status.agentSessionDriver.requestedPersistentBindings[0].effectiveMode, "persistent");
        assert.equal(status.agentSessionDriver.activeSessions.some((item) => item.bindingId === "octo-persistent-crash"), false);
        const eventTypes = status.agentSessionDriver.recentEvents.map((event) => event.type);
        assert.ok(eventTypes.includes("turn.failed"));
        assert.ok(eventTypes.includes("session.disposed"));
        assert.ok(eventTypes.includes("turn.fallback"));

        const capture = fs.readFileSync(capturePath, "utf8")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        assert.ok(capture.some((item) => item.mode === "app-server" && item.method === "turn/start"));
        assert.ok(capture.some((item) => item.mode === "fallback-exec"));
        const fallbackExec = capture.find((item) => item.mode === "fallback-exec");
        assert.match(fallbackExec.argv.join(" "), /exec/);
        const replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.match(replyContents, /fallback one-shot ok/);
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

test("native Channel Connectors daemon stops Codex app-server persistent turns via /stop", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-appserver-stop-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "let nextTurn = 1;",
    "function emit(value) { process.stdout.write(`${JSON.stringify(value)}\\n`); }",
    "function record(value) { fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify(value)}\\n`); }",
    "if (process.argv[2] !== 'app-server') {",
    "  record({ mode: 'fallback-exec', argv: process.argv.slice(2) });",
    "  process.exit(23);",
    "}",
    "process.stdin.setEncoding('utf8');",
    "process.stdin.on('data', (chunk) => {",
    "  for (const raw of chunk.split(/\\r?\\n/)) {",
    "    if (!raw.trim()) continue;",
    "    const message = JSON.parse(raw);",
    "    record({ mode: 'app-server', method: message.method, id: message.id || null, params: message.params || null, codexHome: process.env.CODEX_HOME });",
    "    if (message.method === 'initialize') {",
    "      emit({ id: message.id, result: { userAgent: 'fake-codex-app-server', codexHome: process.env.CODEX_HOME || '', platformFamily: 'unix', platformOs: 'linux' } });",
    "    } else if (message.method === 'initialized') {",
    "      // notification",
    "    } else if (message.method === 'thread/start') {",
    "      emit({ id: message.id, result: { thread: { id: 'thread-stop-1', sessionId: 'thread-stop-1', turns: [], cwd: message.params.cwd }, model: message.params.model, modelProvider: 'studio_gateway', cwd: message.params.cwd, approvalPolicy: message.params.approvalPolicy, sandbox: { type: 'readOnly', networkAccess: false } } });",
    "      emit({ method: 'thread/started', params: { thread: { id: 'thread-stop-1' } } });",
    "    } else if (message.method === 'turn/start') {",
    "      const turnId = `turn-${nextTurn++}`;",
    "      emit({ id: message.id, result: { turn: { id: turnId, status: 'running', items: [] } } });",
    "      setTimeout(() => emit({ method: 'turn/started', params: { threadId: message.params.threadId, turn: { id: turnId, status: 'running' } } }), 10);",
    "    } else if (message.method === 'turn/interrupt') {",
    "      emit({ id: message.id, result: {} });",
    "      setTimeout(() => emit({ method: 'turn/completed', params: { threadId: message.params.threadId, turn: { id: message.params.turnId, status: 'cancelled', items: [], error: null } } }), 10);",
    "    } else {",
    "      emit({ id: message.id, error: { code: -32601, message: `unexpected ${message.method}` } });",
    "    }",
    "  }",
    "});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });

  let sendInbound = null;
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
      const serverKey = createOctoX25519KeyPair();
      const salt = "fedcba0987654321";
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      sendInbound = (messageId, content) => {
        if (socket.readyState !== 1) throw new Error("Octo fake socket is not open");
        socket.send(encodeOctoRecvPacket({
          serverPrivateKey: serverKey.privateKey,
          clientPublicKeyBase64: packet.clientPublicKeyBase64,
          salt,
          messageId,
          messageSeq: messageId - 4100,
          fromUid: "persistent-stop-user",
          channelId: "persistent-stop-user",
          channelType: 1,
          payload: {
            type: 1,
            content,
          },
        }));
      };
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
        res.end(JSON.stringify({ object: "list", data: [{ id: "gpt-5", object: "model" }] }));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-stop", im_token: "im-token-stop", ws_url: wsUrl }));
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
              id: "codex-persistent-stop",
              name: "Codex Persistent Stop",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "read-only",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-persistent-stop",
          platformBindings: [
            {
              id: "octo-persistent-stop",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Persistent Stop",
              agentProfileId: "codex-persistent-stop",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                agentSessionDriver: "persistent",
                octoReconnectJitterMs: 0,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const configPath = path.join(root, "daemon-persistent-stop-config.json");
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
        await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-persistent-stop" && item.connected);
          return connected && sendInbound ? response.body : null;
        }, 5000);

        sendInbound(4101, "start a long persistent codex turn");
        await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const activeRun = response.body?.activeRuns?.find?.((item) => item.messageId === "4101" && item.status === "running");
          return activeRun ? response.body : null;
        }, 5000);

        sendInbound(4102, "/stop");
        await waitFor(() => {
          const capture = fs.existsSync(capturePath)
            ? fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line))
            : [];
          return capture.some((item) => item.method === "turn/interrupt") ? capture : null;
        }, 5000);

        const status = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => item.messageId === "4101" && item.status === "cancelled");
          const stillActive = response.body?.activeRuns?.some?.((item) => item.messageId === "4101");
          return run && !stillActive ? response.body : null;
        }, 5000);
        assert.equal(status.agentSessionDriver.requestedPersistentBindings[0].effectiveMode, "persistent");

        const capture = fs.readFileSync(capturePath, "utf8")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        assert.equal(capture.some((item) => item.mode === "fallback-exec"), false);
        assert.ok(capture.some((item) => item.method === "turn/start"));
        const interrupt = capture.find((item) => item.method === "turn/interrupt");
        assert.ok(interrupt);
        assert.equal(interrupt.params.threadId, "thread-stop-1");
        assert.equal(interrupt.params.turnId, "turn-1");
        const replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.match(replyContents, /已请求停止当前 Agent 运行/);
        assert.match(replyContents, /Agent 已停止/);
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
        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => event.eventKind === "agent.model.selected" && event.messageId === "1001")
            && events.some((event) => event.eventKind === "agent.attachments.staged" && event.messageId === "1001")
            && events.some((event) => event.eventKind === "agent.visual.input" && event.messageId === "1001");
        }, 10_000);
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
