import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ChannelConnectorAgentId,
  ChannelConnectorInboundAttachment,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoGroupMember,
  ChannelConnectorPermissionMode,
  ChannelConnectorReasoningEffort,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import { extractOctoAttachments, extractOctoContent, isOctoGroupChannel } from "./octo-adapter.js";

export type ChannelConnectorRuntimeProject = ChannelConnectorsDaemonRuntimeConfig["projects"][number];
export type ChannelConnectorRuntimeBinding = ChannelConnectorRuntimeProject["platformBindings"][number];

export interface ChannelConnectorAgentProcessRequest {
  command: string;
  args: string[];
  cwd: string;
  stdin: string;
  env: Record<string, string>;
  timeoutMs: number;
  nativeCommand?: string | null;
  signal?: AbortSignal | null;
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
  cancelled: boolean;
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
  historyContext?: string | null;
  modelCapabilities?: {
    vision?: boolean | null;
  } | null;
  nativeCommand?: string | null;
  onProgress?: (event: ChannelConnectorAgentProgressEvent) => void;
  signal?: AbortSignal | null;
  timeoutMs?: number;
  processRunner?: ChannelConnectorAgentProcessRunner;
}

export interface ChannelConnectorAgentTurnResult {
  attempted: boolean;
  ok: boolean | null;
  status: "completed" | "failed" | "cancelled" | "unsupported-agent" | "empty-message";
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

type ChannelConnectorVisualInputMode = "none" | "codex-native-image";

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

function attachmentSummaryLabel(attachment: ChannelConnectorInboundAttachment): string {
  const name = normalizeString(attachment.fileName);
  const localPath = normalizeString(attachment.localPath);
  const stagingError = normalizeString(attachment.stagingError);
  const duration = typeof attachment.durationMs === "number" && attachment.durationMs > 0
    ? `${Math.round(attachment.durationMs / 1000)}s`
    : "";
  const size = typeof attachment.size === "number" && attachment.size > 0
    ? `${attachment.size} bytes`
    : "";
  const staged = localPath ? `local: ${localPath}` : "";
  const error = stagingError ? `staging failed: ${stagingError}` : "";
  const detail = [name, duration, size, staged, error].filter(Boolean).join(", ");
  return detail ? `${attachment.kind}: ${detail}` : attachment.kind;
}

function isVisualAttachment(attachment: ChannelConnectorInboundAttachment): boolean {
  return attachment.kind === "image" || attachment.kind === "video" || attachment.kind === "sticker";
}

function isCodexNativeImageAttachment(attachment: ChannelConnectorInboundAttachment): boolean {
  if (attachment.kind !== "image" && attachment.kind !== "sticker") return false;
  const mimeType = normalizeString(attachment.mimeType).toLowerCase();
  if (mimeType) return mimeType.startsWith("image/");
  const fileName = normalizeString(attachment.fileName) || normalizeString(attachment.localPath);
  return /\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif)$/i.test(fileName);
}

function collectCodexNativeImagePaths(attachments: ChannelConnectorInboundAttachment[]): string[] {
  const paths: string[] = [];
  const seen = new Set<string>();
  for (const attachment of attachments) {
    if (!isCodexNativeImageAttachment(attachment)) continue;
    const localPath = normalizeString(attachment.localPath);
    if (!localPath || seen.has(localPath)) continue;
    try {
      if (!fs.statSync(localPath).isFile()) continue;
    } catch {
      continue;
    }
    seen.add(localPath);
    paths.push(localPath);
  }
  return paths;
}

function metadataBooleanOverride(metadata: Record<string, unknown> | undefined, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = metadata?.[key];
    if (typeof value === "boolean") return value;
    const normalized = normalizeString(value).toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return null;
}

