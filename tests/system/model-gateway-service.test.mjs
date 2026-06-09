import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

import {
  createStudioContext,
  createStudioRequestHandler,
} from "../../dist/apps/api/index.js";
import {
  createModelGatewayService,
  resolveModelGatewayPaths,
} from "../../dist/apps/api/modules/model-gateway/service.js";
import { createModelGatewayDaemon } from "../../dist/apps/api/modules/model-gateway/daemon.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "studio-model-gateway-"));
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

async function withServer(handler, task) {
  const running = await startHttpServer(handler);
  try {
    await task(running.baseUrl);
  } finally {
    await running.close();
  }
}

async function startHttpServer(handler) {
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
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    }),
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
      headers: {
        ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: raw ? JSON.parse(raw) : null,
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function requestRaw(url, options = {}) {
  const body = options.body === undefined ? null : JSON.stringify(options.body);
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: options.method || "GET",
      headers: {
        ...(body ? { "content-type": "application/json", "content-length": Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
      res.on("end", () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks).toString("utf8"),
        });
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
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

function parseSseEvents(raw) {
  return raw
    .trim()
    .split(/\n\n+/)
    .map((block) => {
      const event = block.split("\n").find((line) => line.startsWith("event: "))?.slice("event: ".length) || null;
      const data = block
        .split("\n")
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice("data: ".length))
        .join("\n");
      return {
        event,
        data: data === "[DONE]" ? "[DONE]" : JSON.parse(data),
      };
    });
}

async function waitFor(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await predicate();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (lastError) throw lastError;
  throw new Error("Timed out waiting for condition");
}

async function daemonReady(endpoint) {
  return {
    endpoint,
    ready: true,
    statusCode: 200,
    error: null,
  };
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  child.kill("SIGTERM");
  await Promise.race([
    exited,
    new Promise((resolve) => setTimeout(resolve, 2000)).then(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
      return exited;
    }),
  ]);
}

test("model gateway registry stores provider secrets separately and masks views", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const service = createModelGatewayService(config);

  const provider = service.upsertProvider(undefined, {
    provider: {
      id: "openai-main",
      name: "OpenAI Main",
      category: "openai-compatible",
      appScopes: ["codex", "openclaw"],
      baseUrl: "https://api.openai.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-test",
        models: [{ id: "gpt-test", features: { text: true, tools: true, vision: true, reasoning: true, responses: true, streaming: true } }],
      },
    },
    secret: {
      apiKey: "sk-test-secret-123456",
    },
    setActiveScopes: ["codex", "openclaw"],
  });

  assert.equal(provider.apiKeyRef, "provider:openai-main:api-key");
  assert.deepEqual(provider.models.models[0].features, {
    text: true,
    streaming: true,
    tools: true,
    vision: true,
    reasoning: true,
    responses: true,
  });
  assert.equal(provider.secret?.hasSecret, true);
  assert.equal(provider.secret?.masked, "sk-t...3456");
  assert.equal(provider.secret?.length, "sk-test-secret-123456".length);

  const registryRaw = fs.readFileSync(paths.registry, "utf8");
  const secretsRaw = fs.readFileSync(paths.secrets, "utf8");
  assert.ok(!registryRaw.includes("sk-test-secret-123456"));
  assert.ok(secretsRaw.includes("sk-test-secret-123456"));
  assert.equal(fs.statSync(paths.secrets).mode & 0o777, 0o600);

  const listed = service.listProviders();
  assert.equal(listed.providers.length, 1);
  assert.ok(!JSON.stringify(listed).includes("sk-test-secret-123456"));
  assert.equal(listed.activeProviders.codex, "openai-main");
  assert.equal(listed.activeProviders.openclaw, "openai-main");
});

test("model gateway refuses managed auth placeholders before upstream forwarding", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "placeholder-openai",
      name: "Placeholder OpenAI",
      appScopes: ["codex"],
      baseUrl: "https://api.openai.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "PROXY_MANAGED",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({ url: String(url), body: String(init.body || "") });
    return new Response("should not be called", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "hello",
        },
      });
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, "model_gateway_provider_secret_placeholder");
      assert.equal(response.body.error.decision.provider.id, "placeholder-openai");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog.length, 1);
      assert.equal(runtime.body.runtime.requestLog[0].errorCode, "model_gateway_provider_secret_placeholder");
      assert.ok(!JSON.stringify(runtime.body).includes("PROXY_MANAGED"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 0);
});

