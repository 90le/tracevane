#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "http://127.0.0.1:18796";
const DEFAULT_SCOPES = ["codex", "claude-code", "opencode"];
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_INPUT = "Reply with GATEWAY_OK only.";
const DEFAULT_LOCK_TIMEOUT_MS = 300_000;
const DEFAULT_LOCK_STALE_MS = 30 * 60_000;
const DEFAULT_SMOKE_RETRIES = 1;
const MAX_ACTIVE_ROUTE_SMOKE_REQUEST_GRACE_MS = 5_000;
const SIGNAL_CLEANUP_TIMEOUT_MS = 5_000;
const SIGNAL_EXIT_CODES = {
  SIGHUP: 129,
  SIGINT: 130,
  SIGTERM: 143,
};

function parseArgs(argv) {
  const options = {
    endpoint: process.env.TRACEVANE_GATEWAY_ENDPOINT || process.env.TRACEVANE_GATEWAY_ENDPOINT || DEFAULT_ENDPOINT,
    providerId: "",
    model: "",
    scopes: DEFAULT_SCOPES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    input: DEFAULT_INPUT,
    temporaryEnable: false,
    lockTimeoutMs: DEFAULT_LOCK_TIMEOUT_MS,
    smokeRetries: DEFAULT_SMOKE_RETRIES,
    expectEndpoints: {},
    expectRoutes: {},
    expectApiFormats: {},
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--endpoint") options.endpoint = argv[++index] || options.endpoint;
    else if (arg.startsWith("--endpoint=")) options.endpoint = arg.slice("--endpoint=".length);
    else if (arg === "--provider") options.providerId = argv[++index] || options.providerId;
    else if (arg.startsWith("--provider=")) options.providerId = arg.slice("--provider=".length);
    else if (arg === "--model") options.model = argv[++index] || options.model;
    else if (arg.startsWith("--model=")) options.model = arg.slice("--model=".length);
    else if (arg === "--scopes") options.scopes = parseCsv(argv[++index] || "");
    else if (arg.startsWith("--scopes=")) options.scopes = parseCsv(arg.slice("--scopes=".length));
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--input") options.input = argv[++index] || options.input;
    else if (arg.startsWith("--input=")) options.input = arg.slice("--input=".length);
    else if (arg === "--temporary-enable") options.temporaryEnable = true;
    else if (arg === "--lock-timeout-ms") options.lockTimeoutMs = nonNegativeInt(argv[++index], DEFAULT_LOCK_TIMEOUT_MS);
    else if (arg.startsWith("--lock-timeout-ms=")) options.lockTimeoutMs = nonNegativeInt(arg.slice("--lock-timeout-ms=".length), DEFAULT_LOCK_TIMEOUT_MS);
    else if (arg === "--smoke-retries") options.smokeRetries = nonNegativeInt(argv[++index], DEFAULT_SMOKE_RETRIES);
    else if (arg.startsWith("--smoke-retries=")) options.smokeRetries = nonNegativeInt(arg.slice("--smoke-retries=".length), DEFAULT_SMOKE_RETRIES);
    else if (arg === "--expect-endpoints") options.expectEndpoints = parseScopeMap(argv[++index] || "");
    else if (arg.startsWith("--expect-endpoints=")) options.expectEndpoints = parseScopeMap(arg.slice("--expect-endpoints=".length));
    else if (arg === "--expect-routes") options.expectRoutes = parseScopeMap(argv[++index] || "");
    else if (arg.startsWith("--expect-routes=")) options.expectRoutes = parseScopeMap(arg.slice("--expect-routes=".length));
    else if (arg === "--expect-api-formats") options.expectApiFormats = parseScopeMap(argv[++index] || "");
    else if (arg.startsWith("--expect-api-formats=")) options.expectApiFormats = parseScopeMap(arg.slice("--expect-api-formats=".length));
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.endpoint = options.endpoint.replace(/\/+$/g, "");
  options.providerId = options.providerId.trim();
  options.model = options.model.trim();
  options.scopes = options.scopes.length ? Array.from(new Set(options.scopes)) : DEFAULT_SCOPES;
  if (!options.providerId) throw new Error("--provider is required.");
  if (!options.model) throw new Error("--model is required.");
  return options;
}

function parseCsv(value) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function parseScopeMap(value) {
  const entries = {};
  for (const item of parseCsv(value)) {
    const [scope, ...rest] = item.split("=");
    const key = (scope || "").trim();
    const expected = rest.join("=").trim();
    if (key && expected) entries[key] = expected;
  }
  return entries;
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function nonNegativeInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-model-gateway-active-routes.mjs --provider <id> --model <id> [options]

Temporarily makes a provider active for selected Gateway app scopes, runs
active-route-smoke for each scope, then restores the previous active provider
map. This is intended for real daemon provider checks without leaving routing
configuration changed.

Options:
  --endpoint <url>   default: ${DEFAULT_ENDPOINT}
  --provider <id>    provider to temporarily activate
  --model <id>       model passed to active-route-smoke
  --scopes <csv>     default: ${DEFAULT_SCOPES.join(",")}
  --timeout-ms <n>   active-route-smoke timeout
  --input <text>     prompt sent to active-route-smoke
  --temporary-enable enable a disabled provider for the smoke, then restore it
  --lock-timeout-ms <n>
                    wait this long for the local active-route smoke lock
  --smoke-retries <n>
                    retry transient active-route smoke fetch failures; default: ${DEFAULT_SMOKE_RETRIES}
  --expect-endpoints <scope=id,...>
                    fail when a scope uses a different endpoint profile
  --expect-routes <scope=id,...>
                    fail when a scope uses a different route id
  --expect-api-formats <scope=id,...>
                    fail when a scope uses a different upstream API format
  --json             machine-readable output
  -h, --help         Show this help

Auth:
  TRACEVANE_GATEWAY_CLIENT_KEY is used when present. If omitted, the script reads
  ~/.openclaw/tracevane/model-gateway/secrets.json locally.`);
}

function readGatewayKey() {
  const envKey = process.env.TRACEVANE_GATEWAY_CLIENT_KEY || process.env.TRACEVANE_GATEWAY_CLIENT_KEY || process.env.MODEL_GATEWAY_CLIENT_KEY;
  if (envKey?.trim()) return envKey.trim();
  const filePath = path.join(os.homedir(), ".openclaw/tracevane/model-gateway/secrets.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const value = parsed?.secrets?.["gateway:client-api-key"]?.value;
    return typeof value === "string" && value.trim() ? value.trim() : "";
  } catch {
    return "";
  }
}

function headers(key) {
  return {
    "content-type": "application/json",
    ...(key ? { authorization: `Bearer ${key}` } : {}),
  };
}

async function requestJson(endpoint, key, pathName, options = {}) {
  const response = await fetch(`${endpoint}${pathName}`, {
    ...options,
    headers: {
      ...headers(key),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeoutMs || DEFAULT_TIMEOUT_MS),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return { status: response.status, body, text };
}

function activeRouteSmokeRequestTimeoutMs(timeoutMs) {
  const base = positiveInt(timeoutMs, DEFAULT_TIMEOUT_MS);
  const proportionalGraceMs = Math.max(100, Math.ceil(base * 0.1));
  return base + Math.min(MAX_ACTIVE_ROUTE_SMOKE_REQUEST_GRACE_MS, proportionalGraceMs);
}

async function fetchProviders(options, key) {
  const result = await requestJson(options.endpoint, key, "/api/model-gateway/providers", {
    method: "GET",
    timeoutMs: options.timeoutMs,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Provider list failed with HTTP ${result.status}: ${preview(result.text)}`);
  }
  return result.body || {};
}

