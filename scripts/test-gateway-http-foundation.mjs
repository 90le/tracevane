#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import crossSpawn from "cross-spawn";
import which from "which";

import { assertTcpPortAvailable } from "./dev-web-smoke.mjs";
import { stopOwnedProcess } from "./lib/with-server.mjs";

const DEFAULT_BASE_PATH = "/tracevane";
const DEFAULT_GATEWAY_PORT = 19_091;
const DEFAULT_STANDALONE_PORT = 3_760;
const DEFAULT_TIMEOUT_MS = 60_000;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const USAGE = `Usage: node scripts/test-gateway-http-foundation.mjs [--strict] [--json]

Runs an isolated real OpenClaw Gateway mount smoke. Missing OpenClaw is a skip
unless --strict is supplied.

Environment:
  TRACEVANE_GATEWAY_HTTP_PORT             Gateway port (default 19091)
  TRACEVANE_GATEWAY_STANDALONE_PORT       Disabled standalone probe port (default 3760)
  TRACEVANE_GATEWAY_HTTP_BASE_PATH        Mount path (default /tracevane)
  TRACEVANE_GATEWAY_HTTP_TIMEOUT_MS       Readiness timeout (default 60000)
`;

class UsageError extends Error {
  constructor(message) {
    super(message);
    this.name = "UsageError";
    this.exitCode = 2;
  }
}

function positiveInteger(value, name, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  if (value === undefined || value === null || value === "") return fallback;
  if (!/^\d+$/.test(String(value))) {
    throw new UsageError(`${name} must be an integer between 1 and ${maximum}`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new UsageError(`${name} must be an integer between 1 and ${maximum}`);
  }
  return number;
}

function normalizeBasePath(value) {
  const normalized = String(value || DEFAULT_BASE_PATH).trim().replace(/\/+$/, "");
  if (!normalized.startsWith("/") || normalized === "" || /[?#\s]/.test(normalized)) {
    throw new UsageError("TRACEVANE_GATEWAY_HTTP_BASE_PATH must be an absolute URL path");
  }
  return normalized || "/";
}

export function parseGatewaySmokeOptions(argv = process.argv.slice(2), env = process.env) {
  const options = { json: false, strict: false };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--strict") options.strict = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else throw new UsageError(`Unknown argument: ${arg}\n${USAGE}`);
  }
  const gatewayPort = positiveInteger(
    env.TRACEVANE_GATEWAY_HTTP_PORT ?? env.TEST_PORT,
    "TRACEVANE_GATEWAY_HTTP_PORT",
    DEFAULT_GATEWAY_PORT,
    65_535,
  );
  const standalonePort = positiveInteger(
    env.TRACEVANE_GATEWAY_STANDALONE_PORT,
    "TRACEVANE_GATEWAY_STANDALONE_PORT",
    DEFAULT_STANDALONE_PORT,
    65_535,
  );
  if (gatewayPort === standalonePort) {
    throw new UsageError("Gateway and standalone probe ports must differ");
  }
  return {
    ...options,
    basePath: normalizeBasePath(
      env.TRACEVANE_GATEWAY_HTTP_BASE_PATH ?? env.BASE_PATH,
    ),
    gatewayPort,
    standalonePort,
    timeoutMs: positiveInteger(
      env.TRACEVANE_GATEWAY_HTTP_TIMEOUT_MS,
      "TRACEVANE_GATEWAY_HTTP_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
    ),
  };
}

export function createGatewaySmokeConfig({
  basePath,
  gatewayPort,
  rootDir,
  standalonePort,
}) {
  return {
    gateway: {
      mode: "local",
      port: gatewayPort,
      bind: "loopback",
      auth: { mode: "none" },
      controlUi: {
        allowedOrigins: [
          `http://127.0.0.1:${gatewayPort}`,
          `http://localhost:${gatewayPort}`,
        ],
        dangerouslyAllowHostHeaderOriginFallback: false,
        allowInsecureAuth: true,
      },
    },
    plugins: {
      allow: ["tracevane"],
      load: { paths: [rootDir] },
      entries: {
        tracevane: {
          enabled: true,
          config: {
            autoStart: true,
            transport: {
              standalone: { enabled: false, port: standalonePort },
              gateway: { enabled: true, basePath },
            },
          },
        },
      },
    },
  };
}

function resolveOpenClaw(env) {
  try {
    return which.sync("openclaw", {
      nothrow: true,
      path: env.PATH,
    }) || null;
  } catch {
    return null;
  }
}

function childExitError(child, spawnError, logs) {
  if (spawnError) {
    return new Error(`Failed to start OpenClaw Gateway: ${spawnError.message}`, {
      cause: spawnError,
    });
  }
  if (child.exitCode !== null || child.signalCode !== null) {
    return new Error(
      `OpenClaw Gateway exited before the smoke completed `
        + `(${child.signalCode || `code ${child.exitCode}`})\n${logs().slice(-4_000)}`,
    );
  }
  return null;
}

async function fetchText(url, timeoutMs, signal) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const requestSignal = signal
    ? AbortSignal.any([signal, timeoutSignal])
    : timeoutSignal;
  const response = await fetch(url, { signal: requestSignal });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
  return text;
}

async function waitForHealth(url, {
  child,
  getLogs,
  getSpawnError,
  signal,
  timeoutMs,
}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    const exitError = childExitError(child, getSpawnError(), getLogs);
    if (exitError) throw exitError;
    try {
      return await fetchText(
        url,
        Math.min(1_000, Math.max(1, deadline - Date.now())),
        signal,
      );
    } catch (error) {
      if (signal?.aborted) signal.throwIfAborted();
      lastError = error;
      await delay(200, undefined, signal ? { signal } : undefined);
    }
  }
  throw new Error(`Timed out waiting for OpenClaw Gateway health: ${url}`, {
    cause: lastError,
  });
}

