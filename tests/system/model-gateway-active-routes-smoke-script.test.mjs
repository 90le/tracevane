import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor(predicate, timeoutMs = 5_000) {
  const startedAt = Date.now();
  for (;;) {
    if (predicate()) return;
    if (Date.now() - startedAt >= timeoutMs) throw new Error("Timed out waiting for condition");
    await sleep(25);
  }
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
      if (options.slowSmokeScope === body.scope) {
        await sleep(options.slowSmokeDelayMs || 1_000);
      }
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

function endpointMarkerSuffix(endpoint) {
  return crypto.createHash("sha256").update(String(endpoint || "").replace(/\/+$/g, "")).digest("hex").slice(0, 12);
}

function markerPathForEndpoint(baseMarkerPath, endpoint) {
  const parsed = path.parse(baseMarkerPath);
  return path.join(parsed.dir, `${parsed.name}.${endpointMarkerSuffix(endpoint)}${parsed.ext || ".json"}`);
}

function markerFilesForLock(lock) {
  try {
    return fs.readdirSync(path.dirname(lock.markerPath))
      .filter((item) => item.startsWith("active-route-smoke") && item.includes("marker") && item.endsWith(".json"));
  } catch {
    return [];
  }
}

function makeTempLockDir() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tracevane-active-route-smoke-"));
  return {
    lockDir: path.join(root, "active-route-smoke.lock"),
    markerPath: path.join(root, "active-route-smoke.marker.json"),
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
        ...(lock ? { TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_MARKER_PATH: lock.markerPath } : {}),
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

test("model gateway active route smoke can run compatibility cleanup probes", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex,claude-code,opencode",
      "--compatibility-smoke",
      "--json",
    ]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.compatibilitySmokes.map((probe) => [probe.scope, probe.ok]), [
      ["codex", true],
      ["claude-code", true],
      ["opencode", true],
    ]);
    const compatibilityRequests = gateway.requests
      .filter((request) => request.path === "/api/model-gateway/active-route-smoke" && request.body.compatibilitySmoke === true);
    assert.deepEqual(compatibilityRequests.map((request) => request.body.scope), ["codex", "claude-code", "opencode"]);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke can run malformed tool history probes", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex,claude-code,opencode",
      "--malformed-smoke",
      "--stream-malformed-smoke",
      "--json",
    ]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.malformedSmokes.map((probe) => [probe.scope, probe.ok]), [
      ["codex", true],
      ["claude-code", true],
      ["opencode", true],
    ]);
    assert.deepEqual(parsed.streamMalformedSmokes.map((probe) => [probe.scope, probe.ok]), [
      ["codex", true],
      ["claude-code", true],
      ["opencode", true],
    ]);
    const malformedRequests = gateway.requests
      .filter((request) => request.path === "/api/model-gateway/active-route-smoke" && request.body.malformedSmoke === true);
    assert.deepEqual(malformedRequests.map((request) => [request.body.scope, request.body.stream === true]), [
      ["codex", false],
      ["claude-code", false],
      ["opencode", false],
      ["codex", true],
      ["claude-code", true],
      ["opencode", true],
    ]);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
  } finally {
    await gateway.close();
  }
});

test("model gateway active route smoke can run structured error probes", async () => {
  const gateway = await startMockGateway();
  try {
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex,claude-code,opencode",
      "--error-smoke",
      "--stream-error-smoke",
      "--json",
    ]);
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.errorSmokes.map((probe) => [probe.scope, probe.ok]), [
      ["codex", true],
      ["claude-code", true],
      ["opencode", true],
    ]);
    assert.deepEqual(parsed.streamErrorSmokes.map((probe) => [probe.scope, probe.ok]), [
      ["codex", true],
      ["claude-code", true],
      ["opencode", true],
    ]);
    const errorRequests = gateway.requests
      .filter((request) => request.path === "/api/model-gateway/active-route-smoke" && request.body.errorSmoke === true);
    assert.deepEqual(errorRequests.map((request) => [request.body.scope, request.body.stream === true]), [
      ["codex", false],
      ["claude-code", false],
      ["opencode", false],
      ["codex", true],
      ["claude-code", true],
      ["opencode", true],
    ]);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
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
      pid: process.pid,
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

test("model gateway active route smoke removes a fresh lock owned by a dead pid", async () => {
  const gateway = await startMockGateway();
  const lock = makeTempLockDir();
  try {
    fs.mkdirSync(lock.lockDir, { recursive: true });
    fs.writeFileSync(path.join(lock.lockDir, "owner.json"), `${JSON.stringify({
      pid: 99999999,
      createdAt: new Date().toISOString(),
      script: "dead-smoke.mjs",
      lockDir: lock.lockDir,
    })}\n`);
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex",
      "--lock-timeout-ms", "0",
      "--json",
    ], {
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.lock?.acquired, true);
    assert.equal(parsed.lock?.attempts >= 2, true);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
    assert.equal(fs.existsSync(lock.lockDir), false);
  } finally {
    lock.cleanup();
    await gateway.close();
  }
});

