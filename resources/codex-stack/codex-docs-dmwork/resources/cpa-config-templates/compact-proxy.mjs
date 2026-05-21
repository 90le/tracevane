#!/usr/bin/env node
/**
 * Compact Proxy for Codex Responses API.
 *
 * CPA's OpenAI-compatible provider path is reliable for /v1/chat/completions,
 * while Codex now talks to /v1/responses. This proxy keeps CPA as the local
 * chat-completions upstream and provides the Responses compatibility layer that
 * Codex expects:
 *
 * - POST /v1/responses -> translate to /v1/chat/completions and back
 * - POST /v1/responses/compact -> summarize through /v1/chat/completions
 * - other HTTP/WebSocket traffic -> forward to CPA
 *
 * Set CPA_BASE_URL to use a non-default upstream, including https://... . The
 * local listener remains plain HTTP, so no local certificate installation is
 * required.
 */

import http from "node:http";
import https from "node:https";
import * as zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

function loadWs() {
  const candidates = ["ws"];
  const home = os.homedir();
  candidates.push(path.join(home, ".openclaw", "node_modules", "ws"));
  candidates.push(path.join(home, ".local", "lib", "node_modules", "ws"));
  candidates.push(path.join(home, ".npm-global", "lib", "node_modules", "ws"));
  try {
    const npmRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
    if (npmRoot) candidates.push(path.join(npmRoot, "ws"));
  } catch {}

  const errors = [];
  for (const candidate of candidates) {
    try {
      return require(candidate);
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`);
    }
  }
  throw new Error(`Cannot load ws module. Run: npm install -g ws\n${errors.join("\n")}`);
}

const { WebSocketServer, WebSocket } = loadWs();

const CPA_HOST = process.env.CPA_HOST || "127.0.0.1";
const CPA_PORT = Number(process.env.CPA_PORT || 8317);
const CPA_BASE_URL = process.env.CPA_BASE_URL || process.env.CPA_UPSTREAM_BASE_URL || `http://${CPA_HOST}:${CPA_PORT}`;
const LISTEN_HOST = process.env.LISTEN_HOST || "127.0.0.1";
const LISTEN_PORT = Number(process.env.LISTEN_PORT || 18796);
const DEFAULT_MODEL = process.env.COMPACT_DEFAULT_MODEL || "glm-5.1";
const MAX_CONV_CHARS = Number(process.env.COMPACT_MAX_CONV_CHARS || 300000);
const REQUEST_TIMEOUT_MS = Number(process.env.COMPACT_TIMEOUT_MS || 300000);
const RESPONSES_MODE = (process.env.COMPACT_RESPONSES_MODE || "adapter").toLowerCase();
const UPSTREAM_API_KEY = process.env.CPA_UPSTREAM_API_KEY || process.env.COMPACT_UPSTREAM_API_KEY || process.env.CPA_KEY || "";
const COMPACT_ENABLE_WEBSOCKETS = /^(1|true|yes)$/i.test(process.env.COMPACT_ENABLE_WEBSOCKETS || "");

const upstreamBase = new URL(CPA_BASE_URL);
if (!["http:", "https:"].includes(upstreamBase.protocol)) {
  throw new Error(`CPA_BASE_URL must use http or https, got: ${CPA_BASE_URL}`);
}

const upstreamAgent = upstreamBase.protocol === "https:"
  ? new https.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16, timeout: REQUEST_TIMEOUT_MS })
  : new http.Agent({ keepAlive: true, maxSockets: 64, maxFreeSockets: 16, timeout: REQUEST_TIMEOUT_MS });

const COMPACT_SYSTEM = `You are a context compaction assistant. Summarize the conversation into a concise but complete handoff that preserves:

1. Task objectives and current progress
2. Key decisions and constraints
3. Files read, created, or modified with exact paths
4. Errors encountered and resolutions
5. Current service/runtime state
6. Next steps
7. User preferences that future agents must honor

Return structured markdown. Be concrete and avoid generic filler.`;

function log(message) {
  process.stderr.write(`[compact-proxy] ${message}\n`);
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function shortId(prefix) {
  return `${prefix}_${randomUUID().replace(/-/g, "")}`;
}

function requestModule() {
  return upstreamBase.protocol === "https:" ? https : http;
}

function resolveUpstreamPath(requestPath) {
  const local = new URL(requestPath || "/", "http://127.0.0.1");
  const rawPath = `${local.pathname}${local.search}`;
  const basePath = upstreamBase.pathname.replace(/\/+$/, "");
  if (!basePath || basePath === "/") return rawPath;
  if (basePath.endsWith("/v1") && local.pathname.startsWith("/v1/")) {
    return `${basePath}${rawPath.slice(3)}`;
  }
  return `${basePath}${rawPath}`;
}

function wsUpstreamUrl(requestPath) {
  const protocol = upstreamBase.protocol === "https:" ? "wss:" : "ws:";
  const port = upstreamBase.port ? `:${upstreamBase.port}` : "";
  return `${protocol}//${upstreamBase.hostname}${port}${resolveUpstreamPath(requestPath)}`;
}

function forwardHeaders(req) {
  const headers = {};
  for (const key of [
    "authorization",
    "content-type",
    "user-agent",
    "accept",
    "openai-beta",
    "session_id",
    "thread_id",
    "originator",
    "version",
    "x-codex-beta-features",
    "x-codex-installation-id",
    "x-codex-window-id",
    "x-stainless-arch",
    "x-stainless-lang",
    "x-stainless-os",
    "x-stainless-package-version",
    "x-stainless-runtime",
    "x-stainless-runtime-version",
  ]) {
    const value = req.headers[key];
    if (value) headers[key] = value;
  }
  return headers;
}

function upstreamAuthorization(req) {
  if (UPSTREAM_API_KEY) return `Bearer ${UPSTREAM_API_KEY}`;
  return req.headers.authorization || "";
}

function applyUpstreamAuthorization(headers, req) {
  const authorization = upstreamAuthorization(req);
  if (authorization) headers.authorization = authorization;
  else delete headers.authorization;
  return headers;
}

function json(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function responseError(message, code = "api_error") {
  return { error: { message, code, type: code } };
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function decodeRequestBody(req, body) {
  const encoding = String(req.headers["content-encoding"] || "identity").trim().toLowerCase();
  if (!body.length || encoding === "" || encoding === "identity") return body;
  if (encoding === "gzip" || encoding === "x-gzip") return zlib.gunzipSync(body);
  if (encoding === "br") return zlib.brotliDecompressSync(body);
  if (encoding === "deflate") return zlib.inflateSync(body);
  if (encoding === "zstd" && typeof zlib.zstdDecompressSync === "function") return zlib.zstdDecompressSync(body);
  throw new Error(`unsupported request content-encoding: ${encoding}`);
}

async function readJsonRequest(req) {
  const body = await readBody(req);
  const decoded = decodeRequestBody(req, body);
  return JSON.parse(decoded.toString("utf8"));
}

function requestUpstream({ method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const upstream = requestModule().request({
      protocol: upstreamBase.protocol,
      hostname: upstreamBase.hostname,
      port: upstreamBase.port || (upstreamBase.protocol === "https:" ? 443 : 80),
      agent: upstreamAgent,
      method,
      path: resolveUpstreamPath(url),
      headers,
      timeout: REQUEST_TIMEOUT_MS,
    }, (upstreamRes) => {
      const chunks = [];
      upstreamRes.on("data", (chunk) => chunks.push(chunk));
      upstreamRes.on("end", () => {
        resolve({
          statusCode: upstreamRes.statusCode || 502,
          headers: upstreamRes.headers,
          body: Buffer.concat(chunks),
        });
      });
    });

    upstream.on("timeout", () => {
      upstream.destroy(new Error("upstream timeout"));
    });
    upstream.on("error", reject);
    if (body?.length) upstream.end(body);
    else upstream.end();
  });
}

function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (!part || typeof part !== "object") return "";
    if (part.type === "input_text" || part.type === "output_text" || part.type === "text") return part.text || "";
    if (part.type === "input_image") return "[image input omitted by local Responses adapter]";
    if (part.type === "input_file") return "[file input omitted by local Responses adapter]";
    return "";
  }).filter(Boolean).join("\n");
}

