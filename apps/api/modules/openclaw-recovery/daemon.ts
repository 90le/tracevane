import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import type { TracevaneServerConfig } from "../../../../types/api.js";
import {
  OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME,
  OPENCLAW_RECOVERY_DEFAULT_HOST,
  OPENCLAW_RECOVERY_DEFAULT_PORT,
  type OpenClawRecoveryDaemonRuntimeMetadata,
  type OpenClawRecoveryPolicy,
  type OpenClawRecoverySupervisorKind,
} from "../../../../types/openclaw-recovery.js";
import { captureOpenClawRecoveryInstallManifest } from "./cli-bootstrap.js";
import { probeOpenClawGateway } from "./probe.js";
import {
  restoreOpenClawRecoveryBackup,
  runOpenClawRecoveryRepair,
} from "./repair.js";
import {
  appendRecoveryEvent,
  createRecoveryEvent,
  ensureRecoveryToken,
  listRecoveryBackups,
  listRecoveryEvents,
  readRecoveryState,
  writeRecoveryState,
} from "./store.js";
import { resolveOpenClawRecoveryPaths } from "./paths.js";
import { removeOwnedRuntimeMetadata } from "../supervisor/index.js";

export interface OpenClawRecoveryDaemon {
  start(): Promise<void>;
  stop(): Promise<void>;
  checkOnce(): Promise<void>;
}

export interface OpenClawRecoveryDaemonOptions {
  logger?: {
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
  controlPort?: number | null;
  supervisor?: OpenClawRecoverySupervisorKind;
  serviceName?: string;
  gatewayProbe?: typeof probeOpenClawGateway;
  captureInstallManifest?: typeof captureOpenClawRecoveryInstallManifest;
  recoveryRepair?: typeof runOpenClawRecoveryRepair;
  beforeControlListen?: () => Promise<void>;
  listenControlServer?: (
    server: http.Server,
    port: number,
    host: string,
  ) => void;
  controlCloseTimeoutMs?: number;
}

function addMs(date: Date, ms: number): string {
  return new Date(date.getTime() + ms).toISOString();
}

function msSince(value: string | null): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : Math.max(0, Date.now() - parsed);
}

function repairCooldownSatisfied(
  lastFinishedAt: string | null,
  policy: OpenClawRecoveryPolicy,
): boolean {
  if (!lastFinishedAt) return true;
  return msSince(lastFinishedAt) >= policy.repairCooldownMs;
}

function unauthorized(res: http.ServerResponse): void {
  res.statusCode = 401;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "unauthorized" }));
}

function forbidden(res: http.ServerResponse): void {
  res.statusCode = 403;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify({ error: "forbidden" }));
}

function allowsLoopbackControlOrigin(req: http.IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== "string" || !origin || origin !== origin.trim()) {
    return false;
  }
  try {
    const parsed = new URL(origin);
    const hostname = parsed.hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
    return parsed.origin === origin
      && (parsed.protocol === "http:" || parsed.protocol === "https:")
      && (hostname === "localhost"
        || hostname === "127.0.0.1"
        || hostname === "::1");
  } catch {
    return false;
  }
}

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function readControlRequestUrl(
  req: http.IncomingMessage,
  res: http.ServerResponse,
): URL | null {
  try {
    return new URL(req.url || "/", "http://127.0.0.1");
  } catch {
    sendJson(res, 400, { error: "invalid_request_url" });
    return null;
  }
}

