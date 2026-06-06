import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ChannelConnectorAgentId,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorPermissionMode,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import { extractOctoContent } from "./octo-adapter.js";

export type ChannelConnectorRuntimeProject = ChannelConnectorsDaemonRuntimeConfig["projects"][number];
export type ChannelConnectorRuntimeBinding = ChannelConnectorRuntimeProject["platformBindings"][number];

export interface ChannelConnectorAgentProcessRequest {
  command: string;
  args: string[];
  cwd: string;
  stdin: string;
  env: Record<string, string>;
  timeoutMs: number;
  cleanupPaths?: string[];
  sessionMode?: "new" | "resume";
  codexThreadId?: string | null;
  agent: ChannelConnectorAgentId;
  onProgress?: (event: ChannelConnectorAgentProgressEvent) => void;
}

export interface ChannelConnectorAgentProgressEvent {
  checkedAt: string;
  type: "session" | "running" | "reasoning" | "assistant" | "tool" | "completed" | "failed" | "error" | "event";
  rawType: string | null;
  itemType: string | null;
  text: string | null;
}

export interface ChannelConnectorAgentProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error: string | null;
  progressEvents?: ChannelConnectorAgentProgressEvent[];
}

export type ChannelConnectorAgentProcessRunner = (
  request: ChannelConnectorAgentProcessRequest,
) => Promise<ChannelConnectorAgentProcessResult>;

export interface ChannelConnectorAgentTurnRequest {
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  message: ChannelConnectorOctoInboundMessage;
  sessionKey: string;
  gatewayEndpoint: string;
  gatewayClientKey: string | null;
  agentRuntimeDir?: string | null;
  session?: {
    codexThreadId?: string | null;
  } | null;
  onProgress?: (event: ChannelConnectorAgentProgressEvent) => void;
  timeoutMs?: number;
  processRunner?: ChannelConnectorAgentProcessRunner;
}

