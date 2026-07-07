export type LspDiagnosticSeverity = "error" | "warning" | "info" | "hint";

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
  provider: "json" | "typescript";
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
  provider: "json" | "typescript";
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
  provider: "json" | "typescript";
  locations: LspDefinitionLocation[];
  checkedAt: string;
}

export type LspReferenceLocation = LspDefinitionLocation;

export interface LspReferencesResponse extends LspDocumentRef {
  type: "references";
  id?: string | null;
  provider: "json" | "typescript";
  locations: LspReferenceLocation[];
  checkedAt: string;
}

export interface LspDiagnosticsResponse extends LspDocumentRef {
  type: "diagnostics";
  id?: string | null;
  provider: "json" | "typescript";
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
  | LspReferencesResponse;
