import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { terminateOwnedProcessTree } from "../../core/owned-command.js";
import type {
  ChannelConnectorCommandSurfaceSkillAction,
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorOctoTransportResult,
  ChannelConnectorPermissionMode,
  ChannelConnectorReasoningEffort,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import { extractOctoContent, extractOctoPayloadText, isOctoGroupChannel } from "./octo-adapter.js";
import {
  clearChannelConnectorAgentSessionsForConversation,
  deleteChannelConnectorAgentSession,
  getChannelConnectorAgentSession,
  listChannelConnectorAgentSessionsForConversation,
  renameChannelConnectorAgentSession,
  type ChannelConnectorAgentSessionRecord,
} from "./agent-session-store.js";
import {
  clearChannelConnectorSessionControl,
  getChannelConnectorSessionControl,
  upsertChannelConnectorSessionControl,
  type ChannelConnectorSessionControlRecord,
} from "./session-control-store.js";
import {
  CHANNEL_CONNECTOR_HISTORY_CONTEXT_LIMIT,
  clearChannelConnectorConversationHistory,
  getChannelConnectorConversationHistory,
} from "./conversation-history-store.js";
import {
  deleteChannelConnectorCustomCommand,
  getChannelConnectorCustomCommand,
  isValidCustomCommandName,
  listChannelConnectorCustomCommands,
  normalizeCustomCommandName,
  type ChannelConnectorCustomCommandRecord,
  upsertChannelConnectorCustomCommand,
} from "./custom-command-store.js";
import {
  deleteChannelConnectorCommandAlias,
  getChannelConnectorCommandAlias,
  isValidCommandAliasName,
  listChannelConnectorCommandAliases,
  normalizeCommandAliasCommand,
  upsertChannelConnectorCommandAlias,
  type ChannelConnectorCommandAliasRecord,
} from "./command-alias-store.js";
import {
  findChannelConnectorReplyBufferForSession,
  listChannelConnectorReplyBuffersForSession,
  type ChannelConnectorReplyBufferRecord,
} from "./reply-buffer-store.js";
import {
  buildChannelConnectorSkillPrompt,
  channelConnectorSkillDirs,
  listChannelConnectorSkills,
  resolveChannelConnectorSkill,
} from "./skill-registry.js";
import {
  formatChannelConnectorContextBudget,
  resolveChannelConnectorContextBudget,
} from "./context-budget.js";
import {
  formatChannelConnectorThinkingSupport,
  resolveChannelConnectorThinkingSupport,
} from "./agent-capabilities.js";
import type {
  ChannelConnectorRuntimeBinding,
  ChannelConnectorRuntimeProject,
} from "./agent-runner.js";

const PERMISSION_MODES: readonly ChannelConnectorPermissionMode[] = [
  "suggest",
  "read-only",
  "auto-edit",
  "full-auto",
  "plan",
  "yolo",
];

const REASONING_EFFORTS: readonly ChannelConnectorReasoningEffort[] = ["low", "medium", "high", "xhigh"];
const AUTO_VISION_MODEL_SENTINEL = "__tracevane_auto__";

export interface ChannelConnectorCommandContext {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  message: ChannelConnectorOctoInboundMessage;
  sessionKey: string;
  controlsPath: string;
  commandAliasesPath?: string | null;
  customCommandsPath?: string | null;
  agentSessionsPath: string;
  conversationHistoryPath?: string | null;
  replyBuffersPath?: string | null;
  gatewayClientKey: string | null;
  listModelCatalog?: (endpoint: string, clientKey: string | null) => Promise<ChannelConnectorGatewayModel[]>;
  listModels?: (endpoint: string, clientKey: string | null) => Promise<string[]>;
  runOctoManagement?: (input: ChannelConnectorOctoManagementRequest) => Promise<ChannelConnectorOctoManagementResult>;
  stopActiveRun?: (input: {
    bindingId: string;
    sessionKey: string;
  }) => {
    stopped: boolean;
    runId: string | null;
    messageId: string | null;
    agent: string | null;
    model: string | null;
    error: string | null;
  };
  nativeCompactConversation?: (input: {
    bindingId: string;
    sessionKey: string;
    project: ChannelConnectorRuntimeProject;
    message: ChannelConnectorOctoInboundMessage;
    command: string;
  }) => Promise<{
    attempted: boolean;
    ok: boolean;
    fallbackAllowed: boolean;
    replyText: string | null;
    error: string | null;
  }>;
  compactConversation?: (input: {
    bindingId: string;
    sessionKey: string;
    project: ChannelConnectorRuntimeProject;
    command: string;
  }) => Promise<{
    ok: boolean;
    beforeEntries: number;
    afterEntries: number;
    sessionsCleared: number;
    summaryText: string | null;
    error: string | null;
  }>;
  summarizeUsage?: (input: {
    bindingId: string;
    sessionKey: string;
    project: ChannelConnectorRuntimeProject;
    command: string;
  }) => Promise<ChannelConnectorUsageSummary | null>;
  onCommandProgress?: (event: ChannelConnectorCommandProgressEvent) => Promise<ChannelConnectorCommandProgressAck | void> | ChannelConnectorCommandProgressAck | void;
  respondPermissionRequest?: (input: {
    bindingId: string;
    sessionKey: string;
    action: ChannelConnectorPermissionResponseAction;
  }) => ChannelConnectorPermissionResponseResult;
  hasPendingPermissionRequest?: (input: {
    bindingId: string;
    sessionKey: string;
  }) => boolean;
  respondQuestionRequest?: (input: {
    bindingId: string;
    sessionKey: string;
    answer: string;
  }) => ChannelConnectorPermissionResponseResult;
  hasPendingQuestionRequest?: (input: {
    bindingId: string;
    sessionKey: string;
  }) => boolean;
}

export type ChannelConnectorOctoManagementAction =
  | "list-groups"
  | "group-info"
  | "group-members"
  | "search-members"
  | "create-group"
  | "update-group"
  | "add-members"
  | "remove-members"
  | "list-threads"
  | "thread-info"
  | "thread-members"
  | "create-thread"
  | "delete-thread"
  | "join-thread"
  | "leave-thread"
  | "group-md-read"
  | "group-md-update"
  | "thread-md-read"
  | "thread-md-update"
  | "voice-context-read"
  | "voice-context-update"
  | "voice-context-delete"
  | "history"
  | "file-download-url"
  | "message-edit";

export interface ChannelConnectorOctoManagementRequest {
  action: ChannelConnectorOctoManagementAction;
  bindingId: string;
  sessionKey: string;
  message: ChannelConnectorOctoInboundMessage;
  groupNo?: string | null;
  shortId?: string | null;
  channelId?: string | null;
  channelType?: 1 | 2 | 5 | null;
  endMessageSeq?: number | null;
  keyword?: string | null;
  name?: string | null;
  notice?: string | null;
  content?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  messageId?: string | null;
  members?: string[] | null;
  creator?: string | null;
  limit?: number | null;
}

export interface ChannelConnectorOctoManagementResult {
  ok: boolean;
  replyText: string;
  error: string | null;
}

export interface ChannelConnectorGatewayModel {
  id: string;
  contextWindow?: number | null;
  maxOutputTokens?: number | null;
  aliases: string[];
  providerIds: string[];
  healthyProviderIds?: string[];
  openCircuitProviderIds?: string[];
  features: {
    text?: boolean;
    streaming?: boolean;
    tools?: boolean;
    vision?: boolean;
    reasoning?: boolean;
    responses?: boolean;
  };
}

export interface ChannelConnectorUsageSummary {
  source: "gateway-runtime-window";
  requests: number;
  successfulRequests: number;
  failedRequests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  lastRequestAt: string | null;
  providers: string[];
  models: string[];
  requestIds: string[];
}

export type ChannelConnectorPermissionResponseAction = "allow" | "deny" | "allow-all";

export interface ChannelConnectorPermissionResponseResult {
  handled: boolean;
  ok: boolean;
  replyText: string;
  requestId: string | null;
  toolName: string | null;
  error?: string | null;
  suppressReply?: boolean;
}

export type ChannelConnectorCommandAuditKind =
  | "builtin"
  | "custom-prompt"
  | "custom-exec"
  | "agent-command"
  | "skill"
  | "native"
  | "passthrough";

export interface ChannelConnectorCommandAudit {
  kind: ChannelConnectorCommandAuditKind;
  source: "tracevane" | "config" | "agent" | "skill" | "user";
  name: string;
  argsCount: number;
  argsPreview: string | null;
  commandPreview?: string | null;
  exec?: {
    workDir: string;
    commandPreview: string;
    exitCode: number | null;
    signal: string | null;
    timedOut: boolean;
    error: string | null;
    elapsedMs: number;
    stdoutBytes: number;
    stderrBytes: number;
    stdoutPreview: string | null;
    stderrPreview: string | null;
  };
}

export type ChannelConnectorCommandProgressType = "started" | "progress" | "completed" | "failed" | "timeout";

export interface ChannelConnectorCommandProgressEvent {
  type: ChannelConnectorCommandProgressType;
  commandName: string;
  commandPreview: string;
  workDir: string;
  elapsedMs: number;
  outputPreview: string | null;
  stdoutPreview: string | null;
  stderrPreview: string | null;
  exitCode?: number | null;
  signal?: string | null;
  error?: string | null;
}

export interface ChannelConnectorCommandProgressAck {
  handled?: boolean;
  suppressFinalReply?: boolean;
}

export interface ChannelConnectorCommandResult {
  handled: boolean;
  command: string | null;
  action: "help" | "status" | "list" | "show" | "set" | "reset" | "new" | "stop" | "compact" | "usage" | "delete" | "permission" | "passthrough" | null;
  ok: boolean | null;
  replyText: string | null;
  control: ChannelConnectorSessionControlRecord | null;
  bindingMetadataPatch?: Record<string, unknown> | null;
  passthroughText?: string | null;
  nativeCommand?: string | null;
  suppressReply?: boolean;
  audit?: ChannelConnectorCommandAudit | null;
  progressHandled?: boolean;
}

interface ParsedCommand {
  raw: string;
  name: string;
  args: string[];
}

export interface CommandMatchCandidate {
  id: string;
  names: readonly string[];
}

interface AgentCommandFile {
  name: string;
  description: string;
  prompt: string;
  source: "agent";
  filePath: string;
}

type ResolvedCustomCommand = ChannelConnectorCustomCommandRecord | AgentCommandFile;

export interface ChannelConnectorCommandSummary {
  name: string;
  description: string;
  source: "config" | "agent";
}

export interface ChannelConnectorSkillSummary {
  name: string;
  displayName: string;
  description: string;
  source: string;
  scope: "agent" | "binding" | "platform";
  platform?: string | null;
  actions?: ChannelConnectorCommandSurfaceSkillAction[];
}

export interface ChannelConnectorCommandAlias {
  name: string;
  command: string;
  source?: "metadata" | "store";
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nativeCompactCommand(value: unknown): boolean {
  const normalized = normalizeString(value);
  if (!normalized) return false;
  const head = normalizeString(normalized.split(/\s+/)[0]).replace(/^\/+/, "").toLowerCase();
  return head === "compact" || head === "compress";
}

function uniqueStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

let cachedTracevaneRuntimeVersion: string | null = null;

function readPackageVersionFromFile(filePath: string): string | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as { version?: unknown };
    const version = normalizeString(parsed.version);
    return version || null;
  } catch {
    return null;
  }
}

function packageVersionCandidateFiles(): string[] {
  const roots = uniqueStrings([
    process.env.TRACEVANE_ROOT || "",
    process.env.TRACEVANE_EXTENSION_DIR || "",
    process.cwd(),
    process.argv[1] ? path.dirname(process.argv[1]) : "",
  ]);
  const files: string[] = [];
  for (const root of roots) {
    let current = path.resolve(root);
    for (let depth = 0; depth < 8; depth += 1) {
      files.push(path.join(current, "package.json"));
      const next = path.dirname(current);
      if (next === current) break;
      current = next;
    }
  }
  return uniqueStrings(files);
}

function tracevaneRuntimeVersion(): string {
  const envVersion = normalizeString(process.env.TRACEVANE_BUILD_VERSION)
    || normalizeString(process.env.TRACEVANE_VERSION)
    || normalizeString(process.env.npm_package_version);
  if (envVersion) return envVersion;
  if (cachedTracevaneRuntimeVersion) return cachedTracevaneRuntimeVersion;

  for (const filePath of packageVersionCandidateFiles()) {
    const version = readPackageVersionFromFile(filePath);
    if (!version) continue;
    cachedTracevaneRuntimeVersion = version;
    return version;
  }

  cachedTracevaneRuntimeVersion = "unknown";
  return cachedTracevaneRuntimeVersion;
}

function normalizeAgentCommandName(value: string): string {
  return normalizeString(value).toLowerCase().replaceAll("-", "_");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addCommandAlias(
  output: ChannelConnectorCommandAlias[],
  seen: Set<string>,
  name: unknown,
  command: unknown,
): void {
  const normalizedName = normalizeString(name);
  const normalizedCommand = normalizeString(command);
  if (!normalizedName || !normalizedCommand) return;
  const key = normalizedName.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  output.push({ name: normalizedName, command: normalizedCommand, source: "metadata" });
}

function collectCommandAliasesFromValue(
  value: unknown,
  output: ChannelConnectorCommandAlias[],
  seen: Set<string>,
): void {
  if (Array.isArray(value)) {
    for (const item of value) collectCommandAliasesFromValue(item, output, seen);
    return;
  }
  if (isRecord(value)) {
    const explicitCommand = value.command ?? value.cmd ?? value.target;
    const explicitName = value.name ?? value.trigger ?? value.alias ?? value.text;
    if (explicitName !== undefined || explicitCommand !== undefined) {
      addCommandAlias(output, seen, explicitName, explicitCommand);
      return;
    }
    for (const [name, command] of Object.entries(value)) addCommandAlias(output, seen, name, command);
    return;
  }
  const line = normalizeString(value);
  if (!line) return;
  const match = line.match(/^(.+?)(?:=>|->|=)(.+)$/);
  if (match) addCommandAlias(output, seen, match[1], match[2]);
}

export function channelConnectorCommandAliasesFromMetadata(metadataValue: unknown): ChannelConnectorCommandAlias[] {
  const metadata = isRecord(metadataValue) ? metadataValue : {};
  const output: ChannelConnectorCommandAlias[] = [];
  const seen = new Set<string>();
  for (const key of ["aliases", "commandAliases", "command_aliases", "tracevaneCommandAliases", "tracevane_command_aliases"]) {
    collectCommandAliasesFromValue(metadata[key], output, seen);
  }
  return output;
}

function channelConnectorCommandAliasesFromStore(filePath: string | null | undefined, bindingId: string): ChannelConnectorCommandAlias[] {
  const normalizedPath = normalizeString(filePath || null);
  const normalizedBindingId = normalizeString(bindingId);
  if (!normalizedPath || !normalizedBindingId) return [];
  return listChannelConnectorCommandAliases(normalizedPath, normalizedBindingId)
    .map((alias) => ({ name: alias.name, command: alias.command, source: "store" as const }));
}

function mergeChannelConnectorCommandAliases(
  storeAliases: readonly ChannelConnectorCommandAlias[],
  metadataAliases: readonly ChannelConnectorCommandAlias[],
): ChannelConnectorCommandAlias[] {
  const output: ChannelConnectorCommandAlias[] = [];
  const seen = new Set<string>();
  for (const alias of [...storeAliases, ...metadataAliases]) {
    const name = normalizeString(alias.name);
    const command = normalizeString(alias.command);
    if (!name || !command) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push({ name, command, source: alias.source || "metadata" });
  }
  return output;
}

export function listChannelConnectorCommandAliasesForBinding(
  binding: Pick<ChannelConnectorRuntimeBinding, "id" | "metadata">,
  commandAliasesPath?: string | null,
): ChannelConnectorCommandAlias[] {
  return mergeChannelConnectorCommandAliases(
    channelConnectorCommandAliasesFromStore(commandAliasesPath, binding.id),
    channelConnectorCommandAliasesFromMetadata(binding.metadata),
  );
}

export function resolveChannelConnectorCommandAlias(
  content: string,
  aliases: readonly ChannelConnectorCommandAlias[],
): {
  content: string;
  matchedAlias: ChannelConnectorCommandAlias | null;
} {
  const normalized = normalizeString(content);
  if (!normalized || !aliases.length) return { content, matchedAlias: null };

  const exact = aliases.find((alias) => alias.name === normalized);
  if (exact) return { content: exact.command, matchedAlias: exact };

  const parts = normalized.split(/\s+/, 2);
  const first = parts[0] || "";
  const prefix = aliases.find((alias) => alias.name === first);
  if (!prefix) return { content, matchedAlias: null };
  const rest = normalized.slice(first.length).trimStart();
  return {
    content: rest ? `${prefix.command} ${rest}` : prefix.command,
    matchedAlias: prefix,
  };
}

export function resolveChannelConnectorBindingCommandAlias(
  binding: Pick<ChannelConnectorRuntimeBinding, "id" | "metadata">,
  content: string,
  commandAliasesPath?: string | null,
): {
  content: string;
  matchedAlias: ChannelConnectorCommandAlias | null;
} {
  return resolveChannelConnectorCommandAlias(
    content,
    listChannelConnectorCommandAliasesForBinding(binding, commandAliasesPath),
  );
}

const TRACEVANE_COMMAND_MATCH_CANDIDATES: readonly CommandMatchCandidate[] = [
  { id: "start", names: ["start"] },
  { id: "help", names: ["help"] },
  { id: "menu", names: ["menu"] },
  { id: "commands", names: ["commands", "command", "cmd"] },
  { id: "alias", names: ["alias", "aliases"] },
  { id: "skills", names: ["skills", "skill"] },
  { id: "status", names: ["status"] },
  { id: "usage", names: ["usage", "tokens", "quota"] },
  { id: "whoami", names: ["whoami", "myid"] },
  { id: "version", names: ["version"] },
  { id: "current", names: ["current"] },
  { id: "list", names: ["list", "sessions"] },
  { id: "switch", names: ["switch"] },
  { id: "search", names: ["search", "find"] },
  { id: "name", names: ["name", "rename"] },
  { id: "delete", names: ["delete", "del", "rm"] },
  { id: "history", names: ["history"] },
  { id: "agent", names: ["agent", "agents"] },
  { id: "model", names: ["model", "models"] },
  { id: "vision", names: ["vision", "visual", "vision-model", "visual-model", "image-model"] },
  { id: "mode", names: ["mode", "permission", "permissions", "yolo"] },
  { id: "approve", names: ["approve", "allow", "yes", "ok"] },
  { id: "deny", names: ["deny", "reject", "no"] },
  { id: "approve-all", names: ["approve-all", "allow-all"] },
  { id: "reasoning", names: ["reasoning", "effort"] },
  { id: "dir", names: ["dir", "cd", "chdir", "workdir", "pwd"] },
  { id: "display", names: ["display"] },
  { id: "thinking", names: ["thinking", "think"] },
  { id: "process", names: ["process", "progress"] },
  { id: "tools", names: ["tools", "tool"] },
  { id: "quiet", names: ["quiet"] },
  { id: "buffer", names: ["buffer", "buffers", "reply-buffer", "reply-buffers"] },
  { id: "stop", names: ["stop", "cancel"] },
  { id: "compact", names: ["compact", "compress"] },
  { id: "new", names: ["new"] },
  { id: "reset", names: ["reset"] },
  { id: "native", names: ["native", "raw", "pass"] },
  { id: "octo", names: ["octo"] },
];

export function matchChannelConnectorCommandPrefix(
  input: string,
  candidates: readonly CommandMatchCandidate[] = TRACEVANE_COMMAND_MATCH_CANDIDATES,
): string | null {
  const prefix = normalizeString(input).toLowerCase();
  if (!prefix) return null;

  for (const candidate of candidates) {
    if (candidate.names.some((name) => name === prefix)) return candidate.id;
  }

  let matchedId: string | null = null;
  for (const candidate of candidates) {
    if (!candidate.names.some((name) => name.startsWith(prefix))) continue;
    if (matchedId && matchedId !== candidate.id) return null;
    matchedId = candidate.id;
  }
  return matchedId;
}

export function matchChannelConnectorSubCommand(input: string, candidates: readonly string[]): string {
  const prefix = normalizeString(input).toLowerCase();
  if (!prefix) return "";
  if (candidates.includes(prefix)) return prefix;

  let matched: string | null = null;
  for (const candidate of candidates) {
    if (!candidate.startsWith(prefix)) continue;
    if (matched && matched !== candidate) return prefix;
    matched = candidate;
  }
  return matched || prefix;
}

function commandStorePath(context: Pick<ChannelConnectorCommandContext, "customCommandsPath">): string | null {
  return normalizeString(context.customCommandsPath || null) || null;
}

function agentCommandDirs(project: ChannelConnectorRuntimeProject): string[] {
  const workDir = normalizeString(project.workDir) || process.cwd();
  const homeDir = os.homedir();
  if (project.agent === "claude-code") {
    return uniqueStrings([
      path.join(path.resolve(workDir), ".claude", "commands"),
      path.join(homeDir, ".claude", "commands"),
    ]);
  }
  if (project.agent === "gemini") {
    return uniqueStrings([
      path.join(path.resolve(workDir), ".gemini", "commands"),
      path.join(homeDir, ".gemini", "commands"),
    ]);
  }
  return [];
}

function firstLine(value: string, maxRunes = 60): string {
  const line = normalizeString(value).split(/\r?\n/, 1)[0] || "";
  const runes = Array.from(line);
  return runes.length > maxRunes ? `${runes.slice(0, maxRunes).join("")}...` : line;
}

function readAgentCommandFile(dir: string, name: string): AgentCommandFile | null {
  const absDir = path.resolve(dir);
  const candidates = uniqueStrings([
    name,
    name.replaceAll("_", "-"),
  ]);
  for (const candidate of candidates) {
    const filePath = path.resolve(absDir, `${candidate}.md`);
    if (!filePath.startsWith(`${absDir}${path.sep}`)) continue;
    let content = "";
    try {
      content = fs.readFileSync(filePath, "utf8").trim();
    } catch {
      continue;
    }
    if (!content) continue;
    return {
      name: candidate,
      description: firstLine(content),
      prompt: content,
      source: "agent",
      filePath,
    };
  }
  return null;
}

function resolveAgentCommandFile(project: ChannelConnectorRuntimeProject, name: string): AgentCommandFile | null {
  const normalizedName = normalizeString(name);
  if (!normalizedName) return null;
  for (const dir of agentCommandDirs(project)) {
    const command = readAgentCommandFile(dir, normalizedName);
    if (command) return command;
  }
  return null;
}

function listAgentCommandFiles(project: ChannelConnectorRuntimeProject, seenNames = new Set<string>()): AgentCommandFile[] {
  const seen = new Set<string>();
  const commands: AgentCommandFile[] = [];
  for (const dir of agentCommandDirs(project)) {
    const absDir = path.resolve(dir);
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      const name = entry.name.slice(0, -".md".length);
      const key = normalizeAgentCommandName(name);
      if (!name || seen.has(key) || seenNames.has(key)) continue;
      const command = readAgentCommandFile(absDir, name);
      if (!command) continue;
      seen.add(key);
      commands.push(command);
    }
  }
  return commands;
}

