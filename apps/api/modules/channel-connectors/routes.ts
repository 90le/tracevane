import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsSaveNativeConfigRequest,
  ChannelConnectorOctoInboundRequest,
  ChannelConnectorOctoTransportSmokeRequest,
} from "../../../../types/channel-connectors.js";

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

  router.get("/api/channel-connectors/config", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getNativeConfig());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.put("/api/channel-connectors/config", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorsSaveNativeConfigRequest>(req);
      sendJson(res, 200, routeCtx.services.channelConnectors.saveNativeConfig(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/adapters/octo/incoming", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorOctoInboundRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.dispatchOctoIncoming(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/adapters/octo/transport-smoke", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorOctoTransportSmokeRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.runOctoTransportSmoke(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/daemon/config", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getDaemonConfig());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/daemon/service", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.channelConnectors.getDaemonService());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/daemon/service", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorsDaemonRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.manageDaemonService(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/daemon/logs", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getDaemonLogs());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });
}
