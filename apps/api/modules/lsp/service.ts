import type http from "node:http";
import type { Duplex } from "node:stream";
import ts from "typescript";
import { WebSocket, WebSocketServer } from "ws";

import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  LspCompletionItem,
  LspCompletionRequest,
  LspCompletionResponse,
  LspDefinitionResponse,
  LspDiagnostic,
  LspDiagnosticsRequest,
  LspDiagnosticsResponse,
  LspGatewayServerEvent,
  LspHoverResponse,
  LspPositionRequest,
} from "../../../../types/lsp.js";
import { resolveFilesServiceExistingFilePath } from "../files/service.js";

const LSP_WS_PATH = "/ws/lsp";
const JSON_PROVIDER_SOURCE = "json-lsp";
const TS_PROVIDER_SOURCE = "typescript-lsp";
const TYPESCRIPT_LANGUAGES = new Set(["typescript", "typescriptreact", "javascript", "javascriptreact"]);

export interface LspService {
  getStatus(): { ok: true; provider: "tracevane-lsp"; websocketPath: string; supportedLanguages: string[]; features: string[] };
  diagnoseDocument(request: LspDiagnosticsRequest): LspDiagnosticsResponse;
  hoverDocument(request: LspPositionRequest): LspHoverResponse;
  completeDocument(request: LspCompletionRequest): LspCompletionResponse;
  defineDocument(request: LspPositionRequest): LspDefinitionResponse;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): boolean;
}

