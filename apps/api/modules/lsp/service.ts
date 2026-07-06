import type http from "node:http";
import type { Duplex } from "node:stream";
import { WebSocket, WebSocketServer } from "ws";

import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  LspDiagnostic,
  LspDiagnosticsRequest,
  LspDiagnosticsResponse,
  LspGatewayServerEvent,
} from "../../../../types/lsp.js";
import { resolveFilesServiceExistingFilePath } from "../files/service.js";

const LSP_WS_PATH = "/ws/lsp";
const JSON_PROVIDER_SOURCE = "json-lsp";

export interface LspService {
  getStatus(): { ok: true; provider: "json"; websocketPath: string; supportedLanguages: string[] };
  diagnoseDocument(request: LspDiagnosticsRequest): LspDiagnosticsResponse;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): boolean;
}

export function createLspService(config: TracevaneServerConfig): LspService {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket) => {
    send(socket, {
      type: "ready",
      provider: "json",
      message: "Tracevane JSON diagnostics provider ready",
    });

    socket.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        send(socket, { type: "error", message: "Invalid LSP gateway message JSON" });
        return;
      }

      const request = parsed as Partial<LspDiagnosticsRequest>;
      if (request?.type !== "diagnose") {
        send(socket, { type: "error", id: request?.id ?? null, message: "Unsupported LSP gateway message type" });
        return;
      }

      try {
        send(socket, diagnoseDocument(config, request as LspDiagnosticsRequest));
      } catch (error) {
        send(socket, {
          type: "error",
          id: request.id ?? null,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    });
  });

  return {
    getStatus() {
      return { ok: true, provider: "json", websocketPath: LSP_WS_PATH, supportedLanguages: ["json"] };
    },
    diagnoseDocument(request) {
      return diagnoseDocument(config, request);
    },
    handleUpgrade(req, socket, head) {
      const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
      if (url.pathname !== LSP_WS_PATH) return false;
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit("connection", ws, req);
      });
      return true;
    },
  };
}

function diagnoseDocument(
  config: TracevaneServerConfig,
  request: LspDiagnosticsRequest,
): LspDiagnosticsResponse {
  const rootId = normalizeRequired(request.rootId, "rootId");
  const targetPath = normalizePath(request.path);
  const content = typeof request.content === "string" ? request.content : "";
  // Reuse the Files API root/path guard so the diagnostics gateway never accepts
  // arbitrary host paths. The content is supplied by the current editor model, but
  // the path still has to resolve to an existing workspace file.
  const resolved = resolveFilesServiceExistingFilePath(config, rootId, targetPath);
  const language = normalizeLanguage(request.language, resolved.relativePath, content);
  if (language !== "json") {
    return responseFor(request, resolved.root.id, resolved.relativePath, []);
  }
  return responseFor(request, resolved.root.id, resolved.relativePath, diagnoseJson(content));
}

function responseFor(
  request: LspDiagnosticsRequest,
  rootId: string,
  targetPath: string,
  diagnostics: LspDiagnostic[],
): LspDiagnosticsResponse {
  return {
    type: "diagnostics",
    id: request.id ?? null,
    provider: "json",
    rootId,
    path: targetPath,
    language: "json",
    version: request.version ?? null,
    diagnostics,
    checkedAt: new Date().toISOString(),
  };
}

function diagnoseJson(content: string): LspDiagnostic[] {
  if (!content.trim()) return [];
  try {
    JSON.parse(content);
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const offset = extractJsonErrorOffset(message, content);
    const position = offsetToPosition(content, offset);
    return [{
      severity: "error",
      message,
      startLine: position.line,
      startColumn: position.column,
      endLine: position.line,
      endColumn: position.column + 1,
      code: "JSON_PARSE",
      source: JSON_PROVIDER_SOURCE,
    }];
  }
}

function extractJsonErrorOffset(message: string, content: string): number {
  const match = /position\s+(\d+)/i.exec(message);
  if (match) return clampOffset(Number(match[1]), content.length);
  const lineColumn = /line\s+(\d+)\s+column\s+(\d+)/i.exec(message);
  if (lineColumn) return positionToOffset(content, Number(lineColumn[1]), Number(lineColumn[2]));
  return 0;
}

function offsetToPosition(content: string, offset: number): { line: number; column: number } {
  const safeOffset = clampOffset(offset, content.length);
  let line = 1;
  let column = 1;
  for (let index = 0; index < safeOffset; index += 1) {
    if (content.charCodeAt(index) === 10) {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  return { line, column };
}

function positionToOffset(content: string, line: number, column: number): number {
  const safeLine = Math.max(1, Math.floor(line));
  const safeColumn = Math.max(1, Math.floor(column));
  let currentLine = 1;
  let currentColumn = 1;
  for (let index = 0; index < content.length; index += 1) {
    if (currentLine === safeLine && currentColumn === safeColumn) return index;
    if (content.charCodeAt(index) === 10) {
      currentLine += 1;
      currentColumn = 1;
    } else {
      currentColumn += 1;
    }
  }
  return content.length;
}

function clampOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(Math.floor(value), Math.max(0, length)));
}

function normalizeLanguage(language: string | null | undefined, targetPath: string, content: string): string {
  const raw = String(language || "").trim().toLowerCase();
  if (raw === "json") return "json";
  if (/(^|\.)json($|[.\-_])/i.test(targetPath)) return "json";
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return raw || "plaintext";
}

function normalizeRequired(value: string | undefined, label: string): string {
  const raw = String(value || "").trim();
  if (!raw) throw new Error(`${label} is required`);
  return raw;
}

function normalizePath(value: string | undefined): string {
  const raw = String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!raw || raw === "." || raw === ".." || raw.startsWith("../")) throw new Error("path is required");
  return raw;
}

function send(socket: WebSocket, event: LspGatewayServerEvent): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(event));
}
