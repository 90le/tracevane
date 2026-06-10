import { spawn, spawnSync } from "node:child_process";
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
  agentNativeSessionId?: string | null;
  codexThreadId?: string | null;
  agent: ChannelConnectorAgentId;
  permissionMode?: ChannelConnectorPermissionMode | null;
  onProgress?: (event: ChannelConnectorAgentProgressEvent) => void;
  resolvePermission?: (request: ChannelConnectorAgentPermissionRequest) => Promise<ChannelConnectorAgentPermissionDecision>;
}

export interface ChannelConnectorAgentProgressEvent {
  checkedAt: string;
  type: "session" | "running" | "reasoning" | "assistant" | "tool" | "completed" | "failed" | "error" | "event";
  rawType: string | null;
  itemType: string | null;
  text: string | null;
}

export interface ChannelConnectorAgentPermissionRequest {
  requestId: string;
  subtype: string;
  toolName: string;
  input: Record<string, unknown>;
}

export type ChannelConnectorAgentPermissionDecision =
  | { behavior: "allow"; updatedInput?: Record<string, unknown> | null }
  | { behavior: "deny"; message?: string | null };

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
    agentNativeSessionId?: string | null;
    codexThreadId?: string | null;
  } | null;
  historyContext?: string | null;
  modelCapabilities?: {
    vision?: boolean | null;
  } | null;
  nativeCommand?: string | null;
  allowNativeCompact?: boolean;
  onProgress?: (event: ChannelConnectorAgentProgressEvent) => void;
  resolvePermission?: (request: ChannelConnectorAgentPermissionRequest) => Promise<ChannelConnectorAgentPermissionDecision>;
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
    agentNativeSessionId: string | null;
    codexThreadId: string | null;
  };
}

type ChannelConnectorVisualInputMode = "none" | "codex-native-image" | "claude-native-image";

type ClaudeCodeContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

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

