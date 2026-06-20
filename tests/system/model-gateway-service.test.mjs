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
  resolveModelGatewayPaths,
} from "../../dist/apps/api/modules/model-gateway/service.js";
import { createModelGatewayDaemon } from "../../dist/apps/api/modules/model-gateway/daemon.js";

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
    webDistDir: path.join(root, "tracevane/apps/web-vue/dist"),
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
    appScope: "codex",
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
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
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
  assert.equal(usage.models.length, 18);

  const byModel = new Map(usage.models.map((item) => [item.model, item]));
  assert.deepEqual(
    {
      requestCount: byModel.get("model-a")?.requestCount,
      meteredRequestCount: byModel.get("model-a")?.meteredRequestCount,
      inputTokens: byModel.get("model-a")?.inputTokens,
      outputTokens: byModel.get("model-a")?.outputTokens,
      totalTokens: byModel.get("model-a")?.totalTokens,
    },
    {
      requestCount: 1,
      meteredRequestCount: 1,
      inputTokens: 10,
      outputTokens: 5,
      totalTokens: 15,
    },
  );
  assert.equal(byModel.get("model-b")?.requestCount, 1);
  assert.equal(byModel.get("model-b")?.totalTokens, 0);
  assert.equal(byModel.get("model-c")?.requestCount, 1);
  assert.equal(byModel.get("model-c")?.totalTokens, 0);
  assert.equal(byModel.get("model-extra-15")?.totalTokens, 15);
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
      assert.equal(wsHttp.body.error.code, "model_gateway_codex_account_realtime_unsupported");
      assert.match(wsHttp.body.error.details.reference, /Responses WebSocket mode/);
      assert.ok(wsHttp.body.error.details.alternatives.some((item) => item.includes("verified WebSocket bridge")));

      const realtimeHttp = await requestJson(`${baseUrl}/v1/realtime`);
      assert.equal(realtimeHttp.status, 501);
      assert.equal(realtimeHttp.body.error.code, "model_gateway_codex_account_realtime_unsupported");
      assert.match(realtimeHttp.body.error.details.reference, /Realtime WebSocket/);

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

