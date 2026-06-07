import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ChannelConnectorPermissionMode } from "../../../../types/channel-connectors.js";
import {
  buildChannelConnectorAgentProcessRequest,
  codexToolProgressText,
  firstProgressTextValue,
  truncateProgressText,
  type ChannelConnectorAgentProgressEvent,
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
}

export interface CodexAppServerSessionFactoryOptions {
  transportFactory: (input: {
    sessionId: string;
    key: ChannelConnectorAgentSessionDriverKeyInput;
    agentTurnRequest?: ChannelConnectorAgentSessionDriverTurnInput["agentTurnRequest"];
  }) => CodexAppServerTransport;
  permissionMode?: ChannelConnectorPermissionMode;
  requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
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
}): ChannelConnectorAgentProgressEvent {
  return {
    checkedAt: nowIso(),
    type: input.type,
    rawType: input.rawType,
    itemType: input.itemType || null,
    text: input.text ? truncateProgressText(input.text) : null,
  };
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

function compactWaitTimeoutMs(requestTimeoutMs: number): number {
  return Math.max(requestTimeoutMs, 60_000);
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
}): ChannelConnectorAgentTurnResult {
  return {
    attempted: true,
    ok: input.ok,
    status: input.status || (input.ok ? "completed" : "failed"),
    agent: "codex",
    model: input.model,
    command: "codex app-server",
    args: [],
    cwd: input.cwd,
    replyText: input.ok ? input.replyText : null,
    stdout: input.replyText || "",
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
  private pending = new Map<number, PendingRequest>();
  private nextRequestId = 1;
  private initialized = false;
  private threadId: string | null = null;
  private activeTurnId: string | null = null;
  private activeTurnCompleted: ((message: Record<string, unknown>) => void) | null = null;

  constructor(options: CodexAppServerSessionOptions) {
    this.id = options.sessionId;
    this.transport = options.transport;
    this.model = options.model;
    this.cwd = options.cwd;
    this.permissionMode = options.permissionMode;
    this.requestTimeoutMs = Number.isFinite(Number(options.requestTimeoutMs))
      ? Math.max(1, Number(options.requestTimeoutMs))
      : 10_000;
    this.transport.onMessage((message) => this.handleMessage(message));
    this.transport.onClose((error) => {
      if (!error) return;
      for (const pending of this.pending.values()) {
        clearTimeout(pending.timeout);
        pending.reject(error);
      }
      this.pending.clear();
    });
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
          if (error) reject(error);
          else resolve();
        };
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
          const status = normalizeString(turn.status) || "completed";
          const failed = status === "failed" || status === "cancelled" || status === "interrupted";
          const error = isRecord(turn.error) ? normalizeString(turn.error.message) : normalizeString(turn.error);
          const event = progressEvent({
            type: failed ? "failed" : "completed",
            rawType: method,
            itemType: "contextCompaction",
            text: `Codex app-server compact ${status}`,
          });
          pushEvent(event);
          if (failed) done(new Error(error || `Codex app-server compact ${status}.`));
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
    const turnResponse = await this.request("turn/start", {
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
    const abortListener = (): void => {
      void this.stop("signal-aborted");
    };
    input.signal?.addEventListener("abort", abortListener, { once: true });
    try {
      await new Promise<void>((resolve, reject) => {
        this.activeTurnCompleted = (message) => {
          const method = normalizeString(message.method);
          const params = isRecord(message.params) ? message.params : {};
          if (method === "item/agentMessage/delta") {
            const delta = stringValue(params.delta);
            if (delta) {
              replyText += delta;
              if (delta.trim()) {
                const event = progressEvent({ type: "assistant", rawType: method, itemType: "agentMessage", text: delta });
                progressEvents.push(event);
                input.onProgress?.(event);
              }
            }
            return;
          }
          if (method === "item/completed") {
            const item = isRecord(params.item) ? params.item : {};
            const itemType = normalizeString(item.type);
            const toolLike = itemType === "commandExecution" || itemType.endsWith("ToolCall");
            const text = itemType === "agentMessage"
              ? firstProgressTextValue(item.text, item.content, item.message)
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
            const event = progressEvent({ type, rawType: method, itemType, text });
            progressEvents.push(event);
            input.onProgress?.(event);
            return;
          }
          if (method === "turn/started") {
            const event = progressEvent({ type: "running", rawType: method, text: "Codex app-server turn started" });
            progressEvents.push(event);
            input.onProgress?.(event);
            return;
          }
          if (method !== "turn/completed") return;
          const completedTurn = isRecord(params.turn) ? params.turn : {};
          const status = normalizeString(completedTurn.status);
          const cancelled = status === "cancelled" || status === "interrupted";
          const event = progressEvent({
            type: status === "failed" || cancelled ? "failed" : "completed",
            rawType: method,
            text: `Codex app-server turn ${status || "completed"}`,
          });
          progressEvents.push(event);
          input.onProgress?.(event);
          if (status === "failed") {
            terminalStatus = "failed";
            terminalError = "Codex app-server turn failed.";
            reject(new Error(terminalError));
            return;
          }
          if (cancelled) {
            terminalStatus = "cancelled";
            terminalError = `Codex app-server turn ${status}.`;
          }
          resolve();
        };
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
      });
    } finally {
      input.signal?.removeEventListener("abort", abortListener);
      this.activeTurnCompleted = null;
      this.activeTurnId = null;
    }
  }

  async stop(reason: string): Promise<void> {
    if (!this.threadId || !this.activeTurnId) return;
    await this.request("turn/interrupt", {
      threadId: this.threadId,
      turnId: this.activeTurnId,
      reason,
    }).catch(() => undefined);
  }

  dispose(reason: string): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Codex app-server session disposed: ${reason || "dispose"}`));
    }
    this.pending.clear();
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
    this.activeTurnCompleted?.(message);
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
    }),
  };
}