function normalizeChatRole(role) {
  if (role === "assistant") return "assistant";
  if (role === "system" || role === "developer") return "system";
  if (role === "tool") return "tool";
  return "user";
}

function responseInputToChatMessages(body) {
  if (Array.isArray(body.messages) && body.input === undefined) {
    return body.messages.map((message) => ({ ...message, role: normalizeChatRole(message.role) }));
  }

  const messages = [];
  if (body.instructions) {
    messages.push({ role: "system", content: String(body.instructions) });
  }

  const input = body.input ?? "";
  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (!item || typeof item !== "object") continue;
      if (item.type === "message") {
        const content = extractTextContent(item.content).trim();
        if (!content) continue;
        messages.push({ role: normalizeChatRole(item.role), content });
        continue;
      }
      if (item.type === "function_call") {
        const callId = item.call_id || item.id || shortId("call");
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: [{
            id: callId,
            type: "function",
            function: {
              name: item.name || "tool",
              arguments: item.arguments || "{}",
            },
          }],
        });
        continue;
      }
      if (item.type === "function_call_output") {
        messages.push({
          role: "tool",
          tool_call_id: item.call_id,
          content: item.output || "",
        });
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "" });
  }
  return messages;
}

function responsesToolsToChatTools(tools) {
  if (!Array.isArray(tools)) return undefined;
  const converted = [];
  for (const tool of tools) {
    if (!tool || tool.type !== "function") continue;
    const fn = tool.function && typeof tool.function === "object" ? tool.function : tool;
    if (!fn.name) continue;
    const chatTool = {
      type: "function",
      function: {
        name: fn.name,
        description: fn.description || "",
        parameters: fn.parameters || {},
      },
    };
    if (fn.strict !== undefined || tool.strict !== undefined) {
      chatTool.function.strict = Boolean(fn.strict ?? tool.strict);
    }
    converted.push(chatTool);
  }
  return converted.length > 0 ? converted : undefined;
}

