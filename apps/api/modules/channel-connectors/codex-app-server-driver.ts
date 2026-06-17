import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ChannelConnectorPermissionMode } from "../../../../types/channel-connectors.js";
import {
  buildChannelConnectorAgentProcessRequest,
  cleanupChannelConnectorAgentProcessRequest,
  codexReasoningProgressText,
  codexToolProgressText,
  firstProgressTextValue,
  truncateProgressText,
  type ChannelConnectorAgentProgressEvent,
  type ChannelConnectorAgentPermissionDecision,
  type ChannelConnectorAgentPermissionRequest,
  type ChannelConnectorAgentTurnResult,
} from "./agent-runner.js";
import type {
  ChannelConnectorAgentSessionDriverKeyInput,
  ChannelConnectorAgentSessionDriverFactory,
  ChannelConnectorAgentSessionDriverSession,
  ChannelConnectorAgentSessionDriverTurnInput,
} from "./agent-session-driver.js";

export interface CodexAppServerTransport {
  send(message: Record<string, unknown>): void;
  close(reason: string): void;
  onMessage(callback: (message: Record<string, unknown>) => void): void;
  onClose(callback: (error: Error | null) => void): void;
}

export interface CodexAppServerSessionOptions {
  transport: CodexAppServerTransport;
  sessionId: string;
  model: string | null;
  cwd: string;
  permissionMode: ChannelConnectorPermissionMode;
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
}

export interface CodexAppServerSessionFactoryOptions {
  transportFactory: (input: {
    sessionId: string;
    key: ChannelConnectorAgentSessionDriverKeyInput;
    agentTurnRequest?: ChannelConnectorAgentSessionDriverTurnInput["agentTurnRequest"];
  }) => CodexAppServerTransport;
  permissionMode?: ChannelConnectorPermissionMode;
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

interface PendingApproval {
  resolve: (decision: ChannelConnectorAgentPermissionDecision) => void;
  timeout: NodeJS.Timeout;
}

interface CodexAppServerTerminalStatus {
  status: ChannelConnectorAgentTurnResult["status"];
  ok: boolean;
  text: string;
  error: string | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nowIso(): string {
  return new Date().toISOString();
}

function progressEvent(input: {
  type: ChannelConnectorAgentProgressEvent["type"];
  rawType: string;
  itemType?: string | null;
  text?: string | null;
  phase?: ChannelConnectorAgentProgressEvent["phase"];
}): ChannelConnectorAgentProgressEvent {
  return {
    checkedAt: nowIso(),
    type: input.type,
    rawType: input.rawType,
    itemType: input.itemType || null,
    text: input.text ? truncateProgressText(input.text) : null,
    phase: input.phase || null,
  };
}

function joinAssistantProgressText(parts: string[]): string {
  const normalized = parts.filter((part) => normalizeString(part));
  if (!normalized.length) return "";
  const output: string[] = [];
  for (const part of normalized) {
    if (output[output.length - 1] === part) continue;
    const startsWithFence = part.trimStart().startsWith("```");
    if (output.length && startsWithFence) output.push("\n\n");
    output.push(part);
  }
  return output.join("").trim();
}

function sandboxPolicy(permissionMode: ChannelConnectorPermissionMode): Record<string, unknown> | null {
  if (permissionMode === "read-only" || permissionMode === "plan") {
    return { type: "readOnly", networkAccess: true };
  }
  if (permissionMode === "yolo" || permissionMode === "full-auto") {
    return { type: "dangerFullAccess" };
  }
  if (permissionMode === "auto-edit") {
    return {
      type: "workspaceWrite",
      writableRoots: [],
      networkAccess: true,
      excludeTmpdirEnvVar: false,
      excludeSlashTmp: false,
    };
  }
  return null;
}

function sandboxMode(permissionMode: ChannelConnectorPermissionMode): string | null {
  if (permissionMode === "read-only" || permissionMode === "plan") return "read-only";
  if (permissionMode === "auto-edit") return "workspace-write";
  if (permissionMode === "yolo" || permissionMode === "full-auto") return "danger-full-access";
  return null;
}

function approvalPolicy(permissionMode: ChannelConnectorPermissionMode): string {
  if (permissionMode === "yolo" || permissionMode === "full-auto" || permissionMode === "auto-edit") return "never";
  return "on-request";
}

function jsonRpcIdKey(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return JSON.stringify(value);
  }
  return JSON.stringify(value ?? null);
}

function jsonRpcDisplayId(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return jsonRpcIdKey(value);
}

function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function codexApprovalRequest(input: {
  id: unknown;
  method: string;
  params: Record<string, unknown>;
}): ChannelConnectorAgentPermissionRequest {
  if (input.method === "item/commandExecution/requestApproval") {
    return {
      requestId: jsonRpcDisplayId(input.id),
      subtype: input.method,
      toolName: "Bash",
      input: input.params,
    };
  }
  if (input.method === "item/fileChange/requestApproval") {
    return {
      requestId: jsonRpcDisplayId(input.id),
      subtype: input.method,
      toolName: "Patch",
      input: input.params,
    };
  }
  return {
    requestId: jsonRpcDisplayId(input.id),
    subtype: input.method,
    toolName: "Permissions",
    input: input.params,
  };
}

function codexApprovalProgressText(request: ChannelConnectorAgentPermissionRequest): string {
  if (request.toolName === "Bash") {
    const command = normalizeString(request.input.command);
    const cwd = normalizeString(request.input.cwd);
    return [
      "Codex app-server permission requested: Bash",
      command ? `command=${command}` : "",
      cwd ? `cwd=${cwd}` : "",
    ].filter(Boolean).join("\n");
  }
  if (request.toolName === "Patch") {
    return [
      "Codex app-server permission requested: Patch",
      normalizeString(request.input.reason) || prettyJson(request.input),
    ].filter(Boolean).join("\n");
  }
  return [
    "Codex app-server permission requested: Permissions",
    prettyJson(request.input),
  ].filter(Boolean).join("\n");
}

function codexAutomaticPermissionDecision(
  mode: ChannelConnectorPermissionMode,
  request: ChannelConnectorAgentPermissionRequest,
): ChannelConnectorAgentPermissionDecision | null {
  if (mode === "yolo" || mode === "full-auto") return { behavior: "allow", updatedInput: request.input };
  if (mode === "read-only" || mode === "plan") {
    return { behavior: "deny", message: `Permission mode is ${mode}; Studio denied this Codex app-server request.` };
  }
  if (mode === "auto-edit") {
    if (request.toolName === "Patch") return { behavior: "allow", updatedInput: request.input };
    return { behavior: "deny", message: "Permission mode is auto-edit; Studio only auto-allows Codex file changes." };
  }
  return null;
}

function codexFallbackPermissionDecision(): ChannelConnectorAgentPermissionDecision {
  return {
    behavior: "deny",
    message: "Interactive Codex app-server approval is not available in this Studio runner.",
  };
}

function codexImagePaths(args: string[]): string[] {
  const paths: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--image" && args[index + 1]) paths.push(args[index + 1]);
  }
  return paths;
}