export function createLspService(config: TracevaneServerConfig): LspService {
  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (socket) => {
    send(socket, {
      type: "ready",
      provider: "tracevane-lsp",
      message: "Tracevane LSP diagnostics provider ready",
    });

    socket.on("message", (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        send(socket, { type: "error", message: "Invalid LSP gateway message JSON" });
        return;
      }

      const request = parsed as Partial<LspDiagnosticsRequest & LspPositionRequest & LspCompletionRequest>;
      if (!request?.type) {
        send(socket, { type: "error", id: request?.id ?? null, message: "Unsupported LSP gateway message type" });
        return;
      }

      try {
        if (request.type === "diagnose") {
          send(socket, diagnoseDocument(config, request as LspDiagnosticsRequest));
          return;
        }
        if (request.type === "hover") {
          send(socket, hoverDocument(config, request as LspPositionRequest));
          return;
        }
        if (request.type === "completion") {
          send(socket, completeDocument(config, request as LspCompletionRequest));
          return;
        }
        if (request.type === "definition") {
          send(socket, defineDocument(config, request as LspPositionRequest));
          return;
        }
        send(socket, { type: "error", id: request.id ?? null, message: "Unsupported LSP gateway message type" });
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
      return {
        ok: true,
        provider: "tracevane-lsp",
        websocketPath: LSP_WS_PATH,
        supportedLanguages: ["json", "typescript", "typescriptreact", "javascript", "javascriptreact"],
        features: ["diagnostics", "hover", "completion", "definition"],
      };
    },
    diagnoseDocument(request) {
      return diagnoseDocument(config, request);
    },
    hoverDocument(request) {
      return hoverDocument(config, request);
    },
    completeDocument(request) {
      return completeDocument(config, request);
    },
    defineDocument(request) {
      return defineDocument(config, request);
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


function hoverDocument(
  config: TracevaneServerConfig,
  request: LspPositionRequest,
): LspHoverResponse {
  const validated = validateJsonInteractionRequest(config, request);
  const symbol = jsonSymbolAtPosition(validated.content, request.line, request.column);
  const contents = symbol
    ? [
        `JSON ${symbol.kind}: ${symbol.label}`,
        `Path: ${symbol.path || "$"}`,
      ]
    : ["JSON document", "Tracevane JSON LSP provider foundation"];
  return {
    type: "hover",
    id: request.id ?? null,
    provider: "json",
    rootId: validated.rootId,
    path: validated.path,
    language: "json",
    version: request.version ?? null,
    contents,
    range: symbol?.range ?? null,
    checkedAt: new Date().toISOString(),
  };
}

function completeDocument(
  config: TracevaneServerConfig,
  request: LspCompletionRequest,
): LspCompletionResponse {
  const validated = validateJsonInteractionRequest(config, request);
  return {
    type: "completion",
    id: request.id ?? null,
    provider: "json",
    rootId: validated.rootId,
    path: validated.path,
    language: "json",
    version: request.version ?? null,
    items: jsonCompletionItems(validated.content, request.line, request.column),
    checkedAt: new Date().toISOString(),
  };
}

function defineDocument(
  config: TracevaneServerConfig,
  request: LspPositionRequest,
): LspDefinitionResponse {
  const validated = validateJsonInteractionRequest(config, request);
  const symbol = jsonSymbolAtPosition(validated.content, request.line, request.column);
  return {
    type: "definition",
    id: request.id ?? null,
    provider: "json",
    rootId: validated.rootId,
    path: validated.path,
    language: "json",
    version: request.version ?? null,
    locations: symbol ? [{
      rootId: validated.rootId,
      path: validated.path,
      startLine: symbol.range.startLine,
      startColumn: symbol.range.startColumn,
      endLine: symbol.range.endLine,
      endColumn: symbol.range.endColumn,
    }] : [],
    checkedAt: new Date().toISOString(),
  };
}

function validateJsonInteractionRequest(
  config: TracevaneServerConfig,
  request: LspPositionRequest | LspCompletionRequest,
): { rootId: string; path: string; content: string } {
  const rootId = normalizeRequired(request.rootId, "rootId");
  const targetPath = normalizePath(request.path);
  const content = typeof request.content === "string" ? request.content : "";
  const resolved = resolveFilesServiceExistingFilePath(config, rootId, targetPath);
  const language = normalizeLanguage(request.language, resolved.relativePath, content);
  if (language !== "json") throw new Error("Only JSON LSP interactions are supported in M7-C");
  return { rootId: resolved.root.id, path: resolved.relativePath, content };
}

interface JsonSymbolInfo {
  kind: "property" | "value";
  label: string;
  path: string;
  range: { startLine: number; startColumn: number; endLine: number; endColumn: number };
}

function jsonSymbolAtPosition(content: string, line: number, column: number): JsonSymbolInfo | null {
  const lines = content.split(/\r?\n/);
  const safeLine = Math.max(1, Math.min(Math.floor(line || 1), Math.max(1, lines.length)));
  const lineText = lines[safeLine - 1] ?? "";
  const propertyMatch = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/.exec(lineText);
  if (propertyMatch?.index != null) {
    const startColumn = propertyMatch.index + 1;
    const endColumn = startColumn + propertyMatch[0].length;
    return {
      kind: "property",
      label: propertyMatch[1] || "property",
      path: approximateJsonPath(lines, safeLine, propertyMatch[1] || "property"),
      range: { startLine: safeLine, startColumn, endLine: safeLine, endColumn },
    };
  }
  const token = tokenAtColumn(lineText, column);
  if (!token) return null;
  return {
    kind: "value",
    label: token.text,
    path: approximateJsonPath(lines, safeLine, token.text),
    range: { startLine: safeLine, startColumn: token.startColumn, endLine: safeLine, endColumn: token.endColumn },
  };
}

function tokenAtColumn(lineText: string, column: number): { text: string; startColumn: number; endColumn: number } | null {
  const target = Math.max(1, Math.floor(column || 1)) - 1;
  const tokenRegex = /"([^"\\]*(?:\\.[^"\\]*)*)"|\b(true|false|null|-?\d+(?:\.\d+)?)\b/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRegex.exec(lineText))) {
    const start = match.index;
    const end = start + match[0].length;
    if (target >= start && target <= end) {
      return { text: match[1] ?? match[2] ?? match[0], startColumn: start + 1, endColumn: end + 1 };
    }
  }
  return null;
}

function approximateJsonPath(lines: string[], line: number, current: string): string {
  const keys: string[] = [];
  for (let index = 0; index < line; index += 1) {
    const match = /"([^"\\]*(?:\\.[^"\\]*)*)"\s*:/.exec(lines[index] ?? "");
    if (!match) continue;
    const indent = (lines[index] ?? "").match(/^\s*/)?.[0].length ?? 0;
    const depth = Math.floor(indent / 2);
    keys[depth] = match[1] || "property";
    keys.length = depth + 1;
  }
  if (!keys.length && current) keys.push(current);
  return `$${keys.map((key) => `.${key}`).join("")}`;
}

function jsonCompletionItems(content: string, line: number, column: number): LspCompletionItem[] {
  void content;
  void line;
  void column;
  return [
    { label: "property", detail: "JSON property", documentation: "Insert a JSON property snippet.", insertText: '"${1:key}": ${2:value}', kind: "snippet" },
    { label: "true", detail: "JSON boolean", insertText: "true", kind: "value" },
    { label: "false", detail: "JSON boolean", insertText: "false", kind: "value" },
    { label: "null", detail: "JSON null", insertText: "null", kind: "value" },
    { label: "object", detail: "JSON object", insertText: "{\n  $1\n}", kind: "snippet" },
    { label: "array", detail: "JSON array", insertText: "[\n  $1\n]", kind: "snippet" },
  ];
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
  if (language === "json") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "json", "json", diagnoseJson(content));
  }
  if (TYPESCRIPT_LANGUAGES.has(language)) {
    return responseFor(
      request,
      resolved.root.id,
      resolved.relativePath,
      "typescript",
      language,
      diagnoseTypeScriptLike(content, resolved.absolutePath, language),
    );
  }
  return responseFor(request, resolved.root.id, resolved.relativePath, "json", language, []);
}

function responseFor(
  request: LspDiagnosticsRequest,
  rootId: string,
  targetPath: string,
  provider: "json" | "typescript",
  language: string,
  diagnostics: LspDiagnostic[],
): LspDiagnosticsResponse {
  return {
    type: "diagnostics",
    id: request.id ?? null,
    provider,
    rootId,
    path: targetPath,
    language,
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

function diagnoseTypeScriptLike(content: string, absolutePath: string, language: string): LspDiagnostic[] {
  if (!content.trim()) return [];
  const compilerOptions: ts.CompilerOptions = {
    allowJs: language === "javascript" || language === "javascriptreact",
    checkJs: language === "javascript" || language === "javascriptreact",
    jsx: language === "typescriptreact" || language === "javascriptreact" ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
    target: ts.ScriptTarget.ES2022,
  };
  const normalizedFileName = absolutePath.replace(/\\/g, "/");
  const host = ts.createCompilerHost(compilerOptions, true);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalReadFile = host.readFile?.bind(host);
  const originalFileExists = host.fileExists?.bind(host);
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (sameTsFile(fileName, normalizedFileName)) {
      return ts.createSourceFile(fileName, content, languageVersion, true, scriptKindForLanguage(language));
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };
  host.readFile = (fileName) => sameTsFile(fileName, normalizedFileName) ? content : originalReadFile?.(fileName);
  host.fileExists = (fileName) => sameTsFile(fileName, normalizedFileName) || Boolean(originalFileExists?.(fileName));

  const program = ts.createProgram([normalizedFileName], compilerOptions, host);
  const sourceFile = program.getSourceFile(normalizedFileName);
  if (!sourceFile) return [];
  return ts.getPreEmitDiagnostics(program, sourceFile)
    .filter((diagnostic) => diagnostic.file && sameTsFile(diagnostic.file.fileName, normalizedFileName))
    .map((diagnostic) => tsDiagnosticToLspDiagnostic(diagnostic, sourceFile));
}

function tsDiagnosticToLspDiagnostic(diagnostic: ts.Diagnostic, sourceFile: ts.SourceFile): LspDiagnostic {
  const start = typeof diagnostic.start === "number" ? diagnostic.start : 0;
  const length = typeof diagnostic.length === "number" ? Math.max(1, diagnostic.length) : 1;
  const startPosition = sourceFile.getLineAndCharacterOfPosition(clampOffset(start, sourceFile.text.length));
  const endPosition = sourceFile.getLineAndCharacterOfPosition(clampOffset(start + length, sourceFile.text.length));
  return {
    severity: tsDiagnosticCategoryToSeverity(diagnostic.category),
    message: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
    startLine: startPosition.line + 1,
    startColumn: startPosition.character + 1,
    endLine: endPosition.line + 1,
    endColumn: endPosition.character + 1,
    code: `TS${diagnostic.code}`,
    source: TS_PROVIDER_SOURCE,
  };
}

function tsDiagnosticCategoryToSeverity(category: ts.DiagnosticCategory): LspDiagnostic["severity"] {
  if (category === ts.DiagnosticCategory.Error) return "error";
  if (category === ts.DiagnosticCategory.Warning) return "warning";
  if (category === ts.DiagnosticCategory.Suggestion) return "hint";
  return "info";
}

function scriptKindForLanguage(language: string): ts.ScriptKind {
  if (language === "typescriptreact") return ts.ScriptKind.TSX;
  if (language === "javascript") return ts.ScriptKind.JS;
  if (language === "javascriptreact") return ts.ScriptKind.JSX;
  return ts.ScriptKind.TS;
}

function sameTsFile(left: string, right: string): boolean {
  return left.replace(/\\/g, "/") === right.replace(/\\/g, "/");
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
  if (raw === "ts" || raw === "typescript") return "typescript";
  if (raw === "tsx" || raw === "typescriptreact") return "typescriptreact";
  if (raw === "js" || raw === "javascript") return "javascript";
  if (raw === "jsx" || raw === "javascriptreact") return "javascriptreact";
  if (/\.tsx$/i.test(targetPath)) return "typescriptreact";
  if (/\.ts$/i.test(targetPath) && !/\.d\.ts$/i.test(targetPath)) return "typescript";
  if (/\.d\.ts$/i.test(targetPath)) return "typescript";
  if (/\.jsx$/i.test(targetPath)) return "javascriptreact";
  if (/\.m?js$/i.test(targetPath) || /\.cjs$/i.test(targetPath)) return "javascript";
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
