#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const SCRIPT_TIMEOUT_MS = 180_000;
const COMMAND_TIMEOUT_MS = 45_000;
const LOCAL_GATEWAY_KEY = "sk-local-cli-smoke";
const UPSTREAM_KEY = "sk-upstream-cli-smoke";
const DEFAULT_MODEL = "model-a";
const ALT_MODEL = "model-b";
const ALIAS_MODEL = "alias-b";

function parseArgs(argv) {
  const options = {
    strict: false,
    keepTemp: false,
    includeOpenClawAgent: false,
    apps: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") options.strict = true;
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--include-openclaw-agent") options.includeOpenClawAgent = true;
    else if (arg === "--apps") options.apps = (argv[++index] || "").split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg.startsWith("--apps=")) options.apps = arg.slice("--apps=".length).split(",").map((item) => item.trim()).filter(Boolean);
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
  console.log(`Usage: node scripts/smoke-model-gateway-cli.mjs [options]

Runs isolated Studio Gateway CLI startup smoke checks against a local mock Gateway.

Options:
  --apps <ids>                 Comma-separated app ids: codex,claude-code,opencode,openclaw
  --strict                     Exit non-zero when an installed CLI smoke fails
  --include-openclaw-agent     Also try openclaw agent --local, not only config startup
  --keep-temp                  Keep the temporary HOME/state directory
  -h, --help                   Show this help

Run npm run build:api before invoking this script directly.`);
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

function commandExists(command) {
  const result = spawnSync("sh", ["-lc", `command -v ${shellQuote(command)}`], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : null;
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body, headers = {}) {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
    ...headers,
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
      apiKey: req.headers["x-api-key"] || null,
      body,
    });
    if (req.method === "GET" && url.pathname === "/v1/models") {
      sendJson(res, 200, {
        object: "list",
        data: [DEFAULT_MODEL, ALT_MODEL].map((id) => ({
          id,
          object: "model",
          created: 0,
          owned_by: "studio-gateway-cli-smoke",
        })),
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/responses") {
      respondOpenAiResponses(res, body);
      return;
    }
    if (req.method === "POST" && url.pathname === "/v1/responses/compact") {
      respondOpenAiResponses(res, body, { compact: true });
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
      error: {
        message: `Mock Gateway route not found: ${req.method} ${url.pathname}`,
        type: "not_found",
      },
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("Mock Gateway did not bind to a TCP port.");
  return {
    port: address.port,
    endpoint: `http://127.0.0.1:${address.port}/v1`,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function respondOpenAiResponses(res, body, options = {}) {
  const model = typeof body.model === "string" ? body.model : DEFAULT_MODEL;
  if (body.stream) {
    sendSse(res, [
      {
        event: "response.created",
        data: {
          type: "response.created",
          response: {
            id: "resp_cli_smoke",
            object: "response",
            status: "in_progress",
            model,
            output: [],
            usage: null,
          },
        },
      },
      {
        event: "response.output_item.added",
        data: {
          type: "response.output_item.added",
          output_index: 0,
          item: {
            id: "msg_cli_smoke",
            type: "message",
            status: "in_progress",
            role: "assistant",
            content: [],
          },
        },
      },
      {
        event: "response.content_part.added",
        data: {
          type: "response.content_part.added",
          item_id: "msg_cli_smoke",
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "" },
        },
      },
      {
        event: "response.output_text.delta",
        data: {
          type: "response.output_text.delta",
          item_id: "msg_cli_smoke",
          output_index: 0,
          content_index: 0,
          delta: "GATEWAY_OK",
        },
      },
      {
        event: "response.output_text.done",
        data: {
          type: "response.output_text.done",
          item_id: "msg_cli_smoke",
          output_index: 0,
          content_index: 0,
          text: "GATEWAY_OK",
        },
      },
      {
        event: "response.content_part.done",
        data: {
          type: "response.content_part.done",
          item_id: "msg_cli_smoke",
          output_index: 0,
          content_index: 0,
          part: { type: "output_text", text: "GATEWAY_OK" },
        },
      },
      {
        event: "response.output_item.done",
        data: {
          type: "response.output_item.done",
          output_index: 0,
          item: {
            id: "msg_cli_smoke",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: "GATEWAY_OK" }],
          },
        },
      },
      {
        event: "response.completed",
        data: {
          type: "response.completed",
          response: openAiResponseBody(model, options),
        },
      },
    ]);
    return;
  }
  sendJson(res, 200, openAiResponseBody(model, options));
}

function openAiResponseBody(model, options = {}) {
  return {
    id: options.compact ? "resp_cli_compact_smoke" : "resp_cli_smoke",
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model,
    output: [{
      id: "msg_cli_smoke",
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text: "GATEWAY_OK" }],
    }],
    usage: {
      input_tokens: 8,
      output_tokens: 2,
      total_tokens: 10,
    },
  };
}