function listConfiguredCommands(
  context: Pick<ChannelConnectorCommandContext, "customCommandsPath">,
  project: ChannelConnectorRuntimeProject,
): ChannelConnectorCustomCommandRecord[] {
  const filePath = commandStorePath(context);
  if (!filePath) return [];
  return listChannelConnectorCustomCommands(filePath, project.id);
}

function resolveConfiguredCommand(
  context: Pick<ChannelConnectorCommandContext, "customCommandsPath">,
  project: ChannelConnectorRuntimeProject,
  name: string,
): ChannelConnectorCustomCommandRecord | null {
  const filePath = commandStorePath(context);
  if (!filePath) return null;
  return getChannelConnectorCustomCommand(filePath, project.id, name);
}

function resolveCustomCommand(
  context: Pick<ChannelConnectorCommandContext, "customCommandsPath">,
  project: ChannelConnectorRuntimeProject,
  name: string,
): ResolvedCustomCommand | null {
  return resolveConfiguredCommand(context, project, name) || resolveAgentCommandFile(project, name);
}

function isExecCustomCommand(command: ResolvedCustomCommand): command is ChannelConnectorCustomCommandRecord {
  return command.source === "config" && Boolean(normalizeString(command.exec));
}

const promptPlaceholderRe = /\{\{(\d+\*?|args)(:[^}]*)?\}\}/g;

function expandAgentCommandPrompt(template: string, args: string[]): string {
  const normalizedTemplate = normalizeString(template);
  promptPlaceholderRe.lastIndex = 0;
  if (!promptPlaceholderRe.test(normalizedTemplate)) {
    return args.length ? `${normalizedTemplate}\n\n${args.join(" ")}` : normalizedTemplate;
  }
  promptPlaceholderRe.lastIndex = 0;
  return normalizedTemplate.replace(promptPlaceholderRe, (_match, rawKey: string, rawDefault: string | undefined) => {
    const key = rawKey || "";
    const defaultValue = rawDefault ? rawDefault.slice(1) : "";
    const hasDefault = Boolean(rawDefault);
    if (key === "args") return args.length ? args.join(" ") : hasDefault ? defaultValue : "";
    if (key.endsWith("*")) {
      const index = Number(key.slice(0, -1));
      if (Number.isInteger(index) && index >= 1 && index - 1 < args.length) return args.slice(index - 1).join(" ");
      return hasDefault ? defaultValue : "";
    }
    const index = Number(key);
    if (Number.isInteger(index) && index >= 1 && index - 1 < args.length) return args[index - 1] || "";
    return hasDefault ? defaultValue : "";
  });
}

function resolveExecCommandWorkDir(project: ChannelConnectorRuntimeProject, workDir: string): string {
  const baseDir = normalizeString(project.workDir) || process.cwd();
  const configured = normalizeString(workDir);
  return configured ? path.resolve(baseDir, configured) : path.resolve(baseDir);
}

function shellCommandArgs(command: string): { command: string; args: string[] } {
  if (process.platform === "win32") {
    return {
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command],
    };
  }
  return {
    command: "sh",
    args: ["-c", command],
  };
}

function commandArgsAudit(args: readonly string[]): Pick<ChannelConnectorCommandAudit, "argsCount" | "argsPreview"> {
  const text = args.join(" ").trim();
  return {
    argsCount: args.length,
    argsPreview: text ? bufferPreviewText(text, 500) : null,
  };
}

function commandAudit(input: {
  kind: ChannelConnectorCommandAuditKind;
  source: ChannelConnectorCommandAudit["source"];
  name: string;
  args: readonly string[];
  commandPreview?: string | null;
}): ChannelConnectorCommandAudit {
  return {
    kind: input.kind,
    source: input.source,
    name: input.name,
    ...commandArgsAudit(input.args),
    ...(input.commandPreview ? { commandPreview: bufferPreviewText(input.commandPreview, 500) } : {}),
  };
}

export async function runCustomExecCommand(input: {
  command: ChannelConnectorCustomCommandRecord;
  project: ChannelConnectorRuntimeProject;
  args: string[];
  timeoutMs?: number;
  onProgress?: ChannelConnectorCommandContext["onCommandProgress"];
}): Promise<{
  ok: boolean;
  replyText: string;
  audit: ChannelConnectorCommandAudit;
  suppressFinalReply: boolean;
  progressHandled: boolean;
}> {
  const commandText = expandAgentCommandPrompt(input.command.exec, input.args);
  const workDir = resolveExecCommandWorkDir(input.project, input.command.workDir);
  const timeoutMs = input.timeoutMs || 60_000;
  const shell = shellCommandArgs(commandText);
  const startedAt = Date.now();
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let suppressFinalReply = false;
    let progressHandled = false;
    let progressStarted = false;
    let progressTimer: NodeJS.Timeout | null = null;
    let settled = false;
    let timeoutCleanupStarted = false;
    const child = spawn(shell.command, shell.args, {
      cwd: workDir,
      detached: process.platform !== "win32",
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    const outputText = (): string => [
      stdout.trim() ? `stdout:\n${stdout.trim()}` : "",
      stderr.trim() ? `stderr:\n${stderr.trim()}` : "",
    ].filter(Boolean).join("\n\n");

    const emitProgress = async (
      type: ChannelConnectorCommandProgressType,
      detail: {
        exitCode?: number | null;
        signal?: NodeJS.Signals | string | null;
        error?: string | null;
      } = {},
    ): Promise<void> => {
      if (!input.onProgress) return;
      const ack = await input.onProgress({
        type,
        commandName: input.command.name,
        commandPreview: bufferPreviewText(commandText, 500),
        workDir,
        elapsedMs: Date.now() - startedAt,
        outputPreview: outputText().trim() ? bufferPreviewText(outputText().trim(), 4_000) : null,
        stdoutPreview: stdout.trim() ? bufferPreviewText(stdout.trim(), 2_000) : null,
        stderrPreview: stderr.trim() ? bufferPreviewText(stderr.trim(), 2_000) : null,
        exitCode: detail.exitCode ?? null,
        signal: detail.signal ? String(detail.signal) : null,
        error: detail.error || null,
      });
      if (ack?.handled) progressHandled = true;
      if (ack?.suppressFinalReply) suppressFinalReply = true;
    };

    const finish = async (ok: boolean, detail: {
      exitCode?: number | null;
      signal?: NodeJS.Signals | null;
      error?: string | null;
      timedOut?: boolean;
    } = {}): Promise<void> => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(quickTimer);
      if (progressTimer) clearInterval(progressTimer);
      const elapsedMs = Date.now() - startedAt;
      const output = outputText();
      const status = ok ? "completed" : detail.timedOut ? "timed out" : "failed";
      const exitDetail = detail.exitCode === null || detail.exitCode === undefined
        ? detail.signal ? `signal=${detail.signal}` : ""
        : `exit=${detail.exitCode}`;
      if (progressStarted) {
        await emitProgress(
          ok ? "completed" : detail.timedOut ? "timeout" : "failed",
          {
            exitCode: detail.exitCode ?? null,
            signal: detail.signal ?? null,
            error: detail.error || null,
          },
        );
      }
      resolve({
        ok,
        suppressFinalReply,
        progressHandled,
        audit: {
          ...commandAudit({
            kind: "custom-exec",
            source: "config",
            name: input.command.name,
            args: input.args,
            commandPreview: commandText,
          }),
          exec: {
            workDir,
            commandPreview: bufferPreviewText(commandText, 500),
            exitCode: detail.exitCode ?? null,
            signal: detail.signal ? String(detail.signal) : null,
            timedOut: detail.timedOut === true,
            error: detail.error || null,
            elapsedMs,
            stdoutBytes,
            stderrBytes,
            stdoutPreview: stdout.trim() ? bufferPreviewText(stdout.trim(), 1_000) : null,
            stderrPreview: stderr.trim() ? bufferPreviewText(stderr.trim(), 1_000) : null,
          },
        },
        replyText: [
          `shell command /${input.command.name} ${status}`,
          `cwd=${workDir}`,
          exitDetail,
          detail.error || "",
          output ? `\`\`\`text\n${bufferPreviewText(output, 12_000)}\n\`\`\`` : "无输出",
          `elapsed=${elapsedMs}ms`,
        ].filter(Boolean).join("\n"),
      });
    };
    const quickTimer = setTimeout(() => {
      if (settled || progressStarted) return;
      progressStarted = true;
      void emitProgress("started");
      progressTimer = setInterval(() => {
        if (!settled) void emitProgress("progress");
      }, 2_000);
      progressTimer.unref();
    }, 500);
    quickTimer.unref();
    const timer = setTimeout(() => {
      if (settled || timeoutCleanupStarted) return;
      if (child.exitCode !== null || child.signalCode !== null) {
        void finish(child.exitCode === 0, {
          exitCode: child.exitCode,
          signal: child.signalCode,
        });
        return;
      }
      timeoutCleanupStarted = true;
      void (async () => {
        let cleanupError = "";
        try {
          cleanupError = await terminateOwnedProcessTree(child);
        } catch (error) {
          cleanupError = error instanceof Error ? error.message : String(error);
        }
        void finish(false, {
          timedOut: true,
          error: cleanupError
            ? `timeout=${timeoutMs}ms; cleanup failed: ${cleanupError}`
            : `timeout=${timeoutMs}ms`,
        });
      })();
    }, timeoutMs);
    timer.unref();
    child.stdout.on("data", (chunk) => {
      const text = String(chunk);
      stdoutBytes += Buffer.byteLength(text);
      stdout = bufferPreviewText(`${stdout}${text}`, 16_000);
    });
    child.stderr.on("data", (chunk) => {
      const text = String(chunk);
      stderrBytes += Buffer.byteLength(text);
      stderr = bufferPreviewText(`${stderr}${text}`, 16_000);
    });
    child.on("error", (error) => {
      if (!timeoutCleanupStarted) void finish(false, { error: error.message });
    });
    child.on("close", (code, signal) => {
      if (!timeoutCleanupStarted) void finish(code === 0, { exitCode: code, signal });
    });
  });
}

async function emitBuiltinCommandProgress(input: {
  context: ChannelConnectorCommandContext;
  project: ChannelConnectorRuntimeProject;
  commandName: string;
  commandPreview: string;
  startedAt: number;
  type: ChannelConnectorCommandProgressType;
  outputPreview?: string | null;
  error?: string | null;
}): Promise<ChannelConnectorCommandProgressAck> {
  if (!input.context.onCommandProgress) return {};
  return await input.context.onCommandProgress({
    type: input.type,
    commandName: input.commandName,
    commandPreview: bufferPreviewText(input.commandPreview, 500),
    workDir: input.project.workDir,
    elapsedMs: Date.now() - input.startedAt,
    outputPreview: input.outputPreview ? bufferPreviewText(input.outputPreview, 4_000) : null,
    stdoutPreview: input.outputPreview ? bufferPreviewText(input.outputPreview, 2_000) : null,
    stderrPreview: null,
    exitCode: input.type === "completed" ? 0 : input.type === "failed" ? 1 : null,
    signal: null,
    error: input.error || null,
  }) || {};
}

function customCommandsListText(
  context: Pick<ChannelConnectorCommandContext, "customCommandsPath">,
  project: ChannelConnectorRuntimeProject,
): string {
  const configuredCommands = listConfiguredCommands(context, project);
  const seen = new Set(configuredCommands.map((command) => normalizeCustomCommandName(command.name)));
  const agentCommands = listAgentCommandFiles(project, seen);
  const commands: ResolvedCustomCommand[] = [...configuredCommands, ...agentCommands];
  if (!commands.length) {
    const dirs = agentCommandDirs(project);
    return [
      "当前 Agent 没有可用的自定义命令。",
      dirs.length
        ? `Tracevane 会按 CC CommandProvider 合同扫描：${dirs.join("；")}`
        : `当前 Agent (${project.agent}) 尚未在 Tracevane 中声明命令目录。`,
      "用法：/commands add <名称> <prompt 模板>；/commands del <名称>。",
    ].join("\n");
  }
  const lines = [`Tracevane Custom Commands (${commands.length})`];
  for (const command of commands) {
    const tag = command.source === "agent" ? " [agent]" : isExecCustomCommand(command) ? " [shell]" : "";
    lines.push(`/${command.name}${tag}`);
    lines.push(`  ${command.description || firstLine(isExecCustomCommand(command) ? `$ ${command.exec}` : command.prompt) || "Custom command"}`);
  }
  lines.push("用法：/<命令名> [参数]。支持 {{1}}、{{2*}}、{{args}} 和默认值占位。");
  lines.push("管理：/commands add <名称> <prompt 模板>；/commands addexec [--work-dir <目录>] <名称> <shell 命令>；/commands del <名称>。");
  return lines.join("\n");
}

function skillScopeLabel(skill: { scope?: string; platform?: string | null }): string {
  if (skill.scope === "binding") return "binding";
  if (skill.scope === "platform") return skill.platform ? `platform:${skill.platform}` : "platform";
  return "agent";
}

function skillsListText(
  project: ChannelConnectorRuntimeProject,
  binding?: ChannelConnectorRuntimeBinding | null,
): string {
  const skills = listChannelConnectorSkills(project, { binding });
  if (!skills.length) {
    const dirs = channelConnectorSkillDirs(project, { binding });
    return [
      "未发现任何 Skill。",
      dirs.length
        ? `Tracevane 会按 CC SkillProvider 合同扫描 Agent 与当前 binding/platform 目录：${dirs.join("；")}`
        : `当前 Agent (${project.agent}) 尚未在 Tracevane 中声明 Skill 目录。`,
    ].join("\n");
  }
  const platform = normalizeString(binding?.platform);
  const lines = [`Tracevane Skills (${project.agent}${platform ? ` · ${platform}` : ""}) - ${skills.length} 个`];
  for (const skill of skills) {
    lines.push(`/${skill.name} [${skillScopeLabel(skill)}]`);
    lines.push(`  ${skill.description || "Skill"}`);
  }
  lines.push("用法：/<skill名称> [参数...]。Tracevane 会把 Skill 指令和用户参数一起交给当前 Agent。");
  return lines.join("\n");
}

export function listChannelConnectorCommandSummaries(
  context: Pick<ChannelConnectorCommandContext, "customCommandsPath">,
  project: ChannelConnectorRuntimeProject,
): ChannelConnectorCommandSummary[] {
  const configuredCommands = listConfiguredCommands(context, project);
  const seen = new Set(configuredCommands.map((command) => normalizeCustomCommandName(command.name)));
  const agentCommands = listAgentCommandFiles(project, seen);
  return [...configuredCommands, ...agentCommands].map((command) => ({
    name: command.name,
    description: command.description || firstLine(isExecCustomCommand(command) ? `$ ${command.exec}` : command.prompt) || "Custom command",
    source: command.source,
  }));
}

export function listChannelConnectorSkillSummaries(
  project: ChannelConnectorRuntimeProject,
  binding?: ChannelConnectorRuntimeBinding | null,
): ChannelConnectorSkillSummary[] {
  return listChannelConnectorSkills(project, { binding }).map((skill) => ({
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    source: skill.source,
    scope: skill.scope,
    platform: skill.platform || null,
    actions: [],
  }));
}

function commandsUsageText(): string {
  return [
    "用法：",
    "/commands - 列出自定义命令",
    "/commands add <名称> <prompt 模板> - 添加 prompt 命令",
    "/commands addexec [--work-dir <目录>] <名称> <shell 命令> - 添加 shell 命令（仅管理用户）",
    "/commands del <名称> - 删除自定义命令",
  ].join("\n");
}

function commandAliasStorePath(context: Pick<ChannelConnectorCommandContext, "commandAliasesPath">): string | null {
  return normalizeString(context.commandAliasesPath || null) || null;
}

function commandAliasListText(aliases: readonly ChannelConnectorCommandAlias[]): string {
  if (!aliases.length) {
    return [
      "暂无别名配置。",
      "用法：/alias add <触发词> <命令>",
      "示例：/alias add 帮助 /help",
    ].join("\n");
  }
  const lines = [`Tracevane Command Aliases (${aliases.length})`];
  for (const alias of aliases) {
    const source = alias.source === "store" ? "store" : "metadata";
    lines.push(`  ${alias.name} -> ${alias.command} [${source}]`);
  }
  lines.push("用法：/alias add <触发词> <命令>；/alias del <触发词>。");
  return lines.join("\n");
}

function aliasUsageText(): string {
  return [
    "用法：",
    "/alias - 列出所有别名",
    "/alias add <触发词> <命令> - 添加或更新别名",
    "/alias del <触发词> - 删除通过 IM 添加的别名",
    "示例：/alias add 帮助 /help",
  ].join("\n");
}

function metadataAliasByName(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">, name: string): ChannelConnectorCommandAlias | null {
  const key = normalizeString(name).toLowerCase();
  if (!key) return null;
  return channelConnectorCommandAliasesFromMetadata(binding.metadata)
    .find((alias) => alias.name.toLowerCase() === key) || null;
}

function storeAliasByName(filePath: string | null, bindingId: string, name: string): ChannelConnectorCommandAliasRecord | null {
  if (!filePath) return null;
  return getChannelConnectorCommandAlias(filePath, bindingId, name);
}

export function parseChannelConnectorCommand(content: string): ParsedCommand | null {
  const trimmed = normalizeCommandPrefix(normalizeString(content));
  if (!trimmed.startsWith("/")) return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  const rawName = normalizeString(parts[0]).replace(/^\/+/, "").toLowerCase();
  if (!rawName) return null;
  return {
    raw: trimmed,
    name: rawName,
    args: parts.slice(1),
  };
}

function normalizeCommandPrefix(value: string): string {
  if (value.startsWith("/%")) return `/${value.slice(2)}`;
  if (value.startsWith("%")) return `/${value.slice(1)}`;
  return value;
}

function controlsLookup(context: Pick<ChannelConnectorCommandContext, "binding" | "sessionKey">) {
  return {
    bindingId: context.binding.id,
    sessionKey: context.sessionKey,
  };
}

export function resolveChannelConnectorEffectiveProject(
  config: ChannelConnectorsDaemonRuntimeConfig,
  fallbackProject: ChannelConnectorRuntimeProject,
  control: ChannelConnectorSessionControlRecord | null,
): ChannelConnectorRuntimeProject {
  const selected = control?.activeProjectId
    ? config.projects.find((project) => project.id === control.activeProjectId)
    : null;
  const base = selected || fallbackProject;
  return {
    ...base,
    model: control?.model || base.model,
    reasoningEffort: control?.reasoningEffort || base.reasoningEffort || null,
    permissionMode: control?.permissionMode || base.permissionMode,
    workDir: control?.workDir || base.workDir,
  };
}

function resolveProjectTarget(
  config: ChannelConnectorsDaemonRuntimeConfig,
  input: string,
): ChannelConnectorRuntimeProject | null {
  const target = normalizeString(input).toLowerCase();
  if (!target) return null;
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1 && index <= config.projects.length) {
    return config.projects[index - 1] || null;
  }
  return config.projects.find((project) => {
    const candidates = [project.id, project.name, project.agent].map((item) => normalizeString(item).toLowerCase());
    return candidates.includes(target);
  }) || null;
}

