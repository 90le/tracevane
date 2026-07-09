import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-model-gateway-representative-matrix.mjs");
const execFileAsync = promisify(execFile);

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, body) {
  const raw = JSON.stringify(body);
  res.writeHead(statusCode, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(raw),
  });
  res.end(raw);
}

function providerModels(...ids) {
  return ids.map((id) => ({ id, aliases: [] }));
}

async function startMockGateway(options = {}) {
  const requests = [];
  const activeProviders = {};
  const server = http.createServer(async (req, res) => {
    const rawBody = await readRequestBody(req);
    let body = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      body = {};
    }
    const url = new URL(req.url || "/", "http://127.0.0.1");
    requests.push({
      method: req.method,
      path: url.pathname,
      authorization: req.headers.authorization || null,
      body,
    });
    if (req.headers.authorization !== "Bearer test-gateway-key") {
      sendJson(res, 401, { error: { code: "model_gateway_client_auth_required" } });
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/model-gateway/providers") {
      sendJson(res, 200, {
        ok: true,
        activeProviders,
        providers: [
          {
            id: "glm",
            name: "GLM",
            enabled: true,
            sourceType: "api-key",
            apiFormat: "openai_chat",
            appScopes: ["codex", "claude-code", "opencode", "openclaw"],
            models: { defaultModel: "glm-4.7", models: providerModels("glm-4.7") },
            endpointProfiles: [
              { id: "coding-chat", enabled: true, apiFormat: "openai_chat" },
              { id: "coding-anthropic", enabled: true, apiFormat: "anthropic_messages" },
            ],
          },
          {
            id: "codex-account",
            name: "Codex Account",
            enabled: true,
            sourceType: "account-backed",
            apiFormat: "openai_responses",
            appScopes: ["codex", "claude-code", "opencode", "openclaw"],
            models: { defaultModel: "gpt-5.4", models: providerModels("gpt-5.4") },
            endpointProfiles: [],
          },
          {
            id: "api-key-provider",
            name: "mlamp",
            enabled: true,
            sourceType: "api-key",
            apiFormat: "anthropic_messages",
            appScopes: ["codex", "claude-code", "opencode", "openclaw"],
            models: { defaultModel: "claude-sonnet-4-6", models: providerModels("claude-sonnet-4-6") },
            endpointProfiles: [
              { id: "chat", enabled: true, apiFormat: "openai_chat" },
              { id: "anthropic", enabled: true, apiFormat: "anthropic_messages" },
            ],
          },
        ],
      });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/model-gateway/active-provider") {
      if (body.providerId) activeProviders[body.scope] = body.providerId;
      else delete activeProviders[body.scope];
      sendJson(res, 200, { ok: true, activeProviders });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/model-gateway/active-route-smoke") {
      const providerId = activeProviders[body.scope] || "";
      const route = routeFor(providerId, body.scope);
      if (options.failGlmChat && providerId === "glm" && body.scope === "opencode") {
        sendJson(res, 502, {
          ok: false,
          providerId,
          statusCode: 429,
          route,
          responsePreview: "该模型当前访问量过大，请您稍后再试",
          error: { code: "model_gateway_upstream_failed", message: "upstream capacity" },
        });
        return;
      }
      if (!route) {
        sendJson(res, 502, {
          ok: false,
          providerId,
          route: { routeId: "missing-provider", mode: "missing-provider" },
          error: { code: "unexpected_route", message: `${body.scope} used ${providerId}` },
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        providerId,
        statusCode: body.errorSmoke ? 400 : 200,
        route,
        responsePreview: body.toolSmoke || body.toolResultSmoke
          ? "gateway_smoke_tool GATEWAY_OK"
          : "GATEWAY_OK",
      });
      return;
    }
    sendJson(res, 404, { error: { code: "not_found" } });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("mock server did not bind");
  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    activeProviders,
    requests,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function routeFor(providerId, scope) {
  if (providerId === "glm") {
    if (scope === "claude-code") {
      return {
        routeId: "anthropic_messages",
        mode: "passthrough",
        endpointProfile: { id: "coding-anthropic" },
        provider: { apiFormat: "anthropic_messages" },
        upstreamUrl: "https://open.bigmodel.cn/api/anthropic/v1/messages",
      };
    }
    if (scope === "codex") {
      return {
        routeId: "openai_responses",
        mode: "adapter-required",
        endpointProfile: { id: "coding-anthropic" },
        provider: { apiFormat: "anthropic_messages" },
        upstreamUrl: "https://open.bigmodel.cn/api/anthropic/v1/messages",
      };
    }
    if (scope === "opencode") {
      return {
        routeId: "openai_chat_completions",
        mode: "passthrough",
        endpointProfile: { id: "coding-chat" },
        provider: { apiFormat: "openai_chat" },
        upstreamUrl: "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
      };
    }
  }
  if (providerId === "codex-account") {
    return {
      routeId: scope === "codex" ? "openai_responses" : scope === "claude-code" ? "anthropic_messages" : "openai_chat_completions",
      mode: scope === "codex" ? "passthrough" : "adapter-required",
      endpointProfile: null,
      provider: { apiFormat: "openai_responses" },
      upstreamUrl: "https://chatgpt.com/backend-api/codex/responses",
    };
  }
  if (providerId === "api-key-provider") {
    if (scope === "codex" || scope === "opencode") {
      return {
        routeId: scope === "codex" ? "openai_responses" : "openai_chat_completions",
        mode: scope === "codex" ? "adapter-required" : "passthrough",
        endpointProfile: { id: "chat" },
        provider: { apiFormat: "openai_chat" },
        upstreamUrl: "https://llm-gateway.mlamp.cn/v1/chat/completions",
      };
    }
    return {
      routeId: scope === "codex" ? "openai_responses" : "anthropic_messages",
      mode: scope === "claude-code" ? "passthrough" : "adapter-required",
      endpointProfile: { id: "anthropic" },
      provider: { apiFormat: "anthropic_messages" },
      upstreamUrl: "https://llm-gateway.mlamp.cn/v1/messages",
    };
  }
  return null;
}

async function runScript(args, options = {}) {
  const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
      ...(options.env || {}),
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 32,
  });
  return JSON.parse(result.stdout);
}

test("representative matrix covers three models, three agents, endpoint expectations, and full smoke groups", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript(["--endpoint", gateway.endpoint, "--timeout-ms", "5000", "--stage-timeout-ms", "30000", "--json"]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.smokeProfile, "full");
    assert.deepEqual(parsed.representativeProofs.map((proof) => [proof.channel, proof.model, proof.scope, proof.observedRouteId, proof.observedEndpointProfile, proof.observedApiFormat, proof.ok]), [
      ["glm", "glm-4.7", "codex", "openai_responses", "coding-anthropic", "anthropic_messages", true],
      ["glm", "glm-4.7", "claude-code", "anthropic_messages", "coding-anthropic", "anthropic_messages", true],
      ["glm", "glm-4.7", "opencode", "openai_chat_completions", "coding-chat", "openai_chat", true],
      ["codex-account", "gpt-5.4", "codex", "openai_responses", null, "openai_responses", true],
      ["codex-account", "gpt-5.4", "claude-code", "anthropic_messages", null, "openai_responses", true],
      ["codex-account", "gpt-5.4", "opencode", "openai_chat_completions", null, "openai_responses", true],
      ["claude-provider", "claude-sonnet-4-6", "codex", "openai_responses", "chat", "openai_chat", true],
      ["claude-provider", "claude-sonnet-4-6", "claude-code", "anthropic_messages", "anthropic", "anthropic_messages", true],
      ["claude-provider", "claude-sonnet-4-6", "opencode", "openai_chat_completions", "chat", "openai_chat", true],
    ]);
    for (const summary of Object.values(parsed.acceptanceSummary.smokeGroups)) {
      assert.equal(summary.total, 9);
      assert.equal(summary.passed, 9);
      assert.equal(summary.failed, 0);
    }
    assert.equal(parsed.monitoring.totalRouteDecisions, 9);
    assert.equal(parsed.monitoring.totalFailures, 0);
    assert.equal(parsed.monitoring.totalIssues, 0);
    assert.equal(gateway.requests.filter((request) => request.path === "/api/model-gateway/active-route-smoke").length, 99);
    assert.deepEqual(gateway.activeProviders, {});
  } finally {
    await gateway.close();
  }
});

