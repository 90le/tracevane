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
  ChannelConnectorAgentSessionDriverPool,
} from "../../dist/apps/api/modules/channel-connectors/agent-session-driver.js";
import {
  createNativeCliSessionDriverFactory,
} from "../../dist/apps/api/modules/channel-connectors/cli-agent-session-driver.js";
import {
  CodexAppServerSession,
} from "../../dist/apps/api/modules/channel-connectors/codex-app-server-driver.js";
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
  buildFeishuConversationScopeId,
  buildFeishuSessionKey,
  channelConnectorFeishuBotMentionCandidates,
  isChannelConnectorFeishuBotMentioned,
  isChannelConnectorFeishuMessageDirected,
  normalizeFeishuMessageTextForBot,
  parseChannelConnectorFeishuWebhook,
} from "../../dist/apps/api/modules/channel-connectors/feishu-adapter.js";
import {
  attachExtractedOctoAttachments,
  extractOctoContent,
  renderOctoOutboundText,
  renderOctoTextReply,
} from "../../dist/apps/api/modules/channel-connectors/octo-adapter.js";
import {
  uploadAndSendOctoMedia,
  shouldDirectUploadOctoMedia,
  sendOctoTextReply,
  sendOctoHeartbeat,
  sendOctoReadReceipt,
  sendOctoTyping,
  sendOctoMediaMessage,
} from "../../dist/apps/api/modules/channel-connectors/octo-transport.js";
import {
  addFeishuMessageReaction,
  downloadFeishuMessageResource,
  downloadFeishuMessageResourceToFile,
  executeFeishuChannelAction,
  getFeishuBotInfo,
  getFeishuMessage,
  listFeishuChatMembers,
  listFeishuThreadMessages,
  removeFeishuMessageReaction,
  sendFeishuCardMessage,
  sendFeishuPostMessage,
  sendFeishuTextMessage,
  uploadAndSendFeishuMedia,
} from "../../dist/apps/api/modules/channel-connectors/feishu-transport.js";
import {
  loadFeishuThreadBootstrapContext,
} from "../../dist/apps/api/modules/channel-connectors/feishu-thread-bootstrap.js";
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
  listChannelConnectorSkillSummaries,
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
  upsertChannelConnectorSessionControl,
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
  renderFeishuOutboundMessageContent,
  resolveFeishuOutboundMessageTarget,
  resolveOctoOutboundMessageTarget,
} from "../../dist/apps/api/modules/channel-connectors/outbound-messages.js";
import {
  buildChannelConnectorSkillContext,
  channelConnectorSkillDirs,
  listChannelConnectorPlatformSkills,
} from "../../dist/apps/api/modules/channel-connectors/skill-registry.js";

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
  const sendMessageDelayMs = Number.isInteger(options.sendMessageDelayMs) ? options.sendMessageDelayMs : 0;
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("end", () => {
      const bodyRaw = Buffer.concat(chunks).toString("utf8");
      const contentType = String(req.headers["content-type"] || "");
      const body = contentType.includes("multipart/form-data")
        ? { raw: bodyRaw }
        : req.method === "PUT" && !contentType.includes("application/json")
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
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/md") {
        res.end(JSON.stringify({ content: "# Group Rules\n- Ask human members by DM.\n- Ask bots by group/thread mention.", version: 2 }));
        return;
      }
      if (req.method === "PUT" && req.url === "/v1/bot/groups/group-1/md") {
        res.end(JSON.stringify({ version: 3 }));
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
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/threads/thread-1/md") {
        res.end(JSON.stringify({ content: "# Thread Rules\n- Focus on release notes.", version: 4 }));
        return;
      }
      if (req.method === "PUT" && req.url === "/v1/bot/groups/group-1/threads/thread-1/md") {
        res.end(JSON.stringify({ version: 5 }));
        return;
      }
      if (req.method === "GET" && req.url === "/v1/bot/voice/context") {
        res.end(JSON.stringify({
          has_context: true,
          context: "Alice may be transcribed as A list.",
          updated_at: "2026-06-06T08:00:00Z",
        }));
        return;
      }
      if (req.method === "PUT" && req.url === "/v1/bot/voice/context") {
        res.end(JSON.stringify({ ok: true, updated: true }));
        return;
      }
      if (req.method === "DELETE" && req.url === "/v1/bot/voice/context") {
        res.end(JSON.stringify({ ok: true, deleted: true }));
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/groups/group-1/threads") {
        res.end(JSON.stringify({ short_id: "thread-new", name: body.name || "Thread Name", creator_uid: "robot-1" }));
        return;
      }
      if (req.method === "DELETE" && req.url === "/v1/bot/groups/group-1/threads/thread-1") {
        res.end(JSON.stringify({ deleted: true, group_no: "group-1", short_id: "thread-1" }));
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
        const payload = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
        const richPayload = payload({
          type: 14,
          content: [
            { type: "text", text: "rich helper reply " },
            { type: "image", name: "diagram.png" },
            { type: "text", text: " done" },
          ],
        });
        const markdownPayload = payload({
          type: 1,
          content: {
            markdown: "markdown helper reply",
            elements: [{ tag: "text", text: "nested fallback text" }],
          },
        });
        const filePayload = payload({ type: 8, name: "handoff.pdf", size: 128 });
        const textPayload = payload({ type: 1, content: "history hello" });
        const historyMessages = body.limit === 5
          ? [
            { id: "12345678901234567", seq: 1, from: "user-1", payload: textPayload },
            { id: "12345678901234568", seq: 2, from: "helper_bot", payload: richPayload },
            { id: "12345678901234569", seq: 3, from: "helper_bot", payload: markdownPayload },
            { id: "12345678901234570", seq: 4, from: "helper_bot", payload: filePayload },
          ]
          : [
            { id: "12345678901234567", seq: 1, from: "user-1", payload: textPayload },
          ];
        res.end(JSON.stringify({
          start_message_seq: 1,
          end_message_seq: historyMessages.length,
          pull_mode: 1,
          messages: historyMessages.map((message) => ({
            message_id: message.id,
            message_seq: message.seq,
            from_uid: message.from,
            channel_id: "group-1",
            channel_type: 2,
            timestamp: 1742547600 + message.seq,
            payload: message.payload,
          })),
        }));
        return;
      }
      if (req.method === "GET" && req.url?.startsWith("/v1/bot/file/download/chat/hello.txt")) {
        res.statusCode = 302;
        res.setHeader("location", "https://cdn.example.test/chat/hello.txt");
        res.end();
        return;
      }
      if (req.method === "POST" && req.url === "/v1/bot/message/edit") {
        res.end(JSON.stringify({ ok: true, message_id: body.message_id || "msg-1" }));
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
        const finish = () => res.end(JSON.stringify({ ok: true, message_id: 123 }));
        if (req.url === "/v1/bot/sendMessage" && sendMessageDelayMs > 0) {
          setTimeout(finish, sendMessageDelayMs);
        } else {
          finish();
        }
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
      if (req.url === "/open-apis/bot/v3/info" && req.method === "GET") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          bot: {
            open_id: "ou_mock_bot",
            app_name: "Mock Feishu Bot",
          },
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
      if (req.url?.startsWith("/open-apis/im/v1/messages?receive_id_type=") && req.method === "POST") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { message_id: "om_sent_1" },
        }));
        return;
      }
      if (/^\/open-apis\/im\/v1\/messages\/[^/]+\/reply$/.test(req.url || "") && req.method === "POST") {
        res.end(JSON.stringify({
          code: 0,
          msg: "success",
          data: { message_id: "om_reply_1" },
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
  assert.deepEqual(status.bindingPolicy.supportedAgents, ["codex", "claude-code", "opencode"]);
  assert.equal(status.bindingPolicy.supportedAgents.includes("gemini"), false);
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
  assert.match(buffered.replyText, /当前会话仅发送预览/);
  assert.doesNotMatch(buffered.replyText, /群聊仅发送预览/);
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
      { platform: "octo", target: "bot:27xIxHrNV0Qc3ee2129_bot", content: "请介绍一下你的能力" },
      { platform: "octo", channelId: "helper_bot", channelType: 2, content: "请介绍一下你的能力" },
      { platform: "octo", target: "group:group-a", content: "@[user-2:Alice] 大家看这里", onBehalfOf: "grantor-1" },
      { platform: "octo", target: "thread:group-a____topic-1", content: "Thread ping", mentionAll: true },
      { platform: "feishu", chatId: "oc_chat", content: "Feishu ping" },
      { platform: "feishu", target: "open_id:ou_admin", content: "Feishu open ping" },
      { platform: "feishu", target: "user_id:u_admin", content: "Feishu user ping" },
      { platform: "feishu", target: "dm:ou_dm", content: "Feishu dm ping" },
      { platform: "feishu", target: "chat:oc_other", content: "Feishu chat ping" },
      { platform: "feishu", target: "open_id:ou_markdown", format: "markdown", content: "**Feishu md ping**" },
      { platform: "feishu", target: "chat:oc_mentions", content: "@[ou_helper:Helper] Feishu mention ping" },
    ]),
    "```",
  ].join("\n"));

  assert.equal(extracted.replyText, "我会通知她们。");
  assert.deepEqual(extracted.errors, []);
  assert.equal(extracted.messages.length, 12);
  assert.deepEqual(extracted.messages.map((message) => [message.platform, message.channelId, message.channelType, message.chatId, message.content, message.format]), [
    ["octo", "user-1", 1, null, "请介绍一下你的能力", null],
    ["octo", "27xIxHrNV0Qc3ee2129_bot", 1, null, "请介绍一下你的能力", null],
    ["octo", "helper_bot", 2, null, "请介绍一下你的能力", null],
    ["octo", "group-a", 2, null, "大家看这里", null],
    ["octo", "group-a____topic-1", 5, null, "Thread ping", null],
    ["feishu", "", null, "oc_chat", "Feishu ping", null],
    ["feishu", "open_id:ou_admin", null, null, "Feishu open ping", null],
    ["feishu", "user_id:u_admin", null, null, "Feishu user ping", null],
    ["feishu", "ou_dm", 1, null, "Feishu dm ping", null],
    ["feishu", "", null, "oc_other", "Feishu chat ping", null],
    ["feishu", "open_id:ou_markdown", null, null, "**Feishu md ping**", "markdown"],
    ["feishu", "", null, "oc_mentions", "Feishu mention ping", null],
  ]);
  assert.deepEqual(extracted.messages[3].mentionUids, ["user-2"]);
  assert.equal(extracted.messages[3].onBehalfOf, "grantor-1");
  assert.equal(extracted.messages[4].mentionAll, true);
  assert.deepEqual(extracted.messages[11].mentionUids, ["ou_helper"]);
  assert.deepEqual(extracted.messages[11].structuredMentions, [{ uid: "ou_helper", label: "Helper" }]);
  assert.deepEqual(extracted.messages.slice(5).map((message) => {
    const target = resolveFeishuOutboundMessageTarget(message);
    return [target.receiveId, target.receiveIdType, target.error];
  }), [
    ["oc_chat", "chat_id", null],
    ["ou_admin", "open_id", null],
    ["u_admin", "user_id", null],
    ["ou_dm", "open_id", null],
    ["oc_other", "chat_id", null],
    ["ou_markdown", "open_id", null],
    ["oc_mentions", "chat_id", null],
  ]);
  const feishuMentionTarget = resolveFeishuOutboundMessageTarget(extracted.messages[11]);
  const feishuMentionContent = renderFeishuOutboundMessageContent({
    message: extracted.messages[11],
    target: feishuMentionTarget,
    members: [
      { uid: "ou_helper", name: "Helper From Members" },
    ],
  });
  assert.deepEqual(feishuMentionContent.nativeMentionIds, ["ou_helper"]);
  assert.equal(feishuMentionContent.content, '<at user_id="ou_helper">Helper</at> Feishu mention ping');

  const explicitFeishuMentionContent = renderFeishuOutboundMessageContent({
    message: {
      ...extracted.messages[5],
      content: "Ping",
      mentionUids: ["open_id:ou_member"],
      structuredMentions: [],
    },
    target: { receiveId: "oc_chat", receiveIdType: "chat_id", error: null },
    members: [
      { uid: "ou_member", name: "Member Name" },
    ],
  });
  assert.deepEqual(explicitFeishuMentionContent.nativeMentionIds, ["ou_member"]);
  assert.equal(explicitFeishuMentionContent.content, '<at user_id="ou_member">Member Name</at> Ping');

  const botFromGroup = resolveOctoOutboundMessageTarget({
    message: extracted.messages[1],
    sourceChannelId: "group-a",
    sourceChannelType: 2,
  });
  assert.equal(botFromGroup.error, null);
  assert.equal(botFromGroup.channelId, "group-a");
  assert.equal(botFromGroup.channelType, 2);
  assert.equal(botFromGroup.remappedBotDm, true);
  assert.deepEqual(botFromGroup.mentionUids, ["27xIxHrNV0Qc3ee2129_bot"]);

  const misdeclaredBotFromGroup = resolveOctoOutboundMessageTarget({
    message: extracted.messages[2],
    sourceChannelId: "group-a",
    sourceChannelType: 2,
  });
  assert.equal(misdeclaredBotFromGroup.error, null);
  assert.equal(misdeclaredBotFromGroup.channelId, "group-a");
  assert.equal(misdeclaredBotFromGroup.channelType, 2);
  assert.equal(misdeclaredBotFromGroup.remappedBotDm, true);
  assert.deepEqual(misdeclaredBotFromGroup.mentionUids, ["helper_bot"]);

  const botFromDm = resolveOctoOutboundMessageTarget({
    message: extracted.messages[1],
    sourceChannelId: "user-1",
    sourceChannelType: 1,
  });
  assert.match(botFromDm.error, /does not support bot channel targets/);

  const visibleBotMention = renderOctoOutboundText({
    channelId: botFromGroup.channelId,
    channelType: botFromGroup.channelType,
    content: extracted.messages[1].content,
    mentionUids: botFromGroup.mentionUids,
    members: [
      { uid: "27xIxHrNV0Qc3ee2129_bot", name: "studio-cc", robot: 1 },
    ],
  });
  assert.ok(visibleBotMention);
  assert.deepEqual(visibleBotMention.chunks, ["@studio-cc 请介绍一下你的能力"]);
  assert.deepEqual(visibleBotMention.payloads[0].payload.mention.uids, ["27xIxHrNV0Qc3ee2129_bot"]);
  assert.deepEqual(visibleBotMention.payloads[0].payload.mention.entities, [
    { uid: "27xIxHrNV0Qc3ee2129_bot", offset: 0, length: "@studio-cc".length },
  ]);

  const structuredBotMention = renderOctoOutboundText({
    channelId: "group-a",
    channelType: 2,
    content: "@[27xIxHrNV0Qc3ee2129_bot:studio-cc] 请介绍一下你的能力",
    members: [
      { uid: "27xIxHrNV0Qc3ee2129_bot", name: "studio-cc", robot: 1 },
    ],
  });
  assert.ok(structuredBotMention);
  assert.deepEqual(structuredBotMention.chunks, ["@studio-cc 请介绍一下你的能力"]);
  assert.deepEqual(structuredBotMention.payloads[0].payload.mention.entities, [
    { uid: "27xIxHrNV0Qc3ee2129_bot", offset: 0, length: "@studio-cc".length },
  ]);

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

