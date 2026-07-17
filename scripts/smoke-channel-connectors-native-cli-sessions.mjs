#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import which from "which";

import {
  channelConnectorAgentSessionDriverPoolKey,
} from "../dist/apps/api/modules/channel-connectors/agent-session-driver.js";
import {
  createNativeCliSessionDriverFactory,
} from "../dist/apps/api/modules/channel-connectors/cli-agent-session-driver.js";

const DEFAULT_APPS = ["claude-code", "opencode"];
const DEFAULT_MODEL = "gpt-test";
const LOCAL_GATEWAY_KEY = "sk-native-cli-smoke";
const DEFAULT_TIMEOUT_MS = 90_000;
const FILE_SMOKE_NAME = "native-smoke-output.txt";
const VISUAL_SMOKE_NAME = "native-smoke-image.jpg";
const VISUAL_SMOKE_MIME_TYPE = "image/jpeg";
const VISUAL_SMOKE_IMAGE_BASE64 = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAAgACADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50ooor8MP9UwooooAKKKKACiiigD/2Q==";

function parseArgs(argv) {
  const options = {
    apps: DEFAULT_APPS,
    strict: false,
    json: false,
    keepTemp: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--apps") options.apps = parseCsv(requireValue(argv, ++index, arg));
    else if (arg.startsWith("--apps=")) options.apps = parseCsv(arg.slice("--apps=".length));
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(requireValue(argv, ++index, arg), DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-channel-connectors-native-cli-sessions.mjs [options]

Runs isolated real-CLI smoke checks for Channel Connectors native persistent session drivers.
Run npm run build:api first. Installed CLIs are skipped unless --strict is set.

Options:
  --apps <ids>        Comma-separated ids: claude-code,opencode
  --strict            Exit non-zero when a requested CLI is missing or fails
  --json              Emit JSON only
  --keep-temp         Keep the temporary HOME/state directory
  --timeout-ms <n>    Per-turn timeout. Default: ${DEFAULT_TIMEOUT_MS}
  -h, --help          Show this help
`);
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function parseCsv(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function commandExists(command) {
  return which.sync(command, {
    path: process.env.PATH,
    pathExt: process.env.PATHEXT,
    nothrow: true,
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

function sendSse(res, events) {
  res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    connection: "keep-alive",
  });
  for (const event of events) {
    if (event.event) res.write(`event: ${event.event}\n`);
    res.write(`data: ${event.data === "[DONE]" ? "[DONE]" : JSON.stringify(event.data)}\n\n`);
  }
  res.end();
}

function sendNeverCompletingResponse(res) {
  const timer = setTimeout(() => {
    if (res.destroyed || res.writableEnded) return;
    sendJson(res, 504, {
      error: {
        message: "Stop smoke did not cancel the pending request before the mock timeout.",
        type: "timeout_error",
      },
    });
  }, 60_000);
  res.on("close", () => clearTimeout(timer));
}

function requestText(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(requestText).join("\n");
  if (typeof value !== "object") return "";
  return Object.values(value).map(requestText).join("\n");
}

async function startMockGateway() {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const bodyText = await readRequestBody(req);
    let body = {};
    try {
      body = bodyText ? JSON.parse(bodyText) : {};
    } catch {
      body = {};
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    requests.push({
      method: req.method,
      path: url.pathname,
      authorization: req.headers.authorization || null,
      body,
    });

    if (req.method === "GET" && url.pathname === "/v1/models") {
      sendJson(res, 200, {
        object: "list",
        data: [{ id: DEFAULT_MODEL, object: "model", owned_by: "tracevane-native-cli-smoke" }],
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/messages") {
      respondAnthropicMessages(res, body);
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      respondChatCompletions(res, body);
      return;
    }
    sendJson(res, 404, {
      error: { message: `Mock route not found: ${req.method} ${url.pathname}`, type: "not_found" },
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("Mock Gateway did not bind.");
  return {
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function anthropicResponseText(body) {
  const text = requestText(body);
  if (text.includes("/compact")) return "";
  if (text.includes("CLAUDE_VISUAL_SMOKE")) return "CLAUDE_VISUAL_OK";
  if (text.includes("CLAUDE_FILE_SMOKE")) {
    return [
      "CLAUDE_FILE_OK",
      "```tracevane-channel-files",
      JSON.stringify([{ path: FILE_SMOKE_NAME, name: FILE_SMOKE_NAME, caption: "native CLI smoke file" }]),
      "```",
    ].join("\n");
  }
  if (text.includes("CLAUDE_TOOL_SMOKE") && text.includes("tool_result")) return "CLAUDE_TOOL_OK";
  return "CLAUDE_DRIVER_OK";
}

