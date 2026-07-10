import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  ChannelConnectorsDaemonRequest,
  ChannelConnectorsV3ConfigApplyRequest,
  ChannelConnectorsV3ConfigPlanRequest,
  ChannelConnectorsV3Config,
  ChannelConnectorAccount,
  ChannelConnectorDeliveryPolicy,
  ChannelConnectorDeliveryTarget,
  ChannelConnectorV3RoutingPreviewRequest,
  ChannelConnectorAgentSessionActionRequest,
  ChannelConnectorCommandActionRequest,
  ChannelConnectorFeishuAppRegistrationStartRequest,
  ChannelConnectorFeishuWebhookRequest,
  ChannelConnectorFeishuTransportSmokeRequest,
  ChannelConnectorCommandSurfaceRequest,
  ChannelConnectorOctoInboundRequest,
  ChannelConnectorOctoTransportSmokeRequest,
} from "../../../../types/channel-connectors.js";

function sendChannelConnectorsError(res: Parameters<typeof sendJson>[0], error: unknown): void {
  const message = error instanceof Error ? error.message : "Unexpected Channel Connectors service failure";
  const issues = typeof error === "object" && error !== null && Array.isArray((error as { issues?: unknown }).issues)
    ? (error as { issues: unknown[] }).issues
    : undefined;
  const status = issues ? 400
    : /changed since|changed after planning|differs from the planned/i.test(message) ? 409
      : /not found/i.test(message) ? 404
        : /required|invalid|expired|disabled/i.test(message) ? 400
          : 500;
  sendJson(res, status, {
    error: "channel_connectors_service_failed",
    message,
    ...(issues ? { issues } : {}),
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

  router.get("/api/channel-connectors/config/v3", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getV3Config());
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.put("/api/channel-connectors/config/v3", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<{ config?: ChannelConnectorsV3Config }>(req);
      if (!payload.config) throw new Error("Channel Connectors v3 config payload is required.");
      sendJson(res, 200, routeCtx.services.channelConnectors.saveV3Config(payload.config));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/config/v3/plan", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorsV3ConfigPlanRequest>(req);
      sendJson(res, 200, routeCtx.services.channelConnectors.planV3Config(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.put("/api/channel-connectors/config/v3/apply", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorsV3ConfigApplyRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.applyV3Config(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.put("/api/channel-connectors/config/v3/accounts/:accountId", async (req, res, routeCtx, params) => {
    try {
      const account = await parseJsonBody<ChannelConnectorAccount>(req);
      if (account.id !== params.accountId) throw new Error("Channel account URL id must match the payload id.");
      sendJson(res, 200, routeCtx.services.channelConnectors.upsertV3Account(account));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.delete("/api/channel-connectors/config/v3/accounts/:accountId", (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.deleteV3Account(params.accountId));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/config/v3/accounts/:accountId/secrets", (req, res, routeCtx, params) => {
    if (req.headers["x-tracevane-secret-reveal"] !== "account-editor") {
      sendJson(res, 403, {
        error: "secret_reveal_confirmation_required",
        message: "Secret reveal requires an explicit account editor request.",
      });
      return;
    }
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getAccountSecrets(params.accountId));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.put("/api/channel-connectors/config/v3/targets/:targetId", async (req, res, routeCtx, params) => {
    try {
      const target = await parseJsonBody<ChannelConnectorDeliveryTarget>(req);
      if (target.id !== params.targetId) throw new Error("Delivery target URL id must match the payload id.");
      sendJson(res, 200, routeCtx.services.channelConnectors.upsertV3Target(target));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.delete("/api/channel-connectors/config/v3/targets/:targetId", (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.deleteV3Target(params.targetId));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.put("/api/channel-connectors/config/v3/policies/:policyId", async (req, res, routeCtx, params) => {
    try {
      const policy = await parseJsonBody<ChannelConnectorDeliveryPolicy>(req);
      if (policy.id !== params.policyId) throw new Error("Delivery policy URL id must match the payload id.");
      sendJson(res, 200, routeCtx.services.channelConnectors.upsertV3Policy(policy));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.delete("/api/channel-connectors/config/v3/policies/:policyId", (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.deleteV3Policy(params.policyId));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/config/v3/routing-preview", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorV3RoutingPreviewRequest>(req);
      sendJson(res, 200, routeCtx.services.channelConnectors.previewV3Routing(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/accounts/feishu/registration/start", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ChannelConnectorFeishuAppRegistrationStartRequest>(req);
      sendJson(res, 200, await routeCtx.services.channelConnectors.startFeishuAppRegistration(payload));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.get("/api/channel-connectors/accounts/feishu/registration/:sessionId", (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.getFeishuAppRegistration(params.sessionId));
    } catch (error) {
      sendChannelConnectorsError(res, error);
    }
  });

  router.post("/api/channel-connectors/accounts/feishu/registration/:sessionId/cancel", (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.channelConnectors.cancelFeishuAppRegistration(params.sessionId));
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
