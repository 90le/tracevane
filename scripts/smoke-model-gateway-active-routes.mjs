#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "http://127.0.0.1:18796";
const DEFAULT_SCOPES = ["codex", "claude-code", "opencode"];
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_INPUT = "Reply with GATEWAY_OK only.";

function parseArgs(argv) {
  const options = {
    endpoint: process.env.TRACEVANE_GATEWAY_ENDPOINT || process.env.TRACEVANE_GATEWAY_ENDPOINT || DEFAULT_ENDPOINT,
    providerId: "",
    model: "",
    scopes: DEFAULT_SCOPES,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    input: DEFAULT_INPUT,
    temporaryEnable: false,
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
  };
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
      timeoutMs: Math.max(options.timeoutMs + 5_000, DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      scope,
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
  };
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

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const key = readGatewayKey();
  const before = await fetchProviders(options, key);
  const originalActiveProviders = { ...(before.activeProviders || {}) };
  let provider = providerSummary(before, options.providerId);
  const result = createResult(options, provider, originalActiveProviders);
  if (provider && !provider.enabled && options.temporaryEnable) {
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
    if (result.preflightFailures.length === 0 || result.setupFailures.length > 0 || result.routeSmokes.length > 0) {
      for (const scope of options.scopes) {
        try {
          await setActiveProvider(options, key, scope, originalActiveProviders[scope] || "");
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
        await updateProviderEnabled(options, key, options.providerId, false);
        const restoredProviders = await fetchProviders(options, key);
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
      const after = await fetchProviders(options, key);
      result.restoredActiveProviders = after.activeProviders || {};
      for (const scope of options.scopes) {
        const expected = activeProviderValue(originalActiveProviders, scope);
        const actual = activeProviderValue(result.restoredActiveProviders, scope);
        if (actual !== expected) {
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

  result.ok = result.routeSmokes.length === options.scopes.length
    && result.preflightFailures.length === 0
    && result.routeSmokes.every((item) => item.ok)
    && result.expectationFailures.length === 0
    && result.setupFailures.length === 0
    && result.restoreFailures.length === 0
    && result.restoreMismatches.length === 0;
  printResult(result, options.json);
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