function responsesToolChoiceToChatToolChoice(toolChoice) {
  if (!toolChoice || toolChoice === "auto" || toolChoice === "none" || toolChoice === "required") return toolChoice;
  if (toolChoice.type === "function" && toolChoice.function?.name) {
    return { type: "function", function: { name: toolChoice.function.name } };
  }
  return undefined;
}

function responsesBodyToChatBody(body) {
  const chatBody = {
    model: body.model || DEFAULT_MODEL,
    messages: responseInputToChatMessages(body),
    stream: Boolean(body.stream),
  };

  const tools = responsesToolsToChatTools(body.tools);
  if (tools) chatBody.tools = tools;

  const toolChoice = responsesToolChoiceToChatToolChoice(body.tool_choice);
  if (toolChoice) chatBody.tool_choice = toolChoice;

  if (Number.isFinite(body.max_output_tokens)) chatBody.max_tokens = body.max_output_tokens;
  if (Number.isFinite(body.temperature)) chatBody.temperature = body.temperature;
  if (Number.isFinite(body.top_p)) chatBody.top_p = body.top_p;
  if (typeof body.user === "string") chatBody.user = body.user;
  if (body.reasoning?.effort) chatBody.reasoning_effort = body.reasoning.effort;
  if (typeof body.parallel_tool_calls === "boolean") chatBody.parallel_tool_calls = body.parallel_tool_calls;

  return chatBody;
}

function normalizeUsage(usage) {
  if (!usage || typeof usage !== "object") {
    return { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  }
  const input = Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) || 0;
  const output = Number(usage.output_tokens ?? usage.completion_tokens ?? 0) || 0;
  const total = Number(usage.total_tokens ?? input + output) || 0;
  return {
    input_tokens: Math.max(0, input),
    output_tokens: Math.max(0, output),
    total_tokens: Math.max(0, total),
  };
}

