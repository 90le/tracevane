import fs from "node:fs";
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
  LspProviderId,
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
  LspWorkspaceSymbolIndexMetadata,
  LspWorkspaceSymbolItem,
  LspWorkspaceSymbolsRequest,
  LspWorkspaceSymbolsResponse,
  LspWorkspaceTextEdit,
} from "../../../../types/lsp.js";
import { resolveFilesServiceDirectoryPath, resolveFilesServiceExistingFilePath } from "../files/service.js";
import { completeCssWithLanguageService, completeHtmlWithLanguageService, defineCssWithLanguageService, diagnoseCssWithLanguageService, formatCssWithLanguageService, formatHtmlWithLanguageService, hoverCssWithLanguageService, hoverHtmlWithLanguageService, referenceCssWithLanguageService } from "./providers/htmlCssLanguageService.js";
import { completeJsonWithLanguageService, defineJsonWithLanguageService, diagnoseJsonWithLanguageService, formatJsonWithLanguageService, hoverJsonWithLanguageService, referenceJsonWithLanguageService } from "./providers/jsonLanguageService.js";
import { createExternalLanguageServerGateway } from "./external/externalLanguageServerGateway.js";
import { findExternalLanguageServerProfile } from "./external/externalProviderProfiles.js";
import { externalProviderMetadataForProfile } from "./external/externalProviderMetadata.js";
import { TS_PROVIDER_SOURCE, providerCapabilityMatrix, providerForLanguage, providerSupports, supportedFeaturesFromRegistry, supportedLanguagesFromRegistry } from "./providers/registry.js";
import { diagnoseWithGoGopls, goExternalDiagnosticToTracevaneDiagnostic } from "./toolchain/goGoplsProvider.js";
import { diagnoseWithRustAnalyzer, rustExternalDiagnosticToTracevaneDiagnostic } from "./toolchain/rustAnalyzerProvider.js";
import { diagnoseWithClangd, clangdExternalDiagnosticToTracevaneDiagnostic } from "./toolchain/clangdProvider.js";
import { toolchainProviderStatusSnapshot } from "./toolchain/toolchainProviderStatus.js";

const LSP_WS_PATH = "/ws/lsp";
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
const MAX_WORKSPACE_SYMBOL_QUERY_LENGTH = 80;
const MAX_WORKSPACE_SYMBOL_RESULTS = 100;
const MAX_WORKSPACE_SYMBOL_FILES = 300;
const MAX_WORKSPACE_SYMBOL_FILE_BYTES = 300_000;
const MAX_WORKSPACE_SYMBOL_INDEX_SCOPES = 20;
const MAX_WORKSPACE_SYMBOL_INDEX_ITEMS = 5_000;
const WORKSPACE_SYMBOL_INDEX_PROVIDER_VERSION = "typescript-navigate-v1";
const WORKSPACE_SYMBOL_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".vite",
]);
const WORKSPACE_SYMBOL_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"]);
const ESLINT_LANGUAGES = new Set(["javascript", "javascriptreact", "typescript", "typescriptreact"]);
const ESLINT_ROOT_CONFIG_FILES = [
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  "eslint.config.mts",
  "eslint.config.cts",
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.mjs",
  ".eslintrc.json",
  ".eslintrc.yaml",
  ".eslintrc.yml",
];
const ESLINT_MARKER_DISCOVERY_EXCLUDED_DIRECTORIES = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".nuxt",
  ".turbo",
  ".vite",
  ".tracevane-trash",
]);

export interface LspService {
  getStatus(): { ok: true; provider: "tracevane-lsp"; websocketPath: string; supportedLanguages: string[]; features: string[]; providers: ReturnType<typeof providerCapabilityMatrix>; externalProviders: ReturnType<typeof externalLanguageServerStatusSnapshot>; toolchainProviders: ReturnType<typeof toolchainProviderStatusSnapshot> };
  diagnoseDocument(request: LspDiagnosticsRequest): Promise<LspDiagnosticsResponse>;
  hoverDocument(request: LspPositionRequest): Promise<LspHoverResponse>;
  completeDocument(request: LspCompletionRequest): Promise<LspCompletionResponse>;
  defineDocument(request: LspPositionRequest): Promise<LspDefinitionResponse>;
  referenceDocument(request: LspPositionRequest): Promise<LspReferencesResponse>;
  semanticTokens(request: LspSemanticTokensRequest): LspSemanticTokensResponse;
  workspaceSymbols(request: LspWorkspaceSymbolsRequest): LspWorkspaceSymbolsResponse;
  renameDocument(request: LspRenameRequest): LspRenameResponse;
  formatDocument(request: LspFormattingRequest): Promise<LspFormattingResponse>;
  codeActions(request: LspCodeActionRequest): Promise<LspCodeActionResponse>;
  handleUpgrade(req: http.IncomingMessage, socket: Duplex, head: Buffer): boolean;
}

