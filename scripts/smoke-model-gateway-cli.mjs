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
const DEFAULT_TARGET_MODEL = "gpt-5.4";
const FALLBACK_MOCK_MODEL = "model-a";

function parseArgs(argv) {
  const options = {
    strict: false,
    keepTemp: false,
    includeOpenClawAgent: false,
    apps: null,
    targetModel: process.env.TRACEVANE_GATEWAY_CLI_SMOKE_MODEL || DEFAULT_TARGET_MODEL,
    targetModelsRaw: process.env.TRACEVANE_GATEWAY_CLI_SMOKE_MODELS || null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--strict") options.strict = true;
    else if (arg === "--keep-temp") options.keepTemp = true;
    else if (arg === "--include-openclaw-agent") options.includeOpenClawAgent = true;
    else if (arg === "--apps") options.apps = (argv[++index] || "").split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg.startsWith("--apps=")) options.apps = arg.slice("--apps=".length).split(",").map((item) => item.trim()).filter(Boolean);
    else if (arg === "--target-model") options.targetModel = argv[++index] || "";
    else if (arg.startsWith("--target-model=")) options.targetModel = arg.slice("--target-model=".length);
    else if (arg === "--target-models") options.targetModelsRaw = argv[++index] || "";
    else if (arg.startsWith("--target-models=")) options.targetModelsRaw = arg.slice("--target-models=".length);
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.targetModels = options.targetModelsRaw === null
    ? [normalizeTargetModel(options.targetModel)]
    : normalizeTargetModels(options.targetModelsRaw);
  options.targetModel = options.targetModels[0];
  delete options.targetModelsRaw;
  return options;
}

function normalizeTargetModel(value) {
  const model = String(value || "").trim();
  if (!model) throw new Error("--target-model must not be empty.");
  return model;
}

