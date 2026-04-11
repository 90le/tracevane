import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioApiContext } from "../../core/context.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  AgentBindingInput,
  AgentCreatePayload,
  AgentDeletePayload,
  AgentDocName,
  AgentDocumentSavePayload,
  AgentUpdatePayload,
} from "../../../../types/agents.js";
import { isAgentsServiceError } from "./service.js";

function sendAgentError(
  res: Parameters<typeof sendJson>[0],
  error: unknown,
): void {
  if (isAgentsServiceError(error)) {
    const shape = error.toShape();
    sendJson(res, shape.statusCode, {
      error: shape.code,
      message: shape.message,
    });
    return;
  }

  const message =
    error instanceof Error
      ? error.message
      : "Unexpected agents service failure";
  sendJson(res, 500, {
    error: "agents_service_failed",
    message,
  });
}

export function registerAgentsRoutes(
  router: StudioRouter,
  ctx: StudioApiContext,
): void {
  router.get("/api/agents", (_req, res) => {
    try {
      sendJson(res, 200, ctx.services.agents.getSummary());
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  router.post("/api/agents", async (req, res) => {
    try {
      const payload = await parseJsonBody<AgentCreatePayload>(req);
      sendJson(res, 201, ctx.services.agents.createAgent(payload));
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  router.get("/api/agents/:id", (_req, res, routeCtx, params) => {
    try {
      const detail = routeCtx.services.agents.getDetail(params.id);
      if (!detail) {
        sendJson(res, 404, {
          error: "agent_not_found",
          message: `Agent '${params.id}' not found`,
        });
        return;
      }
      sendJson(res, 200, detail);
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  router.put("/api/agents/:id", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<AgentUpdatePayload>(req);
      sendJson(
        res,
        200,
        routeCtx.services.agents.updateAgent(params.id, payload),
      );
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  router.delete("/api/agents/:id", async (req, res, routeCtx, params) => {
    try {
      const payload = await parseJsonBody<AgentDeletePayload>(req);
      sendJson(
        res,
        200,
        routeCtx.services.agents.deleteAgent(params.id, payload),
      );
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  router.post(
    "/api/agents/:id/bindings",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<AgentBindingInput>(req);
        sendJson(
          res,
          201,
          routeCtx.services.agents.createBinding(params.id, payload),
        );
      } catch (error) {
        sendAgentError(res, error);
      }
    },
  );

  router.put(
    "/api/agents/:id/bindings/:bindingId",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<AgentBindingInput>(req);
        sendJson(
          res,
          200,
          routeCtx.services.agents.updateBinding(
            params.id,
            params.bindingId,
            payload,
          ),
        );
      } catch (error) {
        sendAgentError(res, error);
      }
    },
  );

  router.delete(
    "/api/agents/:id/bindings/:bindingId",
    (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          routeCtx.services.agents.deleteBinding(params.id, params.bindingId),
        );
      } catch (error) {
        sendAgentError(res, error);
      }
    },
  );

  router.delete("/api/agents/:id/sessions", (_req, res, routeCtx, params) => {
    try {
      sendJson(res, 200, routeCtx.services.agents.clearSessions(params.id));
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  router.delete(
    "/api/agents/:id/sessions/:sessionId",
    (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          routeCtx.services.agents.deleteSession(params.id, params.sessionId),
        );
      } catch (error) {
        sendAgentError(res, error);
      }
    },
  );

  router.get("/api/agents/:id/docs/:doc", (_req, res, routeCtx, params) => {
    try {
      sendJson(
        res,
        200,
        routeCtx.services.agents.getDocument(
          params.id,
          params.doc as AgentDocName,
        ),
      );
    } catch (error) {
      sendAgentError(res, error);
    }
  });

  router.put(
    "/api/agents/:id/docs/:doc",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<AgentDocumentSavePayload>(req);
        sendJson(
          res,
          200,
          routeCtx.services.agents.saveDocument(
            params.id,
            params.doc as AgentDocName,
            payload,
          ),
        );
      } catch (error) {
        sendAgentError(res, error);
      }
    },
  );
}