export function createLspService(config: TracevaneServerConfig): LspService {
  const wss = new WebSocketServer({ noServer: true });
  const workspaceSymbolIndex = createWorkspaceSymbolIndex();

  wss.on("connection", (socket) => {
    send(socket, {
      type: "ready",
      provider: "tracevane-lsp",
      message: "Tracevane LSP diagnostics provider ready",
    });

    socket.on("message", async (data) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        send(socket, { type: "error", message: "Invalid LSP gateway message JSON" });
        return;
      }

      const request = parsed as Partial<LspDiagnosticsRequest & LspPositionRequest & LspCompletionRequest & LspSemanticTokensRequest & LspWorkspaceSymbolsRequest>;
      if (!request?.type) {
        send(socket, { type: "error", id: request?.id ?? null, message: "Unsupported LSP gateway message type" });
        return;
      }

      try {
        if (request.type === "diagnose") {
          send(socket, await diagnoseDocument(config, request as LspDiagnosticsRequest));
          return;
        }
        if (request.type === "hover") {
          send(socket, await hoverDocument(config, request as LspPositionRequest));
          return;
        }
        if (request.type === "completion") {
          send(socket, await completeDocument(config, request as LspCompletionRequest));
          return;
        }
        if (request.type === "definition") {
          send(socket, await defineDocument(config, request as LspPositionRequest));
          return;
        }
        if (request.type === "references") {
          send(socket, await referenceDocument(config, request as LspPositionRequest));
          return;
        }
        if (request.type === "semanticTokens") {
          send(socket, semanticTokens(config, request as LspSemanticTokensRequest));
          return;
        }
        if (request.type === "workspaceSymbols") {
          send(socket, workspaceSymbols(config, request as LspWorkspaceSymbolsRequest, workspaceSymbolIndex));
          return;
        }
        if (request.type === "rename") {
          send(socket, renameDocument(config, request as LspRenameRequest));
          return;
        }
        if (request.type === "formatting") {
          send(socket, await formatDocument(config, request as LspFormattingRequest));
          return;
        }
        if (request.type === "codeAction") {
          send(socket, await codeActions(config, request as LspCodeActionRequest));
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
        supportedLanguages: supportedLanguagesFromRegistry(),
        features: supportedFeaturesFromRegistry(),
        providers: providerCapabilityMatrix(),
        externalProviders: externalLanguageServerStatusSnapshot(config),
        toolchainProviders: toolchainProviderStatusSnapshot(config),
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
    workspaceSymbols(request) {
      return workspaceSymbols(config, request, workspaceSymbolIndex);
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


async function hoverDocument(
  config: TracevaneServerConfig,
  request: LspPositionRequest,
): Promise<LspHoverResponse> {
  const validated = validateInteractionRequest(config, request);
  const provider = providerForLanguage(validated.language);
  if (provider?.id === "typescript") {
    return hoverTypeScriptLike(request, validated);
  }
  let hover: { contents: string[]; range?: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null };
  if (provider?.id === "json") {
    hover = await hoverJsonWithLanguageService({ ...jsonProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "html") {
    hover = hoverHtmlWithLanguageService({ ...htmlCssProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "css") {
    hover = hoverCssWithLanguageService({ ...htmlCssProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else {
    throw unsupportedLspFeatureError("hover", validated.language);
  }
  return {
    type: "hover",
    id: request.id ?? null,
    provider: provider.id,
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    contents: hover.contents,
    range: hover.range ?? null,
    checkedAt: new Date().toISOString(),
  };
}

async function completeDocument(
  config: TracevaneServerConfig,
  request: LspCompletionRequest,
): Promise<LspCompletionResponse> {
  const validated = validateInteractionRequest(config, request);
  const provider = providerForLanguage(validated.language);
  if (provider?.id === "typescript") {
    return completeTypeScriptLike(request, validated);
  }
  let items: LspCompletionItem[];
  if (provider?.id === "json") {
    items = await completeJsonWithLanguageService({ ...jsonProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "html") {
    items = completeHtmlWithLanguageService({ ...htmlCssProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "css") {
    items = completeCssWithLanguageService({ ...htmlCssProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else {
    throw unsupportedLspFeatureError("completion", validated.language);
  }
  return {
    type: "completion",
    id: request.id ?? null,
    provider: provider.id,
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    items,
    checkedAt: new Date().toISOString(),
  };
}

async function defineDocument(
  config: TracevaneServerConfig,
  request: LspPositionRequest,
): Promise<LspDefinitionResponse> {
  const validated = validateInteractionRequest(config, request);
  const provider = providerForLanguage(validated.language);
  if (provider?.id === "typescript") {
    return defineTypeScriptLike(request, validated);
  }
  let locations: LspDefinitionResponse["locations"];
  if (provider?.id === "json") {
    locations = defineJsonWithLanguageService({ ...jsonProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "css") {
    locations = defineCssWithLanguageService({ ...htmlCssProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "html") {
    locations = [];
  } else {
    throw unsupportedLspFeatureError("definition", validated.language);
  }
  return {
    type: "definition",
    id: request.id ?? null,
    provider: provider.id,
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    locations,
    checkedAt: new Date().toISOString(),
  };
}

async function referenceDocument(
  config: TracevaneServerConfig,
  request: LspPositionRequest,
): Promise<LspReferencesResponse> {
  const validated = validateInteractionRequest(config, request);
  const provider = providerForLanguage(validated.language);
  if (provider?.id === "typescript") {
    return referenceTypeScriptLike(request, validated);
  }
  let locations: LspReferencesResponse["locations"];
  if (provider?.id === "json") {
    locations = referenceJsonWithLanguageService({ ...jsonProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "css") {
    locations = referenceCssWithLanguageService({ ...htmlCssProviderInput(validated, request.version), rootId: validated.rootId, path: validated.path, line: request.line, column: request.column });
  } else if (provider?.id === "html") {
    locations = [];
  } else {
    throw unsupportedLspFeatureError("references", validated.language);
  }
  return {
    type: "references",
    id: request.id ?? null,
    provider: provider.id,
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    locations,
    checkedAt: new Date().toISOString(),
  };
}

function semanticTokens(
  config: TracevaneServerConfig,
  request: LspSemanticTokensRequest,
): LspSemanticTokensResponse {
  const validated = validateInteractionRequest(config, request);
  if (!providerSupports(validated.language, "semanticTokens")) {
    throw new Error("Semantic tokens are currently supported for TypeScript/JavaScript documents only");
  }
  return semanticTokensTypeScriptLike(request, validated);
}

interface WorkspaceSymbolSourceFile {
  fileName: string;
  relativePath: string;
  content: string;
  language: string;
  version: string;
}

function workspaceSymbols(
  config: TracevaneServerConfig,
  request: LspWorkspaceSymbolsRequest,
  index: WorkspaceSymbolIndex,
): LspWorkspaceSymbolsResponse {
  const rootId = normalizeRequired(request.rootId, "rootId");
  const query = String(request.query || "").trim();
  if (query.length > MAX_WORKSPACE_SYMBOL_QUERY_LENGTH) {
    throw new Error(`query must be ${MAX_WORKSPACE_SYMBOL_QUERY_LENGTH} characters or less`);
  }
  const directoryPath = normalizeOptionalDirectoryPath(request.path);
  const resolved = resolveFilesServiceDirectoryPath(config, rootId, directoryPath);
  const limit = clampInteger(request.limit, 1, MAX_WORKSPACE_SYMBOL_RESULTS, MAX_WORKSPACE_SYMBOL_RESULTS);
  const includeHidden = request.includeHidden === true;
  if (!query) {
    return workspaceSymbolsEmptyResponse(request, resolved.root.id, "", resolved.relativePath, null, 0, 0, false);
  }

  return index.query({
    id: request.id ?? null,
    rootId: resolved.root.id,
    rootRealPath: resolved.root.realPath,
    absolutePath: resolved.absolutePath,
    relativePath: resolved.relativePath,
    query,
    limit,
    includeHidden,
  });
}

interface WorkspaceSymbolIndexQuery {
  id: string | null;
  rootId: string;
  rootRealPath: string;
  absolutePath: string;
  relativePath: string;
  query: string;
  limit: number;
  includeHidden: boolean;
}

interface WorkspaceSymbolFileFingerprint {
  fileName: string;
  relativePath: string;
  language: string;
  version: string;
  size: number;
  mtimeMs: number;
}

interface WorkspaceSymbolScanResult {
  files: WorkspaceSymbolSourceFile[];
  fingerprints: WorkspaceSymbolFileFingerprint[];
  scannedFiles: number;
  skippedFiles: number;
  truncated: boolean;
}

interface WorkspaceSymbolIndexScope {
  key: string;
  rootId: string;
  relativePath: string;
  includeHidden: boolean;
  fingerprints: Map<string, WorkspaceSymbolFileFingerprint>;
  items: LspWorkspaceSymbolItem[];
  scannedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  rebuiltAt: string;
  lastUsedAt: number;
}

interface WorkspaceSymbolIndex {
  query(request: WorkspaceSymbolIndexQuery): LspWorkspaceSymbolsResponse;
}

function createWorkspaceSymbolIndex(): WorkspaceSymbolIndex {
  const scopes = new Map<string, WorkspaceSymbolIndexScope>();

  const touch = (scope: WorkspaceSymbolIndexScope) => {
    scope.lastUsedAt = Date.now();
    scopes.delete(scope.key);
    scopes.set(scope.key, scope);
  };

  const evictIfNeeded = () => {
    while (scopes.size > MAX_WORKSPACE_SYMBOL_INDEX_SCOPES) {
      const oldest = scopes.keys().next().value;
      if (!oldest) break;
      scopes.delete(oldest);
    }
  };

  return {
    query(request) {
      const scopeKey = workspaceSymbolIndexScopeKey(request.rootId, request.relativePath, request.includeHidden);
      const metadataScan = collectWorkspaceSymbolSourceFiles(request.rootRealPath, request.absolutePath, request.includeHidden, false);
      const existing = scopes.get(scopeKey);
      if (existing) {
        const staleFiles = countStaleWorkspaceSymbolFiles(existing.fingerprints, metadataScan.fingerprints);
        if (staleFiles === 0 && !metadataScan.truncated) {
          touch(existing);
          const items = filterWorkspaceSymbolIndexItems(existing.items, request.query, request.limit, request.rootId);
          return workspaceSymbolsResponseFromIndex(request, items, existing, {
            status: "fresh",
            staleFiles: 0,
            scannedFiles: metadataScan.scannedFiles,
            skippedFiles: metadataScan.skippedFiles,
            truncated: metadataScan.truncated || items.length >= request.limit,
          });
        }
      }

      try {
        const sourceScan = collectWorkspaceSymbolSourceFiles(request.rootRealPath, request.absolutePath, request.includeHidden, true);
        const rebuilt = buildWorkspaceSymbolIndexScope(scopeKey, request, sourceScan);
        scopes.set(scopeKey, rebuilt);
        touch(rebuilt);
        evictIfNeeded();
        const items = filterWorkspaceSymbolIndexItems(rebuilt.items, request.query, request.limit, request.rootId);
        return workspaceSymbolsResponseFromIndex(request, items, rebuilt, {
          status: "rebuilt",
          staleFiles: existing ? countStaleWorkspaceSymbolFiles(existing.fingerprints, sourceScan.fingerprints) : sourceScan.fingerprints.length,
          scannedFiles: sourceScan.scannedFiles,
          skippedFiles: sourceScan.skippedFiles,
          truncated: sourceScan.truncated || rebuilt.truncated || items.length >= request.limit,
        });
      } catch {
        return workspaceSymbolsDirect(request, "direct", scopeKey);
      }
    },
  };
}

function buildWorkspaceSymbolIndexScope(
  scopeKey: string,
  request: WorkspaceSymbolIndexQuery,
  scan: WorkspaceSymbolScanResult,
): WorkspaceSymbolIndexScope {
  if (!scan.files.length) {
    return {
      key: scopeKey,
      rootId: request.rootId,
      relativePath: request.relativePath,
      includeHidden: request.includeHidden,
      fingerprints: new Map(scan.fingerprints.map((fingerprint) => [fingerprint.relativePath, fingerprint])),
      items: [],
      scannedFiles: scan.scannedFiles,
      skippedFiles: scan.skippedFiles,
      truncated: scan.truncated,
      rebuiltAt: new Date().toISOString(),
      lastUsedAt: Date.now(),
    };
  }

  const languageService = createWorkspaceTypeScriptLanguageService(request.rootRealPath, scan.files);
  try {
    const navigateItems = languageService.service.getNavigateToItems("", MAX_WORKSPACE_SYMBOL_INDEX_ITEMS, undefined, true, true) ?? [];
    const items = navigateItems
      .map((item) => workspaceNavigateItemToSymbol(request.rootId, languageService.filesByName, item))
      .filter((item): item is LspWorkspaceSymbolItem => Boolean(item));
    return {
      key: scopeKey,
      rootId: request.rootId,
      relativePath: request.relativePath,
      includeHidden: request.includeHidden,
      fingerprints: new Map(scan.fingerprints.map((fingerprint) => [fingerprint.relativePath, fingerprint])),
      items,
      scannedFiles: scan.scannedFiles,
      skippedFiles: scan.skippedFiles,
      truncated: scan.truncated || navigateItems.length >= MAX_WORKSPACE_SYMBOL_INDEX_ITEMS,
      rebuiltAt: new Date().toISOString(),
      lastUsedAt: Date.now(),
    };
  } finally {
    languageService.service.dispose();
  }
}

function workspaceSymbolsDirect(
  request: WorkspaceSymbolIndexQuery,
  indexStatus: LspWorkspaceSymbolIndexMetadata["status"],
  scopeKey: string,
): LspWorkspaceSymbolsResponse {
  const scan = collectWorkspaceSymbolSourceFiles(request.rootRealPath, request.absolutePath, request.includeHidden, true);
  if (!scan.files.length) {
    return workspaceSymbolsEmptyResponse(
      { id: request.id },
      request.rootId,
      request.query,
      request.relativePath,
      workspaceSymbolIndexMetadata(indexStatus, scopeKey, 0, 0, scan.fingerprints.length, null),
      scan.scannedFiles,
      scan.skippedFiles,
      scan.truncated,
    );
  }
  const languageService = createWorkspaceTypeScriptLanguageService(request.rootRealPath, scan.files);
  try {
    const navigateItems = languageService.service.getNavigateToItems(request.query, request.limit, undefined, true, true) ?? [];
    const items = navigateItems
      .map((item) => workspaceNavigateItemToSymbol(request.rootId, languageService.filesByName, item))
      .filter((item): item is LspWorkspaceSymbolItem => Boolean(item))
      .slice(0, request.limit);
    return {
      type: "workspaceSymbols",
      id: request.id,
      provider: "typescript",
      rootId: request.rootId,
      query: request.query,
      path: request.relativePath,
      items,
      scannedFiles: scan.scannedFiles,
      skippedFiles: scan.skippedFiles,
      truncated: scan.truncated || navigateItems.length > items.length || items.length >= request.limit,
      index: workspaceSymbolIndexMetadata(indexStatus, scopeKey, scan.files.length, items.length, scan.fingerprints.length, null),
      checkedAt: new Date().toISOString(),
    };
  } finally {
    languageService.service.dispose();
  }
}

function workspaceSymbolsResponseFromIndex(
  request: WorkspaceSymbolIndexQuery,
  items: LspWorkspaceSymbolItem[],
  scope: WorkspaceSymbolIndexScope,
  options: {
    status: LspWorkspaceSymbolIndexMetadata["status"];
    staleFiles: number;
    scannedFiles: number;
    skippedFiles: number;
    truncated: boolean;
  },
): LspWorkspaceSymbolsResponse {
  return {
    type: "workspaceSymbols",
    id: request.id,
    provider: "typescript",
    rootId: request.rootId,
    query: request.query,
    path: request.relativePath,
    items,
    scannedFiles: options.scannedFiles,
    skippedFiles: options.skippedFiles,
    truncated: options.truncated,
    index: workspaceSymbolIndexMetadata(options.status, scope.key, scope.fingerprints.size, scope.items.length, options.staleFiles, scope.rebuiltAt),
    checkedAt: new Date().toISOString(),
  };
}

function workspaceSymbolsEmptyResponse(
  request: { id?: string | null },
  rootId: string,
  query: string,
  relativePath: string,
  index: LspWorkspaceSymbolIndexMetadata | null,
  scannedFiles: number,
  skippedFiles: number,
  truncated: boolean,
): LspWorkspaceSymbolsResponse {
  return {
    type: "workspaceSymbols",
    id: request.id ?? null,
    provider: "typescript",
    rootId,
    query,
    path: relativePath,
    items: [],
    scannedFiles,
    skippedFiles,
    truncated,
    index,
    checkedAt: new Date().toISOString(),
  };
}

function workspaceSymbolIndexMetadata(
  status: LspWorkspaceSymbolIndexMetadata["status"],
  scopeKey: string,
  indexedFiles: number,
  indexedSymbols: number,
  staleFiles: number,
  rebuiltAt: string | null,
): LspWorkspaceSymbolIndexMetadata {
  return {
    status,
    scopeKey,
    indexedFiles,
    indexedSymbols,
    staleFiles,
    providerVersion: WORKSPACE_SYMBOL_INDEX_PROVIDER_VERSION,
    rebuiltAt,
  };
}

function filterWorkspaceSymbolIndexItems(
  items: LspWorkspaceSymbolItem[],
  query: string,
  limit: number,
  rootId: string,
): LspWorkspaceSymbolItem[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return [];
  const scored: Array<{ item: LspWorkspaceSymbolItem; score: number; matchKind: LspWorkspaceSymbolItem["matchKind"] }> = [];
  for (const item of items) {
    const name = item.name.toLowerCase();
    const container = (item.containerName || "").toLowerCase();
    const pathName = item.path.toLowerCase();
    let score = Number.POSITIVE_INFINITY;
    let matchKind: LspWorkspaceSymbolItem["matchKind"] = undefined;
    if (name === normalizedQuery) {
      score = 0;
      matchKind = "exact";
    } else if (name.startsWith(normalizedQuery)) {
      score = 1;
      matchKind = "prefix";
    } else if (name.includes(normalizedQuery)) {
      score = 2;
      matchKind = "substring";
    } else if (container.includes(normalizedQuery)) {
      score = 3;
      matchKind = "substring";
    } else if (pathName.includes(normalizedQuery)) {
      score = 4;
      matchKind = "substring";
    }
    if (score === Number.POSITIVE_INFINITY) continue;
    scored.push({ item, score, matchKind });
  }
  return scored
    .sort((left, right) => left.score - right.score || left.item.name.localeCompare(right.item.name) || left.item.path.localeCompare(right.item.path))
    .slice(0, limit)
    .map(({ item, matchKind }) => ({ ...item, rootId, matchKind }));
}

function countStaleWorkspaceSymbolFiles(
  previous: Map<string, WorkspaceSymbolFileFingerprint>,
  next: WorkspaceSymbolFileFingerprint[],
): number {
  let stale = 0;
  const seen = new Set<string>();
  for (const fingerprint of next) {
    seen.add(fingerprint.relativePath);
    const old = previous.get(fingerprint.relativePath);
    if (!old || old.version !== fingerprint.version || old.fileName !== fingerprint.fileName) stale += 1;
  }
  for (const key of previous.keys()) {
    if (!seen.has(key)) stale += 1;
  }
  return stale;
}

function workspaceSymbolIndexScopeKey(rootId: string, relativePath: string, includeHidden: boolean): string {
  return `${rootId}:${includeHidden ? "hidden" : "visible"}:${relativePath || "."}`;
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
  const provider = providerForLanguage(validated.language);
  if (provider?.id === "typescript") {
    return renameTypeScriptLike(request, validated, newName);
  }
  return {
    type: "rename",
    id: request.id ?? null,
    provider: responseProviderId(provider?.id),
    rootId: validated.rootId,
    path: validated.path,
    language: validated.language,
    version: request.version ?? null,
    workspaceEdit: null,
    rejected: [{ kind: "unknown", path: validated.path, reason: "Rename is currently supported for TypeScript/JavaScript symbols only" }],
    checkedAt: new Date().toISOString(),
  };
}

async function formatDocument(
  config: TracevaneServerConfig,
  request: LspFormattingRequest,
): Promise<LspFormattingResponse> {
  const validated = validateInteractionRequest(config, request);
  const options = { tabSize: Math.max(1, Math.floor(request.tabSize ?? 2)), insertSpaces: request.insertSpaces !== false };
  let textEdits: LspWorkspaceTextEdit[] = [];
  const descriptor = providerForLanguage(validated.language);
  const provider = responseProviderId(descriptor?.id);
  if (descriptor?.id === "typescript") {
    textEdits = formatTypeScriptLike(validated, options);
  } else if (descriptor?.id === "json") {
    textEdits = formatJsonWithLanguageService(jsonProviderInput(validated, request.version), options);
  } else if (descriptor?.id === "html") {
    textEdits = formatHtmlWithLanguageService(htmlCssProviderInput(validated, request.version), options);
  } else if (descriptor?.id === "css") {
    textEdits = formatCssWithLanguageService(htmlCssProviderInput(validated, request.version), options);
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

async function codeActions(
  config: TracevaneServerConfig,
  request: LspCodeActionRequest,
): Promise<LspCodeActionResponse> {
  const validated = validateInteractionRequest(config, request);
  const descriptor = providerForLanguage(validated.language);
  const provider = responseProviderId(descriptor?.id);
  const formatting = await formatDocument(config, {
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

function createWorkspaceTypeScriptLanguageService(
  rootRealPath: string,
  files: WorkspaceSymbolSourceFile[],
): { service: ts.LanguageService; filesByName: Map<string, WorkspaceSymbolSourceFile> } {
  const filesByName = new Map(files.map((file) => [file.fileName, file]));
  const compilerOptions: ts.CompilerOptions = {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Node10,
    noEmit: true,
    skipLibCheck: true,
    strict: false,
    target: ts.ScriptTarget.ES2022,
  };
  const host: ts.LanguageServiceHost = {
    getCompilationSettings: () => compilerOptions,
    getCurrentDirectory: () => rootRealPath,
    getDefaultLibFileName: (options) => ts.getDefaultLibFilePath(options),
    getScriptFileNames: () => files.map((file) => file.fileName),
    getScriptVersion: (name) => filesByName.get(normalizeTsFileName(name))?.version ?? "0",
    getScriptSnapshot: (name) => {
      const source = filesByName.get(normalizeTsFileName(name));
      if (source) return ts.ScriptSnapshot.fromString(source.content);
      if (!isAllowedTypeScriptLibraryFile(name)) return undefined;
      const text = ts.sys.readFile(name);
      return typeof text === "string" ? ts.ScriptSnapshot.fromString(text) : undefined;
    },
    fileExists: (name) => filesByName.has(normalizeTsFileName(name)) || (isAllowedTypeScriptLibraryFile(name) && Boolean(ts.sys.fileExists(name))),
    readFile: (name) => filesByName.get(normalizeTsFileName(name))?.content ?? (isAllowedTypeScriptLibraryFile(name) ? ts.sys.readFile(name) : undefined),
    readDirectory: () => [],
    directoryExists: (directoryName) => ts.sys.directoryExists?.(directoryName) ?? false,
    getDirectories: (directoryName) => ts.sys.getDirectories?.(directoryName) ?? [],
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };
  return {
    service: ts.createLanguageService(host, ts.createDocumentRegistry()),
    filesByName,
  };
}

function collectWorkspaceSymbolSourceFiles(
  rootRealPath: string,
  startDirectory: string,
  includeHidden: boolean,
  readContent = true,
): WorkspaceSymbolScanResult {
  const files: WorkspaceSymbolSourceFile[] = [];
  const fingerprints: WorkspaceSymbolFileFingerprint[] = [];
  let scannedFiles = 0;
  let skippedFiles = 0;
  let truncated = false;
  const pending = [startDirectory];
  while (pending.length && !truncated) {
    const directory = pending.shift();
    if (!directory) break;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      skippedFiles += 1;
      continue;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.isSymbolicLink()) {
        skippedFiles += 1;
        continue;
      }
      if (!includeHidden && entry.name.startsWith(".")) {
        skippedFiles += 1;
        continue;
      }
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (WORKSPACE_SYMBOL_EXCLUDED_DIRECTORIES.has(entry.name)) {
          skippedFiles += 1;
          continue;
        }
        pending.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) {
        skippedFiles += 1;
        continue;
      }
      const extension = path.extname(entry.name).toLowerCase();
      if (!WORKSPACE_SYMBOL_EXTENSIONS.has(extension)) {
        skippedFiles += 1;
        continue;
      }
      if (scannedFiles >= MAX_WORKSPACE_SYMBOL_FILES) {
        truncated = true;
        break;
      }
      scannedFiles += 1;
      let stat: fs.Stats;
      let realPath: string;
      try {
        stat = fs.statSync(absolutePath);
        realPath = fs.realpathSync.native?.(absolutePath) || fs.realpathSync(absolutePath);
      } catch {
        skippedFiles += 1;
        continue;
      }
      if (!stat.isFile() || stat.size > MAX_WORKSPACE_SYMBOL_FILE_BYTES) {
        skippedFiles += 1;
        continue;
      }
      const relativePath = relativePathInsideRoot(rootRealPath, realPath);
      if (!relativePath) {
        skippedFiles += 1;
        continue;
      }
      const language = languageForWorkspaceSymbolPath(relativePath);
      const fileName = normalizeTsFileName(realPath);
      const version = `${stat.mtimeMs}:${stat.size}`;
      fingerprints.push({
        fileName,
        relativePath,
        language,
        version,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
      if (!readContent) continue;
      let content: string;
      try {
        content = fs.readFileSync(absolutePath, "utf8");
      } catch {
        skippedFiles += 1;
        continue;
      }
      files.push({
        fileName,
        relativePath,
        content,
        language,
        version,
      });
    }
  }
  return { files, fingerprints, scannedFiles, skippedFiles, truncated };
}

function workspaceNavigateItemToSymbol(
  rootId: string,
  filesByName: Map<string, WorkspaceSymbolSourceFile>,
  item: ts.NavigateToItem,
): LspWorkspaceSymbolItem | null {
  const source = filesByName.get(normalizeTsFileName(item.fileName));
  if (!source) return null;
  const sourceFile = ts.createSourceFile(item.fileName, source.content, ts.ScriptTarget.ES2022, true, scriptKindForLanguage(source.language));
  const range = textSpanToRange(sourceFile, item.textSpan);
  return {
    rootId,
    path: source.relativePath,
    name: item.name,
    kind: workspaceSymbolKindForScriptElementKind(item.kind),
    containerName: item.containerName || null,
    matchKind: item.matchKind || null,
    startLine: range.startLine,
    startColumn: range.startColumn,
    endLine: range.endLine,
    endColumn: range.endColumn,
  };
}

function workspaceSymbolKindForScriptElementKind(kind: ts.ScriptElementKind): LspWorkspaceSymbolItem["kind"] {
  switch (kind) {
    case ts.ScriptElementKind.classElement:
    case ts.ScriptElementKind.localClassElement:
      return "class";
    case ts.ScriptElementKind.interfaceElement:
      return "interface";
    case ts.ScriptElementKind.typeElement:
      return "type";
    case ts.ScriptElementKind.enumElement:
      return "enum";
    case ts.ScriptElementKind.moduleElement:
    case ts.ScriptElementKind.externalModuleName:
      return "module";
    case ts.ScriptElementKind.functionElement:
    case ts.ScriptElementKind.localFunctionElement:
      return "function";
    case ts.ScriptElementKind.memberFunctionElement:
    case ts.ScriptElementKind.memberGetAccessorElement:
    case ts.ScriptElementKind.memberSetAccessorElement:
      return "method";
    case ts.ScriptElementKind.constElement:
    case ts.ScriptElementKind.letElement:
    case ts.ScriptElementKind.variableElement:
    case ts.ScriptElementKind.localVariableElement:
    case ts.ScriptElementKind.variableUsingElement:
    case ts.ScriptElementKind.variableAwaitUsingElement:
      return "variable";
    case ts.ScriptElementKind.memberVariableElement:
    case ts.ScriptElementKind.memberAccessorVariableElement:
    case ts.ScriptElementKind.enumMemberElement:
      return "property";
    case ts.ScriptElementKind.constructorImplementationElement:
      return "constructor";
    default:
      return "unknown";
  }
}

function languageForWorkspaceSymbolPath(targetPath: string): string {
  if (/\.tsx$/i.test(targetPath)) return "typescriptreact";
  if (/\.jsx$/i.test(targetPath)) return "javascriptreact";
  if (/\.(?:js|mjs|cjs)$/i.test(targetPath)) return "javascript";
  return "typescript";
}

function normalizeTsFileName(fileName: string): string {
  return path.resolve(fileName).replace(/\\/g, "/");
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

function jsonProviderInput(validated: ValidatedInteractionRequest, version?: number | null): { uri: string; content: string; version?: number | null } {
  return {
    uri: pathToFileUri(validated.absolutePath),
    content: validated.content,
    version: version ?? null,
  };
}

function htmlCssProviderInput(validated: ValidatedInteractionRequest, version?: number | null): { uri: string; content: string; language: string; version?: number | null } {
  return {
    uri: pathToFileUri(validated.absolutePath),
    content: validated.content,
    language: validated.language,
    version: version ?? null,
  };
}

function unsupportedLspFeatureError(feature: string, language: string): Error {
  return new Error(`Tracevane LSP ${feature} is not supported for ${language || "unknown"} by the current provider registry`);
}

async function diagnoseDocument(
  config: TracevaneServerConfig,
  request: LspDiagnosticsRequest,
): Promise<LspDiagnosticsResponse> {
  const rootId = normalizeRequired(request.rootId, "rootId");
  const targetPath = normalizePath(request.path);
  const content = typeof request.content === "string" ? request.content : "";
  // Reuse the Files API root/path guard so the diagnostics gateway never accepts
  // arbitrary host paths. The content is supplied by the current editor model, but
  // the path still has to resolve to an existing workspace file.
  const resolved = resolveFilesServiceExistingFilePath(config, rootId, targetPath);
  const language = normalizeLanguage(request.language, resolved.relativePath, content);
  const eslintActivationRoot = isEslintLanguage(language)
    ? findEslintActivationRoot(resolved.root.realPath, resolved.absolutePath)
    : null;
  if (eslintActivationRoot) {
    return responseFor(request, resolved.root.id, resolved.relativePath, "eslint", language, await diagnoseWithExternalLanguageServer({
      providerId: "eslint",
      languageId: eslintLanguageId(language),
      sourceFallback: "eslint",
      rootRealPath: eslintActivationRoot,
      absolutePath: resolved.absolutePath,
      settings: eslintSettingsForWorkingDirectory(eslintActivationRoot),
      content,
      version: request.version ?? 1,
    }));
  }
  const provider = providerForLanguage(language);
  if (provider?.id === "json") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "json", language, await diagnoseJsonWithLanguageService({ uri: pathToFileUri(resolved.absolutePath), content, version: request.version ?? 1 }));
  }
  if (provider?.id === "typescript") {
    return responseFor(
      request,
      resolved.root.id,
      resolved.relativePath,
      "typescript",
      language,
      diagnoseTypeScriptLike(content, resolved.absolutePath, language),
    );
  }
  if (provider?.id === "css") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "css", language, diagnoseCssWithLanguageService({ uri: pathToFileUri(resolved.absolutePath), content, language, version: request.version ?? 1 }));
  }
  if (provider?.id === "html") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "html", language, []);
  }
  if (provider?.id === "yaml") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "yaml", language, await diagnoseWithExternalLanguageServer({
      providerId: "yaml",
      languageId: "yaml",
      sourceFallback: "yaml-language-server",
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    }));
  }
  if (provider?.id === "bash") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "bash", language, await diagnoseWithExternalLanguageServer({
      providerId: "bash",
      languageId: "shellscript",
      sourceFallback: "bash-language-server",
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    }));
  }
  if (provider?.id === "pyright") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "pyright", language, await diagnoseWithExternalLanguageServer({
      providerId: "pyright",
      languageId: "python",
      sourceFallback: "pyright",
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    }));
  }
  if (provider?.id === "dockerfile") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "dockerfile", language, await diagnoseWithExternalLanguageServer({
      providerId: "dockerfile",
      languageId: "dockerfile",
      sourceFallback: "dockerfile-language-server",
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    }));
  }
  if (provider?.id === "markdown") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "markdown", language, await diagnoseWithExternalLanguageServer({
      providerId: "markdown",
      languageId: "markdown",
      sourceFallback: "vscode-markdown-language-server",
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    }));
  }
  if (provider?.id === "vue") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "vue", language, await diagnoseWithExternalLanguageServer({
      providerId: "vue",
      languageId: "vue",
      sourceFallback: "@vue/language-server",
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    }));
  }
  if (provider?.id === "svelte") {
    return responseFor(request, resolved.root.id, resolved.relativePath, "svelte", language, await diagnoseWithExternalLanguageServer({
      providerId: "svelte",
      languageId: "svelte",
      sourceFallback: "svelte-language-server",
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    }));
  }
  if (provider?.id === "go") {
    const result = await diagnoseWithGoGopls({
      config,
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    });
    return responseFor(request, resolved.root.id, resolved.relativePath, "go", language, result.diagnostics.map((diagnostic) => goExternalDiagnosticToTracevaneDiagnostic(diagnostic)));
  }
  if (provider?.id === "rust") {
    const result = await diagnoseWithRustAnalyzer({
      config,
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    });
    return responseFor(request, resolved.root.id, resolved.relativePath, "rust", language, result.diagnostics.map((diagnostic) => rustExternalDiagnosticToTracevaneDiagnostic(diagnostic)));
  }
  if (provider?.id === "clangd") {
    const result = await diagnoseWithClangd({
      config,
      rootRealPath: resolved.root.realPath,
      absolutePath: resolved.absolutePath,
      content,
      version: request.version ?? 1,
    });
    return responseFor(request, resolved.root.id, resolved.relativePath, "clangd", language, result.diagnostics.map((diagnostic) => clangdExternalDiagnosticToTracevaneDiagnostic(diagnostic)));
  }
  return responseFor(request, resolved.root.id, resolved.relativePath, "json", language, []);
}

async function diagnoseWithExternalLanguageServer({
  providerId,
  languageId,
  sourceFallback,
  rootRealPath,
  absolutePath,
  content,
  version,
  settings,
}: {
  providerId: "yaml" | "bash" | "pyright" | "dockerfile" | "markdown" | "eslint" | "vue" | "svelte";
  languageId: string;
  sourceFallback: string;
  rootRealPath: string;
  absolutePath: string;
  content: string;
  version: number;
  settings?: Record<string, unknown>;
}): Promise<LspDiagnostic[]> {
  const uri = pathToFileUri(absolutePath);
  const gateway = createExternalLanguageServerGateway({ rootPath: rootRealPath, profiles: settings ? [externalProfileWithSettings(providerId, settings)] : undefined });
  await gateway.start(providerId);
  try {
    gateway.notify(providerId, "textDocument/didOpen", {
      textDocument: { uri, languageId, version, text: content },
    });
    if (providerId === "eslint") {
      const report = await gateway.request(providerId, "textDocument/diagnostic", {
        textDocument: { uri },
        identifier: "eslint",
      }, 5_000);
      return diagnosticsFromDocumentReport(report).map((diagnostic) => externalDiagnosticToTracevaneDiagnostic(diagnostic, sourceFallback));
    }
    const diagnostics = await gateway.waitForDiagnostics(providerId, uri, 3_000);
    return diagnostics.map((diagnostic) => externalDiagnosticToTracevaneDiagnostic(diagnostic, sourceFallback));
  } catch (error) {
    const reason = (error as { reason?: unknown } | null)?.reason;
    if ((providerId === "bash" || providerId === "markdown" || providerId === "eslint" || providerId === "vue" || providerId === "svelte") && reason === "request_timeout") return [];
    throw error;
  } finally {
    await gateway.stop(providerId).catch(() => undefined);
  }
}


function diagnosticsFromDocumentReport(report: unknown): unknown[] {
  if (!isRecord(report)) return [];
  const items = report.items;
  return Array.isArray(items) ? items : [];
}

function externalLanguageServerStatusSnapshot(config: TracevaneServerConfig) {
  const rootPath = path.resolve(path.parse(config.openclawRoot).root || "/");
  const gateway = createExternalLanguageServerGateway({ rootPath });
  return {
    profiles: gateway.listProfiles().map((profile) => {
      const metadata = externalProviderMetadataForProfile(profile);
      return {
        id: profile.id,
        label: profile.label,
        languages: profile.languages,
        capabilities: profile.capabilities,
        enabled: profile.enabled !== false,
        install: {
          status: metadata.installStatus,
          version: metadata.version,
          pinnedVersion: metadata.pinnedVersion,
          source: metadata.source,
          packageName: metadata.packageName,
          optional: metadata.optional,
        },
      };
    }),
    statuses: gateway.listStatuses(),
    metadata: gateway.listProfiles().map((profile) => externalProviderMetadataForProfile(profile)),
  };
}

function externalDiagnosticToTracevaneDiagnostic(diagnostic: unknown, sourceFallback: string): LspDiagnostic {
  const record = isRecord(diagnostic) ? diagnostic : {};
  const range = isRecord(record.range) ? record.range : {};
  const start = isRecord(range.start) ? range.start : {};
  const end = isRecord(range.end) ? range.end : {};
  return {
    severity: lspNumericSeverityToTracevane(record.severity),
    message: typeof record.message === "string" ? record.message : "External LSP diagnostic",
    startLine: safeNumber(start.line),
    startColumn: safeNumber(start.character),
    endLine: typeof end.line === "number" ? end.line : undefined,
    endColumn: typeof end.character === "number" ? end.character : undefined,
    code: typeof record.code === "string" || typeof record.code === "number" ? String(record.code) : null,
    source: typeof record.source === "string" ? record.source : sourceFallback,
  };
}

function lspNumericSeverityToTracevane(severity: unknown): LspDiagnostic["severity"] {
  if (severity === 1) return "error";
  if (severity === 2) return "warning";
  if (severity === 3) return "info";
  if (severity === 4) return "hint";
  return "warning";
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}


function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function responseFor(
  request: LspDiagnosticsRequest,
  rootId: string,
  targetPath: string,
  provider: LspProviderId,
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
  if (raw === "vue") return "vue";
  if (raw === "svelte") return "svelte";
  if (raw === "html" || raw === "htm") return "html";
  if (raw === "css" || raw === "scss" || raw === "less") return raw;
  if (raw === "ts" || raw === "typescript") return "typescript";
  if (raw === "tsx" || raw === "typescriptreact") return "typescriptreact";
  if (raw === "js" || raw === "javascript") return "javascript";
  if (raw === "jsx" || raw === "javascriptreact") return "javascriptreact";
  if (/\.tsx$/i.test(targetPath)) return "typescriptreact";
  if (/\.ts$/i.test(targetPath) && !/\.d\.ts$/i.test(targetPath)) return "typescript";
  if (/\.d\.ts$/i.test(targetPath)) return "typescript";
  if (/\.jsx$/i.test(targetPath)) return "javascriptreact";
  if (/\.m?js$/i.test(targetPath) || /\.cjs$/i.test(targetPath)) return "javascript";
  if (/\.vue$/i.test(targetPath)) return "vue";
  if (/\.svelte$/i.test(targetPath)) return "svelte";
  if (/\.html?$/i.test(targetPath)) return "html";
  if (/\.scss$/i.test(targetPath)) return "scss";
  if (/\.less$/i.test(targetPath)) return "less";
  if (/\.css$/i.test(targetPath)) return "css";
  if (raw === "shell" || raw === "shellscript" || raw === "bash" || raw === "sh") return "shell";
  if (/\.(?:ba)?sh$/i.test(targetPath) || /\.bashrc$/i.test(targetPath) || /(^|\/)bashrc$/i.test(targetPath)) return "shell";
  if (raw === "docker" || raw === "dockerfile") return "dockerfile";
  if (/\/?Dockerfile(?:$|[.\-_])/i.test(targetPath) || /\.(?:dockerfile|containerfile)$/i.test(targetPath)) return "dockerfile";
  if (raw === "markdown" || raw === "md" || raw === "mdx") return raw === "mdx" ? "mdx" : "markdown";
  if (/\.mdx$/i.test(targetPath)) return "mdx";
  if (/\.(?:md|markdown)$/i.test(targetPath)) return "markdown";
  if (/(^|\.)json($|[.\-_])/i.test(targetPath)) return "json";
  const trimmed = content.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  if (/^<!doctype\s+html\b/i.test(trimmed) || /^<html[\s>]/i.test(trimmed) || /<(?:div|span|section|article|main|body|head|script|style)[\s>]/i.test(trimmed)) return "html";
  return raw || "plaintext";
}

function isEslintLanguage(language: string): boolean {
  return ESLINT_LANGUAGES.has(language);
}

function eslintLanguageId(language: string): string {
  return language === "typescriptreact" || language === "javascriptreact" ? language : language;
}

function findEslintActivationRoot(rootRealPath: string, absolutePath: string): string | null {
  const boundary = safeRealPath(rootRealPath);
  const target = safeRealPath(absolutePath);
  if (!isPathInsideBoundary(boundary, target)) return null;

  let current = path.dirname(target);
  if (hasIgnoredEslintDiscoverySegment(boundary, current)) return null;

  while (isPathInsideBoundary(boundary, current)) {
    if (!hasIgnoredEslintDiscoverySegment(boundary, current) && hasEslintActivationMarker(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

function isPathInsideBoundary(boundary: string, target: string): boolean {
  const relative = path.relative(boundary, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRealPath(targetPath: string): string {
  try {
    return fs.realpathSync.native(path.resolve(targetPath));
  } catch {
    return path.resolve(targetPath);
  }
}

function hasIgnoredEslintDiscoverySegment(boundary: string, targetDirectory: string): boolean {
  const relative = path.relative(boundary, targetDirectory);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return false;
  return relative.split(path.sep).some((segment) => ESLINT_MARKER_DISCOVERY_EXCLUDED_DIRECTORIES.has(segment));
}

function eslintSettingsForWorkingDirectory(activationRoot: string): Record<string, unknown> {
  return {
    validate: "on",
    packageManager: "npm",
    codeAction: { disableRuleComment: { enable: false }, showDocumentation: { enable: false } },
    codeActionOnSave: { enable: false, mode: "problems" },
    format: false,
    run: "onType",
    workingDirectory: { directory: activationRoot, changeProcessCWD: false },
    nodePath: null,
    options: {},
    rulesCustomizations: [],
    problems: { shortenToSingleLine: false },
    experimental: { useFlatConfig: false },
    useESLintClass: true,
  };
}

function externalProfileWithSettings(providerId: "yaml" | "bash" | "pyright" | "dockerfile" | "markdown" | "eslint" | "vue" | "svelte", settings: Record<string, unknown>) {
  const profile = findExternalLanguageServerProfile(providerId);
  if (!profile) throw new Error(`Unknown external LSP profile: ${providerId}`);
  return { ...profile, settings };
}

function hasEslintActivationMarker(candidateRoot: string): boolean {
  for (const fileName of ESLINT_ROOT_CONFIG_FILES) {
    if (fs.existsSync(path.join(candidateRoot, fileName))) return true;
  }
  const packageJsonPath = path.join(candidateRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) return false;
  try {
    const raw = fs.readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (isRecord(parsed.eslintConfig)) return true;
    if (hasEslintDependency(parsed)) return true;
    if (hasEslintScript(parsed)) return true;
  } catch {
    return false;
  }
  return false;
}

function hasEslintDependency(packageJson: Record<string, unknown>): boolean {
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"]) {
    const dependencies = packageJson[key];
    if (!isRecord(dependencies)) continue;
    if (typeof dependencies.eslint === "string" || typeof dependencies["@eslint/js"] === "string") return true;
  }
  return false;
}

function hasEslintScript(packageJson: Record<string, unknown>): boolean {
  const scripts = packageJson.scripts;
  if (!isRecord(scripts)) return false;
  return Object.entries(scripts).some(([name, value]) => {
    const script = typeof value === "string" ? value : "";
    return /(^|[:_-])lint($|[:_-])/.test(name) || /(^|\s)eslint(\s|$)/.test(script);
  });
}

function responseProviderId(id: string | null | undefined): LspProviderId {
  return id === "typescript" || id === "html" || id === "css" || id === "yaml" || id === "bash" || id === "pyright" || id === "dockerfile" || id === "markdown" || id === "eslint" || id === "vue" || id === "svelte" ? id : "json";
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

function normalizeOptionalDirectoryPath(value: string | null | undefined): string | undefined {
  const raw = String(value || "").replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
  if (!raw || raw === ".") return undefined;
  if (raw === ".." || raw.startsWith("../")) throw new Error("path escapes the selected root");
  return raw;
}

function clampInteger(value: number | null | undefined, min: number, max: number, fallback: number): number {
  const candidate = Number(value);
  if (!Number.isFinite(candidate)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(candidate)));
}

function send(socket: WebSocket, event: LspGatewayServerEvent): void {
  if (socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(event));
}