function createAssistantOutputItem({ id, text, status = "completed", phase }) {
  return {
    type: "message",
    id,
    role: "assistant",
    content: [{ type: "output_text", text }],
    ...(phase ? { phase } : {}),
    status,
  };
}

function createFunctionCallOutputItem({ id, callId, name, args, status = "completed" }) {
  return {
    type: "function_call",
    id,
    call_id: callId,
    name: name || "tool",
    arguments: args || "{}",
    status,
  };
}

function createResponseResource({ id, model, status, output, usage, error }) {
  return {
    id,
    object: "response",
    created_at: nowSeconds(),
    status,
    model,
    output,
    usage: normalizeUsage(usage),
    ...(error ? { error } : {}),
  };
}

function extractMessageText(message) {
  const content = message?.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => {
    if (typeof part === "string") return part;
    if (part?.type === "text") return part.text || "";
    if (part?.type === "output_text") return part.text || "";
    return "";
  }).filter(Boolean).join("");
}

function normalizeToolCalls(toolCalls) {
  if (!Array.isArray(toolCalls)) return [];
  return toolCalls.map((toolCall) => ({
    id: toolCall.id || shortId("call"),
    name: toolCall.function?.name || toolCall.name || "tool",
    args: toolCall.function?.arguments || toolCall.arguments || "{}",
  }));
}

function writeSseHeaders(res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });
  res.flushHeaders?.();
}

function writeSseEvent(res, event) {
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function writeSseDone(res) {
  res.write("data: [DONE]\n\n");
}

function writeResponsesStreamStart(res, responseId, model, outputItemId) {
  const initial = createResponseResource({ id: responseId, model, status: "in_progress", output: [] });
  writeSseEvent(res, { type: "response.created", response: initial });
  writeSseEvent(res, { type: "response.in_progress", response: initial });
  writeSseEvent(res, {
    type: "response.output_item.added",
    output_index: 0,
    item: createAssistantOutputItem({ id: outputItemId, text: "", status: "in_progress" }),
  });
  writeSseEvent(res, {
    type: "response.content_part.added",
    item_id: outputItemId,
    output_index: 0,
    content_index: 0,
    part: { type: "output_text", text: "" },
  });
}

function writeResponsesStreamFailure(res, responseId, model, message, code = "api_error") {
  writeSseEvent(res, {
    type: "response.failed",
    response: createResponseResource({
      id: responseId,
      model,
      status: "failed",
      output: [],
      error: { code, message },
    }),
  });
  writeSseDone(res);
  res.end();
}

function parseSseDataBlocks(bufferState, chunk, onData) {
  bufferState.text += chunk.toString("utf8");
  for (;;) {
    const separatorIndex = bufferState.text.search(/\r?\n\r?\n/);
    if (separatorIndex < 0) return;
    const block = bufferState.text.slice(0, separatorIndex);
    const separator = bufferState.text.match(/\r?\n\r?\n/)[0];
    bufferState.text = bufferState.text.slice(separatorIndex + separator.length);
    const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (data) onData(data);
  }
}

function makeStreamToolCallAccumulator() {
  const byIndex = new Map();
  return {
    add(deltaToolCalls) {
      if (!Array.isArray(deltaToolCalls)) return;
      for (const part of deltaToolCalls) {
        const index = Number.isInteger(part.index) ? part.index : byIndex.size;
        const current = byIndex.get(index) || { id: "", name: "", args: "" };
        if (part.id) current.id = part.id;
        if (part.function?.name) current.name = part.function.name;
        if (part.function?.arguments) current.args += part.function.arguments;
        byIndex.set(index, current);
      }
    },
    values() {
      return [...byIndex.entries()]
        .sort(([a], [b]) => a - b)
        .map(([, value]) => ({
          id: value.id || shortId("call"),
          name: value.name || "tool",
          args: value.args || "{}",
        }));
    },
  };
}

async function handleResponsesNonStream(req, res, responseReq, chatBody) {
  const body = Buffer.from(JSON.stringify({ ...chatBody, stream: false }));
  try {
    const upstream = await requestUpstream({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        "authorization": upstreamAuthorization(req),
        "content-length": body.length,
      },
      body,
    });

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return json(res, upstream.statusCode, responseError(`responses upstream failed with ${upstream.statusCode}: ${upstream.body.toString("utf8").slice(0, 2000)}`, "upstream_error"));
    }

    const chat = JSON.parse(upstream.body.toString("utf8"));
    const choice = chat.choices?.[0] || {};
    const message = choice.message || {};
    const text = extractMessageText(message);
    const toolCalls = normalizeToolCalls(message.tool_calls);
    const outputItemId = shortId("msg");
    const output = [];
    output.push(createAssistantOutputItem({
      id: outputItemId,
      text,
      phase: toolCalls.length > 0 ? "commentary" : "final_answer",
    }));
    for (const toolCall of toolCalls) {
      output.push(createFunctionCallOutputItem({
        id: shortId("fc"),
        callId: toolCall.id,
        name: toolCall.name,
        args: toolCall.args,
      }));
    }

    return json(res, 200, createResponseResource({
      id: shortId("resp"),
      model: responseReq.model || chat.model || chatBody.model,
      status: toolCalls.length > 0 ? "incomplete" : "completed",
      output,
      usage: chat.usage,
    }));
  } catch (error) {
    log(`responses adapter failed: ${error.message}`);
    return json(res, 502, responseError(`responses adapter failed: ${error.message}`));
  }
}

