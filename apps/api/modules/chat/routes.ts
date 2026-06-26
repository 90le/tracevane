import fs from "node:fs";
import type http from "node:http";
import { parseJsonBody, sendJson } from "../../core/http.js";
import type { TracevaneApiContext } from "../../core/context.js";
import type { TracevaneRouter } from "../../core/router.js";
import type {
  ChatAssignSessionsToFolderRequest,
  ChatCreateSessionRequest,
  ChatCreateOrganizerFolderRequest,
  ChatPatchQueueEntryRequest,
  ChatResolvePermissionRequest,
  ChatPatchOrganizerFolderRequest,
  ChatPatchSessionRequest,
  ChatHistorySearchContentFilter,
  ChatHistorySearchRoleFilter,
  ChatSendRequest,
} from "../../../../types/chat.js";
import { isChatServiceError } from "./errors.js";
import { buildContentDisposition } from "./media-bridge.js";
import {
  buildChatDiagnosticsSummary,
  buildChatSessionRuntimeSummary,
} from "./runtime-summary.js";
import { buildHistorySearchSummary } from "./history-search-summary.js";

function sendChatError(
  res: Parameters<typeof sendJson>[0],
  error: unknown,
): void {
  if (isChatServiceError(error)) {
    const shape = error.toShape();
    sendJson(res, shape.statusCode, { error: shape.error });
    return;
  }

  sendJson(res, 500, {
    error: {
      code: "internal_error",
      message:
        error instanceof Error
          ? error.message
          : "Unexpected chat service failure",
      retryable: false,
      source: "tracevane",
    },
  });
}

