import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type { DebugControlSessionRequest, DebugCreateSessionRequest, DebugEvaluateRequest, DebugStopSessionRequest } from "../../../../types/debug.js";

export function registerDebugRoutes(router: TracevaneRouter, ctx: TracevaneApiContext): void {
  router.get("/api/debug/status", (_req, res, routeCtx) => {
    sendJson(res, 200, routeCtx.services.debug.getStatus());
  });

  router.get("/api/debug/sessions", (_req, res, routeCtx) => {
    sendJson(res, 200, routeCtx.services.debug.listSessions());
  });

  router.post("/api/debug/sessions", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<DebugCreateSessionRequest>(req);
    try {
      sendJson(res, 200, await routeCtx.services.debug.createSession(payload));
    } catch (error) {
      sendJson(res, 400, {
        error: "debug_create_session_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/debug/sessions/stop", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<DebugStopSessionRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.debug.stopSession(payload));
    } catch (error) {
      sendJson(res, 400, {
        error: "debug_stop_session_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/debug/sessions/control", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<DebugControlSessionRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.debug.controlSession(payload));
    } catch (error) {
      sendJson(res, 400, {
        error: "debug_control_session_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/debug/sessions/evaluate", async (req, res, routeCtx) => {
    const payload = await parseJsonBody<DebugEvaluateRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.debug.evaluateSession(payload));
    } catch (error) {
      sendJson(res, 400, {
        error: "debug_evaluate_session_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  void ctx;
}