function compactCommand(command: string | null | undefined): boolean {
  return normalizeString(command).toLowerCase() === "/compact";
}

function codexAppServerErrorText(turn: Record<string, unknown>, fallback: string): string {
  const error = isRecord(turn.error)
    ? normalizeString(turn.error.message) || normalizeString(turn.error.error)
    : normalizeString(turn.error);
  return error || fallback;
}

function codexAppServerTerminalStatus(
  turn: Record<string, unknown>,
  context: string,
  options: { allowImplicitSuccess?: boolean } = {},
): CodexAppServerTerminalStatus {
  const status = normalizeString(turn.status).toLowerCase();
  if (!status) {
    if (turn.error) {
      const error = codexAppServerErrorText(turn, `${context} failed.`);
      return { status: "failed", ok: false, text: `${context} failed`, error };
    }
    if (options.allowImplicitSuccess === true) {
      return { status: "completed", ok: true, text: `${context} completed`, error: null };
    }
    return {
      status: "failed",
      ok: false,
      text: `${context} missing terminal status`,
      error: `${context} returned turn/completed without a status or final assistant message; Studio treated it as a protocol compatibility failure.`,
    };
  }
  if (["completed", "succeeded", "success", "ok", "done"].includes(status)) {
    return { status: "completed", ok: true, text: `${context} ${status}`, error: null };
  }
  if (["cancelled", "canceled", "interrupted"].includes(status)) {
    return { status: "cancelled", ok: false, text: `${context} ${status}`, error: codexAppServerErrorText(turn, `${context} ${status}.`) };
  }
  if (["failed", "error"].includes(status) || turn.error) {
    const error = codexAppServerErrorText(turn, `${context} ${status || "failed"}.`);
    return { status: "failed", ok: false, text: `${context} ${status || "failed"}`, error };
  }
  return {
    status: "failed",
    ok: false,
    text: `${context} unknown status ${status}`,
    error: `${context} returned unknown terminal status "${status}"; Studio treated it as a protocol compatibility failure.`,
  };
}

function compactWaitTimeoutMs(requestTimeoutMs: number): number {
  return Math.max(requestTimeoutMs, 60_000);
}