function channelConnectorModelSupportsVision(
  model: string | null,
  binding: ChannelConnectorRuntimeBinding,
  modelCapabilities?: { vision?: boolean | null } | null,
): boolean {
  const explicit = metadataBooleanOverride(binding.metadata, [
    "modelVision",
    "model_vision",
    "supportsVision",
    "supports_vision",
    "vision",
    "visionEnabled",
    "vision_enabled",
  ]);
  if (explicit !== null) return explicit;
  if (typeof modelCapabilities?.vision === "boolean") return modelCapabilities.vision;

  const normalized = normalizeString(model).toLowerCase();
  if (!normalized) return false;
  if (/(^|[\/:_\-\s])glm-5($|[\/:_\-\s.])/.test(normalized)) return false;

  return [
    /(^|[\/:_\-\s])gpt-4o($|[\/:_\-\s.])/,
    /(^|[\/:_\-\s])gpt-4\.1($|[\/:_\-\s.])/,
    /(^|[\/:_\-\s])gpt-5($|[\/:_\-\s.])/,
    /(^|[\/:_\-\s])o3($|[\/:_\-\s.])/,
    /(^|[\/:_\-\s])o4-mini($|[\/:_\-\s.])/,
    /claude-(3|sonnet|opus|haiku)/,
    /gemini/,
    /qwen.*vl|qwen-vl|vl-/,
    /glm-4v/,
    /vision|multimodal|omni/,
  ].some((pattern) => pattern.test(normalized));
}

function buildNonVisionVisualAttachmentPolicy(
  model: string | null,
  attachments: ChannelConnectorInboundAttachment[],
): string | null {
  const visualCount = attachments.filter(isVisualAttachment).length;
  if (!visualCount) return null;
  const modelLabel = normalizeString(model) || "当前模型";
  const visualLabel = visualCount === 1 ? "图片/视频附件" : `${visualCount} 个图片/视频附件`;
  return [
    "[Studio visual attachment policy]",
    `The user sent ${visualLabel}; the file has been received and staged, but the current model ${modelLabel} is not marked as vision-capable.`,
    "You must not describe, classify, OCR, or infer visual contents from attachment metadata, file names, or local paths.",
    "You may still help with non-visual file tasks such as saving, renaming, forwarding, format conversion, metadata-oriented handling, or asking the user to switch to a vision-capable model / provide a text description.",
    "If the user only sent a visual attachment without a clear non-visual task, reply in Chinese that the file was received and ask what they want to do next.",
  ].join("\n");
}

function buildStudioOutboundFilePolicy(): string {
  return [
    "[Studio outbound file policy]",
    "Do not call channel-specific CLIs, webhooks, curl commands, or external bridge tools to send files back to the IM user.",
    "When the user asks you to send or return files, create them under the current working directory and append one fenced JSON block named studio-channel-files.",
    "Preserve the original file name in the name field unless the user explicitly asks for a new name.",
    "Example:",
    "```studio-channel-files",
    "[{\"path\":\"relative/path/to/file.ext\",\"name\":\"optional-display-name.ext\",\"caption\":\"optional short caption\"}]",
    "```",
    "Keep the human-readable reply outside that block; Studio daemon will upload and send the declared files through the active IM channel.",
  ].join("\n");
}

function memberSummaryLabel(member: ChannelConnectorOctoGroupMember): string {
  const uid = normalizeString(member.uid);
  const name = normalizeString(member.name);
  if (uid && name) return `${name}(${uid})`;
  return name || uid;
}

function buildGroupContext(
  message: ChannelConnectorOctoInboundMessage,
  binding: ChannelConnectorRuntimeBinding,
): string | null {
  if (!isOctoGroupChannel(message.channelType)) return null;
  const mention = message.payload?.mention || null;
  const mentionUids = Array.isArray(mention?.uids)
    ? (mention?.uids || []).map(normalizeString).filter(Boolean)
    : [];
  const replyMessageId = normalizeString(message.payload?.reply?.messageId)
    || normalizeString(message.payload?.reply?.message_id);
  const members = (message.members || []).map(memberSummaryLabel).filter(Boolean);
  const memberLimit = 20;
  const visibleMembers = members.slice(0, memberLimit);
  const hiddenMemberCount = Math.max(0, members.length - visibleMembers.length);
  const lines = [
    "[Studio group context]",
    `Channel: ${normalizeString(message.channelId) || "unknown"} (type ${message.channelType})`,
    `Sender: ${normalizeString(message.fromUid) || "unknown"}`,
  ];
  const botId = normalizeString(binding.botId);
  if (botId) lines.push(`Bot: ${botId}`);
  if (mention?.all && mention.all > 0) {
    lines.push("Mention: @all");
  } else if (mentionUids.length) {
    lines.push(`Mentioned users: ${mentionUids.join(", ")}`);
  }
  if (replyMessageId) lines.push(`Reply to message: ${replyMessageId}`);
  if (visibleMembers.length) {
    lines.push(`Known members: ${visibleMembers.join(", ")}${hiddenMemberCount ? `, +${hiddenMemberCount} more` : ""}`);
  }
  lines.push("Use this only to understand the current IM group context.");
  return lines.join("\n");
}

