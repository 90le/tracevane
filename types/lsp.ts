export type LspDiagnosticSeverity = "error" | "warning" | "info" | "hint";
export type LspProviderId = "json" | "typescript" | "html" | "css";

export interface LspDocumentRef {
  rootId: string;
  path: string;
  language?: string | null;
  version?: number | null;
}

export interface LspDiagnostic {
  severity: LspDiagnosticSeverity;
  message: string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
  code?: string | null;
  source: string;
}

export interface LspDiagnosticsRequest extends LspDocumentRef {
  type?: "diagnose";
  id?: string | null;
  content: string;
}

export interface LspPositionRequest extends LspDocumentRef {
  type?: "hover" | "definition" | "references";
  id?: string | null;
  content: string;
  line: number;
  column: number;
}

export interface LspCompletionRequest extends LspDocumentRef {
  type?: "completion";
  id?: string | null;
  content: string;
  line: number;
  column: number;
}

export interface LspHoverResponse extends LspDocumentRef {
  type: "hover";
  id?: string | null;
  provider: LspProviderId;
  contents: string[];
  range?: { startLine: number; startColumn: number; endLine: number; endColumn: number } | null;
  checkedAt: string;
}

export type LspCompletionItemKind =
  | "property"
  | "value"
  | "snippet"
  | "function"
  | "method"
  | "variable"
  | "class"
  | "interface"
  | "module"
  | "keyword"
  | "field";

export interface LspCompletionItem {
  label: string;
  detail?: string | null;
  documentation?: string | null;
  insertText: string;
  kind: LspCompletionItemKind;
  sortText?: string | null;
}

export interface LspCompletionResponse extends LspDocumentRef {
  type: "completion";
  id?: string | null;
  provider: LspProviderId;
  items: LspCompletionItem[];
  checkedAt: string;
}

export interface LspDefinitionLocation {
  rootId: string;
  path: string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
}

export interface LspDefinitionResponse extends LspDocumentRef {
  type: "definition";
  id?: string | null;
  provider: LspProviderId;
  locations: LspDefinitionLocation[];
  checkedAt: string;
}

export type LspReferenceLocation = LspDefinitionLocation;

export interface LspReferencesResponse extends LspDocumentRef {
  type: "references";
  id?: string | null;
  provider: LspProviderId;
  locations: LspReferenceLocation[];
  checkedAt: string;
}

export interface LspSemanticTokensRequest extends LspDocumentRef {
  type?: "semanticTokens";
  id?: string | null;
  content: string;
}

export type LspSemanticTokenType =
  | "class"
  | "enum"
  | "interface"
  | "namespace"
  | "type"
  | "typeParameter"
  | "parameter"
  | "variable"
  | "property"
  | "function"
  | "keyword"
  | "string"
  | "number"
  | "regexp"
  | "operator"
  | "comment";

export type LspSemanticTokenModifier = "declaration" | "readonly" | "static" | "deprecated" | "async";

export interface LspSemanticTokenLegend {
  tokenTypes: LspSemanticTokenType[];
  tokenModifiers: LspSemanticTokenModifier[];
}

export interface LspSemanticTokensResponse extends LspDocumentRef {
  type: "semanticTokens";
  id?: string | null;
  provider: "typescript";
  legend: LspSemanticTokenLegend;
  /** Monaco/LSP-compatible full document tokens encoded as deltaLine, deltaStart, length, tokenType, tokenModifiers. */
  data: number[];
  tokenCount: number;
  truncated: boolean;
  checkedAt: string;
}


export interface LspWorkspaceSymbolsRequest {
  type?: "workspaceSymbols";
  id?: string | null;
  rootId: string;
  query: string;
  path?: string | null;
  limit?: number | null;
  includeHidden?: boolean | null;
}

export type LspWorkspaceSymbolKind =
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "module"
  | "function"
  | "method"
  | "variable"
  | "property"
  | "constructor"
  | "unknown";

export interface LspWorkspaceSymbolItem {
  rootId: string;
  path: string;
  name: string;
  kind: LspWorkspaceSymbolKind;
  containerName?: string | null;
  matchKind?: "exact" | "prefix" | "substring" | "camelCase" | string;
  startLine: number;
  startColumn: number;
  endLine?: number;
  endColumn?: number;
}

export type LspWorkspaceSymbolIndexStatus = "fresh" | "rebuilt" | "direct" | "disabled";

export interface LspWorkspaceSymbolIndexMetadata {
  status: LspWorkspaceSymbolIndexStatus;
  scopeKey: string;
  indexedFiles: number;
  indexedSymbols: number;
  staleFiles: number;
  providerVersion: string;
  rebuiltAt?: string | null;
}

export interface LspWorkspaceSymbolsResponse {
  type: "workspaceSymbols";
  id?: string | null;
  provider: "typescript";
  rootId: string;
  query: string;
  path: string;
  items: LspWorkspaceSymbolItem[];
  scannedFiles: number;
  skippedFiles: number;
  truncated: boolean;
  index?: LspWorkspaceSymbolIndexMetadata | null;
  checkedAt: string;
}

export interface LspDiagnosticsResponse extends LspDocumentRef {
  type: "diagnostics";
  id?: string | null;
  provider: LspProviderId;
  diagnostics: LspDiagnostic[];
  checkedAt: string;
}

export interface LspGatewayReadyEvent {
  type: "ready";
  provider: "tracevane-lsp";
  message: string;
}

export interface LspGatewayLogEvent {
  type: "log";
  level: "debug" | "info" | "warn" | "error";
  message: string;
}