test("model gateway detects provider protocols without persisting probe secrets", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createStudioContext({ config, logger: createLogger() });
  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const headers = init.headers instanceof Headers
      ? init.headers
      : new Headers(init.headers || {});
    upstreamCalls.push({
      path: target.pathname,
      authorization: headers.get("authorization"),
      apiKey: headers.get("x-api-key"),
      body: String(init.body || ""),
    });

    if (target.pathname.endsWith("/models")) {
      return new Response(JSON.stringify({
        data: [
          { id: "model-a", display_name: "Model A" },
          { id: "model-b" },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (target.pathname.endsWith("/chat/completions")) {
      return new Response(JSON.stringify({
        id: "chatcmpl-detect",
        object: "chat.completion",
        choices: [{ message: { role: "assistant", content: "GATEWAY_OK" } }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (target.pathname.endsWith("/responses")) {
      return new Response(JSON.stringify({
        id: "resp-detect",
        object: "response",
        status: "completed",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "GATEWAY_OK" }],
          },
        ],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (target.pathname.endsWith("/messages")) {
      return new Response(JSON.stringify({
        id: "msg-detect",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "GATEWAY_OK" }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("not found", { status: 404 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/api/model-gateway/detect-provider`, {
        method: "POST",
        body: {
          baseUrl: "https://provider.example/v1",
          apiKey: "sk-detect-secret",
        },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.ok, true);
      assert.equal(response.body.models.length, 2);
      assert.deepEqual(response.body.models.map((model) => model.id), ["model-a", "model-b"]);
      assert.equal(response.body.selectedModel, "model-a");
      assert.deepEqual(
        response.body.protocols.map((protocol) => [protocol.apiFormat, protocol.ok, protocol.authStrategy]),
        [
          ["openai_chat", true, "bearer"],
          ["openai_responses", true, "bearer"],
          ["anthropic_messages", true, "anthropic_api_key"],
        ],
      );
      assert.deepEqual(
        response.body.recommendations.map((item) => item.apiFormat),
        ["openai_chat", "openai_responses", "anthropic_messages"],
      );

      assert.equal(upstreamCalls.some((call) => call.authorization === "Bearer sk-detect-secret"), true);
      assert.equal(upstreamCalls.some((call) => call.apiKey === "sk-detect-secret"), true);
      assert.equal(fs.existsSync(paths.registry), false);
      assert.equal(fs.existsSync(paths.secrets), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway routing contract selects app-scoped providers and preserves provider URL prefixes", () => {
  const root = makeTempRoot();
  const service = createModelGatewayService(createStudioConfig(root));

  service.upsertProvider(undefined, {
    provider: {
      id: "codex-chat",
      name: "Codex Chat Adapter Target",
      appScopes: ["codex"],
      baseUrl: "https://codex.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    setActiveScopes: ["codex"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "openclaw-chat",
      name: "OpenClaw Chat",
      appScopes: ["openclaw"],
      baseUrl: "https://chat.example.test/openai/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    setActiveScopes: ["openclaw"],
  });

  const responses = service.resolveRouteDecision("POST", "/v1/responses");
  assert.equal(responses.routeId, "openai_responses");
  assert.equal(responses.appScope, "codex");
  assert.equal(responses.provider?.id, "codex-chat");
  assert.equal(responses.mode, "adapter-required");
  assert.equal(responses.upstreamPath, "/chat/completions");
  assert.equal(responses.upstreamUrl, "https://codex.example.test/v1/chat/completions");

  const compact = service.resolveRouteDecision("POST", "/v1/responses/compact");
  assert.equal(compact.routeId, "openai_responses_compact");
  assert.equal(compact.appScope, "codex");
  assert.equal(compact.provider?.id, "codex-chat");
  assert.equal(compact.mode, "adapter-required");
  assert.equal(compact.upstreamUrl, "https://codex.example.test/v1/chat/completions");

  const chat = service.resolveRouteDecision("POST", "/v1/chat/completions");
  assert.equal(chat.routeId, "openai_chat_completions");
  assert.equal(chat.appScope, "openclaw");
  assert.equal(chat.provider?.id, "openclaw-chat");
  assert.equal(chat.mode, "passthrough");
  assert.equal(chat.upstreamUrl, "https://chat.example.test/openai/v1/chat/completions");

  service.upsertProvider(undefined, {
    provider: {
      id: "v4-chat",
      name: "V4 Chat",
      appScopes: ["openclaw"],
      baseUrl: "https://chat.example.test/openai/v4",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    setActiveScopes: ["openclaw"],
  });
  const v4Chat = service.resolveRouteDecision("POST", "/v1/chat/completions");
  assert.equal(v4Chat.provider?.id, "v4-chat");
  assert.equal(v4Chat.upstreamPath, "/chat/completions");
  assert.equal(v4Chat.upstreamUrl, "https://chat.example.test/openai/v4/chat/completions");

  const codexChatOverride = service.resolveRouteDecision(
    "POST",
    "/v1/chat/completions",
    { "x-studio-app-scope": "codex" },
  );
  assert.equal(codexChatOverride.appScope, "codex");
  assert.equal(codexChatOverride.provider?.id, "codex-chat");
});

test("model gateway model pools allow cross-provider duplicates but reject provider-local duplicates", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createModelGatewayService(config);

  assert.throws(
    () => service.upsertProvider(undefined, {
      provider: {
        id: "duplicate-local",
        name: "Duplicate Local",
        appScopes: ["openclaw"],
        baseUrl: "https://duplicate.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        models: {
          defaultModel: "same-model",
          models: [{ id: "same-model" }, { id: "same-model" }],
        },
      },
    }),
    /duplicate model name 'same-model'/,
  );
  assert.throws(
    () => service.upsertProvider(undefined, {
      provider: {
        id: "duplicate-alias",
        name: "Duplicate Alias",
        appScopes: ["openclaw"],
        baseUrl: "https://duplicate-alias.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        models: {
          defaultModel: "same-model",
          models: [],
          aliases: { "same-model": "upstream-model" },
        },
      },
    }),
    /duplicate model name 'same-model'/,
  );

  service.upsertProvider(undefined, {
    provider: {
      id: "provider-a",
      name: "Provider A",
      appScopes: ["openclaw"],
      baseUrl: "https://a.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "shared-model",
        models: [{ id: "shared-model", aliases: ["shared-alias"] }, { id: "a-only" }],
      },
      failover: { priority: 20 },
    },
    setActiveScopes: ["openclaw"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "provider-b",
      name: "Provider B",
      appScopes: ["openclaw"],
      baseUrl: "https://b.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "shared-model",
        models: [{ id: "shared-model" }, { id: "b-only" }],
      },
      failover: { priority: 5 },
    },
  });

  let decision = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "shared-model");
  assert.equal(decision.provider?.id, "provider-a");
  assert.equal(decision.model?.resolved, "shared-model");

  service.setActiveProvider(undefined, { scope: "openclaw", providerId: null });
  decision = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "shared-model");
  assert.equal(decision.provider?.id, "provider-b");
  assert.equal(decision.model?.resolved, "shared-model");

  decision = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "provider-a/shared-alias");
  assert.equal(decision.provider?.id, "provider-a");
  assert.equal(decision.model?.requested, "provider-a/shared-alias");
  assert.equal(decision.model?.resolved, "shared-model");

  service.upsertProvider(undefined, {
    provider: {
      id: "provider-b",
      name: "Provider B",
      appScopes: ["openclaw"],
      baseUrl: "https://b.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "shared-model",
        models: [{ id: "shared-model" }, { id: "b-only" }],
      },
      health: {
        circuitState: "open",
        lastFailureAt: "2026-06-05T00:00:00.000Z",
        lastError: "timeout",
        consecutiveFailures: 3,
      },
      failover: { priority: 5 },
    },
  });
  decision = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "shared-model");
  assert.equal(decision.provider?.id, "provider-a");
  assert.equal(decision.model?.resolved, "shared-model");

  decision = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "missing-model");
  assert.equal(decision.mode, "missing-provider");
  assert.match(decision.reason || "", /missing-model/);
});

test("model gateway probes open circuit provider after retry window for requested model", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "chat-active",
      name: "Chat Active",
      appScopes: ["codex"],
      baseUrl: "https://active.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "active-model",
        models: [{ id: "active-model" }],
      },
      failover: { priority: 1 },
    },
    setActiveScopes: ["codex"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "vision-provider",
      name: "Vision Provider",
      appScopes: ["codex"],
      baseUrl: "https://vision.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "vision-model",
        models: [{ id: "vision-model", aliases: ["vision-alias"] }],
      },
      health: {
        circuitState: "open",
        lastFailureAt: new Date().toISOString(),
        lastError: "upstream 503",
        consecutiveFailures: 3,
      },
      failover: { priority: 2 },
    },
  });

  let decision = service.resolveRouteDecision("POST", "/v1/responses", {}, "vision-alias");
  assert.equal(decision.mode, "missing-provider");
  assert.equal(decision.provider, null);
  assert.equal(decision.model?.resolved, "vision-model");
  assert.match(decision.reason || "", /open circuits/);
  assert.doesNotMatch(decision.reason || "", /No active Model Gateway provider/);

  service.upsertProvider(undefined, {
    provider: {
      id: "vision-provider",
      name: "Vision Provider",
      appScopes: ["codex"],
      baseUrl: "https://vision.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "vision-model",
        models: [{ id: "vision-model", aliases: ["vision-alias"] }],
      },
      health: {
        circuitState: "open",
        lastFailureAt: "2000-01-01T00:00:00.000Z",
        lastError: "upstream 503",
        consecutiveFailures: 3,
      },
      failover: { priority: 2 },
    },
  });

  decision = service.resolveRouteDecision("POST", "/v1/responses", {}, "vision-alias");
  assert.equal(decision.provider?.id, "vision-provider");
  assert.equal(decision.model?.resolved, "vision-model");
  assert.match(decision.failoverReason || "", /retry window elapsed/);
});

test("model gateway exposes enabled provider model pool through OpenAI models endpoint", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "models-a",
      name: "Models A",
      appScopes: ["openclaw"],
      baseUrl: "https://models-a.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "shared-model",
        models: [
          { id: "shared-model", label: "Shared", aliases: ["shared-a"], contextWindow: 128000, maxOutputTokens: 8192, features: { text: true, vision: false, tools: true } },
          { id: "a-only", contextWindow: 32000, maxOutputTokens: 2048, features: { text: true, responses: true } },
        ],
      },
      failover: { priority: 10 },
    },
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "models-b",
      name: "Models B",
      appScopes: ["codex"],
      baseUrl: "https://models-b.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "shared-model",
        models: [
          { id: "shared-model", contextWindow: 64000, maxOutputTokens: 4096, features: { vision: true, reasoning: true } },
          { id: "b-only", features: { vision: true, streaming: true } },
        ],
      },
      health: {
        circuitState: "open",
      },
      failover: { priority: 5 },
    },
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "disabled-models",
      name: "Disabled Models",
      enabled: false,
      appScopes: ["openclaw"],
      baseUrl: "https://disabled.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "disabled-only",
        models: [{ id: "disabled-only" }],
      },
    },
  });

  const direct = ctx.services.modelGateway.listGatewayModels();
  assert.deepEqual(direct.data.map((model) => model.id).sort(), ["a-only", "b-only", "shared-model"]);
  const shared = direct.data.find((model) => model.id === "shared-model");
  assert.deepEqual(shared?.providerIds, ["models-a", "models-b"]);
  assert.deepEqual(shared?.healthyProviderIds, ["models-a"]);
  assert.deepEqual(shared?.openCircuitProviderIds, ["models-b"]);
  assert.equal(shared?.contextWindow, 64000);
  assert.equal(shared?.maxOutputTokens, 4096);
  assert.deepEqual(shared?.features, {
    text: true,
    tools: true,
    vision: true,
    reasoning: true,
  });
  assert.equal(direct.data.find((model) => model.id === "a-only")?.contextWindow, 32000);
  assert.equal(direct.data.find((model) => model.id === "a-only")?.maxOutputTokens, 2048);
  assert.deepEqual(direct.data.find((model) => model.id === "a-only")?.features, {
    text: true,
    responses: true,
  });
  assert.deepEqual(direct.data.find((model) => model.id === "b-only")?.features, {
    vision: true,
    streaming: true,
  });
  assert.deepEqual(direct.data.find((model) => model.id === "b-only")?.healthyProviderIds, []);
  assert.deepEqual(direct.data.find((model) => model.id === "b-only")?.openCircuitProviderIds, ["models-b"]);
  assert.equal(direct.data.some((model) => model.id === "disabled-only"), false);

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  await withServer(handler, async (baseUrl) => {
    const response = await requestJson(`${baseUrl}/v1/models`);
    assert.equal(response.status, 200);
    assert.equal(response.body.object, "list");
    assert.deepEqual(response.body.data.map((model) => model.id).sort(), ["a-only", "b-only", "shared-model"]);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.features.vision, true);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.contextWindow, 64000);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.maxOutputTokens, 4096);
  });
});

test("model gateway client key protects client endpoints and stays separate from upstream secrets", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "client-auth-chat",
      name: "Client Auth Chat",
      appScopes: ["openclaw"],
      baseUrl: "https://client-auth.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "auth-model",
        models: [{ id: "auth-model" }],
      },
    },
    secret: { apiKey: "sk-upstream-client-auth" },
    setActiveScopes: ["openclaw"],
  });
  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      apiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({ id: "chatcmpl_client_auth", ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const saveKey = await requestJson(`${baseUrl}/api/model-gateway/client-auth`, {
        method: "POST",
        body: { apiKey: "sk-local-client-one" },
      });
      assert.equal(saveKey.status, 200);
      assert.equal(saveKey.body.clientAuth.enabled, true);
      assert.equal(saveKey.body.clientAuth.secret.masked, "sk-l...-one");
      assert.equal(saveKey.body.revealedKey, null);

      const status = await requestJson(`${baseUrl}/api/model-gateway/status`);
      assert.equal(status.body.registry.clientAuth.enabled, true);
      assert.equal(status.body.registry.clientAuth.secret.hasSecret, true);
      assert.ok(!JSON.stringify(status.body).includes("sk-local-client-one"));

      const missingAuth = await requestJson(`${baseUrl}/v1/models`);
      assert.equal(missingAuth.status, 401);
      assert.equal(missingAuth.body.error, "model_gateway_client_auth_required");

      const wrongAuth = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer sk-wrong-local" },
        body: { model: "auth-model", messages: [{ role: "user", content: "hello" }] },
      });
      assert.equal(wrongAuth.status, 401);

      const models = await requestJson(`${baseUrl}/v1/models`, {
        headers: { "x-api-key": "sk-local-client-one" },
      });
      assert.equal(models.status, 200);
      assert.equal(models.body.object, "list");
      assert.deepEqual(models.body.data.map((model) => model.id), ["auth-model"]);

      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer sk-local-client-one" },
        body: { model: "auth-model", messages: [{ role: "user", content: "hello" }] },
      });
      assert.equal(chat.status, 200);
      assert.deepEqual(chat.body, { id: "chatcmpl_client_auth", ok: true });

      const rotateKey = await requestJson(`${baseUrl}/api/model-gateway/client-auth`, {
        method: "POST",
        body: { apiKey: "sk-local-client-two" },
      });
      assert.equal(rotateKey.status, 200);
      assert.equal(rotateKey.body.clientAuth.secret.masked, "sk-l...-two");

      const oldKey = await requestJson(`${baseUrl}/v1/models`, {
        headers: { "x-api-key": "sk-local-client-one" },
      });
      assert.equal(oldKey.status, 401);

      const newKey = await requestJson(`${baseUrl}/v1/models`, {
        headers: { "x-api-key": "sk-local-client-two" },
      });
      assert.equal(newKey.status, 200);

      const generated = await requestJson(`${baseUrl}/api/model-gateway/client-auth`, {
        method: "POST",
        body: { generate: true },
      });
      assert.equal(generated.status, 200);
      assert.match(generated.body.revealedKey, /^sk-studio-/);
      const generatedKey = await requestJson(`${baseUrl}/v1/models`, {
        headers: { "x-api-key": generated.body.revealedKey },
      });
      assert.equal(generatedKey.status, 200);

      const clearKey = await requestJson(`${baseUrl}/api/model-gateway/client-auth`, {
        method: "POST",
        body: { apiKey: null },
      });
      assert.equal(clearKey.status, 200);
      assert.equal(clearKey.body.clientAuth.enabled, false);
      const unprotectedModels = await requestJson(`${baseUrl}/v1/models`);
      assert.equal(unprotectedModels.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://client-auth.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-upstream-client-auth");
  assert.equal(upstreamCalls[0].apiKey, null);
  assert.ok(!upstreamCalls[0].body.includes("sk-local-client-one"));
});

test("model gateway app connections preview and apply client config files with redacted keys", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const homeDir = path.join(root, "home");
  const service = createModelGatewayService(config, { homeDir });

  service.upsertProvider(undefined, {
    provider: {
      id: "gateway-main",
      name: "Gateway Main",
      appScopes: ["codex", "claude-code", "opencode", "openclaw"],
      baseUrl: "https://provider.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-main",
        models: [{ id: "gpt-main" }, { id: "gpt-alt" }],
      },
    },
    secret: { apiKey: "sk-upstream-app-connection" },
  });
  service.updateClientAuth(undefined, { apiKey: "sk-local-app-connection" });

  const codexPath = path.join(homeDir, ".codex", "config.toml");
  const claudePath = path.join(homeDir, ".claude", "settings.json");
  const opencodePath = path.join(homeDir, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  fs.mkdirSync(path.dirname(opencodePath), { recursive: true });
  fs.mkdirSync(path.dirname(config.openclawConfigFile), { recursive: true });
  fs.writeFileSync(codexPath, "model = \"old-model\"\n\n[profiles.keep]\nmodel = \"keep-model\"\n", "utf8");
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { EXISTING: "1" }, hooks: { Stop: [] } }, null, 2)}\n`, "utf8");
  fs.writeFileSync(opencodePath, `${JSON.stringify({
    $schema: "https://opencode.ai/config.json",
    provider: {
      existing: {
        models: {},
        options: { apiKey: "sk-existing-opencode-secret" },
      },
    },
  }, null, 2)}\n`, "utf8");
  fs.writeFileSync(config.openclawConfigFile, `${JSON.stringify({
    models: { mode: "merge", providers: { existing: { api: "openai-completions" } } },
    agents: { defaults: { model: { primary: "existing/model" } } },
    gateway: { auth: { token: "existing-openclaw-token" } },
  }, null, 2)}\n`, "utf8");

  const preview = service.listAppConnections();
  assert.equal(preview.ok, true);
  assert.equal(preview.profile.model, null);
  assert.deepEqual(preview.availableModels, ["gpt-main", "gpt-alt"]);
  assert.deepEqual(preview.connections.map((connection) => connection.id), ["codex", "claude-code", "opencode", "openclaw"]);
  assert.equal(preview.connections.every((connection) => connection.canApply), true);
  assert.equal(preview.connections.every((connection) => connection.canRollback), false);
  assert.equal(preview.connections.find((connection) => connection.id === "codex")?.model, "gpt-main");
  assert.equal(JSON.stringify(preview).includes("sk-local-app-connection"), false);
  assert.equal(JSON.stringify(preview).includes("sk-existing-opencode-secret"), false);
  assert.equal(JSON.stringify(preview).includes("existing-openclaw-token"), false);
  assert.equal(JSON.stringify(preview).includes("<STUDIO_GATEWAY_KEY>"), true);
  assert.equal(preview.connections.find((connection) => connection.id === "claude-code")?.endpoint, "http://127.0.0.1:18796");

  const profileUpdate = service.updateAppConnectionProfile(undefined, {
    profile: {
      model: "gpt-main",
      appModels: {
        codex: "gpt-alt",
        "claude-code": "gpt-main",
        opencode: "gpt-alt",
        openclaw: "gpt-main",
      },
      contextWindow: 200000,
      autoCompactTokenLimit: 150000,
      maxOutputTokens: 8192,
      reasoningEffort: "high",
      protocolOptions: {
        codexResponsesWebsockets: true,
        codexResponsesWebsocketsV2: true,
        codexRequestCompression: true,
      },
    },
  });
  assert.equal(profileUpdate.profile.model, "gpt-main");
  assert.equal(profileUpdate.connections.find((connection) => connection.id === "codex")?.model, "gpt-alt");
  assert.equal(profileUpdate.connections.find((connection) => connection.id === "claude-code")?.model, "gpt-main");
  const profileClear = service.updateAppConnectionProfile(undefined, {
    profile: {
      appModels: {
        codex: null,
      },
      contextWindow: null,
      maxOutputTokens: null,
    },
  });
  assert.equal(profileClear.profile.appModels.codex, null);
  assert.equal(profileClear.connections.find((connection) => connection.id === "codex")?.model, "gpt-main");
  assert.equal(profileClear.profile.contextWindow, null);
  assert.equal(profileClear.profile.maxOutputTokens, null);
  service.updateAppConnectionProfile(undefined, {
    profile: {
      appModels: {
        codex: "gpt-alt",
      },
      contextWindow: 200000,
      maxOutputTokens: 8192,
    },
  });

  const codex = service.applyAppConnection(undefined, { appId: "codex" });
  assert.equal(codex.applied, true);
  assert.equal(codex.connection.configured, true);
  assert.equal(codex.connection.canRollback, true);
  assert.ok(codex.backupPath && fs.existsSync(codex.backupPath));
  const codexConfig = fs.readFileSync(codexPath, "utf8");
  assert.match(codexConfig, /model_provider = "studio_gateway"/);
  assert.match(codexConfig, /model = "gpt-alt"/);
  assert.match(codexConfig, /model_reasoning_effort = "high"/);
  assert.match(codexConfig, /model_context_window = 200000/);
  assert.match(codexConfig, /model_auto_compact_token_limit = 150000/);
  assert.match(codexConfig, /enable_request_compression = true/);
  assert.match(codexConfig, /\[model_providers\.studio_gateway\]/);
  assert.match(codexConfig, /base_url = "http:\/\/127\.0\.0\.1:18796\/v1"/);
  assert.match(codexConfig, /supports_websockets = true/);
  assert.match(codexConfig, /responses_websockets_v2 = true/);
  assert.match(codexConfig, /experimental_bearer_token = "sk-local-app-connection"/);
  assert.match(codexConfig, /\[profiles\.keep\]/);
  assert.equal(codex.connection.preview.content.includes("sk-local-app-connection"), false);

  const rollback = service.rollbackAppConnection(undefined, { appId: "codex" });
  assert.equal(rollback.rolledBack, true);
  assert.ok(rollback.restoredFrom && fs.existsSync(rollback.restoredFrom));
  assert.match(fs.readFileSync(codexPath, "utf8"), /model = "old-model"/);
  service.applyAppConnection(undefined, { appId: "codex" });

  service.applyAppConnection(undefined, { appId: "claude-code" });
  const claudeConfig = JSON.parse(fs.readFileSync(claudePath, "utf8"));
  assert.equal(claudeConfig.env.EXISTING, "1");
  assert.equal(claudeConfig.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:18796");
  assert.equal(claudeConfig.env.ANTHROPIC_API_KEY, "sk-local-app-connection");
  assert.equal(claudeConfig.env.ANTHROPIC_AUTH_TOKEN, "sk-local-app-connection");
  assert.equal(claudeConfig.env.ANTHROPIC_MODEL, "gpt-main");
  assert.equal(claudeConfig.studioGateway, undefined);
  assert.deepEqual(claudeConfig.hooks.Stop, []);

  service.applyAppConnection(undefined, { appId: "opencode" });
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
  assert.equal(opencodeConfig.model, "studio-gateway/gpt-alt");
  assert.equal(opencodeConfig.provider.existing.options.apiKey, "sk-existing-opencode-secret");
  assert.equal(opencodeConfig.provider["studio-gateway"].npm, "@ai-sdk/openai-compatible");
  assert.equal(opencodeConfig.provider["studio-gateway"].name, "OpenClaw Studio Gateway");
  assert.equal(opencodeConfig.provider["studio-gateway"].options.baseURL, "http://127.0.0.1:18796/v1");
  assert.equal(opencodeConfig.provider["studio-gateway"].options.apiKey, "sk-local-app-connection");
  assert.equal(opencodeConfig.provider["studio-gateway"].options.setCacheKey, true);
  assert.deepEqual(Object.keys(opencodeConfig.provider["studio-gateway"].models).sort(), ["gpt-alt", "gpt-main"]);
  assert.equal(opencodeConfig.provider["studio-gateway"].models["gpt-main"].contextWindow, 200000);
  assert.equal(opencodeConfig.provider["studio-gateway"].models["gpt-main"].maxOutputTokens, 8192);
  assert.equal(opencodeConfig.studioGateway, undefined);

  service.applyAppConnection(undefined, { appId: "openclaw" });
  const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal(openclawConfig.models.providers.existing.api, "openai-completions");
  assert.equal(openclawConfig.gateway.auth.token, "existing-openclaw-token");
  assert.equal(openclawConfig.models.providers["studio-gateway"].api, "openai-completions");
  assert.equal(openclawConfig.models.providers["studio-gateway"].baseUrl, "http://127.0.0.1:18796/v1");
  assert.equal(openclawConfig.models.providers["studio-gateway"].apiKey, "sk-local-app-connection");
  assert.deepEqual(openclawConfig.models.providers["studio-gateway"].models.map((model) => model.id), ["gpt-main", "gpt-alt"]);
  assert.equal(openclawConfig.models.providers["studio-gateway"].models[0].contextWindow, 200000);
  assert.equal(openclawConfig.models.providers["studio-gateway"].models[0].maxTokens, 8192);
  assert.equal(openclawConfig.agents.defaults.model.primary, "studio-gateway/gpt-main");
  assert.equal(openclawConfig.agents.defaults.thinkingDefault, "high");
  assert.equal(openclawConfig.studioGateway, undefined);

  const applyAll = service.applyAppConnections(undefined);
  assert.equal(applyAll.applied.length, 4);
  assert.equal(applyAll.applied.every((item) => item.applied), true);

  const appliedPreview = service.listAppConnections();
  assert.equal(appliedPreview.connections.every((connection) => connection.configured), true);
  assert.equal(appliedPreview.connections.every((connection) => connection.canRollback), true);
  assert.equal(JSON.stringify(appliedPreview).includes("sk-local-app-connection"), false);
});

test("model gateway app connections apply through HTTP routes against an isolated home", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const homeDir = path.join(root, "isolated-home");
  const ctx = createStudioContext({
    config,
    logger: createLogger(),
    modelGatewayOptions: { homeDir },
  });

  const codexPath = path.join(homeDir, ".codex", "config.toml");
  const claudePath = path.join(homeDir, ".claude", "settings.json");
  const opencodePath = path.join(homeDir, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  fs.mkdirSync(path.dirname(opencodePath), { recursive: true });
  fs.mkdirSync(path.dirname(config.openclawConfigFile), { recursive: true });
  fs.writeFileSync(codexPath, "model = \"before-codex\"\n", "utf8");
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { KEEP: "claude" } }, null, 2)}\n`, "utf8");
  fs.writeFileSync(opencodePath, `${JSON.stringify({ provider: { keep: { options: { apiKey: "sk-keep-opencode" } } } }, null, 2)}\n`, "utf8");
  fs.writeFileSync(config.openclawConfigFile, `${JSON.stringify({
    models: { providers: { keep: { api: "openai-completions" } } },
    gateway: { auth: { token: "keep-openclaw" } },
  }, null, 2)}\n`, "utf8");

  await withServer(createStudioRequestHandler(ctx), async (baseUrl) => {
    const provider = await requestJson(`${baseUrl}/api/model-gateway/providers`, {
      method: "POST",
      body: {
        provider: {
          id: "isolated-provider",
          name: "Isolated Provider",
          appScopes: ["codex", "claude-code", "opencode", "openclaw"],
          baseUrl: "https://isolated.example.test/v1",
          apiFormat: "openai_chat",
          authStrategy: "bearer",
          models: {
            defaultModel: "model-a",
            models: [{ id: "model-a" }, { id: "model-b", aliases: ["alias-b"] }],
          },
        },
        secret: { apiKey: "sk-upstream-isolated" },
      },
    });
    assert.equal(provider.status, 200);

    const auth = await requestJson(`${baseUrl}/api/model-gateway/client-auth`, {
      method: "POST",
      body: { apiKey: "sk-local-isolated" },
    });
    assert.equal(auth.status, 200);
    assert.equal(auth.body.clientAuth.enabled, true);

    const profile = await requestJson(`${baseUrl}/api/model-gateway/app-connections/profile`, {
      method: "POST",
      body: {
        profile: {
          model: "model-a",
          appModels: {
            codex: "model-b",
            "claude-code": "model-a",
            opencode: "alias-b",
            openclaw: "model-a",
          },
          contextWindow: 128000,
          autoCompactTokenLimit: 100000,
          maxOutputTokens: 8192,
          reasoningEffort: "medium",
        },
      },
    });
    assert.equal(profile.status, 200);

    const preview = await requestJson(`${baseUrl}/api/model-gateway/app-connections`);
    assert.equal(preview.status, 200);
    assert.equal(preview.body.connections.length, 4);
    assert.equal(preview.body.connections.every((connection) => connection.canApply), true);
    assert.equal(preview.body.connections.find((connection) => connection.id === "codex").target.path, codexPath);
    assert.equal(preview.body.connections.find((connection) => connection.id === "claude-code").target.path, claudePath);
    assert.equal(preview.body.connections.find((connection) => connection.id === "opencode").target.path, opencodePath);
    assert.equal(preview.body.connections.find((connection) => connection.id === "openclaw").target.path, config.openclawConfigFile);
    assert.equal(JSON.stringify(preview.body).includes("sk-local-isolated"), false);
    assert.equal(JSON.stringify(preview.body).includes("sk-upstream-isolated"), false);
    assert.equal(JSON.stringify(preview.body).includes("sk-keep-opencode"), false);
    assert.equal(JSON.stringify(preview.body).includes("keep-openclaw"), false);
    assert.equal(JSON.stringify(preview.body).includes("<STUDIO_GATEWAY_KEY>"), true);

    const applyAll = await requestJson(`${baseUrl}/api/model-gateway/app-connections/apply`, {
      method: "POST",
      body: {},
    });
    assert.equal(applyAll.status, 200);
    assert.equal(applyAll.body.applied.length, 4);
    assert.equal(applyAll.body.applied.every((item) => item.applied), true);

    const codexConfig = fs.readFileSync(codexPath, "utf8");
    assert.match(codexConfig, /model = "model-b"/);
    assert.match(codexConfig, /base_url = "http:\/\/127\.0\.0\.1:18796\/v1"/);
    assert.match(codexConfig, /experimental_bearer_token = "sk-local-isolated"/);
    assert.match(codexConfig, /model_auto_compact_token_limit = 100000/);

    const claudeConfig = JSON.parse(fs.readFileSync(claudePath, "utf8"));
    assert.equal(claudeConfig.env.KEEP, "claude");
    assert.equal(claudeConfig.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:18796");
    assert.equal(claudeConfig.env.ANTHROPIC_API_KEY, "sk-local-isolated");
    assert.equal(claudeConfig.env.ANTHROPIC_MODEL, "model-a");

    const opencodeConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
    assert.equal(opencodeConfig.model, "studio-gateway/alias-b");
    assert.equal(opencodeConfig.provider.keep.options.apiKey, "sk-keep-opencode");
    assert.equal(opencodeConfig.provider["studio-gateway"].options.baseURL, "http://127.0.0.1:18796/v1");
    assert.equal(opencodeConfig.provider["studio-gateway"].options.apiKey, "sk-local-isolated");
    assert.deepEqual(Object.keys(opencodeConfig.provider["studio-gateway"].models).sort(), ["alias-b", "model-a", "model-b"]);

    const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
    assert.equal(openclawConfig.gateway.auth.token, "keep-openclaw");
    assert.equal(openclawConfig.models.providers.keep.api, "openai-completions");
    assert.equal(openclawConfig.models.providers["studio-gateway"].baseUrl, "http://127.0.0.1:18796/v1");
    assert.equal(openclawConfig.models.providers["studio-gateway"].apiKey, "sk-local-isolated");
    assert.equal(openclawConfig.agents.defaults.model.primary, "studio-gateway/model-a");

    const configured = await requestJson(`${baseUrl}/api/model-gateway/app-connections`);
    assert.equal(configured.status, 200);
    assert.equal(configured.body.connections.every((connection) => connection.configured), true);
    assert.equal(JSON.stringify(configured.body).includes("sk-local-isolated"), false);

    for (const appId of ["codex", "claude-code", "opencode", "openclaw"]) {
      const rollback = await requestJson(`${baseUrl}/api/model-gateway/app-connections/${appId}/rollback`, {
        method: "POST",
        body: {},
      });
      assert.equal(rollback.status, 200);
      assert.equal(rollback.body.rolledBack, true);
      assert.ok(rollback.body.restoredFrom);
      assert.ok(rollback.body.backupPath);
    }

    assert.equal(fs.readFileSync(codexPath, "utf8"), "model = \"before-codex\"\n");
    assert.deepEqual(JSON.parse(fs.readFileSync(claudePath, "utf8")), { env: { KEEP: "claude" } });
    assert.deepEqual(JSON.parse(fs.readFileSync(opencodePath, "utf8")), {
      provider: { keep: { options: { apiKey: "sk-keep-opencode" } } },
    });
    const restoredOpenClawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
    assert.equal(restoredOpenClawConfig.gateway.auth.token, "keep-openclaw");
    assert.equal(restoredOpenClawConfig.models.providers.keep.api, "openai-completions");
    assert.equal(restoredOpenClawConfig.models.providers["studio-gateway"], undefined);
  });
});

test("model gateway app connections require a local client key before apply", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const homeDir = path.join(root, "home");
  const service = createModelGatewayService(config, { homeDir });

  service.upsertProvider(undefined, {
    provider: {
      id: "gateway-main",
      name: "Gateway Main",
      appScopes: ["codex"],
      baseUrl: "https://provider.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-main",
        models: [{ id: "gpt-main" }],
      },
    },
  });

  const preview = service.listAppConnections();
  assert.equal(preview.connections.find((connection) => connection.id === "codex")?.canApply, false);
  assert.match(
    preview.connections.find((connection) => connection.id === "codex")?.issues.join("\n") || "",
    /Gateway client key/,
  );
  assert.throws(
    () => service.applyAppConnection(undefined, { appId: "codex" }),
    /Enable and save a local Gateway client key/,
  );
});

test("model gateway management supports active provider selection, delete, and open-circuit fallback", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "codex-primary",
      name: "Codex Primary",
      appScopes: ["codex"],
      baseUrl: "https://primary.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      health: {
        circuitState: "open",
        lastFailureAt: "2026-06-04T00:00:00.000Z",
        lastError: "timeout",
        consecutiveFailures: 3,
      },
      failover: { priority: 1 },
    },
    secret: { apiKey: "sk-primary-secret-1234" },
    setActiveScopes: ["codex"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "codex-backup",
      name: "Codex Backup",
      appScopes: ["codex"],
      baseUrl: "https://backup.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      failover: { priority: 2 },
    },
    secret: { apiKey: "sk-backup-secret-5678" },
  });

  const decision = service.resolveRouteDecision("POST", "/v1/responses");
  assert.equal(decision.provider?.id, "codex-backup");
  assert.equal(decision.mode, "passthrough");
  assert.match(decision.failoverReason || "", /codex-primary.*circuit is open/);

  let providers = service.setActiveProvider(undefined, {
    scope: "codex",
    providerId: "codex-backup",
  });
  assert.equal(providers.activeProviders.codex, "codex-backup");

  providers = service.deleteProvider(undefined, "codex-primary");
  assert.equal(providers.providers.some((provider) => provider.id === "codex-primary"), false);
  assert.equal(providers.activeProviders.codex, "codex-backup");
  assert.ok(!fs.readFileSync(paths.secrets, "utf8").includes("sk-primary-secret-1234"));

  providers = service.setActiveProvider(undefined, {
    scope: "codex",
    providerId: null,
  });
  assert.equal(providers.activeProviders.codex, undefined);
});

test("model gateway provider list reports active route fallback and disabled active removal", () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "route-primary",
      name: "Route Primary",
      appScopes: ["codex"],
      baseUrl: "https://primary.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      health: {
        circuitState: "open",
        lastFailureAt: "2026-06-05T00:00:00.000Z",
        lastError: "timeout",
        consecutiveFailures: 4,
      },
      failover: { priority: 1 },
    },
    secret: { apiKey: "sk-route-primary" },
    setActiveScopes: ["codex"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "route-backup",
      name: "Route Backup",
      appScopes: ["codex"],
      baseUrl: "https://backup.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      failover: { priority: 2 },
    },
    secret: { apiKey: "sk-route-backup" },
  });

  let listed = service.listProviders();
  let codexRoute = listed.activeRoutes.find((route) => route.scope === "codex");
  assert.equal(codexRoute?.state, "fallback");
  assert.equal(codexRoute?.selectedProviderId, "route-primary");
  assert.equal(codexRoute?.resolvedProviderId, "route-backup");
  assert.match(codexRoute?.warning || "", /route-primary.*circuit is open/);
  assert.ok(listed.activeRouteAlerts.some((alert) => /route-primary.*circuit is open/.test(alert)));

  service.setActiveProvider(undefined, {
    scope: "codex",
    providerId: "route-backup",
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "route-backup",
      name: "Route Backup",
      enabled: false,
      appScopes: ["codex"],
      baseUrl: "https://backup.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
  });

  listed = service.listProviders();
  codexRoute = listed.activeRoutes.find((route) => route.scope === "codex");
  assert.equal(listed.activeProviders.codex, undefined);
  assert.equal(codexRoute?.state, "fallback");
  assert.equal(codexRoute?.resolvedProviderId, "route-primary");
  assert.match(listed.activeRouteAlerts.join("\n"), /retry window elapsed/);
});

test("model gateway active route smoke uses the client protocol endpoint", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createModelGatewayService(config);
  service.updateClientAuth(undefined, { apiKey: "sk-local-route-smoke" });
  service.upsertProvider(undefined, {
    provider: {
      id: "route-chat",
      name: "Route Chat",
      appScopes: ["codex"],
      baseUrl: "https://chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-route",
        models: [{ id: "gpt-route" }],
      },
    },
    secret: { apiKey: "sk-upstream-route-smoke" },
    setActiveScopes: ["codex"],
  });

  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  let seenHeaders = {};
  let seenBody = {};
  globalThis.fetch = async (url, init = {}) => {
    seenUrl = String(url);
    seenHeaders = Object.fromEntries(new Headers(init.headers).entries());
    seenBody = JSON.parse(String(init.body || "{}"));
    return new Response(JSON.stringify({
      id: "resp-route-smoke",
      object: "response",
      status: "completed",
      output_text: "GATEWAY_OK",
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-openclaw-model-gateway-provider": "route-chat",
      },
    });
  };

  try {
    const result = await service.testActiveRoute(undefined, {
      scope: "codex",
      input: "Reply with GATEWAY_OK",
      model: "gpt-route",
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerId, "route-chat");
    assert.equal(result.route.mode, "adapter-required");
    assert.match(seenUrl, /\/v1\/responses$/);
    assert.equal(seenHeaders.authorization, "Bearer sk-local-route-smoke");
    assert.equal(seenHeaders["x-studio-app-scope"], "codex");
    assert.equal(seenBody.model, "gpt-route");
    assert.equal(seenBody.input, "Reply with GATEWAY_OK");
    assert.equal(seenBody.max_output_tokens, 96);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway status separates embedded fallback from daemon lifecycle", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const service = createModelGatewayService(config);
  const expectedSupervisor = process.platform === "darwin"
    ? "launchd-user"
    : process.platform === "win32"
      ? "windows-service"
      : "systemd-user";

  const embeddedStatus = service.getStatus();
  assert.equal(embeddedStatus.listener.host, "127.0.0.1");
  assert.equal(embeddedStatus.listener.port, 18796);
  assert.equal(embeddedStatus.lifecycle.controlPlane.state, "running");
  assert.equal(embeddedStatus.lifecycle.controlPlane.mode, "studio-api");
  assert.equal(embeddedStatus.lifecycle.controlPlane.embeddedGatewayActive, true);
  assert.equal(embeddedStatus.lifecycle.openclawMount.state, "configured");
  assert.equal(embeddedStatus.lifecycle.openclawMount.basePath, "/studio");
  assert.equal(embeddedStatus.lifecycle.openclawMount.endpoint, "http://127.0.0.1:31879/studio");
  assert.equal(embeddedStatus.lifecycle.openclawMount.ownsModelRelay, false);
  assert.equal(embeddedStatus.lifecycle.localDaemon.required, true);
  assert.equal(embeddedStatus.lifecycle.localDaemon.implementationStatus, "contract-only");
  assert.equal(embeddedStatus.lifecycle.localDaemon.state, "not-installed");
  assert.equal(embeddedStatus.lifecycle.localDaemon.runtimeMode, "studio-api-embedded");
  assert.equal(embeddedStatus.lifecycle.localDaemon.endpoint, "http://127.0.0.1:18796/v1");
  assert.equal(embeddedStatus.lifecycle.localDaemon.survivesControlPlaneCrash, false);
  assert.equal(embeddedStatus.lifecycle.localDaemon.supervisor.expected, expectedSupervisor);
  assert.equal(embeddedStatus.lifecycle.localDaemon.supervisor.active, null);
  assert.equal(embeddedStatus.lifecycle.localDaemon.supervisor.serviceName, "openclaw-studio-model-gateway.service");
  assert.equal(embeddedStatus.lifecycle.localDaemon.paths.runtime, paths.daemonRuntime);
  assert.equal(embeddedStatus.lifecycle.localDaemon.paths.pid, paths.daemonPid);
  assert.equal(embeddedStatus.lifecycle.localDaemon.paths.lock, paths.portLock);
  assert.deepEqual(embeddedStatus.lifecycle.endpointPolicy, {
    preferredCliEndpoint: "http://127.0.0.1:18796/v1",
    openclawSinglePortEndpoint: "http://127.0.0.1:31879/studio",
    directDaemonFallbackRequired: true,
    targetModelRelayOwner: "local-daemon",
  });

  const daemonProcess = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000);"], {
    stdio: "ignore",
  });
  assert.ok(daemonProcess.pid);

  try {
    fs.mkdirSync(path.dirname(paths.daemonRuntime), { recursive: true });
    fs.writeFileSync(paths.daemonRuntime, `${JSON.stringify({
      version: 1,
      updatedAt: "2026-06-04T00:00:00.000Z",
      pid: daemonProcess.pid,
      startedAt: "2026-06-04T00:00:00.000Z",
      host: "127.0.0.1",
      port: 18796,
      endpoint: "http://127.0.0.1:18796/v1",
      supervisor: expectedSupervisor,
      serviceName: "openclaw-studio-model-gateway.service",
      lockFile: paths.portLock,
    }, null, 2)}\n`);

    const daemonStatus = service.getStatus();
    assert.equal(daemonStatus.lifecycle.controlPlane.embeddedGatewayActive, false);
    assert.equal(daemonStatus.lifecycle.localDaemon.implementationStatus, "available");
    assert.equal(daemonStatus.lifecycle.localDaemon.state, "running");
    assert.equal(daemonStatus.lifecycle.localDaemon.runtimeMode, "local-daemon");
    assert.equal(daemonStatus.lifecycle.localDaemon.pid, daemonProcess.pid);
    assert.equal(daemonStatus.lifecycle.localDaemon.supervisor.active, expectedSupervisor);
    assert.equal(daemonStatus.lifecycle.localDaemon.survivesControlPlaneCrash, true);
  } finally {
    const exited = new Promise((resolve) => daemonProcess.once("exit", resolve));
    daemonProcess.kill();
    await exited;
  }
});

test("model gateway daemon service management exposes templates and guarded install", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });

  await withServer(handler, async (baseUrl) => {
    const status = await requestJson(`${baseUrl}/api/model-gateway/daemon-service`);
    assert.equal(status.status, 200);
    assert.equal(status.body.action, "status");
    assert.equal(status.body.applied, false);
    assert.equal(status.body.installed, false);
    assert.equal(status.body.plan.daemonEntry.endsWith("dist/apps/api/model-gateway-daemon.js"), true);
    assert.deepEqual(
      status.body.plan.templates.map((item) => item.supervisor).sort(),
      ["launchd-user", "scheduled-task", "systemd-user"],
    );
    assert.ok(status.body.plan.templates.find((item) => item.supervisor === "systemd-user").template.includes("Restart=always"));
    assert.ok(status.body.plan.templates.find((item) => item.supervisor === "launchd-user").template.includes("<key>KeepAlive</key>"));
    assert.ok(status.body.plan.templates.find((item) => item.supervisor === "scheduled-task").template.includes("<RestartOnFailure>"));

    const preview = await requestJson(`${baseUrl}/api/model-gateway/daemon-service`, {
      method: "POST",
      body: {
        action: "install",
        apply: false,
      },
    });
    assert.equal(preview.status, 200);
    assert.equal(preview.body.action, "install");
    assert.equal(preview.body.applied, false);
    assert.equal(preview.body.templateWritten, false);
    assert.equal(preview.body.commandsRun.length, 0);
    assert.equal(fs.existsSync(preview.body.plan.selectedTemplate.configPath), false);

    const install = await requestJson(`${baseUrl}/api/model-gateway/daemon-service`, {
      method: "POST",
      body: {
        action: "install",
        apply: true,
        runCommands: false,
      },
    });
    assert.equal(install.status, 200);
    assert.equal(install.body.action, "install");
    assert.equal(install.body.applied, true);
    assert.equal(install.body.templateWritten, true);
    assert.equal(install.body.templateCurrent, true);
    assert.equal(install.body.installed, true);
    assert.equal(install.body.commandsRun.length, 0);
    const serviceTemplate = fs.readFileSync(install.body.plan.selectedTemplate.configPath, "utf8");
    assert.match(serviceTemplate, /model-gateway-daemon\.js/);
    assert.match(serviceTemplate, new RegExp(config.openclawRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(serviceTemplate, new RegExp(`^WorkingDirectory=${config.projectRoot.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"));
    assert.doesNotMatch(serviceTemplate, /^WorkingDirectory="/m);
    assert.match(serviceTemplate, /^Environment="MODEL_GATEWAY_SUPERVISOR=systemd-user"$/m);

    fs.writeFileSync(
      install.body.plan.selectedTemplate.configPath,
      serviceTemplate.replace(/^WorkingDirectory=(.+)$/m, 'WorkingDirectory="$1"'),
      "utf8",
    );
    const reinstall = await requestJson(`${baseUrl}/api/model-gateway/daemon-service`, {
      method: "POST",
      body: {
        action: "install",
        apply: true,
        runCommands: false,
      },
    });
    assert.equal(reinstall.status, 200);
    assert.equal(reinstall.body.action, "install");
    assert.equal(reinstall.body.templateWritten, true);
    assert.equal(reinstall.body.templateCurrent, true);
    assert.doesNotMatch(
      fs.readFileSync(reinstall.body.plan.selectedTemplate.configPath, "utf8"),
      /^WorkingDirectory="/m,
    );

    const startPreview = await requestJson(`${baseUrl}/api/model-gateway/daemon-service`, {
      method: "POST",
      body: {
        action: "start",
        apply: false,
      },
    });
    assert.equal(startPreview.status, 200);
    assert.equal(startPreview.body.applied, false);
    assert.equal(startPreview.body.commandsRun.length, 0);
    assert.ok(startPreview.body.plan.selectedTemplate.commands.start.length >= 1);
  });
});

test("model gateway daemon service management executes selected supervisor commands when requested", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const calls = [];
  const readinessCalls = [];
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: async (endpoint) => {
      readinessCalls.push(endpoint);
      return daemonReady(endpoint);
    },
    daemonServiceCommandRunner: async (command) => {
      calls.push(`${command.command} ${command.args.join(" ")}`);
      let stdout = `ran ${command.label}`;
      if (command.args.includes("is-active")) stdout = "active\n";
      if (command.args.includes("is-enabled")) stdout = "enabled\n";
      if (command.command === "launchctl" && command.args.includes("print")) stdout = "state = running\ndisabled = false\n";
      if (command.command.toLowerCase().includes("schtasks")) stdout = "Status: Running\n";
      return {
        ...command,
        ok: true,
        exitCode: 0,
        stdout,
        stderr: "",
        error: null,
      };
    },
  });

  const start = await service.manageDaemonService(undefined, {
    action: "start",
    apply: true,
  });
  const expectedInstall = start.plan.selectedTemplate.commands.install || [];
  const expectedStart = start.plan.selectedTemplate.commands.start || [];
  const expectedStartStatus = start.plan.selectedTemplate.commands.status || [];
  const expectedStartCalls = [...expectedInstall, ...expectedStart, ...expectedStartStatus];
  assert.equal(start.action, "start");
  assert.equal(start.applied, true);
  assert.equal(start.templateWritten, true);
  assert.deepEqual(
    calls.slice(0, expectedStartCalls.length),
    expectedStartCalls.map((command) => `${command.command} ${command.args.join(" ")}`),
  );
  assert.deepEqual(start.commandsRun.map((result) => result.ok), expectedStartCalls.map(() => true));
  assert.match(start.commandsRun[0]?.stdout || "", /^ran /);
  assert.equal(start.bootstrap.mode, "supervisor");
  assert.equal(start.bootstrap.started, true);

  const restart = await service.manageDaemonService(undefined, {
    action: "restart",
    apply: true,
  });
  const expectedRestartInstall = restart.plan.selectedTemplate.commands.install || [];
  const expectedRestart = restart.plan.selectedTemplate.commands.restart || [];
  const expectedRestartStatus = restart.plan.selectedTemplate.commands.status || [];
  const expectedRestartCalls = [...expectedRestartInstall, ...expectedRestart, ...expectedRestartStatus];
  assert.equal(restart.action, "restart");
  assert.equal(restart.applied, true);
  assert.equal(restart.templateWritten, false);
  assert.equal(restart.bootstrap.mode, "supervisor");
  assert.equal(restart.bootstrap.started, true);
  assert.deepEqual(
    calls.slice(expectedStartCalls.length, expectedStartCalls.length + expectedRestartCalls.length),
    expectedRestartCalls.map((command) => `${command.command} ${command.args.join(" ")}`),
  );
  assert.deepEqual(readinessCalls, [
    "http://127.0.0.1:18796/api/model-gateway/status",
    "http://127.0.0.1:18796/api/model-gateway/status",
  ]);

  const status = await service.manageDaemonService(undefined, {
    action: "status",
    runCommands: true,
  });
  const expectedStatus = status.plan.selectedTemplate.commands.status || [];
  assert.equal(status.action, "status");
  assert.equal(status.applied, expectedStatus.length > 0);
  assert.deepEqual(
    calls.slice(expectedStartCalls.length + expectedRestartCalls.length),
    expectedStatus.map((command) => `${command.command} ${command.args.join(" ")}`),
  );
  assert.equal(status.commandsRun.length, expectedStatus.length);
  assert.equal(status.serviceManager.checked, true);
  assert.equal(status.serviceManager.reachable, true);
  assert.equal(status.serviceManager.active, true);
  assert.equal(status.serviceManager.enabled, true);
  assert.equal(status.serviceManager.lastError, null);
});

test("model gateway ensure-running prefers installed supervisor over detached bootstrap", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const calls = [];
  let startSeen = false;
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: daemonReady,
    daemonServiceCommandRunner: async (command) => {
      calls.push(`${command.command} ${command.args.join(" ")}`);
      const lowerLabel = command.label.toLowerCase();
      if (lowerLabel.includes("start") || lowerLabel.includes("kickstart") || lowerLabel.includes("run scheduled task")) {
        startSeen = true;
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: `ran ${command.label}`,
          stderr: "",
          error: null,
        };
      }
      if (command.args.includes("is-active")) {
        return {
          ...command,
          ok: startSeen,
          exitCode: startSeen ? 0 : 3,
          stdout: startSeen ? "active\n" : "inactive\n",
          stderr: "",
          error: startSeen ? null : "Command failed.",
        };
      }
      if (command.args.includes("is-enabled")) {
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: "enabled\n",
          stderr: "",
          error: null,
        };
      }
      if (command.command === "launchctl" && command.args.includes("print")) {
        return {
          ...command,
          ok: startSeen,
          exitCode: startSeen ? 0 : 3,
          stdout: startSeen ? "state = running\ndisabled = false\n" : "",
          stderr: "",
          error: startSeen ? null : "launchd agent is not running",
        };
      }
      if (command.command.toLowerCase().includes("schtasks")) {
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: startSeen ? "Status: Running\n" : "Status: Ready\n",
          stderr: "",
          error: null,
        };
      }
      return {
        ...command,
        ok: true,
        exitCode: 0,
        stdout: `ran ${command.label}`,
        stderr: "",
        error: null,
      };
    },
  });

  const install = await service.manageDaemonService(undefined, {
    action: "install",
    apply: true,
    runCommands: false,
  });
  assert.equal(install.installed, true);
  assert.equal(calls.length, 0);

  const ensure = await service.manageDaemonService(undefined, {
    action: "ensure-running",
    apply: true,
  });
  const statusCommands = ensure.plan.selectedTemplate.commands.status || [];
  const startCommands = ensure.plan.selectedTemplate.commands.start || [];
  const expectedCalls = [
    ...statusCommands,
    ...startCommands,
    ...statusCommands,
  ].map((command) => `${command.command} ${command.args.join(" ")}`);
  assert.equal(ensure.action, "ensure-running");
  assert.equal(ensure.applied, true);
  assert.equal(ensure.bootstrap.mode, "supervisor");
  assert.equal(ensure.bootstrap.attempted, true);
  assert.equal(ensure.bootstrap.started, true);
  assert.equal(ensure.bootstrap.temporary, false);
  assert.equal(ensure.templateWritten, false);
  assert.equal(ensure.templateCurrent, true);
  assert.deepEqual(calls, expectedCalls);
  assert.equal(ensure.commandsRun.length, expectedCalls.length);
  assert.equal(ensure.commandsRun.some((command) => !command.ok), false);
  assert.equal(ensure.serviceManager.checked, true);
  assert.equal(ensure.serviceManager.active, true);
  assert.equal(ensure.serviceManager.lastError, null);
});

test("model gateway stop treats inactive supervised service as expected", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  let stopped = false;
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: daemonReady,
    daemonServiceCommandRunner: async (command) => {
      const lowerLabel = command.label.toLowerCase();
      if (lowerLabel.includes("stop") || lowerLabel.includes("bootout") || lowerLabel.includes("end")) {
        stopped = true;
      }
      if (command.args.includes("is-active")) {
        return {
          ...command,
          ok: !stopped,
          exitCode: stopped ? 3 : 0,
          stdout: stopped ? "inactive\n" : "active\n",
          stderr: "",
          error: stopped ? "Command failed." : null,
        };
      }
      if (command.args.includes("is-enabled")) {
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: "enabled\n",
          stderr: "",
          error: null,
        };
      }
      return {
        ...command,
        ok: true,
        exitCode: 0,
        stdout: `ran ${command.label}`,
        stderr: "",
        error: null,
      };
    },
  });

  const stoppedResult = await service.manageDaemonService(undefined, {
    action: "stop",
    runCommands: true,
  });

  assert.equal(stoppedResult.action, "stop");
  assert.equal(stoppedResult.applied, true);
  assert.equal(stoppedResult.serviceManager.checked, true);
  assert.equal(stoppedResult.serviceManager.reachable, true);
  assert.equal(stoppedResult.serviceManager.active, false);
  assert.equal(stoppedResult.serviceManager.enabled, true);
  assert.equal(stoppedResult.serviceManager.lastError, null);
  assert.equal(stoppedResult.commandsRun.some((command) => !command.ok), false);
});

