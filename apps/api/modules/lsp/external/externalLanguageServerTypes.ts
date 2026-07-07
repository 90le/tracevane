import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from "node:child_process";

import type { TracevaneLspProviderFeature } from "../providers/registry.js";

export type ExternalLanguageServerStatus =
  | "unavailable"
  | "starting"
  | "available"
  | "degraded"
  | "crashed"
  | "stopped";

export type ExternalLanguageServerStatusReason =
  | "not_started"
  | "disabled_by_profile"
  | "missing_binary"
  | "invalid_cwd"
  | "initialize_timeout"
  | "request_timeout"
  | "request_error"
  | "crashed"
  | "stopped";

export interface ExternalLanguageServerBudgets {
  initializeMs: number;
  requestMs: number;
  shutdownMs: number;
}

export interface ExternalLanguageServerProfile {
  id: string;
  label: string;
  command: string;
  args?: string[];
  cwd?: string;
  enabled?: boolean;
  languages: string[];
  capabilities: Partial<Record<TracevaneLspProviderFeature, boolean>>;
  budgets?: Partial<ExternalLanguageServerBudgets>;
  env?: Record<string, string>;
}

export interface ExternalLanguageServerState {
  providerId: string;
  label: string;
  status: ExternalLanguageServerStatus;
  reason: ExternalLanguageServerStatusReason;
  pid: number | null;
  startedAt: string | null;
  exitedAt: string | null;
  lastTransitionAt: string | null;
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  lastError: string | null;
  stderrTail: string[];
}

export interface ExternalLanguageServerGatewayOptions {
  rootPath: string;
  profiles?: ExternalLanguageServerProfile[];
  spawn?: ExternalLanguageServerSpawn;
  logger?: Pick<Console, "warn" | "error">;
}

export type ExternalLanguageServerSpawn = (
  command: string,
  args: string[],
  options: SpawnOptionsWithoutStdio,
) => ChildProcessWithoutNullStreams;

export interface LspJsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: unknown;
}

export interface LspJsonRpcNotification {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
}

export interface LspJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface LspJsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: LspJsonRpcError;
}

export type LspJsonRpcMessage = LspJsonRpcRequest | LspJsonRpcNotification | LspJsonRpcResponse;

export interface LspPublishDiagnosticsParams {
  uri: string;
  diagnostics: unknown[];
}