export interface ChannelConnectorAgentTurnResult {
  attempted: boolean;
  ok: boolean | null;
  status: "completed" | "failed" | "unsupported-agent" | "empty-message";
  agent: ChannelConnectorAgentId;
  model: string | null;
  command: string | null;
  args: string[];
  cwd: string | null;
  replyText: string | null;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  error: string | null;
  progress: {
    eventCount: number;
    latest: ChannelConnectorAgentProgressEvent | null;
    summary: string | null;
  };
  session: {
    resumed: boolean;
    codexThreadId: string | null;
  };
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nowIso(): string {
  return new Date().toISOString();
}

function truncateText(value: string, maxLength = 400): string {
  const normalized = value.trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function ensureWorkDir(workDir: string): string {
  const normalized = normalizeString(workDir) || process.cwd();
  fs.mkdirSync(normalized, { recursive: true });
  return normalized;
}

function uniquePathEntries(values: string[]): string {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output.join(":");
}

function cliPathEnv(): string {
  const home = normalizeString(process.env.HOME) || os.homedir();
  return uniquePathEntries([
    ...(process.env.PATH || "").split(":"),
    path.join(home, ".local", "bin"),
    path.join(home, "bin"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".deno", "bin"),
    path.join(home, ".cargo", "bin"),
    "/usr/local/sbin",
    "/usr/local/bin",
    "/usr/sbin",
    "/usr/bin",
    "/sbin",
    "/bin",
  ]);
}

function mergeProcessEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PATH: cliPathEnv(),
    ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== "")),
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function createCodexGatewayHome(input: {
  gatewayEndpoint: string;
  gatewayClientKey: string | null;
  model: string | null;
  agentRuntimeDir?: string | null;
}): { codexHome: string; cleanupRoot: string } {
  const runtimeDir = normalizeString(input.agentRuntimeDir);
  const cleanupRoot = runtimeDir || fs.mkdtempSync(path.join(os.tmpdir(), "studio-channel-codex-"));
  const codexHome = path.join(cleanupRoot, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  try {
    fs.chmodSync(codexHome, 0o700);
  } catch {
    // Best-effort hardening; config.toml itself is still written 0600.
  }
  const config = [
    "model_provider = \"studio_gateway\"",
    input.model ? `model = ${tomlString(input.model)}` : "",
    "responses_websockets = false",
    "responses_websockets_v2 = false",
    "",
    "[model_providers.studio_gateway]",
    "name = \"OpenClaw Studio Gateway\"",
    `base_url = ${tomlString(input.gatewayEndpoint)}`,
    "wire_api = \"responses\"",
    "supports_websockets = false",
    "requires_openai_auth = true",
    input.gatewayClientKey ? `experimental_bearer_token = ${tomlString(input.gatewayClientKey)}` : "",
    "responses_websockets_v2 = false",
    "",
  ].filter((line) => line !== "").join("\n");
  const configPath = path.join(codexHome, "config.toml");
  fs.writeFileSync(configPath, config, { encoding: "utf8", mode: 0o600 });
  return { codexHome, cleanupRoot: runtimeDir ? "" : cleanupRoot };
}

function cleanupProcessRequest(request: ChannelConnectorAgentProcessRequest): void {
  for (const cleanupPath of request.cleanupPaths || []) {
    try {
      fs.rmSync(cleanupPath, { recursive: true, force: true });
    } catch {
      // Cleanup is best effort; process output still carries the failure signal.
    }
  }
}

function codexPermissionArgs(mode: ChannelConnectorPermissionMode): string[] {
  if (mode === "auto-edit" || mode === "full-auto") return ["--full-auto"];
  if (mode === "yolo") return ["--dangerously-bypass-approvals-and-sandbox"];
  return [];
}

function claudePermissionMode(mode: ChannelConnectorPermissionMode): string | null {
  switch (mode) {
    case "auto-edit":
      return "acceptEdits";
    case "full-auto":
    case "yolo":
      return "bypassPermissions";
    case "plan":
      return "plan";
    default:
      return null;
  }
}

function gatewayEnv(gatewayEndpoint: string, gatewayClientKey: string | null): Record<string, string> {
  const env: Record<string, string> = {
    STUDIO_GATEWAY_ENDPOINT: gatewayEndpoint,
    NO_PROXY: "127.0.0.1,localhost",
    PATH: cliPathEnv(),
  };
  if (gatewayClientKey) {
    env.STUDIO_GATEWAY_API_KEY = gatewayClientKey;
    env.OPENAI_API_KEY = gatewayClientKey;
    env.ANTHROPIC_API_KEY = gatewayClientKey;
    env.ANTHROPIC_AUTH_TOKEN = gatewayClientKey;
  }
  return env;
}

export function buildChannelConnectorAgentProcessRequest(
  request: ChannelConnectorAgentTurnRequest,
): ChannelConnectorAgentProcessRequest | null {
  const content = extractOctoContent(request.message);
  if (!content) return null;
  const project = request.project;
  const cwd = ensureWorkDir(project.workDir);
  const model = normalizeString(project.model);
  const timeoutMs = request.timeoutMs || 10 * 60_000;
  const baseEnv = gatewayEnv(request.gatewayEndpoint, request.gatewayClientKey);

  if (project.agent === "codex") {
    const codexThreadId = normalizeString(request.session?.codexThreadId);
    const codexHome = createCodexGatewayHome({
      gatewayEndpoint: request.gatewayEndpoint,
      gatewayClientKey: request.gatewayClientKey,
      model: model || null,
      agentRuntimeDir: request.agentRuntimeDir,
    });
    const codexConfigArgs = [
      "-c",
      "model_provider=\"studio_gateway\"",
      "-c",
      "responses_websockets=false",
      "-c",
      "responses_websockets_v2=false",
    ];
    const args = codexThreadId
      ? [
        "exec",
        "resume",
        "--skip-git-repo-check",
        ...codexPermissionArgs(project.permissionMode),
        ...(model ? ["--model", model] : []),
        ...codexConfigArgs,
        "--json",
        codexThreadId,
        "-",
      ]
      : [
        "exec",
        "--skip-git-repo-check",
        ...codexPermissionArgs(project.permissionMode),
        ...(model ? ["--model", model] : []),
        ...codexConfigArgs,
        "--json",
        "--cd",
        cwd,
        "-",
      ];
    return {
      command: "codex",
      args,
      cwd,
      stdin: content,
      env: {
        ...baseEnv,
        CODEX_HOME: codexHome.codexHome,
        OPENAI_BASE_URL: request.gatewayEndpoint,
      },
      timeoutMs,
      cleanupPaths: codexHome.cleanupRoot ? [codexHome.cleanupRoot] : [],
      sessionMode: codexThreadId ? "resume" : "new",
      codexThreadId: codexThreadId || null,
      agent: project.agent,
    };
  }

  if (project.agent === "claude-code") {
    const permissionMode = claudePermissionMode(project.permissionMode);
    const args = [
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--permission-prompt-tool",
      "stdio",
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
      ...(model ? ["--model", model] : []),
    ];
    return {
      command: "claude",
      args,
      cwd,
      stdin: `${JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content,
        },
      })}\n`,
      env: {
        ...baseEnv,
        ANTHROPIC_BASE_URL: request.gatewayEndpoint.replace(/\/v1\/?$/, ""),
      },
      timeoutMs,
      agent: project.agent,
    };
  }

  if (project.agent === "opencode") {
    const args = [
      "run",
      "--format",
      "json",
      ...(model ? ["--model", model] : []),
      "--dir",
      cwd,
      "--thinking",
      "--",
      content,
    ];
    return {
      command: "opencode",
      args,
      cwd,
      stdin: "",
      env: baseEnv,
      timeoutMs,
      agent: project.agent,
    };
  }

  return null;
}

function progressEvent(input: {
  type: ChannelConnectorAgentProgressEvent["type"];
  rawType?: string | null;
  itemType?: string | null;
  text?: string | null;
}): ChannelConnectorAgentProgressEvent {
  return {
    checkedAt: nowIso(),
    type: input.type,
    rawType: input.rawType || null,
    itemType: input.itemType || null,
    text: input.text ? truncateText(input.text) : null,
  };
}

function parseCodexProgressLine(line: string): ChannelConnectorAgentProgressEvent | null {
  const raw = recordValue(JSON.parse(line));
  if (!raw) return null;
  const rawType = normalizeString(raw.type) || null;
  if (rawType === "thread.started") {
    return progressEvent({ type: "session", rawType, text: normalizeString(raw.thread_id) || null });
  }
  if (rawType === "turn.started") {
    return progressEvent({ type: "running", rawType, text: "Codex turn started" });
  }
  if (rawType === "turn.completed") {
    return progressEvent({ type: "completed", rawType, text: "Codex turn completed" });
  }
  if (rawType === "turn.failed") {
    const error = recordValue(raw.error);
    return progressEvent({ type: "failed", rawType, text: normalizeString(error?.message) || "Codex turn failed" });
  }
  if (rawType === "error") {
    return progressEvent({ type: "error", rawType, text: normalizeString(raw.message) || "Codex error" });
  }
  if (rawType === "item.completed") {
    const item = recordValue(raw.item);
    const itemType = normalizeString(item?.type) || null;
    if (itemType === "reasoning") return progressEvent({ type: "reasoning", rawType, itemType, text: normalizeString(item?.text) || null });
    if (itemType === "agent_message") return progressEvent({ type: "assistant", rawType, itemType, text: normalizeString(item?.text) || null });
    if (itemType?.includes("tool") || itemType?.includes("function")) {
      return progressEvent({ type: "tool", rawType, itemType, text: normalizeString(item?.name) || itemType });
    }
    return progressEvent({ type: "event", rawType, itemType, text: itemType });
  }
  return rawType ? progressEvent({ type: "event", rawType, text: rawType }) : null;
}

function parseGenericProgressLine(line: string): ChannelConnectorAgentProgressEvent | null {
  const raw = recordValue(JSON.parse(line));
  if (!raw) return null;
  const rawType = normalizeString(raw.type) || normalizeString(raw.event) || null;
  const message = recordValue(raw.message);
  const item = recordValue(raw.item);
  const text = normalizeString(raw.text)
    || normalizeString(raw.content)
    || normalizeString(message?.content)
    || normalizeString(item?.text)
    || normalizeString(item?.content)
    || rawType;
  if (!rawType && !text) return null;
  const lowered = `${rawType || ""} ${text || ""}`.toLowerCase();
  const type: ChannelConnectorAgentProgressEvent["type"] =
    lowered.includes("error") ? "error"
      : lowered.includes("fail") ? "failed"
        : lowered.includes("complete") || lowered.includes("done") ? "completed"
          : lowered.includes("tool") ? "tool"
            : lowered.includes("reason") || lowered.includes("thinking") ? "reasoning"
              : "event";
  return progressEvent({ type, rawType, itemType: normalizeString(item?.type) || null, text });
}

function parseProgressLine(agent: ChannelConnectorAgentId, line: string): ChannelConnectorAgentProgressEvent | null {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("{")) return null;
  try {
    return agent === "codex" ? parseCodexProgressLine(trimmed) : parseGenericProgressLine(trimmed);
  } catch {
    return null;
  }
}