export function truncateProgressText(value: string, maxLength = 1200): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 1)}...` : value;
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

function isNativeImageAttachment(attachment: ChannelConnectorInboundAttachment): boolean {
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
    if (!isNativeImageAttachment(attachment)) continue;
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

function inferImageMimeType(filePath: string, mimeType?: string | null): string {
  const normalizedMime = normalizeString(mimeType).toLowerCase();
  if (normalizedMime.startsWith("image/")) return normalizedMime;
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".bmp":
      return "image/bmp";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "image/png";
  }
}

function collectClaudeNativeImageParts(attachments: ChannelConnectorInboundAttachment[]): ClaudeCodeContentPart[] {
  const parts: ClaudeCodeContentPart[] = [];
  const seen = new Set<string>();
  for (const attachment of attachments) {
    if (!isNativeImageAttachment(attachment)) continue;
    const localPath = normalizeString(attachment.localPath);
    if (!localPath || seen.has(localPath)) continue;
    try {
      if (!fs.statSync(localPath).isFile()) continue;
      const data = fs.readFileSync(localPath).toString("base64");
      seen.add(localPath);
      parts.push({
        type: "image",
        source: {
          type: "base64",
          media_type: inferImageMimeType(localPath, attachment.mimeType),
          data,
        },
      });
    } catch {
      // Attachment summaries still include staging errors/paths; unreadable files stay as text context.
    }
  }
  return parts;
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
    "When the user asks you to send or return files, create them under the current working directory or declare the exact readable path you just used; do not invent relative paths from memory.",
    "If an existing file is outside the current working directory and the current permission mode may block direct sending, copy or generate the requested file under the current working directory before declaring it.",
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
    : hasVisualAttachment && visualInputMode === "claude-native-image"
      ? "Vision-capable Claude Code runtime received staged image attachments through native image content blocks; inspect those attached images for visual tasks."
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

export function progressTextValue(value: unknown, maxLength = 1200): string {
  if (typeof value === "string") return truncateProgressText(value, maxLength);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value === null || typeof value === "undefined") return "";
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => progressTextValue(item, maxLength))
      .filter((item) => item.trim());
    return parts.join("\n");
  }
  const record = recordValue(value);
  if (record) {
    const direct = progressTextValue(record.text, maxLength)
      || progressTextValue(record.content, maxLength)
      || progressTextValue(record.output_text, maxLength)
      || progressTextValue(record.output, maxLength)
      || progressTextValue(record.result, maxLength)
      || progressTextValue(record.stdout, maxLength)
      || progressTextValue(record.stderr, maxLength)
      || progressTextValue(record.message, maxLength);
    if (direct) return truncateProgressText(direct, maxLength);
    const message = recordValue(record.message);
    const nestedMessage = progressTextValue(message?.content, maxLength);
    if (nestedMessage) return nestedMessage;
    const nestedContent = progressTextValue(record.content, maxLength);
    if (nestedContent) return nestedContent;
  }
  try {
    return truncateProgressText(JSON.stringify(value, null, 2), maxLength);
  } catch {
    return "";
  }
}

export function firstProgressTextValue(...values: unknown[]): string {
  for (const value of values) {
    const text = progressTextValue(value);
    if (text) return text;
  }
  return "";
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

export function codexToolProgressText(item: Record<string, unknown> | null, itemType: string | null, rawType: string): string {
  if (!item) return itemType || "tool";
  const name = normalizeString(item.name)
    || normalizeString(item.tool_name)
    || normalizeString(item.toolName)
    || normalizeString(item.call_id)
    || normalizeString(item.callId)
    || itemType
    || "tool";
  const command = normalizeString(item.command)
    || normalizeString(item.cmd)
    || stringifyProgressValue(item.arguments)
    || stringifyProgressValue(item.input);
  const status = normalizeString(item.status);
  const exitCode = Number(item.exit_code ?? item.exitCode);
  const output = firstProgressTextValue(
    item.output,
    item.aggregated_output,
    item.aggregatedOutput,
    item.formatted_output,
    item.formattedOutput,
    item.display_output,
    item.displayOutput,
    item.result,
    item.outputs,
    item.content,
    item.text,
    item.stdout,
    item.stderr,
    item.error,
  );
  const parts = [
    rawType.endsWith(".started") ? `${name} started` : `${name} completed`,
    command ? `command=${command}` : "",
    Number.isFinite(exitCode) ? `exit=${exitCode}` : status,
    output ? `output:\n${output}` : "",
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

function nativeCompactCommand(command: string): boolean {
  const normalized = normalizeString(command);
  if (!normalized) return false;
  const head = normalizeString(normalized.split(/\s+/)[0]).replace(/^\/+/, "").toLowerCase();
  return head === "compact" || head === "compress";
}

function unsupportedNativeCommandMessage(agent: ChannelConnectorAgentId, command: string, allowNativeCompact = false): string | null {
  const normalized = normalizeString(command);
  if (!normalized) return null;
  if (nativeCompactCommand(normalized) && agent !== "codex") {
    if (allowNativeCompact && (agent === "claude-code" || agent === "opencode")) return null;
    return [
      `${agent} native compact is not supported through the Studio one-shot runner yet.`,
      "CC Go sends /compact only into a live interactive Agent session.",
      "Use /compact for native-first with Studio Gateway fallback until the matching persistent driver is available.",
    ].join(" ");
  }
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

function buildClaudeCodeStdin(content: string, imageParts: ClaudeCodeContentPart[]): string {
  const messageContent: string | ClaudeCodeContentPart[] = imageParts.length
    ? [...imageParts, { type: "text", text: content }]
    : content;
  return `${JSON.stringify({
    type: "user",
    message: {
      role: "user",
      content: messageContent,
    },
  })}\n`;
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
  const claudeNativeImageParts = project.agent === "claude-code"
    && channelConnectorModelSupportsVision(model || null, request.binding, request.modelCapabilities)
    ? collectClaudeNativeImageParts(attachments)
    : [];
  const content = nativeCommand || buildAgentInputContent(
    request.message,
    request.binding,
    project.model,
    request.historyContext,
    request.modelCapabilities,
    codexNativeImagePaths.length ? "codex-native-image"
      : claudeNativeImageParts.length ? "claude-native-image"
        : "none",
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
        agentNativeSessionId: request.session?.agentNativeSessionId || request.session?.codexThreadId || null,
        codexThreadId: request.session?.codexThreadId || null,
        agent: project.agent,
        permissionMode: project.permissionMode,
        resolvePermission: request.resolvePermission,
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
        ...codexConfigArgs,
        codexThreadId,
        ...codexImageArgs,
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
      agentNativeSessionId: codexThreadId || null,
      codexThreadId: codexThreadId || null,
      agent: project.agent,
      permissionMode: project.permissionMode,
      resolvePermission: request.resolvePermission,
    };
  }

  if (project.agent === "claude-code") {
    const permissionMode = claudePermissionMode(project.permissionMode);
    const claudeSessionId = normalizeString(request.session?.agentNativeSessionId);
    const args = [
      "--output-format",
      "stream-json",
      "--input-format",
      "stream-json",
      "--permission-prompt-tool",
      "stdio",
      "--verbose",
      ...(permissionMode ? ["--permission-mode", permissionMode] : []),
      ...(claudeSessionId ? ["--resume", claudeSessionId] : []),
      ...(reasoningEffort ? ["--effort", reasoningEffort] : []),
      ...(model ? ["--model", model] : []),
    ];
    return {
      command: "claude",
      args,
      cwd,
      stdin: buildClaudeCodeStdin(content, claudeNativeImageParts),
      env: {
        ...baseEnv,
        ANTHROPIC_BASE_URL: request.gatewayEndpoint.replace(/\/v1\/?$/, ""),
      },
      timeoutMs,
      nativeCommand: nativeCommand || null,
      sessionMode: claudeSessionId ? "resume" : "new",
      agentNativeSessionId: claudeSessionId || null,
      agent: project.agent,
      permissionMode: project.permissionMode,
      resolvePermission: request.resolvePermission,
    };
  }

  if (project.agent === "opencode") {
    const opencodeSessionId = normalizeString(request.session?.agentNativeSessionId);
    const args = [
      "run",
      "--format",
      "json",
      ...(opencodeSessionId ? ["--session", opencodeSessionId] : []),
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
      sessionMode: opencodeSessionId ? "resume" : "new",
      agentNativeSessionId: opencodeSessionId || null,
      agent: project.agent,
      permissionMode: project.permissionMode,
      resolvePermission: request.resolvePermission,
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
    text: input.text ? truncateProgressText(input.text) : null,
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
    if (itemType === "user_message" || itemType === "userMessage") return null;
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
  const part = recordValue(raw.part);
  const state = recordValue(part?.state);
  const text = normalizeString(raw.text)
    || normalizeString(raw.content)
    || normalizeString(part?.text)
    || normalizeString(part?.content)
    || normalizeString(state?.output)
    || normalizeString(state?.title)
    || normalizeString(state?.input)
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
  return progressEvent({ type, rawType, itemType: normalizeString(item?.type) || normalizeString(part?.type) || null, text });
}

function claudeContentItems(raw: Record<string, unknown>): Record<string, unknown>[] {
  const message = recordValue(raw.message);
  const content = message?.content;
  if (!Array.isArray(content)) return [];
  return content.map(recordValue).filter((item): item is Record<string, unknown> => Boolean(item));
}

function claudeToolProgressText(item: Record<string, unknown>, label = "tool"): string {
  const name = normalizeString(item.name)
    || normalizeString(item.tool_name)
    || normalizeString(item.toolName)
    || label;
  const input = firstProgressTextValue(item.input, item.content, item.text, item.result);
  return [name, input ? `input:\n${input}` : ""].filter(Boolean).join("\n");
}

function isClaudeEditTool(toolName: string): boolean {
  return ["Edit", "Write", "NotebookEdit", "MultiEdit"].includes(toolName);
}

function parseClaudeControlToolRequest(line: string): ChannelConnectorAgentPermissionRequest | null {
  const raw = recordValue(JSON.parse(line));
  if (!raw || normalizeString(raw.type) !== "control_request") return null;
  const request = recordValue(raw.request);
  const requestId = normalizeString(raw.request_id) || normalizeString(request?.request_id);
  const subtype = normalizeString(request?.subtype);
  if (!requestId || subtype !== "can_use_tool") return null;
  return {
    requestId,
    subtype,
    toolName: normalizeString(request?.tool_name),
    input: recordValue(request?.input) || {},
  };
}

function claudeAutomaticPermissionDecision(
  mode: ChannelConnectorPermissionMode | null | undefined,
  request: ChannelConnectorAgentPermissionRequest,
): ChannelConnectorAgentPermissionDecision | null {
  if (request.toolName === "AskUserQuestion") return null;
  if (mode === "yolo" || mode === "full-auto") {
    return { behavior: "allow", updatedInput: request.input };
  }
  if (mode === "auto-edit" && isClaudeEditTool(request.toolName)) {
    return { behavior: "allow", updatedInput: request.input };
  }
  if (mode === "read-only") {
    return { behavior: "deny", message: "Permission mode is read-only; Studio denied this Claude tool use." };
  }
  if (mode === "auto-edit") {
    return { behavior: "deny", message: "Permission mode is auto-edit; Studio only auto-allows Claude edit tools." };
  }
  return null;
}

function claudeFallbackPermissionDecision(): ChannelConnectorAgentPermissionDecision {
  return {
    behavior: "deny",
    message: "Interactive Claude tool approval is not available in this Studio runner yet. Switch to yolo/full-auto or retry with an edit-only tool.",
  };
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

function isClaudeResultLine(line: string): boolean {
  try {
    const raw = recordValue(JSON.parse(line));
    return normalizeString(raw?.type) === "result";
  } catch {
    return false;
  }
}

function parseClaudeProgressLineEvents(line: string): ChannelConnectorAgentProgressEvent[] {
  const raw = recordValue(JSON.parse(line));
  if (!raw) return [];
  const rawType = normalizeString(raw.type) || null;
  if (!rawType) return [];

  if (rawType === "system") {
    const sessionId = normalizeString(raw.session_id);
    return sessionId ? [progressEvent({ type: "session", rawType, text: sessionId })] : [];
  }

  if (rawType === "assistant") {
    const events: ChannelConnectorAgentProgressEvent[] = [];
    for (const item of claudeContentItems(raw)) {
      const itemType = normalizeString(item.type) || null;
      if (itemType === "tool_use") {
        const toolName = normalizeString(item.name);
        if (toolName === "AskUserQuestion") continue;
        events.push(progressEvent({
          type: "tool",
          rawType,
          itemType,
          text: claudeToolProgressText(item),
        }));
      } else if (itemType === "thinking") {
        const thinking = normalizeString(item.thinking) || progressTextValue(item);
        if (thinking) events.push(progressEvent({ type: "reasoning", rawType, itemType, text: thinking }));
      } else if (itemType === "text") {
        const text = normalizeString(item.text);
        if (text) events.push(progressEvent({ type: "assistant", rawType, itemType, text }));
      }
    }
    const message = recordValue(raw.message);
    const content = normalizeString(message?.content);
    if (!events.length && content) {
      events.push(progressEvent({ type: "assistant", rawType, itemType: null, text: content }));
    }
    return events;
  }

  if (rawType === "user") {
    const events: ChannelConnectorAgentProgressEvent[] = [];
    for (const item of claudeContentItems(raw)) {
      const itemType = normalizeString(item.type) || null;
      if (itemType !== "tool_result") continue;
      const isError = item.is_error === true;
      const text = firstProgressTextValue(item.content, item.text, item.result);
      if (!text && !isError) continue;
      events.push(progressEvent({
        type: isError ? "error" : "tool",
        rawType,
        itemType,
        text: text || "Claude tool result reported an error.",
      }));
    }
    return events;
  }

  if (rawType === "result") {
    const isError = raw.is_error === true || normalizeString(raw.subtype).toLowerCase() === "error";
    const text = firstProgressTextValue(raw.result, raw.error, raw.message);
    return [progressEvent({
      type: isError ? "failed" : "completed",
      rawType,
      text: text || (isError ? "Claude Code turn failed" : "Claude Code turn completed"),
    })];
  }

  if (rawType === "control_request") {
    const request = recordValue(raw.request);
    const subtype = normalizeString(request?.subtype);
    const toolName = normalizeString(request?.tool_name);
    const text = [subtype || "control_request", toolName].filter(Boolean).join(": ");
    return [progressEvent({ type: "tool", rawType, text })];
  }

  return [parseGenericProgressLine(line)].filter((event): event is ChannelConnectorAgentProgressEvent => Boolean(event));
}

function parseProgressLineEvents(agent: ChannelConnectorAgentId, line: string): ChannelConnectorAgentProgressEvent[] {
  const trimmed = line.trim();
  if (!trimmed || !trimmed.startsWith("{")) return [];
  try {
    if (agent === "codex") {
      const event = parseCodexProgressLine(trimmed);
      return event ? [event] : [];
    }
    if (agent === "claude-code") return parseClaudeProgressLineEvents(trimmed);
    const event = parseGenericProgressLine(trimmed);
    return event ? [event] : [];
  } catch {
    return [];
  }
}

function collectProgressEvents(stdout: string, agent: ChannelConnectorAgentId): ChannelConnectorAgentProgressEvent[] {
  const events: ChannelConnectorAgentProgressEvent[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    events.push(...parseProgressLineEvents(agent, line));
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
    const isClaudeCode = request.agent === "claude-code";
    let stdout = "";
    let stderr = "";
    let stdoutLineBuffer = "";
    const progressEvents: ChannelConnectorAgentProgressEvent[] = [];
    let settled = false;
    let timedOut = false;
    let cancelled = false;
    let stdinClosed = false;
    const closeStdin = (): void => {
      if (stdinClosed || child.stdin.destroyed) return;
      stdinClosed = true;
      child.stdin.end();
    };
    const writeStdinLine = (line: string): void => {
      if (stdinClosed || child.stdin.destroyed) return;
      try {
        child.stdin.write(line);
      } catch (error) {
        stderr += `\nstdin write failed: ${error instanceof Error ? error.message : String(error)}`;
      }
    };
    const handleClaudeCodeLine = async (line: string): Promise<void> => {
      try {
        const controlRequest = parseClaudeControlToolRequest(line);
        if (controlRequest) {
          const decision = claudeAutomaticPermissionDecision(request.permissionMode, controlRequest)
            || (request.resolvePermission
              ? await request.resolvePermission(controlRequest)
              : claudeFallbackPermissionDecision());
          writeStdinLine(claudeControlResponseLine(controlRequest.requestId, decision));
        }
      } catch (error) {
        stderr += `\nClaude control request handling failed: ${error instanceof Error ? error.message : String(error)}`;
      }
      if (isClaudeResultLine(line)) closeStdin();
    };
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
    child.stdin.on("error", (error) => {
      stderr += `\nstdin error: ${error.message}`;
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      stdoutLineBuffer += chunk;
      const lines = stdoutLineBuffer.split(/\r?\n/);
      stdoutLineBuffer = lines.pop() || "";
      for (const line of lines) {
        for (const event of parseProgressLineEvents(request.agent, line)) {
          progressEvents.push(event);
          request.onProgress?.(event);
        }
        if (isClaudeCode) void handleClaudeCodeLine(line);
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
      for (const trailingEvent of parseProgressLineEvents(request.agent, stdoutLineBuffer)) {
        progressEvents.push(trailingEvent);
        request.onProgress?.(trailingEvent);
      }
      if (isClaudeCode && stdoutLineBuffer) void handleClaudeCodeLine(stdoutLineBuffer);
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
    if (request.stdin) writeStdinLine(request.stdin);
    if (!isClaudeCode || !request.stdin) closeStdin();
  });
}

interface JsonLineReplyText {
  kind: "assistant" | "message" | "result" | "content";
  text: string;
  messageId: string | null;
  timestamp: number | null;
}

function appendJsonLineReplyText(
  output: JsonLineReplyText[],
  kind: JsonLineReplyText["kind"],
  value: unknown,
  meta: { messageId?: string | null; timestamp?: number | null } = {},
): void {
  if (typeof value === "string" && value) {
    output.push({
      kind,
      text: value,
      messageId: normalizeString(meta.messageId) || null,
      timestamp: Number.isFinite(Number(meta.timestamp)) ? Number(meta.timestamp) : null,
    });
  }
}

function appendJsonLineContentParts(
  output: JsonLineReplyText[],
  kind: JsonLineReplyText["kind"],
  value: unknown,
  meta: { messageId?: string | null; timestamp?: number | null } = {},
): void {
  if (typeof value === "string") {
    appendJsonLineReplyText(output, kind, value, meta);
    return;
  }
  if (!Array.isArray(value)) return;
  for (const part of value) {
    if (typeof part === "object" && part !== null && typeof (part as Record<string, unknown>).text === "string") {
      appendJsonLineReplyText(output, kind, (part as Record<string, unknown>).text, meta);
    }
  }
}

function jsonLineMessageId(raw: Record<string, unknown>, part: Record<string, unknown> | null = null): string | null {
  return normalizeString(raw.messageID)
    || normalizeString(raw.message_id)
    || normalizeString(raw.messageId)
    || normalizeString(part?.messageID)
    || normalizeString(part?.message_id)
    || normalizeString(part?.messageId)
    || null;
}

function jsonLineTimestamp(raw: Record<string, unknown>, part: Record<string, unknown> | null = null): number | null {
  const partTime = recordValue(part?.time);
  const candidates = [
    raw.timestamp,
    raw.time,
    partTime?.end,
    partTime?.start,
    part?.timestamp,
  ];
  for (const candidate of candidates) {
    const value = Number(candidate);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function collectJsonLineText(stdout: string): JsonLineReplyText[] {
  const output: JsonLineReplyText[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      const message = raw.message;
      const rawMessageId = jsonLineMessageId(raw);
      const rawTimestamp = jsonLineTimestamp(raw);
      if (typeof message === "object" && message !== null) {
        const messageRecord = message as Record<string, unknown>;
        appendJsonLineContentParts(output, "message", messageRecord.content, {
          messageId: rawMessageId || jsonLineMessageId(messageRecord),
          timestamp: rawTimestamp || jsonLineTimestamp(messageRecord),
        });
      }
      const item = raw.item;
      if (typeof item === "object" && item !== null) {
        const itemRecord = item as Record<string, unknown>;
        if (itemRecord.type === "agent_message") {
          const meta = {
            messageId: rawMessageId || jsonLineMessageId(itemRecord),
            timestamp: rawTimestamp || jsonLineTimestamp(itemRecord),
          };
          appendJsonLineReplyText(output, "assistant", itemRecord.text, meta);
          appendJsonLineContentParts(output, "assistant", itemRecord.content, meta);
        }
      }
      const part = raw.part;
      if (typeof part === "object" && part !== null) {
        const partRecord = part as Record<string, unknown>;
        if (raw.type === "text" || partRecord.type === "text") {
          appendJsonLineReplyText(output, "assistant", partRecord.text, {
            messageId: rawMessageId || jsonLineMessageId(raw, partRecord),
            timestamp: rawTimestamp || jsonLineTimestamp(raw, partRecord),
          });
        }
      }
      appendJsonLineReplyText(output, "content", raw.content, { messageId: rawMessageId, timestamp: rawTimestamp });
      appendJsonLineReplyText(output, "content", raw.text, { messageId: rawMessageId, timestamp: rawTimestamp });
      appendJsonLineReplyText(output, "result", raw.result, { messageId: rawMessageId, timestamp: rawTimestamp });
    } catch {
      // Non-event lines are intentionally ignored; the raw stdout is still retained in the result.
    }
  }
  return output;
}

function joinJsonReplyTextParts(parts: string[]): string {
  let output = "";
  for (const part of parts) {
    if (!part) continue;
    const startsWithFence = part.trimStart().startsWith("```");
    if (output && startsWithFence && !output.endsWith("\n")) output += "\n\n";
    output += part;
  }
  return output.trim();
}

