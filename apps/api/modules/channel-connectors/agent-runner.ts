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
}

export interface ChannelConnectorAgentProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  error: string | null;
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
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function ensureWorkDir(workDir: string): string {
  const normalized = normalizeString(workDir) || process.cwd();
  fs.mkdirSync(normalized, { recursive: true });
  return normalized;
}

function mergeProcessEnv(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== "")),
  };
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

function createCodexGatewayHome(input: {
  gatewayEndpoint: string;
  gatewayClientKey: string;
  model: string | null;
}): { codexHome: string; cleanupRoot: string } {
  const cleanupRoot = fs.mkdtempSync(path.join(os.tmpdir(), "studio-channel-codex-"));
  const codexHome = path.join(cleanupRoot, "codex-home");
  fs.mkdirSync(codexHome, { recursive: true });
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
    `experimental_bearer_token = ${tomlString(input.gatewayClientKey)}`,
    "responses_websockets_v2 = false",
    "",
  ].filter((line) => line !== "").join("\n");
  const configPath = path.join(codexHome, "config.toml");
  fs.writeFileSync(configPath, config, { encoding: "utf8", mode: 0o600 });
  return { codexHome, cleanupRoot };
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
    const codexHome = request.gatewayClientKey
      ? createCodexGatewayHome({
        gatewayEndpoint: request.gatewayEndpoint,
        gatewayClientKey: request.gatewayClientKey,
        model: model || null,
      })
      : null;
    const args = [
      "exec",
      "--skip-git-repo-check",
      ...codexPermissionArgs(project.permissionMode),
      ...(model ? ["--model", model] : []),
      "-c",
      "model_provider=\"studio_gateway\"",
      "-c",
      "responses_websockets=false",
      "-c",
      "responses_websockets_v2=false",
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
        ...(codexHome ? { CODEX_HOME: codexHome.codexHome } : {}),
        OPENAI_BASE_URL: request.gatewayEndpoint,
      },
      timeoutMs,
      cleanupPaths: codexHome ? [codexHome.cleanupRoot] : [],
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
    };
  }

  return null;
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
      });
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      cleanupProcessRequest(request);
      resolve({
        exitCode,
        signal,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        error: timedOut ? "Agent process timed out." : null,
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
    };
  }

  const runner = request.processRunner || defaultChannelConnectorAgentProcessRunner;
  let result: ChannelConnectorAgentProcessResult;
  try {
    result = await runner(processRequest);
  } finally {
    cleanupProcessRequest(processRequest);
  }
  const ok = result.exitCode === 0 && !result.error;
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
    error: result.error || (ok ? null : result.stderr.trim() || `Agent process exited with ${result.exitCode}`),
  };
}