test("model gateway start reports bootstrap failure until daemon HTTP is ready", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: async (endpoint) => ({
      endpoint,
      ready: false,
      statusCode: null,
      error: "connection refused",
    }),
    daemonServiceCommandRunner: async (command) => {
      let stdout = `ran ${command.label}`;
      if (command.args.includes("is-active")) stdout = "active\n";
      if (command.args.includes("is-enabled")) stdout = "enabled\n";
      return {
        ...command,
        ok: true,
        exitCode: 0,
        stdout,
        stderr: "",
        error: null,
      };
    },
  });

  const result = await service.manageDaemonService(undefined, {
    action: "start",
    apply: true,
  });

  assert.equal(result.action, "start");
  assert.equal(result.serviceManager.active, true);
  assert.equal(result.serviceManager.enabled, true);
  assert.equal(result.serviceManager.lastError, null);
  assert.equal(result.bootstrap.mode, "supervisor");
  assert.equal(result.bootstrap.started, false);
  assert.equal(result.bootstrap.error, "connection refused");
});

test("model gateway ensure-running repairs stale installed supervisor templates", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const calls = [];
  let startSeen = false;
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: daemonReady,
    daemonServiceCommandRunner: async (command) => {
      calls.push(`${command.command} ${command.args.join(" ")}`);
      const lowerLabel = command.label.toLowerCase();
      if (lowerLabel.includes("start") || lowerLabel.includes("kickstart") || lowerLabel.includes("run scheduled task")) {
        startSeen = true;
      }
      if (command.args.includes("is-active")) {
        return {
          ...command,
          ok: startSeen,
          exitCode: startSeen ? 0 : 3,
          stdout: startSeen ? "active\n" : "inactive\n",
          stderr: "",
          error: startSeen ? null : "Command failed.",
        };
      }
      if (command.args.includes("is-enabled")) {
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: "enabled\n",
          stderr: "",
          error: null,
        };
      }
      return {
        ...command,
        ok: true,
        exitCode: 0,
        stdout: `ran ${command.label}`,
        stderr: "",
        error: null,
      };
    },
  });

  const install = await service.manageDaemonService(undefined, {
    action: "install",
    apply: true,
    runCommands: false,
  });
  const configPath = install.plan.selectedTemplate.configPath;
  fs.writeFileSync(
    configPath,
    fs.readFileSync(configPath, "utf8").replace(/^WorkingDirectory=(.+)$/m, 'WorkingDirectory="$1"'),
    "utf8",
  );

  const ensure = await service.manageDaemonService(undefined, {
    action: "ensure-running",
    apply: true,
  });
  const installCommands = ensure.plan.selectedTemplate.commands.install || [];
  const statusCommands = ensure.plan.selectedTemplate.commands.status || [];
  const startCommands = ensure.plan.selectedTemplate.commands.start || [];
  const expectedCalls = [
    ...installCommands,
    ...statusCommands,
    ...startCommands,
    ...statusCommands,
  ].map((command) => `${command.command} ${command.args.join(" ")}`);

  assert.equal(ensure.action, "ensure-running");
  assert.equal(ensure.applied, true);
  assert.equal(ensure.templateWritten, true);
  assert.equal(ensure.templateCurrent, true);
  assert.equal(ensure.bootstrap.mode, "supervisor");
  assert.equal(ensure.bootstrap.started, true);
  assert.equal(ensure.serviceManager.lastError, null);
  assert.deepEqual(calls, expectedCalls);
  const repairedTemplate = fs.readFileSync(configPath, "utf8");
  assert.doesNotMatch(repairedTemplate, /^WorkingDirectory="/m);
});