test("native Channel Connectors executes Feishu read-only actions and approval-gated mutations", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    const form = init.body && typeof init.body.get === "function"
      ? {
        file_name: String(init.body.get("file_name") || ""),
        parent_type: String(init.body.get("parent_type") || ""),
        parent_node: String(init.body.get("parent_node") || ""),
        size: String(init.body.get("size") || ""),
        extra: String(init.body.get("extra") || ""),
        file: init.body.get("file") ? {
          name: String(init.body.get("file").name || ""),
          size: Number(init.body.get("file").size || 0),
          type: String(init.body.get("file").type || ""),
        } : null,
      }
      : null;
    requests.push({
      url: String(url),
      method: init.method || "GET",
      body: typeof init.body === "string" ? init.body : "",
      form,
      authorization: init.headers?.authorization || init.headers?.Authorization || "",
    });
    if (String(url).endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return new Response(JSON.stringify({
        code: 0,
        tenant_access_token: "tenant-token",
        expire: 3600,
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/wiki/v2/spaces")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          items: [
            { space_id: "7370955161512345678", name: "Studio KB", description: "docs" },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/drive/v1/permissions/doc_a/members?type=docx&need_notification=false")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          member: { member_type: "email", member_id: "a@example.com", perm: "edit" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/drive/v1/files/doc_a/comments?file_type=docx&user_id_type=open_id&page_size=20")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          has_more: false,
          items: [
            {
              comment_id: "comment_1",
              user_id: "ou_a",
              quote: "Line",
              reply_list: { replies: [{ reply_id: "root_reply", user_id: "ou_a", content: { elements: [] } }] },
            },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/drive/v1/files/doc_a/comments/comment_1/replies?file_type=docx&user_id_type=open_id")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          has_more: false,
          items: [{ reply_id: "reply_1", user_id: "ou_b", content: { elements: [] } }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/drive/v1/files/doc_a/new_comments")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { comment_id: "comment_new" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/drive/v1/files/doc_a/comments/comment_1/replies?file_type=docx")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { reply_id: "reply_new" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/wiki/v2/spaces/space_1/nodes")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          node: { node_token: "wikcn_node", obj_token: "docx_node", obj_type: "docx", title: "New Page" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/wiki/v2/spaces/get_node?token=wikibase")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          node: { node_token: "wikibase", obj_token: "base_from_wiki", obj_type: "bitable", title: "Tracker" },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/bitable/v1/apps/base_from_wiki")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { app: { app_token: "base_from_wiki", name: "Wiki Tracker" } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/bitable/v1/apps/base_from_wiki/tables")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { items: [{ table_id: "tbl_wiki", name: "Tasks" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "GET" && String(url).endsWith("/open-apis/bitable/v1/apps/base_a/tables/tbl_a/fields")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          items: [
            { field_id: "fld_name", field_name: "Name", type: 1, is_primary: true },
            { field_id: "fld_status", field_name: "Status", type: 3, property: { options: [{ name: "Open" }] } },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/bitable/v1/apps/base_a/tables/tbl_a/records?page_size=20")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          has_more: false,
          total: 1,
          items: [{ record_id: "rec_1", fields: { Name: "Alpha", Status: "Open" } }],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/bitable/v1/apps/base_a/tables/tbl_a/records/rec_1")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { record: { record_id: "rec_1", fields: { Name: "Alpha", Status: "Open" } } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/bitable/v1/apps/base_a/tables/tbl_a/records")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { record: { record_id: "rec_2", fields: JSON.parse(init.body || "{}").fields } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "PUT" && String(url).endsWith("/open-apis/bitable/v1/apps/base_a/tables/tbl_a/records/rec_1")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { record: { record_id: "rec_1", fields: JSON.parse(init.body || "{}").fields } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/bitable/v1/apps")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { app: { app_token: "base_new", name: "New Tracker", url: "https://example.feishu.cn/base/base_new" } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/bitable/v1/apps/base_new/tables")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { items: [{ table_id: "tbl_new", name: "Sheet 1" }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/bitable/v1/apps/base_new/tables/tbl_new/fields")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          items: [
            { field_id: "fld_primary", field_name: "Text", type: 1, is_primary: true },
            { field_id: "fld_select", field_name: "Single select", type: 3, is_primary: false },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "PUT" && String(url).endsWith("/open-apis/bitable/v1/apps/base_new/tables/tbl_new/fields/fld_primary")) {
      return new Response(JSON.stringify({ code: 0, data: { field: { field_id: "fld_primary" } } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "DELETE" && String(url).endsWith("/open-apis/bitable/v1/apps/base_new/tables/tbl_new/fields/fld_select")) {
      return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/bitable/v1/apps/base_new/tables/tbl_new/records?page_size=100")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { items: [{ record_id: "rec_empty", fields: { Text: "" } }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/bitable/v1/apps/base_new/tables/tbl_new/records/batch_delete")) {
      return new Response(JSON.stringify({ code: 0, data: {} }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/bitable/v1/apps/base_a/tables/tbl_a/fields")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { field: { field_id: "fld_score", field_name: "Score", type: 2 } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/docx/v1/documents/blocks/convert")) {
      const body = JSON.parse(init.body || "{}");
      const id = String(body.content || "").includes("Inserted") ? "inserted_tmp" : "append_tmp";
      return new Response(JSON.stringify({
        code: 0,
        data: {
          first_level_block_ids: [id],
          blocks: [
            { block_id: id, block_type: 2, text: { elements: [{ text_run: { content: body.content || "" } }] } },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/descendant")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { children: [{ block_id: "new_block_1", block_type: 2 }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/children?document_revision_id=-1")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          children: [
            { block_id: "image_block_1", block_type: 27, image: {} },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "POST" && String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/children")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          children: [
            { block_id: "table_1", block_type: 31, children: ["cell_1", "cell_2", "cell_3", "cell_4"] },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/children")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { items: [{ block_id: "old_block_1", block_type: 2 }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/table_1")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          block: {
            block_id: "table_1",
            block_type: 31,
            table: { property: { row_size: 2, column_size: 2 }, cells: ["cell_1", "cell_2", "cell_3", "cell_4"] },
          },
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "PATCH" && String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/color_block_1")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { block: { block_id: "color_block_1", block_type: 2 } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (/\/open-apis\/docx\/v1\/documents\/doc_a\/blocks\/cell_[12]\/children$/.test(String(url))) {
      return new Response(JSON.stringify({ code: 0, data: { items: [] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (/\/open-apis\/docx\/v1\/documents\/doc_a\/blocks\/cell_[12]\/descendant$/.test(String(url))) {
      return new Response(JSON.stringify({
        code: 0,
        data: { children: [{ block_id: "cell_text", block_type: 2 }] },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/old_block_1")) {
      return new Response(JSON.stringify({
        code: 0,
        data: { block: { block_id: "old_block_1", parent_id: "doc_a", block_type: 2 } },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if ((init.method || "GET") === "PATCH" && String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/image_block_1")) {
      return new Response(JSON.stringify({ code: 0, data: { revision_id: 3 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/children/batch_delete")) {
      return new Response(JSON.stringify({ code: 0, data: { revision_id: 2 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/drive/v1/medias/upload_all")) {
      const parentType = form?.parent_type || "";
      return new Response(JSON.stringify({
        code: 0,
        data: { file_token: parentType === "docx_image" ? "img_token_1" : "file_token_1" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (String(url).endsWith("/open-apis/application/v6/scopes")) {
      return new Response(JSON.stringify({
        code: 0,
        data: {
          scopes: [
            { scope_name: "im:message", scope_type: "tenant", grant_status: 1 },
            { scope_name: "docx:document", scope_type: "tenant", grant_status: 0 },
          ],
        },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ code: 404, msg: "not mocked" }), { status: 404 });
  };
  try {
    const config = {
      apiUrl: "https://open.feishu.cn",
      appId: "cli_test",
      appSecret: "secret",
    };
    const readOnly = await executeFeishuChannelAction(config, {
      tool: "feishu_wiki",
      action: "spaces",
      params: {},
    }, null);
    assert.equal(readOnly.ok, true);
    assert.equal(readOnly.tool, "feishu_wiki");
    assert.equal(readOnly.action, "spaces");
    assert.equal(readOnly.readOnly, true);
    assert.equal(readOnly.requestCount, 2);
    assert.deepEqual(readOnly.data, {
      spaces: [
        { space_id: "7370955161512345678", name: "Studio KB", description: "docs" },
      ],
    });
    assert.equal(requests[1].authorization, "Bearer tenant-token");

    const appScopes = await executeFeishuChannelAction(config, {
      tool: "feishu_app_scopes",
      action: "list",
      params: {},
    }, null);
    assert.equal(appScopes.ok, true);
    assert.equal(appScopes.readOnly, true);
    assert.deepEqual(appScopes.data, {
      granted: [{ name: "im:message", type: "tenant" }],
      pending: [{ name: "docx:document", type: "tenant" }],
      summary: "1 granted, 1 pending",
    });

    const requestCountBeforeMutation = requests.length;
    const mutationWithoutApproval = await executeFeishuChannelAction(config, {
      tool: "feishu_perm",
      action: "add",
      params: { token: "doc_a", type: "docx", member_type: "email", member_id: "a@example.com", perm: "edit" },
    }, null);
    assert.equal(mutationWithoutApproval.ok, false);
    assert.equal(mutationWithoutApproval.readOnly, false);
    assert.match(mutationWithoutApproval.error || "", /requires Studio IM approval/);
    assert.equal(requests.length, requestCountBeforeMutation);

    const mutation = await executeFeishuChannelAction(config, {
      tool: "feishu_perm",
      action: "add",
      params: { token: "doc_a", type: "docx", member_type: "email", member_id: "a@example.com", perm: "edit" },
    }, null, { allowMutation: true });
    assert.equal(mutation.ok, true);
    assert.equal(mutation.readOnly, false);
    assert.deepEqual(mutation.data, {
      success: true,
      member: { member_type: "email", member_id: "a@example.com", perm: "edit" },
    });
    const permRequest = requests.at(-1);
    assert.match(permRequest.url, /\/open-apis\/drive\/v1\/permissions\/doc_a\/members\?type=docx&need_notification=false$/);
    assert.equal(permRequest.method, "POST");
    assert.deepEqual(JSON.parse(permRequest.body), {
      member_type: "email",
      member_id: "a@example.com",
      perm: "edit",
    });

    const wikiCreate = await executeFeishuChannelAction(config, {
      tool: "feishu_wiki",
      action: "create",
      params: { space_id: "space_1", title: "New Page", obj_type: "docx" },
    }, null, { allowMutation: true });
    assert.equal(wikiCreate.ok, true);
    assert.deepEqual(wikiCreate.data, {
      node_token: "wikcn_node",
      obj_token: "docx_node",
      obj_type: "docx",
      title: "New Page",
      raw: { node_token: "wikcn_node", obj_token: "docx_node", obj_type: "docx", title: "New Page" },
    });

    const bitableMeta = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "get_meta",
      params: { url: "https://example.feishu.cn/wiki/wikibase?table=tbl_wiki", include_tables: true },
    }, null);
    assert.equal(bitableMeta.ok, true);
    assert.equal(bitableMeta.readOnly, true);
    assert.deepEqual(bitableMeta.data, {
      app_token: "base_from_wiki",
      table_id: "tbl_wiki",
      name: "Wiki Tracker",
      url_type: "wiki",
      tables: [{ table_id: "tbl_wiki", name: "Tasks" }],
      hint: 'Use app_token="base_from_wiki" and table_id="tbl_wiki" for other bitable actions.',
    });

    const bitableFields = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "list_fields",
      params: { app_token: "base_a", table_id: "tbl_a" },
    }, null);
    assert.equal(bitableFields.ok, true);
    assert.equal(bitableFields.readOnly, true);
    assert.equal(bitableFields.data.total, 2);
    assert.deepEqual(bitableFields.data.fields[0], {
      field_id: "fld_name",
      field_name: "Name",
      type: 1,
      type_name: "Text",
      is_primary: true,
    });

    const bitableRecords = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "list_records",
      params: { app_token: "base_a", table_id: "tbl_a", page_size: 20 },
    }, null);
    assert.equal(bitableRecords.ok, true);
    assert.equal(bitableRecords.readOnly, true);
    assert.equal(bitableRecords.data.records[0].record_id, "rec_1");

    const bitableRecord = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "get_record",
      params: { app_token: "base_a", table_id: "tbl_a", record_id: "rec_1" },
    }, null);
    assert.equal(bitableRecord.ok, true);
    assert.equal(bitableRecord.data.record.fields.Name, "Alpha");

    const bitableCreateWithoutApprovalRequestCount = requests.length;
    const bitableCreateWithoutApproval = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "create_record",
      params: { app_token: "base_a", table_id: "tbl_a", fields: { Name: "Beta" } },
    }, null);
    assert.equal(bitableCreateWithoutApproval.ok, false);
    assert.equal(bitableCreateWithoutApproval.readOnly, false);
    assert.match(bitableCreateWithoutApproval.error || "", /requires Studio IM approval/);
    assert.equal(requests.length, bitableCreateWithoutApprovalRequestCount);

    const bitableCreateRecord = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "create_record",
      params: { app_token: "base_a", table_id: "tbl_a", fields: { Name: "Beta", Status: "Open" } },
    }, null, { allowMutation: true });
    assert.equal(bitableCreateRecord.ok, true);
    assert.equal(bitableCreateRecord.data.record.record_id, "rec_2");
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      fields: { Name: "Beta", Status: "Open" },
    });

    const bitableUpdateRecord = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "update_record",
      params: { app_token: "base_a", table_id: "tbl_a", record_id: "rec_1", fields: { Status: "Done" } },
    }, null, { allowMutation: true });
    assert.equal(bitableUpdateRecord.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      fields: { Status: "Done" },
    });

    const bitableCreateApp = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "create_app",
      params: { name: "New Tracker", folder_token: "fldcn_1" },
    }, null, { allowMutation: true });
    assert.equal(bitableCreateApp.ok, true);
    assert.deepEqual(bitableCreateApp.data, {
      success: true,
      app_token: "base_new",
      table_id: "tbl_new",
      name: "New Tracker",
      url: "https://example.feishu.cn/base/base_new",
      cleaned_placeholder_rows: 1,
      cleaned_default_fields: 2,
      hint: 'Table created. Use app_token="base_new" and table_id="tbl_new" for other bitable actions.',
    });
    const bitableAppCreateRequest = requests.find((request) => request.method === "POST" && request.url.endsWith("/open-apis/bitable/v1/apps"));
    assert.deepEqual(JSON.parse(bitableAppCreateRequest.body), {
      name: "New Tracker",
      folder_token: "fldcn_1",
    });
    const bitableCleanupBatchDelete = requests.find((request) => request.method === "POST" && request.url.endsWith("/open-apis/bitable/v1/apps/base_new/tables/tbl_new/records/batch_delete"));
    assert.deepEqual(JSON.parse(bitableCleanupBatchDelete.body), { records: ["rec_empty"] });

    const bitableCreateField = await executeFeishuChannelAction(config, {
      tool: "feishu_bitable",
      action: "create_field",
      params: { app_token: "base_a", table_id: "tbl_a", field_name: "Score", field_type: 2 },
    }, null, { allowMutation: true });
    assert.equal(bitableCreateField.ok, true);
    assert.deepEqual(bitableCreateField.data.field, {
      field_id: "fld_score",
      field_name: "Score",
      type: 2,
      type_name: "Number",
      is_primary: null,
    });

    const appendWithoutApprovalRequestCount = requests.length;
    const appendWithoutApproval = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "append",
      params: { doc_token: "doc_a", content: "hello" },
    }, null);
    assert.equal(appendWithoutApproval.ok, false);
    assert.equal(appendWithoutApproval.readOnly, false);
    assert.match(appendWithoutApproval.error || "", /requires Studio IM approval/);
    assert.equal(requests.length, appendWithoutApprovalRequestCount);

    const append = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "append",
      params: { doc_token: "doc_a", content: "## Appended\n\nhello" },
    }, null, { allowMutation: true });
    assert.equal(append.ok, true);
    assert.equal(append.readOnly, false);
    assert.deepEqual(append.data, {
      success: true,
      blocks_added: 1,
      block_ids: ["new_block_1"],
    });
    const descendantRequest = requests.find((request) => request.url.endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/descendant"));
    assert.equal(descendantRequest.method, "POST");
    assert.deepEqual(JSON.parse(descendantRequest.body), {
      children_id: ["append_tmp"],
      descendants: [
        { block_id: "append_tmp", block_type: 2, text: { elements: [{ text_run: { content: "## Appended\n\nhello" } }] } },
      ],
      index: -1,
    });

    const updateBlock = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "update_block",
      params: { doc_token: "doc_a", block_id: "old_block_1", content: "Updated text" },
    }, null, { allowMutation: true });
    assert.equal(updateBlock.ok, true);
    assert.deepEqual(updateBlock.data, { success: true, block_id: "old_block_1" });
    const patchRequest = requests.find((request) => request.method === "PATCH" && request.url.endsWith("/open-apis/docx/v1/documents/doc_a/blocks/old_block_1"));
    assert.deepEqual(JSON.parse(patchRequest.body), {
      update_text_elements: { elements: [{ text_run: { content: "Updated text" } }] },
    });

    const deleteBlock = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "delete_block",
      params: { doc_token: "doc_a", block_id: "old_block_1" },
    }, null, { allowMutation: true });
    assert.equal(deleteBlock.ok, true);
    assert.deepEqual(deleteBlock.data, { success: true, deleted_block_id: "old_block_1" });
    const deleteRequest = requests.find((request) => request.method === "DELETE" && request.url.endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/children/batch_delete"));
    assert.deepEqual(JSON.parse(deleteRequest.body), { start_index: 0, end_index: 1 });

    const createTable = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "create_table",
      params: { doc_token: "doc_a", row_size: 2, column_size: 2, column_width: [120, 160] },
    }, null, { allowMutation: true });
    assert.equal(createTable.ok, true);
    assert.deepEqual(createTable.data, {
      success: true,
      table_block_id: "table_1",
      row_size: 2,
      column_size: 2,
      table_cell_block_ids: ["cell_1", "cell_2", "cell_3", "cell_4"],
      raw_children_count: 1,
    });
    const createTableRequest = requests.find((request) => request.method === "POST" && request.url.endsWith("/open-apis/docx/v1/documents/doc_a/blocks/doc_a/children"));
    assert.deepEqual(JSON.parse(createTableRequest.body), {
      children: [
        {
          block_type: 31,
          table: { property: { row_size: 2, column_size: 2, column_width: [120, 160] } },
        },
      ],
    });

    const writeCells = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "write_table_cells",
      params: { doc_token: "doc_a", table_block_id: "table_1", values: [["A1", "B1"]] },
    }, null, { allowMutation: true });
    assert.equal(writeCells.ok, true);
    assert.deepEqual(writeCells.data, {
      success: true,
      table_block_id: "table_1",
      cells_written: 2,
      table_size: { rows: 2, cols: 2 },
    });
    const cellDescendantRequests = requests.filter((request) => request.method === "POST" && /\/blocks\/cell_[12]\/descendant$/.test(request.url));
    assert.equal(cellDescendantRequests.length, 2);
    assert.equal(JSON.parse(cellDescendantRequests[0].body).children_id[0], "append_tmp");

    const tableRow = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "insert_table_row",
      params: { doc_token: "doc_a", table_block_id: "table_1", row_index: 1 },
    }, null, { allowMutation: true });
    assert.equal(tableRow.ok, true);
    const tableRowRequest = requests.at(-1);
    assert.deepEqual(JSON.parse(tableRowRequest.body), { insert_table_row: { row_index: 1 } });

    const tableColumn = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "insert_table_column",
      params: { doc_token: "doc_a", table_block_id: "table_1", column_index: 2 },
    }, null, { allowMutation: true });
    assert.equal(tableColumn.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), { insert_table_column: { column_index: 2 } });

    const deleteRows = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "delete_table_rows",
      params: { doc_token: "doc_a", table_block_id: "table_1", row_start: 1, row_count: 2 },
    }, null, { allowMutation: true });
    assert.equal(deleteRows.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      delete_table_rows: { row_start_index: 1, row_end_index: 3 },
    });

    const deleteColumns = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "delete_table_columns",
      params: { doc_token: "doc_a", table_block_id: "table_1", column_start: 0, column_count: 1 },
    }, null, { allowMutation: true });
    assert.equal(deleteColumns.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      delete_table_columns: { column_start_index: 0, column_end_index: 1 },
    });

    const mergeCells = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "merge_table_cells",
      params: { doc_token: "doc_a", table_block_id: "table_1", row_start: 0, row_end: 1, column_start: 0, column_end: 2 },
    }, null, { allowMutation: true });
    assert.equal(mergeCells.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      merge_table_cells: {
        row_start_index: 0,
        row_end_index: 1,
        column_start_index: 0,
        column_end_index: 2,
      },
    });

    const coloredText = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "color_text",
      params: { doc_token: "doc_a", block_id: "color_block_1", content: "Status [green bold]OK[/green]" },
    }, null, { allowMutation: true });
    assert.equal(coloredText.ok, true);
    assert.equal(coloredText.data.segments, 2);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      update_text_elements: {
        elements: [
          { text_run: { content: "Status ", text_element_style: {} } },
          { text_run: { content: "OK", text_element_style: { text_color: 4, bold: true } } },
        ],
      },
    });

    const comments = await executeFeishuChannelAction(config, {
      tool: "feishu_drive",
      action: "list_comments",
      params: { file_token: "doc_a", file_type: "docx", page_size: 20 },
    }, null);
    assert.equal(comments.ok, true);
    assert.equal(comments.readOnly, true);
    assert.equal(comments.data.comments[0].comment_id, "comment_1");

    const replies = await executeFeishuChannelAction(config, {
      tool: "feishu_drive",
      action: "list_comment_replies",
      params: { file_token: "doc_a", file_type: "docx", comment_id: "comment_1" },
    }, null);
    assert.equal(replies.ok, true);
    assert.equal(replies.readOnly, true);
    assert.equal(replies.data.replies[0].reply_id, "reply_1");

    const addComment = await executeFeishuChannelAction(config, {
      tool: "feishu_drive",
      action: "add_comment",
      params: { file_token: "doc_a", file_type: "docx", content: "Comment", block_id: "block_1" },
    }, null, { allowMutation: true });
    assert.equal(addComment.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      file_type: "docx",
      reply_elements: [{ type: "text", text: "Comment" }],
      anchor: { block_id: "block_1" },
    });

    const replyComment = await executeFeishuChannelAction(config, {
      tool: "feishu_drive",
      action: "reply_comment",
      params: { file_token: "doc_a", file_type: "docx", comment_id: "comment_1", content: "Reply" },
    }, null, { allowMutation: true });
    assert.equal(replyComment.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      content: {
        elements: [
          {
            type: "text_run",
            text_run: { text: "Reply" },
          },
        ],
      },
    });

    const uploadedImage = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "upload_image",
      params: {
        doc_token: "doc_a",
        image: `data:image/png;base64,${Buffer.from("png").toString("base64")}`,
        filename: "image.png",
      },
    }, null, { allowMutation: true });
    assert.equal(uploadedImage.ok, true);
    assert.deepEqual(uploadedImage.data, {
      success: true,
      block_id: "image_block_1",
      file_token: "img_token_1",
      file_name: "image.png",
      mime_type: "image/png",
      size: 3,
    });
    const imageUploadRequest = requests.find((request) => request.form?.parent_type === "docx_image");
    assert.equal(imageUploadRequest.form.parent_node, "image_block_1");
    assert.equal(imageUploadRequest.form.file_name, "image.png");
    assert.equal(JSON.parse(imageUploadRequest.form.extra).drive_route_token, "doc_a");
    const imagePatchRequest = requests.find((request) => request.method === "PATCH" && request.url.endsWith("/open-apis/docx/v1/documents/doc_a/blocks/image_block_1"));
    assert.deepEqual(JSON.parse(imagePatchRequest.body), { replace_image: { token: "img_token_1" } });

    const uploadedFile = await executeFeishuChannelAction(config, {
      tool: "feishu_doc",
      action: "upload_file",
      params: {
        doc_token: "doc_a",
        data: Buffer.from("hello").toString("base64"),
        filename: "hello.txt",
        mime_type: "text/plain",
      },
    }, null, { allowMutation: true });
    assert.equal(uploadedFile.ok, true);
    assert.deepEqual(uploadedFile.data, {
      success: true,
      file_token: "file_token_1",
      file_name: "hello.txt",
      mime_type: "text/plain",
      size: 5,
      note: "File uploaded to the Feishu docx media store. Feishu does not support direct file block creation through this action; use the returned file_token if a later workflow needs to reference it.",
    });
    const fileUploadRequest = requests.find((request) => request.form?.parent_type === "docx_file");
    assert.equal(fileUploadRequest.form.parent_node, "doc_a");
    assert.equal(fileUploadRequest.form.file_name, "hello.txt");
    assert.equal(fileUploadRequest.form.size, "5");

    const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "studio-feishu-doc-upload-"));
    const localImagePath = path.join(uploadDir, "local-image.png");
    try {
      fs.writeFileSync(localImagePath, "local png");
      const uploadedLocalImage = await executeFeishuChannelAction(config, {
        tool: "feishu_doc",
        action: "upload_image",
        params: {
          doc_token: "doc_a",
          image: localImagePath,
        },
      }, null, { allowMutation: true });
      assert.equal(uploadedLocalImage.ok, true);
      const localImageUploadRequest = requests.find((request) => request.form?.file_name === "local-image.png");
      assert.equal(localImageUploadRequest.form.parent_type, "docx_image");
      assert.equal(localImageUploadRequest.form.file.name, "local-image.png");
      assert.equal(localImageUploadRequest.form.file.size, 9);
    } finally {
      fs.rmSync(uploadDir, { recursive: true, force: true });
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("native Channel Connectors executes Feishu channel actions through Studio runtime", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init = {}) => {
    requests.push({
      url: String(url),
      method: init.method || "GET",
      body: typeof init.body === "string" ? init.body : "",
      authorization: init.headers?.authorization || init.headers?.Authorization || "",
    });
    const asJson = (body, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    });
    const urlText = String(url);
    const method = init.method || "GET";
    if (urlText.endsWith("/open-apis/auth/v3/tenant_access_token/internal")) {
      return asJson({ code: 0, tenant_access_token: "tenant-token", expire: 3600 });
    }
    if (urlText.endsWith("/open-apis/im/v1/chats/oc_1")) {
      return asJson({ code: 0, data: { chat_id: "oc_1", name: "Studio Group", chat_mode: "group" } });
    }
    if (urlText.endsWith("/open-apis/im/v1/chats/oc_1/members?member_id_type=open_id&page_size=20")) {
      return asJson({ code: 0, data: { has_more: false, items: [{ member_id: "ou_1", name: "Alice" }] } });
    }
    if (urlText.endsWith("/open-apis/contact/v3/users/ou_1?user_id_type=open_id&department_id_type=open_department_id")) {
      return asJson({ code: 0, data: { user: { open_id: "ou_1", name: "Alice", email: "a@example.com" } } });
    }
    if (urlText.endsWith("/open-apis/im/v1/chats?page_size=5")) {
      return asJson({ code: 0, data: { items: [{ chat_id: "oc_1", name: "Studio Group" }] } });
    }
    if (urlText.endsWith("/open-apis/contact/v3/users?page_size=5&user_id_type=open_id")) {
      return asJson({ code: 0, data: { items: [{ open_id: "ou_1", name: "Alice" }] } });
    }
    if (urlText.endsWith("/open-apis/im/v1/messages/om_1/reactions?reaction_type=THUMBSUP")) {
      return asJson({
        code: 0,
        data: {
          items: [
            { reaction_id: "reaction_1", reaction_type: { emoji_type: "THUMBSUP" }, operator_type: "app", operator_id: { open_id: "ou_bot" } },
          ],
        },
      });
    }
    if (urlText.endsWith("/open-apis/im/v1/messages/om_clear/reactions")) {
      return asJson({
        code: 0,
        data: {
          items: [
            { reaction_id: "reaction_app_a", reaction_type: { emoji_type: "THUMBSUP" }, operator_type: "app", operator_id: { open_id: "ou_bot" } },
            { reaction_id: "reaction_user_a", reaction_type: { emoji_type: "SMILE" }, operator_type: "user", operator_id: { open_id: "ou_1" } },
          ],
        },
      });
    }
    if (urlText.endsWith("/open-apis/im/v1/messages/om_1")) {
      return asJson({
        code: 0,
        data: {
          message_id: "om_1",
          sender: { id: "ou_1", id_type: "open_id" },
          body: { content: JSON.stringify({ text: "hello" }) },
          msg_type: "text",
        },
      });
    }
    if (method === "POST" && urlText.endsWith("/open-apis/im/v1/messages?receive_id_type=chat_id")) {
      return asJson({ code: 0, data: { message_id: "om_sent", chat_id: "oc_1" } });
    }
    if (method === "POST" && urlText.endsWith("/open-apis/im/v1/messages/om_parent/reply")) {
      return asJson({ code: 0, data: { message_id: "om_reply", chat_id: "oc_1" } });
    }
    if (method === "PUT" && urlText.endsWith("/open-apis/im/v1/messages/om_sent")) {
      return asJson({ code: 0, data: { message_id: "om_sent" } });
    }
    if (method === "POST" && urlText.endsWith("/open-apis/im/v1/pins")) {
      return asJson({ code: 0, data: { pin: { message_id: "om_sent", chat_id: "oc_1" } } });
    }
    if (method === "GET" && urlText.endsWith("/open-apis/im/v1/pins?chat_id=oc_1")) {
      return asJson({ code: 0, data: { items: [{ message_id: "om_pinned", chat_id: "oc_1" }], has_more: false } });
    }
    if (method === "DELETE" && urlText.endsWith("/open-apis/im/v1/pins/om_sent")) {
      return asJson({ code: 0, data: {} });
    }
    if (method === "POST" && urlText.endsWith("/open-apis/im/v1/messages/om_sent/reactions")) {
      return asJson({ code: 0, data: { reaction_id: "reaction_new" } });
    }
    if (method === "DELETE" && (
      urlText.endsWith("/open-apis/im/v1/messages/om_1/reactions/reaction_1")
      || urlText.endsWith("/open-apis/im/v1/messages/om_clear/reactions/reaction_app_a")
    )) {
      return asJson({ code: 0, data: {} });
    }
    return asJson({ code: 404, msg: "not mocked" }, 404);
  };

  try {
    const config = {
      apiUrl: "https://open.feishu.cn",
      appId: "cli_test",
      appSecret: "secret",
    };

    const read = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "read",
      params: { message_id: "om_1" },
    }, null);
    assert.equal(read.ok, true);
    assert.equal(read.readOnly, true);
    assert.equal(read.data.message.messageId, "om_1");

    const channelInfo = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "channel-info",
      params: { chat_id: "oc_1", include_members: true, page_size: 20 },
    }, null);
    assert.equal(channelInfo.ok, true);
    assert.equal(channelInfo.data.channel.name, "Studio Group");
    assert.equal(channelInfo.data.members[0].member_id, "ou_1");

    const memberInfo = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "member-info",
      params: { open_id: "ou_1" },
    }, null);
    assert.equal(memberInfo.ok, true);
    assert.equal(memberInfo.data.member.name, "Alice");

    const channelList = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "channel-list",
      params: { limit: 5, scope: "all", query: "studio" },
    }, null);
    assert.equal(channelList.ok, true);
    assert.equal(channelList.data.groups[0].chat_id, "oc_1");
    assert.deepEqual(channelList.data.peers, []);

    const reactions = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "reactions",
      params: { message_id: "om_1", emoji: "THUMBSUP" },
    }, null);
    assert.equal(reactions.ok, true);
    assert.equal(reactions.data.reactions[0].reaction_id, "reaction_1");

    const listPins = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "list-pins",
      params: { chat_id: "oc_1" },
    }, null);
    assert.equal(listPins.ok, true);
    assert.equal(listPins.readOnly, true);
    assert.equal(listPins.data.pins[0].message_id, "om_pinned");

    const requestCountBeforeSend = requests.length;
    const sendWithoutApproval = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "send",
      params: { to: "chat:oc_1", text: "blocked" },
    }, null);
    assert.equal(sendWithoutApproval.ok, false);
    assert.match(sendWithoutApproval.error || "", /requires Studio IM approval/);
    assert.equal(requests.length, requestCountBeforeSend);

    const send = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "send",
      params: { to: "chat:oc_1", format: "markdown", text: "**ok**" },
    }, null, { allowMutation: true });
    assert.equal(send.ok, true);
    assert.equal(send.data.message_id, "om_sent");
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      receive_id: "oc_1",
      msg_type: "post",
      content: JSON.stringify({ zh_cn: { content: [[{ tag: "md", text: "**ok**" }]] } }),
    });

    const threadReply = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "thread_reply",
      params: { message_id: "om_parent", text: "reply" },
    }, null, { allowMutation: true });
    assert.equal(threadReply.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      msg_type: "text",
      content: JSON.stringify({ text: "reply" }),
      reply_in_thread: true,
    });

    const edit = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "edit",
      params: { message_id: "om_sent", text: "edited" },
    }, null, { allowMutation: true });
    assert.equal(edit.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), {
      msg_type: "text",
      content: JSON.stringify({ text: "edited" }),
    });

    const pin = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "pin",
      params: { message_id: "om_sent" },
    }, null, { allowMutation: true });
    assert.equal(pin.ok, true);
    assert.deepEqual(JSON.parse(requests.at(-1).body), { message_id: "om_sent" });

    const unpin = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "unpin",
      params: { message_id: "om_sent" },
    }, null, { allowMutation: true });
    assert.equal(unpin.ok, true);

    const react = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "react",
      params: { message_id: "om_sent", emoji: "THUMBSUP" },
    }, null, { allowMutation: true });
    assert.equal(react.ok, true);
    assert.equal(react.data.reaction_id, "reaction_new");

    const reactRemove = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "react",
      params: { message_id: "om_1", emoji: "THUMBSUP", remove: true },
    }, null, { allowMutation: true });
    assert.equal(reactRemove.ok, true);
    assert.deepEqual(reactRemove.data.removed, ["reaction_1"]);

    const reactClearAll = await executeFeishuChannelAction(config, {
      tool: "feishu_channel",
      action: "react",
      params: { message_id: "om_clear", clearAll: true },
    }, null, { allowMutation: true });
    assert.equal(reactClearAll.ok, true);
    assert.deepEqual(reactClearAll.data.removed, ["reaction_app_a"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
  assert.deepEqual(initial.supportedAgents, ["codex", "claude-code", "opencode"]);
  assert.ok(initial.permissionModes.includes("full-auto"));
  assert.throws(() => service.saveNativeConfig({
    config: {
      ...initial.config,
      agentProfiles: [
        {
          ...initial.config.agentProfiles[0],
          id: "gemini-main",
          name: "Gemini main",
          agent: "gemini",
        },
      ],
    },
  }), /Unsupported agent id for profile gemini-main/);

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
  assert.equal(mediaUrlMessage.incoming.content, "[image: inbound-image.png]");
  assert.equal(mediaUrlMessage.incoming.attachments.length, 1);
  assert.equal(mediaUrlMessage.incoming.attachments[0].kind, "image");
  assert.equal(mediaUrlMessage.incoming.attachments[0].url, "https://cdn.example.test/inbound-image.png");
  assert.equal(mediaUrlMessage.incoming.attachments[0].fileName, "inbound-image.png");
  assert.equal(extractOctoContent({
    messageId: "m-image-with-caption",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: {
      type: 2,
      name: "captioned.png",
      content: "请识别这张图里的色块位置",
      mediaUrl: "https://cdn.example.test/captioned.png",
    },
  }), "请识别这张图里的色块位置");
  assert.equal(extractOctoContent({
    messageId: "m-video-with-caption",
    fromUid: "user-1",
    channelId: "user-1",
    channelType: 1,
    payload: {
      type: 5,
      name: "clip.mp4",
      content: "请看这个视频是什么颜色",
      mediaUrl: "https://cdn.example.test/clip.mp4",
    },
  }), "请看这个视频是什么颜色");

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
        {
          id: "octo-persona",
          platform: "octo",
          accountId: "octo-account",
          botId: "persona-bot",
          displayName: "Octo Persona Bot",
          agentProfileId: "claude-main",
          enabled: true,
          allowlist: [],
          adminUsers: [],
          metadata: {
            onBehalfOf: "grantor-1",
          },
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

  const personaBroadcast = await service.dispatchOctoIncoming({
    bindingId: "octo-persona",
    dryRun: true,
    replyText: "收到",
    message: {
      messageId: "g-persona-broadcast",
      fromUid: "user-2",
      channelId: "group-a",
      channelType: 2,
      payload: {
        type: 1,
        content: "@所有人 status",
        mention: { all: 1, ais: 1, humans: 1 },
      },
      members: [
        { uid: "grantor-1", name: "Grantor" },
        { uid: "persona-bot", name: "PersonaBot", robot: 1 },
      ],
    },
  });
  assert.equal(personaBroadcast.accepted, true);
  assert.equal(personaBroadcast.incoming.directed, true);
  assert.equal(personaBroadcast.replyPlan.channelId, "group-a");
  assert.equal(personaBroadcast.replyPlan.channelType, 2);
  assert.equal(personaBroadcast.replyPlan.onBehalfOf, "grantor-1");

  const personaObo = await service.dispatchOctoIncoming({
    bindingId: "octo-persona",
    dryRun: true,
    replyText: "代答完成",
    message: {
      messageId: "g-persona-obo",
      fromUid: "grantor-1",
      channelId: "grantor-1",
      channelType: 1,
      payload: {
        type: 1,
        content: "relay",
        mention: { humans: 1 },
        obo_origin_channel_id: "group-a",
        obo_origin_channel_type: 2,
        obo_origin_from_uid: "user-2",
        obo_respond_as: "forged-grantor",
        obo_system_hint: "trusted persona hint",
      },
    },
  });
  assert.equal(personaObo.accepted, true);
  assert.equal(personaObo.sessionKey, "dmwork:dm:grantor-1");
  assert.equal(personaObo.replyPlan.channelId, "group-a");
  assert.equal(personaObo.replyPlan.channelType, 2);
  assert.equal(personaObo.replyPlan.onBehalfOf, "grantor-1");

  const personaBinding = service.getNativeConfig().config.platformBindings.find((binding) => binding.id === "octo-persona");
  const personaProject = service.getNativeConfig().config.agentProfiles.find((profile) => profile.id === "claude-main");
  const personaProcess = buildChannelConnectorAgentProcessRequest({
    project: personaProject,
    binding: personaBinding,
    message: {
      messageId: "g-persona-process",
      fromUid: "grantor-1",
      channelId: "grantor-1",
      channelType: 1,
      payload: {
        type: 1,
        content: "relay",
      },
      personaSystemPrompt: "trusted persona hint",
    },
    sessionKey: "dmwork:dm:grantor-1",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayClientKey: "sk-test",
  });
  assert.ok(personaProcess);
  assert.match(personaProcess.stdin, /trusted persona hint/);

  const personaOboAiOnly = await service.dispatchOctoIncoming({
    bindingId: "octo-persona",
    dryRun: true,
    message: {
      messageId: "g-persona-obo-ai-only",
      fromUid: "grantor-1",
      channelId: "grantor-1",
      channelType: 1,
      payload: {
        type: 1,
        content: "relay to AI only",
        mention: { ais: 1 },
        obo_origin_channel_id: "group-a",
        obo_origin_channel_type: 2,
        obo_respond_as: "grantor-1",
      },
    },
  });
  assert.equal(personaOboAiOnly.accepted, false);
  assert.equal(personaOboAiOnly.skippedReason, "octo_obo_message_not_relevant");

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
  assert.deepEqual(directed.replyPlan.chunks, ["@Alice 已处理"]);
  assert.deepEqual(directed.replyPlan.payloads[0].payload.mention.uids, ["user-3"]);
  assert.deepEqual(directed.replyPlan.payloads[0].payload.mention.entities, [
    { uid: "user-3", offset: 0, length: "@Alice".length },
  ]);

  const structuredMention = await service.dispatchOctoIncoming({
    bindingId: "octo-group",
    dryRun: true,
    replyText: "@[user-3:Alice] 已处理",
    message: {
      messageId: "g-structured",
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
        { uid: "robot-1", name: "OctoBot", robot: 1 },
      ],
    },
  });
  assert.deepEqual(structuredMention.replyPlan.mentionUids, ["user-3"]);
  assert.deepEqual(structuredMention.replyPlan.chunks, ["@Alice 已处理"]);
  assert.deepEqual(structuredMention.replyPlan.payloads[0].payload.mention.entities, [
    { uid: "user-3", offset: 0, length: "@Alice".length },
  ]);
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

test("Octo transport carries on_behalf_of for typing and media", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const typing = await sendOctoTyping({
      apiUrl,
      botToken: "octo-token",
    }, "group-1", 2, "grantor-1");
    const media = await sendOctoMediaMessage({
      apiUrl,
      botToken: "octo-token",
    }, {
      channelId: "group-1",
      channelType: 2,
      mediaUrl: "https://cdn.example.test/image.png",
      fileName: "image.png",
      mimeType: "image/png",
      onBehalfOf: "grantor-1",
    });

    assert.equal(typing.ok, true);
    assert.equal(media.ok, true);
    const typingRequest = requests.find((item) => item.path === "/v1/bot/typing");
    const mediaRequest = requests.find((item) => item.path === "/v1/bot/sendMessage");
    assert.ok(typingRequest);
    assert.ok(mediaRequest);
    assert.equal(typingRequest.body.on_behalf_of, "grantor-1");
    assert.equal(mediaRequest.body.on_behalf_of, "grantor-1");
    assert.equal(mediaRequest.body.payload.type, 2);
  });
});

