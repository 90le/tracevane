import {
  parseJsonBody,
  sendJson,
  sendSseEvent,
  startSse,
} from "../../core/http.js";
import type { StudioApiContext } from "../../core/context.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  TerminalEndPayload,
  TerminalInstallRequestId,
  TerminalLaunchPayload,
  TerminalTargetKind,
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

  router.get(
    "/api/terminal/sessions/:sessionId/stream",
    async (req, res, routeCtx, params) => {
      const streamId = `http-stream-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "127.0.0.1"}`,
      );
      const sendTerminalEvent = (event: unknown): boolean => {
        if (res.writableEnded) return false;
        sendSseEvent(res, "terminal", event);
        return !res.writableEnded;
      };
      let keepAliveTimer: NodeJS.Timeout | null = null;
      const cleanup = (): void => {
        if (keepAliveTimer) {
          clearInterval(keepAliveTimer);
          keepAliveTimer = null;
        }
        routeCtx.services.terminal.detachStreamClient(
          params.sessionId,
          streamId,
        );
      };

      startSse(res);
      keepAliveTimer = setInterval(() => {
        sendSseEvent(res, "ping", { now: Date.now() });
      }, 15_000);
      keepAliveTimer.unref?.();
      req.on("close", cleanup);
      res.on("close", cleanup);

      try {
        const pinnedParam = url.searchParams.get("pinned");
        const attached = routeCtx.services.terminal.attachStreamClient(
          {
            sid: params.sessionId,
            profileId: url.searchParams.get("profileId"),
            targetKind: url.searchParams.get(
              "targetKind",
            ) as TerminalTargetKind | null,
            cwd: url.searchParams.get("cwd"),
            pinned:
              pinnedParam === null
                ? undefined
                : pinnedParam === "1" || pinnedParam === "true",
            lastSeq: Number(url.searchParams.get("lastSeq") || 0) || null,
            instanceId: url.searchParams.get("instanceId"),
            skipReplay:
              url.searchParams.get("skipReplay") === "1"
              || url.searchParams.get("skipReplay") === "true",
            resume:
              url.searchParams.get("resume") === "1"
              || url.searchParams.get("resume") === "true",
          },
          {
            streamId,
            emit: sendTerminalEvent,
          },
        );
        for (const event of attached.events) {
          sendTerminalEvent(event);
        }
      } catch (error) {
        sendSseEvent(res, "terminal", {
          type: "error",
          message:
            error instanceof Error ? error.message : "terminal_stream_failed",
        });
        res.end();
      }
    },
  );

  router.get("/api/terminal/actions", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.terminal.listWorkspaceActions());
  });

  router.get("/api/terminal/profiles", async (_req, res, routeCtx) => {
    sendJson(res, 200, await routeCtx.services.terminal.listWorkspaceProfiles());
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