test("model gateway ensure-running restarts active supervisor after template repair", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const calls = [];
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: daemonReady,
    daemonServiceCommandRunner: async (command) => {
      calls.push(`${command.command} ${command.args.join(" ")}`);
      if (command.args.includes("is-active")) {
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: "active\n",
          stderr: "",
          error: null,
        };
      }
      if (command.args.includes("is-enabled")) {
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: "enabled\n",
          stderr: "",
          error: null,
        };
      }
      return {
        ...command,
        ok: true,
        exitCode: 0,
        stdout: `ran ${command.label}`,
        stderr: "",
        error: null,
      };
    },
  });

  const install = await service.manageDaemonService(undefined, {
    action: "install",
    apply: true,
    runCommands: false,
  });
  const configPath = install.plan.selectedTemplate.configPath;
  fs.writeFileSync(
    configPath,
    fs.readFileSync(configPath, "utf8").replace(/^Environment="MODEL_GATEWAY_SUPERVISOR=systemd-user"$/m, ""),
    "utf8",
  );
  fs.mkdirSync(path.dirname(paths.daemonRuntime), { recursive: true });
  fs.writeFileSync(paths.daemonRuntime, `${JSON.stringify({
    version: 1,
    updatedAt: "2026-06-04T00:00:00.000Z",
    pid: process.pid,
    startedAt: "2026-06-04T00:00:00.000Z",
    host: "127.0.0.1",
    port: 18796,
    endpoint: "http://127.0.0.1:18796/v1",
    supervisor: "systemd-user",
    serviceName: "openclaw-studio-model-gateway.service",
    lockFile: paths.portLock,
  }, null, 2)}\n`);

  const ensure = await service.manageDaemonService(undefined, {
    action: "ensure-running",
    apply: true,
  });
  const installCommands = ensure.plan.selectedTemplate.commands.install || [];
  const statusCommands = ensure.plan.selectedTemplate.commands.status || [];
  const restartCommands = ensure.plan.selectedTemplate.commands.restart || [];
  const expectedCalls = [
    ...installCommands,
    ...statusCommands,
    ...restartCommands,
    ...statusCommands,
  ].map((command) => `${command.command} ${command.args.join(" ")}`);

  assert.equal(ensure.templateWritten, true);
  assert.equal(ensure.templateCurrent, true);
  assert.equal(ensure.bootstrap.started, true);
  assert.equal(ensure.serviceManager.lastError, null);
  assert.deepEqual(calls, expectedCalls);
  assert.match(fs.readFileSync(configPath, "utf8"), /^Environment="MODEL_GATEWAY_SUPERVISOR=systemd-user"$/m);
});

test("model gateway ensure-running installs supervisor template before starting when missing", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const calls = [];
  let startSeen = false;
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: daemonReady,
    daemonServiceCommandRunner: async (command) => {
      calls.push(`${command.command} ${command.args.join(" ")}`);
      const lowerLabel = command.label.toLowerCase();
      if (lowerLabel.includes("start") || lowerLabel.includes("kickstart") || lowerLabel.includes("run scheduled task")) {
        startSeen = true;
      }
      if (command.args.includes("is-active")) {
        return {
          ...command,
          ok: startSeen,
          exitCode: startSeen ? 0 : 3,
          stdout: startSeen ? "active\n" : "inactive\n",
          stderr: "",
          error: startSeen ? null : "Command failed.",
        };
      }
      if (command.args.includes("is-enabled")) {
        return {
          ...command,
          ok: true,
          exitCode: 0,
          stdout: "enabled\n",
          stderr: "",
          error: null,
        };
      }
      return {
        ...command,
        ok: true,
        exitCode: 0,
        stdout: `ran ${command.label}`,
        stderr: "",
        error: null,
      };
    },
  });

  const preview = await service.manageDaemonService(undefined, {
    action: "ensure-running",
  });
  assert.equal(preview.action, "ensure-running");
  assert.equal(preview.applied, false);
  assert.equal(preview.installed, false);
  assert.equal(preview.bootstrap.mode, "blocked");

  const ensure = await service.manageDaemonService(undefined, {
    action: "ensure-running",
    apply: true,
  });
  const installCommands = ensure.plan.selectedTemplate.commands.install || [];
  const statusCommands = ensure.plan.selectedTemplate.commands.status || [];
  const startCommands = ensure.plan.selectedTemplate.commands.start || [];
  const expectedCalls = [
    ...installCommands,
    ...statusCommands,
    ...startCommands,
    ...statusCommands,
  ].map((command) => `${command.command} ${command.args.join(" ")}`);

  assert.equal(ensure.action, "ensure-running");
  assert.equal(ensure.applied, true);
  assert.equal(ensure.templateWritten, true);
  assert.equal(ensure.templateCurrent, true);
  assert.equal(ensure.installed, true);
  assert.equal(ensure.bootstrap.mode, "supervisor");
  assert.equal(ensure.bootstrap.started, true);
  assert.equal(ensure.serviceManager.lastError, null);
  assert.deepEqual(calls, expectedCalls);
});

test("model gateway daemon service status summarizes supervisor command failures", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const service = createModelGatewayService(config, {
    daemonReadinessChecker: daemonReady,
    daemonServiceCommandRunner: async (command) => {
      if (command.args.includes("is-active")) {
        return {
          ...command,
          ok: false,
          exitCode: 3,
          stdout: "inactive\n",
          stderr: "",
          error: "Command failed.",
        };
      }
      return {
        ...command,
        ok: false,
        exitCode: null,
        stdout: "",
        stderr: "",
        error: `spawn ${command.command} ENOENT`,
      };
    },
  });

  const status = await service.manageDaemonService(undefined, {
    action: "status",
    runCommands: true,
  });
  assert.equal(status.action, "status");
  assert.equal(status.serviceManager.checked, true);
  assert.equal(status.serviceManager.reachable, false);
  assert.notEqual(status.serviceManager.active, true);
  assert.match(status.serviceManager.lastError || "", /daemon|launchd|scheduled/i);
});

test("model gateway daemon writes runtime metadata and serves cli routes", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const service = createModelGatewayService(config);
  service.upsertProvider(undefined, {
    provider: {
      id: "daemon-chat",
      name: "Daemon Chat",
      appScopes: ["openclaw"],
      baseUrl: "https://daemon-chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-daemon-secret-123456",
    },
    setActiveScopes: ["openclaw"],
  });

  const daemon = createModelGatewayDaemon(config, {
    port: 0,
    supervisor: "none",
    logger: createLogger(),
  });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_daemon",
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content: "daemon ok" }, finish_reason: "stop" }],
      usage: {
        prompt_tokens: 3,
        completion_tokens: 2,
        total_tokens: 5,
        prompt_tokens_details: { cached_tokens: 1 },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const metadata = await daemon.start();
    assert.equal(metadata.pid, process.pid);
    assert.equal(metadata.host, "127.0.0.1");
    assert.ok(metadata.port > 0);
    assert.equal(metadata.endpoint, `http://127.0.0.1:${metadata.port}/v1`);
    assert.equal(metadata.lockFile, paths.portLock);
    assert.equal(fs.readFileSync(paths.daemonPid, "utf8").trim(), String(process.pid));
    assert.equal(JSON.parse(fs.readFileSync(paths.daemonRuntime, "utf8")).pid, process.pid);
    assert.equal(JSON.parse(fs.readFileSync(paths.portLock, "utf8")).port, metadata.port);

    const status = await requestJson(`${daemon.getBaseUrl()}/gateway/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.listener.port, metadata.port);
    assert.equal(status.body.lifecycle.controlPlane.state, "not-attached");
    assert.equal(status.body.lifecycle.controlPlane.mode, "daemon-local-control");
    assert.equal(status.body.lifecycle.controlPlane.embeddedGatewayActive, false);
    assert.equal(status.body.lifecycle.localDaemon.implementationStatus, "available");
    assert.equal(status.body.lifecycle.localDaemon.state, "running");
    assert.equal(status.body.lifecycle.localDaemon.runtimeMode, "local-daemon");
    assert.equal(status.body.lifecycle.localDaemon.pid, process.pid);
    assert.equal(status.body.lifecycle.localDaemon.survivesControlPlaneCrash, true);
    assert.equal(status.body.lifecycle.localDaemon.endpoint, `http://127.0.0.1:${metadata.port}/v1`);
    assert.equal(status.body.lifecycle.endpointPolicy.preferredCliEndpoint, `http://127.0.0.1:${metadata.port}/v1`);

    const chat = await requestJson(`${daemon.getBaseUrl()}/v1/chat/completions`, {
      method: "POST",
      body: {
        model: "daemon-model",
        messages: [{ role: "user", content: "hello daemon" }],
        stream: false,
      },
    });
    assert.equal(chat.status, 200);
    assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "daemon-chat");
    assert.equal(chat.body.choices[0].message.content, "daemon ok");

    const runtime = await requestJson(`${daemon.getBaseUrl()}/api/model-gateway/runtime`);
    assert.equal(runtime.status, 200);
    assert.equal(runtime.body.runtime.requestLog.length, 1);
    assert.equal(runtime.body.runtime.requestLog[0].routeId, "openai_chat_completions");
    assert.equal(runtime.body.runtime.requestLog[0].outcome, "success");
    assert.deepEqual(runtime.body.runtime.requestLog[0].usage, {
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
      cacheReadTokens: 1,
      cacheCreationTokens: 0,
    });
    assert.ok(!JSON.stringify(runtime.body).includes("sk-daemon-secret-123456"));
  } finally {
    globalThis.fetch = originalFetch;
    await daemon.stop();
  }

  assert.equal(daemon.isRunning(), false);
  assert.equal(fs.existsSync(paths.daemonRuntime), false);
  assert.equal(fs.existsSync(paths.daemonPid), false);
  assert.equal(fs.existsSync(paths.portLock), false);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://daemon-chat.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-daemon-secret-123456");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "daemon-model",
    messages: [{ role: "user", content: "hello daemon" }],
    stream: false,
  });
});