test("Octo transport keeps group mentions visible when payload only carries mention metadata", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const result = await sendOctoTextReply({
      apiUrl,
      botToken: "octo-token",
    }, {
      chunks: ["请介绍一下能力"],
      mentionUids: ["27xIxHrNV0Qc3ee2129_bot"],
      mentionEntities: [],
      payloads: [
        {
          channel_id: "group-1",
          channel_type: 2,
          payload: {
            content: "请介绍一下能力",
            mention: {
              uids: ["27xIxHrNV0Qc3ee2129_bot"],
            },
          },
        },
      ],
    });

    assert.equal(result.ok, true);
    assert.equal(result.action, "send-message");
    const request = requests.find((item) => item.path === "/v1/bot/sendMessage");
    assert.ok(request);
    assert.equal(request.method, "POST");
    assert.equal(request.authorization, "Bearer octo-token");
    assert.equal(request.body.channel_id, "group-1");
    assert.equal(request.body.channel_type, 2);
    assert.equal(typeof request.body.client_msg_no, "string");
    assert.ok(request.body.client_msg_no);
    assert.equal(request.body.payload.content, "@27xIxHrNV0Qc3ee2129_bot 请介绍一下能力");
    assert.deepEqual(request.body.payload.mention.uids, ["27xIxHrNV0Qc3ee2129_bot"]);
    assert.deepEqual(request.body.payload.mention.entities, [
      { uid: "27xIxHrNV0Qc3ee2129_bot", offset: 0, length: "@27xIxHrNV0Qc3ee2129_bot".length },
    ]);
  });
});

test("Octo transport carries on_behalf_of for persona outbound messages", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const replyPlan = renderOctoOutboundText({
      channelId: "group-1",
      channelType: 2,
      content: "@[grantor-1:Alice] 我来代为回复。",
      members: [
        { uid: "grantor-1", name: "Alice", robot: 0 },
      ],
      onBehalfOf: "grantor-1",
    });
    assert.ok(replyPlan);
    assert.equal(replyPlan.onBehalfOf, "grantor-1");

    const result = await sendOctoTextReply({
      apiUrl,
      botToken: "octo-token",
    }, replyPlan);

    assert.equal(result.ok, true);
    const request = requests.find((item) => item.path === "/v1/bot/sendMessage");
    assert.ok(request);
    assert.equal(request.body.on_behalf_of, "grantor-1");
    assert.equal(request.body.payload.content, "@Alice 我来代为回复。");
    assert.deepEqual(request.body.payload.mention.uids, ["grantor-1"]);
    assert.deepEqual(request.body.payload.mention.entities, [
      { uid: "grantor-1", offset: 0, length: "@Alice".length },
    ]);
  });
});

test("Octo transport times out slow text replies for best-effort progress sends", async () => {
  await withMockOctoServer(async (apiUrl, requests) => {
    const startedAt = performance.now();
    const result = await sendOctoTextReply({
      apiUrl,
      botToken: "octo-token",
    }, {
      chunks: ["过程回复"],
      mentionUids: [],
      mentionEntities: [],
      payloads: [
        {
          channel_id: "group-1",
          channel_type: 2,
          payload: {
            type: 1,
            content: "过程回复",
          },
        },
      ],
    }, {
      timeoutMs: 50,
    });

    assert.equal(result.ok, false);
    assert.equal(result.action, "send-message");
    assert.equal(result.requestCount, 1);
    assert.ok(performance.now() - startedAt < 1000);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, "/v1/bot/sendMessage");
    assert.equal(typeof requests[0].body.client_msg_no, "string");
  }, { sendMessageDelayMs: 300 });
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

    const groupMd = await smoke({ action: "group-md-read", groupNo: "group-1" });
    assert.equal(groupMd.transport.action, "group-md-read");
    assert.match(groupMd.transport.data.content, /Group Rules/);

    const updatedGroupMd = await smoke({ action: "group-md-update", groupNo: "group-1", content: "# Updated Group" });
    assert.equal(updatedGroupMd.transport.ok, true);
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/groups/group-1/md"
      && request.method === "PUT"
      && request.body.content === "# Updated Group"
    ));

    const space = await smoke({ action: "space-members", keyword: "Alice", limit: 1 });
    assert.equal(space.transport.itemCount, 1);
    assert.ok(requests.some((request) => request.path === "/v1/bot/space/members?keyword=Alice&limit=1"));

    const runtimeSearch = await smoke({ action: "search-members", keyword: "Bob", limit: 2 });
    assert.equal(runtimeSearch.transport.action, "space-members");
    assert.ok(requests.some((request) => request.path === "/v1/bot/space/members?keyword=Bob&limit=2"));

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

    const runtimeAdded = await smoke({ action: "add-members", groupNo: "group-1", members: ["user-4"] });
    assert.equal(runtimeAdded.transport.action, "add-group-members");
    assert.equal(runtimeAdded.transport.data.added, 1);

    const removed = await smoke({ action: "remove-group-members", groupNo: "group-1", members: ["user-2"] });
    assert.equal(removed.transport.data.removed, 1);

    const runtimeRemoved = await smoke({ action: "remove-members", groupNo: "group-1", members: ["user-4"] });
    assert.equal(runtimeRemoved.transport.action, "remove-group-members");
    assert.equal(runtimeRemoved.transport.data.removed, 1);

    const threads = await smoke({ action: "list-threads", groupNo: "group-1" });
    assert.equal(threads.transport.itemCount, 1);
    assert.equal(threads.transport.data[0].short_id, "thread-1");

    const threadInfo = await smoke({ action: "thread-info", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(threadInfo.transport.data.name, "Thread One");

    const pluginThreadInfo = await smoke({ action: "get-thread", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(pluginThreadInfo.transport.action, "thread-info");
    assert.equal(pluginThreadInfo.transport.data.name, "Thread One");

    const threadMembers = await smoke({ action: "thread-members", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(threadMembers.transport.data[0].uid, "user-1");

    const pluginThreadMembers = await smoke({ action: "list-thread-members", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(pluginThreadMembers.transport.action, "thread-members");
    assert.equal(pluginThreadMembers.transport.data[0].uid, "user-1");

    const threadMd = await smoke({ action: "thread-md-read", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(threadMd.transport.action, "thread-md-read");
    assert.match(threadMd.transport.data.content, /Thread Rules/);

    const updatedThreadMd = await smoke({ action: "thread-md-update", groupNo: "group-1", shortId: "thread-1", content: "# Updated Thread" });
    assert.equal(updatedThreadMd.transport.ok, true);
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/groups/group-1/threads/thread-1/md"
      && request.method === "PUT"
      && request.body.content === "# Updated Thread"
    ));

    const voiceContext = await smoke({ action: "voice-context-read" });
    assert.equal(voiceContext.transport.action, "voice-context-read");
    assert.match(voiceContext.transport.data.context, /Alice/);

    const updatedVoiceContext = await smoke({ action: "voice-context-update", content: "Bob => 包博" });
    assert.equal(updatedVoiceContext.transport.ok, true);
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/voice/context"
      && request.method === "PUT"
      && request.body.context === "Bob => 包博"
    ));

    const deletedVoiceContext = await smoke({ action: "voice-context-delete" });
    assert.equal(deletedVoiceContext.transport.ok, true);
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/voice/context"
      && request.method === "DELETE"
    ));

    const createdThread = await smoke({ action: "create-thread", groupNo: "group-1", name: "New Thread" });
    assert.equal(createdThread.transport.data.short_id, "thread-new");

    const deletedThread = await smoke({ action: "delete-thread", groupNo: "group-1", shortId: "thread-1" });
    assert.equal(deletedThread.transport.ok, true);
    assert.equal(deletedThread.transport.data.deleted, true);

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

    const runtimeHistory = await smoke({ action: "history", channelId: "group-1", channelType: 2, limit: 10 });
    assert.equal(runtimeHistory.transport.action, "sync-messages");
    assert.equal(runtimeHistory.transport.itemCount, 1);

    const download = await smoke({ action: "file-download-url", filePath: "chat/hello.txt", fileName: "hello.txt" });
    assert.equal(download.transport.mediaUrl, "https://cdn.example.test/chat/hello.txt");
    assert.equal(download.transport.data.location, "https://cdn.example.test/chat/hello.txt");

    const editedMessage = await smoke({ action: "message-edit", messageId: "msg-1", content: "updated text" });
    assert.equal(editedMessage.transport.ok, true);
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/message/edit"
      && request.method === "POST"
      && request.body.message_id === "msg-1"
      && request.body.payload.type === 1
      && request.body.payload.content === "updated text"
    ));
  });
});

test("Octo native management commands expose groups, members, and Space search", async () => {
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
            allowlist: ["user-1", "user-2"],
            adminUsers: ["user-1"],
            metadata: {
              apiUrl,
              botToken: "test-token",
            },
          },
        ],
      },
    });

    const groups = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-groups",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo groups" },
      },
    });
    assert.equal(groups.accepted, true);
    assert.equal(groups.commandAction.commandResult.action, "list");
    assert.match(groups.replyPlan.chunks.join("\n"), /Octo 群列表（2）/);
    assert.match(groups.replyPlan.chunks.join("\n"), /Studio Group · group-1/);

    const members = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-members",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: {
          type: 1,
          content: "/octo members",
          mention: { uids: ["robot-1"] },
        },
      },
    });
    assert.equal(members.accepted, true);
    assert.equal(members.commandAction.commandResult.action, "show");
    assert.match(members.replyPlan.chunks.join("\n"), /Octo 群成员：group-1（2）/);
    assert.match(members.replyPlan.chunks.join("\n"), /Alice · user-1 · human/);
    assert.match(members.replyPlan.chunks.join("\n"), /Studio Bot · robot-1 · bot/);

    const search = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-search",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo search Alice" },
      },
    });
    assert.equal(search.accepted, true);
    assert.equal(search.commandAction.commandResult.action, "list");
    assert.match(search.replyPlan.chunks.join("\n"), /Octo Space 成员搜索：Alice（1）/);
    assert.match(search.replyPlan.chunks.join("\n"), /私聊 human target：`dm:<uid>`/);
    assert.match(search.replyPlan.chunks.join("\n"), /@\[uid:显示名\]/);
    assert.ok(requests.some((request) => request.path === "/v1/bot/groups"));
    assert.ok(requests.some((request) => request.path === "/v1/bot/groups/group-1/members"));
    assert.ok(requests.some((request) => request.path === "/v1/bot/space/members?keyword=Alice&limit=30"));

    const groupInfo = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-group-info",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo info", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(groupInfo.commandAction.commandResult.action, "show");
    assert.match(groupInfo.replyPlan.chunks.join("\n"), /Octo 群信息：group-1/);
    assert.match(groupInfo.replyPlan.chunks.join("\n"), /公告：Ship/);

    const threads = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-threads",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo threads", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(threads.commandAction.commandResult.action, "list");
    assert.match(threads.replyPlan.chunks.join("\n"), /Octo Thread 列表：group-1（1）/);
    assert.match(threads.replyPlan.chunks.join("\n"), /Thread One · thread-1/);

    const threadInfo = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-thread-info",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo thread thread-1", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(threadInfo.commandAction.commandResult.action, "show");
    assert.match(threadInfo.replyPlan.chunks.join("\n"), /Octo Thread：thread-1/);

    const history = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-history",
        messageSeq: 9,
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo history 5", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(history.commandAction.commandResult.action, "show");
    assert.match(history.replyPlan.chunks.join("\n"), /Octo 聊天记录：group-1/);
    assert.match(history.replyPlan.chunks.join("\n"), /history hello/);
    assert.match(history.replyPlan.chunks.join("\n"), /rich helper reply/);
    assert.match(history.replyPlan.chunks.join("\n"), /\[图片\]/);
    assert.match(history.replyPlan.chunks.join("\n"), /markdown helper reply/);
    assert.match(history.replyPlan.chunks.join("\n"), /\[file: handoff\.pdf\]/);
    const historyRequests = requests.filter((request) => request.path === "/v1/bot/messages/sync");
    assert.ok(historyRequests.some((request) =>
      request.path === "/v1/bot/messages/sync"
      && request.body.channel_id === "group-1"
      && request.body.channel_type === 2
      && request.body.limit === 5
      && request.body.end_message_seq === 8
    ), JSON.stringify(historyRequests.map((request) => request.body)));

    const groupMd = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-group-md",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo group-md", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(groupMd.commandAction.commandResult.action, "show");
    assert.match(groupMd.replyPlan.chunks.join("\n"), /Octo GROUP\.md：group-1 · v2/);
    assert.match(groupMd.replyPlan.chunks.join("\n"), /Ask bots by group\/thread mention/);

    const setGroupMd = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-set-group-md",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo set-group-md # New Group Rule", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(setGroupMd.commandAction.commandResult.action, "set");
    assert.equal(setGroupMd.commandAction.commandResult.ok, true);
    assert.match(setGroupMd.replyPlan.chunks.join("\n"), /已更新 Octo GROUP\.md/);

    const threadMd = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-thread-md",
        fromUid: "user-1",
        channelId: "group-1____thread-1",
        channelType: 5,
        payload: { type: 1, content: "/octo thread-md", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(threadMd.commandAction.commandResult.action, "show");
    assert.match(threadMd.replyPlan.chunks.join("\n"), /Octo THREAD\.md：thread-1 · v4/);
    assert.match(threadMd.replyPlan.chunks.join("\n"), /Focus on release notes/);

    const voiceContext = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-voice-context",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo voice-context" },
      },
    });
    assert.equal(voiceContext.commandAction.commandResult.action, "show");
    assert.match(voiceContext.replyPlan.chunks.join("\n"), /Octo Voice Context：已配置/);
    assert.match(voiceContext.replyPlan.chunks.join("\n"), /Alice may be transcribed/);

    const downloadUrl = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-download-url",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo download-url chat/hello.txt hello.txt" },
      },
    });
    assert.equal(downloadUrl.commandAction.commandResult.action, "show");
    assert.match(downloadUrl.replyPlan.chunks.join("\n"), /Octo 文件下载 URL：hello\.txt/);
    assert.match(downloadUrl.replyPlan.chunks.join("\n"), /https:\/\/cdn\.example\.test\/chat\/hello\.txt/);

    const editMessage = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-edit-message",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo edit-message msg-1 updated text" },
      },
    });
    assert.equal(editMessage.commandAction.commandResult.action, "set");
    assert.equal(editMessage.commandAction.commandResult.ok, true);
    assert.match(editMessage.replyPlan.chunks.join("\n"), /已编辑 Octo 消息 msg-1/);
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/message/edit"
      && request.body.message_id === "msg-1"
      && request.body.payload.content === "updated text"
    ));

    const createGroup = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-create-group",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo create-group New Group --members user-1" },
      },
    });
    assert.equal(createGroup.commandAction.commandResult.action, "set");
    assert.equal(createGroup.commandAction.commandResult.ok, true);
    assert.match(createGroup.replyPlan.chunks.join("\n"), /已创建 Octo 群：New Group · group-new/);

    const addMembers = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-add-members",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo add-members group-1 user-2,user-3", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(addMembers.commandAction.commandResult.action, "set");
    assert.equal(addMembers.commandAction.commandResult.ok, true);
    assert.match(addMembers.replyPlan.chunks.join("\n"), /已添加 Octo 群成员/);

    const createThread = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-create-thread",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo create-thread group-1 Release Notes", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(createThread.commandAction.commandResult.action, "set");
    assert.equal(createThread.commandAction.commandResult.ok, true);
    assert.match(createThread.replyPlan.chunks.join("\n"), /已创建 Octo Thread：Release Notes · thread-new/);

    const setThreadMd = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-set-thread-md",
        fromUid: "user-1",
        channelId: "group-1____thread-1",
        channelType: 5,
        payload: { type: 1, content: "/octo set-thread-md # New Thread Rule", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(setThreadMd.commandAction.commandResult.action, "set");
    assert.equal(setThreadMd.commandAction.commandResult.ok, true);
    assert.match(setThreadMd.replyPlan.chunks.join("\n"), /已更新 Octo THREAD\.md/);

    const setVoiceContext = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-set-voice-context",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo set-voice-context Alice => 艾丽丝" },
      },
    });
    assert.equal(setVoiceContext.commandAction.commandResult.action, "set");
    assert.equal(setVoiceContext.commandAction.commandResult.ok, true);
    assert.match(setVoiceContext.replyPlan.chunks.join("\n"), /已更新 Octo Voice Context/);

    const deleteVoiceContext = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-delete-voice-context",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "/octo delete-voice-context" },
      },
    });
    assert.equal(deleteVoiceContext.commandAction.commandResult.action, "set");
    assert.equal(deleteVoiceContext.commandAction.commandResult.ok, true);
    assert.match(deleteVoiceContext.replyPlan.chunks.join("\n"), /已删除 Octo Voice Context/);

    const deleteThread = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-delete-thread",
        fromUid: "user-1",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo delete-thread thread-1", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(deleteThread.commandAction.commandResult.action, "set");
    assert.equal(deleteThread.commandAction.commandResult.ok, true);
    assert.match(deleteThread.replyPlan.chunks.join("\n"), /已删除 Octo Thread/);

    const deniedMutation = await service.dispatchOctoIncoming({
      bindingId: "octo-api",
      sendReply: false,
      message: {
        messageId: "octo-command-denied-mutation",
        fromUid: "user-2",
        channelId: "group-1",
        channelType: 2,
        payload: { type: 1, content: "/octo add-members group-1 user-3", mention: { uids: ["robot-1"] } },
      },
    });
    assert.equal(deniedMutation.accepted, true);
    assert.equal(deniedMutation.commandAction.commandResult.action, "set");
    assert.equal(deniedMutation.commandAction.commandResult.ok, false);
    assert.match(deniedMutation.replyPlan.chunks.join("\n"), /没有管理该 Octo binding 的权限/);
    assert.ok(requests.some((request) => request.path === "/v1/bot/createGroup" && request.body.name === "New Group"));
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/groups/group-1/members/add"
      && Array.isArray(request.body.members)
      && request.body.members.length === 2
    ));
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/groups/group-1/threads"
      && request.body.name === "Release Notes"
    ));
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/groups/group-1/md"
      && request.method === "PUT"
      && request.body.content === "# New Group Rule"
    ));
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/groups/group-1/threads/thread-1/md"
      && request.method === "PUT"
      && request.body.content === "# New Thread Rule"
    ));
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/voice/context"
      && request.method === "PUT"
      && request.body.context === "Alice => 艾丽丝"
    ));
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/voice/context"
      && request.method === "DELETE"
    ));
    assert.ok(requests.some((request) =>
      request.path === "/v1/bot/groups/group-1/threads/thread-1"
      && request.method === "DELETE"
    ));
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
    assert.match(requests[0].body.client_msg_no, /^[0-9a-f-]{36}$/);
    assert.deepEqual(requests[0].body, {
      channel_id: "group-a",
      channel_type: 2,
      client_msg_no: requests[0].body.client_msg_no,
      payload: {
        type: 1,
        content: "@Alice 完成",
        mention: {
          uids: ["user-3"],
          entities: [
            {
              uid: "user-3",
              offset: 0,
              length: 6,
            },
          ],
        },
      },
    });
  });
});