function joinOpenCodeTextParts(parts: string[]): string {
  const normalized = parts.map((part) => part).filter((part) => part.trim());
  if (!normalized.length) return "";
  let cumulative = true;
  for (let index = 1; index < normalized.length; index += 1) {
    if (!normalized[index].startsWith(normalized[index - 1])) {
      cumulative = false;
      break;
    }
  }
  if (cumulative) return normalized[normalized.length - 1].trim();
  const deduped: string[] = [];
  for (const part of normalized) {
    if (deduped[deduped.length - 1] === part) continue;
    deduped.push(part);
  }
  return joinJsonReplyTextParts(deduped);
}

function extractOpenCodeReplyText(jsonTexts: JsonLineReplyText[]): string | null {
  const assistant = jsonTexts.filter((item) => item.kind === "assistant" && item.text.trim());
  if (!assistant.length) return null;
  const groups = new Map<string, JsonLineReplyText[]>();
  for (const item of assistant) {
    const key = item.messageId || "__unscoped__";
    const group = groups.get(key) || [];
    group.push(item);
    groups.set(key, group);
  }
  const orderedGroups = [...groups.entries()].map(([key, items], index) => ({
    key,
    items,
    index,
    timestamp: Math.max(...items.map((item) => item.timestamp || 0)),
  }));
  orderedGroups.sort((left, right) => (left.timestamp - right.timestamp) || (left.index - right.index));
  const latest = orderedGroups[orderedGroups.length - 1]?.items || assistant;
  return joinOpenCodeTextParts(latest.map((item) => item.text)) || null;
}

