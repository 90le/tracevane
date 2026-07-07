import type { ChildProcessWithoutNullStreams } from "node:child_process";

import {
  getExternalLanguageServerProfiles,
  profileBudgets,
  resolveExternalLanguageServerCwd,
} from "./externalProviderProfiles.js";
import type {
  ExternalLanguageServerBudgets,
  ExternalLanguageServerGatewayOptions,
  ExternalLanguageServerProfile,
  ExternalLanguageServerState,
  ExternalLanguageServerStatusReason,
  LspJsonRpcMessage,
  LspJsonRpcNotification,
  LspJsonRpcRequest,
  LspJsonRpcResponse,
  LspPublishDiagnosticsParams,
} from "./externalLanguageServerTypes.js";
import { LspStdioTransport } from "./lspStdioTransport.js";

interface RunningServer {
  profile: ExternalLanguageServerProfile;
  budgets: ExternalLanguageServerBudgets;
  state: ExternalLanguageServerState;
  transport: LspStdioTransport;
  pending: Map<number | string, PendingRequest>;
  diagnostics: Map<string, unknown[]>;
  intentionallyStopping: boolean;
}

interface PendingRequest {
  method: string;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export class ExternalLanguageServerGateway {
  private readonly profiles: ExternalLanguageServerProfile[];
  private readonly servers = new Map<string, RunningServer>();
  private nextRequestId = 1;

  constructor(private readonly options: ExternalLanguageServerGatewayOptions) {
    this.profiles = options.profiles ?? getExternalLanguageServerProfiles();
  }

  listProfiles(): ExternalLanguageServerProfile[] {
    return this.profiles.map((profile) => ({
      ...profile,
      args: profile.args ? [...profile.args] : undefined,
      languages: [...profile.languages],
      capabilities: { ...profile.capabilities },
      budgets: profile.budgets ? { ...profile.budgets } : undefined,
      env: profile.env ? { ...profile.env } : undefined,
    }));
  }

  listStatuses(): ExternalLanguageServerState[] {
    return this.profiles.map((profile) => this.getStatus(profile.id));
  }

  getStatus(providerId: string): ExternalLanguageServerState {
    const running = this.servers.get(providerId);
    if (running) return { ...running.state };
    const profile = this.profileById(providerId);
    return {
      providerId,
      label: profile?.label ?? providerId,
      status: profile?.enabled === false ? "unavailable" : "stopped",
      reason: profile?.enabled === false ? "disabled_by_profile" : "not_started",
      pid: null,
      startedAt: null,
      exitedAt: null,
      exitCode: null,
      signal: null,
    };
  }

  async start(providerId: string): Promise<ExternalLanguageServerState> {
    const existing = this.servers.get(providerId);
    if (existing) return { ...existing.state };

    const profile = this.profileById(providerId);
    if (!profile) throw new Error(`Unknown external LSP profile: ${providerId}`);
    if (profile.enabled === false) throw new Error(`External LSP profile is disabled: ${providerId}`);

    let cwd: string;
    try {
      cwd = resolveExternalLanguageServerCwd(this.options.rootPath, profile.cwd);
    } catch (error) {
      throw this.withReason(error, "invalid_cwd");
    }

    const budgets = profileBudgets(profile);
    const state: ExternalLanguageServerState = {
      providerId: profile.id,
      label: profile.label,
      status: "starting",
      reason: "not_started",
      pid: null,
      startedAt: new Date().toISOString(),
      exitedAt: null,
      exitCode: null,
      signal: null,
    };

    const running: RunningServer = {
      profile,
      budgets,
      state,
      transport: new LspStdioTransport({
        command: profile.command,
        args: profile.args,
        cwd,
        env: profile.env,
        spawn: this.options.spawn,
        onMessage: (message) => this.handleMessage(running, message),
        onExit: (code, signal) => this.handleExit(running, code, signal),
        onError: (error) => this.handleTransportError(running, error),
      }),
      pending: new Map(),
      diagnostics: new Map(),
      intentionallyStopping: false,
    };

    this.servers.set(profile.id, running);
    try {
      running.transport.start();
      state.pid = running.transport.pid;
      await this.request(profile.id, "initialize", {
        processId: process.pid,
        rootUri: `file://${cwd}`,
        capabilities: {},
      }, budgets.initializeMs, "initialize_timeout");
      this.notify(profile.id, "initialized", {});
      state.status = "available";
      state.reason = "not_started";
      return { ...state };
    } catch (error) {
      state.status = "degraded";
      state.reason = reasonFromError(error) ?? "initialize_timeout";
      running.transport.kill();
      throw error;
    }
  }

  async request(
    providerId: string,
    method: string,
    params?: unknown,
    timeoutMs?: number,
    timeoutReason: ExternalLanguageServerStatusReason = "request_timeout",
  ): Promise<unknown> {
    const running = this.requireRunning(providerId);
    const id = this.nextRequestId++;
    const request: LspJsonRpcRequest = { jsonrpc: "2.0", id, method, params };
    const timeout = timeoutMs ?? running.budgets.requestMs;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        running.pending.delete(id);
        running.state.status = "degraded";
        running.state.reason = timeoutReason;
        reject(this.withReason(new Error(`External LSP request timed out: ${method}`), timeoutReason));
      }, timeout);
      running.pending.set(id, { method, resolve, reject, timer });
      try {
        running.transport.send(request);
      } catch (error) {
        clearTimeout(timer);
        running.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  notify(providerId: string, method: string, params?: unknown): void {
    const running = this.requireRunning(providerId);
    const notification: LspJsonRpcNotification = { jsonrpc: "2.0", method, params };
    running.transport.send(notification);
  }

  getDiagnostics(providerId: string, uri: string): unknown[] {
    return [...(this.requireRunning(providerId).diagnostics.get(uri) ?? [])];
  }

  async stop(providerId: string): Promise<ExternalLanguageServerState> {
    const running = this.servers.get(providerId);
    if (!running) return this.getStatus(providerId);
    running.intentionallyStopping = true;
    try {
      await this.request(providerId, "shutdown", undefined, running.budgets.shutdownMs).catch(() => undefined);
      this.notify(providerId, "exit", undefined);
    } finally {
      for (const pending of running.pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(this.withReason(new Error("External LSP server stopped"), "stopped"));
      }
      running.pending.clear();
      running.transport.kill();
      running.state.status = "stopped";
      running.state.reason = "stopped";
      running.state.exitedAt = running.state.exitedAt ?? new Date().toISOString();
      this.servers.delete(providerId);
    }
    return { ...running.state };
  }

  private profileById(providerId: string): ExternalLanguageServerProfile | null {
    return this.profiles.find((profile) => profile.id === providerId) ?? null;
  }

  private requireRunning(providerId: string): RunningServer {
    const running = this.servers.get(providerId);
    if (!running) throw new Error(`External LSP server is not running: ${providerId}`);
    return running;
  }

  private handleMessage(running: RunningServer, message: LspJsonRpcMessage): void {
    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(running, message as LspJsonRpcResponse);
      return;
    }
    if ("method" in message) this.handleNotification(running, message as LspJsonRpcNotification);
  }

