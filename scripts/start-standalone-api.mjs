import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  createStandaloneTracevaneConfig,
  createTracevaneContext,
  createTracevaneServer,
  syncStandaloneTracevaneConfig,
} from '../dist/apps/api/index.js';
import {
  disposeProcessSessionSupervisor,
} from '../dist/apps/api/modules/supervisor/session-supervisor.js';

function normalizePort(value, fallback) {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 ? Math.floor(port) : fallback;
}

const apiPort = normalizePort(process.env.TRACEVANE_API_PORT, 3761);
const config = createStandaloneTracevaneConfig({
  port: apiPort,
});
const context = createTracevaneContext({
  config,
  logger: console,
});
const server = createTracevaneServer(context);

let shuttingDown = false;
let configWatcher = null;

function syncConfig(reason) {
  const previousGatewayPort = config.gatewayPort;
  const changed = syncStandaloneTracevaneConfig(config);
  const nextGatewayPort = config.gatewayPort;

  if (changed) {
    console.info(
      `[tracevane-api] ${reason}: gateway port ${previousGatewayPort} -> ${nextGatewayPort}`
    );
    return;
  }

  console.info(
    `[tracevane-api] ${reason}: gateway port ${nextGatewayPort}`
  );
}

function watchOpenClawConfig() {
  const configDir = path.dirname(config.openclawConfigFile);
  const configFile = path.basename(config.openclawConfigFile);

  try {
    configWatcher = fs.watch(configDir, (_eventType, filename) => {
      if (filename && filename !== configFile) return;
      syncConfig('openclaw.json changed');
    });
  } catch (error) {
    console.warn(
      '[tracevane-api] failed to watch openclaw.json:',
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;

  console.info(`[tracevane-api] received ${signal}, shutting down`);

  if (configWatcher) {
    configWatcher.close();
    configWatcher = null;
  }

  try {
    let shutdownError = null;
    try {
      await server.stop();
    } catch (error) {
      shutdownError = error;
    }
    try {
      await disposeProcessSessionSupervisor();
    } catch (error) {
      shutdownError ||= error;
    }
    if (shutdownError) throw shutdownError;
    process.exit(0);
  } catch (error) {
    console.error(
      '[tracevane-api] shutdown failed:',
      error instanceof Error ? error.stack || error.message : String(error)
    );
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  void shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});

process.on('uncaughtException', (error) => {
  console.error('[tracevane-api] uncaught exception:', error);
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (error) => {
  console.error('[tracevane-api] unhandled rejection:', error);
  void shutdown('unhandledRejection');
});

syncConfig('startup');
watchOpenClawConfig();
await server.start();

console.info(`[tracevane-api] standalone server ready at http://127.0.0.1:${config.port}`);

await new Promise(() => {});
