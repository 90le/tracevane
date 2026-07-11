import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { LoggerLike, TracevaneServerConfig } from "../../../../types/api.js";
import {
  MODEL_GATEWAY_DAEMON_SERVICE_NAME,
  MODEL_GATEWAY_DEFAULT_HOST,
  MODEL_GATEWAY_DEFAULT_PORT,
  type ModelGatewayDaemonRuntimeMetadata,
  type ModelGatewaySupervisorKind,
} from "../../../../types/model-gateway.js";
import { sendJson, sendNoContent, setCorsHeaders } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import { TracevaneRouter } from "../../core/router.js";
import { removeOwnedRuntimeMetadata } from "../supervisor/index.js";
import { handleModelGatewayRealtimeUnsupportedUpgrade } from "./realtime.js";
import { registerModelGatewayRoutes } from "./routes.js";
import {
  createModelGatewayService,
  resolveModelGatewayPaths,
  type ModelGatewayService,
} from "./service.js";

export interface ModelGatewayDaemonOptions {
  host?: string;
  port?: number;
  supervisor?: ModelGatewaySupervisorKind;
  serviceName?: string;
  logger?: LoggerLike;
}

export interface ModelGatewayDaemon {
  start(): Promise<ModelGatewayDaemonRuntimeMetadata>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getRuntimeMetadata(): ModelGatewayDaemonRuntimeMetadata | null;
  getBaseUrl(): string | null;
}

interface PortLockHandle {
  fd: number;
  path: string;
}

const noopLogger: LoggerLike = {
  info() {},
  warn() {},
  error() {},
};

function nowIso(): string {
  return new Date().toISOString();
}