test("model gateway active route smoke restores stale marker residue from a dead owner", async () => {
  const gateway = await startMockGateway({ activeProviders: { codex: "old-codex", opencode: "glm" } });
  const lock = makeTempLockDir();
  const markerPath = markerPathForEndpoint(lock.markerPath, gateway.endpoint);
  try {
    fs.mkdirSync(path.dirname(lock.markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify({
      pid: 99999999,
      createdAt: new Date().toISOString(),
      endpoint: gateway.endpoint,
      providerId: "glm",
      scopes: ["opencode"],
      originalActiveProviders: { codex: "old-codex" },
      script: "dead-smoke.mjs",
    })}\n`);
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex",
      "--json",
    ], {
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_MARKER_PATH: lock.markerPath,
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.staleMarkerRecovery?.restoredScopes, [
      { scope: "opencode", original: "" },
    ]);
    assert.deepEqual(parsed.staleMarkerRecovery?.failures, []);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
    assert.equal(fs.existsSync(markerPath), false);
  } finally {
    lock.cleanup();
    await gateway.close();
  }
});

test("model gateway active route smoke does not overwrite active providers changed after a stale marker", async () => {
  const gateway = await startMockGateway({ activeProviders: { codex: "old-codex", opencode: "manual-provider" } });
  const lock = makeTempLockDir();
  const markerPath = markerPathForEndpoint(lock.markerPath, gateway.endpoint);
  try {
    fs.mkdirSync(path.dirname(lock.markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify({
      pid: 99999999,
      createdAt: new Date().toISOString(),
      endpoint: gateway.endpoint,
      providerId: "glm",
      scopes: ["opencode"],
      originalActiveProviders: { codex: "old-codex" },
      script: "dead-smoke.mjs",
    })}\n`);
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex",
      "--json",
    ], {
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_MARKER_PATH: lock.markerPath,
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.staleMarkerRecovery?.restoredScopes, []);
    assert.deepEqual(parsed.staleMarkerRecovery?.skippedScopes, [
      { scope: "opencode", current: "manual-provider", original: "" },
    ]);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex", opencode: "manual-provider" });
    assert.equal(fs.existsSync(markerPath), false);
  } finally {
    lock.cleanup();
    await gateway.close();
  }
});

test("model gateway active route smoke ignores stale markers from a different endpoint", async () => {
  const gateway = await startMockGateway({ activeProviders: { codex: "old-codex", opencode: "glm" } });
  const lock = makeTempLockDir();
  const oldEndpoint = "http://127.0.0.1:9";
  const oldMarkerPath = markerPathForEndpoint(lock.markerPath, oldEndpoint);
  const currentMarkerPath = markerPathForEndpoint(lock.markerPath, gateway.endpoint);
  try {
    fs.mkdirSync(path.dirname(lock.markerPath), { recursive: true });
    fs.writeFileSync(oldMarkerPath, `${JSON.stringify({
      pid: 99999999,
      createdAt: new Date().toISOString(),
      endpoint: oldEndpoint,
      providerId: "glm",
      scopes: ["opencode"],
      originalActiveProviders: { codex: "old-codex" },
      script: "other-endpoint-smoke.mjs",
    })}\n`);
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex",
      "--json",
    ], {
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_MARKER_PATH: lock.markerPath,
    });
    assert.equal(parsed.ok, true);
    assert.equal(parsed.staleMarkerRecovery, null);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex", opencode: "glm" });
    assert.equal(fs.existsSync(oldMarkerPath), true);
    assert.equal(fs.existsSync(currentMarkerPath), false);
    assert.deepEqual(markerFilesForLock(lock), [path.basename(oldMarkerPath)]);
  } finally {
    lock.cleanup();
    await gateway.close();
  }
});