async function handleResponsesStream(req, res, responseReq, chatBody) {
  const responseId = shortId("resp");
  const outputItemId = shortId("msg");
  const model = responseReq.model || chatBody.model;
  const body = Buffer.from(JSON.stringify({ ...chatBody, stream: true }));
  let finished = false;
  let sawDone = false;

  writeSseHeaders(res);
  writeResponsesStreamStart(res, responseId, model, outputItemId);

  function fail(message, code = "api_error") {
    if (finished) return;
    finished = true;
    writeResponsesStreamFailure(res, responseId, model, message, code);
  }

  const upstreamReq = requestModule().request({
    protocol: upstreamBase.protocol,
    hostname: upstreamBase.hostname,
    port: upstreamBase.port || (upstreamBase.protocol === "https:" ? 443 : 80),
    agent: upstreamAgent,
    method: "POST",
    path: resolveUpstreamPath("/v1/chat/completions"),
    headers: {
      "content-type": "application/json",
      "authorization": upstreamAuthorization(req),
      "content-length": body.length,
      "accept": "text/event-stream",
    },
    timeout: REQUEST_TIMEOUT_MS,
  }, (upstreamRes) => {
    if ((upstreamRes.statusCode || 502) < 200 || (upstreamRes.statusCode || 502) >= 300) {
      const chunks = [];
      upstreamRes.on("data", (chunk) => chunks.push(chunk));
      upstreamRes.on("end", () => {
        fail(
          `responses upstream failed with ${upstreamRes.statusCode}: ${Buffer.concat(chunks).toString("utf8").slice(0, 2000)}`,
          "upstream_error",
        );
      });
      return;
    }

    const parserState = { text: "" };
    const toolCalls = makeStreamToolCallAccumulator();
    let accumulatedText = "";
    let finalUsage;

    function finalize() {
      if (finished) return;
      finished = true;
      const normalizedToolCalls = toolCalls.values();
      writeSseEvent(res, {
        type: "response.output_text.done",
        item_id: outputItemId,
        output_index: 0,
        content_index: 0,
        text: accumulatedText,
      });
      writeSseEvent(res, {
        type: "response.content_part.done",
        item_id: outputItemId,
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: accumulatedText },
      });
      const messageItem = createAssistantOutputItem({
        id: outputItemId,
        text: accumulatedText,
        phase: normalizedToolCalls.length > 0 ? "commentary" : "final_answer",
      });
      writeSseEvent(res, { type: "response.output_item.done", output_index: 0, item: messageItem });

      const output = [messageItem];
      let outputIndex = 1;
      for (const toolCall of normalizedToolCalls) {
        const item = createFunctionCallOutputItem({
          id: shortId("fc"),
          callId: toolCall.id,
          name: toolCall.name,
          args: toolCall.args,
        });
        writeSseEvent(res, { type: "response.output_item.added", output_index: outputIndex, item });
        writeSseEvent(res, { type: "response.output_item.done", output_index: outputIndex, item });
        output.push(item);
        outputIndex += 1;
      }

      writeSseEvent(res, {
        type: "response.completed",
        response: createResponseResource({
          id: responseId,
          model,
          status: normalizedToolCalls.length > 0 ? "incomplete" : "completed",
          output,
          usage: finalUsage,
        }),
      });
      writeSseDone(res);
      res.end();
    }

    upstreamRes.on("data", (chunk) => {
      parseSseDataBlocks(parserState, chunk, (data) => {
        if (data === "[DONE]") {
          sawDone = true;
          finalize();
          return;
        }
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (error) {
          log(`chat SSE parse skipped: ${error.message}`);
          return;
        }
        if (parsed.usage) finalUsage = parsed.usage;
        const choice = parsed.choices?.[0];
        const delta = choice?.delta || {};
        const textDelta = typeof delta.content === "string" ? delta.content : (typeof delta.reasoning_content === "string" ? delta.reasoning_content : "");
        if (textDelta) {
          accumulatedText += textDelta;
          writeSseEvent(res, {
            type: "response.output_text.delta",
            item_id: outputItemId,
            output_index: 0,
            content_index: 0,
            delta: textDelta,
          });
        }
        toolCalls.add(delta.tool_calls);
        if (choice?.finish_reason && choice.finish_reason !== "tool_calls") {
          finalUsage = finalUsage || parsed.usage;
        }
      });
    });
    upstreamRes.on("end", () => {
      if (sawDone) finalize();
      else fail("upstream stream ended before [DONE]", "upstream_incomplete");
    });
    upstreamRes.on("aborted", () => {
      fail("upstream stream aborted before completion", "upstream_aborted");
    });
    upstreamRes.on("error", (error) => {
      fail(`upstream stream failed: ${error.message}`, "upstream_error");
    });
  });

  upstreamReq.on("timeout", () => upstreamReq.destroy(new Error("upstream timeout")));
  upstreamReq.on("error", (error) => {
    fail(`responses adapter failed: ${error.message}`, "upstream_error");
  });
  res.on("close", () => {
    if (finished) return;
    try { upstreamReq.destroy(); } catch {}
  });
  upstreamReq.end(body);
}