test("native Channel Connectors agent runner builds gateway-backed Codex turns", async () => {
  const root = makeTempRoot();
  const workDir = path.join(root, "work");
  const platformSkillDir = path.join(root, "platform-skills", "octo");
  fs.mkdirSync(path.join(platformSkillDir, "octo-bot-api"), { recursive: true });
  fs.writeFileSync(
    path.join(platformSkillDir, "octo-bot-api", "SKILL.md"),
    [
      "---",
      "name: Octo Bot API",
      "description: Octo runtime messaging",
      "---",
      "# Octo Bot Skill",
      "## Step 1: Register",
      "openclaw plugins install clawhub:octo",
      "## Step 3: Send Messages",
      "Use Studio channel manifests for Octo group and thread messaging.",
      "## Message History Sync",
      "Use recent channel messages before responding.",
    ].join("\n"),
    "utf8",
  );
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
    metadata: { channelSkillDirs: [platformSkillDir] },
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
  assert.match(processRequest.stdin, /^\[Studio outbound file\/message policy\]/);
  assert.match(processRequest.stdin, /\[Current IM message - respond to this ONLY\]\nhi codex/);
  assert.match(processRequest.stdin, /studio-channel-files/);
  assert.match(processRequest.stdin, /Feishu private message targets support `open_id:ou_xxx`, `user_id:u_xxx`, and `dm:ou_xxx`/);
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
  const codexNativeSkillPath = path.join(processRequest.env.CODEX_HOME, "skills", "octo_bot_api", "SKILL.md");
  assert.equal(fs.existsSync(codexNativeSkillPath), false);
  assert.doesNotMatch(processRequest.stdin, /studio-channel-skill/);
  assert.doesNotMatch(processRequest.stdin, /studio-octo-actions/);
  assert.doesNotMatch(processRequest.stdin, /studio-feishu-actions/);
  for (const cleanupPath of processRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const persistentRuntimeDir = path.join(root, "persistent-codex-runtime");
  const persistentSkillsDir = path.join(persistentRuntimeDir, "codex-home", "skills");
  const staleNamedSkillDir = path.join(persistentSkillsDir, "feishu_app_scopes");
  const staleMarkerSkillDir = path.join(persistentSkillsDir, "legacy_marker");
  const customSkillDir = path.join(persistentSkillsDir, "custom_keep");
  fs.mkdirSync(staleNamedSkillDir, { recursive: true });
  fs.mkdirSync(staleMarkerSkillDir, { recursive: true });
  fs.mkdirSync(customSkillDir, { recursive: true });
  fs.writeFileSync(path.join(staleNamedSkillDir, "SKILL.md"), "---\nname: stale\n---\nstudio-feishu-actions\n", "utf8");
  fs.writeFileSync(path.join(staleMarkerSkillDir, "SKILL.md"), "---\nname: marker\n---\nStudio Channel Connector helper projection\n", "utf8");
  fs.writeFileSync(path.join(customSkillDir, "SKILL.md"), "---\nname: custom\n---\n# Custom\n", "utf8");
  const persistentRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding,
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    agentRuntimeDir: persistentRuntimeDir,
  });
  assert.ok(persistentRequest);
  assert.equal(persistentRequest.env.CODEX_HOME, path.join(persistentRuntimeDir, "codex-home"));
  assert.equal(fs.existsSync(staleNamedSkillDir), false);
  assert.equal(fs.existsSync(staleMarkerSkillDir), false);
  assert.equal(fs.existsSync(customSkillDir), true);
  for (const cleanupPath of persistentRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
  assert.match(historyRequest.stdin, /\[Studio outbound file\/message policy\]/);
  assert.match(historyRequest.stdin, /\[Current IM message - respond to this ONLY\]\nhi codex/);
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
  assert.match(channelSkillRequest.stdin, /\[Studio outbound file\/message policy\]/);
  assert.match(channelSkillRequest.stdin, /\[Current IM message - respond to this ONLY\]\nhi codex/);
  for (const cleanupPath of channelSkillRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const sharedChannelSkillContext = [
    "[Studio IM channel skills]",
    "Current IM platform: octo.",
    "Available platform skills in this binding:",
    "- /octo-bot-api: Octo runtime messages, history, files, and multi-bot collaboration",
    "[Platform skill instruction excerpts]",
    "### /octo-bot-api [platform:octo]",
    "## Step 3: Send Messages",
    "Use Studio channel manifests instead of external bridge tools.",
  ].join("\n");
  const claudeChannelSkillRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "claude-code", permissionMode: "plan" },
    binding: { ...binding, agent: "claude-code" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    channelSkillContext: sharedChannelSkillContext,
  });
  assert.ok(claudeChannelSkillRequest);
  const claudeChannelSkillInput = JSON.parse(claudeChannelSkillRequest.stdin);
  assert.match(claudeChannelSkillInput.message.content, /^\[Studio IM channel skills\]/);
  assert.match(claudeChannelSkillInput.message.content, /\/octo-bot-api/);
  assert.match(claudeChannelSkillInput.message.content, /\[Studio outbound file\/message policy\]/);
  assert.match(claudeChannelSkillInput.message.content, /\[Current IM message - respond to this ONLY\]\nhi codex/);

  const opencodeChannelSkillRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", permissionMode: "yolo" },
    binding: { ...binding, agent: "opencode" },
    message,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    channelSkillContext: sharedChannelSkillContext,
  });
  assert.ok(opencodeChannelSkillRequest);
  assert.match(opencodeChannelSkillRequest.args.at(-1), /^\[Studio IM channel skills\]/);
  assert.match(opencodeChannelSkillRequest.args.at(-1), /\/octo-bot-api/);
  assert.match(opencodeChannelSkillRequest.args.at(-1), /\[Studio outbound file\/message policy\]/);
  assert.match(opencodeChannelSkillRequest.args.at(-1), /\[Current IM message - respond to this ONLY\]\nhi codex/);
  for (const cleanupPath of opencodeChannelSkillRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
        { uid: "external-helper_bot", name: "External Helper", robot: 1 },
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
  assert.match(groupRequest.stdin, /Known members from Octo Bot API:/);
  assert.match(groupRequest.stdin, /- Alice\(user-2\)/);
  assert.match(groupRequest.stdin, /- Studio\(robot-1\)/);
  assert.match(groupRequest.stdin, /- External Helper\(external-helper_bot, bot\)/);
  assert.match(groupRequest.stdin, /Octo does not support bot DMs/);
  assert.match(groupRequest.stdin, /current group\/thread message using @\[uid:displayName\]/);
  assert.match(groupRequest.stdin, /studio-channel-messages manifest/);
  assert.match(groupRequest.stdin, /format: "markdown"/);
  assert.match(groupRequest.stdin, /\[Studio outbound file\/message policy\]/);
  assert.match(groupRequest.stdin, /\[Current IM message - respond to this ONLY\]\nhi group/);
  assert.doesNotMatch(groupRequest.stdin, /cc-connect/);
  for (const cleanupPath of groupRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const feishuGroupRequest = buildChannelConnectorAgentProcessRequest({
    project,
    binding: {
      ...binding,
      id: "feishu-codex",
      platform: "feishu",
      accountId: "cli_test",
      botId: "ou_bot",
      displayName: "Feishu Codex",
    },
    message: {
      messageId: "om-group-1",
      fromUid: "ou_user_1",
      channelId: "oc_group_1",
      channelType: 2,
      payload: {
        type: 1,
        content: "@Studio hi feishu group",
        mention: { uids: ["ou_bot"] },
        reply: { messageId: "om-parent-1" },
      },
      members: [
        { uid: "ou_user_1", name: "Alice" },
        { uid: "ou_helper", name: "Helper" },
        { uid: "ou_bot", name: "Studio Bot", robot: 1 },
      ],
    },
    sessionKey: "feishu:oc_group_1:ou_user_1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(feishuGroupRequest);
  assert.match(feishuGroupRequest.stdin, /\[Studio group context\]/);
  assert.match(feishuGroupRequest.stdin, /Known members from Feishu Chat Members API:/);
  assert.match(feishuGroupRequest.stdin, /- Alice\(ou_user_1\)/);
  assert.match(feishuGroupRequest.stdin, /- Studio Bot\(ou_bot, bot\)/);
  assert.match(feishuGroupRequest.stdin, /target:"open_id:<member_open_id>"/);
  assert.match(feishuGroupRequest.stdin, /target:"chat:<chat_id>"/);
  assert.match(feishuGroupRequest.stdin, /current Feishu group/);
  assert.match(feishuGroupRequest.stdin, /@\[member_open_id:displayName\]/);
  assert.match(feishuGroupRequest.stdin, /To send a Feishu private or group message/);
  assert.doesNotMatch(feishuGroupRequest.stdin, /Known members from Octo Bot API/);
  assert.doesNotMatch(feishuGroupRequest.stdin, /Octo does not support bot DMs/);
  for (const cleanupPath of feishuGroupRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
  const resumeThreadIdIndex = resumeRequest.args.indexOf("019e9b49-0b62-7132-845a-f19aba1484b7");
  assert.notEqual(resumeThreadIdIndex, -1);
  assert.ok(resumeRequest.args.indexOf("--json") < resumeThreadIdIndex);
  assert.equal(resumeRequest.args.at(-2), "019e9b49-0b62-7132-845a-f19aba1484b7");
  assert.equal(resumeRequest.args.at(-1), "-");
  assert.equal(resumeRequest.sessionMode, "resume");
  assert.equal(resumeRequest.codexThreadId, "019e9b49-0b62-7132-845a-f19aba1484b7");
  assert.equal(resumeRequest.cleanupPaths?.length || 0, 0);
  assert.equal(resumeRequest.env.CODEX_HOME, path.join(agentRuntimeDir, "codex-home"));
  assert.equal(fs.existsSync(path.join(resumeRequest.env.CODEX_HOME, "config.toml")), true);
  const channelSkillBin = path.join(agentRuntimeDir, "channel-skill-tools", "bin");
  const channelSkillScript = path.join(channelSkillBin, "studio-channel-skill");
  assert.equal(fs.existsSync(channelSkillScript), false);
  assert.notEqual(resumeRequest.env.PATH.split(":")[0], channelSkillBin);
  assert.equal("STUDIO_CHANNEL_SKILL_ENDPOINT" in resumeRequest.env, false);
  assert.equal("STUDIO_CHANNEL_SKILL_TOKEN" in resumeRequest.env, false);
  assert.equal("STUDIO_CHANNEL_SKILL_BINDING_ID" in resumeRequest.env, false);

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
      assert.match(request.stdin, /^\[Studio outbound file\/message policy\]/);
      assert.match(request.stdin, /\[Current IM message - respond to this ONLY\]\nhi codex/);
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
  assert.match(claudeInput.message.content, /^\[Studio outbound file\/message policy\]/);
  assert.match(claudeInput.message.content, /\[Current IM message - respond to this ONLY\]\nhi codex/);
  assert.match(claudeInput.message.content, /studio-channel-files/);
  assert.doesNotMatch(claudeRequest.stdin, /cc-connect/);
  assert.equal(claudeRequest.env.ANTHROPIC_API_KEY, "sk-local");
  assert.equal(claudeRequest.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:18796");
  assert.ok(claudeRequest.env.CLAUDE_CONFIG_DIR);
  const claudeNativeSkillPath = path.join(claudeRequest.env.CLAUDE_CONFIG_DIR, "skills", "octo_bot_api", "SKILL.md");
  assert.equal(fs.existsSync(claudeNativeSkillPath), false);
  assert.doesNotMatch(claudeRequest.stdin, /studio-channel-skill/);
  for (const cleanupPath of claudeRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
  for (const cleanupPath of claudeResumeRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
  assert.equal("instructions" in opencodeConfig, false);
  assert.equal(fs.statSync(opencodeConfigPath).mode & 0o777, 0o600);
  const opencodeNativeSkillPath = path.join(opencodeRequest.env.XDG_CONFIG_HOME, "opencode", "skills", "octo_bot_api", "SKILL.md");
  assert.equal(fs.existsSync(opencodeNativeSkillPath), false);
  assert.match(opencodeRequest.args.at(-1), /^\[Studio outbound file\/message policy\]/);
  assert.match(opencodeRequest.args.at(-1), /\[Current IM message - respond to this ONLY\]\nhi codex/);
  assert.match(opencodeRequest.args.at(-1), /studio-channel-files/);
  assert.doesNotMatch(opencodeRequest.args.at(-1), /studio-channel-skill/);
  assert.doesNotMatch(opencodeRequest.args.at(-1), /studio-feishu-actions/);
  assert.doesNotMatch(opencodeRequest.args.at(-1), /cc-connect/);
  for (const cleanupPath of opencodeRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const feishuOpenCodeRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", permissionMode: "yolo" },
    binding: { ...binding, platform: "feishu", id: "feishu-opencode", agent: "opencode", metadata: {} },
    message,
    sessionKey: "feishu:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
  });
  assert.ok(feishuOpenCodeRequest);
  const feishuOpenCodeConfigPath = path.join(feishuOpenCodeRequest.env.XDG_CONFIG_HOME, "opencode", "opencode.json");
  const feishuOpenCodeConfig = JSON.parse(fs.readFileSync(feishuOpenCodeConfigPath, "utf8"));
  assert.equal("instructions" in feishuOpenCodeConfig, false);
  assert.equal(fs.existsSync(path.join(feishuOpenCodeRequest.env.XDG_CONFIG_HOME, "opencode", "skills", "feishu_doc", "SKILL.md")), false);
  for (const cleanupPath of feishuOpenCodeRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
  for (const cleanupPath of claudeNativeRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
  assert.match(attachmentRequest.stdin, /\[image: diagram\.png\]/);
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
  assert.ok(resumeVisionAttachmentRequest.args.indexOf("--json") < resumeThreadArgIndex);
  assert.equal(resumeVisionAttachmentRequest.args.at(-2), "thread-vision");
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

  const videoPath = path.join(workDir, ".studio-agent-attachments", "clip.mp4");
  fs.writeFileSync(videoPath, "fake video bytes");
  const videoMessage = {
    ...message,
    messageId: "m-runner-vision-video",
    payload: { type: 5, content: "", name: "clip.mp4" },
    attachments: [{
      kind: "video",
      platform: "feishu",
      fileName: "clip.mp4",
      mimeType: "video/mp4",
      localPath: videoPath,
      durationMs: 500,
      stagedAt: "2026-06-06T08:00:00.000Z",
    }],
  };

  const codexVideoRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, model: "gmn-vision" },
    binding,
    message: videoMessage,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: true },
  });
  assert.ok(codexVideoRequest);
  assert.equal(codexVideoRequest.args.includes("--image"), false);
  assert.match(codexVideoRequest.stdin, /\[video: clip\.mp4\]/);
  assert.match(codexVideoRequest.stdin, new RegExp(videoPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(codexVideoRequest.stdin, /Studio does not pre-extract frames or down-convert videos/);
  assert.doesNotMatch(codexVideoRequest.stdin, /Studio visual attachment fallback/);
  for (const cleanupPath of codexVideoRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const claudeVideoRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "claude-code", model: "claude-sonnet" },
    binding: { ...binding, agent: "claude-code" },
    message: videoMessage,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: true },
  });
  assert.ok(claudeVideoRequest);
  const claudeVideoInput = JSON.parse(claudeVideoRequest.stdin);
  assert.equal(typeof claudeVideoInput.message.content, "string");
  assert.match(claudeVideoInput.message.content, /\[video: clip\.mp4\]/);
  assert.match(claudeVideoInput.message.content, /Studio does not pre-extract frames or down-convert videos/);
  assert.doesNotMatch(claudeVideoInput.message.content, /native image content blocks/);
  for (const cleanupPath of claudeVideoRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const opencodeVideoRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", model: "gmn-vision" },
    binding: { ...binding, agent: "opencode" },
    message: videoMessage,
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: true },
  });
  assert.ok(opencodeVideoRequest);
  assert.equal(opencodeVideoRequest.args.includes("--file"), false);
  assert.match(opencodeVideoRequest.args.at(-1), /\[video: clip\.mp4\]/);
  assert.match(opencodeVideoRequest.args.at(-1), /Studio does not pre-extract frames or down-convert videos/);
  assert.doesNotMatch(opencodeVideoRequest.args.at(-1), /native --file arguments/);
  for (const cleanupPath of opencodeVideoRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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
      assert.match(request.stdin, /\[image: photo\.jpg\]/);
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

  const claudeNonVisionImageRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "claude-code", model: "glm-5" },
    binding: { ...binding, agent: "claude-code" },
    message: {
      ...message,
      messageId: "m-runner-claude-non-vision-image",
      payload: { type: 2, content: "", name: "photo.jpg" },
      attachments: [{
        kind: "image",
        platform: "feishu",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        localPath: visionImagePath,
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: false },
  });
  assert.ok(claudeNonVisionImageRequest);
  assert.equal(claudeNonVisionImageRequest.command, "claude");
  const claudeNonVisionInput = JSON.parse(claudeNonVisionImageRequest.stdin);
  assert.equal(typeof claudeNonVisionInput.message.content, "string");
  assert.match(claudeNonVisionInput.message.content, /Studio visual attachment policy/);
  assert.match(claudeNonVisionInput.message.content, /current model glm-5 is not marked as vision-capable/);
  assert.doesNotMatch(claudeNonVisionInput.message.content, /native image content blocks/);
  for (const cleanupPath of claudeNonVisionImageRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

  const opencodeNonVisionImageRequest = buildChannelConnectorAgentProcessRequest({
    project: { ...project, agent: "opencode", model: "glm-5" },
    binding: { ...binding, agent: "opencode" },
    message: {
      ...message,
      messageId: "m-runner-opencode-non-vision-image",
      payload: { type: 2, content: "", name: "photo.jpg" },
      attachments: [{
        kind: "image",
        platform: "octo",
        fileName: "photo.jpg",
        mimeType: "image/jpeg",
        localPath: visionImagePath,
        stagedAt: "2026-06-06T08:00:00.000Z",
      }],
    },
    sessionKey: "dmwork:dm:user-1",
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    modelCapabilities: { vision: false },
  });
  assert.ok(opencodeNonVisionImageRequest);
  assert.equal(opencodeNonVisionImageRequest.command, "opencode");
  assert.equal(opencodeNonVisionImageRequest.args.includes("--file"), false);
  assert.match(opencodeNonVisionImageRequest.args.at(-1), /Studio visual attachment policy/);
  assert.match(opencodeNonVisionImageRequest.args.at(-1), /current model glm-5 is not marked as vision-capable/);
  assert.doesNotMatch(opencodeNonVisionImageRequest.args.at(-1), /native --file arguments/);
  for (const cleanupPath of opencodeNonVisionImageRequest.cleanupPaths || []) fs.rmSync(cleanupPath, { recursive: true, force: true });

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

  appendChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "m-tool-result",
    role: "assistant",
    text: `${"tool result detail ".repeat(8)}TOOL-RESULT-VISIBLE`,
    status: "tool-result",
    now: new Date("2026-06-06T08:00:04.000Z"),
  });
  const toolResultContext = renderChannelConnectorConversationHistoryContext(
    getChannelConnectorConversationHistory(historyPath, lookup, 10),
  );
  assert.match(toolResultContext, /tool-result/);
  assert.match(toolResultContext, /TOOL-RESULT-VISIBLE/);

  const cleared = clearChannelConnectorConversationHistory(historyPath, lookup);
  assert.equal(cleared, 2);
  assert.deepEqual(getChannelConnectorConversationHistory(historyPath, lookup), []);
});