  private handleResponse(running: RunningServer, response: LspJsonRpcResponse): void {
    if (response.id == null) return;
    const pending = running.pending.get(response.id);
    if (!pending) return;
    running.pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.error) {
      running.state.status = "degraded";
      running.state.reason = "request_error";
      pending.reject(this.withReason(new Error(response.error.message), "request_error"));
      return;
    }
    pending.resolve(response.result);
  }

  private handleNotification(running: RunningServer, notification: LspJsonRpcNotification): void {
    if (notification.method !== "textDocument/publishDiagnostics") return;
    const params = notification.params as Partial<LspPublishDiagnosticsParams> | undefined;
    if (!params || typeof params.uri !== "string" || !Array.isArray(params.diagnostics)) return;
    running.diagnostics.set(params.uri, [...params.diagnostics]);
  }

  private handleExit(running: RunningServer, code: number | null, signal: NodeJS.Signals | null): void {
    running.state.exitCode = code;
    running.state.signal = signal;
    running.state.exitedAt = new Date().toISOString();
    running.state.pid = null;
    if (running.intentionallyStopping) {
      running.state.status = "stopped";
      running.state.reason = "stopped";
      return;
    }
    running.state.status = "crashed";
    running.state.reason = "crashed";
    for (const pending of running.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.withReason(new Error("External LSP server crashed"), "crashed"));
    }
    running.pending.clear();
  }

  private handleTransportError(running: RunningServer, error: Error): void {
    running.state.status = "degraded";
    running.state.reason = "missing_binary";
    this.options.logger?.error(error);
  }

  private withReason(error: unknown, reason: ExternalLanguageServerStatusReason): Error {
    const normalized = error instanceof Error ? error : new Error(String(error));
    Object.assign(normalized, { reason });
    return normalized;
  }
}

export function createExternalLanguageServerGateway(
  options: ExternalLanguageServerGatewayOptions,
): ExternalLanguageServerGateway {
  return new ExternalLanguageServerGateway(options);
}

function reasonFromError(error: unknown): ExternalLanguageServerStatusReason | null {
  if (error && typeof error === "object" && "reason" in error && typeof (error as { reason?: unknown }).reason === "string") {
    return (error as { reason: ExternalLanguageServerStatusReason }).reason;
  }
  return null;
}

export type { ChildProcessWithoutNullStreams };
