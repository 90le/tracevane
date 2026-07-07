import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type { LspCompletionRequest, LspDiagnosticsRequest, LspPositionRequest } from "../../../../types/lsp.js";

export function registerLspRoutes(router: TracevaneRouter, ctx: TracevaneApiContext): void {
  router.get("/api/lsp/status", async (_req, res, routeCtx) => {
    sendJson(res, 200, routeCtx.services.lsp.getStatus());
  });

  router.post("/api/lsp/diagnostics", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspDiagnosticsRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.diagnoseDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_diagnostics_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/hover", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspPositionRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.hoverDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_hover_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/completion", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspCompletionRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.completeDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_completion_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/definition", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspPositionRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.defineDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_definition_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/references", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspPositionRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.referenceDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_references_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  void ctx;
}
