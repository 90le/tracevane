import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { WebSocket } from "ws";

import {
  createTracevaneContext,
  createTracevaneRequestHandler,
  createTracevaneUpgradeHandler,
} from "../../dist/apps/api/index.js";
import {
  createModelGatewayService,
  ModelGatewayServiceError,
  resolveModelGatewayPaths,
} from "../../dist/apps/api/modules/model-gateway/service.js";
import { createModelGatewayDaemon } from "../../dist/apps/api/modules/model-gateway/daemon.js";
import {
  MODEL_GATEWAY_UNSUPPORTED_ENDPOINTS,
  MODEL_GATEWAY_UNSUPPORTED_HTTP_ROUTES,
} from "../../dist/apps/api/modules/model-gateway/unsupported-endpoints.js";

function makeTempRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-model-gateway-"));
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

async function withTracevaneServer(ctx, task) {
  const requestHandler = createTracevaneRequestHandler(ctx);
  const upgradeHandler = createTracevaneUpgradeHandler(ctx);
  const server = http.createServer(async (req, res) => {
    const handled = await requestHandler(req, res);
    if (!handled && !res.writableEnded) {
      res.statusCode = 404;
      res.end("not found");
    }
  });
  server.on("upgrade", (req, socket, head) => {
    upgradeHandler(req, socket, head);
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

function requestRaw(url, options = {}) {
  const body = options.rawBody === undefined
    ? options.body === undefined ? null : JSON.stringify(options.body)
    : Buffer.isBuffer(options.rawBody) ? options.rawBody : Buffer.from(String(options.rawBody), "utf8");
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: `${target.pathname}${target.search}`,
      method: options.method || "GET",
      headers: {
        ...(body && options.rawBody === undefined ? { "content-type": "application/json" } : {}),
        ...(body ? { "content-length": Buffer.byteLength(body) } : {}),
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

function concreteUnsupportedRoutePath(pathPattern) {
  return pathPattern.replace(/:([A-Za-z][A-Za-z0-9_]*)/g, (_match, name) => {
    const normalized = String(name).replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
    return `${normalized}_test`;
  });
}

function unsupportedRouteRequestBody(route) {
  if (route.method !== "POST" && route.method !== "PUT" && route.method !== "PATCH") return undefined;
  if (route.path.includes("/embeddings")) return { model: "text-embedding-3-large", input: "hello" };
  if (route.path.includes("/moderations")) return { model: "omni-moderation-latest", input: "hello" };
  if (route.path.includes("/chat/completions")) return { metadata: { trace: "test" } };
  if (route.path.includes("/completions")) return { model: "gpt-3.5-turbo-instruct", prompt: "hello" };
  if (route.path.includes("/videos")) return { model: "sora-2", prompt: "hello" };
  if (route.path.includes("/containers") && route.path.includes("/files")) return { file_id: "file_test" };
  if (route.path.includes("/containers")) return { name: "test container" };
  if (route.path.includes("/skills") && route.path.includes("/versions")) return { archive_file_id: "file_test" };
  if (route.path.includes("/skills")) return { name: "test skill", archive_file_id: "file_test" };
  if (route.path.includes("/evals") && route.path.includes("/runs")) return { name: "test run", data_source: { type: "jsonl", source: { type: "file_id", id: "file_test" } } };
  if (route.path.includes("/evals")) return { name: "test eval", data_source_config: { type: "custom" }, testing_criteria: [] };
  if (route.path.includes("/fine_tuning/alpha/graders") || route.path.includes("/fine-tuning/alpha/graders")) {
    return { grader: { type: "string_check", name: "exact", input: "{{ sample.output_text }}", reference: "ok", operation: "eq" } };
  }
  if (route.path.includes("/chatkit/sessions")) return { user: "user_test", workflow: { id: "workflow_test" } };
  if (route.path.includes("/organization/admin_api_keys")) return { name: "admin-key-test" };
  if (route.path.includes("/organization/invites")) return { email: "user@example.test", role: "reader" };
  if (route.path.includes("/organization/projects") && route.path.includes("/service_accounts")) return { name: "service-account-test" };
  if (route.path.includes("/organization/projects") && route.path.includes("/users")) return { user_id: "user_test", role: "member" };
  if (route.path.includes("/organization") && route.path.includes("/roles")) return { role_id: "role_test" };
  if (route.path.includes("/organization") && route.path.includes("/groups")) return { name: "group-test" };
  if (route.path.includes("/organization/certificates")) return { certificate: "-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----" };
  if (route.path.includes("/organization/spend_alerts")) return { threshold: 100, email: "billing@example.test" };
  if (route.path.includes("/organization/data_retention")) return { retention_period_days: 30 };
  if (route.path.includes("/organization/projects")) return { name: "project-test" };
  if (route.path.includes("/responses/input_tokens")) return { model: "gpt-5.5", input: "hello" };
  if (route.path.includes("/responses")) return { model: "gpt-5.5", input: "hello" };
  if (route.path.includes("/conversations") && route.path.includes("/items")) return { role: "user", content: "hello" };
  if (route.path.includes("/conversations")) return { items: [{ role: "user", content: "hello" }] };
  if (route.path.includes("/fine_tuning/jobs") || route.path.includes("/fine-tuning/jobs")) return { model: "gpt-5.5", training_file: "file_test" };
  if (route.path.includes("/batches")) return { input_file_id: "file_test", endpoint: "/v1/responses" };
  if (route.path.includes("/uploads") && route.path.endsWith("/complete")) return { part_ids: ["part_test"] };
  if (route.path.includes("/uploads")) return { bytes: 12, filename: "test.jsonl", mime_type: "application/jsonl", purpose: "batch" };
  if (route.path.includes("/vector_stores") && route.path.endsWith("/search")) return { query: "hello" };
  if (route.path.includes("/vector_stores") && route.path.includes("/file_batches")) return { file_ids: ["file_test"] };
  if (route.path.includes("/vector_stores") && route.path.includes("/files")) return { file_id: "file_test" };
  if (route.path.includes("/vector_stores")) return { name: "test store" };
  if (route.path.includes("/threads") && route.path.includes("/submit_tool_outputs")) {
    return { tool_outputs: [{ tool_call_id: "call_test", output: "ok" }] };
  }
  if (route.path.includes("/threads/runs")) return { assistant_id: "asst_test" };
  if (route.path.includes("/threads") && route.path.includes("/runs")) return { assistant_id: "asst_test" };
  if (route.path.includes("/threads") && route.path.includes("/messages")) return { role: "user", content: "hello" };
  if (route.path.includes("/threads")) return { model: "gpt-5.5", messages: [] };
  if (route.path.includes("/realtime")) return { model: "gpt-realtime-2" };
  return { model: "gpt-5.5" };
}

test("model gateway service errors expose only sanitized client-safe details", () => {
  const error = new ModelGatewayServiceError(
    "model_gateway_test_error",
    "test message",
    400,
    {
      endpoint: "/v1/models",
      retryAfterMs: 1000,
      accountRouting: { accounts: [{ accountId: "acct_secret", email: "user@example.test" }] },
      apiKey: "sk-secret",
      authorization: "Bearer secret",
      token: "secret-token",
      rawBody: "{\"access_token\":\"secret\"}",
      nested: { safe: false },
      alternatives: ["not allowlisted here"],
    },
  );

  assert.deepEqual(error.toShape(), {
    code: "model_gateway_test_error",
    message: "test message",
    statusCode: 400,
    details: {
      endpoint: "/v1/models",
      retryAfterMs: 1000,
    },
  });
});

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

function fakeJwt(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(payload)}.signature`;
}

function sha256Short(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
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
  const config = createTracevaneConfig(root);
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
        models: [{
          id: "gpt-test",
          features: { text: true, tools: true, vision: true, reasoning: true, responses: true, streaming: true },
          pricing: {
            currency: "usd",
            inputPer1M: 1.25,
            outputPer1M: 5,
            cacheReadPer1M: -1,
            imageGenerationPerImage: 0.02,
          },
        }],
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
  assert.deepEqual(provider.models.models[0].pricing, {
    currency: "USD",
    inputPer1M: 1.25,
    outputPer1M: 5,
    imageGenerationPerImage: 0.02,
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

  const revealed = service.getProviderSecret(undefined, "openai-main");
  assert.equal(revealed.ok, true);
  assert.equal(revealed.providerId, "openai-main");
  assert.equal(revealed.apiKey, "sk-test-secret-123456");
  assert.equal(revealed.secret.masked, "sk-t...3456");
});

test("model gateway usage ledger summarizes every model by requests and tokens", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const service = createModelGatewayService(config);
  service.upsertProvider(undefined, {
    provider: {
      id: "usage-p1",
      name: "Usage P1",
      category: "openai-compatible",
      appScopes: ["codex"],
      baseUrl: "https://usage-p1.example/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: { defaultModel: "model-a", models: [{ id: "model-a", aliases: ["alias-a"] }, { id: "model-b" }] },
    },
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "usage-p2",
      name: "Usage P2",
      category: "openai-compatible",
      appScopes: ["codex"],
      baseUrl: "https://usage-p2.example/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: { defaultModel: "model-c", models: [{ id: "model-c" }] },
    },
  });

  const now = Date.now();
  const entry = (overrides) => ({
    id: overrides.id,
    kind: "gateway-request",
    startedAt: new Date(overrides.time - overrides.durationMs).toISOString(),
    finishedAt: new Date(overrides.time).toISOString(),
    durationMs: overrides.durationMs,
    firstByteMs: overrides.firstByteMs ?? null,
    routeId: "openai_chat_completions",
    appScope: overrides.appScope || "codex",
    providerId: overrides.providerId,
    providerName: overrides.providerName,
    accountId: overrides.accountId || null,
    accountHash: overrides.accountHash || null,
    accountRouting: null,
    clientKeyHash: overrides.clientKeyHash || null,
    endpointProfileId: null,
    endpointProfileName: null,
    model: overrides.model,
    method: "POST",
    requestedPath: "/v1/chat/completions",
    upstreamUrl: null,
    statusCode: overrides.statusCode,
    outcome: overrides.outcome,
    errorCode: null,
    errorMessage: null,
    usage: overrides.usage || null,
  });
  const entries = [
    entry({
      id: "old-p2",
      time: now - (40 * 24 * 60 * 60 * 1000),
      durationMs: 500,
      firstByteMs: 400,
      providerId: "usage-p2",
      providerName: "Usage P2",
      appScope: "opencode",
      model: "model-c",
      statusCode: 200,
      outcome: "success",
    }),
    entry({
      id: "p1-a",
      time: now - 10_000,
      durationMs: 100,
      firstByteMs: 30,
      providerId: "usage-p1",
      providerName: "Usage P1",
      appScope: "codex",
      accountId: "account-a",
      accountHash: "hash-a",
      clientKeyHash: sha256Short("sk-usage-client-a"),
      model: "alias-a",
      statusCode: 200,
      outcome: "success",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        cacheReadTokens: 2,
        cacheCreationTokens: 3,
        imageGenerationRequests: 0,
        imagesGenerated: 0,
        imageEditRequests: 0,
        audioInputRequests: 0,
        audioOutputRequests: 0,
      },
    }),
    entry({
      id: "p1-b",
      time: now - 5_000,
      durationMs: 250,
      firstByteMs: 90,
      providerId: "usage-p1",
      providerName: "Usage P1",
      appScope: "claude-code",
      clientKeyHash: sha256Short("sk-usage-client-b"),
      model: "model-b",
      statusCode: 500,
      outcome: "failure",
    }),
    ...Array.from({ length: 15 }, (_, index) => entry({
      id: `extra-${index + 1}`,
      time: now - (20_000 + index),
      durationMs: 50,
      firstByteMs: 20,
      providerId: "usage-p2",
      providerName: "Usage P2",
      model: `model-extra-${index + 1}`,
      statusCode: 200,
      outcome: "success",
      usage: {
        inputTokens: index + 1,
        outputTokens: 0,
        totalTokens: index + 1,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        imageGenerationRequests: 0,
        imagesGenerated: 0,
        imageEditRequests: 0,
        audioInputRequests: 0,
        audioOutputRequests: 0,
      },
    })),
  ];
  fs.mkdirSync(path.dirname(paths.usageLedger), { recursive: true });
  fs.writeFileSync(paths.usageLedger, `${entries.map((item) => JSON.stringify(item)).join("\n")}\n`, { mode: 0o600 });

  const usage = service.getUsageLedger();
  assert.equal(usage.ok, true);
  assert.match(usage.checkedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(usage.readWindow.entryCount, entries.length);
  assert.equal(usage.readWindow.readLimit, 20_000);
  assert.equal(usage.readWindow.readByteLimit, 16 * 1024 * 1024);
  assert.ok(usage.readWindow.readBytes > 0);
  assert.equal(usage.readWindow.ledgerSizeBytes, usage.readWindow.readBytes);
  assert.equal(usage.readWindow.truncated, false);
  assert.equal(usage.totals.requestCount, entries.length);
  assert.equal(usage.totals.meteredRequestCount, 16);
  assert.equal(usage.totals.inputTokens, 130);
  assert.equal(usage.totals.outputTokens, 5);
  assert.equal(usage.totals.totalTokens, 135);
  assert.equal(usage.totals.cacheReadTokens, 2);
  assert.equal(usage.totals.cacheCreationTokens, 3);
  assert.equal(usage.totals.cacheReadRequestCount, 1);
  assert.equal(usage.totals.cacheCreationRequestCount, 1);
  assert.equal(usage.models.length, 18);
  assert.equal(usage.providers.length, 2);
  assert.equal(usage.appScopes.length, 3);

  const byModel = new Map(usage.models.map((item) => [item.model, item]));
  assert.deepEqual(
    {
      requestCount: byModel.get("model-a")?.requestCount,
      meteredRequestCount: byModel.get("model-a")?.meteredRequestCount,
      inputTokens: byModel.get("model-a")?.inputTokens,
      outputTokens: byModel.get("model-a")?.outputTokens,
      totalTokens: byModel.get("model-a")?.totalTokens,
      cacheReadTokens: byModel.get("model-a")?.cacheReadTokens,
      cacheCreationTokens: byModel.get("model-a")?.cacheCreationTokens,
      cacheReadRequestCount: byModel.get("model-a")?.cacheReadRequestCount,
      cacheCreationRequestCount: byModel.get("model-a")?.cacheCreationRequestCount,
    },
    {
      requestCount: 1,
      meteredRequestCount: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
      cacheReadTokens: 2,
      cacheCreationTokens: 3,
      cacheReadRequestCount: 1,
      cacheCreationRequestCount: 1,
    },
  );
  assert.equal(byModel.get("model-b")?.requestCount, 1);
  assert.equal(byModel.get("model-b")?.totalTokens, 0);
  assert.equal(byModel.get("model-c")?.requestCount, 1);
  assert.equal(byModel.get("model-c")?.totalTokens, 0);
  assert.equal(byModel.get("model-extra-15")?.totalTokens, 15);
  const byProvider = new Map(usage.providers.map((item) => [item.key, item]));
  assert.deepEqual(
    {
      label: byProvider.get("usage-p1")?.label,
      requestCount: byProvider.get("usage-p1")?.requestCount,
      meteredRequestCount: byProvider.get("usage-p1")?.meteredRequestCount,
      totalTokens: byProvider.get("usage-p1")?.totalTokens,
      cacheReadTokens: byProvider.get("usage-p1")?.cacheReadTokens,
      cacheCreationTokens: byProvider.get("usage-p1")?.cacheCreationTokens,
      cacheReadRequestCount: byProvider.get("usage-p1")?.cacheReadRequestCount,
      cacheCreationRequestCount: byProvider.get("usage-p1")?.cacheCreationRequestCount,
    },
    {
      label: "Usage P1",
      requestCount: 2,
      meteredRequestCount: 1,
      totalTokens: 15,
      cacheReadTokens: 2,
      cacheCreationTokens: 3,
      cacheReadRequestCount: 1,
      cacheCreationRequestCount: 1,
    },
  );
  assert.equal(byProvider.get("usage-p2")?.requestCount, 16);
  assert.equal(byProvider.get("usage-p2")?.totalTokens, 120);
  const byScope = new Map(usage.appScopes.map((item) => [item.key, item]));
  assert.equal(byScope.get("codex")?.requestCount, 16);
  assert.equal(byScope.get("codex")?.totalTokens, 135);
  assert.equal(byScope.get("claude-code")?.requestCount, 1);
  assert.equal(byScope.get("claude-code")?.totalTokens, 0);
  assert.equal(byScope.get("opencode")?.requestCount, 1);
  assert.equal(byScope.get("opencode")?.totalTokens, 0);
  assert.ok(!JSON.stringify(usage).includes("sk-usage-client-a"));
  assert.equal("entries" in usage, false);
  assert.equal("archiveIndex" in usage, false);
  assert.equal("query" in usage, false);
});

test("model gateway starts Codex account login and creates an account-backed provider", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const idToken = fakeJwt({
    email: "coder@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_codex_123",
      chatgpt_plan_type: "plus",
    },
  });

  const originalFetch = globalThis.fetch;
  const previousProxyEnv = {
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    HTTP_PROXY: process.env.HTTP_PROXY,
    ALL_PROXY: process.env.ALL_PROXY,
    https_proxy: process.env.https_proxy,
    http_proxy: process.env.http_proxy,
    all_proxy: process.env.all_proxy,
  };
  process.env.HTTPS_PROXY = "http://127.0.0.1:18080";
  delete process.env.HTTP_PROXY;
  delete process.env.ALL_PROXY;
  delete process.env.https_proxy;
  delete process.env.http_proxy;
  delete process.env.all_proxy;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});

    if (String(url) === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
      return new Response(JSON.stringify({
        device_auth_id: "device-123",
        user_code: "ABCD-EFGH",
        interval: 1,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (String(url) === "https://auth.openai.com/api/accounts/deviceauth/token") {
      assert.equal(JSON.parse(String(init.body)).device_auth_id, "device-123");
      return new Response(JSON.stringify({
        authorization_code: "auth-code-123",
        code_verifier: "verifier-123",
        code_challenge: "challenge-123",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (String(url) === "https://auth.openai.com/oauth/token") {
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.equal(form.get("code"), "auth-code-123");
      assert.equal(form.get("code_verifier"), "verifier-123");
      return new Response(JSON.stringify({
        access_token: "codex-access-token",
        refresh_token: "codex-refresh-token",
        id_token: idToken,
        expires_in: 3600,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      const requestBody = JSON.parse(String(init.body || "{}"));
      upstreamCalls.push({
        url: String(url),
        authorization: headers.get("authorization"),
        accountId: headers.get("chatgpt-account-id"),
        originator: headers.get("originator"),
        userAgent: headers.get("user-agent"),
        accept: headers.get("accept"),
        dispatcher: Boolean(init.dispatcher),
        body: requestBody,
      });
      if (requestBody.tools?.[0]?.type === "image_generation") {
        const imageItem = {
          type: "image_generation_call",
          result: "BASE64_IMAGE",
          output_format: "png",
          size: "1024x1024",
          quality: "low",
          revised_prompt: "red square",
        };
        return new Response([
          `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: imageItem })}`,
          "",
          "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_image\",\"status\":\"completed\",\"created_at\":1710000001,\"output\":[],\"tool_usage\":{\"image_gen\":{\"input_tokens\":7,\"output_tokens\":11,\"total_tokens\":18}}}}",
          "",
          "data: [DONE]",
          "",
        ].join("\n"), {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        });
      }
      const outputItem = {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        };
      return new Response([
        `data: ${JSON.stringify({ type: "response.output_item.done", output_index: 0, item: outputItem })}`,
        "",
        `data: ${JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_codex_account",
            object: "response",
            status: "completed",
            output: [],
            usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
          },
        })}`,
        "",
        "data: [DONE]",
        "",
      ].join("\n"), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }

    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/compact") {
      upstreamCalls.push({
        url: String(url),
        authorization: headers.get("authorization"),
        accountId: headers.get("chatgpt-account-id"),
        originator: headers.get("originator"),
        userAgent: headers.get("user-agent"),
        dispatcher: Boolean(init.dispatcher),
        body: JSON.parse(String(init.body || "{}")),
      });
      return new Response(JSON.stringify({
        id: "resp_codex_compact",
        object: "response",
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "compact summary" }],
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const start = await requestJson(`${baseUrl}/api/model-gateway/account-providers/codex/login/start`, {
        method: "POST",
        body: {
          providerId: "codex-owned",
          providerName: "My Codex",
          setActiveScopes: ["codex", "claude-code", "opencode", "openclaw"],
        },
      });
      assert.equal(start.status, 200);
      assert.equal(start.body.ok, true);
      assert.equal(start.body.userCode, "ABCD-EFGH");
      assert.equal(start.body.verificationUrl, "https://auth.openai.com/codex/device");

      const poll = await requestJson(`${baseUrl}/api/model-gateway/account-providers/codex/login/poll`, {
        method: "POST",
        body: { loginId: start.body.loginId },
      });
      assert.equal(poll.status, 200);
      assert.equal(poll.body.status, "completed");
      assert.equal(poll.body.provider.id, "codex-owned");
      assert.equal(poll.body.provider.sourceType, "account-backed");
      assert.equal(poll.body.provider.apiFormat, "openai_responses");
      assert.equal(poll.body.provider.authStrategy, "oauth_proxy");
      assert.equal(poll.body.provider.baseUrl, "https://chatgpt.com/backend-api/codex");
      assert.equal(poll.body.provider.secret.hasSecret, true);
      assert.equal(poll.body.provider.accountProvider.kind, "codex");
      assert.equal(poll.body.provider.accountProvider.accounts.length, 1);
      assert.equal(poll.body.provider.accountProvider.accounts[0].state, "ready");
      assert.equal(poll.body.provider.accountProvider.accounts[0].emailMasked, "co***@example.com");
      assert.equal(poll.body.provider.accountProvider.accounts[0].plan, "plus");
      assert.deepEqual(poll.body.provider.models.models.map((model) => model.id), [
        "gpt-5.5",
        "gpt-5.4",
        "gpt-5.4-mini",
        "gpt-5.3-codex",
        "gpt-5.3-codex-spark",
        "gpt-image-2",
        "gpt-4o-transcribe",
        "gpt-4o-mini-transcribe",
        "gpt-4o-mini-tts",
        "tts-1",
        "tts-1-hd",
        "whisper-1",
        "gpt-audio",
        "gpt-audio-1.5",
        "gpt-realtime",
        "gpt-realtime-1.5",
        "gpt-realtime-2",
      ]);
      const gpt55Model = poll.body.provider.models.models.find((model) => model.id === "gpt-5.5");
      assert.equal(gpt55Model.contextWindow, 272000);
      assert.equal(gpt55Model.maxOutputTokens, 128000);
      assert.deepEqual(gpt55Model.pricing, {
        currency: "USD",
        inputPer1M: 5,
        outputPer1M: 30,
      });
      const gpt54Model = poll.body.provider.models.models.find((model) => model.id === "gpt-5.4");
      assert.equal(gpt54Model.contextWindow, 1000000);
      assert.equal(gpt54Model.maxOutputTokens, 128000);
      assert.equal(gpt54Model.pricing.longContextInputThreshold, 272000);
      const gpt54MiniModel = poll.body.provider.models.models.find((model) => model.id === "gpt-5.4-mini");
      assert.equal(gpt54MiniModel.contextWindow, 272000);
      assert.equal(gpt54MiniModel.maxOutputTokens, 128000);
      assert.deepEqual(gpt54MiniModel.pricing, {
        currency: "USD",
        inputPer1M: 0.75,
        outputPer1M: 4.5,
      });
      const gpt53CodexModel = poll.body.provider.models.models.find((model) => model.id === "gpt-5.3-codex");
      assert.equal(gpt53CodexModel.contextWindow, 272000);
      assert.equal(gpt53CodexModel.maxOutputTokens, 128000);
      assert.equal(gpt53CodexModel.features.vision, true);
      assert.deepEqual(gpt53CodexModel.pricing, {
        currency: "USD",
        inputPer1M: 1.75,
        outputPer1M: 14,
      });
      const gpt53SparkModel = poll.body.provider.models.models.find((model) => model.id === "gpt-5.3-codex-spark");
      assert.equal(gpt53SparkModel.contextWindow, 128000);
      assert.equal(gpt53SparkModel.maxOutputTokens, null);
      const realtime2Model = poll.body.provider.models.models.find((model) => model.id === "gpt-realtime-2");
      assert.equal(realtime2Model.contextWindow, 128000);
      assert.equal(realtime2Model.maxOutputTokens, 32000);
      const imageModel = poll.body.provider.models.models.find((model) => model.id === "gpt-image-2");
      assert.equal(imageModel.features.imageGeneration, true);
      assert.equal(imageModel.features.text, false);
      const transcribeModel = poll.body.provider.models.models.find((model) => model.id === "gpt-4o-transcribe");
      assert.equal(transcribeModel.features.audioInput, true);
      assert.equal(transcribeModel.features.audioOutput, false);
      const audioModel = poll.body.provider.models.models.find((model) => model.id === "gpt-audio");
      assert.equal(audioModel.features.audioInput, true);
      assert.equal(audioModel.features.audioOutput, true);
      assert.equal(poll.body.provider.endpoints.openai_responses_compact, "/compact");

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      assert.equal(providers.body.activeProviders.codex, "codex-owned");
      assert.equal(providers.body.activeProviders["claude-code"], "codex-owned");

      const models = await requestJson(`${baseUrl}/v1/models`);
      const browserModels = await requestJson(`${baseUrl}/api/model-gateway/models`);
      assert.equal(browserModels.status, 200);
      assert.deepEqual(browserModels.body.data.map((model) => model.id), models.body.data.map((model) => model.id));
      const gpt55CatalogModel = models.body.data.find((model) => model.id === "gpt-5.5");
      assert.equal(gpt55CatalogModel.context_window, 272000);
      assert.equal(gpt55CatalogModel.contextWindow, 272000);
      assert.equal(gpt55CatalogModel.pricing.longContextInputThreshold, undefined);
      assert.ok(gpt55CatalogModel.supportedGatewayRoutes.includes("openai_chat_completions"));
      assert.ok(gpt55CatalogModel.supportedGatewayRoutes.includes("openai_responses"));
      assert.ok(gpt55CatalogModel.supportedGatewayRoutes.includes("anthropic_messages"));
      assert.ok(gpt55CatalogModel.supportedGatewayRoutes.includes("openai_responses_compact"));
      assert.deepEqual(gpt55CatalogModel.routeSupport.supported, gpt55CatalogModel.supportedGatewayRoutes);
      assert.equal(gpt55CatalogModel.agentSelectable, true);
      assert.equal(gpt55CatalogModel.endpointOnly, false);
      const gpt54MiniCatalogModel = models.body.data.find((model) => model.id === "gpt-5.4-mini");
      assert.equal(gpt54MiniCatalogModel.context_window, 272000);
      assert.equal(gpt54MiniCatalogModel.max_output_tokens, 128000);
      const imageCatalogModel = models.body.data.find((model) => model.id === "gpt-image-2");
      assert.equal(imageCatalogModel.agentSelectable, false);
      assert.equal(imageCatalogModel.endpointOnly, true);
      assert.ok(imageCatalogModel.supportedGatewayRoutes.includes("openai_images_generations"));
      assert.ok(!imageCatalogModel.supportedGatewayRoutes.includes("openai_images_edits"));
      assert.ok(imageCatalogModel.unsupportedGatewayRoutes.some((route) =>
        route.routeId === "openai_images_edits"
        && route.code === "model_gateway_codex_account_image_edits_unsupported"
      ));
      const transcribeCatalogModel = models.body.data.find((model) => model.id === "gpt-4o-transcribe");
      assert.equal(transcribeCatalogModel.agentSelectable, false);
      assert.equal(transcribeCatalogModel.endpointOnly, true);
      assert.ok(transcribeCatalogModel.unsupportedGatewayRoutes.some((route) =>
        route.routeId === "openai_audio_transcriptions"
        && route.code === "model_gateway_codex_account_audio_unsupported"
      ));
      const realtimeCatalogModel = models.body.data.find((model) => model.id === "gpt-realtime-2");
      assert.ok(realtimeCatalogModel.unsupportedGatewayRoutes.some((route) =>
        route.endpoint === "/v1/realtime"
        && route.code === "model_gateway_realtime_unsupported"
      ));

      const registryRaw = fs.readFileSync(paths.registry, "utf8");
      const secretsRaw = fs.readFileSync(paths.secrets, "utf8");
      assert.ok(!registryRaw.includes("codex-access-token"));
      assert.ok(!registryRaw.includes("codex-refresh-token"));
      assert.ok(secretsRaw.includes("codex-access-token"));
      assert.ok(secretsRaw.includes("codex-refresh-token"));
      assert.equal(fs.statSync(paths.secrets).mode & 0o777, 0o600);

      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          input: "hello",
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.id, "resp_codex_account");
      assert.equal(response.body.output[0].content[0].text, "ok");
      assert.equal(response.body.usage.total_tokens, 2);

      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.equal(chat.status, 200);
      assert.equal(chat.body.choices[0].message.content, "ok");

      const compact = await requestJson(`${baseUrl}/v1/responses/compact`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          input: "summarize",
        },
      });
      assert.equal(compact.status, 200);
      assert.equal(compact.body.id, "resp_codex_compact");

      const image = await requestJson(`${baseUrl}/v1/images/generations`, {
        method: "POST",
        body: {
          model: "gpt-image-2",
          prompt: "draw a red square",
          size: "1024x1024",
          quality: "low",
          response_format: "b64_json",
        },
      });
      assert.equal(image.status, 200, JSON.stringify(image.body));
      assert.equal(image.body.created, 1710000001);
      assert.equal(image.body.data[0].b64_json, "BASE64_IMAGE");
      assert.equal(image.body.data[0].revised_prompt, "red square");
      assert.deepEqual(image.body.usage, { input_tokens: 7, output_tokens: 11, total_tokens: 18 });

      const editBoundary = "----tracevane-codex-image-edit-boundary";
      const editBody = Buffer.from([
        `--${editBoundary}`,
        'Content-Disposition: form-data; name="model"',
        "",
        "gpt-image-2",
        `--${editBoundary}`,
        'Content-Disposition: form-data; name="prompt"',
        "",
        "make the square blue",
        `--${editBoundary}`,
        'Content-Disposition: form-data; name="image"; filename="square.png"',
        "Content-Type: image/png",
        "",
        "PNG\u0000tracevane-image",
        `--${editBoundary}--`,
        "",
      ].join("\r\n"), "latin1");
      const edit = await requestRaw(`${baseUrl}/v1/images/edits`, {
        method: "POST",
        rawBody: editBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${editBoundary}`,
        },
      });
      assert.equal(edit.status, 501);
      const editError = JSON.parse(edit.body).error;
      assert.equal(editError.code, "model_gateway_codex_account_image_edits_unsupported");
      assert.equal(editError.details.feasibility, "blocked-no-codex-image-edit-action-contract");
      assert.match(editError.details.reference, /no stable Codex account image edit action contract/);
      assert.ok(editError.details.alternatives.some((item) => item.includes("/v1/images/generations")));

      const audioBoundary = "----tracevane-codex-audio-boundary";
      const audioBody = Buffer.from([
        `--${audioBoundary}`,
        'Content-Disposition: form-data; name="model"',
        "",
        "gpt-4o-mini-transcribe",
        `--${audioBoundary}`,
        'Content-Disposition: form-data; name="file"; filename="sample.wav"',
        "Content-Type: audio/wav",
        "",
        "RIFF\u0024\u0000\u0000\u0000WAVEfmt ",
        `--${audioBoundary}--`,
        "",
      ].join("\r\n"), "latin1");
      const audio = await requestRaw(`${baseUrl}/v1/audio/transcriptions`, {
        method: "POST",
        rawBody: audioBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${audioBoundary}`,
        },
      });
      assert.equal(audio.status, 501);
      const audioError = JSON.parse(audio.body).error;
      assert.equal(audioError.code, "model_gateway_codex_account_audio_unsupported");
      assert.equal(audioError.details.feasibility, "blocked-no-codex-account-rest-audio-contract");
      assert.match(audioError.details.reference, /request-based audio APIs/);
      assert.ok(audioError.details.alternatives.some((item) => item.includes("/v1/audio/transcriptions")));

      const speech = await requestJson(`${baseUrl}/v1/audio/speech`, {
        method: "POST",
        body: {
          model: "gpt-4o-mini-tts",
          voice: "alloy",
          input: "hello",
        },
      });
      assert.equal(speech.status, 501);
      assert.equal(speech.body.error.code, "model_gateway_codex_account_audio_unsupported");
      assert.equal(speech.body.error.details.feasibility, "blocked-no-codex-account-rest-audio-contract");
      assert.ok(speech.body.error.details.alternatives.some((item) => item.includes("audio output")));

      const wsHttp = await requestJson(`${baseUrl}/v1/responses/ws`);
      assert.equal(wsHttp.status, 501);
      assert.equal(wsHttp.body.error.code, "model_gateway_realtime_unsupported");
      assert.match(wsHttp.body.error.details.reference, /Responses WebSocket mode/);
      assert.ok(wsHttp.body.error.details.alternatives.some((item) => item.includes("verified WebSocket/WebRTC bridge")));

      const realtimeHttp = await requestJson(`${baseUrl}/v1/realtime`);
      assert.equal(realtimeHttp.status, 501);
      assert.equal(realtimeHttp.body.error.code, "model_gateway_realtime_unsupported");
      assert.match(realtimeHttp.body.error.details.reference, /Realtime voice, translation, and transcription sessions/);

      const realtimeTranslationHttp = await requestJson(`${baseUrl}/v1/realtime/translations`);
      assert.equal(realtimeTranslationHttp.status, 501);
      assert.equal(realtimeTranslationHttp.body.error.code, "model_gateway_realtime_unsupported");
      assert.match(realtimeTranslationHttp.body.error.details.reference, /Realtime voice, translation, and transcription sessions/);

      const realtimeCallsHttp = await requestJson(`${baseUrl}/v1/realtime/calls`, {
        method: "POST",
        body: { model: "gpt-realtime-2" },
      });
      assert.equal(realtimeCallsHttp.status, 501);
      assert.equal(realtimeCallsHttp.body.error.code, "model_gateway_realtime_unsupported");

      const realtimeClientSecretsHttp = await requestJson(`${baseUrl}/v1/realtime/client_secrets`, {
        method: "POST",
        body: { session: { model: "gpt-realtime-2" } },
      });
      assert.equal(realtimeClientSecretsHttp.status, 501);
      assert.equal(realtimeClientSecretsHttp.body.error.code, "model_gateway_realtime_unsupported");

      const realtimeTranscriptionHttp = await requestJson(`${baseUrl}/v1/realtime/transcription_sessions`);
      assert.equal(realtimeTranscriptionHttp.status, 501);
      assert.equal(realtimeTranscriptionHttp.body.error.code, "model_gateway_realtime_unsupported");
      assert.match(realtimeTranscriptionHttp.body.error.details.reference, /Realtime voice, translation, and transcription sessions/);

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      const imageEntry = runtime.body.runtime.requestLog.find((entry) => entry.routeId === "openai_images_generations");
      assert.ok(imageEntry);
      assert.deepEqual(imageEntry.usage, {
        inputTokens: 7,
        outputTokens: 11,
        totalTokens: 18,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        imageGenerationRequests: 1,
        imagesGenerated: 1,
        imageEditRequests: 0,
        audioInputRequests: 0,
        audioOutputRequests: 0,
      });
      assert.equal(runtime.body.usageSummary.usage.imageGenerationRequests, 1);
      assert.equal(runtime.body.usageSummary.usage.imagesGenerated, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousProxyEnv)) {
      if (typeof value === "string") process.env[key] = value;
      else delete process.env[key];
    }
  }

  assert.equal(upstreamCalls.length, 4);
  assert.equal(upstreamCalls[0].url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer codex-access-token");
  assert.equal(upstreamCalls[0].accountId, "acct_codex_123");
  assert.equal(upstreamCalls[0].originator, "codex_cli_rs");
  assert.equal(upstreamCalls[0].dispatcher, true);
  assert.equal(upstreamCalls[0].body.instructions, "");
  assert.equal(upstreamCalls[0].body.stream, true);
  assert.equal(upstreamCalls[0].body.store, false);
  assert.equal(upstreamCalls[0].body.parallel_tool_calls, true);
  assert.deepEqual(upstreamCalls[0].body.include, ["reasoning.encrypted_content"]);
  assert.deepEqual(upstreamCalls[0].body.input, [{
    type: "message",
    role: "user",
    content: [{ type: "input_text", text: "hello" }],
  }]);
  assert.equal(upstreamCalls[0].accept, "text/event-stream");
  assert.equal(upstreamCalls[1].url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(upstreamCalls[1].body.store, false);
  assert.equal(upstreamCalls[1].body.parallel_tool_calls, true);
  assert.equal(upstreamCalls[1].body.stream, true);
  assert.equal(upstreamCalls[2].url, "https://chatgpt.com/backend-api/codex/compact");
  assert.equal(upstreamCalls[2].body.model, "gpt-5.5");
  assert.equal(upstreamCalls[2].dispatcher, true);
  assert.equal(upstreamCalls[2].body.instructions, "");
  assert.equal(upstreamCalls[3].url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(upstreamCalls[3].body.model, "gpt-5.4-mini");
  assert.equal(upstreamCalls[3].body.tools[0].type, "image_generation");
  assert.equal(upstreamCalls[3].body.tools[0].model, "gpt-image-2");
  assert.equal(upstreamCalls[3].body.tools[0].size, "1024x1024");
  assert.equal(upstreamCalls[3].body.tool_choice.type, "image_generation");
  assert.equal(upstreamCalls[3].dispatcher, true);
  assert.match(upstreamCalls[0].userAgent, /^codex_cli_rs/);
});

test("model gateway preserves Codex account login sessions across service instances", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const firstService = createModelGatewayService(config);
  const secondService = createModelGatewayService(config);
  const idToken = fakeJwt({
    email: "cross@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_cross",
      chatgpt_plan_type: "pro",
    },
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === "https://auth.openai.com/api/accounts/deviceauth/usercode") {
      return new Response(JSON.stringify({
        device_auth_id: "device-cross",
        user_code: "WXYZ-1234",
        interval: 1,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (String(url) === "https://auth.openai.com/api/accounts/deviceauth/token") {
      assert.equal(JSON.parse(String(init.body)).device_auth_id, "device-cross");
      return new Response(JSON.stringify({
        authorization_code: "auth-code-cross",
        code_verifier: "verifier-cross",
        code_challenge: "challenge-cross",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (String(url) === "https://auth.openai.com/oauth/token") {
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get("grant_type"), "authorization_code");
      assert.equal(form.get("code"), "auth-code-cross");
      assert.equal(form.get("code_verifier"), "verifier-cross");
      return new Response(JSON.stringify({
        access_token: "codex-cross-access-token",
        refresh_token: "codex-cross-refresh-token",
        id_token: idToken,
        expires_in: 3600,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("unexpected", { status: 500 });
  };

  try {
    const start = await firstService.startCodexAccountLogin(undefined, {
      providerId: "codex-cross-service",
      providerName: "Cross Service Codex",
      setActiveScopes: ["codex", "claude-code"],
    });
    assert.equal(start.ok, true);
    assert.equal(start.userCode, "WXYZ-1234");
    assert.ok(fs.existsSync(paths.codexLoginSessions));
    assert.equal(fs.statSync(paths.codexLoginSessions).mode & 0o777, 0o600);
    const persistedLoginSession = fs.readFileSync(paths.codexLoginSessions, "utf8");
    assert.ok(persistedLoginSession.includes(start.loginId));
    assert.ok(persistedLoginSession.includes("device-cross"));
    assert.ok(!persistedLoginSession.includes("codex-cross-access-token"));
    assert.ok(!persistedLoginSession.includes("codex-cross-refresh-token"));

    const poll = await secondService.pollCodexAccountLogin(undefined, { loginId: start.loginId });
    assert.equal(poll.status, "completed");
    assert.equal(poll.provider?.id, "codex-cross-service");
    assert.equal(poll.provider?.accountProvider?.accounts[0]?.state, "ready");

    const afterPoll = fs.readFileSync(paths.codexLoginSessions, "utf8");
    assert.ok(!afterPoll.includes(start.loginId));
    assert.ok(!afterPoll.includes("device-cross"));
    const providers = secondService.listProviders();
    assert.equal(providers.providers.find((provider) => provider.id === "codex-cross-service")?.accountProvider?.accounts.length, 1);
    assert.equal(providers.activeProviders.codex, "codex-cross-service");
    assert.equal(providers.activeProviders["claude-code"], "codex-cross-service");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway keeps Codex provider and account pool visible after Claude auth failure", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const authRef = "provider:codex-claude-auth-fail:account:a:codex-token";
  const expiredIdToken = fakeJwt({
    email: "claude-expired@example.com",
    exp: Math.floor(Date.now() / 1000) - 60,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_claude_expired",
      chatgpt_plan_type: "pro",
    },
  });

  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-claude-auth-fail",
      name: "Codex Claude Auth Fail",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["claude-code"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: authRef,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-claude-expired",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "claude-expired",
          emailMasked: "cl***@example.com",
          plan: "pro",
          expiresAt: new Date(Date.now() - 60_000).toISOString(),
        }],
      },
    },
    secret: {
      apiKey: JSON.stringify({
        type: "codex",
        tokens: {
          id_token: expiredIdToken,
          access_token: "codex-claude-expired-access",
          refresh_token: "codex-claude-expired-refresh",
          account_id: "acct_claude_expired",
        },
        email: "claude-expired@example.com",
        plan_type: "pro",
        expires_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    },
    setActiveScopes: ["claude-code"],
  });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) === "https://auth.openai.com/oauth/token") {
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get("grant_type"), "refresh_token");
      return new Response(JSON.stringify({
        error: "invalid_grant",
        code: "refresh_token_reused",
      }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          max_tokens: 16,
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, "model_gateway_account_refresh_auth_failed");

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      assert.equal(providers.status, 200);
      assert.equal(providers.body.activeProviders["claude-code"], "codex-claude-auth-fail");
      const provider = providers.body.providers.find((item) => item.id === "codex-claude-auth-fail");
      assert.ok(provider, "Codex provider must remain visible after auth failure");
      assert.equal(provider.accountProvider.kind, "codex");
      assert.equal(provider.accountProvider.accounts.length, 1);
      assert.equal(provider.accountProvider.accounts[0].state, "needs-login");
      assert.match(provider.accountProvider.accounts[0].lastError, /refresh_token_reused/);
      const claudeRoute = providers.body.activeRoutes.find((route) => route.scope === "claude-code");
      assert.equal(claudeRoute.selectedProviderId, "codex-claude-auth-fail");
      assert.equal(claudeRoute.resolvedProviderId, null);
      assert.match(claudeRoute.warning, /no ready Codex account|No enabled Model Gateway provider offers model 'gpt-5.5'|No enabled Model Gateway provider is available|No available Model Gateway provider is available/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway preserves Codex account GPT-5.5 product context cap while repairing metadata", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "codex-stale-catalog",
      name: "Codex Stale Catalog",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: "provider:codex-raw-stale:account:a:codex-token",
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{
          id: "gpt-5.5",
          aliases: ["gpt5.5"],
          contextWindow: 1050000,
          maxOutputTokens: 8192,
          pricing: { currency: "USD", inputPer1M: 5, longContextInputThreshold: 272000 },
        }, {
          id: "gpt-5.4-mini",
          aliases: ["gpt5.4-mini"],
          contextWindow: 272000,
          maxOutputTokens: 8192,
          pricing: { currency: "USD", inputPer1M: 0.75 },
        }, {
          id: "gpt-5.3-codex",
          aliases: ["gpt5.3-codex"],
          contextWindow: 272000,
          maxOutputTokens: 8192,
          pricing: { currency: "USD", inputPer1M: 1.75 },
        }],
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef: "provider:codex-raw-stale:account:a:codex-token",
          credentialSource: "codex-device-auth",
          accountHash: "a",
          emailMasked: "co***@example.com",
          plan: "pro",
        }],
      },
    },
    setActiveScopes: ["codex"],
  });

  const models = service.listGatewayModels();
  const gpt55 = models.data.find((model) => model.id === "gpt-5.5");
  assert.equal(gpt55.context_window, 272000);
  assert.equal(gpt55.max_context_window, 272000);
  assert.equal(gpt55.max_output_tokens, 128000);
  assert.equal(gpt55.contextWindow, 272000);
  assert.equal(gpt55.maxOutputTokens, 128000);
  assert.equal(gpt55.pricing.longContextInputThreshold, undefined);
  const gpt54 = models.data.find((model) => model.id === "gpt-5.4");
  assert.equal(gpt54.context_window, 1000000);
  assert.equal(gpt54.max_output_tokens, 128000);
  assert.equal(gpt54.pricing.longContextInputThreshold, 272000);
  const gpt54Mini = models.data.find((model) => model.id === "gpt-5.4-mini");
  assert.equal(gpt54Mini.context_window, 272000);
  assert.equal(gpt54Mini.max_output_tokens, 128000);
  assert.equal(gpt54Mini.pricing.inputPer1M, 0.75);
  assert.equal(gpt54Mini.pricing.outputPer1M, 4.5);
  const gpt53Codex = models.data.find((model) => model.id === "gpt-5.3-codex");
  assert.equal(gpt53Codex.context_window, 272000);
  assert.equal(gpt53Codex.max_output_tokens, 128000);
  assert.deepEqual(gpt53Codex.aliases, ["gpt5.3-codex"]);
  assert.equal(gpt53Codex.features.vision, true);
  assert.equal(gpt53Codex.pricing.inputPer1M, 1.75);
  assert.equal(gpt53Codex.pricing.outputPer1M, 14);
  const gpt53Spark = models.data.find((model) => model.id === "gpt-5.3-codex-spark");
  assert.equal(gpt53Spark.context_window, 128000);
  assert.equal(gpt53Spark.max_context_window, 128000);
  assert.equal(gpt53Spark.max_output_tokens, 8192);
  assert.equal(gpt53Spark.maxOutputTokens, null);
});

test("model gateway strips Codex account Responses unsupported request parameters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const authRef = "provider:codex-metadata:account:a:codex-token";
  const idToken = fakeJwt({
    email: "metadata@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_metadata",
      chatgpt_plan_type: "plus",
    },
  });
  const tokenBundle = JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: "codex-metadata-access",
      refresh_token: "codex-metadata-refresh",
      account_id: "acct_metadata",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-metadata",
      name: "Codex Metadata",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex", "claude-code"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }, { id: "gpt-5.4" }],
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-metadata-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "metadata-a",
          emailMasked: "me***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex", "claude-code"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRef]: {
        value: tokenBundle,
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      accountId: init.headers instanceof Headers ? init.headers.get("chatgpt-account-id") : null,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });
    return new Response([
      "event: response.completed",
      `data: ${JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_metadata",
          object: "response",
          status: "completed",
          model: "gpt-5.4",
          output: [{
            id: "msg_metadata",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }],
          }],
          usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
        },
      })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "codex" },
        body: {
          model: "gpt-5.4",
          input: [{
            role: "user",
            content: [{
              type: "input_text",
              text: "hello",
              cache_control: { type: "ephemeral" },
            }, {
              type: "text",
              text: "chat-style text part",
            }, {
              type: "image_url",
              image_url: { url: "data:image/png;base64,iVBORw0KGgo=", detail: "low" },
            }, {
              type: "file",
              url: "https://example.test/readme.txt",
              filename: "readme.txt",
            }, {
              type: "input_audio",
              input_audio: { data: "data:audio/wav;base64,UklGRg==", format: "wav" },
            }, {
              type: "input_video",
              video_url: "https://example.test/video.mp4",
            }],
          }],
          background: false,
          frequency_penalty: 0.1,
          logprobs: true,
          max_tool_calls: 1,
          metadata: {
            trace_id: "claude-code-cli",
            session_id: "metadata-regression",
          },
          modalities: ["text"],
          n: 1,
          presence_penalty: 0.1,
          conversation: "conv_unsupported_codex_account",
          prompt: { id: "pmpt_unsupported_codex_account", variables: { topic: "gateway" } },
          reasoning: {
            effort: "low",
            generate_summary: "concise",
          },
          seed: 123,
          stream: false,
          tools: [
            {
              type: "function",
              name: "echo_probe",
              description: "Echo probe",
              parameters: {
                type: "object",
                properties: { value: { type: "string" } },
                required: ["value"],
                additionalProperties: false,
              },
            },
            { type: "file_search", vector_store_ids: ["vs_unsupported"] },
            { type: "code_interpreter", container: { type: "auto" } },
            { type: "computer_use_preview", display_width: 1024, display_height: 768, environment: "browser" },
          ],
          tool_choice: { type: "file_search" },
          top_logprobs: 1,
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.id, "resp_metadata");
      assert.equal(response.body.output[0].content[0].text, "ok");

      const claudeCode = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-tracevane-app-scope": "claude-code",
          "anthropic-version": "2023-06-01",
        },
        body: {
          model: "gpt-5.5",
          max_tokens: 128,
          metadata: {
            user_id: "claude-code-cli",
            session_id: "metadata-regression",
          },
          conversation: "conv_unsupported_claude_code",
          messages: [{ role: "user", content: "hello" }],
          stream: false,
        },
      });
      assert.equal(claudeCode.status, 200);
      assert.equal(claudeCode.body.id, "resp_metadata");
      assert.equal(claudeCode.body.content[0].text, "ok");

      const tokenCount = await requestJson(`${baseUrl}/v1/messages/count_tokens`, {
        method: "POST",
        headers: {
          "x-tracevane-app-scope": "claude-code",
          "anthropic-version": "2023-06-01",
        },
        body: {
          model: "gpt-5.4",
          system: [{ type: "text", text: "You are concise." }],
          messages: [{ role: "user", content: "Count this Claude Code prompt." }],
          tools: [{
            name: "read_file",
            description: "Read a file",
            input_schema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
          }],
        },
      });
      assert.equal(tokenCount.status, 200);
      assert.equal(typeof tokenCount.body.input_tokens, "number");
      assert.ok(tokenCount.body.input_tokens > 0);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  for (const upstreamCall of upstreamCalls) {
    assert.equal(upstreamCall.accountId, "acct_metadata");
    assert.equal(upstreamCall.authorization, "Bearer codex-metadata-access");
    const upstreamBody = JSON.parse(upstreamCall.body);
    assert.equal(upstreamBody.background, undefined);
    assert.equal(upstreamBody.frequency_penalty, undefined);
    assert.equal(upstreamBody.logprobs, undefined);
    assert.equal(upstreamBody.max_tool_calls, undefined);
    assert.equal(upstreamBody.metadata, undefined);
    assert.equal(upstreamBody.modalities, undefined);
    assert.equal(upstreamBody.n, undefined);
    assert.equal(upstreamBody.presence_penalty, undefined);
    assert.equal(upstreamBody.conversation, undefined);
    assert.equal(upstreamBody.prompt, undefined);
    assert.equal(upstreamBody.reasoning?.generate_summary, undefined);
    if (upstreamBody.reasoning !== undefined) {
      assert.equal(upstreamBody.reasoning?.summary, "concise");
    }
    assert.equal(upstreamBody.seed, undefined);
    assert.equal(upstreamBody.top_logprobs, undefined);
    assert.equal(JSON.stringify(upstreamBody).includes("cache_control"), false);
    assert.equal(upstreamBody.stream, true);
    assert.equal(upstreamBody.store, false);
    assert.ok(upstreamBody.include.includes("reasoning.encrypted_content"));
  }
  const directUpstreamBody = JSON.parse(upstreamCalls[0].body);
  assert.deepEqual(directUpstreamBody.input[0].content.slice(0, 4), [{
    type: "input_text",
    text: "hello",
  }, {
    type: "input_text",
    text: "chat-style text part",
  }, {
    type: "input_image",
    image_url: "data:image/png;base64,iVBORw0KGgo=",
    detail: "low",
  }, {
    type: "input_file",
    file_url: "https://example.test/readme.txt",
  }]);
  assert.equal(JSON.stringify(directUpstreamBody.input).includes("input_audio"), true);
  assert.equal(JSON.stringify(directUpstreamBody.input).includes("input_video"), true);
  assert.deepEqual(directUpstreamBody.tools, [{
    type: "function",
    name: "echo_probe",
    description: "Echo probe",
    parameters: {
      type: "object",
      properties: { value: { type: "string" } },
      required: ["value"],
      additionalProperties: false,
    },
  }]);
  assert.equal(directUpstreamBody.tool_choice, undefined);
  assert.equal(JSON.stringify(directUpstreamBody).includes("file_search"), true);
  assert.equal(JSON.stringify(directUpstreamBody).includes("code_interpreter"), true);
  assert.equal(JSON.stringify(directUpstreamBody).includes("computer_use_preview"), true);
});

test("model gateway strips Claude Code metadata from generic OpenAI Responses providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "generic-responses-metadata",
      name: "Generic Responses Metadata",
      enabled: true,
      category: "custom",
      appScopes: ["codex", "claude-code"],
      baseUrl: "https://responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: { defaultModel: "gpt-5.4", models: [{ id: "gpt-5.4" }] },
      endpoints: { openai_responses: "/responses" },
    },
    secret: { apiKey: "sk-generic-responses-metadata" },
    setActiveScopes: ["codex", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "resp_generic_metadata",
      object: "response",
      status: "completed",
      model: "gpt-5.4",
      output: [{ id: "msg_generic_metadata", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "metadata ok" }] }],
      usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const claudeCode = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "claude-code", "anthropic-version": "2023-06-01" },
        body: { model: "gpt-5.4", max_tokens: 128, metadata: { user_id: "claude-code-cli", session_id: "generic-responses-metadata" }, messages: [{ role: "user", content: "hello" }], stream: false },
      });
      assert.equal(claudeCode.status, 200);
      assert.equal(claudeCode.body.content[0].text, "metadata ok");

      const codex = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "codex" },
        body: { model: "gpt-5.4", input: "hello", metadata: { session_id: "direct-responses-metadata" }, stream: false },
      });
      assert.equal(codex.status, 200);
      assert.equal(codex.body.output[0].content[0].text, "metadata ok");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  for (const upstreamCall of upstreamCalls) {
    assert.equal(upstreamCall.url, "https://responses.example.test/v1/responses");
    assert.equal(upstreamCall.authorization, "Bearer sk-generic-responses-metadata");
    assert.equal(JSON.parse(upstreamCall.body).metadata, undefined);
  }
});

test("model gateway repairs stale raw Codex account catalog budgets on startup", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  fs.mkdirSync(path.dirname(paths.registry), { recursive: true });
  fs.writeFileSync(paths.registry, JSON.stringify({
    version: 1,
    updatedAt: new Date().toISOString(),
    clientAuth: { enabled: false },
    appConnectionProfile: {},
    activeProviders: { codex: "codex-raw-stale" },
    providers: [{
      id: "codex-raw-stale",
      name: "Codex Raw Stale",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{
          id: "gpt-5.5",
          aliases: ["gpt5.5"],
          contextWindow: 1050000,
          maxOutputTokens: 128000,
          pricing: {
            currency: "USD",
            inputPer1M: 5,
            outputPer1M: 30,
            longContextInputThreshold: 272000,
          },
        }],
      },
      accountProvider: {
        kind: "codex",
        routing: { strategy: "round-robin", sessionAffinity: true, maxConcurrentPerAccount: null },
        accounts: [{
          id: "codex-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef: "provider:codex-raw-stale:account:a:codex-token",
          credentialSource: "codex-device-auth",
          accountHash: "a",
          emailMasked: "co***@example.com",
          plan: "pro",
        }],
      },
    }, {
      id: "legacy-raw-provider",
      name: "Legacy Raw Provider Without Base URL",
      models: { defaultModel: "legacy-model", models: [{ id: "legacy-model", contextWindow: 999 }] },
    }],
  }, null, 2), "utf8");

  const service = createModelGatewayService(config);
  const gpt55 = service.listGatewayModels().data.find((model) => model.id === "gpt-5.5");
  assert.equal(gpt55.contextWindow, 272000);
  assert.equal(gpt55.maxOutputTokens, 128000);
  assert.equal(gpt55.pricing.longContextInputThreshold, undefined);

  const raw = JSON.parse(fs.readFileSync(paths.registry, "utf8"));
  const rawCodex = raw.providers.find((item) => item.id === "codex-raw-stale");
  const rawGpt55 = rawCodex.models.models.find((model) => model.id === "gpt-5.5");
  assert.equal(rawGpt55.contextWindow, 272000);
  assert.equal(rawGpt55.maxOutputTokens, 128000);
  assert.equal(rawGpt55.pricing.longContextInputThreshold, undefined);
  const rawGpt53Codex = rawCodex.models.models.find((model) => model.id === "gpt-5.3-codex");
  assert.deepEqual(rawGpt53Codex.aliases, ["gpt5.3-codex"]);
  assert.deepEqual(rawCodex.failover, { enabled: true, priority: 20, maxRetries: 1 });
  assert.equal(rawCodex.health.circuitState, "closed");
  assert.ok(raw.providers.find((item) => item.id === "legacy-raw-provider"));
});

test("model gateway treats Codex context length responses as request-scoped failures", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const authRef = "provider:codex-context:account:a:codex-token";
  const idToken = fakeJwt({
    email: "context@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_context",
      chatgpt_plan_type: "plus",
    },
  });
  const tokenBundle = JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: "codex-context-access",
      refresh_token: "codex-context-refresh",
      account_id: "acct_context",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-context",
      name: "Codex Context",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-context-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "context-a",
          emailMasked: "co***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRef]: {
        value: tokenBundle,
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response([
      "event: response.failed",
      `data: ${JSON.stringify({
        type: "response.failed",
        response: {
          id: "resp_context",
          status: "failed",
          error: {
            code: "context_length_exceeded",
            type: "invalid_request_error",
            message: "Your input exceeds the context window of this model. Please adjust your input and try again.",
          },
        },
      })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withTracevaneServer(ctx, async (baseUrl) => {
      for (let index = 0; index < 3; index += 1) {
        const response = await requestJson(`${baseUrl}/v1/responses`, {
          method: "POST",
          body: {
            model: "gpt-5.5",
            input: `too long ${index}`,
          },
        });
        assert.equal(response.status, 400);
        assert.equal(response.body.error.code, "context_length_exceeded");
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls, 3);
  const provider = ctx.services.modelGateway.listProviders().providers.find((item) => item.id === "codex-context");
  assert.equal(provider.health.circuitState, "closed");
  assert.equal(provider.health.consecutiveFailures, 0);
  assert.equal(provider.health.lastError, null);
  const runtime = ctx.services.modelGateway.getRuntime();
  assert.equal(runtime.runtime.requestLog.filter((entry) => entry.errorCode === "context_length_exceeded").length, 3);
});

test("model gateway preserves Claude-to-Codex streaming context errors as client errors", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const authRef = "provider:codex-claude-context:account:a:codex-token";
  const idToken = fakeJwt({
    email: "claude-context@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_claude_context",
      chatgpt_plan_type: "pro",
    },
  });
  const tokenBundle = JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: "codex-claude-context-access",
      refresh_token: "codex-claude-context-refresh",
      account_id: "acct_claude_context",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-claude-context",
      name: "Codex Claude Context",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["claude-code"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-claude-context-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "claude-context-a",
          emailMasked: "cl***@example.com",
          plan: "pro",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["claude-code"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRef]: {
        value: tokenBundle,
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: String(init.body || ""),
      accept: init.headers instanceof Headers ? init.headers.get("accept") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
    });
    return new Response([
      "event: response.failed",
      `data: ${JSON.stringify({
        type: "response.failed",
        response: {
          id: "resp_claude_context",
          status: "failed",
          error: {
            code: "context_length_exceeded",
            type: "invalid_request_error",
            message: "Your input exceeds the context window of this model. Please adjust your input and try again.",
          },
        },
      })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    await withTracevaneServer(ctx, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
        },
        body: {
          model: "gpt-5.5",
          max_tokens: 128,
          stream: true,
          system: [{ type: "text", text: "You are concise.", cache_control: { type: "ephemeral" } }],
          tools: [{
            name: "gateway_probe",
            description: "probe",
            input_schema: { type: "object", properties: { value: { type: "string" } } },
          }],
          tool_choice: { type: "auto" },
          messages: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
        },
      });
      assert.equal(response.status, 400);
      assert.equal(response.body.error.code, "context_length_exceeded");
      assert.match(response.body.error.message, /context window/);
      assert.equal(response.body.error.decision.provider.id, "codex-claude-context");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(upstreamCalls[0].accept, "text/event-stream");
  assert.equal(upstreamCalls[0].anthropicVersion, null);
  const upstreamBody = JSON.parse(upstreamCalls[0].body);
  assert.equal(upstreamBody.model, "gpt-5.5");
  assert.equal(upstreamBody.stream, true);
  assert.equal(upstreamBody.store, false);
  assert.ok(Array.isArray(upstreamBody.tools));
  assert.ok(Array.isArray(upstreamBody.input));

  const provider = ctx.services.modelGateway.listProviders().providers.find((item) => item.id === "codex-claude-context");
  assert.equal(provider.health.circuitState, "closed");
  assert.equal(provider.health.consecutiveFailures, 0);
  assert.equal(provider.health.lastError, null);
  const runtime = ctx.services.modelGateway.getRuntime();
  const entry = runtime.runtime.requestLog.find((item) => item.errorCode === "context_length_exceeded");
  assert.equal(entry.statusCode, 400);
  assert.equal(entry.routeId, "anthropic_messages");
  assert.equal(entry.providerId, "codex-claude-context");
});

test("model gateway returns structured unsupported for Codex account realtime websocket routes", async () => {
  const root = makeTempRoot();
  const ctx = createTracevaneContext({
    config: createTracevaneConfig(root),
    logger: createLogger(),
  });

  await withTracevaneServer(ctx, async (baseUrl) => {
    const readUnsupportedWebSocketPayload = (path) => new Promise((resolve, reject) => {
      const wsUrl = `ws${baseUrl.slice("http".length)}${path}`;
      const ws = new WebSocket(wsUrl, {
        headers: { authorization: "Bearer sk-tracevane-smoke-local" },
      });
      ws.once("message", (raw) => {
        resolve(JSON.parse(Buffer.from(raw).toString("utf8")));
        ws.close();
      });
      ws.once("error", reject);
    });

    const payload = await readUnsupportedWebSocketPayload("/v1/responses/ws");
    assert.equal(payload.type, "error");
    assert.equal(payload.error.code, "model_gateway_realtime_unsupported");
    assert.equal(payload.error.details.endpoint, "/v1/responses/ws");
    assert.match(payload.error.details.reference, /OpenAI documents Responses WebSocket mode/);
    assert.ok(payload.error.details.alternatives.some((item) => item.includes("verified WebSocket/WebRTC bridge")));

    const responsesPayload = await readUnsupportedWebSocketPayload("/v1/responses");
    assert.equal(responsesPayload.type, "error");
    assert.equal(responsesPayload.error.code, "model_gateway_realtime_unsupported");
    assert.equal(responsesPayload.error.details.endpoint, "/v1/responses#websocket");
    assert.match(responsesPayload.error.details.reference, /OpenAI documents Responses WebSocket mode/);

    const translationPayload = await readUnsupportedWebSocketPayload("/v1/realtime/translations");
    assert.equal(translationPayload.type, "error");
    assert.equal(translationPayload.error.code, "model_gateway_realtime_unsupported");
    assert.equal(translationPayload.error.details.endpoint, "/v1/realtime/translations");
    assert.match(translationPayload.error.details.reference, /Realtime voice, translation, and transcription sessions/);
  });
});

test("model gateway forwards OpenAI image edit multipart requests without rewriting binary bodies", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "image-provider",
      name: "Image Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://image.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-image-2",
        models: [{
          id: "gpt-image-2",
          features: {
            text: false,
            streaming: false,
            tools: false,
            vision: true,
            reasoning: false,
            responses: false,
            imageGeneration: true,
          },
        }],
      },
    },
    secret: {
      apiKey: "sk-image-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const boundary = "----tracevane-image-edit-boundary";
  const multipartBody = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="model"',
    "",
    "gpt-image-2",
    `--${boundary}`,
    'Content-Disposition: form-data; name="prompt"',
    "",
    "replace the background",
    `--${boundary}`,
    'Content-Disposition: form-data; name="image"; filename="source.png"',
    "Content-Type: image/png",
    "",
    "PNG\u0000\u0001tracevane-binary-image",
    `--${boundary}--`,
    "",
  ].join("\r\n"), "latin1");

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = Buffer.isBuffer(init.body)
      ? init.body
      : ArrayBuffer.isView(init.body)
        ? Buffer.from(init.body.buffer, init.body.byteOffset, init.body.byteLength)
      : Buffer.from(String(init.body || ""), "latin1");
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    upstreamCalls.push({
      url: String(url),
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      body,
    });
    return new Response(JSON.stringify({ created: 1710000002, data: [{ b64_json: "EDITED_IMAGE" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestRaw(`${baseUrl}/v1/images/edits`, {
        method: "POST",
        rawBody: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(response.body).data[0].b64_json, "EDITED_IMAGE");

      const status = await requestJson(`${baseUrl}/api/model-gateway/status`);
      assert.deepEqual(status.body.capabilities.openaiImagesEdits, ["/v1/images/edits"]);

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog[0].routeId, "openai_images_edits");
      assert.equal(runtime.body.runtime.requestLog[0].model, "gpt-image-2");
      assert.equal(runtime.body.runtime.requestLog[0].upstreamUrl, "https://image.example.test/v1/images/edits");
      assert.equal(runtime.body.runtime.requestLog[0].usage.imageEditRequests, 1);
      assert.equal(runtime.body.runtime.requestLog[0].usage.imagesGenerated, 1);
      assert.equal(runtime.body.usageSummary.usage.imageEditRequests, 1);
      assert.equal(runtime.body.usageSummary.usage.imagesGenerated, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://image.example.test/v1/images/edits");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-image-secret");
  assert.equal(upstreamCalls[0].contentType, `multipart/form-data; boundary=${boundary}`);
  assert.deepEqual(upstreamCalls[0].body, multipartBody);
});

test("model gateway forwards OpenAI audio multipart requests without rewriting binary bodies", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "audio-provider",
      name: "Audio Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://audio.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-4o-transcribe",
        models: [{
          id: "gpt-4o-transcribe",
          features: {
            text: false,
            streaming: false,
            tools: false,
            vision: false,
            reasoning: false,
            responses: false,
            audioInput: true,
            audioOutput: false,
          },
        }],
      },
    },
    secret: {
      apiKey: "sk-audio-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const boundary = "----tracevane-audio-boundary";
  const multipartBody = Buffer.from([
    `--${boundary}`,
    'Content-Disposition: form-data; name="model"',
    "",
    "gpt-4o-transcribe",
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="voice.wav"',
    "Content-Type: audio/wav",
    "",
    "RIFF\u0000\u0001tracevane-binary",
    `--${boundary}--`,
    "",
  ].join("\r\n"), "latin1");

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = Buffer.isBuffer(init.body)
      ? init.body
      : ArrayBuffer.isView(init.body)
        ? Buffer.from(init.body.buffer, init.body.byteOffset, init.body.byteLength)
      : Buffer.from(String(init.body || ""), "latin1");
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    upstreamCalls.push({
      url: String(url),
      authorization: headers.get("authorization"),
      contentType: headers.get("content-type"),
      body,
    });
    return new Response(JSON.stringify({ text: "audio ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestRaw(`${baseUrl}/v1/audio/transcriptions`, {
        method: "POST",
        rawBody: multipartBody,
        headers: {
          "content-type": `multipart/form-data; boundary=${boundary}`,
        },
      });
      assert.equal(response.status, 200);
      assert.equal(JSON.parse(response.body).text, "audio ok");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog[0].routeId, "openai_audio_transcriptions");
      assert.equal(runtime.body.runtime.requestLog[0].model, "gpt-4o-transcribe");
      assert.equal(runtime.body.runtime.requestLog[0].upstreamUrl, "https://audio.example.test/v1/audio/transcriptions");
      assert.equal(runtime.body.runtime.requestLog[0].usage.audioInputRequests, 1);
      assert.equal(runtime.body.usageSummary.usage.audioInputRequests, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://audio.example.test/v1/audio/transcriptions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-audio-secret");
  assert.equal(upstreamCalls[0].contentType, `multipart/form-data; boundary=${boundary}`);
  assert.deepEqual(upstreamCalls[0].body, multipartBody);
});

test("model gateway account pool preserves session affinity and enforces per-account concurrency", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const authRefA = "provider:codex-pool:account:a:codex-token";
  const authRefB = "provider:codex-pool:account:b:codex-token";
  const idTokenA = fakeJwt({
    email: "pool-a@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_pool_a",
      chatgpt_plan_type: "plus",
    },
  });
  const idTokenB = fakeJwt({
    email: "pool-b@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_pool_b",
      chatgpt_plan_type: "plus",
    },
  });
  const tokenBundle = (idToken, accessToken, refreshToken, accountId) => JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      account_id: accountId,
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-pool",
      name: "Codex Pool",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex", "claude-code"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: null,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
        aliases: {},
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: 1,
        },
        accounts: [{
          id: "codex-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef: authRefA,
          credentialSource: "codex-device-auth",
          accountHash: "a",
          emailMasked: "po***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }, {
          id: "codex-b",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef: authRefB,
          credentialSource: "codex-device-auth",
          accountHash: "b",
          emailMasked: "po***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex", "claude-code"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRefA]: {
        value: tokenBundle(idTokenA, "codex-pool-access-a", "codex-pool-refresh-a", "acct_pool_a"),
        createdAt: stamp,
        updatedAt: stamp,
      },
      [authRefB]: {
        value: tokenBundle(idTokenB, "codex-pool-access-b", "codex-pool-refresh-b", "acct_pool_b"),
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  const pendingResolvers = [];
  const sseResponse = (id, text = "ok") => [
    `data: ${JSON.stringify({
      type: "response.completed",
      response: {
        id,
        object: "response",
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text }],
        }],
      },
    })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      const requestBody = JSON.parse(String(init.body || "{}"));
      const input = requestBody.input;
      const text = typeof input === "string"
        ? input
        : input?.[0]?.content?.[0]?.text || input?.[0]?.content || "";
      upstreamCalls.push({
        accountId: headers.get("chatgpt-account-id"),
        authorization: headers.get("authorization"),
        text,
      });
      if (String(text).startsWith("hold")) {
        return await new Promise((resolve) => {
          pendingResolvers.push(() => resolve(new Response(sseResponse(`resp_${text}`), {
            status: 200,
            headers: { "content-type": "text/event-stream" },
          })));
        });
      }
      return new Response(sseResponse(`resp_${upstreamCalls.length}`), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const alpha1 = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "alpha" },
        body: { model: "gpt-5.5", input: "alpha one" },
      });
      const alpha2 = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "alpha" },
        body: { model: "gpt-5.5", input: "alpha two" },
      });
      const beta = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "beta" },
        body: { model: "gpt-5.5", input: "beta one" },
      });
      const claudeSession1 = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-tracevane-app-scope": "claude-code",
          "anthropic-version": "2023-06-01",
          "x-claude-code-session-id": "claude-session-alpha",
        },
        body: { model: "gpt-5.5", max_tokens: 16, messages: [{ role: "user", content: "claude session one" }] },
      });
      const claudeSession2 = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "x-tracevane-app-scope": "claude-code",
          "anthropic-version": "2023-06-01",
          "x-claude-code-session-id": "claude-session-alpha",
        },
        body: { model: "gpt-5.5", max_tokens: 16, messages: [{ role: "user", content: "claude session two" }] },
      });
      assert.equal(alpha1.status, 200);
      assert.equal(alpha2.status, 200);
      assert.equal(beta.status, 200);
      assert.equal(claudeSession1.status, 200);
      assert.equal(claudeSession2.status, 200);
      assert.equal(upstreamCalls[1].accountId, upstreamCalls[0].accountId);
      assert.notEqual(upstreamCalls[2].accountId, upstreamCalls[0].accountId);
      assert.equal(upstreamCalls[4].accountId, upstreamCalls[3].accountId);
      assert.equal(alpha1.headers["x-openclaw-model-gateway-account"], alpha2.headers["x-openclaw-model-gateway-account"]);
      assert.equal(claudeSession1.headers["x-openclaw-model-gateway-account"], claudeSession2.headers["x-openclaw-model-gateway-account"]);

      const holdA = requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "hold-a" },
        body: { model: "gpt-5.5", input: "hold one" },
      });
      const holdB = requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "hold-b" },
        body: { model: "gpt-5.5", input: "hold two" },
      });
      await waitFor(() => upstreamCalls.filter((call) => String(call.text).startsWith("hold")).length === 2);

      const busy = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "hold-c" },
        body: { model: "gpt-5.5", input: "hold three" },
      });
      assert.equal(busy.status, 429);
      assert.equal(busy.body.error.code, "model_gateway_account_pool_busy");
      assert.equal(upstreamCalls.filter((call) => call.text === "hold three").length, 0);

      for (const resolve of pendingResolvers.splice(0)) resolve();
      const [heldA, heldB] = await Promise.all([holdA, holdB]);
      assert.equal(heldA.status, 200);
      assert.equal(heldB.status, 200);

      const afterRelease = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "hold-c" },
        body: { model: "gpt-5.5", input: "after release" },
      });
      assert.equal(afterRelease.status, 200);

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      const accountIds = runtime.body.runtime.requestLog
        .filter((entry) => entry.routeId === "openai_responses" && entry.accountId)
        .map((entry) => entry.accountId);
      assert.ok(accountIds.includes("codex-a"));
      assert.ok(accountIds.includes("codex-b"));
      const accountRoutingEntries = runtime.body.runtime.requestLog
        .filter((entry) => entry.routeId === "openai_responses" && entry.accountRouting);
      assert.ok(accountRoutingEntries.some((entry) =>
        entry.accountRouting.selectedReason === "round-robin"
        && entry.accountRouting.cursorBefore === 0
        && entry.accountRouting.cursorAfter === 1,
      ));
      assert.ok(accountRoutingEntries.some((entry) =>
        entry.accountRouting.selectedReason === "sticky-affinity"
        && entry.accountRouting.affinityHit === true,
      ));
      const busyEntry = runtime.body.runtime.requestLog.find((entry) =>
        entry.errorCode === "model_gateway_account_pool_busy"
      );
      assert.ok(busyEntry);
      assert.equal(busyEntry.accountRouting.failureReason, "busy");
      assert.equal(busyEntry.accountRouting.accountCount, 2);
      assert.equal(busyEntry.accountRouting.readyCount, 2);
      assert.equal(busyEntry.accountRouting.capacityAvailableCount, 0);
      assert.equal(busyEntry.accountRouting.busyCount, 2);
      assert.deepEqual(
        busyEntry.accountRouting.skipped.map((item) => [item.accountId, item.reason, item.inFlight, item.capacityLimit]),
        [
          ["codex-a", "busy", 1, 1],
          ["codex-b", "busy", 1, 1],
        ],
      );
    });
  } finally {
    for (const resolve of pendingResolvers.splice(0)) resolve();
    globalThis.fetch = originalFetch;
  }
});

test("model gateway puts Codex accounts into cooldown on upstream quota failures", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const authRef = "provider:codex-quota:account:a:codex-token";
  const idToken = fakeJwt({
    email: "quota@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_quota",
      chatgpt_plan_type: "plus",
    },
  });
  const tokenBundle = JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: "codex-quota-access",
      refresh_token: "codex-quota-refresh",
      account_id: "acct_quota",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-quota",
      name: "Codex Quota",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: null,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
        aliases: {},
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: 1,
        },
        accounts: [{
          id: "codex-quota-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "quota-a",
          emailMasked: "qu***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRef]: {
        value: tokenBundle,
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      upstreamCalls.push(JSON.parse(String(init.body || "{}")));
      return new Response(JSON.stringify({
        error: {
          message: "quota exceeded",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "120",
        },
      });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const first = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: { model: "gpt-5.5", input: "first quota hit" },
      });
      assert.equal(first.status, 429);
      assert.equal(first.body.error.code, "rate_limit_exceeded");
      assert.equal(upstreamCalls.length, 1);

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "codex-quota");
      const account = provider.accountProvider.accounts[0];
      assert.equal(account.state, "cooldown");
      assert.equal(account.lastError, "quota exceeded");
      assert.ok(Date.parse(account.cooldownUntil) > Date.now() + 30_000);

      const second = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: { model: "gpt-5.5", input: "should not hit upstream" },
      });
      assert.equal(second.status, 503);
      assert.equal(upstreamCalls.length, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway marks expired Codex account cooldown retries in runtime diagnostics", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const authRef = "provider:codex-cooldown-retry:account:a:codex-token";
  const idToken = fakeJwt({
    email: "retry@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_retry",
      chatgpt_plan_type: "plus",
    },
  });
  const tokenBundle = JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: "codex-retry-access",
      refresh_token: "codex-retry-refresh",
      account_id: "acct_retry",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  const expiredCooldown = new Date(Date.now() - 5_000).toISOString();
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-cooldown-retry",
      name: "Codex Cooldown Retry",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: null,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
        aliases: {},
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: 1,
        },
        accounts: [{
          id: "codex-retry-a",
          kind: "codex",
          enabled: true,
          state: "cooldown",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "retry-a",
          emailMasked: "re***@example.com",
          plan: "plus",
          lastError: "quota exceeded",
          cooldownUntil: expiredCooldown,
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRef]: {
        value: tokenBundle,
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      upstreamCalls.push({
        accountId: headers.get("chatgpt-account-id"),
        body: JSON.parse(String(init.body || "{}")),
      });
      return new Response([
        `data: ${JSON.stringify({
          type: "response.completed",
          response: {
            id: "resp_cooldown_retry",
            object: "response",
            status: "completed",
            output: [{
              type: "message",
              role: "assistant",
              content: [{ type: "output_text", text: "retry ok" }],
            }],
          },
        })}`,
        "",
        "data: [DONE]",
        "",
      ].join("\n"), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const result = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: { model: "gpt-5.5", input: "retry after cooldown" },
      });
      assert.equal(result.status, 200);
      assert.equal(upstreamCalls.length, 1);
      assert.equal(upstreamCalls[0].accountId, "acct_retry");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      const entry = runtime.body.runtime.requestLog.find((item) => item.routeId === "openai_responses");
      assert.ok(entry);
      assert.equal(entry.outcome, "success");
      assert.equal(entry.accountId, "codex-retry-a");
      assert.equal(entry.accountRouting.selectedAccountId, "codex-retry-a");
      assert.equal(entry.accountRouting.selectedWasCooldownRetry, true);
      assert.equal(entry.accountRouting.selectedCooldownUntil, expiredCooldown);
      assert.equal(entry.accountRouting.selectedReason, "round-robin");
      assert.equal(entry.accountRouting.accountCount, 1);
      assert.equal(entry.accountRouting.readyCount, 1);
      assert.equal(entry.accountRouting.capacityAvailableCount, 1);
      assert.equal(entry.accountRouting.cooldownCount, 0);

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "codex-cooldown-retry");
      const account = provider.accountProvider.accounts[0];
      assert.equal(account.state, "ready");
      assert.equal(account.cooldownUntil, null);
      assert.equal(account.lastError, null);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway cools Codex accounts when streaming passthrough emits response.failed", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const authRef = "provider:codex-stream-quota:account:a:codex-token";
  const idToken = fakeJwt({
    email: "stream-quota@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_stream_quota",
      chatgpt_plan_type: "plus",
    },
  });
  const tokenBundle = JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: "codex-stream-quota-access",
      refresh_token: "codex-stream-quota-refresh",
      account_id: "acct_stream_quota",
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-stream-quota",
      name: "Codex Stream Quota",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: null,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
        aliases: {},
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: 1,
        },
        accounts: [{
          id: "codex-stream-quota-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "stream-quota-a",
          emailMasked: "st***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRef]: {
        value: tokenBundle,
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      upstreamCalls.push(JSON.parse(String(init.body || "{}")));
      const upstreamSse = [
        "event: response.created",
        "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_stream_quota\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-5.5\",\"output\":[],\"usage\":null}}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}",
        "",
        "event: response.failed",
        "data: {\"type\":\"response.failed\",\"response\":{\"id\":\"resp_stream_quota\",\"error\":{\"message\":\"quota exceeded\",\"type\":\"rate_limit_error\",\"code\":\"rate_limit_exceeded\"}}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: {
          "content-type": "text/event-stream",
          "retry-after": "180",
        },
      });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const first = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: { model: "gpt-5.5", input: "stream quota hit", stream: true },
      });
      assert.equal(first.status, 200);
      const events = parseSseEvents(first.body);
      assert.equal(events.find((item) => item.event === "response.output_text.delta").data.delta, "partial");
      assert.equal(events.find((item) => item.event === "response.failed").data.response.error.code, "rate_limit_exceeded");
      assert.equal(upstreamCalls.length, 1);

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "codex-stream-quota");
      const account = provider.accountProvider.accounts[0];
      assert.equal(account.state, "cooldown");
      assert.equal(account.lastError, "quota exceeded");
      assert.ok(Date.parse(account.cooldownUntil) > Date.now() + 30_000);

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "failure");
      assert.equal(runtime.body.runtime.requestLog[0].errorCode, "rate_limit_exceeded");

      const second = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: { model: "gpt-5.5", input: "should not hit upstream", stream: true },
      });
      assert.equal(second.status, 503);
      assert.equal(upstreamCalls.length, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway account pool persists routing affinity across service restart", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const authRefA = "provider:codex-persist:account:a:codex-token";
  const authRefB = "provider:codex-persist:account:b:codex-token";
  const idTokenA = fakeJwt({
    email: "persist-a@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_persist_a",
      chatgpt_plan_type: "plus",
    },
  });
  const idTokenB = fakeJwt({
    email: "persist-b@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_persist_b",
      chatgpt_plan_type: "plus",
    },
  });
  const tokenBundle = (idToken, accessToken, refreshToken, accountId) => JSON.stringify({
    type: "codex",
    tokens: {
      id_token: idToken,
      access_token: accessToken,
      refresh_token: refreshToken,
      account_id: accountId,
    },
    expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });

  const setupContext = () => createTracevaneContext({ config, logger: createLogger() });
  setupContext().services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-persist",
      name: "Codex Persist",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: null,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
        aliases: {},
      },
      endpoints: {
        openai_responses: "/responses",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef: authRefA,
          credentialSource: "codex-device-auth",
          accountHash: "a",
          emailMasked: "pe***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }, {
          id: "codex-b",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef: authRefB,
          credentialSource: "codex-device-auth",
          accountHash: "b",
          emailMasked: "pe***@example.com",
          plan: "plus",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRefA]: {
        value: tokenBundle(idTokenA, "codex-persist-access-a", "codex-persist-refresh-a", "acct_persist_a"),
        createdAt: stamp,
        updatedAt: stamp,
      },
      [authRefB]: {
        value: tokenBundle(idTokenB, "codex-persist-access-b", "codex-persist-refresh-b", "acct_persist_b"),
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  const sseResponse = (id) => [
    `data: ${JSON.stringify({
      type: "response.completed",
      response: {
        id,
        object: "response",
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        }],
      },
    })}`,
    "",
    "data: [DONE]",
    "",
  ].join("\n");
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      upstreamCalls.push({
        accountId: headers.get("chatgpt-account-id"),
        authorization: headers.get("authorization"),
      });
      return new Response(sseResponse(`resp_persist_${upstreamCalls.length}`), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(createTracevaneRequestHandler(setupContext(), { stripBasePath: "" }), async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "persist-alpha" },
        body: { model: "gpt-5.5", input: "first alpha" },
      });
      assert.equal(response.status, 200);
    });
    assert.equal(upstreamCalls[0].accountId, "acct_persist_a");
    const runtimeAfterFirst = JSON.parse(fs.readFileSync(paths.runtime, "utf8"));
    assert.ok(Object.values(runtimeAfterFirst.accountRouting.codexAffinities).includes("codex-a"));

    await withServer(createTracevaneRequestHandler(setupContext(), { stripBasePath: "" }), async (baseUrl) => {
      const sameSession = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "persist-alpha" },
        body: { model: "gpt-5.5", input: "second alpha after restart" },
      });
      const newSession = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-session-id": "persist-beta" },
        body: { model: "gpt-5.5", input: "first beta after restart" },
      });
      assert.equal(sameSession.status, 200);
      assert.equal(newSession.status, 200);
    });
    assert.equal(upstreamCalls[1].accountId, "acct_persist_a");
    assert.equal(upstreamCalls[2].accountId, "acct_persist_b");
    const runtimeAfterRestart = JSON.parse(fs.readFileSync(paths.runtime, "utf8"));
    assert.ok(Object.values(runtimeAfterRestart.accountRouting.codexAffinities).includes("codex-a"));
    assert.ok(Object.values(runtimeAfterRestart.accountRouting.codexAffinities).includes("codex-b"));
    assert.ok(Object.values(runtimeAfterRestart.accountRouting.codexCursors).some((value) => value >= 2));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway Codex account provider smoke uses account request normalization", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const service = createModelGatewayService(config);
  const authRef = "provider:codex-smoke:account:a:codex-token";
  const idToken = fakeJwt({
    email: "smoke@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_smoke",
      chatgpt_plan_type: "pro",
    },
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "codex-smoke",
      name: "Codex Smoke",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex", "opencode"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiKeyRef: null,
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
        aliases: {},
      },
      endpoints: {
        openai_responses: "/responses",
        openai_responses_compact: "/compact",
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-smoke-a",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef,
          credentialSource: "codex-device-auth",
          accountHash: "smoke-a",
          emailMasked: "sm***@example.com",
          plan: "pro",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex", "opencode"],
  });
  const stamp = new Date().toISOString();
  fs.mkdirSync(path.dirname(paths.secrets), { recursive: true });
  fs.writeFileSync(paths.secrets, `${JSON.stringify({
    version: 1,
    updatedAt: stamp,
    secrets: {
      [authRef]: {
        value: JSON.stringify({
          type: "codex",
          tokens: {
            id_token: idToken,
            access_token: "codex-smoke-access",
            refresh_token: "codex-smoke-refresh",
            account_id: "acct_smoke",
          },
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        }),
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
  }, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    upstreamCalls.push({
      url: String(url),
      authorization: headers.get("authorization"),
      accountId: headers.get("chatgpt-account-id"),
      accept: headers.get("accept"),
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response([
      `data: ${JSON.stringify({
        type: "response.completed",
        response: {
          id: "resp_provider_smoke",
          object: "response",
          status: "completed",
          output: [{
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "ok" }],
          }],
        },
      })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n"), {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  try {
    const result = await service.testProvider(undefined, "codex-smoke", {
      routeId: "openai_responses",
      model: "gpt-5.5",
      input: "Return ok.",
    });
    assert.equal(result.ok, true);
    assert.equal(result.statusCode, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://chatgpt.com/backend-api/codex/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer codex-smoke-access");
  assert.equal(upstreamCalls[0].accountId, "acct_smoke");
  assert.equal(upstreamCalls[0].accept, "text/event-stream");
  assert.equal(upstreamCalls[0].body.model, "gpt-5.5");
  assert.equal(upstreamCalls[0].body.stream, true);
  assert.equal(upstreamCalls[0].body.store, false);
  assert.deepEqual(upstreamCalls[0].body.include, ["reasoning.encrypted_content"]);
  assert.equal(Array.isArray(upstreamCalls[0].body.input), true);
});

test("model gateway refreshes expiring Codex account tokens before forwarding", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const authRef = "provider:codex-refresh:account:abc:codex-token";
  const expiredIdToken = fakeJwt({
    email: "refresh@example.com",
    exp: Math.floor(Date.now() / 1000) - 60,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_refresh",
      chatgpt_plan_type: "plus",
    },
  });
  const refreshedIdToken = fakeJwt({
    email: "refresh@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_refresh",
      chatgpt_plan_type: "plus",
    },
  });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  const refreshCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});

    if (String(url) === "https://auth.openai.com/oauth/token") {
      const form = new URLSearchParams(String(init.body));
      refreshCalls.push({
        grantType: form.get("grant_type"),
        clientId: form.get("client_id"),
        refreshToken: form.get("refresh_token"),
        scope: form.get("scope"),
      });
      return new Response(JSON.stringify({
        access_token: "codex-new-access-token",
        refresh_token: "codex-new-refresh-token",
        id_token: refreshedIdToken,
        expires_in: 3600,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      upstreamCalls.push({
        authorization: headers.get("authorization"),
        accountId: headers.get("chatgpt-account-id"),
        body: JSON.parse(String(init.body || "{}")),
      });
      return new Response(JSON.stringify({
        id: "resp_codex_refresh",
        object: "response",
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const upsert = await requestJson(`${baseUrl}/api/model-gateway/providers`, {
        method: "POST",
        body: {
          provider: {
            id: "codex-refresh",
            name: "Codex Refresh",
            enabled: true,
            category: "official",
            sourceType: "account-backed",
            appScopes: ["codex"],
            baseUrl: "https://chatgpt.com/backend-api/codex",
            apiKeyRef: authRef,
            apiFormat: "openai_responses",
            authStrategy: "oauth_proxy",
            models: {
              defaultModel: "gpt-5.5",
              models: [{ id: "gpt-5.5" }],
              aliases: {},
            },
            endpoints: {
              openai_responses: "/responses",
              openai_responses_compact: "/responses/compact",
            },
            accountProvider: {
              kind: "codex",
              routing: {
                strategy: "round-robin",
                sessionAffinity: true,
                maxConcurrentPerAccount: null,
              },
              accounts: [{
                id: "codex-abc",
                kind: "codex",
                enabled: true,
                state: "ready",
                authRef,
                credentialSource: "codex-device-auth",
                accountHash: "abc",
                emailMasked: "re***@example.com",
                plan: "plus",
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
              }],
            },
          },
          secret: {
            apiKey: JSON.stringify({
              type: "codex",
              tokens: {
                id_token: expiredIdToken,
                access_token: "codex-old-access-token",
                refresh_token: "codex-old-refresh-token",
                account_id: "acct_refresh",
              },
              email: "refresh@example.com",
              plan_type: "plus",
              expires_at: new Date(Date.now() - 60_000).toISOString(),
            }),
          },
          setActiveScopes: ["codex"],
        },
      });
      assert.equal(upsert.status, 200);

      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          input: "hello",
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.id, "resp_codex_refresh");

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "codex-refresh");
      assert.ok(provider);
      const account = provider.accountProvider.accounts[0];
      assert.equal(account.state, "ready");
      assert.equal(account.lastError, null);
      assert.ok(Date.parse(account.expiresAt) > Date.now());

      const secretsRaw = fs.readFileSync(paths.secrets, "utf8");
      assert.ok(secretsRaw.includes("codex-new-access-token"));
      assert.ok(secretsRaw.includes("codex-new-refresh-token"));
      assert.ok(!secretsRaw.includes("codex-old-access-token"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(refreshCalls, [{
    grantType: "refresh_token",
    clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
    refreshToken: "codex-old-refresh-token",
    scope: "openid profile email",
  }]);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].authorization, "Bearer codex-new-access-token");
  assert.equal(upstreamCalls[0].accountId, "acct_refresh");
});

test("model gateway manages Codex account enablement and manual refresh", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const paths = resolveModelGatewayPaths(config);
  const authRef = "provider:codex-manage:account:ghi:codex-token";
  const oldIdToken = fakeJwt({
    email: "manage@example.com",
    exp: Math.floor(Date.now() / 1000) + 3600,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_manage",
      chatgpt_plan_type: "plus",
    },
  });
  const refreshedIdToken = fakeJwt({
    email: "manage@example.com",
    exp: Math.floor(Date.now() / 1000) + 7200,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_manage",
      chatgpt_plan_type: "pro",
    },
  });

  const originalFetch = globalThis.fetch;
  const refreshCalls = [];
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});

    if (String(url) === "https://auth.openai.com/oauth/token") {
      const form = new URLSearchParams(String(init.body));
      refreshCalls.push({
        grantType: form.get("grant_type"),
        refreshToken: form.get("refresh_token"),
      });
      return new Response(JSON.stringify({
        access_token: "codex-manage-new-access",
        refresh_token: "codex-manage-new-refresh",
        id_token: refreshedIdToken,
        expires_in: 7200,
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    if (target.hostname === "chatgpt.com" && target.pathname === "/backend-api/codex/responses") {
      upstreamCalls.push({
        authorization: headers.get("authorization"),
        accountId: headers.get("chatgpt-account-id"),
      });
      return new Response(JSON.stringify({
        id: "resp_codex_manage",
        object: "response",
        status: "completed",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        }],
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const upsert = await requestJson(`${baseUrl}/api/model-gateway/providers`, {
        method: "POST",
        body: {
          provider: {
            id: "codex-manage",
            name: "Codex Manage",
            enabled: true,
            category: "official",
            sourceType: "account-backed",
            appScopes: ["codex"],
            baseUrl: "https://chatgpt.com/backend-api/codex",
            apiKeyRef: authRef,
            apiFormat: "openai_responses",
            authStrategy: "oauth_proxy",
            models: {
              defaultModel: "gpt-5.5",
              models: [{ id: "gpt-5.5" }],
              aliases: {},
            },
            endpoints: {
              openai_responses: "/responses",
            },
            accountProvider: {
              kind: "codex",
              routing: {
                strategy: "round-robin",
                sessionAffinity: true,
                maxConcurrentPerAccount: null,
              },
              accounts: [{
                id: "codex-ghi",
                kind: "codex",
                enabled: true,
                authRef,
                credentialSource: "codex-device-auth",
                accountHash: "ghi",
                emailMasked: "ma***@example.com",
                plan: "plus",
                state: "cooldown",
                lastError: "quota exceeded",
                cooldownUntil: new Date(Date.now() + 300_000).toISOString(),
                expiresAt: new Date(Date.now() + 3600_000).toISOString(),
              }],
            },
          },
          secret: {
            apiKey: JSON.stringify({
              type: "codex",
              tokens: {
                id_token: oldIdToken,
                access_token: "codex-manage-old-access",
                refresh_token: "codex-manage-old-refresh",
                account_id: "acct_manage",
              },
              email: "manage@example.com",
              plan_type: "plus",
              expires_at: new Date(Date.now() + 3600_000).toISOString(),
            }),
          },
          setActiveScopes: ["codex"],
        },
      });
      assert.equal(upsert.status, 200);

      const retried = await requestJson(`${baseUrl}/api/model-gateway/providers/codex-manage/accounts/codex-ghi`, {
        method: "POST",
        body: {
          clearCooldown: true,
          proxyUrl: "http://127.0.0.1:9911",
        },
      });
      assert.equal(retried.status, 200);
      assert.equal(retried.body.account.state, "ready");
      assert.equal(retried.body.account.lastError, null);
      assert.equal(retried.body.account.cooldownUntil, null);
      assert.equal(retried.body.account.proxyUrl, "http://127.0.0.1:9911");

      const direct = await requestJson(`${baseUrl}/api/model-gateway/providers/codex-manage/accounts/codex-ghi`, {
        method: "POST",
        body: { proxyUrl: null },
      });
      assert.equal(direct.status, 200);
      assert.equal(direct.body.account.proxyUrl, null);

      const disabled = await requestJson(`${baseUrl}/api/model-gateway/providers/codex-manage/accounts/codex-ghi`, {
        method: "POST",
        body: { enabled: false },
      });
      assert.equal(disabled.status, 200);
      assert.equal(disabled.body.account.enabled, false);
      assert.equal(disabled.body.account.state, "disabled");

      const unavailable = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          input: "hello",
        },
      });
      assert.equal(unavailable.status, 503);
      assert.equal(upstreamCalls.length, 0);

      const enabled = await requestJson(`${baseUrl}/api/model-gateway/providers/codex-manage/accounts/codex-ghi`, {
        method: "POST",
        body: { enabled: true },
      });
      assert.equal(enabled.status, 200);
      assert.equal(enabled.body.account.enabled, true);
      assert.equal(enabled.body.account.state, "ready");

      const refreshed = await requestJson(`${baseUrl}/api/model-gateway/providers/codex-manage/accounts/codex-ghi/refresh`, {
        method: "POST",
      });
      assert.equal(refreshed.status, 200);
      assert.equal(refreshed.body.refreshed, true);
      assert.equal(refreshed.body.account.state, "ready");
      assert.equal(refreshed.body.account.plan, "pro");

      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          input: "hello",
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.id, "resp_codex_manage");

      const secretsRaw = fs.readFileSync(paths.secrets, "utf8");
      assert.ok(secretsRaw.includes("codex-manage-new-access"));
      assert.ok(!secretsRaw.includes("codex-manage-old-access"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(refreshCalls, [{
    grantType: "refresh_token",
    refreshToken: "codex-manage-old-refresh",
  }]);
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].authorization, "Bearer codex-manage-new-access");
  assert.equal(upstreamCalls[0].accountId, "acct_manage");
});

test("model gateway marks Codex accounts as needs-login when token refresh is rejected", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const authRef = "provider:codex-refresh-fail:account:def:codex-token";
  const expiredIdToken = fakeJwt({
    email: "expired@example.com",
    exp: Math.floor(Date.now() / 1000) - 60,
    "https://api.openai.com/auth": {
      chatgpt_account_id: "acct_expired",
      chatgpt_plan_type: "plus",
    },
  });

  const originalFetch = globalThis.fetch;
  let upstreamCalled = false;
  globalThis.fetch = async (url, init = {}) => {
    const target = new URL(String(url));
    if (String(url) === "https://auth.openai.com/oauth/token") {
      const form = new URLSearchParams(String(init.body));
      assert.equal(form.get("grant_type"), "refresh_token");
      return new Response(JSON.stringify({
        error: "invalid_grant",
        code: "refresh_token_reused",
      }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }
    if (target.hostname === "chatgpt.com") {
      upstreamCalled = true;
    }
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const upsert = await requestJson(`${baseUrl}/api/model-gateway/providers`, {
        method: "POST",
        body: {
          provider: {
            id: "codex-refresh-fail",
            name: "Codex Refresh Fail",
            enabled: true,
            category: "official",
            sourceType: "account-backed",
            appScopes: ["codex"],
            baseUrl: "https://chatgpt.com/backend-api/codex",
            apiKeyRef: authRef,
            apiFormat: "openai_responses",
            authStrategy: "oauth_proxy",
            models: {
              defaultModel: "gpt-5.5",
              models: [{ id: "gpt-5.5" }],
              aliases: {},
            },
            endpoints: {
              openai_responses: "/responses",
            },
            accountProvider: {
              kind: "codex",
              routing: {
                strategy: "round-robin",
                sessionAffinity: true,
                maxConcurrentPerAccount: null,
              },
              accounts: [{
                id: "codex-def",
                kind: "codex",
                enabled: true,
                state: "ready",
                authRef,
                credentialSource: "codex-device-auth",
                accountHash: "def",
                emailMasked: "ex***@example.com",
                plan: "plus",
                expiresAt: new Date(Date.now() - 60_000).toISOString(),
              }],
            },
          },
          secret: {
            apiKey: JSON.stringify({
              type: "codex",
              tokens: {
                id_token: expiredIdToken,
                access_token: "codex-expired-access-token",
                refresh_token: "codex-expired-refresh-token",
                account_id: "acct_expired",
              },
              email: "expired@example.com",
              plan_type: "plus",
              expires_at: new Date(Date.now() - 60_000).toISOString(),
            }),
          },
          setActiveScopes: ["codex"],
        },
      });
      assert.equal(upsert.status, 200);

      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-5.5",
          input: "hello",
        },
      });
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, "model_gateway_account_refresh_auth_failed");

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "codex-refresh-fail");
      assert.ok(provider);
      const account = provider.accountProvider.accounts[0];
      assert.equal(account.state, "needs-login");
      assert.match(account.lastError, /refresh_token_reused/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalled, false);
});

test("model gateway refuses managed auth placeholders before upstream forwarding", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
          {
            id: "model-a",
            display_name: "Model A",
            context_length: 128000,
            max_output_tokens: 8192,
            input_modalities: ["text", "image"],
            supported_parameters: ["tools", "tool_choice", "stream", "reasoning_effort"],
            endpoints: ["/v1/responses"],
          },
          { id: "model-b", contextWindow: "256000", maxOutputTokens: "16384" },
          {
            id: "models-dev-shape",
            name: "Models.dev Shape",
            attachment: true,
            reasoning: true,
            tool_call: true,
            structured_output: true,
            modalities: { input: ["text", "image", "pdf"], output: ["text"] },
            limit: { context: 200000, output: 100000 },
            cost: { input: 2, output: 8, cache_read: 0.5, cache_write: 2 },
          },
          { id: "gpt-5.4-mini" },
          { id: "glm-5.2" },
          { id: "glm-5.2[1m]" },
          { id: "claude-opus-4-6" },
          "deepseek-reasoner",
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
      assert.equal(response.body.models.length, 8);
      assert.deepEqual(response.body.models.map((model) => model.id), [
        "model-a",
        "model-b",
        "models-dev-shape",
        "gpt-5.4-mini",
        "glm-5.2",
        "glm-5.2[1m]",
        "claude-opus-4-6",
        "deepseek-reasoner",
      ]);
      assert.deepEqual(
        response.body.models.map((model) => [model.contextWindow, model.maxOutputTokens]),
        [[128000, 8192], [256000, 16384], [200000, 100000], [400000, 128000], [1000000, 128000], [1000000, 128000], [1000000, 64000], [64000, 8000]],
      );
      assert.deepEqual(response.body.models[0].features, {
        text: true,
        streaming: true,
        tools: true,
        vision: true,
        reasoning: true,
        responses: true,
      });
      assert.deepEqual(response.body.models[2].features, {
        text: true,
        streaming: true,
        tools: true,
        vision: true,
        reasoning: true,
        responses: true,
      });
      assert.deepEqual(response.body.models[2].pricing, {
        currency: "USD",
        inputPer1M: 2,
        outputPer1M: 8,
        cacheReadPer1M: 0.5,
        cacheCreationPer1M: 2,
      });
      assert.deepEqual(response.body.models[3].features, {
        text: true,
        streaming: true,
        tools: true,
        vision: false,
        reasoning: true,
        responses: true,
      });
      assert.deepEqual(response.body.models[4].features, {
        text: true,
        streaming: true,
        tools: true,
        vision: false,
        reasoning: true,
        responses: true,
      });
      assert.deepEqual(response.body.models[5].features, {
        text: true,
        streaming: true,
        tools: true,
        vision: false,
        reasoning: true,
        responses: true,
      });
      assert.deepEqual(response.body.models[6].features, {
        text: true,
        streaming: true,
        tools: true,
        vision: false,
        reasoning: true,
        responses: true,
      });
      assert.deepEqual(response.body.models[7].features, {
        text: true,
        streaming: true,
        tools: false,
        vision: false,
        reasoning: true,
        responses: true,
      });
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

test("model gateway detect provider bounds oversized model list responses", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const target = new URL(String(url));
    if (target.pathname.endsWith("/models")) {
      return new Response("x".repeat((2 * 1024 * 1024) + 1), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not reached", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/api/model-gateway/detect-provider`, {
        method: "POST",
        body: {
          baseUrl: "https://oversized-models.example/v1",
          timeoutMs: 999999,
        },
      });

      assert.equal(response.status, 200);
      assert.equal(response.body.ok, true);
      assert.deepEqual(response.body.models, []);
      assert.equal(response.body.modelProbes.length, 1);
      assert.equal(response.body.modelProbes[0].ok, false);
      assert.equal(response.body.modelProbes[0].error.code, "model_gateway_detect_models_failed");
      assert.match(response.body.modelProbes[0].error.message, /exceeded 2097152 bytes/);
      assert.deepEqual(response.body.protocols.map((protocol) => protocol.skipped), [true, true, true]);
      assert.equal(fs.existsSync(paths.registry), false);
      assert.equal(fs.existsSync(paths.secrets), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway provider vision smoke requires image recognition without opening provider circuit", async () => {
  const root = makeTempRoot();
  const service = createModelGatewayService(createTracevaneConfig(root));
  service.upsertProvider(undefined, {
    provider: {
      id: "vision-chat",
      name: "Vision Chat",
      category: "openai-compatible",
      appScopes: ["openclaw"],
      baseUrl: "https://vision-chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "vision-model",
        models: [{ id: "vision-model", features: { text: true } }],
      },
    },
    secret: { apiKey: "sk-vision-test-secret" },
  });

  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  let responseContent = "red";
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl-vision",
      object: "chat.completion",
      choices: [{ message: { role: "assistant", content: responseContent } }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const passed = await service.testProvider(undefined, "vision-chat", {
      kind: "vision",
      routeId: "openai_chat_completions",
      model: "vision-model",
    });
    assert.equal(passed.ok, true);
    assert.equal(passed.responsePreview, "red");
    assert.equal(upstreamCalls[0].url, "https://vision-chat.example.test/v1/chat/completions");
    assert.equal(upstreamCalls[0].authorization, "Bearer sk-vision-test-secret");
    assert.deepEqual(upstreamCalls[0].body.messages[0].content[0], {
      type: "text",
      text: "Identify the dominant color of the attached test image. Reply with one lowercase color word.",
    });
    assert.equal(upstreamCalls[0].body.messages[0].content[1].type, "image_url");
    assert.match(upstreamCalls[0].body.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);

    responseContent = "I cannot inspect the image.";
    const failed = await service.testProvider(undefined, "vision-chat", {
      kind: "vision",
      routeId: "openai_chat_completions",
      model: "vision-model",
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.error.code, "model_gateway_provider_vision_smoke_failed");
    assert.match(failed.error.message, /protocol, endpoint, or model/);

    const provider = service.listProviders().providers.find((item) => item.id === "vision-chat");
    assert.equal(provider.health.consecutiveFailures, 0);
    assert.equal(provider.health.circuitState, "closed");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway routing contract selects app-scoped providers and preserves provider URL prefixes", () => {
  const root = makeTempRoot();
  const service = createModelGatewayService(createTracevaneConfig(root));

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
    { "x-tracevane-app-scope": "codex" },
  );
  assert.equal(codexChatOverride.appScope, "codex");
  assert.equal(codexChatOverride.provider?.id, "codex-chat");
});

test("model gateway model pools allow cross-provider duplicates but reject provider-local duplicates", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
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

test("model gateway endpoint profiles prefer native protocol and fall back by endpoint health", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);

  const provider = {
    id: "glm",
    name: "GLM",
    appScopes: ["codex", "claude-code", "opencode", "openclaw"],
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    models: {
      defaultModel: "glm-5.2",
      models: [{ id: "glm-5.2", aliases: ["glm-5.2[1m]"] }],
    },
    endpointProfiles: [
      {
        id: "coding-chat",
        name: "Coding Chat",
        appScopes: ["codex", "claude-code", "opencode", "openclaw"],
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        failover: { priority: 1 },
      },
      {
        id: "coding-anthropic",
        name: "Coding Anthropic",
        appScopes: ["claude-code"],
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        apiFormat: "anthropic_messages",
        authStrategy: "anthropic_api_key",
        endpoints: { anthropic_messages: "/v1/messages" },
        failover: { priority: 2 },
      },
    ],
  };

  service.upsertProvider(undefined, {
    provider,
    setActiveScopes: ["codex", "claude-code", "opencode", "openclaw"],
  });

  const claude = service.resolveRouteDecision("POST", "/v1/messages", {}, "glm-5.2[1m]");
  assert.equal(claude.provider?.id, "glm");
  assert.equal(claude.endpointProfile?.id, "coding-anthropic");
  assert.equal(claude.mode, "passthrough");
  assert.equal(claude.model?.resolved, "glm-5.2");
  assert.equal(claude.upstreamUrl, "https://open.bigmodel.cn/api/anthropic/v1/messages");

  const codex = service.resolveRouteDecision("POST", "/v1/responses", {}, "glm-5.2");
  assert.equal(codex.provider?.id, "glm");
  assert.equal(codex.endpointProfile?.id, "coding-chat");
  assert.equal(codex.mode, "adapter-required");
  assert.equal(codex.upstreamUrl, "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions");

  const chat = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "glm-5.2");
  assert.equal(chat.endpointProfile?.id, "coding-chat");
  assert.equal(chat.mode, "passthrough");

  service.upsertProvider(undefined, {
    provider: {
      ...provider,
      endpointProfiles: [
        provider.endpointProfiles[0],
        {
          ...provider.endpointProfiles[1],
          health: {
            circuitState: "open",
            lastFailureAt: new Date().toISOString(),
            lastError: "timeout",
            consecutiveFailures: 3,
          },
        },
      ],
    },
  });

  const fallback = service.resolveRouteDecision("POST", "/v1/messages", {}, "glm-5.2");
  assert.equal(fallback.endpointProfile?.id, "coding-chat");
  assert.equal(fallback.mode, "adapter-required");
  assert.match(fallback.failoverReason || "", /coding-anthropic.*fallback 'glm\/coding-chat'/);

  service.upsertProvider(undefined, {
    provider: {
      ...provider,
      endpointProfiles: [
        provider.endpointProfiles[0],
        {
          ...provider.endpointProfiles[1],
          health: {
            circuitState: "open",
            lastFailureAt: "2000-01-01T00:00:00.000Z",
            retryAfterUntil: "2000-01-01T00:00:01.000Z",
            lastError: "rate limited",
            consecutiveFailures: 1,
          },
        },
      ],
    },
  });

  const retryNative = service.resolveRouteDecision("POST", "/v1/messages", {}, "glm-5.2");
  assert.equal(retryNative.endpointProfile?.id, "coding-anthropic");
  assert.equal(retryNative.mode, "passthrough");
  assert.match(retryNative.failoverReason || "", /retry window elapsed/);
});

test("model gateway prefers native protocols without replacing the requested model", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "codex-account",
      name: "Codex Account",
      enabled: true,
      sourceType: "account-backed",
      appScopes: ["codex", "claude-code", "opencode", "openclaw"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }, { id: "shared-model" }],
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [{
          id: "codex-ready",
          kind: "codex",
          enabled: true,
          state: "ready",
          authRef: "provider:codex-account:account:ready:codex-token",
          credentialSource: "codex-device-auth",
          accountHash: "ready",
          emailMasked: "co***@example.com",
          plan: "pro",
          expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        }],
      },
    },
    setActiveScopes: ["codex", "claude-code", "opencode", "openclaw"],
  });

  service.upsertProvider(undefined, {
    provider: {
      id: "chat-native",
      name: "Chat Native",
      appScopes: ["opencode", "openclaw"],
      baseUrl: "https://chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "shared-model",
        models: [{ id: "shared-model" }],
      },
    },
  });

  service.upsertProvider(undefined, {
    provider: {
      id: "anthropic-native",
      name: "Anthropic Native",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic.example.test",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
      endpoints: { anthropic_messages: "/v1/messages" },
      models: {
        defaultModel: "shared-model",
        models: [{ id: "shared-model" }],
      },
    },
  });
  for (const scope of ["codex", "claude-code", "opencode", "openclaw"]) {
    service.setActiveProvider(undefined, {
      scope,
      providerId: "codex-account",
    });
  }

  const openclawShared = service.resolveRouteDecision("POST", "/v1/chat/completions", {
    "x-tracevane-app-scope": "openclaw",
  }, "shared-model");
  assert.equal(openclawShared.provider?.id, "chat-native");
  assert.equal(openclawShared.mode, "passthrough");
  assert.equal(openclawShared.model?.resolved, "shared-model");

  const claudeShared = service.resolveRouteDecision("POST", "/v1/messages", {
    "x-tracevane-app-scope": "claude-code",
  }, "shared-model");
  assert.equal(claudeShared.provider?.id, "anthropic-native");
  assert.equal(claudeShared.mode, "passthrough");
  assert.equal(claudeShared.model?.resolved, "shared-model");

  const openclawGpt55 = service.resolveRouteDecision("POST", "/v1/chat/completions", {
    "x-tracevane-app-scope": "openclaw",
  }, "gpt-5.5");
  assert.equal(openclawGpt55.provider?.id, "codex-account");
  assert.equal(openclawGpt55.mode, "adapter-required");
  assert.equal(openclawGpt55.model?.resolved, "gpt-5.5");
  assert.equal(openclawGpt55.failoverReason, null);

  const explicitCodexGpt55 = service.resolveRouteDecision("POST", "/v1/chat/completions", {
    "x-tracevane-app-scope": "openclaw",
  }, "codex-account/gpt-5.5");
  assert.equal(explicitCodexGpt55.provider?.id, "codex-account");
  assert.equal(explicitCodexGpt55.mode, "adapter-required");
  assert.equal(explicitCodexGpt55.model?.resolved, "gpt-5.5");
});

test("model gateway active route status resolves app-selected models instead of provider defaults", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "codex-account",
      name: "Codex Account",
      enabled: true,
      appScopes: ["codex", "claude-code", "opencode", "openclaw"],
      baseUrl: "https://codex.example.test",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
      },
    },
    setActiveScopes: ["codex"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "glm",
      name: "GLM",
      enabled: true,
      appScopes: ["claude-code", "opencode", "openclaw"],
      baseUrl: "https://glm.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "glm-4.5",
        models: [{ id: "glm-4.5" }],
      },
      endpointProfiles: [{
        id: "coding-chat",
        name: "Coding Chat",
        appScopes: ["opencode", "openclaw"],
        baseUrl: "https://glm-chat.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
      }, {
        id: "coding-anthropic",
        name: "Coding Anthropic",
        appScopes: ["claude-code"],
        baseUrl: "https://glm-anthropic.example.test",
        apiFormat: "anthropic_messages",
        authStrategy: "anthropic_api_key",
        endpoints: { anthropic_messages: "/v1/messages" },
      }],
    },
    setActiveScopes: ["claude-code", "opencode", "openclaw"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "anthropic-native",
      name: "Anthropic Native",
      enabled: true,
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic.example.test",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
      endpoints: { anthropic_messages: "/v1/messages" },
      models: {
        defaultModel: "claude-opus-4-8",
        models: [{ id: "claude-opus-4-8" }],
      },
    },
  });
  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: "gpt-5.5",
      appModels: {
        codex: "gpt-5.5",
        "claude-code": "claude-opus-4-8",
      },
    },
  });

  const routes = service.listProviders().activeRoutes;
  const codex = routes.find((route) => route.scope === "codex");
  assert.equal(codex?.selectedProviderId, "codex-account");
  assert.equal(codex?.resolvedProviderId, "codex-account");
  assert.equal(codex?.resolvedModel, "gpt-5.5");
  assert.equal(codex?.routeMode, "passthrough");

  const claude = routes.find((route) => route.scope === "claude-code");
  assert.equal(claude?.selectedProviderId, "glm");
  assert.equal(claude?.resolvedProviderId, "anthropic-native");
  assert.equal(claude?.resolvedModel, "claude-opus-4-8");
  assert.equal(claude?.routeMode, "passthrough");
  assert.equal(claude?.state, "fallback");

  const opencode = routes.find((route) => route.scope === "opencode");
  assert.equal(opencode?.selectedProviderId, "glm");
  assert.equal(opencode?.resolvedProviderId, "codex-account");
  assert.equal(opencode?.resolvedModel, "gpt-5.5");
  assert.equal(opencode?.routeMode, "adapter-required");
  assert.equal(opencode?.state, "fallback");

  const openclaw = routes.find((route) => route.scope === "openclaw");
  assert.equal(openclaw?.selectedProviderId, "glm");
  assert.equal(openclaw?.resolvedProviderId, "codex-account");
  assert.equal(openclaw?.resolvedModel, "gpt-5.5");
  assert.equal(openclaw?.routeMode, "adapter-required");
  assert.equal(openclaw?.state, "fallback");
});

test("model gateway responses to anthropic adapter uses native endpoint override", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "glm-anthropic",
      name: "GLM Anthropic",
      appScopes: ["codex"],
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
      endpoints: { anthropic_messages: "/v1/messages" },
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
    },
    secret: { apiKey: "sk-glm-anthropic" },
    setActiveScopes: ["codex"],
  });

  const decision = service.resolveRouteDecision("POST", "/v1/responses", {}, "glm-5.2");
  assert.equal(decision.provider?.id, "glm-anthropic");
  assert.equal(decision.routeId, "openai_responses");
  assert.equal(decision.mode, "adapter-required");
  assert.equal(decision.provider?.apiFormat, "anthropic_messages");
  assert.equal(decision.upstreamPath, "/v1/messages");
  assert.equal(decision.upstreamUrl, "https://open.bigmodel.cn/api/anthropic/v1/messages");
});

test("model gateway synthesizes responses sse for codex streams through anthropic providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "glm-anthropic-stream",
      name: "GLM Anthropic Stream",
      appScopes: ["codex"],
      baseUrl: "https://open.bigmodel.cn/api/anthropic",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
      endpoints: { anthropic_messages: "/v1/messages" },
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
    },
    secret: { apiKey: "sk-glm-anthropic-stream" },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "msg_glm_stream",
      type: "message",
      role: "assistant",
      model: "glm-5.2",
      content: [{ type: "text", text: "STREAM_OK" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 8, output_tokens: 3 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const streamed = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          input: "Reply STREAM_OK",
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
        "response.content_part.added",
        "response.output_text.delta",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      assert.equal(events[4].data.delta, "STREAM_OK");
      assert.equal(events[8].data.response.output[0].content[0].text, "STREAM_OK");
      assert.equal(events[9].data, "[DONE]");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://open.bigmodel.cn/api/anthropic/v1/messages");
  assert.equal(JSON.parse(upstreamCalls[0].body).stream, false);
});

test("model gateway endpoint profiles prefer same-provider model endpoint fallback", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);

  const provider = {
    id: "glm",
    name: "GLM",
    appScopes: ["openclaw"],
    baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
    apiFormat: "openai_chat",
    authStrategy: "bearer",
    failover: { priority: 10 },
    models: {
      defaultModel: "glm-5.2",
      models: [{ id: "glm-5.2" }],
    },
    endpointProfiles: [
      {
        id: "coding-chat-fast",
        name: "Coding Chat Fast",
        appScopes: ["openclaw"],
        baseUrl: "https://fast.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        failover: { priority: 1 },
      },
      {
        id: "coding-chat-backup",
        name: "Coding Chat Backup",
        appScopes: ["openclaw"],
        baseUrl: "https://backup.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        failover: { priority: 20 },
      },
    ],
  };

  service.upsertProvider(undefined, {
    provider,
    setActiveScopes: ["openclaw"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "external-fast",
      name: "External Fast",
      appScopes: ["openclaw"],
      baseUrl: "https://external.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      failover: { priority: 1 },
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
    },
  });

  const primary = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "glm-5.2");
  assert.equal(primary.provider?.id, "glm");
  assert.equal(primary.endpointProfile?.id, "coding-chat-fast");
  assert.equal(primary.mode, "passthrough");
  assert.equal(primary.upstreamUrl, "https://fast.example.test/v1/chat/completions");
  let listed = service.listProviders();
  let route = listed.activeRoutes.find((item) => item.scope === "openclaw");
  assert.equal(route?.state, "fixed");
  assert.equal(route?.resolvedProviderId, "glm");
  assert.equal(route?.resolvedEndpointProfileId, "coding-chat-fast");
  assert.equal(route?.resolvedEndpointProfileName, "Coding Chat Fast");
  assert.equal(route?.resolvedApiFormat, "openai_chat");
  assert.equal(route?.routeMode, "passthrough");
  assert.equal(route?.upstreamUrl, "https://fast.example.test/v1/chat/completions");
  assert.match(route?.message || "", /via endpoint 'Coding Chat Fast'/);

  service.upsertProvider(undefined, {
    provider: {
      ...provider,
      endpointProfiles: [
        {
          ...provider.endpointProfiles[0],
          health: {
            circuitState: "open",
            lastFailureAt: new Date().toISOString(),
            lastError: "timeout",
            consecutiveFailures: 3,
          },
        },
        provider.endpointProfiles[1],
      ],
    },
  });

  const fallback = service.resolveRouteDecision("POST", "/v1/chat/completions", {}, "glm-5.2");
  assert.equal(fallback.provider?.id, "glm");
  assert.equal(fallback.endpointProfile?.id, "coding-chat-backup");
  assert.equal(fallback.mode, "passthrough");
  assert.equal(fallback.upstreamUrl, "https://backup.example.test/v1/chat/completions");
  assert.match(fallback.failoverReason || "", /glm\/coding-chat-fast.*fallback 'glm\/coding-chat-backup'/);

  listed = service.listProviders();
  route = listed.activeRoutes.find((item) => item.scope === "openclaw");
  assert.equal(route?.state, "fallback");
  assert.equal(route?.selectedProviderId, "glm");
  assert.equal(route?.resolvedProviderId, "glm");
  assert.equal(route?.resolvedEndpointProfileId, "coding-chat-backup");
  assert.equal(route?.resolvedEndpointProfileName, "Coding Chat Backup");
  assert.equal(route?.resolvedApiFormat, "openai_chat");
  assert.equal(route?.routeMode, "passthrough");
  assert.equal(route?.upstreamUrl, "https://backup.example.test/v1/chat/completions");
  assert.match(route?.warning || "", /glm\/coding-chat-fast.*fallback 'glm\/coding-chat-backup'/);

  let status = service.getStatus();
  assert.equal(status.healthSummary.openCircuits, 1);
  assert.equal(status.healthSummary.degradedProviders, 1);
  assert.equal(status.healthSummary.okProviders, 2);

  service.upsertProvider(undefined, {
    provider: {
      ...provider,
      endpointProfiles: provider.endpointProfiles.map((profile) => ({
        ...profile,
        health: {
          circuitState: "open",
          lastFailureAt: new Date().toISOString(),
          lastError: "timeout",
          consecutiveFailures: 3,
        },
      })),
    },
  });

  status = service.getStatus();
  assert.equal(status.healthSummary.openCircuits, 2);
  assert.equal(status.healthSummary.degradedProviders, 1);
  assert.equal(status.healthSummary.okProviders, 1);
});

test("model gateway health summary does not treat recovered historical failures as degraded", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);

  service.upsertProvider(undefined, {
    provider: {
      id: "recovered-provider",
      name: "Recovered Provider",
      enabled: true,
      appScopes: ["openclaw"],
      sourceType: "api-key",
      apiFormat: "openai_chat",
      baseUrl: "https://recovered.example.test",
      authRef: null,
      models: {
        defaultModel: "recovered-model",
        models: [{ id: "recovered-model" }],
      },
      health: {
        circuitState: "closed",
        lastSuccessAt: new Date().toISOString(),
        lastFailureAt: new Date(Date.now() - 60_000).toISOString(),
        lastError: null,
        consecutiveFailures: 0,
      },
    },
  });

  const status = service.getStatus();
  assert.equal(status.healthSummary.okProviders, 1);
  assert.equal(status.healthSummary.degradedProviders, 0);
  assert.equal(status.healthSummary.openCircuits, 0);
});

test("model gateway forwards through endpoint profiles and updates endpoint health", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.updateClientAuth(undefined, { apiKey: "sk-local-endpoint-profile" });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "glm",
      name: "GLM",
      appScopes: ["openclaw"],
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
      endpointProfiles: [{
        id: "coding-chat",
        name: "Coding Chat",
        appScopes: ["openclaw"],
        baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        failover: { priority: 1 },
      }],
    },
    secret: { apiKey: "sk-upstream-endpoint-profile" },
    setActiveScopes: ["openclaw"],
  });

  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  let seenAuth = "";
  globalThis.fetch = async (url, init = {}) => {
    seenUrl = String(url);
    seenAuth = init.headers instanceof Headers ? init.headers.get("authorization") || "" : "";
    return new Response(JSON.stringify({
      id: "chatcmpl_endpoint_profile",
      choices: [{ message: { role: "assistant", content: "ok" } }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(createTracevaneRequestHandler(ctx), async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer sk-local-endpoint-profile" },
        body: {
          model: "glm-5.2",
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.equal(chat.status, 200);
      assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "glm");
      assert.equal(chat.headers["x-openclaw-model-gateway-endpoint"], "coding-chat");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(seenUrl, "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions");
  assert.equal(seenAuth, "Bearer sk-upstream-endpoint-profile");
  const listed = ctx.services.modelGateway.listProviders();
  const glm = listed.providers.find((provider) => provider.id === "glm");
  const endpoint = glm?.endpointProfiles.find((profile) => profile.id === "coding-chat");
  assert.equal(glm?.health.lastSuccessAt, null);
  assert.ok(endpoint?.health.lastSuccessAt);
  assert.equal(endpoint?.health.circuitState, "closed");
});

test("model gateway provider smoke health patch preserves raw provider records", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const service = createModelGatewayService(config);
  service.upsertProvider(undefined, {
    provider: {
      id: "glm-health-patch",
      name: "GLM Health Patch",
      appScopes: ["codex", "openclaw"],
      baseUrl: "https://glm-health.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "none",
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
    },
    setActiveScopes: ["codex"],
  });

  const raw = JSON.parse(fs.readFileSync(paths.registry, "utf8"));
  raw.providers.push({
    id: "legacy-codex-raw",
    name: "Legacy Codex Raw",
    enabled: true,
    category: "official",
    sourceType: "account-backed",
    appScopes: ["claude-code"],
    // Missing baseUrl intentionally simulates an older/bad record that the
    // normalized management view may skip. Runtime health writes must never
    // persist that filtered view back over the raw registry.
    apiFormat: "openai_responses",
    authStrategy: "oauth_proxy",
    models: {
      defaultModel: "gpt-5.5",
      models: [{ id: "gpt-5.5" }],
    },
    accountProvider: {
      kind: "codex",
      routing: {
        strategy: "round-robin",
        sessionAffinity: true,
        maxConcurrentPerAccount: null,
      },
      accounts: [{
        id: "legacy-account",
        kind: "codex",
        enabled: true,
        state: "ready",
        authRef: "provider:legacy-codex-raw:account:a:codex-token",
        credentialSource: "codex-device-auth",
      }],
    },
  });
  fs.writeFileSync(paths.registry, `${JSON.stringify(raw, null, 2)}\n`, { mode: 0o600 });

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "chatcmpl_health_patch",
    choices: [{ message: { role: "assistant", content: "ok" } }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    const result = await service.testProvider(undefined, "glm-health-patch", {
      kind: "protocol",
      model: "glm-5.2",
    });
    assert.equal(result.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const after = JSON.parse(fs.readFileSync(paths.registry, "utf8"));
  assert.deepEqual(after.providers.map((provider) => provider.id), [
    "glm-health-patch",
    "legacy-codex-raw",
  ]);
  const glm = after.providers.find((provider) => provider.id === "glm-health-patch");
  assert.equal(glm.health.circuitState, "closed");
  assert.ok(glm.health.lastSuccessAt);
  assert.equal(after.providers.find((provider) => provider.id === "legacy-codex-raw").name, "Legacy Codex Raw");
});

test("model gateway provider smoke can target a specific endpoint profile", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);
  service.upsertProvider(undefined, {
    provider: {
      id: "glm",
      name: "GLM",
      appScopes: ["codex", "claude-code", "opencode", "openclaw"],
      baseUrl: "https://open.bigmodel.cn/api/coding/paas/v4",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
      endpointProfiles: [{
        id: "coding-anthropic",
        name: "Coding Anthropic",
        appScopes: ["claude-code"],
        baseUrl: "https://open.bigmodel.cn/api/anthropic",
        apiFormat: "anthropic_messages",
        authStrategy: "anthropic_api_key",
        endpoints: { anthropic_messages: "/v1/messages" },
        failover: { priority: 1 },
      }],
    },
    secret: { apiKey: "sk-endpoint-profile-smoke" },
  });

  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  let seenApiKey = "";
  globalThis.fetch = async (url, init = {}) => {
    seenUrl = String(url);
    const headers = init.headers instanceof Headers ? init.headers : new Headers(init.headers || {});
    seenApiKey = headers.get("x-api-key") || "";
    return new Response(JSON.stringify({
      id: "msg_endpoint_smoke",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text: "ok" }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const result = await service.testProvider(undefined, "glm", {
      endpointProfileId: "coding-anthropic",
      routeId: "anthropic_messages",
      model: "glm-5.2",
      input: "Reply ok",
    });

    assert.equal(result.ok, true);
    assert.equal(result.route.endpointProfile?.id, "coding-anthropic");
    assert.equal(result.route.upstreamUrl, "https://open.bigmodel.cn/api/anthropic/v1/messages");
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(seenUrl, "https://open.bigmodel.cn/api/anthropic/v1/messages");
  assert.equal(seenApiKey, "sk-endpoint-profile-smoke");
  const listed = service.listProviders();
  const glm = listed.providers.find((provider) => provider.id === "glm");
  const endpoint = glm?.endpointProfiles.find((profile) => profile.id === "coding-anthropic");
  assert.equal(glm?.health.lastSuccessAt, null);
  assert.ok(endpoint?.health.lastSuccessAt);
});

test("model gateway probes open circuit provider after retry window for requested model", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
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

test("model gateway respects Retry-After when opening provider circuits", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "retry-after-primary",
      name: "Retry After Primary",
      appScopes: ["openclaw"],
      baseUrl: "https://retry-after-primary.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "retry-after-model",
        models: [{ id: "retry-after-model" }],
      },
      failover: { priority: 1 },
    },
    secret: { apiKey: "sk-retry-after-primary" },
    setActiveScopes: ["openclaw"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "retry-after-backup",
      name: "Retry After Backup",
      appScopes: ["openclaw"],
      baseUrl: "https://retry-after-backup.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "retry-after-model",
        models: [{ id: "retry-after-model" }],
      },
      failover: { priority: 2 },
    },
    secret: { apiKey: "sk-retry-after-backup" },
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
    });
    if (String(url).startsWith("https://retry-after-primary.example.test")) {
      return new Response(JSON.stringify({
        error: {
          message: "rate limited",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "120",
        },
      });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_retry_after_backup",
      choices: [{ message: { role: "assistant", content: "backup ok" } }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const first = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "retry-after-model",
          messages: [{ role: "user", content: "hit primary" }],
        },
      });
      assert.equal(first.status, 429);
      assert.equal(first.headers["x-openclaw-model-gateway-provider"], "retry-after-primary");

      let providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      let primary = providers.body.providers.find((item) => item.id === "retry-after-primary");
      assert.equal(primary.health.consecutiveFailures, 1);
      assert.equal(primary.health.circuitState, "open");
      assert.ok(Date.parse(primary.health.retryAfterUntil) > Date.now() + 30_000);

      const second = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "retry-after-model",
          messages: [{ role: "user", content: "fallback please" }],
        },
      });
      assert.equal(second.status, 200);
      assert.equal(second.headers["x-openclaw-model-gateway-provider"], "retry-after-backup");
      assert.equal(second.body.choices[0].message.content, "backup ok");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.providerId, entry.statusCode, entry.outcome, entry.errorCode]), [
        ["retry-after-primary", 429, "failure", "rate_limit_exceeded"],
        ["retry-after-backup", 200, "success", null],
      ]);

      providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      primary = providers.body.providers.find((item) => item.id === "retry-after-primary");
      const backup = providers.body.providers.find((item) => item.id === "retry-after-backup");
      assert.equal(primary.health.circuitState, "open");
      assert.equal(backup.health.circuitState, "closed");
      assert.equal(backup.health.consecutiveFailures, 0);
      assert.ok(backup.health.lastSuccessAt);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(upstreamCalls.map((item) => item.url), [
    "https://retry-after-primary.example.test/v1/chat/completions",
    "https://retry-after-backup.example.test/v1/chat/completions",
  ]);
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-retry-after-primary");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-retry-after-backup");
});

test("model gateway respects Retry-After when opening endpoint profile circuits", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "retry-after-endpoints",
      name: "Retry After Endpoints",
      appScopes: ["openclaw"],
      baseUrl: "https://retry-after-root.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "retry-after-model",
        models: [{ id: "retry-after-model" }],
      },
      endpointProfiles: [
        {
          id: "primary-chat",
          name: "Primary Chat",
          appScopes: ["openclaw"],
          baseUrl: "https://retry-after-endpoint-primary.example.test/v1",
          apiFormat: "openai_chat",
          authStrategy: "bearer",
          failover: { priority: 1 },
        },
        {
          id: "backup-chat",
          name: "Backup Chat",
          appScopes: ["openclaw"],
          baseUrl: "https://retry-after-endpoint-backup.example.test/v1",
          apiFormat: "openai_chat",
          authStrategy: "bearer",
          failover: { priority: 2 },
        },
      ],
      failover: { priority: 1 },
    },
    secret: { apiKey: "sk-retry-after-endpoint" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
    });
    if (String(url).startsWith("https://retry-after-endpoint-primary.example.test")) {
      return new Response(JSON.stringify({
        error: {
          message: "endpoint rate limited",
          type: "rate_limit_error",
          code: "rate_limit_exceeded",
        },
      }), {
        status: 429,
        headers: {
          "content-type": "application/json",
          "retry-after": "90",
        },
      });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_retry_after_endpoint_backup",
      choices: [{ message: { role: "assistant", content: "endpoint backup ok" } }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const first = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "retry-after-model",
          messages: [{ role: "user", content: "hit primary endpoint" }],
        },
      });
      assert.equal(first.status, 429);
      assert.equal(first.headers["x-openclaw-model-gateway-provider"], "retry-after-endpoints");
      assert.equal(first.headers["x-openclaw-model-gateway-endpoint"], "primary-chat");

      let providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      let provider = providers.body.providers.find((item) => item.id === "retry-after-endpoints");
      let primary = provider.endpointProfiles.find((item) => item.id === "primary-chat");
      let backup = provider.endpointProfiles.find((item) => item.id === "backup-chat");
      assert.equal(primary.health.consecutiveFailures, 1);
      assert.equal(primary.health.circuitState, "open");
      assert.ok(Date.parse(primary.health.retryAfterUntil) > Date.now() + 30_000);
      assert.equal(backup.health.circuitState, "closed");

      let status = await requestJson(`${baseUrl}/api/model-gateway/status`);
      assert.equal(status.body.healthSummary.openCircuits, 1);
      assert.equal(status.body.healthSummary.degradedProviders, 1);
      assert.equal(status.body.healthSummary.okProviders, 1);

      const second = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "retry-after-model",
          messages: [{ role: "user", content: "fallback endpoint please" }],
        },
      });
      assert.equal(second.status, 200);
      assert.equal(second.headers["x-openclaw-model-gateway-provider"], "retry-after-endpoints");
      assert.equal(second.headers["x-openclaw-model-gateway-endpoint"], "backup-chat");
      assert.equal(second.body.choices[0].message.content, "endpoint backup ok");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [
        entry.providerId,
        entry.endpointProfileId,
        entry.statusCode,
        entry.outcome,
        entry.errorCode,
      ]), [
        ["retry-after-endpoints", "primary-chat", 429, "failure", "rate_limit_exceeded"],
        ["retry-after-endpoints", "backup-chat", 200, "success", null],
      ]);

      providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      provider = providers.body.providers.find((item) => item.id === "retry-after-endpoints");
      primary = provider.endpointProfiles.find((item) => item.id === "primary-chat");
      backup = provider.endpointProfiles.find((item) => item.id === "backup-chat");
      assert.equal(primary.health.circuitState, "open");
      assert.equal(backup.health.circuitState, "closed");
      assert.equal(backup.health.consecutiveFailures, 0);
      assert.ok(backup.health.lastSuccessAt);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(upstreamCalls.map((item) => item.url), [
    "https://retry-after-endpoint-primary.example.test/v1/chat/completions",
    "https://retry-after-endpoint-backup.example.test/v1/chat/completions",
  ]);
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-retry-after-endpoint");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-retry-after-endpoint");
});

test("model gateway does not probe open circuits until Retry-After expires", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);
  const futureRetryAfter = new Date(Date.now() + 120_000).toISOString();
  const expiredRetryAfter = new Date(Date.now() - 1_000).toISOString();

  const provider = {
    id: "retry-after-only",
    name: "Retry After Only",
    appScopes: ["codex"],
    baseUrl: "https://retry-after-only.example.test/v1",
    apiFormat: "openai_responses",
    authStrategy: "bearer",
    models: {
      defaultModel: "retry-after-model",
      models: [{ id: "retry-after-model" }],
    },
    health: {
      circuitState: "open",
      lastFailureAt: new Date().toISOString(),
      retryAfterUntil: futureRetryAfter,
      lastError: "rate limited",
      consecutiveFailures: 1,
    },
    failover: { priority: 1 },
  };
  service.upsertProvider(undefined, {
    provider,
    setActiveScopes: ["codex"],
  });

  let decision = service.resolveRouteDecision("POST", "/v1/responses", {}, "retry-after-model");
  assert.equal(decision.mode, "missing-provider");
  assert.equal(decision.provider, null);
  assert.match(decision.reason || "", /no fallback provider is available yet/);

  service.upsertProvider(undefined, {
    provider: {
      ...provider,
      health: {
        ...provider.health,
        retryAfterUntil: expiredRetryAfter,
      },
    },
  });

  decision = service.resolveRouteDecision("POST", "/v1/responses", {}, "retry-after-model");
  assert.equal(decision.provider?.id, "retry-after-only");
  assert.match(decision.failoverReason || "", /retry window elapsed/);
});

test("model gateway exposes enabled provider model pool through OpenAI models endpoint", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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
  assert.deepEqual(direct.models.map((model) => model.id).sort(), ["a-only", "b-only", "shared-model"]);
  const shared = direct.data.find((model) => model.id === "shared-model");
  assert.equal(shared?.slug, "shared-model");
  assert.equal(shared?.display_name, "Shared");
  assert.equal(shared?.visibility, "list");
  assert.equal(shared?.shell_type, "shell_command");
  assert.equal(shared?.supported_in_api, true);
  assert.equal(shared?.priority, 5);
  assert.deepEqual(shared?.additional_speed_tiers, []);
  assert.deepEqual(shared?.service_tiers, []);
  assert.equal(shared?.supports_reasoning_summaries, false);
  assert.equal(shared?.default_reasoning_summary, "none");
  assert.equal(shared?.truncation_policy?.mode, "tokens");
  assert.deepEqual(shared?.input_modalities, ["text", "image"]);
  assert.deepEqual(shared?.supported_reasoning_levels, []);
  assert.equal(shared?.context_window, 64000);
  assert.equal(shared?.max_context_window, 64000);
  assert.equal(shared?.max_output_tokens, 4096);
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
  assert.ok(shared?.supportedGatewayRoutes.includes("openai_chat_completions"));
  assert.ok(shared?.supportedGatewayRoutes.includes("openai_responses"));
  assert.ok(shared?.supportedGatewayRoutes.includes("anthropic_messages"));
  assert.ok(shared?.supportedGatewayRoutes.includes("openai_responses_compact"));
  assert.equal(shared?.agentSelectable, true);
  assert.equal(shared?.endpointOnly, false);
  assert.equal(shared?.unsupportedGatewayRoutes.some((route) =>
    route.routeId === "openai_chat_completions"
    || route.routeId === "openai_responses"
    || route.routeId === "anthropic_messages"
  ), false);
  assert.equal(direct.data.find((model) => model.id === "a-only")?.contextWindow, 32000);
  assert.equal(direct.data.find((model) => model.id === "a-only")?.maxOutputTokens, 2048);
  assert.deepEqual(direct.data.find((model) => model.id === "a-only")?.features, {
    text: true,
    responses: true,
  });
  assert.ok(direct.data.find((model) => model.id === "a-only")?.supportedGatewayRoutes.includes("openai_chat_completions"));
  assert.deepEqual(direct.data.find((model) => model.id === "b-only")?.features, {
    vision: true,
    streaming: true,
  });
  assert.deepEqual(direct.data.find((model) => model.id === "b-only")?.healthyProviderIds, []);
  assert.deepEqual(direct.data.find((model) => model.id === "b-only")?.openCircuitProviderIds, ["models-b"]);
  assert.equal(direct.data.some((model) => model.id === "disabled-only"), false);

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  await withServer(handler, async (baseUrl) => {
    const response = await requestJson(`${baseUrl}/v1/models`);
    assert.equal(response.status, 200);
    assert.equal(response.body.object, "list");
    assert.deepEqual(response.body.data.map((model) => model.id).sort(), ["a-only", "b-only", "shared-model"]);
    assert.deepEqual(response.body.models.map((model) => model.id).sort(), ["a-only", "b-only", "shared-model"]);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.features.vision, true);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.slug, "shared-model");
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.display_name, "Shared");
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.contextWindow, 64000);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.maxOutputTokens, 4096);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.context_window, 64000);
    assert.equal(response.body.data.find((model) => model.id === "shared-model")?.max_output_tokens, 4096);
  });
});

test("model gateway client key protects client endpoints and stays separate from upstream secrets", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      assert.equal(missingAuth.body.error.code, "model_gateway_client_auth_required");
      assert.match(missingAuth.body.error.message, /configured local Gateway key/);
      assert.equal(missingAuth.headers["www-authenticate"], 'Bearer realm="Tracevane Gateway"');

      const wrongAuth = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { authorization: "Bearer sk-wrong-local" },
        body: { model: "auth-model", messages: [{ role: "user", content: "hello" }] },
      });
      assert.equal(wrongAuth.status, 401);
      assert.equal(wrongAuth.body.error.code, "model_gateway_client_auth_required");
      assert.match(wrongAuth.body.error.message, /configured local Gateway key/);

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

      const usageByGatewayKey = await requestJson(`${baseUrl}/api/model-gateway/usage?gatewayKey=sk-local-client-one&limit=20`);
      assert.equal(usageByGatewayKey.status, 200);
      assert.ok(usageByGatewayKey.body.totals.requestCount >= 1);
      assert.ok(usageByGatewayKey.body.models.some((model) => model.model === "auth-model" && model.requestCount >= 1));
      assert.ok(!JSON.stringify(usageByGatewayKey.body).includes("sk-local-client-one"));
      assert.equal("query" in usageByGatewayKey.body, false);
      assert.equal("entries" in usageByGatewayKey.body, false);

      const usageByGatewayKeyHash = await requestJson(`${baseUrl}/api/model-gateway/usage?gatewayKeyHash=${sha256Short("sk-local-client-one")}&limit=20`);
      assert.equal(usageByGatewayKeyHash.status, 200);
      assert.deepEqual(usageByGatewayKeyHash.body.models, usageByGatewayKey.body.models);

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
      assert.match(generated.body.revealedKey, /^sk-tracevane-/);
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
  const config = createTracevaneConfig(root);
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
        models: [
          { id: "gpt-main" },
          { id: "gpt-alt" },
          {
            id: "gpt-image-2",
            features: {
              text: false,
              streaming: false,
              tools: false,
              vision: true,
              reasoning: false,
              responses: true,
              imageGeneration: true,
            },
          },
        ],
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
  fs.writeFileSync(
    codexPath,
    [
      "model = \"old-model\"",
      "model_context_window = 950000",
      "model_auto_compact_token_limit = 783700",
      "",
      "[profiles.keep]",
      "model = \"keep-model\"",
      "model_context_window = 128000",
      "model_auto_compact_token_limit = 100000",
      "",
    ].join("\n"),
    "utf8",
  );
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
  assert.equal(preview.availableModels.includes("gpt-image-2"), false);
  assert.deepEqual(preview.connections.map((connection) => connection.id), ["codex", "claude-code", "opencode", "openclaw"]);
  assert.equal(preview.connections.every((connection) => connection.canApply), true);
  assert.equal(preview.connections.every((connection) => connection.canRollback), false);
  assert.equal(preview.connections.find((connection) => connection.id === "codex")?.model, "gpt-main");
  assert.equal(JSON.stringify(preview).includes("sk-local-app-connection"), false);
  assert.equal(JSON.stringify(preview).includes("sk-existing-opencode-secret"), false);
  assert.equal(JSON.stringify(preview).includes("existing-openclaw-token"), false);
  assert.equal(JSON.stringify(preview).includes("<TRACEVANE_GATEWAY_KEY>"), true);
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
  assert.match(codexConfig, /model_provider = "tracevane_gateway"/);
  assert.match(codexConfig, /model = "gpt-alt"/);
  assert.match(codexConfig, /model_catalog_json = ".*tracevane-gateway-models\.json"/);
  assert.match(codexConfig, /model_reasoning_effort = "high"/);
  const codexTopLevelConfig = codexConfig.split(/\n\[/)[0];
  assert.match(codexTopLevelConfig, /^model_context_window = 200000$/m);
  assert.match(codexTopLevelConfig, /^model_auto_compact_token_limit = 150000$/m);
  const codexCatalogPath = path.join(path.dirname(codexPath), "tracevane-gateway-models.json");
  const codexCatalog = JSON.parse(fs.readFileSync(codexCatalogPath, "utf8"));
  assert.deepEqual(codexCatalog.models.map((model) => model.id).sort(), ["gpt-alt", "gpt-main"]);
  assert.equal(codexCatalog.models.some((model) => model.id === "gpt-image-2"), false);
  assert.equal(codexCatalog.models.find((model) => model.id === "gpt-main").context_window, 128000);
  assert.match(codexConfig, /enable_request_compression = true/);
  assert.match(codexConfig, /\[model_providers\.tracevane_gateway\]/);
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
  assert.equal(claudeConfig.tracevaneGateway, undefined);
  assert.deepEqual(claudeConfig.hooks.Stop, []);

  service.applyAppConnection(undefined, { appId: "opencode" });
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
  assert.equal(opencodeConfig.model, "tracevane-gateway/gpt-alt");
  assert.equal(opencodeConfig.provider.existing.options.apiKey, "sk-existing-opencode-secret");
  assert.equal(opencodeConfig.provider["tracevane-gateway"].npm, "@ai-sdk/openai-compatible");
  assert.equal(opencodeConfig.provider["tracevane-gateway"].name, "Tracevane Gateway");
  assert.equal(opencodeConfig.provider["tracevane-gateway"].options.baseURL, "http://127.0.0.1:18796/v1");
  assert.equal(opencodeConfig.provider["tracevane-gateway"].options.apiKey, "sk-local-app-connection");
  assert.equal(opencodeConfig.provider["tracevane-gateway"].options.setCacheKey, true);
  assert.deepEqual(Object.keys(opencodeConfig.provider["tracevane-gateway"].models).sort(), ["gpt-alt", "gpt-main"]);
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-main"].contextWindow, 200000);
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-main"].maxOutputTokens, 8192);
  assert.deepEqual(opencodeConfig.provider["tracevane-gateway"].models["gpt-main"].limit, {
    context: 200000,
    output: 8192,
  });
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-main"].tool_call, true);
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-main"].reasoning, false);
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-main"].temperature, true);
  assert.equal(opencodeConfig.tracevaneGateway, undefined);

  service.applyAppConnection(undefined, { appId: "openclaw" });
  const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  assert.equal(openclawConfig.models.providers.existing.api, "openai-completions");
  assert.equal(openclawConfig.gateway.auth.token, "existing-openclaw-token");
  assert.equal(openclawConfig.models.providers["tracevane-gateway"].api, "openai-completions");
  assert.equal(openclawConfig.models.providers["tracevane-gateway"].baseUrl, "http://127.0.0.1:18796/v1");
  assert.equal(openclawConfig.models.providers["tracevane-gateway"].apiKey, "sk-local-app-connection");
  assert.deepEqual(openclawConfig.models.providers["tracevane-gateway"].models.map((model) => model.id), ["gpt-main", "gpt-alt"]);
  assert.equal(openclawConfig.models.providers["tracevane-gateway"].models[0].contextWindow, 200000);
  assert.equal(openclawConfig.models.providers["tracevane-gateway"].models[0].maxTokens, 8192);
  assert.equal(openclawConfig.agents.defaults.model.primary, "tracevane-gateway/gpt-main");
  assert.equal(openclawConfig.agents.defaults.thinkingDefault, "high");
  assert.equal(openclawConfig.tracevaneGateway, undefined);

  const applyAll = service.applyAppConnections(undefined);
  assert.equal(applyAll.applied.length, 4);
  assert.equal(applyAll.applied.every((item) => item.applied), true);

  const appliedPreview = service.listAppConnections();
  assert.equal(appliedPreview.connections.every((connection) => connection.configured), true);
  assert.equal(appliedPreview.connections.every((connection) => connection.canRollback), true);
  assert.equal(JSON.stringify(appliedPreview).includes("sk-local-app-connection"), false);
});

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupAppConnectionService() {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
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
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  const paths = resolveModelGatewayPaths(config);
  return { root, config, homeDir, service, codexPath, claudePath, paths };
}

test("model gateway app connection exposes currentContent for diff", () => {
  const { service, claudePath } = setupAppConnectionService();

  const before = service.listAppConnections();
  const claudeBefore = before.connections.find((connection) => connection.id === "claude-code");
  assert.equal(claudeBefore.target.exists, false);
  assert.equal(claudeBefore.currentContent, null);

  fs.writeFileSync(
    claudePath,
    `${JSON.stringify({ env: { EXISTING: "1", ANTHROPIC_API_KEY: "sk-secret-current" } }, null, 2)}\n`,
    "utf8",
  );

  const after = service.listAppConnections();
  const claudeAfter = after.connections.find((connection) => connection.id === "claude-code");
  assert.equal(claudeAfter.target.exists, true);
  assert.equal(typeof claudeAfter.currentContent, "string");
  assert.match(claudeAfter.currentContent, /"EXISTING": "1"/);
  // Secret in the on-disk file must be redacted in currentContent.
  assert.equal(claudeAfter.currentContent.includes("sk-secret-current"), false);
  assert.match(claudeAfter.currentContent, /<REDACTED>/);
});

test("model gateway lists app connection backups sorted newest-first", async () => {
  const { service, claudePath, paths } = setupAppConnectionService();
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { EXISTING: "1" } }, null, 2)}\n`, "utf8");

  assert.deepEqual(service.listAppConnectionBackups("claude-code").backups, []);

  service.applyAppConnection(undefined, { appId: "claude-code" });
  await sleepMs(5);
  service.applyAppConnection(undefined, { appId: "claude-code" });
  await sleepMs(5);
  service.applyAppConnection(undefined, { appId: "claude-code" });

  const listed = service.listAppConnectionBackups("claude-code");
  assert.equal(listed.ok, true);
  assert.equal(listed.appId, "claude-code");
  assert.equal(listed.backups.length, 3);
  assert.equal(listed.backups.every((backup) => backup.format === "json"), true);
  assert.equal(listed.backups.every((backup) => backup.size > 0), true);
  assert.equal(listed.backups.every((backup) => backup.id.startsWith("claude-code-") && backup.id.endsWith(".bak")), true);
  // Sorted newest-first.
  const createdAts = listed.backups.map((backup) => backup.createdAt);
  const sorted = [...createdAts].sort((left, right) => right.localeCompare(left));
  assert.deepEqual(createdAts, sorted);

  // Backups directory lives under the model gateway backups path.
  const backupDir = path.join(paths.backups, "app-connections");
  assert.equal(fs.existsSync(backupDir), true);
});

test("model gateway reads app connection backup redacted and rejects bad ids", () => {
  const { service, claudePath } = setupAppConnectionService();
  fs.writeFileSync(
    claudePath,
    `${JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-secret-backup" } }, null, 2)}\n`,
    "utf8",
  );
  service.applyAppConnection(undefined, { appId: "claude-code" });

  const backups = service.listAppConnectionBackups("claude-code").backups;
  assert.equal(backups.length, 1);
  const backupId = backups[0].id;

  const content = service.readAppConnectionBackup("claude-code", backupId);
  assert.equal(content.ok, true);
  assert.equal(content.appId, "claude-code");
  assert.equal(content.backupId, backupId);
  assert.equal(content.format, "json");
  assert.equal(content.redacted, true);
  // The pre-apply backup captured the original file containing the secret;
  // reading it back must redact the secret.
  assert.equal(content.content.includes("sk-secret-backup"), false);
  assert.match(content.content, /<REDACTED>/);

  // Path traversal and unknown ids are rejected with structured 404s.
  assert.throws(
    () => service.readAppConnectionBackup("claude-code", "../../../etc/passwd"),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 404,
  );
  assert.throws(
    () => service.readAppConnectionBackup("claude-code", "claude-code-../escape.bak"),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 404,
  );
  // Belongs to a different app id.
  assert.throws(
    () => service.readAppConnectionBackup("claude-code", "codex-2026-01-01T00-00-00-000Z.toml.bak"),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 404,
  );
  // Unknown app id.
  assert.throws(
    () => service.readAppConnectionBackup("not-an-app", backupId),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 404,
  );
});

test("model gateway rolls back to a specific backup and backs up current first", async () => {
  const { service, claudePath } = setupAppConnectionService();
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { VERSION: "original" } }, null, 2)}\n`, "utf8");

  // First apply backs up the "original" version.
  service.applyAppConnection(undefined, { appId: "claude-code" });
  await sleepMs(5);
  // Mutate the file to a "v2" then apply again (backs up "v2").
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { VERSION: "v2" } }, null, 2)}\n`, "utf8");
  service.applyAppConnection(undefined, { appId: "claude-code" });

  const backups = service.listAppConnectionBackups("claude-code").backups;
  assert.equal(backups.length, 2);
  // Oldest backup is the "original" version.
  const originalBackupId = backups[backups.length - 1].id;
  const originalBackupContent = service.readAppConnectionBackup("claude-code", originalBackupId).content;
  assert.match(originalBackupContent, /"VERSION": "original"/);

  const backupCountBefore = backups.length;
  const rollback = service.rollbackAppConnection(undefined, {
    appId: "claude-code",
    backupId: originalBackupId,
  });
  assert.equal(rollback.rolledBack, true);
  assert.equal(rollback.restoredFrom.endsWith(originalBackupId), true);
  assert.ok(rollback.backupPath && fs.existsSync(rollback.backupPath));

  // The restored file matches the original version.
  const restored = JSON.parse(fs.readFileSync(claudePath, "utf8"));
  assert.equal(restored.env.VERSION, "original");

  // Rollback backed up the current file first, so backup count grew.
  const backupsAfter = service.listAppConnectionBackups("claude-code").backups;
  assert.equal(backupsAfter.length, backupCountBefore + 1);

  // Unknown backup id is rejected.
  assert.throws(
    () => service.rollbackAppConnection(undefined, {
      appId: "claude-code",
      backupId: "claude-code-9999-99-99T99-99-99-999Z.json.bak",
    }),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 404,
  );
});

test("model gateway applies custom content and validates json", () => {
  const { service, claudePath } = setupAppConnectionService();
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { EXISTING: "1" } }, null, 2)}\n`, "utf8");

  const custom = `${JSON.stringify({ env: { CUSTOM: "yes" }, custom: true }, null, 2)}\n`;
  const applied = service.applyAppConnection(undefined, {
    appId: "claude-code",
    content: custom,
  });
  assert.equal(applied.applied, true);
  assert.ok(applied.backupPath && fs.existsSync(applied.backupPath));
  const onDisk = JSON.parse(fs.readFileSync(claudePath, "utf8"));
  assert.equal(onDisk.custom, true);
  assert.equal(onDisk.env.CUSTOM, "yes");
  // Written file is 0600.
  assert.equal(fs.statSync(claudePath).mode & 0o777, 0o600);

  // Invalid JSON for a json target is rejected, and the existing file is unchanged,
  // and no extra (broken) write happened.
  const backupsBefore = service.listAppConnectionBackups("claude-code").backups.length;
  assert.throws(
    () => service.applyAppConnection(undefined, {
      appId: "claude-code",
      content: "{ not valid json ",
    }),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 400,
  );
  const afterInvalid = JSON.parse(fs.readFileSync(claudePath, "utf8"));
  assert.equal(afterInvalid.custom, true);
  // Validation happens before backup-before-write, so no new backup was created.
  const backupsAfter = service.listAppConnectionBackups("claude-code").backups.length;
  assert.equal(backupsAfter, backupsBefore);

  // Empty content is rejected.
  assert.throws(
    () => service.applyAppConnection(undefined, { appId: "claude-code", content: "   " }),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 400,
  );
});

test("model gateway app connection backups are unique under rapid writes", () => {
  const { service, claudePath } = setupAppConnectionService();
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { N: "seed" } }, null, 2)}\n`, "utf8");

  // Five applies with no delay: same-millisecond timestamps must not collide /
  // overwrite. Each apply backs up the prior on-disk file before writing. Each
  // payload differs from the preceding on-disk content so none is a no-op.
  const backupPaths = [];
  for (let i = 0; i < 5; i += 1) {
    const result = service.applyAppConnection(undefined, {
      appId: "claude-code",
      content: `${JSON.stringify({ env: { N: i } }, null, 2)}\n`,
    });
    assert.equal(result.applied, true);
    assert.ok(result.backupPath);
    backupPaths.push(result.backupPath);
  }

  // All backup files are distinct on disk.
  const uniquePaths = new Set(backupPaths);
  assert.equal(uniquePaths.size, backupPaths.length);
  for (const backupPath of backupPaths) {
    assert.equal(fs.existsSync(backupPath), true);
  }

  const listed = service.listAppConnectionBackups("claude-code");
  assert.equal(listed.backups.length, 5);
  // Listing is newest-first; the most recent backup captured the N:4 write.
  const createdAts = listed.backups.map((backup) => backup.createdAt);
  const sorted = [...createdAts].sort((left, right) => right.localeCompare(left));
  assert.deepEqual(createdAts, sorted);
});

test("model gateway app connection backups are pruned to the retention cap", () => {
  const { service, claudePath } = setupAppConnectionService();
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { V: -1 } }, null, 2)}\n`, "utf8");

  // Far more applies than the retention cap (20).
  for (let i = 0; i < 25; i += 1) {
    service.applyAppConnection(undefined, {
      appId: "claude-code",
      content: `${JSON.stringify({ env: { V: i } }, null, 2)}\n`,
    });
  }

  const listed = service.listAppConnectionBackups("claude-code");
  // Pruned down to the cap.
  assert.equal(listed.backups.length, 20);

  // The newest backup captured the most recent pre-write file (V:23, backed up
  // before the final V:24 write). Oldest backups were pruned.
  const newest = service.readAppConnectionBackup("claude-code", listed.backups[0].id);
  assert.match(newest.content, /"V": 23/);
});

test("model gateway app connection rejects oversized custom content", () => {
  const { service, claudePath } = setupAppConnectionService();
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { EXISTING: "1" } }, null, 2)}\n`, "utf8");

  const backupsBefore = service.listAppConnectionBackups("claude-code").backups.length;
  // > 1 MiB of valid JSON.
  const big = `${JSON.stringify({ blob: "x".repeat(1024 * 1024 + 16) })}\n`;
  assert.throws(
    () => service.applyAppConnection(undefined, { appId: "claude-code", content: big }),
    (error) => error instanceof ModelGatewayServiceError
      && error.statusCode === 400
      && error.code === "model_gateway_app_connection_content_too_large",
  );
  // Rejected before any write/backup.
  const onDisk = JSON.parse(fs.readFileSync(claudePath, "utf8"));
  assert.equal(onDisk.env.EXISTING, "1");
  assert.equal(service.listAppConnectionBackups("claude-code").backups.length, backupsBefore);
});

test("model gateway app connection rejects unsafe toml content (conservative check)", () => {
  const { service, codexPath } = setupAppConnectionService();
  fs.writeFileSync(codexPath, "model = \"gpt-main\"\n", "utf8");

  const backupsBefore = service.listAppConnectionBackups("codex").backups.length;

  // NUL byte rejected.
  assert.throws(
    () => service.applyAppConnection(undefined, {
      appId: "codex",
      content: "model = \"a\"\n\u0000bad = true\n",
    }),
    (error) => error instanceof ModelGatewayServiceError
      && error.statusCode === 400
      && error.code === "model_gateway_app_connection_content_invalid_toml",
  );

  // Invalid UTF-8 replacement char rejected.
  assert.throws(
    () => service.applyAppConnection(undefined, {
      appId: "codex",
      content: "model = \"a\"\nbad = \"\uFFFD\"\n",
    }),
    (error) => error instanceof ModelGatewayServiceError
      && error.statusCode === 400
      && error.code === "model_gateway_app_connection_content_invalid_toml",
  );

  // Empty content rejected.
  assert.throws(
    () => service.applyAppConnection(undefined, { appId: "codex", content: "   " }),
    (error) => error instanceof ModelGatewayServiceError && error.statusCode === 400,
  );

  // No write/backup happened for any rejected payload.
  assert.equal(fs.readFileSync(codexPath, "utf8"), "model = \"gpt-main\"\n");
  assert.equal(service.listAppConnectionBackups("codex").backups.length, backupsBefore);

  // A well-formed TOML edit is accepted.
  const ok = service.applyAppConnection(undefined, {
    appId: "codex",
    content: "model = \"gpt-alt\"\ncustom = true\n",
  });
  assert.equal(ok.applied, true);
  assert.match(fs.readFileSync(codexPath, "utf8"), /custom = true/);
});

test("model gateway app connection no-op identical content skips write and backup", () => {
  const { service, claudePath } = setupAppConnectionService();
  const original = `${JSON.stringify({ env: { SAME: "yes" } }, null, 2)}\n`;
  // Seed on-disk with different bytes so the first apply genuinely writes.
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { SAME: "no" } }, null, 2)}\n`, "utf8");

  // Establish a known on-disk state by applying the bytes once.
  const first = service.applyAppConnection(undefined, { appId: "claude-code", content: original });
  assert.equal(first.applied, true);
  const backupsAfterFirst = service.listAppConnectionBackups("claude-code").backups.length;
  const mtimeBefore = fs.statSync(claudePath).mtimeMs;

  // Re-apply byte-identical content: must be a no-op (no backup, no rewrite).
  const second = service.applyAppConnection(undefined, { appId: "claude-code", content: original });
  assert.equal(second.applied, false);
  assert.equal(second.backupPath, null);
  assert.equal(second.ok, true);

  // No new backup created and file untouched.
  assert.equal(service.listAppConnectionBackups("claude-code").backups.length, backupsAfterFirst);
  assert.equal(fs.statSync(claudePath).mtimeMs, mtimeBefore);
});

test("model gateway app connections keep Codex reasoning effort for Gateway models", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const homeDir = path.join(root, "home");
  const service = createModelGatewayService(config, { homeDir });

  service.upsertProvider(undefined, {
    provider: {
      id: "claude-gateway",
      name: "Claude Gateway",
      appScopes: ["codex", "claude-code"],
      baseUrl: "https://claude.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "bearer",
      models: {
        defaultModel: "claude-opus-4-8",
        models: [{ id: "claude-opus-4-8" }],
      },
    },
    secret: { apiKey: "sk-upstream-claude-app" },
  });
  service.updateClientAuth(undefined, { apiKey: "sk-local-claude-app" });

  const codexPath = path.join(homeDir, ".codex", "config.toml");
  const claudePath = path.join(homeDir, ".claude", "settings.json");
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  fs.mkdirSync(path.dirname(claudePath), { recursive: true });
  fs.writeFileSync(
    codexPath,
    [
      "model = \"old-model\"",
      "model_reasoning_effort = \"xhigh\"",
      "",
      "[profiles.keep]",
      "model_reasoning_effort = \"high\"",
      "model = \"keep-model\"",
      "",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(claudePath, `${JSON.stringify({ env: { EXISTING: "1" } }, null, 2)}\n`, "utf8");

  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: "claude-opus-4-8",
      appModels: {
        codex: "claude-opus-4-8",
        "claude-code": "claude-opus-4-8",
      },
      reasoningEffort: "xhigh",
      contextWindow: 200000,
      autoCompactTokenLimit: 150000,
      maxOutputTokens: 64000,
    },
  });

  const codex = service.applyAppConnection(undefined, { appId: "codex" });
  assert.equal(codex.applied, true);
  const codexConfig = fs.readFileSync(codexPath, "utf8");
  const codexTopLevelConfig = codexConfig.split(/\n\[profiles\.keep\]/)[0];
  assert.match(codexConfig, /model_provider = "tracevane_gateway"/);
  assert.match(codexConfig, /model = "claude-opus-4-8"/);
  assert.match(codexTopLevelConfig, /^model_reasoning_effort = "xhigh"$/m);
  assert.match(codexConfig, /\[profiles\.keep\]/);
  assert.match(codexConfig, /model_reasoning_effort = "high"/);

  const claude = service.applyAppConnection(undefined, { appId: "claude-code" });
  assert.equal(claude.applied, true);
  const claudeConfig = JSON.parse(fs.readFileSync(claudePath, "utf8"));
  assert.equal(claudeConfig.env.EXISTING, "1");
  assert.equal(claudeConfig.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:18796");
  assert.equal(claudeConfig.env.ANTHROPIC_MODEL, "claude-opus-4-8");
  assert.equal(JSON.stringify(claudeConfig).includes("reasoning"), false);
});

test("model gateway app connections resolve budgets from each selected app model", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const homeDir = path.join(root, "home");
  const service = createModelGatewayService(config, { homeDir });

  service.upsertProvider(undefined, {
    provider: {
      id: "budget-provider",
      name: "Budget Provider",
      appScopes: ["codex", "opencode"],
      baseUrl: "https://budget.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-main",
        models: [
          { id: "gpt-main", contextWindow: 256000, maxOutputTokens: 128000 },
          { id: "gpt-small", aliases: ["small"], contextWindow: 64000, maxOutputTokens: 8192 },
        ],
      },
    },
    secret: { apiKey: "sk-upstream-budget" },
  });
  service.updateClientAuth(undefined, { apiKey: "sk-local-budget" });
  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: "gpt-main",
      appModels: {
        codex: "gpt-small",
        opencode: "small",
      },
      contextWindow: 300000,
      autoCompactTokenLimit: 250000,
      maxOutputTokens: 128000,
      protocolOptions: {
        codexResponsesWebsockets: false,
        codexResponsesWebsocketsV2: false,
        codexRequestCompression: false,
      },
    },
  });

  const codexPath = path.join(homeDir, ".codex", "config.toml");
  const opencodePath = path.join(homeDir, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  fs.mkdirSync(path.dirname(opencodePath), { recursive: true });
  fs.writeFileSync(codexPath, "", "utf8");
  fs.writeFileSync(opencodePath, "{}\n", "utf8");

  service.applyAppConnection(undefined, { appId: "codex" });
  const codexConfig = fs.readFileSync(codexPath, "utf8");
  assert.match(codexConfig, /model = "gpt-small"/);
  assert.match(codexConfig, /^model_context_window = 64000$/m);
  assert.match(codexConfig, /^model_auto_compact_token_limit = 57600$/m);

  service.applyAppConnection(undefined, { appId: "opencode" });
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
  assert.equal(opencodeConfig.model, "tracevane-gateway/small");
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-small"].contextWindow, 64000);
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-small"].maxOutputTokens, 8192);
});

test("model gateway app connections derive Codex auto compact from selected Codex account model window", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const homeDir = path.join(root, "home");
  const service = createModelGatewayService(config, { homeDir });

  service.upsertProvider(undefined, {
    provider: {
      id: "codex-account-compact-budget",
      name: "Codex Account Compact Budget",
      enabled: true,
      category: "official",
      sourceType: "account-backed",
      appScopes: ["codex"],
      baseUrl: "https://chatgpt.com/backend-api/codex",
      apiFormat: "openai_responses",
      authStrategy: "oauth_proxy",
      models: {
        defaultModel: "gpt-5.5",
        models: [
          { id: "gpt-5.5", contextWindow: 1050000, maxOutputTokens: 8192 },
          { id: "gpt-5.4", contextWindow: 272000, maxOutputTokens: 8192 },
        ],
      },
      accountProvider: {
        kind: "codex",
        routing: {
          strategy: "round-robin",
          sessionAffinity: true,
          maxConcurrentPerAccount: null,
        },
        accounts: [],
      },
    },
    setActiveScopes: ["codex"],
  });
  service.updateClientAuth(undefined, { apiKey: "sk-local-codex-compact-budget" });

  const codexPath = path.join(homeDir, ".codex", "config.toml");
  fs.mkdirSync(path.dirname(codexPath), { recursive: true });
  fs.writeFileSync(codexPath, "", "utf8");

  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: "gpt-5.5",
      appModels: { codex: "gpt-5.5" },
      contextWindow: null,
      autoCompactTokenLimit: null,
      maxOutputTokens: null,
    },
  });
  service.applyAppConnection(undefined, { appId: "codex" });
  let codexConfig = fs.readFileSync(codexPath, "utf8");
  assert.match(codexConfig, /model = "gpt-5\.5"/);
  assert.match(codexConfig, /^model_context_window = 244800$/m);
  assert.match(codexConfig, /^model_auto_compact_token_limit = 220320$/m);

  service.updateAppConnectionProfile(undefined, {
    profile: {
      appModels: { codex: "gpt-5.4" },
      contextWindow: null,
      autoCompactTokenLimit: null,
      maxOutputTokens: null,
    },
  });
  service.applyAppConnection(undefined, { appId: "codex" });
  codexConfig = fs.readFileSync(codexPath, "utf8");
  assert.match(codexConfig, /model = "gpt-5\.4"/);
  assert.match(codexConfig, /^model_context_window = 900000$/m);
  assert.match(codexConfig, /^model_auto_compact_token_limit = 810000$/m);
});

test("model gateway app connections keep per-model catalog budgets for mixed agent models", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const homeDir = path.join(root, "home");
  const service = createModelGatewayService(config, { homeDir });

  service.upsertProvider(undefined, {
    provider: {
      id: "mixed-agent-provider",
      name: "Mixed Agent Provider",
      appScopes: ["opencode", "openclaw"],
      baseUrl: "https://mixed.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-5.5",
        models: [
          { id: "gpt-5.5" },
          { id: "gpt-5.4-mini" },
          {
            id: "local-small",
            contextWindow: 64000,
            maxOutputTokens: 8192,
            features: { text: true, tools: true, vision: false, reasoning: false },
          },
        ],
      },
    },
    secret: { apiKey: "sk-upstream-mixed-agent" },
  });
  service.updateClientAuth(undefined, { apiKey: "sk-local-mixed-agent" });
  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: "gpt-5.5",
      appModels: {
        opencode: "gpt-5.5",
        openclaw: "gpt-5.5",
      },
    },
  });

  const opencodePath = path.join(homeDir, ".config", "opencode", "opencode.json");
  fs.mkdirSync(path.dirname(opencodePath), { recursive: true });
  fs.mkdirSync(path.dirname(config.openclawConfigFile), { recursive: true });
  fs.writeFileSync(opencodePath, "{}\n", "utf8");
  fs.writeFileSync(config.openclawConfigFile, "{}\n", "utf8");

  service.applyAppConnection(undefined, { appId: "opencode" });
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
  const opencodeModels = opencodeConfig.provider["tracevane-gateway"].models;
  assert.equal(opencodeModels["gpt-5.5"].contextWindow, 945000);
  assert.equal(opencodeModels["gpt-5.5"].maxOutputTokens, 128000);
  assert.equal(opencodeModels["gpt-5.5"].reasoning, true);
  assert.equal(opencodeModels["gpt-5.4-mini"].contextWindow, 360000);
  assert.equal(opencodeModels["gpt-5.4-mini"].maxOutputTokens, 128000);
  assert.equal(opencodeModels["local-small"].contextWindow, 57600);
  assert.equal(opencodeModels["local-small"].maxOutputTokens, 8192);
  assert.equal(opencodeModels["local-small"].reasoning, false);

  service.applyAppConnection(undefined, { appId: "openclaw" });
  const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
  const openclawModels = openclawConfig.models.providers["tracevane-gateway"].models;
  const gpt55 = openclawModels.find((model) => model.id === "gpt-5.5");
  const gpt54Mini = openclawModels.find((model) => model.id === "gpt-5.4-mini");
  const localSmall = openclawModels.find((model) => model.id === "local-small");
  assert.equal(gpt55.contextWindow, 945000);
  assert.equal(gpt55.maxTokens, 128000);
  assert.deepEqual(gpt55.input, ["text", "image"]);
  assert.equal(gpt55.reasoning, true);
  assert.equal(gpt54Mini.contextWindow, 360000);
  assert.equal(gpt54Mini.maxTokens, 128000);
  assert.deepEqual(gpt54Mini.input, ["text", "image"]);
  assert.equal(localSmall.contextWindow, 57600);
  assert.equal(localSmall.maxTokens, 8192);
  assert.deepEqual(localSmall.input, ["text"]);
  assert.equal(localSmall.reasoning, false);
});

test("model gateway app connections apply through HTTP routes against an isolated home", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const homeDir = path.join(root, "isolated-home");
  const ctx = createTracevaneContext({
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

  await withServer(createTracevaneRequestHandler(ctx), async (baseUrl) => {
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
    assert.equal(JSON.stringify(preview.body).includes("<TRACEVANE_GATEWAY_KEY>"), true);

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
    assert.match(codexConfig, /^model_context_window = 128000$/m);
    assert.match(codexConfig, /^model_auto_compact_token_limit = 100000$/m);

    const claudeConfig = JSON.parse(fs.readFileSync(claudePath, "utf8"));
    assert.equal(claudeConfig.env.KEEP, "claude");
    assert.equal(claudeConfig.env.ANTHROPIC_BASE_URL, "http://127.0.0.1:18796");
    assert.equal(claudeConfig.env.ANTHROPIC_API_KEY, "sk-local-isolated");
    assert.equal(claudeConfig.env.ANTHROPIC_MODEL, "model-a");

    const opencodeConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
    assert.equal(opencodeConfig.model, "tracevane-gateway/alias-b");
    assert.equal(opencodeConfig.provider.keep.options.apiKey, "sk-keep-opencode");
    assert.equal(opencodeConfig.provider["tracevane-gateway"].options.baseURL, "http://127.0.0.1:18796/v1");
    assert.equal(opencodeConfig.provider["tracevane-gateway"].options.apiKey, "sk-local-isolated");
    assert.deepEqual(Object.keys(opencodeConfig.provider["tracevane-gateway"].models).sort(), ["alias-b", "model-a", "model-b"]);

    const openclawConfig = JSON.parse(fs.readFileSync(config.openclawConfigFile, "utf8"));
    assert.equal(openclawConfig.gateway.auth.token, "keep-openclaw");
    assert.equal(openclawConfig.models.providers.keep.api, "openai-completions");
    assert.equal(openclawConfig.models.providers["tracevane-gateway"].baseUrl, "http://127.0.0.1:18796/v1");
    assert.equal(openclawConfig.models.providers["tracevane-gateway"].apiKey, "sk-local-isolated");
    assert.equal(openclawConfig.agents.defaults.model.primary, "tracevane-gateway/model-a");

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
    assert.equal(restoredOpenClawConfig.models.providers["tracevane-gateway"], undefined);
  });
});

test("model gateway app connections require a local client key before apply", () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
      endpointProfiles: [{
        id: "route-chat-fast",
        name: "Route Chat Fast",
        appScopes: ["codex"],
        baseUrl: "https://route-chat-fast.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        failover: { priority: 1 },
      }],
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
        "x-openclaw-model-gateway-endpoint": "route-chat-fast",
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
    assert.equal(result.route.endpointProfile?.id, "route-chat-fast");
    assert.equal(result.route.endpointProfile?.name, "Route Chat Fast");
    assert.equal(result.route.upstreamUrl, "https://route-chat-fast.example.test/v1/chat/completions");
    assert.match(seenUrl, /\/v1\/responses$/);
    assert.equal(seenHeaders.authorization, "Bearer sk-local-route-smoke");
    assert.equal(seenHeaders["x-tracevane-app-scope"], "codex");
    assert.equal(seenBody.model, "gpt-route");
    assert.match(seenBody.input, /GATEWAY_OK/);
    assert.equal(seenBody.max_output_tokens, 256);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway active route smoke preserves app-selected model when payload omits model", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);
  service.updateClientAuth(undefined, { apiKey: "sk-local-app-model-smoke" });
  service.upsertProvider(undefined, {
    provider: {
      id: "glm",
      name: "GLM",
      enabled: true,
      appScopes: ["claude-code"],
      baseUrl: "https://glm.example.test",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
      endpoints: { anthropic_messages: "/v1/messages" },
      models: {
        defaultModel: "glm-4.5",
        models: [{ id: "glm-4.5" }],
      },
    },
    secret: { apiKey: "sk-glm" },
    setActiveScopes: ["claude-code"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "codex-account",
      name: "Codex Account",
      enabled: true,
      appScopes: ["codex", "claude-code"],
      baseUrl: "https://codex.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      endpoints: { openai_responses: "/v1/responses" },
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
      },
    },
    secret: { apiKey: "sk-codex" },
    setActiveScopes: ["codex"],
  });
  service.updateAppConnectionProfile(undefined, {
    profile: {
      model: "gpt-5.5",
      appModels: {
        "claude-code": "gpt-5.5",
      },
    },
  });

  const originalFetch = globalThis.fetch;
  let seenBody = null;
  globalThis.fetch = async (_url, init = {}) => {
    seenBody = JSON.parse(String(init.body || "{}"));
    return new Response(JSON.stringify({
      id: "msg_app_model_smoke",
      type: "message",
      role: "assistant",
      model: "gpt-5.5",
      content: [{ type: "text", text: "GATEWAY_OK" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 1, output_tokens: 1 },
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-openclaw-model-gateway-provider": "codex-account",
      },
    });
  };

  try {
    const result = await service.testActiveRoute(undefined, {
      scope: "claude-code",
      input: "Reply with GATEWAY_OK",
    });
    assert.equal(result.ok, true);
    assert.equal(result.providerId, "codex-account");
    assert.equal(result.route.provider?.id, "codex-account");
    assert.equal(result.route.model?.requested, "gpt-5.5");
    assert.equal(result.route.model?.resolved, "gpt-5.5");
    assert.equal(seenBody?.model, "gpt-5.5");
    assert.notEqual(seenBody?.model, "glm-4.5");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway active route smoke uses Claude and OpenCode client tool contracts", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const service = createModelGatewayService(config);
  service.updateClientAuth(undefined, { apiKey: "sk-local-client-contract-smoke" });
  service.upsertProvider(undefined, {
    provider: {
      id: "claude-chat",
      name: "Claude Chat Adapter",
      appScopes: ["claude-code"],
      baseUrl: "https://chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
    },
    secret: { apiKey: "sk-upstream-claude-contract" },
    setActiveScopes: ["claude-code"],
  });
  service.upsertProvider(undefined, {
    provider: {
      id: "opencode-responses",
      name: "OpenCode Responses Adapter",
      appScopes: ["opencode"],
      baseUrl: "https://responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-5.5",
        models: [{ id: "gpt-5.5" }],
      },
    },
    secret: { apiKey: "sk-upstream-opencode-contract" },
    setActiveScopes: ["opencode"],
  });

  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/v1/messages")) {
      return new Response(JSON.stringify({
        id: "msg_route_smoke",
        type: "message",
        role: "assistant",
        model: "glm-5.2",
        content: [{ type: "text", text: "GATEWAY_OK" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-openclaw-model-gateway-provider": "claude-chat",
        },
      });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_route_smoke",
      object: "chat.completion",
      choices: [{
        message: { role: "assistant", content: "GATEWAY_OK" },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-openclaw-model-gateway-provider": "opencode-responses",
      },
    });
  };

  try {
    const claude = await service.testActiveRoute(undefined, {
      scope: "claude-code",
      model: "glm-5.2",
    });
    const opencode = await service.testActiveRoute(undefined, {
      scope: "opencode",
      model: "gpt-5.5",
    });
    assert.equal(claude.ok, true);
    assert.equal(opencode.ok, true);
    assert.equal(calls[0].body.model, "glm-5.2");
    assert.equal(calls[0].body.stream, true);
    assert.ok(Array.isArray(calls[0].body.tools));
    assert.equal(calls[0].body.tools[0].name, "gateway_smoke_tool");
    assert.deepEqual(calls[0].body.tool_choice, { type: "auto" });
    assert.equal(calls[1].body.model, "gpt-5.5");
    assert.ok(Array.isArray(calls[1].body.tools));
    assert.equal(calls[1].body.tools[0].function.name, "gateway_smoke_tool");
    assert.equal(calls[1].body.tool_choice, "auto");
    assert.equal("reasoning_effort" in calls[1].body, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway status separates embedded fallback from daemon lifecycle", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
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
  assert.equal(embeddedStatus.lifecycle.controlPlane.mode, "tracevane-api");
  assert.equal(embeddedStatus.lifecycle.controlPlane.embeddedGatewayActive, true);
  assert.equal(embeddedStatus.lifecycle.openclawMount.state, "configured");
  assert.equal(embeddedStatus.lifecycle.openclawMount.basePath, "/tracevane");
  assert.equal(embeddedStatus.lifecycle.openclawMount.endpoint, "http://127.0.0.1:31879/tracevane");
  assert.equal(embeddedStatus.lifecycle.openclawMount.ownsModelRelay, false);
  assert.equal(embeddedStatus.lifecycle.localDaemon.required, true);
  assert.equal(embeddedStatus.lifecycle.localDaemon.implementationStatus, "contract-only");
  assert.equal(embeddedStatus.lifecycle.localDaemon.state, "not-installed");
  assert.equal(embeddedStatus.lifecycle.localDaemon.runtimeMode, "tracevane-api-embedded");
  assert.equal(embeddedStatus.lifecycle.localDaemon.endpoint, "http://127.0.0.1:18796/v1");
  assert.equal(embeddedStatus.lifecycle.localDaemon.survivesControlPlaneCrash, false);
  assert.equal(embeddedStatus.lifecycle.localDaemon.supervisor.expected, expectedSupervisor);
  assert.equal(embeddedStatus.lifecycle.localDaemon.supervisor.active, null);
  assert.equal(embeddedStatus.lifecycle.localDaemon.supervisor.serviceName, "tracevane-model-gateway.service");
  assert.equal(embeddedStatus.lifecycle.localDaemon.paths.runtime, paths.daemonRuntime);
  assert.equal(embeddedStatus.lifecycle.localDaemon.paths.pid, paths.daemonPid);
  assert.equal(embeddedStatus.lifecycle.localDaemon.paths.lock, paths.portLock);
  assert.deepEqual(embeddedStatus.lifecycle.endpointPolicy, {
    preferredCliEndpoint: "http://127.0.0.1:18796/v1",
    openclawSinglePortEndpoint: "http://127.0.0.1:31879/tracevane",
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
      serviceName: "tracevane-model-gateway.service",
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

test("model gateway daemon service status probes supervisor by default", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const calls = [];
  const service = createModelGatewayService(config, {
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
      return { ...command, ok: true, exitCode: 0, stdout: "ok\n", stderr: "", error: null };
    },
  });

  const result = await service.getDaemonService();
  const statusCommands = result.plan.selectedTemplate.commands.status || [];

  assert.equal(result.action, "status");
  assert.equal(result.applied, true);
  assert.equal(result.serviceManager.checked, true);
  assert.equal(result.serviceManager.active, true);
  assert.equal(result.serviceManager.enabled, true);
  assert.deepEqual(calls, statusCommands.map((command) => `${command.command} ${command.args.join(" ")}`));
});

test("model gateway daemon service management exposes templates and guarded install", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });

  await withServer(handler, async (baseUrl) => {
    const status = await requestJson(`${baseUrl}/api/model-gateway/daemon-service`);
    assert.equal(status.status, 200);
    assert.equal(status.body.action, "status");
    assert.equal(status.body.applied, true);
    assert.equal(status.body.serviceManager.checked, true);
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

test("model gateway daemon service templates inherit proxy environment for supervised daemons", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const previous = {
    HTTPS_PROXY: process.env.HTTPS_PROXY,
    NO_PROXY: process.env.NO_PROXY,
    https_proxy: process.env.https_proxy,
    no_proxy: process.env.no_proxy,
  };
  process.env.HTTPS_PROXY = "http://127.0.0.1:18080";
  process.env.NO_PROXY = "localhost,127.0.0.1,::1";
  delete process.env.https_proxy;
  delete process.env.no_proxy;
  try {
    const service = createModelGatewayService(config);
    const plan = (await service.manageDaemonService(undefined, {
      action: "status",
      runCommands: false,
    })).plan;
    const systemd = plan.templates.find((item) => item.supervisor === "systemd-user");
    const launchd = plan.templates.find((item) => item.supervisor === "launchd-user");
    assert.ok(systemd);
    assert.ok(launchd);
    assert.match(systemd.template, /^Environment="HTTPS_PROXY=http:\/\/127\.0\.0\.1:18080"$/m);
    assert.match(systemd.template, /^Environment="NO_PROXY=localhost,127\.0\.0\.1,::1"$/m);
    assert.match(launchd.template, /<key>HTTPS_PROXY<\/key>\n    <string>http:\/\/127\.0\.0\.1:18080<\/string>/);
    assert.match(launchd.template, /<key>NO_PROXY<\/key>\n    <string>localhost,127\.0\.0\.1,::1<\/string>/);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (typeof value === "string") process.env[key] = value;
      else delete process.env[key];
    }
  }
});

test("model gateway daemon service management executes selected supervisor commands when requested", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
    serviceName: "tracevane-model-gateway.service",
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
  const config = createTracevaneConfig(root);
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
    assert.ok(Number.isInteger(runtime.body.runtime.requestLog[0].firstByteMs));
    assert.ok(runtime.body.runtime.requestLog[0].firstByteMs >= 0);
    assert.deepEqual(runtime.body.runtime.requestLog[0].usage, {
      inputTokens: 3,
      outputTokens: 2,
      totalTokens: 5,
      cacheReadTokens: 1,
      cacheCreationTokens: 0,
      imageGenerationRequests: 0,
      imagesGenerated: 0,
      imageEditRequests: 0,
      audioInputRequests: 0,
      audioOutputRequests: 0,
    });
    assert.equal(runtime.body.usageSummary.requestCount, 1);
    assert.equal(runtime.body.usageSummary.meteredRequestCount, 1);
    assert.equal(runtime.body.usageSummary.usage.totalTokens, 5);
    assert.equal(runtime.body.usageSummary.latency.firstByte.requestCount, 1);
    assert.ok(Number.isInteger(runtime.body.usageSummary.latency.firstByte.p95Ms));
    assert.deepEqual(
      runtime.body.usageSummary.byProvider.map((item) => [item.key, item.requestCount, item.usage.totalTokens]),
      [["daemon-chat", 1, 5]],
    );
    assert.deepEqual(
      runtime.body.usageSummary.byModel.map((item) => [item.label, item.requestCount, item.usage.totalTokens]),
      [["daemon-model", 1, 5]],
    );
    assert.ok(!JSON.stringify(runtime.body).includes("sk-daemon-secret-123456"));

    const statusAfterRequest = await requestJson(`${daemon.getBaseUrl()}/api/model-gateway/status`);
    assert.equal(statusAfterRequest.status, 200);
    assert.equal(statusAfterRequest.body.registry.paths.usageLedger, paths.usageLedger);
    assert.equal(statusAfterRequest.body.runtime.usageSummary.requestCount, 1);
    assert.equal(statusAfterRequest.body.runtime.usageSummary.usage.totalTokens, 5);

    const usageLedger = await requestJson(`${daemon.getBaseUrl()}/api/model-gateway/usage`);
    assert.equal(usageLedger.status, 200);
    assert.equal(usageLedger.body.readWindow.entryCount, 1);
    assert.equal(usageLedger.body.totals.requestCount, 1);
    assert.equal(usageLedger.body.totals.totalTokens, 5);
    assert.deepEqual(
      usageLedger.body.models.map((model) => [model.model, model.requestCount, model.totalTokens]),
      [["daemon-model", 1, 5]],
    );
    assert.equal(usageLedger.body.paths.ledger, paths.usageLedger);
    assert.equal(fs.existsSync(paths.usageLedger), true);
    assert.ok(!JSON.stringify(usageLedger.body).includes("sk-daemon-secret-123456"));
    assert.equal("entries" in usageLedger.body, false);
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

test("model gateway child daemon keeps serving after Tracevane API listener shuts down", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
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

  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
  const config = createTracevaneConfig(root);
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

  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const mountHandler = createTracevaneRequestHandler(ctx, { stripBasePath: "/tracevane" });
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

    const mountedStatus = await requestJson(`${mount.baseUrl}/tracevane/api/model-gateway/status`);
    assert.equal(mountedStatus.status, 200);
    assert.equal(mountedStatus.body.lifecycle.openclawMount.state, "configured");
    assert.equal(mountedStatus.body.lifecycle.openclawMount.basePath, "/tracevane");
    assert.equal(mountedStatus.body.lifecycle.openclawMount.ownsModelRelay, false);
    assert.equal(mountedStatus.body.lifecycle.endpointPolicy.directDaemonFallbackRequired, true);
    assert.equal(mountedStatus.body.lifecycle.endpointPolicy.targetModelRelayOwner, "local-daemon");

    await mount.close();
    mountClosed = true;
    await assert.rejects(() => requestJson(`${mount.baseUrl}/tracevane/api/model-gateway/status`));

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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
          server_tool_use: { web_search_requests: 1 },
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
        "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_chat_stream\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-native-responses\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Stream\"}]}],\"usage\":{\"input_tokens\":5,\"output_tokens\":2,\"total_tokens\":7,\"server_tool_use\":{\"web_search_requests\":1}}}}",
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
          content: [{
            type: "output_text",
            text: "Anthropic through Responses.",
            annotations: [{
              type: "url_citation",
              url: "https://example.test/source",
              title: "Source",
            }],
          }],
        }],
        usage: {
          input_tokens: 9,
          output_tokens: 4,
          total_tokens: 13,
          server_tool_use: { web_search_requests: 1 },
        },
        service_tier: "priority",
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
        "event: response.output_text.annotation.added",
        "data: {\"type\":\"response.output_text.annotation.added\",\"item_id\":\"msg_resp_anthropic_stream\",\"output_index\":0,\"content_index\":0,\"annotation_index\":0,\"annotation\":{\"type\":\"url_citation\",\"url\":\"https://example.test/stream-source\",\"title\":\"Stream Source\"}}",
        "",
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_anthropic_stream\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-native-responses\",\"output\":[{\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"Anthropic stream\"}]}],\"usage\":{\"input_tokens\":6,\"output_tokens\":2,\"total_tokens\":8,\"server_tool_use\":{\"web_search_requests\":1}},\"service_tier\":\"priority\"}}",
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
      assert.equal(responses.status, 200, responses.body);
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
            {
              role: "user",
              content: [
                { type: "text", text: "chat please" },
                { type: "image_url", image_url: { url: "https://example.test/chart.png", detail: "high" } },
              ],
            },
            {
              role: "assistant",
              content: "I will save a note.",
              reasoning_details: [{
                id: "rs_chat_history",
                type: "reasoning",
                status: "completed",
                summary: [{ type: "summary_text", text: "Need to save a durable note." }],
                encrypted_content: "encrypted-chat-history-reasoning",
              }],
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
          }, {
            type: "web_search_preview",
            search_context_size: "low",
          }],
          tool_choice: { type: "function", function: { name: "save_note" } },
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "note_result",
              schema: {
                type: "object",
                properties: { ok: { type: "boolean" } },
                required: ["ok"],
                additionalProperties: false,
              },
              strict: true,
            },
          },
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
        server_tool_use: { web_search_requests: 1 },
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
        server_tool_use: { web_search_requests: 1 },
      });
      assert.equal(streamingEvents[4].data, "[DONE]");

      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          max_tokens: 32,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "anthropic please" },
                {
                  type: "document",
                  source: { type: "url", url: "https://example.test/spec.pdf" },
                  title: "spec.pdf",
                },
              ],
            },
            {
              role: "assistant",
              content: [{ type: "tool_use", id: "call_lookup", name: "lookup", input: { query: "docs" } }],
            },
            {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: "call_lookup", is_error: true, content: "done" },
                { type: "text", text: "continue after tool result" },
              ],
            },
          ],
          tools: [{
            name: "lookup",
            description: "Lookup docs",
            input_schema: {
              type: "object",
              properties: { query: { type: "string" } },
            },
          }],
          tool_choice: { type: "auto", disable_parallel_tool_use: true },
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
        citations: [{
          type: "web_search_result_location",
          url: "https://example.test/source",
          title: "Source",
          output_index: 0,
          content_index: 0,
        }],
      }]);
      assert.equal(messages.body.stop_reason, "end_turn");
      assert.deepEqual(messages.body.usage, {
        input_tokens: 9,
        output_tokens: 4,
        cache_read_input_tokens: 0,
        server_tool_use: { web_search_requests: 1 },
        service_tier: "priority",
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
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
      assert.equal(messageStreamEvents[0].data.message.id, "msg_resp_anthropic_stream");
      assert.equal(messageStreamEvents[2].data.delta.text, "Anthropic ");
      assert.equal(messageStreamEvents[3].data.delta.text, "stream");
      assert.deepEqual(messageStreamEvents[4].data.delta, {
        type: "citations_delta",
        citation: {
          type: "web_search_result_location",
          url: "https://example.test/stream-source",
          title: "Stream Source",
        },
      });
      assert.equal(messageStreamEvents[6].data.delta.stop_reason, "end_turn");
      assert.deepEqual(messageStreamEvents[6].data.usage, {
        output_tokens: 2,
        server_tool_use: { web_search_requests: 1 },
        service_tier: "priority",
      });

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
      {
        role: "user",
        content: [
          { type: "input_text", text: "chat please" },
          { type: "input_image", image_url: "https://example.test/chart.png", detail: "high" },
        ],
      },
      {
        id: "rs_chat_history",
        type: "reasoning",
        status: "completed",
        summary: [{ type: "summary_text", text: "Need to save a durable note." }],
        encrypted_content: "encrypted-chat-history-reasoning",
      },
      { role: "assistant", content: [{ type: "output_text", text: "I will save a note." }] },
      {
        type: "function_call",
        id: "fc_call_note",
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
    }, {
      type: "web_search_preview",
      search_context_size: "low",
    }],
    tool_choice: { type: "function", name: "save_note" },
    text: {
      format: {
        type: "json_schema",
        name: "note_result",
        schema: {
          type: "object",
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
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
    input: [
      {
        role: "user",
        content: [
          { type: "input_text", text: "anthropic please" },
          { type: "input_file", file_url: "https://example.test/spec.pdf", filename: "spec.pdf" },
        ],
      },
      {
        type: "function_call",
        id: "fc_call_lookup",
        call_id: "call_lookup",
        status: "completed",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      },
      {
        type: "function_call_output",
        call_id: "call_lookup",
        output: "done",
        status: "incomplete",
      },
      { role: "user", content: [{ type: "input_text", text: "continue after tool result" }] },
    ],
    stream: false,
    max_output_tokens: 32,
    tools: [{
      type: "function",
      name: "lookup",
      description: "Lookup docs",
      parameters: {
        type: "object",
        properties: { query: { type: "string" } },
      },
    }],
    tool_choice: "auto",
    parallel_tool_calls: false,
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

test("model gateway maps responses refusal output through chat and anthropic adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-refusal",
      name: "Responses Refusal Provider",
      appScopes: ["claude-code", "openclaw"],
      baseUrl: "https://responses-refusal.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-refusal-secret",
    },
    setActiveScopes: ["claude-code", "openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
    const requestBody = JSON.parse(String(init.body || "{}"));
    const refusal = requestBody.stream ? "Streamed refusal." : "Non-stream refusal.";
    if (requestBody.stream) {
      const upstreamSse = [
        "event: response.created",
        "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_refusal_stream\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-native-responses\",\"output\":[],\"usage\":null}}",
        "",
        "event: response.output_item.added",
        "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"msg_refusal_stream\",\"type\":\"message\",\"status\":\"in_progress\",\"role\":\"assistant\",\"content\":[]}}",
        "",
        "event: response.content_part.added",
        "data: {\"type\":\"response.content_part.added\",\"item_id\":\"msg_refusal_stream\",\"output_index\":0,\"content_index\":0,\"part\":{\"type\":\"refusal\",\"refusal\":\"\"}}",
        "",
        "event: response.refusal.delta",
        "data: {\"type\":\"response.refusal.delta\",\"item_id\":\"msg_refusal_stream\",\"output_index\":0,\"content_index\":0,\"delta\":\"Streamed \"}",
        "",
        "event: response.refusal.delta",
        "data: {\"type\":\"response.refusal.delta\",\"item_id\":\"msg_refusal_stream\",\"output_index\":0,\"content_index\":0,\"delta\":\"refusal.\"}",
        "",
        "event: response.refusal.done",
        "data: {\"type\":\"response.refusal.done\",\"item_id\":\"msg_refusal_stream\",\"output_index\":0,\"content_index\":0,\"refusal\":\"Streamed refusal.\"}",
        "",
        "event: response.content_part.done",
        "data: {\"type\":\"response.content_part.done\",\"item_id\":\"msg_refusal_stream\",\"output_index\":0,\"content_index\":0,\"part\":{\"type\":\"refusal\",\"refusal\":\"Streamed refusal.\"}}",
        "",
        "event: response.output_item.done",
        "data: {\"type\":\"response.output_item.done\",\"output_index\":0,\"item\":{\"id\":\"msg_refusal_stream\",\"type\":\"message\",\"status\":\"completed\",\"role\":\"assistant\",\"content\":[{\"type\":\"refusal\",\"refusal\":\"Streamed refusal.\"}]}}",
        "",
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_refusal_stream\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-native-responses\",\"output\":[{\"id\":\"msg_refusal_stream\",\"type\":\"message\",\"status\":\"completed\",\"role\":\"assistant\",\"content\":[{\"type\":\"refusal\",\"refusal\":\"Streamed refusal.\"}]}],\"usage\":{\"input_tokens\":5,\"output_tokens\":3,\"total_tokens\":8}}}",
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
      id: "resp_refusal",
      object: "response",
      status: "completed",
      model: "gpt-native-responses",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "refusal", refusal }],
      }],
      usage: {
        input_tokens: 7,
        output_tokens: 4,
        total_tokens: 11,
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
          model: "gpt-native-responses",
          messages: [{ role: "user", content: "refuse via chat" }],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, "Non-stream refusal.");
      assert.equal(chat.body.choices[0].message.refusal, "Non-stream refusal.");
      assert.equal(chat.body.choices[0].finish_reason, "content_filter");

      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          max_tokens: 32,
          messages: [{ role: "user", content: "refuse via anthropic" }],
        },
      });
      assert.equal(messages.status, 200, messages.body);
      assert.deepEqual(messages.body.content, [{ type: "text", text: "Non-stream refusal." }]);
      assert.equal(messages.body.stop_reason, "refusal");

      const chatStream = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          stream: true,
          messages: [{ role: "user", content: "stream refusal via chat" }],
        },
      });
      assert.equal(chatStream.status, 200);
      const chatEvents = parseSseEvents(chatStream.body);
      assert.equal(chatEvents[1].data.choices[0].delta.refusal, "Streamed ");
      assert.equal(chatEvents[2].data.choices[0].delta.refusal, "refusal.");
      assert.equal(chatEvents[3].data.choices[0].finish_reason, "content_filter");
      assert.equal(chatEvents[4].data, "[DONE]");

      const messageStream = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          max_tokens: 32,
          stream: true,
          messages: [{ role: "user", content: "stream refusal via anthropic" }],
        },
      });
      assert.equal(messageStream.status, 200);
      const messageEvents = parseSseEvents(messageStream.body);
      assert.deepEqual(messageEvents.map((item) => item.event), [
        "message_start",
        "content_block_start",
        "content_block_delta",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
      assert.equal(messageEvents[2].data.delta.text, "Streamed ");
      assert.equal(messageEvents[3].data.delta.text, "refusal.");
      assert.equal(messageEvents[5].data.delta.stop_reason, "refusal");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
  assert.ok(upstreamCalls.every((call) => call.url === "https://responses-refusal.example.test/v1/responses"));
  assert.ok(upstreamCalls.every((call) => call.authorization === "Bearer sk-responses-refusal-secret"));
  assert.deepEqual(upstreamCalls.map((call) => JSON.parse(call.body).stream === true), [false, false, true, true]);
});


test("model gateway exposes non-streaming responses mcp outputs through chat and anthropic adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-mcp-output",
      name: "Responses MCP Output Provider",
      appScopes: ["claude-code", "openclaw"],
      baseUrl: "https://responses-mcp-output.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-mcp-output-secret" },
    setActiveScopes: ["claude-code", "openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: `resp_mcp_output_${upstreamCalls.length}`,
      object: "response",
      status: "completed",
      model: "gpt-5.4",
      output: [
        {
          type: "mcp_list_tools",
          server_label: "repo-tools",
          tools: [{ name: "read_file" }, { name: "search" }],
        },
        {
          type: "mcp_call",
          server_label: "repo-tools",
          name: "read_file",
          arguments: "{\"path\":\"README.md\"}",
          output: { path: "README.md", text: "Hello from MCP" },
          status: "completed",
        },
        {
          id: "mcpr_delete_1",
          type: "mcp_approval_request",
          server_label: "repo-tools",
          name: "delete_file",
          arguments: "{\"path\":\"danger.txt\"}",
        },
        {
          id: "ws_1",
          type: "web_search_call",
          status: "completed",
          action: { query: "Tracevane gateway" },
        },
      ],
      usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const expectedText = "[OpenAI Responses mcp_list_tools repo-tools: read_file, search]"
    + "[OpenAI Responses mcp_call repo-tools.read_file output: {\"path\":\"README.md\",\"text\":\"Hello from MCP\"}]"
    + "[OpenAI Responses mcp_approval_request repo-tools.delete_file id: mcpr_delete_1 arguments: {\"path\":\"danger.txt\"}]"
    + "[OpenAI Responses web_search_call {\"status\":\"completed\",\"action\":{\"query\":\"Tracevane gateway\"}}]";

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          messages: [{ role: "user", content: "use mcp via chat" }],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, expectedText);
      assert.equal(chat.body.choices[0].finish_reason, "stop");

      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          max_tokens: 128,
          messages: [{ role: "user", content: "use mcp via anthropic" }],
        },
      });
      assert.equal(messages.status, 200, messages.body);
      assert.deepEqual(messages.body.content, [{ type: "text", text: expectedText }]);
      assert.equal(messages.body.stop_reason, "end_turn");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.ok(upstreamCalls.every((call) => call.url === "https://responses-mcp-output.example.test/v1/responses"));
  assert.ok(upstreamCalls.every((call) => call.authorization === "Bearer sk-responses-mcp-output-secret"));
});

test("model gateway preserves Anthropic MCP blocks through Responses provider", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-responses-mcp-bridge",
      name: "Anthropic Responses MCP Bridge",
      appScopes: ["claude-code"],
      baseUrl: "https://responses-mcp-bridge.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-mcp-bridge-secret" },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
      anthropicWorkspaceId: init.headers instanceof Headers ? init.headers.get("anthropic-workspace-id") : null,
      anthropicFutureCapability: init.headers instanceof Headers ? init.headers.get("anthropic-future-capability") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "resp_mcp_bridge",
      object: "response",
      status: "completed",
      model: "gpt-5.4",
      output: [
        {
          id: "mcp_call_read",
          type: "mcp_call",
          server_label: "repo-tools",
          name: "read_file",
          arguments: JSON.stringify({ path: "README.md" }),
          output: "README contents",
          status: "completed",
        },
        {
          id: "msg_mcp_bridge",
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Read complete." }],
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "anthropic-version": "2023-06-01",
          "anthropic-workspace-id": "workspace_must_not_reach_responses",
          "anthropic-future-capability": "future-must-not-reach-responses",
        },
        body: {
          model: "gpt-5.4",
          max_tokens: 256,
          context_management: {
            edits: [{ type: "clear_tool_uses_20250919" }],
          },
          mcp_servers: [
            {
              type: "url",
              name: "repo-tools",
              url: "https://mcp.example.test/sse",
              authorization_token: "mcp-token",
              tool_configuration: {
                enabled: true,
                allowed_tools: ["read_file"],
                require_approval: "always",
                defer_loading: true,
              },
            },
          ],
          messages: [
            {
              role: "assistant",
              content: [
                { type: "mcp_tool_use", id: "mcp_prev", name: "read_file", server_name: "repo-tools", input: { path: "package.json" } },
                { type: "mcp_tool_result", tool_use_id: "mcp_prev", is_error: false, content: [{ type: "text", text: "package" }] },
                { type: "text", text: "Previous MCP done." },
              ],
            },
            { role: "user", content: "read README" },
          ],
          stream: false,
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.deepEqual(response.body.content, [
        { type: "mcp_tool_use", id: "mcp_call_read", name: "read_file", server_name: "repo-tools", input: { path: "README.md" } },
        { type: "mcp_tool_result", tool_use_id: "mcp_call_read", is_error: false, content: [{ type: "text", text: "README contents" }] },
        { type: "text", text: "Read complete." },
      ]);
      assert.equal(response.body.stop_reason, "end_turn");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://responses-mcp-bridge.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-mcp-bridge-secret");
  assert.equal(upstreamCalls[0].anthropicVersion, null);
  assert.equal(upstreamCalls[0].anthropicWorkspaceId, null);
  assert.equal(upstreamCalls[0].anthropicFutureCapability, null);
  assert.deepEqual(upstreamCalls[0].body.context_management, {
    edits: [{ type: "clear_tool_uses_20250919" }],
  });
  assert.deepEqual(upstreamCalls[0].body.tools, [{
    type: "mcp",
    server_label: "repo-tools",
    server_url: "https://mcp.example.test/sse",
    authorization: "mcp-token",
    allowed_tools: ["read_file"],
    require_approval: "always",
    defer_loading: true,
  }]);
  assert.deepEqual(upstreamCalls[0].body.input[0], {
    type: "mcp_call",
    id: "mcp_prev",
    name: "read_file",
    server_label: "repo-tools",
    arguments: JSON.stringify({ path: "package.json" }),
    output: "package",
  });
  assert.deepEqual(upstreamCalls[0].body.input[1], {
    role: "assistant",
    content: [{ type: "output_text", text: "Previous MCP done." }],
  });
});

test("model gateway maps Anthropic MCP toolsets and forced tool choice to Responses MCP", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-responses-mcp-toolset",
      name: "Anthropic Responses MCP Toolset",
      appScopes: ["claude-code"],
      baseUrl: "https://responses-mcp-toolset.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-mcp-toolset-secret" },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "resp_mcp_toolset",
      object: "response",
      status: "completed",
      model: "gpt-5.4",
      output: [{
        id: "mcp_call_read",
        type: "mcp_call",
        server_label: "repo-tools",
        name: "read_file",
        arguments: JSON.stringify({ path: "README.md" }),
        output: "README contents",
        status: "completed",
      }],
      usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          max_tokens: 256,
          mcp_servers: [{
            type: "url",
            name: "repo-tools",
            url: "https://mcp.example.test/sse",
            authorization_token: "mcp-token",
          }],
          tools: [{
            type: "mcp_toolset",
            mcp_server_name: "repo-tools",
            default_config: {
              enabled: false,
              defer_loading: true,
            },
            configs: {
              read_file: { enabled: true },
              search: { enabled: false },
            },
          }],
          tool_choice: { type: "tool", name: "read_file" },
          messages: [{ role: "user", content: "read README" }],
          stream: false,
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.deepEqual(response.body.content, [
        { type: "mcp_tool_use", id: "mcp_call_read", name: "read_file", server_name: "repo-tools", input: { path: "README.md" } },
        { type: "mcp_tool_result", tool_use_id: "mcp_call_read", is_error: false, content: [{ type: "text", text: "README contents" }] },
      ]);
      assert.equal(response.body.stop_reason, "end_turn");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://responses-mcp-toolset.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-mcp-toolset-secret");
  assert.deepEqual(upstreamCalls[0].body.tools, [{
    type: "mcp",
    server_label: "repo-tools",
    server_url: "https://mcp.example.test/sse",
    authorization: "mcp-token",
    allowed_tools: ["read_file"],
    defer_loading: true,
  }]);
  assert.deepEqual(upstreamCalls[0].body.tool_choice, {
    type: "mcp",
    server_label: "repo-tools",
    name: "read_file",
  });
  assert.equal(JSON.stringify(upstreamCalls[0].body).includes("search"), false);
});

test("model gateway preserves Anthropic MCP server context through Chat providers without leaking tokens", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-chat-mcp-context",
      name: "Anthropic Chat MCP Context",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic-chat-mcp-context.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-anthropic-chat-mcp-context-secret" },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_mcp_context",
      object: "chat.completion",
      created: 1_710_000_046,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "MCP context preserved." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          max_tokens: 128,
          mcp_servers: [
            {
              type: "url",
              name: "repo-tools",
              url: "https://mcp.example.test/sse",
              description: "Repository tools",
              authorization_token: "mcp-token-should-not-leak",
              tool_configuration: {
                enabled: true,
                allowed_tools: ["read_file", "search"],
                require_approval: "always",
                defer_loading: true,
              },
            },
            {
              type: "url",
              name: "disabled-tools",
              url: "https://disabled-mcp.example.test/sse",
              authorization_token: "disabled-token-should-not-leak",
              tool_configuration: {
                enabled: false,
                allowed_tools: ["delete_everything"],
              },
            },
          ],
          messages: [{ role: "user", content: "Read README using MCP if possible." }],
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.content[0].text, "MCP context preserved.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://anthropic-chat-mcp-context.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-anthropic-chat-mcp-context-secret");
  assert.deepEqual(upstreamCalls[0].body.messages, [
    { role: "user", content: "Read README using MCP if possible." },
    {
      role: "user",
      content: "[Anthropic MCP server server_label=repo-tools server_url=https://mcp.example.test/sse description=Repository tools allowed_tools=read_file,search require_approval=always defer_loading=true]",
    },
  ]);
  assert.equal(JSON.stringify(upstreamCalls[0].body).includes("mcp-token-should-not-leak"), false);
  assert.equal(JSON.stringify(upstreamCalls[0].body).includes("disabled-token-should-not-leak"), false);
  assert.equal(JSON.stringify(upstreamCalls[0].body).includes("disabled-tools"), false);
});

test("model gateway maps Anthropic MCP toolsets into Chat provider context without leaking tokens", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-chat-mcp-toolset-context",
      name: "Anthropic Chat MCP Toolset Context",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic-chat-mcp-toolset-context.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-anthropic-chat-mcp-toolset-context-secret" },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_mcp_toolset_context",
      object: "chat.completion",
      created: 1_710_000_047,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "MCP toolset context preserved." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          max_tokens: 128,
          mcp_servers: [
            {
              type: "url",
              name: "repo-tools",
              url: "https://mcp.example.test/sse",
              description: "Repository tools",
              authorization_token: "repo-token-should-not-leak",
            },
            {
              type: "url",
              name: "calendar-tools",
              url: "https://calendar-mcp.example.test/sse",
              authorization_token: "calendar-token-should-not-leak",
            },
            {
              type: "url",
              name: "unreferenced-tools",
              url: "https://unreferenced-mcp.example.test/sse",
              authorization_token: "unreferenced-token-should-not-leak",
            },
          ],
          tools: [
            {
              type: "mcp_toolset",
              mcp_server_name: "repo-tools",
              default_config: {
                enabled: false,
                defer_loading: true,
              },
              configs: {
                read_file: { enabled: true },
                search: { enabled: false },
              },
            },
            {
              type: "mcp_toolset",
              mcp_server_name: "calendar-tools",
              default_config: {
                enabled: true,
              },
              configs: {
                delete_event: { enabled: false },
              },
            },
          ],
          messages: [{ role: "user", content: "Read README using MCP if possible." }],
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.content[0].text, "MCP toolset context preserved.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://anthropic-chat-mcp-toolset-context.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-anthropic-chat-mcp-toolset-context-secret");
  assert.deepEqual(upstreamCalls[0].body.messages, [
    { role: "user", content: "Read README using MCP if possible." },
    {
      role: "user",
      content: [
        "[Anthropic MCP server server_label=repo-tools server_url=https://mcp.example.test/sse description=Repository tools allowed_tools=read_file defer_loading=true]",
        "[Anthropic MCP server server_label=calendar-tools server_url=https://calendar-mcp.example.test/sse disabled_tools=delete_event]",
      ].join("\n"),
    },
  ]);
  const upstreamBodyText = JSON.stringify(upstreamCalls[0].body);
  assert.equal(upstreamBodyText.includes("repo-token-should-not-leak"), false);
  assert.equal(upstreamBodyText.includes("calendar-token-should-not-leak"), false);
  assert.equal(upstreamBodyText.includes("unreferenced-token-should-not-leak"), false);
  assert.equal(upstreamBodyText.includes("unreferenced-tools"), false);
  assert.equal(upstreamBodyText.includes("search"), false);
});

test("model gateway exposes streaming responses mcp outputs through chat and anthropic adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-mcp-output-stream",
      name: "Responses MCP Output Stream Provider",
      appScopes: ["claude-code", "openclaw"],
      baseUrl: "https://responses-mcp-output-stream.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-mcp-output-stream-secret" },
    setActiveScopes: ["claude-code", "openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  const mcpListItem = {
    id: "mcp_list_1",
    type: "mcp_list_tools",
    server_label: "repo-tools",
    tools: [{ name: "read_file" }, { name: "search" }],
  };
  const mcpCallItem = {
    id: "mcp_call_1",
    type: "mcp_call",
    server_label: "repo-tools",
    name: "read_file",
    arguments: "{\"path\":\"README.md\"}",
    output: { path: "README.md", text: "Hello from MCP" },
    status: "completed",
  };
  const mcpApprovalItem = {
    id: "mcpr_stream_delete_1",
    type: "mcp_approval_request",
    server_label: "repo-tools",
    name: "delete_file",
    arguments: "{\"path\":\"danger.txt\"}",
  };
  const builtinToolItem = {
    id: "fs_stream_1",
    type: "file_search_call",
    status: "completed",
    queries: ["README.md"],
    results: [{ file_id: "file_1", filename: "README.md" }],
  };
  globalThis.fetch = async (url, init = {}) => {
    const requestBody = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: requestBody,
    });
    const response = {
      id: `resp_mcp_output_stream_${upstreamCalls.length}`,
      object: "response",
      status: "completed",
      model: "gpt-5.4",
      output: [mcpListItem, mcpCallItem, mcpApprovalItem, builtinToolItem],
      usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
    };
    const upstreamSse = [
      `event: response.created\ndata: ${JSON.stringify({ response: { ...response, status: "in_progress", output: [] } })}`,
      `event: response.output_item.added\ndata: ${JSON.stringify({ output_index: 0, item: { ...mcpListItem, tools: [] } })}`,
      `event: response.output_item.done\ndata: ${JSON.stringify({ output_index: 0, item: mcpListItem })}`,
      `event: response.output_item.added\ndata: ${JSON.stringify({ output_index: 1, item: { ...mcpCallItem, output: undefined } })}`,
      `event: response.output_item.done\ndata: ${JSON.stringify({ output_index: 1, item: mcpCallItem })}`,
      `event: response.output_item.added\ndata: ${JSON.stringify({ output_index: 2, item: mcpApprovalItem })}`,
      `event: response.output_item.done\ndata: ${JSON.stringify({ output_index: 2, item: mcpApprovalItem })}`,
      `event: response.output_item.done\ndata: ${JSON.stringify({ output_index: 3, item: builtinToolItem })}`,
      `event: response.completed\ndata: ${JSON.stringify({ response })}`,
      "data: [DONE]",
      "",
    ].join("\n\n");
    return new Response(upstreamSse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  };

  const expectedListText = "[OpenAI Responses mcp_list_tools repo-tools: read_file, search]";
  const expectedCallText = "[OpenAI Responses mcp_call repo-tools.read_file output: {\"path\":\"README.md\",\"text\":\"Hello from MCP\"}]";
  const expectedApprovalText = "[OpenAI Responses mcp_approval_request repo-tools.delete_file id: mcpr_stream_delete_1 arguments: {\"path\":\"danger.txt\"}]";
  const expectedBuiltinText = "[OpenAI Responses file_search_call {\"status\":\"completed\",\"queries\":[\"README.md\"],\"results\":[{\"file_id\":\"file_1\",\"filename\":\"README.md\"}]}]";

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          stream: true,
          messages: [{ role: "user", content: "stream mcp via chat" }],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      const chatEvents = parseSseEvents(chat.body);
      const chatText = chatEvents
        .filter((item) => item.data !== "[DONE]")
        .map((item) => item.data.choices?.[0]?.delta?.content || "")
        .join("");
      assert.equal(chatText, expectedListText + expectedCallText + expectedApprovalText + expectedBuiltinText);
      assert.equal(chatEvents.at(-2).data.choices[0].finish_reason, "stop");
      assert.equal(chatEvents.at(-1).data, "[DONE]");

      const messages = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          max_tokens: 128,
          stream: true,
          messages: [{ role: "user", content: "stream mcp via anthropic" }],
        },
      });
      assert.equal(messages.status, 200, messages.body);
      const messageEvents = parseSseEvents(messages.body);
      const messageText = messageEvents
        .filter((item) => item.event === "content_block_delta")
        .map((item) => item.data.delta.text || "")
        .join("");
      assert.equal(messageText, expectedListText + expectedApprovalText + expectedBuiltinText);
      const contentBlocks = messageEvents
        .filter((item) => item.event === "content_block_start")
        .map((item) => item.data.content_block);
      assert.deepEqual(contentBlocks, [
        { type: "text", text: "" },
        { type: "mcp_tool_use", id: "mcp_call_1", name: "read_file", server_name: "repo-tools", input: { path: "README.md" } },
        { type: "mcp_tool_result", tool_use_id: "mcp_call_1", is_error: false, content: [{ type: "text", text: JSON.stringify({ path: "README.md", text: "Hello from MCP" }) }] },
        { type: "text", text: "" },
      ]);
      const messageDelta = messageEvents.find((item) => item.event === "message_delta");
      assert.equal(messageDelta.data.delta.stop_reason, "end_turn");
      assert.equal(messageEvents.at(-1).event, "message_stop");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.ok(upstreamCalls.every((call) => call.url === "https://responses-mcp-output-stream.example.test/v1/responses"));
  assert.ok(upstreamCalls.every((call) => call.authorization === "Bearer sk-responses-mcp-output-stream-secret"));
  assert.ok(upstreamCalls.every((call) => call.body.stream === true));
});

test("model gateway maps chat refusal output through anthropic and codex adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-refusal",
      name: "Chat Refusal Provider",
      appScopes: ["claude-code", "codex"],
      baseUrl: "https://chat-refusal.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-chat-refusal-secret",
    },
    setActiveScopes: ["claude-code", "codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
    const requestBody = JSON.parse(String(init.body || "{}"));
    if (requestBody.stream) {
      const upstreamSse = [
        "data: {\"id\":\"chatcmpl_refusal_stream\",\"object\":\"chat.completion.chunk\",\"created\":1710000042,\"model\":\"gpt-chat\",\"choices\":[{\"index\":0,\"delta\":{\"role\":\"assistant\"},\"finish_reason\":null}]}",
        "",
        "data: {\"id\":\"chatcmpl_refusal_stream\",\"object\":\"chat.completion.chunk\",\"created\":1710000042,\"model\":\"gpt-chat\",\"choices\":[{\"index\":0,\"delta\":{\"refusal\":\"Streamed \"},\"finish_reason\":null}]}",
        "",
        "data: {\"id\":\"chatcmpl_refusal_stream\",\"object\":\"chat.completion.chunk\",\"created\":1710000042,\"model\":\"gpt-chat\",\"choices\":[{\"index\":0,\"delta\":{\"refusal\":\"chat refusal.\"},\"finish_reason\":null}]}",
        "",
        "data: {\"id\":\"chatcmpl_refusal_stream\",\"object\":\"chat.completion.chunk\",\"created\":1710000042,\"model\":\"gpt-chat\",\"choices\":[{\"index\":0,\"delta\":{},\"finish_reason\":\"content_filter\"}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":3,\"total_tokens\":8}}",
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
      id: "chatcmpl_refusal",
      object: "chat.completion",
      created: 1_710_000_042,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: null,
          refusal: "Non-stream chat refusal.",
        },
        finish_reason: "content_filter",
      }],
      usage: {
        prompt_tokens: 7,
        completion_tokens: 4,
        total_tokens: 11,
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
        body: {
          model: "gpt-chat",
          max_tokens: 32,
          messages: [{ role: "user", content: "refuse via anthropic" }],
        },
      });
      assert.equal(messages.status, 200, messages.body);
      assert.deepEqual(messages.body.content, [{ type: "text", text: "Non-stream chat refusal." }]);
      assert.equal(messages.body.stop_reason, "refusal");

      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          input: "refuse via responses",
        },
      });
      assert.equal(responses.status, 200, responses.body);
      assert.deepEqual(responses.body.output[0].content, [{ type: "refusal", refusal: "Non-stream chat refusal." }]);

      const messageStream = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          max_tokens: 32,
          stream: true,
          messages: [{ role: "user", content: "stream refusal via anthropic" }],
        },
      });
      assert.equal(messageStream.status, 200);
      const messageEvents = parseSseEvents(messageStream.body);
      assert.equal(messageEvents[2].data.delta.text, "Streamed ");
      assert.equal(messageEvents[3].data.delta.text, "chat refusal.");
      assert.equal(messageEvents[5].data.delta.stop_reason, "refusal");

      const responsesStream = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          input: "stream refusal via responses",
          stream: true,
        },
      });
      assert.equal(responsesStream.status, 200);
      const responseEvents = parseSseEvents(responsesStream.body);
      assert.equal(responseEvents[4].event, "response.refusal.delta");
      assert.equal(responseEvents[4].data.delta, "Streamed ");
      assert.equal(responseEvents[5].event, "response.refusal.delta");
      assert.equal(responseEvents[5].data.delta, "chat refusal.");
      assert.equal(responseEvents[9].event, "response.completed");
      assert.equal(responseEvents[9].data.response.output[0].content[0].refusal, "Streamed chat refusal.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
  assert.ok(upstreamCalls.every((call) => call.url === "https://chat-refusal.example.test/v1/chat/completions"));
  assert.ok(upstreamCalls.every((call) => call.authorization === "Bearer sk-chat-refusal-secret"));
  assert.deepEqual(upstreamCalls.map((call) => JSON.parse(call.body).stream === true), [false, false, true, true]);
});



test("model gateway maps Anthropic refusal stop reason to Chat content_filter", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-refusal",
      name: "Anthropic Refusal Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://anthropic-refusal.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-anthropic-refusal-secret" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "msg_anthropic_refusal",
      type: "message",
      role: "assistant",
      model: "claude-refusal",
      content: [{ type: "text", text: "Anthropic refusal." }],
      stop_reason: "refusal",
      stop_sequence: null,
      usage: { input_tokens: 3, output_tokens: 2 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-refusal",
          messages: [{ role: "user", content: "refuse via chat" }],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, "Anthropic refusal.");
      assert.equal(chat.body.choices[0].message.refusal, "Anthropic refusal.");
      assert.equal(chat.body.choices[0].finish_reason, "content_filter");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://anthropic-refusal.example.test/v1/messages");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-anthropic-refusal-secret");
});

test("model gateway preserves Chat refusal content parts in Codex responses", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-refusal-content-part",
      name: "Chat Refusal Content Part Provider",
      appScopes: ["codex"],
      baseUrl: "https://chat-refusal-content-part.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-refusal-content-part-secret" },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_refusal_part",
      object: "chat.completion",
      created: 1_710_000_043,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: [
            { type: "output_text", text: "Allowed context. " },
            { type: "refusal", refusal: "I cannot help with that." },
          ],
        },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 7, completion_tokens: 5, total_tokens: 12 },
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
          model: "gpt-chat",
          input: "Return a structured refusal part.",
        },
      });

      assert.equal(responses.status, 200, responses.body);
      assert.deepEqual(responses.body.output[0].content, [
        { type: "output_text", text: "Allowed context. " },
        { type: "refusal", refusal: "I cannot help with that." },
      ]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://chat-refusal-content-part.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-chat-refusal-content-part-secret");
});

test("model gateway maps non-streaming responses incomplete status to client stop reasons", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-incomplete",
      name: "Responses Incomplete Provider",
      appScopes: ["claude-code", "openclaw"],
      baseUrl: "https://responses-incomplete.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-incomplete-secret",
    },
    setActiveScopes: ["claude-code", "openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      id: `resp_incomplete_${upstreamCalls.length}`,
      object: "response",
      status: "incomplete",
      incomplete_details: { reason: "max_output_tokens" },
      model: "gpt-native-responses",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Partial answer", annotations: [] }],
      }],
      usage: {
        input_tokens: 6,
        output_tokens: 3,
        total_tokens: 9,
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
          model: "gpt-native-responses",
          messages: [{ role: "user", content: "truncate via chat" }],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, "Partial answer");
      assert.equal(chat.body.choices[0].finish_reason, "length");

      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          max_tokens: 3,
          messages: [{ role: "user", content: "truncate via anthropic" }],
        },
      });
      assert.equal(messages.status, 200, messages.body);
      assert.deepEqual(messages.body.content, [{ type: "text", text: "Partial answer" }]);
      assert.equal(messages.body.stop_reason, "max_tokens");
      assert.deepEqual(messages.body.usage, {
        input_tokens: 6,
        output_tokens: 3,
        cache_read_input_tokens: 0,
      });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.ok(upstreamCalls.every((call) => call.url === "https://responses-incomplete.example.test/v1/responses"));
  assert.ok(upstreamCalls.every((call) => call.authorization === "Bearer sk-responses-incomplete-secret"));
  assert.deepEqual(upstreamCalls.map((call) => JSON.parse(call.body).stream), [false, false]);
});

test("model gateway maps GPT-5 verbosity across Chat, Anthropic, and Responses adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-verbosity",
      name: "Responses Verbosity Provider",
      appScopes: ["openclaw", "opencode", "claude-code"],
      baseUrl: "https://responses-verbosity.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-verbosity-secret" },
    setActiveScopes: ["openclaw", "opencode", "claude-code"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-verbosity",
      name: "Chat Verbosity Provider",
      appScopes: ["codex"],
      baseUrl: "https://chat-verbosity.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-verbosity-secret" },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    if (String(url).includes("responses-verbosity")) {
      return new Response(JSON.stringify({
        id: "resp_verbosity",
        object: "response",
        status: "completed",
        model: "gpt-native-responses",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Responses verbosity kept." }],
        }],
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_verbosity",
      object: "chat.completion",
      created: 1_710_000_046,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Chat verbosity kept." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          verbosity: "high",
          response_format: { type: "json_object" },
          messages: [{ role: "user", content: "chat verbosity" }],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, "Responses verbosity kept.");

      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-native-responses",
          max_tokens: 32,
          verbosity: "low",
          output_config: {
            format: {
              type: "json_schema",
              name: "anthropic_schema",
              schema: { type: "object", additionalProperties: false, properties: { answer: { type: "string" } }, required: ["answer"] },
              strict: true,
            },
          },
          messages: [{ role: "user", content: "anthropic verbosity" }],
        },
      });
      assert.equal(messages.status, 200, messages.body);
      assert.deepEqual(messages.body.content, [{ type: "text", text: "Responses verbosity kept." }]);

      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          input: "responses verbosity",
          text: {
            verbosity: "medium",
            format: {
              type: "json_schema",
              name: "verbosity_schema",
              schema: { type: "object", additionalProperties: false, properties: {} },
              strict: true,
            },
          },
        },
      });
      assert.equal(responses.status, 200, responses.body);
      assert.equal(responses.body.output[0].content[0].text, "Chat verbosity kept.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 3);
  assert.equal(upstreamCalls[0].url, "https://responses-verbosity.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-verbosity-secret");
  assert.deepEqual(upstreamCalls[0].body.text, { format: { type: "json_object" }, verbosity: "high" });
  assert.equal(upstreamCalls[1].url, "https://responses-verbosity.example.test/v1/responses");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-responses-verbosity-secret");
  assert.deepEqual(upstreamCalls[1].body.text, {
    format: {
      type: "json_schema",
      name: "anthropic_schema",
      schema: { type: "object", additionalProperties: false, properties: { answer: { type: "string" } }, required: ["answer"] },
      strict: true,
    },
    verbosity: "low",
  });
  assert.equal(upstreamCalls[2].url, "https://chat-verbosity.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[2].authorization, "Bearer sk-chat-verbosity-secret");
  assert.equal(upstreamCalls[2].body.verbosity, "medium");
  assert.deepEqual(upstreamCalls[2].body.response_format, {
    type: "json_schema",
    json_schema: {
      name: "verbosity_schema",
      schema: { type: "object", additionalProperties: false, properties: {} },
      strict: true,
    },
  });
});

test("model gateway preserves service tier across chat and responses adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-service-tier",
      name: "Responses Service Tier Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://responses-service-tier.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-service-tier-secret" },
    setActiveScopes: ["openclaw"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-service-tier",
      name: "Chat Service Tier Provider",
      appScopes: ["codex"],
      baseUrl: "https://chat-service-tier.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-service-tier-secret" },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    if (String(url).includes("responses-service-tier")) {
      return new Response(JSON.stringify({
        id: "resp_service_tier",
        object: "response",
        status: "completed",
        model: "gpt-native-responses",
        service_tier: "default",
        output: [{
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Responses tier kept." }],
        }],
        usage: { input_tokens: 3, output_tokens: 2, total_tokens: 5 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_service_tier",
      object: "chat.completion",
      created: 1_710_000_043,
      model: "gpt-chat",
      service_tier: "flex",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Chat tier kept." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
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
          model: "gpt-native-responses",
          service_tier: "flex",
          messages: [{ role: "user", content: "chat via responses" }],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, "Responses tier kept.");
      assert.equal(chat.body.service_tier, "default");

      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          service_tier: "priority",
          input: "responses via chat",
        },
      });
      assert.equal(responses.status, 200, responses.body);
      assert.equal(responses.body.output[0].content[0].text, "Chat tier kept.");
      assert.equal(responses.body.service_tier, "flex");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-service-tier.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-service-tier-secret");
  assert.equal(upstreamCalls[0].body.service_tier, "flex");
  assert.equal(upstreamCalls[1].url, "https://chat-service-tier.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-chat-service-tier-secret");
  assert.equal(upstreamCalls[1].body.service_tier, "priority");
});


test("model gateway preserves Responses built-in tool output input when degrading to chat", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-builtin-tool-output-input",
      name: "Chat Builtin Tool Output Input Provider",
      appScopes: ["codex"],
      baseUrl: "https://chat-builtin-tool-output-input.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-builtin-tool-output-input-secret" },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_builtin_tool_output_input",
      object: "chat.completion",
      created: 1_710_000_044,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Saw computer output." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 4, completion_tokens: 2, total_tokens: 6 },
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
          model: "gpt-chat",
          input: [
            { role: "user", content: "Continue after the screenshot." },
            {
              type: "computer_call_output",
              call_id: "call_screen",
              output: { image_url: "https://example.test/screenshot.png" },
              status: "completed",
            },
          ],
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.output[0].content[0].text, "Saw computer output.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://chat-builtin-tool-output-input.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-chat-builtin-tool-output-input-secret");
  assert.deepEqual(upstreamCalls[0].body.messages, [
    { role: "user", content: "Continue after the screenshot." },
    { role: "user", content: "[OpenAI Responses computer_call_output {\"status\":\"completed\",\"output\":{\"image_url\":\"https://example.test/screenshot.png\"},\"call_id\":\"call_screen\"}]" },
  ]);
});

test("model gateway preserves Responses built-in web search choices through Chat and Anthropic providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-builtin-tool-choice",
      name: "Chat Builtin Tool Choice Provider",
      appScopes: ["codex"],
      baseUrl: "https://chat-builtin-tool-choice.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-builtin-tool-choice-secret" },
    setActiveScopes: ["codex"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-builtin-tool-choice",
      name: "Anthropic Builtin Tool Choice Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://anthropic-builtin-tool-choice.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-anthropic-builtin-tool-choice-secret" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    if (String(url).includes("anthropic-builtin-tool-choice")) {
      return new Response(JSON.stringify({
        id: "msg_builtin_tool_choice",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "Anthropic web search accepted." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 8, output_tokens: 4 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_builtin_tool_choice",
      object: "chat.completion",
      created: 1_710_000_045,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Builtin choice fallback accepted." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 7, completion_tokens: 3, total_tokens: 10 },
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
          model: "gpt-chat",
          input: "Search the current docs.",
          tools: [{ type: "web_search_preview", search_context_size: "low" }],
          tool_choice: { type: "web_search_preview" },
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.output[0].content[0].text, "Builtin choice fallback accepted.");

      const anthropic = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: {
          model: "claude-native",
          input: "Search current docs with Claude.",
          tools: [{ type: "web_search_preview", search_context_size: "low" }],
          tool_choice: { type: "web_search_preview" },
        },
      });
      assert.equal(anthropic.status, 200, anthropic.body);
      assert.equal(anthropic.body.output[0].content[0].text, "Anthropic web search accepted.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://chat-builtin-tool-choice.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-chat-builtin-tool-choice-secret");
  assert.deepEqual(upstreamCalls[0].body.messages, [
    { role: "user", content: "Search the current docs." },
  ]);
  assert.deepEqual(upstreamCalls[0].body.tools, [
    { type: "web_search_preview", search_context_size: "low" },
  ]);
  assert.deepEqual(upstreamCalls[0].body.tool_choice, { type: "web_search_preview" });

  assert.equal(upstreamCalls[1].url, "https://anthropic-builtin-tool-choice.example.test/v1/messages");
  assert.equal(upstreamCalls[1].xApiKey, "sk-anthropic-builtin-tool-choice-secret");
  assert.deepEqual(upstreamCalls[1].body.messages, [
    { role: "user", content: "Search current docs with Claude." },
  ]);
  assert.deepEqual(upstreamCalls[1].body.tools, [
    { type: "web_search_20250305", name: "web_search" },
  ]);
  assert.deepEqual(upstreamCalls[1].body.tool_choice, { type: "tool", name: "web_search" });
});

test("model gateway degrades unsupported Responses built-in tools before Chat and Anthropic providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-unsupported-responses-tools",
      name: "Chat Unsupported Responses Tools Provider",
      appScopes: ["codex"],
      baseUrl: "https://chat-unsupported-responses-tools.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-unsupported-responses-tools-secret" },
    setActiveScopes: ["codex"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-unsupported-responses-tools",
      name: "Anthropic Unsupported Responses Tools Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://anthropic-unsupported-responses-tools.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-anthropic-unsupported-responses-tools-secret" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    if (String(url).includes("anthropic-unsupported-responses-tools")) {
      return new Response(JSON.stringify({
        id: "msg_unsupported_responses_tools",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "Anthropic fallback kept context." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 9, output_tokens: 4 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: "chatcmpl_unsupported_responses_tools",
      object: "chat.completion",
      created: 1_710_000_047,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Chat fallback kept context." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 8, completion_tokens: 4, total_tokens: 12 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const responsesBody = {
    model: "gpt-chat",
    input: "Use the available tools if possible.",
    tools: [
      { type: "web_search_preview", search_context_size: "low" },
      { type: "file_search", vector_store_ids: ["vs_unsupported"], max_num_results: 3 },
      { type: "code_interpreter", container: { type: "auto" } },
      { type: "image_generation", size: "1024x1024" },
    ],
    tool_choice: { type: "file_search" },
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: responsesBody,
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.output[0].content[0].text, "Chat fallback kept context.");

      const anthropic = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: { ...responsesBody, model: "claude-native" },
      });
      assert.equal(anthropic.status, 200, anthropic.body);
      assert.equal(anthropic.body.output[0].content[0].text, "Anthropic fallback kept context.");

      const chatMalformedChoice = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          input: "Preserve string tool choice.",
          tool_choice: "file_search",
        },
      });
      assert.equal(chatMalformedChoice.status, 200, chatMalformedChoice.body);
      assert.equal(chatMalformedChoice.body.output[0].content[0].text, "Chat fallback kept context.");

      const anthropicMalformedChoice = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: {
          model: "claude-native",
          input: "Preserve malformed function tool choice.",
          tool_choice: { type: "function" },
        },
      });
      assert.equal(anthropicMalformedChoice.status, 200, anthropicMalformedChoice.body);
      assert.equal(anthropicMalformedChoice.body.output[0].content[0].text, "Anthropic fallback kept context.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
  assert.equal(upstreamCalls[0].url, "https://chat-unsupported-responses-tools.example.test/v1/chat/completions");
  assert.deepEqual(upstreamCalls[0].body.tools, [
    { type: "web_search_preview", search_context_size: "low" },
  ]);
  assert.equal(upstreamCalls[0].body.tool_choice, undefined);
  assert.deepEqual(upstreamCalls[0].body.messages, [
    { role: "user", content: "Use the available tools if possible." },
    { role: "user", content: 'OpenAI Responses unsupported tools: [{"type":"file_search","vector_store_ids":["vs_unsupported"],"max_num_results":3},{"type":"code_interpreter","container":{"type":"auto"}},{"type":"image_generation","size":"1024x1024"}]' },
    { role: "user", content: '[OpenAI Responses tool_choice {"type":"file_search"}]' },
  ]);

  assert.equal(upstreamCalls[1].url, "https://anthropic-unsupported-responses-tools.example.test/v1/messages");
  assert.deepEqual(upstreamCalls[1].body.tools, [
    { type: "web_search_20250305", name: "web_search" },
  ]);
  assert.equal(upstreamCalls[1].body.tool_choice, undefined);
  assert.deepEqual(upstreamCalls[1].body.messages, [
    { role: "user", content: "Use the available tools if possible." },
    { role: "user", content: 'OpenAI Responses unsupported tools: [{"type":"file_search","vector_store_ids":["vs_unsupported"],"max_num_results":3},{"type":"code_interpreter","container":{"type":"auto"}},{"type":"image_generation","size":"1024x1024"}]' },
    { role: "user", content: '[OpenAI Responses tool_choice {"type":"file_search"}]' },
  ]);

  assert.equal(upstreamCalls[2].url, "https://chat-unsupported-responses-tools.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[2].body.tool_choice, undefined);
  assert.deepEqual(upstreamCalls[2].body.messages, [
    { role: "user", content: "Preserve string tool choice." },
    { role: "user", content: "[OpenAI Responses tool_choice file_search]" },
  ]);

  assert.equal(upstreamCalls[3].url, "https://anthropic-unsupported-responses-tools.example.test/v1/messages");
  assert.equal(upstreamCalls[3].body.tool_choice, undefined);
  assert.deepEqual(upstreamCalls[3].body.messages, [
    { role: "user", content: "Preserve malformed function tool choice." },
    { role: "user", content: '[OpenAI Responses tool_choice {"type":"function"}]' },
  ]);
});

test("model gateway accepts direct-name Chat function tool choices across native adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-direct-choice-anthropic",
      name: "Chat Direct Choice Anthropic Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://chat-direct-choice-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-chat-direct-choice-anthropic-secret" },
    setActiveScopes: ["openclaw"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-direct-choice-responses",
      name: "Chat Direct Choice Responses Provider",
      appScopes: ["codex"],
      baseUrl: "https://chat-direct-choice-responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-direct-choice-responses-secret" },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    if (String(url).endsWith("/messages")) {
      return new Response(JSON.stringify({
        id: "msg_chat_direct_choice",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "Anthropic direct choice accepted." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 4 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      id: "resp_chat_direct_choice",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Responses direct choice accepted." }],
      }],
      usage: { input_tokens: 6, output_tokens: 4, total_tokens: 10 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const chatBody = {
    messages: [{ role: "user", content: "Use lookup." }],
    tools: [{
      type: "function",
      function: {
        name: "lookup",
        description: "Lookup records",
        parameters: { type: "object" },
      },
    }],
    tool_choice: { type: "function", name: "lookup" },
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const anthropic = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: { ...chatBody, model: "claude-native" },
      });
      assert.equal(anthropic.status, 200, anthropic.body);
      assert.equal(anthropic.body.choices[0].message.content, "Anthropic direct choice accepted.");

      const unsupportedAnthropic = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: {
          model: "claude-native",
          messages: [{ role: "user", content: "Use the native-only tool if possible." }],
          tools: [{ type: "unsupported_native_tool", name: "bad_tool", config: { mode: "x" } }],
          tool_choice: { type: "tool", name: "bad_tool" },
        },
      });
      assert.equal(unsupportedAnthropic.status, 200, unsupportedAnthropic.body);
      assert.equal(unsupportedAnthropic.body.choices[0].message.content, "Anthropic direct choice accepted.");

      const responses = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "codex" },
        body: { ...chatBody, model: "gpt-responses" },
      });
      assert.equal(responses.status, 200, responses.body);
      assert.equal(responses.body.choices[0].message.content, "Responses direct choice accepted.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 3);
  assert.equal(upstreamCalls[0].url, "https://chat-direct-choice-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[0].xApiKey, "sk-chat-direct-choice-anthropic-secret");
  assert.deepEqual(upstreamCalls[0].body.tool_choice, { type: "tool", name: "lookup" });
  assert.equal(upstreamCalls[1].url, "https://chat-direct-choice-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[1].xApiKey, "sk-chat-direct-choice-anthropic-secret");
  assert.equal(upstreamCalls[1].body.tools, undefined);
  assert.equal(upstreamCalls[1].body.tool_choice, undefined);
  assert.deepEqual(upstreamCalls[1].body.messages, [
    { role: "user", content: "Use the native-only tool if possible." },
    { role: "user", content: 'OpenAI Chat unsupported tools for Anthropic Messages: [{"type":"unsupported_native_tool","name":"bad_tool","config":{"mode":"x"}}]' },
    { role: "user", content: 'OpenAI Chat unsupported tool_choice for Anthropic Messages: {"type":"tool","name":"bad_tool"}' },
  ]);
  assert.equal(upstreamCalls[2].url, "https://chat-direct-choice-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[2].authorization, "Bearer sk-chat-direct-choice-responses-secret");
  assert.deepEqual(upstreamCalls[2].body.tool_choice, { type: "function", name: "lookup" });
});

test("model gateway adapts Anthropic-style Chat tool choices for Responses providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-anthropic-choice-responses",
      name: "Chat Anthropic Choice Responses Provider",
      appScopes: ["opencode"],
      baseUrl: "https://chat-anthropic-choice-responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-anthropic-choice-responses-secret" },
    setActiveScopes: ["opencode"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "resp_chat_anthropic_choice",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Anthropic-style choice accepted." }],
      }],
      usage: { input_tokens: 5, output_tokens: 4, total_tokens: 9 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "gpt-responses",
          messages: [{ role: "user", content: "Use lookup." }],
          tools: [{
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object" },
            },
          }],
          tool_choice: { type: "tool", name: "lookup", disable_parallel_tool_use: true },
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.choices[0].message.content, "Anthropic-style choice accepted.");

      const anyResponse = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "gpt-responses",
          messages: [{ role: "user", content: "Use any available tool." }],
          tools: [{
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object" },
            },
          }],
          tool_choice: { type: "any", disable_parallel_tool_use: true },
        },
      });
      assert.equal(anyResponse.status, 200, anyResponse.body);

      const webSearchResponse = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "gpt-responses",
          messages: [{ role: "user", content: "Search and summarize." }],
          tools: [
            { type: "web_search_20250305", name: "web_search", max_uses: 2 },
            {
              type: "function",
              function: {
                name: "lookup",
                parameters: { type: "object" },
              },
            },
            { type: "unsupported_native_tool", name: "bad_tool", config: { mode: "x" } },
          ],
          tool_choice: { type: "tool", name: "web_search" },
        },
      });
      assert.equal(webSearchResponse.status, 200, webSearchResponse.body);

      const unsupportedChoiceResponse = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "gpt-responses",
          messages: [{ role: "user", content: "Use the native-only tool if possible." }],
          tools: [
            { type: "unsupported_native_tool", name: "bad_tool", config: { mode: "x" } },
          ],
          tool_choice: { type: "tool", name: "bad_tool" },
        },
      });
      assert.equal(unsupportedChoiceResponse.status, 200, unsupportedChoiceResponse.body);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
  assert.equal(upstreamCalls[0].url, "https://chat-anthropic-choice-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-chat-anthropic-choice-responses-secret");
  assert.deepEqual(upstreamCalls[0].body.tool_choice, { type: "function", name: "lookup" });
  assert.equal(upstreamCalls[0].body.parallel_tool_calls, false);
  assert.equal(upstreamCalls[1].url, "https://chat-anthropic-choice-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-chat-anthropic-choice-responses-secret");
  assert.equal(upstreamCalls[1].body.tool_choice, "required");
  assert.equal(upstreamCalls[1].body.parallel_tool_calls, false);
  assert.equal(upstreamCalls[2].url, "https://chat-anthropic-choice-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[2].authorization, "Bearer sk-chat-anthropic-choice-responses-secret");
  assert.deepEqual(upstreamCalls[2].body.tools, [
    { type: "web_search_preview" },
    { type: "function", name: "lookup", parameters: { type: "object" } },
  ]);
  assert.deepEqual(upstreamCalls[2].body.tool_choice, { type: "web_search_preview" });
  assert.deepEqual(upstreamCalls[2].body.input.at(-1), {
    role: "user",
    content: [{
      type: "input_text",
      text: 'OpenAI Chat unsupported tools for Responses: [{"type":"unsupported_native_tool","name":"bad_tool","config":{"mode":"x"}}]',
    }],
  });
  assert.equal(upstreamCalls[3].url, "https://chat-anthropic-choice-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[3].authorization, "Bearer sk-chat-anthropic-choice-responses-secret");
  assert.equal(upstreamCalls[3].body.tools, undefined);
  assert.equal(upstreamCalls[3].body.tool_choice, undefined);
  assert.deepEqual(upstreamCalls[3].body.input.slice(-2), [
    {
      role: "user",
      content: [{
        type: "input_text",
        text: 'OpenAI Chat unsupported tools for Responses: [{"type":"unsupported_native_tool","name":"bad_tool","config":{"mode":"x"}}]',
      }],
    },
    {
      role: "user",
      content: [{
        type: "input_text",
        text: 'OpenAI Chat unsupported tool_choice for Responses: {"type":"tool","name":"bad_tool"}',
      }],
    },
  ]);
});

test("model gateway adapts legacy Chat functions through Responses and Anthropic providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "legacy-chat-functions-responses",
      name: "Legacy Chat Functions Responses",
      appScopes: ["opencode"],
      baseUrl: "https://legacy-chat-functions-responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-legacy-chat-functions-responses" },
    setActiveScopes: ["opencode"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "legacy-chat-functions-anthropic",
      name: "Legacy Chat Functions Anthropic",
      appScopes: ["openclaw"],
      baseUrl: "https://legacy-chat-functions-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-legacy-chat-functions-anthropic" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const upstreamUrl = String(url);
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({
      url: upstreamUrl,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body,
    });
    if (upstreamUrl.includes("legacy-chat-functions-anthropic")) {
      return new Response(JSON.stringify({
        id: "msg_legacy_functions",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "legacy anthropic ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 8, output_tokens: 4 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: "resp_legacy_functions",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{ id: "msg_legacy_functions", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "legacy responses ok" }] }],
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const legacyBody = {
    model: "gpt-legacy",
    messages: [
      { role: "user", content: "Need lookup" },
      { role: "assistant", content: null, function_call: { name: "lookup", arguments: "{\"query\":\"docs\"}" } },
      { role: "function", name: "lookup", content: "found" },
    ],
    functions: [{ name: "lookup", description: "Lookup docs", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }],
    function_call: { name: "lookup" },
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/chat/completions`, { method: "POST", headers: { "x-tracevane-app-scope": "opencode" }, body: legacyBody });
      assert.equal(responses.status, 200, responses.body);
      assert.equal(responses.body.choices[0].message.content, "legacy responses ok");

      const anthropic = await requestJson(`${baseUrl}/v1/chat/completions`, { method: "POST", headers: { "x-tracevane-app-scope": "openclaw" }, body: legacyBody });
      assert.equal(anthropic.status, 200, anthropic.body);
      assert.equal(anthropic.body.choices[0].message.content, "legacy anthropic ok");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://legacy-chat-functions-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-legacy-chat-functions-responses");
  assert.deepEqual(upstreamCalls[0].body.tools, [{ type: "function", name: "lookup", description: "Lookup docs", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } }]);
  assert.deepEqual(upstreamCalls[0].body.tool_choice, { type: "function", name: "lookup" });
  assert.deepEqual(upstreamCalls[0].body.input, [
    { role: "user", content: [{ type: "input_text", text: "Need lookup" }] },
    { type: "function_call", id: "fc_call_lookup", call_id: "call_lookup", status: "completed", name: "lookup", arguments: "{\"query\":\"docs\"}" },
    { type: "function_call_output", call_id: "call_lookup", output: "found" },
  ]);

  assert.equal(upstreamCalls[1].url, "https://legacy-chat-functions-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[1].xApiKey, "sk-legacy-chat-functions-anthropic");
  assert.deepEqual(upstreamCalls[1].body.tools, [{ name: "lookup", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] }, description: "Lookup docs" }]);
  assert.deepEqual(upstreamCalls[1].body.tool_choice, { type: "tool", name: "lookup" });
  assert.deepEqual(upstreamCalls[1].body.messages, [
    { role: "user", content: "Need lookup" },
    { role: "assistant", content: [{ type: "tool_use", id: "call_lookup", name: "lookup", input: { query: "docs" } }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "call_lookup", content: "found" }] },
  ]);
});

test("model gateway preserves malformed Chat tool history through Responses and Anthropic providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "malformed-chat-tool-history-responses",
      name: "Malformed Chat Tool History Responses",
      appScopes: ["opencode"],
      baseUrl: "https://malformed-chat-tool-history-responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-malformed-chat-tool-history-responses" },
    setActiveScopes: ["opencode"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "malformed-chat-tool-history-anthropic",
      name: "Malformed Chat Tool History Anthropic",
      appScopes: ["openclaw"],
      baseUrl: "https://malformed-chat-tool-history-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-malformed-chat-tool-history-anthropic" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const upstreamUrl = String(url);
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({
      url: upstreamUrl,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body,
    });
    if (upstreamUrl.includes("malformed-chat-tool-history-anthropic")) {
      return new Response(JSON.stringify({
        id: "msg_malformed_chat_tool_history",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "malformed anthropic ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 8, output_tokens: 4 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: "resp_malformed_chat_tool_history",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{ id: "msg_malformed_chat_tool_history", type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: "malformed responses ok" }] }],
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const malformedBody = {
    model: "gpt-tool-history",
    messages: [
      { role: "user", content: "Continue after tool history." },
      {
        role: "assistant",
        content: "I attempted tool calls.",
        function_call: { arguments: "{\"query\":\"docs\"}" },
        tool_calls: [
          { id: "call_missing_name", type: "function", function: { arguments: "{\"query\":\"docs\"}" } },
          { type: "function", function: { name: "lookup", arguments: "{\"query\":\"docs\"}" } },
        ],
      },
      { role: "tool", content: "orphan tool result" },
      { role: "function", content: "orphan function result" },
    ],
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: malformedBody,
      });
      assert.equal(responses.status, 200, responses.body);
      assert.equal(responses.body.choices[0].message.content, "malformed responses ok");

      const anthropic = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: malformedBody,
      });
      assert.equal(anthropic.status, 200, anthropic.body);
      assert.equal(anthropic.body.choices[0].message.content, "malformed anthropic ok");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://malformed-chat-tool-history-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-malformed-chat-tool-history-responses");
  assert.deepEqual(upstreamCalls[0].body.input, [
    { role: "user", content: [{ type: "input_text", text: "Continue after tool history." }] },
    { role: "assistant", content: [{ type: "output_text", text: "I attempted tool calls." }] },
    { role: "assistant", content: [{ type: "output_text", text: 'OpenAI Chat malformed function_call for Responses: {"arguments":"{\\"query\\":\\"docs\\"}"}' }] },
    { role: "assistant", content: [{ type: "output_text", text: 'OpenAI Chat malformed tool_call for Responses: {"id":"call_missing_name","type":"function","function":{"arguments":"{\\"query\\":\\"docs\\"}"}}' }] },
    { role: "assistant", content: [{ type: "output_text", text: 'OpenAI Chat malformed tool_call for Responses: {"type":"function","function":{"name":"lookup","arguments":"{\\"query\\":\\"docs\\"}"}}' }] },
    { role: "user", content: [{ type: "input_text", text: 'OpenAI Chat tool message missing tool_call_id for Responses: {"role":"tool","content":"orphan tool result"}' }] },
    { role: "user", content: [{ type: "input_text", text: 'OpenAI Chat function message missing name for Responses: {"role":"function","content":"orphan function result"}' }] },
  ]);

  assert.equal(upstreamCalls[1].url, "https://malformed-chat-tool-history-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[1].xApiKey, "sk-malformed-chat-tool-history-anthropic");
  assert.deepEqual(upstreamCalls[1].body.messages, [
    { role: "user", content: "Continue after tool history." },
    {
      role: "assistant",
      content: [
        { type: "text", text: "I attempted tool calls." },
        { type: "text", text: 'OpenAI Chat malformed tool_call for Anthropic Messages: {"id":"call_missing_name","type":"function","function":{"arguments":"{\\"query\\":\\"docs\\"}"}}' },
        { type: "text", text: 'OpenAI Chat malformed tool_call for Anthropic Messages: {"type":"function","function":{"name":"lookup","arguments":"{\\"query\\":\\"docs\\"}"}}' },
        { type: "text", text: 'OpenAI Chat malformed function_call for Anthropic Messages: {"arguments":"{\\"query\\":\\"docs\\"}"}' },
      ],
    },
    { role: "user", content: 'OpenAI Chat tool message missing tool_call_id for Anthropic Messages: {"role":"tool","content":"orphan tool result"}' },
    { role: "user", content: 'OpenAI Chat function message missing name for Anthropic Messages: {"role":"function","content":"orphan function result"}' },
  ]);
});

test("model gateway returns legacy Chat function_call for legacy functions clients", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "legacy-function-response-responses",
      name: "Legacy Function Response Responses",
      appScopes: ["opencode"],
      baseUrl: "https://legacy-function-response-responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-legacy-function-response-responses" },
    setActiveScopes: ["opencode"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "legacy-function-response-anthropic",
      name: "Legacy Function Response Anthropic",
      appScopes: ["openclaw"],
      baseUrl: "https://legacy-function-response-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-legacy-function-response-anthropic" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const upstreamUrl = String(url);
    if (upstreamUrl.includes("legacy-function-response-anthropic")) {
      return new Response(JSON.stringify({
        id: "msg_legacy_function_call",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "tool_use", id: "call_lookup", name: "lookup", input: { query: "docs" } }],
        stop_reason: "tool_use",
        usage: { input_tokens: 8, output_tokens: 4 },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({
      id: "resp_legacy_function_call",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{
        id: "fc_call_lookup",
        type: "function_call",
        status: "completed",
        call_id: "call_lookup",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      }],
      usage: { input_tokens: 8, output_tokens: 4, total_tokens: 12 },
    }), { status: 200, headers: { "content-type": "application/json" } });
  };

  const legacyBody = {
    model: "gpt-legacy",
    messages: [{ role: "user", content: "Need lookup" }],
    functions: [{ name: "lookup", parameters: { type: "object", properties: { query: { type: "string" } } } }],
    function_call: { name: "lookup" },
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: legacyBody,
      });
      assert.equal(responses.status, 200, responses.body);
      assert.equal(responses.body.choices[0].finish_reason, "function_call");
      assert.deepEqual(responses.body.choices[0].message, {
        role: "assistant",
        content: null,
        function_call: { name: "lookup", arguments: "{\"query\":\"docs\"}" },
      });
      assert.equal(JSON.stringify(responses.body).includes("tool_calls"), false);

      const anthropic = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: legacyBody,
      });
      assert.equal(anthropic.status, 200, anthropic.body);
      assert.equal(anthropic.body.choices[0].finish_reason, "function_call");
      assert.deepEqual(anthropic.body.choices[0].message, {
        role: "assistant",
        content: null,
        function_call: { name: "lookup", arguments: "{\"query\":\"docs\"}" },
      });
      assert.equal(JSON.stringify(anthropic.body).includes("tool_calls"), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("model gateway streams legacy Chat function_call for legacy functions clients", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "legacy-function-stream-responses",
      name: "Legacy Function Stream Responses",
      appScopes: ["opencode"],
      baseUrl: "https://legacy-function-stream-responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-legacy-function-stream-responses" },
    setActiveScopes: ["opencode"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "legacy-function-stream-anthropic",
      name: "Legacy Function Stream Anthropic",
      appScopes: ["openclaw"],
      baseUrl: "https://legacy-function-stream-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-legacy-function-stream-anthropic" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const upstreamUrl = String(url);
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({
      url: upstreamUrl,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body,
    });
    if (upstreamUrl.includes("legacy-function-stream-anthropic")) {
      const upstreamSse = [
        "event: message_start",
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_legacy_function_stream\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":8,\"output_tokens\":0}}}",
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
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}",
        "",
        "event: message_stop",
        "data: {\"type\":\"message_stop\"}",
        "",
      ].join("\n");
      return new Response(upstreamSse, { status: 200, headers: { "content-type": "text/event-stream" } });
    }
    const upstreamSse = [
      "event: response.created",
      "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_legacy_function_stream\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-responses\",\"output\":[],\"usage\":{\"input_tokens\":8,\"output_tokens\":0}}}",
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
      "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_legacy_function_stream\",\"object\":\"response\",\"status\":\"completed\",\"model\":\"gpt-responses\",\"output\":[{\"id\":\"fc_call_lookup\",\"type\":\"function_call\",\"status\":\"completed\",\"call_id\":\"call_lookup\",\"name\":\"lookup\",\"arguments\":\"{\\\"query\\\":\\\"docs\\\"}\"}],\"usage\":{\"input_tokens\":8,\"output_tokens\":2,\"total_tokens\":10}}}",
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, { status: 200, headers: { "content-type": "text/event-stream" } });
  };

  const legacyBody = {
    model: "gpt-legacy",
    stream: true,
    messages: [{ role: "user", content: "Need lookup" }],
    functions: [{ name: "lookup", parameters: { type: "object", properties: { query: { type: "string" } } } }],
    function_call: { name: "lookup" },
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: legacyBody,
      });
      assert.equal(responses.status, 200, responses.body);
      const responseEvents = parseSseEvents(responses.body);
      assert.equal(responseEvents[0].data.choices[0].delta.role, "assistant");
      assert.deepEqual(responseEvents[1].data.choices[0].delta.function_call, { name: "lookup", arguments: "" });
      assert.deepEqual(responseEvents[2].data.choices[0].delta.function_call, { arguments: "{\"query\":" });
      assert.deepEqual(responseEvents[3].data.choices[0].delta.function_call, { arguments: "\"docs\"}" });
      assert.equal(responseEvents[4].data.choices[0].finish_reason, "function_call");
      assert.equal(JSON.stringify(responseEvents).includes("tool_calls"), false);
      assert.equal(responseEvents[5].data, "[DONE]");

      const anthropic = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: legacyBody,
      });
      assert.equal(anthropic.status, 200, anthropic.body);
      const anthropicEvents = parseSseEvents(anthropic.body);
      assert.equal(anthropicEvents[0].data.choices[0].delta.role, "assistant");
      assert.deepEqual(anthropicEvents[1].data.choices[0].delta.function_call, { name: "lookup", arguments: "" });
      assert.deepEqual(anthropicEvents[2].data.choices[0].delta.function_call, { arguments: "{\"query\":" });
      assert.deepEqual(anthropicEvents[3].data.choices[0].delta.function_call, { arguments: "\"docs\"}" });
      assert.equal(anthropicEvents[4].data.choices[0].finish_reason, "function_call");
      assert.equal(JSON.stringify(anthropicEvents).includes("tool_calls"), false);
      assert.equal(anthropicEvents[5].data, "[DONE]");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://legacy-function-stream-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-legacy-function-stream-responses");
  assert.equal(upstreamCalls[0].body.stream, true);
  assert.deepEqual(upstreamCalls[0].body.tools, [{ type: "function", name: "lookup", parameters: { type: "object", properties: { query: { type: "string" } } } }]);
  assert.equal(upstreamCalls[1].url, "https://legacy-function-stream-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[1].xApiKey, "sk-legacy-function-stream-anthropic");
  assert.equal(upstreamCalls[1].body.stream, true);
  assert.deepEqual(upstreamCalls[1].body.tools, [{ name: "lookup", input_schema: { type: "object", properties: { query: { type: "string" } } } }]);
});

test("model gateway preserves Responses-style Chat input image parts for Responses providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-responses-input-image",
      name: "Chat Responses Input Image Provider",
      appScopes: ["opencode"],
      baseUrl: "https://chat-responses-input-image.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-responses-input-image-secret" },
    setActiveScopes: ["opencode"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "resp_chat_input_image",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Image input preserved." }],
      }],
      usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "gpt-responses",
          messages: [{
            role: "user",
            content: [
              { type: "input_text", text: "Describe this image." },
              { type: "input_image", image_url: "https://example.test/image.png", detail: "low" },
              { type: "input_image", file_id: "file_image_123" },
            ],
          }],
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.choices[0].message.content, "Image input preserved.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://chat-responses-input-image.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-chat-responses-input-image-secret");
  assert.deepEqual(upstreamCalls[0].body.input, [{
    role: "user",
    content: [
      { type: "input_text", text: "Describe this image." },
      { type: "input_image", image_url: "https://example.test/image.png", detail: "low" },
      { type: "input_image", file_id: "file_image_123" },
    ],
  }]);
});

test("model gateway preserves Responses-style Chat input file parts for Responses providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-responses-input-file",
      name: "Chat Responses Input File Provider",
      appScopes: ["opencode"],
      baseUrl: "https://chat-responses-input-file.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-responses-input-file-secret" },
    setActiveScopes: ["opencode"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "resp_chat_input_file",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "File input preserved." }],
      }],
      usage: { input_tokens: 12, output_tokens: 4, total_tokens: 16 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "gpt-responses",
          messages: [{
            role: "user",
            content: [
              { type: "input_text", text: "Summarize these files." },
              { type: "input_file", file_url: "https://example.test/report.pdf", filename: "report.pdf" },
              { type: "file", file: { file_id: "file_abc123", filename: "notes.txt" } },
              { type: "input_file", file_data: "data:text/plain;base64,SGVsbG8=", filename: "inline.txt" },
            ],
          }],
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.choices[0].message.content, "File input preserved.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://chat-responses-input-file.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-chat-responses-input-file-secret");
  assert.deepEqual(upstreamCalls[0].body.input, [{
    role: "user",
    content: [
      { type: "input_text", text: "Summarize these files." },
      { type: "input_file", file_url: "https://example.test/report.pdf", filename: "report.pdf" },
      { type: "input_file", file_id: "file_abc123", filename: "notes.txt" },
      { type: "input_file", file_data: "data:text/plain;base64,SGVsbG8=", filename: "inline.txt" },
    ],
  }]);
});

test("model gateway preserves Chat assistant refusal parts for Responses providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-responses-refusal-input",
      name: "Chat Responses Refusal Input Provider",
      appScopes: ["opencode"],
      baseUrl: "https://chat-responses-refusal-input.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-chat-responses-refusal-input-secret" },
    setActiveScopes: ["opencode"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "resp_chat_refusal_input",
      object: "response",
      status: "completed",
      model: "gpt-responses",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Refusal history preserved." }],
      }],
      usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "gpt-responses",
          messages: [
            {
              role: "assistant",
              content: [{ type: "refusal", refusal: "I cannot help with that." }],
            },
            { role: "user", content: "Please answer safely." },
          ],
        },
      });
      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.choices[0].message.content, "Refusal history preserved.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://chat-responses-refusal-input.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-chat-responses-refusal-input-secret");
  assert.deepEqual(upstreamCalls[0].body.input, [
    {
      role: "assistant",
      content: [{ type: "refusal", refusal: "I cannot help with that." }],
    },
    {
      role: "user",
      content: [{ type: "input_text", text: "Please answer safely." }],
    },
  ]);
});

test("model gateway preserves supported responses controls and strips rejected chat-only fields", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-modern-controls",
      name: "Responses Modern Controls Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://responses-modern-controls.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-modern-controls-secret" },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "resp_modern_controls",
      object: "response",
      status: "completed",
      model: "gpt-5.4",
      output: [{
        type: "message",
        role: "assistant",
        content: [{
          type: "output_text",
          text: "Modern controls preserved.",
          logprobs: [{ token: "Modern", logprob: -0.1, bytes: [77] }],
        }],
      }],
      usage: {
        input_tokens: 5,
        output_tokens: 3,
        total_tokens: 8,
        input_tokens_details: { cached_tokens: 2, audio_tokens: 1 },
        output_tokens_details: {
          reasoning_tokens: 1,
          audio_tokens: 2,
          accepted_prediction_tokens: 3,
          rejected_prediction_tokens: 4,
        },
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
          model: "gpt-5.4",
          messages: [{ role: "user", content: "preserve modern responses controls" }],
          background: true,
          conversation: "conv_123",
          include: ["reasoning.encrypted_content", "message.output_text.logprobs"],
          max_tool_calls: 7,
          frequency_penalty: 0,
          metadata: { trace_id: "strip-for-codex-responses" },
          presence_penalty: 0,
          previous_response_id: "resp_previous",
          prompt: { id: "pmpt_123", variables: { topic: "gateway" } },
          prompt_cache_key: "cache-key-123",
          prompt_cache_retention: "24h",
          safety_identifier: "user-hash-123",
          seed: 123,
          stop: ["STOP"],
          store: false,
          stream_options: { include_usage: true },
          top_logprobs: 3,
          truncation: "auto",
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, "Modern controls preserved.");
      assert.deepEqual(chat.body.choices[0].logprobs, {
        content: [{ token: "Modern", logprob: -0.1, bytes: [77] }],
      });
      assert.deepEqual(chat.body.usage, {
        prompt_tokens: 5,
        completion_tokens: 3,
        total_tokens: 8,
        prompt_tokens_details: { cached_tokens: 2, audio_tokens: 1 },
        completion_tokens_details: {
          reasoning_tokens: 1,
          audio_tokens: 2,
          accepted_prediction_tokens: 3,
          rejected_prediction_tokens: 4,
        },
      });

      const unsupportedFormat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          messages: [{ role: "user", content: "preserve unsupported chat response_format as context" }],
          response_format: {
            type: "yaml_schema",
            schema: { type: "object", additionalProperties: false },
          },
        },
      });
      assert.equal(unsupportedFormat.status, 200, unsupportedFormat.body);
      assert.equal(unsupportedFormat.body.choices[0].message.content, "Modern controls preserved.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-modern-controls.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-modern-controls-secret");
  assert.deepEqual(upstreamCalls[0].body, {
    model: "gpt-5.4",
    input: [{ role: "user", content: [{ type: "input_text", text: "preserve modern responses controls" }] }],
    stream: false,
    background: true,
    conversation: "conv_123",
    include: ["reasoning.encrypted_content", "message.output_text.logprobs"],
    max_tool_calls: 7,
    previous_response_id: "resp_previous",
    prompt: { id: "pmpt_123", variables: { topic: "gateway" } },
    prompt_cache_key: "cache-key-123",
    prompt_cache_retention: "24h",
    safety_identifier: "user-hash-123",
    store: false,
    stream_options: { include_usage: true },
    top_logprobs: 3,
    truncation: "auto",
  });
  assert.equal("metadata" in upstreamCalls[0].body, false);
  assert.equal("stop" in upstreamCalls[0].body, false);
  assert.equal("frequency_penalty" in upstreamCalls[0].body, false);
  assert.equal("presence_penalty" in upstreamCalls[0].body, false);
  assert.equal("seed" in upstreamCalls[0].body, false);

  assert.equal(upstreamCalls[1].url, "https://responses-modern-controls.example.test/v1/responses");
  assert.equal(upstreamCalls[1].authorization, "Bearer sk-responses-modern-controls-secret");
  assert.equal("text" in upstreamCalls[1].body, false);
  assert.deepEqual(upstreamCalls[1].body.input, [
    { role: "user", content: [{ type: "input_text", text: "preserve unsupported chat response_format as context" }] },
    {
      role: "user",
      content: [{
        type: "input_text",
        text: 'OpenAI Chat unsupported response_format for Responses: {"type":"yaml_schema","schema":{"type":"object","additionalProperties":false}}',
      }],
    },
  ]);
});

test("model gateway preserves Responses cache and safety controls for Chat providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-chat-cache-controls",
      name: "Responses Chat Cache Controls Provider",
      appScopes: ["codex"],
      baseUrl: "https://responses-chat-cache-controls.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-chat-cache-controls-secret" },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: JSON.parse(String(init.body || "{}")),
    });
    return new Response(JSON.stringify({
      id: "chat_cache_controls",
      object: "chat.completion",
      created: 1_710_000_041,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "cache ok" },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
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
          model: "gpt-chat",
          input: "preserve responses cache controls",
          prompt_cache_key: "responses-cache-key",
          prompt_cache_retention: "24h",
          safety_identifier: "hashed-user-id",
        },
      });

      assert.equal(response.status, 200, response.body);
      assert.equal(response.body.output[0].content[0].text, "cache ok");

      const unsupportedFormat = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          input: "preserve unsupported responses formats as context",
          text: {
            format: { type: "grammar", syntax: "lark", definition: "start: WORD" },
            verbosity: "low",
          },
          response_format: {
            type: "yaml_schema",
            schema: { type: "object", additionalProperties: false },
          },
        },
      });

      assert.equal(unsupportedFormat.status, 200, unsupportedFormat.body);
      assert.equal(unsupportedFormat.body.output[0].content[0].text, "cache ok");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-chat-cache-controls.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].body.prompt_cache_key, "responses-cache-key");
  assert.equal(upstreamCalls[0].body.prompt_cache_retention, "24h");
  assert.equal(upstreamCalls[0].body.safety_identifier, "hashed-user-id");

  assert.equal(upstreamCalls[1].url, "https://responses-chat-cache-controls.example.test/v1/chat/completions");
  assert.equal("response_format" in upstreamCalls[1].body, false);
  assert.equal("text" in upstreamCalls[1].body, false);
  assert.equal(upstreamCalls[1].body.verbosity, "low");
  assert.deepEqual(upstreamCalls[1].body.messages, [
    { role: "user", content: "preserve unsupported responses formats as context" },
    { role: "user", content: 'OpenAI Responses unsupported text.format for Chat: {"type":"grammar","syntax":"lark","definition":"start: WORD"}' },
    { role: "user", content: 'OpenAI Responses unsupported response_format for Chat: {"type":"yaml_schema","schema":{"type":"object","additionalProperties":false}}' },
  ]);
});

test("model gateway applies responses adapter stop sequences locally without forwarding unsupported stop", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-local-stop",
      name: "Responses Local Stop Provider",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-local-stop.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-responses-local-stop-secret" },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({ url: String(url), body });
    if (body.stream) {
      const response = {
        id: `resp_local_stop_stream_${upstreamCalls.length}`,
        object: "response",
        status: "completed",
        model: body.model,
        output: [{
          id: "msg_local_stop_stream",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: "Hello STOP hidden" }],
        }],
        usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
      };
      const upstreamSse = [
        `event: response.created\ndata: ${JSON.stringify({ response: { ...response, status: "in_progress", output: [] } })}`,
        `event: response.output_text.delta\ndata: ${JSON.stringify({ delta: "Hello ST" })}`,
        `event: response.output_text.delta\ndata: ${JSON.stringify({ delta: "OP hidden" })}`,
        `event: response.completed\ndata: ${JSON.stringify({ response })}`,
        "data: [DONE]",
        "",
      ].join("\n\n");
      return new Response(upstreamSse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    }
    return new Response(JSON.stringify({
      id: `resp_local_stop_${upstreamCalls.length}`,
      object: "response",
      status: "completed",
      model: body.model,
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Hello STOP hidden" }],
      }],
      usage: { input_tokens: 3, output_tokens: 4, total_tokens: 7 },
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
          model: "gpt-5.4",
          messages: [{ role: "user", content: "stop locally" }],
          stop: ["STOP"],
        },
      });
      assert.equal(chat.status, 200, chat.body);
      assert.equal(chat.body.choices[0].message.content, "Hello ");
      assert.equal(chat.body.choices[0].finish_reason, "stop");

      const chatStream = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          messages: [{ role: "user", content: "stream stop locally" }],
          stream: true,
          stop: ["STOP"],
        },
      });
      assert.equal(chatStream.status, 200, chatStream.body);
      const chatEvents = parseSseEvents(chatStream.body);
      const chatStreamText = chatEvents
        .filter((event) => event.data !== "[DONE]")
        .map((event) => event.data.choices?.[0]?.delta?.content || "")
        .join("");
      assert.equal(chatStreamText, "Hello ");
      assert.equal(chatEvents.at(-2).data.choices[0].finish_reason, "stop");

      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          max_tokens: 64,
          messages: [{ role: "user", content: "anthropic stop locally" }],
          stop_sequences: ["STOP"],
        },
      });
      assert.equal(messages.status, 200, messages.body);
      assert.deepEqual(messages.body.content, [{ type: "text", text: "Hello " }]);
      assert.equal(messages.body.stop_reason, "stop_sequence");
      assert.equal(messages.body.stop_sequence, "STOP");

      const messageStream = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          max_tokens: 64,
          messages: [{ role: "user", content: "stream anthropic stop locally" }],
          stream: true,
          stop_sequences: ["STOP"],
        },
      });
      assert.equal(messageStream.status, 200, messageStream.body);
      const messageEvents = parseSseEvents(messageStream.body);
      const messageStreamText = messageEvents
        .filter((event) => event.event === "content_block_delta")
        .map((event) => event.data.delta.text || "")
        .join("");
      assert.equal(messageStreamText, "Hello ");
      const messageDelta = messageEvents.find((event) => event.event === "message_delta");
      assert.equal(messageDelta.data.delta.stop_reason, "stop_sequence");
      assert.equal(messageDelta.data.delta.stop_sequence, "STOP");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
  assert.ok(upstreamCalls.every((call) => call.url === "https://responses-local-stop.example.test/v1/responses"));
  assert.ok(upstreamCalls.every((call) => !("stop" in call.body)));
});

test("model gateway protocol matrix forwards native anthropic messages", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
      anthropicBeta: init.headers instanceof Headers ? init.headers.get("anthropic-beta") : null,
      anthropicWorkspaceId: init.headers instanceof Headers ? init.headers.get("anthropic-workspace-id") : null,
      anthropicFutureCapability: init.headers instanceof Headers ? init.headers.get("anthropic-future-capability") : null,
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
        headers: {
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "context-management-2025-06-27",
          "anthropic-workspace-id": "workspace_native",
          "anthropic-future-capability": "future-native",
        },
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
  assert.equal(upstreamCalls[0].anthropicBeta, "context-management-2025-06-27");
  assert.equal(upstreamCalls[0].anthropicWorkspaceId, "workspace_native");
  assert.equal(upstreamCalls[0].anthropicFutureCapability, "future-native");
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

test("model gateway normalizes legacy anthropic thinking before native passthrough", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "native-anthropic-thinking",
      name: "Native Anthropic Thinking",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic-thinking.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-native-anthropic-thinking-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "msg_native_thinking",
      type: "message",
      role: "assistant",
      model: "claude-native",
      content: [{ type: "text", text: "ok" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 10, output_tokens: 1 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "claude-native",
          max_tokens: 64,
          thinking: {
            type: "enabled",
            budget_tokens: 9000,
          },
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.content[0].text, "ok");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://anthropic-thinking.example.test/v1/messages");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "claude-native",
    max_tokens: 64,
    thinking: { type: "adaptive" },
    output_config: { effort: "high" },
    messages: [{ role: "user", content: "hello" }],
  });
});

test("model gateway adapts anthropic messages through openai chat providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      anthropicVersion: init.headers instanceof Headers ? init.headers.get("anthropic-version") : null,
      anthropicWorkspaceId: init.headers instanceof Headers ? init.headers.get("anthropic-workspace-id") : null,
      anthropicFutureCapability: init.headers instanceof Headers ? init.headers.get("anthropic-future-capability") : null,
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
    if (upstreamCalls.length === 3) {
      const upstreamSse = [
        "data: {\"id\":\"chatcmpl_anthropic_empty_tool_delta\",\"created\":1710000041,\"model\":\"gpt-chat\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_empty_tool_delta\",\"created\":1710000041,\"model\":\"gpt-chat\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"type\":\"function\",\"function\":{}}]}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_empty_tool_delta\",\"created\":1710000041,\"model\":\"gpt-chat\",\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":6,\"completion_tokens\":1,\"total_tokens\":7}}",
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
          annotations: [{
            type: "url_citation",
            url: "https://example.test/chat-source",
            title: "Chat Source",
          }],
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
        headers: {
          "anthropic-version": "2023-06-01",
          "anthropic-workspace-id": "workspace_must_not_reach_chat",
          "anthropic-future-capability": "future-must-not-reach-chat",
        },
        body: {
          model: "gpt-chat",
          system: "Be direct.",
          max_tokens: 128,
          messages: [
            { role: "user", content: [{ type: "text", text: "hello" }] },
            {
              role: "assistant",
              content: [
                { type: "thinking", thinking: "Need lookup before answering.", signature: "sig_lookup" },
                { type: "text", text: "I will call." },
                { type: "tool_use", id: "call_lookup", name: "lookup", input: { query: "docs" } },
              ],
            },
            {
              role: "user",
              content: [
                { type: "tool_result", tool_use_id: "call_lookup", is_error: true, content: "done" },
                { type: "text", text: "continue after tool result" },
              ],
            },
          ],
          tools: [{
            name: "lookup",
            description: "Lookup docs",
            input_schema: { type: "object", properties: { query: { type: "string" } } },
          }, {
            type: "web_search_20250305",
            name: "web_search",
          }],
          tool_choice: { type: "tool", name: "web_search", disable_parallel_tool_use: true },
          output_config: {
            format: {
              type: "json_schema",
              name: "lookup_result",
              schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] },
              strict: true,
            },
          },
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
        {
          type: "text",
          text: "Chat provider answer.",
          citations: [{
            type: "web_search_result_location",
            url: "https://example.test/chat-source",
            title: "Chat Source",
          }],
        },
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

      const emptyToolDeltaStream = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-chat",
          max_tokens: 64,
          stream: true,
          messages: [{ role: "user", content: "empty tool delta stream please" }],
        },
      });
      assert.equal(emptyToolDeltaStream.status, 200);
      const emptyToolDeltaEvents = parseSseEvents(emptyToolDeltaStream.body);
      assert.deepEqual(emptyToolDeltaEvents.map((item) => item.event), [
        "message_start",
        "message_delta",
        "message_stop",
      ]);
      assert.equal(emptyToolDeltaEvents[1].data.delta.stop_reason, "end_turn");
      assert.equal(JSON.stringify(emptyToolDeltaEvents).includes("tool_use"), false);

      const unsupportedOutputFormat = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-chat",
          max_tokens: 64,
          messages: [{ role: "user", content: "preserve unsupported anthropic output format" }],
          output_config: {
            format: { type: "grammar", syntax: "lark", definition: "start: WORD" },
          },
        },
      });
      assert.equal(unsupportedOutputFormat.status, 200, unsupportedOutputFormat.body);
      assert.equal(unsupportedOutputFormat.body.content[0].text, "Chat provider answer.");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.requestedPath, entry.outcome]), [
        ["anthropic_messages", "/v1/messages", "success"],
        ["anthropic_messages", "/claude/v1/messages", "success"],
        ["anthropic_messages", "/v1/messages", "success"],
        ["anthropic_messages", "/v1/messages", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-anthropic-chat-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
  assert.equal(upstreamCalls[0].url, "https://anthropic-chat.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-anthropic-chat-secret");
  assert.equal(upstreamCalls[0].anthropicVersion, null);
  assert.equal(upstreamCalls[0].anthropicWorkspaceId, null);
  assert.equal(upstreamCalls[0].anthropicFutureCapability, null);
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-chat",
    messages: [
      { role: "system", content: "Be direct." },
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "I will call.",
        reasoning_content: "Need lookup before answering.",
        reasoning_details: [
          { type: "thinking", thinking: "Need lookup before answering.", signature: "sig_lookup" },
        ],
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
      {
        role: "user",
        content: "continue after tool result",
      },
    ],
    stream: false,
    max_tokens: 128,
    temperature: 0.1,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "lookup_result",
        schema: { type: "object", additionalProperties: false, properties: { ok: { type: "boolean" } }, required: ["ok"] },
        strict: true,
      },
    },
    user: "claude-code-session",
    tools: [{
      type: "function",
      function: {
        name: "lookup",
        description: "Lookup docs",
        parameters: { type: "object", properties: { query: { type: "string" } } },
      },
    }, {
      type: "web_search_preview",
    }],
    tool_choice: { type: "web_search_preview" },
    parallel_tool_calls: false,
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
  assert.equal(upstreamCalls[3].url, "https://anthropic-chat.example.test/v1/chat/completions");
  assert.deepEqual(JSON.parse(upstreamCalls[3].body), {
    model: "gpt-chat",
    messages: [
      { role: "user", content: "preserve unsupported anthropic output format" },
      { role: "user", content: 'Anthropic Messages unsupported output_config.format for Chat: {"type":"grammar","syntax":"lark","definition":"start: WORD"}' },
    ],
    stream: false,
    max_tokens: 64,
  });
});

test("model gateway adapts legacy Chat function_call responses to Anthropic tool_use", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-legacy-chat-function-response",
      name: "Anthropic Legacy Chat Function Response",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic-legacy-chat-function-response.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-anthropic-legacy-chat-function-response-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_legacy_function_to_anthropic",
      created: 1_710_000_042,
      model: "gpt-chat",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: null,
          function_call: {
            name: "lookup",
            arguments: "{\"query\":\"docs\"}",
          },
        },
        finish_reason: "function_call",
      }],
      usage: {
        prompt_tokens: 8,
        completion_tokens: 3,
        total_tokens: 11,
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
          max_tokens: 64,
          messages: [{ role: "user", content: "Use lookup." }],
          tools: [{ name: "lookup", input_schema: { type: "object" } }],
        },
      });

      assert.equal(messages.status, 200);
      assert.equal(messages.body.id, "chatcmpl_legacy_function_to_anthropic");
      assert.deepEqual(messages.body.content, [
        { type: "tool_use", id: "call_lookup", name: "lookup", input: { query: "docs" } },
      ]);
      assert.equal(messages.body.stop_reason, "tool_use");
      assert.deepEqual(messages.body.usage, { input_tokens: 8, output_tokens: 3 });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://anthropic-legacy-chat-function-response.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-anthropic-legacy-chat-function-response-secret");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-chat",
    messages: [{ role: "user", content: "Use lookup." }],
    stream: false,
    max_tokens: 64,
    tools: [{
      type: "function",
      function: { name: "lookup", parameters: { type: "object" } },
    }],
  });
});

test("model gateway ignores chat tool finish reason without tool calls for anthropic messages", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-empty-tool-finish",
      name: "Anthropic Empty Tool Finish",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic-empty-tool-finish.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-anthropic-empty-tool-finish-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "chatcmpl_empty_tool_finish",
    created: 1_710_000_041,
    model: "gpt-chat",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: "",
      },
      finish_reason: "tool_calls",
    }],
    usage: {
      prompt_tokens: 6,
      completion_tokens: 1,
      total_tokens: 7,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-chat",
          max_tokens: 64,
          messages: [{ role: "user", content: "empty tool finish please" }],
        },
      });

      assert.equal(messages.status, 200);
      assert.equal(messages.body.stop_reason, "end_turn");
      assert.deepEqual(messages.body.content, []);
      assert.equal(JSON.stringify(messages.body).includes("tool_use"), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway adapts codex responses through native anthropic messages providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      return new Response(JSON.stringify({
        id: "msg_stream_anthropic",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{
          type: "text",
          text: "Anthropic stream",
          citations: [{
            type: "web_search_result_location",
            url: "https://example.test/anthropic-stream",
            title: "Anthropic Stream",
          }],
        }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 6,
          output_tokens: 3,
          server_tool_use: { web_search_requests: 1 },
          service_tier: "priority",
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
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
        ...(isCompact ? {} : { server_tool_use: { web_search_requests: 1 }, service_tier: "priority" }),
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
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: "Plan the task.\n" },
              { type: "input_file", file_url: "https://example.test/brief.pdf", filename: "brief.pdf" },
            ],
          }],
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
          text: {
            format: {
              type: "json_schema",
              name: "plan_result",
              schema: { type: "object", additionalProperties: false, properties: { plan: { type: "string" } }, required: ["plan"] },
              strict: true,
            },
          },
          user: "responses-user-123",
          max_output_tokens: 256,
          temperature: 0.1,
        },
      });
      assert.equal(responses.status, 200, responses.body);
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
        server_tool_use: { web_search_requests: 1 },
        service_tier: "priority",
      });
      assert.equal(responses.body.service_tier, "priority");

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
        "response.output_text.annotation.added",
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      assert.equal(streamEvents[4].data.delta, "Anthropic stream");
      assert.deepEqual(streamEvents[5].data.annotation, {
        type: "url_citation",
        url: "https://example.test/anthropic-stream",
        title: "Anthropic Stream",
      });
      assert.equal(streamEvents[9].data.response.output[0].content[0].text, "Anthropic stream");
      assert.deepEqual(streamEvents[9].data.response.output[0].content[0].annotations, [{
        type: "url_citation",
        url: "https://example.test/anthropic-stream",
        title: "Anthropic Stream",
      }]);
      assert.deepEqual(streamEvents[9].data.response.usage.server_tool_use, { web_search_requests: 1 });
      assert.equal(streamEvents[9].data.response.usage.service_tier, "priority");
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
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "Plan the task.\n" },
        {
          type: "document",
          source: { type: "url", url: "https://example.test/brief.pdf" },
          title: "brief.pdf",
        },
      ],
    }],
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
    output_config: {
      format: {
        type: "json_schema",
        name: "plan_result",
        schema: { type: "object", additionalProperties: false, properties: { plan: { type: "string" } }, required: ["plan"] },
        strict: true,
      },
    },
    metadata: { user_id: "responses-user-123" },
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
    stream: false,
  });
});

test("model gateway adapts chat completions through native anthropic messages providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      return new Response(JSON.stringify({
        id: "msg_chat_adapter_json_object",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "JSON object requested." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 3 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (upstreamCalls.length === 3) {
      const upstreamSse = [
        "event: message_start",
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_chat_stream\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":8,\"output_tokens\":0,\"server_tool_use\":{\"web_search_requests\":1},\"service_tier\":\"priority\"}}}",
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
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"end_turn\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":3,\"server_tool_use\":{\"web_search_requests\":1},\"service_tier\":\"priority\"}}",
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
        { type: "thinking", thinking: "Need signed context.", signature: "sig_chat_adapter" },
        { type: "redacted_thinking", data: "opaque_redacted_chat_adapter" },
        {
          type: "text",
          text: "Sunny in Tokyo.",
          citations: [{
            type: "char_location",
            cited_text: "Tokyo is sunny.",
            document_index: 0,
            document_title: "Weather Doc",
            start_char_index: 0,
            end_char_index: 15,
          }],
        },
        { type: "tool_use", id: "call_save", name: "save_weather", input: { city: "Tokyo" } },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 11,
        output_tokens: 7,
        cache_read_input_tokens: 3,
        server_tool_use: { web_search_requests: 1 },
        service_tier: "priority",
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
            {
              role: "user",
              content: [
                { type: "text", text: "Weather?" },
                { type: "image_url", image_url: { url: "https://example.test/weather-map.png" } },
              ],
            },
            {
              role: "assistant",
              content: "I will check.",
              reasoning_details: [
                { type: "thinking", thinking: "Need previous weather context.", signature: "sig_previous_weather" },
                { type: "redacted_thinking", data: "opaque_previous_weather" },
              ],
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
              is_error: true,
              content: [
                { type: "text", text: "Sunny" },
                { type: "image_url", image_url: { url: "data:image/png;base64,TOOL_IMAGE" } },
              ],
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
          parallel_tool_calls: false,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "weather_result",
              schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string" } }, required: ["summary"] },
              strict: true,
            },
          },
          user: "chat-user-456",
          metadata: { trace_id: "chat-trace-should-drop", session_id: "chat-session-should-drop" },
          max_tokens: 128,
          verbosity: "high",
          service_tier: "priority",
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
        reasoning_content: "Need signed context.",
        reasoning_details: [
          { type: "thinking", thinking: "Need signed context.", signature: "sig_chat_adapter" },
          { type: "redacted_thinking", data: "opaque_redacted_chat_adapter" },
        ],
        annotations: [{
          type: "file_citation",
          cited_text: "Tokyo is sunny.",
          filename: "Weather Doc",
          index: 0,
          start_index: 0,
          end_index: 15,
          content_index: 0,
        }],
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
        server_tool_use: { web_search_requests: 1 },
        service_tier: "priority",
      });
      assert.equal(chat.body.service_tier, "priority");

      const jsonObjectChat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          messages: [{ role: "user", content: "return a json object" }],
          response_format: { type: "json_object" },
          max_tokens: 64,
        },
      });
      assert.equal(jsonObjectChat.status, 200);
      assert.equal(jsonObjectChat.body.choices[0].message.content, "JSON object requested.");

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
        server_tool_use: { web_search_requests: 1 },
        service_tier: "priority",
      });
      assert.equal(streamEvents[4].data, "[DONE]");

      const unsupportedFormatChat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          messages: [{ role: "user", content: "preserve unsupported chat response format" }],
          response_format: {
            type: "yaml_schema",
            schema: { type: "object", additionalProperties: false },
          },
          max_tokens: 64,
        },
      });
      assert.equal(unsupportedFormatChat.status, 200, unsupportedFormatChat.body);
      assert.equal(unsupportedFormatChat.body.choices[0].message.content, "Sunny in Tokyo.");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.requestedPath, entry.outcome]), [
        ["openai_chat_completions", "/v1/chat/completions", "success"],
        ["openai_chat_completions", "/v1/chat/completions", "success"],
        ["openai_chat_completions", "/v1/chat/completions", "success"],
        ["openai_chat_completions", "/v1/chat/completions", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-chat-anthropic-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
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
      {
        role: "user",
        content: [
          { type: "text", text: "Weather?" },
          { type: "image", source: { type: "url", url: "https://example.test/weather-map.png" } },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "Need previous weather context.", signature: "sig_previous_weather" },
          { type: "redacted_thinking", data: "opaque_previous_weather" },
          { type: "text", text: "I will check." },
          { type: "tool_use", id: "call_weather", name: "get_weather", input: { city: "Tokyo" } },
        ],
      },
      {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "call_weather",
          is_error: true,
          content: [
            { type: "text", text: "Sunny" },
            {
              type: "image",
              source: { type: "base64", media_type: "image/png", data: "TOOL_IMAGE" },
            },
          ],
        }],
      },
    ],
    system: "Use metric units.",
    temperature: 0.2,
    top_p: 0.9,
    verbosity: "high",
    service_tier: "priority",
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
    tool_choice: { type: "tool", name: "get_weather", disable_parallel_tool_use: true },
    output_config: {
      format: {
        type: "json_schema",
        name: "weather_result",
        schema: { type: "object", additionalProperties: false, properties: { summary: { type: "string" } }, required: ["summary"] },
        strict: true,
      },
    },
    metadata: { user_id: "chat-user-456" },
  });
  assert.equal(upstreamCalls[1].url, "https://chat-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[1].method, "POST");
  assert.equal(upstreamCalls[1].xApiKey, "sk-chat-anthropic-secret");
  assert.equal(upstreamCalls[1].anthropicVersion, "2023-06-01");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body), {
    model: "claude-native",
    max_tokens: 64,
    messages: [{ role: "user", content: "return a json object" }],
    output_config: { format: { type: "json_object" } },
  });
  assert.equal(upstreamCalls[2].url, "https://chat-anthropic.example.test/v1/messages");
  assert.equal(upstreamCalls[2].method, "POST");
  assert.equal(upstreamCalls[2].xApiKey, "sk-chat-anthropic-secret");
  assert.equal(upstreamCalls[2].anthropicVersion, "2023-06-01");
  assert.deepEqual(JSON.parse(upstreamCalls[2].body), {
    model: "claude-native",
    max_tokens: 1024,
    messages: [{ role: "user", content: "stream please" }],
    stream: true,
  });
  assert.deepEqual(JSON.parse(upstreamCalls[3].body), {
    model: "claude-native",
    max_tokens: 64,
    messages: [
      { role: "user", content: "preserve unsupported chat response format" },
      { role: "user", content: 'OpenAI Chat unsupported response_format for Anthropic Messages: {"type":"yaml_schema","schema":{"type":"object","additionalProperties":false}}' },
    ],
  });
});


test("model gateway streams Anthropic tool_use start input through Chat adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-start-input-chat-stream",
      name: "Anthropic Start Input Chat Stream",
      appScopes: ["opencode", "openclaw"],
      baseUrl: "https://anthropic-start-input-chat-stream.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: { apiKey: "sk-anthropic-start-input-chat-stream" },
    setActiveScopes: ["opencode", "openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    const messageId = upstreamCalls.length === 1 ? "msg_start_input_modern" : "msg_start_input_legacy";
    const upstreamSse = [
      "event: message_start",
      `data: {"type":"message_start","message":{"id":"${messageId}","type":"message","role":"assistant","model":"claude-native","content":[],"usage":{"input_tokens":7,"output_tokens":0}}}`,
      "",
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"id\":\"call_lookup\",\"name\":\"lookup\",\"input\":{\"query\":\"docs\"}}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":0}",
      "",
      "event: message_delta",
      "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":2}}",
      "",
      "event: message_stop",
      "data: {\"type\":\"message_stop\"}",
      "",
    ].join("\n");
    return new Response(upstreamSse, { status: 200, headers: { "content-type": "text/event-stream" } });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const modern = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "opencode" },
        body: {
          model: "claude-native",
          stream: true,
          messages: [{ role: "user", content: "Use lookup" }],
          tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
        },
      });
      assert.equal(modern.status, 200, modern.body);
      const modernEvents = parseSseEvents(modern.body);
      assert.equal(modernEvents[0].data.choices[0].delta.role, "assistant");
      assert.deepEqual(modernEvents[1].data.choices[0].delta.tool_calls, [{
        index: 0,
        id: "call_lookup",
        type: "function",
        function: { name: "lookup", arguments: "" },
      }]);
      assert.deepEqual(modernEvents[2].data.choices[0].delta.tool_calls, [{
        index: 0,
        function: { arguments: "{\"query\":\"docs\"}" },
      }]);
      assert.equal(modernEvents[3].data.choices[0].finish_reason, "tool_calls");
      assert.equal(modernEvents[4].data, "[DONE]");

      const legacy = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: {
          model: "claude-native",
          stream: true,
          messages: [{ role: "user", content: "Use lookup" }],
          functions: [{ name: "lookup", parameters: { type: "object" } }],
          function_call: { name: "lookup" },
        },
      });
      assert.equal(legacy.status, 200, legacy.body);
      const legacyEvents = parseSseEvents(legacy.body);
      assert.equal(legacyEvents[0].data.choices[0].delta.role, "assistant");
      assert.deepEqual(legacyEvents[1].data.choices[0].delta.function_call, { name: "lookup", arguments: "" });
      assert.deepEqual(legacyEvents[2].data.choices[0].delta.function_call, { arguments: "{\"query\":\"docs\"}" });
      assert.equal(legacyEvents[3].data.choices[0].finish_reason, "function_call");
      assert.equal(JSON.stringify(legacyEvents).includes("tool_calls"), false);
      assert.equal(legacyEvents[4].data, "[DONE]");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://anthropic-start-input-chat-stream.example.test/v1/messages");
  assert.equal(upstreamCalls[0].xApiKey, "sk-anthropic-start-input-chat-stream");
  assert.equal(upstreamCalls[0].body.stream, true);
  assert.deepEqual(upstreamCalls[0].body.tools, [{ name: "lookup", input_schema: { type: "object" } }]);
  assert.equal(upstreamCalls[1].url, "https://anthropic-start-input-chat-stream.example.test/v1/messages");
  assert.equal(upstreamCalls[1].body.stream, true);
  assert.deepEqual(upstreamCalls[1].body.tools, [{ name: "lookup", input_schema: { type: "object" } }]);
});

test("model gateway ignores empty streaming anthropic tool blocks for chat sse", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-empty-tool-stream-adapter",
      name: "Anthropic Empty Tool Stream Adapter",
      appScopes: ["openclaw", "codex"],
      baseUrl: "https://anthropic-empty-tool-stream.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-anthropic-empty-tool-stream-secret",
    },
    setActiveScopes: ["openclaw", "codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
    });
    const messageId = upstreamCalls.length === 1 ? "msg_empty_tool_chat" : "msg_empty_tool_responses";
    const upstreamSse = [
      "event: message_start",
      `data: {"type":"message_start","message":{"id":"${messageId}","type":"message","role":"assistant","model":"claude-native","content":[],"usage":{"input_tokens":6,"output_tokens":0}}}`,
      "",
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"input\":{}}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\"}}",
      "",
      "event: content_block_stop",
      "data: {\"type\":\"content_block_stop\",\"index\":0}",
      "",
      "event: message_delta",
      "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":1}}",
      "",
      "event: message_stop",
      "data: {\"type\":\"message_stop\"}",
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
          messages: [{ role: "user", content: "empty anthropic tool stream please" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents.some((item) => JSON.stringify(item.data).includes("tool_calls")), false);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(chatEvents[1].data.choices[0].finish_reason, "stop");
      assert.equal(chatEvents[2].data, "[DONE]");

    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://anthropic-empty-tool-stream.example.test/v1/messages");
});

test("model gateway ignores anthropic tool stop reason without tool uses for chat completions", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-empty-tool-stop",
      name: "Anthropic Empty Tool Stop",
      appScopes: ["openclaw"],
      baseUrl: "https://anthropic-empty-tool-stop.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-anthropic-empty-tool-stop-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "msg_empty_tool_stop",
    type: "message",
    role: "assistant",
    model: "claude-native",
    content: [],
    stop_reason: "tool_use",
    usage: {
      input_tokens: 6,
      output_tokens: 1,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          messages: [{ role: "user", content: "empty anthropic tool stop please" }],
        },
      });

      assert.equal(chat.status, 200);
      assert.equal(chat.body.choices[0].finish_reason, "stop");
      assert.deepEqual(chat.body.choices[0].message, {
        role: "assistant",
        content: "",
      });
      assert.equal(JSON.stringify(chat.body).includes("tool_calls"), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway preserves incomplete anthropic tool identities for chat completions", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-incomplete-tool-identity",
      name: "Anthropic Incomplete Tool Identity",
      appScopes: ["openclaw"],
      baseUrl: "https://anthropic-incomplete-tool-identity.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-anthropic-incomplete-tool-identity-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async () => {
    upstreamCalls.push(upstreamCalls.length + 1);
    if (upstreamCalls.length === 2) {
      const upstreamSse = [
        "event: message_start",
        "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_incomplete_tool_stream\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":6,\"output_tokens\":0}}}",
        "",
        "event: content_block_start",
        "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"tool_use\",\"name\":\"lookup\",\"input\":{}}}",
        "",
        "event: content_block_delta",
        "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"query\\\":\\\"docs\\\"}\"}}",
        "",
        "event: message_delta",
        "data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\",\"stop_sequence\":null},\"usage\":{\"output_tokens\":1}}",
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
      id: "msg_incomplete_tool",
      type: "message",
      role: "assistant",
      model: "claude-native",
      content: [{ type: "tool_use", name: "lookup", input: { query: "docs" } }],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 6,
        output_tokens: 1,
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
          messages: [{ role: "user", content: "incomplete anthropic tool please" }],
        },
      });

      assert.equal(chat.status, 200);
      assert.equal(chat.body.choices[0].finish_reason, "stop");
      assert.deepEqual(chat.body.choices[0].message, {
        role: "assistant",
        content: 'Anthropic Messages malformed tool_use for Chat: {"type":"tool_use","name":"lookup","input":{"query":"docs"}}',
      });
      assert.equal(JSON.stringify(chat.body).includes("tool_calls"), false);

      const stream = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          stream: true,
          messages: [{ role: "user", content: "incomplete anthropic tool stream please" }],
        },
      });

      assert.equal(stream.status, 200);
      const events = parseSseEvents(stream.body);
      assert.equal(events.some((item) => JSON.stringify(item.data).includes("tool_calls")), false);
      assert.equal(events[1].data.choices[0].finish_reason, "stop");
      assert.equal(events[2].data, "[DONE]");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway preserves incomplete responses function calls for chat completions", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-incomplete-function-call",
      name: "Responses Incomplete Function Call",
      appScopes: ["openclaw"],
      baseUrl: "https://responses-incomplete-function-call.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-incomplete-function-call-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (_url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push(body);
    if (body.stream === true) {
      const upstreamSse = [
        "event: response.created",
        "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_incomplete_stream\",\"object\":\"response\",\"created_at\":1710000042,\"status\":\"in_progress\",\"model\":\"gpt-responses\",\"output\":[]}}",
        "",
        "event: response.output_item.added",
        "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"fc_incomplete\",\"type\":\"function_call\",\"status\":\"in_progress\",\"name\":\"lookup\",\"arguments\":\"\"}}",
        "",
        "event: response.function_call_arguments.delta",
        "data: {\"type\":\"response.function_call_arguments.delta\",\"item_id\":\"fc_incomplete\",\"output_index\":0,\"delta\":\"{\\\"query\\\":\\\"docs\\\"}\"}",
        "",
        "event: response.completed",
        "data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_incomplete_stream\",\"object\":\"response\",\"created_at\":1710000042,\"status\":\"completed\",\"model\":\"gpt-responses\",\"output\":[{\"id\":\"fc_incomplete\",\"type\":\"function_call\",\"status\":\"completed\",\"name\":\"lookup\",\"arguments\":\"{\\\"query\\\":\\\"docs\\\"}\"}],\"usage\":{\"input_tokens\":6,\"output_tokens\":1,\"total_tokens\":7}}}",
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
      id: "resp_incomplete",
      object: "response",
      created_at: 1_710_000_042,
      model: "gpt-responses",
      status: "completed",
      output: [{
        id: "fc_incomplete",
        type: "function_call",
        status: "completed",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      }],
      usage: {
        input_tokens: 6,
        output_tokens: 1,
        total_tokens: 7,
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
          model: "gpt-responses",
          messages: [{ role: "user", content: "incomplete responses function call please" }],
        },
      });

      assert.equal(chat.status, 200);
      assert.equal(chat.body.choices[0].finish_reason, "stop");
      assert.deepEqual(chat.body.choices[0].message, {
        role: "assistant",
        content: 'OpenAI Responses function_call omitted for Chat: {"id":"fc_incomplete","type":"function_call","status":"completed","name":"lookup","arguments":"{\\"query\\":\\"docs\\"}"}',
      });
      assert.equal(JSON.stringify(chat.body).includes("tool_calls"), false);

      const stream = await requestRaw(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-responses",
          stream: true,
          messages: [{ role: "user", content: "incomplete responses function stream please" }],
        },
      });

      assert.equal(stream.status, 200);
      const events = parseSseEvents(stream.body);
      assert.equal(events.some((item) => JSON.stringify(item.data).includes("tool_calls")), false);
      assert.equal(events[1].data.choices[0].finish_reason, "stop");
      assert.equal(events[2].data, "[DONE]");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
});

test("model gateway preserves orphan tool result context before provider adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({ url: String(url), body });
    if (String(url).endsWith("/responses")) {
      return new Response(JSON.stringify({
        id: `resp_orphan_tool_result_${upstreamCalls.length}`,
        object: "response",
        created_at: 1_710_000_043,
        model: body.model,
        status: "completed",
        output: [{
          id: "msg_orphan_tool_result",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/messages")) {
      return new Response(JSON.stringify({
        id: `msg_orphan_tool_result_${upstreamCalls.length}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      id: `chatcmpl_orphan_tool_result_${upstreamCalls.length}`,
      created: 1_710_000_043,
      model: body.model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "chat-to-responses-orphan-tool-result",
          name: "Chat To Responses Orphan Tool Result",
          appScopes: ["openclaw"],
          baseUrl: "https://chat-to-responses-orphan-tool-result.example.test/v1",
          apiFormat: "openai_responses",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-chat-to-responses-orphan-tool-result" },
        setActiveScopes: ["openclaw"],
      });
      const chatToResponses = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-responses",
          messages: [
            { role: "user", content: "hello" },
            { role: "tool", content: "orphan result" },
          ],
        },
      });
      assert.equal(chatToResponses.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "chat-to-anthropic-orphan-tool-result",
          name: "Chat To Anthropic Orphan Tool Result",
          appScopes: ["openclaw"],
          baseUrl: "https://chat-to-anthropic-orphan-tool-result.example.test/v1",
          apiFormat: "anthropic_messages",
          authStrategy: "anthropic_api_key",
        },
        secret: { apiKey: "sk-chat-to-anthropic-orphan-tool-result" },
        setActiveScopes: ["openclaw"],
      });
      const chatToAnthropic = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          messages: [
            { role: "user", content: "hello" },
            { role: "tool", content: "orphan result" },
          ],
        },
      });
      assert.equal(chatToAnthropic.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "anthropic-to-chat-orphan-tool-result",
          name: "Anthropic To Chat Orphan Tool Result",
          appScopes: ["claude-code"],
          baseUrl: "https://anthropic-to-chat-orphan-tool-result.example.test/v1",
          apiFormat: "openai_chat",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-anthropic-to-chat-orphan-tool-result" },
        setActiveScopes: ["claude-code"],
      });
      const anthropicToChat = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          max_tokens: 128,
          messages: [{
            role: "user",
            content: [{ type: "tool_result", content: "orphan result" }],
          }],
        },
      });
      assert.equal(anthropicToChat.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "responses-to-chat-orphan-tool-result",
          name: "Responses To Chat Orphan Tool Result",
          appScopes: ["codex"],
          baseUrl: "https://responses-to-chat-orphan-tool-result.example.test/v1",
          apiFormat: "openai_chat",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-responses-to-chat-orphan-tool-result" },
        setActiveScopes: ["codex"],
      });
      const responsesToChat = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-chat",
          input: [
            { role: "user", content: "hello" },
            { type: "function_call_output", output: "orphan result" },
          ],
        },
      });
      assert.equal(responsesToChat.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 4);
  assert.equal(upstreamCalls[0].url, "https://chat-to-responses-orphan-tool-result.example.test/v1/responses");
  assert.equal(JSON.stringify(upstreamCalls[0].body).includes("function_call_output"), false);
  assert.match(JSON.stringify(upstreamCalls[0].body), /OpenAI Chat tool message missing tool_call_id for Responses/);
  assert.equal(upstreamCalls[1].url, "https://chat-to-anthropic-orphan-tool-result.example.test/v1/messages");
  assert.equal(JSON.stringify(upstreamCalls[1].body).includes("tool_result"), false);
  assert.match(JSON.stringify(upstreamCalls[1].body), /OpenAI Chat tool message missing tool_call_id for Anthropic Messages/);
  assert.equal(upstreamCalls[2].url, "https://anthropic-to-chat-orphan-tool-result.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[2].body.messages.some((message) => message.role === "tool"), false);
  assert.match(JSON.stringify(upstreamCalls[2].body), /Anthropic Messages tool_result missing tool_use_id for Chat Completions/);
  assert.equal(upstreamCalls[3].url, "https://responses-to-chat-orphan-tool-result.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[3].body.messages.some((message) => message.role === "tool"), false);
  assert.match(JSON.stringify(upstreamCalls[3].body), /OpenAI Responses tool output missing call_id for Chat Completions/);
});

test("model gateway preserves unknown chat content parts before provider adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({ url: String(url), body });
    if (String(url).endsWith("/responses")) {
      return new Response(JSON.stringify({
        id: "resp_unknown_chat_content_parts",
        object: "response",
        created_at: 1_710_000_046,
        model: body.model,
        status: "completed",
        output: [{
          id: "msg_unknown_chat_content_parts",
          type: "message",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: "responses ok" }],
        }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/messages")) {
      return new Response(JSON.stringify({
        id: "msg_unknown_chat_content_parts",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: "anthropic ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected upstream url ${url}`);
  };

  const chatMessages = [{
    role: "user",
    content: [
      { type: "text", text: "keep text" },
      { type: "input_audio", input_audio: { data: "UklGRg==", format: "wav" } },
      { type: "image_url", image_url: { detail: "high" } },
      { type: "file", file: { filename: "missing-source.txt" } },
      { type: "future_context", payload: { value: 42 } },
    ],
  }];

  try {
    await withServer(handler, async (baseUrl) => {
      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "chat-unknown-content-to-responses",
          name: "Chat Unknown Content To Responses",
          appScopes: ["openclaw"],
          baseUrl: "https://chat-unknown-content-to-responses.example.test/v1",
          apiFormat: "openai_responses",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-chat-unknown-content-to-responses" },
        setActiveScopes: ["openclaw"],
      });
      const responses = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: { model: "gpt-responses", messages: chatMessages },
      });
      assert.equal(responses.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "chat-unknown-content-to-anthropic",
          name: "Chat Unknown Content To Anthropic",
          appScopes: ["openclaw"],
          baseUrl: "https://chat-unknown-content-to-anthropic.example.test/v1",
          apiFormat: "anthropic_messages",
          authStrategy: "anthropic_api_key",
        },
        secret: { apiKey: "sk-chat-unknown-content-to-anthropic" },
        setActiveScopes: ["openclaw"],
      });
      const anthropic = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: { model: "claude-native", messages: chatMessages },
      });
      assert.equal(anthropic.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://chat-unknown-content-to-responses.example.test/v1/responses");
  const responsesInput = JSON.stringify(upstreamCalls[0].body.input);
  assert.match(responsesInput, /keep text/);
  assert.match(responsesInput, /OpenAI Chat unrecognized content part for Responses/);
  assert.match(responsesInput, /input_audio/);
  assert.match(responsesInput, /future_context/);
  assert.equal(responsesInput.includes('"type":"input_audio"'), false);

  assert.equal(upstreamCalls[1].url, "https://chat-unknown-content-to-anthropic.example.test/v1/messages");
  const anthropicMessages = JSON.stringify(upstreamCalls[1].body.messages);
  assert.match(anthropicMessages, /keep text/);
  assert.match(anthropicMessages, /OpenAI Chat unrecognized content part for Anthropic Messages/);
  assert.match(anthropicMessages, /input_audio/);
  assert.match(anthropicMessages, /future_context/);
  assert.equal(anthropicMessages.includes('"type":"input_audio"'), false);
});

test("model gateway preserves unknown upstream output blocks as chat context", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    if (String(url).endsWith("/responses")) {
      return new Response(JSON.stringify({
        id: "resp_unknown_output_blocks",
        object: "response",
        created_at: 1_710_000_044,
        model: body.model,
        status: "completed",
        output: [
          {
            id: "msg_unknown_part",
            type: "message",
            status: "completed",
            role: "assistant",
            content: [{ type: "output_audio", id: "aud_1", transcript: "hello audio" }],
          },
          { type: "future_tool_call", status: "completed", payload: { value: 42 } },
        ],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (String(url).endsWith("/messages")) {
      return new Response(JSON.stringify({
        id: "msg_unknown_content_blocks",
        type: "message",
        role: "assistant",
        model: body.model,
        content: [
          { type: "text", text: "ok" },
          { type: "server_tool_use", id: "srv_1", name: "web_search", input: { query: "tracevane" } },
          { type: "mcp_tool_result", content: "missing id" },
        ],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`unexpected upstream url ${url}`);
  };

  try {
    await withServer(handler, async (baseUrl) => {
      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "responses-unknown-output-blocks",
          name: "Responses Unknown Output Blocks",
          appScopes: ["openclaw"],
          baseUrl: "https://responses-unknown-output-blocks.example.test/v1",
          apiFormat: "openai_responses",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-responses-unknown-output-blocks" },
        setActiveScopes: ["openclaw"],
      });
      const responsesToChat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-responses",
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.equal(responsesToChat.status, 200);
      assert.match(responsesToChat.body.choices[0].message.content, /OpenAI Responses unrecognized message content part for Chat/);
      assert.match(responsesToChat.body.choices[0].message.content, /output_audio/);
      assert.match(responsesToChat.body.choices[0].message.content, /OpenAI Responses unrecognized output item for Chat/);
      assert.match(responsesToChat.body.choices[0].message.content, /future_tool_call/);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "anthropic-unknown-content-blocks",
          name: "Anthropic Unknown Content Blocks",
          appScopes: ["openclaw"],
          baseUrl: "https://anthropic-unknown-content-blocks.example.test/v1",
          apiFormat: "anthropic_messages",
          authStrategy: "anthropic_api_key",
        },
        secret: { apiKey: "sk-anthropic-unknown-content-blocks" },
        setActiveScopes: ["openclaw"],
      });
      const anthropicToChat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-native",
          messages: [{ role: "user", content: "hello" }],
        },
      });
      assert.equal(anthropicToChat.status, 200);
      assert.match(anthropicToChat.body.choices[0].message.content, /^ok/);
      assert.match(anthropicToChat.body.choices[0].message.content, /Anthropic Messages unrecognized content block for Chat/);
      assert.match(anthropicToChat.body.choices[0].message.content, /server_tool_use/);
      assert.match(anthropicToChat.body.choices[0].message.content, /Anthropic Messages malformed mcp_tool_result for Chat/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway maps Claude tool history to Responses fc item ids", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "claude-to-responses-tools",
      name: "Claude to Responses Tools",
      appScopes: ["claude-code"],
      baseUrl: "https://claude-to-responses.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-claude-responses-tools-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      id: "resp_claude_tool_history",
      object: "response",
      status: "completed",
      model: "gpt-5.5",
      output: [{
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "Tool result accepted." }],
      }],
      usage: {
        input_tokens: 12,
        output_tokens: 4,
        total_tokens: 16,
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
        body: {
          model: "gpt-5.5",
          max_tokens: 512,
          messages: [
            {
              role: "user",
              content: "Use the lookup tool.",
            },
            {
              role: "assistant",
              content: [{
                type: "tool_use",
                id: "call_L9xIoU51YrLBlMT2msasvJZY",
                name: "lookup",
                input: { query: "docs" },
              }],
            },
            {
              role: "user",
              content: [{
                type: "tool_result",
                tool_use_id: "call_L9xIoU51YrLBlMT2msasvJZY",
                is_error: true,
                content: "done",
              }],
            },
            {
              role: "user",
              content: "Continue.",
            },
          ],
          tools: [{
            name: "lookup",
            input_schema: { type: "object" },
          }],
        },
      });

      assert.equal(messages.status, 200);
      assert.equal(messages.headers["x-openclaw-model-gateway-provider"], "claude-to-responses-tools");
      assert.equal(messages.body.content[0].text, "Tool result accepted.");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog[0].routeId, "anthropic_messages");
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "success");
      assert.ok(!JSON.stringify(runtime.body).includes("sk-claude-responses-tools-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://claude-to-responses.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-claude-responses-tools-secret");
  const responsesBody = JSON.parse(upstreamCalls[0].body);
  assert.deepEqual(responsesBody.input, [
    {
      role: "user",
      content: [{ type: "input_text", text: "Use the lookup tool." }],
    },
    {
      type: "function_call",
      id: "fc_call_L9xIoU51YrLBlMT2msasvJZY",
      call_id: "call_L9xIoU51YrLBlMT2msasvJZY",
      status: "completed",
      name: "lookup",
      arguments: "{\"query\":\"docs\"}",
    },
    {
      type: "function_call_output",
      call_id: "call_L9xIoU51YrLBlMT2msasvJZY",
      output: "done",
      status: "incomplete",
    },
    {
      role: "user",
      content: [{ type: "input_text", text: "Continue." }],
    },
  ]);
});

test("model gateway preserves structured tool result content through OpenAI Responses adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "structured-tool-results",
      name: "Structured Tool Results",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://structured-tool-results.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-structured-tool-results-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: `resp_structured_tool_${upstreamCalls.length}`,
      object: "response",
      created_at: 1_710_000_112,
      status: "completed",
      model: "gpt-5.4",
      output: [{
        id: `msg_structured_tool_${upstreamCalls.length}`,
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "accepted" }],
      }],
      usage: {
        input_tokens: 3,
        output_tokens: 1,
        total_tokens: 4,
      },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const chatToolContent = [
    { type: "text", text: "weather:" },
    { type: "image_url", image_url: { url: "data:image/png;base64,abc123" } },
  ];
  const anthropicToolContent = [
    { type: "text", text: "weather:" },
    { type: "image", source: { type: "url", url: "https://example.test/weather.png" } },
  ];

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-5.4",
          messages: [{
            role: "user",
            content: "Call lookup.",
          }, {
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
          }, {
            role: "tool",
            tool_call_id: "call_lookup",
            content: chatToolContent,
          }],
        },
      });
      assert.equal(chat.status, 200);
      assert.equal(chat.body.choices[0].message.content, "accepted");

      const anthropic = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-5.4",
          max_tokens: 64,
          messages: [{
            role: "user",
            content: "Call lookup.",
          }, {
            role: "assistant",
            content: [{
              type: "tool_use",
              id: "call_lookup",
              name: "lookup",
              input: { query: "weather" },
            }],
          }, {
            role: "user",
            content: [{
              type: "tool_result",
              tool_use_id: "call_lookup",
              content: anthropicToolContent,
            }],
          }],
          tools: [{
            name: "lookup",
            input_schema: { type: "object" },
          }],
        },
      });
      assert.equal(anthropic.status, 200);
      assert.equal(anthropic.body.content[0].text, "accepted");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://structured-tool-results.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-structured-tool-results-secret");
  assert.equal(upstreamCalls[1].url, "https://structured-tool-results.example.test/v1/responses");

  const chatResponsesBody = JSON.parse(upstreamCalls[0].body);
  assert.deepEqual(chatResponsesBody.input[2], {
    type: "function_call_output",
    call_id: "call_lookup",
    output: [
      { type: "input_text", text: "weather:" },
      { type: "input_image", image_url: "data:image/png;base64,abc123" },
    ],
  });

  const anthropicResponsesBody = JSON.parse(upstreamCalls[1].body);
  assert.deepEqual(anthropicResponsesBody.input[2], {
    type: "function_call_output",
    call_id: "call_lookup",
    output: [
      { type: "input_text", text: "weather:" },
      { type: "input_image", image_url: "https://example.test/weather.png" },
    ],
  });
});

test("model gateway adapts non-streaming codex responses requests to openai chat providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
          annotations: [{
            type: "url_citation",
            url: "https://example.test/adapted",
            title: "Adapted Source",
          }],
        },
        finish_reason: "stop",
        logprobs: {
          content: [{ token: "Adapted", logprob: -0.2, bytes: [65] }],
        },
      }],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
        prompt_tokens_details: { cached_tokens: 2, audio_tokens: 1 },
        completion_tokens_details: {
          reasoning_tokens: 1,
          audio_tokens: 2,
          accepted_prediction_tokens: 3,
          rejected_prediction_tokens: 4,
        },
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
            {
              type: "message",
              role: "user",
              content: [
                { type: "input_text", text: "Hello" },
                { type: "input_image", image_url: "data:image/png;base64,TEST_IMAGE", detail: "low" },
                { type: "input_file", file_id: "file_abc123", filename: "notes.md" },
              ],
            },
            {
              id: "rs_earlier",
              type: "reasoning",
              status: "completed",
              summary: [{ type: "summary_text", text: "Earlier reasoning." }],
              encrypted_content: "encrypted-earlier-reasoning",
            },
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
          }, {
            type: "web_search_preview",
            search_context_size: "low",
          }],
          tool_choice: { type: "function", name: "lookup" },
          stream: false,
          max_output_tokens: 64,
          text: {
            format: {
              type: "json_schema",
              name: "lookup_result",
              schema: {
                type: "object",
                properties: { answer: { type: "string" } },
                required: ["answer"],
                additionalProperties: false,
              },
              strict: true,
            },
          },
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
      assert.deepEqual(responses.body.output[0].content, [{
        type: "output_text",
        text: "Adapted answer.",
        logprobs: [{ token: "Adapted", logprob: -0.2, bytes: [65] }],
        annotations: [{
          type: "url_citation",
          url: "https://example.test/adapted",
          title: "Adapted Source",
        }],
      }]);
      assert.deepEqual(responses.body.usage, {
        input_tokens: 10,
        output_tokens: 4,
        total_tokens: 14,
        input_tokens_details: { cached_tokens: 2, audio_tokens: 1 },
        output_tokens_details: {
          reasoning_tokens: 1,
          audio_tokens: 2,
          accepted_prediction_tokens: 3,
          rejected_prediction_tokens: 4,
        },
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
        cacheReadTokens: 2,
        cacheCreationTokens: 0,
        imageGenerationRequests: 0,
        imagesGenerated: 0,
        imageEditRequests: 0,
        audioInputRequests: 0,
        audioOutputRequests: 0,
      });
      assert.ok(!JSON.stringify(runtime.body).includes("sk-codex-adapter-secret"));

      const textFormatResponses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "Return plain text.",
          text: { format: { type: "text" } },
          stream: false,
        },
      });
      assert.equal(textFormatResponses.status, 200);
      assert.equal(textFormatResponses.body.output[0].content[0].text, "Adapted answer.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://codex-chat.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].method, "POST");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-codex-adapter-secret");
  assert.equal(upstreamCalls[0].contentType, "application/json");
  assert.deepEqual(JSON.parse(upstreamCalls[0].body), {
    model: "gpt-test",
    messages: [
      { role: "system", content: "You are concise." },
      {
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "image_url", image_url: { url: "data:image/png;base64,TEST_IMAGE", detail: "low" } },
          { type: "file", file: { file_id: "file_abc123", filename: "notes.md", text: "[OpenAI Responses input_file: file_id=file_abc123 filename=notes.md]" } },
        ],
      },
      {
        role: "assistant",
        content: "Earlier",
        reasoning_content: "Earlier reasoning.",
        reasoning_details: [{
          id: "rs_earlier",
          type: "reasoning",
          status: "completed",
          summary: [{ type: "summary_text", text: "Earlier reasoning." }],
          encrypted_content: "encrypted-earlier-reasoning",
        }],
      },
      { role: "user", content: "Next" },
    ],
    stream: false,
    max_tokens: 64,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "lookup_result",
        schema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
          additionalProperties: false,
        },
        strict: true,
      },
    },
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
    }, {
      type: "web_search_preview",
      search_context_size: "low",
    }],
    tool_choice: {
      type: "function",
      function: { name: "lookup" },
    },
  });
  assert.equal(upstreamCalls[1].url, "https://codex-chat.example.test/v1/chat/completions");
  assert.deepEqual(JSON.parse(upstreamCalls[1].body).response_format, { type: "text" });
});

test("model gateway preserves structured responses tool outputs through Chat and Anthropic providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-structured-tool-output-chat",
      name: "Codex Structured Tool Output Chat",
      appScopes: ["codex"],
      baseUrl: "https://codex-structured-tool-output-chat.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-structured-tool-output-chat-secret",
    },
    setActiveScopes: ["codex"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-structured-tool-output-anthropic",
      name: "Codex Structured Tool Output Anthropic",
      appScopes: ["openclaw"],
      baseUrl: "https://codex-structured-tool-output-anthropic.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-codex-structured-tool-output-anthropic-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const headers = new Headers(init.headers || {});
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: headers.get("authorization"),
      xApiKey: headers.get("x-api-key"),
      body: String(init.body || ""),
    });

    if (String(url).includes("anthropic")) {
      return new Response(JSON.stringify({
        id: "msg_codex_structured_tool_output",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "Anthropic accepted." }],
        stop_reason: "end_turn",
        usage: { input_tokens: 9, output_tokens: 3 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    return new Response(JSON.stringify({
      id: "chatcmpl_codex_structured_tool_output",
      created: 1_710_000_113,
      model: "gpt-test",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "Chat accepted." },
        finish_reason: "stop",
      }],
      usage: { prompt_tokens: 8, completion_tokens: 2, total_tokens: 10 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const toolOutput = [
    { type: "output_text", text: "weather:" },
    { type: "input_image", image_url: "data:image/png;base64,abc123" },
  ];

  try {
    await withServer(handler, async (baseUrl) => {
      const chatBacked = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "codex" },
        body: {
          model: "gpt-test",
          input: [{
            role: "user",
            content: "Use lookup.",
          }, {
            type: "function_call",
            id: "fc_call_lookup",
            call_id: "call_lookup",
            status: "completed",
            name: "lookup",
            arguments: "{\"query\":\"weather\"}",
          }, {
            type: "function_call_output",
            call_id: "call_lookup",
            output: toolOutput,
          }],
          stream: false,
        },
      });

      assert.equal(chatBacked.status, 200);
      assert.equal(chatBacked.body.output[0].content[0].text, "Chat accepted.");

      const anthropicBacked = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        headers: { "x-tracevane-app-scope": "openclaw" },
        body: {
          model: "claude-native",
          input: [{
            role: "user",
            content: "Use lookup.",
          }, {
            type: "function_call",
            id: "fc_call_lookup",
            call_id: "call_lookup",
            status: "completed",
            name: "lookup",
            arguments: "{\"query\":\"weather\"}",
          }, {
            type: "function_call_output",
            call_id: "call_lookup",
            output: toolOutput,
          }],
          stream: false,
        },
      });

      assert.equal(anthropicBacked.status, 200);
      assert.equal(anthropicBacked.body.output[0].content[0].text, "Anthropic accepted.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  const chatBody = JSON.parse(upstreamCalls[0].body);
  assert.deepEqual(chatBody.messages[2], {
    role: "tool",
    content: '[{"text":"weather:","type":"output_text"},{"image_url":"data:image/png;base64,abc123","type":"input_image"}]',
    tool_call_id: "call_lookup",
  });
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-codex-structured-tool-output-chat-secret");

  const anthropicBody = JSON.parse(upstreamCalls[1].body);
  assert.deepEqual(anthropicBody.messages[2], {
    role: "user",
    content: [{
      type: "tool_result",
      tool_use_id: "call_lookup",
      content: [{
        type: "text",
        text: "weather:",
      }, {
        type: "image",
        source: {
          type: "base64",
          media_type: "image/png",
          data: "abc123",
        },
      }],
    }],
  });
  assert.equal(upstreamCalls[1].xApiKey, "sk-codex-structured-tool-output-anthropic-secret");
});


test("model gateway drops placeholder chat reasoning from non-streaming codex responses", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-chat-placeholder-reasoning",
      name: "Codex Chat Placeholder Reasoning",
      appScopes: ["codex"],
      baseUrl: "https://codex-placeholder-reasoning.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-placeholder-reasoning-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "chatcmpl_placeholder_reasoning",
    created: 1_710_000_030,
    model: "claude-opus-4-8",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        reasoning_content: "call\n\n  tool call\n\ncall call",
        content: "Final answer.\n\n...\n\n...",
      },
      finish_reason: "stop",
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const responses = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-opus-4-8",
          input: "Answer normally.",
          stream: false,
        },
      });

      assert.equal(responses.status, 200);
      assert.deepEqual(responses.body.output.map((item) => item.type), ["message"]);
      assert.equal(JSON.stringify(responses.body).includes("..."), false);
      assert.equal(JSON.stringify(responses.body).includes("call"), false);
      assert.equal(responses.body.output[0].content[0].text, "Final answer.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway maps codex reasoning options to openai chat provider parameters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

test("model gateway carries reasoning effort across responses chat and anthropic protocol adapters", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = JSON.parse(String(init.body || "{}"));
    upstreamCalls.push({ url: String(url), body });
    const target = String(url);
    if (target.endsWith("/messages")) {
      return new Response(JSON.stringify({
        id: `msg_reasoning_${upstreamCalls.length}`,
        type: "message",
        role: "assistant",
        model: body.model,
        content: [{ type: "text", text: "ok" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (target.endsWith("/responses")) {
      return new Response(JSON.stringify({
        id: `resp_reasoning_${upstreamCalls.length}`,
        object: "response",
        created_at: 1_710_000_032,
        model: body.model,
        status: "completed",
        output: [{
          type: "message",
          id: "msg_reasoning",
          status: "completed",
          role: "assistant",
          content: [{ type: "output_text", text: "ok" }],
        }],
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response(JSON.stringify({
      id: `chatcmpl_reasoning_${upstreamCalls.length}`,
      created: 1_710_000_032,
      model: body.model,
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "responses-to-anthropic-reasoning",
          name: "Responses To Anthropic Reasoning",
          appScopes: ["codex"],
          baseUrl: "https://responses-to-anthropic-reasoning.example.test/v1",
          apiFormat: "anthropic_messages",
          authStrategy: "anthropic_api_key",
        },
        secret: { apiKey: "sk-responses-to-anthropic" },
        setActiveScopes: ["codex"],
      });
      const responsesToAnthropic = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-opus-4-8",
          input: "Think.",
          reasoning: { effort: "high" },
          stream: false,
        },
      });
      assert.equal(responsesToAnthropic.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "chat-to-responses-reasoning",
          name: "Chat To Responses Reasoning",
          appScopes: ["openclaw"],
          baseUrl: "https://chat-to-responses-reasoning.example.test/v1",
          apiFormat: "openai_responses",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-chat-to-responses" },
        setActiveScopes: ["openclaw"],
      });
      const chatToResponses = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-reasoner",
          messages: [{ role: "user", content: "Think." }],
          reasoning_effort: "max",
          stream: false,
        },
      });
      assert.equal(chatToResponses.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "chat-to-anthropic-reasoning",
          name: "Chat To Anthropic Reasoning",
          appScopes: ["openclaw"],
          baseUrl: "https://chat-to-anthropic-reasoning.example.test/v1",
          apiFormat: "anthropic_messages",
          authStrategy: "anthropic_api_key",
        },
        secret: { apiKey: "sk-chat-to-anthropic" },
        setActiveScopes: ["openclaw"],
      });
      const chatToAnthropic = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "claude-opus-4-8",
          messages: [{ role: "user", content: "Think." }],
          reasoning: { effort: "medium" },
          stream: false,
        },
      });
      assert.equal(chatToAnthropic.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "anthropic-to-chat-reasoning",
          name: "Anthropic To Chat Reasoning",
          appScopes: ["claude-code"],
          baseUrl: "https://anthropic-to-chat-reasoning.example.test/v1",
          apiFormat: "openai_chat",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-anthropic-to-chat" },
        setActiveScopes: ["claude-code"],
      });
      const anthropicToChat = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-reasoner",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Think." },
              { type: "container_upload", file_id: "file_container_upload_123", filename: "artifact.txt" },
            ],
          }],
          metadata: { trace_id: "chat-strict-should-strip", user_id: "claude-chat-user" },
          thinking: { type: "enabled", budget_tokens: 9000 },
          service_tier: "standard_only",
          stream: false,
        },
      });
      assert.equal(anthropicToChat.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "anthropic-to-responses-reasoning",
          name: "Anthropic To Responses Reasoning",
          appScopes: ["claude-code"],
          baseUrl: "https://anthropic-to-responses-reasoning.example.test/v1",
          apiFormat: "openai_responses",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-anthropic-to-responses" },
        setActiveScopes: ["claude-code"],
      });
      const anthropicToResponses = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-reasoner",
          max_tokens: 1024,
          messages: [{
            role: "user",
            content: [
              { type: "text", text: "Think." },
              { type: "container_upload", file_id: "file_container_upload_456", filename: "artifact-responses.txt" },
            ],
          }],
          metadata: { trace_id: "responses-should-strip", user_id: "claude-responses-user", session_id: "claude-code-session" },
          service_tier: "standard_only",
          stop_sequences: ["STOP"],
          mcp_servers: [
            {
              type: "url",
              name: "repo-tools",
              url: "https://mcp.example.test/sse",
              description: "Repository tools",
              authorization_token: "mcp-oauth-token",
              tool_configuration: { enabled: true, allowed_tools: ["read_file", "search"] },
            },
            {
              type: "url",
              name: "disabled-tools",
              url: "https://disabled-mcp.example.test/sse",
              tool_configuration: { enabled: false, allowed_tools: ["delete_everything"] },
            },
          ],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          tool_choice: { type: "tool", name: "web_search" },
          output_config: { effort: "max" },
          stream: false,
        },
      });
      assert.equal(anthropicToResponses.status, 200);

      ctx.services.modelGateway.upsertProvider(undefined, {
        provider: {
          id: "anthropic-to-responses-thinking-budget",
          name: "Anthropic To Responses Thinking Budget",
          appScopes: ["claude-code"],
          baseUrl: "https://anthropic-to-responses-thinking-budget.example.test/v1",
          apiFormat: "openai_responses",
          authStrategy: "bearer",
        },
        secret: { apiKey: "sk-anthropic-to-responses-thinking-budget" },
        setActiveScopes: ["claude-code"],
      });
      const anthropicThinkingBudgetToResponses = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        body: {
          model: "gpt-reasoner",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Think with a budget." }],
          thinking: { type: "enabled", budget_tokens: 9000 },
          stream: false,
        },
      });
      assert.equal(anthropicThinkingBudgetToResponses.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 6);
  assert.equal(upstreamCalls[0].url, "https://responses-to-anthropic-reasoning.example.test/v1/messages");
  assert.deepEqual(upstreamCalls[0].body.thinking, { type: "adaptive" });
  assert.deepEqual(upstreamCalls[0].body.output_config, { effort: "high" });
  assert.equal("reasoning_effort" in upstreamCalls[0].body, false);

  assert.equal(upstreamCalls[1].url, "https://chat-to-responses-reasoning.example.test/v1/responses");
  assert.deepEqual(upstreamCalls[1].body.reasoning, { effort: "xhigh" });
  assert.equal("reasoning_effort" in upstreamCalls[1].body, false);

  assert.equal(upstreamCalls[2].url, "https://chat-to-anthropic-reasoning.example.test/v1/messages");
  assert.deepEqual(upstreamCalls[2].body.thinking, { type: "adaptive" });
  assert.deepEqual(upstreamCalls[2].body.output_config, { effort: "medium" });
  assert.equal("reasoning" in upstreamCalls[2].body, false);

  assert.equal(upstreamCalls[3].url, "https://anthropic-to-chat-reasoning.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[3].body.reasoning_effort, "high");
  assert.equal(upstreamCalls[3].body.user, "claude-chat-user");
  assert.deepEqual(upstreamCalls[3].body.messages[0].content, [
    { type: "text", text: "Think." },
    { type: "file", file: { file_id: "file_container_upload_123", filename: "artifact.txt" } },
  ]);
  assert.equal("metadata" in upstreamCalls[3].body, false);
  assert.equal("service_tier" in upstreamCalls[3].body, false);
  assert.equal("thinking" in upstreamCalls[3].body, false);
  assert.equal("output_config" in upstreamCalls[3].body, false);

  assert.equal(upstreamCalls[4].url, "https://anthropic-to-responses-reasoning.example.test/v1/responses");
  assert.equal("metadata" in upstreamCalls[4].body, false);
  assert.equal(upstreamCalls[4].body.user, "claude-responses-user");
  assert.deepEqual(upstreamCalls[4].body.input[0].content, [
    { type: "input_text", text: "Think." },
    { type: "input_file", file_id: "file_container_upload_456", filename: "artifact-responses.txt" },
  ]);
  assert.equal("stop" in upstreamCalls[4].body, false);
  assert.equal(upstreamCalls[4].body.service_tier, "default");
  assert.deepEqual(upstreamCalls[4].body.reasoning, { effort: "xhigh" });
  assert.deepEqual(upstreamCalls[4].body.tools, [{
    type: "web_search_preview",
  }, {
    type: "mcp",
    server_label: "repo-tools",
    server_url: "https://mcp.example.test/sse",
    server_description: "Repository tools",
    authorization: "mcp-oauth-token",
    allowed_tools: ["read_file", "search"],
  }]);
  assert.deepEqual(upstreamCalls[4].body.tool_choice, { type: "web_search_preview" });
  assert.equal("output_config" in upstreamCalls[4].body, false);

  assert.equal(upstreamCalls[5].url, "https://anthropic-to-responses-thinking-budget.example.test/v1/responses");
  assert.deepEqual(upstreamCalls[5].body.reasoning, { effort: "high" });
  assert.equal("thinking" in upstreamCalls[5].body, false);
  assert.equal("output_config" in upstreamCalls[5].body, false);
});

test("model gateway maps implicit and explicit codex reasoning to glm chat thinking", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-glm-thinking",
      name: "Codex GLM Thinking",
      appScopes: ["codex"],
      baseUrl: "https://glm-thinking.example.test/api/coding/paas/v4",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-glm-thinking-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamBodies = [];
  globalThis.fetch = async (_url, init = {}) => {
    upstreamBodies.push(JSON.parse(String(init.body || "{}")));
    return new Response(JSON.stringify({
      id: `chatcmpl_glm_thinking_${upstreamBodies.length}`,
      created: 1_710_000_033,
      model: "glm-5.2",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const implicit = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          input: "Default.",
          stream: false,
        },
      });
      assert.equal(implicit.status, 200);

      const enabled = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          input: "Think.",
          reasoning: { effort: "high" },
          stream: false,
        },
      });
      assert.equal(enabled.status, 200);

      const disabled = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          input: "No thinking.",
          reasoning: { effort: "none" },
          stream: false,
        },
      });
      assert.equal(disabled.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamBodies.length, 3);
  assert.deepEqual(upstreamBodies.map((body) => body.thinking), [
    { type: "disabled" },
    { type: "enabled" },
    { type: "disabled" },
  ]);
});

test("model gateway normalizes GLM chat thinking for native OpenAI Chat passthrough", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "glm-chat-passthrough-thinking",
      name: "GLM Chat Passthrough Thinking",
      appScopes: ["openclaw"],
      baseUrl: "https://glm-chat-passthrough-thinking.example.test/api/coding/paas/v4",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
    },
    secret: {
      apiKey: "sk-glm-chat-passthrough-thinking-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamBodies = [];
  globalThis.fetch = async (_url, init = {}) => {
    upstreamBodies.push(JSON.parse(String(init.body || "{}")));
    return new Response(JSON.stringify({
      id: `chatcmpl_glm_passthrough_thinking_${upstreamBodies.length}`,
      created: 1_710_000_034,
      model: "glm-5.2",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const implicit = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          messages: [{ role: "user", content: "Default." }],
          tools: [{
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object" },
            },
          }],
        },
      });
      assert.equal(implicit.status, 200);

      const explicit = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          messages: [{ role: "user", content: "Think." }],
          tools: [{
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object" },
            },
          }],
          reasoning_effort: "high",
        },
      });
      assert.equal(explicit.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamBodies.length, 2);
  assert.deepEqual(upstreamBodies[0].thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in upstreamBodies[0], false);
  assert.deepEqual(upstreamBodies[1].thinking, { type: "enabled" });
  assert.equal(upstreamBodies[1].reasoning_effort, "high");
});

test("model gateway normalizes GLM chat thinking for Anthropic-to-Chat adapter", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "glm-anthropic-chat-thinking",
      name: "GLM Anthropic Chat Thinking",
      appScopes: ["claude-code"],
      baseUrl: "https://glm-anthropic-chat-thinking.example.test/api/coding/paas/v4",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "glm-5.2",
        models: [{ id: "glm-5.2" }],
      },
    },
    secret: {
      apiKey: "sk-glm-anthropic-chat-thinking-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamBodies = [];
  globalThis.fetch = async (_url, init = {}) => {
    upstreamBodies.push(JSON.parse(String(init.body || "{}")));
    return new Response(JSON.stringify({
      id: `chatcmpl_glm_anthropic_thinking_${upstreamBodies.length}`,
      created: 1_710_000_035,
      model: "glm-5.2",
      choices: [{
        index: 0,
        message: { role: "assistant", content: "ok" },
        finish_reason: "stop",
      }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const implicit = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "glm-5.2",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Default." }],
          tools: [{
            name: "lookup",
            input_schema: { type: "object" },
          }],
        },
      });
      assert.equal(implicit.status, 200);

      const explicit = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "glm-5.2",
          max_tokens: 1024,
          messages: [{ role: "user", content: "Think." }],
          tools: [{
            name: "lookup",
            input_schema: { type: "object" },
          }],
          output_config: { effort: "xhigh" },
        },
      });
      assert.equal(explicit.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamBodies.length, 2);
  assert.deepEqual(upstreamBodies[0].thinking, { type: "disabled" });
  assert.equal("reasoning_effort" in upstreamBodies[0], false);
  assert.deepEqual(upstreamBodies[1].thinking, { type: "enabled" });
  assert.equal(upstreamBodies[1].reasoning_effort, "xhigh");
});

test("model gateway maps chat reasoning content to codex responses output items", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
        reasoning_details: [{
          id: "rs_chat_provider",
          type: "reasoning",
          status: "completed",
          summary: [{ type: "summary_text", text: "Need context before answering." }],
          encrypted_content: "encrypted-chat-provider-reasoning",
        }],
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
      assert.deepEqual(responses.body.output[0], {
        id: "rs_chat_provider",
        type: "reasoning",
        status: "completed",
        summary: [{ type: "summary_text", text: "Need context before answering." }],
        encrypted_content: "encrypted-chat-provider-reasoning",
      });
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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
        imageGenerationRequests: 0,
        imagesGenerated: 0,
        imageEditRequests: 0,
        audioInputRequests: 0,
        audioOutputRequests: 0,
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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

test("model gateway drops placeholder chat reasoning from streaming codex responses", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-placeholder-reasoning-stream",
      name: "Codex Placeholder Reasoning Stream",
      appScopes: ["codex"],
      baseUrl: "https://codex-placeholder-reasoning-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-placeholder-reasoning-stream-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_placeholder_reason_stream\",\"created\":1710000034,\"model\":\"claude-opus-4-8\",\"choices\":[{\"delta\":{\"reasoning_content\":\"...\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_placeholder_reason_stream\",\"created\":1710000034,\"model\":\"claude-opus-4-8\",\"choices\":[{\"delta\":{\"reasoning\":\"  call\\n\\ntool call\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_placeholder_reason_stream\",\"created\":1710000034,\"model\":\"claude-opus-4-8\",\"choices\":[{\"delta\":{\"content\":\"Final\\n\\n...\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_placeholder_reason_stream\",\"created\":1710000034,\"model\":\"claude-opus-4-8\",\"choices\":[{\"delta\":{\"content\":\"\\n\\n...\"},\"finish_reason\":\"stop\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":1,\"total_tokens\":5,\"completion_tokens_details\":{\"reasoning_tokens\":3}}}",
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
          model: "claude-opus-4-8",
          input: "Answer normally.",
          stream: true,
        },
      });

      assert.equal(streamed.status, 200);
      const events = parseSseEvents(streamed.body);
      assert.ok(!events.some((item) => item.event?.startsWith("response.reasoning_summary")));
      assert.deepEqual(events.filter((item) => item.event === "response.output_text.delta").map((item) => item.data.delta), ["Final"]);
      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.deepEqual(completed.output.map((item) => item.type), ["message"]);
      assert.equal(JSON.stringify(completed.output).includes("..."), false);
      assert.equal(JSON.stringify(completed.output).includes("call"), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway ignores empty streaming chat tool deltas for codex responses", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-empty-tool-delta-stream",
      name: "Codex Empty Tool Delta Stream",
      appScopes: ["codex"],
      baseUrl: "https://codex-empty-tool-delta-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-empty-tool-delta-stream-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_empty_tool_delta\",\"created\":1710000036,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_empty_tool_delta\",\"created\":1710000036,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"type\":\"function\",\"function\":{}}]}}]}",
      "",
      "data: {\"id\":\"chatcmpl_empty_tool_delta\",\"created\":1710000036,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":1,\"total_tokens\":5}}",
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
          model: "glm-5.2",
          input: "Use a tool only when needed.",
          stream: true,
        },
      });

      assert.equal(streamed.status, 200);
      const events = parseSseEvents(streamed.body);
      assert.equal(events.some((item) => item.event === "response.function_call_arguments.delta"), false);
      assert.equal(events.some((item) => item.event === "response.function_call_arguments.done"), false);
      assert.equal(events.some((item) => item.data?.item?.type === "function_call"), false);
      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.deepEqual(completed.output, []);
      assert.equal(completed.status, "completed");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway buffers streaming chat tool arguments until codex tool identity arrives", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-buffered-tool-delta-stream",
      name: "Codex Buffered Tool Delta Stream",
      appScopes: ["codex"],
      baseUrl: "https://codex-buffered-tool-delta-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-buffered-tool-delta-stream-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    const upstreamSse = upstreamCalls === 1
      ? [
        "data: {\"id\":\"chatcmpl_buffered_tool_delta\",\"created\":1710000044,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_buffered_tool_delta\",\"created\":1710000044,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"type\":\"function\",\"function\":{\"arguments\":\"{\\\"query\\\":\"}}]}}]}",
        "",
        "data: {\"id\":\"chatcmpl_buffered_tool_delta\",\"created\":1710000044,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_lookup\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"\\\"docs\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":2,\"total_tokens\":6}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n")
      : [
        "data: {\"id\":\"chatcmpl_orphan_tool_args\",\"created\":1710000045,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_orphan_tool_args\",\"created\":1710000045,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"type\":\"function\",\"function\":{\"arguments\":\"call call call\"}}]}}]}",
        "",
        "data: {\"id\":\"chatcmpl_orphan_tool_args\",\"created\":1710000045,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":1,\"total_tokens\":5}}",
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
      const buffered = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          input: "Use lookup.",
          stream: true,
        },
      });
      assert.equal(buffered.status, 200);
      const bufferedEvents = parseSseEvents(buffered.body);
      const added = bufferedEvents.find((item) => item.event === "response.output_item.added");
      assert.equal(added.data.item.call_id, "call_lookup");
      assert.equal(added.data.item.name, "lookup");
      assert.equal(JSON.stringify(bufferedEvents).includes("\"name\":\"tool\""), false);
      assert.deepEqual(
        bufferedEvents
          .filter((item) => item.event === "response.function_call_arguments.delta")
          .map((item) => item.data.delta),
        ["{\"query\":\"docs\"}"],
      );
      const completed = bufferedEvents.find((item) => item.event === "response.completed").data.response;
      assert.deepEqual(completed.output, [{
        id: "fc_call_lookup",
        type: "function_call",
        status: "completed",
        call_id: "call_lookup",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      }]);

      const orphan = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "glm-5.2",
          input: "Use lookup.",
          stream: true,
        },
      });
      assert.equal(orphan.status, 200);
      const orphanEvents = parseSseEvents(orphan.body);
      assert.equal(JSON.stringify(orphanEvents).includes("function_call"), false);
      assert.equal(JSON.stringify(orphanEvents).includes("call call call"), true);
      assert.deepEqual(orphanEvents.find((item) => item.event === "response.completed").data.response.output, [{
        id: "chatcmpl_orphan_tool_args_msg",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{
          type: "output_text",
          text: 'OpenAI Chat streaming orphan tool_call delta for Responses at index 0: {"arguments":"call call call"}',
          annotations: [],
        }],
      }]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway buffers streaming chat tool arguments until anthropic tool identity arrives", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-buffered-chat-tool-delta-stream",
      name: "Anthropic Buffered Chat Tool Delta Stream",
      appScopes: ["claude-code"],
      baseUrl: "https://anthropic-buffered-chat-tool-delta-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-anthropic-buffered-chat-tool-delta-stream-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    const upstreamSse = upstreamCalls === 1
      ? [
        "data: {\"id\":\"chatcmpl_anthropic_buffered_tool_delta\",\"created\":1710000046,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_buffered_tool_delta\",\"created\":1710000046,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"type\":\"function\",\"function\":{\"arguments\":\"{\\\"query\\\":\"}}]}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_buffered_tool_delta\",\"created\":1710000046,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_lookup\",\"type\":\"function\",\"function\":{\"name\":\"lookup\",\"arguments\":\"\\\"docs\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":2,\"total_tokens\":6}}",
        "",
        "data: [DONE]",
        "",
      ].join("\n")
      : [
        "data: {\"id\":\"chatcmpl_anthropic_orphan_tool_args\",\"created\":1710000047,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_orphan_tool_args\",\"created\":1710000047,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"type\":\"function\",\"function\":{\"arguments\":\"call call call\"}}]}}]}",
        "",
        "data: {\"id\":\"chatcmpl_anthropic_orphan_tool_args\",\"created\":1710000047,\"model\":\"glm-5.2\",\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":4,\"completion_tokens\":1,\"total_tokens\":5}}",
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
      const buffered = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "glm-5.2",
          max_tokens: 64,
          messages: [{ role: "user", content: "Use lookup." }],
          stream: true,
        },
      });
      assert.equal(buffered.status, 200);
      const bufferedEvents = parseSseEvents(buffered.body);
      const blockStart = bufferedEvents.find((item) => item.event === "content_block_start");
      assert.deepEqual(blockStart.data.content_block, {
        type: "tool_use",
        id: "call_lookup",
        name: "lookup",
        input: {},
      });
      assert.deepEqual(
        bufferedEvents
          .filter((item) => item.event === "content_block_delta")
          .map((item) => item.data.delta.partial_json),
        ["{\"query\":\"docs\"}"],
      );
      assert.equal(JSON.stringify(bufferedEvents).includes("\"name\":\"tool\""), false);
      assert.equal(bufferedEvents.find((item) => item.event === "message_delta").data.delta.stop_reason, "tool_use");

      const orphan = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "glm-5.2",
          max_tokens: 64,
          messages: [{ role: "user", content: "Use lookup." }],
          stream: true,
        },
      });
      assert.equal(orphan.status, 200);
      const orphanEvents = parseSseEvents(orphan.body);
      const orphanBlockStart = orphanEvents.find((item) => item.event === "content_block_start");
      assert.deepEqual(orphanBlockStart.data.content_block, { type: "text", text: "" });
      assert.deepEqual(
        orphanEvents
          .filter((item) => item.event === "content_block_delta")
          .map((item) => item.data.delta.text),
        ['OpenAI Chat streaming orphan tool_call delta for Anthropic Messages at index 0: {"arguments":"call call call"}'],
      );
      assert.equal(JSON.stringify(orphanEvents).includes("call call call"), true);
      assert.equal(orphanEvents.find((item) => item.event === "message_delta").data.delta.stop_reason, "end_turn");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("model gateway adapts legacy streaming Chat function_call to Anthropic and Responses SSE", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "legacy-chat-function-stream-upstream",
      name: "Legacy Chat Function Stream Upstream",
      appScopes: ["claude-code", "codex"],
      baseUrl: "https://legacy-chat-function-stream-upstream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: { apiKey: "sk-legacy-chat-function-stream-upstream" },
    setActiveScopes: ["claude-code", "codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: JSON.parse(String(init.body || "{}")),
    });
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_legacy_function_stream\",\"created\":1710000048,\"model\":\"legacy-chat\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_legacy_function_stream\",\"created\":1710000048,\"model\":\"legacy-chat\",\"choices\":[{\"delta\":{\"function_call\":{\"name\":\"lookup\",\"arguments\":\"\"}}}]}",
      "",
      "data: {\"id\":\"chatcmpl_legacy_function_stream\",\"created\":1710000048,\"model\":\"legacy-chat\",\"choices\":[{\"delta\":{\"function_call\":{\"arguments\":\"{\\\"query\\\":\"}}}]}",
      "",
      "data: {\"id\":\"chatcmpl_legacy_function_stream\",\"created\":1710000048,\"model\":\"legacy-chat\",\"choices\":[{\"delta\":{\"function_call\":{\"arguments\":\"\\\"docs\\\"}\"}},\"finish_reason\":\"function_call\"}],\"usage\":{\"prompt_tokens\":5,\"completion_tokens\":2,\"total_tokens\":7}}",
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(upstreamSse, { status: 200, headers: { "content-type": "text/event-stream" } });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const anthropic = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "legacy-chat",
          max_tokens: 64,
          stream: true,
          messages: [{ role: "user", content: "Use lookup" }],
          tools: [{ name: "lookup", input_schema: { type: "object" } }],
        },
      });
      assert.equal(anthropic.status, 200, anthropic.body);
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

      const responses = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "legacy-chat",
          stream: true,
          input: "Use lookup",
          tools: [{ type: "function", name: "lookup", parameters: { type: "object" } }],
        },
      });
      assert.equal(responses.status, 200, responses.body);
      const responseEvents = parseSseEvents(responses.body);
      assert.deepEqual(
        responseEvents
          .filter((item) => item.event === "response.function_call_arguments.delta")
          .map((item) => item.data.delta),
        ["{\"query\":", "\"docs\"}"],
      );
      const outputItem = responseEvents.find((item) => item.event === "response.output_item.added" && item.data.item.type === "function_call");
      assert.deepEqual(outputItem.data.item, {
        id: "fc_call_lookup",
        type: "function_call",
        status: "in_progress",
        call_id: "call_lookup",
        name: "lookup",
        arguments: "{}",
      });
      const completed = responseEvents.find((item) => item.event === "response.completed").data.response;
      assert.deepEqual(completed.output, [{
        id: "fc_call_lookup",
        type: "function_call",
        status: "completed",
        call_id: "call_lookup",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      }]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://legacy-chat-function-stream-upstream.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-legacy-chat-function-stream-upstream");
  assert.equal(upstreamCalls[0].body.stream, true);
  assert.equal(upstreamCalls[1].url, "https://legacy-chat-function-stream-upstream.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[1].body.stream, true);
});

test("model gateway adapts streaming chat tool calls to codex responses sse", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.outcome, entry.errorCode]), [
        ["failure", "invalid_request_error"],
        ["failure", "rate_limit_exceeded"],
      ]);

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "codex-stream-error-adapter");
      assert.equal(provider.health.consecutiveFailures, 2);
      assert.equal(provider.health.circuitState, "closed");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway fails truncated chat streams instead of finalizing success", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "chat-truncated-stream-adapter",
      name: "Chat Truncated Stream Adapter",
      appScopes: ["codex", "claude-code"],
      baseUrl: "https://chat-truncated-stream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-chat-truncated-stream-secret",
    },
    setActiveScopes: ["codex", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      "data: {\"id\":\"chatcmpl_truncated\",\"created\":1710000048,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"role\":\"assistant\"}}]}",
      "",
      "data: {\"id\":\"chatcmpl_truncated\",\"created\":1710000048,\"model\":\"gpt-test\",\"choices\":[{\"delta\":{\"content\":\"partial\"}}]}",
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
      const codex = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "gpt-test",
          input: "truncate chat stream",
          stream: true,
        },
      });
      assert.equal(codex.status, 200);
      const codexEvents = parseSseEvents(codex.body);
      assert.equal(codexEvents.find((item) => item.event === "response.output_text.delta").data.delta, "partial");
      const failed = codexEvents.find((item) => item.event === "response.failed").data.response;
      assert.equal(failed.status, "failed");
      assert.deepEqual(failed.error, {
        message: "Chat stream ended without finish_reason.",
        type: "stream_error",
        code: "model_gateway_chat_stream_missing_finish_reason",
      });
      assert.ok(!codexEvents.some((item) => item.event === "response.completed"));
      assert.equal(codexEvents.at(-1).data, "[DONE]");

      const anthropic = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-test",
          max_tokens: 64,
          messages: [{ role: "user", content: "truncate chat stream" }],
          stream: true,
        },
      });
      assert.equal(anthropic.status, 200);
      const anthropicEvents = parseSseEvents(anthropic.body);
      assert.equal(anthropicEvents[0].event, "message_start");
      assert.equal(anthropicEvents[2].data.delta.text, "partial");
      const anthropicError = anthropicEvents.find((item) => item.event === "error");
      assert.ok(anthropicError);
      assert.deepEqual(anthropicError.data.error, {
        type: "stream_error",
        message: "Chat stream ended without finish_reason.",
        code: "model_gateway_chat_stream_missing_finish_reason",
      });
      assert.ok(!anthropicEvents.some((item) => item.event === "message_stop"));

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.outcome, entry.errorCode]), [
        ["failure", "model_gateway_chat_stream_missing_finish_reason"],
        ["failure", "model_gateway_chat_stream_missing_finish_reason"],
      ]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://chat-truncated-stream.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[1].url, "https://chat-truncated-stream.example.test/v1/chat/completions");
});

test("model gateway records streamed codex tool-call history for follow-up chat adapter requests", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

test("model gateway adapts inline codex tool-result history with gateway-compatible chat shape", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

test("model gateway restores codex custom tool-call history for follow-up chat adapter requests", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-custom-history-adapter",
      name: "Codex Custom History Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-custom-history.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-custom-history-secret",
    },
    setActiveScopes: ["codex"],
  });

  fs.mkdirSync(path.dirname(paths.codexHistory), { recursive: true });
  fs.writeFileSync(paths.codexHistory, `${JSON.stringify({
    version: 1,
    updatedAt: "2026-06-19T00:00:00.000Z",
    order: ["resp_custom_patch"],
    responses: {
      resp_custom_patch: {
        responseId: "resp_custom_patch",
        createdAt: "2026-06-19T00:00:00.000Z",
        updatedAt: "2026-06-19T00:00:00.000Z",
        input: [{
          role: "user",
          content: "Patch the file.",
        }],
        output: [{
          type: "custom_tool_call",
          status: "completed",
          call_id: "call_patch",
          name: "apply_patch",
          input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n",
        }],
      },
    },
  }, null, 2)}\n`);

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      body: String(init.body || ""),
    });
    return new Response(JSON.stringify({
      id: "chatcmpl_custom_history_final",
      created: 1_710_000_027,
      model: "claude-opus-4-8",
      choices: [{
        index: 0,
        message: {
          role: "assistant",
          content: "Patch result observed.",
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
      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-opus-4-8",
          previous_response_id: "resp_custom_patch",
          input: [
            {
              type: "custom_tool_call_output",
              call_id: "call_patch",
              output: "Done",
            },
            {
              role: "user",
              content: "Continue after the patch.",
            },
          ],
          stream: false,
        },
      });
      assert.equal(response.status, 200);
      assert.equal(response.body.output[0].content[0].text, "Patch result observed.");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  const chatBody = JSON.parse(upstreamCalls[0].body);
  assert.deepEqual(chatBody.messages, [
    {
      role: "user",
      content: "Patch the file.",
    },
    {
      role: "assistant",
      content: null,
      tool_calls: [{
        id: "call_patch",
        type: "function",
        function: {
          name: "apply_patch",
          arguments: "{\"input\":\"*** Begin Patch\\n*** Add File: probe.txt\\n+ok\\n*** End Patch\\n\"}",
        },
      }],
    },
    {
      role: "tool",
      content: "Done",
      tool_call_id: "call_patch",
    },
    {
      role: "user",
      content: "Continue after the patch.",
    },
  ]);
});

test("model gateway restores codex custom tool calls from chat adapter responses", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-custom-response-adapter",
      name: "Codex Custom Response Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-custom-response.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-custom-response-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "chatcmpl_custom_response",
    created: 1_710_000_028,
    model: "claude-opus-4-8",
    choices: [{
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [{
          id: "call_patch",
          type: "function",
          function: {
            name: "apply_patch",
            arguments: "{\"input\":\"*** Begin Patch\\n*** Add File: probe.txt\\n+ok\\n*** End Patch\\n\"}",
          },
        }],
      },
      finish_reason: "tool_calls",
    }],
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-opus-4-8",
          input: "Patch.",
          tools: [{
            type: "custom",
            name: "apply_patch",
          }],
          stream: false,
        },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.output, [{
        type: "custom_tool_call",
        id: "call_patch",
        call_id: "call_patch",
        status: "completed",
        name: "apply_patch",
        input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n",
      }]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway restores streaming codex custom tool calls from chat sse", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-stream-custom-response-adapter",
      name: "Codex Stream Custom Response Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-stream-custom-response.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-codex-stream-custom-response-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    const upstreamSse = [
      "data: {\"id\":\"chatcmpl_stream_custom\",\"created\":1710000029,\"model\":\"claude-opus-4-8\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_patch\",\"type\":\"function\",\"function\":{\"name\":\"apply_patch\",\"arguments\":\"{\\\"input\\\":\\\"*** Begin Patch\\\\n\"}}]}}]}",
      "",
      "data: {\"id\":\"chatcmpl_stream_custom\",\"created\":1710000029,\"model\":\"claude-opus-4-8\",\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"*** Add File: probe.txt\\\\n+ok\\\\n*** End Patch\\\\n\\\"}\"}}]},\"finish_reason\":\"tool_calls\"}]}",
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
          model: "claude-opus-4-8",
          input: "Patch.",
          tools: [{
            type: "custom",
            name: "apply_patch",
          }],
          stream: true,
        },
      });
      assert.equal(streamed.status, 200);
      const events = parseSseEvents(streamed.body);
      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.deepEqual(completed.output, [{
        id: "fc_call_patch",
        type: "custom_tool_call",
        status: "completed",
        call_id: "call_patch",
        name: "apply_patch",
        input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n",
      }]);
      const done = events.find((item) => item.event === "response.output_item.done").data.item;
      assert.equal(done.type, "custom_tool_call");
      assert.equal(done.input, "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway restores codex custom tool calls from anthropic adapter responses", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-custom-anthropic-response-adapter",
      name: "Codex Custom Anthropic Response Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-custom-anthropic-response.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-codex-custom-anthropic-response-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    id: "msg_custom_anthropic_response",
    type: "message",
    role: "assistant",
    model: "claude-native",
    content: [{
      type: "tool_use",
      id: "call_patch",
      name: "apply_patch",
      input: {
        input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n",
      },
    }],
    stop_reason: "tool_use",
    usage: {
      input_tokens: 12,
      output_tokens: 4,
    },
  }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const response = await requestJson(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-native",
          input: "Patch.",
          tools: [{
            type: "custom",
            name: "apply_patch",
          }],
          stream: false,
        },
      });
      assert.equal(response.status, 200);
      assert.deepEqual(response.body.output, [{
        type: "custom_tool_call",
        id: "call_patch",
        call_id: "call_patch",
        status: "completed",
        name: "apply_patch",
        input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n",
      }]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway restores streaming codex custom tool calls from anthropic sse", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "codex-stream-custom-anthropic-response-adapter",
      name: "Codex Stream Custom Anthropic Response Adapter",
      appScopes: ["codex"],
      baseUrl: "https://codex-stream-custom-anthropic-response.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-codex-stream-custom-anthropic-response-secret",
    },
    setActiveScopes: ["codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (_url, init = {}) => {
    upstreamCalls.push({ body: String(init.body || "") });
    return new Response(JSON.stringify({
      id: "msg_stream_custom_anthropic",
      type: "message",
      role: "assistant",
      model: "claude-native",
      content: [{
        type: "tool_use",
        id: "call_patch",
        name: "apply_patch",
        input: { input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n" },
      }],
      stop_reason: "tool_use",
      usage: { input_tokens: 7, output_tokens: 3 },
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const streamed = await requestRaw(`${baseUrl}/v1/responses`, {
        method: "POST",
        body: {
          model: "claude-native",
          input: "Patch.",
          tools: [{
            type: "custom",
            name: "apply_patch",
          }],
          stream: true,
        },
      });
      assert.equal(streamed.status, 200);
      const events = parseSseEvents(streamed.body);
      const completed = events.find((item) => item.event === "response.completed").data.response;
      assert.deepEqual(completed.output, [{
        id: "call_patch",
        type: "custom_tool_call",
        status: "completed",
        call_id: "call_patch",
        name: "apply_patch",
        input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n",
      }]);
      const done = events.find((item) => item.event === "response.output_item.done").data.item;
      assert.equal(done.type, "custom_tool_call");
      assert.equal(done.input, "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(JSON.parse(upstreamCalls[0].body).stream, false);
});

test("model gateway records streamed codex tool-call history for follow-up anthropic adapter requests", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      return new Response(JSON.stringify({
        id: "msg_stream_anthropic_history",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{
          type: "tool_use",
          id: "call_lookup",
          name: "lookup",
          input: { query: "docs" },
        }],
        stop_reason: "tool_use",
        usage: {
          input_tokens: 7,
          output_tokens: 3,
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
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
        "response.function_call_arguments.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      const firstCompleted = firstEvents.find((item) => item.event === "response.completed").data.response;
      assert.equal(firstCompleted.id, "msg_stream_anthropic_history");
      assert.deepEqual(firstCompleted.output, [{
        id: "call_lookup",
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
  assert.equal(JSON.parse(upstreamCalls[0].body).stream, false);
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


test("model gateway preserves streaming responses reasoning summaries through chat and anthropic sse", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-reasoning-stream-adapter",
      name: "Responses Reasoning Stream Adapter",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-reasoning-stream.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-reasoning-stream-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
    const responseId = upstreamCalls.length === 1 ? "resp_reason_chat" : "resp_reason_anthropic";
    const upstreamSse = [
      "event: response.created",
      `data: {"type":"response.created","response":{"id":"${responseId}","object":"response","status":"in_progress","model":"gpt-reasoning","output":[],"usage":{"input_tokens":6,"output_tokens":0}}}`,
      "",
      "event: response.output_item.added",
      "data: {\"type\":\"response.output_item.added\",\"output_index\":0,\"item\":{\"id\":\"rs_1\",\"type\":\"reasoning\",\"status\":\"in_progress\",\"summary\":[]}}",
      "",
      "event: response.reasoning_summary_part.added",
      "data: {\"type\":\"response.reasoning_summary_part.added\",\"item_id\":\"rs_1\",\"output_index\":0,\"summary_index\":0,\"part\":{\"type\":\"summary_text\",\"text\":\"\"}}",
      "",
      "event: response.reasoning_summary_text.delta",
      "data: {\"type\":\"response.reasoning_summary_text.delta\",\"item_id\":\"rs_1\",\"output_index\":0,\"summary_index\":0,\"delta\":\"Need context. \"}",
      "",
      "event: response.reasoning_summary_text.delta",
      "data: {\"type\":\"response.reasoning_summary_text.delta\",\"item_id\":\"rs_1\",\"output_index\":0,\"summary_index\":0,\"delta\":\"Then answer.\"}",
      "",
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"item_id\":\"msg_1\",\"output_index\":1,\"content_index\":0,\"delta\":\"Done\"}",
      "",
      "event: response.completed",
      `data: {"type":"response.completed","response":{"id":"${responseId}","object":"response","status":"completed","model":"gpt-reasoning","output":[{"id":"rs_1","type":"reasoning","status":"completed","summary":[{"type":"summary_text","text":"Need context. Then answer."}]},{"id":"msg_1","type":"message","status":"completed","role":"assistant","content":[{"type":"output_text","text":"Done"}]}],"usage":{"input_tokens":6,"output_tokens":4,"total_tokens":10,"output_tokens_details":{"reasoning_tokens":2}}}}`,
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
          model: "gpt-reasoning",
          stream: true,
          messages: [{ role: "user", content: "reason please" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(chatEvents[1].data.choices[0].delta.reasoning_content, "Need context. ");
      assert.equal(chatEvents[2].data.choices[0].delta.reasoning_content, "Then answer.");
      assert.equal(chatEvents[3].data.choices[0].delta.content, "Done");
      assert.equal(chatEvents[4].data.choices[0].finish_reason, "stop");
      assert.deepEqual(chatEvents[4].data.usage, {
        prompt_tokens: 6,
        completion_tokens: 4,
        total_tokens: 10,
      });
      assert.equal(chatEvents[5].data, "[DONE]");

      const anthropic = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-reasoning",
          max_tokens: 64,
          stream: true,
          messages: [{ role: "user", content: "reason please" }],
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
        "content_block_start",
        "content_block_delta",
        "content_block_stop",
        "message_delta",
        "message_stop",
      ]);
      assert.deepEqual(anthropicEvents[1].data.content_block, { type: "thinking", thinking: "" });
      assert.deepEqual(anthropicEvents[2].data.delta, { type: "thinking_delta", thinking: "Need context. " });
      assert.deepEqual(anthropicEvents[3].data.delta, { type: "thinking_delta", thinking: "Then answer." });
      assert.deepEqual(anthropicEvents[5].data.content_block, { type: "text", text: "" });
      assert.equal(anthropicEvents[6].data.delta.text, "Done");
      assert.equal(anthropicEvents[8].data.delta.stop_reason, "end_turn");
      assert.deepEqual(anthropicEvents[8].data.usage, { output_tokens: 4 });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-reasoning-stream.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-reasoning-stream-secret");
  assert.equal(upstreamCalls[1].url, "https://responses-reasoning-stream.example.test/v1/responses");
});

test("model gateway preserves non-streaming responses reasoning summaries through chat and anthropic", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-reasoning-json-adapter",
      name: "Responses Reasoning JSON Adapter",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-reasoning-json.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-reasoning-json-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
    const responseId = upstreamCalls.length === 1 ? "resp_reason_chat_json" : "resp_reason_anthropic_json";
    return new Response(JSON.stringify({
      id: responseId,
      object: "response",
      created_at: 1_710_000_110,
      status: "completed",
      model: "gpt-reasoning",
      output: [{
        id: "rs_1",
        type: "reasoning",
        status: "completed",
        summary: [
          { type: "summary_text", text: "Need context. " },
          { type: "summary_text", text: "Then answer." },
        ],
      }, {
        id: "msg_1",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [{ type: "output_text", text: "Done" }],
      }],
      usage: {
        input_tokens: 6,
        output_tokens: 4,
        total_tokens: 10,
        input_tokens_details: { cached_tokens: 1 },
        output_tokens_details: { reasoning_tokens: 2 },
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
          model: "gpt-reasoning",
          stream: false,
          messages: [{ role: "user", content: "reason please" }],
        },
      });
      assert.equal(chat.status, 200);
      assert.equal(chat.body.choices[0].message.reasoning_content, "Need context. Then answer.");
      assert.deepEqual(chat.body.choices[0].message.reasoning_details, [{
        id: "rs_1",
        type: "reasoning",
        status: "completed",
        summary: [
          { type: "summary_text", text: "Need context. " },
          { type: "summary_text", text: "Then answer." },
        ],
      }]);
      assert.equal(chat.body.choices[0].message.content, "Done");
      assert.equal(chat.body.choices[0].finish_reason, "stop");
      assert.deepEqual(chat.body.usage, {
        prompt_tokens: 6,
        completion_tokens: 4,
        total_tokens: 10,
        prompt_tokens_details: { cached_tokens: 1 },
        completion_tokens_details: { reasoning_tokens: 2 },
      });

      const anthropic = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-reasoning",
          max_tokens: 64,
          stream: false,
          messages: [{ role: "user", content: "reason please" }],
        },
      });
      assert.equal(anthropic.status, 200);
      assert.deepEqual(anthropic.body.content, [
        { type: "thinking", thinking: "Need context. Then answer." },
        { type: "text", text: "Done" },
      ]);
      assert.equal(anthropic.body.stop_reason, "end_turn");
      assert.deepEqual(anthropic.body.usage, {
        input_tokens: 6,
        output_tokens: 4,
        cache_read_input_tokens: 1,
      });
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-reasoning-json.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-reasoning-json-secret");
  assert.equal(upstreamCalls[1].url, "https://responses-reasoning-json.example.test/v1/responses");
});

test("model gateway preserves non-streaming responses function and custom tool calls through chat and anthropic", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-tool-json-adapter",
      name: "Responses Tool JSON Adapter",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-tool-json.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-tool-json-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
      body: String(init.body || ""),
    });
    const responseId = upstreamCalls.length === 1 ? "resp_tool_chat_json" : "resp_tool_anthropic_json";
    return new Response(JSON.stringify({
      id: responseId,
      object: "response",
      created_at: 1_710_000_111,
      status: "completed",
      model: "gpt-tools",
      output: [{
        id: "fc_lookup",
        type: "function_call",
        status: "completed",
        name: "lookup",
        arguments: "{\"query\":\"docs\"}",
      }, {
        id: "call_patch",
        type: "custom_tool_call",
        status: "completed",
        call_id: "call_patch",
        name: "apply_patch",
        input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n",
      }],
      usage: {
        input_tokens: 7,
        output_tokens: 3,
        total_tokens: 10,
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
          model: "gpt-tools",
          stream: false,
          messages: [{ role: "user", content: "Use tools" }],
          tools: [{
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object" },
            },
          }, {
            type: "function",
            function: {
              name: "apply_patch",
              parameters: {
                type: "object",
                properties: { input: { type: "string" } },
                required: ["input"],
              },
            },
          }],
        },
      });
      assert.equal(chat.status, 200);
      assert.equal(chat.body.choices[0].message.content, null);
      assert.equal(chat.body.choices[0].finish_reason, "tool_calls");
      assert.deepEqual(chat.body.choices[0].message.tool_calls, [{
        id: "fc_lookup",
        type: "function",
        function: {
          name: "lookup",
          arguments: "{\"query\":\"docs\"}",
        },
      }, {
        id: "call_patch",
        type: "function",
        function: {
          name: "apply_patch",
          arguments: "{\"input\":\"*** Begin Patch\\n*** Add File: probe.txt\\n+ok\\n*** End Patch\\n\"}",
        },
      }]);

      const anthropic = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-tools",
          max_tokens: 64,
          stream: false,
          messages: [{ role: "user", content: "Use tools" }],
          tools: [{
            name: "lookup",
            input_schema: { type: "object" },
          }, {
            name: "apply_patch",
            input_schema: {
              type: "object",
              properties: { input: { type: "string" } },
              required: ["input"],
            },
          }],
        },
      });
      assert.equal(anthropic.status, 200);
      assert.deepEqual(anthropic.body.content, [{
        type: "tool_use",
        id: "fc_lookup",
        name: "lookup",
        input: { query: "docs" },
      }, {
        type: "tool_use",
        id: "call_patch",
        name: "apply_patch",
        input: { input: "*** Begin Patch\n*** Add File: probe.txt\n+ok\n*** End Patch\n" },
      }]);
      assert.equal(anthropic.body.stop_reason, "tool_use");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-tool-json.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-tool-json-secret");
  assert.equal(upstreamCalls[1].url, "https://responses-tool-json.example.test/v1/responses");
});

test("model gateway adapts streaming responses tool calls to chat and anthropic sse", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
          tools: [{
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object" },
            },
          }],
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
          tools: [{
            name: "lookup",
            input_schema: { type: "object" },
          }],
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

test("model gateway ignores empty streaming responses tool events for chat and anthropic sse", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-empty-tool-stream-adapter",
      name: "Responses Empty Tool Stream Adapter",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-empty-tool-stream.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-empty-tool-stream-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
    });
    const responseId = upstreamCalls.length === 1 ? "resp_empty_tool_chat" : "resp_empty_tool_anthropic";
    const upstreamSse = [
      "event: response.created",
      `data: {"type":"response.created","response":{"id":"${responseId}","object":"response","status":"in_progress","model":"gpt-responses","output":[],"usage":{"input_tokens":6,"output_tokens":0}}}`,
      "",
      "event: response.function_call_arguments.delta",
      "data: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":0,\"delta\":\"\"}",
      "",
      "event: response.function_call_arguments.done",
      "data: {\"type\":\"response.function_call_arguments.done\",\"output_index\":0,\"arguments\":\"\"}",
      "",
      "event: response.completed",
      `data: {"type":"response.completed","response":{"id":"${responseId}","object":"response","status":"completed","model":"gpt-responses","output":[],"usage":{"input_tokens":6,"output_tokens":1,"total_tokens":7}}}`,
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
          messages: [{ role: "user", content: "empty tool stream please" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents.some((item) => JSON.stringify(item.data).includes("tool_calls")), false);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(chatEvents[1].data.choices[0].finish_reason, "stop");
      assert.equal(chatEvents[2].data, "[DONE]");

      const anthropic = await requestRaw(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "gpt-responses",
          max_tokens: 64,
          stream: true,
          messages: [{ role: "user", content: "empty tool stream please" }],
        },
      });
      assert.equal(anthropic.status, 200);
      const anthropicEvents = parseSseEvents(anthropic.body);
      assert.deepEqual(anthropicEvents.map((item) => item.event), [
        "message_start",
        "message_delta",
        "message_stop",
      ]);
      assert.equal(anthropicEvents[1].data.delta.stop_reason, "end_turn");
      assert.equal(JSON.stringify(anthropicEvents).includes("tool_use"), false);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-empty-tool-stream.example.test/v1/responses");
  assert.equal(upstreamCalls[1].url, "https://responses-empty-tool-stream.example.test/v1/responses");
});

test("model gateway returns adapter error when upstream responses stream fails", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.outcome, entry.errorCode]), [
        ["failure", "rate_limit"],
        ["failure", "rate_limit"],
      ]);

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "responses-started-failed-stream-adapter");
      assert.equal(provider.health.consecutiveFailures, 2);
      assert.equal(provider.health.circuitState, "closed");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-started-failed-stream.example.test/v1/responses");
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-responses-started-failed-stream-secret");
  assert.equal(upstreamCalls[1].url, "https://responses-started-failed-stream.example.test/v1/responses");
});

test("model gateway fails truncated responses streams instead of finalizing success", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "responses-truncated-stream-adapter",
      name: "Responses Truncated Stream Adapter",
      appScopes: ["openclaw", "claude-code"],
      baseUrl: "https://responses-truncated-stream.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
    },
    secret: {
      apiKey: "sk-responses-truncated-stream-secret",
    },
    setActiveScopes: ["openclaw", "claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_truncated\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-responses\",\"output\":[],\"usage\":null}}",
      "",
      "event: response.output_text.delta",
      "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}",
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
          messages: [{ role: "user", content: "truncate after start" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(chatEvents[1].data.choices[0].delta.content, "partial");
      const chatError = chatEvents.find((item) => item.event === "error");
      assert.ok(chatError);
      assert.deepEqual(chatError.data.error, {
        message: "Responses stream ended without response.completed.",
        type: "stream_error",
        code: "model_gateway_responses_stream_missing_completed",
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
          messages: [{ role: "user", content: "truncate after start" }],
        },
      });
      assert.equal(anthropic.status, 200);
      const anthropicEvents = parseSseEvents(anthropic.body);
      assert.equal(anthropicEvents[0].event, "message_start");
      assert.equal(anthropicEvents[2].data.delta.text, "partial");
      const anthropicError = anthropicEvents.find((item) => item.event === "error");
      assert.ok(anthropicError);
      assert.deepEqual(anthropicError.data.error, {
        type: "stream_error",
        message: "Responses stream ended without response.completed.",
        code: "model_gateway_responses_stream_missing_completed",
      });
      assert.ok(!anthropicEvents.some((item) => item.event === "message_stop"));

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.outcome, entry.errorCode]), [
        ["failure", "model_gateway_responses_stream_missing_completed"],
        ["failure", "model_gateway_responses_stream_missing_completed"],
      ]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://responses-truncated-stream.example.test/v1/responses");
  assert.equal(upstreamCalls[1].url, "https://responses-truncated-stream.example.test/v1/responses");
});

test("model gateway maps started anthropic stream errors to chat and responses error events", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    const body = String(init.body || "");
    upstreamCalls.push({
      url: String(url),
      method: init.method,
      xApiKey: init.headers instanceof Headers ? init.headers.get("x-api-key") : null,
      body,
    });
    const parsedBody = JSON.parse(body || "{}");
    if (parsedBody.stream === false) {
      return new Response(JSON.stringify({
        id: "msg_synthetic_ok",
        type: "message",
        role: "assistant",
        model: "claude-native",
        content: [{ type: "text", text: "partial" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 5, output_tokens: 1 },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
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
      assert.ok(responseEvents.some((item) => item.event === "response.completed"));
      assert.equal(responseEvents.at(-1).data, "[DONE]");
      assert.ok(!responseEvents.some((item) => item.event === "response.failed"));

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.outcome, entry.errorCode]), [
        ["failure", "rate_limit_error"],
        ["success", null],
      ]);

      const providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      const provider = providers.body.providers.find((item) => item.id === "anthropic-started-error-stream-adapter");
      assert.equal(provider.health.consecutiveFailures, 0);
      assert.equal(provider.health.circuitState, "closed");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 2);
  assert.equal(upstreamCalls[0].url, "https://anthropic-started-error-stream.example.test/v1/messages");
  assert.equal(upstreamCalls[0].xApiKey, "sk-anthropic-started-error-stream-secret");
  assert.equal(upstreamCalls[1].url, "https://anthropic-started-error-stream.example.test/v1/messages");
  assert.equal(JSON.parse(upstreamCalls[1].body).stream, false);
});

test("model gateway fails truncated anthropic streams instead of finalizing success", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "anthropic-truncated-stream-adapter",
      name: "Anthropic Truncated Stream Adapter",
      appScopes: ["openclaw", "codex"],
      baseUrl: "https://anthropic-truncated-stream.example.test/v1",
      apiFormat: "anthropic_messages",
      authStrategy: "anthropic_api_key",
    },
    secret: {
      apiKey: "sk-anthropic-truncated-stream-secret",
    },
    setActiveScopes: ["openclaw", "codex"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      "data: {\"type\":\"message_start\",\"message\":{\"id\":\"msg_truncated\",\"type\":\"message\",\"role\":\"assistant\",\"model\":\"claude-native\",\"content\":[],\"usage\":{\"input_tokens\":5,\"output_tokens\":0}}}",
      "",
      "event: content_block_start",
      "data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}",
      "",
      "event: content_block_delta",
      "data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"partial\"}}",
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
          messages: [{ role: "user", content: "truncate anthropic stream" }],
        },
      });
      assert.equal(chat.status, 200);
      const chatEvents = parseSseEvents(chat.body);
      assert.equal(chatEvents[0].data.choices[0].delta.role, "assistant");
      assert.equal(chatEvents[1].data.choices[0].delta.content, "partial");
      const chatError = chatEvents.find((item) => item.event === "error");
      assert.ok(chatError);
      assert.deepEqual(chatError.data.error, {
        message: "Anthropic stream ended without message_stop.",
        type: "stream_error",
        code: "model_gateway_anthropic_stream_missing_message_stop",
      });
      assert.equal(chatEvents.at(-1).data, "[DONE]");
      assert.ok(!chatEvents.some((item) => item.data?.choices?.[0]?.finish_reason === "stop"));

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.outcome, entry.errorCode]), [
        ["failure", "model_gateway_anthropic_stream_missing_message_stop"],
      ]);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, "https://anthropic-truncated-stream.example.test/v1/messages");
});

test("model gateway opens circuit on repeated started stream failures and routes fallback", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "stream-fail-primary",
      name: "Stream Fail Primary",
      appScopes: ["openclaw"],
      baseUrl: "https://stream-fail-primary.example.test/v1",
      apiFormat: "openai_responses",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-shared",
        models: [{ id: "gpt-shared" }],
      },
      failover: { priority: 1 },
    },
    secret: {
      apiKey: "sk-stream-fail-primary",
    },
    setActiveScopes: ["openclaw"],
  });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "stream-fail-backup",
      name: "Stream Fail Backup",
      appScopes: ["openclaw"],
      baseUrl: "https://stream-fail-backup.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "gpt-shared",
        models: [{ id: "gpt-shared" }],
      },
      failover: { priority: 2 },
    },
    secret: {
      apiKey: "sk-stream-fail-backup",
    },
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  const upstreamCalls = [];
  globalThis.fetch = async (url, init = {}) => {
    upstreamCalls.push({
      url: String(url),
      authorization: init.headers instanceof Headers ? init.headers.get("authorization") : null,
    });
    if (String(url).startsWith("https://stream-fail-primary.example.test")) {
      const upstreamSse = [
        "event: response.created",
        "data: {\"type\":\"response.created\",\"response\":{\"id\":\"resp_stream_fail\",\"object\":\"response\",\"status\":\"in_progress\",\"model\":\"gpt-shared\",\"output\":[],\"usage\":null}}",
        "",
        "event: response.output_text.delta",
        "data: {\"type\":\"response.output_text.delta\",\"delta\":\"partial\"}",
        "",
        "event: response.failed",
        "data: {\"type\":\"response.failed\",\"response\":{\"id\":\"resp_stream_fail\",\"error\":{\"message\":\"capacity exceeded\",\"type\":\"rate_limit_error\",\"code\":\"rate_limit\"}}}",
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
      id: "chatcmpl_backup",
      choices: [{ message: { role: "assistant", content: "backup ok" } }],
    }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      for (let index = 0; index < 3; index += 1) {
        const streamed = await requestRaw(`${baseUrl}/v1/chat/completions`, {
          method: "POST",
          body: {
            model: "gpt-shared",
            stream: true,
            messages: [{ role: "user", content: "fail after start" }],
          },
        });
        assert.equal(streamed.status, 200);
        const events = parseSseEvents(streamed.body);
        assert.equal(events.find((item) => item.event === "error").data.error.code, "rate_limit");
      }

      let providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      let primary = providers.body.providers.find((item) => item.id === "stream-fail-primary");
      assert.equal(primary.health.consecutiveFailures, 3);
      assert.equal(primary.health.circuitState, "open");

      const fallback = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "gpt-shared",
          messages: [{ role: "user", content: "use fallback" }],
        },
      });
      assert.equal(fallback.status, 200);
      assert.equal(fallback.headers["x-openclaw-model-gateway-provider"], "stream-fail-backup");
      assert.equal(fallback.body.choices[0].message.content, "backup ok");

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.providerId, entry.outcome, entry.errorCode]), [
        ["stream-fail-primary", "failure", "rate_limit"],
        ["stream-fail-primary", "failure", "rate_limit"],
        ["stream-fail-primary", "failure", "rate_limit"],
        ["stream-fail-backup", "success", null],
      ]);

      providers = await requestJson(`${baseUrl}/api/model-gateway/providers`);
      primary = providers.body.providers.find((item) => item.id === "stream-fail-primary");
      const backup = providers.body.providers.find((item) => item.id === "stream-fail-backup");
      assert.equal(primary.health.circuitState, "open");
      assert.equal(backup.health.circuitState, "closed");
      assert.equal(backup.health.consecutiveFailures, 0);
      assert.ok(backup.health.lastSuccessAt);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(upstreamCalls.map((item) => item.url), [
    "https://stream-fail-primary.example.test/v1/responses",
    "https://stream-fail-primary.example.test/v1/responses",
    "https://stream-fail-primary.example.test/v1/responses",
    "https://stream-fail-backup.example.test/v1/chat/completions",
  ]);
  assert.equal(upstreamCalls[0].authorization, "Bearer sk-stream-fail-primary");
  assert.equal(upstreamCalls[3].authorization, "Bearer sk-stream-fail-backup");
});

test("model gateway adapts codex compact requests through openai chat providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
            tracevane_channel_compact: true,
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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

test("model gateway normalizes non-json passthrough upstream errors", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "html-error-provider",
      name: "HTML Error Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://html-error.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "html-error-model",
        models: [{ id: "html-error-model" }],
      },
    },
    secret: {
      apiKey: "sk-html-error-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("<html><body>Bad gateway from upstream</body></html>", {
    status: 502,
    headers: { "content-type": "text/html; charset=utf-8" },
  });

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "html-error-model",
          messages: [{ role: "user", content: "hello" }],
        },
      });

      assert.equal(chat.status, 502);
      assert.equal(chat.headers["content-type"], "application/json; charset=utf-8");
      assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "html-error-provider");
      assert.equal(chat.body.error.type, "upstream_error");
      assert.equal(chat.body.error.code, "upstream_http_502");
      assert.match(chat.body.error.message, /Bad gateway from upstream/);

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "failure");
      assert.equal(runtime.body.runtime.requestLog[0].errorCode, "upstream_http_502");
      assert.match(runtime.body.runtime.requestLog[0].errorMessage, /Bad gateway from upstream/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("model gateway normalizes endpoint profile passthrough upstream errors", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "html-error-profile-provider",
      name: "HTML Error Profile Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://unused-root.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "html-profile-model",
        models: [{ id: "html-profile-model" }],
      },
      endpointProfiles: [{
        id: "chat-html-profile",
        name: "Chat HTML Profile",
        appScopes: ["openclaw"],
        baseUrl: "https://html-profile.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        failover: { priority: 1 },
      }],
    },
    secret: {
      apiKey: "sk-html-profile-secret",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  globalThis.fetch = async (url) => {
    seenUrl = String(url);
    return new Response("<html><body>Endpoint profile failed</body></html>", {
      status: 502,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const chat = await requestJson(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        body: {
          model: "html-profile-model",
          messages: [{ role: "user", content: "hello" }],
        },
      });

      assert.equal(chat.status, 502);
      assert.equal(chat.headers["content-type"], "application/json; charset=utf-8");
      assert.equal(chat.headers["x-openclaw-model-gateway-provider"], "html-error-profile-provider");
      assert.equal(chat.headers["x-openclaw-model-gateway-endpoint"], "chat-html-profile");
      assert.equal(chat.body.error.type, "upstream_error");
      assert.equal(chat.body.error.code, "upstream_http_502");
      assert.match(chat.body.error.message, /Endpoint profile failed/);

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "failure");
      assert.equal(runtime.body.runtime.requestLog[0].providerId, "html-error-profile-provider");
      assert.equal(runtime.body.runtime.requestLog[0].endpointProfileId, "chat-html-profile");
      assert.equal(runtime.body.runtime.requestLog[0].upstreamUrl, "https://html-profile.example.test/v1/chat/completions");
      assert.equal(runtime.body.runtime.requestLog[0].errorCode, "upstream_http_502");
      assert.match(runtime.body.runtime.requestLog[0].errorMessage, /Endpoint profile failed/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(seenUrl, "https://html-profile.example.test/v1/chat/completions");
  const listed = ctx.services.modelGateway.listProviders();
  const provider = listed.providers.find((item) => item.id === "html-error-profile-provider");
  const endpoint = provider?.endpointProfiles.find((profile) => profile.id === "chat-html-profile");
  assert.equal(provider?.health.lastFailureAt, null);
  assert.ok(endpoint?.health.lastFailureAt);
  assert.match(endpoint?.health.lastError || "", /Endpoint profile failed/);
});

test("model gateway normalizes endpoint profile adapter upstream errors", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "adapter-error-profile-provider",
      name: "Adapter Error Profile Provider",
      appScopes: ["claude-code"],
      baseUrl: "https://unused-adapter-root.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "adapter-profile-model",
        models: [{ id: "adapter-profile-model" }],
      },
      endpointProfiles: [{
        id: "anthropic-chat-profile",
        name: "Anthropic Chat Profile",
        appScopes: ["claude-code"],
        baseUrl: "https://adapter-profile.example.test/v1",
        apiFormat: "openai_chat",
        authStrategy: "bearer",
        failover: { priority: 1 },
      }],
    },
    secret: {
      apiKey: "sk-adapter-profile-secret",
    },
    setActiveScopes: ["claude-code"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  let seenUrl = "";
  globalThis.fetch = async (url) => {
    seenUrl = String(url);
    return new Response("<html><body>Adapter endpoint profile failed</body></html>", {
      status: 503,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const messages = await requestJson(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: { "anthropic-version": "2023-06-01" },
        body: {
          model: "adapter-profile-model",
          max_tokens: 64,
          messages: [{ role: "user", content: "hello" }],
        },
      });

      assert.equal(messages.status, 503);
      assert.equal(messages.headers["content-type"], "application/json; charset=utf-8");
      assert.equal(messages.headers["x-openclaw-model-gateway-provider"], "adapter-error-profile-provider");
      assert.equal(messages.headers["x-openclaw-model-gateway-endpoint"], "anthropic-chat-profile");
      assert.equal(messages.body.error.type, "upstream_error");
      assert.equal(messages.body.error.code, "upstream_http_503");
      assert.match(messages.body.error.message, /Adapter endpoint profile failed/);

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.equal(runtime.body.runtime.requestLog[0].outcome, "failure");
      assert.equal(runtime.body.runtime.requestLog[0].routeId, "anthropic_messages");
      assert.equal(runtime.body.runtime.requestLog[0].requestedPath, "/v1/messages");
      assert.equal(runtime.body.runtime.requestLog[0].providerId, "adapter-error-profile-provider");
      assert.equal(runtime.body.runtime.requestLog[0].endpointProfileId, "anthropic-chat-profile");
      assert.equal(runtime.body.runtime.requestLog[0].upstreamUrl, "https://adapter-profile.example.test/v1/chat/completions");
      assert.equal(runtime.body.runtime.requestLog[0].errorCode, "upstream_http_503");
      assert.match(runtime.body.runtime.requestLog[0].errorMessage, /Adapter endpoint profile failed/);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(seenUrl, "https://adapter-profile.example.test/v1/chat/completions");
  const listed = ctx.services.modelGateway.listProviders();
  const provider = listed.providers.find((item) => item.id === "adapter-error-profile-provider");
  const endpoint = provider?.endpointProfiles.find((profile) => profile.id === "anthropic-chat-profile");
  assert.equal(provider?.health.lastFailureAt, null);
  assert.ok(endpoint?.health.lastFailureAt);
  assert.match(endpoint?.health.lastError || "", /Adapter endpoint profile failed/);
});

test("model gateway restores codex tool-call history for follow-up chat adapter requests", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const paths = resolveModelGatewayPaths(config);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  ctx.services.modelGateway.upsertProvider(undefined, {
    provider: {
      id: "route-chat",
      name: "Route Chat Provider",
      appScopes: ["openclaw"],
      baseUrl: "https://upstream.example.test/v1",
      apiFormat: "openai_chat",
      authStrategy: "bearer",
      models: {
        defaultModel: "route-test-model",
        models: [{ id: "route-test-model", label: "Route Test Model", aliases: ["route-alias"] }],
      },
    },
    secret: {
      apiKey: "sk-route-secret-abcdef",
    },
    setActiveScopes: ["openclaw"],
  });

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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
      const connectivityProbe = await requestJson(`${baseUrl}/`, { method: "HEAD" });
      assert.equal(connectivityProbe.status, 204);
      assert.equal(connectivityProbe.body, null);

      const status = await requestJson(`${baseUrl}/gateway/status`);
      assert.equal(status.status, 200);
      assert.equal(status.body.ok, true);
      assert.equal(status.body.registry.providerCount, 1);
      assert.ok(status.body.capabilities.unsupportedEndpoints.some((endpoint) =>
        endpoint.endpoint === "/v1/embeddings"
        && endpoint.code === "model_gateway_endpoint_unsupported"
      ));
      assert.ok(status.body.capabilities.unsupportedEndpoints.some((endpoint) =>
        endpoint.endpoint === "/v1/realtime"
        && endpoint.code === "model_gateway_realtime_unsupported"
      ));
      assert.ok(status.body.capabilities.unsupportedEndpoints.some((endpoint) =>
        endpoint.method === "WS"
        && endpoint.path === "/v1/responses"
        && endpoint.endpoint === "/v1/responses#websocket"
        && endpoint.code === "model_gateway_realtime_unsupported"
      ));
      assert.ok(status.body.capabilities.unsupportedEndpoints.some((endpoint) =>
        endpoint.endpoint === "/v1/responses/ws"
        && endpoint.code === "model_gateway_realtime_unsupported"
      ));

      const providers = await requestJson(`${baseUrl}/gateway/providers`);
      assert.equal(providers.status, 200);
      assert.equal(providers.body.providers[0].id, "route-chat");
      assert.equal(providers.body.providers[0].secret.masked, "sk-r...cdef");
      assert.ok(!JSON.stringify(providers.body).includes("sk-route-secret-abcdef"));

      const models = await requestJson(`${baseUrl}/v1/models`);
      assert.equal(models.status, 200);
      assert.equal(models.body.object, "list");
      assert.equal(models.body.data[0].id, "route-test-model");

      const openAiModel = await requestJson(`${baseUrl}/v1/models/route-alias`);
      assert.equal(openAiModel.status, 200);
      assert.equal(openAiModel.body.id, "route-test-model");
      assert.equal(openAiModel.body.object, "model");

      const anthropicModels = await requestJson(`${baseUrl}/claude/v1/models`, {
        headers: { "anthropic-version": "2023-06-01", "x-tracevane-app-scope": "claude-code" },
      });
      assert.equal(anthropicModels.status, 200);
      assert.equal(anthropicModels.body.data[0].id, "route-test-model");
      assert.equal(anthropicModels.body.data[0].type, "model");
      assert.equal(anthropicModels.body.data[0].display_name, "Route Test Model");
      assert.equal(typeof anthropicModels.body.data[0].created_at, "string");
      assert.equal(anthropicModels.body.first_id, "route-test-model");
      assert.equal(anthropicModels.body.last_id, "route-test-model");
      assert.equal(anthropicModels.body.has_more, false);

      const anthropicModel = await requestJson(`${baseUrl}/v1/models/route-test-model`, {
        headers: { "anthropic-version": "2023-06-01", "x-tracevane-app-scope": "claude-code" },
      });
      assert.equal(anthropicModel.status, 200);
      assert.deepEqual(anthropicModel.body, anthropicModels.body.data[0]);

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
          reasoning_effort: "high",
          reasoningEffort: "high",
          tools: [{
            type: "function",
            function: {
              name: "lookup",
              parameters: { type: "object", properties: {} },
            },
          }],
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
    tools: [{
      type: "function",
      function: {
        name: "lookup",
        parameters: { type: "object", properties: {} },
      },
    }],
  });
  assert.equal("metadata" in JSON.parse(upstreamCalls[1].body), false);
  assert.equal("reasoning_effort" in JSON.parse(upstreamCalls[1].body), false);
  assert.equal("reasoningEffort" in JSON.parse(upstreamCalls[1].body), false);
});

test("model gateway can opt into openai chat metadata passthrough for compatible providers", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
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

  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
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

test("model gateway returns structured unsupported for unimplemented OpenAI endpoint families", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response("unexpected", { status: 500 });
  };

  const probes = [
    { path: "/v1/embeddings", method: "POST", body: { model: "text-embedding-3-large", input: "hello" } },
    { path: "/v1/moderations", method: "POST", body: { model: "omni-moderation-latest", input: "hello" } },
    { path: "/v1/completions", method: "POST", body: { model: "gpt-3.5-turbo-instruct", prompt: "hello" } },
    { path: "/v1/chat/completions", method: "GET", expectedEndpoint: "/v1/chat/completions#stored" },
    { path: "/v1/chat/completions/chatcmpl_1", method: "GET" },
    { path: "/v1/chat/completions/chatcmpl_1", method: "POST", body: { metadata: { trace: "test" } } },
    { path: "/v1/chat/completions/chatcmpl_1", method: "DELETE" },
    { path: "/v1/chat/completions/chatcmpl_1/messages", method: "GET" },
    { path: "/v1/models/ft:gpt-5.5:org:suffix:model_1", method: "DELETE" },
    { path: "/v1/containers", method: "GET" },
    { path: "/v1/containers", method: "POST", body: { name: "test container" } },
    { path: "/v1/containers/cntr_1", method: "GET" },
    { path: "/v1/containers/cntr_1", method: "DELETE" },
    { path: "/v1/containers/cntr_1/files", method: "GET" },
    { path: "/v1/containers/cntr_1/files", method: "POST", body: { file_id: "file_1" } },
    { path: "/v1/containers/cntr_1/files/file_1", method: "GET" },
    { path: "/v1/containers/cntr_1/files/file_1", method: "DELETE" },
    { path: "/v1/containers/cntr_1/files/file_1/content", method: "GET" },
    { path: "/v1/skills", method: "GET" },
    { path: "/v1/skills", method: "POST", body: { name: "test skill", archive_file_id: "file_1" } },
    { path: "/v1/skills/skill_1", method: "GET" },
    { path: "/v1/skills/skill_1", method: "POST", body: { default_version_id: "skillver_1" } },
    { path: "/v1/skills/skill_1", method: "DELETE" },
    { path: "/v1/skills/skill_1/content", method: "GET" },
    { path: "/v1/skills/skill_1/versions", method: "GET" },
    { path: "/v1/skills/skill_1/versions", method: "POST", body: { archive_file_id: "file_1" } },
    { path: "/v1/skills/skill_1/versions/skillver_1", method: "GET" },
    { path: "/v1/skills/skill_1/versions/skillver_1", method: "DELETE" },
    { path: "/v1/skills/skill_1/versions/skillver_1/content", method: "GET" },
    { path: "/v1/evals", method: "GET" },
    { path: "/v1/evals", method: "POST", body: { name: "eval", data_source_config: { type: "custom" }, testing_criteria: [] } },
    { path: "/v1/evals/eval_1", method: "GET" },
    { path: "/v1/evals/eval_1", method: "POST", body: { metadata: { trace: "test" } } },
    { path: "/v1/evals/eval_1", method: "DELETE" },
    { path: "/v1/evals/eval_1/runs", method: "GET" },
    { path: "/v1/evals/eval_1/runs", method: "POST", body: { name: "run", data_source: { type: "jsonl", source: { type: "file_id", id: "file_1" } } } },
    { path: "/v1/evals/eval_1/runs/run_1", method: "GET" },
    { path: "/v1/evals/eval_1/runs/run_1", method: "DELETE" },
    { path: "/v1/evals/eval_1/runs/run_1/cancel", method: "POST", body: {} },
    { path: "/v1/evals/eval_1/runs/run_1/output_items", method: "GET" },
    { path: "/v1/evals/eval_1/runs/run_1/output_items/output_1", method: "GET" },
    { path: "/v1/fine_tuning/alpha/graders/run", method: "POST", body: { grader: { type: "string_check", name: "exact", input: "ok", reference: "ok", operation: "eq" } } },
    { path: "/v1/fine_tuning/alpha/graders/validate", method: "POST", body: { grader: { type: "string_check", name: "exact", input: "ok", reference: "ok", operation: "eq" } } },
    {
      path: "/v1/fine-tuning/alpha/graders/validate",
      method: "POST",
      body: { grader: { type: "string_check", name: "exact", input: "ok", reference: "ok", operation: "eq" } },
      expectedEndpoint: "/v1/fine_tuning/alpha/graders/validate",
    },
    { path: "/v1/chatkit/sessions", method: "POST", body: { user: "user_1", workflow: { id: "workflow_1" } } },
    { path: "/v1/chatkit/sessions/session_1/cancel", method: "POST", body: {} },
    { path: "/v1/chatkit/threads", method: "GET" },
    { path: "/v1/chatkit/threads/thread_1", method: "GET" },
    { path: "/v1/chatkit/threads/thread_1", method: "DELETE" },
    { path: "/v1/chatkit/threads/thread_1/items", method: "GET" },
    { path: "/v1/organization/audit_logs", method: "GET" },
    { path: "/v1/organization/admin_api_keys", method: "GET" },
    { path: "/v1/organization/admin_api_keys", method: "POST", body: { name: "admin-key-test" } },
    { path: "/v1/organization/admin_api_keys/key_1", method: "DELETE", expectedEndpoint: "/v1/organization/admin_api_keys/{key_id}" },
    { path: "/v1/organization/invites", method: "POST", body: { email: "user@example.test", role: "reader" } },
    { path: "/v1/organization/users/user_1", method: "POST", body: { name: "User Test" } },
    { path: "/v1/organization/users/user_1/roles", method: "POST", body: { role_id: "role_1" } },
    { path: "/v1/organization/groups", method: "POST", body: { name: "group-test" } },
    { path: "/v1/organization/projects", method: "GET" },
    { path: "/v1/organization/projects", method: "POST", body: { name: "project-test" } },
    { path: "/v1/organization/projects/project_1/archive", method: "POST", body: {} },
    { path: "/v1/organization/projects/project_1/service_accounts", method: "POST", body: { name: "service-account-test" } },
    { path: "/v1/organization/projects/project_1/service_accounts/service_account_1", method: "DELETE", expectedEndpoint: "/v1/organization/projects/{project_id}/service_accounts/{service_account_id}" },
    { path: "/v1/organization/projects/project_1/api_keys", method: "GET", expectedEndpoint: "/v1/organization/projects/{project_id}/api_keys" },
    { path: "/v1/organization/projects/project_1/api_keys/key_1", method: "DELETE", expectedEndpoint: "/v1/organization/projects/{project_id}/api_keys/{key_id}" },
    { path: "/v1/organization/projects/project_1/rate_limits", method: "GET", expectedEndpoint: "/v1/organization/projects/{project_id}/rate_limits" },
    { path: "/v1/organization/projects/project_1/model_permissions/model_permission_1", method: "POST", body: { allowed: false }, expectedEndpoint: "/v1/organization/projects/{project_id}/model_permissions/{model_permission_id}" },
    { path: "/v1/organization/projects/project_1/hosted_tool_permissions/tool_permission_1", method: "POST", body: { allowed: false }, expectedEndpoint: "/v1/organization/projects/{project_id}/hosted_tool_permissions/{tool_permission_id}" },
    { path: "/v1/organization/data_retention", method: "GET" },
    { path: "/v1/organization/spend_alerts", method: "POST", body: { threshold: 100, email: "billing@example.test" } },
    { path: "/v1/organization/certificates", method: "POST", body: { certificate: "test" } },
    { path: "/v1/organization/certificates/cert_1/activate", method: "POST", body: {}, expectedEndpoint: "/v1/organization/certificates/{certificate_id}/activate" },
    { path: "/v1/organization/projects/project_1/certificates", method: "GET", expectedEndpoint: "/v1/organization/projects/{project_id}/certificates" },
    { path: "/v1/organization/costs", method: "GET" },
    { path: "/v1/organization/usage/completions", method: "GET" },
    { path: "/v1/organization/usage/web_searches", method: "GET" },
    { path: "/v1/responses/input_tokens", method: "POST", body: { model: "gpt-5.5", input: "hello" } },
    { path: "/v1/responses/resp_1", method: "GET" },
    { path: "/v1/responses/resp_1", method: "DELETE" },
    { path: "/v1/responses/resp_1/input_items", method: "GET" },
    { path: "/v1/responses/resp_1/cancel", method: "POST", body: {} },
    { path: "/v1/conversations", method: "POST", body: { items: [{ role: "user", content: "hello" }] } },
    { path: "/v1/conversations/conv_1", method: "POST", body: { metadata: { trace: "test" } } },
    { path: "/v1/conversations/conv_1/items", method: "GET" },
    { path: "/v1/conversations/conv_1/items", method: "POST", body: { role: "user", content: "hello" } },
    { path: "/v1/conversations/conv_1/items/item_1", method: "GET" },
    { path: "/v1/conversations/conv_1/items/item_1", method: "DELETE" },
    { path: "/v1/batches", method: "POST", body: { input_file_id: "file_1", endpoint: "/v1/responses" } },
    {
      path: "/v1/fine_tuning/jobs",
      method: "POST",
      body: { model: "gpt-5.5", training_file: "file_1" },
      expectedEndpoint: "/v1/fine_tuning/jobs",
    },
    {
      path: "/v1/fine-tuning/jobs",
      method: "POST",
      body: { model: "gpt-5.5", training_file: "file_1" },
      expectedEndpoint: "/v1/fine_tuning/jobs",
    },
    {
      path: "/v1/fine_tuning/jobs/ftjob_1/events",
      method: "GET",
      expectedEndpoint: "/v1/fine_tuning/jobs/{job_id}/events",
    },
    {
      path: "/v1/fine_tuning/jobs/ftjob_1/pause",
      method: "POST",
      body: { model: "gpt-5.5" },
      expectedEndpoint: "/v1/fine_tuning/jobs/{job_id}/pause",
    },
    {
      path: "/v1/fine_tuning/jobs/ftjob_1/resume",
      method: "POST",
      body: { model: "gpt-5.5" },
      expectedEndpoint: "/v1/fine_tuning/jobs/{job_id}/resume",
    },
    {
      path: "/v1/fine_tuning/jobs/ftjob_1/checkpoints",
      method: "GET",
      expectedEndpoint: "/v1/fine_tuning/jobs/{job_id}/checkpoints",
    },
    {
      path: "/v1/fine-tuning/jobs/ftjob_1/checkpoints",
      method: "GET",
      expectedEndpoint: "/v1/fine_tuning/jobs/{job_id}/checkpoints",
    },
    { path: "/v1/assistants", method: "POST", body: { model: "gpt-5.5" } },
    { path: "/v1/assistants/asst_1", method: "POST", body: { name: "updated" } },
    { path: "/v1/assistants/asst_1", method: "DELETE" },
    { path: "/v1/threads/runs", method: "POST", body: { assistant_id: "asst_1", thread: { messages: [] } } },
    { path: "/v1/threads/thread_1", method: "POST", body: { metadata: { trace: "test" } } },
    { path: "/v1/threads/thread_1", method: "DELETE" },
    { path: "/v1/threads/thread_1/messages", method: "GET" },
    { path: "/v1/threads/thread_1/messages/msg_1", method: "GET" },
    { path: "/v1/threads/thread_1/messages/msg_1", method: "POST", body: { metadata: { trace: "test" } } },
    { path: "/v1/threads/thread_1/messages/msg_1", method: "DELETE" },
    { path: "/v1/threads/thread_1/runs/run_1", method: "GET" },
    { path: "/v1/threads/thread_1/runs/run_1", method: "POST", body: { metadata: { trace: "test" } } },
    {
      path: "/v1/threads/thread_1/runs/run_1/submit_tool_outputs",
      method: "POST",
      body: { tool_outputs: [{ tool_call_id: "call_1", output: "ok" }] },
    },
    { path: "/v1/threads/thread_1/runs/run_1/cancel", method: "POST", body: {} },
    { path: "/v1/threads/thread_1/runs/run_1/steps", method: "GET" },
    { path: "/v1/threads/thread_1/runs/run_1/steps/step_1", method: "GET" },
    { path: "/v1/files/file_1", method: "GET" },
    { path: "/v1/files/file_1/content", method: "GET" },
    { path: "/v1/uploads", method: "POST", body: { bytes: 12, filename: "test.jsonl", mime_type: "application/jsonl", purpose: "batch" } },
    { path: "/v1/uploads/upload_1/parts", method: "POST", body: { bytes: "chunk" } },
    { path: "/v1/uploads/upload_1/complete", method: "POST", body: { part_ids: ["part_1"] } },
    { path: "/v1/uploads/upload_1/cancel", method: "POST", body: {} },
    { path: "/v1/vector_stores", method: "GET" },
    { path: "/v1/vector_stores/vs_1", method: "POST", body: { name: "updated" } },
    { path: "/v1/vector_stores/vs_1/search", method: "POST", body: { query: "hello" } },
    { path: "/v1/vector_stores/vs_1/files", method: "GET" },
    { path: "/v1/vector_stores/vs_1/files", method: "POST", body: { file_id: "file_1" } },
    { path: "/v1/vector_stores/vs_1/files/file_1", method: "POST", body: { attributes: { source: "test" } } },
    { path: "/v1/vector_stores/vs_1/files/file_1/content", method: "GET" },
    { path: "/v1/vector_stores/vs_1/file_batches", method: "POST", body: { file_ids: ["file_1"] } },
    { path: "/v1/vector_stores/vs_1/file_batches/batch_1", method: "GET" },
    { path: "/v1/vector_stores/vs_1/file_batches/batch_1/files", method: "GET" },
    { path: "/v1/vector_stores/vs_1/file_batches/batch_1/cancel", method: "POST", body: {} },
    { path: "/v1/videos", method: "POST", body: { model: "sora-2", prompt: "test" } },
  ];

  try {
    await withServer(handler, async (baseUrl) => {
      for (const probe of probes) {
        const response = await requestJson(`${baseUrl}${probe.path}`, {
          method: probe.method,
          body: probe.body,
        });
        assert.equal(response.status, 501, probe.path);
        assert.equal(response.body.error.code, "model_gateway_endpoint_unsupported", probe.path);
        if (probe.expectedEndpoint) assert.equal(response.body.error.details.endpoint, probe.expectedEndpoint);
        assert.equal(response.body.error.details.feasibility, "blocked-no-verified-gateway-adapter-contract");
        assert.match(response.body.error.details.reference, /verified request\/response adapter/);
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls, 0);
});

test("model gateway unsupported endpoint inventory matches every registered HTTP 501 route", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });
  const originalFetch = globalThis.fetch;
  let upstreamCalls = 0;
  globalThis.fetch = async () => {
    upstreamCalls += 1;
    return new Response("unexpected", { status: 500 });
  };

  try {
    await withServer(handler, async (baseUrl) => {
      const status = await requestJson(`${baseUrl}/gateway/status`);
      assert.equal(status.status, 200);
      assert.deepEqual(
        status.body.capabilities.unsupportedEndpoints,
        MODEL_GATEWAY_UNSUPPORTED_ENDPOINTS,
        "status capabilities must be generated from the unsupported endpoint source of truth",
      );

      for (const route of MODEL_GATEWAY_UNSUPPORTED_HTTP_ROUTES) {
        const path = concreteUnsupportedRoutePath(route.path);
        const response = await requestRaw(`${baseUrl}${path}`, {
          method: route.method,
          body: unsupportedRouteRequestBody(route),
        });
        assert.equal(response.status, 501, `${route.method} ${route.path}`);
        let body;
        assert.doesNotThrow(() => {
          body = JSON.parse(response.body);
        }, `${route.method} ${route.path} must return JSON, got ${response.body}`);
        assert.equal(typeof body.error.message, "string", `${route.method} ${route.path}`);
        assert.match(body.error.message, /Tracevane Gateway does not expose|Realtime or Responses WebSocket/);
        assert.equal(body.error.code, route.code, `${route.method} ${route.path}`);
        assert.equal(body.error.details.endpoint, route.endpoint, `${route.method} ${route.path}`);
        assert.equal(typeof body.error.details.reference, "string", `${route.method} ${route.path}`);
        assert.ok(body.error.details.reference.length > 40, `${route.method} ${route.path}`);
        assert.ok(Array.isArray(body.error.details.alternatives), `${route.method} ${route.path}`);
        assert.ok(body.error.details.alternatives.length > 0, `${route.method} ${route.path}`);
        if (route.code === "model_gateway_realtime_unsupported") {
          assert.equal(body.error.details.feasibility, "blocked-no-verified-gateway-websocket-proxy-contract");
        } else {
          assert.equal(body.error.details.feasibility, "blocked-no-verified-gateway-adapter-contract");
        }
      }
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls, 0);
});
