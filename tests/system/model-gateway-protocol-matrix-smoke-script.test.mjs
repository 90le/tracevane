import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-model-gateway-protocol-matrix.mjs");
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
            models: { defaultModel: "glm-5.2", models: [{ id: "glm-5.2", aliases: ["glm-5.2[1m]"] }] },
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
            models: { defaultModel: "gpt-5.5", models: [{ id: "gpt-5.5" }] },
            endpointProfiles: [],
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
      if (providerId === "glm" && body.scope === "claude-code") {
        const endpointId = options.wrongClaudeEndpoint ? "coding-chat" : "coding-anthropic";
        sendJson(res, 200, {
          ok: true,
          providerId,
          route: {
            routeId: "anthropic_messages",
            mode: "passthrough",
            endpointProfile: { id: endpointId },
            provider: { apiFormat: endpointId === "coding-anthropic" ? "anthropic_messages" : "openai_chat" },
            upstreamUrl: endpointId === "coding-anthropic"
              ? "https://open.bigmodel.cn/api/anthropic/v1/messages"
              : "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
          },
          responsePreview: "GATEWAY_OK",
        });
        return;
      }
      if (providerId === "glm" && body.scope === "opencode") {
        sendJson(res, 200, {
          ok: true,
          providerId,
          route: {
            routeId: "openai_chat_completions",
            mode: "passthrough",
            endpointProfile: { id: "coding-chat" },
            provider: { apiFormat: "openai_chat" },
            upstreamUrl: "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
          },
          responsePreview: "GATEWAY_OK",
        });
        return;
      }
      if (providerId === "codex-account" && body.scope === "codex") {
        sendJson(res, 200, {
          ok: true,
          providerId,
          route: {
            routeId: "openai_responses",
            mode: "passthrough",
            endpointProfile: null,
            provider: { apiFormat: "openai_responses" },
            upstreamUrl: "https://chatgpt.com/backend-api/codex/responses",
          },
          responsePreview: "GATEWAY_OK",
        });
        return;
      }
      sendJson(res, 502, {
        ok: false,
        providerId,
        route: { routeId: "missing-provider", mode: "missing-provider" },
        error: { code: "unexpected_route", message: `${body.scope} used ${providerId}` },
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

async function runScript(args, options = {}) {
  const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
    cwd: repoRoot,
    env: {
      ...process.env,
      STUDIO_GATEWAY_CLIENT_KEY: "test-gateway-key",
      ...(options.env || {}),
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 16,
  });
  return JSON.parse(result.stdout);
}

test("model gateway protocol matrix proves GLM native protocols and Codex account responses", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript(["--endpoint", gateway.endpoint, "--json"]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.protocolProofs.map((proof) => [proof.id, proof.ok, proof.provider, proof.routeId, proof.endpointProfile]), [
      ["anthropic_messages", true, "glm", "anthropic_messages", "coding-anthropic"],
      ["openai_chat_completions", true, "glm", "openai_chat_completions", "coding-chat"],
      ["codex_account_responses", true, "codex-account", "openai_responses", null],
    ]);
    assert.deepEqual(gateway.activeProviders, {});
    assert.equal(gateway.requests.filter((request) => request.path === "/api/model-gateway/active-provider").length, 6);
  } finally {
    await gateway.close();
  }
});

test("model gateway protocol matrix fails when GLM Anthropic endpoint is not selected", async () => {
  const gateway = await startMockGateway({ wrongClaudeEndpoint: true });
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [scriptPath, "--endpoint", gateway.endpoint, "--json"], {
        cwd: repoRoot,
        env: {
          ...process.env,
          STUDIO_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 16,
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.stages[0].ok, false);
        assert.equal(parsed.stages[0].activeRoutes.expectationFailures[0].code, "model_gateway_endpoint_expectation_failed");
        assert.deepEqual(gateway.activeProviders, {});
        return true;
      },
    );
  } finally {
    await gateway.close();
  }
});
