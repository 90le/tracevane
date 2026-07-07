import type http from "node:http";
import path from "node:path";
import type { Duplex } from "node:stream";
import ts from "typescript";
import { WebSocket, WebSocketServer } from "ws";

import type { TracevaneServerConfig } from "../../../../types/api.js";
import type {
  LspCompletionItem,
  LspCompletionRequest,
  LspCompletionResponse,
  LspCodeActionRequest,
  LspCodeActionResponse,
  LspDefinitionResponse,
  LspDiagnostic,
  LspDiagnosticsRequest,
  LspDiagnosticsResponse,
  LspGatewayServerEvent,
  LspHoverResponse,
  LspPositionRequest,
  LspFormattingRequest,
  LspFormattingResponse,
  LspReferencesResponse,
  LspRenameRequest,
  LspRenameResponse,
  LspSemanticTokenLegend,
  LspSemanticTokensRequest,
  LspSemanticTokensResponse,
  LspWorkspaceEditRejectedItem,
  LspWorkspaceTextEdit,
} from "../../../../types/lsp.js";
import { resolveFilesServiceExistingFilePath } from "../files/service.js";

const LSP_WS_PATH = "/ws/lsp";
const JSON_PROVIDER_SOURCE = "json-lsp";
const TS_PROVIDER_SOURCE = "typescript-lsp";
const TYPESCRIPT_LANGUAGES = new Set(["typescript", "typescriptreact", "javascript", "javascriptreact"]);
const SEMANTIC_TOKEN_TYPES = [
  "class",
  "enum",
  "interface",
  "namespace",
  "type",
  "typeParameter",
  "parameter",
  "variable",
  "property",
  "function",
  "keyword",
  "string",
  "number",
  "regexp",
  "operator",
  "comment",
] as const satisfies LspSemanticTokenLegend["tokenTypes"];
const SEMANTIC_TOKEN_MODIFIERS = ["declaration", "readonly", "static", "deprecated", "async"] as const satisfies LspSemanticTokenLegend["tokenModifiers"];
const SEMANTIC_TOKEN_LEGEND: LspSemanticTokenLegend = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
};
const SEMANTIC_TOKEN_TYPE_INDEX = new Map<string, number>(SEMANTIC_TOKEN_TYPES.map((type, index) => [type, index]));
const MAX_SEMANTIC_TOKEN_FILE_LENGTH = 250_000;
const MAX_SEMANTIC_TOKEN_COUNT = 20_000;

export interface LspService {
  getStatus(): { ok: true; provider: "tracevane-lsp"; websocketPath: string; supportedLanguages: string[]; features: string[] };
  diagnoseDocument(request: LspDiagnosticsRequest): LspDiagnosticsResponse;
  hoverDocument(request: LspPositionRequest): LspHoverResponse;
  completeDocument(request: LspCompletionRequest): LspCompletionResponse;
  defineDocument(request: LspPositionRequest): LspDefinitionResponse;
  referenceDocument(request: LspPositionRequest): LspReferencesResponse;
  semanticTokens(request: LspSemanticTokensRequest): LspSemanticTokensResponse;
  renameDocument(request: LspRenameRequest): LspRenameResponse;
  formatDocument(request: LspFormattingRequest): LspFormattingResponse;
  codeActions(request: LspCodeActionRequest): LspCodeActionResponse;
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

