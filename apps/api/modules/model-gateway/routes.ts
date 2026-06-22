import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  ModelGatewayActiveRouteSmokeRequest,
  ModelGatewayClientAuthUpdateRequest,
  ModelGatewayCodexAccountLoginPollRequest,
  ModelGatewayCodexAccountLoginStartRequest,
  ModelGatewayDaemonServiceRequest,
  ModelGatewayApplyAppConnectionRequest,
  ModelGatewayRollbackAppConnectionRequest,
  ModelGatewayProviderAccountUpdateRequest,
  ModelGatewayProviderDetectRequest,
  ModelGatewayProviderTestRequest,
  ModelGatewaySetActiveProviderRequest,
  ModelGatewaySetProviderSecretRequest,
  ModelGatewayUpdateAppConnectionProfileRequest,
  ModelGatewayUpsertProviderRequest,
} from "../../../../types/model-gateway.js";
import { sendModelGatewayRealtimeUnsupported } from "./realtime.js";
import { isModelGatewayServiceError } from "./service.js";
import {
  MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
  MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE,
  MODEL_GATEWAY_UNSUPPORTED_HTTP_ROUTES,
  modelGatewayEndpointUnsupportedPayload,
} from "./unsupported-endpoints.js";

function sendModelGatewayError(res: Parameters<typeof sendJson>[0], error: unknown): void {
  if (isModelGatewayServiceError(error)) {
    const shape = error.toShape();
    if (shape.statusCode === 401) {
      res.setHeader("WWW-Authenticate", "Bearer realm=\"Tracevane Gateway\"");
    }
    sendJson(res, shape.statusCode, {
      error: {
        code: shape.code,
        message: shape.message,
        ...(shape.details ? { details: shape.details } : {}),
      },
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected Model Gateway service failure";
  sendJson(res, 500, {
    error: {
      code: "model_gateway_service_failed",
      message,
    },
  });
}

function sendModelGatewayUnsupportedEndpoint(
  res: Parameters<typeof sendJson>[0],
  endpoint: string,
  alternatives: string[] = [],
): void {
  sendJson(res, 501, modelGatewayEndpointUnsupportedPayload(endpoint, alternatives));
}

function registerUnsupportedEndpoint(
  router: TracevaneRouter,
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  endpoint = path,
  code = MODEL_GATEWAY_ENDPOINT_UNSUPPORTED_CODE,
): void {
  const handler = (_req: unknown, res: Parameters<typeof sendJson>[0]) => {
    if (code === MODEL_GATEWAY_REALTIME_UNSUPPORTED_CODE) {
      sendModelGatewayRealtimeUnsupported(res, endpoint);
      return;
    }
    sendModelGatewayUnsupportedEndpoint(res, endpoint);
  };
  if (method === "GET") router.get(path, handler);
  else if (method === "POST") router.post(path, handler);
  else if (method === "PUT") router.put(path, handler);
  else if (method === "PATCH") router.patch(path, handler);
  else router.delete(path, handler);
}

function registerModelGatewayUnsupportedEndpoints(router: TracevaneRouter): void {
  for (const route of MODEL_GATEWAY_UNSUPPORTED_HTTP_ROUTES) {
    registerUnsupportedEndpoint(router, route.method, route.path, route.endpoint, route.code);
  }
}

export function registerModelGatewayRoutes(router: TracevaneRouter): void {
  router.get("/gateway/status", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.getStatus());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/status", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.getStatus());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/runtime", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.getRuntime());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/usage", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.getUsageLedger());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/client-auth", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.getClientAuth());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/client-auth", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayClientAuthUpdateRequest>(req);
      sendJson(res, 200, routeCtx.services.modelGateway.updateClientAuth(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/app-connections", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.listAppConnections());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/app-connections/profile", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayUpdateAppConnectionProfileRequest>(req);
      sendJson(res, 200, routeCtx.services.modelGateway.updateAppConnectionProfile(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/app-connections/apply", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayApplyAppConnectionRequest>(req);
      sendJson(res, 200, routeCtx.services.modelGateway.applyAppConnections(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/app-connections/:appId/apply", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<ModelGatewayApplyAppConnectionRequest>(req);
      sendJson(res, 200, routeCtx.services.modelGateway.applyAppConnection(req, {
        ...payload,
        appId: params.appId as ModelGatewayApplyAppConnectionRequest["appId"],
      }));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/app-connections/:appId/rollback", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<ModelGatewayRollbackAppConnectionRequest>(req);
      sendJson(res, 200, routeCtx.services.modelGateway.rollbackAppConnection(req, {
        ...payload,
        appId: params.appId as ModelGatewayRollbackAppConnectionRequest["appId"],
      }));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/daemon-service", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.getDaemonService());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/daemon-service", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayDaemonServiceRequest>(req);
      sendJson(res, 200, await routeCtx.services.modelGateway.manageDaemonService(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/gateway/providers", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.listProviders());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/providers", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.listProviders());
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/detect-provider", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayProviderDetectRequest>(req);
      sendJson(res, 200, await routeCtx.services.modelGateway.detectProvider(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/account-providers/codex/login/start", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayCodexAccountLoginStartRequest>(req);
      sendJson(res, 200, await routeCtx.services.modelGateway.startCodexAccountLogin(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/account-providers/codex/login/poll", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayCodexAccountLoginPollRequest>(req);
      sendJson(res, 200, await routeCtx.services.modelGateway.pollCodexAccountLogin(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/providers", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayUpsertProviderRequest>(req);
      sendJson(res, 200, {
        ok: true,
        provider: routeCtx.services.modelGateway.upsertProvider(req, payload),
      });
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.put("/api/model-gateway/providers/:providerId", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<ModelGatewayUpsertProviderRequest>(req);
      sendJson(res, 200, {
        ok: true,
        provider: routeCtx.services.modelGateway.upsertProvider(req, {
          ...payload,
          provider: {
            ...(payload.provider || {}),
            id: params.providerId,
          },
        }),
      });
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/providers/:providerId/accounts/:accountId", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<ModelGatewayProviderAccountUpdateRequest>(req);
      sendJson(
        res,
        200,
        routeCtx.services.modelGateway.updateProviderAccount(req, params.providerId, params.accountId, payload),
      );
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/providers/:providerId/accounts/:accountId/refresh", async (req, res, routeCtx, params) => {
    try {
      sendJson(
        res,
        200,
        await routeCtx.services.modelGateway.refreshProviderAccount(req, params.providerId, params.accountId),
      );
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.delete("/api/model-gateway/providers/:providerId", async (req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.deleteProvider(req, params.providerId));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/active-provider", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewaySetActiveProviderRequest>(req);
      sendJson(res, 200, routeCtx.services.modelGateway.setActiveProvider(req, payload));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/active-route-smoke", async (req, res, routeCtx) => {
    try {
      const payload = await parseJsonBody<ModelGatewayActiveRouteSmokeRequest>(req);
      const result = await routeCtx.services.modelGateway.testActiveRoute(req, payload);
      sendJson(res, result.ok ? 200 : 502, result);
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/api/model-gateway/providers/:providerId/secret", (req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.getProviderSecret(req, params.providerId));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/providers/:providerId/secret", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<ModelGatewaySetProviderSecretRequest>(req);
      sendJson(res, 200, {
        ok: true,
        provider: routeCtx.services.modelGateway.setProviderSecret(req, params.providerId, payload),
      });
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/api/model-gateway/providers/:providerId/test", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<ModelGatewayProviderTestRequest>(req);
      const result = await routeCtx.services.modelGateway.testProvider(req, params.providerId, payload);
      const statusCode = result.ok
        ? 200
        : result.error?.code === "model_gateway_adapter_required"
          ? 501
          : 502;
      sendJson(res, statusCode, result);
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.get("/v1/models", (req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.listGatewayModels(req));
    } catch (error) {
      sendModelGatewayError(res, error);
    }
  });

  router.post("/v1/chat/completions", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/responses", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/responses/compact", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/images/generations", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/images/edits", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/audio/transcriptions", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/audio/translations", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/audio/speech", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/v1/messages", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/claude/v1/messages", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  registerModelGatewayUnsupportedEndpoints(router);
}
