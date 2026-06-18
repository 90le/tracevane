#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const DEFAULT_ENDPOINT = "http://127.0.0.1:18796";
const DEFAULT_TIMEOUT_MS = 240_000;
const DEFAULT_APP_SCOPE = "codex";

function parseArgs(argv) {
  const options = {
    endpoint: process.env.TRACEVANE_GATEWAY_ENDPOINT || process.env.TRACEVANE_GATEWAY_ENDPOINT || DEFAULT_ENDPOINT,
    appScope: process.env.TRACEVANE_GATEWAY_APP_SCOPE || process.env.TRACEVANE_GATEWAY_APP_SCOPE || DEFAULT_APP_SCOPE,
    model: process.env.TRACEVANE_GATEWAY_ACCOUNT_POOL_MODEL || process.env.TRACEVANE_GATEWAY_ACCOUNT_POOL_MODEL || "",
    json: false,
    strict: false,
    requireMultiAccount: false,
    timeoutMs: DEFAULT_TIMEOUT_MS,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--endpoint") options.endpoint = argv[++index] || options.endpoint;
    else if (arg.startsWith("--endpoint=")) options.endpoint = arg.slice("--endpoint=".length);
    else if (arg === "--app-scope") options.appScope = argv[++index] || options.appScope;
    else if (arg.startsWith("--app-scope=")) options.appScope = arg.slice("--app-scope=".length);
    else if (arg === "--model") options.model = argv[++index] || options.model;
    else if (arg.startsWith("--model=")) options.model = arg.slice("--model=".length);
    else if (arg === "--timeout-ms") options.timeoutMs = positiveInt(argv[++index], DEFAULT_TIMEOUT_MS);
    else if (arg.startsWith("--timeout-ms=")) options.timeoutMs = positiveInt(arg.slice("--timeout-ms=".length), DEFAULT_TIMEOUT_MS);
    else if (arg === "--require-multi-account") options.requireMultiAccount = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  options.endpoint = options.endpoint.replace(/\/+$/g, "");
  options.appScope = options.appScope.trim() || DEFAULT_APP_SCOPE;
  options.model = options.model.trim();
  return options;
}

function printHelp() {
  console.log(`Usage: node scripts/smoke-model-gateway-account-pool.mjs [options]

Runs a real account-backed provider smoke against the local Tracevane Gateway daemon.

Default checks:
  - current active provider for the selected app scope is account-backed
  - at least one routeable account exists
  - /v1/responses succeeds through the Gateway client endpoint
  - runtime accountRouting contains pool count diagnostics
  - sticky session is checked when enabled by provider routing
  - round-robin multi-account is checked when 2+ routeable accounts exist

Options:
  --endpoint <url>              default: ${DEFAULT_ENDPOINT}
  --app-scope <id>              default: ${DEFAULT_APP_SCOPE}
  --model <id>                  default: active account provider default model
  --require-multi-account       fail when fewer than 2 routeable accounts exist
  --strict                      fail on failed probes and non-optional skipped probes
  --timeout-ms <n>              per-request timeout
  --json                        machine-readable output
  -h, --help                    Show this help

Auth:
  TRACEVANE_GATEWAY_CLIENT_KEY is preferred. If omitted, the script reads
  ~/.openclaw/tracevane/model-gateway/secrets.json locally.`);
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
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

function gatewayHeaders(key, appScope, extra = {}) {
  return {
    authorization: `Bearer ${key}`,
    "x-tracevane-app-scope": appScope,
    ...extra,
  };
}

async function requestJson(url, options) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  return {
    status: response.status,
    headers: response.headers,
    body,
    text,
  };
}

function status(id, state, details = {}) {
  return {
    id,
    status: state,
    ...details,
  };
}

function isRouteableAccount(account) {
  if (!account || account.enabled === false) return false;
  if (account.state && account.state !== "ready") return false;
  const cooldownMs = Date.parse(account.cooldownUntil || "");
  return !Number.isFinite(cooldownMs) || cooldownMs <= Date.now();
}

function pickActiveAccountProvider(providersBody, appScope) {
  const activeProviderId = providersBody?.activeProviders?.[appScope] || providersBody?.activeProviders?.codex || "";
  const providers = Array.isArray(providersBody?.providers) ? providersBody.providers : [];
  const activeProvider = providers.find((provider) => provider.id === activeProviderId) || null;
  return {
    activeProviderId,
    activeProvider,
    providers,
  };
}

function providerDefaultModel(provider) {
  const explicit = stringOrNull(provider?.models?.defaultModel);
  if (explicit) return explicit;
  const models = Array.isArray(provider?.models?.models) ? provider.models.models : [];
  return stringOrNull(models.find((model) => model?.features?.text !== false)?.id)
    || stringOrNull(models[0]?.id)
    || "";
}

async function fetchProviders(options) {
  const result = await requestJson(`${options.endpoint}/api/model-gateway/providers`, {
    method: "GET",
    timeoutMs: options.timeoutMs,
  });
  if (result.status < 200 || result.status >= 300) {
    return {
      probe: status("provider-selection", "failed", {
        statusCode: result.status,
        error: errorPreview(result),
      }),
      body: null,
    };
  }
  const selection = pickActiveAccountProvider(result.body, options.appScope);
  if (!selection.activeProvider) {
    return {
      probe: status("provider-selection", "failed", {
        activeProviderId: selection.activeProviderId || null,
        reason: `No active provider for app scope '${options.appScope}'.`,
      }),
      body: result.body,
    };
  }
  if (selection.activeProvider.sourceType !== "account-backed" || !selection.activeProvider.accountProvider) {
    return {
      probe: status("provider-selection", "skipped", {
        activeProviderId: selection.activeProviderId,
        providerName: selection.activeProvider.name,
        reason: `Active provider for '${options.appScope}' is not account-backed.`,
      }),
      body: result.body,
    };
  }
  const accounts = Array.isArray(selection.activeProvider.accountProvider.accounts)
    ? selection.activeProvider.accountProvider.accounts
    : [];
  const routeable = accounts.filter(isRouteableAccount);
  return {
    probe: status("provider-selection", routeable.length ? "passed" : "failed", {
      activeProviderId: selection.activeProviderId,
      providerName: selection.activeProvider.name,
      accountCount: accounts.length,
      routeableCount: routeable.length,
      strategy: selection.activeProvider.accountProvider.routing?.strategy || null,
      stickySession: selection.activeProvider.accountProvider.routing?.stickySession !== false,
      perAccountConcurrency: selection.activeProvider.accountProvider.routing?.perAccountConcurrency || null,
    }),
    body: result.body,
    selection,
    accounts,
    routeable,
  };
}

async function runResponsesProbe(options, key, model, sessionId, expectedText) {
  const startedAt = Date.now();
  const result = await requestJson(`${options.endpoint}/v1/responses`, {
    method: "POST",
    headers: gatewayHeaders(key, options.appScope, {
      "content-type": "application/json",
      "x-session-id": sessionId,
    }),
    body: JSON.stringify({
      model,
      input: `Reply exactly ${expectedText}.`,
      stream: false,
      max_output_tokens: 64,
    }),
    timeoutMs: options.timeoutMs,
  });
  const account = result.headers.get("x-openclaw-model-gateway-account");
  if (result.status < 200 || result.status >= 300) {
    return {
      probe: status("responses-request", "failed", {
        statusCode: result.status,
        model,
        account,
        error: errorPreview(result),
      }),
      result,
      account,
      startedAt,
    };
  }
  const text = collectResponsesOutputText(result.body);
  if (!text.includes(expectedText)) {
    return {
      probe: status("responses-request", "failed", {
        statusCode: result.status,
        model,
        account,
        textPreview: preview(text),
        reason: `Response did not include ${expectedText}.`,
      }),
      result,
      account,
      startedAt,
    };
  }
  return {
    probe: status("responses-request", "passed", {
      statusCode: result.status,
      model,
      provider: result.headers.get("x-openclaw-model-gateway-provider"),
      account,
      textPreview: preview(text),
    }),
    result,
    account,
    startedAt,
  };
}

async function fetchRuntime(options) {
  const result = await requestJson(`${options.endpoint}/api/model-gateway/runtime`, {
    method: "GET",
    timeoutMs: options.timeoutMs,
  });
  if (result.status < 200 || result.status >= 300) {
    return {
      probe: status("runtime-account-routing", "failed", {
        statusCode: result.status,
        error: errorPreview(result),
      }),
      body: null,
    };
  }
  return {
    probe: null,
    body: result.body,
  };
}

function findAccountRoutingEntry(runtimeBody, options) {
  const requestLog = Array.isArray(runtimeBody?.runtime?.requestLog) ? runtimeBody.runtime.requestLog : [];
  return [...requestLog]
    .reverse()
    .find((entry) =>
      entry?.routeId === "openai_responses"
      && entry?.model === options.model
      && entry?.accountRouting
    ) || null;
}

function validateAccountRouting(runtimeBody, options, provider) {
  const entry = findAccountRoutingEntry(runtimeBody, options);
  if (!entry) {
    return status("runtime-account-routing", "failed", {
      reason: "No recent openai_responses request log entry with accountRouting was found.",
    });
  }
  const routing = entry.accountRouting || {};
  const fields = ["accountCount", "readyCount", "capacityAvailableCount", "busyCount", "cooldownCount", "needsLoginCount"];
  const missing = fields.filter((field) => !Number.isFinite(routing[field]));
  if (missing.length) {
    return status("runtime-account-routing", "failed", {
      selectedAccountId: routing.selectedAccountId || null,
      selectedReason: routing.selectedReason || null,
      missing,
    });
  }
  const expectedAccountCount = Array.isArray(provider?.accountProvider?.accounts)
    ? provider.accountProvider.accounts.length
    : null;
  if (Number.isFinite(expectedAccountCount) && routing.accountCount !== expectedAccountCount) {
    return status("runtime-account-routing", "failed", {
      selectedAccountId: routing.selectedAccountId || null,
      selectedReason: routing.selectedReason || null,
      accountCount: routing.accountCount,
      expectedAccountCount,
    });
  }
  return status("runtime-account-routing", "passed", {
    selectedAccountId: routing.selectedAccountId || null,
    selectedReason: routing.selectedReason || null,
    affinityHit: routing.affinityHit === true,
    accountCount: routing.accountCount,
    readyCount: routing.readyCount,
    capacityAvailableCount: routing.capacityAvailableCount,
    busyCount: routing.busyCount,
    cooldownCount: routing.cooldownCount,
    needsLoginCount: routing.needsLoginCount,
  });
}

async function probeSticky(options, key, model, firstAccount, stickyEnabled) {
  if (!stickyEnabled) {
    return status("sticky-session", "skipped", {
      reason: "Provider routing has stickySession=false.",
    });
  }
  const sessionId = `tracevane-account-pool-sticky-${Date.now()}`;
  const first = await runResponsesProbe(options, key, model, sessionId, "ACCOUNT_POOL_STICKY_A");
  if (first.probe.status !== "passed") return { ...first.probe, id: "sticky-session" };
  const second = await runResponsesProbe(options, key, model, sessionId, "ACCOUNT_POOL_STICKY_B");
  if (second.probe.status !== "passed") return { ...second.probe, id: "sticky-session" };
  const firstSeen = first.account || firstAccount || null;
  if (firstSeen && second.account && firstSeen !== second.account) {
    return status("sticky-session", "failed", {
      firstAccount: firstSeen,
      secondAccount: second.account,
      reason: "Same session did not stay on the same account.",
    });
  }
  return status("sticky-session", "passed", {
    account: second.account || firstSeen,
  });
}

async function probeMultiAccount(options, key, model, provider, routeableCount) {
  if (routeableCount < 2) {
    return status("multi-account-strategy", options.requireMultiAccount ? "failed" : "skipped", {
      routeableCount,
      reason: "Need at least 2 routeable accounts for live strategy validation.",
    });
  }
  const strategy = provider?.accountProvider?.routing?.strategy || "round-robin";
  if (strategy !== "round-robin") {
    return status("multi-account-strategy", "skipped", {
      strategy,
      routeableCount,
      reason: "Only round-robin can be asserted without mutating provider routing.",
    });
  }
  const base = `tracevane-account-pool-rr-${Date.now()}`;
  const first = await runResponsesProbe(options, key, model, `${base}-a`, "ACCOUNT_POOL_RR_A");
  if (first.probe.status !== "passed") return { ...first.probe, id: "multi-account-strategy" };
  const second = await runResponsesProbe(options, key, model, `${base}-b`, "ACCOUNT_POOL_RR_B");
  if (second.probe.status !== "passed") return { ...second.probe, id: "multi-account-strategy" };
  if (first.account && second.account && first.account === second.account) {
    return status("multi-account-strategy", "failed", {
      strategy,
      routeableCount,
      firstAccount: first.account,
      secondAccount: second.account,
      reason: "Two fresh sessions selected the same account under round-robin.",
    });
  }
  return status("multi-account-strategy", "passed", {
    strategy,
    routeableCount,
    firstAccount: first.account || null,
    secondAccount: second.account || null,
  });
}

function collectResponsesOutputText(response) {
  const output = Array.isArray(response?.output) ? response.output : [];
  return output.flatMap((item) => {
    if (typeof item?.content === "string") return [item.content];
    const content = Array.isArray(item?.content) ? item.content : [];
    return content.map((part) => part?.text).filter((text) => typeof text === "string");
  }).join("");
}

function errorPreview(result) {
  return result.body?.error || {
    message: preview(result.text || `HTTP ${result.status}`),
  };
}

function preview(value) {
  return redact(String(value || "")).slice(0, 400);
}

function redact(value) {
  return String(value || "")
    .replace(/sk-[A-Za-z0-9._-]{12,}/g, "<REDACTED_KEY>")
    .replace(/[A-Za-z0-9]{24,}\.[A-Za-z0-9._-]{12,}/g, "<REDACTED_KEY>");
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isOptionalSkippedProbe(probe, options) {
  return probe?.id === "multi-account-strategy" && options.requireMultiAccount !== true;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const key = readGatewayKey();
  if (!key) {
    throw new Error("Missing Gateway client key. Set TRACEVANE_GATEWAY_CLIENT_KEY or save a local Gateway key.");
  }
  const probes = [];
  const providers = await fetchProviders(options);
  probes.push(providers.probe);
  const provider = providers.selection?.activeProvider || null;
  const routeableCount = providers.routeable?.length || 0;
  if (providers.probe.status === "passed" && provider) {
    options.model = options.model || providerDefaultModel(provider);
    if (!options.model) {
      probes.push(status("responses-request", "failed", {
        reason: "No model was supplied and the active account provider has no default model.",
      }));
    } else {
      const sessionId = `tracevane-account-pool-${Date.now()}`;
      const requestProbe = await runResponsesProbe(options, key, options.model, sessionId, "ACCOUNT_POOL_OK");
      probes.push(requestProbe.probe);
      const runtime = await fetchRuntime(options);
      if (runtime.probe) {
        probes.push(runtime.probe);
      } else {
        probes.push(validateAccountRouting(runtime.body, options, provider));
      }
      probes.push(await probeSticky(
        options,
        key,
        options.model,
        requestProbe.account,
        provider.accountProvider?.routing?.stickySession !== false,
      ));
      probes.push(await probeMultiAccount(options, key, options.model, provider, routeableCount));
    }
  }
  const failed = probes.filter((probe) => probe.status === "failed");
  const skipped = probes.filter((probe) => probe.status === "skipped");
  const blockingSkipped = skipped.filter((probe) => !isOptionalSkippedProbe(probe, options));
  const result = {
    ok: failed.length === 0 && (!options.strict || blockingSkipped.length === 0),
    endpoint: options.endpoint,
    appScope: options.appScope,
    model: options.model || null,
    checkedAt: new Date().toISOString(),
    probes,
  };
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`${result.ok ? "OK" : "FAIL"} Tracevane Gateway account pool smoke`);
    for (const probe of probes) {
      console.log(`- ${probe.id}: ${probe.status}`);
      if (probe.reason) console.log(`  ${probe.reason}`);
    }
  }
  if (!result.ok) process.exitCode = 1;
}

main().catch((error) => {
  console.log(JSON.stringify({
    ok: false,
    error: redact(error instanceof Error ? error.message : String(error)),
  }, null, 2));
  process.exitCode = 1;
});
