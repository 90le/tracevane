import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  OpenClawRecoveryDaemonServiceRequest,
  OpenClawRecoveryRestoreBackupRequest,
  OpenClawRecoveryRunRequest,
} from "../../../../types/openclaw-recovery.js";
import { isOpenClawRecoveryServiceError } from "./service.js";

function sendOpenClawRecoveryError(
  res: Parameters<typeof sendJson>[0],
  error: unknown,
): void {
  if (isOpenClawRecoveryServiceError(error)) {
    sendJson(res, error.statusCode, {
      error: {
        code: error.code,
        message: error.message,
        retryable: false,
        source: "tracevane",
      },
    });
    return;
  }
  if (error instanceof SyntaxError) {
    sendJson(res, 400, {
      error: {
        code: "invalid_json",
        message: "Request body must contain valid JSON.",
        retryable: false,
        source: "tracevane",
      },
    });
    return;
  }
  throw error;
}

function readLimit(
  req: Parameters<TracevaneRouter["get"]>[1] extends (
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

function readPagination(
  req: Parameters<TracevaneRouter["get"]>[1] extends (
    req: infer R,
    ...args: any[]
  ) => any
    ? R
    : any,
): { page: number; pageSize: number; paged: boolean } {
  const requestUrl = new URL(
    req.url || "/",
    `http://${req.headers.host || "127.0.0.1"}`,
  );
  const rawPage = requestUrl.searchParams.get("page");
  const rawPageSize = requestUrl.searchParams.get("pageSize");
  const page = Number(rawPage || 1);
  const pageSize = Number(rawPageSize || 10);
  return {
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
    pageSize: Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : 10,
    paged: rawPage !== null || rawPageSize !== null,
  };
}

export function registerOpenClawRecoveryRoutes(router: TracevaneRouter): void {
  router.get("/api/openclaw-recovery/status", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.openclawRecovery.getStatus());
  });

  router.get("/api/openclaw-recovery/events", async (req, res, routeCtx) => {
    const pagination = readPagination(req);
    if (pagination.paged) {
      sendJson(
        res,
        200,
        await routeCtx.services.openclawRecovery.listEventsPage(
          pagination.page,
          pagination.pageSize,
        ),
      );
      return;
    }
    sendJson(
      res,
      200,
      await routeCtx.services.openclawRecovery.listEvents(readLimit(req)),
    );
  });

  router.get("/api/openclaw-recovery/backups", async (req, res, routeCtx) => {
    const pagination = readPagination(req);
    sendJson(
      res,
      200,
      pagination.paged
        ? await routeCtx.services.openclawRecovery.listBackupsPage(
            pagination.page,
            pagination.pageSize,
          )
        : await routeCtx.services.openclawRecovery.listBackups(),
    );
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
      try {
        const payload =
          await parseJsonBody<OpenClawRecoveryDaemonServiceRequest | null>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.openclawRecovery.applyDaemonServiceAction(
            payload,
            req,
          ),
        );
      } catch (error) {
        sendOpenClawRecoveryError(res, error);
      }
    },
  );
}