function respondAnthropicMessages(res, body) {
  const model = typeof body.model === "string" ? body.model : DEFAULT_MODEL;
  if (body.stream) {
    sendSse(res, [
      {
        event: "message_start",
        data: {
          type: "message_start",
          message: {
            id: "msg_cli_smoke",
            type: "message",
            role: "assistant",
            model,
            content: [],
            stop_reason: null,
            stop_sequence: null,
            usage: { input_tokens: 8, output_tokens: 0 },
          },
        },
      },
      { event: "content_block_start", data: { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } } },
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "GATEWAY_OK" } } },
      { event: "content_block_stop", data: { type: "content_block_stop", index: 0 } },
      { event: "message_delta", data: { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 2 } } },
      { event: "message_stop", data: { type: "message_stop" } },
    ]);
    return;
  }
  sendJson(res, 200, {
    id: "msg_cli_smoke",
    type: "message",
    role: "assistant",
    model,
    content: [{ type: "text", text: "GATEWAY_OK" }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 8, output_tokens: 2 },
  });
}

function respondChatCompletions(res, body) {
  const model = typeof body.model === "string" ? body.model : DEFAULT_MODEL;
  if (body.stream) {
    const created = Math.floor(Date.now() / 1000);
    sendSse(res, [
      {
        data: {
          id: "chatcmpl_cli_smoke",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { role: "assistant" }, finish_reason: null }],
        },
      },
      {
        data: {
          id: "chatcmpl_cli_smoke",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: { content: "GATEWAY_OK" }, finish_reason: null }],
        },
      },
      {
        data: {
          id: "chatcmpl_cli_smoke",
          object: "chat.completion.chunk",
          created,
          model,
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
        },
      },
      { data: "[DONE]" },
    ]);
    return;
  }
  sendJson(res, 200, {
    id: "chatcmpl_cli_smoke",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: "GATEWAY_OK" },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
  });
}

async function prepareIsolatedConfig(root, mockGateway) {
  const { createStudioContext } = await import("../dist/apps/api/index.js");
  const config = createStudioConfig(root);
  fs.mkdirSync(config.projectRoot, { recursive: true });
  const homeDir = path.join(root, "home");
  const context = createStudioContext({
    config,
    logger: { info() {}, warn() {}, error() {}, debug() {} },
    modelGatewayOptions: {
      homeDir,
      listener: { host: "127.0.0.1", port: mockGateway.port },
    },
  });
  const service = context.services.modelGateway;
  service.upsertProvider(undefined, {
    provider: {
      id: "cli-smoke",
      name: "CLI Smoke",
      appScopes: ["codex", "claude-code", "opencode", "openclaw"],
      baseUrl: `${mockGateway.endpoint}`,
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: DEFAULT_MODEL,
        models: [{ id: DEFAULT_MODEL }, { id: ALT_MODEL, aliases: [ALIAS_MODEL] }],
      },
    },
    secret: { apiKey: UPSTREAM_KEY },
  });
  service.updateClientAuth(undefined, { apiKey: LOCAL_GATEWAY_KEY });
  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: DEFAULT_MODEL,
      appModels: {
        codex: ALT_MODEL,
        "claude-code": DEFAULT_MODEL,
        opencode: ALIAS_MODEL,
        openclaw: DEFAULT_MODEL,
      },
      contextWindow: 128000,
      autoCompactTokenLimit: 100000,
      maxOutputTokens: 8192,
      reasoningEffort: "low",
    },
  });
  const applied = service.applyAppConnections(undefined);
  if (!applied.applied.every((item) => item.applied)) {
    throw new Error("Failed to apply all isolated app connections.");
  }
  return { config, homeDir };
}

function baseSmokeEnv(homeDir, config, mockGateway) {
  const scrubbed = { ...process.env };
  for (const key of Object.keys(scrubbed)) {
    if (/^(OPENAI|ANTHROPIC|OPENCODE|CODEX|CLAUDE|OPENROUTER|BIGMODEL|ZHIPU|GMN|MLAMP)_/i.test(key)) {
      delete scrubbed[key];
    }
  }
  return {
    ...scrubbed,
    HOME: homeDir,
    USERPROFILE: homeDir,
    XDG_CONFIG_HOME: path.join(homeDir, ".config"),
    CODEX_HOME: path.join(homeDir, ".codex"),
    OPENCLAW_STATE_DIR: config.openclawRoot,
    OPENCLAW_CONFIG_PATH: config.openclawConfigFile,
    ANTHROPIC_BASE_URL: mockGateway.endpoint.replace(/\/v1\/?$/i, ""),
    ANTHROPIC_API_KEY: LOCAL_GATEWAY_KEY,
    OPENAI_API_KEY: LOCAL_GATEWAY_KEY,
    NO_COLOR: "1",
    CI: "1",
    TERM: "dumb",
  };
}

