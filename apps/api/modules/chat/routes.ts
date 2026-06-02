import fs from "node:fs";
import type http from "node:http";
import { parseJsonBody, sendJson } from "../../core/http.js";
import type { StudioApiContext } from "../../core/context.js";
import type { StudioRouter } from "../../core/router.js";
import type {
  ChatAssignSessionsToFolderRequest,
  ChatCreateSessionRequest,
  ChatCreateOrganizerFolderRequest,
  ChatFileUploadRequest,
  ChatPatchQueueEntryRequest,
  ChatPatchOrganizerFolderRequest,
  ChatPatchSessionRequest,
  ChatPatchSessionControlsRequest,
  ChatHistorySearchContentFilter,
  ChatHistorySearchRoleFilter,
  ChatResourceResolveRequest,
  ChatSendRequest,
} from "../../../../types/chat.js";
import type { ChatSlashGatewayRequest } from "./service.js";
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
      source: "studio",
    },
  });
}

type ChatMultipartUploadRequest = {
  fileName: string;
  mimeType?: string;
  content: Buffer;
};

function requestContentType(req: http.IncomingMessage): string {
  const value = req.headers["content-type"];
  return Array.isArray(value) ? value.join("; ") : String(value || "");
}

function isMultipartFormData(req: http.IncomingMessage): boolean {
  return requestContentType(req).toLowerCase().includes("multipart/form-data");
}

async function readRequestBuffer(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  return Buffer.concat(chunks);
}

function parseContentDisposition(value: string): Record<string, string> {
  const parts = value.split(";").map((part) => part.trim()).filter(Boolean);
  const result: Record<string, string> = {};
  for (const part of parts.slice(1)) {
    const equalsIndex = part.indexOf("=");
    if (equalsIndex <= 0) {
      continue;
    }
    const key = part.slice(0, equalsIndex).trim().toLowerCase();
    let rawValue = part.slice(equalsIndex + 1).trim();
    if (rawValue.startsWith('"') && rawValue.endsWith('"')) {
      rawValue = rawValue.slice(1, -1).replace(/\\"/g, '"');
    }
    result[key] = rawValue;
  }
  return result;
}

function parseMultipartBoundary(contentType: string): string {
  const match = /(?:^|;)\s*boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  const boundary = (match?.[1] || match?.[2] || "").trim();
  if (!boundary) {
    throw new Error("multipart boundary is required");
  }
  return boundary;
}

async function parseMultipartChatFileUpload(req: http.IncomingMessage): Promise<ChatMultipartUploadRequest> {
  const contentType = requestContentType(req);
  const boundary = parseMultipartBoundary(contentType);
  const body = await readRequestBuffer(req);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const headerTerminator = Buffer.from("\r\n\r\n");
  const nextBoundaryPrefix = Buffer.from(`\r\n--${boundary}`);

  let cursor = 0;
  let fileName = "";
  let mimeType = "";
  let content: Buffer | null = null;

  while (cursor < body.length) {
    const boundaryIndex = body.indexOf(boundaryBuffer, cursor);
    if (boundaryIndex < 0) {
      break;
    }
    cursor = boundaryIndex + boundaryBuffer.length;
    if (body[cursor] === 45 && body[cursor + 1] === 45) {
      break;
    }
    if (body[cursor] === 13 && body[cursor + 1] === 10) {
      cursor += 2;
    }

    const headerEnd = body.indexOf(headerTerminator, cursor);
    if (headerEnd < 0) {
      break;
    }
    const rawHeaders = body.slice(cursor, headerEnd).toString("utf8");
    const headers = new Map<string, string>();
    for (const line of rawHeaders.split(/\r\n/)) {
      const colonIndex = line.indexOf(":");
      if (colonIndex <= 0) {
        continue;
      }
      headers.set(line.slice(0, colonIndex).trim().toLowerCase(), line.slice(colonIndex + 1).trim());
    }

    const dataStart = headerEnd + headerTerminator.length;
    const dataEnd = body.indexOf(nextBoundaryPrefix, dataStart);
    if (dataEnd < 0) {
      break;
    }

    const disposition = parseContentDisposition(headers.get("content-disposition") || "");
    const fieldName = disposition.name || "";
    const fieldValue = body.slice(dataStart, dataEnd);
    if (fieldName === "file") {
      fileName = disposition.filename || fileName;
      mimeType = headers.get("content-type") || mimeType;
      content = fieldValue;
    } else if (fieldName === "fileName") {
      fileName = fieldValue.toString("utf8").trim() || fileName;
    } else if (fieldName === "mimeType") {
      mimeType = fieldValue.toString("utf8").trim() || mimeType;
    }

    cursor = dataEnd + 2;
  }

  if (!content || !content.length) {
    throw new Error("multipart upload file is required");
  }
  return {
    fileName: fileName || "upload.bin",
    mimeType: mimeType || undefined,
    content,
  };
}

export function registerChatRoutes(
  router: StudioRouter,
  ctx: StudioApiContext,
): void {
  function readLimit(
    req: Parameters<StudioRouter["get"]>[1] extends (
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
    req: Parameters<StudioRouter["get"]>[1] extends (
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

  router.get(
    "/api/chat/sessions/:sessionKey/controls",
    async (_req, res, routeCtx, params) => {
      try {
        sendJson(
          res,
          200,
          await routeCtx.services.chat.getControls(params.sessionKey),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.patch(
    "/api/chat/sessions/:sessionKey/controls",
    async (req, res, routeCtx, params) => {
      try {
        const payload =
          await parseJsonBody<ChatPatchSessionControlsRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.patchControls(
            params.sessionKey,
            payload,
          ),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );

  router.post(
    "/api/chat/sessions/:sessionKey/slash-gateway",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatSlashGatewayRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.requestSlashGateway(
            params.sessionKey,
            payload,
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

  router.post(
    "/api/chat/sessions/:sessionKey/resources/resolve",
    async (req, res, routeCtx, params) => {
      try {
        const payload = await parseJsonBody<ChatResourceResolveRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.resolveResourceRefs(params.sessionKey, payload),
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

  router.post(
    "/api/chat/sessions/:sessionKey/upload",
    async (req, res, routeCtx, params) => {
      try {
        if (isMultipartFormData(req)) {
          const payload = await parseMultipartChatFileUpload(req);
          sendJson(
            res,
            200,
            await routeCtx.services.chat.uploadFileBytes(params.sessionKey, payload),
          );
          return;
        }

        const payload = await parseJsonBody<ChatFileUploadRequest>(req);
        sendJson(
          res,
          200,
          await routeCtx.services.chat.uploadFile(params.sessionKey, payload),
        );
      } catch (error) {
        sendChatError(res, error);
      }
    },
  );
}