async function handleResponses(req, res) {
  let request;
  try {
    request = await readJsonRequest(req);
  } catch (error) {
    return json(res, 400, responseError(`invalid JSON: ${error.message}`, "invalid_request_error"));
  }

  const chatBody = responsesBodyToChatBody(request);
  if (request.stream) return handleResponsesStream(req, res, request, chatBody);
  return handleResponsesNonStream(req, res, request, chatBody);
}

async function handleCompact(req, res) {
  let request;
  try {
    request = await readJsonRequest(req);
  } catch (error) {
    return json(res, 400, { error: { message: `invalid JSON: ${error.message}` } });
  }

  const model = request.model || DEFAULT_MODEL;
  let conversation = JSON.stringify(request.input || [], null, 2);
  if (conversation.length > MAX_CONV_CHARS) {
    log(`truncating compact input ${conversation.length} -> ${MAX_CONV_CHARS}`);
    conversation = `${conversation.slice(0, MAX_CONV_CHARS)}\n\n... [TRUNCATED]`;
  }

  const chatBody = Buffer.from(JSON.stringify({
    model,
    messages: [
      { role: "system", content: COMPACT_SYSTEM },
      { role: "user", content: `Summarize this conversation for context compaction:\n\n${conversation}` },
    ],
    max_tokens: 8192,
    stream: false,
  }));

  try {
    const upstream = await requestUpstream({
      method: "POST",
      url: "/v1/chat/completions",
      headers: {
        "content-type": "application/json",
        "authorization": upstreamAuthorization(req),
        "content-length": chatBody.length,
      },
      body: chatBody,
    });

    if (upstream.statusCode < 200 || upstream.statusCode >= 300) {
      return json(res, upstream.statusCode, {
        error: {
          message: `compact upstream failed with ${upstream.statusCode}`,
          body: upstream.body.toString("utf8").slice(0, 2000),
        },
      });
    }

    const chat = JSON.parse(upstream.body.toString("utf8"));
    const rawMsg = chat.choices?.[0]?.message; const summary = rawMsg?.content || rawMsg?.reasoning_content || "";
    log(`compact completed, ${summary.length} chars`);
    return json(res, 200, {
      id: `compact_${request.thread_id || "local"}`,
      object: "response",
      created_at: chat.created || nowSeconds(),
      model,
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: summary }],
        },
      ],
      usage: normalizeUsage(chat.usage),
      metadata: {},
    });
  } catch (error) {
    log(`compact failed: ${error.message}`);
    return json(res, 502, { error: { message: `compact failed: ${error.message}` } });
  }
}

