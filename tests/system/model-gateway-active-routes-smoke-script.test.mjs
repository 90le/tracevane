import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const scriptPath = path.join(repoRoot, "scripts/smoke-model-gateway-active-routes.mjs");
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
  const activeProviders = { ...(options.activeProviders || { codex: "old-codex" }) };
  let providerEnabled = options.providerEnabled !== false;
  const smokeAttemptsByScope = {};
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
            enabled: providerEnabled,
            sourceType: "api-key",
            apiFormat: "openai_chat",
            appScopes: options.appScopes || ["codex", "claude-code", "opencode"],
            models: { defaultModel: "glm-5.2", models: [{ id: "glm-5.2" }] },
            endpointProfiles: [
              { id: "coding-chat", enabled: true, apiFormat: "openai_chat" },
              { id: "coding-anthropic", enabled: true, apiFormat: "anthropic_messages" },
            ],
          },
        ],
      });
      return;
    }
    if (req.method === "PUT" && url.pathname === "/api/model-gateway/providers/glm") {
      if (typeof body.provider?.enabled === "boolean") {
        providerEnabled = body.provider.enabled;
        if (!providerEnabled) {
          for (const scope of Object.keys(activeProviders)) {
            if (activeProviders[scope] === "glm") delete activeProviders[scope];
          }
        }
      }
      sendJson(res, 200, { ok: true, provider: { id: "glm", enabled: providerEnabled } });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/model-gateway/active-provider") {
      if (options.ignoreRestoreForScope === body.scope && !body.providerId) {
        sendJson(res, 200, { ok: true, activeProviders });
        return;
      }
      if (body.providerId) activeProviders[body.scope] = body.providerId;
      else delete activeProviders[body.scope];
      sendJson(res, 200, { ok: true, activeProviders });
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/model-gateway/active-route-smoke") {
      smokeAttemptsByScope[body.scope] = (smokeAttemptsByScope[body.scope] || 0) + 1;
      if (options.transientFailScope === body.scope && smokeAttemptsByScope[body.scope] === 1) {
        sendJson(res, 502, {
          ok: false,
          providerId: "glm",
          route: {
            routeId: body.scope === "claude-code" ? "anthropic_messages" : "openai_chat_completions",
            mode: "passthrough",
            endpointProfile: { id: body.scope === "claude-code" ? "coding-anthropic" : "coding-chat" },
            provider: { apiFormat: body.scope === "claude-code" ? "anthropic_messages" : "openai_chat" },
          },
          responsePreview: "{\"error\":{\"code\":\"model_gateway_upstream_failed\",\"message\":\"fetch failed\"}}",
          error: { code: "model_gateway_active_route_smoke_failed", message: "Active route smoke returned HTTP 502." },
        });
        return;
      }
      if (options.failScope && body.scope === options.failScope) {
        sendJson(res, 502, {
          ok: false,
          providerId: "glm",
          route: { routeId: "openai_chat_completions", mode: "passthrough" },
          error: { code: "model_gateway_active_route_smoke_failed", message: "forced failure" },
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        providerId: "glm",
        route: {
          routeId: body.scope === "codex"
            ? "openai_responses"
            : body.scope === "claude-code"
              ? "anthropic_messages"
              : "openai_chat_completions",
          mode: "passthrough",
          endpointProfile: { id: body.scope === "claude-code" ? "coding-anthropic" : "coding-chat" },
          provider: { apiFormat: body.scope === "claude-code" ? "anthropic_messages" : "openai_chat" },
          upstreamUrl: body.scope === "claude-code"
            ? "https://open.bigmodel.cn/api/anthropic/v1/messages"
            : "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
        },
        responsePreview: "GATEWAY_OK",
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
    getProviderEnabled: () => providerEnabled,
    smokeAttemptsByScope,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function makeTempLockDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-active-route-smoke-"));
  return {
    lockDir: path.join(root, "active-route-smoke.lock"),
    cleanup() {
      fs.rmSync(root, { recursive: true, force: true });
    },
  };
}

async function runScript(args, env = {}) {
  const lock = env.TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR ? null : makeTempLockDir();
  try {
    const result = await execFileAsync(process.execPath, [scriptPath, ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        ...(lock ? { TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir } : {}),
        ...env,
      },
      encoding: "utf8",
    });
    return JSON.parse(result.stdout);
  } finally {
    if (lock) lock.cleanup();
  }
}

test("model gateway active route smoke restores active providers after success", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex,claude-code,opencode",
      "--expect-endpoints", "codex=coding-chat,claude-code=coding-anthropic,opencode=coding-chat",
      "--expect-routes", "codex=openai_responses,claude-code=anthropic_messages,opencode=openai_chat_completions",
      "--expect-api-formats", "codex=openai_chat,claude-code=anthropic_messages,opencode=openai_chat",
      "--json",
    ]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.lock?.acquired, true);
    assert.equal(typeof parsed.lock?.lockDir, "string");
    assert.equal(parsed.lock?.attempts >= 1, true);
    assert.deepEqual(parsed.preflightFailures, []);
    assert.deepEqual(parsed.preflightWarnings, []);
    assert.deepEqual(parsed.expectationFailures, []);
    assert.deepEqual(parsed.routeSmokes.map((probe) => [probe.scope, probe.ok, probe.endpointProfile]), [
      ["codex", true, "coding-chat"],
      ["claude-code", true, "coding-anthropic"],
      ["opencode", true, "coding-chat"],
    ]);
    assert.deepEqual(parsed.setupFailures, []);
    assert.deepEqual(parsed.restoreFailures, []);
    assert.deepEqual(parsed.restoreMismatches, []);
    assert.deepEqual(parsed.restoredActiveProviders, { codex: "old-codex" });
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
    assert.equal(gateway.requests.filter((request) => request.path === "/api/model-gateway/active-provider").length, 6);
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke waits on a lock before mutating active providers", async () => {
  const gateway = await startMockGateway();
  const lock = makeTempLockDir();
  try {
    fs.mkdirSync(lock.lockDir, { recursive: true });
    fs.writeFileSync(path.join(lock.lockDir, "owner.json"), `${JSON.stringify({
      pid: 12345,
      createdAt: new Date().toISOString(),
      script: "existing-smoke.mjs",
      lockDir: lock.lockDir,
    })}\n`);
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--provider", "glm",
        "--model", "glm-5.2",
        "--scopes", "codex",
        "--lock-timeout-ms", "0",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
          TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
        },
        encoding: "utf8",
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.error?.code, "model_gateway_active_route_smoke_lock_timeout");
        assert.equal(parsed.lock?.acquired, false);
        assert.equal(parsed.lock?.lockDir, lock.lockDir);
        assert.match(parsed.lock?.ownerPreview || "", /existing-smoke\.mjs/);
        assert.deepEqual(parsed.routeSmokes, []);
        assert.deepEqual(parsed.setupFailures, []);
        assert.deepEqual(parsed.restoreFailures, []);
        assert.equal(parsed.restoredActiveProviders, null);
        return true;
      },
    );
    assert.equal(gateway.requests.length, 0);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
  } finally {
    lock.cleanup();
    await gateway.close();
  }
});

