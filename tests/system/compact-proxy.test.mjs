import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import test from "node:test";
import * as zlib from "node:zlib";
import { WebSocket } from "ws";

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const proxyScript = path.join(projectRoot, "resources/codex-stack/codex-docs/resources/cpa-config-templates/compact-proxy.mjs");
const dmworkProxyScript = path.join(projectRoot, "resources/codex-stack/codex-docs-dmwork/resources/cpa-config-templates/compact-proxy.mjs");

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function listen(server, port = 0) {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return server.address().port;
}

async function freePort() {
  const server = net.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startFakeCpa(handler) {
  const server = http.createServer(handler);
  const port = await listen(server);
  return {
    port,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

async function startProxy(cpaPort, options = {}) {
  const listenPort = await freePort();
  const child = spawn(process.execPath, [proxyScript], {
    cwd: projectRoot,
    env: {
      ...process.env,
      CPA_BASE_URL: options.baseUrl || `http://127.0.0.1:${cpaPort}`,
      LISTEN_PORT: String(listenPort),
      LISTEN_HOST: "127.0.0.1",
      ...(options.env || {}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`proxy did not start: ${stderr}`)), 5000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
      if (stderr.includes("listening on")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`proxy exited early with ${code}: ${stderr}`));
    });
  });
  await ready;

  return {
    port: listenPort,
    close: async () => {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

function parseSse(text) {
  return text.split(/\r?\n\r?\n/)
    .filter(Boolean)
    .map((block) => {
      const event = block.split(/\r?\n/).find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = block.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
      return { event, data };
    });
}

test("compact proxy adapts non-streaming Responses requests to chat completions", async () => {
  const upstreamRequests = [];
  const cpa = await startFakeCpa(async (req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/chat/completions");
    assert.equal(req.headers.authorization, "Bearer local-key");
    const body = await readJsonBody(req);
    upstreamRequests.push(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl_test",
      object: "chat.completion",
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: "hello from chat" }, finish_reason: "stop" }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
    }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer local-key",
      },
      body: JSON.stringify({
        model: "test-model",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "say hello" }] }],
        max_output_tokens: 12,
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].model, "test-model");
    assert.equal(upstreamRequests[0].max_tokens, 12);
    assert.deepEqual(upstreamRequests[0].messages, [{ role: "user", content: "say hello" }]);
    assert.equal(body.object, "response");
    assert.equal(body.status, "completed");
    assert.equal(body.output[0].content[0].text, "hello from chat");
    assert.deepEqual(body.usage, { input_tokens: 7, output_tokens: 3, total_tokens: 10 });
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy converts chat completion SSE into Responses SSE with tool calls", async () => {
  const cpa = await startFakeCpa(async (req, res) => {
    const body = await readJsonBody(req);
    assert.equal(body.stream, true);
    assert.equal(body.tools[0].function.name, "run_shell");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "hello" } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: "call_1", type: "function", function: { name: "run_shell", arguments: "{\"cmd\"" } }] } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ":\"pwd\"}" } }] }, finish_reason: "tool_calls" }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 2, completion_tokens: 4, total_tokens: 6 } })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model",
        stream: true,
        input: "call a tool",
        tools: [{ type: "function", name: "run_shell", parameters: { type: "object" }, strict: true }],
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type")?.includes("text/event-stream"), true);
    const text = await response.text();
    const events = parseSse(text);
    assert.ok(events.some((entry) => entry.event === "response.created"));
    assert.ok(events.some((entry) => entry.event === "response.output_text.delta" && JSON.parse(entry.data).delta === "hello"));
    const functionCallDone = events.find((entry) => entry.event === "response.output_item.done" && entry.data.includes("\"function_call\""));
    assert.ok(functionCallDone);
    assert.equal(JSON.parse(functionCallDone.data).item.call_id, "call_1");
    assert.equal(JSON.parse(functionCallDone.data).item.arguments, "{\"cmd\":\"pwd\"}");
    const completed = events.find((entry) => entry.event === "response.completed");
    assert.equal(JSON.parse(completed.data).response.status, "incomplete");
    assert.deepEqual(JSON.parse(completed.data).response.usage, { input_tokens: 2, output_tokens: 4, total_tokens: 6 });
    assert.equal(events.at(-1).data, "[DONE]");
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy keeps long idle Responses streams alive", async () => {
  const cpa = await startFakeCpa(async (req, res) => {
    const body = await readJsonBody(req);
    assert.equal(body.stream, true);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    await new Promise((resolve) => setTimeout(resolve, 140));
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "late" } }] })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
  const proxy = await startProxy(cpa.port, { env: { COMPACT_STREAM_KEEPALIVE_MS: "40" } });

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test-model", stream: true, input: "wait" }),
    });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.match(text, /: keepalive\n\n/);
    const events = parseSse(text);
    assert.ok(events.some((entry) => entry.event === "response.output_text.delta" && JSON.parse(entry.data).delta === "late"));
    assert.ok(events.some((entry) => entry.event === "response.completed"));
    assert.equal(events.at(-1).data, "[DONE]");
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy marks stream failed when upstream ends before DONE", async () => {
  const cpa = await startFakeCpa(async (req, res) => {
    const body = await readJsonBody(req);
    assert.equal(body.stream, true);
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: "partial" } }] })}\n\n`);
    res.end();
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test-model", stream: true, input: "start" }),
    });

    assert.equal(response.status, 200);
    const events = parseSse(await response.text());
    assert.ok(events.some((entry) => entry.event === "response.output_text.delta" && JSON.parse(entry.data).delta === "partial"));
    const failed = events.find((entry) => entry.event === "response.failed");
    assert.ok(failed);
    assert.equal(JSON.parse(failed.data).response.status, "failed");
    assert.equal(JSON.parse(failed.data).response.error.code, "upstream_incomplete");
    assert.equal(events.some((entry) => entry.event === "response.completed"), false);
    assert.equal(events.at(-1).data, "[DONE]");
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy marks stream failed when upstream returns 500", async () => {
  const cpa = await startFakeCpa(async (_req, res) => {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "upstream boom" } }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test-model", stream: true, input: "start" }),
    });

    assert.equal(response.status, 200);
    const events = parseSse(await response.text());
    const failed = events.find((entry) => entry.event === "response.failed");
    assert.ok(failed);
    assert.equal(JSON.parse(failed.data).response.status, "failed");
    assert.equal(JSON.parse(failed.data).response.error.code, "upstream_error");
    assert.match(JSON.parse(failed.data).response.error.message, /upstream boom/);
    assert.equal(events.some((entry) => entry.event === "response.completed"), false);
    assert.equal(events.at(-1).data, "[DONE]");
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy rejects WebSocket upgrades by default so Codex falls back immediately to HTTP/SSE", async () => {
  const cpa = await startFakeCpa((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const statusCode = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("websocket rejection timed out")), 1000);
      const ws = new WebSocket(`ws://127.0.0.1:${proxy.port}/v1/responses`);
      ws.on("unexpected-response", (_req, res) => {
        clearTimeout(timer);
        resolve(res.statusCode);
      });
      ws.on("open", () => {
        clearTimeout(timer);
        ws.close();
        reject(new Error("websocket unexpectedly opened"));
      });
      ws.on("error", (error) => {
        clearTimeout(timer);
        reject(error);
      });
    });
    assert.equal(statusCode, 426);
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy accepts HTTPS upstream base URLs for CPA", async () => {
  const proxy = await startProxy(443, { baseUrl: "https://127.0.0.1:443" });
  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/anything`, { method: "OPTIONS" });
    assert.equal(response.status, 204);
  } finally {
    await proxy.close();
  }
});

test("compact proxy decodes zstd-compressed Codex request bodies", async () => {
  const cpa = await startFakeCpa(async (req, res) => {
    const body = await readJsonBody(req);
    assert.equal(body.messages[0].content, "compressed hello");
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl_zstd",
      object: "chat.completion",
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const body = Buffer.from(JSON.stringify({
      model: "test-model",
      input: "compressed hello",
      max_output_tokens: 8,
    }));
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "zstd",
      },
      body: zlib.zstdCompressSync(body),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.output[0].content[0].text, "ok");
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy can override Codex auth with the local CPA key", async () => {
  const cpa = await startFakeCpa(async (req, res) => {
    assert.equal(req.headers.authorization, "Bearer local-cpa-key");
    await readJsonBody(req);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl_auth",
      object: "chat.completion",
      model: "test-model",
      choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }],
    }));
  });
  const proxy = await startProxy(cpa.port, { env: { CPA_KEY: "local-cpa-key" } });

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: {
        "Authorization": "Bearer wrong-codex-token",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "test-model", input: "hello" }),
    });
    assert.equal(response.status, 200);
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("codex-docs and dmwork compact proxy templates stay in sync", () => {
  assert.equal(fs.readFileSync(proxyScript, "utf8"), fs.readFileSync(dmworkProxyScript, "utf8"));
});