test("native Channel Connectors conversation history keeps twenty prompt entries within budget", () => {
  const root = makeTempRoot();
  const historyPath = path.join(root, "state", "channel-history.json");
  const lookup = {
    bindingId: "octo-codex",
    sessionKey: "dmwork:dm:user-20",
  };

  for (let index = 1; index <= 20; index += 1) {
    appendChannelConnectorConversationHistory(historyPath, {
      ...lookup,
      messageId: `m-${index}`,
      role: index % 2 === 0 ? "assistant" : "user",
      text: `short history message ${index}`,
      status: "completed",
      now: new Date(`2026-06-06T08:00:${String(index).padStart(2, "0")}.000Z`),
    });
  }

  const firstEntries = getChannelConnectorConversationHistory(historyPath, lookup);
  assert.equal(firstEntries.length, 20);
  const firstContext = renderChannelConnectorConversationHistoryContext(firstEntries);
  assert.match(firstContext, /up to 20 messages/);
  assert.match(firstContext, /short history message 1/);
  assert.match(firstContext, /short history message 20/);
  assert.equal((firstContext.match(/\n\d+\. /g) || []).length, 20);

  appendChannelConnectorConversationHistory(historyPath, {
    ...lookup,
    messageId: "m-21",
    role: "user",
    text: `${"very-long-history ".repeat(900)}TAIL-SHOULD-NOT-ENTER-CONTEXT`,
    status: "completed",
    now: new Date("2026-06-06T08:00:21.000Z"),
  });

  const entries = getChannelConnectorConversationHistory(historyPath, lookup);
  assert.equal(entries.length, 20);
  assert.equal(entries[0].messageId, "m-2");
  const context = renderChannelConnectorConversationHistoryContext(entries);
  assert.match(context, /short history message 2/);
  assert.match(context, /short history message 20/);
  assert.match(context, /truncated/);
  assert.doesNotMatch(context, /TAIL-SHOULD-NOT-ENTER-CONTEXT/);
  assert.ok(Array.from(context).length <= 8000);
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
    text: "OLDER-SHOULD-NOT-ENTER-COMPACT 继续处理早期文件发送能力。",
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
  for (let index = 3; index <= 25; index += 1) {
    appendChannelConnectorConversationHistory(historyPath, {
      ...lookup,
      messageId: `m-compact-extra-${index}`,
      role: index % 2 === 0 ? "assistant" : "user",
      text: index === 24
        ? "继续处理 TOOLS.md 和文件发送能力，这是最近 20 条内应进入 compact 的上下文。"
        : index === 25
          ? `${"LONG-COMPACT-CONTEXT ".repeat(80)}COMPACT-TAIL-SHOULD-NOT-ENTER-COMPACT`
          : `recent compact history ${index}`,
      status: "completed",
      now: new Date(`2026-06-06T08:00:${String(index).padStart(2, "0")}.000Z`),
    });
  }
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
    assert.equal(result.beforeEntries, 20);
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
  assert.match(requests[0].body.input, /recent compact history 6/);
  assert.match(requests[0].body.input, /truncated/);
  assert.doesNotMatch(requests[0].body.input, /OLDER-SHOULD-NOT-ENTER-COMPACT/);
  assert.doesNotMatch(requests[0].body.input, /COMPACT-TAIL-SHOULD-NOT-ENTER-COMPACT/);

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
  fs.mkdirSync(path.join(octoPlatformSkillDir, "octo-bot-api"), { recursive: true });
  fs.writeFileSync(
    path.join(octoPlatformSkillDir, "octo-bot-api", "SKILL.md"),
    [
      "---",
      "name: Octo Bot API",
      "description: Octo Bot API runtime, files, history, and group collaboration",
      "---",
      "# Octo Bot Skill",
      "### Save Locally",
      "curl -s <apiUrl>/v1/bot/skill.md > ~/.openclaw/skills/octo/SKILL.md",
      "## Step 1: Register",
      "curl -X POST <apiUrl>/v1/bot/register",
      "## Step 2: Receive Messages",
      "openclaw plugins install clawhub:octo",
      "## Step 3: Send Messages",
      "Use the current Studio channel_id and channel_type. Do not split thread channel ids.",
      "## Message History Sync",
      "Use recent channel messages to understand group collaboration before replying.",
      "## Multi-Bot Coordination",
      "Mention the target bot visibly and do not respond on behalf of unrelated bots.",
      "## Files",
      "Use Studio file manifests for file, image, and binary sends.",
    ].join("\n"),
    "utf8",
  );
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
  fs.mkdirSync(path.join(feishuPlatformSkillDir, "feishu-doc-api"), { recursive: true });
  fs.writeFileSync(
    path.join(feishuPlatformSkillDir, "feishu-doc-api", "SKILL.md"),
    [
      "---",
      "name: Feishu Doc API",
      "description: Read, write, and attach files in Feishu documents",
      "---",
      "# Feishu Document Tool",
      "## Configuration",
      "Set FEISHU_APP_ID and FEISHU_APP_SECRET before running tools.",
      "## Token Extraction",
      "Extract docx tokens from Feishu URLs.",
      "## Actions",
      "### Read Document",
      "Read title and plain text content.",
      "### Create Document",
      "Create a new cloud document for the requester.",
      "### Create Table With Values",
      "Create a Docx table and fill cell values in one operation.",
      "### Upload Image to Docx",
      "Upload image from URL or local file.",
      "### Upload File Attachment to Docx",
      "Upload binary files as document attachments.",
      "Read Document, Append Content, Create Document, Upload Image to Docx, Upload File Attachment to Docx.",
      "## Permissions",
      "Use collaborator APIs only when the user asks for permission changes.",
    ].join("\n"),
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
  assert.match(abbreviatedStatus.replyText, /Thinking stream: parser=ready \/ live=model-dependent/);
  assert.match(abbreviatedStatus.replyText, /Window: 128000 tokens; no usage\/history estimate yet\./);
  assert.match(abbreviatedStatus.replyText, /Auto compact threshold: 115200 tokens/);

  const claudeStatus = await handleChannelConnectorCommand({
    ...baseContext,
    project: claudeProject,
    message: message("/status"),
  });
  assert.equal(claudeStatus.ok, true);
  assert.match(claudeStatus.replyText, /Agent: claude-main \(claude-code\)/);
  assert.match(claudeStatus.replyText, /Thinking stream: parser=ready \/ live=not observed/);

  const opencodeClaudeStatus = await handleChannelConnectorCommand({
    ...baseContext,
    project: {
      ...codexProject,
      id: "opencode-claude",
      name: "OpenCode Claude",
      agent: "opencode",
      model: "claude-sonnet-4-5",
    },
    message: message("/status"),
  });
  assert.equal(opencodeClaudeStatus.ok, true);
  assert.match(opencodeClaudeStatus.replyText, /Agent: opencode-claude \(opencode\)/);
  assert.match(opencodeClaudeStatus.replyText, /Thinking stream: parser=ready \/ live=observed/);

  const opencodeMiniStatus = await handleChannelConnectorCommand({
    ...baseContext,
    project: {
      ...codexProject,
      id: "opencode-mini",
      name: "OpenCode Mini",
      agent: "opencode",
      model: "gpt-5.4-mini",
    },
    message: message("/status"),
  });
  assert.equal(opencodeMiniStatus.ok, true);
  assert.match(opencodeMiniStatus.replyText, /Agent: opencode-mini \(opencode\)/);
  assert.match(opencodeMiniStatus.replyText, /Thinking stream: parser=ready \/ live=not observed/);

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
  const octoSkillContext = buildChannelConnectorSkillContext(codexProject, { binding });
  assert.ok(octoSkillContext);
  assert.match(octoSkillContext, /\[Studio IM channel helper skills\]/);
  assert.match(octoSkillContext, /Configured binding skills/);
  assert.match(octoSkillContext, /### \/octo-send \[binding\]/);
  assert.match(octoSkillContext, /Use Studio Octo channel transport for DM, group, thread, and mention work/);
  assert.match(octoSkillContext, /studio-channel-messages/);
  assert.doesNotMatch(octoSkillContext, /studio-channel-skill/);
  assert.doesNotMatch(octoSkillContext, /studio-octo-actions/);
  assert.doesNotMatch(octoSkillContext, /feishu-card/);

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
  assert.doesNotMatch(feishuSkills.replyText, /\/feishu-doc \[platform:feishu\]/);
  assert.match(feishuSkills.replyText, /\/feishu-card \[binding\]/);
  assert.match(feishuSkills.replyText, /\/feishu-doc-api \[binding\]/);
  assert.doesNotMatch(feishuSkills.replyText, /\/octo-send/);
  const feishuSkillContext = buildChannelConnectorSkillContext(codexProject, { binding: feishuBinding });
  assert.ok(feishuSkillContext);
  assert.match(feishuSkillContext, /\[Studio IM channel helper skills\]/);
  assert.match(feishuSkillContext, /\/feishu-card: Build Feishu card and message workflows/);
  assert.match(feishuSkillContext, /\/feishu-doc-api: Read, write, and attach files in Feishu documents/);
  assert.doesNotMatch(feishuSkillContext, /Runtime Action Index/);
  assert.doesNotMatch(feishuSkillContext, /studio-channel-skill/);
  assert.doesNotMatch(feishuSkillContext, /studio-feishu-actions/);
  assert.doesNotMatch(feishuSkillContext, /FEISHU_APP_SECRET/);
  assert.doesNotMatch(feishuSkillContext, /octo-send/);

  const defaultOctoBinding = { ...binding, metadata: {} };
  const defaultOctoDirs = channelConnectorSkillDirs(codexProject, { binding: defaultOctoBinding });
  assert.equal(defaultOctoDirs.some((dir) => dir.includes(".openclaw/extensions/octo")), false);
  assert.equal(defaultOctoDirs.some((dir) => dir.includes("projects/openclaw/latest/extensions/feishu")), false);
  const defaultOctoPlatformSkills = listChannelConnectorPlatformSkills(codexProject, { binding: defaultOctoBinding });
  assert.deepEqual(defaultOctoPlatformSkills, []);
  const defaultOctoContext = buildChannelConnectorSkillContext(codexProject, { binding: defaultOctoBinding });
  assert.equal(defaultOctoContext, null);

  const defaultFeishuBinding = { ...feishuBinding, metadata: {} };
  const defaultFeishuDirs = channelConnectorSkillDirs(codexProject, { binding: defaultFeishuBinding });
  assert.equal(defaultFeishuDirs.some((dir) => dir.includes(".openclaw/extensions/feishu")), false);
  assert.equal(defaultFeishuDirs.some((dir) => dir.includes("projects/openclaw/latest/extensions/feishu")), false);
  const defaultFeishuPlatformSkills = listChannelConnectorPlatformSkills(codexProject, { binding: defaultFeishuBinding });
  assert.deepEqual(defaultFeishuPlatformSkills, []);
  const defaultFeishuContext = buildChannelConnectorSkillContext(codexProject, { binding: defaultFeishuBinding });
  assert.equal(defaultFeishuContext, null);
  const feishuSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding: defaultFeishuBinding,
    skills: listChannelConnectorSkillSummaries(codexProject, defaultFeishuBinding),
  });
  assert.deepEqual(feishuSurface.skills.filter((skill) => skill.scope === "platform"), []);
  const commandsSection = feishuSurface.sections.find((section) => section.id === "commands");
  assert.ok(commandsSection);
  assert.equal(commandsSection.actions.some((action) => action.id === "skill-feishu-doc"), false);

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
    ["/vision", "list"],
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

  const visionStatus = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/vision"),
  });
  assert.equal(visionStatus.ok, true);
  assert.equal(visionStatus.action, "list");
  assert.match(visionStatus.replyText, /自动视觉 fallback：关闭/);
  assert.match(visionStatus.replyText, /1\. gpt-5\.5/);

  const visionModel = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/vision model 1"),
  });
  assert.equal(visionModel.ok, true);
  assert.equal(visionModel.control.autoVisionModel, true);
  assert.equal(visionModel.control.visionModel, "gpt-5.5");
  assert.match(visionModel.replyText, /指定当前会话视觉模型：gpt-5\.5/);

  const visionAuto = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/vision model auto"),
  });
  assert.equal(visionAuto.ok, true);
  assert.equal(visionAuto.control.autoVisionModel, true);
  assert.equal(visionAuto.control.visionModel, "__studio_auto__");
  assert.match(visionAuto.replyText, /Gateway 会自动选择健康 vision 模型/);

  const visionDefault = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/vision default"),
  });
  assert.equal(visionDefault.ok, true);
  assert.equal(visionDefault.control.autoVisionModel, null);
  assert.equal(visionDefault.control.visionModel, null);

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

  const compactProgressEvents = [];
  const compactWithProgress = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/compact"),
    compactConversation: async () => ({
      ok: true,
      beforeEntries: 5,
      afterEntries: 1,
      sessionsCleared: 1,
      summaryText: "compact progress summary",
      error: null,
    }),
    onCommandProgress: async (event) => {
      compactProgressEvents.push(event);
      return { handled: true, suppressFinalReply: event.type === "completed" };
    },
  });
  assert.equal(compactWithProgress.handled, true);
  assert.equal(compactWithProgress.ok, true);
  assert.equal(compactWithProgress.progressHandled, true);
  assert.equal(compactWithProgress.suppressReply, true);
  assert.deepEqual(compactProgressEvents.map((event) => event.type), ["started", "completed"]);
  assert.deepEqual(compactProgressEvents.map((event) => event.commandName), ["compact", "compact"]);
  assert.equal(compactProgressEvents[0].commandPreview, "/compact");
  assert.match(compactProgressEvents[1].outputPreview, /Studio compact completed/);

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

  const forcedNativeCompactProgressEvents = [];
  const nativeCompactForcedWithProgress = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/native /compact"),
    nativeCompactConversation: async () => ({
      attempted: true,
      ok: true,
      fallbackAllowed: false,
      replyText: "Codex compact 已完成。",
      error: null,
    }),
    onCommandProgress: async (event) => {
      forcedNativeCompactProgressEvents.push(event);
      return { handled: true, suppressFinalReply: event.type === "completed" };
    },
  });
  assert.equal(nativeCompactForcedWithProgress.handled, true);
  assert.equal(nativeCompactForcedWithProgress.ok, true);
  assert.equal(nativeCompactForcedWithProgress.progressHandled, true);
  assert.equal(nativeCompactForcedWithProgress.suppressReply, true);
  assert.deepEqual(forcedNativeCompactProgressEvents.map((event) => event.type), ["started", "completed"]);
  assert.deepEqual(forcedNativeCompactProgressEvents.map((event) => event.commandName), ["compact", "compact"]);
  assert.equal(forcedNativeCompactProgressEvents[0].commandPreview, "/native /compact");

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
  assert.match(current.replyText, /Thinking stream: parser=ready \/ live=/);
  assert.match(current.replyText, /Actions: \/list/);
  const historyOne = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/history 1"),
  });
  assert.equal(historyOne.ok, true);
  assert.match(historyOne.replyText, /Studio Session History \(last 1\/1\)/);
  assert.doesNotMatch(historyOne.replyText, /first current history entry/);
  assert.match(historyOne.replyText, /second current history entry/);
  const historyDefault = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/history"),
  });
  assert.equal(historyDefault.ok, true);
  assert.match(historyDefault.replyText, /Studio Session History \(last 2\/20\)/);
  assert.match(historyDefault.replyText, /first current history entry/);
  assert.match(historyDefault.replyText, /second current history entry/);
  const historyTooMany = await handleChannelConnectorCommand({
    ...baseContext,
    message: message("/history 999"),
  });
  assert.equal(historyTooMany.ok, true);
  assert.match(historyTooMany.replyText, /Studio Session History \(last 2\/20\)/);

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
  const defaultDisabled = await resolveChannelConnectorVisualTurnProject({
    project,
    binding,
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => {
      throw new Error("auto vision should be opt-in");
    },
  });
  assert.equal(defaultDisabled.switched, false);
  assert.equal(defaultDisabled.reason, "disabled-by-binding");
  assert.equal(defaultDisabled.project.model, "gateway-glm-5");

  const autoVisionBinding = { ...binding, metadata: { autoVisionModel: true } };
  const selected = await resolveChannelConnectorVisualTurnProject({
    project,
    binding: autoVisionBinding,
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

  const configuredVision = await resolveChannelConnectorVisualTurnProject({
    project,
    binding: { ...binding, metadata: { autoVisionModel: true, visionModel: "vision-gpt-5.5" } },
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => catalog,
  });
  assert.equal(configuredVision.switched, true);
  assert.equal(configuredVision.project.model, "gmn-vision");
  assert.equal(configuredVision.configuredVisionModel, "vision-gpt-5.5");
  assert.equal(configuredVision.reason, "configured-vision-model");

  const configuredMissing = await resolveChannelConnectorVisualTurnProject({
    project,
    binding: { ...binding, metadata: { autoVisionModel: true, visionModel: "missing-vision" } },
    message: imageMessage,
    gatewayEndpoint: project.gatewayEndpoint,
    gatewayClientKey: "sk-local",
    listCatalog: async () => catalog,
  });
  assert.equal(configuredMissing.switched, false);
  assert.equal(configuredMissing.reason, "configured-vision-model-missing");

  const noHealthyVision = await resolveChannelConnectorVisualTurnProject({
    project,
    binding: autoVisionBinding,
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
    binding: autoVisionBinding,
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
    binding: autoVisionBinding,
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

    const visionSurface = await service.getCommandSurface({
      bindingId: "feishu-gateway",
      sessionKey: "feishu:chat:user",
      view: "vision",
      renderer: "all",
    });
    const visionCardRaw = JSON.stringify(visionSurface.feishuCard);
    assert.match(visionCardRaw, /Studio Vision/);
    assert.match(visionCardRaw, /act:\/vision model gateway-gpt-5/);
    assert.doesNotMatch(visionCardRaw, /act:\/vision model gateway-glm-5/);
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
  assert.equal(surface.current.autoVisionModel, false);
  assert.equal(surface.current.visionModel, null);
  assert.equal(surface.current.thinkingSupport.parserLabel, "ready");
  assert.equal(surface.current.thinkingSupport.liveStatus, "model-dependent");
  assert.match(surface.textFallback, /skills 命令/);
  assert.match(surface.textFallback, /^Studio Channel/);
  assert.match(surface.textFallback, /\*\*当前会话\*\*/);
  assert.match(surface.textFallback, /- Agent: codex-main \(codex\)/);
  assert.match(surface.textFallback, /- Reasoning: default/);
  assert.match(surface.textFallback, /- Thinking stream: parser=ready \/ live=model-dependent/);
  assert.match(surface.textFallback, /快捷操作/);
  assert.match(surface.textFallback, /- `\/status` - Status:/);
  assert.match(surface.textFallback, /\*\*菜单入口\*\*/);
  assert.match(surface.textFallback, /- 会话: `\/help session`  `\/help buffer`/);
  assert.match(surface.textFallback, /\*\*常用命令\*\*/);
  assert.match(surface.textFallback, /`\/status`/);
  assert.match(surface.textFallback, /`\/vision`/);
  assert.match(surface.textFallback, /`\/native \/help`/);
  assert.match(surface.textFallback, /`\/native \/compact`/);
  assert.match(surface.textFallback, /`\/help agent`/);
  assert.match(surface.textFallback, /`\/help vision`/);
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
  assert.match(raw, /nav:\/help vision/);
  assert.match(raw, /session_key/);
  assert.match(raw, /当前 Agent/);
  assert.match(raw, /会话/);
  assert.match(raw, /配置/);
  assert.match(raw, /显示/);
  assert.match(raw, /思考流/);
  assert.match(raw, /命令/);
  assert.match(raw, /nav:\/help session/);
  assert.match(raw, /nav:\/help commands/);
  assert.match(raw, /\/help model/);
  assert.match(raw, /\/help vision/);
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
  assert.match(currentCardRaw, /Thinking stream/);
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

  const visionPickerSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: codexProject,
    binding: { ...binding, metadata: { autoVisionModel: true, visionModel: "gpt-5.5" } },
    sessionKey: "dmwork:dm:admin-1",
    models: ["gpt-5", "gpt-5.5"],
    visionModels: ["gpt-5.5"],
    selectedSectionId: "vision",
    selectedViewId: "vision",
  });
  assert.equal(visionPickerSurface.current.autoVisionModel, true);
  assert.equal(visionPickerSurface.current.visionModel, "gpt-5.5");
  const visionCardRaw = JSON.stringify(renderChannelConnectorCommandSurfaceFeishu(visionPickerSurface));
  assert.match(visionCardRaw, /Studio Vision/);
  assert.match(visionCardRaw, /select_static/);
  assert.match(visionCardRaw, /act:\/vision on/);
  assert.match(visionCardRaw, /act:\/vision off/);
  assert.match(visionCardRaw, /act:\/vision model auto/);
  assert.match(visionCardRaw, /act:\/vision model gpt-5\.5/);
  assert.match(visionCardRaw, /nav:\/help vision/);

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
  assert.match(displayCardRaw, /思考流/);
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
  assert.match(groupDisplayCardRaw, /思考流：parser=ready \/ live=model-dependent/);
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

  const claudeThinkingSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: claudeProject,
    binding,
    sessionKey: "dmwork:dm:admin-1",
  });
  assert.equal(claudeThinkingSurface.current.thinkingSupport.parserLabel, "ready");
  assert.equal(claudeThinkingSurface.current.thinkingSupport.liveStatus, "not-observed");

  const opencodeThinkingSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: {
      ...codexProject,
      id: "opencode-main",
      name: "OpenCode main",
      agent: "opencode",
      model: "claude-sonnet-4-5",
    },
    binding,
    sessionKey: "dmwork:dm:admin-1",
  });
  assert.equal(opencodeThinkingSurface.current.thinkingSupport.parserLabel, "ready");
  assert.equal(opencodeThinkingSurface.current.thinkingSupport.liveStatus, "observed");

  const opencodeMiniThinkingSurface = buildChannelConnectorCommandSurface({
    config: runtimeConfig,
    project: {
      ...codexProject,
      id: "opencode-mini",
      name: "OpenCode mini",
      agent: "opencode",
      model: "gpt-5.4-mini",
    },
    binding,
    sessionKey: "dmwork:dm:admin-1",
  });
  assert.equal(opencodeMiniThinkingSurface.current.thinkingSupport.parserLabel, "ready");
  assert.equal(opencodeMiniThinkingSurface.current.thinkingSupport.liveStatus, "not-observed");

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

  const parsedMentionedBot = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_mentioned_bot",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_mentioned_bot",
        chat_id: "oc_group",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_1 /status" }),
        mentions: [
          { key: "@_user_1", name: "Studio Main", id: { open_id: "bot_test" } },
        ],
      },
    },
  });
  const botMentionCandidates = channelConnectorFeishuBotMentionCandidates(service.getNativeConfig().config.platformBindings[0]);
  const mentionedText = normalizeFeishuMessageTextForBot(
    parsedMentionedBot.text,
    parsedMentionedBot.mentions,
    botMentionCandidates,
  );
  assert.equal(parsedMentionedBot.hasAnyMention, true);
  assert.equal(isChannelConnectorFeishuBotMentioned(parsedMentionedBot, botMentionCandidates), true);
  assert.equal(isChannelConnectorFeishuMessageDirected(parsedMentionedBot, botMentionCandidates, mentionedText), true);
  assert.equal(mentionedText, "/status");

  const parsedMentionedOther = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_mentioned_other",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_mentioned_other",
        chat_id: "oc_group",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_2 hello" }),
        mentions: [
          { key: "@_user_2", name: "Alice", id: { open_id: "ou_alice" } },
        ],
      },
    },
  });
  assert.equal(isChannelConnectorFeishuBotMentioned(parsedMentionedOther, botMentionCandidates), false);
  assert.equal(isChannelConnectorFeishuMessageDirected(parsedMentionedOther, botMentionCandidates), false);

  const parsedMentionedAll = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_mentioned_all",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_mentioned_all",
        chat_id: "oc_group",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_all hello" }),
        mentions: [
          { key: "@_all", name: "所有人", id: { open_id: "all" } },
        ],
      },
    },
  });
  assert.equal(isChannelConnectorFeishuBotMentioned(parsedMentionedAll, botMentionCandidates), false);
  assert.equal(isChannelConnectorFeishuMessageDirected(parsedMentionedAll, botMentionCandidates), false);

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

  const mentionedBotCommand = await service.dispatchFeishuWebhook({
    dryRun: true,
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_mentioned_bot_command",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_mentioned_bot_command",
        chat_id: "oc_group",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_1 %help" }),
        mentions: [
          { key: "@_user_1", name: "Studio Main", id: { open_id: "bot_test" } },
        ],
      },
    },
  });
  assert.equal(mentionedBotCommand.accepted, true);
  assert.equal(mentionedBotCommand.incoming.content, "/help");
  assert.equal(mentionedBotCommand.incoming.directed, true);
  assert.equal(mentionedBotCommand.commandAction.command, "/help");

  const mentionedOtherMessage = await service.dispatchFeishuWebhook({
    dryRun: true,
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_mentioned_other_skip",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_admin" } },
      message: {
        message_id: "om_mentioned_other_skip",
        chat_id: "oc_group",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@_user_2 hello" }),
        mentions: [
          { key: "@_user_2", name: "Alice", id: { open_id: "ou_alice" } },
        ],
      },
    },
  });
  assert.equal(mentionedOtherMessage.accepted, false);
  assert.equal(mentionedOtherMessage.skippedReason, "feishu_group_message_not_directed");

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
  assert.equal(buildFeishuConversationScopeId(parsedMessage), "oc_chat:topic:om_root");
  assert.equal(buildFeishuSessionKey(parsedMessage), "feishu:oc_chat:topic:om_root");
  assert.equal(buildFeishuSessionKey({ ...parsedMessage, rootId: null }), "feishu:oc_chat:topic:om_thread");
  assert.equal(buildFeishuSessionKey(parsedMessage, { threadIsolation: false }), "feishu:oc_chat");
  assert.equal(buildFeishuSessionKey(parsedMessage, { groupSessionScope: "group" }), "feishu:oc_chat");
  assert.equal(buildFeishuSessionKey(parsedMessage, { groupSessionScope: "group_sender" }), "feishu:oc_chat:sender:ou_admin");
  assert.equal(buildFeishuSessionKey(parsedMessage, { groupSessionScope: "group_topic_sender" }), "feishu:oc_chat:topic:om_root:sender:ou_admin");

  const parsedTopicGroupMessage = parseChannelConnectorFeishuWebhook({
    schema: "2.0",
    header: {
      event_type: "im.message.receive_v1",
      app_id: "cli_test",
      event_id: "evt_msg_topic_group",
      token: "verify-token",
    },
    event: {
      sender: { sender_id: { open_id: "ou_topic" } },
      message: {
        message_id: "om_topic_reply",
        chat_id: "oc_topic_group",
        chat_type: "topic_group",
        root_id: "om_topic_root",
        thread_id: "omt_topic_1",
        message_type: "text",
        content: JSON.stringify({ text: "topic reply" }),
      },
    },
  });
  assert.equal(parsedTopicGroupMessage.directed, false);
  assert.equal(buildFeishuSessionKey(parsedTopicGroupMessage), "feishu:oc_topic_group:topic:omt_topic_1");
  assert.equal(
    buildFeishuSessionKey(parsedTopicGroupMessage, { groupSessionScope: "group_topic_sender" }),
    "feishu:oc_topic_group:topic:omt_topic_1:sender:ou_topic",
  );

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
  assert.equal(slashThreadMessage.sessionKey, "feishu:oc_chat:topic:om_thread_root");
  assert.equal(slashThreadMessage.commandAction.command, "/status");
  assert.equal(slashThreadMessage.incoming.rootId, "om_thread_root");
  assert.equal(slashThreadMessage.incoming.parentId, "om_thread_parent");
  assert.equal(slashThreadMessage.incoming.threadId, "om_thread_id");
  assert.match(JSON.stringify(slashThreadMessage.feishuResponse.card.data), /feishu:oc_chat:topic:om_thread_root/);
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

    const openText = await service.runFeishuTransportSmoke({
      bindingId: "feishu-send",
      action: "send-message",
      receiveId: "ou_open_user",
      receiveIdType: "open_id",
      content: "hello open id",
    });
    assert.equal(openText.transport.ok, true);
    assert.equal(openText.transport.action, "send-message");
    assert.equal(openText.transport.tokenCache, "hit");
    assert.equal(requests[3].path, "/open-apis/im/v1/messages?receive_id_type=open_id");
    assert.equal(requests[3].authorization, "Bearer tenant-token-1");
    assert.equal(requests[3].body.receive_id, "ou_open_user");
    assert.equal(requests[3].body.msg_type, "text");
    assert.equal(JSON.parse(requests[3].body.content).text, "hello open id");

    const userPost = await service.runFeishuTransportSmoke({
      bindingId: "feishu-send",
      action: "send-post",
      receiveId: "u_user_id",
      receiveIdType: "user_id",
      content: "**hello user id**",
    });
    assert.equal(userPost.transport.ok, true);
    assert.equal(userPost.transport.action, "send-post");
    assert.equal(userPost.transport.tokenCache, "hit");
    assert.equal(requests[4].path, "/open-apis/im/v1/messages?receive_id_type=user_id");
    assert.equal(requests[4].authorization, "Bearer tenant-token-1");
    assert.equal(requests[4].body.receive_id, "u_user_id");
    assert.equal(requests[4].body.msg_type, "post");
    assert.match(JSON.parse(requests[4].body.content).zh_cn.content[0][0].text, /hello user id/);

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
    assert.equal(requests[5].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[5].authorization, "Bearer tenant-token-1");
    assert.equal(requests[5].body.receive_id, "oc_chat");
    assert.equal(requests[5].body.msg_type, "interactive");
    assert.match(JSON.parse(requests[5].body.content).elements[0].content, /card menu/);

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
    assert.equal(requests.length, 7);
    assert.equal(requests[6].path, "/open-apis/im/v1/messages/om_card");
    assert.equal(requests[6].method, "PATCH");
    assert.equal(requests[6].authorization, "Bearer tenant-token-1");
    assert.match(JSON.parse(requests[6].body.content).elements[0].content, /patched card/);

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
    assert.equal(requests.length, 8);
    assert.equal(requests[7].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[7].body.msg_type, "interactive");
    const webhookCard = JSON.parse(requests[7].body.content);
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
    assert.equal(requests.length, 9);
    assert.equal(requests[8].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[8].body.msg_type, "text");
    assert.match(JSON.parse(requests[8].body.content).text, /已开启新的 Agent 会话/);
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

test("native Channel Connectors Feishu thread bootstrap fetches root and topic history within budget", async () => {
  const root = makeTempRoot();
  const requests = [];
  const textItem = ({
    messageId,
    senderId,
    senderType = "user",
    text,
    createTime,
    threadId = "omt_topic_1",
  }) => ({
    message_id: messageId,
    msg_type: "text",
    sender: {
      sender_id: { open_id: senderId },
      sender_type: senderType,
    },
    body: {
      content: JSON.stringify({ text }),
    },
    create_time: String(createTime),
    thread_id: threadId,
  });

  await withServer(async (req, res) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    await new Promise((resolve) => req.on("end", resolve));
    const bodyRaw = Buffer.concat(chunks).toString("utf8");
    requests.push({
      method: req.method,
      path: req.url,
      authorization: req.headers.authorization,
      body: bodyRaw ? JSON.parse(bodyRaw) : null,
    });
    res.setHeader("content-type", "application/json");
    if (req.method === "POST" && req.url === "/open-apis/auth/v3/tenant_access_token/internal") {
      res.end(JSON.stringify({
        code: 0,
        tenant_access_token: "tenant-token-1",
        expire: 3600,
      }));
      return true;
    }
    if (req.method === "GET" && req.url === "/open-apis/im/v1/messages/om_root") {
      res.end(JSON.stringify({
        code: 0,
        data: {
          items: [
            textItem({
              messageId: "om_root",
              senderId: "ou_owner",
              text: "thread starter asks for a coordinated status report",
              createTime: 1780732700000,
            }),
          ],
        },
      }));
      return true;
    }
    if (req.method === "GET" && req.url === "/open-apis/im/v1/messages/om_current") {
      res.end(JSON.stringify({
        code: 0,
        data: textItem({
          messageId: "om_current",
          senderId: "ou_user",
          text: "current message should not be duplicated in fetched context",
          createTime: 1780732800000,
        }),
      }));
      return true;
    }
    if (req.method === "GET" && req.url?.startsWith("/open-apis/im/v1/messages?")) {
      const parsedUrl = new URL(req.url, "http://feishu.local");
      assert.equal(parsedUrl.searchParams.get("container_id_type"), "thread");
      assert.equal(parsedUrl.searchParams.get("container_id"), "omt_topic_1");
      res.end(JSON.stringify({
        code: 0,
        data: {
          items: [
            textItem({
              messageId: "om_current",
              senderId: "ou_user",
              text: "current message should be excluded",
              createTime: 1780732800000,
            }),
            textItem({
              messageId: "om_helper",
              senderId: "ou_helper",
              text: "helper already replied with the latest summary",
              createTime: 1780732799000,
            }),
            textItem({
              messageId: "om_bot",
              senderId: "cli_a9280cc8eab85cca",
              senderType: "app",
              text: "studio bot previous answer",
              createTime: 1780732790000,
            }),
            textItem({
              messageId: "om_long",
              senderId: "ou_user",
              text: `large topic history ${"long-context ".repeat(80)}TAIL-SHOULD-NOT-ENTER-FEISHU-CONTEXT`,
              createTime: 1780732780000,
            }),
            textItem({
              messageId: "om_root",
              senderId: "ou_owner",
              text: "thread starter duplicated in list should be excluded",
              createTime: 1780732700000,
            }),
          ],
        },
      }));
      return true;
    }
    return false;
  }, async (apiUrl) => {
    const transport = {
      apiUrl,
      appId: "cli_a9280cc8eab85cca",
      appSecret: "secret",
    };
    const cachePath = path.join(root, "feishu-token-cache.json");
    const rootMessage = await getFeishuMessage(transport, { messageId: "om_root" }, cachePath);
    assert.equal(rootMessage.ok, true);
    assert.equal(rootMessage.message?.content, "thread starter asks for a coordinated status report");
    assert.equal(rootMessage.message?.threadId, "omt_topic_1");

    const listed = await listFeishuThreadMessages(transport, {
      threadId: "omt_topic_1",
      currentMessageId: "om_current",
      rootMessageId: "om_root",
      limit: 20,
    }, cachePath);
    assert.equal(listed.ok, true);
    assert.deepEqual(listed.messages.map((message) => message.messageId), ["om_long", "om_bot", "om_helper"]);

    const parsed = parseChannelConnectorFeishuWebhook({
      schema: "2.0",
      header: {
        event_type: "im.message.receive_v1",
        app_id: "cli_a9280cc8eab85cca",
        event_id: "evt_thread_bootstrap",
        token: "verify-token",
      },
      event: {
        sender: { sender_id: { open_id: "ou_user" } },
        message: {
          message_id: "om_current",
          chat_id: "oc_group",
          chat_type: "group",
          root_id: "om_root",
          thread_id: "omt_topic_1",
          message_type: "text",
          content: JSON.stringify({ text: "@studio-cc summarize the thread" }),
        },
      },
    });
    const bootstrap = await loadFeishuThreadBootstrapContext({
      transport,
      tokenCachePath: cachePath,
      parsed,
      sessionKey: "feishu:oc_group:topic:om_root",
      groupSessionScope: "group_topic",
      hasExistingSession: false,
      limit: 20,
      messageMaxRunes: 160,
      totalMaxRunes: 1600,
    });
    assert.equal(bootstrap.attempted, true);
    assert.equal(bootstrap.included, true);
    assert.equal(bootstrap.threadId, "omt_topic_1");
    assert.equal(bootstrap.rootMessageId, "om_root");
    assert.equal(bootstrap.rootFetched, true);
    assert.equal(bootstrap.messageCount, 4);
    assert.match(bootstrap.context || "", /Feishu thread bootstrap/);
    assert.match(bootstrap.context || "", /thread starter asks for a coordinated status report/);
    assert.match(bootstrap.context || "", /studio bot previous answer/);
    assert.match(bootstrap.context || "", /helper already replied with the latest summary/);
    assert.match(bootstrap.context || "", /truncated/);
    assert.match(bootstrap.context || "", /originalRunes/);
    assert.doesNotMatch(bootstrap.context || "", /current message should be excluded/);
    assert.doesNotMatch(bootstrap.context || "", /thread starter duplicated in list should be excluded/);
    assert.doesNotMatch(bootstrap.context || "", /TAIL-SHOULD-NOT-ENTER-FEISHU-CONTEXT/);

    const senderScoped = await loadFeishuThreadBootstrapContext({
      transport,
      tokenCachePath: cachePath,
      parsed,
      sessionKey: "feishu:oc_group:topic:om_root:sender:ou_user",
      groupSessionScope: "group_topic_sender",
      hasExistingSession: false,
      limit: 20,
      messageMaxRunes: 160,
      totalMaxRunes: 1600,
    });
    assert.equal(senderScoped.included, true);
    assert.match(senderScoped.context || "", /studio bot previous answer/);
    assert.doesNotMatch(senderScoped.context || "", /helper already replied/);

    const skipped = await loadFeishuThreadBootstrapContext({
      transport,
      tokenCachePath: cachePath,
      parsed,
      sessionKey: "feishu:oc_group:topic:om_root",
      groupSessionScope: "group_topic",
      hasExistingSession: true,
      limit: 20,
      messageMaxRunes: 160,
      totalMaxRunes: 1600,
    });
    assert.equal(skipped.attempted, false);
    assert.equal(skipped.skippedReason, "existing_session");

    assert.equal(requests.some((request) => request.path === "/open-apis/im/v1/messages/om_root"), true);
    assert.equal(requests.some((request) => request.path?.startsWith("/open-apis/im/v1/messages?")), true);
    assert.equal(requests.every((request) => request.authorization === undefined || request.authorization === "Bearer tenant-token-1"), true);
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

test("native Channel Connectors Feishu transport can reply to the triggering message", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_reply_to",
      appSecret: "test-secret",
    };

    const text = await sendFeishuTextMessage(transport, {
      chatId: "oc_chat",
      replyToMessageId: "om_trigger",
      content: "reply text",
    }, cachePath);
    const post = await sendFeishuPostMessage(transport, {
      chatId: "oc_chat",
      replyToMessageId: "om_trigger",
      content: "**reply post**",
    }, cachePath);
    const card = await sendFeishuCardMessage(transport, {
      chatId: "oc_chat",
      replyToMessageId: "om_trigger",
      card: { config: { wide_screen_mode: true }, elements: [] },
    }, cachePath);

    assert.equal(text.ok, true);
    assert.equal(text.action, "reply-message");
    assert.equal(text.messageId, "om_reply_1");
    assert.equal(post.ok, true);
    assert.equal(post.action, "reply-post");
    assert.equal(card.ok, true);
    assert.equal(card.action, "reply-card");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages/om_trigger/reply");
    assert.equal(requests[1].body.msg_type, "text");
    assert.equal(JSON.parse(requests[1].body.content).text, "reply text");
    assert.equal(requests[2].path, "/open-apis/im/v1/messages/om_trigger/reply");
    assert.equal(requests[2].body.msg_type, "post");
    assert.equal(requests[3].path, "/open-apis/im/v1/messages/om_trigger/reply");
    assert.equal(requests[3].body.msg_type, "interactive");
    assert.equal(requests.every((request) => request.body?.receive_id === undefined), true);
  });
});