function buildEndpoint(host: string, port: number, endpointPath = ""): string {
  const normalizedPath = endpointPath
    ? `/${endpointPath.split("/").filter(Boolean).join("/")}`
    : "";
  return `http://${host}:${port}${normalizedPath}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPidAlive(pid: number | null): boolean {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return isRecord(error) && error.code === "EPERM";
  }
}

function removeFileIfPresent(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if (!isRecord(error) || error.code !== "ENOENT") throw error;
  }
}

function writeJsonSecure(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    // Best effort for filesystems that do not support chmod.
  }
}

function readLockPid(filePath: string): number | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { pid?: unknown };
    return typeof parsed.pid === "number" && parsed.pid > 0 ? Math.floor(parsed.pid) : null;
  } catch {
    return null;
  }
}

function acquirePortLock(filePath: string, value: unknown): PortLockHandle {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(filePath, "wx", 0o600);
      fs.writeFileSync(fd, `${JSON.stringify(value, null, 2)}\n`);
      return { fd, path: filePath };
    } catch (error) {
      if (!isRecord(error) || error.code !== "EEXIST") throw error;
      const pid = readLockPid(filePath);
      if (isPidAlive(pid)) {
        throw new Error(`Model Gateway daemon lock is already held by pid ${pid}.`);
      }
      removeFileIfPresent(filePath);
    }
  }
  throw new Error(`Unable to acquire Model Gateway daemon lock at ${filePath}.`);
}

function updatePortLock(lock: PortLockHandle, value: unknown): void {
  fs.ftruncateSync(lock.fd, 0);
  fs.writeSync(lock.fd, `${JSON.stringify(value, null, 2)}\n`, 0);
  fs.fsyncSync(lock.fd);
}

function closePortLock(lock: PortLockHandle | null): void {
  if (!lock) return;
  try {
    fs.closeSync(lock.fd);
  } finally {
    removeFileIfPresent(lock.path);
  }
}

function createDaemonRouteContext(
  config: TracevaneServerConfig,
  logger: LoggerLike,
  modelGateway: ModelGatewayService,
): TracevaneApiContext {
  return {
    config,
    logger,
    sseClients: new Set(),
    services: {
      modelGateway,
    } as unknown as TracevaneApiContext["services"],
  };
}

export function createModelGatewayDaemon(
  config: TracevaneServerConfig,
  options: ModelGatewayDaemonOptions = {},
): ModelGatewayDaemon {
  const paths = resolveModelGatewayPaths(config);
  const host = options.host || MODEL_GATEWAY_DEFAULT_HOST;
  const requestedPort = options.port ?? MODEL_GATEWAY_DEFAULT_PORT;
  const supervisor = options.supervisor || "none";
  const serviceName = options.serviceName || MODEL_GATEWAY_DAEMON_SERVICE_NAME;
  const logger = options.logger || noopLogger;
  const router = new TracevaneRouter();
  registerModelGatewayRoutes(router);

  let server: http.Server | null = null;
  let service = createModelGatewayService(config, {
    runtimeHost: "local-daemon",
    listener: { host, port: requestedPort },
  });
  let lock: PortLockHandle | null = null;
  let metadata: ModelGatewayDaemonRuntimeMetadata | null = null;

  async function stopDaemon(): Promise<void> {
    if (server) {
      const currentServer = server;
      server = null;
      if (currentServer.listening) {
        await new Promise<void>((resolve, reject) => {
          const serverWithConnectionControls = currentServer as http.Server & {
            closeAllConnections?: () => void;
            closeIdleConnections?: () => void;
          };
          serverWithConnectionControls.closeIdleConnections?.();
          const forceCloseTimer = setTimeout(() => {
            serverWithConnectionControls.closeAllConnections?.();
          }, 500);
          forceCloseTimer.unref?.();
          currentServer.close((error) => {
            clearTimeout(forceCloseTimer);
            if (error) reject(error);
            else resolve();
          });
        });
      }
    }

    metadata = null;
    removeOwnedRuntimeMetadata(paths.daemonRuntime, process.pid);
    removeFileIfPresent(paths.daemonPid);
    closePortLock(lock);
    lock = null;
    logger.info("model-gateway-daemon: stopped");
  }

  async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    setCorsHeaders(res);
    if (req.method === "OPTIONS") {
      sendNoContent(res);
      return;
    }

    const routeCtx = createDaemonRouteContext(config, logger, service);
    const handled = await router.handle(req, res, routeCtx);
    if (handled) return;

    const url = new URL(req.url || "/", `http://${req.headers.host || `${host}:${requestedPort}`}`);
    sendJson(res, 404, {
      error: "not_found",
      message: `No route matched ${req.method || "GET"} ${url.pathname}`,
    });
  }

  return {
    async start(): Promise<ModelGatewayDaemonRuntimeMetadata> {
      if (server && metadata) return metadata;

      fs.mkdirSync(paths.root, { recursive: true });
      const startedAt = nowIso();
      lock = acquirePortLock(paths.portLock, {
        version: 1,
        pid: process.pid,
        host,
        port: requestedPort,
        startedAt,
        serviceName,
      });

      server = http.createServer((req, res) => {
        handleRequest(req, res).catch((error) => {
          const message = error instanceof Error ? error.message : "Unexpected Model Gateway daemon failure";
          logger.error("model-gateway-daemon: request failed", error);
          sendJson(res, 500, {
            error: "model_gateway_daemon_failed",
            message,
          });
        });
      });
      server.on("upgrade", (req, socket, head) => {
        const handled = handleModelGatewayRealtimeUnsupportedUpgrade(req, socket, head);
        if (!handled) {
          try { socket.destroy(); } catch {}
        }
      });

      try {
        await new Promise<void>((resolve, reject) => {
          server!.once("error", reject);
          server!.listen(requestedPort, host, resolve);
        });

        const address = server.address() as AddressInfo | null;
        const actualPort = address?.port || requestedPort;
        service = createModelGatewayService(config, {
          runtimeHost: "local-daemon",
          listener: { host, port: actualPort },
        });
        metadata = {
          version: 1,
          updatedAt: nowIso(),
          pid: process.pid,
          startedAt,
          host,
          port: actualPort,
          endpoint: buildEndpoint(host, actualPort, "/v1"),
          supervisor,
          serviceName,
          lockFile: paths.portLock,
        };
        writeJsonSecure(paths.daemonRuntime, metadata);
        fs.writeFileSync(paths.daemonPid, `${process.pid}\n`, { mode: 0o600 });
        updatePortLock(lock, metadata);
        logger.info(`model-gateway-daemon: listening on ${buildEndpoint(host, actualPort)}`);
        return metadata;
      } catch (error) {
        await stopDaemon();
        throw error;
      }
    },

    async stop(): Promise<void> {
      await stopDaemon();
    },

    isRunning(): boolean {
      return server !== null;
    },

    getRuntimeMetadata(): ModelGatewayDaemonRuntimeMetadata | null {
      return metadata;
    },

    getBaseUrl(): string | null {
      return metadata ? buildEndpoint(metadata.host, metadata.port) : null;
    },
  };
}
