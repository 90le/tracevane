import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startMockGateway(options = {}) {
  const requests = [];
  const activeProviders = {};
  let failedFirstCodexRouteSmoke = false;
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
            models: { defaultModel: "gpt-5.5", models: [{ id: "gpt-5.5" }, { id: "gpt-5.4" }, { id: "gpt-5.4-mini" }] },
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
      if (options.slowSmokeScope === body.scope) {
        await sleep(options.slowSmokeDelayMs || 1_000);
      }
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
      if (providerId === "codex-account" && ["codex", "claude-code", "opencode"].includes(body.scope)) {
        if (options.failFirstCodexRouteSmoke && !failedFirstCodexRouteSmoke && body.scope === "codex" && !body.toolSmoke && !body.toolResultSmoke) {
          failedFirstCodexRouteSmoke = true;
          sendJson(res, 502, {
            ok: false,
            providerId,
            route: {
              routeId: "openai_responses",
              mode: "passthrough",
              endpointProfile: null,
              provider: { apiFormat: "openai_responses" },
              upstreamUrl: "https://chatgpt.com/backend-api/codex/responses",
            },
            error: { code: "mock_first_stage_failure", message: "first stage attempt failed" },
          });
          return;
        }
        const routeId = body.scope === "codex"
          ? "openai_responses"
          : body.scope === "claude-code"
            ? "anthropic_messages"
            : "openai_chat_completions";
        sendJson(res, 200, {
          ok: true,
          providerId,
          route: {
            routeId,
            mode: body.scope === "codex" ? "passthrough" : "adapter-required",
            endpointProfile: null,
            provider: { apiFormat: "openai_responses" },
            upstreamUrl: "https://chatgpt.com/backend-api/codex/responses",
          },
          responsePreview: body.toolSmoke || body.toolResultSmoke ? "gateway_smoke_tool GATEWAY_OK" : "GATEWAY_OK",
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
  let result;
  try {
    result = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        ...(options.env || {}),
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 16,
    });
  } catch (error) {
    if (error instanceof Error) {
      error.message += [
        error.stdout ? `\nstdout:\n${error.stdout}` : "",
        error.stderr ? `\nstderr:\n${error.stderr}` : "",
      ].join("");
    }
    throw error;
  }
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
      ["codex_account_responses:gpt-5.4", true, "codex-account", "openai_responses", null],
      ["codex_account_claude_code:gpt-5.4", true, "codex-account", "anthropic_messages", null],
      ["codex_account_opencode:gpt-5.4", true, "codex-account", "openai_chat_completions", null],
      ["codex_account_responses:gpt-5.5", true, "codex-account", "openai_responses", null],
      ["codex_account_claude_code:gpt-5.5", true, "codex-account", "anthropic_messages", null],
      ["codex_account_opencode:gpt-5.5", true, "codex-account", "openai_chat_completions", null],
      ["codex_account_responses:gpt-5.4-mini", true, "codex-account", "openai_responses", null],
      ["codex_account_claude_code:gpt-5.4-mini", true, "codex-account", "anthropic_messages", null],
      ["codex_account_opencode:gpt-5.4-mini", true, "codex-account", "openai_chat_completions", null],
    ]);
    assert.deepEqual(gateway.activeProviders, {});
    assert.equal(gateway.requests.filter((request) => request.path === "/api/model-gateway/active-provider").length, 22);
    for (const model of ["gpt-5.4", "gpt-5.5", "gpt-5.4-mini"]) {
      const requestsForModel = gateway.requests.filter((request) => request.path === "/api/model-gateway/active-route-smoke" && request.body.model === model);
      assert.equal(requestsForModel.length, 33);
    }
    const codexSmokeRequests = gateway.requests.filter((request) => request.path === "/api/model-gateway/active-route-smoke" && request.body.model === "gpt-5.5");
    for (const scope of ["codex", "claude-code", "opencode"]) {
      const requestsForScope = codexSmokeRequests.filter((request) => request.body.scope === scope);
      assert.equal(requestsForScope.filter((request) =>
        request.body.toolSmoke === false
        && request.body.toolResultSmoke === false
        && request.body.compatibilitySmoke === false
        && request.body.malformedSmoke === false
        && request.body.errorSmoke === false
        && request.body.stream === undefined
      ).length, 1);
      for (const flag of ["toolSmoke", "toolResultSmoke", "compatibilitySmoke", "malformedSmoke", "errorSmoke"]) {
        assert.equal(requestsForScope.filter((request) => request.body[flag] === true).length, 2);
        assert.equal(requestsForScope.filter((request) => request.body[flag] === true && request.body.stream === true).length, 1);
      }
    }
    assert.equal(codexSmokeRequests.filter((request) => request.body.scope === "claude-code" && request.body.toolSmoke === true).length, 2);
    assert.equal(codexSmokeRequests.filter((request) => request.body.scope === "opencode" && request.body.toolResultSmoke === true).length, 2);
    assert.equal(codexSmokeRequests.filter((request) => request.body.compatibilitySmoke === true).length, 6);
    assert.equal(codexSmokeRequests.filter((request) => request.body.compatibilitySmoke === true && request.body.stream === true).length, 3);
    assert.equal(codexSmokeRequests.filter((request) => request.body.malformedSmoke === true).length, 6);
    assert.equal(codexSmokeRequests.filter((request) => request.body.malformedSmoke === true && request.body.stream === true).length, 3);
    assert.equal(codexSmokeRequests.filter((request) => request.body.errorSmoke === true).length, 6);
    assert.equal(codexSmokeRequests.filter((request) => request.body.errorSmoke === true && request.body.stream === true).length, 3);
  } finally {
    await gateway.close();
  }
});

