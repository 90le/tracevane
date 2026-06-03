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

test("compact proxy rejects model-less Responses requests when no default model is configured", async () => {
  let upstreamCalls = 0;
  const cpa = await startFakeCpa(async (_req, res) => {
    upstreamCalls += 1;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ input: "missing model" }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error.message, /model is required/);
    assert.equal(upstreamCalls, 0);
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

test("studio agent gateway reports protocol and integration capabilities", async () => {
  const cpa = await startFakeCpa((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/gateway/status`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.service, "studio-agent-gateway");
    assert.equal(payload.protocols.openai_chat_completions.supported, true);
    assert.equal(payload.protocols.openai_responses.supported, true);
    assert.equal(payload.protocols.openai_responses_compact.supported, true);
    assert.equal(payload.protocols.anthropic_messages.supported, true);
    assert.equal(payload.protocols.anthropic_messages.streaming, true);
    assert.equal(payload.integrations.codex_cli.base_url, `http://127.0.0.1:${proxy.port}/v1`);
    assert.equal(payload.integrations.claude_cli.base_url, `http://127.0.0.1:${proxy.port}`);
    assert.ok(payload.integrations.cc_connect.channel_surfaces.includes("feishu"));
    assert.ok(payload.endpoints.anthropic_messages.includes("/claude/v1/messages"));
    assert.ok(payload.catalog.client_adapters.some((adapter) => adapter.id === "codex-cli" && adapter.protocol === "openai-responses"));
    assert.ok(payload.catalog.client_adapters.some((adapter) => adapter.id === "claude-cli" && adapter.protocol === "anthropic-messages"));
    assert.ok(payload.catalog.route_templates.some((route) => route.accepts.includes("anthropic-messages")));
    assert.ok(payload.catalog.channels.some((channel) => channel.id === "bridge"));
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("studio agent gateway exposes env-configured channel and model catalog extensions", async () => {
  const cpa = await startFakeCpa((_req, res) => {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });
  const proxy = await startProxy(cpa.port, {
    env: {
      STUDIO_GATEWAY_CHANNELS: JSON.stringify([{ id: "slack", label: "Slack", required_options: ["bot_token"] }]),
      STUDIO_GATEWAY_MODELS: JSON.stringify([{ id: "relay/gpt-5.4", label: "GPT relay", provider: "relay" }]),
    },
  });

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/studio-agent-gateway/status`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.ok(payload.catalog.channels.some((channel) => channel.id === "slack" && channel.required_options.includes("bot_token")));
    assert.ok(payload.catalog.channels.some((channel) => channel.id === "feishu"));
    assert.ok(payload.catalog.models.some((model) => model.id === "relay/gpt-5.4"));
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("studio agent gateway adapts Claude Messages requests to chat completions", async () => {
  const upstreamRequests = [];
  const cpa = await startFakeCpa(async (req, res) => {
    assert.equal(req.method, "POST");
    assert.equal(req.url, "/v1/chat/completions");
    const body = await readJsonBody(req);
    upstreamRequests.push(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl_claude",
      object: "chat.completion",
      model: body.model,
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "weather ready",
          tool_calls: [{
            id: "call_weather",
            type: "function",
            function: { name: "get_weather", arguments: "{\"city\":\"Tokyo\"}" },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: { prompt_tokens: 11, completion_tokens: 5, total_tokens: 16 },
    }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer local-key",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-test",
        system: [{ type: "text", text: "system guard" }],
        messages: [{ role: "user", content: [{ type: "text", text: "weather please" }] }],
        max_tokens: 64,
        tools: [{
          name: "get_weather",
          description: "Lookup weather",
          input_schema: { type: "object", properties: { city: { type: "string" } } },
        }],
        tool_choice: { type: "tool", name: "get_weather" },
      }),
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(upstreamRequests.length, 1);
    assert.equal(upstreamRequests[0].model, "claude-test");
    assert.equal(upstreamRequests[0].max_tokens, 64);
    assert.deepEqual(upstreamRequests[0].messages.slice(0, 2), [
      { role: "system", content: "system guard" },
      { role: "user", content: "weather please" },
    ]);
    assert.equal(upstreamRequests[0].tools[0].function.name, "get_weather");
    assert.deepEqual(upstreamRequests[0].tool_choice, { type: "function", function: { name: "get_weather" } });
    assert.equal(payload.type, "message");
    assert.equal(payload.role, "assistant");
    assert.equal(payload.model, "claude-test");
    assert.equal(payload.stop_reason, "tool_use");
    assert.deepEqual(payload.usage, { input_tokens: 11, output_tokens: 5, total_tokens: 16 });
    assert.equal(payload.content[0].type, "text");
    assert.equal(payload.content[0].text, "weather ready");
    assert.equal(payload.content[1].type, "tool_use");
    assert.equal(payload.content[1].id, "call_weather");
    assert.deepEqual(payload.content[1].input, { city: "Tokyo" });
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("studio agent gateway supports prefixed Claude Messages route", async () => {
  let upstreamCalls = 0;
  const cpa = await startFakeCpa(async (req, res) => {
    upstreamCalls += 1;
    assert.equal(req.url, "/v1/chat/completions");
    await readJsonBody(req);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl_claude_prefixed",
      object: "chat.completion",
      model: "claude-test",
      choices: [{ index: 0, message: { role: "assistant", content: "prefixed ok" }, finish_reason: "stop" }],
    }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/claude/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-test",
        messages: [{ role: "user", content: "hello" }],
        max_tokens: 8,
      }),
    });
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.content[0].text, "prefixed ok");
    assert.equal(upstreamCalls, 1);
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("studio agent gateway converts chat SSE into Claude Messages SSE", async () => {
  const cpa = await startFakeCpa(async (req, res) => {
    const body = await readJsonBody(req);
    assert.equal(body.stream, true);
    assert.equal(body.messages[0].content, "stream please");
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ id: "chatcmpl_msg_stream", model: body.model, choices: [{ delta: { content: "Hel" } }] })}\n\n`);
    res.write(`data: ${JSON.stringify({ id: "chatcmpl_msg_stream", model: body.model, choices: [{ delta: { content: "lo" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  });
  const proxy = await startProxy(cpa.port, { env: { COMPACT_STREAM_KEEPALIVE_MS: "10000" } });

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-test",
        stream: true,
        messages: [{ role: "user", content: "stream please" }],
        max_tokens: 8,
      }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type")?.includes("text/event-stream"), true);
    const events = parseSse(await response.text());
    assert.equal(events[0].event, "message_start");
    assert.ok(events.some((entry) => entry.event === "content_block_start"));
    assert.ok(events.some((entry) => entry.event === "content_block_delta" && JSON.parse(entry.data).delta.text === "Hel"));
    assert.ok(events.some((entry) => entry.event === "content_block_delta" && JSON.parse(entry.data).delta.text === "lo"));
    assert.ok(events.some((entry) => entry.event === "content_block_stop"));
    const delta = events.find((entry) => entry.event === "message_delta");
    assert.equal(JSON.parse(delta.data).delta.stop_reason, "end_turn");
    assert.deepEqual(JSON.parse(delta.data).usage, { input_tokens: 3, output_tokens: 2, total_tokens: 5 });
    assert.equal(events.at(-1).event, "message_stop");
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("compact proxy rejects empty compaction summaries", async () => {
  const cpa = await startFakeCpa(async (_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      id: "chatcmpl_empty_compact",
      object: "chat.completion",
      model: "test-model",
      choices: [{ index: 0, message: { role: "assistant", content: "" }, finish_reason: "stop" }],
    }));
  });
  const proxy = await startProxy(cpa.port);

  try {
    const response = await fetch(`http://127.0.0.1:${proxy.port}/v1/responses/compact`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "test-model",
        input: [{ role: "user", content: "important state" }],
      }),
    });
    assert.equal(response.status, 502);
    const payload = await response.json();
    assert.match(payload.error.message, /empty summary/);
  } finally {
    await proxy.close();
    await cpa.close();
  }
});

test("single codex-docs compact proxy template is the bundled gateway source", () => {
  assert.match(fs.readFileSync(proxyScript, "utf8"), /studio-agent-gateway/);
  assert.equal(fs.existsSync(path.join(projectRoot, "resources/codex-stack/codex-docs-dmwork")), false);
});
