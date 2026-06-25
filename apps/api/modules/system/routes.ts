import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  SystemDeviceTrustApproveRequest,
  SystemTracevaneUpgradeRequest,
  SystemDeviceTrustSettingsPatchRequest,
} from "../../../../types/system.js";

export function registerSystemRoutes(
  router: TracevaneRouter,
  ctx: TracevaneApiContext,
): void {
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

  router.get("/api/system/health", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getHealth());
  });

  router.get("/api/system/diagnostics", async (req, res, routeCtx) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    const includeCommands = url.searchParams.get("commands") !== "0";
    sendJson(res, 200, await routeCtx.services.system.getDiagnostics({ includeCommands }));
  });

  router.get("/api/system/bootstrap", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getBootstrap());
  });

  router.post("/api/system/bootstrap/repair", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.repairBootstrap());
  });

  router.get("/api/system/tracevane-release", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getTracevaneRelease());
  });

  router.get("/api/system/tracevane-upgrade", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getTracevaneUpgradeStatus());
  });

  router.get("/api/system/runtime-summary", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getRuntimeSummary());
  });

  router.get("/api/system/terminal-handoff", async (_req, res, routeCtx) => {
    sendJson(
      res,
      200,
      await routeCtx.services.system.getTerminalActionSuggestions(),
    );
  });

  router.post("/api/system/tracevane-upgrade", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<SystemTracevaneUpgradeRequest>(req);
    sendJson(
      res,
      200,
      await routeCtx.services.system.startTracevaneUpgrade(payload || {}),
    );
  });

  router.get("/api/system/device-trust", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.system.getDeviceTrust());
  });

  router.post(
    "/api/system/device-trust/approve",
    async (req, res, routeCtx) => {
      const payload = await parseJsonBody<SystemDeviceTrustApproveRequest>(req);
      sendJson(
        res,
        200,
        await routeCtx.services.system.approveDeviceTrust(payload),
      );
    },
  );

  router.post(
    "/api/system/device-trust/repair-helper",
    async (_req, res, routeCtx) => {
      sendJson(
        res,
        200,
        await routeCtx.services.system.repairDeviceTrustHelper(),
      );
    },
  );

  router.patch(
    "/api/system/device-trust/settings",
    async (req, res, routeCtx) => {
      const payload =
        await parseJsonBody<SystemDeviceTrustSettingsPatchRequest>(req);
      sendJson(
        res,
        200,
        await routeCtx.services.system.patchDeviceTrustSettings(payload),
      );
    },
  );

  router.get("/api/system/events", async (req, res, routeCtx) => {
    sendJson(
      res,
      200,
      await routeCtx.services.system.listEvents(readLimit(req)),
    );
  });

  router.get("/api/system/events/summary", async (req, res, routeCtx) => {
    sendJson(
      res,
      200,
      await routeCtx.services.system.getEventSummary(readLimit(req)),
    );
  });
}