async function forwardHttp(req, res) {
  const body = await readBody(req);
  const headers = applyUpstreamAuthorization(forwardHeaders(req), req);
  if (body.length) headers["content-length"] = body.length;

  const upstreamReq = requestModule().request({
    protocol: upstreamBase.protocol,
    hostname: upstreamBase.hostname,
    port: upstreamBase.port || (upstreamBase.protocol === "https:" ? 443 : 80),
    agent: upstreamAgent,
    method: req.method,
    path: resolveUpstreamPath(req.url),
    headers,
    timeout: REQUEST_TIMEOUT_MS,
  }, (upstreamRes) => {
    const contentType = upstreamRes.headers["content-type"] || "";
    const isSse = contentType.includes("text/event-stream");

    if (isSse) {
      res.writeHead(upstreamRes.statusCode || 200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      upstreamRes.pipe(res);
      return;
    }

    const chunks = [];
    upstreamRes.on("data", (chunk) => chunks.push(chunk));
    upstreamRes.on("end", () => {
      const responseBody = Buffer.concat(chunks);
      res.writeHead(upstreamRes.statusCode || 502, {
        "Content-Type": contentType || "application/json",
        "Content-Length": responseBody.length,
        "Access-Control-Allow-Origin": "*",
      });
      res.end(responseBody);
    });
  });

  upstreamReq.on("timeout", () => upstreamReq.destroy(new Error("upstream timeout")));
  upstreamReq.on("error", (error) => {
    log(`forward failed: ${error.message}`);
    json(res, 502, { error: { message: `proxy failed: ${error.message}` } });
  });

  if (body.length) upstreamReq.end(body);
  else upstreamReq.end();
}

const server = http.createServer((req, res) => {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization,content-type,openai-beta,x-codex-beta-features,x-codex-installation-id,x-codex-window-id",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && pathname === "/v1/responses/compact") {
    handleCompact(req, res).catch((error) => json(res, 500, { error: { message: error.message } }));
    return;
  }

  if (req.method === "POST" && pathname === "/v1/responses" && RESPONSES_MODE !== "native") {
    handleResponses(req, res).catch((error) => json(res, 500, responseError(error.message)));
    return;
  }

  forwardHttp(req, res).catch((error) => json(res, 500, { error: { message: error.message } }));
});

const WS_IDLE_TIMEOUT_MS = Number(process.env.WS_IDLE_TIMEOUT_MS || 900000);
const WS_PING_INTERVAL_MS = Number(process.env.WS_PING_INTERVAL_MS || 30000);

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req, socket, head) => {
  if (!COMPACT_ENABLE_WEBSOCKETS) {
    log(`websocket rejected for CPA-compatible stable transport: ${req.url}`);
    try {
      socket.write(
        "HTTP/1.1 426 Upgrade Required\r\n" +
        "Connection: close\r\n" +
        "Content-Type: text/plain; charset=utf-8\r\n" +
        "\r\n" +
        "Compact Proxy uses HTTP/SSE for CPA-compatible Responses transport. Set COMPACT_ENABLE_WEBSOCKETS=true to opt in.\n"
      );
    } catch {}
    try { socket.destroy(); } catch {}
    return;
  }
  wss.handleUpgrade(req, socket, head, (clientWs) => {
    wss.emit("connection", clientWs, req);
  });
});