function permissionModeAlias(value: string): ChannelConnectorPermissionMode | null {
  const target = normalizeString(value).toLowerCase();
  if (!target) return null;
  if (target === "auto") return "auto-edit";
  if (target === "full" || target === "fullauto") return "full-auto";
  if (target === "readonly" || target === "read") return "read-only";
  if (target === "bypass" || target === "dangerously-bypass" || target === "bypasspermissions") return "yolo";
  return (PERMISSION_MODES as readonly string[]).includes(target)
    ? target as ChannelConnectorPermissionMode
    : null;
}

function reasoningEffortAlias(value: string, efforts: readonly ChannelConnectorReasoningEffort[] = REASONING_EFFORTS): ChannelConnectorReasoningEffort | null {
  const target = normalizeString(value).toLowerCase();
  if (!target) return null;
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1 && index <= efforts.length) return efforts[index - 1] || null;
  if (target === "max" || target === "extra-high" || target === "extra_high") return "xhigh";
  if ((efforts as readonly string[]).includes(target)) return target as ChannelConnectorReasoningEffort;
  return null;
}

function canManageSession(binding: ChannelConnectorRuntimeBinding, message: ChannelConnectorOctoInboundMessage): boolean {
  if (!binding.adminUsers.length) return true;
  return binding.adminUsers.includes(message.fromUid);
}

function metadataStringList(value: unknown): string[] {
  const output: string[] = [];
  const add = (item: unknown): void => {
    if (Array.isArray(item)) {
      for (const nested of item) add(nested);
      return;
    }
    const normalized = normalizeString(item);
    if (!normalized) return;
    output.push(...normalized.split(/[,\s]+/).map((part) => normalizeString(part)).filter(Boolean));
  };
  add(value);
  return uniqueStrings(output);
}

function bindingDisabledCommands(binding: Pick<ChannelConnectorRuntimeBinding, "disabledCommands" | "metadata">): string[] {
  const metadata = isRecord(binding.metadata) ? binding.metadata : {};
  return uniqueStrings([
    ...metadataStringList(binding.disabledCommands),
    ...metadataStringList(metadata.disabledCommands),
    ...metadataStringList(metadata.disabled_commands),
  ].map((command) => command.replace(/^\/+/, "").toLowerCase()));
}

function explicitBindingAdmin(binding: Pick<ChannelConnectorRuntimeBinding, "adminUsers">, message: ChannelConnectorOctoInboundMessage): boolean {
  return binding.adminUsers.length > 0 && binding.adminUsers.includes(message.fromUid);
}

function disabledCommandDecision(
  binding: Pick<ChannelConnectorRuntimeBinding, "adminUsers" | "disabledCommands" | "metadata">,
  message: ChannelConnectorOctoInboundMessage,
  names: readonly string[],
): { disabled: boolean; command: string | null } {
  if (explicitBindingAdmin(binding, message)) return { disabled: false, command: null };
  const disabled = bindingDisabledCommands(binding);
  if (!disabled.length) return { disabled: false, command: null };
  if (disabled.includes("*")) return { disabled: true, command: "*" };
  const candidates = uniqueStrings(
    names
      .map((name) => normalizeString(name).replace(/^\/+/, "").toLowerCase())
      .filter(Boolean),
  );
  const matched = candidates.find((candidate) => disabled.includes(candidate));
  return matched ? { disabled: true, command: matched } : { disabled: false, command: null };
}

function disabledCommandReply(command: string | null): string {
  return command === "*"
    ? "当前 Channel binding 已禁用所有命令。"
    : `当前 Channel binding 已禁用命令 /${command || "unknown"}。`;
}

function permissionResponseActionAlias(value: string): ChannelConnectorPermissionResponseAction | null {
  const target = normalizeString(value)
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
  if (!target) return null;
  if (["approve", "allow", "yes", "y", "ok", "继续"].includes(target)) return "allow";
  if (["deny", "reject", "no", "n", "拒绝"].includes(target)) return "deny";
  if (["approve all", "allow all", "yes all", "全部允许"].includes(target)) return "allow-all";
  return null;
}

function handlePermissionResponseCommand(
  context: ChannelConnectorCommandContext,
  action: ChannelConnectorPermissionResponseAction,
  currentControl: ChannelConnectorSessionControlRecord | null,
  commandName: string,
): ChannelConnectorCommandResult {
  const response = context.respondPermissionRequest?.({
    ...controlsLookup(context),
    action,
  }) || {
    handled: false,
    ok: false,
    replyText: "当前没有等待批准的 Agent 工具请求。",
    requestId: null,
    toolName: null,
  };
  return {
    handled: true,
    command: commandName,
    action: "permission",
    ok: response.ok,
    control: currentControl,
    replyText: response.replyText,
    passthroughText: null,
    suppressReply: response.suppressReply === true,
  };
}

function isTracevaneCommand(name: string): boolean {
  return Boolean(matchChannelConnectorCommandPrefix(name));
}

type CommandHelpSection = "session" | "agent" | "vision" | "display" | "buffer" | "workdir" | "commands" | "native" | "platform" | "more";

function commandHelpList(rows: Array<[string, string]>): string {
  return rows.map(([command, description]) => `- ${command} - ${description}`).join("\n");
}

function commandHelpSectionAlias(value: string | null | undefined): CommandHelpSection | null {
  const target = normalizeString(value).toLowerCase();
  if (!target) return null;
  if (["more", "advanced", "settings"].includes(target)) return "more";
  if (["session", "sessions", "status", "current", "history", "compact", "stop", "delete", "del", "rm", "whoami", "myid", "version"].includes(target)) {
    return "session";
  }
  if (["agent", "profile", "model", "mode", "reasoning", "permission"].includes(target)) return "agent";
  if (["vision", "visual", "image", "vision-model", "visual-model", "image-model"].includes(target)) return "vision";
  if (["display", "thinking", "think", "process", "progress", "tools", "tool", "quiet"].includes(target)) return "display";
  if (["buffer", "buffers", "reply-buffer", "reply-buffers"].includes(target)) return "buffer";
  if (["workdir", "dir", "cd", "directory"].includes(target)) return "workdir";
  if (["commands", "command", "cmd", "alias", "aliases", "skills", "skill"].includes(target)) return "commands";
  if (["platform", "channel", "im", "octo", "dmwork"].includes(target)) return "platform";
  if (["native", "raw", "pass", "slash"].includes(target)) return "native";
  return null;
}