function providerSummary(providersBody, providerId) {
  const provider = (providersBody.providers || []).find((item) => item?.id === providerId) || null;
  if (!provider) return null;
  const modelEntries = Array.isArray(provider.models?.models) ? provider.models.models : [];
  return {
    id: provider.id,
    name: provider.name || provider.id,
    enabled: provider.enabled !== false,
    sourceType: provider.sourceType || null,
    apiFormat: provider.apiFormat || null,
    defaultModel: provider.models?.defaultModel || null,
    models: modelEntries.map((model) => ({
      id: model?.id || "",
      aliases: Array.isArray(model?.aliases) ? model.aliases : [],
    })).filter((model) => model.id),
    appScopes: Array.isArray(provider.appScopes) ? provider.appScopes : [],
    endpointProfiles: Array.isArray(provider.endpointProfiles)
      ? provider.endpointProfiles.map((endpoint) => ({
        id: endpoint.id,
        apiFormat: endpoint.apiFormat || null,
        enabled: endpoint.enabled !== false,
      }))
      : [],
  };
}

function createResult(options, provider, originalActiveProviders) {
  return {
    ok: false,
    endpoint: options.endpoint,
    provider,
    providerId: options.providerId,
    model: options.model || provider?.defaultModel || null,
    scopes: options.scopes,
    checkedAt: new Date().toISOString(),
    originalActiveProviders,
    temporaryEnable: {
      requested: Boolean(options.temporaryEnable),
      attempted: false,
      originalEnabled: provider ? Boolean(provider.enabled) : null,
      enabled: provider ? Boolean(provider.enabled) : false,
      restoredEnabled: null,
      error: null,
    },
    preflightFailures: [],
    preflightWarnings: [],
    routeSmokes: [],
    expectationFailures: [],
    setupFailures: [],
    restoredActiveProviders: null,
    restoreFailures: [],
    restoreMismatches: [],
    staleMarkerRecovery: null,
    lock: null,
  };
}