function extractReplyText(stdout: string, agent: ChannelConnectorAgentId | null = null): string | null {
  const jsonTexts = collectJsonLineText(stdout);
  const results = jsonTexts.filter((item) => item.kind === "result").map((item) => item.text.trim()).filter(Boolean);
  if (results.length) return results[results.length - 1];
  if (agent === "opencode") {
    const opencodeText = extractOpenCodeReplyText(jsonTexts);
    if (opencodeText) return opencodeText;
  }
  const assistant = jsonTexts.filter((item) => item.kind === "assistant").map((item) => item.text).filter((item) => item.trim());
  if (assistant.length) return joinJsonReplyTextParts(assistant);
  const messages = jsonTexts.filter((item) => item.kind === "message").map((item) => item.text).filter((item) => item.trim());
  if (messages.length) return joinJsonReplyTextParts(messages);
  const content = jsonTexts.filter((item) => item.kind === "content").map((item) => item.text).filter((item) => item.trim());
  if (content.length) return joinJsonReplyTextParts(content);
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

function extractClaudeNativeSessionId(stdout: string): string | null {
  let latest: string | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      const type = normalizeString(raw.type);
      if ((type === "system" || type === "result") && typeof raw.session_id === "string") {
        latest = normalizeString(raw.session_id) || latest;
      }
    } catch {
      // Non-event lines are intentionally ignored.
    }
  }
  return latest;
}