test("representative matrix writes reports and keeps running after one upstream endpoint fails", async () => {
  const gateway = await startMockGateway({ failGlmChat: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-representative-matrix-"));
  const reportFile = path.join(tempRoot, "matrix.json");
  const markdownReport = path.join(tempRoot, "matrix.md");
  try {
    let error;
    try {
      await runScript([
        "--endpoint", gateway.endpoint,
        "--timeout-ms", "5000",
        "--stage-timeout-ms", "30000",
        "--smoke-retries", "0",
        "--report-file", reportFile,
        "--markdown-report", markdownReport,
        "--json",
      ]);
    } catch (caught) {
      error = caught;
    }
    assert.ok(error);
    const parsed = JSON.parse(error.stdout);
    assert.equal(parsed.ok, false);
    assert.equal(parsed.monitoring.totalFailures, 11);
    assert.ok(parsed.monitoring.failures.every((failure) => failure.stage === "glm-glm-4.7" && failure.scope === "opencode"));
    assert.ok(parsed.stages.some((stage) => stage.id === "codex-account-gpt-5.4" && stage.ok));
    assert.ok(parsed.stages.some((stage) => stage.id === "claude-provider-claude-sonnet-4-6" && stage.ok));
    assert.equal(JSON.parse(fs.readFileSync(reportFile, "utf8")).ok, false);
    assert.match(fs.readFileSync(markdownReport, "utf8"), /Model Gateway Representative Matrix Report/);
  } finally {
    await gateway.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