test("native Channel Connectors Feishu transport resolves bot open_id for group mention gating", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_bot_info",
      appSecret: "test-secret",
    };

    const result = await getFeishuBotInfo(transport, cachePath);

    assert.equal(result.ok, true);
    assert.equal(result.botOpenId, "ou_mock_bot");
    assert.equal(result.botName, "Mock Feishu Bot");
    assert.equal(result.requestCount, 2);
    assert.equal(result.tokenCache, "miss");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/bot/v3/info");
    assert.equal(requests[1].authorization, "Bearer tenant-token-1");
  });
});

test("native Channel Connectors Feishu transport sends text to open_id and user_id targets", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_receive_id",
      appSecret: "test-secret",
    };

    const openId = await sendFeishuTextMessage(transport, {
      receiveId: "ou_admin",
      receiveIdType: "open_id",
      content: "open id ping",
    }, cachePath);
    const userId = await sendFeishuTextMessage(transport, {
      receiveId: "u_admin",
      receiveIdType: "user_id",
      content: "user id ping",
    }, cachePath);

    assert.equal(openId.ok, true);
    assert.equal(userId.ok, true);
    assert.equal(openId.tokenCache, "miss");
    assert.equal(userId.tokenCache, "hit");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages?receive_id_type=open_id");
    assert.equal(requests[1].body.receive_id, "ou_admin");
    assert.equal(JSON.parse(requests[1].body.content).text, "open id ping");
    assert.equal(requests[2].path, "/open-apis/im/v1/messages?receive_id_type=user_id");
    assert.equal(requests[2].body.receive_id, "u_admin");
    assert.equal(JSON.parse(requests[2].body.content).text, "user id ping");
  });
});

test("native Channel Connectors Feishu transport sends markdown post to open_id targets", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_post_receive_id",
      appSecret: "test-secret",
    };

    const result = await sendFeishuPostMessage(transport, {
      receiveId: "ou_admin",
      receiveIdType: "open_id",
      content: "**hello**\n\n```text\npost\n```",
    }, cachePath);

    assert.equal(result.ok, true);
    assert.equal(result.action, "send-post");
    assert.equal(result.requestCount, 2);
    assert.equal(result.tokenCache, "miss");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages?receive_id_type=open_id");
    assert.equal(requests[1].body.receive_id, "ou_admin");
    assert.equal(requests[1].body.msg_type, "post");
    assert.deepEqual(JSON.parse(requests[1].body.content), {
      zh_cn: {
        content: [[{ tag: "md", text: "**hello**\n\n```text\npost\n```" }]],
      },
    });
  });
});

test("native Channel Connectors Feishu transport preserves group mention at-tags in text and post payloads", async () => {
  await withMockFeishuServer(async (apiUrl, requests) => {
    const root = makeTempRoot();
    const cachePath = path.join(root, "feishu-token-cache.json");
    const transport = {
      apiUrl,
      appId: "cli_at_tag",
      appSecret: "test-secret",
    };
    const atTagged = '<at user_id="ou_helper">Helper</at> 请看一下';

    const text = await sendFeishuTextMessage(transport, {
      receiveId: "oc_group",
      receiveIdType: "chat_id",
      content: atTagged,
    }, cachePath);
    const post = await sendFeishuPostMessage(transport, {
      receiveId: "oc_group",
      receiveIdType: "chat_id",
      content: `${atTagged}\n\n**markdown**`,
    }, cachePath);

    assert.equal(text.ok, true);
    assert.equal(post.ok, true);
    assert.equal(text.tokenCache, "miss");
    assert.equal(post.tokenCache, "hit");
    assert.equal(requests[0].path, "/open-apis/auth/v3/tenant_access_token/internal");
    assert.equal(requests[1].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[1].body.receive_id, "oc_group");
    assert.equal(requests[1].body.msg_type, "text");
    assert.equal(JSON.parse(requests[1].body.content).text, atTagged);
    assert.equal(requests[2].path, "/open-apis/im/v1/messages?receive_id_type=chat_id");
    assert.equal(requests[2].body.receive_id, "oc_group");
    assert.equal(requests[2].body.msg_type, "post");
    assert.equal(
      JSON.parse(requests[2].body.content).zh_cn.content[0][0].text,
      `${atTagged}\n\n**markdown**`,
    );
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

test("native Channel Connectors Feishu command replies use progress reactions and reply-to context", () => {
  const daemonSource = fs.readFileSync(path.join(process.cwd(), "apps/api/modules/channel-connectors/daemon.ts"), "utf8");
  assert.match(daemonSource, /shouldStartFeishuCommandTypingReaction/);
  assert.match(daemonSource, /eventKindPrefix:\s*"channel\.command\.reaction"/);
  assert.match(daemonSource, /replyToMessageId:\s*messageId/);
  assert.match(daemonSource, /replyToMessageId:\s*input\.messageId/);
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

test("native Channel Connectors process runner keeps Codex structured command output visible", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "bash -lc nested",
        exit_code: 7,
        output: {
          stdout: "nested ok\n",
          stderr: "nested err\n",
        },
      },
    }),
    JSON.stringify({
      type: "item.completed",
      item: {
        type: "command_execution",
        command: "bash -lc direct",
        exit_code: 8,
        stdout: "direct ok\n",
        stderr: "direct err\n",
      },
    }),
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
  assert.equal(progress.length, 2);
  assert.match(progress[0].text, /exit=7/);
  assert.match(progress[0].text, /stdout:\nnested ok/);
  assert.match(progress[0].text, /stderr:\nnested err/);
  assert.match(progress[1].text, /exit=8/);
  assert.match(progress[1].text, /stdout:\ndirect ok/);
  assert.match(progress[1].text, /stderr:\ndirect err/);
  assert.equal(result.progressEvents?.length, 2);
});

test("native Channel Connectors process runner maps Codex reasoning summaries as thinking progress", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "item.completed", item: { type: "reasoning", summary: ["先检查上下文。", "再执行命令。"] } }),
    JSON.stringify({ type: "item.completed", item: { type: "reasoning", summary_text: "使用 summary_text 兜底。" } }),
    JSON.stringify({ type: "item.completed", item: { type: "reasoning", content: ["使用 content 兜底。"] } }),
    JSON.stringify({ type: "item.completed", item: { type: "reasoning" } }),
    JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "最终回复。" } }),
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
  const reasoning = progress.filter((event) => event.type === "reasoning");
  assert.deepEqual(reasoning.map((event) => event.text), [
    "先检查上下文。\n再执行命令。",
    "使用 summary_text 兜底。",
    "使用 content 兜底。",
  ]);
  assert.equal(progress.some((event) => event.text === "reasoning"), false);
  assert.equal(result.progressEvents?.filter((event) => event.type === "reasoning").length, 3);
});

test("native Channel Connectors Codex app-server maps reasoning summaries without fake thinking", async () => {
  const root = makeTempRoot();
  const progress = [];
  class FakeCodexAppServerTransport {
    callbacks = [];
    closeCallbacks = [];
    send(message) {
      if (message.method === "initialize") {
        queueMicrotask(() => this.emit({ id: message.id, result: { userAgent: "fake-codex-app-server" } }));
        return;
      }
      if (message.method === "initialized") return;
      if (message.method === "thread/start") {
        queueMicrotask(() => this.emit({ id: message.id, result: { thread: { id: "thread-reasoning" } } }));
        return;
      }
      if (message.method === "turn/start") {
        const turnId = "turn-reasoning";
        queueMicrotask(() => this.emit({ id: message.id, result: { turn: { id: turnId, status: "running" } } }));
        setTimeout(() => {
          this.emit({ method: "turn/started", params: { threadId: "thread-reasoning", turn: { id: turnId, status: "running" } } });
          this.emit({ method: "item/completed", params: { threadId: "thread-reasoning", turnId, item: { type: "reasoning", summary: ["先规划。", "再执行。"] } } });
          this.emit({ method: "item/completed", params: { threadId: "thread-reasoning", turnId, item: { type: "reasoning", content: ["content 兜底。"] } } });
          this.emit({ method: "item/completed", params: { threadId: "thread-reasoning", turnId, item: { type: "reasoning" } } });
          this.emit({ method: "item/completed", params: { threadId: "thread-reasoning", turnId, item: { type: "agentMessage", text: "最终回复。" } } });
          this.emit({ method: "turn/completed", params: { threadId: "thread-reasoning", turn: { id: turnId, status: "completed" } } });
        }, 0);
        return;
      }
      queueMicrotask(() => this.emit({ id: message.id, error: { code: -32601, message: `unexpected ${message.method}` } }));
    }
    close() {
      for (const callback of this.closeCallbacks) callback(null);
    }
    onMessage(callback) {
      this.callbacks.push(callback);
    }
    onClose(callback) {
      this.closeCallbacks.push(callback);
    }
    emit(message) {
      for (const callback of this.callbacks) callback(message);
    }
  }

  const project = {
    id: "codex-app-server-reasoning",
    name: "Codex App Server Reasoning",
    agent: "codex",
    model: "gpt-5",
    workDir: root,
    permissionMode: "yolo",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "codex",
    platformBindings: [],
  };
  const binding = {
    id: "octo-codex-reasoning",
    platform: "octo",
    accountId: "octo-account",
    botId: "robot-1",
    displayName: "Octo Codex Reasoning",
    enabled: true,
    allowlist: [],
    adminUsers: [],
    metadata: { agentSessionDriver: "persistent" },
  };
  const session = new CodexAppServerSession({
    transport: new FakeCodexAppServerTransport(),
    sessionId: "codex-app-server:test",
    model: "gpt-5",
    cwd: root,
    permissionMode: "yolo",
    requestTimeoutMs: 1000,
    turnTimeoutMs: 1000,
  });

  const result = await session.runTurn({
    mode: "persistent",
    key: {
      bindingId: binding.id,
      projectId: project.id,
      sessionKey: "octo:dm:user-1",
      agent: "codex",
      model: "gpt-5",
      workDir: root,
      permissionMode: "yolo",
    },
    messageId: "m-codex-app-reasoning",
    agentTurnRequest: {
      project,
      binding,
      message: {
        messageId: "m-codex-app-reasoning",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        timestamp: Date.now(),
        payload: { type: 1, content: "请展示思考流。" },
      },
      sessionKey: "octo:dm:user-1",
      gatewayEndpoint: project.gatewayEndpoint,
      gatewayClientKey: "sk-local",
      agentRuntimeDir: root,
    },
    onProgress: (event) => progress.push(event),
    runOneShot: async () => {
      throw new Error("Codex app-server reasoning test must not fall back to one-shot");
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.replyText, "最终回复。");
  const reasoning = progress.filter((event) => event.type === "reasoning");
  assert.deepEqual(reasoning.map((event) => event.text), ["先规划。\n再执行。", "content 兜底。"]);
  assert.equal(progress.some((event) => event.text === "reasoning"), false);
  assert.equal(result.progress.eventCount, progress.length);
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

test("native Channel Connectors process runner keeps Claude structured tool output visible", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({
      type: "assistant",
      message: {
        content: [
          { type: "tool_use", id: "toolu_bash_1", name: "Bash", input: { command: "printf ok; printf err >&2; exit 7" } },
        ],
      },
    }),
    JSON.stringify({
      type: "user",
      message: {
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_bash_1",
            content: [{ type: "json", stdout: "ok\n", stderr: "err\n", exit_code: 7 }],
          },
        ],
      },
    }),
    JSON.stringify({ type: "result", result: "Claude structured output done." }),
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
  const toolResult = progress.find((event) => event.itemType === "tool_result");
  assert.ok(toolResult);
  assert.equal(toolResult.toolName, "Bash");
  assert.match(toolResult.text || "", /stdout:\nok/);
  assert.match(toolResult.text || "", /stderr:\nerr/);
  assert.match(toolResult.text || "", /exit_code: 7/);
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

test("native Channel Connectors process runner keeps OpenCode structured tool output visible", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "step_start", part: { type: "step-start", sessionID: "opencode-structured-tool-output" } }),
    JSON.stringify({
      type: "tool_use",
      part: {
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          input: { command: "printf ok; printf err >&2; exit 7" },
          output: {
            stdout: "ok\n",
            stderr: "err\n",
            exitCode: 7,
          },
        },
      },
    }),
    JSON.stringify({ type: "text", messageID: "assistant-message", timestamp: 2, part: { type: "text", messageID: "assistant-message", text: "OpenCode structured output done." } }),
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
  const toolResult = progress.find((event) => event.rawType === "tool_result");
  assert.ok(toolResult);
  assert.equal(toolResult.toolName, "bash");
  assert.match(toolResult.text || "", /stdout:\nok/);
  assert.match(toolResult.text || "", /stderr:\nerr/);
  assert.match(toolResult.text || "", /exit_code: 7/);
  assert.equal(progress.find((event) => event.type === "assistant")?.phase, "final");
  assert.equal(result.progressEvents?.length, 5);
});

test("native Channel Connectors process runner keeps mixed content tool output visible across agents", async () => {
  const root = makeTempRoot();
  const cases = [
    {
      agent: "codex",
      stdout: [
        JSON.stringify({
          type: "item.completed",
          item: {
            type: "command_execution",
            command: "bash -lc mixed",
            exit_code: 2,
            output: [
              { type: "text", text: "codex prelude" },
              { type: "json", stdout: "codex out\n", stderr: "codex err\n", exit_code: 2 },
              { type: "text", text: "codex epilogue" },
            ],
          },
        }),
        "",
      ].join("\n"),
      find: (progress) => progress.find((event) => event.type === "tool"),
      expected: ["codex prelude", "stdout:\ncodex out", "stderr:\ncodex err", "exit_code: 2", "codex epilogue"],
    },
    {
      agent: "claude-code",
      stdout: [
        JSON.stringify({
          type: "assistant",
          message: {
            content: [
              { type: "tool_use", id: "toolu_mixed_1", name: "Bash", input: { command: "bash -lc mixed" } },
            ],
          },
        }),
        JSON.stringify({
          type: "user",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "toolu_mixed_1",
                content: [
                  { type: "text", text: "claude prelude" },
                  { type: "json", stdout: "claude out\n", stderr: "claude err\n", exit_code: 3 },
                  { type: "text", text: "claude epilogue" },
                ],
              },
            ],
          },
        }),
        JSON.stringify({ type: "result", result: "Claude mixed output done." }),
        "",
      ].join("\n"),
      find: (progress) => progress.find((event) => event.itemType === "tool_result"),
      expected: ["claude prelude", "stdout:\nclaude out", "stderr:\nclaude err", "exit_code: 3", "claude epilogue"],
    },
    {
      agent: "opencode",
      stdout: [
        JSON.stringify({
          type: "tool_use",
          part: {
            type: "tool",
            tool: "bash",
            state: {
              status: "completed",
              input: { command: "bash -lc mixed" },
              output: [
                { type: "text", text: "opencode prelude" },
                { type: "json", stdout: "opencode out\n", stderr: "opencode err\n", exitCode: 4 },
                { type: "text", text: "opencode epilogue" },
              ],
            },
          },
        }),
        JSON.stringify({ type: "step_finish", part: { type: "step-finish", reason: "done" } }),
        "",
      ].join("\n"),
      find: (progress) => progress.find((event) => event.rawType === "tool_result"),
      expected: ["opencode prelude", "stdout:\nopencode out", "stderr:\nopencode err", "exit_code: 4", "opencode epilogue"],
    },
  ];

  for (const item of cases) {
    const progress = [];
    const childScript = `process.stdout.write(${JSON.stringify(item.stdout)});`;
    const result = await defaultChannelConnectorAgentProcessRunner({
      command: process.execPath,
      args: ["-e", childScript],
      cwd: root,
      stdin: "",
      env: {},
      timeoutMs: 1000,
      agent: item.agent,
      onProgress: (event) => progress.push(event),
    });

    assert.equal(result.exitCode, 0, item.agent);
    assert.equal(result.error, null, item.agent);
    const toolResult = item.find(progress);
    assert.ok(toolResult, item.agent);
    for (const expected of item.expected) {
      assert.match(toolResult.text || "", new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), item.agent);
    }
  }
});

test("native Channel Connectors OpenCode DB fallback keeps tool results and final reply separate", async () => {
  const root = makeTempRoot();
  const workDir = path.join(root, "work");
  const agentRuntimeDir = path.join(root, "agent-runtime");
  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(path.join(agentRuntimeDir, "opencode-data", "opencode"), { recursive: true });
  fs.writeFileSync(path.join(agentRuntimeDir, "opencode-data", "opencode", "opencode.db"), "", "utf8");

  fs.writeFileSync(path.join(fakeBin, "opencode"), [
    "#!/usr/bin/env node",
    "process.exit(0);",
    "",
  ].join("\n"), { mode: 0o755 });

  const sqliteRows = [
    {
      message_id: "assistant-process",
      message_data: JSON.stringify({ role: "assistant", time: { created: 10 } }),
      part_data: JSON.stringify({ type: "text", text: "我先读取文件。" }),
      part_time_created: Date.now() + 1,
    },
    {
      message_id: "assistant-process",
      message_data: JSON.stringify({ role: "assistant", time: { created: 11 } }),
      part_data: JSON.stringify({
        type: "tool",
        tool: "bash",
        state: {
          status: "completed",
          title: "Read TOOLS",
          input: { command: "cat TOOLS.md" },
          output: "alpha\nbeta",
        },
      }),
      part_time_created: Date.now() + 2,
    },
    {
      message_id: "assistant-final",
      message_data: JSON.stringify({ role: "assistant", time: { created: 12 } }),
      part_data: JSON.stringify({ type: "text", text: "最终回复。" }),
      part_time_created: Date.now() + 3,
    },
    {
      message_id: "assistant-final",
      message_data: JSON.stringify({ role: "assistant", time: { created: 13 } }),
      part_data: JSON.stringify({ type: "step-finish", reason: "stop" }),
      part_time_created: Date.now() + 4,
    },
  ];
  fs.writeFileSync(path.join(fakeBin, "sqlite3"), [
    "#!/usr/bin/env node",
    "const query = process.argv[process.argv.length - 1] || '';",
    "if (query.includes('select id from session')) {",
    `  console.log(${JSON.stringify(JSON.stringify([{ id: "opencode-db-session" }]))});`,
    "} else {",
    `  console.log(${JSON.stringify(JSON.stringify(sqliteRows))});`,
    "}",
    "",
  ].join("\n"), { mode: 0o755 });

  const oldPath = process.env.PATH || "";
  process.env.PATH = `${fakeBin}:${oldPath}`;
  try {
    const progress = [];
    const result = await runChannelConnectorAgentTurn({
      project: {
        id: "opencode-db",
        name: "OpenCode DB",
        workDir,
        agent: "opencode",
        model: "gpt-5",
        permissionMode: "yolo",
        gatewayEndpoint: "http://127.0.0.1:18796/v1",
        gatewayKeyRef: "studio-gateway-client-key",
        appProfileRef: "opencode",
        platformBindings: [],
      },
      binding: {
        id: "octo-opencode-db",
        platform: "octo",
        accountId: "octo-account",
        botId: "robot-1",
        displayName: "Octo OpenCode",
        agent: "opencode",
        enabled: true,
        allowlist: [],
        adminUsers: [],
        metadata: {},
      },
      message: {
        messageId: "m-opencode-db",
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        payload: { type: 1, content: "run with DB fallback" },
      },
      sessionKey: "dmwork:dm:user-1",
      gatewayEndpoint: "http://127.0.0.1:18796/v1",
      gatewayClientKey: "sk-local",
      agentRuntimeDir,
      onProgress: (event) => progress.push(event),
    });

    assert.equal(result.ok, true);
    assert.equal(result.replyText, "最终回复。");
    assert.equal(result.session.agentNativeSessionId, "opencode-db-session");
    const assistantProgress = progress.filter((event) => event.type === "assistant");
    assert.deepEqual(assistantProgress.map((event) => event.text), ["我先读取文件。", "最终回复。"]);
    assert.deepEqual(assistantProgress.map((event) => event.phase), ["intermediate", "final"]);
    assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[0]), true);
    assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[1]), false);
    const toolResult = progress.find((event) => event.rawType === "tool_result");
    assert.ok(toolResult);
    assert.equal(toolResult.toolName, "bash");
    assert.match(toolResult.text || "", /output:\nalpha\nbeta/);
  } finally {
    process.env.PATH = oldPath;
  }
});

test("native Channel Connectors persistent Claude and OpenCode drivers run native compact in live sessions", async () => {
  const root = makeTempRoot();
  const workDir = path.join(root, "work");
  const agentRuntimeDir = path.join(root, "agent-runtime");
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "native-compact-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  fs.writeFileSync(path.join(fakeBin, "claude"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "function record(value) { fs.appendFileSync(process.env.STUDIO_NATIVE_COMPACT_CAPTURE, JSON.stringify({ cli: 'claude', pid: process.pid, ...value }) + '\\n'); }",
    "rl.on('line', (line) => {",
    "  if (!line.trim()) return;",
    "  const message = JSON.parse(line);",
    "  const content = message.message && message.message.content;",
    "  const text = typeof content === 'string' ? content : JSON.stringify(content);",
    "  record({ argv: process.argv.slice(2), text });",
    "  emit({ type: 'system', session_id: 'claude-live-session' });",
    "  if (text.includes('/compact')) {",
    "    emit({ type: 'result', session_id: 'claude-live-session' });",
    "    return;",
    "  }",
    "  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'Claude normal reply.' }] } });",
    "  emit({ type: 'result', result: 'Claude normal reply.', session_id: 'claude-live-session' });",
    "});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });

  fs.writeFileSync(path.join(fakeBin, "opencode"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const path = require('node:path');",
    "const args = process.argv.slice(2);",
    "const dataHome = process.env.XDG_DATA_HOME || '';",
    "if (dataHome) {",
    "  fs.mkdirSync(path.join(dataHome, 'opencode'), { recursive: true });",
    "  fs.writeFileSync(path.join(dataHome, 'opencode', 'opencode.db'), '');",
    "}",
    "const prompt = args.includes('--') ? args.slice(args.indexOf('--') + 1).join(' ') : '';",
    "fs.appendFileSync(process.env.STUDIO_NATIVE_COMPACT_CAPTURE, JSON.stringify({ cli: 'opencode', argv: args, prompt }) + '\\n');",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "emit({ type: 'step_start', part: { type: 'step-start', sessionID: 'opencode-live-session' } });",
    "if (!prompt.includes('/compact')) {",
    "  emit({ type: 'text', messageID: 'opencode-normal', part: { type: 'text', messageID: 'opencode-normal', text: 'OpenCode normal reply.' } });",
    "}",
    "emit({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop' } });",
    "",
  ].join("\n"), { mode: 0o755 });

  fs.writeFileSync(path.join(fakeBin, "sqlite3"), [
    "#!/usr/bin/env node",
    "const query = process.argv[process.argv.length - 1] || '';",
    "if (query.includes('select id from session')) console.log(JSON.stringify([{ id: 'opencode-live-session' }]));",
    "else console.log(JSON.stringify([]));",
    "",
  ].join("\n"), { mode: 0o755 });

  const oldPath = process.env.PATH || "";
  const oldCapture = process.env.STUDIO_NATIVE_COMPACT_CAPTURE;
  process.env.PATH = `${fakeBin}:${oldPath}`;
  process.env.STUDIO_NATIVE_COMPACT_CAPTURE = capturePath;
  try {
    const pool = new ChannelConnectorAgentSessionDriverPool({
      factory: createNativeCliSessionDriverFactory({
        codexFactory: {
          create() {
            throw new Error("Codex factory should not be used by this test.");
          },
        },
        requestTimeoutMs: 1000,
        turnTimeoutMs: 1000,
      }),
      idleTimeoutMs: 60_000,
      maxSessions: 4,
      fallbackOnCrash: false,
    });
    let claudeProject = null;
    let opencodeProject = null;
    const binding = {
      id: "octo-native-compact",
      platform: "octo",
      accountId: "octo-account",
      botId: "robot-1",
      displayName: "Octo Native Compact",
      enabled: true,
      allowlist: [],
      adminUsers: [],
      metadata: { agentSessionDriver: "persistent" },
    };
    const keyFor = (project) => ({
      bindingId: binding.id,
      projectId: project.id,
      sessionKey: "dmwork:dm:user-1",
      agent: project.agent,
      model: project.model,
      workDir: project.workDir,
      permissionMode: project.permissionMode,
    });
    try {
      const message = (messageId, content) => ({
        messageId,
        fromUid: "user-1",
        channelId: "user-1",
        channelType: 1,
        timestamp: Date.now(),
        payload: { type: 1, content },
      });
      const baseProject = {
        id: "agent-native-compact",
        name: "Agent Native Compact",
        agent: "claude-code",
        model: "gpt-5",
        workDir,
        permissionMode: "yolo",
        gatewayEndpoint: "http://127.0.0.1:18796/v1",
        gatewayKeyRef: "studio-gateway-client-key",
        appProfileRef: "agent",
        platformBindings: [binding],
      };
      const runDriverTurn = (project, messageId, content, session = null, nativeCommand = null) => pool.runTurn({
        mode: "persistent",
        key: keyFor(project),
        messageId,
        agentTurnRequest: {
          project,
          binding: { ...binding, agent: project.agent },
          message: message(messageId, content),
          sessionKey: "dmwork:dm:user-1",
          gatewayEndpoint: project.gatewayEndpoint,
          gatewayClientKey: "sk-local",
          agentRuntimeDir,
          session,
          nativeCommand,
        },
        runOneShot: async () => {
          throw new Error("persistent native compact must not fall back to one-shot in this regression");
        },
      });

      claudeProject = { ...baseProject, agent: "claude-code", appProfileRef: "claude-code" };
      const claudeNormal = await runDriverTurn(claudeProject, "m-claude-normal", "hello claude");
      assert.equal(claudeNormal.ok, true);
      assert.equal(claudeNormal.replyText, "Claude normal reply.");
      assert.equal(claudeNormal.session.agentNativeSessionId, "claude-live-session");
      const claudeCompact = await runDriverTurn(
        claudeProject,
        "m-claude-compact",
        "/compact",
        { agentNativeSessionId: claudeNormal.session.agentNativeSessionId },
        "/compact",
      );
      assert.equal(claudeCompact.ok, true);
      assert.equal(claudeCompact.replyText, "Claude Code compact 已完成。");

      opencodeProject = { ...baseProject, agent: "opencode", appProfileRef: "opencode" };
      const opencodeNormal = await runDriverTurn(opencodeProject, "m-opencode-normal", "hello opencode");
      assert.equal(opencodeNormal.ok, true);
      assert.equal(opencodeNormal.replyText, "OpenCode normal reply.");
      assert.equal(opencodeNormal.session.agentNativeSessionId, "opencode-live-session");
      const opencodeCompact = await runDriverTurn(
        opencodeProject,
        "m-opencode-compact",
        "/compact",
        { agentNativeSessionId: opencodeNormal.session.agentNativeSessionId },
        "/compact",
      );
      assert.equal(opencodeCompact.ok, true);
      assert.equal(opencodeCompact.replyText, "OpenCode compact 已完成。");

      const capture = fs.readFileSync(capturePath, "utf8")
        .trim()
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      const claudeNormalCapture = capture.find((entry) => entry.cli === "claude" && entry.text.includes("hello claude"));
      const claudeCompactCapture = capture.find((entry) => entry.cli === "claude" && entry.text.includes("/compact"));
      assert.ok(claudeNormalCapture);
      assert.ok(claudeCompactCapture);
      assert.equal(claudeCompactCapture.pid, claudeNormalCapture.pid);
      assert.ok(claudeCompactCapture.argv.includes("--input-format"));
      assert.ok(claudeCompactCapture.argv.includes("stream-json"));
      const opencodeCompactCapture = capture.find((entry) => entry.cli === "opencode" && entry.prompt.includes("/compact"));
      assert.ok(opencodeCompactCapture);
      assert.ok(opencodeCompactCapture.argv.includes("--session"));
      assert.equal(opencodeCompactCapture.argv[opencodeCompactCapture.argv.indexOf("--session") + 1], "opencode-live-session");
    } finally {
      if (claudeProject) await pool.killSession(keyFor(claudeProject), "test-cleanup");
      if (opencodeProject) await pool.killSession(keyFor(opencodeProject), "test-cleanup");
    }
  } finally {
    process.env.PATH = oldPath;
    if (oldCapture === undefined) delete process.env.STUDIO_NATIVE_COMPACT_CAPTURE;
    else process.env.STUDIO_NATIVE_COMPACT_CAPTURE = oldCapture;
  }
});

