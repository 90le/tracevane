#!/usr/bin/env node
/**
 * CPA Compact Proxy v5 (Node.js)
 * - Intercepts /v1/responses/compact -> handles via /v1/chat/completions
 * - All other HTTP requests -> forward to CPA
 * - WebSocket upgrades -> forward to CPA
 */

import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
// Resolve ws module from multiple possible locations
const wsPaths = [
  process.env.WS_MODULE_PATH,
  require("path").join(os.homedir(), ".openclaw/node_modules/ws"),
  require("path").join(os.homedir(), ".local/lib/node_modules/ws"),
  require("path").join(os.homedir(), ".npm-global/lib/node_modules/ws"),
].filter(Boolean);
let wsMod = null;
for (const p of wsPaths) {
  try { wsMod = require(p); break; } catch {}
}
if (!wsMod) {
  try { wsMod = require("ws"); } catch {}
}
if (!wsMod) {
  console.error("Error: ws module not found. Install with: npm install -g ws"); process.exit(1);
}
const { WebSocketServer, WebSocket } = wsMod;

const CPA_HOST = process.env.CPA_HOST || "127.0.0.1";
const CPA_PORT = Number(process.env.CPA_PORT) || 18795;
const LISTEN_PORT = Number(process.env.LISTEN_PORT) || 18796;
const MAX_CONV_CHARS = 300000;
const COMPACT_TIMEOUT = 300000;

const COMPACT_SYSTEM = `You are a context compaction assistant. Summarize the conversation into a concise but complete summary preserving all important context, decisions, file changes, and task state. The summary replaces the full conversation history. Capture:

1. All task objectives and current progress
2. Key decisions made and reasoning
3. Files read, created, or modified (with exact paths)
4. Errors encountered and resolutions
5. Current state and next steps
6. User preferences and constraints

Output structured markdown. Be specific about file paths, function names, technical details.`;

function forwardHeaders(req) {
  const fwd = {};
  for (const key of [
    "authorization", "content-type", "user-agent", "accept",
    "session_id", "thread_id", "originator", "version",
    "x-codex-beta-features", "x-codex-installation-id", "x-codex-window-id",
  ]) {
    const val = req.headers[key];
    if (val) fwd[key] = val;
  }
  return fwd;
}

function safeJson(obj, res) {
  const body = JSON.stringify(obj);
  res.writeHead(obj.error ? (obj._status || 502) : 200, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function handleCompact(req, res) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();

  let reqData;
  try { reqData = JSON.parse(raw); }
  catch (e) { return safeJson({ error: { message: `invalid JSON: ${e.message}` }, _status: 400 }, res); }

  const model = reqData.model || "glm-5.1";
  const inputItems = reqData.input || [];
  let convText = JSON.stringify(inputItems, null, 2);
  if (convText.length > MAX_CONV_CHARS) {
    process.stderr.write(`[compact-proxy] truncating ${convText.length} -> ${MAX_CONV_CHARS} chars\n`);
    convText = convText.slice(0, MAX_CONV_CHARS) + "\n\n... [TRUNCATED]";
  }

  const chatReq = JSON.stringify({
    model,
    messages: [
      { role: "system", content: COMPACT_SYSTEM },
      { role: "user", content: `Summarize for context compaction:\n\n${convText}` },
    ],
    max_tokens: 8192,
    stream: false,
  });

  const auth = req.headers.authorization || "";

  const cpaReq = http.request({
    hostname: CPA_HOST, port: CPA_PORT,
    path: "/v1/chat/completions", method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": auth, "Content-Length": Buffer.byteLength(chatReq) },
    timeout: COMPACT_TIMEOUT,
  }, (cpaRes) => {
    const bodyChunks = [];
    cpaRes.on("data", (c) => bodyChunks.push(c));
    cpaRes.on("end", () => {
      try {
        const chatResp = JSON.parse(Buffer.concat(bodyChunks).toString());
        const summary = chatResp.choices?.[0]?.message?.content || "";
        const compactResp = {
          id: `compact_${reqData.thread_id || "local"}`,
          object: "response",
          created_at: chatResp.created || 0,
          model,
          status: "completed",
          output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: summary }] }],
          usage: chatResp.usage || {},
          metadata: {},
        };
        process.stderr.write(`[compact-proxy] compact OK, ${summary.length} chars\n`);
        safeJson(compactResp, res);
      } catch (e) {
        process.stderr.write(`[compact-proxy] compact parse error: ${e.message}\n`);
        safeJson({ error: { message: `compact parse failed: ${e.message}` }, _status: 502 }, res);
      }
    });
  });

  cpaReq.on("error", (e) => {
    process.stderr.write(`[compact-proxy] compact upstream error: ${e.message}\n`);
    safeJson({ error: { message: `compact failed: ${e.message}` }, _status: 502 }, res);
  });

  cpaReq.on("timeout", () => {
    cpaReq.destroy();
    safeJson({ error: { message: "compact timeout" }, _status: 504 }, res);
  });

  cpaReq.end(chatReq);
}