function collectProgressEvents(stdout: string, agent: ChannelConnectorAgentId): ChannelConnectorAgentProgressEvent[] {
  const events: ChannelConnectorAgentProgressEvent[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const event = parseProgressLine(agent, line);
    if (event) events.push(event);
  }
  return events;
}

export async function defaultChannelConnectorAgentProcessRunner(
  request: ChannelConnectorAgentProcessRequest,
): Promise<ChannelConnectorAgentProcessResult> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      env: mergeProcessEnv(request.env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let stdoutLineBuffer = "";
    const progressEvents: ChannelConnectorAgentProgressEvent[] = [];
    let settled = false;
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2000).unref();
    }, request.timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      stdoutLineBuffer += chunk;
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() || "";
      for (const line of lines) {
        const event = parseProgressLine(request.agent, line);
        if (!event) continue;
        progressEvents.push(event);
        request.onProgress?.(event);
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanupProcessRequest(request);
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        error: error.message,
        progressEvents,
      });
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const trailingEvent = parseProgressLine(request.agent, stdoutLineBuffer);
      if (trailingEvent) {
        progressEvents.push(trailingEvent);
        request.onProgress?.(trailingEvent);
      }
      cleanupProcessRequest(request);
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        error: timedOut ? "Agent process timed out." : null,
        progressEvents,
      });
    });
    if (request.stdin) child.stdin.write(request.stdin);
    child.stdin.end();
  });
}