test("model gateway active route smoke retries transient fetch failures", async () => {
  const gateway = await startMockGateway({ transientFailScope: "claude-code" });
  try {
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "claude-code",
      "--expect-endpoints", "claude-code=coding-anthropic",
      "--expect-routes", "claude-code=anthropic_messages",
      "--expect-api-formats", "claude-code=anthropic_messages",
      "--json",
    ]);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.routeSmokes.length, 1);
    assert.equal(parsed.routeSmokes[0].scope, "claude-code");
    assert.equal(parsed.routeSmokes[0].ok, true);
    assert.equal(parsed.routeSmokes[0].attempts, 2);
    assert.equal(gateway.smokeAttemptsByScope["claude-code"], 2);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke reports disabled provider without mutating active providers", async () => {
  const gateway = await startMockGateway({ providerEnabled: false });
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--provider", "glm",
        "--model", "glm-5.2",
        "--scopes", "codex",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.deepEqual(parsed.preflightFailures, [
          {
            code: "model_gateway_provider_disabled",
            message: "Provider 'glm' is disabled; pass --temporary-enable to enable it only for this smoke.",
          },
        ]);
        assert.deepEqual(parsed.routeSmokes, []);
        assert.deepEqual(parsed.restoredActiveProviders, { codex: "old-codex" });
        return true;
      },
    );
    assert.equal(gateway.requests.filter((request) => request.path === "/api/model-gateway/active-provider").length, 0);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke can temporarily enable a provider and restore it", async () => {
  const gateway = await startMockGateway({ providerEnabled: false });
  try {
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex,claude-code",
      "--temporary-enable",
      "--expect-endpoints", "codex=coding-chat,claude-code=coding-anthropic",
      "--json",
    ]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.preflightFailures, []);
    assert.equal(parsed.temporaryEnable.attempted, true);
    assert.equal(parsed.temporaryEnable.originalEnabled, false);
    assert.equal(parsed.temporaryEnable.enabled, true);
    assert.equal(parsed.temporaryEnable.restoredEnabled, false);
    assert.deepEqual(parsed.preflightWarnings.map((warning) => warning.code), [
      "model_gateway_provider_temporarily_enabled",
    ]);
    assert.deepEqual(parsed.expectationFailures, []);
    assert.deepEqual(parsed.restoredActiveProviders, { codex: "old-codex" });
    assert.equal(gateway.getProviderEnabled(), false);
    assert.deepEqual(gateway.requests
      .filter((request) => request.method === "PUT" && request.path === "/api/model-gateway/providers/glm")
      .map((request) => request.body.provider.enabled), [true, false]);
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke reports scope mismatch before active provider mutation", async () => {
  const gateway = await startMockGateway({ appScopes: ["codex"] });
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--provider", "glm",
        "--model", "glm-5.2",
        "--scopes", "codex,opencode",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.deepEqual(parsed.preflightFailures, [
          {
            code: "model_gateway_provider_scope_mismatch",
            scope: "opencode",
            message: "Provider 'glm' is not available for opencode.",
          },
        ]);
        assert.deepEqual(parsed.routeSmokes, []);
        assert.deepEqual(parsed.restoredActiveProviders, { codex: "old-codex" });
        return true;
      },
    );
    assert.equal(gateway.requests.filter((request) => request.path === "/api/model-gateway/active-provider").length, 0);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke restores active providers after failure", async () => {
  const gateway = await startMockGateway({ failScope: "opencode" });
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--provider", "glm",
        "--model", "glm-5.2",
        "--scopes", "codex,opencode",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.routeSmokes.find((probe) => probe.scope === "opencode")?.ok, false);
        assert.deepEqual(parsed.restoreFailures, []);
        assert.deepEqual(parsed.restoreMismatches, []);
        assert.deepEqual(parsed.restoredActiveProviders, { codex: "old-codex" });
        return true;
      },
    );
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke fails when restore response does not restore state", async () => {
  const gateway = await startMockGateway({ ignoreRestoreForScope: "opencode" });
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--provider", "glm",
        "--model", "glm-5.2",
        "--scopes", "opencode",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
        },
        encoding: "utf8",
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.routeSmokes[0]?.ok, true);
        assert.deepEqual(parsed.restoreFailures, []);
        assert.deepEqual(parsed.restoreMismatches, [
          { scope: "opencode", expected: "", actual: "glm" },
        ]);
        assert.deepEqual(parsed.restoredActiveProviders, { codex: "old-codex", opencode: "glm" });
        return true;
      },
    );
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke requires an explicit model", async () => {
  await assert.rejects(
    execFileAsync(process.execPath, [
      scriptPath,
      "--provider", "glm",
      "--json",
    ], {
      cwd: repoRoot,
      env: {
        ...process.env,
        TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
      },
      encoding: "utf8",
    }),
    (error) => {
      assert.match(error.stderr, /--model is required/);
      assert.equal(error.stdout, "");
      return true;
    },
  );
});