test("native Channel Connectors persistent Claude driver keeps intermediate text out of final reply", async () => {
  const root = makeTempRoot();
  const workDir = path.join(root, "work");
  const agentRuntimeDir = path.join(root, "agent-runtime");
  const fakeBin = path.join(root, "fake-bin");
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.mkdirSync(workDir, { recursive: true });

  fs.writeFileSync(path.join(fakeBin, "claude"), [
    "#!/usr/bin/env node",
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "rl.on('line', (line) => {",
    "  if (!line.trim()) return;",
    "  emit({ type: 'system', session_id: 'claude-process-session' });",
    "  emit({ type: 'assistant', message: { content: [{ type: 'text', text: '先说明一下，我会读取文件。' }] } });",
    "  emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'toolu_read_1', name: 'Read', input: { file_path: 'TOOLS.md' } }] } });",
    "  emit({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'toolu_read_1', content: [{ type: 'json', stdout: 'line 1\\n', stderr: 'warn 1\\n', exit_code: 0 }] }] } });",
    "  emit({ type: 'assistant', message: { content: [{ type: 'text', text: '最终回复。' }] } });",
    "  emit({ type: 'result', session_id: 'claude-process-session' });",
    "});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });

  const oldPath = process.env.PATH || "";
  process.env.PATH = `${fakeBin}:${oldPath}`;
  const pool = new ChannelConnectorAgentSessionDriverPool({
    factory: createNativeCliSessionDriverFactory({
      codexFactory: {
        create() {
          throw new Error("Codex factory should not be used by this test.");
        },
      },
      requestTimeoutMs: 1000,
      turnTimeoutMs: 1000,
    }),
    idleTimeoutMs: 60_000,
    maxSessions: 1,
    fallbackOnCrash: false,
  });
  const progress = [];
  const binding = {
    id: "octo-claude-process",
    platform: "octo",
    accountId: "octo-account",
    botId: "robot-1",
    displayName: "Octo Claude Process",
    enabled: true,
    allowlist: [],
    adminUsers: [],
    metadata: { agentSessionDriver: "persistent" },
  };
  const project = {
    id: "claude-process",
    name: "Claude Process",
    agent: "claude-code",
    model: "gpt-5",
    workDir,
    permissionMode: "yolo",
    gatewayEndpoint: "http://127.0.0.1:18796/v1",
    gatewayKeyRef: "studio-gateway-client-key",
    appProfileRef: "claude-code",
    platformBindings: [binding],
  };
  const key = {
    bindingId: binding.id,
    projectId: project.id,
    sessionKey: "dmwork:dm:user-1",
    agent: project.agent,
    model: project.model,
    workDir: project.workDir,
    permissionMode: project.permissionMode,
  };
  try {
    const result = await pool.runTurn({
      mode: "persistent",
      key,
      messageId: "m-claude-process",
      agentTurnRequest: {
        project,
        binding: { ...binding, agent: project.agent },
        message: {
          messageId: "m-claude-process",
          fromUid: "user-1",
          channelId: "user-1",
          channelType: 1,
          timestamp: Date.now(),
          payload: { type: 1, content: "please run with process text" },
        },
        sessionKey: "dmwork:dm:user-1",
        gatewayEndpoint: project.gatewayEndpoint,
        gatewayClientKey: "sk-local",
        agentRuntimeDir,
        onProgress: (event) => progress.push(event),
      },
      runOneShot: async () => {
        throw new Error("persistent Claude process reply test must not fall back to one-shot");
      },
    });

    assert.equal(result.ok, true);
    assert.equal(result.replyText, "最终回复。");
    assert.doesNotMatch(result.replyText || "", /先说明/);
    const assistantProgress = progress.filter((event) => event.type === "assistant");
    assert.deepEqual(assistantProgress.map((event) => event.text), ["先说明一下，我会读取文件。", "最终回复。"]);
    assert.deepEqual(assistantProgress.map((event) => event.phase), ["intermediate", "final"]);
    assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[0]), true);
    assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[1]), false);
    const toolResult = progress.find((event) => event.itemType === "tool_result");
    assert.ok(toolResult);
    assert.equal(toolResult.toolName, "Read");
    assert.match(toolResult.text || "", /stdout:\nline 1/);
    assert.match(toolResult.text || "", /stderr:\nwarn 1/);
    assert.match(toolResult.text || "", /exit_code: 0/);
  } finally {
    await pool.killSession(key, "test-cleanup");
    process.env.PATH = oldPath;
  }
});

test("native Channel Connectors process runner treats OpenCode tool-calls step finish as process boundary", async () => {
  const root = makeTempRoot();
  const progress = [];
  const stdout = [
    JSON.stringify({ type: "step_start", part: { type: "step-start", sessionID: "opencode-session-process" } }),
    JSON.stringify({ type: "text", messageID: "assistant-message-1", part: { type: "text", messageID: "assistant-message-1", text: "我先查一下群成员。" } }),
    JSON.stringify({ type: "step_finish", part: { type: "step-finish", reason: "tool-calls" } }),
    JSON.stringify({ type: "step_start", part: { type: "step-start", sessionID: "opencode-session-process" } }),
    JSON.stringify({
      type: "tool_use",
      part: {
        type: "tool",
        tool: "octo-group-members",
        state: {
          status: "completed",
          input: { groupNo: "group-1" },
          output: "Alice\nstudio-cc",
        },
      },
    }),
    JSON.stringify({ type: "text", messageID: "assistant-message-2", part: { type: "text", messageID: "assistant-message-2", text: "最终汇总。" } }),
    JSON.stringify({ type: "step_finish", part: { type: "step-finish", reason: "stop" } }),
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
  const assistantProgress = progress.filter((event) => event.type === "assistant");
  assert.deepEqual(assistantProgress.map((event) => event.text), ["我先查一下群成员。", "最终汇总。"]);
  assert.deepEqual(assistantProgress.map((event) => event.phase), ["intermediate", "final"]);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[0]), true);
  assert.equal(isChannelConnectorProcessProgressEvent(assistantProgress[1]), false);
  const toolCallBoundary = progress.find((event) => event.rawType === "step_finish" && event.text === "tool-calls");
  assert.ok(toolCallBoundary);
  assert.equal(toolCallBoundary.type, "event");
  assert.equal(progress.at(-1).type, "completed");
  assert.equal(progress.at(-1).text, "stop");
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
  assert.match(daemonSource, /renderFeishuOutboundMessageContent/);
  assert.match(daemonSource, /outboundMessageNativeMentionIds/);
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
  assert.match(daemonSource, /DEFAULT_FEISHU_REALTIME_TIMELINE_LIMIT\s*=\s*CHANNEL_CONNECTOR_HISTORY_CONTEXT_LIMIT/);
  assert.match(daemonSource, /MAX_FEISHU_REALTIME_TIMELINE_PER_CHANNEL\s*=\s*60/);
  assert.match(daemonSource, /const feishuTimelines = new Map\(\)/);
  assert.match(daemonSource, /function recordFeishuRealtimeTimeline/);
  assert.match(daemonSource, /function renderFeishuRealtimeTimelineContext/);
  assert.match(daemonSource, /feishu_group_message_not_directed[\s\S]{0,260}timelineRecorded/);
  assert.match(daemonSource, /const feishuRealtimeHistoryContext = renderFeishuRealtimeTimelineContext/);
  assert.match(daemonSource, /\[\s*feishuThreadBootstrapContext\?\.context \|\| null,\s*feishuRealtimeHistoryContext,\s*localHistoryContext,\s*\]/);
  assert.match(daemonSource, /Messages were observed by this Studio daemon in real time, including group messages that did not @mention this bot/);
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
  assert.match(daemonSource, /if \(event\.type === "assistant"\)[\s\S]{0,80}return shortMessage\(event\.text,\s*900\)/);
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
  assert.match(daemonSource, /send-final-post/);
  assert.match(daemonSource, /send-final-text-after-post/);
  assert.match(daemonSource, /FEISHU_FINAL_REPLY_PRIVATE_BUFFER_PREVIEW_RUNES\s*=\s*1_?600/);
  assert.doesNotMatch(daemonSource, /FEISHU_ACTION_RESULT_HISTORY_JSON_RUNES/);
  assert.doesNotMatch(daemonSource, /function summarizeFeishuActionResultForUser/);
  assert.doesNotMatch(daemonSource, /function feishuActionResultsHistoryText/);
  assert.doesNotMatch(daemonSource, /Feishu 能力执行结果/);
  assert.doesNotMatch(daemonSource, /status:\s*"feishu-action-results"/);
  assert.match(daemonSource, /shouldUseFeishuProgressPermissionPrompt\(binding,\s*parsed\.channelId,\s*request\)/);
  assert.match(daemonSource, /const forcePreviewBuffer = agent\.ok === true && replyRunes > FEISHU_FINAL_REPLY_CARD_MAX_RUNES/);
  assert.match(daemonSource, /thresholdRunes:\s*replyIsGroup \? undefined : FEISHU_FINAL_REPLY_CARD_MAX_RUNES/);
  assert.match(daemonSource, /previewRunes:\s*replyIsGroup \? undefined : FEISHU_FINAL_REPLY_PRIVATE_BUFFER_PREVIEW_RUNES/);
  assert.match(daemonSource, /plain text is the last delivery fallback only/);
  assert.match(daemonSource, /function renderFeishuProgressCardEventElements/);
  assert.match(daemonSource, /function feishuProgressCardStatusTag/);
  assert.match(daemonSource, /function feishuProgressCardEntryLimit/);
  assert.match(daemonSource, /"feishuProgressCardEntryLimit"/);
  assert.match(daemonSource, /function trimFeishuProgressCardEntries/);
  assert.match(daemonSource, /createFeishuProgressCardState\(feishuProgressCardEntryLimit\(binding\)\)/);
  assert.doesNotMatch(daemonSource, /slice\(-8\)/);
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
  assert.match(daemonSource, /OCTO_PROGRESS_REPLY_TIMEOUT_MS\s*=\s*5_000/);
  assert.match(daemonSource, /log\.eventKind === "agent\.progress\.reply" \? OCTO_PROGRESS_REPLY_TIMEOUT_MS : null/);
  assert.match(daemonSource, /sendOctoTextReply\(transport,\s*replyPlan,\s*\{\s*timeoutMs:\s*replyTimeoutMs/);
  assert.match(daemonSource, /replyDurationMs/);
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
  assert.match(daemonSource, /if \(entry\.kind === "assistant"\)[\s\S]{0,80}return shortMessage\(entry\.text,\s*900\)/);
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

test("native Channel Connectors daemon keeps Feishu compact native-first before Gateway fallback", () => {
  const daemonSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/daemon.ts"),
    "utf8",
  );
  const feishuDispatch = daemonSource.slice(
    daemonSource.indexOf("async function dispatchFeishuParsedEvent"),
    daemonSource.indexOf("function dispatchFeishuParsedEventInBackground"),
  );
  assert.match(feishuDispatch, /handleChannelConnectorCommand\(\{/);
  const nativeIndex = feishuDispatch.indexOf("nativeCompactConversation: (scope) => nativeCompactChannelConnectorConversation");
  const fallbackIndex = feishuDispatch.indexOf("compactConversation: (scope) => compactChannelConnectorConversation");
  assert.ok(nativeIndex > 0, "Feishu dispatch must wire nativeCompactConversation");
  assert.ok(fallbackIndex > 0, "Feishu dispatch must still wire Gateway compact fallback");
  assert.ok(nativeIndex < fallbackIndex, "Feishu dispatch must offer native compact before Gateway fallback");
  assert.match(feishuDispatch, /binding,\s*sessionKey:\s*scope\.sessionKey,\s*project:\s*scope\.project,\s*message:\s*scope\.message,/);
  assert.match(feishuDispatch, /gatewayClientKey:\s*key/);

  const nativeCompact = daemonSource.slice(
    daemonSource.indexOf("async function nativeCompactChannelConnectorConversation"),
    daemonSource.indexOf("interface GatewayRuntimeLogEntryForUsage"),
  );
  assert.match(nativeCompact, /input\.binding\.platform === "feishu"\s*\?\s*input\.config\.paths\.feishuEvents\s*:\s*input\.config\.paths\.octoEvents/);
  assert.match(nativeCompact, /eventKind:\s*"agent\.native_compact\.finished"/);
  assert.match(nativeCompact, /eventKind:\s*"agent\.native_compact\.failed"/);
  assert.match(nativeCompact, /fallbackAllowed:\s*result\.ok !== true/);
});

test("native Channel Connectors keeps platform-native group context strategy", () => {
  const daemonSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/daemon.ts"),
    "utf8",
  );
  const feishuThreadSource = fs.readFileSync(
    path.resolve("apps/api/modules/channel-connectors/feishu-thread-bootstrap.ts"),
    "utf8",
  );

  assert.match(daemonSource, /async function loadOctoSyncedHistoryContext/);
  assert.match(daemonSource, /syncOctoMessages\(input\.transport/);
  assert.match(daemonSource, /function renderOctoRealtimeTimelineContext/);
  assert.match(daemonSource, /async function loadOctoMdContext/);
  assert.match(daemonSource, /setOctoHistoryCutoff/);
  assert.match(daemonSource, /\[\s*octoMdContext\.context,\s*syncedHistoryContext\.context,\s*realtimeHistoryContext,\s*localHistoryContext,\s*\]/);
  assert.match(daemonSource, /Messages are segmented by the last successful Studio bot reply/);
  assert.match(daemonSource, /inspect senderType=bot entries here before saying you cannot see the reply/);

  assert.match(daemonSource, /function renderFeishuRealtimeTimelineContext/);
  assert.match(daemonSource, /function recordFeishuRealtimeTimeline/);
  assert.match(daemonSource, /async function resolveFeishuGroupBotIdentity/);
  assert.match(daemonSource, /getFeishuBotInfo\(primaryRef\.transport/);
  assert.match(daemonSource, /function feishuBotMentionCandidateInput/);
  assert.match(daemonSource, /channelConnectorFeishuBotMentionCandidates\(feishuBotMentionCandidateInput\(group, binding\)\)/);
  assert.match(daemonSource, /botOpenId:\s*group\.botOpenId/);
  assert.match(daemonSource, /feishu_group_message_not_directed[\s\S]{0,260}timelineRecorded/);
  assert.match(daemonSource, /\[\s*feishuThreadBootstrapContext\?\.context \|\| null,\s*feishuRealtimeHistoryContext,\s*localHistoryContext,\s*\]/);
  assert.match(feishuThreadSource, /export async function loadFeishuThreadBootstrapContext/);
  assert.match(feishuThreadSource, /getFeishuMessage/);
  assert.match(feishuThreadSource, /listFeishuThreadMessages/);
  assert.match(feishuThreadSource, /function renderFeishuThreadBootstrapContext/);
  assert.match(feishuThreadSource, /function fitEntriesToBudget/);
  assert.match(feishuThreadSource, /\[Feishu thread bootstrap\]/);

  assert.doesNotMatch(daemonSource, /syncFeishuMessages/);
  assert.doesNotMatch(feishuThreadSource, /buildPendingHistoryContextFromMap/);
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
  assert.match(daemonSource, /botIdentityResolvedAt/);
  assert.match(daemonSource, /botIdentityLastError/);
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

test("native Channel Connectors daemon replays queued Octo Agent turns after restart", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-durable-queue-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));",
    "const capture = process.env.STUDIO_TEST_CODEX_CAPTURE;",
    "process.on('SIGTERM', () => {",
    "  fs.appendFileSync(capture, `${JSON.stringify({ event: 'signal', signal: 'SIGTERM', at: Date.now() })}\\n`);",
    "  process.exit(143);",
    "});",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', async () => {",
    "  const marker = stdin.includes('second durable turn') ? 'second' : 'first';",
    "  fs.appendFileSync(capture, `${JSON.stringify({ event: 'start', marker, at: Date.now(), stdin })}\\n`);",
    "  if (marker === 'first') await delay(30000);",
    "  fs.appendFileSync(capture, `${JSON.stringify({ event: 'end', marker, at: Date.now() })}\\n`);",
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
            messageId: 3001,
            messageSeq: 1,
            fromUid: "durable-queue-user",
            channelId: "durable-queue-user",
            channelType: 1,
            payload: {
              type: 1,
              content: "first durable turn",
            },
          }));
          socket.send(encodeOctoRecvPacket({
            serverPrivateKey: serverKey.privateKey,
            clientPublicKeyBase64: packet.clientPublicKeyBase64,
            salt,
            messageId: 3002,
            messageSeq: 2,
            fromUid: "durable-queue-user",
            channelId: "durable-queue-user",
            channelType: 1,
            payload: {
              type: 1,
              content: "second durable turn",
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
        res.end(JSON.stringify({ robot_id: "robot-durable-queue", im_token: "im-token-durable-queue", ws_url: wsUrl }));
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
              id: "codex-durable-queue",
              name: "Codex Durable Queue",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-durable-queue",
          platformBindings: [
            {
              id: "octo-durable-queue",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Durable Queue",
              agentProfileId: "codex-durable-queue",
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
      const configPath = path.join(root, "daemon-durable-queue-config.json");
      fs.mkdirSync(path.dirname(runtimeConfig.paths.log), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2), "utf8");
      const pendingPath = path.join(runtimeConfig.paths.state, "channel-pending-agent-runs.json");
      const daemonEntry = path.resolve("dist/apps/api/modules/channel-connectors/daemon.js");
      const startDaemon = () => {
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
        return { child, stderr: () => stderr };
      };
      const stopDaemon = async (child) => {
        if (child.exitCode !== null) return;
        child.kill("SIGTERM");
        await new Promise((resolve) => {
          child.once("exit", resolve);
          setTimeout(resolve, 6500);
        });
      };

      const firstDaemon = startDaemon();
      try {
        const connectedStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-durable-queue" && item.connected);
          return connected ? response.body : null;
        }, 5000);
        assert.equal(connectedStatus.ok, true);
        assert.equal(wsConnects.length, 1);

        const pending = await waitFor(() => {
          if (!fs.existsSync(pendingPath)) return null;
          const store = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
          return store.records?.some?.((record) => record.messageId === "3002") ? store : null;
        }, 5000);
        assert.equal(pending.records.find((record) => record.messageId === "3002").adapter, "octo");
        const pendingStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          return response.body?.pendingAgentRuns?.records?.some?.((record) => record.messageId === "3002")
            ? response.body.pendingAgentRuns
            : null;
        }, 5000);
        assert.equal(pendingStatus.count, 1);
        assert.equal(pendingStatus.records[0].adapter, "octo");
      } finally {
        await stopDaemon(firstDaemon.child);
      }
      assert.equal(firstDaemon.stderr().trim(), "");

      const secondDaemon = startDaemon();
      try {
        const capture = await waitFor(() => {
          if (!fs.existsSync(capturePath)) return null;
          const lines = fs.readFileSync(capturePath, "utf8").trim().split(/\r?\n/).filter(Boolean);
          const events = lines.map((line) => JSON.parse(line));
          return events.some((event) => event.event === "start" && event.marker === "second") ? events : null;
        }, 10_000);
        const starts = capture.filter((item) => item.event === "start");
        assert.equal(starts.some((item) => item.marker === "second"), true);
        assert.match(starts.find((item) => item.marker === "second").stdin, /second durable turn/);

        await waitFor(() => {
          if (!fs.existsSync(pendingPath)) return {};
          const store = JSON.parse(fs.readFileSync(pendingPath, "utf8"));
          return store.records?.some?.((record) => record.messageId === "3002") ? null : store;
        }, 5000);
        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => event.eventKind === "channel.agent.pending_replay"
            && event.messageId === "3002")
            && events.some((event) => event.eventKind === "agent.run.started"
              && event.messageId === "3002");
        });
        assert.ok(octoEvents.some((event) => event.eventKind === "channel.agent.pending_replay"
          && event.messageId === "3002"));
        const replayStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          return response.body?.pendingAgentRuns?.recentEvents?.some?.((event) => {
            return event.eventKind === "channel.agent.pending_replay"
              && event.messageId === "3002";
          })
            ? response.body.pendingAgentRuns
            : null;
        }, 5000);
        assert.equal(replayStatus.count, 0);
      } finally {
        await stopDaemon(secondDaemon.child);
      }
      assert.equal(secondDaemon.stderr().trim(), "");
      assert.equal(inboundSent, true);
    });
  } finally {
    await new Promise((resolve, reject) => {
      wss.close((error) => error ? reject(error) : resolve());
    });
  }
});

test("native Channel Connectors daemon applies thinking display toggles to Octo progress replies", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-octo-thinking-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, "codex"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    "  const second = stdin.includes('visible thinking turn');",
    "  const thought = second ? 'visible thought from Codex' : 'hidden thought from Codex';",
    "  const reply = second ? 'second final reply' : 'first final reply';",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ stdin, thought, reply })}\\n`);",
    "  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: second ? 'thread-thinking-visible' : 'thread-thinking-hidden' })}\\n`);",
    "  process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'reasoning', summary: [thought] } })}\\n`);",
    "  process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: reply } })}\\n`);",
    "  process.stdout.write('{\"type\":\"turn.completed\"}\\n');",
    "});",
    "",
  ].join("\n"), { mode: 0o755 });

  const wsConnects = [];
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
      const salt = "think12345678901";
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
          messageSeq: messageId - 5000,
          fromUid: "thinking-user",
          channelId: "thinking-user",
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
        res.end(JSON.stringify({
          object: "list",
          data: [
            { id: "gpt-5", object: "model", features: { text: true, reasoning: true } },
          ],
        }));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        res.end(JSON.stringify({ robot_id: "robot-thinking", im_token: "im-token-thinking", ws_url: wsUrl }));
        return true;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/sendMessage" || req.url === "/v1/bot/heartbeat") {
        res.end(JSON.stringify({ ok: true, message_id: `octo-thinking-${requests.length}` }));
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
              id: "codex-thinking",
              name: "Codex Thinking",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-thinking",
          platformBindings: [
            {
              id: "octo-thinking",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Thinking",
              agentProfileId: "codex-thinking",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                octoReconnectJitterMs: 0,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const configPath = path.join(root, "daemon-octo-thinking-config.json");
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
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-thinking" && item.connected);
          return connected ? response.body : null;
        }, 5000);
        assert.equal(wsConnects.length, 1);
        assert.ok(sendInbound);

        sendInbound(5001, "/thinking off");
        await waitFor(() => {
          const content = requests
            .filter((request) => request.path === "/v1/bot/sendMessage")
            .map((request) => request.body?.payload?.content || "")
            .join("\n");
          return /思考消息：关闭/.test(content) ? content : null;
        }, 5000);

        sendInbound(5002, "first hidden thinking turn");
        await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          return response.body?.agentRuns?.find?.((item) => item.messageId === "5002" && item.ok) ? response.body : null;
        }, 8000);
        let replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.match(replyContents, /first final reply/);
        assert.doesNotMatch(replyContents, /hidden thought from Codex/);

        sendInbound(5003, "/thinking on");
        await waitFor(() => {
          const content = requests
            .filter((request) => request.path === "/v1/bot/sendMessage")
            .map((request) => request.body?.payload?.content || "")
            .join("\n");
          return /思考消息：开启/.test(content) ? content : null;
        }, 5000);

        sendInbound(5004, "visible thinking turn");
        await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          return response.body?.agentRuns?.find?.((item) => item.messageId === "5004" && item.ok) ? response.body : null;
        }, 8000);
        replyContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "")
          .join("\n");
        assert.match(replyContents, /visible thought from Codex/);
        assert.match(replyContents, /second final reply/);

        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => {
            return event.eventKind === "agent.progress.reply"
              && event.messageId === "5004"
              && event.progressType === "reasoning"
              && event.replySent === true;
          });
        }, 8000);
        assert.equal(octoEvents.some((event) => {
          return event.eventKind === "agent.progress.reply"
            && event.messageId === "5002"
            && event.progressType === "reasoning";
        }), false);
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