function extractOpencodeNativeSessionId(stdout: string): string | null {
  let latest: string | null = null;
  for (const line of stdout.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("{")) continue;
    try {
      const raw = JSON.parse(trimmed) as Record<string, unknown>;
      const part = typeof raw.part === "object" && raw.part !== null ? raw.part as Record<string, unknown> : null;
      if (typeof part?.sessionID === "string") latest = normalizeString(part.sessionID) || latest;
      if (typeof raw.sessionID === "string") latest = normalizeString(raw.sessionID) || latest;
      if (typeof raw.session_id === "string") latest = normalizeString(raw.session_id) || latest;
    } catch {
      // Non-event lines are intentionally ignored.
    }
  }
  return latest;
}

interface OpenCodeDbFallback {
  sessionId: string | null;
  replyText: string | null;
  stdout: string;
  progressEvents: ChannelConnectorAgentProgressEvent[];
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function opencodeDbPath(env: NodeJS.ProcessEnv): string | null {
  const dataHome = normalizeString(env.XDG_DATA_HOME);
  if (dataHome) return path.join(dataHome, "opencode", "opencode.db");
  const home = normalizeString(env.HOME);
  if (!home) return null;
  return path.join(home, ".local", "share", "opencode", "opencode.db");
}

function runSqliteJson(dbPath: string, query: string, env: NodeJS.ProcessEnv): Record<string, unknown>[] {
  const result = spawnSync("sqlite3", ["-json", dbPath, query], {
    encoding: "utf8",
    env,
    timeout: 5000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) return [];
  try {
    const parsed = JSON.parse(result.stdout || "[]") as unknown;
    return Array.isArray(parsed) ? parsed.filter(recordValue) : [];
  } catch {
    return [];
  }
}

function parseJsonRecord(value: unknown): Record<string, unknown> | null {
  const existing = recordValue(value);
  if (existing) return existing;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return recordValue(parsed);
  } catch {
    return null;
  }
}

function openCodeDbFallback(processRequest: ChannelConnectorAgentProcessRequest): OpenCodeDbFallback | null {
  if (processRequest.agent !== "opencode") return null;
  const env = mergeProcessEnv(processRequest.env);
  const dbPath = opencodeDbPath(env);
  if (!dbPath || !fs.existsSync(dbPath)) return null;
  const requestedSessionId = normalizeString(processRequest.agentNativeSessionId);
  const directory = normalizeString(processRequest.cwd);
  const sessionWhere = requestedSessionId
    ? `id = ${sqlString(requestedSessionId)}`
    : directory ? `directory = ${sqlString(directory)}` : "1 = 1";
  const sessions = runSqliteJson(
    dbPath,
    `select id from session where ${sessionWhere} order by time_updated desc limit 1`,
    env,
  );
  const sessionId = normalizeString(sessions[0]?.id);
  if (!sessionId) return null;
  const rows = runSqliteJson(
    dbPath,
    [
      "select m.id as message_id, m.data as message_data, p.data as part_data, p.time_created as part_time_created",
      "from part p join message m on p.message_id = m.id",
      `where p.session_id = ${sqlString(sessionId)}`,
      "order by p.time_created, p.id",
    ].join(" "),
    env,
  );
  const latestAssistantMessageId = rows
    .map((row, index) => {
      const messageData = parseJsonRecord(row.message_data);
      if (normalizeString(messageData?.role) !== "assistant") return null;
      return {
        id: normalizeString(row.message_id),
        index,
        time: Number(row.part_time_created) || Number(recordValue(messageData?.time)?.completed) || Number(recordValue(messageData?.time)?.created) || 0,
      };
    })
    .filter((item): item is { id: string; index: number; time: number } => Boolean(item?.id))
    .sort((left, right) => (left.time - right.time) || (left.index - right.index))
    .pop()?.id || null;
  const scopedRows = latestAssistantMessageId
    ? rows.filter((row) => normalizeString(row.message_id) === latestAssistantMessageId)
    : rows;
  const stdoutLines: string[] = [];
  const progressEvents: ChannelConnectorAgentProgressEvent[] = [];
  const replyParts: string[] = [];
  stdoutLines.push(JSON.stringify({ type: "step_start", part: { type: "step-start", sessionID: sessionId } }));
  for (const row of scopedRows) {
    const messageData = parseJsonRecord(row.message_data);
    const partData = parseJsonRecord(row.part_data);
    if (!partData) continue;
    const role = normalizeString(messageData?.role);
    const partType = normalizeString(partData.type);
    const text = normalizeString(partData.text);
    if (role === "assistant" && partType === "text" && text) {
      replyParts.push(text);
      const raw = { type: "text", part: { type: "text", text } };
      stdoutLines.push(JSON.stringify(raw));
      progressEvents.push(progressEvent({ type: "assistant", rawType: "text", itemType: "text", text }));
    } else if (partType === "reasoning" && text) {
      const raw = { type: "reasoning", part: { type: "reasoning", text } };
      stdoutLines.push(JSON.stringify(raw));
      progressEvents.push(progressEvent({ type: "reasoning", rawType: "reasoning", itemType: "reasoning", text }));
    } else if (partType === "tool" || partType === "tool-use" || partType === "tool_use") {
      const tool = normalizeString(partData.tool) || normalizeString(partData.name) || "tool";
      const state = recordValue(partData.state);
      const toolText = [
        tool,
        normalizeString(state?.title) || normalizeString(partData.title),
        normalizeString(state?.output) || normalizeString(partData.output),
      ].filter(Boolean).join("\n");
      const raw = { type: "tool_use", part: partData };
      stdoutLines.push(JSON.stringify(raw));
      progressEvents.push(progressEvent({ type: "tool", rawType: "tool_use", itemType: partType, text: toolText || tool }));
    } else if (partType === "step-finish") {
      const raw = { type: "step_finish", part: partData };
      stdoutLines.push(JSON.stringify(raw));
      progressEvents.push(progressEvent({ type: "completed", rawType: "step_finish", itemType: partType, text: normalizeString(partData.reason) || "done" }));
    }
  }
  const replyText = replyParts.join("").trim() || null;
  return {
    sessionId,
    replyText,
    stdout: `${stdoutLines.join("\n")}\n`,
    progressEvents,
  };
}

function extractAgentNativeSessionId(agent: ChannelConnectorAgentId, stdout: string): string | null {
  if (agent === "codex") return extractCodexThreadId(stdout);
  if (agent === "claude-code") return extractClaudeNativeSessionId(stdout);
  if (agent === "opencode") return extractOpencodeNativeSessionId(stdout);
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

function fallbackTurnSession(session: ChannelConnectorAgentTurnRequest["session"]): ChannelConnectorAgentTurnResult["session"] {
  return {
    resumed: false,
    agentNativeSessionId: session?.agentNativeSessionId || session?.codexThreadId || null,
    codexThreadId: session?.codexThreadId || null,
  };
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
      session: fallbackTurnSession(request.session),
    };
  }
  const unsupportedNativeCommand = unsupportedNativeCommandMessage(
    request.project.agent,
    nativeCommand,
    request.allowNativeCompact === true,
  );
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
      session: fallbackTurnSession(request.session),
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
      session: fallbackTurnSession(request.session),
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
      session: fallbackTurnSession(request.session),
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
  const shouldUseOpenCodeFallback = !cancelled
    && result.exitCode === 0
    && !result.error
    && !normalizeString(result.stdout);
  const openCodeFallback = shouldUseOpenCodeFallback ? openCodeDbFallback(processRequest) : null;
  const effectiveStdout = result.stdout || openCodeFallback?.stdout || "";
  const ok = result.exitCode === 0 && !result.error && !cancelled;
  const codexThreadId = request.project.agent === "codex"
    ? extractCodexThreadId(effectiveStdout) || processRequest.codexThreadId || null
    : request.session?.codexThreadId || null;
  const agentNativeSessionId = extractAgentNativeSessionId(request.project.agent, effectiveStdout)
    || openCodeFallback?.sessionId
    || processRequest.agentNativeSessionId
    || request.session?.agentNativeSessionId
    || (request.project.agent === "codex" ? codexThreadId : null)
    || null;
  const progressEvents = result.progressEvents?.length
    ? result.progressEvents
    : openCodeFallback?.progressEvents?.length
      ? openCodeFallback.progressEvents
      : collectProgressEvents(effectiveStdout, request.project.agent);
  const latestProgress = progressEvents.length ? progressEvents[progressEvents.length - 1] : null;
  const replyText = extractReplyText(effectiveStdout, request.project.agent) || openCodeFallback?.replyText || null;
  return {
    attempted: true,
    ok,
    status: cancelled ? "cancelled" : ok ? "completed" : "failed",
    agent: request.project.agent,
    model: request.project.model,
    command: processRequest.command,
    args: processRequest.args,
    cwd: processRequest.cwd,
    replyText: ok ? replyText : null,
    stdout: effectiveStdout,
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
      agentNativeSessionId,
      codexThreadId,
    },
  };
}