test("model gateway active route smoke restores stale temporary-enable provider residue", async () => {
  const gateway = await startMockGateway({ activeProviders: { codex: "old-codex", opencode: "glm" } });
  const lock = makeTempLockDir();
  const markerPath = markerPathForEndpoint(lock.markerPath, gateway.endpoint);
  try {
    fs.mkdirSync(path.dirname(lock.markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify({
      pid: 99999999,
      createdAt: new Date().toISOString(),
      endpoint: gateway.endpoint,
      providerId: "glm",
      scopes: ["opencode"],
      originalActiveProviders: { codex: "old-codex" },
      temporaryEnable: {
        requested: true,
        originalEnabled: false,
        applied: true,
      },
      script: "dead-smoke.mjs",
    })}\n`);
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex",
      "--temporary-enable",
      "--json",
    ], {
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_MARKER_PATH: lock.markerPath,
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.staleMarkerRecovery?.restoredScopes, [
      { scope: "opencode", original: "" },
    ]);
    assert.equal(parsed.staleMarkerRecovery?.temporaryEnable.restoredEnabled, false);
    assert.equal(parsed.temporaryEnable.attempted, true);
    assert.equal(parsed.temporaryEnable.restoredEnabled, false);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
    assert.equal(gateway.getProviderEnabled(), false);
    assert.equal(fs.existsSync(markerPath), false);
  } finally {
    lock.cleanup();
    await gateway.close();
  }
});

test("model gateway active route smoke skips stale temporary-enable disable when provider remains active", async () => {
  const gateway = await startMockGateway({
    activeProviders: { codex: "old-codex", opencode: "glm", openclaw: "glm" },
  });
  const lock = makeTempLockDir();
  const markerPath = markerPathForEndpoint(lock.markerPath, gateway.endpoint);
  try {
    fs.mkdirSync(path.dirname(lock.markerPath), { recursive: true });
    fs.writeFileSync(markerPath, `${JSON.stringify({
      pid: 99999999,
      createdAt: new Date().toISOString(),
      endpoint: gateway.endpoint,
      providerId: "glm",
      scopes: ["opencode"],
      originalActiveProviders: { codex: "old-codex", openclaw: "glm" },
      temporaryEnable: {
        requested: true,
        originalEnabled: false,
        applied: true,
      },
      script: "dead-smoke.mjs",
    })}\n`);
    const parsed = await runScript([
      "--endpoint", gateway.endpoint,
      "--provider", "glm",
      "--model", "glm-5.2",
      "--scopes", "codex",
      "--json",
    ], {
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_MARKER_PATH: lock.markerPath,
    });
    assert.equal(parsed.ok, true);
    assert.deepEqual(parsed.staleMarkerRecovery?.restoredScopes, [
      { scope: "opencode", original: "" },
    ]);
    assert.deepEqual(parsed.staleMarkerRecovery?.temporaryEnable.skipped, {
      reason: "provider-still-active",
      activeScopes: ["openclaw"],
    });
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex", openclaw: "glm" });
    assert.equal(gateway.getProviderEnabled(), true);
    assert.equal(fs.existsSync(markerPath), false);
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

test("model gateway active route smoke times out slow probes and still restores active providers", async () => {
  const gateway = await startMockGateway({ slowSmokeScope: "opencode", slowSmokeDelayMs: 1_000 });
  const lock = makeTempLockDir();
  try {
    await assert.rejects(
      execFileAsync(process.execPath, [
        scriptPath,
        "--endpoint", gateway.endpoint,
        "--provider", "glm",
        "--model", "glm-5.2",
        "--scopes", "opencode",
        "--timeout-ms", "250",
        "--smoke-retries", "0",
        "--json",
      ], {
        cwd: repoRoot,
        env: {
          ...process.env,
          TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
          TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
        },
        encoding: "utf8",
        timeout: 5_000,
      }),
      (error) => {
        const parsed = JSON.parse(error.stdout);
        assert.equal(parsed.ok, false);
        assert.equal(parsed.routeSmokes.length, 1);
        assert.equal(parsed.routeSmokes[0].scope, "opencode");
        assert.equal(parsed.routeSmokes[0].status, 0);
        assert.equal(parsed.routeSmokes[0].error?.code, "model_gateway_active_route_smoke_request_failed");
        assert.match(parsed.routeSmokes[0].error?.message || "", /aborted|timeout/i);
        assert.deepEqual(parsed.restoreFailures, []);
        assert.deepEqual(parsed.restoreMismatches, []);
        assert.deepEqual(parsed.restoredActiveProviders, { codex: "old-codex" });
        return true;
      },
    );
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
    assert.equal(fs.existsSync(lock.lockDir), false);
    assert.deepEqual(markerFilesForLock(lock), []);
  } finally {
    lock.cleanup();
    await gateway.close();
  }
});

test("model gateway active route smoke restores active providers and lock on SIGTERM", async () => {
  const gateway = await startMockGateway({ slowSmokeScope: "opencode", slowSmokeDelayMs: 2_000 });
  const lock = makeTempLockDir();
  const child = spawn(process.execPath, [
    scriptPath,
    "--endpoint", gateway.endpoint,
    "--provider", "glm",
    "--model", "glm-5.2",
    "--scopes", "opencode",
    "--timeout-ms", "5000",
    "--json",
  ], {
    cwd: repoRoot,
    env: {
      ...process.env,
      TRACEVANE_GATEWAY_CLIENT_KEY: "test-gateway-key",
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR: lock.lockDir,
      TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_CONTROL: "stdio",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
  try {
    await waitFor(() => gateway.requests.some((request) => request.path === "/api/model-gateway/active-route-smoke"));
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex", opencode: "glm" });
    child.stdin.write(`${JSON.stringify({
      type: "tracevane-active-route-smoke-stop",
      signal: "SIGTERM",
    })}\n`);
    const exit = await new Promise((resolve) => child.once("exit", (code, signal) => resolve({ code, signal })));
    assert.equal(exit.code, 143, Buffer.concat(stderr).toString("utf8"));
    assert.equal(exit.signal, null);
    await waitFor(() => gateway.activeProviders.opencode === undefined);
    assert.deepEqual(gateway.activeProviders, { codex: "old-codex" });
    assert.equal(fs.existsSync(lock.lockDir), false);
    assert.deepEqual(markerFilesForLock(lock), []);
    assert.equal(Buffer.concat(stdout).toString("utf8"), "");
  } finally {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    lock.cleanup();
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