function buildAgentInputContent(
  message: ChannelConnectorOctoInboundMessage,
  binding: ChannelConnectorRuntimeBinding,
  model?: string | null,
  historyContext?: string | null,
  modelCapabilities?: { vision?: boolean | null } | null,
  visualInputMode: ChannelConnectorVisualInputMode = "none",
): string {
  const content = extractOctoContent(message);
  const attachments = extractOctoAttachments(message);
  const history = normalizeString(historyContext);
  const groupContext = buildGroupContext(message, binding);
  const outboundFilePolicy = buildStudioOutboundFilePolicy();
  if (!attachments.length) return [history, groupContext, content, outboundFilePolicy].filter(Boolean).join("\n\n");
  const summary = attachments
    .map((attachment) => `- ${attachmentSummaryLabel(attachment)}`)
    .join("\n");
  const hasLocalPath = attachments.some((attachment) => normalizeString(attachment.localPath));
  const hasVisualAttachment = attachments.some(isVisualAttachment);
  const visualPolicy = hasVisualAttachment && !channelConnectorModelSupportsVision(model || null, binding, modelCapabilities)
    ? buildNonVisionVisualAttachmentPolicy(model || null, attachments)
    : null;
  const visualInputText = hasVisualAttachment && visualInputMode === "codex-native-image"
    ? "Vision-capable Codex runtime received staged image attachments through native --image arguments; inspect those attached images for visual tasks."
    : "";
  const attachmentText = [
    "[Studio attachment summary]",
    summary,
    hasLocalPath
      ? "Staged files are available locally; use the local paths above when the task needs file contents."
      : "Binary download/staging is not enabled yet; use the metadata above only.",
    hasVisualAttachment
      ? "Do not infer visual contents from attachment metadata, file names, or local paths; only describe images/videos if the active Agent runtime can actually inspect the file."
      : "",
    visualInputText,
  ].filter(Boolean).join("\n");
  return [history, groupContext, visualPolicy, content, attachmentText, outboundFilePolicy].filter(Boolean).join("\n\n");
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringifyProgressValue(value: unknown, maxLength = 240): string {
  if (typeof value === "string") return truncateText(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || value === undefined) return "";
  try {
    return truncateText(JSON.stringify(value), maxLength);
  } catch {
    return "";
  }
}

function errorMessageFromValue(value: unknown): string {
  const record = recordValue(value);
  const error = recordValue(record?.error) || record;
  const message = normalizeString(error?.message)
    || normalizeString(record?.message)
    || normalizeString(error?.error)
    || normalizeString(record?.error);
  const type = normalizeString(error?.type) || normalizeString(record?.type);
  const code = normalizeString(error?.code) || normalizeString(record?.code);
  const detail = [
    type ? `type=${type}` : "",
    code ? `code=${code}` : "",
  ].filter(Boolean).join(", ");
  if (message && detail) return `${message} (${detail})`;
  if (message) return message;
  if (detail) return detail;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed !== value) return errorMessageFromValue(parsed);
    } catch {
      return value;
    }
  }
  return "";
}

function toolLikeItemType(itemType: string | null): boolean {
  const lowered = (itemType || "").toLowerCase();
  return [
    "tool",
    "function",
    "command_execution",
    "command",
    "web_search",
    "mcp",
  ].some((needle) => lowered.includes(needle));
}

function codexToolProgressText(item: Record<string, unknown> | null, itemType: string | null, rawType: string): string {
  if (!item) return itemType || "tool";
  const name = normalizeString(item.name)
    || normalizeString(item.tool_name)
    || normalizeString(item.call_id)
    || itemType
    || "tool";
  const command = normalizeString(item.command)
    || normalizeString(item.cmd)
    || stringifyProgressValue(item.arguments)
    || stringifyProgressValue(item.input);
  const status = normalizeString(item.status);
  const exitCode = Number(item.exit_code ?? item.exitCode);
  const output = normalizeString(item.output)
    || normalizeString(item.aggregated_output)
    || normalizeString(item.result)
    || normalizeString(item.stderr)
    || normalizeString(item.stdout);
  const parts = [
    rawType.endsWith(".started") ? `${name} started` : `${name} completed`,
    command,
    Number.isFinite(exitCode) ? `exit=${exitCode}` : status,
    output,
  ].filter(Boolean);
  return parts.join("\n");
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
  reasoningEffort?: string | null;
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
    input.reasoningEffort ? `model_reasoning_effort = ${tomlString(input.reasoningEffort)}` : "",
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

function normalizeReasoningEffort(value: unknown): ChannelConnectorReasoningEffort | null {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high" || normalized === "xhigh") {
    return normalized;
  }
  return null;
}