function respondAnthropicToolUse(res, body) {
  const text = requestText(body);
  const hasToolResult = text.includes("tool_result");
  const shouldCallBash = Array.isArray(body.tools)
    && text.includes("CLAUDE_TOOL_SMOKE")
    && !hasToolResult;
  if (!shouldCallBash) return false;
  sendSse(res, [
    {
      event: "message_start",
      data: {
        type: "message_start",
        message: {
          id: "msg_native_cli_tool_smoke",
          type: "message",
          role: "assistant",
          model: DEFAULT_MODEL,
          content: [],
          stop_reason: null,
          stop_sequence: null,
          usage: { input_tokens: 8, output_tokens: 0 },
        },
      },
    },
    {
      event: "content_block_start",
      data: {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "tool_use",
          id: "toolu_native_cli_smoke",
          name: "Bash",
          input: {},
        },
      },
    },
    {
      event: "content_block_delta",
      data: {
        type: "content_block_delta",
        index: 0,
        delta: {
          type: "input_json_delta",
          partial_json: "{\"command\":\"printf CLAUDE_TOOL_RESULT\",\"description\":\"Print native CLI smoke marker\"}",
        },
      },
    },
    { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
    {
      event: "message_delta",
      data: {
        type: "message_delta",
        delta: { stop_reason: "tool_use", stop_sequence: null },
        usage: { output_tokens: 4 },
      },
    },
    { event: "message_stop", data: { type: "message_stop" } },
  ]);
  return true;
}

function respondAnthropicMessages(res, body) {
  if (requestText(body).includes("CLAUDE_STOP_SMOKE")) {
    sendNeverCompletingResponse(res);
    return;
  }
  if (body.stream && respondAnthropicToolUse(res, body)) return;
  const text = anthropicResponseText(body);
  if (body.stream) {
    sendSse(res, [
      {
        event: "message_start",
        data: {
          type: "message_start",
          message: {
            id: "msg_native_cli_smoke",
            type: "message",
            role: "assistant",
            model: DEFAULT_MODEL,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 8, output_tokens: 0 },
          },
        },
      },
      { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } },
      { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
      { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } } },
      { event: "message_stop", data: { type: "message_stop" } },
    ]);
    return;
  }
  sendJson(res, 200, {
    id: "msg_native_cli_smoke",
    type: "message",
    role: "assistant",
    model: DEFAULT_MODEL,
    content: [{ type: "text", text }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 8, output_tokens: 2 },
  });
}

function chatResponseText(body) {
  const text = requestText(body);
  if (text.includes("/compact")) return "OPENCODE_COMPACT_OK";
  if (text.includes("OPENCODE_VISUAL_SMOKE")) return "OPENCODE_VISUAL_OK";
  if (text.includes("OPENCODE_FILE_SMOKE")) {
    return [
      "OPENCODE_FILE_OK",
      "```tracevane-channel-files",
      JSON.stringify([{ path: FILE_SMOKE_NAME, name: FILE_SMOKE_NAME, caption: "native CLI smoke file" }]),
      "```",
    ].join("\n");
  }
  return "OPENCODE_DRIVER_OK";
}