const DEFAULT_TURN_IDLE_TIMEOUT_MS = 180_000;
const APPROVAL_WAIT_IDLE_TIMEOUT_MS = 5 * 60_000 + 15_000;
const POST_APPROVAL_TOOL_IDLE_TIMEOUT_MS = 10 * 60_000;

function turnWaitTimeoutMs(requestTimeoutMs: number, turnTimeoutMs: number | null): number {
  if (turnTimeoutMs !== null) return Math.max(1, turnTimeoutMs);
  return Math.max(requestTimeoutMs, DEFAULT_TURN_IDLE_TIMEOUT_MS);
}

function agentResult(input: {
  messageId: string;
  model: string | null;
  cwd: string;
  replyText: string | null;
  durationMs: number;
  ok: boolean;
  status?: ChannelConnectorAgentTurnResult["status"];
  error?: string | null;
  progressEvents: ChannelConnectorAgentProgressEvent[];
  threadId: string | null;
  resumed: boolean;
  args?: string[];
}): ChannelConnectorAgentTurnResult {
  const compatibilityText = input.ok && input.progressEvents.some((event) => event.rawType === "protocol/unknown-event")
    ? "Codex app-server 进程已成功结束，但 Studio 没能从当前 app-server 事件格式解析出最终回复。请查看事件日志中的 protocol/unknown-event；当前任务没有继续等待。"
    : null;
  const noReplyText = input.ok ? (input.replyText || compatibilityText || "Codex app-server 已完成，但没有返回最终回复。当前任务没有继续等待。") : null;
  return {
    attempted: true,
    ok: input.ok,
    status: input.status || (input.ok ? "completed" : "failed"),
    agent: "codex",
    model: input.model,
    command: "codex app-server",
    args: input.args || [],
    cwd: input.cwd,
    replyText: noReplyText,
    stdout: noReplyText || "",
    stderr: "",
    exitCode: input.ok ? 0 : 1,
    durationMs: input.durationMs,
    error: input.ok ? null : input.error || "Codex app-server turn failed.",
    progress: {
      eventCount: input.progressEvents.length,
      latest: input.progressEvents[input.progressEvents.length - 1] || null,
      summary: input.progressEvents.slice().reverse().find((event) => event.text)?.text || null,
    },
    session: {
      resumed: input.resumed,
      agentNativeSessionId: input.threadId,
      codexThreadId: input.threadId,
    },
  };
}

export class JsonLineCodexAppServerTransport implements CodexAppServerTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private buffer = "";
  private messageCallbacks: Array<(message: Record<string, unknown>) => void> = [];
  private closeCallbacks: Array<(error: Error | null) => void> = [];

  constructor(input: { command?: string; args?: string[]; cwd: string; env?: Record<string, string> }) {
    this.child = spawn(input.command || "codex", input.args || ["app-server", "--stdio"], {
      cwd: input.cwd,
      env: {
        ...process.env,
        ...(input.env || {}),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      this.buffer += chunk;
      const lines = this.buffer.split(/\r?\n/);
      this.buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const message = JSON.parse(trimmed) as unknown;
          if (isRecord(message)) this.messageCallbacks.forEach((callback) => callback(message));
        } catch {
          // Ignore non-JSON diagnostics; stderr is owned by Codex.
        }
      }
    });
    this.child.on("error", (error) => {
      this.closeCallbacks.forEach((callback) => callback(error));
    });
    this.child.on("close", (code, signal) => {
      const error = code === 0 || signal === "SIGTERM"
        ? null
        : new Error(`Codex app-server exited with ${signal || code}`);
      this.closeCallbacks.forEach((callback) => callback(error));
    });
  }

  send(message: Record<string, unknown>): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  close(reason: string): void {
    if (!this.child.killed) this.child.kill(reason === "dispose" ? "SIGTERM" : "SIGTERM");
  }

  onMessage(callback: (message: Record<string, unknown>) => void): void {
    this.messageCallbacks.push(callback);
  }

  onClose(callback: (error: Error | null) => void): void {
    this.closeCallbacks.push(callback);
  }
}

export class CodexAppServerSession implements ChannelConnectorAgentSessionDriverSession {
  readonly id: string;
  private readonly transport: CodexAppServerTransport;
  private readonly model: string | null;
  private readonly cwd: string;
  private readonly permissionMode: ChannelConnectorPermissionMode;
  private readonly requestTimeoutMs: number;
  private readonly turnTimeoutMs: number | null;
  private pending = new Map<number, PendingRequest>();
  private pendingApprovals = new Map<string, PendingApproval>();
  private nextRequestId = 1;
  private initialized = false;
  private threadId: string | null = null;
  private activeTurnId: string | null = null;
  private activeTurnInput: ChannelConnectorAgentSessionDriverTurnInput | null = null;
  private activeTurnHeartbeat: ((reason?: string) => void) | null = null;
  private activeTurnCompleted: ((message: Record<string, unknown>) => void) | null = null;
  private activeTurnFailure: ((error: Error) => void) | null = null;
  private pendingActiveTurnNotifications: Record<string, unknown>[] = [];
  private pendingStopReason: string | null = null;