export function registerChatRoutes(
  router: TracevaneRouter,
  ctx: TracevaneApiContext,
): void {
  function readLimit(
    req: Parameters<TracevaneRouter["get"]>[1] extends (
      req: infer R,
      ...args: any[]
    ) => any
      ? R
      : never,
    fallback = 50,
  ): number {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "127.0.0.1"}`,
    );
    const raw = Number(url.searchParams.get("limit") || fallback);
    return Number.isFinite(raw)
      ? Math.min(100, Math.max(1, Math.trunc(raw)))
      : fallback;
  }

  function readBooleanQuery(
    req: Parameters<TracevaneRouter["get"]>[1] extends (
      req: infer R,
      ...args: any[]
    ) => any
      ? R
      : never,
    key: string,
    fallback: boolean,
  ): boolean {
    const url = new URL(
      req.url || "/",
      `http://${req.headers.host || "127.0.0.1"}`,
    );
    const raw = (url.searchParams.get(key) || "").trim().toLowerCase();
    if (!raw) {
      return fallback;
    }
    if (raw === "1" || raw === "true" || raw === "yes") {
      return true;
    }
    if (raw === "0" || raw === "false" || raw === "no") {
      return false;
    }
    return fallback;
  }

  router.get("/api/chat/health", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.chat.getHealth());
    } catch (error) {
      sendChatError(res, error);
    }
  });

  router.get("/api/chat/bootstrap", async (req, res, routeCtx) => {
    try {
      const url = new URL(
        req.url || "/",
        `http://${req.headers.host || "127.0.0.1"}`,
      );
      const recentLimit = (() => {
        const raw = Number(url.searchParams.get("recentLimit") || 40);
        return Number.isFinite(raw)
          ? Math.min(100, Math.max(1, Math.trunc(raw)))
          : 40;
      })();
      sendJson(res, 200, await routeCtx.services.chat.getBootstrap({
        sessionKey: url.searchParams.get("sessionKey"),
        recentLimit,
        historyLimit: (() => {
          const raw = Number(url.searchParams.get("historyLimit") || 24);
          return Number.isFinite(raw)
            ? Math.min(100, Math.max(1, Math.trunc(raw)))
            : 24;
        })(),
      }));
    } catch (error) {
      sendChatError(res, error);
    }
  });

  router.get("/api/chat/organizer", async (_req, res, routeCtx) => {
    try {
      sendJson(res, 200, await routeCtx.services.chat.getOrganizer());
    } catch (error) {
      sendChatError(res, error);
    }
  });

  router.post("/api/chat/organizer/folders", async (req, res, routeCtx) => {
    try {
      const payload =
        await parseJsonBody<ChatCreateOrganizerFolderRequest>(req);
      sendJson(res, 200, await routeCtx.services.chat.createFolder(payload));
    } catch (error) {
      sendChatError(res, error);
    }
  });

  router.patch(
    "/api/chat/organizer/folders/:folderId",
    async (req, res, routeCtx, params) => {
      try {
        const payload =
          await parseJsonBody<ChatPatchOrganizerFolderRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.patchFolder(params.folderId, payload),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.delete(
    "/api/chat/organizer/folders/:folderId",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.deleteFolder(params.folderId),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.patch("/api/chat/organizer/sessions", async (req, res, routeCtx) => {
    try {
      const payload =
        await parseJsonBody<ChatAssignSessionsToFolderRequest>(req);
      sendJson(
        res,
        200,
        await routeCtx.services.chat.assignSessionsToFolder(payload),
      );
    } catch (error) {
      sendChatError(res, error);
    }
  });

  router.get(
    "/api/chat/agents/:agentId/sessions",
    async (req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.listSessions(params.agentId, {
            limit: readLimit(req, 200),
            includeDerivedTitles: readBooleanQuery(req, "includeDerivedTitles", true),
            includeLastMessage: readBooleanQuery(req, "includeLastMessage", true),
            localOnly: readBooleanQuery(req, "localOnly", false),
            includeGateway: readBooleanQuery(req, "includeGateway", false),
          }),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.get(
    "/api/chat/sessions/:sessionKey/history",
    async (req, res, routeCtx, params) => {
      try {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "127.0.0.1"}`,
        );
        const payload = await routeCtx.services.chat.getHistory(
          params.sessionKey,
          {
            before: url.searchParams.get("before"),
            after: url.searchParams.get("after"),
            anchor: url.searchParams.get("anchor"),
            day: url.searchParams.get("day"),
            limit: readLimit(req, 50),
          },
        );
        const runtimeSummary = buildChatSessionRuntimeSummary(payload.runtime);
        const diagnosticsSummary = buildChatDiagnosticsSummary(
          payload.diagnostics,
        );
        sendJson(res, 200, {
          ...payload,
          runtime: {
            ...payload.runtime,
            state: runtimeSummary.state,
            activeRunId: runtimeSummary.activeRunId,
            gatewayConnected: runtimeSummary.gatewayConnected,
            sessionWritable: runtimeSummary.sessionWritable,
            lastEventAt: runtimeSummary.lastEventAt,
            lastAckAt: runtimeSummary.lastAckAt,
            lastErrorCode: runtimeSummary.lastErrorCode,
          },
          diagnostics: {
            ...payload.diagnostics,
            gatewayReachable: diagnosticsSummary.gatewayReachable,
            historyTruncated: diagnosticsSummary.historyTruncated,
            truncationMode: diagnosticsSummary.truncationMode,
          },
        });
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.get(
    "/api/chat/sessions/:sessionKey/stream",
    async (req, res, routeCtx, params) => {
      try {
        await routeCtx.services.chat.openEventStream(
          params.sessionKey,
          req,
          res,
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.get(
    "/api/chat/sessions/:sessionKey/search",
    async (req, res, routeCtx, params) => {
      try {
        const url = new URL(
          req.url || "/",
          `http://${req.headers.host || "127.0.0.1"}`,
        );
        const role = (url.searchParams.get("role") ||
          "all") as ChatHistorySearchRoleFilter;
        const content = (url.searchParams.get("content") ||
          "all") as ChatHistorySearchContentFilter;
        const payload = await routeCtx.services.chat.searchHistory(
          params.sessionKey,
          {
            query: url.searchParams.get("q") || "",
            role,
            content,
            day: url.searchParams.get("day"),
            before: url.searchParams.get("before"),
            after: url.searchParams.get("after"),
            limit: readLimit(req, 50),
          },
        );
        const runtimeSummary = buildChatSessionRuntimeSummary(payload.runtime);
        const diagnosticsSummary = buildChatDiagnosticsSummary(
          payload.diagnostics,
        );
        const searchSummary = buildHistorySearchSummary({
          query: payload.query,
          day: payload.day,
          roleFilter: payload.roleFilter,
          contentFilter: payload.contentFilter,
          matches: payload.matches,
        });
        sendJson(res, 200, {
          ...payload,
          query: searchSummary.query,
          day: searchSummary.day,
          roleFilter: searchSummary.roleFilter,
          contentFilter: searchSummary.contentFilter,
          runtime: {
            ...payload.runtime,
            state: runtimeSummary.state,
            activeRunId: runtimeSummary.activeRunId,
            gatewayConnected: runtimeSummary.gatewayConnected,
            sessionWritable: runtimeSummary.sessionWritable,
            lastEventAt: runtimeSummary.lastEventAt,
            lastAckAt: runtimeSummary.lastAckAt,
            lastErrorCode: runtimeSummary.lastErrorCode,
          },
          diagnostics: {
            ...payload.diagnostics,
            gatewayReachable: diagnosticsSummary.gatewayReachable,
            historyTruncated: diagnosticsSummary.historyTruncated,
            truncationMode: diagnosticsSummary.truncationMode,
          },
        });
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.get(
    "/api/chat/sessions/:sessionKey/dates",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.getHistoryDates(params.sessionKey),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.post(
    "/api/chat/agents/:agentId/sessions",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatCreateSessionRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.createSession(params.agentId, payload),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.patch(
    "/api/chat/sessions/:sessionKey",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatPatchSessionRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.patchSession(params.sessionKey, payload),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.get(
    "/api/chat/sessions/:sessionKey/queue",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.getQueue(params.sessionKey),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.post(
    "/api/chat/sessions/:sessionKey/queue",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatSendRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.enqueue(params.sessionKey, payload),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.patch(
    "/api/chat/sessions/:sessionKey/queue/:entryId",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatPatchQueueEntryRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.patchQueueEntry(
            params.sessionKey,
            params.entryId,
            payload,
          ),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.delete(
    "/api/chat/sessions/:sessionKey/queue/:entryId",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.deleteQueueEntry(
            params.sessionKey,
            params.entryId,
          ),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );


  router.post(
    "/api/chat/sessions/:sessionKey/send",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatSendRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.send(params.sessionKey, payload),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.get(
    "/api/chat/sessions/:sessionKey/media/:mediaId",
    async (req, res, routeCtx, params) => {
      try {
        const media = await routeCtx.services.chat.resolveMedia(
          params.sessionKey,
          params.mediaId,
        );
        const requestUrl = new URL(
          req.url || "/",
          `http://${req.headers.host || "127.0.0.1"}`,
        );
        const wantsDownload =
          requestUrl.searchParams.get("download") === "1" ||
          media.kind === "file";
        const disposition = wantsDownload ? "attachment" : "inline";

        res.statusCode = 200;
        res.setHeader("Cache-Control", "private, max-age=60");
        res.setHeader("Content-Length", String(media.size));
        res.setHeader("Content-Type", media.mimeType);
        res.setHeader(
          "Content-Disposition",
          buildContentDisposition(media.fileName, disposition),
        );
        res.setHeader("X-Content-Type-Options", "nosniff");

        const stream = fs.createReadStream(media.absolutePath);
        stream.on("error", (error) => {
          if (res.writableEnded) {
            return;
          }
          sendChatError(res, error);
        });
        stream.pipe(res);
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );


  router.post(
    "/api/chat/sessions/:sessionKey/runs/:runId/permissions/:requestId",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatResolvePermissionRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.resolvePermission(
            params.sessionKey,
            params.runId,
            params.requestId,
            payload,
          ),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.post(
    "/api/chat/sessions/:sessionKey/abort",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.abort(params.sessionKey),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.delete(
    "/api/chat/sessions/:sessionKey",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.deleteSession(params.sessionKey),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.post(
    "/api/chat/sessions/:sessionKey/reset",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.reset(params.sessionKey),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );
}