wss.on("connection", (clientWs, req) => {
  const upstreamUrl = wsUpstreamUrl(req.url);
  const headers = applyUpstreamAuthorization(forwardHeaders(req), req);
  log(`websocket ${req.url} -> ${upstreamUrl}`);
  const upstreamWs = new WebSocket(upstreamUrl, { headers });
  const pendingClientMessages = [];
  let upstreamOpen = false;
  let finished = false;
  let lastActivity = Date.now();
  let clientAlive = true;
  let upstreamAlive = false;

  function cleanup() {
    if (finished) return;
    finished = true;
    clearInterval(pingTimer);
    clearTimeout(idleTimer);
  }

  // Idle timeout: close if no data flows for too long
  const idleTimer = setTimeout(() => {
    if (!finished) {
      log(`websocket idle timeout after ${WS_IDLE_TIMEOUT_MS}ms`);
      cleanup();
      try { clientWs.close(1000, "idle timeout"); } catch {}
      try { upstreamWs.close(1000, "idle timeout"); } catch {}
    }
  }, WS_IDLE_TIMEOUT_MS);

  // Periodic keepalive pings to both sides
  const pingTimer = setInterval(() => {
    if (finished) return;
    // Check upstream idle: if upstream is open but no data for a long time, it may be stuck
    if (upstreamAlive && (Date.now() - lastActivity) > WS_IDLE_TIMEOUT_MS / 2) {
      try { upstreamWs.ping(); } catch {}
    }
    if (clientAlive && clientWs.readyState === WebSocket.OPEN) {
      try { clientWs.ping(); } catch {}
    }
  }, WS_PING_INTERVAL_MS);

  function markActive() { lastActivity = Date.now(); }

  clientWs.on("message", (data) => {
    markActive();
    const payload = Buffer.isBuffer(data) ? data.toString("utf8") : data;
    if (!upstreamOpen) {
      pendingClientMessages.push(payload);
      return;
    }
    try {
      upstreamWs.send(payload, { binary: false });
    } catch {}
  });

  clientWs.on("pong", () => { markActive(); });

  upstreamWs.on("open", () => {
    upstreamOpen = true;
    upstreamAlive = true;
    markActive();
    for (const payload of pendingClientMessages.splice(0)) {
      try {
        upstreamWs.send(payload, { binary: false });
      } catch {}
    }
  });

  upstreamWs.on("message", (data) => {
    markActive();
    try {
      clientWs.send(Buffer.isBuffer(data) ? data.toString("utf8") : data, { binary: false });
    } catch {}
  });

  upstreamWs.on("pong", () => { markActive(); });

  upstreamWs.on("close", (code, reason) => {
    upstreamAlive = false;
    if (!finished) log(`websocket upstream closed: code=${code}`);
    cleanup();
    try { clientWs.close(code, reason); } catch {}
  });

  upstreamWs.on("error", (error) => {
    log(`websocket upstream failed: ${error.message}`);
    upstreamAlive = false;
    cleanup();
    try { clientWs.close(1011, "upstream error"); } catch {}
  });

  clientWs.on("close", (code, reason) => {
    clientAlive = false;
    cleanup();
    try { upstreamWs.close(code, reason); } catch {}
  });

  clientWs.on("error", (error) => {
    clientAlive = false;
    log(`websocket client error: ${error.message}`);
    cleanup();
    try { upstreamWs.close(); } catch {}
  });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`listening on ${LISTEN_HOST}:${LISTEN_PORT} -> ${upstreamBase.href} (responses ${RESPONSES_MODE}, websockets ${COMPACT_ENABLE_WEBSOCKETS ? "enabled" : "disabled"})`);
});