test("model gateway returns structured unsupported for Codex account realtime websocket routes", async () => {
  const root = makeTempRoot();
  const ctx = createTracevaneContext({
    config: createTracevaneConfig(root),
    logger: createLogger(),
  });

  await withTracevaneServer(ctx, async (baseUrl) => {
    const wsUrl = `ws${baseUrl.slice("http".length)}/v1/responses/ws`;
    const payload = await new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl, {
        headers: { authorization: "Bearer sk-tracevane-smoke-local" },
      });
      ws.once("message", (raw) => {
        resolve(JSON.parse(Buffer.from(raw).toString("utf8")));
        ws.close();
      });
      ws.once("error", reject);
    });
    assert.equal(payload.type, "error");
    assert.equal(payload.error.code, "model_gateway_codex_account_realtime_unsupported");
    assert.match(payload.error.details.reference, /OpenAI documents Responses WebSocket mode/);
    assert.ok(payload.error.details.alternatives.some((item) => item.includes("verified WebSocket bridge")));
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
    setActiveScopes: ["codex"],
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
      const text = requestBody.input?.[0]?.content?.[0]?.text || "";
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
      assert.equal(alpha1.status, 200);
      assert.equal(alpha2.status, 200);
      assert.equal(beta.status, 200);
      assert.equal(upstreamCalls[1].accountId, upstreamCalls[0].accountId);
      assert.notEqual(upstreamCalls[2].accountId, upstreamCalls[0].accountId);
      assert.equal(alpha1.headers["x-openclaw-model-gateway-account"], alpha2.headers["x-openclaw-model-gateway-account"]);

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
      assert.equal(response.body.models.length, 7);
      assert.deepEqual(response.body.models.map((model) => model.id), [
        "model-a",
        "model-b",
        "gpt-5.4-mini",
        "glm-5.2",
        "glm-5.2[1m]",
        "claude-opus-4-6",
        "deepseek-reasoner",
      ]);
      assert.deepEqual(
        response.body.models.map((model) => [model.contextWindow, model.maxOutputTokens]),
        [[128000, 8192], [256000, 16384], [1050000, 128000], [1000000, 128000], [1000000, 128000], [1000000, 64000], [64000, 8000]],
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
        vision: false,
        reasoning: true,
        responses: true,
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
  assert.match(codexConfig, /model_reasoning_effort = "high"/);
  assert.match(codexConfig, /model_context_window = 200000/);
  assert.match(codexConfig, /model_auto_compact_token_limit = 150000/);
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
  assert.match(codexConfig, /model_context_window = 64000/);
  assert.match(codexConfig, /model_auto_compact_token_limit = 47436/);

  service.applyAppConnection(undefined, { appId: "opencode" });
  const opencodeConfig = JSON.parse(fs.readFileSync(opencodePath, "utf8"));
  assert.equal(opencodeConfig.model, "tracevane-gateway/small");
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-small"].contextWindow, 64000);
  assert.equal(opencodeConfig.provider["tracevane-gateway"].models["gpt-small"].maxOutputTokens, 8192);
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
    assert.match(codexConfig, /model_auto_compact_token_limit = 100000/);

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

test("model gateway daemon service management exposes templates and guarded install", async () => {
  const root = makeTempRoot();
  const config = createTracevaneConfig(root);
  const ctx = createTracevaneContext({ config, logger: createLogger() });
  const handler = createTracevaneRequestHandler(ctx, { stripBasePath: "" });

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

      const runtime = await requestJson(`${baseUrl}/api/model-gateway/runtime`);
      assert.equal(runtime.status, 200);
      assert.deepEqual(runtime.body.runtime.requestLog.map((entry) => [entry.routeId, entry.requestedPath, entry.outcome]), [
        ["anthropic_messages", "/v1/messages", "success"],
        ["anthropic_messages", "/claude/v1/messages", "success"],
        ["anthropic_messages", "/v1/messages", "success"],
      ]);
      assert.ok(!JSON.stringify(runtime.body).includes("sk-anthropic-chat-secret"));
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 3);
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
        content: [{ type: "text", text: "Anthropic stream" }],
        stop_reason: "end_turn",
        usage: {
          input_tokens: 6,
          output_tokens: 3,
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
        "response.output_text.done",
        "response.content_part.done",
        "response.output_item.done",
        "response.completed",
        null,
      ]);
      assert.equal(streamEvents[4].data.delta, "Anthropic stream");
      assert.equal(streamEvents[8].data.response.output[0].content[0].text, "Anthropic stream");
      assert.equal(streamEvents[9].data, "[DONE]");

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

test("model gateway ignores incomplete anthropic tool identities for chat completions", async () => {
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
        content: "",
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

test("model gateway ignores incomplete responses function calls for chat completions", async () => {
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
        content: "",
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

test("model gateway drops orphan tool results before provider adapters", async () => {
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
  assert.equal(upstreamCalls[1].url, "https://chat-to-anthropic-orphan-tool-result.example.test/v1/messages");
  assert.equal(JSON.stringify(upstreamCalls[1].body).includes("tool_result"), false);
  assert.equal(upstreamCalls[2].url, "https://anthropic-to-chat-orphan-tool-result.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[2].body.messages.some((message) => message.role === "tool"), false);
  assert.equal(upstreamCalls[3].url, "https://responses-to-chat-orphan-tool-result.example.test/v1/chat/completions");
  assert.equal(upstreamCalls[3].body.messages.some((message) => message.role === "tool"), false);
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
    },
    {
      role: "user",
      content: [{ type: "input_text", text: "Continue." }],
    },
  ]);
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
            {
              type: "message",
              role: "user",
              content: [
                { type: "input_text", text: "Hello" },
                { type: "input_image", image_url: "data:image/png;base64,TEST_IMAGE" },
              ],
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
        imageGenerationRequests: 0,
        imagesGenerated: 0,
        imageEditRequests: 0,
        audioInputRequests: 0,
        audioOutputRequests: 0,
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
      {
        role: "user",
        content: [
          { type: "text", text: "Hello" },
          { type: "image_url", image_url: { url: "data:image/png;base64,TEST_IMAGE" } },
        ],
      },
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
          messages: [{ role: "user", content: "Think." }],
          output_config: { effort: "xhigh" },
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
          messages: [{ role: "user", content: "Think." }],
          output_config: { effort: "max" },
          stream: false,
        },
      });
      assert.equal(anthropicToResponses.status, 200);
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(upstreamCalls.length, 5);
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
  assert.equal(upstreamCalls[3].body.reasoning_effort, "xhigh");
  assert.equal("output_config" in upstreamCalls[3].body, false);

  assert.equal(upstreamCalls[4].url, "https://anthropic-to-responses-reasoning.example.test/v1/responses");
  assert.deepEqual(upstreamCalls[4].body.reasoning, { effort: "xhigh" });
  assert.equal("output_config" in upstreamCalls[4].body, false);
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
      assert.equal(JSON.stringify(orphanEvents).includes("call call call"), false);
      assert.deepEqual(orphanEvents.find((item) => item.event === "response.completed").data.response.output, []);
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
      assert.equal(orphanEvents.some((item) => item.event === "content_block_start"), false);
      assert.equal(JSON.stringify(orphanEvents).includes("call call call"), false);
      assert.equal(orphanEvents.find((item) => item.event === "message_delta").data.delta.stop_reason, "end_turn");
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
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
