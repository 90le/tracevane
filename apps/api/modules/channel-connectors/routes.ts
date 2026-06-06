import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioRouter } from "../../core/router.js";
import type { CcBridgeServiceRequest } from "../../../../types/channel-connectors.js";

function sendChannelConnectorsError(res: Parameters<typeof sendJson>[0], error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected Channel Connectors service failure";
  sendJson(res, 500, {
    error: "channel_connectors_service_failed",
    message,
  });
}

export function registerChannelConnectorsRoutes(router: StudioRouter): void {
  router.get("/api/channel-connectors/status", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.channelConnectors.getStatus());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/cc-bridge/config", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getCcBridgeConfig());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/cc-bridge/service", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.channelConnectors.getCcBridgeService());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/cc-bridge/service", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<CcBridgeServiceRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.manageCcBridgeService(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/cc-bridge/logs", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getCcBridgeLogs());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });
}
