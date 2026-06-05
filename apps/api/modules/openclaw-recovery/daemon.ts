import http from "node:http";
import path from "node:path";
import type { StudioServerConfig } from "../../../../types/api.js";
import type { OpenClawRecoveryPolicy } from "../../../../types/openclaw-recovery.js";
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

function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
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
  config: StudioServerConfig,
  options: OpenClawRecoveryDaemonOptions = {},
): OpenClawRecoveryDaemon {
  const logger = options.logger || console;
  let interval: NodeJS.Timeout | null = null;
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
    repairInFlight = runOpenClawRecoveryRepair(config, {
      trigger: "auto",
      policy,
    }).finally(() => {
      repairInFlight = null;
    });
    await repairInFlight;
  }

  async function checkOnce(): Promise<void> {
    const state = readRecoveryState(config);
    const policy = state.policy;
    const checkedAt = new Date();
    const gatewayReachable = await probeOpenClawGateway(
      config.gatewayPort,
      policy.probeTimeoutMs,
    );
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

    await maybeRepair(nextState.policy);
  }

  function startControlServer(): void {
    const port = options.controlPort === undefined
      ? Number(process.env.OPENCLAW_RECOVERY_CONTROL_PORT || 0)
      : options.controlPort;
    if (!port || controlServer) return;
    const token = ensureRecoveryToken(config);
    controlServer = http.createServer(async (req, res) => {
      const auth = String(req.headers.authorization || "");
      const headerToken = String(req.headers["x-openclaw-recovery-token"] || "");
      if (auth !== `Bearer ${token}` && headerToken !== token) {
        unauthorized(res);
        return;
      }
      const url = new URL(req.url || "/", "http://127.0.0.1");
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
        const repair = await runOpenClawRecoveryRepair(config, {
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
          "studio",
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
    controlServer.listen(port, "127.0.0.1", () => {
      logger.info(`openclaw-recovery-daemon: local control listening on 127.0.0.1:${port}`);
    });
  }

  return {
    async start(): Promise<void> {
      if (interval) return;
      startedAt = new Date().toISOString();
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
      await checkOnce();
      const policy = readRecoveryState(config).policy;
      interval = setInterval(() => {
        checkOnce().catch((error) => logger.error("openclaw-recovery-daemon: check failed", error));
      }, policy.checkIntervalMs);
      startControlServer();
    },

    async stop(): Promise<void> {
      if (interval) clearInterval(interval);
      interval = null;
      if (controlServer) {
        await new Promise<void>((resolve) => controlServer!.close(() => resolve()));
        controlServer = null;
      }
    },

    checkOnce,
  };
}
