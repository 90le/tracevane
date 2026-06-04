import test from "node:test";
import assert from "node:assert/strict";
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
  try {
    await task(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
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
        models: [{ id: "gpt-test", features: { tools: true, streaming: true } }],
      },
    },
    secret: {
      apiKey: "sk-test-secret-123456",
    },
    setActiveScopes: ["codex", "openclaw"],
  });

  assert.equal(provider.apiKeyRef, "provider:openai-main:api-key");
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

test("model gateway routing contract selects app-scoped providers and normalizes v1 URLs", () => {
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
  assert.equal(responses.upstreamPath, "/v1/chat/completions");
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

  const codexChatOverride = service.resolveRouteDecision(
    "POST",
    "/v1/chat/completions",
    { "x-studio-app-scope": "codex" },
  );
  assert.equal(codexChatOverride.appScope, "codex");
  assert.equal(codexChatOverride.provider?.id, "codex-chat");
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
});