test("model gateway protocol matrix can run Codex account proofs without GLM stages", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript(["--endpoint", gateway.endpoint, "--skip-glm", "--codex-model", "gpt-5.4", "--json"]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.protocolProofs.map((proof) => proof.id), [
      "codex_account_responses:gpt-5.4",
      "codex_account_claude_code:gpt-5.4",
      "codex_account_opencode:gpt-5.4",
    ]);
    assert.equal(parsed.stages.length, 1);
    assert.deepEqual(gateway.activeProviders, {});
  } finally {
    await gateway.close();
  }
});

test("model gateway protocol matrix writes JSON and Markdown acceptance reports", async () => {
  const gateway = await startMockGateway();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-protocol-report-"));
  try {
    const reportFile = path.join(root, "acceptance.json");
    const markdownReport = path.join(root, "acceptance.md");
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--skip-glm",
      "--codex-model", "gpt-5.4",
      "--report-file", reportFile,
      "--markdown-report", markdownReport,
      "--json",
    ]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.acceptanceSummary.routeProofs.length, 3);
    assert.equal(parsed.acceptanceSummary.smokeGroups.routeSmokes.total, 3);
    assert.equal(parsed.acceptanceSummary.smokeGroups.routeSmokes.failed, 0);
    assert.ok(parsed.acceptanceSummary.attachmentAndDegradationBoundaries.some((item) => item.status === "path-handoff"));
    const reportJson = JSON.parse(fs.readFileSync(reportFile, "utf8"));
    assert.deepEqual(reportJson.acceptanceSummary.routeProofs.map((proof) => proof.agentScope), ["codex", "claude-code", "opencode"]);
    const markdown = fs.readFileSync(markdownReport, "utf8");
    assert.match(markdown, /Model Gateway Protocol Acceptance Report/);
    assert.match(markdown, /\| Agent scope \| Provider \| Model \| Route \|/);
    assert.match(markdown, /Attachment And Degradation Boundaries/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    await gateway.close();
  }
});