test("model gateway child daemon keeps serving after Studio API listener shuts down", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const upstreamCalls = [];
  const upstream = await startHttpServer(async (req, res) => {
    const body = await readRequestBody(req);
    upstreamCalls.push({
      url: req.url,
      authorization: req.headers.authorization || null,
      body,
    });
    if (req.url === "/v1/chat/completions") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "chatcmpl_child_daemon",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "child daemon ok" }, finish_reason: "stop" }],
      }));
      return true;
    }
    return false;
  });

  const service = createModelGatewayService(config);
  service.upsertProvider(undefined, {
    provider: {
      id: "child-daemon-chat",
      name: "Child Daemon Chat",
      appScopes: ["openclaw"],
      baseUrl: `${upstream.baseUrl}/v1`,
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-child-daemon-secret-123456",
    },
    setActiveScopes: ["openclaw"],
  });

  const ctx = createStudioContext({ config, logger: createLogger() });
  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const api = await startHttpServer(handler);
  let apiClosed = false;
  const child = spawn(process.execPath, [path.join(process.cwd(), "dist/apps/api/model-gateway-daemon.js")], {
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: config.openclawRoot,
      MODEL_GATEWAY_PORT: "0",
      MODEL_GATEWAY_SUPERVISOR: "none",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childOutput = "";
  child.stdout.on("data", (chunk) => {
    childOutput += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    childOutput += String(chunk);
  });

  try {
    const metadata = await waitFor(() => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`daemon child exited early: ${childOutput}`);
      }
      if (!fs.existsSync(paths.daemonRuntime)) return null;
      const parsed = JSON.parse(fs.readFileSync(paths.daemonRuntime, "utf8"));
      return parsed.port > 0 ? parsed : null;
    }, 5000);
    assert.equal(metadata.pid, child.pid);
    assert.equal(metadata.host, "127.0.0.1");
    assert.ok(metadata.port > 0);

    const apiStatus = await requestJson(`${api.baseUrl}/api/model-gateway/status`);
    assert.equal(apiStatus.status, 200);
    assert.equal(apiStatus.body.lifecycle.localDaemon.state, "running");
    assert.equal(apiStatus.body.lifecycle.localDaemon.pid, child.pid);

    await api.close();
    apiClosed = true;
    await assert.rejects(() => requestJson(`${api.baseUrl}/api/model-gateway/status`));

    const daemonBaseUrl = `http://127.0.0.1:${metadata.port}`;
    const daemonStatus = await requestJson(`${daemonBaseUrl}/gateway/status`);
    assert.equal(daemonStatus.status, 200);
    assert.equal(daemonStatus.body.lifecycle.controlPlane.state, "not-attached");
    assert.equal(daemonStatus.body.lifecycle.localDaemon.runtimeMode, "local-daemon");
    assert.equal(daemonStatus.body.lifecycle.localDaemon.survivesControlPlaneCrash, true);
    assert.equal(daemonStatus.body.lifecycle.endpointPolicy.preferredCliEndpoint, `${daemonBaseUrl}/v1`);

    const chat = await requestJson(`${daemonBaseUrl}/v1/chat/completions`, {
      method: "POST",
      body: {
        model: "child-daemon-model",
        messages: [{ role: "user", content: "hello after api shutdown" }],
        stream: false,
      },
    });
    assert.equal(chat.status, 200);
    assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "child-daemon-chat");
    assert.equal(chat.body.choices[0].message.content, "child daemon ok");
  } finally {
    if (!apiClosed) await api.close().catch(() => {});
    await stopChild(child);
    await upstream.close();
  }

  await waitFor(() => !fs.existsSync(paths.daemonRuntime), 3000);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-child-daemon-secret-123456");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "child-daemon-model",
    messages: [{ role: "user", content: "hello after api shutdown" }],
    stream: false,
  });
});

test("model gateway direct daemon endpoint survives OpenClaw single-port mount shutdown", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const upstreamCalls = [];
  const upstream = await startHttpServer(async (req, res) => {
    const body = await readRequestBody(req);
    upstreamCalls.push({
      url: req.url,
      authorization: req.headers.authorization || null,
      body,
    });
    if (req.url === "/v1/chat/completions") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({
        id: "chatcmpl_mount_fallback",
        object: "chat.completion",
        choices: [{ index: 0, message: { role: "assistant", content: "mount fallback ok" }, finish_reason: "stop" }],
      }));
      return true;
    }
    return false;
  });

  const service = createModelGatewayService(config);
  service.upsertProvider(undefined, {
    provider: {
      id: "mount-fallback-chat",
      name: "Mount Fallback Chat",
      appScopes: ["openclaw"],
      baseUrl: `${upstream.baseUrl}/v1`,
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-mount-fallback-secret-123456",
    },
    setActiveScopes: ["openclaw"],
  });

  const ctx = createStudioContext({ config, logger: createLogger() });
  const mountHandler = createStudioRequestHandler(ctx, { stripBasePath: "/studio" });
  const mount = await startHttpServer(mountHandler);
  let mountClosed = false;
  const child = spawn(process.execPath, [path.join(process.cwd(), "dist/apps/api/model-gateway-daemon.js")], {
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: config.openclawRoot,
      MODEL_GATEWAY_PORT: "0",
      MODEL_GATEWAY_SUPERVISOR: "none",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let childOutput = "";
  child.stdout.on("data", (chunk) => {
    childOutput += String(chunk);
  });
  child.stderr.on("data", (chunk) => {
    childOutput += String(chunk);
  });

  try {
    const metadata = await waitFor(() => {
      if (child.exitCode !== null || child.signalCode !== null) {
        throw new Error(`daemon child exited early: ${childOutput}`);
      }
      if (!fs.existsSync(paths.daemonRuntime)) return null;
      const parsed = JSON.parse(fs.readFileSync(paths.daemonRuntime, "utf8"));
      return parsed.port > 0 ? parsed : null;
    }, 5000);

    const mountedStatus = await requestJson(`${mount.baseUrl}/studio/api/model-gateway/status`);
    assert.equal(mountedStatus.status, 200);
    assert.equal(mountedStatus.body.lifecycle.openclawMount.state, "configured");
    assert.equal(mountedStatus.body.lifecycle.openclawMount.basePath, "/studio");
    assert.equal(mountedStatus.body.lifecycle.openclawMount.ownsModelRelay, false);
    assert.equal(mountedStatus.body.lifecycle.endpointPolicy.directDaemonFallbackRequired, true);
    assert.equal(mountedStatus.body.lifecycle.endpointPolicy.targetModelRelayOwner, "local-daemon");

    await mount.close();
    mountClosed = true;
    await assert.rejects(() => requestJson(`${mount.baseUrl}/studio/api/model-gateway/status`));

    const daemonBaseUrl = `http://127.0.0.1:${metadata.port}`;
    const daemonStatus = await requestJson(`${daemonBaseUrl}/gateway/status`);
    assert.equal(daemonStatus.status, 200);
    assert.equal(daemonStatus.body.lifecycle.localDaemon.runtimeMode, "local-daemon");
    assert.equal(daemonStatus.body.lifecycle.localDaemon.survivesControlPlaneCrash, true);
    assert.equal(daemonStatus.body.lifecycle.endpointPolicy.preferredCliEndpoint, `${daemonBaseUrl}/v1`);

    const chat = await requestJson(`${daemonBaseUrl}/v1/chat/completions`, {
      method: "POST",
      body: {
        model: "mount-fallback-model",
        messages: [{ role: "user", content: "hello after mount shutdown" }],
        stream: false,
      },
    });
    assert.equal(chat.status, 200);
    assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "mount-fallback-chat");
    assert.equal(chat.body.choices[0].message.content, "mount fallback ok");
  } finally {
    if (!mountClosed) await mount.close().catch(() => {});
    await stopChild(child);
    await upstream.close();
  }

  await waitFor(() => !fs.existsSync(paths.daemonRuntime), 3000);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-mount-fallback-secret-123456");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "mount-fallback-model",
    messages: [{ role: "user", content: "hello after mount shutdown" }],
    stream: false,
  });
});

test("model gateway protocol matrix forwards native openai responses and guards unfinished adapters", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "native-responses",
      name: "Native Responses Provider",
      appScopes: ["codex", "openclaw", "claude-code"],
      baseUrl: "https://responses-native.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-native-responses-secret",
    },
    setActiveScopes: ["codex", "openclaw", "claude-code"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = String(init.body || "");
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body,
    });
    if (upstreamCalls.length === 3) {
      return new Response(JSON.stringify({
        id: "resp_chat_adapter",
        object: "response",
        status: "completed",
        model: "gpt-native-responses",
        output: [
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Chat through Responses." }],
          },
          {
            type: "function_call",
            id: "call_save",
            call_id: "call_save",
            name: "save_note",
            arguments: "{\"note\":\"done\"}",
          },
        ],
        usage: {
          input_tokens: 13,
          output_tokens: 8,
          total_tokens: 21,
          input_tokens_details: { cached_tokens: 4 },
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (upstreamCalls.length === 4) {
      const upstreamSse = [
        "event: response.created",
        "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_chat_stream\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-native-responses\",\"output\":[],\"usage\":null}}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Str\"}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"eam\"}",
        "",
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_chat_stream\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-native-responses\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Stream\"}]}],\"usage\":{\"input_tokens\":5,\"output_tokens\":2,\"total_tokens\":7}}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    if (upstreamCalls.length === 5) {
      return new Response(JSON.stringify({
        id: "resp_anthropic_adapter",
        object: "response",
        status: "completed",
        model: "gpt-native-responses",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Anthropic through Responses." }],
        }],
        usage: {
          input_tokens: 9,
          output_tokens: 4,
          total_tokens: 13,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (upstreamCalls.length === 6) {
      const upstreamSse = [
        "event: response.created",
        "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_anthropic_stream\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-native-responses\",\"output\":[],\"usage\":null}}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"Anthropic \"}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"stream\"}",
        "",
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_anthropic_stream\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-native-responses\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Anthropic stream\"}]}],\"usage\":{\"input_tokens\":6,\"output_tokens\":2,\"total_tokens\":8}}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    const requestBody = JSON.parse(body);
    const isCompact = requestBody.input === "Summarize for compaction.";
    return new Response(JSON.stringify({
      id: isCompact ? "resp_native_compact" : "resp_native",
      object: "response",
      status: "completed",
      output: [{
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: isCompact ? "Native compact summary" : "Native response text",
        }],
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          input: "Use native Responses.",
          stream: false,
        },
      });
      assert.equal(responses.status, 200);
      assert.equal(responses.body.id, "resp_native");
      assert.equal(responses.body.output[0].content[0].text, "Native response text");
      assert.equal(responses.headers["x-openclaw-model-gateway-provider"], "native-responses");

      const compact = await requestJson(`${baseUrl}/v1/responses/compact`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          input: "Summarize for compaction.",
          stream: false,
        },
      });
      assert.equal(compact.status, 200);
      assert.equal(compact.body.id, "resp_native_compact");
      assert.equal(compact.body.output[0].content[0].text, "Native compact summary");
      assert.equal(compact.headers["x-openclaw-model-gateway-provider"], "native-responses");

      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          messages: [
            { role: "system", content: "Stay concise." },
            { role: "user", content: "chat please" },
            {
              role: "assistant",
              content: "I will save a note.",
              tool_calls: [{
                id: "call_note",
                type: "function",
                function: {
                  name: "save_note",
                  arguments: "{\"note\":\"draft\"}",
                },
              }],
            },
            { role: "tool", tool_call_id: "call_note", content: "saved" },
          ],
          tools: [{
            type: "function",
            function: {
              name: "save_note",
              description: "Save a note",
              parameters: {
                type: "object",
                properties: { note: { type: "string" } },
                required: ["note"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "save_note" } },
          max_tokens: 128,
          temperature: 0.3,
        },
      });
      assert.equal(chat.status, 200);
      assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "native-responses");
      assert.equal(chat.body.id, "resp_chat_adapter");
      assert.equal(chat.body.object, "chat.completion");
      assert.equal(chat.body.choices[0].finish_reason, "tool_calls");
      assert.deepEqual(chat.body.choices[0].message, {
        role: "assistant",
        content: "Chat through Responses.",
        tool_calls: [{
          id: "call_save",
          type: "function",
          function: {
            name: "save_note",
            arguments: "{\"note\":\"done\"}",
          },
        }],
      });
      assert.deepEqual(chat.body.usage, {
        prompt_tokens: 13,
        completion_tokens: 8,
        total_tokens: 21,
        prompt_tokens_details: { cached_tokens: 4 },
      });

      const streaming = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          stream: true,
          messages: [{ role: "user", content: "stream please" }],
        },
      });
      assert.equal(streaming.status, 200);
      assert.match(streaming.headers["content-type"], /text\/event-stream/);
      const streamingEvents = parseSseEvents(streaming.body);
      assert.equal(streamingEvents[0].data.object, "chat.completion.chunk");
      assert.equal(streamingEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(streamingEvents[1].data.choices[0].delta.content, "Str");
      assert.equal(streamingEvents[2].data.choices[0].delta.content, "eam");
      assert.equal(streamingEvents[3].data.choices[0].finish_reason, "stop");
      assert.deepEqual(streamingEvents[3].data.usage, {
        prompt_tokens: 5,
        completion_tokens: 2,
        total_tokens: 7,
      });
      assert.equal(streamingEvents[4].data, "[DONE]");

      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          max_tokens: 32,
          messages: [{ role: "user", content: "anthropic please" }],
        },
      });
      assert.equal(messages.status, 200);
      assert.equal(messages.headers["x-openclaw-model-gateway-provider"], "native-responses");
      assert.equal(messages.body.id, "resp_anthropic_adapter");
      assert.equal(messages.body.type, "message");
      assert.equal(messages.body.role, "assistant");
      assert.deepEqual(messages.body.content, [{
        type: "text",
        text: "Anthropic through Responses.",
      }]);
      assert.equal(messages.body.stop_reason, "end_turn");
      assert.deepEqual(messages.body.usage, {
        input_tokens: 9,
        output_tokens: 4,
        cache_read_input_tokens: 0,
      });

      const messageStream = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          max_tokens: 32,
          stream: true,
          messages: [{ role: "user", content: "anthropic stream please" }],
        },
      });
      assert.equal(messageStream.status, 200);
      assert.match(messageStream.headers["content-type"], /text\/event-stream/);
      const messageStreamEvents = parseSseEvents(messageStream.body);
      assert.deepEqual(messageStreamEvents.map((item) => item.event), [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
      assert.equal(messageStreamEvents[0].data.message.id, "msg_resp_anthropic_stream");
      assert.equal(messageStreamEvents[2].data.delta.text, "Anthropic ");
      assert.equal(messageStreamEvents[3].data.delta.text, "stream");
      assert.equal(messageStreamEvents[5].data.delta.stop_reason, "end_turn");
      assert.deepEqual(messageStreamEvents[5].data.usage, { output_tokens: 2 });

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.outcome]), [
        ["openai_responses", "success"],
        ["openai_responses_compact", "success"],
        ["openai_chat_completions", "success"],
        ["openai_chat_completions", "success"],
        ["anthropic_messages", "success"],
        ["anthropic_messages", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-native-responses-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 6);
  assert.equal(upstreamCalls[0].url, "https://responses-native.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-native-responses-secret");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-native-responses",
    input: "Use native Responses.",
    stream: false,
  });
  assert.equal(upstreamCalls[1].url, "https://responses-native.example.test/v1/responses/compact");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-native-responses-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "gpt-native-responses",
    input: "Summarize for compaction.",
    stream: false,
  });
  assert.equal(upstreamCalls[2].url, "https://responses-native.example.test/v1/responses");
  assert.equal(upstreamCalls[2].authorization, "Bearer sk-native-responses-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[2].body), {
    model: "gpt-native-responses",
    input: [
      { role: "user", content: [{ type: "input_text", text: "chat please" }] },
      { role: "assistant", content: [{ type: "output_text", text: "I will save a note." }] },
      {
        type: "function_call",
        id: "call_note",
        call_id: "call_note",
        status: "completed",
        name: "save_note",
        arguments: "{\"note\":\"draft\"}",
      },
      {
        type: "function_call_output",
        call_id: "call_note",
        output: "saved",
      },
    ],
    stream: false,
    instructions: "Stay concise.",
    temperature: 0.3,
    max_output_tokens: 128,
    tools: [{
      type: "function",
      name: "save_note",
      description: "Save a note",
      parameters: {
        type: "object",
        properties: { note: { type: "string" } },
        required: ["note"],
      },
    }],
    tool_choice: { type: "function", name: "save_note" },
  });
  assert.equal(upstreamCalls[3].url, "https://responses-native.example.test/v1/responses");
  assert.equal(upstreamCalls[3].authorization, "Bearer sk-native-responses-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[3].body), {
    model: "gpt-native-responses",
    input: [{ role: "user", content: [{ type: "input_text", text: "stream please" }] }],
    stream: true,
  });
  assert.equal(upstreamCalls[4].url, "https://responses-native.example.test/v1/responses");
  assert.equal(upstreamCalls[4].authorization, "Bearer sk-native-responses-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[4].body), {
    model: "gpt-native-responses",
    input: [{ role: "user", content: [{ type: "input_text", text: "anthropic please" }] }],
    stream: false,
    max_output_tokens: 32,
  });
  assert.equal(upstreamCalls[5].url, "https://responses-native.example.test/v1/responses");
  assert.equal(upstreamCalls[5].authorization, "Bearer sk-native-responses-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[5].body), {
    model: "gpt-native-responses",
    input: [{ role: "user", content: [{ type: "input_text", text: "anthropic stream please" }] }],
    stream: true,
    max_output_tokens: 32,
  });
});