      const request = parsed as Partial<LspDiagnosticsRequest & LspPositionRequest & LspCompletionRequest & LspSemanticTokensRequest>;
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
        if (request.type === "references") {
          send(socket, referenceDocument(config, request as LspPositionRequest));
          return;
        }
        if (request.type === "semanticTokens") {
          send(socket, semanticTokens(config, request as LspSemanticTokensRequest));
          return;
        }
        if (request.type === "rename") {
          send(socket, renameDocument(config, request as LspRenameRequest));
          return;
        }
        if (request.type === "formatting") {
          send(socket, formatDocument(config, request as LspFormattingRequest));
          return;
        }
        if (request.type === "codeAction") {
          send(socket, codeActions(config, request as LspCodeActionRequest));
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
        features: ["diagnostics", "hover", "completion", "definition", "references", "semanticTokens", "rename", "formatting", "codeAction"],
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
    referenceDocument(request) {
      return referenceDocument(config, request);
    },
    semanticTokens(request) {
      return semanticTokens(config, request);
    },
    renameDocument(request) {
      return renameDocument(config, request);
    },
    formatDocument(request) {
      return formatDocument(config, request);
    },
    codeActions(request) {
      return codeActions(config, request);
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
  const validated = validateInteractionRequest(config, request);
  if (TYPESCRIPT_LANGUAGES.has(validated.language)) {
    return hoverTypeScriptLike(request, validated);
  }
  if (validated.language !== "json") throw new Error("Only JSON and TypeScript/JavaScript LSP hover are supported in M7.y-D");
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
  const validated = validateInteractionRequest(config, request);
  if (TYPESCRIPT_LANGUAGES.has(validated.language)) {
    return completeTypeScriptLike(request, validated);
  }
  if (validated.language !== "json") throw new Error("Only JSON and TypeScript/JavaScript LSP completion are supported in M7.y-E");
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
  const validated = validateInteractionRequest(config, request);
  if (TYPESCRIPT_LANGUAGES.has(validated.language)) {
    return defineTypeScriptLike(request, validated);
  }
  if (validated.language !== "json") throw new Error("Only JSON and TypeScript/JavaScript LSP definition are supported in M7.y-D");
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

function referenceDocument(
  config: TracevaneServerConfig,
  request: LspPositionRequest,
): LspReferencesResponse {
  const validated = validateInteractionRequest(config, request);
  if (TYPESCRIPT_LANGUAGES.has(validated.language)) {
    return referenceTypeScriptLike(request, validated);
  }
  if (validated.language !== "json") throw new Error("Only JSON and TypeScript/JavaScript LSP references are supported in M7.z-B");
  const symbol = jsonSymbolAtPosition(validated.content, request.line, request.column);
  return {
    type: "references",
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

function semanticTokens(
  config: TracevaneServerConfig,
  request: LspSemanticTokensRequest,
): LspSemanticTokensResponse {
  const validated = validateInteractionRequest(config, request);
  if (!TYPESCRIPT_LANGUAGES.has(validated.language)) {
    throw new Error("Semantic tokens are currently supported for TypeScript/JavaScript documents only");
  }
  return semanticTokensTypeScriptLike(request, validated);
}

interface ValidatedInteractionRequest {
  rootId: string;
  rootRealPath: string;
  path: string;
  absolutePath: string;
  content: string;
  language: string;
}

type LspContentDocumentRequest = {
  rootId?: string;
  path?: string;
  language?: string | null;
  content?: string;
};

function validateInteractionRequest(
  config: TracevaneServerConfig,
  request: LspContentDocumentRequest,
): ValidatedInteractionRequest {
  const rootId = normalizeRequired(request.rootId, "rootId");
  const targetPath = normalizePath(request.path);
  const content = typeof request.content === "string" ? request.content : "";
  const resolved = resolveFilesServiceExistingFilePath(config, rootId, targetPath);
  const language = normalizeLanguage(request.language, resolved.relativePath, content);
  return {
    rootId: resolved.root.id,
    rootRealPath: resolved.root.realPath,
    path: resolved.relativePath,
    absolutePath: resolved.absolutePath,
    content,
    language,
  };
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


function hoverTypeScriptLike(
  request: LspPositionRequest,
  validated: ValidatedInteractionRequest,
): LspHoverResponse {
  const languageService = createTypeScriptLanguageService(validated, request.version);
  try {
    const sourceFile = languageService.sourceFile();
    const offset = positionToOffset(validated.content, request.line, request.column);
    const info = languageService.service.getQuickInfoAtPosition(languageService.fileName, offset);
    const documentation = info ? ts.displayPartsToString(info.documentation) : "";
    const display = info ? ts.displayPartsToString(info.displayParts) : "";
    const contents = [display, documentation].filter(Boolean);
    return {
      type: "hover",
      id: request.id ?? null,
      provider: "typescript",
      rootId: validated.rootId,
      path: validated.path,
      language: validated.language,
      version: request.version ?? null,
      contents,
      range: info?.textSpan ? textSpanToRange(sourceFile, info.textSpan) : null,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    languageService.service.dispose();
  }
}

function completeTypeScriptLike(
  request: LspCompletionRequest,
  validated: ValidatedInteractionRequest,
): LspCompletionResponse {
  const languageService = createTypeScriptLanguageService(validated, request.version);
  try {
    const offset = positionToOffset(validated.content, request.line, request.column);
    const completions = languageService.service.getCompletionsAtPosition(languageService.fileName, offset, {
      includeAutomaticOptionalChainCompletions: true,
      includeCompletionsForImportStatements: false,
      includeCompletionsForModuleExports: false,
      includeCompletionsWithClassMemberSnippets: false,
      includeCompletionsWithInsertText: true,
      includeCompletionsWithObjectLiteralMethodSnippets: false,
      includePackageJsonAutoImports: "off",
    });
    const items = (completions?.entries ?? []).slice(0, 200).map((entry) => tsCompletionEntryToLspItem(entry));
    return {
      type: "completion",
      id: request.id ?? null,
      provider: "typescript",
      rootId: validated.rootId,
      path: validated.path,
      language: validated.language,
      version: request.version ?? null,
      items,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    languageService.service.dispose();
  }
}

function tsCompletionEntryToLspItem(entry: ts.CompletionEntry): LspCompletionItem {
  return {
    label: entry.name,
    detail: entry.kindModifiers ? `${entry.kind} ${entry.kindModifiers}` : entry.kind,
    documentation: null,
    insertText: entry.insertText || entry.name,
    kind: tsCompletionKindToLspKind(entry.kind),
    sortText: entry.sortText || null,
  };
}

function tsCompletionKindToLspKind(kind: string): LspCompletionItem["kind"] {
  if (kind === ts.ScriptElementKind.functionElement) return "function";
  if (
    kind === ts.ScriptElementKind.memberFunctionElement
    || kind === ts.ScriptElementKind.constructSignatureElement
    || kind === ts.ScriptElementKind.callSignatureElement
  ) return "method";
  if (
    kind === ts.ScriptElementKind.constElement
    || kind === ts.ScriptElementKind.letElement
    || kind === ts.ScriptElementKind.variableElement
    || kind === ts.ScriptElementKind.localVariableElement
    || kind === ts.ScriptElementKind.alias
  ) return "variable";
  if (kind === ts.ScriptElementKind.classElement) return "class";
  if (kind === ts.ScriptElementKind.interfaceElement) return "interface";
  if (kind === ts.ScriptElementKind.moduleElement || kind === ts.ScriptElementKind.externalModuleName) return "module";
  if (kind === ts.ScriptElementKind.keyword) return "keyword";
  if (
    kind === ts.ScriptElementKind.memberVariableElement
    || kind === ts.ScriptElementKind.memberGetAccessorElement
    || kind === ts.ScriptElementKind.memberSetAccessorElement
  ) return "field";
  return "value";
}

function defineTypeScriptLike(
  request: LspPositionRequest,
  validated: ValidatedInteractionRequest,
): LspDefinitionResponse {
  const languageService = createTypeScriptLanguageService(validated, request.version);
  try {
    const offset = positionToOffset(validated.content, request.line, request.column);
    const definitions = languageService.service.getDefinitionAtPosition(languageService.fileName, offset) ?? [];
    const locations = definitions.flatMap((definition) => {
      const relativePath = relativePathInsideRoot(validated.rootRealPath, definition.fileName);
      if (!relativePath) return [];
      const sourceText = sameTsFile(definition.fileName, languageService.fileName)
        ? validated.content
        : ts.sys.readFile(definition.fileName);
      if (typeof sourceText !== "string") return [];
      const sourceFile = ts.createSourceFile(definition.fileName, sourceText, ts.ScriptTarget.ES2022, true, scriptKindForLanguage(validated.language));
      const range = textSpanToRange(sourceFile, definition.textSpan);
      return [{
        rootId: validated.rootId,
        path: relativePath,
        startLine: range.startLine,
        startColumn: range.startColumn,
        endLine: range.endLine,
        endColumn: range.endColumn,
      }];
    });
    return {
      type: "definition",
      id: request.id ?? null,
      provider: "typescript",
      rootId: validated.rootId,
      path: validated.path,
      language: validated.language,
      version: request.version ?? null,
      locations,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    languageService.service.dispose();
  }
}

function referenceTypeScriptLike(
  request: LspPositionRequest,
  validated: ValidatedInteractionRequest,
): LspReferencesResponse {
  const languageService = createTypeScriptLanguageService(validated, request.version);
  try {
    const offset = positionToOffset(validated.content, request.line, request.column);
    const references = languageService.service.getReferencesAtPosition(languageService.fileName, offset) ?? [];
    const locations = references.flatMap((reference) => {
      const relativePath = relativePathInsideRoot(validated.rootRealPath, reference.fileName);
      if (!relativePath) return [];
      const sourceText = sameTsFile(reference.fileName, languageService.fileName)
        ? validated.content
        : ts.sys.readFile(reference.fileName);
      if (typeof sourceText !== "string") return [];
      const sourceFile = ts.createSourceFile(reference.fileName, sourceText, ts.ScriptTarget.ES2022, true, scriptKindForLanguage(validated.language));
      const range = textSpanToRange(sourceFile, reference.textSpan);
      return [{
        rootId: validated.rootId,
        path: relativePath,
        startLine: range.startLine,
        startColumn: range.startColumn,
        endLine: range.endLine,
        endColumn: range.endColumn,
      }];
    });
    return {
      type: "references",
      id: request.id ?? null,
      provider: "typescript",
      rootId: validated.rootId,
      path: validated.path,
      language: validated.language,
      version: request.version ?? null,
      locations,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    languageService.service.dispose();
  }
}


function semanticTokensTypeScriptLike(
  request: LspSemanticTokensRequest,
  validated: ValidatedInteractionRequest,
): LspSemanticTokensResponse {
  if (validated.content.length > MAX_SEMANTIC_TOKEN_FILE_LENGTH) {
    return {
      type: "semanticTokens",
      id: request.id ?? null,
      provider: "typescript",
      rootId: validated.rootId,
      path: validated.path,
      language: validated.language,
      version: request.version ?? null,
      legend: SEMANTIC_TOKEN_LEGEND,
      data: [],
      tokenCount: 0,
      truncated: true,
      checkedAt: new Date().toISOString(),
    };
  }
  const languageService = createTypeScriptLanguageService(validated, request.version);
  try {
    const sourceFile = languageService.sourceFile();
    const classifications = languageService.service.getEncodedSemanticClassifications(
      languageService.fileName,
      { start: 0, length: validated.content.length },
      ts.SemanticClassificationFormat.TwentyTwenty,
    );
    const data: number[] = [];
    let previousLine = 0;
    let previousStartCharacter = 0;
    let tokenCount = 0;
    const spans = classifications.spans ?? [];
    for (let index = 0; index + 2 < spans.length; index += 3) {
      if (tokenCount >= MAX_SEMANTIC_TOKEN_COUNT) break;
      const start = spans[index];
      const length = spans[index + 1];
      const classification = spans[index + 2];
      if (!Number.isFinite(start) || !Number.isFinite(length) || length <= 0) continue;
      const token = semanticTokenInfoForClassification(classification);
      if (!token) continue;
      const tokenTypeIndex = SEMANTIC_TOKEN_TYPE_INDEX.get(token.type);
      if (tokenTypeIndex === undefined) continue;
      const position = sourceFile.getLineAndCharacterOfPosition(clampOffset(start, sourceFile.text.length));
      const deltaLine = position.line - previousLine;
      const deltaStart = deltaLine === 0 ? position.character - previousStartCharacter : position.character;
      if (deltaLine < 0 || deltaStart < 0) continue;
      data.push(deltaLine, deltaStart, Math.max(1, Math.floor(length)), tokenTypeIndex, token.modifiers);
      previousLine = position.line;
      previousStartCharacter = position.character;
      tokenCount += 1;
    }
    return {
      type: "semanticTokens",
      id: request.id ?? null,
      provider: "typescript",
      rootId: validated.rootId,
      path: validated.path,
      language: validated.language,
      version: request.version ?? null,
      legend: SEMANTIC_TOKEN_LEGEND,
      data,
      tokenCount,
      truncated: tokenCount >= MAX_SEMANTIC_TOKEN_COUNT || spans.length / 3 > tokenCount,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    languageService.service.dispose();
  }
}

function semanticTokenInfoForClassification(classification: number): {
  type: LspSemanticTokenLegend["tokenTypes"][number];
  modifiers: number;
} | null {
  if (!Number.isFinite(classification)) return null;

  // TypeScript's 2020 semantic classifier encodes tokens as:
  //   (tokenType + 1) << 8 | modifierBitSet
  // See TypeScript's classifier2020 TokenEncodingConsts. Monaco expects
  // token type/modifier indexes from our stable legend, so decode instead
  // of comparing against the older ClassificationType enum.
  const encodedType = Math.floor(classification / 256) - 1;
  const encodedModifiers = classification & 0xff;
  if (encodedType >= 0) {
    const type = semanticTokenTypeForTwentyTwentyToken(encodedType);
    if (!type) return null;
    return { type, modifiers: semanticTokenModifiersForTwentyTwenty(encodedModifiers) };
  }

  const legacyType = semanticTokenTypeForLegacyClassification(classification);
  return legacyType ? { type: legacyType, modifiers: 0 } : null;
}

function semanticTokenTypeForTwentyTwentyToken(typeIndex: number): LspSemanticTokenLegend["tokenTypes"][number] | null {
  switch (typeIndex) {
    case 0: // class
      return "class";
    case 1: // enum
      return "enum";
    case 2: // interface
      return "interface";
    case 3: // namespace
      return "namespace";
    case 4: // typeParameter
      return "typeParameter";
    case 5: // type
      return "type";
    case 6: // parameter
      return "parameter";
    case 7: // variable
      return "variable";
    case 8: // enumMember
    case 9: // property
      return "property";
    case 10: // function
      return "function";
    case 11: // member
      return "property";
    default:
      return null;
  }
}

function semanticTokenModifiersForTwentyTwenty(modifiers: number): number {
  let result = 0;
  if (modifiers & (1 << 0)) result |= 1 << SEMANTIC_TOKEN_MODIFIERS.indexOf("declaration");
  if (modifiers & (1 << 1)) result |= 1 << SEMANTIC_TOKEN_MODIFIERS.indexOf("static");
  if (modifiers & (1 << 2)) result |= 1 << SEMANTIC_TOKEN_MODIFIERS.indexOf("async");
  if (modifiers & (1 << 3)) result |= 1 << SEMANTIC_TOKEN_MODIFIERS.indexOf("readonly");
  return result;
}

function semanticTokenTypeForLegacyClassification(classification: number): LspSemanticTokenLegend["tokenTypes"][number] | null {
  switch (classification) {
    case ts.ClassificationType.className:
      return "class";
    case ts.ClassificationType.enumName:
      return "enum";
    case ts.ClassificationType.interfaceName:
      return "interface";
    case ts.ClassificationType.moduleName:
      return "namespace";
    case ts.ClassificationType.typeAliasName:
      return "type";
    case ts.ClassificationType.typeParameterName:
      return "typeParameter";
    case ts.ClassificationType.parameterName:
      return "parameter";
    case ts.ClassificationType.identifier:
      return "variable";
    case ts.ClassificationType.jsxAttribute:
      return "property";
    case ts.ClassificationType.keyword:
      return "keyword";
    case ts.ClassificationType.stringLiteral:
    case ts.ClassificationType.jsxAttributeStringLiteralValue:
      return "string";
    case ts.ClassificationType.numericLiteral:
    case ts.ClassificationType.bigintLiteral:
      return "number";
    case ts.ClassificationType.regularExpressionLiteral:
      return "regexp";
    case ts.ClassificationType.operator:
      return "operator";
    case ts.ClassificationType.comment:
    case ts.ClassificationType.docCommentTagName:
      return "comment";
    default:
      return null;
  }
}


function renameDocument(
  config: TracevaneServerConfig,
  request: LspRenameRequest,
): LspRenameResponse {
  const validated = validateInteractionRequest(config, request);
  const newName = String(request.newName || "").trim();
  if (!newName) throw new Error("newName is required");
  if (TYPESCRIPT_LANGUAGES.has(validated.language)) {
    return renameTypeScriptLike(request, validated, newName);
  }
  return {
    type: "rename",
    id: request.id ?? null,
    provider: validated.language === "json" ? "json" : "typescript",
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    workspaceEdit: null,
    rejected: [{ kind: "unknown", path: validated.path, reason: "Rename is currently supported for TypeScript/JavaScript symbols only" }],
    checkedAt: new Date().toISOString(),
  };
}

function formatDocument(
  config: TracevaneServerConfig,
  request: LspFormattingRequest,
): LspFormattingResponse {
  const validated = validateInteractionRequest(config, request);
  const options = { tabSize: Math.max(1, Math.floor(request.tabSize ?? 2)), insertSpaces: request.insertSpaces !== false };
  let textEdits: LspWorkspaceTextEdit[] = [];
  let provider: "json" | "typescript" = "json";
  if (TYPESCRIPT_LANGUAGES.has(validated.language)) {
    provider = "typescript";
    textEdits = formatTypeScriptLike(validated, options);
  } else if (validated.language === "json") {
    textEdits = formatJsonLike(validated.content, options);
  } else {
    textEdits = [];
  }
  return {
    type: "formatting",
    id: request.id ?? null,
    provider,
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    textEdits,
    checkedAt: new Date().toISOString(),
  };
}

function codeActions(
  config: TracevaneServerConfig,
  request: LspCodeActionRequest,
): LspCodeActionResponse {
  const validated = validateInteractionRequest(config, request);
  const provider: "json" | "typescript" = TYPESCRIPT_LANGUAGES.has(validated.language) ? "typescript" : "json";
  const formatting = formatDocument(config, {
    type: "formatting",
    id: request.id ?? null,
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    content: validated.content,
  });
  const actions = formatting.textEdits.length > 0
    ? [{
        title: "Format document with Tracevane LSP",
        kind: "source.format",
        isPreferred: true,
        workspaceEdit: { changes: { [fileUriForValidated(validated)]: formatting.textEdits } },
        command: null,
      }]
    : [{
        title: "No safe Tracevane code action available",
        kind: "quickfix.empty",
        isPreferred: false,
        disabledReason: "M7.z-G exposes the code action surface; provider-specific quick fixes are deferred.",
        workspaceEdit: null,
        command: null,
      }];
  return {
    type: "codeAction",
    id: request.id ?? null,
    provider,
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    actions,
    checkedAt: new Date().toISOString(),
  };
}

function renameTypeScriptLike(
  request: LspRenameRequest,
  validated: ValidatedInteractionRequest,
  newName: string,
): LspRenameResponse {
  const languageService = createTypeScriptLanguageService(validated, request.version);
  try {
    const offset = positionToOffset(validated.content, request.line, request.column);
    const renameInfo = languageService.service.getRenameInfo(languageService.fileName, offset, { allowRenameOfImportPath: false });
    if (!renameInfo.canRename) {
      return {
        type: "rename",
        id: request.id ?? null,
        provider: "typescript",
        rootId: validated.rootId,
        path: validated.path,
        language: validated.language,
        version: request.version ?? null,
        workspaceEdit: null,
        rejected: [{ kind: "text", path: validated.path, reason: renameInfo.localizedErrorMessage || "Symbol cannot be renamed" }],
        checkedAt: new Date().toISOString(),
      };
    }
    const locations = languageService.service.findRenameLocations(languageService.fileName, offset, false, false, true) ?? [];
    const changes: Record<string, LspWorkspaceTextEdit[]> = {};
    const rejected: LspWorkspaceEditRejectedItem[] = [];
    for (const location of locations) {
      const relativePath = relativePathInsideRoot(validated.rootRealPath, location.fileName);
      if (!relativePath) {
        rejected.push({ kind: "text", uri: pathToFileUri(location.fileName), reason: "Rename location is outside the selected root" });
        continue;
      }
      const sourceText = sameTsFile(location.fileName, languageService.fileName)
        ? validated.content
        : ts.sys.readFile(location.fileName);
      if (typeof sourceText !== "string") {
        rejected.push({ kind: "text", path: relativePath, reason: "Unable to read rename target file" });
        continue;
      }
      const sourceFile = ts.createSourceFile(location.fileName, sourceText, ts.ScriptTarget.ES2022, true, scriptKindForLanguage(validated.language));
      const uri = pathToFileUri(location.fileName);
      const list = changes[uri] ?? [];
      list.push({ range: textSpanToWorkspaceRange(sourceFile, location.textSpan), newText: newName });
      changes[uri] = list;
    }
    return {
      type: "rename",
      id: request.id ?? null,
      provider: "typescript",
      rootId: validated.rootId,
      path: validated.path,
      language: validated.language,
      version: request.version ?? null,
      workspaceEdit: { changes },
      rejected,
      checkedAt: new Date().toISOString(),
    };
  } finally {
    languageService.service.dispose();
  }
}

function formatTypeScriptLike(
  validated: ValidatedInteractionRequest,
  options: { tabSize: number; insertSpaces: boolean },
): LspWorkspaceTextEdit[] {
  const languageService = createTypeScriptLanguageService(validated, 1);
  try {
    const sourceFile = languageService.sourceFile();
    const edits = languageService.service.getFormattingEditsForDocument(languageService.fileName, {
      tabSize: options.tabSize,
      indentSize: options.tabSize,
      convertTabsToSpaces: options.insertSpaces,
      newLineCharacter: "\n",
    });
    return edits.map((edit) => ({ range: textSpanToWorkspaceRange(sourceFile, edit.span), newText: edit.newText }));
  } finally {
    languageService.service.dispose();
  }
}

function formatJsonLike(content: string, options: { tabSize: number; insertSpaces: boolean }): LspWorkspaceTextEdit[] {
  try {
    const formatted = `${JSON.stringify(JSON.parse(content), null, options.insertSpaces ? options.tabSize : "\t")}\n`;
    if (formatted === content) return [];
    return [{ range: fullContentWorkspaceRange(content), newText: formatted }];
  } catch {
    return [];
  }
}

function fullContentWorkspaceRange(content: string): LspWorkspaceTextEdit["range"] {
  const lines = content.split("\n");
  return {
    start: { line: 0, character: 0 },
    end: { line: Math.max(0, lines.length - 1), character: lines.length ? lines[lines.length - 1].length : 0 },
  };
}

function textSpanToWorkspaceRange(sourceFile: ts.SourceFile, textSpan: ts.TextSpan): LspWorkspaceTextEdit["range"] {
  const start = sourceFile.getLineAndCharacterOfPosition(clampOffset(textSpan.start, sourceFile.text.length));
  const end = sourceFile.getLineAndCharacterOfPosition(clampOffset(textSpan.start + textSpan.length, sourceFile.text.length));
  return {
    start: { line: start.line, character: start.character },
    end: { line: end.line, character: end.character },
  };
}

function fileUriForValidated(validated: ValidatedInteractionRequest): string {
  return pathToFileUri(validated.absolutePath);
}

function pathToFileUri(fileName: string): string {
  const normalized = path.resolve(fileName).replace(/\\/g, "/");
  return `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`;
}

function createTypeScriptLanguageService(
  validated: ValidatedInteractionRequest,
  version: number | null | undefined,
): { service: ts.LanguageService; fileName: string; sourceFile: () => ts.SourceFile } {
  const fileName = validated.absolutePath.replace(/\\/g, "/");
  const scriptVersion = String(version ?? 1);
  const compilerOptions: ts.CompilerOptions = {
    allowJs: validated.language === "javascript" || validated.language === "javascriptreact",
    checkJs: validated.language === "javascript" || validated.language === "javascriptreact",
    jsx: validated.language === "typescriptreact" || validated.language === "javascriptreact" ? ts.JsxEmit.ReactJSX : ts.JsxEmit.Preserve,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
    target: ts.ScriptTarget.ES2022,
  };
  const sourceFile = () => ts.createSourceFile(fileName, validated.content, ts.ScriptTarget.ES2022, true, scriptKindForLanguage(validated.language));
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => validated.rootRealPath,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => [fileName],
    getScriptVersion: (name) => sameTsFile(name, fileName) ? scriptVersion : "0",
    getScriptSnapshot: (name) => {
      if (sameTsFile(name, fileName)) return ts.ScriptSnapshot.fromString(validated.content);
      if (!isAllowedTypeScriptLibraryFile(name)) return undefined;
      const text = ts.sys.readFile(name);
      return typeof text === "string" ? ts.ScriptSnapshot.fromString(text) : undefined;
    },
    fileExists: (name) => sameTsFile(name, fileName) || (isAllowedTypeScriptLibraryFile(name) && Boolean(ts.sys.fileExists(name))),
    readFile: (name) => {
      if (sameTsFile(name, fileName)) return validated.content;
      return isAllowedTypeScriptLibraryFile(name) ? ts.sys.readFile(name) : undefined;
    },
    readDirectory: () => [],
    directoryExists: (directoryName) => ts.sys.directoryExists?.(directoryName) ?? false,
    getDirectories: (directoryName) => ts.sys.getDirectories?.(directoryName) ?? [],
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };
  return {
    service: ts.createLanguageService(host, ts.createDocumentRegistry()),
    fileName,
    sourceFile,
  };
}

function textSpanToRange(sourceFile: ts.SourceFile, textSpan: ts.TextSpan): { startLine: number; startColumn: number; endLine: number; endColumn: number } {
  const start = sourceFile.getLineAndCharacterOfPosition(clampOffset(textSpan.start, sourceFile.text.length));
  const end = sourceFile.getLineAndCharacterOfPosition(clampOffset(textSpan.start + Math.max(1, textSpan.length), sourceFile.text.length));
  return {
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

function isAllowedTypeScriptLibraryFile(fileName: string): boolean {
  const normalized = fileName.replace(/\\/g, "/");
  return /\/node_modules\/typescript\/lib\/lib\..+\.d\.ts$/i.test(normalized);
}

function relativePathInsideRoot(rootRealPath: string, fileName: string): string | null {
  const normalizedRoot = rootRealPath.replace(/\\/g, "/");
  const normalizedFileName = path.resolve(fileName).replace(/\\/g, "/");
  const relative = path.relative(normalizedRoot, normalizedFileName).replace(/\\/g, "/");
  if (!relative || relative.startsWith("../") || relative === ".." || path.isAbsolute(relative)) return null;
  return relative;
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
