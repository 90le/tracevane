import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

import { chromium } from "@playwright/test";

import { runExternalApiSmoke } from "./dev-web-smoke-external-api.mjs";
import { runWebSmoke } from "./dev-web-smoke.mjs";
import { stopOwnedProcess } from "./lib/with-server.mjs";

const DEFAULT_WEB_PORT = 5176;
const DEFAULT_API_PORT = 3894;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export class BrowserSmokeUsageError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "BrowserSmokeUsageError";
    this.exitCode = 2;
  }
}

function usageError(message, cause) {
  return new BrowserSmokeUsageError(message, cause ? { cause } : undefined);
}

function parsePort(value, optionName) {
  if (!/^\d+$/.test(value)) {
    throw usageError(`${optionName} must be an integer between 1 and 65535`);
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw usageError(`${optionName} must be an integer between 1 and 65535`);
  }
  return port;
}

export function parseBrowserSmokeArgs(
  argv = process.argv.slice(2),
  env = process.env,
) {
  const separatorIndex = argv.indexOf("--");
  if (separatorIndex < 0) {
    throw usageError("A smoke command is required after --");
  }
  const command = argv.slice(separatorIndex + 1);
  if (command.length === 0 || command[0].trim() === "") {
    throw usageError("A smoke command is required after --");
  }

  let values;
  try {
    ({ values } = parseArgs({
      allowPositionals: false,
      args: argv.slice(0, separatorIndex),
      options: {
        "api-port": { type: "string" },
        "api-port-fallback": {
          default: String(DEFAULT_API_PORT),
          type: "string",
        },
        "external-api": { default: false, type: "boolean" },
        "force-optimize": { default: false, type: "boolean" },
        "web-port": { type: "string" },
        "web-port-fallback": {
          default: String(DEFAULT_WEB_PORT),
          type: "string",
        },
      },
      strict: true,
    }));
  } catch (error) {
    throw usageError(error instanceof Error ? error.message : String(error), error);
  }

  const webPortFallback = parsePort(
    values["web-port-fallback"],
    "--web-port-fallback",
  );
  const apiPortFallback = parsePort(
    values["api-port-fallback"],
    "--api-port-fallback",
  );
  const externalApi = values["external-api"];
  const webPort = values["web-port"] !== undefined
    ? parsePort(values["web-port"], "--web-port")
    : env.TRACEVANE_WEB_PORT !== undefined
      ? parsePort(env.TRACEVANE_WEB_PORT, "TRACEVANE_WEB_PORT")
      : webPortFallback;
  const apiPort = values["api-port"] !== undefined
    ? parsePort(values["api-port"], "--api-port")
    : externalApi && env.TRACEVANE_API_PORT !== undefined
      ? parsePort(env.TRACEVANE_API_PORT, "TRACEVANE_API_PORT")
      : apiPortFallback;
  if (externalApi && webPort === apiPort) {
    throw usageError("--web-port and --api-port must differ with --external-api");
  }

  return {
    apiPort,
    command,
    externalApi,
    forceOptimize: values["force-optimize"],
    webPort,
  };
}

export function resolveBrowserExecutable(
  env = process.env,
  {
    defaultExecutablePath = () => chromium.executablePath(),
    fileExists = existsSync,
  } = {},
) {
  const configured = env.PLAYWRIGHT_CHROME_EXECUTABLE;
  const executable = configured || defaultExecutablePath();
  if (!executable || !fileExists(executable)) {
    throw new Error(
      `Playwright Chromium is not installed at ${JSON.stringify(executable)}. ` +
      "Run `npx playwright install chromium` before browser smokes.",
    );
  }
  return executable;
}

function signalExitCode(signal) {
  if (signal === "SIGINT") return 130;
  if (signal === "SIGTERM") return 143;
  return 1;
}

function waitForChild(child) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      child.off("close", onClose);
      reject(error);
    };
    const onClose = (code, signal) => {
      child.off("error", onError);
      resolve({ code, signal });
    };
    child.once("error", onError);
    child.once("close", onClose);
  });
}

function commandError(command, { code, signal }) {
  const rendered = command.map((token) => JSON.stringify(token)).join(" ");
  const error = signal
    ? new Error(`Browser smoke command exited with signal ${signal}: ${rendered}`)
    : new Error(`Browser smoke command exited with code ${code}: ${rendered}`);
  error.exitCode = signal ? signalExitCode(signal) : code;
  return error;
}

export async function runSmokeCommand(
  command,
  {
    cwd = ROOT_DIR,
    env = process.env,
    spawnProcess = spawn,
  } = {},
) {
  const [executable, ...args] = command;
  const child = spawnProcess(executable, args, {
    cwd,
    detached: process.platform !== "win32",
    env,
    shell: false,
    stdio: "inherit",
    windowsHide: true,
  });

  const signalHandlers = new Map();
  for (const signal of ["SIGINT", "SIGTERM"]) {
    const handler = () => {
      void stopOwnedProcess(child).catch(() => {});
    };
    signalHandlers.set(signal, handler);
    process.prependOnceListener(signal, handler);
  }

  let outcome;
  let failure;
  try {
    outcome = await waitForChild(child);
  } catch (error) {
    failure = error;
  } finally {
    for (const [signal, handler] of signalHandlers) {
      process.off(signal, handler);
    }
    try {
      await stopOwnedProcess(child);
    } catch (cleanupError) {
      if (failure && typeof failure === "object") {
        failure.cleanupError = cleanupError;
      } else {
        failure = cleanupError;
      }
    }
  }

  if (failure) throw failure;
  if (outcome.code !== 0 || outcome.signal) {
    throw commandError(command, outcome);
  }
}

export async function runBrowserSmoke(
  options,
  {
    cwd = ROOT_DIR,
    defaultExecutablePath,
    env = process.env,
    runExternalApiSmoke: runExternalApiSmokeImpl = runExternalApiSmoke,
    runWebSmoke: runWebSmokeImpl = runWebSmoke,
    runSmokeCommand: runSmokeCommandImpl = runSmokeCommand,
  } = {},
) {
  const rootDir = path.resolve(cwd);
  const browserExecutable = resolveBrowserExecutable(env, {
    defaultExecutablePath,
  });
  const childEnv = {
    ...env,
    PLAYWRIGHT_CHROME_EXECUTABLE: browserExecutable,
    TRACEVANE_WEB_PORT: String(options.webPort),
    TRACEVANE_WEB_SMOKE_URL: `http://127.0.0.1:${options.webPort}`,
  };

  if (options.externalApi) {
    childEnv.TRACEVANE_API_PORT = String(options.apiPort);
    childEnv.TRACEVANE_USE_EXTERNAL_API = "1";
  } else {
    delete childEnv.TRACEVANE_USE_EXTERNAL_API;
  }
  if (options.forceOptimize) {
    childEnv.TRACEVANE_SMOKE_FORCE_OPTIMIZE = "1";
  }

  const launchServer = options.externalApi
    ? runExternalApiSmokeImpl
    : runWebSmokeImpl;
  return launchServer(
    { env: childEnv, rootDir },
    () => runSmokeCommandImpl(options.command, {
      cwd: rootDir,
      env: childEnv,
    }),
  );
}

export function isMainModule(
  metaUrl = import.meta.url,
  argvEntry = process.argv[1],
) {
  if (!argvEntry) return false;
  return pathToFileURL(path.resolve(argvEntry)).href === metaUrl;
}

if (isMainModule()) {
  try {
    const options = parseBrowserSmokeArgs();
    await runBrowserSmoke(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = Number.isInteger(error?.exitCode) ? error.exitCode : 1;
  }
}