test("model gateway protocol matrix forwards native anthropic messages", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "native-anthropic",
      name: "Native Anthropic Provider",
      appScopes: ["claude-code", "codex", "openclaw"],
      baseUrl: "https://anthropic-native.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-native-anthropic-secret",
    },
    setActiveScopes: ["claude-code", "codex", "openclaw"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: `msg_native_${upstreamCalls.length}`,
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: `Native Anthropic ${upstreamCalls.length}` }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "claude-native",
          max_tokens: 64,
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.equal(messages.status, 200);
      assert.equal(messages.body.id, "msg_native_1");
      assert.equal(messages.body.content[0].text, "Native Anthropic 1");
      assert.equal(messages.headers["x-openclaw-model-gateway-provider"], "native-anthropic");

      const claudeMessages = await requestJson(`${baseUrl}/claude/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "claude-native",
          max_tokens: 64,
          messages: [{ role: "user", content: "hello via alias" }],
        },
      });
      assert.equal(claudeMessages.status, 200);
      assert.equal(claudeMessages.body.id, "msg_native_2");
      assert.equal(claudeMessages.body.content[0].text, "Native Anthropic 2");
      assert.equal(claudeMessages.headers["x-openclaw-model-gateway-provider"], "native-anthropic");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.requestedPath, entry.outcome]), [
        ["anthropic_messages", "/v1/messages", "success"],
        ["anthropic_messages", "/claude/v1/messages", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-native-anthropic-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://anthropic-native.example.test/v1/messages");
  assert.equal(upstreamCalls[0].authorization, null);
  assert.equal(upstreamCalls[0].xApiKey, "sk-native-anthropic-secret");
  assert.equal(upstreamCalls[0].anthropicVersion, "2023-06-01");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "claude-native",
    max_tokens: 64,
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal(upstreamCalls[1].url, "https://anthropic-native.example.test/v1/messages");
  assert.equal(upstreamCalls[1].xApiKey, "sk-native-anthropic-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "claude-native",
    max_tokens: 64,
    messages: [{ role: "user", content: "hello via alias" }],
  });
});

test("model gateway adapts anthropic messages through openai chat providers", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-to-chat",
      name: "Anthropic To Chat Provider",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic-chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-anthropic-chat-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    if (upstreamCalls.length === 2) {
      const upstreamSse = [
        "data: {\"id\":\"chatcmpl_anthropic_stream\",\"created\":1710000040,\"model\":\"gpt-chat\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_stream\",\"created\":1710000040,\"model\":\"gpt-chat\",\"choices\":[{\"delta\":{\"content\":\"Claude \"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_stream\",\"created\":1710000040,\"model\":\"gpt-chat\",\"choices\":[{\"delta\":{\"content\":\"stream\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":6,\"completion_tokens\":2,\"total_tokens\":8}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_anthropic_adapter",
      created: 1_710_000_040,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "Chat provider answer.",
          tool_calls: [{
            id: "call_save",
            type: "function",
            function: {
              name: "save_note",
              arguments: "{\"note\":\"ok\"}",
            },
          }],
        },
        finish_reason: "tool_calls",
      }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 5,
        total_tokens: 17,
        prompt_tokens_details: { cached_tokens: 2 },
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-chat",
          system: "Be direct.",
          max_tokens: 128,
          messages: [
            { role: "user", content: [{ type: "text", text: "hello" }] },
            {
              role: "assistant",
              content: [
                { type: "text", text: "I will call." },
                { type: "tool_use", id: "call_lookup", name: "lookup", input: { query: "docs" } },
              ],
            },
            {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: "call_lookup", content: "done" }],
            },
          ],
          tools: [{
            name: "lookup",
            description: "Lookup docs",
            input_schema: { type: "object", properties: { query: { type: "string" } } },
          }],
          tool_choice: { type: "tool", name: "lookup" },
          temperature: 0.1,
          metadata: {
            user_id: "claude-code-session",
          },
        },
      });

      assert.equal(messages.status, 200);
      assert.equal(messages.headers["x-openclaw-model-gateway-provider"], "anthropic-to-chat");
      assert.equal(messages.body.id, "chatcmpl_anthropic_adapter");
      assert.equal(messages.body.type, "message");
      assert.equal(messages.body.role, "assistant");
      assert.deepEqual(messages.body.content, [
        { type: "text", text: "Chat provider answer." },
        { type: "tool_use", id: "call_save", name: "save_note", input: { note: "ok" } },
      ]);
      assert.equal(messages.body.stop_reason, "tool_use");
      assert.deepEqual(messages.body.usage, {
        input_tokens: 12,
        output_tokens: 5,
        cache_read_input_tokens: 2,
      });

      const stream = await requestRaw(`${baseUrl}/claude/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-chat",
          max_tokens: 64,
          stream: true,
          messages: [{ role: "user", content: "stream please" }],
        },
      });
      assert.equal(stream.status, 200);
      assert.match(stream.headers["content-type"], /text\/event-stream/);
      const events = parseSseEvents(stream.body);
      assert.deepEqual(events.map((item) => item.event), [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
      assert.equal(events[0].data.message.id, "msg_chatcmpl_anthropic_stream");
      assert.equal(events[2].data.delta.text, "Claude ");
      assert.equal(events[3].data.delta.text, "stream");
      assert.equal(events[5].data.delta.stop_reason, "end_turn");
      assert.deepEqual(events[5].data.usage, { output_tokens: 2 });

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.requestedPath, entry.outcome]), [
        ["anthropic_messages", "/v1/messages", "success"],
        ["anthropic_messages", "/claude/v1/messages", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-anthropic-chat-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://anthropic-chat.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-anthropic-chat-secret");
  assert.equal(upstreamCalls[0].anthropicVersion, null);
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-chat",
    messages: [
      { role: "system", content: "Be direct." },
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "I will call.",
        tool_calls: [{
          id: "call_lookup",
          type: "function",
          function: {
            name: "lookup",
            arguments: "{\"query\":\"docs\"}",
          },
        }],
      },
      {
        role: "tool",
        tool_call_id: "call_lookup",
        content: "done",
      },
    ],
    stream: false,
    max_tokens: 128,
    temperature: 0.1,
    tools: [{
      type: "function",
      function: {
        name: "lookup",
        description: "Lookup docs",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
    }],
    tool_choice: {
      type: "function",
      function: { name: "lookup" },
    },
  });
  assert.equal(upstreamCalls[1].url, "https://anthropic-chat.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-anthropic-chat-secret");
  assert.equal(upstreamCalls[1].anthropicVersion, null);
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "gpt-chat",
    messages: [{ role: "user", content: "stream please" }],
    stream: true,
    max_tokens: 64,
  });
});

test("model gateway adapts codex responses through native anthropic messages providers", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-to-anthropic",
      name: "Responses To Anthropic Provider",
      appScopes: ["codex"],
      baseUrl: "https://responses-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-responses-anthropic-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    if (upstreamCalls.length === 3) {
      const upstreamSse = [
        "event: message_start",
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_stream_anthropic\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":6,\"output_tokens\":0}}}",
        "",
        "event: content_block_start",
        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
        "",
        "event: content_block_delta",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Anth\"}}",
        "",
        "event: content_block_delta",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"ropic stream\"}}",
        "",
        "event: content_block_stop",
        "data: {\"type\":\"content_block_stop\",\"index\":0}",
        "",
        "event: message_delta",
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":3}}",
        "",
        "event: message_stop",
        "data: {\"type\":\"message_stop\"}",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    const isCompact = upstreamCalls.length === 2;
    return new Response(JSON.stringify({
      id: isCompact ? "msg_compact_anthropic" : "msg_responses_anthropic",
      type: "message",
      role: "assistant",
      model: "claude-native",
      content: isCompact
        ? [{ type: "text", text: "Compact Anthropic summary." }]
        : [
          { type: "text", text: "Anthropic Responses text." },
          { type: "tool_use", id: "call_lookup", name: "lookup", input: { query: "docs" } },
        ],
      stop_reason: isCompact ? "end_turn" : "tool_use",
      usage: {
        input_tokens: isCompact ? 31 : 17,
        output_tokens: isCompact ? 9 : 5,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-native",
          instructions: "Use concise responses.",
          input: [{ role: "user", content: "Plan the task." }],
          tools: [{
            type: "function",
            name: "lookup",
            description: "Look up docs",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          }],
          tool_choice: { type: "function", name: "lookup" },
          max_output_tokens: 256,
          temperature: 0.1,
        },
      });
      assert.equal(responses.status, 200);
      assert.equal(responses.headers["x-openclaw-model-gateway-provider"], "responses-to-anthropic");
      assert.equal(responses.body.id, "msg_responses_anthropic");
      assert.equal(responses.body.object, "response");
      assert.equal(responses.body.output[0].content[0].text, "Anthropic Responses text.");
      assert.deepEqual(responses.body.output[1], {
        type: "function_call",
        id: "call_lookup",
        call_id: "call_lookup",
        status: "completed",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      });
      assert.deepEqual(responses.body.usage, {
        input_tokens: 17,
        output_tokens: 5,
        total_tokens: 22,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      });

      const compact = await requestJson(`${baseUrl}/v1/responses/compact`, {
        method: "POST",
        body: {
          model: "claude-native",
          instructions: "Summarize for handoff.",
          input: "Current work is Model Gateway.",
          max_output_tokens: 512,
        },
      });
      assert.equal(compact.status, 200);
      assert.equal(compact.body.id, "msg_compact_anthropic");
      assert.equal(compact.body.output[0].content[0].text, "Compact Anthropic summary.");

      const streaming = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-native",
          input: "stream please",
          stream: true,
        },
      });
      assert.equal(streaming.status, 200);
      assert.match(streaming.headers["content-type"], /text\/event-stream/);
      const streamEvents = parseSseEvents(streaming.body);
      assert.deepEqual(streamEvents.map((item) => item.event), [
        "response.created",
        "response.in_progress",
        "response.output_item.added",
        "response.content_part.added",
        "response.output_text.delta",
        "response.output_text.delta",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      assert.equal(streamEvents[4].data.delta, "Anth");
      assert.equal(streamEvents[5].data.delta, "ropic stream");
      assert.equal(streamEvents[9].data.response.output[0].content[0].text, "Anthropic stream");
      assert.equal(streamEvents[10].data, "[DONE]");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.requestedPath, entry.outcome]), [
        ["openai_responses", "/v1/responses", "success"],
        ["openai_responses_compact", "/v1/responses/compact", "success"],
        ["openai_responses", "/v1/responses", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-responses-anthropic-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 3);
  assert.equal(upstreamCalls[0].url, "https://responses-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[0].method, "POST");
  assert.equal(upstreamCalls[0].authorization, null);
  assert.equal(upstreamCalls[0].xApiKey, "sk-responses-anthropic-secret");
  assert.equal(upstreamCalls[0].anthropicVersion, "2023-06-01");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "claude-native",
    max_tokens: 256,
    messages: [{ role: "user", content: "Plan the task." }],
    system: "Use concise responses.",
    temperature: 0.1,
    tools: [{
      name: "lookup",
      description: "Look up docs",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    }],
    tool_choice: { type: "tool", name: "lookup" },
  });
  assert.equal(upstreamCalls[1].url, "https://responses-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[1].xApiKey, "sk-responses-anthropic-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "claude-native",
    max_tokens: 512,
    messages: [{ role: "user", content: "Current work is Model Gateway." }],
    system: "Summarize for handoff.",
  });
  assert.equal(upstreamCalls[2].url, "https://responses-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[2].xApiKey, "sk-responses-anthropic-secret");
  assert.equal(upstreamCalls[2].anthropicVersion, "2023-06-01");
  assert.deepEqual(JSON.parse(upstreamCalls[2].body), {
    model: "claude-native",
    max_tokens: 1024,
    messages: [{ role: "user", content: "stream please" }],
    stream: true,
  });
});

test("model gateway adapts chat completions through native anthropic messages providers", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-to-anthropic",
      name: "Chat To Anthropic Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://chat-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-chat-anthropic-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    if (upstreamCalls.length === 2) {
      const upstreamSse = [
        "event: message_start",
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_chat_stream\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":8,\"output_tokens\":0}}}",
        "",
        "event: content_block_start",
        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
        "",
        "event: content_block_delta",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Chat \"}}",
        "",
        "event: content_block_delta",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"stream\"}}",
        "",
        "event: content_block_stop",
        "data: {\"type\":\"content_block_stop\",\"index\":0}",
        "",
        "event: message_delta",
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":3}}",
        "",
        "event: message_stop",
        "data: {\"type\":\"message_stop\"}",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response(JSON.stringify({
      id: "msg_chat_adapter",
      type: "message",
      role: "assistant",
      model: "claude-native",
      content: [
        { type: "text", text: "Sunny in Tokyo." },
        { type: "tool_use", id: "call_save", name: "save_weather", input: { city: "Tokyo" } },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 11,
        output_tokens: 7,
        cache_read_input_tokens: 3,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          messages: [
            { role: "system", content: "Use metric units." },
            { role: "user", content: "Weather?" },
            {
              role: "assistant",
              content: "I will check.",
              tool_calls: [{
                id: "call_weather",
                type: "function",
                function: {
                  name: "get_weather",
                  arguments: "{\"city\":\"Tokyo\"}",
                },
              }],
            },
            {
              role: "tool",
              tool_call_id: "call_weather",
              content: "Sunny",
            },
          ],
          tools: [{
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather info",
              parameters: {
                type: "object",
                properties: { city: { type: "string" } },
                required: ["city"],
              },
            },
          }],
          tool_choice: { type: "function", function: { name: "get_weather" } },
          max_tokens: 128,
          temperature: 0.2,
          top_p: 0.9,
          stop: ["END"],
        },
      });

      assert.equal(chat.status, 200);
      assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "chat-to-anthropic");
      assert.equal(chat.body.id, "msg_chat_adapter");
      assert.equal(chat.body.object, "chat.completion");
      assert.equal(chat.body.model, "claude-native");
      assert.equal(chat.body.choices[0].finish_reason, "tool_calls");
      assert.deepEqual(chat.body.choices[0].message, {
        role: "assistant",
        content: "Sunny in Tokyo.",
        tool_calls: [{
          id: "call_save",
          type: "function",
          function: {
            name: "save_weather",
            arguments: "{\"city\":\"Tokyo\"}",
          },
        }],
      });
      assert.deepEqual(chat.body.usage, {
        prompt_tokens: 11,
        completion_tokens: 7,
        total_tokens: 18,
        prompt_tokens_details: { cached_tokens: 3 },
      });

      const stream = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          stream: true,
          messages: [{ role: "user", content: "stream please" }],
        },
      });
      assert.equal(stream.status, 200);
      assert.match(stream.headers["content-type"], /text\/event-stream/);
      const streamEvents = parseSseEvents(stream.body);
      assert.equal(streamEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(streamEvents[1].data.choices[0].delta.content, "Chat ");
      assert.equal(streamEvents[2].data.choices[0].delta.content, "stream");
      assert.equal(streamEvents[3].data.choices[0].finish_reason, "stop");
      assert.deepEqual(streamEvents[3].data.usage, {
        prompt_tokens: 8,
        completion_tokens: 3,
        total_tokens: 11,
      });
      assert.equal(streamEvents[4].data, "[DONE]");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.requestedPath, entry.outcome]), [
        ["openai_chat_completions", "/v1/chat/completions", "success"],
        ["openai_chat_completions", "/v1/chat/completions", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-chat-anthropic-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://chat-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[0].method, "POST");
  assert.equal(upstreamCalls[0].authorization, null);
  assert.equal(upstreamCalls[0].xApiKey, "sk-chat-anthropic-secret");
  assert.equal(upstreamCalls[0].anthropicVersion, "2023-06-01");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "claude-native",
    max_tokens: 128,
    messages: [
      { role: "user", content: "Weather?" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I will check." },
          { type: "tool_use", id: "call_weather", name: "get_weather", input: { city: "Tokyo" } },
        ],
      },
      {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "call_weather", content: "Sunny" }],
      },
    ],
    system: "Use metric units.",
    temperature: 0.2,
    top_p: 0.9,
    stop_sequences: ["END"],
    tools: [{
      name: "get_weather",
      description: "Get weather info",
      input_schema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    }],
    tool_choice: { type: "tool", name: "get_weather" },
  });
  assert.equal(upstreamCalls[1].url, "https://chat-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[1].method, "POST");
  assert.equal(upstreamCalls[1].xApiKey, "sk-chat-anthropic-secret");
  assert.equal(upstreamCalls[1].anthropicVersion, "2023-06-01");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "claude-native",
    max_tokens: 1024,
    messages: [{ role: "user", content: "stream please" }],
    stream: true,
  });
});

test("model gateway adapts non-streaming codex responses requests to openai chat providers", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-chat-adapter",
      name: "Codex Chat Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-adapter-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = String(init.body || "");
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body,
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_codex_adapter",
      created: 1_710_000_000,
      model: "gpt-test",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "Adapted answer.",
        },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          instructions: "You are concise.",
          input: [
            { type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] },
            { type: "message", role: "assistant", content: [{ type: "output_text", text: "Earlier" }] },
            { role: "user", content: "Next" },
          ],
          tools: [{
            type: "function",
            name: "lookup",
            description: "Lookup records.",
            parameters: {
              type: "object",
              properties: { query: { type: "string" } },
              required: ["query"],
            },
          }],
          tool_choice: { type: "function", name: "lookup" },
          stream: false,
          max_output_tokens: 64,
        },
      });

      assert.equal(responses.status, 200);
      assert.equal(responses.headers["x-openclaw-model-gateway-provider"], "codex-chat-adapter");
      assert.equal(responses.body.id, "chatcmpl_codex_adapter");
      assert.equal(responses.body.object, "response");
      assert.equal(responses.body.created_at, 1_710_000_000);
      assert.equal(responses.body.model, "gpt-test");
      assert.equal(responses.body.status, "completed");
      assert.equal(responses.body.output[0].type, "message");
      assert.equal(responses.body.output[0].role, "assistant");
      assert.deepEqual(responses.body.output[0].content, [{ type: "output_text", text: "Adapted answer." }]);
      assert.deepEqual(responses.body.usage, {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      });

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog.length, 1);
      assert.equal(runtime.body.runtime.requestLog[0].kind, "gateway-request");
      assert.equal(runtime.body.runtime.requestLog[0].routeId, "openai_responses");
      assert.equal(runtime.body.runtime.requestLog[0].requestedPath, "/v1/responses");
      assert.equal(runtime.body.runtime.requestLog[0].upstreamUrl, "https://codex-chat.example.test/v1/chat/completions");
      assert.equal(runtime.body.runtime.requestLog[0].model, "gpt-test");
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "success");
      assert.deepEqual(runtime.body.runtime.requestLog[0].usage, {
        inputTokens: 10,
        outputTokens: 4,
        totalTokens: 14,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      assert.ok(!JSON.stringify(runtime.body).includes("sk-codex-adapter-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://codex-chat.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].method, "POST");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-codex-adapter-secret");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-test",
    messages: [
      { role: "system", content: "You are concise." },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Earlier" },
      { role: "user", content: "Next" },
    ],
    stream: false,
    max_tokens: 64,
    tools: [{
      type: "function",
      function: {
        name: "lookup",
        description: "Lookup records.",
        parameters: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      },
    }],
    tool_choice: {
      type: "function",
      function: { name: "lookup" },
    },
  });
});

test("model gateway maps codex reasoning options to openai chat provider parameters", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-deepseek-reasoning",
      name: "Codex DeepSeek Reasoning",
      appScopes: ["codex"],
      baseUrl: "https://deepseek-reasoning.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      reasoning: {
        supportsThinking: true,
        supportsEffort: true,
        thinkingParam: "thinking",
        effortParam: "reasoning_effort",
        effortValueMode: "deepseek",
      },
    },
    secret: {
      apiKey: "sk-deepseek-reasoning-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: `chatcmpl_reasoning_${upstreamCalls.length}`,
      created: 1_710_000_031,
      model: "reasoning-model",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "ok",
        },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const topLevel = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "deepseek-reasoner",
          input: "Think.",
          reasoning: { effort: "xhigh" },
          stream: false,
        },
      });
      assert.equal(topLevel.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "codex-openrouter-reasoning",
          name: "Codex OpenRouter Reasoning",
          appScopes: ["codex"],
          baseUrl: "https://openrouter-reasoning.example.test/v1",
          apiFormat: "openai_chat",
          authStrategy: "bearer",
          reasoning: {
            supportsEffort: true,
            thinkingParam: "none",
            effortParam: "reasoning.effort",
            effortValueMode: "openrouter",
          },
        },
        secret: {
          apiKey: "sk-openrouter-reasoning-secret",
        },
        setActiveScopes: ["codex"],
      });

      const nested = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "router-reasoner",
          input: "Think.",
          reasoning: { effort: "max" },
          stream: false,
        },
      });
      assert.equal(nested.status, 200);

      const explicitOff = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "router-reasoner",
          input: "Do not think.",
          reasoning: { effort: "none" },
          stream: false,
        },
      });
      assert.equal(explicitOff.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 3);
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "deepseek-reasoner",
    messages: [{ role: "user", content: "Think." }],
    stream: false,
    thinking: { type: "enabled" },
    reasoning_effort: "max",
  });
  assert.equal(upstreamCalls[0].url, "https://deepseek-reasoning.example.test/v1/chat/completions");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "router-reasoner",
    messages: [{ role: "user", content: "Think." }],
    stream: false,
    reasoning: { effort: "xhigh" },
  });
  assert.equal(upstreamCalls[1].url, "https://openrouter-reasoning.example.test/v1/chat/completions");
  assert.deepEqual(JSON.parse(upstreamCalls[2].body), {
    model: "router-reasoner",
    messages: [{ role: "user", content: "Do not think." }],
    stream: false,
    reasoning: { effort: "none" },
  });
});