function cliReasoningEffort(value: unknown, agent: ChannelConnectorAgentId): string | null {
  const effort = normalizeReasoningEffort(value);
  if (!effort) return null;
  if ((agent === "claude-code" || agent === "opencode") && effort === "xhigh") return "max";
  return effort;
}

function codexNativeCommandArgs(command: string): string[] | null {
  const normalized = normalizeString(command);
  if (!normalized) return null;
  const parts = normalized.split(/\s+/).filter(Boolean);
  const head = normalizeString(parts[0]).replace(/^\/+/, "").toLowerCase();
  const rest = parts.slice(1);
  if (head === "help" || head === "h" || head === "--help" || head === "-h") {
    const topic = normalizeString(rest[0]).replace(/^\/+/, "").toLowerCase();
    if (topic === "exec") return ["exec", "--help"];
    if (topic === "resume") return ["exec", "resume", "--help"];
    return ["--help"];
  }
  if (head === "version" || head === "v" || head === "--version" || head === "-v" || head === "-V") {
    return ["--version"];
  }
  return null;
}

function unsupportedNativeCommandMessage(agent: ChannelConnectorAgentId, command: string): string | null {
  const normalized = normalizeString(command);
  if (!normalized) return null;
  if (agent !== "codex") return null;
  if (codexNativeCommandArgs(normalized)) return null;
  return [
    `Codex native command ${normalized} is not supported through the non-interactive exec runner.`,
    "Supported Codex native commands for now: /help, /help exec, /version.",
    "Codex interactive slash commands such as /compact or /clear require a persistent Codex session/compact contract and must not be sent as ordinary model text.",
  ].join(" ");
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
  const project = request.project;
  const model = normalizeString(project.model);
  const nativeCommand = normalizeString(request.nativeCommand);
  const attachments = nativeCommand ? [] : extractOctoAttachments(request.message);
  const codexNativeImagePaths = project.agent === "codex"
    && channelConnectorModelSupportsVision(model || null, request.binding, request.modelCapabilities)
    ? collectCodexNativeImagePaths(attachments)
    : [];
  const content = nativeCommand || buildAgentInputContent(
    request.message,
    request.binding,
    project.model,
    request.historyContext,
    request.modelCapabilities,
    codexNativeImagePaths.length ? "codex-native-image" : "none",
  );
  if (!content) return null;
  const cwd = ensureWorkDir(project.workDir);
  const timeoutMs = request.timeoutMs || 10 * 60_000;
  const baseEnv = gatewayEnv(request.gatewayEndpoint, request.gatewayClientKey);
  const reasoningEffort = cliReasoningEffort(project.reasoningEffort, project.agent);

  if (project.agent === "codex") {
    const nativeArgs = nativeCommand ? codexNativeCommandArgs(nativeCommand) : null;
    if (nativeCommand && nativeArgs) {
      return {
        command: "codex",
        args: nativeArgs,
        cwd,
        stdin: "",
        env: baseEnv,
        timeoutMs,
        nativeCommand,
        sessionMode: "new",
        codexThreadId: request.session?.codexThreadId || null,
        agent: project.agent,
      };
    }

    const codexThreadId = normalizeString(request.session?.codexThreadId);
    const codexHome = createCodexGatewayHome({
      gatewayEndpoint: request.gatewayEndpoint,
      gatewayClientKey: request.gatewayClientKey,
      model: model || null,
      agentRuntimeDir: request.agentRuntimeDir,
      reasoningEffort,
    });
    const codexConfigArgs = [
      "-c",
      "model_provider=\"studio_gateway\"",
      "-c",
      "responses_websockets=false",
      "-c",
      "responses_websockets_v2=false",
      ...(reasoningEffort ? ["-c", `model_reasoning_effort=${tomlString(reasoningEffort)}`] : []),
    ];
    const codexImageArgs = codexNativeImagePaths.flatMap((imagePath) => ["--image", imagePath]);
    const args = codexThreadId
      ? [
        "exec",
        "resume",
        "--skip-git-repo-check",
        ...codexPermissionArgs(project.permissionMode),
        ...(model ? ["--model", model] : []),
        ...codexImageArgs,
        ...codexConfigArgs,
        codexThreadId,
        "--json",
        "-",
      ]
      : [
        "exec",
        "--skip-git-repo-check",
        ...codexPermissionArgs(project.permissionMode),
        ...(model ? ["--model", model] : []),
        ...codexImageArgs,
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
      nativeCommand: nativeCommand || null,
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
      ...(reasoningEffort ? ["--effort", reasoningEffort] : []),
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
      nativeCommand: nativeCommand || null,
      agent: project.agent,
    };
  }

  if (project.agent === "opencode") {
    const args = [
      "run",
      "--format",
      "json",
      ...(model ? ["--model", model] : []),
      ...(reasoningEffort ? ["--variant", reasoningEffort] : []),
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
      nativeCommand: nativeCommand || null,
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
    const text = errorMessageFromValue(raw.error) || errorMessageFromValue(raw) || "Codex turn failed";
    return progressEvent({ type: "failed", rawType, text });
  }
  if (rawType === "error") {
    return progressEvent({ type: "error", rawType, text: errorMessageFromValue(raw) || "Codex error" });
  }
  if (rawType === "item.started" || rawType === "item.completed") {
    const item = recordValue(raw.item);
    const itemType = normalizeString(item?.type) || null;
    if (itemType === "reasoning") return progressEvent({ type: "reasoning", rawType, itemType, text: normalizeString(item?.text) || null });
    if (itemType === "agent_message") return progressEvent({ type: "assistant", rawType, itemType, text: normalizeString(item?.text) || null });
    if (toolLikeItemType(itemType)) {
      return progressEvent({ type: "tool", rawType, itemType, text: codexToolProgressText(item, itemType, rawType) });
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
    if (request.signal?.aborted) {
      cleanupProcessRequest(request);
      resolve({
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: "",
        durationMs: Date.now() - startedAt,
        timedOut: false,
        cancelled: true,
        error: "Agent process cancelled.",
        progressEvents: [],
      });
      return;
    }
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
    let cancelled = false;
    const terminateChild = (): void => {
      child.kill("SIGTERM");
      setTimeout(() => {
        if (!settled) child.kill("SIGKILL");
      }, 2000).unref();
    };
    const abortListener = (): void => {
      if (settled) return;
      cancelled = true;
      terminateChild();
    };
    request.signal?.addEventListener("abort", abortListener, { once: true });
    const timeout = setTimeout(() => {
      timedOut = true;
      terminateChild();
    }, request.timeoutMs);
    const settle = (): void => {
      settled = true;
      clearTimeout(timeout);
      request.signal?.removeEventListener("abort", abortListener);
    };

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
      settle();
      cleanupProcessRequest(request);
      resolve({
        exitCode: null,
        signal: null,
        stdout,
        stderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        cancelled,
        error: error.message,
        progressEvents,
      });
    });
    child.on("close", (exitCode, signal) => {
      if (settled) return;
      settle();
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
        cancelled,
        error: cancelled
          ? "Agent process cancelled."
          : timedOut ? "Agent process timed out." : null,
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
  const nativeCommand = normalizeString(request.nativeCommand);
  const content = nativeCommand || extractOctoContent(request.message);
  const attachments = nativeCommand ? [] : extractOctoAttachments(request.message);
  if (!content && !attachments.length) {
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
  const unsupportedNativeCommand = unsupportedNativeCommandMessage(request.project.agent, nativeCommand);
  if (unsupportedNativeCommand) {
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
      error: unsupportedNativeCommand,
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
  if (request.project.agent === "codex" && !nativeCommand && !normalizeString(request.gatewayClientKey)) {
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
  processRequest.signal = request.signal || null;
  let result: ChannelConnectorAgentProcessResult;
  try {
    result = await runner(processRequest);
  } finally {
    cleanupProcessRequest(processRequest);
  }
  const cancelled = result.cancelled === true;
  const ok = result.exitCode === 0 && !result.error && !cancelled;
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
    status: cancelled ? "cancelled" : ok ? "completed" : "failed",
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
