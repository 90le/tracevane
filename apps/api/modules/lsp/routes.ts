import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  LspCodeActionRequest,
  LspCompletionRequest,
  LspDiagnosticsRequest,
  LspFormattingRequest,
  LspPositionRequest,
  LspRenameRequest,
  LspSemanticTokensRequest,
  LspWorkspaceSymbolsRequest,
  LspWorkspaceEditApplyRequest,
  LspWorkspaceEditPreviewRequest,
} from "../../../../types/lsp.js";
import { applyWorkspaceEdit, previewWorkspaceEdit } from "./workspaceEdit.js";

export function registerLspRoutes(router: TracevaneRouter, ctx: TracevaneApiContext): void {
  router.get("/api/lsp/status", async (_req, res, routeCtx) => {
    sendJson(res, 200, routeCtx.services.lsp.getStatus());
  });

  router.post("/api/lsp/diagnostics", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspDiagnosticsRequest>(req);
    try {
      sendJson(res, 200, await routeCtx.services.lsp.diagnoseDocument(body));
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
      sendJson(res, 200, await routeCtx.services.lsp.hoverDocument(body));
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
      sendJson(res, 200, await routeCtx.services.lsp.completeDocument(body));
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
      sendJson(res, 200, await routeCtx.services.lsp.defineDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_definition_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });


  router.post("/api/lsp/semantic-tokens", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspSemanticTokensRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.semanticTokens(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_semantic_tokens_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });



  router.post("/api/lsp/workspace-symbols", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspWorkspaceSymbolsRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.workspaceSymbols(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_workspace_symbols_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/rename", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspRenameRequest>(req);
    try {
      sendJson(res, 200, routeCtx.services.lsp.renameDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_rename_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/formatting", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspFormattingRequest>(req);
    try {
      sendJson(res, 200, await routeCtx.services.lsp.formatDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_formatting_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/code-actions", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspCodeActionRequest>(req);
    try {
      sendJson(res, 200, await routeCtx.services.lsp.codeActions(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_code_actions_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/workspace-edit/preview", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspWorkspaceEditPreviewRequest>(req);
    try {
      sendJson(res, 200, previewWorkspaceEdit(routeCtx.config, body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_workspace_edit_preview_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/workspace-edit/apply", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspWorkspaceEditApplyRequest>(req);
    try {
      sendJson(res, 200, applyWorkspaceEdit(routeCtx.config, routeCtx.services.files, body));
    } catch (error) {
      const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? Number((error as { statusCode: number }).statusCode)
        : 400;
      sendJson(res, statusCode, {
        error: "lsp_workspace_edit_apply_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  router.post("/api/lsp/references", async (req, res, routeCtx) => {
    const body = await parseJsonBody<LspPositionRequest>(req);
    try {
      sendJson(res, 200, await routeCtx.services.lsp.referenceDocument(body));
    } catch (error) {
      sendJson(res, 400, {
        error: "lsp_references_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  });

  void ctx;
}