function normalizeTargetModels(value) {
  const models = String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (!models.length) throw new Error("--target-models must include at least one model id.");
  return [...new Set(models)];
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-model-gateway-cli.mjs [options]

Runs isolated Tracevane Gateway CLI startup smoke checks plus Gateway HTTP maturity probes.

Options:
  --apps <ids>                 Comma-separated app ids: codex,claude-code,claude-code-tool,claude-code-summary,opencode,openclaw,gateway
  --target-model <id>          Single model id advertised to real CLIs and isolated Gateway config (default: gpt-5.4)
  --target-models <csv>        Run the same smoke set once per model id, for example gpt-5.4,gpt-5.5,gpt-5.4-mini
  --strict                     Exit non-zero when an installed CLI smoke fails
  --include-openclaw-agent     Also try openclaw agent --local, not only config startup
  --keep-temp                  Keep the temporary HOME/state directory
  -h, --help                   Show this help

Run npm run build:api before invoking this script directly.`);
}

function createTracevaneConfig(root) {
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
    projectRoot: path.join(root, "tracevane"),
    webDistDir: path.join(root, "tracevane/apps/web/dist"),
    gatewayPort: 31879,
    gatewayWsUrl: "ws://127.0.0.1:31879",
    gatewayControlUiBasePath: "",
    transport: {
      standalone: { enabled: true, port: 3760 },
      gateway: { enabled: true, basePath: "/tracevane" },
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

async function startMockGateway(targetModel) {
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
        data: [targetModel].map((id) => ({
          id,
          object: "model",
          created: 0,
          owned_by: "tracevane-gateway-cli-smoke",
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
  const model = typeof body.model === "string" ? body.model : FALLBACK_MOCK_MODEL;
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
  const model = typeof body.model === "string" ? body.model : FALLBACK_MOCK_MODEL;
  const requestText = collectRequestText(body);
  const hasToolResult = requestText.includes("tool_result");
  const shouldCallBash = Array.isArray(body.tools)
    && requestText.includes("CLAUDE_TOOL_SMOKE")
    && !hasToolResult;
  const responseText = requestText.includes("CLAUDE_SUMMARY_SMOKE")
    ? "GATEWAY_OK compact summary"
    : "GATEWAY_OK";
  if (body.stream) {
    if (shouldCallBash) {
      sendSse(res, [
        {
          event: "message_start",
          data: {
            type: "message_start",
            message: {
              id: "msg_cli_tool_smoke",
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
        {
          event: "content_block_start",
          data: {
            type: "content_block_start",
            index: 0,
            content_block: {
              type: "tool_use",
              id: "toolu_cli_smoke",
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
              partial_json: "{\"command\":\"printf GATEWAY_OK\",\"description\":\"Print gateway marker\"}",
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
      return;
    }
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
      { event: "content_block_delta", data: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: responseText } } },
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
    content: [{ type: "text", text: responseText }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 8, output_tokens: 2 },
  });
}

function respondChatCompletions(res, body) {
  const model = typeof body.model === "string" ? body.model : FALLBACK_MOCK_MODEL;
  const requestText = collectRequestText(body);
  if (requestText.includes("FORCE_UPSTREAM_ERROR")) {
    sendJson(res, 429, {
      error: {
        message: "Mock upstream rate limit for error envelope probe.",
        type: "rate_limit_error",
        code: "rate_limit_exceeded",
        param: "messages",
      },
    });
    return;
  }
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
  const hasToolResult = Array.isArray(body.messages)
    && body.messages.some((message) => message?.role === "tool");
  const shouldCallTool = Array.isArray(body.tools)
    && requestText.includes("Please call lookup");
  const message = shouldCallTool
    ? {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "call_lookup",
        type: "function",
        function: {
          name: "lookup",
          arguments: "{\"query\":\"docs\"}",
        },
      }],
    }
    : {
      role: "assistant",
      content: hasToolResult ? "TOOL_HISTORY_OK" : "GATEWAY_OK",
    };
  sendJson(res, 200, {
    id: shouldCallTool ? "chatcmpl_cli_tool_smoke" : "chatcmpl_cli_smoke",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [{
      index: 0,
      message,
      finish_reason: shouldCallTool ? "tool_calls" : "stop",
    }],
    usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
  });
}

function collectRequestText(value) {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return value.map(collectRequestText).join("\n");
  if (typeof value !== "object") return "";
  return Object.values(value).map(collectRequestText).join("\n");
}

async function prepareIsolatedConfig(root, mockGateway, targetModel) {
  const { createTracevaneContext } = await import("../dist/apps/api/index.js");
  const config = createTracevaneConfig(root);
  fs.mkdirSync(config.projectRoot, { recursive: true });
  const homeDir = path.join(root, "home");
  const context = createTracevaneContext({
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
        defaultModel: targetModel,
        models: [{ id: targetModel }],
      },
    },
    secret: { apiKey: UPSTREAM_KEY },
  });
  service.updateClientAuth(undefined, { apiKey: LOCAL_GATEWAY_KEY });
  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: targetModel,
      appModels: {
        codex: targetModel,
        "claude-code": targetModel,
        opencode: targetModel,
        openclaw: targetModel,
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
  return { config, homeDir, context };
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

function smokeDefinitions({ homeDir, config, workDir, mockGateway, includeOpenClawAgent, targetModel }) {
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
        targetModel,
        "--cd",
        workDir,
        "Reply exactly GATEWAY_OK. Do not use tools.",
      ],
      env,
      expectedPaths: ["/v1/responses", "/v1/responses/compact"],
      expectedModel: targetModel,
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
        targetModel,
        "--settings",
        path.join(homeDir, ".claude", "settings.json"),
        "--no-session-persistence",
        "Reply exactly GATEWAY_OK.",
      ],
      env,
      expectedPaths: ["/v1/messages"],
      expectedModel: targetModel,
    },
    {
      id: "claude-code-tool",
      command: "claude",
      args: [
        "--bare",
        "--print",
        "--output-format",
        "json",
        "--model",
        targetModel,
        "--settings",
        path.join(homeDir, ".claude", "settings.json"),
        "--no-session-persistence",
        "--tools",
        "Bash",
        "--allowedTools",
        "Bash",
        "--permission-mode",
        "bypassPermissions",
        "CLAUDE_TOOL_SMOKE: Use Bash to echo GATEWAY_OK.",
      ],
      env,
      expectedPaths: ["/v1/messages"],
      expectedModel: targetModel,
      minRequestCount: 2,
    },
    {
      id: "claude-code-summary",
      command: "claude",
      args: [
        "--bare",
        "--print",
        "--output-format",
        "json",
        "--model",
        targetModel,
        "--settings",
        path.join(homeDir, ".claude", "settings.json"),
        "--no-session-persistence",
        "CLAUDE_SUMMARY_SMOKE: Summarize this compact handoff and include GATEWAY_OK.",
      ],
      env,
      expectedPaths: ["/v1/messages"],
      expectedModel: targetModel,
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
        `tracevane-gateway/${targetModel}`,
        "--dir",
        workDir,
        "Reply exactly GATEWAY_OK.",
      ],
      env,
      expectedPaths: ["/v1/chat/completions"],
      expectedModel: targetModel,
    },
    {
      id: "openclaw",
      command: "openclaw",
      args: includeOpenClawAgent
        ? ["agent", "--agent", "main", "--local", "--json", "--message", "Reply exactly GATEWAY_OK.", "--model", `tracevane-gateway/${targetModel}`, "--timeout", "30"]
        : ["models", "status", "--json"],
      env,
      expectedPaths: includeOpenClawAgent ? ["/v1/chat/completions"] : [],
      expectedModel: includeOpenClawAgent ? targetModel : null,
      validateOutput: includeOpenClawAgent ? (context) => validateOpenClawAgentOutput(context, targetModel) : undefined,
    },
  ];
  return definitions;
}

function validateOpenClawAgentOutput({ stdout }, targetModel) {
  const parsed = parseJsonFromOutput(stdout);
  const agentMeta = parsed?.meta?.agentMeta;
  const usage = agentMeta?.usage;
  const lastCallUsage = agentMeta?.lastCallUsage;
  const errors = [];
  const payloadText = Array.isArray(parsed?.payloads)
    ? parsed.payloads.map((payload) => payload?.text).filter((text) => typeof text === "string").join("\n")
    : "";
  if (!payloadText.includes("GATEWAY_OK")) errors.push("OpenClaw JSON payload did not include GATEWAY_OK.");
  if (agentMeta?.provider !== "tracevane-gateway") errors.push(`OpenClaw agent provider was ${String(agentMeta?.provider || "<missing>")}.`);
  if (agentMeta?.model !== targetModel) errors.push(`OpenClaw agent model was ${String(agentMeta?.model || "<missing>")}.`);
  if (usage?.input !== 8 || usage?.output !== 2 || usage?.total !== 10) {
    errors.push("OpenClaw usage summary did not preserve input/output/total tokens.");
  }
  if (lastCallUsage?.cacheRead !== 0 || lastCallUsage?.cacheWrite !== 0) {
    errors.push("OpenClaw last-call usage did not preserve cache read/write fields.");
  }
  return {
    ok: errors.length === 0,
    errors,
    facts: {
      provider: agentMeta?.provider || null,
      model: agentMeta?.model || null,
      usage: usage && typeof usage === "object" ? usage : null,
      lastCallUsage: lastCallUsage && typeof lastCallUsage === "object" ? {
        input: lastCallUsage.input ?? null,
        output: lastCallUsage.output ?? null,
        cacheRead: lastCallUsage.cacheRead ?? null,
        cacheWrite: lastCallUsage.cacheWrite ?? null,
        total: lastCallUsage.total ?? null,
      } : null,
      contextTokens: agentMeta?.contextTokens ?? null,
    },
  };
}

function parseJsonFromOutput(output) {
  const trimmed = output.trim();
  if (!trimmed) throw new Error("Command stdout was empty.");
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) throw new Error("Command stdout did not contain a JSON object.");
    return JSON.parse(trimmed.slice(start, end + 1));
  }
}

async function runCommand(definition, requestStore) {
  const executable = commandExists(definition.command);
  if (!executable) {
    return {
      id: definition.id,
      status: "skipped",
      reason: `${definition.command} is not installed or not on PATH.`,
      expectedPaths: definition.expectedPaths,
      expectedModel: definition.expectedModel || null,
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
  const requestedModels = [...new Set(requests.map((request) => request.body?.model).filter((model) => typeof model === "string"))];
  const modelMatches = !definition.expectedModel || (requestedModels.length > 0 && requestedModels.every((model) => model === definition.expectedModel));
  const minRequestCount = definition.minRequestCount ?? (definition.expectedPaths.length ? 1 : 0);
  const expectedHit = !definition.expectedPaths.length
    || definition.expectedPaths.some((expectedPath) => hitPaths.includes(expectedPath));
  const outputContainsOk = `${stdout}\n${stderr}`.includes("GATEWAY_OK");
  const outputValidation = typeof definition.validateOutput === "function"
    ? validateCommandOutput(definition.validateOutput, { stdout, stderr, requests })
    : null;
  const durationMs = Math.max(0, Date.now() - startedAt);
  const passed = !timedOut
    && exit.code === 0
    && expectedHit
    && requests.length >= minRequestCount
    && modelMatches
    && (!outputValidation || outputValidation.ok)
    && (definition.expectedPaths.length ? outputContainsOk || requests.length > 0 : true);
  return {
    id: definition.id,
    status: passed ? "passed" : "failed",
    command: [definition.command, ...definition.args],
    exitCode: exit.code,
    signal: exit.signal,
    timedOut,
    durationMs,
    expectedPaths: definition.expectedPaths,
    expectedModel: definition.expectedModel || null,
    hitPaths,
    requestedModels,
    modelMatches,
    minRequestCount,
    requestCount: requests.length,
    outputContainsOk,
    ...(outputValidation ? { outputValidation } : {}),
    stdoutPreview: preview(stdout),
    stderrPreview: preview(stderr),
  };
}

function validateCommandOutput(validateOutput, context) {
  try {
    return normalizeValidationResult(validateOutput(context));
  } catch (error) {
    return {
      ok: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function normalizeValidationResult(result) {
  if (!result || typeof result !== "object") return { ok: false, errors: ["Output validation did not return a result."] };
  return {
    ok: result.ok === true,
    ...(Array.isArray(result.errors) && result.errors.length ? { errors: result.errors } : {}),
    ...(result.facts && typeof result.facts === "object" ? { facts: result.facts } : {}),
  };
}

function preview(value) {
  return value.replace(new RegExp(LOCAL_GATEWAY_KEY, "g"), "<LOCAL_GATEWAY_KEY>")
    .replace(new RegExp(UPSTREAM_KEY, "g"), "<UPSTREAM_KEY>")
    .slice(0, 2000);
}

async function startTracevaneGatewayServer(context) {
  const { createTracevaneRequestHandler } = await import("../dist/apps/api/index.js");
  const handler = createTracevaneRequestHandler(context, { stripBasePath: "" });
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
  if (!address || typeof address !== "object") throw new Error("Tracevane Gateway smoke server did not bind to a TCP port.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

async function runGatewayMaturityProbes(context, mockGateway, targetModel) {
  const server = await startTracevaneGatewayServer(context);
  const startedAt = Date.now();
  const beforeCount = mockGateway.requests.length;
  try {
    const headers = gatewayHeaders();
    const compact = await requestJson(`${server.baseUrl}/v1/responses/compact`, {
      method: "POST",
      headers,
      body: {
        model: targetModel,
        input: "Summarize compact maturity.",
        stream: false,
      },
    });
    assertProbe(compact.status === 200, `compact probe returned HTTP ${compact.status}: ${compact.raw}`);
    assertProbe(collectResponsesOutputText(compact.body).includes("GATEWAY_OK"), "compact probe did not return adapted Responses text.");

    const toolStartIndex = mockGateway.requests.length;
    const firstTool = await requestJson(`${server.baseUrl}/v1/responses`, {
      method: "POST",
      headers,
      body: {
        model: targetModel,
        input: [{ role: "user", content: "Please call lookup." }],
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
        tool_choice: { type: "function", name: "lookup" },
        stream: false,
      },
    });
    assertProbe(firstTool.status === 200, `tool probe returned HTTP ${firstTool.status}: ${firstTool.raw}`);
    const functionCall = findResponsesFunctionCall(firstTool.body);
    assertProbe(Boolean(functionCall), "tool probe did not return a Responses function_call item.");
    const callId = stringOrNull(functionCall.call_id) || stringOrNull(functionCall.id);
    assertProbe(Boolean(callId), "tool probe function_call was missing call_id.");

    const followUp = await requestJson(`${server.baseUrl}/v1/responses`, {
      method: "POST",
      headers,
      body: {
        model: targetModel,
        previous_response_id: firstTool.body.id,
        input: [{
          type: "function_call_output",
          call_id: callId,
          output: "lookup done",
        }],
        stream: false,
      },
    });
    assertProbe(followUp.status === 200, `tool history probe returned HTTP ${followUp.status}: ${followUp.raw}`);
    assertProbe(
      collectResponsesOutputText(followUp.body).includes("TOOL_HISTORY_OK"),
      "tool history probe did not return the follow-up text.",
    );
    const toolRequests = mockGateway.requests.slice(toolStartIndex);
    const followUpUpstream = toolRequests.at(-1);
    assertProbe(hasRestoredAssistantToolCall(followUpUpstream?.body, callId), "Codex history did not restore the prior assistant tool call before tool output.");

    const upstreamError = await requestJson(`${server.baseUrl}/v1/responses`, {
      method: "POST",
      headers,
      body: {
        model: targetModel,
        input: "FORCE_UPSTREAM_ERROR",
        stream: false,
      },
    });
    assertProbe(upstreamError.status === 429, `error envelope probe returned HTTP ${upstreamError.status}: ${upstreamError.raw}`);
    assertProbe(upstreamError.body?.error?.code === "rate_limit_exceeded", "error envelope probe did not preserve upstream error code.");
    assertProbe(upstreamError.body?.error?.type === "rate_limit_error", "error envelope probe did not preserve upstream error type.");
    assertProbe(upstreamError.body?.error?.param === "messages", "error envelope probe did not preserve upstream error param.");

    const runtime = await requestJson(`${server.baseUrl}/api/model-gateway/runtime`);
    assertProbe(runtime.status === 200, `runtime probe returned HTTP ${runtime.status}: ${runtime.raw}`);
    const outcomes = Array.isArray(runtime.body?.runtime?.requestLog)
      ? runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.outcome, entry.errorCode || null])
      : [];
    assertProbe(
      outcomes.some(([routeId, outcome]) => routeId === "openai_responses_compact" && outcome === "success"),
      "runtime log did not record compact success.",
    );
    assertProbe(
      outcomes.some(([routeId, outcome, errorCode]) => routeId === "openai_responses" && outcome === "failure" && errorCode === "rate_limit_exceeded"),
      "runtime log did not record normalized upstream rate-limit failure.",
    );

    const requests = mockGateway.requests.slice(beforeCount);
    return {
      id: "gateway",
      status: "passed",
      durationMs: Math.max(0, Date.now() - startedAt),
      baseUrl: server.baseUrl,
      probes: ["responses-compact", "tool-history", "error-envelope", "runtime-log"],
      requestCount: requests.length,
      hitPaths: [...new Set(requests.map((request) => request.path))],
      compactResponseId: compact.body?.id || null,
      toolResponseId: firstTool.body?.id || null,
      followUpResponseId: followUp.body?.id || null,
    };
  } catch (error) {
    return {
      id: "gateway",
      status: "failed",
      durationMs: Math.max(0, Date.now() - startedAt),
      baseUrl: server.baseUrl,
      error: error instanceof Error ? error.message : String(error),
      requestCount: mockGateway.requests.length - beforeCount,
      hitPaths: [...new Set(mockGateway.requests.slice(beforeCount).map((request) => request.path))],
    };
  } finally {
    await server.close();
  }
}

function gatewayHeaders() {
  return {
    authorization: `Bearer ${LOCAL_GATEWAY_KEY}`,
    "x-tracevane-app-scope": "codex",
  };
}

async function requestJson(url, options = {}) {
  const headers = {
    ...(options.body === undefined ? {} : { "content-type": "application/json" }),
    ...(options.headers || {}),
  };
  const response = await fetch(url, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const raw = await response.text();
  let body = null;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  return {
    status: response.status,
    headers: Object.fromEntries(response.headers.entries()),
    body,
    raw,
  };
}

function assertProbe(condition, message) {
  if (!condition) throw new Error(message);
}

function collectResponsesOutputText(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.flatMap((item) => {
    const content = Array.isArray(item?.content) ? item.content : [];
    return content.map((part) => part?.text).filter((text) => typeof text === "string");
  }).join("");
}

function findResponsesFunctionCall(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.find((item) => item?.type === "function_call") || null;
}

function hasRestoredAssistantToolCall(body, callId) {
  if (!callId || !Array.isArray(body?.messages)) return false;
  const assistantIndex = body.messages.findIndex((message) => (
    message?.role === "assistant"
    && Array.isArray(message.tool_calls)
    && message.tool_calls.some((toolCall) => toolCall?.id === callId)
  ));
  const toolIndex = body.messages.findIndex((message) => (
    message?.role === "tool"
    && message.tool_call_id === callId
  ));
  return assistantIndex >= 0 && toolIndex > assistantIndex;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function safePathSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 80) || "model";
}

async function runSmokeForTargetModel(root, options, targetModel) {
  const targetRoot = options.targetModels.length === 1 ? root : path.join(root, safePathSegment(targetModel));
  fs.mkdirSync(targetRoot, { recursive: true });
  let mockGateway;
  try {
    mockGateway = await startMockGateway(targetModel);
    const prepared = await prepareIsolatedConfig(targetRoot, mockGateway, targetModel);
    const workDir = path.join(targetRoot, "workspace");
    fs.mkdirSync(workDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, "README.md"), `# CLI smoke workspace for ${targetModel}\n`, "utf8");
    const definitions = smokeDefinitions({
      ...prepared,
      workDir,
      mockGateway,
      includeOpenClawAgent: options.includeOpenClawAgent,
      targetModel,
    }).filter((definition) => !options.apps || options.apps.includes(definition.id));
    const results = [];
    for (const definition of definitions) {
      results.push(await runCommand(definition, mockGateway.requests));
    }
    const gatewayMaturity = !options.apps || options.apps.includes("gateway")
      ? await runGatewayMaturityProbes(prepared.context, mockGateway, targetModel)
      : {
        id: "gateway",
        status: "skipped",
        reason: "Gateway HTTP maturity probes were excluded by --apps.",
      };
    return {
      ok: results.every((result) => result.status === "passed" || result.status === "skipped")
        && (gatewayMaturity.status === "passed" || gatewayMaturity.status === "skipped"),
      targetModel,
      tempRoot: targetRoot,
      mockGatewayEndpoint: mockGateway.endpoint,
      tracevaneGatewayEndpoint: gatewayMaturity.baseUrl ? `${gatewayMaturity.baseUrl}/v1` : null,
      results,
      gatewayMaturity,
      requestLog: mockGateway.requests.map((request) => ({
        method: request.method,
        path: request.path,
        model: typeof request.body?.model === "string" ? request.body.model : null,
      })),
    };
  } finally {
    if (mockGateway) await mockGateway.close();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const tempParent = path.join(process.cwd(), ".tmp");
  fs.mkdirSync(tempParent, { recursive: true });
  const root = fs.mkdtempSync(path.join(tempParent, "tracevane-gateway-cli-smoke-"));
  const deadline = setTimeout(() => {
    console.error("CLI smoke timed out.");
    process.exit(2);
  }, SCRIPT_TIMEOUT_MS * Math.max(1, options.targetModels.length));
  try {
    const modelRuns = [];
    for (const targetModel of options.targetModels) {
      modelRuns.push(await runSmokeForTargetModel(root, options, targetModel));
    }
    const ok = modelRuns.every((run) => run.ok);
    const summary = modelRuns.length === 1
      ? {
        ok,
        strict: options.strict,
        ...modelRuns[0],
      }
      : {
        ok,
        strict: options.strict,
        tempRoot: root,
        targetModels: options.targetModels,
        modelRuns,
      };
    console.log(JSON.stringify(summary, null, 2));
    if (!options.keepTemp) fs.rmSync(root, { recursive: true, force: true });
    if (options.strict && !summary.ok) process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