function writeRuntimeMetadata(
  filePath: string,
  metadata: OpenClawRecoveryDaemonRuntimeMetadata,
): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(
      temporaryPath,
      `${JSON.stringify(metadata, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 },
    );
    fs.renameSync(temporaryPath, filePath);
    try {
      fs.chmodSync(filePath, 0o600);
    } catch {
      // Best effort for filesystems that do not support chmod.
    }
  } finally {
    try {
      fs.unlinkSync(temporaryPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        const parsed = raw ? JSON.parse(raw) : {};
        resolve(parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? parsed as Record<string, unknown>
          : {});
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

export function createOpenClawRecoveryDaemon(
  config: TracevaneServerConfig,
  options: OpenClawRecoveryDaemonOptions = {},
): OpenClawRecoveryDaemon {
  const logger = options.logger || console;
  const paths = resolveOpenClawRecoveryPaths(config);
  const controlPort = options.controlPort === undefined
    ? Number(
        process.env.OPENCLAW_RECOVERY_CONTROL_PORT
        || OPENCLAW_RECOVERY_DEFAULT_PORT,
      )
    : options.controlPort;
  const supervisor = options.supervisor ?? "none";
  const serviceName = options.serviceName
    || OPENCLAW_RECOVERY_DAEMON_SERVICE_NAME;
  const gatewayProbe = options.gatewayProbe ?? probeOpenClawGateway;
  const captureInstallManifest = options.captureInstallManifest
    ?? captureOpenClawRecoveryInstallManifest;
  const recoveryRepair = options.recoveryRepair ?? runOpenClawRecoveryRepair;
  const beforeControlListen = options.beforeControlListen;
  const listenControlServer = options.listenControlServer
    ?? ((server: http.Server, port: number, host: string) => {
      server.listen(port, host);
    });
  const controlCloseTimeoutMs = Math.max(
    1,
    options.controlCloseTimeoutMs ?? 1_000,
  );
  let interval: NodeJS.Timeout | null = null;
  let startPromise: Promise<void> | null = null;
  let stopPromise: Promise<void> | null = null;
  let activeStartup: { cancelled: boolean; failed: boolean } | null = null;
  let cancelPendingControlListen: ((error: Error) => void) | null = null;
  let controlServer: http.Server | null = null;
  let startedAt: string | null = null;
  let repairInFlight: Promise<unknown> | null = null;

  async function maybeRepair(policy: OpenClawRecoveryPolicy): Promise<void> {
    if (!policy.enabled || repairInFlight) return;
    const state = readRecoveryState(config);
    if (
      state.probe.failureDurationMs < policy.failureThresholdMs ||
      !repairCooldownSatisfied(state.lastRepair?.finishedAt || null, policy)
    ) {
      return;
    }
    repairInFlight = recoveryRepair(config, {
      trigger: "auto",
      policy,
    }).finally(() => {
      repairInFlight = null;
    });
    await repairInFlight;
  }

  async function checkOnce(
    cancelled: () => boolean = () => false,
  ): Promise<void> {
    const state = readRecoveryState(config);
    const policy = state.policy;
    const checkedAt = new Date();
    const gatewayReachable = await gatewayProbe(
      config.gatewayPort,
      policy.probeTimeoutMs,
    );
    if (cancelled()) return;
    const failureStartedAt = gatewayReachable
      ? null
      : state.probe.failureStartedAt || checkedAt.toISOString();
    const failureDurationMs = gatewayReachable ? 0 : msSince(failureStartedAt);
    const nextState = writeRecoveryState(config, {
      ...state,
      status: repairInFlight
        ? "repairing"
        : gatewayReachable
          ? "healthy"
          : failureDurationMs >= policy.failureThresholdMs
            ? "failed"
            : "degraded",
      daemon: {
        pid: process.pid,
        startedAt,
        heartbeatAt: checkedAt.toISOString(),
        version: config.version,
      },
      probe: {
        gatewayReachable,
        checkedAt: checkedAt.toISOString(),
        failureStartedAt,
        failureDurationMs,
        nextCheckAt: addMs(checkedAt, policy.checkIntervalMs),
      },
      notes: gatewayReachable
        ? ["Gateway probe is healthy."]
        : [`Gateway probe failed for ${Math.round(failureDurationMs / 1000)} seconds.`],
    });

    if (!gatewayReachable && !state.probe.failureStartedAt) {
      appendRecoveryEvent(
        config,
        createRecoveryEvent({
          kind: "gateway_probe_failed",
          severity: "warning",
          title: "OpenClaw gateway 探测失败",
          summary: "Recovery daemon detected a gateway probe failure.",
          status: "open",
          details: { gatewayPort: config.gatewayPort },
        }),
      );
    }

    if (cancelled()) return;
    await maybeRepair(nextState.policy);
  }

  async function stopControlServer(): Promise<void> {
    const server = controlServer;
    if (controlServer === server) controlServer = null;
    if (!server) return;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timeout: NodeJS.Timeout | null = null;
      const cleanup = () => {
        if (timeout) clearTimeout(timeout);
        timeout = null;
        server.off("listening", onListening);
        server.off("error", onError);
        server.off("close", onClose);
      };
      const settle = (error?: Error) => {
        if (settled) return;
        settled = true;
        cleanup();
        if (error) reject(error);
        else resolve();
      };
      const close = () => {
        server.off("listening", onListening);
        server.close((error) => settle(error || undefined));
        server.closeAllConnections?.();
      };
      const onListening = () => close();
      const onError = () => settle();
      const onClose = () => settle();
      const onTimeout = () => {
        const closeLateListener = () => {
          server.close(() => {});
          server.closeAllConnections?.();
        };
        const ignoreLateError = () => {};
        server.once("listening", closeLateListener);
        server.once("error", ignoreLateError);
        cancelPendingControlListen?.(
          new Error("Recovery control listener close timed out."),
        );
        settle();
      };
      server.once("error", onError);
      server.once("close", onClose);
      if (server.listening) close();
      else {
        server.once("listening", onListening);
        timeout = setTimeout(onTimeout, controlCloseTimeoutMs);
      }
    });
  }

  async function startControlServer(): Promise<number | null> {
    if (!controlPort) return null;
    if (controlServer) {
      return (controlServer.address() as AddressInfo | null)?.port
        ?? controlPort;
    }
    const token = ensureRecoveryToken(config);
    const server = http.createServer(async (req, res) => {
      const url = readControlRequestUrl(req, res);
      if (!url) return;
      if (req.method === "GET" && url.pathname === "/health") {
        sendJson(res, 200, { ok: true, status: "ready" });
        return;
      }
      if (!allowsLoopbackControlOrigin(req)) {
        forbidden(res);
        return;
      }
      const auth = String(req.headers.authorization || "");
      const headerToken = String(req.headers["x-openclaw-recovery-token"] || "");
      if (auth !== `Bearer ${token}` && headerToken !== token) {
        unauthorized(res);
        return;
      }
      if (req.method === "GET" && url.pathname === "/status") {
        sendJson(res, 200, readRecoveryState(config));
        return;
      }
      if (req.method === "GET" && url.pathname === "/events") {
        sendJson(res, 200, listRecoveryEvents(config));
        return;
      }
      if (req.method === "GET" && url.pathname === "/backups") {
        sendJson(res, 200, listRecoveryBackups(config));
        return;
      }
      if (req.method === "POST" && url.pathname === "/run") {
        const state = readRecoveryState(config);
        const repair = await recoveryRepair(config, {
          trigger: "manual",
          policy: state.policy,
        });
        sendJson(res, 200, { ok: repair.ok, repair, state: readRecoveryState(config) });
        return;
      }
      if (req.method === "POST" && url.pathname === "/restore-backup") {
        const payload = await readJsonBody(req);
        const backupId = String(payload.backupId || payload.backupPath || "");
        const backup = listRecoveryBackups(config).find(
          (item) => item.id === backupId || item.fileName === backupId,
        );
        if (!backup) {
          sendJson(res, 404, { ok: false, error: "backup_not_found" });
          return;
        }
        const allowedDir = path.resolve(
          config.openclawRoot,
          "tracevane",
          "recovery",
          "backups",
        );
        const resolvedBackup = path.resolve(backup.path);
        if (!resolvedBackup.startsWith(`${allowedDir}${path.sep}`)) {
          sendJson(res, 403, { ok: false, error: "backup_outside_recovery_dir" });
          return;
        }
        restoreOpenClawRecoveryBackup(config, resolvedBackup);
        appendRecoveryEvent(
          config,
          createRecoveryEvent({
            kind: "backup_restored",
            severity: "success",
            title: "OpenClaw 配置备份已恢复",
            summary: backup.id,
            status: "succeeded",
            details: { backupId: backup.id, controlPlane: "loopback" },
          }),
        );
        sendJson(res, 200, {
          ok: true,
          restoredBackup: backup,
          state: readRecoveryState(config),
        });
        return;
      }
      sendJson(res, 404, { error: "not_found" });
    });
    controlServer = server;
    try {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => {
          server.off("error", onError);
          server.off("listening", onListening);
          if (cancelPendingControlListen === cancel) {
            cancelPendingControlListen = null;
          }
        };
        const onError = (error: Error) => {
          cleanup();
          reject(error);
        };
        const onListening = () => {
          cleanup();
          resolve();
        };
        const cancel = (error: Error) => {
          cleanup();
          reject(error);
        };
        cancelPendingControlListen = cancel;
        server.once("error", onError);
        server.once("listening", onListening);
        listenControlServer(
          server,
          controlPort,
          OPENCLAW_RECOVERY_DEFAULT_HOST,
        );
      });
    } catch (error) {
      if (controlServer === server) controlServer = null;
      throw error;
    }
    server.on("error", (error) => {
      logger.error("openclaw-recovery-daemon: control server failed", error);
    });
    const actualPort = (server.address() as AddressInfo | null)?.port
      ?? controlPort;
    logger.info(
      `openclaw-recovery-daemon: local control listening on ${OPENCLAW_RECOVERY_DEFAULT_HOST}:${actualPort}`,
    );
    return actualPort;
  }

  return {
    async start(): Promise<void> {
      while (stopPromise) {
        await stopPromise;
      }
      while (startPromise) {
        const pending = startPromise;
        const pendingGeneration = activeStartup;
        if (!pendingGeneration?.cancelled) return pending;
        try {
          await pending;
        } catch (error) {
          if (!pendingGeneration.cancelled) throw error;
        }
      }
      if (interval) return;
      const startup = { cancelled: false, failed: false };
      activeStartup = startup;
      const starting = (async () => {
        startedAt = new Date().toISOString();
        try {
          await beforeControlListen?.();
          if (startup.cancelled) return;
          const actualPort = await startControlServer();
          if (startup.cancelled) {
            await stopControlServer();
            return;
          }
          const updatedAt = new Date().toISOString();
          writeRuntimeMetadata(paths.runtimePath, {
            version: 1,
            updatedAt,
            pid: process.pid,
            startedAt,
            host: OPENCLAW_RECOVERY_DEFAULT_HOST,
            port: actualPort,
            endpoint: actualPort === null
              ? null
              : `http://${OPENCLAW_RECOVERY_DEFAULT_HOST}:${actualPort}`,
            supervisor,
            serviceName,
          });
          captureInstallManifest(config).catch((error) => {
            logger.warn("openclaw-recovery-daemon: CLI install manifest capture failed", error);
          });
          appendRecoveryEvent(
            config,
            createRecoveryEvent({
              kind: "daemon_started",
              severity: "info",
              title: "OpenClaw 自愈守护进程已启动",
              summary: `Recovery daemon pid ${process.pid}`,
              status: "running",
              details: { pid: process.pid },
            }),
          );
          await checkOnce(() => startup.cancelled);
          if (startup.cancelled) return;
          const policy = readRecoveryState(config).policy;
          interval = setInterval(
            () => checkOnce(() => startup.cancelled).catch(
              (error) => logger.error(
                "openclaw-recovery-daemon: check failed",
                error,
              ),
            ),
            policy.checkIntervalMs,
          );
        } catch (error) {
          const wasCancelled = startup.cancelled;
          await stopControlServer();
          removeOwnedRuntimeMetadata(paths.runtimePath, process.pid);
          if (wasCancelled) return;
          startup.failed = true;
          throw error;
        }
      })();
      startPromise = starting;
      try {
        await starting;
      } finally {
        if (startPromise === starting) startPromise = null;
        if (
          activeStartup === startup
          && (startup.cancelled || startup.failed)
        ) {
          activeStartup = null;
        }
      }
    },

    async stop(): Promise<void> {
      if (stopPromise) return stopPromise;
      const stopping = (async () => {
        if (activeStartup) activeStartup.cancelled = true;
        if (interval) clearInterval(interval);
        interval = null;
        try {
          await stopControlServer();
        } finally {
          removeOwnedRuntimeMetadata(paths.runtimePath, process.pid);
        }
      })();
      stopPromise = stopping;
      try {
        await stopping;
      } finally {
        if (stopPromise === stopping) stopPromise = null;
      }
    },

    checkOnce,
  };
}