function collectJsonLineText(stdout: string): string[] {
  const output: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      const message = raw.message;
      if (typeof message === "object" && message !== null) {
        const messageRecord = message as Record<string, unknown>;
        if (typeof messageRecord.content === "string") output.push(messageRecord.content);
      }
      const item = raw.item;
      if (typeof item === "object" && item !== null) {
        const itemRecord = item as Record<string, unknown>;
        if (itemRecord.type === "agent_message" && typeof itemRecord.text === "string") {
          output.push(itemRecord.text);
        }
        const content = itemRecord.content;
        if (typeof content === "string") output.push(content);
        if (Array.isArray(content)) {
          for (const part of content) {
            if (typeof part === "object" && part !== null && typeof (part as Record<string, unknown>).text === "string") {
              output.push((part as Record<string, string>).text);
            }
          }
        }
      }
      if (typeof raw.content === "string") output.push(raw.content);
      if (typeof raw.text === "string") output.push(raw.text);
    } catch {
      // Non-event lines are intentionally ignored; the raw stdout is still retained in the result.
    }
  }
  return output;
}

function extractReplyText(stdout: string): string | null {
  const jsonTexts = collectJsonLineText(stdout)
    .map((item) => item.trim())
    .filter(Boolean);
  if (jsonTexts.length) return jsonTexts[jsonTexts.length - 1];
  const plain = stdout.trim();
  return plain || null;
}

function extractCodexThreadId(stdout: string): string | null {
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      if (raw.type === "thread.started" && typeof raw.thread_id === "string") {
        return raw.thread_id.trim() || null;
      }
    } catch {
      // Non-event lines are intentionally ignored.
    }
  }
  return null;
}

function progressSummary(events: ChannelConnectorAgentProgressEvent[]): string | null {
  const latestText = [...events].reverse().find((event) => event.text)?.text || null;
  return latestText ? truncateText(latestText, 180) : null;
}

