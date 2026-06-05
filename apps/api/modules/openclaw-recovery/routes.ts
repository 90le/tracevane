import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  OpenClawRecoveryDaemonServiceRequest,
  OpenClawRecoveryRestoreBackupRequest,
  OpenClawRecoveryRunRequest,
} from "../../../../types/openclaw-recovery.js";

function readLimit(
  req: Parameters<StudioRouter["get"]>[1] extends (
    req: infer R,
    ...args: any[]
  ) => any
    ? R
    : any,
): number {
  const requestUrl = new URL(
    req.url || "/",
    `http://${req.headers.host || "127.0.0.1"}`,
  );
  const raw = Number(requestUrl.searchParams.get("limit") || 100);
  if (!Number.isFinite(raw) || raw <= 0) {
    return 100;
  }
  return Math.floor(raw);
}

export function registerOpenClawRecoveryRoutes(router: StudioRouter): void {
  router.get("/api/openclaw-recovery/status", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.openclawRecovery.getStatus());
  });

  router.get("/api/openclaw-recovery/events", async (req, res, routeCtx) => {
    sendJson(
      res,
      200,
      await routeCtx.services.openclawRecovery.listEvents(readLimit(req)),
    );
  });

  router.get("/api/openclaw-recovery/backups", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.openclawRecovery.listBackups());
  });

  router.post("/api/openclaw-recovery/run", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<OpenClawRecoveryRunRequest>(req);
    const response = await routeCtx.services.openclawRecovery.runRecovery(payload || {});
    sendJson(res, 200, response);
  });

  router.post(
    "/api/openclaw-recovery/restore-backup",
    async (req, res, routeCtx) => {
      const payload =
        await parseJsonBody<OpenClawRecoveryRestoreBackupRequest>(req);
      const response = await routeCtx.services.openclawRecovery.restoreBackup(payload);
      sendJson(res, response.ok ? 200 : 404, response);
    },
  );

  router.get(
    "/api/openclaw-recovery/daemon-service",
    async (_req, res, routeCtx) => {
      sendJson(
        res,
        200,
        await routeCtx.services.openclawRecovery.getDaemonService(),
      );
    },
  );

  router.post(
    "/api/openclaw-recovery/daemon-service",
    async (req, res, routeCtx) => {
      const payload =
        await parseJsonBody<OpenClawRecoveryDaemonServiceRequest>(req);
      sendJson(
        res,
        200,
        await routeCtx.services.openclawRecovery.applyDaemonServiceAction(payload),
      );
    },
  );
}