function commandHelpSectionText(section: CommandHelpSection): string {
  if (section === "more") {
    return [
      "Tracevane Channel / more",
      "",
      commandHelpList([
        ["`/help session`", "会话详情、续接、历史、usage、权限批准"],
        ["`/help commands`", "自定义命令、别名和 Skills"],
        ["`/help buffer`", "长回复缓存"],
        ["`/help native`", "Agent 原生命令透传"],
        ["`/help platform`", "Octo 等 IM 平台低频能力"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "session") {
    return [
      "Tracevane Channel / session",
      "",
      commandHelpList([
        ["`/whoami`", "查看当前 IM 用户、频道和 session id"],
        ["`/version`", "查看 Tracevane Channel runtime 版本"],
        ["`/status`", "查看当前 Agent、模型、权限和续接状态"],
        ["`/current`", "查看当前 IM 会话详情"],
        ["`/list`", "列出当前 IM 会话已知 Agent sessions"],
        ["`/switch <序号|sessionId前缀>`", "切换到已知 Agent session"],
        ["`/search <关键字>`", "按名称或 sessionId 搜索 sessions"],
        ["`/name <名称>` / `/name <序号> <名称>`", "命名 session"],
        ["`/delete <序号|sessionId前缀|1,3-5>`", "删除非当前 Agent session 续接记录"],
        ["`/history [条数]`", "查看最近上下文"],
        ["`/usage`", "查看最近 Gateway token usage"],
        ["`/compact` / `/compress`", "先尝试 live persistent Agent 原生 compact；否则 Gateway `/responses/compact` 兜底"],
        ["`/stop`", "停止当前 run"],
        ["`/approve` / `/deny` / `/allow-all`", "回复工具权限请求"],
        ["`/new` / `/reset`", "开启新 Agent 会话 / 清空 override 和续接状态"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "agent") {
    return [
      "Tracevane Channel / agent",
      "",
      commandHelpList([
        ["`/agent`", "列出可切换 Agent Profile"],
        ["`/agent <序号|id|codex|claude-code|opencode>`", "切换本会话 Agent"],
        ["`/model`", "列出 Tracevane Gateway 可用模型"],
        ["`/model <序号|模型ID|default>`", "切换本会话模型"],
        ["`/mode`", "列出权限模式"],
        ["`/mode <suggest|read-only|auto-edit|full-auto|plan|yolo|default>`", "切换权限"],
        ["`/reasoning`", "查看推理强度"],
        ["`/reasoning <序号|low|medium|high|xhigh|default>`", "切换推理强度并断开旧续接"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "display") {
    return [
      "Tracevane Channel / display",
      "",
      commandHelpList([
        ["`/display`", "查看思考、过程回复和工具消息开关"],
        ["`/quiet [quiet|compact|full]`", "按 CC 习惯隐藏或恢复中间态消息"],
        ["`/thinking <on|off|default>`", "开关本会话思考消息"],
        ["`/process <on|off|default>`", "开关本会话过程回复"],
        ["`/tools <on|off|default>`", "开关本会话工具消息"],
        ["`/display progress <1-30|default>`", "设置 Feishu 进度卡最近动态条数"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "vision") {
    return [
      "Tracevane Channel / vision",
      "",
      commandHelpList([
        ["`/vision`", "查看图片/贴图/视频类输入的自动视觉 fallback 设置"],
        ["`/vision on` / `/vision off`", "为当前 IM session 开启或关闭自动视觉模型"],
        ["`/vision default`", "清除当前会话覆盖，回到平台 binding 默认值"],
        ["`/vision model <序号|模型ID>`", "指定当前会话使用的视觉 fallback 模型"],
        ["`/vision model auto`", "清除指定模型，开启后由 Gateway 自动选择健康视觉模型"],
      ]),
      "",
      "当前模型本身支持视觉时不会强制切换；只有当前模型不支持/未知且自动视觉开启时才使用 fallback。",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "buffer") {
    return [
      "Tracevane Channel / buffer",
      "",
      commandHelpList([
        ["`/buffer`", "查看本会话最近 reply buffer"],
        ["`/buffer <id|前缀|latest>`", "读取缓存的完整长回复"],
        ["`/quiet compact`", "隐藏思考、过程回复和工具消息，只保留最终回复"],
        ["`/display`", "查看当前显示开关"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "workdir") {
    return [
      "Tracevane Channel / workdir",
      "",
      commandHelpList([
        ["`/dir`", "查看当前工作目录、最近目录和子目录"],
        ["`/dir <路径|序号|->`", "切换目录；支持绝对路径、`~`、相对路径；序号优先选最近目录，`-` 返回上一目录"],
        ["`/cd <路径|default>`", "`/dir` 的兼容别名"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "commands") {
    return [
      "Tracevane Channel / commands",
      "",
      commandHelpList([
        ["`/commands`", "列出当前 Agent 自定义 prompt 命令"],
        ["`/commands add <名称> <prompt 模板>`", "添加 prompt 命令"],
        ["`/commands addexec [--work-dir <目录>] <名称> <shell 命令>`", "添加 shell 命令（仅管理用户）"],
        ["`/commands del <名称>`", "删除自定义命令"],
        ["`/alias`", "列出当前 binding 命令别名"],
        ["`/alias add <触发词> <命令>`", "添加或更新当前 binding 别名"],
        ["`/alias del <触发词>`", "删除通过 IM 添加的别名"],
        ["`/skills`", "列出当前 Agent Skills"],
        ["`/<skill名称> [参数...]`", "调用 Skill"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "platform") {
    return [
      "Tracevane Channel / platform",
      "",
      commandHelpList([
        ["`/octo groups`", "列出当前 Octo bot 所在群"],
        ["`/octo info [group_no]`", "查看群信息；群内可省略 group_no"],
        ["`/octo members [group_no]`", "查看 Octo 群成员；在群内可省略 group_no"],
        ["`/octo search <名字|关键词>`", "搜索 Octo Space 成员，方便私聊和 @"],
        ["`/octo threads [group_no]`", "查看群 thread"],
        ["`/octo thread <short_id> [group_no]`", "查看 thread 详情"],
        ["`/octo thread-members <short_id> [group_no]`", "查看 thread 成员"],
        ["`/octo group-md [group_no]`", "读取 GROUP.md；群内可省略 group_no"],
        ["`/octo thread-md <short_id> [group_no]`", "读取 THREAD.md；thread 内可省略 short_id"],
      ]),
      "",
      "Agent 可通过 `tracevane-channel-messages` manifest 发送 Octo 私聊/群/thread/@，以及 Feishu chat/open_id/user_id 文本、Markdown 和群 @ 消息。",
      "返回：`/help`",
    ].join("\n");
  }
  return [
    "Tracevane Channel / native",
    "",
    commandHelpList([
      ["`/native /help`", "查看当前 Agent 原生帮助或 skills 命令"],
      ["`/native /compact`", "尝试 CLI Agent 原生压缩；仅持久/交互式 runner 支持，one-shot 兼容路径会拒绝伪执行"],
      ["`/native <原生命令>`", "强制透传给当前 Agent"],
    ]),
    "",
    "返回：`/help`",
  ].join("\n");
}

function commandHelpText(section?: string | null): string {
  const selected = commandHelpSectionAlias(section);
  if (selected) return commandHelpSectionText(selected);
  return [
    "Tracevane Channel",
    "Agent 配置面板。普通消息会交给当前 Agent。",
    "",
    "**配置**",
    commandHelpList([
      ["`/help agent`", "切换 Agent Profile"],
      ["`/help model`", "切换模型"],
      ["`/help mode`", "权限和推理强度"],
      ["`/help display`", "思考、过程回复和工具显示"],
      ["`/help vision`", "图片视觉 fallback"],
      ["`/help workdir`", "工作目录"],
    ]),
    "",
    "**会话动作**",
    commandHelpList([
      ["`/new`", "新会话"],
      ["`/compact`", "压缩上下文"],
      ["`/stop`", "停止运行"],
      ["`/help more`", "会话详情、历史、缓存、命令和原生命令"],
    ]),
    "",
    "未被 Tracevane 占用的 `/xxx` 会自动透传；冲突命令用 `/native <命令>`。",
  ].join("\n");
}

function octoCommandUsageText(): string {
  return [
    "Octo 管理命令：",
    "- `/octo groups`：列出当前 bot 所在群",
    "- `/octo info [group_no]`：查看群信息；Octo 群内可省略 group_no",
    "- `/octo members [group_no]`：查看群成员；Octo 群内可省略 group_no",
    "- `/octo search <名字|关键词>`：搜索 Space 成员，拿 UID 后可私聊或 @",
    "- `/octo threads [group_no]`：列出群 thread",
    "- `/octo thread <short_id> [group_no]`：查看 thread 详情",
    "- `/octo thread-members <short_id> [group_no]`：查看 thread 成员",
    "- `/octo history [条数]`：读取当前群/thread 最近聊天；也可 `/octo history <group_no> [条数]`",
    "- `/octo group-md [group_no]`：读取 GROUP.md；群内可省略 group_no",
    "- `/octo thread-md <short_id> [group_no]`：读取 THREAD.md；thread 内可省略 short_id",
    "- `/octo voice-context`：读取当前 bot owner 的语音纠错上下文",
    "- `/octo download-url <file_path> [file_name]`：获取 Octo 文件下载 URL",
    "",
    "管理命令：",
    "- `/octo edit-message <message_id> <content>`",
    "- `/octo create-group <群名> --members uid1,uid2`",
    "- `/octo update-group <group_no> --name 新名称 --notice 新公告`",
    "- `/octo add-members <group_no> uid1,uid2`",
    "- `/octo remove-members <group_no> uid1,uid2`",
    "- `/octo create-thread <group_no> <thread名称>`",
    "- `/octo delete-thread <short_id> [group_no]`",
    "- `/octo join-thread <short_id> [group_no]` / `/octo leave-thread <short_id> [group_no]`",
    "- `/octo set-group-md [--group group_no] <markdown>`",
    "- `/octo set-thread-md [--group group_no] [--thread short_id] <markdown>`",
    "- `/octo set-voice-context <文本>` / `/octo delete-voice-context`",
  ].join("\n");
}

function octoParentGroupNo(message: ChannelConnectorOctoInboundMessage): string {
  const channelId = normalizeString(message.channelId);
  if (!channelId || !isOctoGroupChannel(message.channelType)) return "";
  const [groupNo] = channelId.split("____");
  return normalizeString(groupNo) || channelId;
}

function octoThreadShortId(message: ChannelConnectorOctoInboundMessage): string {
  const channelId = normalizeString(message.channelId);
  if (!channelId || message.channelType !== 5) return "";
  const [, shortId] = channelId.split("____");
  return normalizeString(shortId);
}

function octoDataItems(value: unknown, keys: string[]): Record<string, unknown>[] {
  const source = Array.isArray(value)
    ? value
    : isRecord(value)
      ? keys
        .map((key) => value[key])
        .find((item) => Array.isArray(item)) || []
      : [];
  return Array.isArray(source)
    ? source.filter(isRecord)
    : [];
}

function octoDecodeSyncedPayload(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const normalized = normalizeString(value);
  if (!normalized) return value;
  try {
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as unknown;
  } catch {
    return value;
  }
}

function octoSyncedMessageText(payload: unknown): string {
  const decoded = octoDecodeSyncedPayload(payload);
  return extractOctoPayloadText(decoded);
}

function octoSyncedMessagesFromData(value: unknown): Record<string, unknown>[] {
  return octoDataItems(value, ["messages", "data", "items"]);
}

function octoSyncedMessageSeq(message: Record<string, unknown>): number | null {
  const seq = Number(message.message_seq ?? message.messageSeq);
  return Number.isFinite(seq) && seq > 0 ? seq : null;
}

function octoRecordString(value: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const normalized = normalizeString(value[key]);
    if (normalized) return normalized;
  }
  return "";
}

function octoRecordNumber(value: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const raw = value[key];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    const parsed = Number(normalizeString(raw));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function octoHumanOrBotLabel(value: Record<string, unknown>): string {
  const robot = octoRecordNumber(value, ["robot", "is_robot", "isBot", "bot"]);
  return robot === 1 || robot === 2 ? "bot" : "human";
}

function octoGroupLine(value: Record<string, unknown>, index: number): string {
  const id = octoRecordString(value, ["group_no", "groupNo", "id"]);
  const name = octoRecordString(value, ["name", "display_name", "displayName"]) || id || "unknown";
  return `${index + 1}. ${name}${id ? ` · ${id}` : ""}`;
}

function octoMemberLine(value: Record<string, unknown>, index: number): string {
  const uid = octoRecordString(value, ["uid", "user_id", "userId", "id"]);
  const name = octoRecordString(value, ["name", "display_name", "displayName", "nickname"]) || uid || "unknown";
  return `${index + 1}. ${name}${uid ? ` · ${uid}` : ""} · ${octoHumanOrBotLabel(value)}`;
}

function octoThreadLine(value: Record<string, unknown>, index: number): string {
  const shortId = octoRecordString(value, ["short_id", "shortId", "id"]);
  const name = octoRecordString(value, ["name", "title"]) || shortId || "unknown";
  const status = octoRecordString(value, ["status"]);
  return `${index + 1}. ${name}${shortId ? ` · ${shortId}` : ""}${status ? ` · status=${status}` : ""}`;
}

function octoSingleRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value;
  if (Array.isArray(value) && isRecord(value[0])) return value[0];
  return {};
}

function octoOkSummary(value: Record<string, unknown>): string {
  const pairs = Object.entries(value)
    .filter(([, item]) => typeof item !== "object" || item === null)
    .map(([key, item]) => `${key}=${String(item)}`)
    .slice(0, 8);
  return pairs.length ? pairs.join(" · ") : "ok=true";
}

function octoMdContent(value: Record<string, unknown>): string {
  return normalizeString(value.content)
    || normalizeString(value.markdown)
    || normalizeString(value.md)
    || "";
}

export function formatChannelConnectorOctoManagementReply(input: {
  action: ChannelConnectorOctoManagementAction;
  result: Pick<ChannelConnectorOctoTransportResult, "ok" | "error" | "data" | "itemCount">;
  groupNo?: string | null;
  shortId?: string | null;
  channelId?: string | null;
  keyword?: string | null;
  name?: string | null;
  content?: string | null;
  filePath?: string | null;
  fileName?: string | null;
  messageId?: string | null;
}): string {
  if (input.result.ok !== true) {
    return `Octo Bot API 调用失败：${input.result.error || "unknown_error"}`;
  }
  if (input.action === "list-groups") {
    const groups = octoDataItems(input.result.data, ["groups", "data", "items"]);
    const count = input.result.itemCount ?? groups.length;
    return [
      `Octo 群列表（${count}）`,
      ...groups.slice(0, 30).map(octoGroupLine),
      groups.length > 30 ? `... 还有 ${groups.length - 30} 个` : "",
      "",
      "查看成员：`/octo members <group_no>`",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "group-info") {
    const info = octoSingleRecord(input.result.data);
    const id = octoRecordString(info, ["group_no", "groupNo", "id"]) || normalizeString(input.groupNo) || "unknown";
    return [
      `Octo 群信息：${id}`,
      `名称：${octoRecordString(info, ["name", "display_name", "displayName"]) || "-"}`,
      `公告：${octoRecordString(info, ["notice", "announcement"]) || "-"}`,
      `创建者：${octoRecordString(info, ["creator", "creator_uid", "creatorUid"]) || "-"}`,
      `状态：${octoRecordString(info, ["status"]) || "-"}`,
      `创建时间：${octoRecordString(info, ["created_at", "createdAt"]) || "-"}`,
    ].join("\n");
  }
  if (input.action === "group-members") {
    const members = octoDataItems(input.result.data, ["members", "data", "items"]);
    const count = input.result.itemCount ?? members.length;
    return [
      `Octo 群成员：${normalizeString(input.groupNo) || "unknown"}（${count}）`,
      ...members.slice(0, 60).map(octoMemberLine),
      members.length > 60 ? `... 还有 ${members.length - 60} 个` : "",
      "",
      "可见回复里可以使用 `@[uid:显示名]`，Tracevane 会转换成 Octo @；私聊用 `tracevane-channel-messages` 的 `dm:<uid>` target。",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "search-members") {
    const members = octoDataItems(input.result.data, ["members", "data", "items"]);
    const count = input.result.itemCount ?? members.length;
    return [
      `Octo Space 成员搜索：${normalizeString(input.keyword) || "all"}（${count}）`,
      ...members.slice(0, 30).map(octoMemberLine),
      members.length > 30 ? `... 还有 ${members.length - 30} 个` : "",
      "",
      "私聊 human target：`dm:<uid>`；群/thread @ 使用 `@[uid:显示名]`，Tracevane 会发送可见 @ 并附带 Octo mention entity。",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "list-threads") {
    const threads = octoDataItems(input.result.data, ["threads", "data", "items"]);
    const count = input.result.itemCount ?? threads.length;
    return [
      `Octo Thread 列表：${normalizeString(input.groupNo) || "unknown"}（${count}）`,
      ...threads.slice(0, 40).map(octoThreadLine),
      threads.length > 40 ? `... 还有 ${threads.length - 40} 个` : "",
      "",
      "查看详情：`/octo thread <short_id> <group_no>`",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "thread-info") {
    const info = octoSingleRecord(input.result.data);
    const shortId = octoRecordString(info, ["short_id", "shortId", "id"]) || normalizeString(input.shortId) || "unknown";
    return [
      `Octo Thread：${shortId}`,
      `群：${normalizeString(input.groupNo) || "-"}`,
      `名称：${octoRecordString(info, ["name", "title"]) || "-"}`,
      `创建者：${octoRecordString(info, ["creator_uid", "creatorUid", "creator"]) || "-"}`,
      `状态：${octoRecordString(info, ["status"]) || "-"}`,
    ].join("\n");
  }
  if (input.action === "thread-members") {
    const members = octoDataItems(input.result.data, ["members", "data", "items"]);
    const count = input.result.itemCount ?? members.length;
    return [
      `Octo Thread 成员：${normalizeString(input.shortId) || "unknown"}（${count}）`,
      ...members.slice(0, 60).map(octoMemberLine),
      members.length > 60 ? `... 还有 ${members.length - 60} 个` : "",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "group-md-read") {
    const info = octoSingleRecord(input.result.data);
    const content = octoMdContent(info);
    const version = octoRecordString(info, ["version"]) || String(octoRecordNumber(info, ["version"]) || "");
    return [
      `Octo GROUP.md：${normalizeString(input.groupNo) || "unknown"}${version ? ` · v${version}` : ""}`,
      content ? "```md" : "",
      content || "（未配置 GROUP.md）",
      content ? "```" : "",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "thread-md-read") {
    const info = octoSingleRecord(input.result.data);
    const content = octoMdContent(info);
    const version = octoRecordString(info, ["version"]) || String(octoRecordNumber(info, ["version"]) || "");
    return [
      `Octo THREAD.md：${normalizeString(input.shortId) || "unknown"}${version ? ` · v${version}` : ""}`,
      `群：${normalizeString(input.groupNo) || "-"}`,
      content ? "```md" : "",
      content || "（未配置 THREAD.md）",
      content ? "```" : "",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "voice-context-read") {
    const info = octoSingleRecord(input.result.data);
    const hasContext = info.has_context === true || info.hasContext === true || Boolean(octoRecordString(info, ["context"]));
    const context = normalizeString(info.context);
    const updatedAt = octoRecordString(info, ["updated_at", "updatedAt"]);
    return [
      `Octo Voice Context：${hasContext ? "已配置" : "未配置"}`,
      updatedAt ? `更新时间：${updatedAt}` : "",
      context ? "```text" : "",
      context || "（未配置语音纠错上下文）",
      context ? "```" : "",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "history") {
    const messages = octoSyncedMessagesFromData(input.result.data)
      .sort((left, right) => (octoSyncedMessageSeq(left) || 0) - (octoSyncedMessageSeq(right) || 0));
    const lines = messages
      .map((message, index) => {
        const seq = octoSyncedMessageSeq(message);
        const sender = octoRecordString(message, ["from_uid", "fromUid", "sender", "uid"]) || "unknown";
        const text = octoSyncedMessageText(message.payload);
        return `${index + 1}. ${seq ? `#${seq} ` : ""}${sender}: ${text || "（空消息）"}`;
      })
      .slice(-60);
    return [
      `Octo 聊天记录：${normalizeString(input.channelId) || normalizeString(input.groupNo) || "当前会话"}（${input.result.itemCount ?? messages.length}）`,
      lines.length ? "```text" : "",
      ...lines,
      lines.length ? "```" : "（没有读取到历史消息）",
    ].filter(Boolean).join("\n");
  }
  if (input.action === "file-download-url") {
    const info = octoSingleRecord(input.result.data);
    const location = octoRecordString(info, ["location", "url", "download_url", "downloadUrl"]);
    return [
      `Octo 文件下载 URL：${normalizeString(input.fileName) || normalizeString(input.filePath) || "unknown"}`,
      location || "（未返回下载 URL）",
    ].join("\n");
  }
  if (input.action === "create-group") {
    const info = octoSingleRecord(input.result.data);
    const id = octoRecordString(info, ["group_no", "groupNo", "id"]);
    const name = octoRecordString(info, ["name", "display_name", "displayName"]) || normalizeString(input.name);
    return `已创建 Octo 群：${name || id || "unknown"}${id ? ` · ${id}` : ""}`;
  }
  if (input.action === "create-thread") {
    const info = octoSingleRecord(input.result.data);
    const shortId = octoRecordString(info, ["short_id", "shortId", "id"]);
    const name = octoRecordString(info, ["name", "title"]) || normalizeString(input.name);
    return `已创建 Octo Thread：${name || shortId || "unknown"}${shortId ? ` · ${shortId}` : ""}`;
  }
  if ([
    "update-group",
    "add-members",
    "remove-members",
    "join-thread",
    "leave-thread",
    "delete-thread",
    "group-md-update",
    "thread-md-update",
    "voice-context-update",
    "voice-context-delete",
    "message-edit",
  ].includes(input.action)) {
    const info = octoSingleRecord(input.result.data);
    const labels: Record<string, string> = {
      "update-group": "已更新 Octo 群信息",
      "add-members": "已添加 Octo 群成员",
      "remove-members": "已移除 Octo 群成员",
      "join-thread": "已加入 Octo Thread",
      "leave-thread": "已离开 Octo Thread",
      "delete-thread": "已删除 Octo Thread",
      "group-md-update": "已更新 Octo GROUP.md",
      "thread-md-update": "已更新 Octo THREAD.md",
      "voice-context-update": "已更新 Octo Voice Context",
      "voice-context-delete": "已删除 Octo Voice Context",
      "message-edit": `已编辑 Octo 消息${normalizeString(input.messageId) ? ` ${normalizeString(input.messageId)}` : ""}`,
    };
    return `${labels[input.action] || "Octo 操作已完成"}：${octoOkSummary(info)}`;
  }
  return "Octo 操作已完成。";
}

const OCTO_MUTATING_ACTIONS = new Set<ChannelConnectorOctoManagementAction>([
  "create-group",
  "update-group",
  "add-members",
  "remove-members",
  "create-thread",
  "delete-thread",
  "join-thread",
  "leave-thread",
  "group-md-update",
  "thread-md-update",
  "voice-context-update",
  "voice-context-delete",
  "message-edit",
]);

function parseOctoOptionArgs(tokens: string[]): {
  positionals: string[];
  options: Record<string, string[]>;
} {
  const positionals: string[] = [];
  const options: Record<string, string[]> = {};
  let currentOption: string | null = null;
  for (const token of tokens) {
    const normalized = normalizeString(token);
    if (!normalized) continue;
    if (normalized.startsWith("--") && normalized.length > 2) {
      currentOption = normalized.slice(2).toLowerCase().replaceAll("-", "_");
      if (!options[currentOption]) options[currentOption] = [];
      continue;
    }
    if (currentOption) {
      options[currentOption].push(normalized);
    } else {
      positionals.push(normalized);
    }
  }
  return { positionals, options };
}

function octoOptionText(
  parsed: ReturnType<typeof parseOctoOptionArgs>,
  names: string[],
): string {
  for (const name of names) {
    const values = parsed.options[name]?.map(normalizeString).filter(Boolean) || [];
    if (values.length) return values.join(" ");
  }
  return "";
}

function octoMemberList(values: string[]): string[] {
  return values
    .flatMap((value) => normalizeString(value).split(/[,\s]+/))
    .map((value) => value.trim())
    .filter(Boolean);
}

function octoOptionMembers(parsed: ReturnType<typeof parseOctoOptionArgs>): string[] {
  return octoMemberList([
    ...(parsed.options.members || []),
    ...(parsed.options.member || []),
    ...(parsed.options.uids || []),
    ...(parsed.options.uid || []),
  ]);
}

async function handleOctoManagementCommand(
  context: ChannelConnectorCommandContext,
  args: string[],
  currentControl: ChannelConnectorSessionControlRecord | null,
): Promise<ChannelConnectorCommandResult> {
  const subcommand = normalizeString(args[0]).toLowerCase();
  if (!subcommand || subcommand === "help" || subcommand === "?") {
    return {
      handled: true,
      command: "octo",
      action: "help",
      ok: true,
      control: currentControl,
      replyText: octoCommandUsageText(),
      passthroughText: null,
    };
  }
  if (normalizeString(context.binding.platform).toLowerCase() !== "octo") {
    return {
      handled: true,
      command: "octo",
      action: "show",
      ok: false,
      control: currentControl,
      replyText: "当前 binding 不是 Octo，不能执行 `/octo` 平台命令。",
      passthroughText: null,
    };
  }
  if (!context.runOctoManagement) {
    return {
      handled: true,
      command: "octo",
      action: "show",
      ok: false,
      control: currentControl,
      replyText: "当前 runtime 未接入 Octo Bot API 管理能力。",
      passthroughText: null,
    };
  }

  const callOcto = async (
    input: Omit<ChannelConnectorOctoManagementRequest, "bindingId" | "sessionKey" | "message">,
    action: ChannelConnectorCommandResult["action"] = "list",
  ): Promise<ChannelConnectorCommandResult> => {
    if (OCTO_MUTATING_ACTIONS.has(input.action) && !canManageSession(context.binding, context.message)) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "当前用户没有管理该 Octo binding 的权限。",
        passthroughText: null,
      };
    }
    const result = await context.runOctoManagement?.({
      ...input,
      bindingId: context.binding.id,
      sessionKey: context.sessionKey,
      message: context.message,
    }) || {
      ok: false,
      replyText: "当前 runtime 未接入 Octo Bot API 管理能力。",
      error: "octo_management_unavailable",
    };
    return {
      handled: true,
      command: "octo",
      action,
      ok: result.ok,
      control: currentControl,
      replyText: result.replyText,
      passthroughText: null,
    };
  };

  if (["groups", "group", "list", "list-groups"].includes(subcommand)) {
    return callOcto({ action: "list-groups" });
  }
  if (["info", "group-info", "show"].includes(subcommand)) {
    const groupNo = normalizeString(args[1]) || octoParentGroupNo(context.message);
    if (!groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo info <group_no>`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "group-info", groupNo }, "show");
  }
  if (["members", "member", "group-members"].includes(subcommand)) {
    const groupNo = normalizeString(args[1]) || octoParentGroupNo(context.message);
    if (!groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo members <group_no>`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "group-members", groupNo }, "show");
  }
  if (["search", "find", "space", "space-members", "search-members"].includes(subcommand)) {
    const keyword = normalizeString(args.slice(1).join(" "));
    if (!keyword) {
      return {
        handled: true,
        command: "octo",
        action: "list",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo search <名字|关键词>`",
        passthroughText: null,
      };
    }
    return callOcto({ action: "search-members", keyword, limit: 30 });
  }
  if (["threads", "list-threads"].includes(subcommand)) {
    const groupNo = normalizeString(args[1]) || octoParentGroupNo(context.message);
    if (!groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "list",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo threads <group_no>`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "list-threads", groupNo });
  }
  if (["thread", "thread-info", "get-thread"].includes(subcommand)) {
    const shortId = normalizeString(args[1]);
    const groupNo = normalizeString(args[2]) || octoParentGroupNo(context.message);
    if (!shortId || !groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo thread <short_id> <group_no>`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "thread-info", groupNo, shortId }, "show");
  }
  if (["thread-members", "list-thread-members"].includes(subcommand)) {
    const shortId = normalizeString(args[1]);
    const groupNo = normalizeString(args[2]) || octoParentGroupNo(context.message);
    if (!shortId || !groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo thread-members <short_id> <group_no>`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "thread-members", groupNo, shortId }, "show");
  }
  if (["history", "messages", "sync", "sync-messages"].includes(subcommand)) {
    const first = normalizeString(args[1]);
    const second = normalizeString(args[2]);
    const firstAsLimit = Number(first);
    const hasNumericFirst = Boolean(first) && Number.isFinite(firstAsLimit);
    const channelId = hasNumericFirst
      ? context.message.channelType === 1 ? normalizeString(context.message.fromUid) : normalizeString(context.message.channelId)
      : first || (context.message.channelType === 1 ? normalizeString(context.message.fromUid) : normalizeString(context.message.channelId));
    const channelType = first && !hasNumericFirst && first.includes("____") ? 5 : context.message.channelType;
    const parsedLimit = hasNumericFirst ? firstAsLimit : Number(second);
    const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, Math.floor(parsedLimit))) : 20;
    const currentSeq = typeof context.message.messageSeq === "number" && Number.isFinite(context.message.messageSeq)
      ? context.message.messageSeq
      : null;
    if (!channelId) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo history [条数]`；也可 `/octo history <group_no|channel_id> [条数]`。",
        passthroughText: null,
      };
    }
    return callOcto({
      action: "history",
      channelId,
      channelType,
      groupNo: octoParentGroupNo(context.message) || null,
      limit,
      endMessageSeq: currentSeq && currentSeq > 1 ? currentSeq - 1 : 0,
    }, "show");
  }
  if (["group-md", "group-md-read", "read-group-md"].includes(subcommand)) {
    const groupNo = normalizeString(args[1]) || octoParentGroupNo(context.message);
    if (!groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo group-md <group_no>`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "group-md-read", groupNo }, "show");
  }
  if (["thread-md", "thread-md-read", "read-thread-md"].includes(subcommand)) {
    const shortId = normalizeString(args[1]) || octoThreadShortId(context.message);
    const groupNo = normalizeString(args[2]) || octoParentGroupNo(context.message);
    if (!shortId || !groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo thread-md <short_id> <group_no>`；在 Octo thread 里可以省略 short_id 和 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "thread-md-read", groupNo, shortId }, "show");
  }
  if (["voice-context", "voice-context-read", "read-voice-context"].includes(subcommand)) {
    return callOcto({ action: "voice-context-read" }, "show");
  }
  if (["download-url", "file-download-url", "download", "file-url"].includes(subcommand)) {
    const filePath = normalizeString(args[1]);
    const fileName = normalizeString(args[2]) || null;
    if (!filePath) {
      return {
        handled: true,
        command: "octo",
        action: "show",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo download-url <file_path> [file_name]`",
        passthroughText: null,
      };
    }
    return callOcto({ action: "file-download-url", filePath, fileName }, "show");
  }
  if (["create-group", "new-group"].includes(subcommand)) {
    const parsed = parseOctoOptionArgs(args.slice(1));
    const name = octoOptionText(parsed, ["name"]) || parsed.positionals.join(" ");
    const members = octoOptionMembers(parsed);
    if (!members.length) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo create-group <群名> --members uid1,uid2`",
        passthroughText: null,
      };
    }
    return callOcto({
      action: "create-group",
      name: name || null,
      members,
      creator: context.message.fromUid,
    }, "set");
  }
  if (["update-group", "set-group"].includes(subcommand)) {
    const hasExplicitGroupNo = Boolean(normalizeString(args[1]));
    const groupNo = normalizeString(args[1]) || octoParentGroupNo(context.message);
    const parsed = parseOctoOptionArgs(args.slice(hasExplicitGroupNo ? 2 : 1));
    const name = octoOptionText(parsed, ["name"]);
    const notice = octoOptionText(parsed, ["notice", "announcement"]);
    if (!groupNo || (!name && !notice)) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo update-group <group_no> --name 新名称 --notice 新公告`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "update-group", groupNo, name, notice }, "set");
  }
  if (["set-group-md", "update-group-md", "group-md-update"].includes(subcommand)) {
    const currentGroupNo = octoParentGroupNo(context.message);
    const parsed = parseOctoOptionArgs(args.slice(1));
    const optionGroupNo = octoOptionText(parsed, ["group", "group_no", "groupno"]);
    const groupNo = optionGroupNo || currentGroupNo || normalizeString(parsed.positionals[0]);
    const positionalContent = currentGroupNo || optionGroupNo
      ? parsed.positionals.join(" ")
      : parsed.positionals.slice(1).join(" ");
    const content = octoOptionText(parsed, ["content", "md", "markdown", "text"]) || normalizeString(positionalContent);
    if (!groupNo || !content) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo set-group-md [--group group_no] <markdown>`；在 Octo 群聊里可省略 --group。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "group-md-update", groupNo, content }, "set");
  }
  if (["set-voice-context", "update-voice-context", "voice-context-update"].includes(subcommand)) {
    const parsed = parseOctoOptionArgs(args.slice(1));
    const content = octoOptionText(parsed, ["content", "text", "context"]) || normalizeString(parsed.positionals.join(" "));
    if (!content) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo set-voice-context <语音纠错上下文>`",
        passthroughText: null,
      };
    }
    return callOcto({ action: "voice-context-update", content }, "set");
  }
  if (["add-members", "add-member", "remove-members", "remove-member"].includes(subcommand)) {
    const hasExplicitGroupNo = Boolean(normalizeString(args[1]));
    const groupNo = normalizeString(args[1]) || octoParentGroupNo(context.message);
    const members = octoMemberList(args.slice(hasExplicitGroupNo ? 2 : 1));
    const action: ChannelConnectorOctoManagementAction = subcommand.startsWith("remove") ? "remove-members" : "add-members";
    if (!groupNo || !members.length) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: `用法：\`/octo ${action} <group_no> uid1,uid2\`；在 Octo 群聊里可以省略 group_no。`,
        passthroughText: null,
      };
    }
    return callOcto({ action, groupNo, members }, "set");
  }
  if (["create-thread", "new-thread"].includes(subcommand)) {
    const currentGroupNo = octoParentGroupNo(context.message);
    const explicitGroupNo = normalizeString(args[1]);
    const useCurrentGroup = Boolean(currentGroupNo) && args.length <= 2;
    const groupNo = useCurrentGroup ? currentGroupNo : explicitGroupNo;
    const name = normalizeString((useCurrentGroup ? args.slice(1) : args.slice(2)).join(" "));
    if (!groupNo || !name) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo create-thread <group_no> <thread名称>`；在 Octo 群聊里可以省略 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "create-thread", groupNo, name }, "set");
  }
  if (["delete-thread", "remove-thread"].includes(subcommand)) {
    const shortId = normalizeString(args[1]) || octoThreadShortId(context.message);
    const groupNo = normalizeString(args[2]) || octoParentGroupNo(context.message);
    if (!shortId || !groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo delete-thread <short_id> <group_no>`；在 Octo thread 里可以省略 short_id 和 group_no。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "delete-thread", groupNo, shortId }, "set");
  }
  if (["delete-voice-context", "remove-voice-context", "voice-context-delete"].includes(subcommand)) {
    return callOcto({ action: "voice-context-delete" }, "set");
  }
  if (["edit-message", "message-edit", "edit"].includes(subcommand)) {
    const messageId = normalizeString(args[1]);
    const content = normalizeString(args.slice(2).join(" "));
    if (!messageId || !content) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo edit-message <message_id> <content>`",
        passthroughText: null,
      };
    }
    return callOcto({ action: "message-edit", messageId, content }, "set");
  }
  if (["set-thread-md", "update-thread-md", "thread-md-update"].includes(subcommand)) {
    const currentGroupNo = octoParentGroupNo(context.message);
    const currentShortId = octoThreadShortId(context.message);
    const parsed = parseOctoOptionArgs(args.slice(1));
    const optionGroupNo = octoOptionText(parsed, ["group", "group_no", "groupno"]);
    const optionShortId = octoOptionText(parsed, ["thread", "short_id", "shortid"]);
    const groupNo = optionGroupNo || currentGroupNo || normalizeString(parsed.positionals[0]);
    const shortId = optionShortId
      || currentShortId
      || (currentGroupNo ? normalizeString(parsed.positionals[0]) : normalizeString(parsed.positionals[1]));
    const positionalStart = currentShortId || (optionGroupNo && optionShortId)
      ? 0
      : currentGroupNo || optionGroupNo || optionShortId
        ? 1
        : 2;
    const positionalContent = parsed.positionals.slice(positionalStart).join(" ");
    const content = octoOptionText(parsed, ["content", "md", "markdown", "text"]) || normalizeString(positionalContent);
    if (!groupNo || !shortId || !content) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：`/octo set-thread-md [--group group_no] [--thread short_id] <markdown>`；在 Octo thread 里可省略 --group 和 --thread。",
        passthroughText: null,
      };
    }
    return callOcto({ action: "thread-md-update", groupNo, shortId, content }, "set");
  }
  if (["join-thread", "leave-thread"].includes(subcommand)) {
    const shortId = normalizeString(args[1]);
    const groupNo = normalizeString(args[2]) || octoParentGroupNo(context.message);
    if (!shortId || !groupNo) {
      return {
        handled: true,
        command: "octo",
        action: "set",
        ok: false,
        control: currentControl,
        replyText: `用法：\`/octo ${subcommand} <short_id> <group_no>\`；在 Octo 群聊里可以省略 group_no。`,
        passthroughText: null,
      };
    }
    return callOcto({ action: subcommand as "join-thread" | "leave-thread", groupNo, shortId }, "set");
  }
  return {
    handled: true,
    command: "octo",
    action: "help",
    ok: false,
    control: currentControl,
    replyText: octoCommandUsageText(),
    passthroughText: null,
  };
}

function projectListText(
  config: ChannelConnectorsDaemonRuntimeConfig,
  currentProject: ChannelConnectorRuntimeProject,
): string {
  const lines = ["可用 Agent Profile："];
  config.projects.forEach((project, index) => {
    const marker = project.id === currentProject.id ? ">" : " ";
    lines.push(`${marker} ${index + 1}. ${project.id} (${project.agent}) model=${project.model || "default"} mode=${project.permissionMode}`);
  });
  lines.push("用法：/agent <序号|id|agent>");
  return lines.join("\n");
}

function modeListText(currentMode: ChannelConnectorPermissionMode): string {
  const lines = ["权限模式："];
  for (const mode of PERMISSION_MODES) {
    const marker = mode === currentMode ? ">" : " ";
    lines.push(`${marker} ${mode}`);
  }
  lines.push("用法：/mode <mode>，例如 /mode yolo；/mode default 恢复 Agent Profile 默认值。");
  return lines.join("\n");
}

function resolveWorkDirTarget(input: string, currentWorkDir: string): string | null {
  const target = normalizeString(input);
  if (!target) return null;
  if (["default", "reset", "profile"].includes(target.toLowerCase())) return "";
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1) {
    const child = listChildDirectories(currentWorkDir)[index - 1];
    if (child) return path.resolve(currentWorkDir, child);
  }
  let next = target;
  if (next === "~" || next.startsWith("~/")) {
    next = path.join(os.homedir(), next.slice(2));
  } else if (!path.isAbsolute(next)) {
    next = path.join(currentWorkDir || process.cwd(), next);
  }
  return path.resolve(next);
}

function normalizeWorkDirHistory(control: ChannelConnectorSessionControlRecord | null): string[] {
  return uniqueStrings(control?.workDirHistory || [])
    .map((item) => path.resolve(item))
    .slice(0, 10);
}

function nextWorkDirHistory(input: {
  control: ChannelConnectorSessionControlRecord | null;
  previousWorkDir: string;
  nextWorkDir: string;
}): string[] {
  const previous = path.resolve(input.previousWorkDir);
  const next = path.resolve(input.nextWorkDir);
  return uniqueStrings([previous, ...normalizeWorkDirHistory(input.control)])
    .filter((item) => path.resolve(item) !== next)
    .slice(0, 10);
}

function resolveWorkDirTargetWithHistory(
  input: string,
  currentWorkDir: string,
  history: string[],
): string | null {
  const target = normalizeString(input);
  if (!target) return null;
  const normalized = target.toLowerCase();
  const parts = target.split(/\s+/).filter(Boolean);
  const first = parts[0]?.toLowerCase() || "";
  const second = parts[1] || "";
  if (target === "-" || normalized === "previous" || normalized === "prev" || normalized === "back") return history[0] || null;
  if (normalized === "home" || normalized === "~") return os.homedir();
  if (normalized === "parent" || normalized === "up" || normalized === "..") return path.dirname(currentWorkDir);
  if (first === "recent" || first === "history") {
    const index = Number(second || "1");
    if (Number.isInteger(index) && index >= 1 && index <= history.length) return history[index - 1] || null;
    return null;
  }
  if (first === "child" || first === "subdir" || first === "children") {
    const index = Number(second || "1");
    if (Number.isInteger(index) && index >= 1) {
      const child = listChildDirectories(currentWorkDir)[index - 1];
      if (child) return path.resolve(currentWorkDir, child);
    }
    return null;
  }
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1 && index <= history.length) {
    return history[index - 1] || null;
  }
  return resolveWorkDirTarget(target, currentWorkDir);
}

const WORKDIR_CHILD_PAGE_SIZE = 10;
const WORKDIR_CHILD_SCAN_LIMIT = 500;

function listChildDirectories(workDir: string): string[] {
  try {
    return fs.readdirSync(workDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, WORKDIR_CHILD_SCAN_LIMIT);
  } catch {
    return [];
  }
}

function parseWorkDirPage(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1;
}

function parseWorkDirListingRequest(args: string[]): { page: number; search: string | null } | null {
  const first = normalizeString(args[0]).toLowerCase();
  if (!args.length || ["help", "usage", "?"].includes(first)) return { page: 1, search: null };
  if (first === "page") return { page: parseWorkDirPage(args[1]), search: null };
  if (first === "find" || first === "search") {
    const rest = args.slice(1);
    const pageIndex = rest.findIndex((part) => normalizeString(part).toLowerCase() === "page");
    const searchParts = pageIndex >= 0 ? rest.slice(0, pageIndex) : rest;
    const search = normalizeString(searchParts.join(" ")) || null;
    return {
      page: pageIndex >= 0 ? parseWorkDirPage(rest[pageIndex + 1]) : 1,
      search,
    };
  }
  return null;
}

function directoryInfoText(
  project: ChannelConnectorRuntimeProject,
  control: ChannelConnectorSessionControlRecord | null,
  options: { page?: number; search?: string | null } = {},
): string {
  const allChildren = listChildDirectories(project.workDir);
  const search = normalizeString(options.search).toLowerCase();
  const filteredChildren = search
    ? allChildren.filter((name) => name.toLowerCase().includes(search))
    : allChildren;
  const pageCount = Math.max(1, Math.ceil(filteredChildren.length / WORKDIR_CHILD_PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(options.page || 1)));
  const pageStart = (page - 1) * WORKDIR_CHILD_PAGE_SIZE;
  const children = filteredChildren.slice(pageStart, pageStart + WORKDIR_CHILD_PAGE_SIZE);
  const history = normalizeWorkDirHistory(control)
    .filter((item) => path.resolve(item) !== path.resolve(project.workDir))
    .slice(0, 10);
  const lines = [`当前工作目录：${project.workDir}`];
  lines.push(`子目录：${allChildren.length} 个${search ? `；搜索「${options.search}」命中 ${filteredChildren.length} 个` : ""}；第 ${page}/${pageCount} 页`);
  if (history.length) {
    lines.push("", "最近目录：");
    history.forEach((name, index) => lines.push(`${index + 1}. ${name}`));
  }
  if (children.length) {
    lines.push("", "当前页子目录：");
    children.forEach((name) => lines.push(`- ${name} -> /cd ${path.resolve(project.workDir, name)}`));
  } else if (search) {
    lines.push("", "当前搜索没有匹配的子目录。");
  }
  lines.push("", "用法：/dir <路径|序号|->；/cd <路径|default>；/dir home；/dir parent；/dir recent <序号>；/dir child <序号>；/dir page <页码>；/dir find <关键字>。序号优先选择最近目录，历史为空时选择子目录。");
  return lines.join("\n");
}

function effectiveToggle(value: boolean | null | undefined): boolean {
  return value !== false;
}

function bindingMetadataRecord(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">): Record<string, unknown> {
  return isRecord(binding.metadata) ? binding.metadata : {};
}

function bindingMetadataString(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">, keys: string[]): string {
  const metadata = bindingMetadataRecord(binding);
  for (const key of keys) {
    const value = normalizeString(metadata[key]);
    if (value) return value;
  }
  return "";
}

function bindingMetadataBoolean(
  binding: Pick<ChannelConnectorRuntimeBinding, "metadata">,
  keys: string[],
  fallback = false,
): boolean {
  const metadata = bindingMetadataRecord(binding);
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") return value;
    const normalized = normalizeString(value).toLowerCase();
    if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) return true;
    if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
  }
  return fallback;
}

function bindingMetadataNumber(
  binding: Pick<ChannelConnectorRuntimeBinding, "metadata">,
  keys: string[],
  fallback: number,
): number {
  const metadata = bindingMetadataRecord(binding);
  for (const key of keys) {
    const value = Number(metadata[key]);
    if (Number.isFinite(value)) return value;
  }
  return fallback;
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.floor(value)));
}

function feishuProgressCardEntryLimit(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">): number {
  return clampInteger(bindingMetadataNumber(binding, [
    "feishuProgressCardEntryLimit",
    "feishu_progress_card_entry_limit",
    "progressCardEntryLimit",
    "progress_card_entry_limit",
  ], 8), 1, 30);
}

function parseFeishuProgressCardEntryLimit(value: string): number | "default" | "status" | "invalid" {
  const normalized = normalizeString(value).toLowerCase();
  if (!normalized || ["status", "current", "list"].includes(normalized)) return "status";
  if (["default", "reset", "profile", "inherit"].includes(normalized)) return "default";
  const numberValue = Number(normalized);
  if (!Number.isFinite(numberValue)) return "invalid";
  const integerValue = Math.floor(numberValue);
  if (integerValue < 1 || integerValue > 30) return "invalid";
  return integerValue;
}

function visionModelFromBindingMetadata(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">): string | null {
  return bindingMetadataString(binding, [
    "autoVisionModelId",
    "auto_vision_model_id",
    "visionModel",
    "vision_model",
    "visualModel",
    "visual_model",
  ]) || null;
}

function bindingAutoVisionModel(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">): boolean {
  return bindingMetadataBoolean(binding, [
    "autoVisionModel",
    "auto_vision_model",
    "visionAutoModel",
    "vision_auto_model",
  ], false);
}

function effectiveVisionSetting(
  binding: Pick<ChannelConnectorRuntimeBinding, "metadata">,
  control: ChannelConnectorSessionControlRecord | null,
): {
  enabled: boolean;
  enabledSource: "session" | "binding";
  model: string | null;
  modelSource: "session" | "binding" | "auto";
} {
  const bindingEnabled = bindingAutoVisionModel(binding);
  const bindingModel = visionModelFromBindingMetadata(binding);
  const sessionVisionModel = control?.visionModel || null;
  const sessionAutoModel = sessionVisionModel === AUTO_VISION_MODEL_SENTINEL;
  return {
    enabled: control?.autoVisionModel ?? bindingEnabled,
    enabledSource: control?.autoVisionModel === null || control?.autoVisionModel === undefined ? "binding" : "session",
    model: sessionAutoModel ? null : sessionVisionModel || bindingModel,
    modelSource: sessionVisionModel ? "session" : bindingModel ? "binding" : "auto",
  };
}

function toggleStatusText(
  binding: Pick<ChannelConnectorRuntimeBinding, "metadata">,
  control: ChannelConnectorSessionControlRecord | null,
): string {
  const thinking = effectiveToggle(control?.thinkingMessages);
  const process = effectiveToggle(control?.processMessages);
  const tools = effectiveToggle(control?.toolMessages);
  const progressLimit = feishuProgressCardEntryLimit(binding);
  return [
    "显示设置：",
    `思考消息：${thinking ? "开启" : "关闭"}${control?.thinkingMessages === null || control?.thinkingMessages === undefined ? " (默认)" : ""}`,
    `过程回复：${process ? "开启" : "关闭"}${control?.processMessages === null || control?.processMessages === undefined ? " (默认)" : ""}`,
    `工具消息：${tools ? "开启" : "关闭"}${control?.toolMessages === null || control?.toolMessages === undefined ? " (默认)" : ""}`,
    `Feishu 进度卡最近动态：${progressLimit} 条`,
    "用法：/quiet 隐藏/恢复中间态；/thinking <on|off|default>；/process <on|off|default>；/tools <on|off|default>；/display progress <1-30|default>；/display default 恢复默认。",
  ].join("\n");
}

function parseToggleTarget(input: string): boolean | null | "status" | "invalid" {
  const value = normalizeString(input).toLowerCase();
  if (!value || ["status", "current", "list"].includes(value)) return "status";
  if (["on", "enable", "enabled", "true", "1", "start", "open", "开启"].includes(value)) return true;
  if (["off", "disable", "disabled", "false", "0", "stop", "close", "关闭"].includes(value)) return false;
  if (["default", "reset", "profile", "inherit"].includes(value)) return null;
  return "invalid";
}

function toggleLabel(value: boolean | null): string {
  if (value === true) return "开启";
  if (value === false) return "关闭";
  return "默认开启";
}

function visionStatusText(input: {
  binding: ChannelConnectorRuntimeBinding;
  control: ChannelConnectorSessionControlRecord | null;
  project: ChannelConnectorRuntimeProject;
  visionModels: string[];
}): string {
  const setting = effectiveVisionSetting(input.binding, input.control);
  const lines = [
    "视觉模型设置：",
    `自动视觉 fallback：${setting.enabled ? "开启" : "关闭"}${setting.enabledSource === "session" ? " (当前会话覆盖)" : " (binding 默认)"}`,
    `指定视觉模型：${setting.model || "auto"}${setting.modelSource === "session" ? " (当前会话覆盖)" : setting.modelSource === "binding" ? " (binding 默认)" : ""}`,
    `当前会话模型：${input.project.model || "default"}`,
    "规则：当前模型本身支持视觉时保持当前模型；只有当前模型不支持/未知且自动视觉开启时才使用 fallback。",
    "",
    "可选视觉模型：",
  ];
  if (input.visionModels.length) {
    input.visionModels.forEach((model, index) => {
      const marker = model === setting.model ? ">" : " ";
      lines.push(`${marker} ${index + 1}. ${model}`);
    });
  } else {
    lines.push("  暂无 Gateway vision 模型；请先在 Provider/模型能力里标记并 smoke 验证。");
  }
  lines.push("", "用法：/vision on|off|default；/vision model <序号|模型ID|auto>。");
  return lines.join("\n");
}

type QuietTarget = "toggle" | "quiet" | "compact" | "full" | "status" | "invalid";

function parseQuietTarget(input: string): QuietTarget {
  const value = normalizeString(input).toLowerCase();
  if (!value) return "toggle";
  if (["status", "current", "list"].includes(value)) return "status";
  if (["quiet", "on", "enable", "enabled", "true", "1", "hide", "silent", "静音"].includes(value)) {
    return "quiet";
  }
  if (["compact", "compress"].includes(value)) return "compact";
  if (["full", "off", "disable", "disabled", "false", "0", "default", "reset", "show", "恢复"].includes(value)) {
    return "full";
  }
  return "invalid";
}

function isQuietMode(control: ChannelConnectorSessionControlRecord | null): boolean {
  return !effectiveToggle(control?.thinkingMessages)
    && !effectiveToggle(control?.processMessages)
    && !effectiveToggle(control?.toolMessages);
}

function quietModeReply(mode: "quiet" | "compact" | "full"): string {
  if (mode === "full") {
    return "Quiet mode OFF：已恢复本 IM 会话默认中间态显示；最终回复不受影响。";
  }
  if (mode === "compact") {
    return "Compact display ON：已按 CC /quiet compact 习惯隐藏本 IM 会话思考、过程回复和工具中间态；最终回复不受影响。";
  }
  return "Quiet mode ON：已隐藏本 IM 会话思考、过程回复和工具中间态；最终回复不受影响。";
}

function bufferPreviewText(value: string, maxRunes = 120): string {
  const runes = Array.from(value);
  const preview = runes.slice(0, maxRunes).join("");
  return runes.length > maxRunes ? `${preview}...` : preview;
}

function shortIdentifier(value: string | null | undefined, maxRunes = 12): string {
  const normalized = normalizeString(value);
  if (!normalized) return "-";
  return bufferPreviewText(normalized, maxRunes);
}

function parsePositiveLimit(value: string | null | undefined, fallback: number, max = CHANNEL_CONNECTOR_HISTORY_CONTEXT_LIMIT): number {
  const parsed = Number(normalizeString(value));
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.max(1, Math.min(max, parsed));
}

function replyBufferListText(records: ChannelConnectorReplyBufferRecord[]): string {
  if (!records.length) {
    return [
      "当前 IM 会话没有缓存的长回复。",
      "群聊中超长 Agent 回复会自动保存到 reply buffer，并在群内发送 buffer id。",
    ].join("\n");
  }
  const lines = ["本会话最近 reply buffer："];
  records.forEach((record, index) => {
    lines.push(`${index + 1}. ${record.id} · ${record.replyRunes} 字符 · ${record.createdAt}`);
    lines.push(`   ${bufferPreviewText(record.previewText || record.replyText)}`);
  });
  lines.push("用法：/buffer <id|前缀|latest>");
  return lines.join("\n");
}

function replyBufferRecordText(record: ChannelConnectorReplyBufferRecord): string {
  return [
    "Tracevane Reply Buffer",
    `ID: ${record.id}`,
    `Platform: ${record.platform}`,
    `Created: ${record.createdAt}`,
    `Message: ${record.messageId || "-"}`,
    `Length: ${record.replyRunes} 字符`,
    "",
    record.replyText,
  ].join("\n");
}

function handleReplyBufferCommand(
  context: ChannelConnectorCommandContext,
  args: string[],
  currentControl: ChannelConnectorSessionControlRecord | null,
  commandName: string,
): ChannelConnectorCommandResult {
  const filePath = normalizeString(context.replyBuffersPath);
  if (!filePath) {
    return {
      handled: true,
      command: commandName,
      action: "list",
      ok: false,
      control: currentControl,
      replyText: "Reply buffer 尚未启用。",
      passthroughText: null,
    };
  }
  const target = normalizeString(args.join(" "));
  if (!target) {
    const records = listChannelConnectorReplyBuffersForSession(filePath, {
      ...controlsLookup(context),
      limit: 10,
    });
    return {
      handled: true,
      command: commandName,
      action: "list",
      ok: true,
      control: currentControl,
      replyText: replyBufferListText(records),
      passthroughText: null,
    };
  }

  const records = listChannelConnectorReplyBuffersForSession(filePath, {
    ...controlsLookup(context),
    limit: 10,
  });
  if (["latest", "last", "newest"].includes(target.toLowerCase())) {
    const latest = records[0] || null;
    return {
      handled: true,
      command: commandName,
      action: "show",
      ok: Boolean(latest),
      control: currentControl,
      replyText: latest ? replyBufferRecordText(latest) : replyBufferListText([]),
      passthroughText: null,
    };
  }

  const lookup = findChannelConnectorReplyBufferForSession(filePath, {
    ...controlsLookup(context),
    bufferId: target,
  });
  if (lookup.record) {
    return {
      handled: true,
      command: commandName,
      action: "show",
      ok: true,
      control: currentControl,
      replyText: replyBufferRecordText(lookup.record),
      passthroughText: null,
    };
  }
  if (lookup.matches.length > 1) {
    return {
      handled: true,
      command: commandName,
      action: "list",
      ok: false,
      control: currentControl,
      replyText: [
        `前缀匹配到 ${lookup.matches.length} 个 reply buffer，请输入更长 id：`,
        replyBufferListText(lookup.matches.slice(0, 10)),
      ].join("\n"),
      passthroughText: null,
    };
  }
  return {
    handled: true,
    command: commandName,
    action: "list",
    ok: false,
    control: currentControl,
    replyText: `未找到本会话 reply buffer：${target}\n\n${replyBufferListText(records)}`,
    passthroughText: null,
  };
}

function normalizeGatewayModelFeatures(value: unknown): ChannelConnectorGatewayModel["features"] {
  const record = typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const features: ChannelConnectorGatewayModel["features"] = {};
  for (const key of ["text", "streaming", "tools", "vision", "reasoning", "responses"] as const) {
    if (typeof record[key] === "boolean") features[key] = record[key];
  }
  return features;
}

function normalizeGatewayStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? uniqueStrings(value.map((item) => normalizeString(item)))
    : [];
}

function normalizeGatewayPositiveInteger(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const normalized = Math.floor(value);
  return normalized > 0 ? normalized : null;
}

export async function listChannelConnectorGatewayModelCatalog(
  endpoint: string,
  clientKey: string | null,
): Promise<ChannelConnectorGatewayModel[]> {
  const url = `${endpoint.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (clientKey) headers.authorization = `Bearer ${clientKey}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Gateway models failed with HTTP ${response.status}`);
  const raw = await response.json() as { data?: Array<Record<string, unknown>> };
  const seen = new Set<string>();
  const models: ChannelConnectorGatewayModel[] = [];
  for (const item of raw.data || []) {
    const id = normalizeString(item.id);
    const key = id.toLowerCase();
    if (!id || seen.has(key)) continue;
    seen.add(key);
    models.push({
      id,
      contextWindow: normalizeGatewayPositiveInteger(item.contextWindow),
      maxOutputTokens: normalizeGatewayPositiveInteger(item.maxOutputTokens),
      aliases: normalizeGatewayStringArray(item.aliases),
      providerIds: normalizeGatewayStringArray(item.providerIds),
      healthyProviderIds: normalizeGatewayStringArray(item.healthyProviderIds),
      openCircuitProviderIds: normalizeGatewayStringArray(item.openCircuitProviderIds),
      features: normalizeGatewayModelFeatures(item.features),
    });
  }
  return models;
}

export async function listChannelConnectorGatewayModels(endpoint: string, clientKey: string | null): Promise<string[]> {
  const catalog = await listChannelConnectorGatewayModelCatalog(endpoint, clientKey);
  return uniqueStrings(catalog.map((item) => item.id));
}

async function listModelsForCommand(context: ChannelConnectorCommandContext): Promise<string[]> {
  const effectiveControl = getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context));
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, effectiveControl);
  try {
    const models = await (context.listModels || listChannelConnectorGatewayModels)(
      currentProject.gatewayEndpoint || context.config.gateway.endpoint,
      context.gatewayClientKey,
    );
    if (models.length) return models;
  } catch {
    // Fall back to configured profile models below.
  }
  return uniqueStrings(context.config.projects.map((project) => project.model || "").filter(Boolean));
}

function gatewayModelHasHealthyProvider(model: ChannelConnectorGatewayModel): boolean {
  if ((model.healthyProviderIds || []).length > 0) return true;
  if ((model.openCircuitProviderIds || []).length > 0) return false;
  return true;
}

async function listVisionModelsForCommand(context: ChannelConnectorCommandContext): Promise<string[]> {
  const effectiveControl = getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context));
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, effectiveControl);
  try {
    const catalog = await (context.listModelCatalog || listChannelConnectorGatewayModelCatalog)(
      currentProject.gatewayEndpoint || context.config.gateway.endpoint,
      context.gatewayClientKey,
    );
    const models = catalog
      .filter((model) => model.features.vision === true && gatewayModelHasHealthyProvider(model))
      .map((model) => model.id);
    if (models.length) return uniqueStrings(models);
  } catch {
    // Fall back to configured profile models below.
  }
  return uniqueStrings(context.config.projects.map((project) => project.model || "").filter(Boolean));
}

function resolveModelTarget(input: string, models: string[]): string | null {
  const target = normalizeString(input);
  if (!target) return null;
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1 && index <= models.length) return models[index - 1] || null;
  const exact = models.find((model) => model.toLowerCase() === target.toLowerCase());
  return exact || target;
}

function resolveListedModelTarget(input: string, models: string[]): string | null {
  const target = normalizeString(input);
  if (!target) return null;
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1 && index <= models.length) return models[index - 1] || null;
  return models.find((model) => model.toLowerCase() === target.toLowerCase()) || null;
}

async function contextBudgetForCommand(input: {
  context: ChannelConnectorCommandContext;
  project: ChannelConnectorRuntimeProject;
  usageSummary?: ChannelConnectorUsageSummary | null;
}): Promise<ReturnType<typeof resolveChannelConnectorContextBudget>> {
  let catalog: ChannelConnectorGatewayModel[] = [];
  try {
    catalog = await (input.context.listModelCatalog || listChannelConnectorGatewayModelCatalog)(
      input.project.gatewayEndpoint || input.context.config.gateway.endpoint,
      input.context.gatewayClientKey,
    );
  } catch {
    catalog = [];
  }
  const history = input.context.conversationHistoryPath
    ? getChannelConnectorConversationHistory(input.context.conversationHistoryPath, controlsLookup(input.context), CHANNEL_CONNECTOR_HISTORY_CONTEXT_LIMIT)
    : [];
  return resolveChannelConnectorContextBudget({
    model: input.project.model,
    modelCatalog: catalog,
    usageSummary: input.usageSummary || null,
    history,
  });
}

async function handleStatus(context: ChannelConnectorCommandContext): Promise<ChannelConnectorCommandResult> {
  const control = getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context));
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, control);
  const usageSummary = context.summarizeUsage
    ? await context.summarizeUsage({
      ...controlsLookup(context),
      project: currentProject,
      command: "/status",
    })
    : null;
  const contextBudget = await contextBudgetForCommand({
    context,
    project: currentProject,
    usageSummary,
  });
  const thinkingSupport = resolveChannelConnectorThinkingSupport({
    agent: currentProject.agent,
    model: currentProject.model,
  });
  const visionSetting = effectiveVisionSetting(context.binding, control);
  const session = getChannelConnectorAgentSession(context.agentSessionsPath, {
    bindingId: context.binding.id,
    projectId: currentProject.id,
    sessionKey: context.sessionKey,
    agent: currentProject.agent,
    model: currentProject.model,
    workDir: currentProject.workDir,
  });
  return {
    handled: true,
    command: "status",
    action: "status",
    ok: true,
    control,
    replyText: [
      "Tracevane Channel Status",
      `Agent: ${currentProject.id} (${currentProject.agent})`,
      `Model: ${currentProject.model || "default"}`,
      `Reasoning: ${currentProject.reasoningEffort || "default"}`,
      `Mode: ${currentProject.permissionMode}`,
      `WorkDir: ${currentProject.workDir}`,
      `Thinking: ${effectiveToggle(control?.thinkingMessages) ? "on" : "off"}`,
      `Thinking stream: ${formatChannelConnectorThinkingSupport(thinkingSupport)}`,
      `Process: ${effectiveToggle(control?.processMessages) ? "on" : "off"}`,
      `Tools: ${effectiveToggle(control?.toolMessages) ? "on" : "off"}`,
      `Vision fallback: ${visionSetting.enabled ? "on" : "off"} · ${visionSetting.model || "auto"}`,
      `Session: ${session ? `${session.turnCount} turns` : "new"}`,
      `Native session: ${session?.agentNativeSessionId || "-"}`,
      `Codex thread: ${session?.codexThreadId || "-"}`,
      "",
      ...formatChannelConnectorContextBudget(contextBudget),
    ].join("\n"),
  };
}

async function handleCurrent(context: ChannelConnectorCommandContext): Promise<ChannelConnectorCommandResult> {
  const lookup = controlsLookup(context);
  const control = getChannelConnectorSessionControl(context.controlsPath, lookup);
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, control);
  const session = getChannelConnectorAgentSession(context.agentSessionsPath, {
    bindingId: context.binding.id,
    projectId: currentProject.id,
    sessionKey: context.sessionKey,
    agent: currentProject.agent,
    model: currentProject.model,
    workDir: currentProject.workDir,
  });
  const historyCount = context.conversationHistoryPath
    ? getChannelConnectorConversationHistory(context.conversationHistoryPath, lookup, CHANNEL_CONNECTOR_HISTORY_CONTEXT_LIMIT).length
    : 0;
  const sessionName = session?.name || control?.sessionName || "-";
  const thinkingSupport = resolveChannelConnectorThinkingSupport({
    agent: currentProject.agent,
    model: currentProject.model,
  });
  const visionSetting = effectiveVisionSetting(context.binding, control);
  return {
    handled: true,
    command: "current",
    action: "status",
    ok: true,
    control,
    replyText: [
      "Tracevane Current Session",
      `Binding: ${context.binding.id}`,
      `Session key: ${context.sessionKey}`,
      `Session name: ${sessionName}`,
      `Agent: ${currentProject.id} (${currentProject.agent})`,
      `Model: ${currentProject.model || "default"}`,
      `Reasoning: ${currentProject.reasoningEffort || "default"}`,
      `Mode: ${currentProject.permissionMode}`,
      `WorkDir: ${currentProject.workDir}`,
      `Thinking: ${effectiveToggle(control?.thinkingMessages) ? "on" : "off"}`,
      `Thinking stream: ${formatChannelConnectorThinkingSupport(thinkingSupport)}`,
      `Process: ${effectiveToggle(control?.processMessages) ? "on" : "off"}`,
      `Tools: ${effectiveToggle(control?.toolMessages) ? "on" : "off"}`,
      `Vision fallback: ${visionSetting.enabled ? "on" : "off"} · ${visionSetting.model || "auto"}`,
      `Agent session: ${session ? `${session.turnCount} turns` : "not started"}`,
      `Agent session id: ${shortIdentifier(session?.id, 18)}`,
      `Native session: ${session?.agentNativeSessionId || "-"}`,
      `Last status: ${session?.lastStatus || "-"}`,
      `Last message: ${session?.lastMessageId || "-"}`,
      `Codex thread: ${session?.codexThreadId || "-"}`,
      `Created: ${session?.createdAt || "-"}`,
      `Updated: ${session?.updatedAt || "-"}`,
      `History entries: ${historyCount}`,
      "Actions: /list · /history 20 · /name <名称> · /search <关键字>",
    ].join("\n"),
  };
}

function handleWhoami(context: ChannelConnectorCommandContext): ChannelConnectorCommandResult {
  const control = getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context));
  const message = context.message;
  const canManage = canManageSession(context.binding, message);
  const userId = normalizeString(message.fromUid) || "(unknown)";
  const channelId = normalizeString(message.channelId) || "(unknown)";
  return {
    handled: true,
    command: "whoami",
    action: "show",
    ok: true,
    control,
    replyText: [
      "Tracevane Whoami",
      `User ID: ${userId}`,
      `Channel ID: ${channelId}`,
      `Channel type: ${message.channelType}`,
      `Platform: ${context.binding.platform}`,
      `Binding: ${context.binding.id}`,
      `Account: ${context.binding.accountId || "-"}`,
      `Session key: ${context.sessionKey}`,
      `Can manage session: ${canManage ? "yes" : "no"}`,
      "",
      "用途：把 User ID 加到 binding allowlist 或 adminUsers；把 Channel ID 用于排查群聊/session 绑定。",
    ].join("\n"),
    passthroughText: null,
  };
}

function handleVersion(context: ChannelConnectorCommandContext): ChannelConnectorCommandResult {
  const control = getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context));
  return {
    handled: true,
    command: "version",
    action: "show",
    ok: true,
    control,
    replyText: [
      "Tracevane Channel Version",
      `Tracevane: ${tracevaneRuntimeVersion()}`,
      `Node: ${process.version}`,
      `Platform: ${os.platform()} ${os.arch()}`,
      `Binding: ${context.binding.id} (${context.binding.platform})`,
      `Daemon config: v${context.config.version}`,
      `Runtime root: ${context.config.paths.root}`,
    ].join("\n"),
    passthroughText: null,
  };
}

function historyCommandText(context: ChannelConnectorCommandContext, args: string[] = []): string {
  const filePath = normalizeString(context.conversationHistoryPath);
  if (!filePath) return "当前 Channel daemon 未启用 history store。";
  const limit = parsePositiveLimit(args[0], CHANNEL_CONNECTOR_HISTORY_CONTEXT_LIMIT, CHANNEL_CONNECTOR_HISTORY_CONTEXT_LIMIT);
  const entries = getChannelConnectorConversationHistory(filePath, controlsLookup(context), limit);
  if (!entries.length) return "当前 IM 会话还没有可显示的 history。";
  const lines = [`Tracevane Session History (last ${entries.length}/${limit})`];
  for (const [index, entry] of entries.entries()) {
    const role = entry.role === "assistant" ? "Assistant" : "User";
    const icon = entry.role === "assistant" ? "A" : "U";
    const status = entry.status ? ` (${entry.status})` : "";
    const text = normalizeString(entry.text) || "(no text)";
    const attachments = entry.attachmentSummaries.length
      ? `\nattachments: ${entry.attachmentSummaries.join("; ")}`
      : "";
    lines.push(`${index + 1}. [${icon}] ${role}${status} · ${entry.createdAt} · msg=${shortIdentifier(entry.messageId, 14)}\n${bufferPreviewText(text, 240)}${attachments}`);
  }
  lines.push("用法：/history [条数]，例如 /history 20；/compact 可压缩当前 IM history。");
  return lines.join("\n\n");
}

function formatUsageSummary(summary: ChannelConnectorUsageSummary | null): string {
  if (!summary || summary.requests <= 0) {
    return [
      "Tracevane Usage",
      "当前 IM 会话还没有可统计的 Gateway usage。",
      "只有通过 Tracevane Gateway 且上游返回 usage/token 字段的 Agent 请求会计入。",
    ].join("\n");
  }
  const lines = [
    "Tracevane Usage",
    `Requests: ${summary.requests} (${summary.successfulRequests} success / ${summary.failedRequests} failed)`,
    `Tokens: input ${summary.inputTokens} · output ${summary.outputTokens} · total ${summary.totalTokens}`,
  ];
  if (summary.cacheReadTokens || summary.cacheCreationTokens) {
    lines.push(`Cache: read ${summary.cacheReadTokens} · write ${summary.cacheCreationTokens}`);
  }
  if (summary.models.length) lines.push(`Models: ${summary.models.join(", ")}`);
  if (summary.providers.length) lines.push(`Providers: ${summary.providers.join(", ")}`);
  lines.push(`Last request: ${summary.lastRequestAt || "-"}`);
  lines.push("Source: Tracevane Gateway runtime log, correlated by Agent run time window.");
  return lines.join("\n");
}

function sessionListText(
  records: ChannelConnectorAgentSessionRecord[],
  activeSessionId: string | null,
): string {
  if (!records.length) {
    return [
      "当前 IM 会话还没有本地 Agent session。",
      "发送普通消息后，Tracevane 会保存可续接记录；用法：/switch <序号|sessionId前缀>。",
    ].join("\n");
  }
  const lines = ["Tracevane Agent Sessions"];
  records.forEach((record, index) => {
    const marker = record.id === activeSessionId ? ">" : " ";
    const title = record.name || record.projectId;
    lines.push([
      `${marker} ${index + 1}. ${title} (${record.agent})`,
      `   model=${record.model || "default"} turns=${record.turnCount} status=${record.lastStatus || "-"}`,
      record.name ? `   profile=${record.projectId}` : "",
      `   sessionId=${shortIdentifier(record.id, 18)} native=${shortIdentifier(record.agentNativeSessionId, 18)} thread=${shortIdentifier(record.codexThreadId, 18)}`,
      `   updated=${record.updatedAt}`,
      `   workDir=${record.workDir}`,
    ].filter(Boolean).join("\n"));
  });
  lines.push("用法：/switch <序号|sessionId前缀>；/name <序号> <名称>；/delete <序号|sessionId前缀|1,3-5>；/search <关键字>");
  return lines.join("\n");
}

function sessionSearchText(
  records: ChannelConnectorAgentSessionRecord[],
  query: string,
  activeSessionId: string | null,
): string {
  const needle = normalizeString(query).toLowerCase();
  if (!needle) return "用法：/search <关键字>；按 session 名称或 sessionId 搜索当前 IM 会话。";
  const matches = records.filter((record) => {
    const candidates = [
      record.name || "",
      record.id,
      record.projectId,
      record.agent,
      record.model || "",
      record.workDir,
    ].map((item) => item.toLowerCase());
    return candidates.some((item) => item.includes(needle));
  }).slice(0, 10);
  if (!matches.length) return `未找到匹配的 Agent session：${query}`;
  return [
    `Tracevane Session Search: ${query}`,
    sessionListText(matches, activeSessionId),
  ].join("\n\n");
}

function parseSessionNameArgs(args: string[]): {
  targetIndex: number | null;
  name: string;
} {
  if (!args.length) return { targetIndex: null, name: "" };
  const index = Number(args[0]);
  if (Number.isInteger(index)) {
    return {
      targetIndex: index,
      name: normalizeString(args.slice(1).join(" ")),
    };
  }
  return {
    targetIndex: null,
    name: normalizeString(args.join(" ")),
  };
}

function reasoningListText(current: ChannelConnectorReasoningEffort | null): string {
  const lines = [`当前推理强度：${current || "default"}`, "可选推理强度："];
  REASONING_EFFORTS.forEach((effort, index) => {
    const marker = effort === current ? ">" : " ";
    lines.push(`${marker} ${index + 1}. ${effort}`);
  });
  lines.push("用法：/reasoning <序号|low|medium|high|xhigh|default>");
  return lines.join("\n");
}

function resolveSessionSwitchTarget(
  records: ChannelConnectorAgentSessionRecord[],
  input: string,
): {
  record: ChannelConnectorAgentSessionRecord | null;
  error: string | null;
} {
  const target = normalizeString(input);
  if (!target) return { record: null, error: "用法：/switch <序号|sessionId前缀>" };
  const index = Number(target);
  if (Number.isInteger(index)) {
    if (index >= 1 && index <= records.length) return { record: records[index - 1] || null, error: null };
    return { record: null, error: `没有第 ${index} 个 Agent session。` };
  }
  const lower = target.toLowerCase();
  const exact = records.find((record) => record.id.toLowerCase() === lower);
  if (exact) return { record: exact, error: null };
  const matches = records.filter((record) => record.id.toLowerCase().startsWith(lower));
  if (matches.length === 1) return { record: matches[0] || null, error: null };
  if (matches.length > 1) return { record: null, error: `sessionId 前缀匹配到 ${matches.length} 个记录，请输入更长前缀。` };
  return { record: null, error: `未找到 Agent session：${target}` };
}

function isExplicitSessionDeleteBatchArg(arg: string): boolean {
  if (arg.includes(",")) return true;
  if (!arg.includes("-")) return false;
  return Array.from(arg).every((char) => /[0-9-]/.test(char));
}

function parseSessionDeleteBatchIndices(spec: string, max: number): number[] | null {
  const parts = spec.split(",");
  if (!parts.length) return null;
  const seen = new Set<number>();
  const indices: number[] = [];
  for (const rawPart of parts) {
    const part = rawPart.trim();
    if (!part) return null;
    if (part.includes("-")) {
      const bounds = part.split("-");
      if (bounds.length !== 2 || !bounds[0] || !bounds[1]) return null;
      const start = Number(bounds[0]);
      const end = Number(bounds[1]);
      if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end > max) {
        return null;
      }
      for (let index = start; index <= end; index += 1) {
        if (seen.has(index)) continue;
        seen.add(index);
        indices.push(index);
      }
      continue;
    }
    const index = Number(part);
    if (!Number.isInteger(index) || index < 1 || index > max) return null;
    if (seen.has(index)) continue;
    seen.add(index);
    indices.push(index);
  }
  return indices;
}

function resolveSessionDeleteTargets(
  records: ChannelConnectorAgentSessionRecord[],
  target: string,
): {
  records: ChannelConnectorAgentSessionRecord[];
  error: string | null;
} {
  if (isExplicitSessionDeleteBatchArg(target)) {
    const indices = parseSessionDeleteBatchIndices(target, records.length);
    if (indices) {
      return {
        records: indices.map((index) => records[index - 1]).filter((record): record is ChannelConnectorAgentSessionRecord => Boolean(record)),
        error: null,
      };
    }
    if (!target.includes(",")) {
      return { records: [], error: "不支持的删除范围。用法：/delete 1,3-5。" };
    }
  }
  const parts = target.includes(",")
    ? target.split(",").map((part) => normalizeString(part)).filter(Boolean)
    : [target];
  if (!parts.length) return { records: [], error: "用法：/delete <序号|sessionId前缀|1,3-5>" };
  const seen = new Set<string>();
  const resolvedRecords: ChannelConnectorAgentSessionRecord[] = [];
  for (const part of parts) {
    const resolved = resolveSessionSwitchTarget(records, part);
    if (!resolved.record) {
      return { records: [], error: resolved.error || `未找到 Agent session：${part}` };
    }
    if (seen.has(resolved.record.id)) continue;
    seen.add(resolved.record.id);
    resolvedRecords.push(resolved.record);
  }
  return { records: resolvedRecords, error: null };
}

function deleteSessionDisplayName(record: ChannelConnectorAgentSessionRecord): string {
  return record.name || record.projectId || record.agentNativeSessionId || shortIdentifier(record.id, 18);
}

function deleteSessionRecordText(
  context: ChannelConnectorCommandContext,
  lookup: ReturnType<typeof controlsLookup>,
  record: ChannelConnectorAgentSessionRecord,
  activeSessionId: string | null,
): string {
  const displayName = deleteSessionDisplayName(record);
  if (record.id === activeSessionId) {
    return `禁止删除当前 Agent session：${displayName}。先 /new 或 /switch 到其它 session 后再删除。`;
  }
  const deleted = deleteChannelConnectorAgentSession(context.agentSessionsPath, {
    ...lookup,
    sessionId: record.id,
  });
  return deleted
    ? `已删除 Agent session：${displayName}`
    : `删除失败，未找到 Agent session：${displayName}`;
}

export async function handleChannelConnectorCommand(
  context: ChannelConnectorCommandContext,
): Promise<ChannelConnectorCommandResult> {
  const content = extractOctoContent(context.message);
  const parsed = parseChannelConnectorCommand(content);
  const lookup = controlsLookup(context);
  const parsedTracevaneName = parsed ? matchChannelConnectorCommandPrefix(parsed.name) : null;
  const parsedNameForControl = parsedTracevaneName || parsed?.name || "";
  if (context.hasPendingQuestionRequest?.(lookup) && !["stop", "reset", "new"].includes(parsedNameForControl)) {
    const currentControl = getChannelConnectorSessionControl(context.controlsPath, lookup);
    if (!canManageSession(context.binding, context.message)) {
      return {
        handled: true,
        command: "answer",
        action: "permission",
        ok: false,
        control: currentControl,
        replyText: "当前用户没有回答该 Channel session 问题的权限。",
        passthroughText: null,
      };
    }
    const response = context.respondQuestionRequest?.({
      ...lookup,
      answer: content,
    });
    if (response?.handled) {
      return {
        handled: true,
        command: "answer",
        action: "permission",
        ok: response.ok,
        control: currentControl,
        replyText: response.replyText,
        passthroughText: null,
        suppressReply: response.suppressReply === true,
      };
    }
  }
  const plainPermissionAction = parsed ? null : permissionResponseActionAlias(content);
  if (plainPermissionAction && context.hasPendingPermissionRequest?.(lookup)) {
    const currentControl = getChannelConnectorSessionControl(context.controlsPath, lookup);
    if (!canManageSession(context.binding, context.message)) {
      return {
        handled: true,
        command: plainPermissionAction,
        action: "permission",
        ok: false,
        control: currentControl,
        replyText: "当前用户没有批准该 Channel session 工具请求的权限。",
        passthroughText: null,
      };
    }
    const response = context.respondPermissionRequest?.({
      ...controlsLookup(context),
      action: plainPermissionAction,
    });
    if (response?.handled) {
      return {
        handled: true,
        command: plainPermissionAction,
        action: "permission",
        ok: response.ok,
        control: currentControl,
        replyText: response.replyText,
        passthroughText: null,
        suppressReply: response.suppressReply === true,
      };
    }
  }
  if (!parsed) {
    return {
      handled: false,
      command: null,
      action: null,
      ok: null,
      replyText: null,
      control: getChannelConnectorSessionControl(context.controlsPath, lookup),
      passthroughText: null,
      nativeCommand: null,
    };
  }

  const currentControl = getChannelConnectorSessionControl(context.controlsPath, lookup);
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, currentControl);
  const name = parsedTracevaneName || parsed.name;
  const args = parsed.args;
  const rawCommandsSubcommand = normalizeString(args[0]).toLowerCase();
  const dirListingRequest = name === "dir" ? parseWorkDirListingRequest(args) : null;
  const commandsMutation = name === "commands"
    && args.length > 0
    && !(rawCommandsSubcommand === "ls" || matchChannelConnectorSubCommand(rawCommandsSubcommand, ["list"]) === "list");
  const aliasSubcommand = name === "alias"
    ? matchChannelConnectorSubCommand(rawCommandsSubcommand, ["list", "add", "del", "delete", "rm", "remove"]) || rawCommandsSubcommand
    : "";
  const aliasMutation = name === "alias"
    && ["add", "del", "delete", "rm", "remove"].includes(aliasSubcommand);
  const mutableCommandName = [
      "agent",
      "model",
      "vision",
      "name",
      "delete",
      "mode",
      "approve",
      "deny",
      "approve-all",
      "reasoning",
      "switch",
      "reset",
      "new",
      "dir",
      "display",
      "thinking",
      "process",
      "tools",
      "quiet",
      "stop",
      "compact",
    ].includes(name);
  const listOnlyCommand = (["agent", "model", "vision", "mode", "reasoning", "display", "thinking", "process", "tools"].includes(name)
    && args.length === 0)
    || dirListingRequest !== null;
  const mutating = (mutableCommandName || commandsMutation || aliasMutation) && !listOnlyCommand;

  if (mutating && !canManageSession(context.binding, context.message)) {
    return {
      handled: true,
      command: name,
      action: "set",
      ok: false,
      control: currentControl,
      replyText: "当前用户没有管理该 Channel session 的权限。",
      passthroughText: null,
    };
  }

  const permissionAction = permissionResponseActionAlias([name, ...args].join(" "));
  if (permissionAction) {
    return handlePermissionResponseCommand(context, permissionAction, currentControl, name);
  }

  if (isTracevaneCommand(name)) {
    const disabled = disabledCommandDecision(context.binding, context.message, [name, parsed.name]);
    if (disabled.disabled) {
      return {
        handled: true,
        command: name,
        action: "show",
        ok: false,
        control: currentControl,
        replyText: disabledCommandReply(disabled.command),
        passthroughText: null,
        nativeCommand: null,
      };
    }
  }

  if (!isTracevaneCommand(name)) {
    const customCommand = resolveCustomCommand(context, currentProject, name);
    if (customCommand) {
      const disabled = disabledCommandDecision(context.binding, context.message, [customCommand.name, name, parsed.name]);
      if (disabled.disabled) {
        return {
          handled: true,
          command: customCommand.name,
          action: "show",
          ok: false,
          control: currentControl,
          replyText: disabledCommandReply(disabled.command),
          passthroughText: null,
          nativeCommand: null,
        };
      }
      if (isExecCustomCommand(customCommand)) {
        if (!canManageSession(context.binding, context.message)) {
          return {
            handled: true,
            command: customCommand.name,
            action: "show",
            ok: false,
            control: currentControl,
            replyText: "当前用户没有管理该 Channel session 的权限，不能执行 shell 自定义命令。",
            passthroughText: null,
            nativeCommand: null,
          };
        }
        const result = await runCustomExecCommand({
          command: customCommand,
          project: currentProject,
          args,
          onProgress: context.onCommandProgress,
        });
        return {
          handled: true,
          command: customCommand.name,
          action: "show",
          ok: result.ok,
          control: currentControl,
          replyText: result.replyText,
          passthroughText: null,
          nativeCommand: null,
          audit: result.audit,
          suppressReply: result.suppressFinalReply,
          progressHandled: result.progressHandled,
        };
      }
      return {
        handled: false,
        command: customCommand.name,
        action: "passthrough",
        ok: null,
        control: currentControl,
        replyText: null,
        passthroughText: expandAgentCommandPrompt(customCommand.prompt, args),
        nativeCommand: null,
        audit: commandAudit({
          kind: customCommand.source === "agent" ? "agent-command" : "custom-prompt",
          source: customCommand.source,
          name: customCommand.name,
          args,
          commandPreview: customCommand.prompt,
        }),
      };
    }
    const skill = resolveChannelConnectorSkill(currentProject, name, { binding: context.binding });
    if (skill) {
      const disabled = disabledCommandDecision(context.binding, context.message, [skill.name, name, parsed.name]);
      if (disabled.disabled) {
        return {
          handled: true,
          command: skill.name,
          action: "show",
          ok: false,
          control: currentControl,
          replyText: disabledCommandReply(disabled.command),
          passthroughText: null,
          nativeCommand: null,
        };
      }
      return {
        handled: false,
        command: skill.name,
        action: "passthrough",
        ok: null,
        control: currentControl,
        replyText: null,
        passthroughText: buildChannelConnectorSkillPrompt(skill, args),
        nativeCommand: null,
        audit: commandAudit({
          kind: "skill",
          source: "skill",
          name: skill.name,
          args,
          commandPreview: skill.source,
        }),
      };
    }
    return {
      handled: false,
      command: name,
      action: "passthrough",
      ok: null,
      control: currentControl,
      replyText: null,
      passthroughText: parsed.raw,
      nativeCommand: null,
      audit: commandAudit({
        kind: "passthrough",
        source: "user",
        name,
        args,
        commandPreview: parsed.raw,
      }),
    };
  }

  if (name === "native") {
    const target = normalizeString(args.join(" "));
    if (!target) {
      return {
        handled: true,
        command: name,
        action: "passthrough",
        ok: false,
        control: currentControl,
        replyText: "用法：/native <要发送给 Agent 的原生命令>",
        passthroughText: null,
        nativeCommand: null,
      };
    }
    if (nativeCompactCommand(target)) {
      if (!canManageSession(context.binding, context.message)) {
        return {
          handled: true,
          command: name,
          action: "compact",
          ok: false,
          control: currentControl,
          replyText: "当前用户没有管理该 Channel session 的权限。",
          passthroughText: null,
          nativeCommand: null,
        };
      }
      if (!context.nativeCompactConversation) {
        return {
          handled: true,
          command: name,
          action: "compact",
          ok: false,
          control: currentControl,
          replyText: "当前 Channel runtime 未启用 Agent 原生 compact contract。请使用 /compact 允许 Tracevane Gateway fallback。",
          passthroughText: null,
          nativeCommand: null,
        };
      }
      const compactStartedAt = Date.now();
      let compactProgressHandled = false;
      let compactSuppressReply = false;
      const startedAck = await emitBuiltinCommandProgress({
        context,
        project: currentProject,
        commandName: "compact",
        commandPreview: parsed.raw,
        startedAt: compactStartedAt,
        type: "started",
        outputPreview: "Agent native compact started.",
      });
      if (startedAck.handled) compactProgressHandled = true;
      if (startedAck.suppressFinalReply) compactSuppressReply = true;
      const nativeResult = await context.nativeCompactConversation({
        bindingId: context.binding.id,
        sessionKey: context.sessionKey,
        project: currentProject,
        message: context.message,
        command: target,
      });
      const progressText = nativeResult.attempted && nativeResult.ok
        ? "Agent native compact completed."
        : nativeResult.error || "Agent native compact failed.";
      const finishedAck = await emitBuiltinCommandProgress({
        context,
        project: currentProject,
        commandName: "compact",
        commandPreview: parsed.raw,
        startedAt: compactStartedAt,
        type: nativeResult.attempted && nativeResult.ok ? "completed" : "failed",
        outputPreview: progressText,
        error: nativeResult.attempted && nativeResult.ok ? null : progressText,
      });
      if (finishedAck.handled) compactProgressHandled = true;
      if (finishedAck.suppressFinalReply) compactSuppressReply = true;
      if (nativeResult.attempted && nativeResult.ok) {
        return {
          handled: true,
          command: name,
          action: "compact",
          ok: true,
          control: currentControl,
          replyText: [
            "Agent 原生 compact 已完成。",
            nativeResult.replyText ? bufferPreviewText(nativeResult.replyText, 240) : "",
          ].filter(Boolean).join("\n"),
          passthroughText: null,
          nativeCommand: null,
          suppressReply: compactSuppressReply,
          progressHandled: compactProgressHandled,
        };
      }
      return {
        handled: true,
        command: name,
        action: "compact",
        ok: false,
        control: currentControl,
        replyText: [
          "Agent 原生 compact 未执行。",
          nativeResult.error ? bufferPreviewText(nativeResult.error, 260) : "当前 Agent 没有 live persistent compact session。",
          "请使用 /compact 让 Tracevane 按 native-first 后降级 Gateway compact。",
        ].filter(Boolean).join("\n"),
        passthroughText: null,
        nativeCommand: null,
        suppressReply: compactSuppressReply,
        progressHandled: compactProgressHandled,
      };
    }
    return {
      handled: false,
      command: name,
      action: "passthrough",
      ok: null,
      control: currentControl,
      replyText: null,
      passthroughText: target,
      nativeCommand: target,
      audit: commandAudit({
        kind: "native",
        source: "user",
        name,
        args,
        commandPreview: target,
      }),
    };
  }

  if (name === "skills") {
    return {
      handled: true,
      command: name,
      action: "list",
      ok: true,
      control: currentControl,
      replyText: skillsListText(currentProject, context.binding),
      passthroughText: null,
    };
  }

  if (name === "octo") {
    return handleOctoManagementCommand(context, args, currentControl);
  }

  if (name === "alias") {
    const subcommand = !rawCommandsSubcommand || rawCommandsSubcommand === "ls"
      ? "list"
      : aliasSubcommand;
    const storePath = commandAliasStorePath(context);
    if (!subcommand || subcommand === "list") {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: commandAliasListText(listChannelConnectorCommandAliasesForBinding(context.binding, storePath)),
        passthroughText: null,
      };
    }

    if (subcommand === "add") {
      if (!storePath) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "当前 runtime 未启用命令别名 store，不能添加别名。",
          passthroughText: null,
        };
      }
      const aliasName = normalizeString(args[1]);
      const aliasCommand = normalizeCommandAliasCommand(args.slice(2).join(" "));
      if (!aliasName || !aliasCommand) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: aliasUsageText(),
          passthroughText: null,
        };
      }
      if (!isValidCommandAliasName(aliasName)) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "别名触发词不能为空、不能包含空白字符，且最长 64 个字符。",
          passthroughText: null,
        };
      }
      const metadataAlias = metadataAliasByName(context.binding, aliasName);
      if (metadataAlias) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: `别名 ${aliasName} 来自 binding metadata：${metadataAlias.command}。请在 Tracevane 配置中修改，或换一个触发词。`,
          passthroughText: null,
        };
      }
      const record = upsertChannelConnectorCommandAlias(storePath, context.binding.id, aliasName, aliasCommand);
      return {
        handled: true,
        command: name,
        action: "set",
        ok: true,
        control: currentControl,
        replyText: `已添加命令别名：${record.name} -> ${record.command}`,
        passthroughText: null,
      };
    }

    if (["del", "delete", "rm", "remove"].includes(subcommand)) {
      if (!storePath) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "当前 runtime 未启用命令别名 store，不能删除别名。",
          passthroughText: null,
        };
      }
      const aliasName = normalizeString(args[1]);
      if (!aliasName) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: aliasUsageText(),
          passthroughText: null,
        };
      }
      const storeAlias = storeAliasByName(storePath, context.binding.id, aliasName);
      if (!storeAlias) {
        const metadataAlias = metadataAliasByName(context.binding, aliasName);
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: metadataAlias
            ? `别名 ${aliasName} 来自 binding metadata，不能通过 /alias del 删除。`
            : `未找到通过 IM 添加的别名：${aliasName}`,
          passthroughText: null,
        };
      }
      const deleted = deleteChannelConnectorCommandAlias(storePath, context.binding.id, aliasName);
      return {
        handled: true,
        command: name,
        action: "set",
        ok: deleted,
        control: currentControl,
        replyText: deleted ? `已删除命令别名：${storeAlias.name}` : `未找到通过 IM 添加的别名：${aliasName}`,
        passthroughText: null,
      };
    }

    return {
      handled: true,
      command: name,
      action: "list",
      ok: false,
      control: currentControl,
      replyText: aliasUsageText(),
      passthroughText: null,
    };
  }

  if (name === "commands") {
    const rawSubcommand = normalizeString(args[0]).toLowerCase();
    const subcommand = rawSubcommand === "ls" ? "list" : matchChannelConnectorSubCommand(rawSubcommand, [
      "list",
      "add",
      "del",
      "delete",
      "rm",
      "remove",
      "addexec",
    ]);
    if (subcommand === "add") {
      const commandName = normalizeString(args[1]).toLowerCase();
      const prompt = normalizeString(args.slice(2).join(" "));
      const filePath = commandStorePath(context);
      if (!filePath) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "当前 runtime 未启用自定义命令 store，不能添加命令。",
          passthroughText: null,
        };
      }
      if (!commandName || !prompt) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "用法：/commands add <名称> <prompt 模板>\n示例：/commands add review Review {{args}}",
          passthroughText: null,
        };
      }
      if (!isValidCustomCommandName(commandName)) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "命令名称只支持小写字母、数字、-、_，且必须以字母或数字开头。",
          passthroughText: null,
        };
      }
      if (isTracevaneCommand(commandName) || resolveCustomCommand(context, currentProject, commandName)) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: `命令 /${commandName} 已存在。请先用 /commands del ${commandName} 删除自定义命令，或换一个名称。`,
          passthroughText: null,
        };
      }
      const record = upsertChannelConnectorCustomCommand(filePath, currentProject.id, commandName, prompt);
      return {
        handled: true,
        command: name,
        action: "set",
        ok: true,
        control: currentControl,
        replyText: `已添加自定义命令 /${record.name}\n${firstLine(record.prompt, 80)}`,
        passthroughText: null,
      };
    }

    if (["del", "delete", "rm", "remove"].includes(subcommand)) {
      const commandName = normalizeString(args[1]).toLowerCase();
      const filePath = commandStorePath(context);
      if (!filePath) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "当前 runtime 未启用自定义命令 store，不能删除命令。",
          passthroughText: null,
        };
      }
      if (!commandName) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "用法：/commands del <名称>",
          passthroughText: null,
        };
      }
      const deleted = deleteChannelConnectorCustomCommand(filePath, currentProject.id, commandName);
      return {
        handled: true,
        command: name,
        action: "set",
        ok: deleted,
        control: currentControl,
        replyText: deleted ? `已删除自定义命令 /${commandName}` : `未找到自定义命令 /${commandName}。`,
        passthroughText: null,
      };
    }

    if (subcommand === "addexec") {
      const filePath = commandStorePath(context);
      const workDirFlag = args[1] === "--work-dir";
      const nameIndex = workDirFlag ? 3 : 1;
      const commandName = normalizeString(args[nameIndex]).toLowerCase();
      const execCommand = normalizeString(args.slice(nameIndex + 1).join(" "));
      const workDir = workDirFlag ? normalizeString(args[2]) : "";
      if (!filePath) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "当前 runtime 未启用自定义命令 store，不能添加 shell 命令。",
          passthroughText: null,
        };
      }
      if (!commandName || !execCommand || (workDirFlag && !workDir)) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "用法：/commands addexec <名称> <shell 命令>\n      /commands addexec --work-dir <目录> <名称> <shell 命令>\n示例：/commands addexec status git status {{args}}",
          passthroughText: null,
        };
      }
      if (!isValidCustomCommandName(commandName)) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "命令名称只支持小写字母、数字、-、_，且必须以字母或数字开头。",
          passthroughText: null,
        };
      }
      if (isTracevaneCommand(commandName) || resolveCustomCommand(context, currentProject, commandName)) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: `命令 /${commandName} 已存在。请先用 /commands del ${commandName} 删除自定义命令，或换一个名称。`,
          passthroughText: null,
        };
      }
      const record = upsertChannelConnectorCustomCommand(filePath, currentProject.id, commandName, "", "", execCommand, workDir);
      return {
        handled: true,
        command: name,
        action: "set",
        ok: true,
        control: currentControl,
        replyText: [
          `已添加 shell 命令 /${record.name}`,
          firstLine(record.exec, 80),
          record.workDir ? `workDir=${record.workDir}` : "",
        ].filter(Boolean).join("\n"),
        passthroughText: null,
      };
    }

    if (subcommand && !["list", "ls"].includes(subcommand)) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: false,
        control: currentControl,
        replyText: commandsUsageText(),
        passthroughText: null,
      };
    }

    return {
      handled: true,
      command: name,
      action: "list",
      ok: true,
      control: currentControl,
      replyText: customCommandsListText(context, currentProject),
      passthroughText: null,
    };
  }

  if (name === "start" || name === "help" || name === "menu") {
    return {
      handled: true,
      command: name,
      action: "help",
      ok: true,
      control: currentControl,
      replyText: commandHelpText(args[0]),
      passthroughText: null,
    };
  }

  if (name === "status") return handleStatus(context);
  if (name === "usage") {
    const summary = context.summarizeUsage
      ? await context.summarizeUsage({
        ...lookup,
        project: currentProject,
        command: parsed.raw,
      })
      : null;
    return {
      handled: true,
      command: name,
      action: "usage",
      ok: Boolean(summary && summary.requests > 0),
      control: currentControl,
      replyText: formatUsageSummary(summary),
      passthroughText: null,
    };
  }
  if (name === "whoami") return handleWhoami(context);
  if (name === "version") return handleVersion(context);
  if (name === "current") return handleCurrent(context);
  if (name === "list" || name === "switch" || name === "search" || name === "name" || name === "delete") {
    const activeSession = getChannelConnectorAgentSession(context.agentSessionsPath, {
      bindingId: context.binding.id,
      projectId: currentProject.id,
      sessionKey: context.sessionKey,
      agent: currentProject.agent,
      model: currentProject.model,
      workDir: currentProject.workDir,
    });
    const records = listChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, {
      ...lookup,
      limit: 20,
    });
    if (name === "list") {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: sessionListText(records, activeSession?.id || null),
        passthroughText: null,
      };
    }
    if (name === "search") {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: sessionSearchText(records, args.join(" "), activeSession?.id || null),
        passthroughText: null,
      };
    }
    if (name === "name") {
      const parsedName = parseSessionNameArgs(args);
      if (!parsedName.name) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "用法：/name <名称>；/name <序号> <名称>。名称用于 /list、/search 和菜单展示。",
          passthroughText: null,
        };
      }
      if (parsedName.targetIndex !== null) {
        const targetRecord = records[parsedName.targetIndex - 1] || null;
        if (!targetRecord) {
          return {
            handled: true,
            command: name,
            action: "set",
            ok: false,
            control: currentControl,
            replyText: `没有第 ${parsedName.targetIndex} 个 Agent session。\n\n${sessionListText(records, activeSession?.id || null)}`,
            passthroughText: null,
          };
        }
        const renamed = renameChannelConnectorAgentSession(context.agentSessionsPath, {
          ...lookup,
          sessionId: targetRecord.id,
          name: parsedName.name,
        });
        return {
          handled: true,
          command: name,
          action: "set",
          ok: Boolean(renamed),
          control: currentControl,
          replyText: renamed
            ? `已命名 Agent session：${parsedName.targetIndex}. ${parsedName.name}`
            : "命名失败：未找到对应 Agent session。",
          passthroughText: null,
        };
      }
      const renamed = activeSession
        ? renameChannelConnectorAgentSession(context.agentSessionsPath, {
          ...lookup,
          sessionId: activeSession.id,
          name: parsedName.name,
        })
        : null;
      const control = upsertChannelConnectorSessionControl(context.controlsPath, {
        ...lookup,
        sessionName: parsedName.name,
        lastCommand: parsed.raw,
      });
      return {
        handled: true,
        command: name,
        action: "set",
        ok: true,
        control,
        replyText: renamed
          ? `已命名当前 Agent session：${parsedName.name}`
          : `已设置当前 IM 会话名称：${parsedName.name}。下一次 Agent session 会使用该名称。`,
        passthroughText: null,
      };
    }
    if (name === "delete") {
      if (args.length !== 1) {
        return {
          handled: true,
          command: name,
          action: "delete",
          ok: false,
          control: currentControl,
          replyText: [
            "用法：/delete <序号|sessionId前缀|1,3-5>",
            "只能删除当前 IM 会话里的非当前 Agent session 续接记录。",
            "",
            sessionListText(records, activeSession?.id || null),
          ].join("\n"),
          passthroughText: null,
        };
      }
      const target = normalizeString(args[0]);
      const resolvedTargets = resolveSessionDeleteTargets(records, target);
      if (resolvedTargets.error) {
        return {
          handled: true,
          command: name,
          action: "delete",
          ok: false,
          control: currentControl,
          replyText: `${resolvedTargets.error}\n\n${sessionListText(records, activeSession?.id || null)}`,
          passthroughText: null,
        };
      }
      const targets = resolvedTargets.records;
      const lines = targets.map((record) => deleteSessionRecordText(context, lookup, record, activeSession?.id || null));
      return {
        handled: true,
        command: name,
        action: "delete",
        ok: lines.some((line) => line.startsWith("已删除")),
        control: currentControl,
        replyText: lines.join("\n"),
        passthroughText: null,
      };
    }
    const target = resolveSessionSwitchTarget(records, args.join(" "));
    if (!target.record) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: false,
        control: currentControl,
        replyText: `${target.error || "未找到 Agent session。"}\n\n${sessionListText(records, activeSession?.id || null)}`,
        passthroughText: null,
      };
    }
    const targetProject = context.config.projects.find((project) => project.id === target.record?.projectId) || null;
    if (!targetProject) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: `Agent session 对应的 Profile 已不存在：${target.record.projectId}`,
        passthroughText: null,
      };
    }
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      activeProjectId: targetProject.id,
      sessionName: target.record.name,
      model: target.record.model,
      workDir: target.record.workDir,
      workDirHistory: [],
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: `已切换本 IM 会话 Agent session：${target.record.projectId} · ${target.record.turnCount} turns。`,
      passthroughText: null,
    };
  }
  if (name === "history") {
    return {
      handled: true,
      command: name,
      action: "show",
      ok: true,
      control: currentControl,
      replyText: historyCommandText(context, args),
      passthroughText: null,
    };
  }

  if (name === "agent") {
    if (args.length === 0) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: projectListText(context.config, currentProject),
        passthroughText: null,
      };
    }
    const target = resolveProjectTarget(context.config, args.join(" "));
    if (!target) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "未找到 Agent Profile。用 /agent 查看可选项。",
        passthroughText: null,
      };
    }
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      activeProjectId: target.id,
      model: null,
      reasoningEffort: null,
      permissionMode: null,
      workDir: null,
      workDirHistory: [],
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: `已切换本会话 Agent：${target.id} (${target.agent})。模型和权限已恢复该 Agent Profile 默认值。`,
      passthroughText: null,
    };
  }

  if (name === "model") {
    const models = await listModelsForCommand(context);
    if (args.length === 0) {
      const lines = [`当前模型：${currentProject.model || "default"}`, "可用模型："];
      models.forEach((model, index) => {
        const marker = model === currentProject.model ? ">" : " ";
        lines.push(`${marker} ${index + 1}. ${model}`);
      });
      lines.push("用法：/model <序号|模型ID>；/model default 恢复 Agent Profile 默认模型。");
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: lines.join("\n"),
        passthroughText: null,
      };
    }
    const requested = args.join(" ");
    const shouldReset = ["default", "reset", "profile"].includes(requested.toLowerCase());
    const target = shouldReset ? null : resolveModelTarget(requested, models);
    if (!shouldReset && !target) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "模型参数为空。用 /model 查看可选项。",
        passthroughText: null,
      };
    }
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      model: target,
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: shouldReset ? "已恢复本会话默认模型。" : `已切换本会话模型：${target}`,
      passthroughText: null,
    };
  }

  if (name === "vision") {
    const visionModels = await listVisionModelsForCommand(context);
    if (args.length === 0) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: visionStatusText({
          binding: context.binding,
          control: currentControl,
          project: currentProject,
          visionModels,
        }),
        passthroughText: null,
      };
    }
    const rawSubcommand = normalizeString(args[0]).toLowerCase();
    if (rawSubcommand === "model" || rawSubcommand === "models") {
      const requested = args.slice(1).join(" ");
      const shouldClearModel = ["", "auto", "default", "reset", "clear"].includes(requested.toLowerCase());
      const target = shouldClearModel
        ? null
        : resolveListedModelTarget(requested, visionModels) || (visionModels.length ? null : normalizeString(requested));
      if (!shouldClearModel && !target) {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "未找到可用视觉模型。用 /vision 查看 Gateway 返回的 vision 模型列表。",
          passthroughText: null,
        };
      }
      const control = upsertChannelConnectorSessionControl(context.controlsPath, {
        ...lookup,
        autoVisionModel: true,
        visionModel: shouldClearModel ? AUTO_VISION_MODEL_SENTINEL : target,
        lastCommand: parsed.raw,
      });
      return {
        handled: true,
        command: name,
        action: "set",
        ok: true,
        control,
        replyText: shouldClearModel
          ? "已开启自动视觉 fallback，并清除当前会话指定视觉模型；Gateway 会自动选择健康 vision 模型。"
          : `已开启自动视觉 fallback，并指定当前会话视觉模型：${target}`,
        passthroughText: null,
      };
    }
    const toggle = parseToggleTarget(args.join(" "));
    if (toggle === "status") {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: visionStatusText({
          binding: context.binding,
          control: currentControl,
          project: currentProject,
          visionModels,
        }),
        passthroughText: null,
      };
    }
    if (toggle !== "invalid") {
      const control = upsertChannelConnectorSessionControl(context.controlsPath, {
        ...lookup,
        autoVisionModel: toggle,
        visionModel: toggle === null ? null : currentControl?.visionModel || null,
        lastCommand: parsed.raw,
      });
      return {
        handled: true,
        command: name,
        action: "set",
        ok: true,
        control,
        replyText: toggle === true
          ? `已开启当前会话自动视觉 fallback：${control.visionModel && control.visionModel !== AUTO_VISION_MODEL_SENTINEL ? control.visionModel : "auto"}。`
          : toggle === false
            ? "已关闭当前会话自动视觉 fallback；图片会交给当前模型或附件说明模式处理。"
            : "已清除当前会话视觉 fallback 覆盖，回到平台 binding 默认值。",
        passthroughText: null,
      };
    }
    const requestedModel = args.join(" ");
    const target = resolveListedModelTarget(requestedModel, visionModels) || (visionModels.length ? null : normalizeString(requestedModel));
    if (!target) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "不支持的 /vision 参数。用法：/vision on|off|default；/vision model <序号|模型ID|auto>。",
        passthroughText: null,
      };
    }
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      autoVisionModel: true,
      visionModel: target,
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: `已开启自动视觉 fallback，并指定当前会话视觉模型：${target}`,
      passthroughText: null,
    };
  }

  if (name === "mode") {
    if (parsed.name === "yolo" && args.length === 0) args.push("yolo");
    if (args.length === 0) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: modeListText(currentProject.permissionMode),
        passthroughText: null,
      };
    }
    const requested = args[0] || "";
    const shouldReset = ["default", "reset", "profile"].includes(requested.toLowerCase());
    const target = shouldReset ? null : permissionModeAlias(requested);
    if (!shouldReset && !target) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "不支持的权限模式。用 /mode 查看可选项。",
        passthroughText: null,
      };
    }
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      permissionMode: target,
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: shouldReset ? "已恢复本会话默认权限模式。" : `已切换本会话权限模式：${target}`,
      passthroughText: null,
    };
  }

  if (name === "reasoning") {
    if (args.length === 0) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: reasoningListText(currentProject.reasoningEffort || null),
        passthroughText: null,
      };
    }
    const requested = args[0] || "";
    const shouldReset = ["default", "reset", "profile"].includes(requested.toLowerCase());
    const target = shouldReset ? null : reasoningEffortAlias(requested);
    if (!shouldReset && !target) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "用法：/reasoning <序号|low|medium|high|xhigh|default>",
        passthroughText: null,
      };
    }
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      reasoningEffort: target,
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: shouldReset
        ? `已恢复本会话默认推理强度。\n已断开旧 Agent 续接：${sessionsCleared}`
        : `已切换本会话推理强度：${target}\n已断开旧 Agent 续接：${sessionsCleared}`,
      passthroughText: null,
    };
  }

  if (name === "dir") {
    const requestedDir = args.join(" ");
    const listing = parseWorkDirListingRequest(args);
    if (listing) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: directoryInfoText(currentProject, currentControl, listing),
        passthroughText: null,
      };
    }
    const activeProject = currentControl?.activeProjectId
      ? context.config.projects.find((project) => project.id === currentControl.activeProjectId) || context.project
      : context.project;
    const history = normalizeWorkDirHistory(currentControl);
    const target = resolveWorkDirTargetWithHistory(requestedDir, currentProject.workDir, history);
    if (target === null) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: args.join(" ").trim() === "-"
          ? "没有可返回的上一工作目录。用 /dir 查看当前目录和用法。"
          : "目录参数为空。用 /dir 查看当前目录和用法。",
        passthroughText: null,
      };
    }
    if (target !== "") {
      try {
        const stat = fs.statSync(target);
        if (!stat.isDirectory()) throw new Error("not_directory");
      } catch {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: `目录不存在或不可访问：${target}`,
          passthroughText: null,
        };
      }
    }
    const finalWorkDir = target || activeProject.workDir;
    const storedWorkDir = path.resolve(finalWorkDir) === path.resolve(activeProject.workDir)
      ? null
      : finalWorkDir;
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      workDir: storedWorkDir,
      workDirHistory: nextWorkDirHistory({
        control: currentControl,
        previousWorkDir: currentProject.workDir,
        nextWorkDir: finalWorkDir,
      }),
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: target
        ? `已切换本会话工作目录：${target}\n已断开旧 Agent 续接：${sessionsCleared}`
        : `已恢复本会话默认工作目录。\n已断开旧 Agent 续接：${sessionsCleared}`,
      passthroughText: null,
    };
  }

  if (name === "quiet") {
    const target = parseQuietTarget(args.join(" "));
    if (target === "status") {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: toggleStatusText(context.binding, currentControl),
        passthroughText: null,
      };
    }
    if (target === "invalid") {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "不支持的 quiet 参数。用 /quiet、/quiet compact 或 /quiet full。",
        passthroughText: null,
      };
    }
    const mode = target === "toggle"
      ? isQuietMode(currentControl) ? "full" : "quiet"
      : target;
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      thinkingMessages: mode === "full" ? null : false,
      processMessages: mode === "full" ? null : false,
      toolMessages: mode === "full" ? null : false,
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: quietModeReply(mode),
      passthroughText: null,
    };
  }

  if (name === "display" || name === "thinking" || name === "process" || name === "tools") {
    if (name === "display" && ["progress", "limit", "entries", "entry-limit"].includes(normalizeString(args[0]).toLowerCase())) {
      const target = parseFeishuProgressCardEntryLimit(args.slice(1).join(" "));
      if (target === "status") {
        return {
          handled: true,
          command: name,
          action: "list",
          ok: true,
          control: currentControl,
          replyText: toggleStatusText(context.binding, currentControl),
          passthroughText: null,
        };
      }
      if (target === "invalid") {
        return {
          handled: true,
          command: name,
          action: "set",
          ok: false,
          control: currentControl,
          replyText: "不支持的进度卡数量。用法：/display progress <1-30|default>。",
          passthroughText: null,
        };
      }
      const nextLimit = target === "default" ? 8 : target;
      return {
        handled: true,
        command: name,
        action: "set",
        ok: true,
        control: currentControl,
        bindingMetadataPatch: { feishuProgressCardEntryLimit: nextLimit },
        replyText: target === "default"
          ? "已恢复 Feishu 进度卡最近动态数量：8 条。"
          : `已设置 Feishu 进度卡最近动态数量：${nextLimit} 条。`,
        passthroughText: null,
      };
    }
    const target = parseToggleTarget(args.join(" "));
    if (target === "status") {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: toggleStatusText(context.binding, currentControl),
        passthroughText: null,
      };
    }
    if (target === "invalid") {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "不支持的显示开关参数。用 /display 查看用法。",
        passthroughText: null,
      };
    }
    const update = name === "display"
      ? { thinkingMessages: target, processMessages: target, toolMessages: target }
      : name === "thinking"
        ? { thinkingMessages: target }
        : name === "process"
          ? { processMessages: target }
          : { toolMessages: target };
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      ...update,
      lastCommand: parsed.raw,
    });
    const changed = name === "display"
      ? `思考、过程回复和工具消息：${toggleLabel(target)}`
      : name === "thinking"
        ? `思考消息：${toggleLabel(target)}`
        : name === "process"
          ? `过程回复：${toggleLabel(target)}`
          : `工具消息：${toggleLabel(target)}`;
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: `已更新本 IM 会话显示设置：${changed}。`,
      passthroughText: null,
    };
  }

  if (name === "buffer") {
    return handleReplyBufferCommand(context, args, currentControl, name);
  }

  if (name === "stop") {
    const stopped = context.stopActiveRun?.({
      bindingId: context.binding.id,
      sessionKey: context.sessionKey,
    }) || {
      stopped: false,
      runId: null,
      messageId: null,
      agent: null,
      model: null,
      error: null,
    };
    const detail = [
      stopped.agent ? `Agent=${stopped.agent}` : "",
      stopped.model ? `Model=${stopped.model}` : "",
      stopped.messageId ? `Message=${stopped.messageId}` : "",
    ].filter(Boolean).join("\n");
    return {
      handled: true,
      command: name,
      action: "stop",
      ok: stopped.stopped,
      control: currentControl,
      replyText: stopped.stopped
        ? ["已请求停止当前 Agent 运行。", detail].filter(Boolean).join("\n")
        : stopped.error || "当前 IM 会话没有正在运行的 Agent。",
      passthroughText: null,
    };
  }

  if (name === "compact") {
    const compactStartedAt = Date.now();
    let compactProgressHandled = false;
    let compactSuppressReply = false;
    const startedAck = await emitBuiltinCommandProgress({
      context,
      project: currentProject,
      commandName: name,
      commandPreview: parsed.raw,
      startedAt: compactStartedAt,
      type: "started",
      outputPreview: "Context compact started.",
    });
    if (startedAck.handled) compactProgressHandled = true;
    if (startedAck.suppressFinalReply) compactSuppressReply = true;
    const nativeResult = context.nativeCompactConversation
      ? await context.nativeCompactConversation({
        bindingId: context.binding.id,
        sessionKey: context.sessionKey,
        project: currentProject,
        message: context.message,
        command: parsed.raw,
      })
      : null;
    if (nativeResult?.attempted && nativeResult.ok) {
      const finishedAck = await emitBuiltinCommandProgress({
        context,
        project: currentProject,
        commandName: name,
        commandPreview: parsed.raw,
        startedAt: compactStartedAt,
        type: "completed",
        outputPreview: "Agent native compact completed.",
      });
      if (finishedAck.handled) compactProgressHandled = true;
      if (finishedAck.suppressFinalReply) compactSuppressReply = true;
      return {
        handled: true,
        command: name,
        action: "compact",
        ok: true,
        control: currentControl,
        replyText: [
          "Agent 原生 compact 已完成。",
          nativeResult.replyText ? bufferPreviewText(nativeResult.replyText, 240) : "",
        ].filter(Boolean).join("\n"),
        passthroughText: null,
        suppressReply: compactSuppressReply,
        progressHandled: compactProgressHandled,
      };
    }
    if (nativeResult?.attempted && !nativeResult.fallbackAllowed) {
      const finishedAck = await emitBuiltinCommandProgress({
        context,
        project: currentProject,
        commandName: name,
        commandPreview: parsed.raw,
        startedAt: compactStartedAt,
        type: "failed",
        outputPreview: nativeResult.error || "Agent native compact failed.",
        error: nativeResult.error || "Agent native compact failed.",
      });
      if (finishedAck.handled) compactProgressHandled = true;
      if (finishedAck.suppressFinalReply) compactSuppressReply = true;
      return {
        handled: true,
        command: name,
        action: "compact",
        ok: false,
        control: currentControl,
        replyText: nativeResult.error || "Agent 原生 compact 未完成，且当前不允许降级 Tracevane compact。",
        passthroughText: null,
        suppressReply: compactSuppressReply,
        progressHandled: compactProgressHandled,
      };
    }
    if (!context.compactConversation) {
      const errorText = nativeResult?.error
        ? `Agent 原生 compact 未完成：${nativeResult.error}\n当前 Channel runtime 未启用 Tracevane compact contract。`
        : "当前 Channel runtime 未启用 Tracevane compact contract。";
      const finishedAck = await emitBuiltinCommandProgress({
        context,
        project: currentProject,
        commandName: name,
        commandPreview: parsed.raw,
        startedAt: compactStartedAt,
        type: "failed",
        outputPreview: errorText,
        error: errorText,
      });
      if (finishedAck.handled) compactProgressHandled = true;
      if (finishedAck.suppressFinalReply) compactSuppressReply = true;
      return {
        handled: true,
        command: name,
        action: "compact",
        ok: false,
        control: currentControl,
        replyText: errorText,
        passthroughText: null,
        suppressReply: compactSuppressReply,
        progressHandled: compactProgressHandled,
      };
    }
    const result = await context.compactConversation({
      bindingId: context.binding.id,
      sessionKey: context.sessionKey,
      project: currentProject,
      command: parsed.raw,
    });
    const resultText = result.ok
      ? `Tracevane compact completed: history ${result.beforeEntries} -> ${result.afterEntries}; sessions cleared ${result.sessionsCleared}.`
      : result.error || "Tracevane compact failed.";
    const finishedAck = await emitBuiltinCommandProgress({
      context,
      project: currentProject,
      commandName: name,
      commandPreview: parsed.raw,
      startedAt: compactStartedAt,
      type: result.ok ? "completed" : "failed",
      outputPreview: resultText,
      error: result.ok ? null : resultText,
    });
    if (finishedAck.handled) compactProgressHandled = true;
    if (finishedAck.suppressFinalReply) compactSuppressReply = true;
    return {
      handled: true,
      command: name,
      action: "compact",
      ok: result.ok,
      control: currentControl,
      replyText: result.ok
        ? [
          nativeResult?.attempted && nativeResult.error
            ? `Agent 原生 compact 未完成，已降级 Tracevane compact：${bufferPreviewText(nativeResult.error, 180)}`
            : "",
          "Tracevane compact 已压缩当前 IM 会话上下文。",
          `history: ${result.beforeEntries} -> ${result.afterEntries}`,
          `Agent sessions: cleared ${result.sessionsCleared}`,
          result.summaryText ? `summary: ${bufferPreviewText(result.summaryText, 160)}` : "",
        ].filter(Boolean).join("\n")
        : result.error || "当前 IM 会话上下文压缩失败。",
      passthroughText: null,
      suppressReply: compactSuppressReply,
      progressHandled: compactProgressHandled,
    };
  }

  if (name === "new") {
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    const historyCleared = context.conversationHistoryPath
      ? clearChannelConnectorConversationHistory(context.conversationHistoryPath, lookup)
      : 0;
    return {
      handled: true,
      command: name,
      action: "new",
      ok: true,
      control: currentControl,
      replyText: `已开启新的 Agent 会话，保留当前 IM 会话配置。清理 Agent sessions=${sessionsCleared}，history=${historyCleared}。`,
      passthroughText: null,
    };
  }

  if (name === "reset") {
    const controlsCleared = clearChannelConnectorSessionControl(context.controlsPath, lookup);
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    const historyCleared = context.conversationHistoryPath
      ? clearChannelConnectorConversationHistory(context.conversationHistoryPath, lookup)
      : 0;
    return {
      handled: true,
      command: name,
      action: "reset",
      ok: true,
      control: null,
      replyText: `已重置本 IM 会话：清理 override=${controlsCleared ? "yes" : "no"}，Agent sessions=${sessionsCleared}，history=${historyCleared}。`,
      passthroughText: null,
    };
  }

  return {
    handled: false,
    command: name,
    action: "passthrough",
    ok: null,
    control: currentControl,
    replyText: null,
    passthroughText: parsed.raw,
    nativeCommand: null,
    audit: commandAudit({
      kind: "passthrough",
      source: "user",
      name,
      args,
      commandPreview: parsed.raw,
    }),
  };
}