test("native Channel Connectors daemon ignores legacy Octo action manifests in private IM mode", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "codex-octo-action-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeCodexPath = path.join(fakeBin, "codex");
  fs.writeFileSync(fakeCodexPath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "let stdin = '';",
    "process.stdin.on('data', (chunk) => { stdin += chunk.toString('utf8'); });",
    "process.stdin.on('end', () => {",
    "  fs.appendFileSync(process.env.STUDIO_TEST_CODEX_CAPTURE, `${JSON.stringify({ argv: process.argv.slice(2), stdin })}\\n`);",
    "  const reply = [",
    "    '正在创建「Agent 协作群」并把你拉进去，请确认授权。',",
    "    '',",
    "    '```studio-octo-actions',",
    "    JSON.stringify([{ action: 'create-group', name: 'Agent 协作群', members: 'approve-user' }]),",
    "    '```',",
    "  ].join('\\n');",
    "  process.stdout.write(`${JSON.stringify({ type: 'thread.started', thread_id: 'thread-octo-action' })}\\n`);",
    "  process.stdout.write(`${JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: reply } })}\\n`);",
    "  process.stdout.write('{\"type\":\"turn.completed\"}\\n');",
    "});",
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
      const salt = "facefeed12345678";
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      sendInbound = (input) => {
        if (socket.readyState !== 1) return;
        socket.send(encodeOctoRecvPacket({
          serverPrivateKey: serverKey.privateKey,
          clientPublicKeyBase64: packet.clientPublicKeyBase64,
          salt,
          fromUid: "approve-user",
          channelId: "approve-user",
          channelType: 1,
          ...input,
        }));
      };
      if (!inboundSent) {
        inboundSent = true;
        setTimeout(() => {
          sendInbound?.({
            messageId: 3001,
            messageSeq: 1,
            payload: {
              type: 1,
              content: "创建 Agent 协作群",
            },
          });
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
      const body = bodyRaw ? JSON.parse(bodyRaw) : {};
      requests.push({
        method: req.method,
        path: req.url,
        authorization: req.headers.authorization,
        body,
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
        res.end(JSON.stringify({ robot_id: "robot-approve", im_token: "im-token-approve", ws_url: wsUrl }));
        return true;
      }
      if (req.url === "/v1/bot/sendMessage") {
        res.end(JSON.stringify({ ok: true, message_id: `octo-action-${requests.length}` }));
        return true;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/heartbeat" || req.url === "/v1/bot/readReceipt") {
        res.end(JSON.stringify({ ok: true }));
        return true;
      }
      if (req.method === "POST" && req.url === "/v1/bot/createGroup") {
        res.end(JSON.stringify({ group_no: "group-approved", name: body.name || "Group Name" }));
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
              id: "codex-octo-action",
              name: "Codex Octo Action",
              agent: "codex",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "codex",
            },
          ],
          defaultAgentProfileId: "codex-octo-action",
          platformBindings: [
            {
              id: "octo-action",
              platform: "octo",
              accountId: "octo-account",
              botId: null,
              displayName: "Octo Action",
              agentProfileId: "codex-octo-action",
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
      const configPath = path.join(root, "daemon-octo-action-config.json");
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
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-action" && item.connected);
          return connected ? response.body : null;
        }, 5000);
        assert.equal(connectedStatus.ok, true);
        assert.equal(wsConnects.length, 1);

        const finalStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => {
            return item.messageId === "3001"
              && item.ok === true;
          });
          return run ? response.body : null;
        }, 10_000);
        assert.equal(finalStatus.ok, true);
        const run = finalStatus.agentRuns.find((item) => item.messageId === "3001");
        assert.equal("octoActionsDeclared" in run, false);
        assert.equal("octoActionsExecuted" in run, false);
        assert.equal("octoActionsSucceeded" in run, false);
        assert.equal("octoActionsFailed" in run, false);
        assert.equal("octoActionErrors" in run, false);

        const createGroupRequest = requests.find((request) => {
          return request.method === "POST" && request.path === "/v1/bot/createGroup";
        });
        assert.equal(createGroupRequest, undefined);

        const sendContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "");
        assert.ok(sendContents.some((content) => content.includes("正在创建「Agent 协作群」")), JSON.stringify(sendContents));
        assert.ok(sendContents.some((content) => content.includes("studio-octo-actions is no longer supported in Studio private IM mode")), JSON.stringify(sendContents));
        assert.equal(sendContents.some((content) => content.includes("OctoChannelAction") && content.includes("/approve")), false);
        assert.equal(sendContents.some((content) => content.includes("Octo action results")), false);
        assert.equal(sendContents.some((content) => content.includes("group-approved")), false);

        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => {
            return event.eventKind === "agent.run.finished"
              && event.messageId === "3001"
              && event.agentOk === true;
          });
        }, 8000);
        assert.equal(octoEvents.some((event) => event.eventKind === "agent.octo_action.permission.prompt"), false);
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

test("native Channel Connectors daemon sends Octo group process replies before final reply", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "opencode-process-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeOpenCodePath = path.join(fakeBin, "opencode");
  fs.writeFileSync(fakeOpenCodePath, [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "fs.appendFileSync(process.env.STUDIO_TEST_OPENCODE_CAPTURE, `${JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd() })}\\n`);",
    "function emit(value) { process.stdout.write(`${JSON.stringify(value)}\\n`); }",
    "emit({ type: 'step_start', part: { type: 'step-start', sessionID: 'opencode-process-session' } });",
    "emit({ type: 'text', messageID: 'assistant-process', part: { type: 'text', messageID: 'assistant-process', text: '我先说明第一步。' } });",
    "emit({ type: 'step_finish', part: { type: 'step-finish', reason: 'tool-calls' } });",
    "emit({ type: 'step_start', part: { type: 'step-start', sessionID: 'opencode-process-session' } });",
    "emit({ type: 'tool_use', part: { type: 'tool', tool: 'bash', state: { status: 'completed', title: 'Echo step', input: { command: 'echo step' }, output: 'step output' } } });",
    "emit({ type: 'text', messageID: 'assistant-final', part: { type: 'text', messageID: 'assistant-final', text: '最终总结。' } });",
    "emit({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop' } });",
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
      const salt = "abcd1234abcd1234";
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
            messageId: 4001,
            messageSeq: 1,
            fromUid: "process-user",
            channelId: "group-process",
            channelType: 2,
            payload: {
              type: 1,
              content: "@Studio Bot run process smoke",
              mention: { uids: ["robot-process"] },
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
        res.end(JSON.stringify({ robot_id: "robot-process", im_token: "im-token-process", ws_url: wsUrl }));
        return true;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-process/members") {
        res.end(JSON.stringify({
          members: [
            { uid: "process-user", name: "Process User", role: 1, robot: 0 },
            { uid: "robot-process", name: "Studio Bot", role: 2, robot: 1 },
          ],
        }));
        return true;
      }
      if (req.url === "/v1/bot/typing" || req.url === "/v1/bot/sendMessage" || req.url === "/v1/bot/heartbeat") {
        res.end(JSON.stringify({ ok: true, message_id: `octo-process-${requests.length}` }));
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
              id: "opencode-process",
              name: "OpenCode Process",
              agent: "opencode",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "suggest",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "opencode",
            },
          ],
          defaultAgentProfileId: "opencode-process",
          platformBindings: [
            {
              id: "octo-process",
              platform: "octo",
              accountId: "octo-account",
              botId: "robot-process",
              displayName: "Octo Process",
              agentProfileId: "opencode-process",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token",
                wsUrl,
                octoReconnectJitterMs: 0,
              },
            },
          ],
        },
      });

      const runtimeConfig = service.getDaemonConfig().config;
      runtimeConfig.management.port = await findFreePort();
      const sessionKey = "dmwork:group:group-process";
      upsertChannelConnectorSessionControl(path.join(runtimeConfig.paths.state, "channel-session-controls.json"), {
        bindingId: "octo-process",
        sessionKey,
        processMessages: true,
      });
      const configPath = path.join(root, "daemon-octo-process-config.json");
      fs.mkdirSync(path.dirname(runtimeConfig.paths.log), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2), "utf8");

      const daemonEntry = path.resolve("dist/apps/api/modules/channel-connectors/daemon.js");
      const child = spawn(process.execPath, [daemonEntry, "--config", configPath], {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH || ""}`,
          STUDIO_GATEWAY_API_KEY: "sk-test-gateway",
          STUDIO_TEST_OPENCODE_CAPTURE: capturePath,
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
          const connected = response.body?.octoConnections?.find?.((item) => item.bindingId === "octo-process" && item.connected);
          return connected ? response.body : null;
        }, 5000);
        assert.equal(wsConnects.length, 1);

        const finalStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => item.messageId === "4001" && item.ok);
          return run ? response.body : null;
        }, 8000);
        assert.equal(finalStatus.ok, true);

        const sendContents = requests
          .filter((request) => request.path === "/v1/bot/sendMessage")
          .map((request) => request.body?.payload?.content || "");
        const processIndex = sendContents.findIndex((content) => content.includes("我先说明第一步。"));
        const finalIndex = sendContents.findIndex((content) => content.includes("最终总结。"));
        assert.notEqual(processIndex, -1, JSON.stringify(sendContents));
        assert.notEqual(finalIndex, -1, JSON.stringify(sendContents));
        assert.ok(processIndex < finalIndex, JSON.stringify(sendContents));
        assert.equal(sendContents[processIndex].includes("过程回复"), false);
        assert.equal(sendContents.some((content) => content.includes("step output")), false);

        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => {
            return event.eventKind === "agent.progress.reply"
              && event.messageId === "4001"
              && event.progressType === "assistant"
              && event.phase === "intermediate"
              && event.replySent === true;
          }) && events.some((event) => {
            return event.eventKind === "agent.run.finished"
              && event.messageId === "4001"
              && event.agentOk === true;
          });
        }, 8000);
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "agent.run.started"
            && event.messageId === "4001"
            && event.progressDefaults?.isGroup === true
            && event.progressProcessEnabled === true;
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
            messageId: 2995,
            messageSeq: 3,
            fromUid: "user-1",
            channelId: "group-1",
            channelType: 2,
            payload: {
              type: 1,
              content: "local realtime unmentioned context",
            },
          }));
        }, 30);
        setTimeout(() => {
          if (socket.readyState !== 1) return;
          socket.send(encodeOctoRecvPacket({
            serverPrivateKey: serverKey.privateKey,
            clientPublicKeyBase64: packet.clientPublicKeyBase64,
            salt,
            messageId: 3001,
            messageSeq: 30,
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
        }, 80);
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
            { uid: "helper_bot", name: "Helper Bot", role: 2, robot: 1 },
          ],
        }));
        return true;
      }
      if (req.method === "GET" && req.url === "/v1/bot/groups/group-1/md") {
        res.end(JSON.stringify({
          content: "# Group Rules\n- Use Studio native Octo messages for DM and mentions.",
          version: 7,
        }));
        return true;
      }
      if (req.method === "POST" && req.url === "/v1/bot/messages/sync") {
        const payloadFor = (value) => Buffer.from(JSON.stringify(value), "utf8").toString("base64");
        const textPayload = (content) => payloadFor({ type: 1, content });
        const messages = [
          { id: "2976", seq: 4, from: "user-1", content: "old question" },
          { id: "2977", seq: 5, from: "robot-1", content: "old answer" },
        ];
        for (let seq = 6; seq <= 21; seq += 1) {
          messages.push({
            id: String(2972 + seq),
            seq,
            from: seq % 3 === 0 ? "helper_bot" : "user-1",
            content: seq === 12
              ? `large history filler ${"long-context ".repeat(120)}TAIL-SHOULD-NOT-ENTER-OCTO-CONTEXT`
              : seq === 18
                ? {
                  type: 14,
                  content: [
                    { type: "text", text: "rich collaborator reply " },
                    { type: "image", name: "diagram.png" },
                    { type: "text", text: " acknowledged" },
                  ],
                }
                : seq === 19
                  ? { type: 8, name: "handoff.pdf", size: 128 }
                  : `history filler ${seq}`,
          });
        }
        messages.push(
          { id: "2998", seq: 22, from: "helper_bot", content: `helper bot already replied ${"long-context ".repeat(30)}` },
          { id: "2999", seq: 23, from: "user-1", content: "history hello" },
        );
        res.end(JSON.stringify({
          start_message_seq: 1,
          end_message_seq: 29,
          pull_mode: 1,
          messages: messages.map((message) => ({
            message_id: message.id,
            message_seq: message.seq,
            from_uid: message.from,
            channel_id: "group-1",
            channel_type: 2,
            timestamp: 1742547590 + message.seq,
            payload: typeof message.content === "string" ? textPayload(message.content) : payloadFor(message.content),
          })),
        }));
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
              botId: "robot-1",
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
                octoHistorySyncLimit: 20,
                octoHistoryMessageMaxRunes: 200,
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
        assert.match(capture[0].stdin, /Known members: Alice\(user-1, human\), Studio Bot\(robot-1, bot\), Helper Bot\(helper_bot, bot\)/);
        assert.match(capture[0].stdin, /Octo GROUP\.md/);
        assert.match(capture[0].stdin, /Use Studio native Octo messages for DM and mentions/);
        assert.match(capture[0].stdin, /Octo Bot API recent channel timeline/);
        assert.match(capture[0].stdin, /inspect senderType=bot entries here before saying you cannot see the reply/);
        assert.match(capture[0].stdin, /Last answered messageSeq: 5/);
        assert.match(capture[0].stdin, /History budget: 20\/20 messages included/);
        assert.match(capture[0].stdin, /Previous Octo channel context - already answered/);
        assert.match(capture[0].stdin, /Octo channel messages since your last Studio reply/);
        assert.match(capture[0].stdin, /senderType/);
        assert.match(capture[0].stdin, /self-bot/);
        assert.match(capture[0].stdin, /old question/);
        assert.match(capture[0].stdin, /old answer/);
        assert.match(capture[0].stdin, /Helper Bot \(helper_bot\)/);
        assert.match(capture[0].stdin, /rich collaborator reply/);
        assert.match(capture[0].stdin, /\[图片\]/);
        assert.match(capture[0].stdin, /\[file: handoff\.pdf\]/);
        assert.match(capture[0].stdin, /helper bot already replied/);
        assert.match(capture[0].stdin, /truncated/);
        assert.match(capture[0].stdin, /originalRunes/);
        assert.doesNotMatch(capture[0].stdin, /TAIL-SHOULD-NOT-ENTER-OCTO-CONTEXT/);
        assert.match(capture[0].stdin, /history hello/);
        assert.match(capture[0].stdin, /Octo realtime local channel timeline/);
        assert.match(capture[0].stdin, /Previous Octo realtime context - already answered/);
        assert.match(capture[0].stdin, /local realtime unmentioned context/);
        assert.match(capture[0].stdin, /file: hello\.txt, 11 bytes, local:/);
        assert.match(capture[0].stdin, /Staged files are available locally/);
        assert.ok(capture[0].stdin.indexOf("old question") < capture[0].stdin.indexOf("Octo channel messages since your last Studio reply"));
        assert.ok(capture[0].stdin.indexOf("old answer") < capture[0].stdin.indexOf("Octo channel messages since your last Studio reply"));
        assert.ok(capture[0].stdin.indexOf("helper bot already replied") > capture[0].stdin.indexOf("Octo channel messages since your last Studio reply"));

        const finalStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const run = response.body?.agentRuns?.find?.((item) => item.messageId === "3001");
          return run ? response.body : null;
        }, 8000);
        const run = finalStatus.agentRuns.find((item) => item.messageId === "3001");
        assert.equal(run.ok, true);
        const requestPaths = requests.map((request) => request.path);
        assert.equal(requestPaths.includes("/v1/bot/groups/group-1/members"), true);
        assert.equal(requestPaths.includes("/v1/bot/groups/group-1/md"), true);
        assert.equal(requestPaths.includes("/v1/bot/messages/sync"), true);
        assert.equal(requestPaths.some((item) => item?.startsWith("/v1/bot/file/download/chat/hello.txt")), true);
        assert.equal(requestPaths.includes("/media/hello.txt"), true);
        const octoEvents = await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          return events.some((event) => event.eventKind === "channel.octo.members.loaded" && event.messageId === "3001")
            && events.some((event) => event.eventKind === "channel.octo.md.loaded" && event.messageId === "3001")
            && events.some((event) => event.eventKind === "channel.octo.history.synced" && event.messageId === "3001")
            && events.some((event) => event.eventKind === "agent.attachments.staged" && event.messageId === "3001");
        }, 10_000);
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "channel.octo.members.loaded"
            && event.memberCount === 3
            && event.error === null;
        }));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "channel.octo.history.synced"
            && event.includedCount === 20
            && event.answeredCount === 2
            && event.newCount === 18
            && event.lastAnsweredMessageSeq === 5
            && event.inferredLastAnsweredMessageSeq === 5
            && event.error === null;
        }));
        const cutoffStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const cutoff = response.body?.octoHistoryCutoffs?.find?.((item) =>
            item.bindingId === "octo-context"
            && item.lastAnsweredMessageSeq === 30
            && item.source === "agent-reply"
          );
          return cutoff ? response.body : null;
        }, 8000);
        assert.ok(cutoffStatus.octoHistoryCutoffs.some((item) =>
          item.bindingId === "octo-context"
          && item.lastAnsweredMessageSeq === 30
          && item.messageId === "3001"
        ));
        assert.ok(octoEvents.some((event) => {
          return event.eventKind === "channel.octo.md.loaded"
            && event.kind === "group"
            && event.included === true
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

test("native Channel Connectors daemon routes Claude and OpenCode compact through Octo persistent sessions", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createChannelConnectorsService(config, {
    now: () => new Date("2026-06-06T08:00:00.000Z"),
  });
  const fakeBin = path.join(root, "fake-bin");
  const capturePath = path.join(root, "daemon-native-compact-capture.jsonl");
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(fakeBin, "claude"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const readline = require('node:readline');",
    "const rl = readline.createInterface({ input: process.stdin });",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "function record(value) { fs.appendFileSync(process.env.STUDIO_NATIVE_COMPACT_DAEMON_CAPTURE, JSON.stringify({ cli: 'claude', pid: process.pid, ...value }) + '\\n'); }",
    "rl.on('line', (line) => {",
    "  if (!line.trim()) return;",
    "  const message = JSON.parse(line);",
    "  const content = message.message && message.message.content;",
    "  const text = typeof content === 'string' ? content : JSON.stringify(content);",
    "  record({ argv: process.argv.slice(2), text });",
    "  emit({ type: 'system', session_id: 'claude-daemon-session' });",
    "  if (text.includes('/compact')) {",
    "    emit({ type: 'result', session_id: 'claude-daemon-session' });",
    "    return;",
    "  }",
    "  emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'Claude daemon normal reply.' }] } });",
    "  emit({ type: 'result', result: 'Claude daemon normal reply.', session_id: 'claude-daemon-session' });",
    "});",
    "setInterval(() => {}, 1000);",
    "",
  ].join("\n"), { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, "opencode"), [
    "#!/usr/bin/env node",
    "const fs = require('fs');",
    "const path = require('node:path');",
    "const args = process.argv.slice(2);",
    "const dataHome = process.env.XDG_DATA_HOME || '';",
    "if (dataHome) {",
    "  fs.mkdirSync(path.join(dataHome, 'opencode'), { recursive: true });",
    "  fs.writeFileSync(path.join(dataHome, 'opencode', 'opencode.db'), '');",
    "}",
    "const prompt = args.includes('--') ? args.slice(args.indexOf('--') + 1).join(' ') : '';",
    "fs.appendFileSync(process.env.STUDIO_NATIVE_COMPACT_DAEMON_CAPTURE, JSON.stringify({ cli: 'opencode', argv: args, prompt }) + '\\n');",
    "function emit(value) { process.stdout.write(JSON.stringify(value) + '\\n'); }",
    "emit({ type: 'step_start', part: { type: 'step-start', sessionID: 'opencode-daemon-session' } });",
    "if (!prompt.includes('/compact')) {",
    "  emit({ type: 'text', messageID: 'opencode-normal', part: { type: 'text', messageID: 'opencode-normal', text: 'OpenCode daemon normal reply.' } });",
    "}",
    "emit({ type: 'step_finish', part: { type: 'step-finish', reason: 'stop' } });",
    "",
  ].join("\n"), { mode: 0o755 });
  fs.writeFileSync(path.join(fakeBin, "sqlite3"), [
    "#!/usr/bin/env node",
    "const query = process.argv[process.argv.length - 1] || '';",
    "if (query.includes('select id from session')) console.log(JSON.stringify([{ id: 'opencode-daemon-session' }]));",
    "else console.log(JSON.stringify([]));",
    "",
  ].join("\n"), { mode: 0o755 });

  const sendInboundByRobot = new Map();
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
    let connected = false;
    socket.on("message", (data) => {
      if (connected) return;
      const packet = decodeOctoConnectPacket(Buffer.isBuffer(data) ? data : Buffer.from(data));
      connected = true;
      wsConnects.push(packet);
      const serverKey = createOctoX25519KeyPair();
      const salt = `salt${packet.uid}`.slice(0, 16).padEnd(16, "0");
      socket.send(encodeOctoConnackPacket({
        serverPublicKeyBase64: serverKey.publicKeyBase64,
        salt,
      }));
      sendInboundByRobot.set(packet.uid, (messageId, fromUid, content) => {
        if (socket.readyState !== 1) throw new Error(`Octo fake socket for ${packet.uid} is not open`);
        socket.send(encodeOctoRecvPacket({
          serverPrivateKey: serverKey.privateKey,
          clientPublicKeyBase64: packet.clientPublicKeyBase64,
          salt,
          messageId,
          messageSeq: messageId - 6100,
          fromUid,
          channelId: fromUid,
          channelType: 1,
          payload: {
            type: 1,
            content,
          },
        }));
      });
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
            contextWindow: 200000,
            maxOutputTokens: 8192,
          }],
        }));
        return true;
      }
      if (req.url?.startsWith("/v1/bot/register")) {
        const registerRequests = requests.filter((request) => request.path?.startsWith("/v1/bot/register")).length;
        const kind = registerRequests === 1 ? "claude" : "opencode";
        res.end(JSON.stringify({
          robot_id: `robot-${kind}`,
          im_token: `im-token-${kind}`,
          ws_url: wsUrl,
        }));
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
              id: "claude-persistent-daemon",
              name: "Claude Persistent Daemon",
              agent: "claude-code",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "yolo",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "claude-code",
            },
            {
              id: "opencode-persistent-daemon",
              name: "OpenCode Persistent Daemon",
              agent: "opencode",
              model: "gpt-5",
              workDir: config.projectRoot,
              permissionMode: "yolo",
              gatewayEndpoint: `${apiUrl}/v1`,
              gatewayKeyRef: "studio-gateway-client-key",
              appProfileRef: "opencode",
            },
          ],
          defaultAgentProfileId: "claude-persistent-daemon",
          platformBindings: [
            {
              id: "octo-claude-compact",
              platform: "octo",
              accountId: "octo-claude-account",
              botId: null,
              displayName: "Octo Claude Compact",
              agentProfileId: "claude-persistent-daemon",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token-claude",
                wsUrl,
                agentSessionDriver: "persistent",
                octoReconnectJitterMs: 0,
              },
            },
            {
              id: "octo-opencode-compact",
              platform: "octo",
              accountId: "octo-opencode-account",
              botId: null,
              displayName: "Octo OpenCode Compact",
              agentProfileId: "opencode-persistent-daemon",
              enabled: true,
              allowlist: [],
              adminUsers: [],
              metadata: {
                apiUrl,
                botToken: "test-token-opencode",
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
      const configPath = path.join(root, "daemon-native-compact-config.json");
      fs.mkdirSync(path.dirname(runtimeConfig.paths.log), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(runtimeConfig, null, 2), "utf8");

      const daemonEntry = path.resolve("dist/apps/api/modules/channel-connectors/daemon.js");
      const child = spawn(process.execPath, [daemonEntry, "--config", configPath], {
        cwd: path.resolve("."),
        env: {
          ...process.env,
          PATH: `${fakeBin}:${process.env.PATH || ""}`,
          STUDIO_GATEWAY_API_KEY: "sk-test-gateway",
          STUDIO_NATIVE_COMPACT_DAEMON_CAPTURE: capturePath,
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
          const connected = ["octo-claude-compact", "octo-opencode-compact"].every((bindingId) =>
            response.body?.octoConnections?.some?.((item) => item.bindingId === bindingId && item.connected)
          );
          return connected && sendInboundByRobot.has("robot-claude") && sendInboundByRobot.has("robot-opencode")
            ? response.body
            : null;
        }, 8000);
        assert.equal(wsConnects.length, 2);

        sendInboundByRobot.get("robot-claude")(6101, "claude-user", "hello claude daemon");
        sendInboundByRobot.get("robot-opencode")(6201, "opencode-user", "hello opencode daemon");
        const normalStatus = await waitFor(async () => {
          const response = await requestJson(`http://127.0.0.1:${runtimeConfig.management.port}/status`);
          const runs = response.body?.agentRuns?.filter?.((item) => ["6101", "6201"].includes(item.messageId) && item.ok) || [];
          const sessions = response.body?.agentSessionDriver?.activeSessions?.filter?.((item) =>
            ["octo-claude-compact", "octo-opencode-compact"].includes(item.bindingId)
          ) || [];
          return runs.length === 2 && sessions.length === 2 ? response.body : null;
        }, 12_000);
        const requestedModes = normalStatus.agentSessionDriver.requestedPersistentBindings
          .filter((item) => ["octo-claude-compact", "octo-opencode-compact"].includes(item.bindingId))
          .map((item) => item.effectiveMode);
        assert.deepEqual(requestedModes.sort(), ["persistent", "persistent"]);

        sendInboundByRobot.get("robot-claude")(6102, "claude-user", "/compact");
        sendInboundByRobot.get("robot-opencode")(6202, "opencode-user", "/compact");
        await waitForJsonLines(runtimeConfig.paths.octoEvents, (events) => {
          const finished = events.filter((event) =>
            event.eventKind === "agent.native_compact.finished"
            && ["octo-claude-compact", "octo-opencode-compact"].includes(event.bindingId)
            && event.ok === true
          );
          return finished.length >= 2;
        }, 8000);
        const replyContents = await waitFor(() => {
          const content = requests
            .filter((request) => request.path === "/v1/bot/sendMessage")
            .map((request) => request.body?.payload?.content || "")
            .join("\n");
          return /Claude Code compact 已完成/.test(content) && /OpenCode compact 已完成/.test(content) ? content : null;
        }, 8000);
        assert.match(replyContents, /Agent 原生 compact 已完成/);
        assert.equal(requests.filter((request) => request.path === "/v1/responses/compact").length, 0);

        const capture = fs.readFileSync(capturePath, "utf8")
          .trim()
          .split(/\r?\n/)
          .filter(Boolean)
          .map((line) => JSON.parse(line));
        const claudeNormal = capture.find((entry) => entry.cli === "claude" && entry.text.includes("hello claude daemon"));
        const claudeCompact = capture.find((entry) => entry.cli === "claude" && entry.text.includes("/compact"));
        assert.ok(claudeNormal);
        assert.ok(claudeCompact);
        assert.equal(claudeCompact.pid, claudeNormal.pid);
        const opencodeCompact = capture.find((entry) => entry.cli === "opencode" && entry.prompt.includes("/compact"));
        assert.ok(opencodeCompact);
        assert.ok(opencodeCompact.argv.includes("--session"));
        assert.equal(opencodeCompact.argv[opencodeCompact.argv.indexOf("--session") + 1], "opencode-daemon-session");
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
                autoVisionModel: true,
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