function smokeDefinitions({ homeDir, config, workDir, mockGateway, includeOpenClawAgent }) {
  const env = baseSmokeEnv(homeDir, config, mockGateway);
  const definitions = [
    {
      id: "codex",
      command: "codex",
      args: [
        "--ask-for-approval",
        "never",
        "--sandbox",
        "read-only",
        "exec",
        "--skip-git-repo-check",
        "--ephemeral",
        "--ignore-rules",
        "--model",
        ALT_MODEL,
        "--cd",
        workDir,
        "Reply exactly GATEWAY_OK. Do not use tools.",
      ],
      env,
      expectedPaths: ["/v1/responses", "/v1/responses/compact"],
    },
    {
      id: "claude-code",
      command: "claude",
      args: [
        "--bare",
        "--print",
        "--output-format",
        "json",
        "--model",
        DEFAULT_MODEL,
        "--settings",
        path.join(homeDir, ".claude", "settings.json"),
        "--no-session-persistence",
        "Reply exactly GATEWAY_OK.",
      ],
      env,
      expectedPaths: ["/v1/messages"],
    },
    {
      id: "opencode",
      command: "opencode",
      args: [
        "run",
        "--pure",
        "--format",
        "json",
        "--model",
        `studio-gateway/${ALIAS_MODEL}`,
        "--dir",
        workDir,
        "Reply exactly GATEWAY_OK.",
      ],
      env,
      expectedPaths: ["/v1/chat/completions"],
    },
    {
      id: "openclaw",
      command: "openclaw",
      args: includeOpenClawAgent
        ? ["agent", "--local", "--json", "--message", "Reply exactly GATEWAY_OK.", "--model", `studio-gateway/${DEFAULT_MODEL}`, "--timeout", "30"]
        : ["models", "status", "--json"],
      env,
      expectedPaths: includeOpenClawAgent ? ["/v1/chat/completions"] : [],
    },
  ];
  return definitions;
}

async function runCommand(definition, requestStore) {
  const executable = commandExists(definition.command);
  if (!executable) {
    return {
      id: definition.id,
      status: "skipped",
      reason: `${definition.command} is not installed or not on PATH.`,
      expectedPaths: definition.expectedPaths,
    };
  }
  const beforeCount = requestStore.length;
  const startedAt = Date.now();
  const child = spawn(executable, definition.args, {
    cwd: definition.env.HOME,
    env: definition.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk.toString("utf8"); });
  child.stderr.on("data", (chunk) => { stderr += chunk.toString("utf8"); });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    child.kill("SIGTERM");
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 2_000).unref();
  }, COMMAND_TIMEOUT_MS);
  const exit = await new Promise((resolve) => {
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timeout);
  const requests = requestStore.slice(beforeCount);
  const hitPaths = [...new Set(requests.map((request) => request.path))];
  const expectedHit = !definition.expectedPaths.length
    || definition.expectedPaths.some((expectedPath) => hitPaths.includes(expectedPath));
  const outputContainsOk = `${stdout}\n${stderr}`.includes("GATEWAY_OK");
  const durationMs = Math.max(0, Date.now() - startedAt);
  const passed = !timedOut && exit.code === 0 && expectedHit && (definition.expectedPaths.length ? outputContainsOk || requests.length > 0 : true);
  return {
    id: definition.id,
    status: passed ? "passed" : "failed",
    command: [definition.command, ...definition.args],
    exitCode: exit.code,
    signal: exit.signal,
    timedOut,
    durationMs,
    expectedPaths: definition.expectedPaths,
    hitPaths,
    requestCount: requests.length,
    outputContainsOk,
    stdoutPreview: preview(stdout),
    stderrPreview: preview(stderr),
  };
}

function preview(value) {
  return value.replace(new RegExp(LOCAL_GATEWAY_KEY, "g"), "<LOCAL_GATEWAY_KEY>")
    .replace(new RegExp(UPSTREAM_KEY, "g"), "<UPSTREAM_KEY>")
    .slice(0, 2000);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tempParent = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tempParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(tempParent, "studio-gateway-cli-smoke-"));
  const deadline = setTimeout(() => {
    console.error("CLI smoke timed out.");
    process.exit(2);
  }, SCRIPT_TIMEOUT_MS);
  let mockGateway;
  try {
    mockGateway = await startMockGateway();
    const prepared = await prepareIsolatedConfig(root, mockGateway);
    const workDir = path.join(root, "workspace");
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, "README.md"), "# CLI smoke workspace\n", "utf8");
    const definitions = smokeDefinitions({
      ...prepared,
      workDir,
      mockGateway,
      includeOpenClawAgent: options.includeOpenClawAgent,
    }).filter((definition) => !options.apps || options.apps.includes(definition.id));
    const results = [];
    for (const definition of definitions) {
      results.push(await runCommand(definition, mockGateway.requests));
    }
    const summary = {
      ok: results.every((result) => result.status === "passed" || result.status === "skipped"),
      strict: options.strict,
      tempRoot: root,
      mockGatewayEndpoint: mockGateway.endpoint,
      results,
      requestLog: mockGateway.requests.map((request) => ({
        method: request.method,
        path: request.path,
        model: typeof request.body?.model === "string" ? request.body.model : null,
      })),
    };
    console.log(JSON.stringify(summary, null, 2));
    if (!options.keepTemp) fs.rmSync(root, { recursive: true, force: true });
    if (options.strict && !summary.ok) process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    if (mockGateway) await mockGateway.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
