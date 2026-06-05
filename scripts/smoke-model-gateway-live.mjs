#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const LOCAL_GATEWAY_KEY = "sk-local-live-smoke";
const DEFAULT_BIGMODEL_CHAT_BASE_URL = "https://open.bigmodel.cn/api/coding/paas/v4";
const DEFAULT_BIGMODEL_ANTHROPIC_BASE_URL = "https://open.bigmodel.cn/api/anthropic";
const DEFAULT_BIGMODEL_MODEL = "glm-4.6";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 75_000;
const INVALID_MODEL = "studio-gateway-live-invalid-model";
let activeRequestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS;

function parseArgs(argv) {
  const options = {
    strict: false,
    keepTemp: false,
    providers: ["bigmodel-chat", "bigmodel-anthropic"],
    timeoutMs: DEFAULT_TIMEOUT_MS,
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") options.strict = true;
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--providers") options.providers = parseCsv(argv[++index] || "");
    else if (arg.startsWith("--providers=")) options.providers = parseCsv(arg.slice("--providers=".length));
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--request-timeout-ms") options.requestTimeoutMs = positiveInt(argv[++index], DEFAULT_REQUEST_TIMEOUT_MS);
    else if (arg.startsWith("--request-timeout-ms=")) {
      options.requestTimeoutMs = positiveInt(arg.slice("--request-timeout-ms=".length), DEFAULT_REQUEST_TIMEOUT_MS);
    }
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
  console.log(`Usage: node scripts/smoke-model-gateway-live.mjs [options]

Runs live provider smoke through a real local Studio Gateway request handler.
Credentials are read only from environment variables and are never written to config.

Environment:
  BIGMODEL_API_KEY or STUDIO_GATEWAY_LIVE_BIGMODEL_API_KEY
  STUDIO_GATEWAY_LIVE_BIGMODEL_MODEL                     default: ${DEFAULT_BIGMODEL_MODEL}
  STUDIO_GATEWAY_LIVE_BIGMODEL_CHAT_MODEL                overrides chat model
  STUDIO_GATEWAY_LIVE_BIGMODEL_ANTHROPIC_MODEL           overrides Anthropic model
  STUDIO_GATEWAY_LIVE_BIGMODEL_CHAT_BASE_URL             default: ${DEFAULT_BIGMODEL_CHAT_BASE_URL}
  STUDIO_GATEWAY_LIVE_BIGMODEL_ANTHROPIC_BASE_URL        default: ${DEFAULT_BIGMODEL_ANTHROPIC_BASE_URL}
  STUDIO_GATEWAY_LIVE_BIGMODEL_ANTHROPIC_MESSAGES_PATH   default: /v1/messages

Options:
  --providers <ids>  Comma-separated ids: bigmodel-chat,bigmodel-anthropic
  --strict           Exit non-zero when any requested provider fails or is skipped
  --timeout-ms <n>   Per-process deadline
  --request-timeout-ms <n>
                    Per-request deadline
  --keep-temp        Keep the temporary state directory
  -h, --help         Show this help

Run npm run build:api before invoking this script directly.`);
}

function parseCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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

async function createLiveContext(root, liveConfig) {
  const { createStudioContext } = await import("../dist/apps/api/index.js");
  const config = createStudioConfig(root);
  fs.mkdirSync(config.projectRoot, { recursive: true });
  const context = createStudioContext({
    config,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    modelGatewayOptions: {
      homeDir: path.join(root, "home"),
      listener: { host: "127.0.0.1", port: 0 },
    },
  });
  const service = context.services.modelGateway;
  service.updateClientAuth(undefined, { apiKey: LOCAL_GATEWAY_KEY });

  if (liveConfig.bigmodel.apiKey) {
    service.upsertProvider(undefined, {
      provider: {
        id: "live-bigmodel-chat",
        name: "Live BigModel Chat",
        enabled: true,
        appScopes: ["codex", "openclaw"],
        baseUrl: liveConfig.bigmodel.chatBaseUrl,
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        models: {
          defaultModel: liveConfig.bigmodel.chatModel,
          models: [{
            id: liveConfig.bigmodel.chatModel,
            features: { streaming: true, tools: true },
          }],
        },
      },
      secret: { apiKey: liveConfig.bigmodel.apiKey },
      setActiveScopes: ["codex", "openclaw"],
    });
    service.upsertProvider(undefined, {
      provider: {
        id: "live-bigmodel-anthropic",
        name: "Live BigModel Anthropic",
        enabled: true,
        appScopes: ["claude-code"],
        baseUrl: liveConfig.bigmodel.anthropicBaseUrl,
        apiFormat: "anthropic_messages",
        authStrategy: "anthropic_api_key",
        endpoints: {
          anthropic_messages: liveConfig.bigmodel.anthropicMessagesPath,
        },
        models: {
          defaultModel: liveConfig.bigmodel.anthropicModel,
          models: [{
            id: liveConfig.bigmodel.anthropicModel,
            features: { streaming: true, tools: true },
          }],
        },
      },
      secret: { apiKey: liveConfig.bigmodel.apiKey },
      setActiveScopes: ["claude-code"],
    });
  }

  return { config, context };
}

function readLiveConfig() {
  const model = envValue("STUDIO_GATEWAY_LIVE_BIGMODEL_MODEL") || DEFAULT_BIGMODEL_MODEL;
  return {
    bigmodel: {
      apiKey: envValue("STUDIO_GATEWAY_LIVE_BIGMODEL_API_KEY", "BIGMODEL_API_KEY", "ZHIPU_API_KEY"),
      chatBaseUrl: trimTrailingSlash(envValue("STUDIO_GATEWAY_LIVE_BIGMODEL_CHAT_BASE_URL") || DEFAULT_BIGMODEL_CHAT_BASE_URL),
      anthropicBaseUrl: trimTrailingSlash(envValue("STUDIO_GATEWAY_LIVE_BIGMODEL_ANTHROPIC_BASE_URL") || DEFAULT_BIGMODEL_ANTHROPIC_BASE_URL),
      anthropicMessagesPath: normalizePath(envValue("STUDIO_GATEWAY_LIVE_BIGMODEL_ANTHROPIC_MESSAGES_PATH") || "/v1/messages"),
      chatModel: envValue("STUDIO_GATEWAY_LIVE_BIGMODEL_CHAT_MODEL") || model,
      anthropicModel: envValue("STUDIO_GATEWAY_LIVE_BIGMODEL_ANTHROPIC_MODEL") || model,
    },
  };
}

function envValue(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function trimTrailingSlash(value) {
  return value.replace(/\/+$/g, "");
}

function normalizePath(value) {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

async function startStudioGatewayServer(context) {
  const { createStudioRequestHandler } = await import("../dist/apps/api/index.js");
  const handler = createStudioRequestHandler(context, { stripBasePath: "" });
  return startHttpServer(async (req, res) => {
    const handled = await handler(req, res);
    if (!handled && !res.writableEnded) {
      res.statusCode = 404;
      res.end("not found");
    }
  });
}

async function startHttpServer(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((error) => {
      if (!res.headersSent) {
        sendJson(res, 500, {
          error: {
            message: error instanceof Error ? error.message : String(error),
            type: "server_error",
          },
        });
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("Live smoke server did not bind to a TCP port.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function sendJson(res, statusCode, body) {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

async function runBigModelChat(server, config) {
  if (!config.apiKey) return skipped("bigmodel-chat", "Missing BIGMODEL_API_KEY or STUDIO_GATEWAY_LIVE_BIGMODEL_API_KEY.");
  const startedAt = Date.now();
  const probes = [];
  const failures = [];

  await runProbe(failures, "responses-basic", async () => {
    const basic = await requestJson(`${server.baseUrl}/v1/responses`, {
      method: "POST",
      headers: gatewayHeaders("codex"),
      body: {
        model: config.chatModel,
        input: "Reply exactly GATEWAY_OK.",
        stream: false,
        max_output_tokens: 64,
      },
    });
    assertHttpOk(basic, "bigmodel-chat responses basic");
    assertIncludes(collectResponsesOutputText(basic.body), "GATEWAY_OK", "bigmodel-chat responses basic");
    probes.push("responses-basic");
  });

  await runProbe(failures, "responses-stream", async () => {
    const stream = await requestRaw(`${server.baseUrl}/v1/responses`, {
      method: "POST",
      headers: gatewayHeaders("codex"),
      body: {
        model: config.chatModel,
        input: "Reply exactly STREAM_OK.",
        stream: true,
        max_output_tokens: 64,
      },
    });
    assertHttpOk(stream, "bigmodel-chat responses stream");
    assertIncludes(collectSseText(stream.raw), "STREAM_OK", "bigmodel-chat responses stream");
    probes.push("responses-stream");
  });

  await runProbe(failures, "tool-history", async () => {
    const tool = await requestResponsesToolProbe(server, config.chatModel);
    const functionCall = findResponsesFunctionCall(tool.body);
    if (!functionCall) throw new Error("bigmodel-chat tool call did not return a Responses function_call.");
    const callId = stringOrNull(functionCall.call_id) || stringOrNull(functionCall.id);
    if (!callId) throw new Error("bigmodel-chat tool call did not include call_id.");
    probes.push(`tool-call:${tool.toolChoiceVariant || "unknown"}`);

    const followUp = await requestJson(`${server.baseUrl}/v1/responses`, {
      method: "POST",
      headers: gatewayHeaders("codex"),
      body: {
        model: config.chatModel,
        previous_response_id: tool.body.id,
        input: [{
          type: "function_call_output",
          call_id: callId,
          output: "lookup done",
        }],
        stream: false,
        max_output_tokens: 64,
      },
    });
    assertHttpOk(followUp, "bigmodel-chat tool history follow-up");
    probes.push(`tool-history:${tool.toolChoiceVariant || "unknown"}`);
  });

  await runProbe(failures, "error-envelope", async () => {
    const errorProbe = await requestJson(`${server.baseUrl}/v1/responses`, {
      method: "POST",
      headers: gatewayHeaders("codex"),
      body: {
        model: INVALID_MODEL,
        input: "Trigger an upstream model error.",
        stream: false,
      },
    });
    if (errorProbe.status < 400) throw new Error("bigmodel-chat invalid-model probe unexpectedly succeeded.");
    if (!errorProbe.body?.error?.message || !errorProbe.body?.error?.code) {
      throw new Error(`bigmodel-chat invalid-model probe returned malformed error: ${errorProbe.raw}`);
    }
    probes.push("error-envelope");
  });

  if (failures.length) {
    return failed("bigmodel-chat", startedAt, new Error(`${failures.length} live probe(s) failed.`), {
      model: config.chatModel,
      baseUrl: config.chatBaseUrl,
      probes,
      failures,
    });
  }
  return passed("bigmodel-chat", startedAt, {
    model: config.chatModel,
    baseUrl: config.chatBaseUrl,
    probes,
  });
}

async function runProbe(failures, label, task) {
  try {
    await task();
  } catch (error) {
    failures.push({
      probe: label,
      error: error instanceof Error ? redact(error.message) : redact(String(error)),
    });
  }
}

async function requestResponsesToolProbe(server, model) {
  const baseBody = {
    model,
    input: [{ role: "user", content: "Call the lookup tool exactly once with query docs. Do not answer in text." }],
    tools: [{
      type: "function",
      name: "lookup",
      description: "Lookup docs",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    }],
    stream: false,
    max_output_tokens: 128,
  };
  const variants = [
    { label: "forced function", body: { ...baseBody, tool_choice: { type: "function", name: "lookup" } } },
    { label: "auto", body: { ...baseBody, tool_choice: "auto" } },
    { label: "implicit", body: baseBody },
  ];
  const failures = [];
  for (const variant of variants) {
    try {
      const response = await requestJson(`${server.baseUrl}/v1/responses`, {
        method: "POST",
        headers: gatewayHeaders("codex"),
        body: variant.body,
      });
      if (response.status >= 200 && response.status < 300 && findResponsesFunctionCall(response.body)) {
        response.toolChoiceVariant = variant.label;
        return response;
      }
      failures.push(`${variant.label}: HTTP ${response.status} ${preview(response.raw)}`);
    } catch (error) {
      failures.push(`${variant.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`bigmodel-chat tool call failed across tool_choice variants: ${failures.join(" | ")}`);
}

async function runBigModelAnthropic(server, config) {
  if (!config.apiKey) return skipped("bigmodel-anthropic", "Missing BIGMODEL_API_KEY or STUDIO_GATEWAY_LIVE_BIGMODEL_API_KEY.");
  const startedAt = Date.now();
  const probes = [];
  try {
    const basic = await requestJson(`${server.baseUrl}/v1/messages`, {
      method: "POST",
      headers: gatewayHeaders("claude-code", { "anthropic-version": "2023-06-01" }),
      body: {
        model: config.anthropicModel,
        max_tokens: 64,
        messages: [{ role: "user", content: "Reply exactly GATEWAY_OK." }],
      },
    });
    assertHttpOk(basic, "bigmodel-anthropic messages basic");
    assertIncludes(collectAnthropicText(basic.body), "GATEWAY_OK", "bigmodel-anthropic messages basic");
    probes.push("messages-basic");

    const stream = await requestRaw(`${server.baseUrl}/v1/messages`, {
      method: "POST",
      headers: gatewayHeaders("claude-code", { "anthropic-version": "2023-06-01" }),
      body: {
        model: config.anthropicModel,
        max_tokens: 64,
        stream: true,
        messages: [{ role: "user", content: "Reply exactly STREAM_OK." }],
      },
    });
    assertHttpOk(stream, "bigmodel-anthropic messages stream");
    assertIncludes(collectSseText(stream.raw), "STREAM_OK", "bigmodel-anthropic messages stream");
    probes.push("messages-stream");

    const tool = await requestJson(`${server.baseUrl}/v1/messages`, {
      method: "POST",
      headers: gatewayHeaders("claude-code", { "anthropic-version": "2023-06-01" }),
      body: {
        model: config.anthropicModel,
        max_tokens: 128,
        messages: [{ role: "user", content: "Use the lookup tool exactly once with query docs. Do not answer in text." }],
        tools: [{
          name: "lookup",
          description: "Lookup docs",
          input_schema: {
            type: "object",
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        }],
        tool_choice: { type: "tool", name: "lookup" },
      },
    });
    assertHttpOk(tool, "bigmodel-anthropic tool use");
    const toolUse = findAnthropicToolUse(tool.body);
    if (!toolUse) throw new Error("bigmodel-anthropic tool use did not return a tool_use content block.");
    probes.push("tool-use");

    const errorProbe = await requestJson(`${server.baseUrl}/v1/messages`, {
      method: "POST",
      headers: gatewayHeaders("claude-code", { "anthropic-version": "2023-06-01" }),
      body: {
        model: INVALID_MODEL,
        max_tokens: 16,
        messages: [{ role: "user", content: "Trigger an upstream model error." }],
      },
    });
    if (errorProbe.status < 400) throw new Error("bigmodel-anthropic invalid-model probe unexpectedly succeeded.");
    if (!errorProbe.body?.error) {
      throw new Error(`bigmodel-anthropic invalid-model probe returned malformed error: ${errorProbe.raw}`);
    }
    probes.push("error-envelope");

    return passed("bigmodel-anthropic", startedAt, {
      model: config.anthropicModel,
      baseUrl: config.anthropicBaseUrl,
      messagesPath: config.anthropicMessagesPath,
      probes,
    });
  } catch (error) {
    return failed("bigmodel-anthropic", startedAt, error, {
      model: config.anthropicModel,
      baseUrl: config.anthropicBaseUrl,
      messagesPath: config.anthropicMessagesPath,
      probes,
    });
  }
}

function gatewayHeaders(appScope, extra = {}) {
  return {
    authorization: `Bearer ${LOCAL_GATEWAY_KEY}`,
    "x-studio-app-scope": appScope,
    ...extra,
  };
}

async function requestJson(url, options = {}) {
  const response = await requestRaw(url, options);
  let body = null;
  try {
    body = response.raw ? JSON.parse(response.raw) : null;
  } catch {
    body = null;
  }
  return { ...response, body };
}

async function requestRaw(url, options = {}) {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, activeRequestTimeoutMs);
  try {
    const headers = {
      ...(options.body === undefined ? {} : { "content-type": "application/json" }),
      ...(options.headers || {}),
    };
    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    return {
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      raw: await response.text(),
    };
  } catch (error) {
    if (timedOut) {
      throw new Error(`request timed out after ${activeRequestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function assertHttpOk(response, label) {
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`${label} returned HTTP ${response.status}: ${response.raw}`);
  }
}

function assertIncludes(value, expected, label) {
  if (!String(value || "").includes(expected)) {
    throw new Error(`${label} did not include ${expected}; got: ${preview(value)}`);
  }
}

function collectResponsesOutputText(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.flatMap((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    return content.map((part) => part?.text).filter((text) => typeof text === "string");
  }).join("");
}

function collectAnthropicText(response) {
  const content = Array.isArray(response?.content) ? response.content : [];
  return content.map((part) => part?.text).filter((text) => typeof text === "string").join("");
}

function collectSseText(raw) {
  return String(raw || "")
    .split(/\n\n+/)
    .flatMap((block) => block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trim())
      .filter((line) => line && line !== "[DONE]"))
    .map((line) => {
      try {
        return collectTextScalars(JSON.parse(line));
      } catch {
        return "";
      }
    })
    .join("");
}

function collectTextScalars(value) {
  if (typeof value === "string") return "";
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(collectTextScalars).join("");
  if (typeof value !== "object") return "";
  let text = "";
  if (typeof value.delta === "string") text += value.delta;
  if (typeof value.text === "string") text += value.text;
  for (const [key, item] of Object.entries(value)) {
    if (key === "delta" && typeof item === "string") continue;
    if (key === "text" && typeof item === "string") continue;
    text += collectTextScalars(item);
  }
  return text;
}

function findResponsesFunctionCall(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.find((item) => item?.type === "function_call") || null;
}

function findAnthropicToolUse(response) {
  const content = Array.isArray(response?.content) ? response.content : [];
  return content.find((item) => item?.type === "tool_use") || null;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function passed(id, startedAt, details) {
  return {
    id,
    status: "passed",
    durationMs: Math.max(0, Date.now() - startedAt),
    ...details,
  };
}

function failed(id, startedAt, error, details) {
  return {
    id,
    status: "failed",
    durationMs: Math.max(0, Date.now() - startedAt),
    error: error instanceof Error ? redact(error.message) : redact(String(error)),
    ...details,
  };
}

function skipped(id, reason) {
  return { id, status: "skipped", reason };
}

function preview(value) {
  return redact(String(value || "")).slice(0, 1000);
}

function redact(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9._-]{12,}/g, "<REDACTED_KEY>")
    .replace(/[A-Za-z0-9]{24,}\.[A-Za-z0-9._-]{12,}/g, "<REDACTED_KEY>");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  activeRequestTimeoutMs = options.requestTimeoutMs;
  const deadline = setTimeout(() => {
    console.error("Live smoke timed out.");
    process.exit(2);
  }, options.timeoutMs);
  const tempParent = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tempParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(tempParent, "studio-gateway-live-smoke-"));
  let server;
  try {
    const liveConfig = readLiveConfig();
    const { context } = await createLiveContext(root, liveConfig);
    server = await startStudioGatewayServer(context);
    const results = [];
    if (options.providers.includes("bigmodel-chat")) {
      results.push(await runBigModelChat(server, liveConfig.bigmodel));
    }
    if (options.providers.includes("bigmodel-anthropic")) {
      results.push(await runBigModelAnthropic(server, liveConfig.bigmodel));
    }
    const ok = results.every((result) => result.status === "passed" || (!options.strict && result.status === "skipped"));
    console.log(JSON.stringify({
      ok,
      strict: options.strict,
      tempRoot: root,
      studioGatewayEndpoint: `${server.baseUrl}/v1`,
      results,
    }, null, 2));
    if (options.strict && !ok) process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    if (server) await server.close();
    if (!options.keepTemp) fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(redact(error instanceof Error ? error.stack || error.message : String(error)));
  process.exit(1);
});
