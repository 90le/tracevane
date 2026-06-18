import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  ChannelConnectorsDaemonRequest,
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorFeishuWebhookRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorCommandSurfaceRequest,
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

export function registerChannelConnectorsRoutes(router: TracevaneRouter): void {
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

  router.post("/api/channel-connectors/commands/surface", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorCommandSurfaceRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.getCommandSurface(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/commands/action", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorCommandActionRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.handleCommandAction(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/adapters/feishu/card-action", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorCommandActionRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.handleCommandAction(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/adapters/feishu/bot-menu", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorCommandActionRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.handleCommandAction(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/adapters/feishu/webhook", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorFeishuWebhookRequest>(req);
      const response = await routeCtx.services.channelConnectors.dispatchFeishuWebhook({
        ...payload,
        sendReply: payload.sendReply !== false,
      });
      if (response.eventKind === "url-verification" && !response.feishuResponse) {
        sendJson(res, response.skippedReason === "feishu_verification_token_mismatch" ? 403 : 400, {
          error: "feishu_webhook_verification_failed",
          skippedReason: response.skippedReason,
        });
        return;
      }
      if (payload.tracevaneDebugResponse === true) {
        sendJson(res, 200, response);
        return;
      }
      sendJson(res, 200, response.feishuResponse || response);
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/adapters/feishu/transport-smoke", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorFeishuTransportSmokeRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.runFeishuTransportSmoke(payload));
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

  router.get("/api/channel-connectors/agent-sessions", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.channelConnectors.getAgentSessions());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/agent-sessions", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorAgentSessionActionRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.manageAgentSessions(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });
}