function appendBounded(current, chunk) {
  return `${current}${String(chunk)}`.slice(-64_000);
}

async function runOwnedGateway({ executable, options, rootDir, stateDir, env }) {
  const configPath = path.join(stateDir, "openclaw.json");
  writeFileSync(
    configPath,
    `${JSON.stringify(createGatewaySmokeConfig({
      basePath: options.basePath,
      gatewayPort: options.gatewayPort,
      rootDir,
      standalonePort: options.standalonePort,
    }), null, 2)}\n`,
    "utf8",
  );

  const child = crossSpawn(executable, [
    "gateway",
    "run",
    "--allow-unconfigured",
    "--auth",
    "none",
    "--port",
    String(options.gatewayPort),
    "--force",
  ], {
    cwd: rootDir,
    detached: process.platform !== "win32",
    env: {
      ...env,
      OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_STATE_DIR: stateDir,
    },
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let output = "";
  let spawnError = null;
  child.stdout?.on("data", (chunk) => { output = appendBounded(output, chunk); });
  child.stderr?.on("data", (chunk) => { output = appendBounded(output, chunk); });
  child.once("error", (error) => { spawnError = error; });

  const controller = new AbortController();
  let requestedSignal = null;
  const handlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      if (requestedSignal) return;
      requestedSignal = signal;
      controller.abort(new Error(`Interrupted by ${signal}`));
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }

  let result;
  let failure;
  try {
    const baseUrl = `http://127.0.0.1:${options.gatewayPort}${options.basePath}`;
    const healthText = await waitForHealth(`${baseUrl}/api/system/health`, {
      child,
      getLogs: () => output,
      getSpawnError: () => spawnError,
      signal: controller.signal,
      timeoutMs: options.timeoutMs,
    });
    const indexHtml = await fetchText(`${baseUrl}/`, options.timeoutMs, controller.signal);
    if (!indexHtml.includes("__TRACEVANE_RUNTIME__")
      || !indexHtml.includes('"exposureKind":"gateway"')) {
      throw new Error("Gateway basePath did not inject the Tracevane runtime config");
    }

    let health;
    try {
      health = JSON.parse(healthText);
    } catch (error) {
      throw new Error("Gateway basePath health did not return JSON", { cause: error });
    }
    if (!("gatewayConnected" in health)
      || Number(health.gatewayPort) !== options.gatewayPort) {
      throw new Error(`Unexpected Gateway basePath health payload: ${healthText}`);
    }

    await assertTcpPortAvailable("127.0.0.1", options.standalonePort);
    result = {
      basePath: options.basePath,
      checks: {
        basePathRuntimeConfig: true,
        basePathHealth: true,
        standaloneDisabled: true,
      },
      gatewayPort: options.gatewayPort,
      standalonePort: options.standalonePort,
      status: "passed",
    };
  } catch (error) {
    failure = error;
  } finally {
    for (const [signal, handler] of handlers) process.off(signal, handler);
    controller.abort();
    try {
      await stopOwnedProcess(child);
      await assertTcpPortAvailable("127.0.0.1", options.gatewayPort);
    } catch (cleanupError) {
      failure = failure
        ? new AggregateError([failure, cleanupError], "Gateway smoke and cleanup both failed")
        : cleanupError;
    }
  }

  if (requestedSignal) {
    const error = failure || new Error(`Interrupted by ${requestedSignal}`);
    error.exitCode = requestedSignal === "SIGINT" ? 130 : 143;
    throw error;
  }
  if (failure) throw failure;
  return result;
}

export async function runGatewayHttpFoundationSmoke(
  options,
  {
    env = process.env,
    rootDir = ROOT,
    resolveExecutable = resolveOpenClaw,
  } = {},
) {
  const executable = resolveExecutable(env);
  if (!executable) {
    const message = "OpenClaw CLI is not installed or not on PATH";
    if (options.strict) throw new Error(message);
    return { reason: message, status: "skipped" };
  }

  await assertTcpPortAvailable("127.0.0.1", options.gatewayPort);
  await assertTcpPortAvailable("127.0.0.1", options.standalonePort);
  const stateDir = mkdtempSync(path.join(os.tmpdir(), "tracevane-gateway-http-"));
  try {
    return await runOwnedGateway({ executable, options, rootDir, stateDir, env });
  } finally {
    rmSync(stateDir, { force: true, recursive: true });
  }
}

function printReport(report, json) {
  if (json) {
    console.log(JSON.stringify(report));
    return;
  }
  if (report.status === "skipped") {
    console.log(`SKIP: ${report.reason}`);
    return;
  }
  console.log(
    `Gateway HTTP foundation passed at http://127.0.0.1:${report.gatewayPort}${report.basePath}`,
  );
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  try {
    const options = parseGatewaySmokeOptions(argv, env);
    if (options.help) {
      console.log(USAGE);
      return 0;
    }
    printReport(await runGatewayHttpFoundationSmoke(options, { env }), options.json);
    return 0;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}

function isMainModule(metaUrl = import.meta.url, argvEntry = process.argv[1]) {
  if (!argvEntry) return false;
  return pathToFileURL(path.resolve(argvEntry)).href === metaUrl;
}

if (isMainModule()) process.exitCode = await main();