export interface LspGatewayErrorEvent {
  type: "error";
  id?: string | null;
  message: string;
}

export type LspGatewayServerEvent =
  | LspGatewayReadyEvent
  | LspGatewayLogEvent
  | LspGatewayErrorEvent
  | LspDiagnosticsResponse
  | LspHoverResponse
  | LspCompletionResponse
  | LspDefinitionResponse
  | LspReferencesResponse
  | LspSemanticTokensResponse
  | LspWorkspaceSymbolsResponse
  | LspRenameResponse
  | LspFormattingResponse
  | LspCodeActionResponse;

export interface LspWorkspaceEditPosition {
  line: number;
  character: number;
}

export interface LspWorkspaceEditRange {
  start: LspWorkspaceEditPosition;
  end: LspWorkspaceEditPosition;
}

export interface LspWorkspaceTextEdit {
  range: LspWorkspaceEditRange;
  newText: string;
}

export interface LspWorkspaceTextDocumentEdit {
  textDocument: {
    uri: string;
    version?: number | null;
  };
  edits: LspWorkspaceTextEdit[];
}

export interface LspWorkspaceResourceOperation {
  kind?: "create" | "rename" | "delete" | string;
  uri?: string;
  oldUri?: string;
  newUri?: string;
}

export interface LspWorkspaceEdit {
  changes?: Record<string, LspWorkspaceTextEdit[]>;
  documentChanges?: Array<LspWorkspaceTextDocumentEdit | LspWorkspaceResourceOperation>;
}

export type LspWorkspaceEditOpenState = "closed" | "open-clean" | "open-dirty";

export interface LspWorkspaceEditOpenDocument {
  path?: string | null;
  uri?: string | null;
  dirty?: boolean;
  version?: number | null;
}

export interface LspWorkspaceEditPreviewRequest {
  rootId: string;
  source?: "rename" | "formatting" | "codeAction" | "manual" | string;
  workspaceEdit?: LspWorkspaceEdit | null;
  /** Convenience input for providers such as formatting that return TextEdit[]. */
  textDocumentUri?: string | null;
  textEdits?: LspWorkspaceTextEdit[] | null;
  openDocuments?: LspWorkspaceEditOpenDocument[];
}

export interface LspWorkspaceEditPreviewItem {
  kind: "text";
  rootId: string;
  path: string;
  uri: string;
  range: LspWorkspaceEditRange;
  newText: string;
  openState: LspWorkspaceEditOpenState;
  supported: true;
}

export interface LspWorkspaceEditRejectedItem {
  kind: "text" | "resource" | "unknown";
  uri?: string | null;
  path?: string | null;
  operation?: string | null;
  reason: string;
}

export interface LspWorkspaceEditPreviewResponse {
  type: "workspaceEditPreview";
  rootId: string;
  source: string;
  checkedAt: string;
  items: LspWorkspaceEditPreviewItem[];
  rejected: LspWorkspaceEditRejectedItem[];
  summary: {
    totalTextEdits: number;
    affectedFiles: number;
    openCleanFiles: number;
    openDirtyFiles: number;
    closedFiles: number;
    rejected: number;
    applySupported: boolean;
  };
}

export interface LspWorkspaceEditApplyRequest extends LspWorkspaceEditPreviewRequest {
  /** Allow applying to documents reported as open-clean. Dirty documents remain rejected in M7.z-F. */
  allowOpenClean?: boolean;
  /** Bypass Files API expected mtime/size checks. Intended only for explicit future user confirmations. */
  force?: boolean;
}

export interface LspWorkspaceEditApplyResponse {
  type: "workspaceEditApply";
  rootId: string;
  source: string;
  checkedAt: string;
  items: LspWorkspaceEditPreviewItem[];
  rejected: LspWorkspaceEditRejectedItem[];
  summary: LspWorkspaceEditPreviewResponse["summary"];
  applied: Array<{ path: string; editCount: number; modifiedAt?: string | null; size?: number | null }>;
  skipped: LspWorkspaceEditRejectedItem[];
}

export interface LspRenameRequest extends LspDocumentRef {
  type?: "rename";
  id?: string | null;
  content: string;
  line: number;
  column: number;
  newName: string;
}

export interface LspRenameResponse extends LspDocumentRef {
  type: "rename";
  id?: string | null;
  provider: LspProviderId;
  workspaceEdit: LspWorkspaceEdit | null;
  rejected?: LspWorkspaceEditRejectedItem[];
  checkedAt: string;
}

export interface LspFormattingRequest extends LspDocumentRef {
  type?: "formatting";
  id?: string | null;
  content: string;
  tabSize?: number | null;
  insertSpaces?: boolean | null;
}

export interface LspFormattingResponse extends LspDocumentRef {
  type: "formatting";
  id?: string | null;
  provider: LspProviderId;
  textEdits: LspWorkspaceTextEdit[];
  checkedAt: string;
}

export interface LspCodeActionRequest extends LspDocumentRef {
  type?: "codeAction";
  id?: string | null;
  content: string;
  range?: LspWorkspaceEditRange | null;
}

export interface LspCodeActionItem {
  title: string;
  kind?: string | null;
  isPreferred?: boolean;
  disabledReason?: string | null;
  workspaceEdit?: LspWorkspaceEdit | null;
  command?: string | null;
}

export interface LspCodeActionResponse extends LspDocumentRef {
  type: "codeAction";
  id?: string | null;
  provider: LspProviderId;
  actions: LspCodeActionItem[];
  checkedAt: string;
}
