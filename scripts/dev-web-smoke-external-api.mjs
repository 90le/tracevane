import { closeSync, mkdirSync, openSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  assertTcpPortAvailable,
  prepareWebSmoke,
  readPort,
  servePreparedWebSmoke,
} from "./dev-web-smoke.mjs";
import { withServer } from "./lib/with-server.mjs";

const DEFAULT_API_PORT = 3796;
const DEFAULT_WEB_PORT = 5176;
const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function createExternalApiSmokeConfig(options = {}) {
  const rootDir = path.resolve(options.rootDir || ROOT_DIR);
  const sourceEnv = options.env || process.env;
  const apiPort = readPort(sourceEnv, "TRACEVANE_API_PORT", DEFAULT_API_PORT);
  const webPort = readPort(sourceEnv, "TRACEVANE_WEB_PORT", DEFAULT_WEB_PORT);
  const apiLogFile = path.resolve(
    rootDir,
    sourceEnv.TRACEVANE_EXTERNAL_API_LOG_FILE ||
      path.join("tmp", `tracevane-external-api-${apiPort}.log`),
  );
  const webLogFile = path.resolve(
    rootDir,
    sourceEnv.TRACEVANE_EXTERNAL_WEB_LOG_FILE ||
      path.join("tmp", `tracevane-external-web-${webPort}.log`),
  );
  const env = {
    ...sourceEnv,
    TRACEVANE_API_PORT: String(apiPort),
    TRACEVANE_EXTERNAL_API_LOG_FILE: apiLogFile,
    TRACEVANE_EXTERNAL_WEB_LOG_FILE: webLogFile,
    TRACEVANE_USE_EXTERNAL_API: "1",
    TRACEVANE_WEB_PORT: String(webPort),
  };
  return {
    apiLogFile,
    apiPort,
    apiScript: path.join(rootDir, "scripts", "start-standalone-api.mjs"),
    env,
    rootDir,
    webLogFile,
    webPort,
  };
}

async function verifyLspStatus(config, timeoutMs) {
  const url = `http://127.0.0.1:${config.apiPort}/api/lsp/status`;
  let response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(Math.max(1, timeoutMs ?? 5_000)),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    throw new Error(
      `Tracevane external API did not expose /api/lsp/status on ${config.apiPort}; log: ${config.apiLogFile}`,
      { cause: error },
    );
  } finally {
    try {
      await response?.body?.cancel();
    } catch {
      // The status result above remains authoritative if body release fails.
    }
  }
}

export async function runExternalApiSmoke(options = {}, callback) {
  const config = createExternalApiSmokeConfig(options);
  mkdirSync(path.dirname(config.apiLogFile), { recursive: true });
  mkdirSync(path.dirname(config.webLogFile), { recursive: true });
  let apiLogFd;
  let webLogFd;

  try {
    apiLogFd = openSync(config.apiLogFile, "w");
    webLogFd = openSync(config.webLogFile, "w");
    const apiStdio = ["ignore", apiLogFd, apiLogFd];
    const webStdio = ["ignore", webLogFd, webLogFd];

    await assertTcpPortAvailable("127.0.0.1", config.apiPort);
    return await withServer(
      {
        args: [config.apiScript],
        command: process.execPath,
        cwd: config.rootDir,
        env: config.env,
        intervalMs: options.intervalMs,
        stdio: apiStdio,
        timeoutMs: options.timeoutMs,
        url: `http://127.0.0.1:${config.apiPort}/api/files/summary`,
      },
      async () => {
        await verifyLspStatus(config, options.timeoutMs);
        const webConfig = await prepareWebSmoke({
          ...options,
          env: config.env,
          rootDir: config.rootDir,
          stdio: webStdio,
        });
        return servePreparedWebSmoke(webConfig, callback, {
          ...options,
          stdio: webStdio,
        });
      },
    );
  } finally {
    if (webLogFd !== undefined) closeSync(webLogFd);
    if (apiLogFd !== undefined) closeSync(apiLogFd);
  }
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
    await runExternalApiSmoke();
  } catch (error) {
    console.error(error instanceof Error ? error.stack || error.message : error);
    process.exitCode = error?.exitCode || 1;
  }
}
