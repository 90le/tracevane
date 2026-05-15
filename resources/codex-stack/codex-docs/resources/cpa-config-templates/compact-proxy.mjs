#!/usr/bin/env node
/**
 * Compact Proxy for Codex Responses API.
 *
 * It forwards normal HTTP/WebSocket traffic to CPA and implements
 * /v1/responses/compact through /v1/chat/completions for gateways that do not
 * provide OpenAI's compact endpoint natively.
 */

import http from "node:http";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

function loadWs() {
  const candidates = ["ws"];
  const home = os.homedir();
  candidates.push(path.join(home, ".openclaw", "node_modules", "ws"));
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
const LISTEN_HOST = process.env.LISTEN_HOST || "127.0.0.1";
const LISTEN_PORT = Number(process.env.LISTEN_PORT || 18796);
const DEFAULT_MODEL = process.env.COMPACT_DEFAULT_MODEL || "glm-5.1";
const MAX_CONV_CHARS = Number(process.env.COMPACT_MAX_CONV_CHARS || 300000);
const REQUEST_TIMEOUT_MS = Number(process.env.COMPACT_TIMEOUT_MS || 300000);

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

function forwardHeaders(req) {
  const headers = {};
  for (const key of [
    "authorization",
    "content-type",
    "user-agent",
    "accept",
    "session_id",
    "thread_id",
    "originator",
    "version",
    "x-codex-beta-features",
    "x-codex-installation-id",
    "x-codex-window-id",
  ]) {
    const value = req.headers[key];
    if (value) headers[key] = value;
  }
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

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function requestUpstream({ method, url, headers, body }) {
  return new Promise((resolve, reject) => {
    const upstream = http.request({
      hostname: CPA_HOST,
      port: CPA_PORT,
      method,
      path: url,
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

async function handleCompact(req, res) {
  let request;
  try {
    request = JSON.parse((await readBody(req)).toString("utf8"));
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
        "authorization": req.headers.authorization || "",
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
    const summary = chat.choices?.[0]?.message?.content || "";
    log(`compact completed, ${summary.length} chars`);
    return json(res, 200, {
      id: `compact_${request.thread_id || "local"}`,
      object: "response",
      created_at: chat.created || Math.floor(Date.now() / 1000),
      model,
      status: "completed",
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: summary }],
        },
      ],
      usage: chat.usage || {},
      metadata: {},
    });
  } catch (error) {
    log(`compact failed: ${error.message}`);
    return json(res, 502, { error: { message: `compact failed: ${error.message}` } });
  }
}

async function forwardHttp(req, res) {
  const body = await readBody(req);
  const headers = forwardHeaders(req);
  if (body.length) headers["content-length"] = body.length;

  const upstreamReq = http.request({
    hostname: CPA_HOST,
    port: CPA_PORT,
    method: req.method,
    path: req.url,
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
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization,content-type,x-codex-beta-features,x-codex-installation-id,x-codex-window-id",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/v1/responses/compact") {
    handleCompact(req, res).catch((error) => json(res, 500, { error: { message: error.message } }));
    return;
  }

  forwardHttp(req, res).catch((error) => json(res, 500, { error: { message: error.message } }));
});

const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs, req) => {
  const upstreamUrl = `ws://${CPA_HOST}:${CPA_PORT}${req.url}`;
  const headers = forwardHeaders(req);
  log(`websocket ${req.url}`);
  const upstreamWs = new WebSocket(upstreamUrl, { headers });
  const pendingClientMessages = [];
  let upstreamOpen = false;

  clientWs.on("message", (data) => {
    const payload = Buffer.isBuffer(data) ? data.toString("utf8") : data;
    if (!upstreamOpen) {
      pendingClientMessages.push(payload);
      return;
    }
    try {
      upstreamWs.send(payload, { binary: false });
    } catch {}
  });

  upstreamWs.on("open", () => {
    upstreamOpen = true;
    for (const payload of pendingClientMessages.splice(0)) {
      try {
        upstreamWs.send(payload, { binary: false });
      } catch {}
    }
  });

  upstreamWs.on("message", (data) => {
    try {
      clientWs.send(Buffer.isBuffer(data) ? data.toString("utf8") : data, { binary: false });
    } catch {}
  });

  upstreamWs.on("close", (code, reason) => {
    try { clientWs.close(code, reason); } catch {}
  });
  upstreamWs.on("error", (error) => {
    log(`websocket upstream failed: ${error.message}`);
    try { clientWs.close(1011, "upstream error"); } catch {}
  });
  clientWs.on("close", (code, reason) => {
    try { upstreamWs.close(code, reason); } catch {}
  });
  clientWs.on("error", () => {
    try { upstreamWs.close(); } catch {}
  });
});

server.listen(LISTEN_PORT, LISTEN_HOST, () => {
  log(`listening on ${LISTEN_HOST}:${LISTEN_PORT} -> ${CPA_HOST}:${CPA_PORT}`);
});