function forwardHttp(req, res) {
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    const headers = forwardHeaders(req);
    if (body.length > 0) headers["content-length"] = body.length;

    const cpaReq = http.request({
      hostname: CPA_HOST, port: CPA_PORT,
      path: req.url, method: req.method,
      headers,
      timeout: 300000,
    }, (cpaRes) => {
      const contentType = cpaRes.headers["content-type"] || "";
      const isSSE = contentType.includes("text/event-stream");

      if (isSSE) {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          "Access-Control-Allow-Origin": "*",
        });
        cpaRes.on("data", (chunk) => {
          try { res.write(chunk); } catch {}
        });
        cpaRes.on("end", () => { try { res.end(); } catch {} });
        cpaRes.on("error", () => { try { res.end(); } catch {} });
      } else {
        const respChunks = [];
        cpaRes.on("data", (c) => respChunks.push(c));
        cpaRes.on("end", () => {
          const respBody = Buffer.concat(respChunks);
          const respHeaders = { "Content-Type": contentType || "application/json" };
          if (cpaRes.headers["access-control-allow-origin"]) respHeaders["Access-Control-Allow-Origin"] = cpaRes.headers["access-control-allow-origin"];
          respHeaders["Content-Length"] = respBody.length;
          res.writeHead(cpaRes.statusCode, respHeaders);
          res.end(respBody);
        });
      }
    });

    cpaReq.on("error", (e) => {
      process.stderr.write(`[compact-proxy] forward error: ${e.message}\n`);
      const errBody = JSON.stringify({ error: { message: `proxy failed: ${e.message}` } });
      try {
        res.writeHead(502, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(errBody) });
        res.end(errBody);
      } catch {}
    });

    if (body.length > 0) cpaReq.end(body);
    else cpaReq.end();
  });
}

// --- HTTP Server ---
const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/v1/responses/compact") {
    handleCompact(req, res);
  } else {
    forwardHttp(req, res);
  }
});

// --- WebSocket Proxy ---
const wss = new WebSocketServer({ server });

wss.on("connection", (clientWs, req) => {
  process.stderr.write(`[compact-proxy] WS upgrade: ${req.url}\n`);

  const wsUrl = `ws://${CPA_HOST}:${CPA_PORT}${req.url}`;
  const wsHeaders = {};
  for (const key of ["authorization", "user-agent", "session_id", "thread_id", "originator", "version",
    "x-codex-beta-features", "x-codex-installation-id", "x-codex-window-id"]) {
    const val = req.headers[key];
    if (val) wsHeaders[key] = val;
  }

  const cpaWs = new WebSocket(wsUrl, { headers: wsHeaders });

  cpaWs.on("open", () => {
    // Pipe client -> CPA
    clientWs.on("message", (data, isBinary) => {
      try {
        if (isBinary) {
          cpaWs.send(data.toString("utf-8"), { binary: false });
        } else {
          cpaWs.send(data, { binary: false });
        }
      } catch {}
    });
    clientWs.on("close", (code, reason) => {
      try { cpaWs.close(code, reason); } catch {}
    });
  });

  // Pipe CPA -> client
  cpaWs.on("message", (data, isBinary) => {
    try {
      if (isBinary) {
        // CPA sends binary frames; Codex expects text only.
        // Convert Buffer to UTF-8 string and send as text.
        clientWs.send(data.toString("utf-8"), { binary: false });
      } else {
        clientWs.send(data, { binary: false });
      }
    } catch {}
  });
  cpaWs.on("close", (code, reason) => {
    try { clientWs.close(code, reason); } catch {}
  });

  cpaWs.on("error", (e) => {
    process.stderr.write(`[compact-proxy] WS upstream error: ${e.message}\n`);
    try { clientWs.close(1011, "upstream error"); } catch {}
  });

  clientWs.on("error", () => {
    try { cpaWs.close(); } catch {}
  });
});

server.listen(LISTEN_PORT, "127.0.0.1", () => {
  console.log(`CPA Compact Proxy v5 (Node.js) on 127.0.0.1:${LISTEN_PORT} -> CPA:${CPA_PORT}`);
  process.stderr.write(`[compact-proxy] v5 started, pid=${process.pid}, WS support enabled\n`);
});