  constructor(options: CodexAppServerSessionOptions) {
    this.id = options.sessionId;
    this.transport = options.transport;
    this.model = options.model;
    this.cwd = options.cwd;
    this.permissionMode = options.permissionMode;
    this.requestTimeoutMs = Number.isFinite(Number(options.requestTimeoutMs))
      ? Math.max(1, Number(options.requestTimeoutMs))
      : 10_000;
    this.turnTimeoutMs = Number.isFinite(Number(options.turnTimeoutMs))
      ? Math.max(1, Number(options.turnTimeoutMs))
      : null;
    this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.onClose((error) => {
      if (!error && this.pending.size === 0 && this.pendingApprovals.size === 0 && !this.activeTurnFailure) return;
      const closeError = error || new Error("Codex app-server connection closed.");
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(closeError);
      }
      this.pending.clear();
      this.denyPendingApprovals(closeError.message);
      this.failActiveTurn(closeError);
    });
  }

  private failActiveTurn(error: Error): void {
    const fail = this.activeTurnFailure;
    if (!fail) return;
    fail(error);
  }

  async runTurn(input: ChannelConnectorAgentSessionDriverTurnInput): Promise<ChannelConnectorAgentTurnResult> {
    const startedAt = Date.now();
    if (!input.agentTurnRequest) return input.runOneShot();
    if (input.agentTurnRequest.project.agent !== "codex") return input.runOneShot();
    if (normalizeString(input.agentTurnRequest.nativeCommand) && !compactCommand(input.agentTurnRequest.nativeCommand)) {
      return input.runOneShot();
    }
    await this.initialize();
    await this.ensureThread();

    if (compactCommand(input.agentTurnRequest.nativeCommand)) {
      const progressEvents: ChannelConnectorAgentProgressEvent[] = [];
      let compactTurnId: string | null = null;
      let sawContextCompaction = false;
      let settled = false;
      let timeout: NodeJS.Timeout | null = null;
      let completeCompact: (error?: Error) => void = () => undefined;
      const pushEvent = (event: ChannelConnectorAgentProgressEvent): void => {
        progressEvents.push(event);
        input.onProgress?.(event);
      };
      const compactCompletion = new Promise<void>((resolve, reject) => {
        const done = (error?: Error): void => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          this.activeTurnCompleted = null;
          this.activeTurnFailure = null;
          if (error) reject(error);
          else resolve();
        };
        this.activeTurnFailure = (error) => done(error);
        completeCompact = done;
        timeout = setTimeout(() => {
          done(new Error("Codex app-server compact timed out."));
        }, compactWaitTimeoutMs(this.requestTimeoutMs));
        this.activeTurnCompleted = (message) => {
          const method = normalizeString(message.method);
          const params = isRecord(message.params) ? message.params : {};
          if (method === "warning") {
            const event = progressEvent({
              type: "event",
              rawType: method,
              text: normalizeString(params.message) || normalizeString(params.warning) || "Codex compact warning",
            });
            pushEvent(event);
            return;
          }
          if (method === "turn/started") {
            const turn = isRecord(params.turn) ? params.turn : {};
            compactTurnId = normalizeString(turn.id) || compactTurnId;
            const event = progressEvent({ type: "running", rawType: method, text: "Codex app-server compact started" });
            pushEvent(event);
            return;
          }
          if (method === "item/completed") {
            const item = isRecord(params.item) ? params.item : {};
            const itemType = normalizeString(item.type);
            if (itemType !== "contextCompaction") return;
            compactTurnId = normalizeString(params.turnId) || compactTurnId;
            sawContextCompaction = true;
            const event = progressEvent({
              type: "completed",
              rawType: method,
              itemType,
              text: "Codex compact context completed",
            });
            pushEvent(event);
            if (!compactTurnId) done();
            return;
          }
          if (method === "thread/compacted") {
            const event = progressEvent({
              type: "completed",
              rawType: method,
              itemType: "contextCompaction",
              text: "Codex compact completed",
            });
            pushEvent(event);
            done();
            return;
          }
          if (method !== "turn/completed") return;
          const turn = isRecord(params.turn) ? params.turn : {};
          const completedTurnId = normalizeString(turn.id) || normalizeString(params.turnId);
          if (compactTurnId && completedTurnId && completedTurnId !== compactTurnId) return;
          if (!compactTurnId && !sawContextCompaction) return;
          const terminal = codexAppServerTerminalStatus(turn, "Codex app-server compact", {
            allowImplicitSuccess: sawContextCompaction,
          });
          const event = progressEvent({
            type: terminal.ok ? "completed" : "failed",
            rawType: method,
            itemType: "contextCompaction",
            text: terminal.text,
          });
          pushEvent(event);
          if (!terminal.ok) done(new Error(terminal.error || terminal.text));
          else done();
        };
      });
      try {
        await this.request("thread/compact/start", { threadId: this.threadId });
        await compactCompletion;
      } catch (error) {
        completeCompact(error instanceof Error ? error : new Error(String(error)));
        await compactCompletion.catch(() => undefined);
        throw error;
      } finally {
        if (!settled) completeCompact(new Error("Codex app-server compact cancelled."));
        this.activeTurnCompleted = null;
        this.activeTurnFailure = null;
      }
      return agentResult({
        messageId: input.messageId,
        model: this.model,
        cwd: this.cwd,
        replyText: "Codex compact 已完成。",
        durationMs: Date.now() - startedAt,
        ok: true,
        progressEvents,
        threadId: this.threadId,
        resumed: true,
      });
    }

    const processRequest = buildChannelConnectorAgentProcessRequest(input.agentTurnRequest);
    if (!processRequest || !processRequest.stdin) return input.runOneShot();
    const imageInputs = codexImagePaths(processRequest.args).map((imagePath) => ({
      type: "localImage",
      path: imagePath,
    }));
    const progressEvents: ChannelConnectorAgentProgressEvent[] = [];
    let replyText = "";
    let completedAgentMessageText = "";
    let terminalStatus: ChannelConnectorAgentTurnResult["status"] = "completed";
    let terminalError: string | null = null;
    const pendingAssistantProgress: ChannelConnectorAgentProgressEvent[] = [];
    const flushAssistantProgress = (phase: "intermediate" | "final"): void => {
      if (!pendingAssistantProgress.length) return;
      const latest = pendingAssistantProgress[pendingAssistantProgress.length - 1];
      const text = joinAssistantProgressText(pendingAssistantProgress.map((event) => event.text || ""))
        || latest.text
        || "";
      pendingAssistantProgress.length = 0;
      if (!text) return;
      const event = { ...latest, text, phase };
      progressEvents.push(event);
      input.onProgress?.(event);
    };
    const emitProgress = (event: ChannelConnectorAgentProgressEvent): void => {
      if (event.type === "assistant" && event.phase === "final" && normalizeString(event.text)) {
        pendingAssistantProgress.push(event);
        return;
      }
      if (pendingAssistantProgress.length) {
        const terminal = event.type === "completed" || event.type === "failed" || event.type === "error";
        flushAssistantProgress(terminal ? "final" : "intermediate");
      }
      progressEvents.push(event);
      input.onProgress?.(event);
    };
    this.activeTurnInput = input;
    let turnResponse: Record<string, unknown>;
    try {
      turnResponse = await this.request("turn/start", {
        threadId: this.threadId,
        clientUserMessageId: input.messageId,
        input: [
          {
            type: "text",
            text: processRequest.stdin,
            text_elements: [],
          },
          ...imageInputs,
        ],
        cwd: this.cwd,
        model: this.model,
        approvalPolicy: approvalPolicy(this.permissionMode),
        sandboxPolicy: sandboxPolicy(this.permissionMode),
      });
      const turn = isRecord(turnResponse.turn) ? turnResponse.turn : {};
      this.activeTurnId = normalizeString(turn.id) || null;
      if (input.signal?.aborted) this.pendingStopReason = "signal-aborted";
      if (this.pendingStopReason) void this.stop(this.pendingStopReason);
    } catch (error) {
      this.activeTurnInput = null;
      cleanupChannelConnectorAgentProcessRequest(processRequest);
      throw error;
    }
    const abortListener = (): void => {
      void this.stop("signal-aborted");
    };
    input.signal?.addEventListener("abort", abortListener, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        let timeout: NodeJS.Timeout | null = null;
        const timeoutMs = turnWaitTimeoutMs(this.requestTimeoutMs, this.turnTimeoutMs);
        let longToolGraceUntil = 0;
        const unknownProgressKeys = new Set<string>();
        const done = (error?: Error): void => {
          if (settled) return;
          settled = true;
          if (timeout) clearTimeout(timeout);
          this.activeTurnHeartbeat = null;
          this.activeTurnCompleted = null;
          this.activeTurnFailure = null;
          if (error) reject(error);
          else resolve();
        };
        this.activeTurnFailure = (error) => done(error);
        const armTurnIdleTimeout = (reason?: string): void => {
          if (settled) return;
          if (timeout) clearTimeout(timeout);
          const reasonKey = normalizeString(reason);
          if (reasonKey === "approval-resolved") longToolGraceUntil = Date.now() + POST_APPROVAL_TOOL_IDLE_TIMEOUT_MS;
          const timeoutForReason = this.pendingApprovals.size > 0 || reasonKey.endsWith("/requestApproval")
            ? Math.max(timeoutMs, APPROVAL_WAIT_IDLE_TIMEOUT_MS)
            : longToolGraceUntil > Date.now()
              ? Math.max(timeoutMs, longToolGraceUntil - Date.now())
              : timeoutMs;
          timeout = setTimeout(() => {
            if (settled) return;
            terminalStatus = "failed";
            terminalError = completedAgentMessageText || replyText
              ? "Codex app-server turn timed out after the last assistant/tool event. The app-server may be waiting for tool approval or a missing completion event."
              : "Codex app-server turn timed out waiting for progress.";
            if (input.fallbackOnCrash === false) {
              const event = progressEvent({ type: "failed", rawType: "turn/timeout", text: terminalError });
              emitProgress(event);
            }
            void this.stop("turn-timeout");
            done(new Error(terminalError));
          }, timeoutForReason);
        };
        armTurnIdleTimeout();
        this.activeTurnHeartbeat = armTurnIdleTimeout;
        const emitUnknownProgress = (method: string): void => {
          if (!method || !/^(turn|task|agent)\//.test(method)) return;
          if (unknownProgressKeys.has(method) || unknownProgressKeys.size >= 5) return;
          unknownProgressKeys.add(method);
          emitProgress(progressEvent({
            type: "event",
            rawType: "protocol/unknown-event",
            itemType: method,
            text: `Codex app-server emitted an unrecognized active-turn event (${method}); Studio is running in compatibility mode.`,
          }));
        };
        this.activeTurnCompleted = (message) => {
          const method = normalizeString(message.method);
          armTurnIdleTimeout(method);
          const params = isRecord(message.params) ? message.params : {};
          if (method === "item/agentMessage/delta") {
            const delta = stringValue(params.delta);
            if (delta) replyText += delta;
            return;
          }
          if (method === "item/completed") {
            const item = isRecord(params.item) ? params.item : {};
            const itemType = normalizeString(item.type);
            if (itemType === "userMessage" || itemType === "user_message") return;
            const toolLike = itemType === "commandExecution" || itemType.endsWith("ToolCall");
            const text = itemType === "agentMessage"
              ? firstProgressTextValue(item.text, item.content, item.message)
              : itemType === "reasoning"
                ? codexReasoningProgressText(item)
              : toolLike
                ? codexToolProgressText(item, itemType, method)
                : firstProgressTextValue(item.text, item.content, item.message, item.summary)
                  || normalizeString(item.command)
                  || itemType;
            const type: ChannelConnectorAgentProgressEvent["type"] =
              itemType === "agentMessage" ? "assistant"
                : itemType === "reasoning" ? "reasoning"
                  : toolLike ? "tool"
                    : "event";
            if (itemType === "agentMessage" && text) {
              completedAgentMessageText = text;
              if (!replyText.trim()) replyText = text;
            }
            if (itemType === "reasoning" && !text) return;
            const event = progressEvent({
              type,
              rawType: method,
              itemType,
              text,
              phase: itemType === "agentMessage" ? "final" : null,
            });
            emitProgress(event);
            return;
          }
          if (method === "turn/started") {
            const event = progressEvent({ type: "running", rawType: method, text: "Codex app-server turn started" });
            emitProgress(event);
            return;
          }
          if (method === "thread/status/changed") {
            const status = isRecord(params.status) ? params.status : {};
            const statusType = normalizeString(status.type) || normalizeString(params.type) || normalizeString(params.status);
            if (statusType === "idle" && (completedAgentMessageText || replyText)) {
              const event = progressEvent({ type: "completed", rawType: method, text: "Codex app-server thread idle" });
              emitProgress(event);
              done();
            }
            return;
          }
          if (method !== "turn/completed") {
            emitUnknownProgress(method);
            return;
          }
          const completedTurn = isRecord(params.turn) ? params.turn : {};
          const terminal = codexAppServerTerminalStatus(completedTurn, "Codex app-server turn", {
            allowImplicitSuccess: Boolean(completedAgentMessageText || replyText),
          });
          const event = progressEvent({
            type: terminal.ok ? "completed" : "failed",
            rawType: method,
            text: terminal.text,
          });
          emitProgress(event);
          if (!terminal.ok) {
            terminalStatus = terminal.status;
            terminalError = terminal.error;
            if (terminal.status === "failed") {
              done(new Error(terminalError || terminal.text));
              return;
            }
          }
          done();
        };
        const pendingNotifications = this.pendingActiveTurnNotifications.splice(0);
        for (const message of pendingNotifications) this.activeTurnCompleted(message);
      });
      return agentResult({
        messageId: input.messageId,
        model: this.model,
        cwd: this.cwd,
        replyText: terminalStatus === "completed" ? completedAgentMessageText || replyText : null,
        durationMs: Date.now() - startedAt,
        ok: terminalStatus === "completed",
        status: terminalStatus,
        error: terminalError,
        progressEvents,
        threadId: this.threadId,
        resumed: true,
        args: processRequest.args,
      });
    } finally {
      input.signal?.removeEventListener("abort", abortListener);
      this.activeTurnHeartbeat = null;
      this.activeTurnCompleted = null;
      this.activeTurnFailure = null;
      this.activeTurnId = null;
      this.activeTurnInput = null;
      this.pendingActiveTurnNotifications = [];
      this.pendingStopReason = null;
      cleanupChannelConnectorAgentProcessRequest(processRequest);
    }
  }

  async stop(reason: string): Promise<void> {
    const stopReason = reason || "manual-stop";
    if (!this.threadId || !this.activeTurnId) {
      if (this.activeTurnInput) this.pendingStopReason = stopReason;
      return;
    }
    const turnId = this.activeTurnId;
    this.pendingStopReason = null;
    await this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId,
      reason: stopReason,
    }).catch(() => undefined);
  }

  dispose(reason: string): void {
    this.failActiveTurn(new Error(`Codex app-server session disposed: ${reason || "dispose"}`));
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Codex app-server session disposed: ${reason || "dispose"}`));
    }
    this.pending.clear();
    this.denyPendingApprovals(`Codex app-server session disposed: ${reason || "dispose"}`);
    this.transport.close(reason || "dispose");
  }

  private async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.request("initialize", {
      clientInfo: {
        name: "openclaw-studio-channel-connectors",
        title: "OpenClaw Studio Channel Connectors",
        version: "0",
      },
      capabilities: {
        experimentalApi: true,
        requestAttestation: false,
        optOutNotificationMethods: [],
      },
    });
    this.transport.send({ method: "initialized" });
    this.initialized = true;
  }

  private async ensureThread(): Promise<void> {
    if (this.threadId) return;
    const response = await this.request("thread/start", {
      model: this.model,
      cwd: this.cwd,
      approvalPolicy: approvalPolicy(this.permissionMode),
      sandbox: sandboxMode(this.permissionMode),
      serviceName: "openclaw-studio-channel-connectors",
      ephemeral: false,
      threadSource: "user",
    });
    const thread = isRecord(response.thread) ? response.thread : isRecord(response.threadStartResponse) ? response.threadStartResponse : null;
    this.threadId = normalizeString(thread?.id) || normalizeString(isRecord(response.thread) ? response.thread.id : null);
    if (!this.threadId && isRecord(response.thread) && normalizeString(response.thread.id)) {
      this.threadId = normalizeString(response.thread.id);
    }
    if (!this.threadId) {
      const nested = isRecord(response.thread) ? response.thread : response;
      this.threadId = normalizeString(isRecord(nested.thread) ? nested.thread.id : null);
    }
    if (!this.threadId) throw new Error("Codex app-server did not return a thread id.");
  }

  private request(method: string, params: Record<string, unknown> | null): Promise<Record<string, unknown>> {
    const id = this.nextRequestId;
    this.nextRequestId += 1;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, this.requestTimeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
      this.transport.send({ id, method, params: params || undefined });
    });
  }

  private handleMessage(message: Record<string, unknown>): void {
    const hasId = Object.prototype.hasOwnProperty.call(message, "id");
    const method = normalizeString(message.method);
    if (hasId && method) {
      this.activeTurnHeartbeat?.(method);
      void this.handleServerRequest(message.id, method, isRecord(message.params) ? message.params : {});
      return;
    }
    const id = typeof message.id === "number" ? message.id : null;
    if (id !== null && this.pending.has(id)) {
      const pending = this.pending.get(id);
      this.pending.delete(id);
      if (!pending) return;
      clearTimeout(pending.timeout);
      if (isRecord(message.error)) {
        pending.reject(new Error(normalizeString(message.error.message) || "Codex app-server request failed."));
        return;
      }
      pending.resolve(isRecord(message.result) ? message.result : {});
      return;
    }
    if (this.activeTurnCompleted) {
      this.activeTurnCompleted(message);
      return;
    }
    if (this.activeTurnInput && method) {
      this.pendingActiveTurnNotifications.push(message);
    }
  }

  private async handleServerRequest(
    id: unknown,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    if (method === "item/commandExecution/requestApproval" || method === "item/fileChange/requestApproval") {
      await this.handleApprovalRequest(id, method, params);
      return;
    }
    if (method === "item/permissions/requestApproval") {
      await this.handlePermissionsApproval(id, method, params);
      return;
    }
    if (method === "item/tool/call") {
      this.transport.send({
        jsonrpc: "2.0",
        id,
        result: {
          success: false,
          contentItems: [{ type: "inputText", text: "tool not available on this client" }],
        },
      });
      return;
    }
    this.transport.send({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "method not found" },
    });
  }

  private async handleApprovalRequest(
    id: unknown,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const request = codexApprovalRequest({ id, method, params });
    const decision = await this.resolveCodexApproval(id, request);
    this.transport.send({
      jsonrpc: "2.0",
      id,
      result: {
        decision: decision.behavior === "allow" ? "accept" : "decline",
      },
    });
  }

  private async handlePermissionsApproval(
    id: unknown,
    method: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const request = codexApprovalRequest({ id, method, params });
    const decision = await this.resolveCodexApproval(id, request);
    if (decision.behavior === "allow") {
      this.transport.send({
        jsonrpc: "2.0",
        id,
        result: {
          permissions: params.permissions || {},
          scope: "turn",
        },
      });
      return;
    }
    this.transport.send({
      jsonrpc: "2.0",
      id,
      result: {
        permissions: {},
      },
    });
  }

  private async resolveCodexApproval(
    id: unknown,
    request: ChannelConnectorAgentPermissionRequest,
  ): Promise<ChannelConnectorAgentPermissionDecision> {
    const requestKey = jsonRpcIdKey(id);
    const previous = this.pendingApprovals.get(requestKey);
    if (previous) {
      clearTimeout(previous.timeout);
      previous.resolve({ behavior: "deny", message: "A newer Codex app-server approval request replaced this request." });
    }

    const activeInput = this.activeTurnInput;
    activeInput?.onProgress?.(progressEvent({
      type: "event",
      rawType: request.subtype,
      itemType: request.toolName,
      text: codexApprovalProgressText(request),
    }));

    return new Promise<ChannelConnectorAgentPermissionDecision>((resolve) => {
      let settled = false;
      const finish = (decision: ChannelConnectorAgentPermissionDecision): void => {
        if (settled) return;
        settled = true;
        const entry = this.pendingApprovals.get(requestKey);
        if (entry) {
          clearTimeout(entry.timeout);
          this.pendingApprovals.delete(requestKey);
        }
        this.activeTurnHeartbeat?.(decision.behavior === "allow" ? "approval-resolved" : "approval-denied");
        resolve(decision);
      };
      const timeout = setTimeout(() => {
        finish({ behavior: "deny", message: "Codex app-server permission request timed out waiting for IM approval." });
      }, 5 * 60_000);
      timeout.unref();
      this.pendingApprovals.set(requestKey, { resolve: finish, timeout });
      this.activeTurnHeartbeat?.(request.subtype);

      const automatic = codexAutomaticPermissionDecision(this.permissionMode, request);
      if (automatic) {
        finish(automatic);
        return;
      }

      const resolver = activeInput?.agentTurnRequest?.resolvePermission || null;
      if (!resolver) {
        finish(codexFallbackPermissionDecision());
        return;
      }
      Promise.resolve(resolver(request))
        .then((decision) => finish(decision || codexFallbackPermissionDecision()))
        .catch((error) => finish({
          behavior: "deny",
          message: error instanceof Error ? error.message : "Codex app-server permission resolver failed.",
        }));
    });
  }

  private denyPendingApprovals(message: string): void {
    for (const [requestKey, entry] of [...this.pendingApprovals.entries()]) {
      this.pendingApprovals.delete(requestKey);
      clearTimeout(entry.timeout);
      entry.resolve({ behavior: "deny", message });
    }
    this.activeTurnHeartbeat?.("approval-denied");
  }
}

export function createCodexAppServerSessionDriverFactory(
  options: CodexAppServerSessionFactoryOptions,
): ChannelConnectorAgentSessionDriverFactory {
  return {
    create: ({ key, poolKey, turnInput }) => new CodexAppServerSession({
      sessionId: `codex-app-server:${poolKey}`,
      transport: options.transportFactory({
        sessionId: poolKey,
        key,
        agentTurnRequest: turnInput?.agentTurnRequest || null,
      }),
      model: key.model,
      cwd: key.workDir,
      permissionMode: key.permissionMode || options.permissionMode || "suggest",
      requestTimeoutMs: options.requestTimeoutMs,
      turnTimeoutMs: options.turnTimeoutMs,
    }),
  };
}