function activeRouteSmokeLockDir() {
  const envLockDir = process.env.TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_LOCK_DIR;
  if (envLockDir?.trim()) return path.resolve(envLockDir.trim());
  return path.join(os.homedir(), ".openclaw/tracevane/model-gateway/active-route-smoke.lock");
}

function activeRouteSmokeMarkerPath() {
  const envMarkerPath = process.env.TRACEVANE_GATEWAY_ACTIVE_ROUTE_SMOKE_MARKER_PATH;
  if (envMarkerPath?.trim()) return path.resolve(envMarkerPath.trim());
  return path.join(path.dirname(activeRouteSmokeLockDir()), "active-route-smoke.marker.json");
}

function lockMetadata(lockDir) {
  return {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    script: path.basename(process.argv[1] || "smoke-model-gateway-active-routes.mjs"),
    lockDir,
  };
}

function removeLockDir(lockDir) {
  try {
    fs.rmSync(lockDir, { recursive: true, force: true });
  } catch {
    // Best effort; a later mkdir will decide whether the lock is still held.
  }
}

function removeMarkerFile(markerPath) {
  try {
    fs.rmSync(markerPath, { force: true });
  } catch {
    // Best effort; recovery treats unreadable markers as absent.
  }
}

function readLockCreatedAtMs(lockDir) {
  try {
    const raw = fs.readFileSync(path.join(lockDir, "owner.json"), "utf8");
    const parsed = JSON.parse(raw);
    const value = Date.parse(parsed.createdAt || "");
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function readLockOwnerMetadata(lockDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDir, "owner.json"), "utf8"));
  } catch {
    return null;
  }
}

function readActiveRouteSmokeMarker(markerPath = activeRouteSmokeMarkerPath()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    if (!Array.isArray(parsed.scopes)) return null;
    if (!parsed.providerId || typeof parsed.providerId !== "string") return null;
    if (!parsed.originalActiveProviders || typeof parsed.originalActiveProviders !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
}

function processPidIsAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === "ESRCH") return false;
    return true;
  }
}

function writeActiveRouteSmokeMarker(options, originalActiveProviders) {
  const markerPath = activeRouteSmokeMarkerPath();
  const marker = {
    pid: process.pid,
    createdAt: new Date().toISOString(),
    endpoint: options.endpoint,
    providerId: options.providerId,
    scopes: options.scopes,
    originalActiveProviders,
    script: path.basename(process.argv[1] || "smoke-model-gateway-active-routes.mjs"),
  };
  fs.mkdirSync(path.dirname(markerPath), { recursive: true });
  fs.writeFileSync(markerPath, `${JSON.stringify(marker, null, 2)}\n`, { mode: 0o600 });
  return markerPath;
}