test("model gateway maps chat reasoning content to codex responses output items", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-reasoning-adapter",
      name: "Codex Reasoning Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-reasoning.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-reasoning-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "chatcmpl_reasoning",
    created: 1_710_000_021,
    model: "deepseek-reasoner",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        reasoning_content: "Need context before answering.",
        content: "Done.",
        tool_calls: [{
          id: "call_lookup",
          type: "function",
          function: {
            name: "lookup",
            arguments: "{\"query\":\"docs\"}",
          },
        }],
      },
      finish_reason: "tool_calls",
    }],
    usage: {
      prompt_tokens: 9,
      completion_tokens: 6,
      total_tokens: 15,
      completion_tokens_details: { reasoning_tokens: 4 },
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "deepseek-reasoner",
          input: "Think then call.",
          stream: false,
        },
      });

      assert.equal(responses.status, 200);
      assert.equal(responses.body.output[0].type, "reasoning");
      assert.match(responses.body.output[0].id, /^reasoning_/);
      assert.equal(responses.body.output[0].status, "completed");
      assert.deepEqual(responses.body.output[0].summary, [{ type: "summary_text", text: "Need context before answering." }]);
      assert.equal(responses.body.output[1].type, "message");
      assert.match(responses.body.output[1].id, /^msg_/);
      assert.equal(responses.body.output[1].status, "completed");
      assert.equal(responses.body.output[1].role, "assistant");
      assert.deepEqual(responses.body.output[1].content, [{ type: "output_text", text: "Done." }]);
      assert.deepEqual(responses.body.output[2], {
        type: "function_call",
        id: "call_lookup",
        call_id: "call_lookup",
        status: "completed",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
        reasoning_content: "Need context before answering.",
      });
      assert.deepEqual(responses.body.usage.output_tokens_details, { reasoning_tokens: 4 });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway adapts streaming chat sse to codex responses sse", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-stream-adapter",
      name: "Codex Stream Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-stream-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_stream\",\"created\":1710000020,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_stream\",\"created\":1710000020,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_stream\",\"created\":1710000020,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"content\":\"lo\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":7,\"completion_tokens\":2,\"total_tokens\":9}}",
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const streamed = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "Say hello.",
          stream: true,
        },
      });

      assert.equal(streamed.status, 200);
      assert.equal(streamed.headers["x-openclaw-model-gateway-provider"], "codex-stream-adapter");
      assert.match(streamed.headers["content-type"], /text\/event-stream/);
      const events = parseSseEvents(streamed.body);
      assert.deepEqual(events.map((item) => item.event), [
        "response.created",
        "response.in_progress",
        "response.output_item.added",
        "response.content_part.added",
        "response.output_text.delta",
        "response.output_text.delta",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      assert.equal(events[0].data.response.id, "chatcmpl_stream");
      assert.equal(events[4].data.delta, "Hel");
      assert.equal(events[5].data.delta, "lo");
      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.equal(completed.status, "completed");
      assert.equal(completed.output[0].content[0].text, "Hello");
      assert.deepEqual(completed.usage, {
        input_tokens: 7,
        output_tokens: 2,
        total_tokens: 9,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      });
      assert.equal(events[10].data, "[DONE]");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog.length, 1);
      assert.equal(runtime.body.runtime.requestLog[0].routeId, "openai_responses");
      assert.equal(runtime.body.runtime.requestLog[0].model, "gpt-test");
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "success");
      assert.deepEqual(runtime.body.runtime.requestLog[0].usage, {
        inputTokens: 7,
        outputTokens: 2,
        totalTokens: 9,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
      });
      assert.ok(!JSON.stringify(runtime.body).includes("sk-codex-stream-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://codex-stream.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].method, "POST");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-codex-stream-secret");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-test",
    messages: [{ role: "user", content: "Say hello." }],
    stream: true,
    stream_options: { include_usage: true },
  });
});

test("model gateway adapts streaming chat reasoning to codex responses sse", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-reasoning-stream-adapter",
      name: "Codex Reasoning Stream Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-reasoning-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-reasoning-stream-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_reason_stream\",\"created\":1710000023,\"model\":\"deepseek-reasoner\",\"choices\":[{\"delta\":{\"reasoning_content\":\"Need context. \"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_reason_stream\",\"created\":1710000023,\"model\":\"deepseek-reasoner\",\"choices\":[{\"delta\":{\"reasoning\":\"Now answer. \"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_reason_stream\",\"created\":1710000023,\"model\":\"deepseek-reasoner\",\"choices\":[{\"delta\":{\"content\":\"Done\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":6,\"total_tokens\":10,\"completion_tokens_details\":{\"reasoning_tokens\":3}}}",
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const streamed = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "deepseek-reasoner",
          input: "Reason then answer.",
          stream: true,
        },
      });

      assert.equal(streamed.status, 200);
      const events = parseSseEvents(streamed.body);
      assert.deepEqual(events.map((item) => item.event), [
        "response.created",
        "response.in_progress",
        "response.output_item.added",
        "response.reasoning_summary_part.added",
        "response.reasoning_summary_text.delta",
        "response.reasoning_summary_text.delta",
        "response.output_item.added",
        "response.content_part.added",
        "response.output_text.delta",
        "response.reasoning_summary_text.done",
        "response.reasoning_summary_part.done",
        "response.output_item.done",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      assert.equal(events[4].data.delta, "Need context. ");
      assert.equal(events[5].data.delta, "Now answer. ");
      assert.equal(events[11].data.item.type, "reasoning");
      assert.equal(events[11].data.item.summary[0].text, "Need context. Now answer. ");
      assert.equal(events[14].data.item.type, "message");
      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.equal(completed.output[0].type, "reasoning");
      assert.equal(completed.output[1].type, "message");
      assert.equal(completed.output[1].content[0].text, "Done");
      assert.deepEqual(completed.usage.output_tokens_details, { reasoning_tokens: 3 });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway adapts streaming chat tool calls to codex responses sse", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-tool-stream-adapter",
      name: "Codex Tool Stream Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-tool-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-tool-stream-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_tool_stream\",\"created\":1710000022,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_tool_stream\",\"created\":1710000022,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_lookup\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"query\\\":\"}}]}}]}",
      "",
      "data: {\"id\":\"chatcmpl_tool_stream\",\"created\":1710000022,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"docs\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":8,\"completion_tokens\":3,\"total_tokens\":11,\"prompt_tokens_details\":{\"cached_tokens\":2}}}",
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const streamed = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "Use a tool.",
          stream: true,
        },
      });

      assert.equal(streamed.status, 200);
      assert.match(streamed.headers["content-type"], /text\/event-stream/);
      const events = parseSseEvents(streamed.body);
      assert.deepEqual(events.map((item) => item.event), [
        "response.created",
        "response.in_progress",
        "response.output_item.added",
        "response.function_call_arguments.delta",
        "response.function_call_arguments.delta",
        "response.function_call_arguments.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      assert.equal(events[2].data.item.type, "function_call");
      assert.equal(events[2].data.item.call_id, "call_lookup");
      assert.equal(events[2].data.item.name, "lookup");
      assert.equal(events[3].data.delta, "{\"query\":");
      assert.equal(events[4].data.delta, "\"docs\"}");
      assert.equal(events[5].data.arguments, "{\"query\":\"docs\"}");
      assert.deepEqual(events[6].data.item, {
        id: "fc_call_lookup",
        type: "function_call",
        status: "completed",
        call_id: "call_lookup",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      });
      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.equal(completed.status, "completed");
      assert.deepEqual(completed.output, [{
        id: "fc_call_lookup",
        type: "function_call",
        status: "completed",
        call_id: "call_lookup",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      }]);
      assert.deepEqual(completed.usage, {
        input_tokens: 8,
        output_tokens: 3,
        total_tokens: 11,
        input_tokens_details: { cached_tokens: 2 },
        output_tokens_details: { reasoning_tokens: 0 },
      });
      assert.equal(events[8].data, "[DONE]");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://codex-tool-stream.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-codex-tool-stream-secret");
});

test("model gateway preserves parallel streaming chat tool calls by index", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-parallel-tool-stream-adapter",
      name: "Codex Parallel Tool Stream Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-parallel-tool-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-parallel-tool-stream-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_parallel_tools\",\"created\":1710000033,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_lookup_a\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"query\\\":\"}},{\"index\":1,\"id\":\"call_lookup_b\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"query\\\":\"}}]}}]}",
      "",
      "data: {\"id\":\"chatcmpl_parallel_tools\",\"created\":1710000033,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"alpha\\\"}\"}},{\"index\":1,\"function\":{\"arguments\":\"\\\"beta\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":6,\"total_tokens\":16}}",
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const streamed = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "Use two tools.",
          stream: true,
        },
      });

      assert.equal(streamed.status, 200);
      const events = parseSseEvents(streamed.body);
      const addedCalls = events
        .filter((item) => item.event === "response.output_item.added" && item.data.item.type === "function_call")
        .map((item) => item.data.item);
      assert.deepEqual(addedCalls.map((item) => item.call_id), ["call_lookup_a", "call_lookup_b"]);
      assert.deepEqual(addedCalls.map((item) => item.name), ["lookup", "lookup"]);

      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.deepEqual(completed.output, [
        {
          id: "fc_call_lookup_a",
          type: "function_call",
          status: "completed",
          call_id: "call_lookup_a",
          name: "lookup",
          arguments: "{\"query\":\"alpha\"}",
        },
        {
          id: "fc_call_lookup_b",
          type: "function_call",
          status: "completed",
          call_id: "call_lookup_b",
          name: "lookup",
          arguments: "{\"query\":\"beta\"}",
        },
      ]);
      assert.deepEqual(completed.usage, {
        input_tokens: 10,
        output_tokens: 6,
        total_tokens: 16,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway maps streaming chat sse errors to codex response failed events", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-stream-error-adapter",
      name: "Codex Stream Error Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-stream-error.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-stream-error-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  let callCount = 0;
  globalThis.fetch = async () => {
    callCount += 1;
    const upstreamSse = callCount === 1
      ? [
        "event: error",
        "data: {\"error\":{\"message\":\"bad request\",\"type\":\"invalid_request_error\"}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n")
      : [
        "data: {\"error\":{\"message\":\"quota exceeded\",\"code\":\"rate_limit_exceeded\"}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      for (const expected of [
        { message: "bad request", type: "invalid_request_error" },
        { message: "quota exceeded", type: "rate_limit_exceeded" },
      ]) {
        const streamed = await requestRaw(`${baseUrl}/v1/responses`, {
          method: "POST",
          body: {
            model: "gpt-test",
            input: "Trigger stream error.",
            stream: true,
          },
        });

        assert.equal(streamed.status, 200);
        const events = parseSseEvents(streamed.body);
        assert.ok(events.some((item) => item.event === "response.failed"));
        assert.ok(!events.some((item) => item.event === "response.completed"));
        assert.equal(events.at(-1).data, "[DONE]");
        const failed = events.find((item) => item.event === "response.failed").data.response;
        assert.equal(failed.status, "failed");
        assert.equal(failed.error.message, expected.message);
        assert.equal(failed.error.type, expected.type);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway records streamed codex tool-call history for follow-up chat adapter requests", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-stream-history-adapter",
      name: "Codex Stream History Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-stream-history.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-stream-history-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const callIndex = upstreamCalls.length;
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });

    if (callIndex === 0) {
      const upstreamSse = [
        "data: {\"id\":\"chatcmpl_stream_history\",\"created\":1710000024,\"model\":\"deepseek-reasoner\",\"choices\":[{\"delta\":{\"reasoning_content\":\"Need lookup.\"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_stream_history\",\"created\":1710000024,\"model\":\"deepseek-reasoner\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_lookup\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"{\\\"query\\\":\\\"docs\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}",
        "",
        "data: [DONE]",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    return new Response(JSON.stringify({
      id: "chatcmpl_stream_history_final",
      created: 1_710_000_025,
      model: "deepseek-reasoner",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "Lookup complete.",
        },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const first = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "deepseek-reasoner",
          input: "Use lookup.",
          stream: true,
        },
      });
      assert.equal(first.status, 200);
      const firstEvents = parseSseEvents(first.body);
      const firstCompleted = firstEvents.find((item) => item.event === "response.completed").data.response;
      assert.equal(firstCompleted.id, "chatcmpl_stream_history");
      assert.equal(firstCompleted.output[1].reasoning_content, "Need lookup.");
      assert.ok(fs.existsSync(paths.codexHistory));
      assert.ok(!fs.readFileSync(paths.codexHistory, "utf8").includes("sk-codex-stream-history-secret"));

      const second = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "deepseek-reasoner",
          previous_response_id: firstCompleted.id,
          input: [
            {
              type: "function_call_output",
              call_id: "call_lookup",
              output: "Docs",
            },
            {
              role: "user",
              content: "Summarize.",
            },
          ],
          stream: false,
        },
      });
      assert.equal(second.status, 200);
      assert.equal(second.body.output[0].content[0].text, "Lookup complete.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  const secondChatBody = JSON.parse(upstreamCalls[1].body);
  assert.deepEqual(secondChatBody.messages, [
    {
      role: "user",
      content: "Use lookup.",
    },
    {
      role: "assistant",
      content: null,
      reasoning_content: "Need lookup.",
      tool_calls: [{
        id: "call_lookup",
        type: "function",
        function: {
          name: "lookup",
          arguments: "{\"query\":\"docs\"}",
        },
      }],
    },
    {
      role: "tool",
      content: "Docs",
      tool_call_id: "call_lookup",
    },
    {
      role: "user",
      content: "Summarize.",
    },
  ]);
});

test("model gateway adapts inline codex tool-result history with cc-switch-compatible chat shape", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-inline-tool-history-adapter",
      name: "Codex Inline Tool History Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-inline-tool-history.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-inline-tool-history-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_inline_tool_history",
      created: 1_710_000_026,
      model: "glm-5",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "ok",
        },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 1,
        total_tokens: 11,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "glm-5",
          input: [
            {
              type: "message",
              role: "developer",
              content: [{ type: "input_text", text: "dev instructions" }],
            },
            {
              role: "user",
              content: [{ type: "input_text", text: "use a tool" }],
            },
            {
              type: "function_call",
              call_id: "call_inline",
              name: "exec_command",
              arguments: "{ \"cmd\": \"cat probe.txt\", \"cwd\": \"/tmp\" }",
            },
            {
              type: "function_call_output",
              call_id: "call_inline",
              output: "{ \"ok\": true, \"value\": 1 }",
            },
          ],
          tools: [{
            type: "function",
            name: "exec_command",
            parameters: {
              type: "object",
              properties: {
                cmd: { type: "string" },
                cwd: { type: "string" },
              },
              required: ["cmd"],
            },
          }],
          tool_choice: "auto",
          parallel_tool_calls: false,
          stream: false,
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.output[0].content[0].text, "ok");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  const chatBody = JSON.parse(upstreamCalls[0].body);
  assert.deepEqual(chatBody.messages, [
    {
      role: "system",
      content: "dev instructions",
    },
    {
      role: "user",
      content: "use a tool",
    },
    {
      role: "assistant",
      content: null,
      reasoning_content: "tool call",
      tool_calls: [{
        id: "call_inline",
        type: "function",
        function: {
          name: "exec_command",
          arguments: "{\"cmd\":\"cat probe.txt\",\"cwd\":\"/tmp\"}",
        },
      }],
    },
    {
      role: "tool",
      content: "{\"ok\":true,\"value\":1}",
      tool_call_id: "call_inline",
    },
  ]);
});

test("model gateway records streamed codex tool-call history for follow-up anthropic adapter requests", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-stream-anthropic-history-adapter",
      name: "Codex Stream Anthropic History Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-stream-anthropic-history.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-codex-stream-anthropic-history-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const callIndex = upstreamCalls.length;
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body: String(init.body || ""),
    });

    if (callIndex === 0) {
      const upstreamSse = [
        "event: message_start",
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_stream_anthropic_history\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":7,\"output_tokens\":0}}}",
        "",
        "event: content_block_start",
        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_lookup\",\"name\":\"lookup\",\"input\":{}}}",
        "",
        "event: content_block_delta",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"query\\\":\"}}",
        "",
        "event: content_block_delta",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"docs\\\"}\"}}",
        "",
        "event: content_block_stop",
        "data: {\"type\":\"content_block_stop\",\"index\":0}",
        "",
        "event: message_delta",
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":3}}",
        "",
        "event: message_stop",
        "data: {\"type\":\"message_stop\"}",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    return new Response(JSON.stringify({
      id: "msg_stream_anthropic_history_final",
      type: "message",
      role: "assistant",
      model: "claude-native",
      content: [{ type: "text", text: "Lookup complete." }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 12,
        output_tokens: 4,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const first = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-native",
          input: "Use lookup.",
          tools: [{
            type: "function",
            name: "lookup",
            parameters: { type: "object" },
          }],
          tool_choice: { type: "function", name: "lookup" },
          stream: true,
        },
      });
      assert.equal(first.status, 200);
      const firstEvents = parseSseEvents(first.body);
      assert.deepEqual(firstEvents.map((item) => item.event), [
        "response.created",
        "response.in_progress",
        "response.output_item.added",
        "response.function_call_arguments.delta",
        "response.function_call_arguments.delta",
        "response.function_call_arguments.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      const firstCompleted = firstEvents.find((item) => item.event === "response.completed").data.response;
      assert.equal(firstCompleted.id, "msg_stream_anthropic_history");
      assert.deepEqual(firstCompleted.output, [{
        id: "fc_call_lookup",
        type: "function_call",
        status: "completed",
        call_id: "call_lookup",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      }]);
      assert.ok(fs.existsSync(paths.codexHistory));
      assert.ok(!fs.readFileSync(paths.codexHistory, "utf8").includes("sk-codex-stream-anthropic-history-secret"));

      const second = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-native",
          previous_response_id: firstCompleted.id,
          input: [
            {
              type: "function_call_output",
              call_id: "call_lookup",
              output: "Docs",
            },
            {
              role: "user",
              content: "Summarize.",
            },
          ],
          stream: false,
        },
      });
      assert.equal(second.status, 200);
      assert.equal(second.body.output[0].content[0].text, "Lookup complete.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://codex-stream-anthropic-history.example.test/v1/messages");
  assert.equal(upstreamCalls[0].xApiKey, "sk-codex-stream-anthropic-history-secret");
  assert.equal(upstreamCalls[1].url, "https://codex-stream-anthropic-history.example.test/v1/messages");
  const secondAnthropicBody = JSON.parse(upstreamCalls[1].body);
  assert.deepEqual(secondAnthropicBody.messages, [
    {
      role: "user",
      content: "Use lookup.",
    },
    {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "call_lookup",
        name: "lookup",
        input: { query: "docs" },
      }],
    },
    {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "call_lookup",
        content: "Docs",
      }],
    },
    {
      role: "user",
      content: "Summarize.",
    },
  ]);
});

