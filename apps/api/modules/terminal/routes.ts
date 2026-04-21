import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioApiContext } from "../../core/context.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  TerminalEndPayload,
  TerminalInstallRequestId,
  TerminalLaunchPayload,
} from "../../../../types/terminal.js";

export function registerTerminalRoutes(
  router: StudioRouter,
  ctx: StudioApiContext,
): void {
  router.get("/api/terminal/status", async (_req, res) => {
    sendJson(res, 200, await ctx.services.terminal.getStatus());
  });

  router.get("/api/terminal/check", async (_req, res) => {
    sendJson(res, 200, await ctx.services.terminal.getStatus());
  });

  router.get("/api/terminal/sessions", async (_req, res, routeCtx) => {
    sendJson(
      res,
      200,
      await routeCtx.services.terminal.listPersistedSessions(),
    );
  });

  router.get(
    "/api/terminal/sessions/:sessionId",
    async (_req, res, routeCtx, params) => {
      const session = await routeCtx.services.terminal.getPersistedSession(
        params.sessionId,
      );
      if (!session) {
        sendJson(res, 404, {
          error: "not_found",
          message: `terminal session not found: ${params.sessionId}`,
        });
        return;
      }
      sendJson(res, 200, session);
    },
  );

  router.get(
    "/api/terminal/sessions/:sessionId/ledger",
    async (_req, res, routeCtx, params) => {
      const session = await routeCtx.services.terminal.getPersistedSession(
        params.sessionId,
      );
      if (!session) {
        sendJson(res, 404, {
          error: "not_found",
          message: `terminal session not found: ${params.sessionId}`,
        });
        return;
      }
      sendJson(
        res,
        200,
        await routeCtx.services.terminal.listSessionLedger(params.sessionId),
      );
    },
  );

  router.get("/api/terminal/actions", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.terminal.listWorkspaceActions());
  });

  router.post(
    "/api/terminal/sessions/:sessionId/rename",
    async (req, res, routeCtx, params) => {
      const body = await parseJsonBody<{ title?: string }>(req);
      const title = String(body.title || "");
      const terminal = routeCtx.services.terminal;
      const session = await terminal.renamePersistedSession(
        params.sessionId,
        title,
      );
      if (!session) {
        sendJson(res, 404, {
          error: "not_found",
          message: `terminal session not found: ${params.sessionId}`,
        });
        return;
      }
      sendJson(res, 200, session);
    },
  );

  router.post(
    "/api/terminal/sessions/:sessionId/delete",
    async (_req, res, routeCtx, params) => {
      const result = await routeCtx.services.terminal.deletePersistedSession(
        params.sessionId,
      );
      if (!result.success) {
        if (result.reason === "session_active") {
          sendJson(res, 409, {
            error: "conflict",
            message:
              "terminal session is active and must be ended before delete",
          });
          return;
        }

        sendJson(res, 404, {
          error: "not_found",
          message: `terminal session not found: ${params.sessionId}`,
        });
        return;
      }
      sendJson(res, 200, result);
    },
  );

  router.post("/api/terminal/install", async (req, res, routeCtx) => {
    const body = await parseJsonBody<{ cli?: TerminalInstallRequestId }>(req);
    const target = body.cli || "all-missing";
    sendJson(res, 200, await routeCtx.services.terminal.installCli(target));
  });

  router.post("/api/terminal/install/stream", async (req, res, routeCtx) => {
    const body = await parseJsonBody<{ cli?: TerminalInstallRequestId }>(req);
    const target = body.cli || "all-missing";

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    try {
      await routeCtx.services.terminal.streamInstallCli(
        target,
        async (event) => {
          if (res.writableEnded) return;
          res.write(`${JSON.stringify(event)}\n`);
        },
      );
    } catch (error) {
      if (!res.writableEnded) {
        res.write(
          `${JSON.stringify({
            type: "error",
            message:
              error instanceof Error
                ? error.message
                : "terminal_install_failed",
          })}\n`,
        );
      }
    } finally {
      res.end();
    }
  });

  router.post("/api/terminal/launch", async (req, res, routeCtx) => {
    const body = await parseJsonBody<TerminalLaunchPayload>(req);
    sendJson(res, 200, await routeCtx.services.terminal.getLaunchCommand(body));
  });

  router.post("/api/terminal/end", async (req, res, routeCtx) => {
    const body = await parseJsonBody<TerminalEndPayload>(req);
    sendJson(res, 200, await routeCtx.services.terminal.endSession(body));
  });
}
