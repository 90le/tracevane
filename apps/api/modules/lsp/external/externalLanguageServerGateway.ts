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
  private readonly lastStates = new Map<string, ExternalLanguageServerState>();
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
      settings: profile.settings ? cloneSettings(profile.settings) : undefined,
    }));
  }

  listStatuses(): ExternalLanguageServerState[] {
    return this.profiles.map((profile) => this.getStatus(profile.id));
  }

  getStatus(providerId: string): ExternalLanguageServerState {
    const running = this.servers.get(providerId);
    if (running) return cloneState(running.state);
    const lastState = this.lastStates.get(providerId);
    if (lastState) return cloneState(lastState);
    const profile = this.profileById(providerId);
    return {
      providerId,
      label: profile?.label ?? providerId,
      status: profile?.enabled === false ? "unavailable" : "stopped",
      reason: profile?.enabled === false ? "disabled_by_profile" : "not_started",
      pid: null,
      startedAt: null,
      exitedAt: null,
      lastTransitionAt: null,
      exitCode: null,
      signal: null,
      lastError: null,
      stderrTail: [],
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
      lastTransitionAt: new Date().toISOString(),
      exitCode: null,
      signal: null,
      lastError: null,
      stderrTail: [],
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
        onStderr: (chunk) => this.handleStderr(running, chunk),
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
        capabilities: {
          workspace: { configuration: true },
          textDocument: {
            diagnostic: { dynamicRegistration: false },
            hover: { dynamicRegistration: false, contentFormat: ["markdown", "plaintext"] },
            definition: { dynamicRegistration: false, linkSupport: true },
          },
        },
      }, budgets.initializeMs, "initialize_timeout");
      this.notify(profile.id, "initialized", {});
      this.transition(running, "available", "not_started");
      return cloneState(state);
    } catch (error) {
      this.transition(running, "degraded", reasonFromError(error) ?? "initialize_timeout", {
        lastError: error instanceof Error ? error.message : String(error),
      });
      running.transport.kill();
      this.rejectAllPending(running, reasonFromError(error) ?? "initialize_timeout", "External LSP initialization failed");
      this.servers.delete(profile.id);
      this.lastStates.set(profile.id, cloneState(running.state));
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
        this.transition(running, "degraded", timeoutReason, {
          lastError: `External LSP request timed out: ${method}`,
        });
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

  async waitForDiagnostics(providerId: string, uri: string, timeoutMs?: number): Promise<unknown[]> {
    const running = this.requireRunning(providerId);
    const timeout = timeoutMs ?? running.budgets.requestMs;
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const diagnostics = running.diagnostics.get(uri);
      if (diagnostics) return [...diagnostics];
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    running.state.status = "degraded";
    running.state.reason = "request_timeout";
    throw this.withReason(new Error(`External LSP diagnostics timed out: ${providerId}`), "request_timeout");
  }

  async stop(providerId: string): Promise<ExternalLanguageServerState> {
    const running = this.servers.get(providerId);
    if (!running) return this.getStatus(providerId);
    running.intentionallyStopping = true;
    try {
      if (running.state.status !== "crashed") {
        await this.request(providerId, "shutdown", undefined, running.budgets.shutdownMs).catch(() => undefined);
        this.notify(providerId, "exit", undefined);
      }
    } finally {
      this.rejectAllPending(running, "stopped", "External LSP server stopped");
      running.transport.kill();
      this.transition(running, "stopped", "stopped", { exitedAt: running.state.exitedAt ?? new Date().toISOString() });
      this.servers.delete(providerId);
      this.lastStates.set(providerId, cloneState(running.state));
    }
    return cloneState(running.state);
  }

  private profileById(providerId: string): ExternalLanguageServerProfile | null {
    return this.profiles.find((profile) => profile.id === providerId) ?? null;
  }

  private requireRunning(providerId: string): RunningServer {
    const running = this.servers.get(providerId);
    if (!running) throw new Error(`External LSP server is not running: ${providerId}`);
    if (running.state.status === "crashed" || running.state.status === "stopped") {
      throw this.withReason(new Error(`External LSP server is ${running.state.status}: ${providerId}`), running.state.reason);
    }
    return running;
  }

  private handleMessage(running: RunningServer, message: LspJsonRpcMessage): void {
    if ("id" in message && ("result" in message || "error" in message)) {
      this.handleResponse(running, message as LspJsonRpcResponse);
      return;
    }
    if ("id" in message && "method" in message) {
      this.handleServerRequest(running, message as LspJsonRpcRequest);
      return;
    }
    if ("method" in message) this.handleNotification(running, message as LspJsonRpcNotification);
  }

  private handleServerRequest(running: RunningServer, request: LspJsonRpcRequest): void {
    let result: unknown = null;
    if (request.method === "workspace/configuration") {
      const items = Array.isArray((request.params as { items?: unknown[] } | undefined)?.items)
        ? (request.params as { items: unknown[] }).items
        : [];
      result = items.map((item) => configurationForItem(running.profile.settings, item));
    }
    try {
      running.transport.send({ jsonrpc: "2.0", id: request.id, result });
    } catch (error) {
      this.options.logger?.warn?.(error);
    }
  }

  private handleResponse(running: RunningServer, response: LspJsonRpcResponse): void {
    if (response.id == null) return;
    const pending = running.pending.get(response.id);
    if (!pending) return;
    running.pending.delete(response.id);
    clearTimeout(pending.timer);
    if (response.error) {
      this.transition(running, "degraded", "request_error", { lastError: response.error.message });
      pending.reject(this.withReason(new Error(response.error.message), "request_error"));
      return;
    }
    pending.resolve(response.result);
  }

  private handleNotification(running: RunningServer, notification: LspJsonRpcNotification): void {
    if (notification.method === "tsserver/request") {
      this.handleTsServerBridgeRequest(running, notification.params);
      return;
    }
    if (notification.method !== "textDocument/publishDiagnostics") return;
    const params = notification.params as Partial<LspPublishDiagnosticsParams> | undefined;
    if (!params || typeof params.uri !== "string" || !Array.isArray(params.diagnostics)) return;
    running.diagnostics.set(params.uri, [...params.diagnostics]);
  }

  private handleTsServerBridgeRequest(running: RunningServer, params: unknown): void {
    if (running.profile.id !== "vue") return;
    const requestId = Array.isArray(params) ? params[0] : null;
    if (typeof requestId !== "number" && typeof requestId !== "string") return;
    try {
      // @vue/language-server can ask the editor-hosted TypeScript plugin for
      // project metadata and Vue-specific rich interactions. Tracevane M12-C is
      // diagnostics/status only and does not host a TS plugin bridge yet, so we
      // answer with null to let Volar fall back to its simple project service
      // instead of hanging external diagnostics forever.
      running.transport.send({ jsonrpc: "2.0", method: "tsserver/response", params: [requestId, null] });
    } catch (error) {
      this.options.logger?.warn?.(error);
    }
  }

  private handleExit(running: RunningServer, code: number | null, signal: NodeJS.Signals | null): void {
    if (running.intentionallyStopping) {
      this.transition(running, "stopped", "stopped", {
        exitCode: code,
        signal,
        exitedAt: new Date().toISOString(),
        pid: null,
      });
      this.lastStates.set(running.profile.id, cloneState(running.state));
      return;
    }
    this.transition(running, "crashed", "crashed", {
      exitCode: code,
      signal,
      exitedAt: new Date().toISOString(),
      pid: null,
      lastError: "External LSP server crashed",
    });
    this.rejectAllPending(running, "crashed", "External LSP server crashed");
    this.lastStates.set(running.profile.id, cloneState(running.state));
  }

  private handleTransportError(running: RunningServer, error: Error): void {
    this.transition(running, "degraded", "missing_binary", { lastError: error.message });
    this.options.logger?.error(error);
  }

  private handleStderr(running: RunningServer, chunk: Buffer): void {
    const lines = chunk.toString("utf8")
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);
    if (!lines.length) return;
    running.state.stderrTail = [...running.state.stderrTail, ...lines].slice(-20);
    running.state.lastTransitionAt = new Date().toISOString();
  }

  private transition(
    running: RunningServer,
    status: ExternalLanguageServerState["status"],
    reason: ExternalLanguageServerStatusReason,
    patch: Partial<ExternalLanguageServerState> = {},
  ): void {
    Object.assign(running.state, patch, {
      status,
      reason,
      lastTransitionAt: new Date().toISOString(),
    });
    this.lastStates.set(running.profile.id, cloneState(running.state));
  }

  private rejectAllPending(
    running: RunningServer,
    reason: ExternalLanguageServerStatusReason,
    message: string,
  ): void {
    for (const pending of running.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.withReason(new Error(message), reason));
    }
    running.pending.clear();
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

function cloneState(state: ExternalLanguageServerState): ExternalLanguageServerState {
  return {
    ...state,
    stderrTail: [...state.stderrTail],
  };
}

export type { ChildProcessWithoutNullStreams };


function cloneSettings(settings: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(settings)) as Record<string, unknown>;
}

function configurationForItem(settings: Record<string, unknown> | undefined, item: unknown): unknown {
  if (!settings) return null;
  const section = typeof (item as { section?: unknown } | null)?.section === "string"
    ? (item as { section: string }).section
    : "";
  if (!section) return cloneSettings(settings);
  return dottedLookup(settings, section) ?? null;
}

function dottedLookup(record: Record<string, unknown>, section: string): unknown {
  let value: unknown = record;
  for (const part of section.split(".")) {
    if (!part) continue;
    if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "object" && value !== null ? JSON.parse(JSON.stringify(value)) : value;
}
