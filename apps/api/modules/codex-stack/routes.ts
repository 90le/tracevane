import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  CodexStackCcConnectConfigPatchRequest,
  CodexStackConfigPatchRequest,
  CodexStackFinalizeRequest,
  CodexStackInstallRequest,
  CodexStackRepairRequest,
} from "../../../../types/codex-stack.js";
import { isCodexStackServiceError } from "./service.js";

function sendCodexStackError(res: Parameters<typeof sendJson>[0], error: unknown): void {
  if (isCodexStackServiceError(error)) {
    const shape = error.toShape();
    sendJson(res, shape.statusCode, {
      error: shape.code,
      message: shape.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected Codex Stack service failure";
  sendJson(res, 500, {
    error: "codex_stack_service_failed",
    message,
  });
}

export function registerCodexStackRoutes(router: StudioRouter): void {
  router.get("/api/codex-stack/summary", async (req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.codexStack.getSummary(req));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.post("/api/codex-stack/management/enable", async (req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.codexStack.enableManagement(req));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.post("/api/codex-stack/check", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.codexStack.runCheck());
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.post("/api/codex-stack/install", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<CodexStackInstallRequest>(req);
      sendJson(res, 202, await routeCtx.services.codexStack.startInstall(req, payload));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.post("/api/codex-stack/repair", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<CodexStackRepairRequest>(req);
      sendJson(res, 202, await routeCtx.services.codexStack.startRepair(req, payload));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.get("/api/codex-stack/jobs/:jobId", (_req, res, routeCtx, params) => {
    try {
      const job = routeCtx.services.codexStack.getJob(params.jobId);
      if (!job) {
        sendJson(res, 404, {
          error: "codex_stack_job_not_found",
          message: `Codex Stack job '${params.jobId}' not found`,
        });
        return;
      }
      sendJson(res, 200, { ok: true, job });
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.get("/api/codex-stack/logs/:unitId", async (req, res, routeCtx, params) => {
    try {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      const lines = Number(url.searchParams.get("lines") || 160);
      sendJson(res, 200, await routeCtx.services.codexStack.readLogs(params.unitId, lines));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.post("/api/codex-stack/services/:serviceId/:action", async (req, res, routeCtx, params) => {
    try {
      sendJson(
        res,
        200,
        await routeCtx.services.codexStack.controlService(req, params.serviceId, params.action),
      );
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.patch("/api/codex-stack/config", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<CodexStackConfigPatchRequest>(req);
      sendJson(res, 200, await routeCtx.services.codexStack.patchConfig(req, payload));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.get("/api/codex-stack/cc-connect/config", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.codexStack.getCcConnectConfig());
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.patch("/api/codex-stack/cc-connect/config", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<CodexStackCcConnectConfigPatchRequest>(req);
      sendJson(res, 200, await routeCtx.services.codexStack.patchCcConnectConfig(req, payload));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });

  router.post("/api/codex-stack/cc-connect/finalize", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<CodexStackFinalizeRequest>(req);
      sendJson(res, 202, await routeCtx.services.codexStack.finalizeCcConnect(req, payload));
    } catch (error) {
      sendCodexStackError(res, error);
    }
  });
}
