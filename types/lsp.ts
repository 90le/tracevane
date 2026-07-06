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

export interface LspDiagnosticsResponse extends LspDocumentRef {
  type: "diagnostics";
  id?: string | null;
  provider: "json";
  diagnostics: LspDiagnostic[];
  checkedAt: string;
}

export interface LspGatewayReadyEvent {
  type: "ready";
  provider: "json";
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
  | LspDiagnosticsResponse;