test("model gateway protocol matrix can expand Codex account proofs across multiple models", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript(["--endpoint", gateway.endpoint, "--codex-models", "gpt-5.4,gpt-5.4-mini", "--json"]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.protocolProofs.map((proof) => proof.id), [
      "anthropic_messages",
      "openai_chat_completions",
      "codex_account_responses:gpt-5.4",
      "codex_account_claude_code:gpt-5.4",
      "codex_account_opencode:gpt-5.4",
      "codex_account_responses:gpt-5.4-mini",
      "codex_account_claude_code:gpt-5.4-mini",
      "codex_account_opencode:gpt-5.4-mini",
    ]);
    assert.equal(parsed.stages.length, 4);
    assert.deepEqual(gateway.activeProviders, {});
  } finally {
    await gateway.close();
  }
});

test("model gateway protocol matrix can retry a failed stage and preserve attempt evidence", async () => {
  const gateway = await startMockGateway({ failFirstCodexRouteSmoke: true });
  try {
    const parsed = await runScript(["--endpoint", gateway.endpoint, "--skip-glm", "--codex-model", "gpt-5.4", "--stage-retries", "1", "--json"]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.stages.length, 1);
    assert.equal(parsed.stages[0].ok, true);
    assert.equal(parsed.stages[0].attempt, 2);
    assert.equal(parsed.stages[0].attempts, 2);
    assert.equal(parsed.stages[0].previousAttempts.length, 1);
    assert.equal(parsed.stages[0].previousAttempts[0].ok, false);
    assert.equal(parsed.stages[0].previousAttempts[0].failedSmokes[0].scope, "codex");
    assert.equal(parsed.stages[0].previousAttempts[0].failedSmokes[0].status, 502);
    assert.deepEqual(parsed.protocolProofs.map((proof) => [proof.id, proof.ok]), [
      ["codex_account_responses:gpt-5.4", true],
      ["codex_account_claude_code:gpt-5.4", true],
      ["codex_account_opencode:gpt-5.4", true],
    ]);
    assert.deepEqual(gateway.activeProviders, {});
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
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 16,
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.stages[0].ok, false);
        assert.equal(parsed.stages[0].activeRoutes.expectationFailures[0].code, "model_gateway_endpoint_expectation_failed");
        assert.equal(parsed.stages[1].ok, true);
        assert.equal(parsed.stages[2].ok, true);
        assert.deepEqual(gateway.activeProviders, {});
        return true;
      },
    );
  } finally {
    await gateway.close();
  }
});

test("model gateway protocol matrix bounds slow child stages and restores routes", async () => {
  const gateway = await startMockGateway({ slowSmokeScope: "claude-code", slowSmokeDelayMs: 1_000 });
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--codex-model", "gpt-5.5",
        "--timeout-ms", "250",
        "--stage-timeout-ms", "5000",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 16,
        timeout: 10_000,
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.timeoutMs, 250);
        assert.equal(parsed.stageTimeoutMs, 5000);
        assert.equal(parsed.stages[0].ok, false);
        assert.equal(parsed.stages[0].activeRoutes.routeSmokes[0].status, 0);
        assert.equal(
          parsed.stages[0].activeRoutes.routeSmokes[0].error?.code,
          "model_gateway_active_route_smoke_request_failed",
        );
        assert.equal(parsed.stages[1].ok, true);
        assert.equal(parsed.stages[2].ok, false);
        assert.deepEqual(gateway.activeProviders, {});
        return true;
      },
    );
  } finally {
    await gateway.close();
  }
});

test("model gateway protocol matrix stage watchdog lets the child restore active routes", async () => {
  const gateway = await startMockGateway({ slowSmokeScope: "claude-code", slowSmokeDelayMs: 2_000 });
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--codex-model", "gpt-5.5",
        "--timeout-ms", "5000",
        "--stage-timeout-ms", "500",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 16,
        timeout: 10_000,
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.stageTimeoutMs, 500);
        assert.equal(parsed.stages[0].ok, false);
        assert.equal(parsed.stages[0].error.timeoutMs, 500);
        assert.equal(parsed.stages[1].ok, true);
        assert.equal(parsed.stages[2].ok, false);
        assert.deepEqual(gateway.activeProviders, {});
        return true;
      },
    );
  } finally {
    await gateway.close();
  }
});