test("model gateway adapts streaming responses tool calls to chat and anthropic sse", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-tool-stream-adapter",
      name: "Responses Tool Stream Adapter",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-tool-stream.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-tool-stream-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    const responseId = upstreamCalls.length === 1 ? "resp_tool_chat" : "resp_tool_anthropic";
    const upstreamSse = [
      "event: response.created",
      `data: {"type":"response.created","response":{"id":"${responseId}","object":"response","status":"in_progress","model":"gpt-responses","output":[],"usage":{"input_tokens":6,"output_tokens":0}}}`,
      "",
      "event: response.output_item.added",
      "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"fc_call_lookup\",\"type\":\"function_call\",\"status\":\"in_progress\",\"call_id\":\"call_lookup\",\"name\":\"lookup\",\"arguments\":\"\"}}",
      "",
      "event: response.function_call_arguments.delta",
      "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_call_lookup\",\"output_index\":0,\"delta\":\"{\\\"query\\\":\"}",
      "",
      "event: response.function_call_arguments.delta",
      "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_call_lookup\",\"output_index\":0,\"delta\":\"\\\"docs\\\"}\"}",
      "",
      "event: response.function_call_arguments.done",
      "data: {\"type\":\"response.function_call_arguments.done\",\"item_id\":\"fc_call_lookup\",\"output_index\":0,\"arguments\":\"{\\\"query\\\":\\\"docs\\\"}\"}",
      "",
      "event: response.output_item.done",
      "data: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"id\":\"fc_call_lookup\",\"type\":\"function_call\",\"status\":\"completed\",\"call_id\":\"call_lookup\",\"name\":\"lookup\",\"arguments\":\"{\\\"query\\\":\\\"docs\\\"}\"}}",
      "",
      "event: response.completed",
      `data: {"type":"response.completed","response":{"id":"${responseId}","object":"response","status":"completed","model":"gpt-responses","output":[{"id":"fc_call_lookup","type":"function_call","status":"completed","call_id":"call_lookup","name":"lookup","arguments":"{\\\"query\\\":\\\"docs\\\"}"}],"usage":{"input_tokens":6,"output_tokens":2,"total_tokens":8,"input_tokens_details":{"cached_tokens":1}}}}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-responses",
          stream: true,
          messages: [{ role: "user", content: "tool please" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.deepEqual(chatEvents[1].data.choices[0].delta.tool_calls, [{
        index: 0,
        id: "call_lookup",
        type: "function",
        function: { name: "lookup", arguments: "" },
      }]);
      assert.deepEqual(chatEvents[2].data.choices[0].delta.tool_calls, [{
        index: 0,
        function: { arguments: "{\"query\":" },
      }]);
      assert.deepEqual(chatEvents[3].data.choices[0].delta.tool_calls, [{
        index: 0,
        function: { arguments: "\"docs\"}" },
      }]);
      assert.equal(chatEvents[4].data.choices[0].finish_reason, "tool_calls");
      assert.deepEqual(chatEvents[4].data.usage, {
        prompt_tokens: 6,
        completion_tokens: 2,
        total_tokens: 8,
      });
      assert.equal(chatEvents[5].data, "[DONE]");

      const anthropic = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-responses",
          max_tokens: 64,
          stream: true,
          messages: [{ role: "user", content: "tool please" }],
        },
      });
      assert.equal(anthropic.status, 200);
      const anthropicEvents = parseSseEvents(anthropic.body);
      assert.deepEqual(anthropicEvents.map((item) => item.event), [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
      assert.deepEqual(anthropicEvents[1].data.content_block, {
        type: "tool_use",
        id: "call_lookup",
        name: "lookup",
        input: {},
      });
      assert.equal(anthropicEvents[2].data.delta.partial_json, "{\"query\":");
      assert.equal(anthropicEvents[3].data.delta.partial_json, "\"docs\"}");
      assert.equal(anthropicEvents[5].data.delta.stop_reason, "tool_use");
      assert.deepEqual(anthropicEvents[5].data.usage, { output_tokens: 2 });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-tool-stream.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-tool-stream-secret");
  assert.equal(upstreamCalls[1].url, "https://responses-tool-stream.example.test/v1/responses");
});

test("model gateway returns adapter error when upstream responses stream fails", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-failed-stream-adapter",
      name: "Responses Failed Stream Adapter",
      appScopes: ["openclaw"],
      baseUrl: "https://responses-failed-stream.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-failed-stream-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const upstreamSse = [
      "event: response.failed",
      "data: {\"type\":\"response.failed\",\"response\":{\"id\":\"resp_failed\",\"error\":{\"message\":\"quota exceeded\",\"type\":\"rate_limit_error\",\"code\":\"rate_limit\"}}}",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-responses",
          stream: true,
          messages: [{ role: "user", content: "fail please" }],
        },
      });

      assert.equal(chat.status, 502);
      assert.equal(chat.body.error.code, "model_gateway_chat_responses_streaming_adapter_failed");
      assert.equal(chat.body.error.message, "quota exceeded");
      assert.equal(chat.body.error.decision.provider.id, "responses-failed-stream-adapter");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway maps started responses stream failures to chat and anthropic error events", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-started-failed-stream-adapter",
      name: "Responses Started Failed Stream Adapter",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-started-failed-stream.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-started-failed-stream-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });
    const upstreamSse = [
      "event: response.created",
      "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_started_failed\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-responses\",\"output\":[],\"usage\":null}}",
      "",
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}",
      "",
      "event: response.failed",
      "data: {\"type\":\"response.failed\",\"response\":{\"id\":\"resp_started_failed\",\"error\":{\"message\":\"quota exceeded\",\"type\":\"rate_limit_error\",\"code\":\"rate_limit\"}}}",
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-responses",
          stream: true,
          messages: [{ role: "user", content: "fail after start" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(chatEvents[1].data.choices[0].delta.content, "partial");
      const chatError = chatEvents.find((item) => item.event === "error");
      assert.ok(chatError);
      assert.deepEqual(chatError.data.error, {
        message: "quota exceeded",
        type: "rate_limit_error",
        code: "rate_limit",
      });
      assert.equal(chatEvents.at(-1).data, "[DONE]");
      assert.ok(!chatEvents.some((item) => item.data?.choices?.[0]?.finish_reason === "stop"));

      const anthropic = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-responses",
          max_tokens: 64,
          stream: true,
          messages: [{ role: "user", content: "fail after start" }],
        },
      });
      assert.equal(anthropic.status, 200);
      const anthropicEvents = parseSseEvents(anthropic.body);
      assert.equal(anthropicEvents[0].event, "message_start");
      assert.equal(anthropicEvents[2].data.delta.text, "partial");
      const anthropicError = anthropicEvents.find((item) => item.event === "error");
      assert.ok(anthropicError);
      assert.deepEqual(anthropicError.data.error, {
        type: "rate_limit_error",
        message: "quota exceeded",
        code: "rate_limit",
      });
      assert.ok(!anthropicEvents.some((item) => item.event === "message_stop"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-started-failed-stream.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-started-failed-stream-secret");
  assert.equal(upstreamCalls[1].url, "https://responses-started-failed-stream.example.test/v1/responses");
});

test("model gateway maps started anthropic stream errors to chat and responses error events", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-started-error-stream-adapter",
      name: "Anthropic Started Error Stream Adapter",
      appScopes: ["openclaw", "codex"],
      baseUrl: "https://anthropic-started-error-stream.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-anthropic-started-error-stream-secret",
    },
    setActiveScopes: ["openclaw", "codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body: String(init.body || ""),
    });
    const upstreamSse = [
      "event: message_start",
      "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_started_error\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":5,\"output_tokens\":0}}}",
      "",
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"partial\"}}",
      "",
      "event: error",
      "data: {\"type\":\"error\",\"error\":{\"type\":\"rate_limit_error\",\"message\":\"anthropic quota exceeded\"}}",
      "",
    ].join("\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          stream: true,
          messages: [{ role: "user", content: "fail after start" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(chatEvents[1].data.choices[0].delta.content, "partial");
      const chatError = chatEvents.find((item) => item.event === "error");
      assert.ok(chatError);
      assert.deepEqual(chatError.data.error, {
        message: "anthropic quota exceeded",
        type: "rate_limit_error",
      });
      assert.equal(chatEvents.at(-1).data, "[DONE]");

      const responses = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-native",
          input: "fail after start",
          stream: true,
        },
      });
      assert.equal(responses.status, 200);
      const responseEvents = parseSseEvents(responses.body);
      assert.ok(responseEvents.some((item) => item.event === "response.created"));
      assert.equal(responseEvents.find((item) => item.event === "response.output_text.delta").data.delta, "partial");
      const failed = responseEvents.find((item) => item.event === "response.failed").data.response;
      assert.equal(failed.status, "failed");
      assert.equal(failed.error.message, "anthropic quota exceeded");
      assert.equal(failed.error.type, "rate_limit_error");
      assert.equal(responseEvents.at(-1).data, "[DONE]");
      assert.ok(!responseEvents.some((item) => item.event === "response.completed"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://anthropic-started-error-stream.example.test/v1/messages");
  assert.equal(upstreamCalls[0].xApiKey, "sk-anthropic-started-error-stream-secret");
  assert.equal(upstreamCalls[1].url, "https://anthropic-started-error-stream.example.test/v1/messages");
});

test("model gateway adapts codex compact requests through openai chat providers", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-compact-adapter",
      name: "Codex Compact Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-compact.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-compact-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_compact",
      created: 1_710_000_030,
      model: "gpt-test",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "## Compact summary\n- Current task is model gateway.",
        },
        finish_reason: "stop",
      }],
      usage: {
        prompt_tokens: 50,
        completion_tokens: 12,
        total_tokens: 62,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const compact = await requestJson(`${baseUrl}/v1/responses/compact`, {
        method: "POST",
        body: {
          model: "gpt-test",
          instructions: "Summarize the conversation for handoff.",
          input: [
            { role: "user", content: "We are building Model Gateway." },
            { role: "assistant", content: "Provider registry and adapter are implemented." },
          ],
          stream: false,
          max_output_tokens: 2048,
          metadata: {
            studio_channel_compact: true,
            project_id: "codex-main",
          },
        },
      });

      assert.equal(compact.status, 200);
      assert.equal(compact.headers["x-openclaw-model-gateway-provider"], "codex-compact-adapter");
      assert.equal(compact.body.id, "chatcmpl_compact");
      assert.equal(compact.body.object, "response");
      assert.equal(compact.body.output[0].content[0].text, "## Compact summary\n- Current task is model gateway.");
      assert.deepEqual(compact.body.usage, {
        input_tokens: 50,
        output_tokens: 12,
        total_tokens: 62,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens_details: { reasoning_tokens: 0 },
      });

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog.length, 1);
      assert.equal(runtime.body.runtime.requestLog[0].routeId, "openai_responses_compact");
      assert.equal(runtime.body.runtime.requestLog[0].requestedPath, "/v1/responses/compact");
      assert.equal(runtime.body.runtime.requestLog[0].upstreamUrl, "https://codex-compact.example.test/v1/chat/completions");
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "success");
      assert.ok(!JSON.stringify(runtime.body).includes("sk-codex-compact-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://codex-compact.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].method, "POST");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-codex-compact-secret");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-test",
    messages: [
      { role: "system", content: "Summarize the conversation for handoff." },
      { role: "user", content: "We are building Model Gateway." },
      { role: "assistant", content: "Provider registry and adapter are implemented." },
    ],
    stream: false,
    max_tokens: 2048,
  });
  assert.equal("metadata" in JSON.parse(upstreamCalls[0].body), false);
});

test("model gateway normalizes upstream chat errors for codex responses clients", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-error-adapter",
      name: "Codex Error Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-error.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-error-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    base_resp: {
      status_code: 2013,
      status_msg: "quota exceeded",
    },
  }), {
    status: 429,
    headers: { "content-type": "application/json" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "Hello",
          stream: false,
        },
      });

      assert.equal(responses.status, 429);
      assert.equal(responses.headers["x-openclaw-model-gateway-provider"], "codex-error-adapter");
      assert.deepEqual(responses.body, {
        error: {
          message: "quota exceeded",
          type: "upstream_error",
          code: "2013",
        },
      });
      assert.ok(!JSON.stringify(responses.body).includes("base_resp"));

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "failure");
      assert.equal(runtime.body.runtime.requestLog[0].errorCode, "2013");
      assert.equal(runtime.body.runtime.requestLog[0].errorMessage, "quota exceeded");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway restores codex tool-call history for follow-up chat adapter requests", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-history-adapter",
      name: "Codex History Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-history.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-history-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const callIndex = upstreamCalls.length;
    const body = String(init.body || "");
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body,
    });

    if (callIndex === 0) {
      return new Response(JSON.stringify({
        id: "chatcmpl_tool_turn",
        created: 1_710_000_010,
        model: "gpt-test",
        choices: [{
          index: 0,
          message: {
            role: "assistant",
            content: null,
            tool_calls: [{
              id: "call_lookup",
              type: "function",
              function: {
                name: "lookup",
                arguments: "{\"query\":\"weather\"}",
              },
            }],
          },
          finish_reason: "tool_calls",
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      id: "chatcmpl_final_turn",
      created: 1_710_000_011,
      model: "gpt-test",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "The weather is sunny.",
        },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const first = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "Check the weather.",
          tools: [{
            type: "function",
            name: "lookup",
            parameters: { type: "object" },
          }],
          tool_choice: "auto",
          stream: false,
        },
      });
      assert.equal(first.status, 200);
      assert.equal(first.body.id, "chatcmpl_tool_turn");
      assert.deepEqual(first.body.output, [{
        type: "function_call",
        id: "call_lookup",
        call_id: "call_lookup",
        status: "completed",
        name: "lookup",
        arguments: "{\"query\":\"weather\"}",
      }]);
      assert.ok(fs.existsSync(paths.codexHistory));
      assert.equal(fs.statSync(paths.codexHistory).mode & 0o777, 0o600);
      assert.ok(!fs.readFileSync(paths.codexHistory, "utf8").includes("sk-codex-history-secret"));

      const second = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          previous_response_id: first.body.id,
          input: [
            {
              type: "function_call_output",
              call_id: "call_lookup",
              output: "Sunny",
            },
            {
              role: "user",
              content: "Summarize the result.",
            },
          ],
          stream: false,
        },
      });
      assert.equal(second.status, 200);
      assert.equal(second.body.id, "chatcmpl_final_turn");
      assert.deepEqual(second.body.output[0].content, [{ type: "output_text", text: "The weather is sunny." }]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-codex-history-secret");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-codex-history-secret");
  const secondChatBody = JSON.parse(upstreamCalls[1].body);
  assert.deepEqual(secondChatBody.messages, [
    {
      role: "user",
      content: "Check the weather.",
    },
    {
      role: "assistant",
      content: null,
      reasoning_content: "tool call",
      tool_calls: [{
        id: "call_lookup",
        type: "function",
        function: {
          name: "lookup",
          arguments: "{\"query\":\"weather\"}",
        },
      }],
    },
    {
      role: "tool",
      content: "Sunny",
      tool_call_id: "call_lookup",
    },
    {
      role: "user",
      content: "Summarize the result.",
    },
  ]);
});

test("model gateway routes expose status/providers and forward chat passthrough", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "route-chat",
      name: "Route Chat Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://upstream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-route-secret-abcdef",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = Buffer.isBuffer(init.body)
      ? init.body.toString("utf8")
      : String(init.body || "");
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      contentType: init.headers instanceof Headers ? init.headers.get("content-type") : null,
      body,
    });
    return new Response(JSON.stringify({ id: "chatcmpl_route_test", ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const status = await requestJson(`${baseUrl}/gateway/status`);
      assert.equal(status.status, 200);
      assert.equal(status.body.ok, true);
      assert.equal(status.body.registry.providerCount, 1);

      const providers = await requestJson(`${baseUrl}/gateway/providers`);
      assert.equal(providers.status, 200);
      assert.equal(providers.body.providers[0].id, "route-chat");
      assert.equal(providers.body.providers[0].secret.masked, "sk-r...cdef");
      assert.ok(!JSON.stringify(providers.body).includes("sk-route-secret-abcdef"));

      const providerTest = await requestJson(`${baseUrl}/api/model-gateway/providers/route-chat/test`, {
        method: "POST",
        body: {
          model: "route-test-model",
          input: "Return ok",
        },
      });
      assert.equal(providerTest.status, 200);
      assert.equal(providerTest.body.ok, true);
      assert.equal(providerTest.body.route.provider.id, "route-chat");
      assert.equal(providerTest.body.route.mode, "passthrough");

      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "route-test-model",
          messages: [{ role: "user", content: "hello" }],
          metadata: { trace: "strict-chat-provider" },
        },
      });
      assert.equal(chat.status, 200);
      assert.deepEqual(chat.body, { id: "chatcmpl_route_test", ok: true });
      assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "route-chat");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog.length, 2);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => entry.kind), [
        "provider-test",
        "gateway-request",
      ]);
      assert.equal(runtime.body.runtime.requestLog[1].model, "route-test-model");
      assert.ok(!JSON.stringify(runtime.body).includes("sk-route-secret-abcdef"));

      const afterStatus = await requestJson(`${baseUrl}/api/model-gateway/status`);
      assert.equal(afterStatus.status, 200);
      assert.equal(afterStatus.body.runtime.requestLogSize, 2);
      assert.equal(afterStatus.body.healthSummary.okProviders, 1);

      const afterProviders = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      assert.equal(afterProviders.body.providers[0].health.consecutiveFailures, 0);
      assert.equal(afterProviders.body.providers[0].health.circuitState, "closed");
      assert.ok(afterProviders.body.providers[0].health.lastSuccessAt);

      const deleteProvider = await requestJson(`${baseUrl}/api/model-gateway/providers/route-chat`, {
        method: "DELETE",
      });
      assert.equal(deleteProvider.status, 200);
      assert.deepEqual(deleteProvider.body.providers, []);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://upstream.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].method, "POST");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-route-secret-abcdef");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "route-test-model",
    messages: [{ role: "user", content: "Return ok" }],
    stream: false,
  });
  assert.equal(upstreamCalls[1].url, "https://upstream.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[1].method, "POST");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-route-secret-abcdef");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "route-test-model",
    messages: [{ role: "user", content: "hello" }],
  });
  assert.equal("metadata" in JSON.parse(upstreamCalls[1].body), false);
});

test("model gateway can opt into openai chat metadata passthrough for compatible providers", async () => {
  const root = makeTempRoot();
  const config = createStudioConfig(root);
  const ctx = createStudioContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "route-chat-metadata",
      name: "Route Chat Metadata Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://metadata.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      metadata: {
        openaiChatMetadataPassthrough: true,
      },
    },
    secret: {
      apiKey: "sk-route-metadata-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createStudioRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({ id: "chatcmpl_metadata_test" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "route-test-model",
          messages: [{ role: "user", content: "hello" }],
          metadata: { trace: "trusted-provider" },
        },
      });
      assert.equal(chat.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://metadata.example.test/v1/chat/completions");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "route-test-model",
    messages: [{ role: "user", content: "hello" }],
    metadata: { trace: "trusted-provider" },
  });
});
