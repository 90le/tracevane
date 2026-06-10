import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { ChannelConnectorAgentId, ChannelConnectorPermissionMode } from "../../../../types/channel-connectors.js";
import {
  buildChannelConnectorAgentProcessRequest,
  defaultChannelConnectorAgentProcessRunner,
  firstProgressTextValue,
  truncateProgressText,
  type ChannelConnectorAgentPermissionDecision,
  type ChannelConnectorAgentPermissionRequest,
  type ChannelConnectorAgentProgressEvent,
  type ChannelConnectorAgentTurnResult,
  type ChannelConnectorAgentTurnRequest,
} from "./agent-runner.js";
import type {
  ChannelConnectorAgentSessionDriverFactory,
  ChannelConnectorAgentSessionDriverSession,
  ChannelConnectorAgentSessionDriverTurnInput,
} from "./agent-session-driver.js";

export interface NativeCliSessionDriverFactoryOptions {
  codexFactory: ChannelConnectorAgentSessionDriverFactory;
  requestTimeoutMs?: number;
  turnTimeoutMs?: number;
}

interface PendingClaudeTurn {
  input: ChannelConnectorAgentSessionDriverTurnInput;
  startedAt: number;
  nativeCommand: string | null;
  progressEvents: ChannelConnectorAgentProgressEvent[];
  replyParts: string[];
  completedText: string | null;
  resultText: string | null;
  pendingAssistantProgress: ChannelConnectorAgentProgressEvent[];
  terminalStatus: ChannelConnectorAgentTurnResult["status"];
  terminalError: string | null;
  timeout: NodeJS.Timeout;
  resolve: (result: ChannelConnectorAgentTurnResult) => void;
  reject: (error: Error) => void;
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
  rawType: string | null;
  itemType?: string | null;
  text?: string | null;
  phase?: ChannelConnectorAgentProgressEvent["phase"];
  toolName?: string | null;
  toolCallId?: string | null;
}): ChannelConnectorAgentProgressEvent {
  return {
    checkedAt: nowIso(),
    type: input.type,
    rawType: input.rawType,
    itemType: input.itemType || null,
    text: input.text ? truncateProgressText(input.text) : null,
    phase: input.phase || null,
    toolName: normalizeString(input.toolName) || null,
    toolCallId: normalizeString(input.toolCallId) || null,
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

function firstText(...values: unknown[]): string {
  return firstProgressTextValue(...values);
}

function compactCommand(command: string | null | undefined): boolean {
  const head = normalizeString(command).split(/\s+/)[0]?.replace(/^\/+/, "").toLowerCase();
  return head === "compact" || head === "compress";
}

function claudeContentItems(raw: Record<string, unknown>): Record<string, unknown>[] {
  const message = isRecord(raw.message) ? raw.message : null;
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.filter(isRecord);
}

function claudeToolProgressText(item: Record<string, unknown>): string {
  const name = normalizeString(item.name) || normalizeString(item.tool_name) || normalizeString(item.toolName) || "tool";
  const input = firstText(item.input, item.content, item.text, item.result);
  return [name, input ? `input:\n${input}` : ""].filter(Boolean).join("\n");
}

function isClaudeEditTool(toolName: string): boolean {
  return ["Edit", "Write", "NotebookEdit", "MultiEdit"].includes(toolName);
}

function claudePermissionDecision(
  mode: ChannelConnectorPermissionMode | null | undefined,
  request: ChannelConnectorAgentPermissionRequest,
): ChannelConnectorAgentPermissionDecision | null {
  if (request.toolName === "AskUserQuestion") return null;
  if (mode === "yolo" || mode === "full-auto") return { behavior: "allow", updatedInput: request.input };
  if (mode === "auto-edit" && isClaudeEditTool(request.toolName)) return { behavior: "allow", updatedInput: request.input };
  if (mode === "read-only") return { behavior: "deny", message: "Permission mode is read-only; Studio denied this Claude tool use." };
  if (mode === "auto-edit") {
    return { behavior: "deny", message: "Permission mode is auto-edit; Studio only auto-allows Claude edit tools." };
  }
  return null;
}

function claudeControlResponseLine(requestId: string, decision: ChannelConnectorAgentPermissionDecision): string {
  const response = decision.behavior === "allow"
    ? { behavior: "allow", updatedInput: decision.updatedInput || {} }
    : { behavior: "deny", message: decision.message || "The user denied this tool use. Stop and wait for the user's instructions." };
  return `${JSON.stringify({
    type: "control_response",
    response: {
      subtype: "success",
      request_id: requestId,
      response,
    },
  })}\n`;
}

function parseClaudePermissionRequest(raw: Record<string, unknown>): ChannelConnectorAgentPermissionRequest | null {
  const request = isRecord(raw.request) ? raw.request : null;
  const requestId = normalizeString(raw.request_id) || normalizeString(request?.request_id);
  const subtype = normalizeString(request?.subtype);
  if (!requestId || subtype !== "can_use_tool") return null;
  return {
    requestId,
    subtype,
    toolName: normalizeString(request?.tool_name),
    input: isRecord(request?.input) ? request.input : {},
  };
}

function agentResult(input: {
  agent: ChannelConnectorAgentId;
  messageId: string;
  model: string | null;
  cwd: string;
  command: string;
  nativeCommand: string | null;
  replyText: string | null;
  durationMs: number;
  ok: boolean;
  status?: ChannelConnectorAgentTurnResult["status"];
  error?: string | null;
  progressEvents: ChannelConnectorAgentProgressEvent[];
  sessionId: string | null;
  resumed: boolean;
}): ChannelConnectorAgentTurnResult {
  const compactOkText = input.nativeCommand && compactCommand(input.nativeCommand) && input.ok
    ? `${input.agent === "opencode" ? "OpenCode" : "Claude Code"} compact 已完成。`
    : null;
  const replyText = input.ok ? (input.replyText || compactOkText) : null;
  return {
    attempted: true,
    ok: input.ok,
    status: input.status || (input.ok ? "completed" : "failed"),
    agent: input.agent,
    model: input.model,
    command: input.command,
    args: [],
    cwd: input.cwd,
    replyText,
    stdout: replyText || "",
    stderr: "",
    exitCode: input.ok ? 0 : 1,
    durationMs: input.durationMs,
    error: input.ok ? null : input.error || `${input.agent} persistent session turn failed.`,
    progress: {
      eventCount: input.progressEvents.length,
      latest: input.progressEvents[input.progressEvents.length - 1] || null,
      summary: input.progressEvents.slice().reverse().find((event) => event.text)?.text || null,
    },
    session: {
      resumed: input.resumed,
      agentNativeSessionId: input.sessionId,
      codexThreadId: null,
    },
  };
}

export class ClaudeCodeStreamJsonSession implements ChannelConnectorAgentSessionDriverSession {
  readonly id: string;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly model: string | null;
  private readonly cwd: string;
  private readonly permissionMode: ChannelConnectorPermissionMode | null;
  private readonly turnTimeoutMs: number;
  private stdoutBuffer = "";
  private sessionId: string | null;
  private closed = false;
  private activeTurn: PendingClaudeTurn | null = null;
  private readonly pendingToolNamesById = new Map<string, string>();
  private latestToolName: string | null = null;

  constructor(input: {
    id: string;
    request: ChannelConnectorAgentTurnRequest;
    requestTimeoutMs?: number;
    turnTimeoutMs?: number;
  }) {
    const processRequest = buildChannelConnectorAgentProcessRequest(input.request);
    if (!processRequest || processRequest.agent !== "claude-code") {
      throw new Error("Claude Code persistent session requires a Claude Code process request.");
    }
    this.id = input.id;
    this.model = input.request.project.model;
    this.cwd = processRequest.cwd;
    this.permissionMode = input.request.project.permissionMode || null;
    this.sessionId = processRequest.agentNativeSessionId || null;
    this.turnTimeoutMs = Number.isFinite(Number(input.turnTimeoutMs))
      ? Math.max(1, Number(input.turnTimeoutMs))
      : Math.max(Number(input.requestTimeoutMs) || 10_000, 10 * 60_000);
    this.child = spawn(processRequest.command, processRequest.args, {
      cwd: processRequest.cwd,
      env: {
        ...process.env,
        ...processRequest.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => this.handleStdout(String(chunk)));
    this.child.stderr.on("data", (chunk) => {
      const text = String(chunk).trim();
      if (text && this.activeTurn) {
        this.pushProgress(progressEvent({ type: "event", rawType: "stderr", text }));
      }
    });
    this.child.on("error", (error) => this.failActive(error));
    this.child.on("close", (code, signal) => {
      this.closed = true;
      if (this.activeTurn) this.failActive(new Error(`Claude Code persistent session exited with ${signal || code}`));
    });
  }

  async runTurn(input: ChannelConnectorAgentSessionDriverTurnInput): Promise<ChannelConnectorAgentTurnResult> {
    if (!input.agentTurnRequest || input.agentTurnRequest.project.agent !== "claude-code") return input.runOneShot();
    if (this.closed || this.child.killed) throw new Error("Claude Code persistent session is not running.");
    if (this.activeTurn) throw new Error("Claude Code persistent session already has an active turn.");
    const processRequest = buildChannelConnectorAgentProcessRequest({
      ...input.agentTurnRequest,
      session: {
        ...(input.agentTurnRequest.session || {}),
        agentNativeSessionId: this.sessionId || input.agentTurnRequest.session?.agentNativeSessionId || null,
      },
    });
    if (!processRequest || !processRequest.stdin) return input.runOneShot();
    const startedAt = Date.now();
    return new Promise<ChannelConnectorAgentTurnResult>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.failActive(new Error("Claude Code persistent session turn timed out."));
      }, this.turnTimeoutMs);
      this.activeTurn = {
        input,
        startedAt,
        nativeCommand: processRequest.nativeCommand || null,
        progressEvents: [],
        replyParts: [],
        completedText: null,
        resultText: null,
        pendingAssistantProgress: [],
        terminalStatus: "completed",
        terminalError: null,
        timeout,
        resolve,
        reject,
      };
      try {
        this.child.stdin.write(processRequest.stdin);
      } catch (error) {
        this.failActive(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  stop(reason: string): void {
    this.cancelActive(reason || "manual-stop");
    if (!this.child.killed) this.child.kill(reason === "dispose" ? "SIGTERM" : "SIGTERM");
  }

  dispose(reason: string): void {
    try {
      this.child.stdin.end();
    } catch {
      // best effort
    }
    setTimeout(() => {
      if (!this.child.killed) this.child.kill("SIGTERM");
    }, reason === "idle-timeout" ? 250 : 0).unref();
  }

  private handleStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || "";
    for (const line of lines) this.handleLine(line);
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) return;
    let raw: Record<string, unknown>;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (!isRecord(parsed)) return;
      raw = parsed;
    } catch {
      return;
    }
    const rawType = normalizeString(raw.type);
    if (rawType === "system") {
      const sessionId = normalizeString(raw.session_id);
      if (sessionId) this.sessionId = sessionId;
      if (sessionId) this.pushProgress(progressEvent({ type: "session", rawType, text: sessionId }));
      return;
    }
    if (rawType === "assistant") {
      const items = claudeContentItems(raw);
      const hasIntermediateContext = items.some((item) => {
        const itemType = normalizeString(item.type);
        return itemType === "thinking"
          || (itemType === "tool_use" && normalizeString(item.name) !== "AskUserQuestion");
      });
      for (const item of items) {
        const itemType = normalizeString(item.type);
        if (itemType === "text") {
          const text = stringValue(item.text);
          if (text) {
            if (this.activeTurn) this.activeTurn.replyParts.push(text);
            this.pushProgress(progressEvent({
              type: "assistant",
              rawType,
              itemType,
              text,
              phase: hasIntermediateContext ? "intermediate" : "final",
            }));
          }
        } else if (itemType === "thinking") {
          const text = stringValue(item.thinking) || firstText(item);
          if (text) this.pushProgress(progressEvent({ type: "reasoning", rawType, itemType, text }));
        } else if (itemType === "tool_use") {
          const toolName = normalizeString(item.name);
          if (toolName !== "AskUserQuestion") {
            const toolCallId = normalizeString(item.id) || normalizeString(item.tool_use_id);
            this.latestToolName = toolName;
            if (toolCallId) this.pendingToolNamesById.set(toolCallId, toolName);
            this.pushProgress(progressEvent({
              type: "tool",
              rawType,
              itemType,
              text: claudeToolProgressText(item),
              toolName,
              toolCallId,
            }));
          }
        }
      }
      return;
    }
    if (rawType === "user") {
      for (const item of claudeContentItems(raw)) {
        const itemType = normalizeString(item.type);
        if (itemType !== "tool_result") continue;
        const isError = item.is_error === true;
        const text = firstText(item.content, item.text, item.result);
        if (text || isError) {
          const toolCallId = normalizeString(item.tool_use_id) || normalizeString(item.id);
          const toolName = (toolCallId ? this.pendingToolNamesById.get(toolCallId) : null) || this.latestToolName;
          this.pushProgress(progressEvent({
            type: isError ? "error" : "tool",
            rawType,
            itemType,
            text: text || "Claude tool result reported an error.",
            toolName,
            toolCallId,
          }));
        }
      }
      return;
    }
    if (rawType === "control_request") {
      void this.handlePermissionRequest(raw);
      return;
    }
    if (rawType === "result") {
      const sessionId = normalizeString(raw.session_id);
      if (sessionId) this.sessionId = sessionId;
      const failed = raw.is_error === true || normalizeString(raw.subtype).toLowerCase() === "error";
      const text = firstText(raw.result, raw.error, raw.message);
      if (this.activeTurn) {
        this.activeTurn.resultText = text || this.activeTurn.resultText;
        this.activeTurn.terminalStatus = failed ? "failed" : "completed";
        this.activeTurn.terminalError = failed ? text || "Claude Code persistent session turn failed." : null;
      }
      this.pushProgress(progressEvent({
        type: failed ? "failed" : "completed",
        rawType,
        text: text || (failed ? "Claude Code turn failed" : "Claude Code turn completed"),
      }));
      this.finishActive();
    }
  }

  private async handlePermissionRequest(raw: Record<string, unknown>): Promise<void> {
    const request = parseClaudePermissionRequest(raw);
    if (!request) return;
    this.pushProgress(progressEvent({
      type: "tool",
      rawType: "control_request",
      text: [request.subtype, request.toolName].filter(Boolean).join(": "),
      toolName: request.toolName,
      toolCallId: request.requestId,
    }));
    const resolver = this.activeTurn?.input.agentTurnRequest?.resolvePermission;
    const decision = claudePermissionDecision(this.permissionMode, request)
      || (resolver ? await resolver(request) : { behavior: "deny", message: "Interactive Claude tool approval is not available in this Studio runner." });
    try {
      this.child.stdin.write(claudeControlResponseLine(request.requestId, decision));
    } catch (error) {
      this.failActive(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private pushProgress(event: ChannelConnectorAgentProgressEvent): void {
    if (!this.activeTurn) return;
    if (event.type === "assistant" && event.phase === "final" && normalizeString(event.text)) {
      this.activeTurn.pendingAssistantProgress.push(event);
      return;
    }
    if (this.activeTurn.pendingAssistantProgress.length) {
      const terminal = event.type === "completed" || event.type === "failed" || event.type === "error";
      this.flushPendingAssistantProgress(terminal ? "final" : "intermediate");
    }
    this.activeTurn.progressEvents.push(event);
    this.activeTurn.input.onProgress?.(event);
  }

  private flushPendingAssistantProgress(phase: "intermediate" | "final"): void {
    const turn = this.activeTurn;
    if (!turn?.pendingAssistantProgress.length) return;
    const latest = turn.pendingAssistantProgress[turn.pendingAssistantProgress.length - 1];
    const text = joinAssistantProgressText(turn.pendingAssistantProgress.map((event) => event.text || ""))
      || latest.text
      || "";
    turn.pendingAssistantProgress.length = 0;
    if (!text) return;
    const event = { ...latest, text, phase };
    turn.progressEvents.push(event);
    turn.input.onProgress?.(event);
  }

  private finishActive(): void {
    const turn = this.activeTurn;
    if (!turn) return;
    this.activeTurn = null;
    clearTimeout(turn.timeout);
    const reply = turn.resultText || turn.completedText || turn.replyParts.join("").trim() || null;
    turn.resolve(agentResult({
      agent: "claude-code",
      messageId: turn.input.messageId,
      model: this.model,
      cwd: this.cwd,
      command: "claude stream-json",
      nativeCommand: turn.nativeCommand,
      replyText: reply,
      durationMs: Date.now() - turn.startedAt,
      ok: turn.terminalStatus === "completed",
      status: turn.terminalStatus,
      error: turn.terminalError,
      progressEvents: turn.progressEvents,
      sessionId: this.sessionId,
      resumed: true,
    }));
  }

  private failActive(error: Error): void {
    const turn = this.activeTurn;
    if (!turn) return;
    this.activeTurn = null;
    clearTimeout(turn.timeout);
    turn.reject(error);
  }

  private cancelActive(reason: string): void {
    const turn = this.activeTurn;
    if (!turn) return;
    this.activeTurn = null;
    clearTimeout(turn.timeout);
    turn.resolve(agentResult({
      agent: "claude-code",
      messageId: turn.input.messageId,
      model: this.model,
      cwd: this.cwd,
      command: "claude stream-json",
      nativeCommand: turn.nativeCommand,
      replyText: null,
      durationMs: Date.now() - turn.startedAt,
      ok: false,
      status: "cancelled",
      error: reason === "signal-aborted" ? "Agent process cancelled." : `Agent process cancelled: ${reason}`,
      progressEvents: turn.progressEvents,
      sessionId: this.sessionId,
      resumed: true,
    }));
  }
}

export class OpenCodeRunSession implements ChannelConnectorAgentSessionDriverSession {
  readonly id: string;
  private sessionId: string | null;
  private activeController: AbortController | null = null;

  constructor(input: { id: string; sessionId?: string | null }) {
    this.id = input.id;
    this.sessionId = normalizeString(input.sessionId) || null;
  }

  async runTurn(input: ChannelConnectorAgentSessionDriverTurnInput): Promise<ChannelConnectorAgentTurnResult> {
    if (!input.agentTurnRequest || input.agentTurnRequest.project.agent !== "opencode") return input.runOneShot();
    if (this.activeController) throw new Error("OpenCode persistent session already has an active turn.");
    const controller = new AbortController();
    const sourceSignal = input.signal || input.agentTurnRequest.signal || null;
    const abortActive = (): void => controller.abort();
    if (sourceSignal?.aborted) controller.abort();
    sourceSignal?.addEventListener("abort", abortActive, { once: true });
    this.activeController = controller;
    try {
      const result = await runOpenCodeTurn({
        ...input.agentTurnRequest,
        session: {
          ...(input.agentTurnRequest.session || {}),
          agentNativeSessionId: this.sessionId || input.agentTurnRequest.session?.agentNativeSessionId || null,
        },
        allowNativeCompact: true,
        onProgress: input.onProgress || input.agentTurnRequest.onProgress,
        signal: controller.signal,
        processRunner: input.agentTurnRequest.processRunner || defaultChannelConnectorAgentProcessRunner,
      });
      this.sessionId = result.session.agentNativeSessionId || this.sessionId;
      if (compactCommand(input.agentTurnRequest.nativeCommand) && result.ok === true) {
        return {
          ...result,
          replyText: "OpenCode compact 已完成。",
          stdout: "OpenCode compact 已完成。",
        };
      }
      return result;
    } finally {
      sourceSignal?.removeEventListener("abort", abortActive);
      if (this.activeController === controller) this.activeController = null;
    }
  }

  stop(): void {
    this.activeController?.abort();
  }

  dispose(): void {
    // No resident child process.
  }
}

async function runOpenCodeTurn(request: ChannelConnectorAgentTurnRequest): Promise<ChannelConnectorAgentTurnResult> {
  const { runChannelConnectorAgentTurn } = await import("./agent-runner.js");
  return runChannelConnectorAgentTurn(request);
}

export function createNativeCliSessionDriverFactory(
  options: NativeCliSessionDriverFactoryOptions,
): ChannelConnectorAgentSessionDriverFactory {
  return {
    create: (input) => {
      if (input.key.agent === "codex") return options.codexFactory.create(input);
      if (input.key.agent === "claude-code") {
        if (!input.turnInput?.agentTurnRequest) {
          throw new Error("Claude Code persistent session requires the first turn request.");
        }
        return new ClaudeCodeStreamJsonSession({
          id: `claude-code-stream:${input.poolKey}`,
          request: input.turnInput.agentTurnRequest,
          requestTimeoutMs: options.requestTimeoutMs,
          turnTimeoutMs: options.turnTimeoutMs,
        });
      }
      if (input.key.agent === "opencode") {
        const existingSessionId = input.turnInput?.agentTurnRequest?.session?.agentNativeSessionId || null;
        return new OpenCodeRunSession({
          id: `opencode-run-session:${input.poolKey}`,
          sessionId: existingSessionId,
        });
      }
      throw new Error(`Agent ${input.key.agent} has no persistent session driver.`);
    },
  };
}