function respondChatCompletions(res, body) {
  if (
    Array.isArray(body.tools)
    && body.tools.length > 0
    && (body.reasoning_effort !== undefined || body.reasoningEffort !== undefined)
  ) {
    sendJson(res, 400, {
      error: {
        message: "Function tools with reasoning_effort are not supported for gpt-5.5 in /v1/chat/completions. Please use /v1/responses instead.",
        type: "invalid_request_error",
        code: "unsupported_parameter",
      },
    });
    return;
  }
  if (requestText(body).includes("OPENCODE_STOP_SMOKE")) {
    sendNeverCompletingResponse(res);
    return;
  }
  const text = chatResponseText(body);
  if (body.stream) {
    const created = Math.floor(Date.now() / 1000);
    sendSse(res, [
      {
        data: {
          id: "chatcmpl_native_cli_smoke",
          object: "chat.completion.chunk",
          created,
          model: DEFAULT_MODEL,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        },
      },
      {
        data: {
          id: "chatcmpl_native_cli_smoke",
          object: "chat.completion.chunk",
          created,
          model: DEFAULT_MODEL,
          choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
        },
      },
      {
        data: {
          id: "chatcmpl_native_cli_smoke",
          object: "chat.completion.chunk",
          created,
          model: DEFAULT_MODEL,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
        },
      },
      { data: "[DONE]" },
    ]);
    return;
  }
  sendJson(res, 200, {
    id: "chatcmpl_native_cli_smoke",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: DEFAULT_MODEL,
    choices: [{
      index: 0,
      message: { role: "assistant", content: text },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
  });
}

function writeOpenCodeConfig(homeDir, endpoint) {
  const configPath = path.join(homeDir, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify({
    model: `tracevane-gateway/${DEFAULT_MODEL}`,
    provider: {
      "tracevane-gateway": {
        npm: "@ai-sdk/openai-compatible",
        name: "Tracevane Gateway",
        options: {
          apiKey: LOCAL_GATEWAY_KEY,
          baseURL: endpoint,
          setCacheKey: true,
        },
        models: {
          [DEFAULT_MODEL]: {
            id: DEFAULT_MODEL,
            name: DEFAULT_MODEL,
            contextWindow: 128000,
            maxOutputTokens: 8192,
            limit: {
              context: 128000,
              output: 8192,
            },
            tool_call: true,
            reasoning: false,
            temperature: true,
            attachment: true,
            modalities: {
              input: ["text", "image"],
              output: ["text"],
            },
          },
        },
      },
    },
  }, null, 2)}\n`);
}

function scrubEnv(env) {
  const output = { ...env };
  for (const key of Object.keys(output)) {
    if (/^(OPENAI|ANTHROPIC|OPENCODE|CODEX|CLAUDE|OPENROUTER|BIGMODEL|ZHIPU|GMN|MLAMP)_/i.test(key)) {
      delete output[key];
    }
  }
  return output;
}

function installIsolatedEnv(root, endpoint) {
  const homeDir = path.join(root, "home");
  fs.mkdirSync(homeDir, { recursive: true });
  writeOpenCodeConfig(homeDir, endpoint);
  const previous = { ...process.env };
  const nextEnv = {
    ...scrubEnv(process.env),
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    XDG_DATA_HOME: path.join(homeDir, ".local", "share"),
    ANTHROPIC_BASE_URL: endpoint.replace(/\/v1\/?$/i, ""),
    ANTHROPIC_API_KEY: LOCAL_GATEWAY_KEY,
    ANTHROPIC_AUTH_TOKEN: LOCAL_GATEWAY_KEY,
    OPENAI_API_KEY: LOCAL_GATEWAY_KEY,
    NO_PROXY: "127.0.0.1,localhost",
    NO_COLOR: "1",
    CI: "1",
    TERM: "dumb",
  };
  for (const key of Object.keys(process.env)) delete process.env[key];
  Object.assign(process.env, nextEnv);
  return () => {
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, previous);
  };
}

function baseTurnRequest(root, agent, endpoint, nativeCommand = null, contentOverride = null, attachments = []) {
  const model = agent === "opencode" ? `tracevane-gateway/${DEFAULT_MODEL}` : DEFAULT_MODEL;
  const messageKind = nativeCommand
    ? "compact"
    : contentOverride?.includes("_TOOL_SMOKE") ? "tool"
      : contentOverride?.includes("_FILE_SMOKE") ? "file"
        : contentOverride?.includes("_VISUAL_SMOKE") ? "visual"
        : contentOverride?.includes("_STOP_SMOKE") ? "stop"
        : "normal";
  return {
    project: {
      id: `${agent}-native-cli-smoke`,
      name: `${agent} native CLI smoke`,
      agent,
      model,
      workDir: root,
      permissionMode: "yolo",
      reasoningEffort: "low",
      gatewayEndpoint: endpoint,
      gatewayKeyRef: null,
      appProfileRef: null,
      metadata: {},
    },
    binding: {
      id: `${agent}-native-cli-smoke`,
      platform: "octo",
      accountId: "native-cli-smoke",
      botId: null,
      displayName: `${agent} native CLI smoke`,
      agent,
      enabled: true,
      allowlist: [],
      adminUsers: [],
      metadata: { agentSessionDriver: "persistent" },
    },
    message: {
      messageId: `${agent}-${messageKind}`,
      messageSeq: nativeCommand ? 2 : 1,
      fromUid: "native-cli-smoke-user",
      channelId: "native-cli-smoke-user",
      channelType: 1,
      payload: {
        type: 1,
        content: nativeCommand || contentOverride || "Reply exactly with the driver marker.",
      },
      attachments,
      raw: {},
    },
    sessionKey: "native-cli-smoke:dm:user",
    gatewayEndpoint: endpoint,
    gatewayClientKey: LOCAL_GATEWAY_KEY,
    modelCapabilities: attachments.some((attachment) => attachment?.kind === "image") ? { vision: true } : null,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    nativeCommand,
  };
}

function skippedResult(app, reason) {
  return { app, status: "skipped", reason };
}

function preview(value) {
  const text = String(value || "").trim();
  return text.length > 300 ? `${text.slice(0, 300)}...` : text;
}

function requestPreview(request) {
  return preview(JSON.stringify({
    path: request.path,
    body: request.body,
  }));
}

async function waitForRequest(requests, beforeCount, predicate, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const hit = requests.slice(beforeCount).find(predicate);
    if (hit) return hit;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for expected mock Gateway request.");
}

async function runAppSmoke(app, root, endpoint, requests, timeoutMs) {
  const command = app === "claude-code" ? "claude" : app;
  if (!commandExists(command)) return skippedResult(app, `${command} is not installed or not on PATH.`);
  const factory = createNativeCliSessionDriverFactory({
    requestTimeoutMs: timeoutMs,
    turnTimeoutMs: timeoutMs,
    codexFactory: {
      create: () => {
        throw new Error("Codex factory is not part of this smoke.");
      },
    },
  });
  const before = requests.length;
  const key = {
    bindingId: `${app}-native-cli-smoke`,
    projectId: `${app}-native-cli-smoke`,
    sessionKey: "native-cli-smoke:dm:user",
    agent: app,
    model: app === "opencode" ? `tracevane-gateway/${DEFAULT_MODEL}` : DEFAULT_MODEL,
    workDir: root,
  };
  const progress = [];
  const startedAt = Date.now();
  const smokeFilePath = path.join(root, FILE_SMOKE_NAME);
  fs.writeFileSync(smokeFilePath, `native cli smoke file for ${app}\n`);
  const visualFilePath = path.join(root, VISUAL_SMOKE_NAME);
  fs.writeFileSync(visualFilePath, Buffer.from(VISUAL_SMOKE_IMAGE_BASE64, "base64"));
  const visualAttachment = {
    kind: "image",
    platform: "native-cli-smoke",
    fileName: VISUAL_SMOKE_NAME,
    mimeType: VISUAL_SMOKE_MIME_TYPE,
    localPath: visualFilePath,
    stagedAt: new Date(startedAt).toISOString(),
  };
  const firstTurnRequest = baseTurnRequest(root, app, endpoint);
  const session = await factory.create({
    key,
    poolKey: channelConnectorAgentSessionDriverPoolKey(key),
    turnInput: {
      mode: "persistent",
      key,
      messageId: `${app}-normal`,
      agentTurnRequest: firstTurnRequest,
      runOneShot: async () => {
        throw new Error("Persistent driver smoke should not call one-shot fallback.");
      },
    },
  });
  try {
    const normal = await session.runTurn({
      mode: "persistent",
      key,
      messageId: `${app}-normal`,
      agentTurnRequest: firstTurnRequest,
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("Persistent driver smoke should not call one-shot fallback.");
      },
    });
    const tool = app === "claude-code"
      ? await session.runTurn({
        mode: "persistent",
        key,
        messageId: `${app}-tool`,
        agentTurnRequest: {
          ...baseTurnRequest(root, app, endpoint, null, "CLAUDE_TOOL_SMOKE: Use Bash to print CLAUDE_TOOL_RESULT."),
          session: normal.session,
        },
        onProgress: (event) => progress.push(event),
        runOneShot: async () => {
          throw new Error("Persistent tool smoke should not call one-shot fallback.");
        },
      })
      : null;
    const file = await session.runTurn({
      mode: "persistent",
      key,
      messageId: `${app}-file`,
      agentTurnRequest: {
        ...baseTurnRequest(
          root,
          app,
          endpoint,
          null,
          app === "claude-code"
            ? "CLAUDE_FILE_SMOKE: Return the existing native smoke file with a tracevane-channel-files block."
            : "OPENCODE_FILE_SMOKE: Return the existing native smoke file with a tracevane-channel-files block.",
        ),
        session: (tool || normal).session,
      },
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("Persistent file smoke should not call one-shot fallback.");
      },
    });
    const visual = await session.runTurn({
      mode: "persistent",
      key,
      messageId: `${app}-visual`,
      agentTurnRequest: {
        ...baseTurnRequest(
          root,
          app,
          endpoint,
          null,
          app === "claude-code"
            ? "CLAUDE_VISUAL_SMOKE: Inspect the attached image through the native visual path and reply CLAUDE_VISUAL_OK."
            : "OPENCODE_VISUAL_SMOKE: Inspect the attached image through the native visual path and reply OPENCODE_VISUAL_OK.",
          [visualAttachment],
        ),
        session: file.session,
      },
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("Persistent visual smoke should not call one-shot fallback.");
      },
    });
    const compact = await session.runTurn({
      mode: "persistent",
      key,
      messageId: `${app}-compact`,
      agentTurnRequest: {
        ...baseTurnRequest(root, app, endpoint, "/compact"),
        session: visual.session,
      },
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("Persistent compact smoke should not call one-shot fallback.");
      },
    });
    const beforeStopRequest = requests.length;
    const stopMarker = app === "claude-code" ? "CLAUDE_STOP_SMOKE" : "OPENCODE_STOP_SMOKE";
    const stopPath = app === "claude-code" ? "/v1/messages" : "/v1/chat/completions";
    const stopPromise = session.runTurn({
      mode: "persistent",
      key,
      messageId: `${app}-stop`,
      agentTurnRequest: {
        ...baseTurnRequest(root, app, endpoint, null, `${stopMarker}: Start a long pending request so Tracevane can cancel it.`),
        session: compact.session,
      },
      onProgress: (event) => progress.push(event),
      runOneShot: async () => {
        throw new Error("Persistent stop smoke should not call one-shot fallback.");
      },
    });
    await waitForRequest(
      requests,
      beforeStopRequest,
      (request) => request.path === stopPath && requestText(request.body).includes(stopMarker),
      Math.min(timeoutMs, 10_000),
    );
    session.stop?.("native-cli-smoke-stop");
    const stop = await stopPromise;
    const marker = app === "claude-code" ? "CLAUDE_DRIVER_OK" : "OPENCODE_DRIVER_OK";
    const compactMarker = app === "claude-code" ? "Claude Code compact 已完成。" : "OpenCode compact 已完成。";
    const fileMarker = app === "claude-code" ? "CLAUDE_FILE_OK" : "OPENCODE_FILE_OK";
    const visualMarker = app === "claude-code" ? "CLAUDE_VISUAL_OK" : "OPENCODE_VISUAL_OK";
    const visualRequestMarker = app === "claude-code" ? "CLAUDE_VISUAL_SMOKE" : "OPENCODE_VISUAL_SMOKE";
    const visualRequestPath = app === "claude-code" ? "/v1/messages" : "/v1/chat/completions";
    const appRequests = requests.slice(before);
    const hitPaths = [...new Set(appRequests.map((request) => request.path))];
    const visualRequest = appRequests.find((request) => request.path === visualRequestPath && requestText(request.body).includes(visualRequestMarker));
    const visualRequestBody = JSON.stringify(visualRequest?.body || {});
    const errors = [];
    const warnings = [];
    const openCodeVisualUnsupported = app === "opencode"
      && !visual.ok
      && !visualRequest
      && /BadRequest|type=error/.test([visual.error, visual.stdout, visual.stderr].filter(Boolean).join("\n"));
    if (openCodeVisualUnsupported) {
      warnings.push("OpenCode 1.17 rejected local image attachment before sending a Gateway request; config/args construction is covered, real OpenCode visual CLI smoke remains pending.");
    }
    if (!normal.ok) errors.push(`normal turn failed: ${normal.error || normal.status}`);
    if (tool && !tool.ok) errors.push(`tool turn failed: ${tool.error || tool.status}`);
    if (!file.ok) errors.push(`file turn failed: ${file.error || file.status}`);
    if (!visual.ok && !openCodeVisualUnsupported) errors.push(`visual turn failed: ${visual.error || visual.status}`);
    if (!compact.ok) errors.push(`compact turn failed: ${compact.error || compact.status}`);
    if (stop && (stop.ok || stop.status !== "cancelled")) {
      errors.push(`stop turn status was ${JSON.stringify(stop.status)}, expected cancelled`);
    }
    if (normal.replyText !== marker) errors.push(`normal reply was ${JSON.stringify(normal.replyText)}, expected ${marker}`);
    if (tool && tool.replyText !== "CLAUDE_TOOL_OK") errors.push(`tool reply was ${JSON.stringify(tool.replyText)}, expected CLAUDE_TOOL_OK`);
    if (!String(file.replyText || "").includes(fileMarker)) errors.push(`file reply did not include ${fileMarker}`);
    if (!String(file.replyText || "").includes("tracevane-channel-files")) errors.push("file reply did not include tracevane-channel-files manifest");
    if (!String(file.replyText || "").includes(FILE_SMOKE_NAME)) errors.push(`file reply did not include ${FILE_SMOKE_NAME}`);
    if (!openCodeVisualUnsupported && visual.replyText !== visualMarker) errors.push(`visual reply was ${JSON.stringify(visual.replyText)}, expected ${visualMarker}`);
    if (!openCodeVisualUnsupported && !visualRequest) errors.push(`mock Gateway did not receive ${visualRequestMarker}`);
    if (visualRequest && app === "claude-code" && !visualRequestBody.includes("\"image\"")) {
      errors.push("Claude visual request did not include an image content block");
    }
    if (visualRequest && app === "opencode" && !visualRequestBody.includes(VISUAL_SMOKE_NAME)) {
      errors.push(`OpenCode visual request did not include ${VISUAL_SMOKE_NAME}`);
    }
    if (compact.replyText !== compactMarker) errors.push(`compact reply was ${JSON.stringify(compact.replyText)}, expected ${compactMarker}`);
    if (!normal.session.agentNativeSessionId) errors.push("normal turn did not preserve a native session id");
    if (tool && !progress.some((event) => event.type === "tool" && /Bash|CLAUDE_TOOL_RESULT|printf/.test(event.text || ""))) {
      errors.push("Claude tool turn did not emit a Bash/tool progress event");
    }
    if (hitPaths.length === 0) errors.push("mock Gateway did not receive any request");
    return {
      app,
      status: errors.length ? "failed" : "passed",
      durationMs: Math.max(0, Date.now() - startedAt),
      errors,
      warnings,
      hitPaths,
      requestCount: appRequests.length,
      requestPreviews: errors.length || warnings.length ? appRequests.map(requestPreview) : [],
      normal: {
        ok: normal.ok,
        replyText: normal.replyText,
        nativeSessionId: normal.session.agentNativeSessionId || null,
        progressCount: normal.progress.eventCount,
        stdoutPreview: preview(normal.stdout),
        stderrPreview: preview(normal.stderr),
      },
      ...(tool ? {
        tool: {
          ok: tool.ok,
          replyText: tool.replyText,
          nativeSessionId: tool.session.agentNativeSessionId || null,
          progressCount: tool.progress.eventCount,
          stdoutPreview: preview(tool.stdout),
          stderrPreview: preview(tool.stderr),
        },
      } : {}),
      file: {
        ok: file.ok,
        replyText: file.replyText,
        nativeSessionId: file.session.agentNativeSessionId || null,
        progressCount: file.progress.eventCount,
        stdoutPreview: preview(file.stdout),
        stderrPreview: preview(file.stderr),
      },
      visual: {
        ok: visual.ok,
        replyText: visual.replyText,
        nativeSessionId: visual.session.agentNativeSessionId || null,
        progressCount: visual.progress.eventCount,
        stdoutPreview: preview(visual.stdout),
        stderrPreview: preview(visual.stderr),
        requestHadNativeImage: app === "claude-code"
          ? visualRequestBody.includes("\"image\"")
          : visualRequestBody.includes(VISUAL_SMOKE_NAME),
      },
      compact: {
        ok: compact.ok,
        replyText: compact.replyText,
        nativeSessionId: compact.session.agentNativeSessionId || null,
        progressCount: compact.progress.eventCount,
        stdoutPreview: preview(compact.stdout),
        stderrPreview: preview(compact.stderr),
      },
      ...(stop ? {
        stop: {
          ok: stop.ok,
          status: stop.status,
          replyText: stop.replyText,
          nativeSessionId: stop.session.agentNativeSessionId || null,
          progressCount: stop.progress.eventCount,
          error: stop.error,
          stdoutPreview: preview(stop.stdout),
          stderrPreview: preview(stop.stderr),
        },
      } : {}),
      progressCount: progress.length,
    };
  } finally {
    session.dispose?.("native-cli-smoke-complete");
  }
}

function printHuman(summary) {
  console.log("Channel Connectors native CLI session smoke");
  console.log(`Temp root: ${summary.tempRoot}`);
  console.log(`Mock Gateway: ${summary.gatewayEndpoint}`);
  for (const result of summary.results) {
    const prefix = result.status === "passed" ? "PASS" : result.status === "skipped" ? "SKIP" : "FAIL";
    console.log(`${prefix} ${result.app}: ${result.status}`);
    if (result.reason) console.log(`  reason: ${result.reason}`);
    if (result.errors?.length) console.log(`  errors: ${result.errors.join("; ")}`);
    if (result.warnings?.length) console.log(`  warnings: ${result.warnings.join("; ")}`);
    if (result.hitPaths?.length) console.log(`  hit paths: ${result.hitPaths.join(", ")} (${result.requestCount} requests)`);
    if (result.normal) console.log(`  normal: ${result.normal.replyText || "<empty>"} session=${result.normal.nativeSessionId || "<none>"}`);
    if (result.tool) console.log(`  tool: ${result.tool.replyText || "<empty>"}`);
    if (result.file) console.log(`  file: ${preview(result.file.replyText || "")}`);
    if (result.visual) console.log(`  visual: ${result.visual.replyText || "<empty>"} nativeImage=${result.visual.requestHadNativeImage ? "yes" : "no"}`);
    if (result.compact) console.log(`  compact: ${result.compact.replyText || "<empty>"}`);
    if (result.stop) console.log(`  stop: ${result.stop.status} ${result.stop.error || ""}`.trim());
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const unknown = options.apps.filter((app) => !DEFAULT_APPS.includes(app));
  if (unknown.length) throw new Error(`Unknown app id(s): ${unknown.join(", ")}`);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-native-cli-smoke-"));
  const workDir = path.join(tempRoot, "workspace");
  fs.mkdirSync(workDir, { recursive: true });
  const mockGateway = await startMockGateway();
  const restoreEnv = installIsolatedEnv(tempRoot, mockGateway.endpoint);
  const results = [];
  try {
    for (const app of options.apps) {
      results.push(await runAppSmoke(app, workDir, mockGateway.endpoint, mockGateway.requests, options.timeoutMs));
    }
  } finally {
    restoreEnv();
    await mockGateway.close();
    if (!options.keepTemp) fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  const summary = {
    ok: results.every((result) => result.status === "passed" || (!options.strict && result.status === "skipped")),
    strict: options.strict,
    tempRoot,
    gatewayEndpoint: mockGateway.endpoint,
    results,
  };
  if (options.json) console.log(JSON.stringify(summary, null, 2));
  else printHuman(summary);
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
