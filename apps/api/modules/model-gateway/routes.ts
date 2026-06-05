import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  ModelGatewayDaemonServiceRequest,
  ModelGatewayProviderDetectRequest,
  ModelGatewayProviderTestRequest,
  ModelGatewaySetActiveProviderRequest,
  ModelGatewaySetProviderSecretRequest,
  ModelGatewayUpsertProviderRequest,
} from "../../../../types/model-gateway.js";
import { isModelGatewayServiceError } from "./service.js";

function sendModelGatewayError(res: Parameters<typeof sendJson>[0], error: unknown): void {
  if (isModelGatewayServiceError(error)) {
    const shape = error.toShape();
    sendJson(res, shape.statusCode, {
      error: shape.code,
      message: shape.message,
    });
    return;
  }

  const message = error instanceof Error ? error.message : "Unexpected Model Gateway service failure";
  sendJson(res, 500, {
    error: "model_gateway_service_failed",
    message,
  });
}

export function registerModelGatewayRoutes(router: StudioRouter): void {
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

  router.get("/v1/models", (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, routeCtx.services.modelGateway.listGatewayModels());
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

  router.post("/v1/messages", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });

  router.post("/claude/v1/messages", async (req, res, routeCtx) => {
    await routeCtx.services.modelGateway.handleGatewayRequest(req, res);
  });
}