async function recoverStaleActiveRouteSmokeMarker(options, key) {
  const markerPath = activeRouteSmokeMarkerPath();
  const marker = readActiveRouteSmokeMarker(markerPath);
  if (!marker) return null;
  if (processPidIsAlive(Number(marker.pid))) return { recovered: false, markerPath, reason: "owner-alive" };
  const recovery = {
    recovered: false,
    markerPath,
    providerId: marker.providerId,
    scopes: marker.scopes,
    restoredScopes: [],
    skippedScopes: [],
    failures: [],
  };
  try {
    const providers = await fetchProviders(options, key);
    const activeProviders = providers.activeProviders || {};
    for (const scope of marker.scopes) {
      const current = activeProviderValue(activeProviders, scope);
      const original = activeProviderValue(marker.originalActiveProviders, scope);
      if (current !== marker.providerId) {
        recovery.skippedScopes.push({ scope, current, original });
        continue;
      }
      try {
        await setActiveProvider(options, key, scope, original);
        recovery.restoredScopes.push({ scope, original });
      } catch (error) {
        recovery.failures.push({
          scope,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    recovery.recovered = recovery.failures.length === 0 && recovery.restoredScopes.length > 0;
  } finally {
    if (recovery.failures.length === 0) removeMarkerFile(markerPath);
  }
  return recovery;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireActiveRouteSmokeLock(options) {
  const lockDir = activeRouteSmokeLockDir();
  const startedAt = Date.now();
  let attempts = 0;
  for (;;) {
    attempts += 1;
    try {
      fs.mkdirSync(lockDir, { recursive: false });
      const metadata = lockMetadata(lockDir);
      fs.writeFileSync(path.join(lockDir, "owner.json"), `${JSON.stringify(metadata, null, 2)}\n`, { mode: 0o600 });
      return {
        acquired: true,
        lockDir,
        attempts,
        waitedMs: Date.now() - startedAt,
        release() {
          removeLockDir(lockDir);
        },
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      const createdAtMs = readLockCreatedAtMs(lockDir);
      if (createdAtMs !== null && Date.now() - createdAtMs > DEFAULT_LOCK_STALE_MS) {
        removeLockDir(lockDir);
        continue;
      }
      const owner = readLockOwnerMetadata(lockDir);
      if (owner && processPidIsAlive(Number(owner.pid)) === false) {
        removeLockDir(lockDir);
        continue;
      }
      if (Date.now() - startedAt >= options.lockTimeoutMs) {
        const ownerPreview = (() => {
          try {
            return fs.readFileSync(path.join(lockDir, "owner.json"), "utf8").slice(0, 500);
          } catch {
            return "";
          }
        })();
        const message = `Timed out waiting for Model Gateway active-route smoke lock at ${lockDir}.`;
        const timeoutError = new Error(message);
        timeoutError.code = "model_gateway_active_route_smoke_lock_timeout";
        timeoutError.lock = {
          acquired: false,
          lockDir,
          attempts,
          waitedMs: Date.now() - startedAt,
          ownerPreview,
        };
        throw timeoutError;
      }
      await sleep(Math.min(250, Math.max(25, options.lockTimeoutMs - (Date.now() - startedAt))));
    }
  }
}

function addProviderPreflight(result, options, provider) {
  if (!provider) {
    result.preflightFailures.push({
      code: "model_gateway_provider_not_found",
      message: `Provider '${options.providerId}' was not found.`,
    });
    return;
  }
  if (!provider.enabled) {
    if (options.temporaryEnable) {
      result.preflightWarnings.push({
        code: "model_gateway_provider_temporarily_enabled",
        message: `Provider '${provider.id}' is disabled and will be temporarily enabled for this smoke.`,
      });
    } else {
      result.preflightFailures.push({
        code: "model_gateway_provider_disabled",
        message: `Provider '${provider.id}' is disabled; pass --temporary-enable to enable it only for this smoke.`,
      });
    }
  }
  const appScopes = new Set(provider.appScopes || []);
  for (const scope of options.scopes) {
    if (!appScopes.has(scope)) {
      result.preflightFailures.push({
        code: "model_gateway_provider_scope_mismatch",
        scope,
        message: `Provider '${provider.id}' is not available for ${scope}.`,
      });
    }
  }
  const modelIds = new Set();
  for (const model of provider.models || []) {
    if (model.id) modelIds.add(model.id);
    for (const alias of model.aliases || []) modelIds.add(alias);
  }
  if (provider.defaultModel) modelIds.add(provider.defaultModel);
  if (options.model && modelIds.size && !modelIds.has(options.model)) {
    result.preflightWarnings.push({
      code: "model_gateway_model_not_in_catalog",
      message: `Model '${options.model}' is not listed in provider '${provider.id}' catalog; smoke will still try it when other preflight checks pass.`,
    });
  }
}

function addExpectationFailures(result, options) {
  const checks = [
    {
      field: "endpointProfile",
      expectedByScope: options.expectEndpoints,
      actual: (smoke) => smoke.endpointProfile || "",
      code: "model_gateway_endpoint_expectation_failed",
    },
    {
      field: "routeId",
      expectedByScope: options.expectRoutes,
      actual: (smoke) => smoke.routeId || "",
      code: "model_gateway_route_expectation_failed",
    },
    {
      field: "apiFormat",
      expectedByScope: options.expectApiFormats,
      actual: (smoke) => smoke.apiFormat || "",
      code: "model_gateway_api_format_expectation_failed",
    },
  ];
  for (const smoke of result.routeSmokes) {
    for (const check of checks) {
      const expected = check.expectedByScope[smoke.scope];
      if (!expected) continue;
      const actual = check.actual(smoke);
      if (actual !== expected) {
        result.expectationFailures.push({
          code: check.code,
          scope: smoke.scope,
          field: check.field,
          expected,
          actual,
          message: `${smoke.scope} expected ${check.field} '${expected}' but used '${actual || "(none)"}'.`,
        });
      }
    }
  }
}

async function setActiveProvider(options, key, scope, providerId) {
  const result = await requestJson(options.endpoint, key, "/api/model-gateway/active-provider", {
    method: "POST",
    body: JSON.stringify({ scope, providerId }),
    timeoutMs: options.timeoutMs,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Set active provider for ${scope} failed with HTTP ${result.status}: ${preview(result.text)}`);
  }
}

async function updateProviderEnabled(options, key, providerId, enabled) {
  const result = await requestJson(options.endpoint, key, `/api/model-gateway/providers/${encodeURIComponent(providerId)}`, {
    method: "PUT",
    body: JSON.stringify({ provider: { enabled } }),
    timeoutMs: options.timeoutMs,
  });
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Set provider ${providerId} enabled=${enabled} failed with HTTP ${result.status}: ${preview(result.text)}`);
  }
  return result.body?.provider || null;
}

async function runActiveRouteSmoke(options, key, scope) {
  const maxAttempts = Math.max(1, 1 + options.smokeRetries);
  let lastSmoke = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const smoke = await runActiveRouteSmokeOnce(options, key, scope, attempt);
    lastSmoke = smoke;
    if (smoke.ok || !isTransientActiveRouteSmokeFailure(smoke) || attempt >= maxAttempts) return smoke;
    await sleep(Math.min(1_000 * attempt, 3_000));
  }
  return lastSmoke;
}

async function runActiveRouteSmokeOnce(options, key, scope, attempt) {
  let result;
  try {
    result = await requestJson(options.endpoint, key, "/api/model-gateway/active-route-smoke", {
      method: "POST",
      body: JSON.stringify({
        scope,
        model: options.model,
        timeoutMs: options.timeoutMs,
        input: options.input,
      }),
      timeoutMs: activeRouteSmokeRequestTimeoutMs(options.timeoutMs),
    });
  } catch (error) {
    return {
      scope,
      attempt,
      attempts: attempt,
      status: 0,
      ok: false,
      providerId: null,
      routeId: null,
      mode: null,
      endpointProfile: null,
      apiFormat: null,
      upstreamUrl: null,
      responsePreview: null,
      error: {
        code: "model_gateway_active_route_smoke_request_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
  return {
    scope,
    attempt,
    attempts: attempt,
    status: result.status,
    ok: Boolean(result.body?.ok),
    providerId: result.body?.providerId || null,
    routeId: result.body?.route?.routeId || null,
    mode: result.body?.route?.mode || null,
    endpointProfile: result.body?.route?.endpointProfile?.id || null,
    apiFormat: result.body?.route?.provider?.apiFormat || null,
    upstreamUrl: result.body?.route?.upstreamUrl || null,
    responsePreview: result.body?.responsePreview || null,
    error: result.body?.error || null,
    transient: result.status === 0 || isTransientActiveRouteSmokeText(result.text),
  };
}

function isTransientActiveRouteSmokeFailure(smoke) {
  if (smoke.status === 0) return true;
  if (smoke.transient) return true;
  const message = `${smoke.error?.code || ""} ${smoke.error?.message || ""} ${smoke.responsePreview || ""}`;
  return isTransientActiveRouteSmokeText(message);
}

function isTransientActiveRouteSmokeText(value) {
  const text = String(value || "").toLowerCase();
  return text.includes("fetch failed") || text.includes("econnreset") || text.includes("etimedout");
}

function activeProviderValue(activeProviders, scope) {
  const value = activeProviders?.[scope];
  return typeof value === "string" ? value : "";
}

function preview(value) {
  return String(value || "").replace(/\s+/g, " ").slice(0, 240);
}

function printResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(`Gateway active route smoke: ${result.ok ? "PASS" : "FAIL"}`);
  console.log(`Provider: ${result.provider?.id || result.providerId}  Model: ${result.model || "(default)"}`);
  if (result.preflightFailures.length) {
    console.log("Preflight failures:");
    for (const failure of result.preflightFailures) {
      console.log(`- ${failure.scope ? `${failure.scope}: ` : ""}${failure.code}: ${failure.message}`);
    }
  }
  if (result.preflightWarnings.length) {
    console.log("Preflight warnings:");
    for (const warning of result.preflightWarnings) console.log(`- ${warning.code}: ${warning.message}`);
  }
  for (const smoke of result.routeSmokes) {
    console.log(`- ${smoke.scope}: ${smoke.ok ? "PASS" : "FAIL"} ${smoke.routeId || ""} ${smoke.endpointProfile || ""}`);
    if (smoke.error) console.log(`  ${smoke.error.code || "error"}: ${smoke.error.message || ""}`);
  }
  if (result.setupFailures.length) {
    console.log("Setup failures:");
    for (const failure of result.setupFailures) console.log(`- ${failure.scope}: ${failure.error}`);
  }
  if (result.expectationFailures.length) {
    console.log("Expectation failures:");
    for (const failure of result.expectationFailures) console.log(`- ${failure.scope}: ${failure.message}`);
  }
  if (result.restoreFailures.length) {
    console.log("Restore failures:");
    for (const failure of result.restoreFailures) console.log(`- ${failure.scope}: ${failure.error}`);
  }
  if (result.restoreMismatches.length) {
    console.log("Restore mismatches:");
    for (const mismatch of result.restoreMismatches) {
      console.log(`- ${mismatch.scope}: expected '${mismatch.expected || "(default)"}', got '${mismatch.actual || "(default)"}'`);
    }
  }
}

async function restoreActiveRouteSmokeState(options, key, result, originalActiveProviders, cleanupOptions = options) {
  if (!result) return;
  if (result.preflightFailures.length === 0 || result.setupFailures.length > 0 || result.routeSmokes.length > 0) {
    for (const scope of options.scopes) {
      try {
        await setActiveProvider(cleanupOptions, key, scope, originalActiveProviders[scope] || "");
      } catch (error) {
        result.restoreFailures.push({
          scope,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }
  if (result.temporaryEnable.attempted && result.temporaryEnable.originalEnabled === false) {
    try {
      await updateProviderEnabled(cleanupOptions, key, options.providerId, false);
      const restoredProviders = await fetchProviders(cleanupOptions, key);
      const restoredProvider = providerSummary(restoredProviders, options.providerId);
      result.temporaryEnable.restoredEnabled = restoredProvider ? Boolean(restoredProvider.enabled) : null;
    } catch (error) {
      result.temporaryEnable.restoredEnabled = null;
      result.temporaryEnable.error = error instanceof Error ? error.message : String(error);
      result.restoreFailures.push({
        scope: "*",
        error: result.temporaryEnable.error,
      });
    }
  }
  try {
    const after = await fetchProviders(cleanupOptions, key);
    result.restoredActiveProviders = after.activeProviders || {};
    for (const scope of options.scopes) {
      const expected = activeProviderValue(originalActiveProviders, scope);
      const actual = activeProviderValue(result.restoredActiveProviders, scope);
      if (actual !== expected && !result.restoreMismatches.some((item) => item.scope === scope)) {
        result.restoreMismatches.push({ scope, expected, actual });
      }
    }
  } catch (error) {
    result.restoreFailures.push({
      scope: "*",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function installSignalCleanup(cleanup) {
  let cleanupStarted = false;
  const handlers = new Map();
  for (const signal of Object.keys(SIGNAL_EXIT_CODES)) {
    const handler = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      cleanup(signal)
        .catch((error) => {
          console.error(`Model Gateway active-route smoke ${signal} cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          process.exit(SIGNAL_EXIT_CODES[signal] || 1);
        });
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }
  return () => {
    for (const [signal, handler] of handlers) process.off(signal, handler);
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const key = readGatewayKey();
  let lock = null;
  let result = null;
  let originalActiveProviders = null;
  let cleanupStarted = false;
  let cleanupPromise = null;
  let markerPath = null;
  let cleanupState = async () => {
    if (lock) {
      lock.release();
      lock = null;
    }
  };
  const runCleanupOnce = (reason) => {
    if (!cleanupStarted) {
      cleanupStarted = true;
      cleanupPromise = cleanupState(reason);
    }
    return cleanupPromise;
  };
  const removeSignalHandlers = installSignalCleanup(async (signal) => {
    await runCleanupOnce(signal);
  });
  try {
    lock = await acquireActiveRouteSmokeLock(options);
    const staleMarkerRecovery = await recoverStaleActiveRouteSmokeMarker(options, key);
    const before = await fetchProviders(options, key);
    originalActiveProviders = { ...(before.activeProviders || {}) };
    let provider = providerSummary(before, options.providerId);
    result = createResult(options, provider, originalActiveProviders);
    result.staleMarkerRecovery = staleMarkerRecovery;
    if (staleMarkerRecovery?.failures?.length) {
      result.preflightFailures.push({
        code: "model_gateway_active_route_smoke_stale_marker_recovery_failed",
        message: "Previous active-route smoke marker could not be fully restored; refusing to mutate active providers.",
      });
    }
    result.lock = {
      acquired: true,
      lockDir: lock.lockDir,
      attempts: lock.attempts,
      waitedMs: lock.waitedMs,
    };
    if (result.preflightFailures.length === 0) markerPath = writeActiveRouteSmokeMarker(options, originalActiveProviders);
    cleanupState = async (reason) => {
      const cleanupOptions = typeof reason === "string" && reason.startsWith("SIG")
        ? { ...options, timeoutMs: Math.min(options.timeoutMs, SIGNAL_CLEANUP_TIMEOUT_MS) }
        : options;
      await restoreActiveRouteSmokeState(options, key, result, originalActiveProviders, cleanupOptions);
      if (markerPath) {
        removeMarkerFile(markerPath);
        markerPath = null;
      }
      if (lock) {
        lock.release();
        lock = null;
      }
    };
    if (result.preflightFailures.length === 0 && provider && !provider.enabled && options.temporaryEnable) {
      result.temporaryEnable.attempted = true;
      result.preflightWarnings.push({
        code: "model_gateway_provider_temporarily_enabled",
        message: `Provider '${provider.id}' is disabled and will be temporarily enabled for this smoke.`,
      });
      try {
        await updateProviderEnabled(options, key, provider.id, true);
        const enabledProviders = await fetchProviders(options, key);
        provider = providerSummary(enabledProviders, options.providerId);
        result.provider = provider;
        result.temporaryEnable.enabled = Boolean(provider?.enabled);
      } catch (error) {
        result.temporaryEnable.error = error instanceof Error ? error.message : String(error);
        result.preflightFailures.push({
          code: "model_gateway_provider_temporary_enable_failed",
          message: result.temporaryEnable.error,
        });
      }
    }
    addProviderPreflight(result, options, provider);

    try {
      if (result.preflightFailures.length === 0) {
        for (const scope of options.scopes) {
          try {
            await setActiveProvider(options, key, scope, options.providerId);
          } catch (error) {
            result.setupFailures.push({
              scope,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
        if (result.setupFailures.length === 0) {
          for (const scope of options.scopes) {
            result.routeSmokes.push(await runActiveRouteSmoke(options, key, scope));
          }
          addExpectationFailures(result, options);
        }
      }
    } finally {
      await runCleanupOnce("finally");
    }

    result.ok = result.routeSmokes.length === options.scopes.length
      && result.preflightFailures.length === 0
      && result.routeSmokes.every((item) => item.ok)
      && result.expectationFailures.length === 0
      && result.setupFailures.length === 0
      && result.restoreFailures.length === 0
      && result.restoreMismatches.length === 0;
    printResult(result, options.json);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    if (error?.code === "model_gateway_active_route_smoke_lock_timeout") {
      const result = createResult(options, null, null);
      result.error = {
        code: error.code,
        message: error instanceof Error ? error.message : String(error),
      };
      result.lock = error.lock || null;
      printResult(result, options.json);
      process.exitCode = 1;
      return;
    }
    throw error;
  } finally {
    removeSignalHandlers();
    await runCleanupOnce("finally");
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
