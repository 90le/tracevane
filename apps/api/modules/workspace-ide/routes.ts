import type http from "node:http";
import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import {
  WorkspaceIdeProviderError,
  type CreateWorkspaceIdeProviderSessionInput,
  type WorkspaceIdeProviderConfig,
  type WorkspaceIdeProviderLifecycleController,
} from "./provider-service.js";

export interface WorkspaceIdeProviderRoutesOptions {
  config: WorkspaceIdeProviderConfig;
  controller: WorkspaceIdeProviderLifecycleController;
}

interface CreateIdeProviderSessionPayload {
  workspaceRoot?: string;
  port?: number;
}

export function registerWorkspaceIdeProviderRoutes(
  router: TracevaneRouter,
  _ctx: TracevaneApiContext,
  options: WorkspaceIdeProviderRoutesOptions,
): void {
  router.get("/api/workspace/ide-providers", (_req, res) => {
    sendJson(res, 200, {
      defaultKind: options.config.kind,
      enabled: options.config.enabled,
      providers: [
        { kind: "native-workbench", embedded: true },
        { kind: "openvscode-server", embedded: false },
        { kind: "code-server", embedded: false },
        { kind: "theia", embedded: false },
      ],
    });
  });

  router.get("/api/workspace/ide-provider-sessions", (_req, res) => {
    sendJson(res, 200, { sessions: options.controller.registry.listSessions() });
  });

  router.get("/api/workspace/ide-provider-sessions/:sessionId", (_req, res, _routeCtx, params) => {
    const session = options.controller.registry.getSession(params.sessionId || "");
    if (!session) {
      sendJson(res, 404, { error: "workspace_ide_provider_session_not_found" });
      return;
    }
    sendJson(res, 200, { session });
  });

  router.post("/api/workspace/ide-providers/:kind/sessions", async (req, res, _routeCtx, params) => {
    try {
      const payload = await parseJsonBody<CreateIdeProviderSessionPayload>(req);
      const input: CreateWorkspaceIdeProviderSessionInput = {
        kind: options.config.kind,
        workspaceRoot: payload.workspaceRoot || process.cwd(),
        port: payload.port,
      };
      if (params.kind !== options.config.kind) {
        sendJson(res, 400, {
          error: "workspace_ide_provider_kind_mismatch",
          message: `Configured IDE provider is '${options.config.kind}', not '${params.kind}'.`,
        });
        return;
      }
      const session = await options.controller.startSession(options.config, input);
      sendJson(res, session.status === "failed" ? 500 : 201, { session });
    } catch (error) {
      sendWorkspaceIdeProviderRouteError(res, error);
    }
  });

  router.post("/api/workspace/ide-provider-sessions/:sessionId/stop", async (_req, res, _routeCtx, params) => {
    try {
      const session = await options.controller.stopSession(params.sessionId || "");
      sendJson(res, 200, { session });
    } catch (error) {
      sendWorkspaceIdeProviderRouteError(res, error);
    }
  });
}

function sendWorkspaceIdeProviderRouteError(res: http.ServerResponse, error: unknown): void {
  if (error instanceof WorkspaceIdeProviderError) {
    const status = error.code === "workspace_ide_provider_session_not_found" ? 404 : 400;
    sendJson(res, status, { error: error.code, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : "Unexpected IDE provider route failure";
  sendJson(res, 500, { error: "workspace_ide_provider_route_failed", message });
}