function failureSummary(events: ChannelConnectorAgentProgressEvent[]): string | null {
  const latestFailure = [...events].reverse().find((event) => {
    return (event.type === "failed" || event.type === "error") && event.text;
  });
  return latestFailure?.text ? truncateText(latestFailure.text, 240) : null;
}

function agentFailureMessage(
  result: ChannelConnectorAgentProcessResult,
  progressEvents: ChannelConnectorAgentProgressEvent[],
): string | null {
  if (result.error) return result.error;
  const stderr = result.stderr.trim();
  if (stderr) return truncateText(stderr, 400);
  return failureSummary(progressEvents) || `Agent process exited with ${result.exitCode}`;
}

export async function runChannelConnectorAgentTurn(
  request: ChannelConnectorAgentTurnRequest,
): Promise<ChannelConnectorAgentTurnResult> {
  const content = extractOctoContent(request.message);
  if (!content) {
    return {
      attempted: false,
      ok: null,
      status: "empty-message",
      agent: request.project.agent,
      model: request.project.model,
      command: null,
      args: [],
      cwd: null,
      replyText: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: 0,
      error: "Octo message content is empty.",
      progress: {
        eventCount: 0,
        latest: null,
        summary: null,
      },
      session: {
        resumed: false,
        codexThreadId: request.session?.codexThreadId || null,
      },
    };
  }
  if (request.project.agent === "codex" && !normalizeString(request.gatewayClientKey)) {
    return {
      attempted: false,
      ok: false,
      status: "failed",
      agent: request.project.agent,
      model: request.project.model,
      command: null,
      args: [],
      cwd: null,
      replyText: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: 0,
      error: "Studio Gateway client key is missing; Channel Connectors cannot start Codex through studio_gateway.",
      progress: {
        eventCount: 0,
        latest: null,
        summary: null,
      },
      session: {
        resumed: false,
        codexThreadId: request.session?.codexThreadId || null,
      },
    };
  }

  const processRequest = buildChannelConnectorAgentProcessRequest(request);
  if (!processRequest) {
    return {
      attempted: false,
      ok: null,
      status: "unsupported-agent",
      agent: request.project.agent,
      model: request.project.model,
      command: null,
      args: [],
      cwd: null,
      replyText: null,
      stdout: "",
      stderr: "",
      exitCode: null,
      durationMs: 0,
      error: `Agent ${request.project.agent} is not wired to the native Channel runner yet.`,
      progress: {
        eventCount: 0,
        latest: null,
        summary: null,
      },
      session: {
        resumed: false,
        codexThreadId: request.session?.codexThreadId || null,
      },
    };
  }

  const runner = request.processRunner || defaultChannelConnectorAgentProcessRunner;
  processRequest.onProgress = request.onProgress;
  let result: ChannelConnectorAgentProcessResult;
  try {
    result = await runner(processRequest);
  } finally {
    cleanupProcessRequest(processRequest);
  }
  const ok = result.exitCode === 0 && !result.error;
  const codexThreadId = request.project.agent === "codex"
    ? extractCodexThreadId(result.stdout) || processRequest.codexThreadId || null
    : request.session?.codexThreadId || null;
  const progressEvents = result.progressEvents?.length
    ? result.progressEvents
    : collectProgressEvents(result.stdout, request.project.agent);
  const latestProgress = progressEvents.length ? progressEvents[progressEvents.length - 1] : null;
  return {
    attempted: true,
    ok,
    status: ok ? "completed" : "failed",
    agent: request.project.agent,
    model: request.project.model,
    command: processRequest.command,
    args: processRequest.args,
    cwd: processRequest.cwd,
    replyText: ok ? extractReplyText(result.stdout) : null,
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    durationMs: result.durationMs,
    error: ok ? null : agentFailureMessage(result, progressEvents),
    progress: {
      eventCount: progressEvents.length,
      latest: latestProgress,
      summary: progressSummary(progressEvents),
    },
    session: {
      resumed: processRequest.sessionMode === "resume",
      codexThreadId,
    },
  };
}
