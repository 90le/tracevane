import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorPermissionMode,
  ChannelConnectorReasoningEffort,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import { extractOctoContent } from "./octo-adapter.js";
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

export interface ChannelConnectorCommandResult {
  handled: boolean;
  command: string | null;
  action: "help" | "status" | "list" | "show" | "set" | "reset" | "new" | "stop" | "compact" | "usage" | "delete" | "permission" | "passthrough" | null;
  ok: boolean | null;
  replyText: string | null;
  control: ChannelConnectorSessionControlRecord | null;
  passthroughText?: string | null;
  nativeCommand?: string | null;
  suppressReply?: boolean;
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

let cachedStudioRuntimeVersion: string | null = null;

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
    process.env.OPENCLAW_STUDIO_ROOT || "",
    process.env.OPENCLAW_STUDIO_EXTENSION_DIR || "",
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

function studioRuntimeVersion(): string {
  const envVersion = normalizeString(process.env.OPENCLAW_STUDIO_BUILD_VERSION)
    || normalizeString(process.env.OPENCLAW_STUDIO_VERSION)
    || normalizeString(process.env.STUDIO_VERSION)
    || normalizeString(process.env.npm_package_version);
  if (envVersion) return envVersion;
  if (cachedStudioRuntimeVersion) return cachedStudioRuntimeVersion;

  for (const filePath of packageVersionCandidateFiles()) {
    const version = readPackageVersionFromFile(filePath);
    if (!version) continue;
    cachedStudioRuntimeVersion = version;
    return version;
  }

  cachedStudioRuntimeVersion = "unknown";
  return cachedStudioRuntimeVersion;
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
  for (const key of ["aliases", "commandAliases", "command_aliases", "studioCommandAliases", "studio_command_aliases"]) {
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

const STUDIO_COMMAND_MATCH_CANDIDATES: readonly CommandMatchCandidate[] = [
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
];

export function matchChannelConnectorCommandPrefix(
  input: string,
  candidates: readonly CommandMatchCandidate[] = STUDIO_COMMAND_MATCH_CANDIDATES,
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
        ? `Studio 会按 CC CommandProvider 合同扫描：${dirs.join("；")}`
        : `当前 Agent (${project.agent}) 尚未在 Studio 中声明命令目录。`,
      "用法：/commands add <名称> <prompt 模板>；/commands del <名称>。",
    ].join("\n");
  }
  const lines = [`Studio Custom Commands (${commands.length})`];
  for (const command of commands) {
    const tag = command.source === "agent" ? " [agent]" : "";
    lines.push(`/${command.name}${tag}`);
    lines.push(`  ${command.description || firstLine(command.prompt) || "Custom prompt command"}`);
  }
  lines.push("用法：/<命令名> [参数]。支持 {{1}}、{{2*}}、{{args}} 和默认值占位。");
  lines.push("管理：/commands add <名称> <prompt 模板>；/commands del <名称>。");
  return lines.join("\n");
}

function skillsListText(project: ChannelConnectorRuntimeProject): string {
  const skills = listChannelConnectorSkills(project);
  if (!skills.length) {
    const dirs = channelConnectorSkillDirs(project);
    return [
      "未发现任何 Skill。",
      dirs.length
        ? `Studio 会按 CC SkillProvider 合同扫描：${dirs.join("；")}`
        : `当前 Agent (${project.agent}) 尚未在 Studio 中声明 Skill 目录。`,
    ].join("\n");
  }
  const lines = [`Studio Skills (${project.agent}) - ${skills.length} 个`];
  for (const skill of skills) {
    lines.push(`/${skill.name}`);
    lines.push(`  ${skill.description || "Skill"}`);
  }
  lines.push("用法：/<skill名称> [参数...]。Studio 会把 Skill 指令和用户参数一起交给当前 Agent。");
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
    description: command.description || firstLine(command.prompt) || "Custom prompt command",
    source: command.source,
  }));
}

export function listChannelConnectorSkillSummaries(
  project: ChannelConnectorRuntimeProject,
): ChannelConnectorSkillSummary[] {
  return listChannelConnectorSkills(project).map((skill) => ({
    name: skill.name,
    displayName: skill.displayName,
    description: skill.description,
    source: skill.source,
  }));
}

function commandsUsageText(): string {
  return [
    "用法：",
    "/commands - 列出自定义命令",
    "/commands add <名称> <prompt 模板> - 添加 prompt 命令",
    "/commands del <名称> - 删除 prompt 命令",
    "暂不开放 /commands addexec；shell 执行面后续需单独按 admin/yolo/审计合同验收。",
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
  const lines = [`Studio Command Aliases (${aliases.length})`];
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

function isStudioCommand(name: string): boolean {
  return Boolean(matchChannelConnectorCommandPrefix(name));
}

type CommandHelpSection = "session" | "agent" | "display" | "buffer" | "workdir" | "commands" | "native";

function commandHelpList(rows: Array<[string, string]>): string {
  return rows.map(([command, description]) => `- ${command} - ${description}`).join("\n");
}

function commandHelpSectionAlias(value: string | null | undefined): CommandHelpSection | null {
  const target = normalizeString(value).toLowerCase();
  if (!target) return null;
  if (["session", "sessions", "status", "current", "history", "compact", "stop", "delete", "del", "rm", "whoami", "myid", "version"].includes(target)) {
    return "session";
  }
  if (["agent", "profile", "model", "mode", "reasoning", "permission"].includes(target)) return "agent";
  if (["display", "thinking", "think", "process", "progress", "tools", "tool", "quiet"].includes(target)) return "display";
  if (["buffer", "buffers", "reply-buffer", "reply-buffers"].includes(target)) return "buffer";
  if (["workdir", "dir", "cd", "directory"].includes(target)) return "workdir";
  if (["commands", "command", "cmd", "alias", "aliases", "skills", "skill"].includes(target)) return "commands";
  if (["native", "raw", "pass", "slash"].includes(target)) return "native";
  return null;
}

function commandHelpSectionText(section: CommandHelpSection): string {
  if (section === "session") {
    return [
      "Studio Channel / session",
      "",
      commandHelpList([
        ["`/whoami`", "查看当前 IM 用户、频道和 session id"],
        ["`/version`", "查看 Studio Channel runtime 版本"],
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
      "Studio Channel / agent",
      "",
      commandHelpList([
        ["`/agent`", "列出可切换 Agent Profile"],
        ["`/agent <序号|id|codex|claude-code|opencode>`", "切换本会话 Agent"],
        ["`/model`", "列出 Studio Gateway 可用模型"],
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
      "Studio Channel / display",
      "",
      commandHelpList([
        ["`/display`", "查看思考、过程回复和工具消息开关"],
        ["`/quiet [quiet|compact|full]`", "按 CC 习惯隐藏或恢复中间态消息"],
        ["`/thinking <on|off|default>`", "开关本会话思考消息"],
        ["`/process <on|off|default>`", "开关本会话过程回复"],
        ["`/tools <on|off|default>`", "开关本会话工具消息"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "buffer") {
    return [
      "Studio Channel / buffer",
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
      "Studio Channel / workdir",
      "",
      commandHelpList([
        ["`/dir`", "查看当前工作目录、最近目录和子目录"],
        ["`/dir <路径|序号|->`", "切换目录；序号优先选最近目录，`-` 返回上一目录"],
        ["`/cd <路径|default>`", "`/dir` 的兼容别名"],
      ]),
      "",
      "返回：`/help`",
    ].join("\n");
  }
  if (section === "commands") {
    return [
      "Studio Channel / commands",
      "",
      commandHelpList([
        ["`/commands`", "列出当前 Agent 自定义 prompt 命令"],
        ["`/commands add <名称> <prompt 模板>`", "添加 prompt 命令"],
        ["`/commands del <名称>`", "删除 prompt 命令"],
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
  return [
    "Studio Channel / native",
    "",
    commandHelpList([
      ["`/native /help`", "查看当前 Agent 原生帮助或 skills 命令"],
      ["`/native /compact`", "尝试 CLI Agent 原生压缩；仅持久/交互式 runner 支持，Codex one-shot 会拒绝伪执行"],
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
    "Studio Channel",
    "普通消息会交给当前 Agent。未被 Studio 占用的 `/xxx` 会自动透传；冲突命令用 `/native <命令>`。",
    "",
    "**常用命令**",
    commandHelpList([
      ["`/status` `/new` `/reset` `/stop` `/compact`", "会话状态、新会话、重置、停止、native-first compact"],
      ["`/whoami` `/version`", "身份排查和 runtime 版本"],
      ["`/agent` `/model` `/mode` `/reasoning`", "切换 Agent、模型、权限、推理强度"],
      ["`/display` `/quiet` `/thinking` `/process` `/tools`", "控制思考、过程回复和工具显示"],
      ["`/commands` `/alias` `/skills` `/native /help`", "自定义命令、命令别名、Skills、Agent 原生命令"],
    ]),
    "",
    "**分组帮助**",
    commandHelpList([
      ["`/help session`", "会话、history、usage、权限批准"],
      ["`/help agent`", "Agent、模型、权限、推理"],
      ["`/help display`", "思考、过程回复和工具消息"],
      ["`/help buffer`", "群聊长回复缓存和紧凑显示"],
      ["`/help workdir`", "工作目录切换"],
      ["`/help commands`", "自定义命令、别名和 Skills"],
      ["`/help native`", "Agent 原生命令透传"],
    ]),
  ].join("\n");
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
  if (target === "-") return history[0] || null;
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1 && index <= history.length) {
    return history[index - 1] || null;
  }
  return resolveWorkDirTarget(target, currentWorkDir);
}

function listChildDirectories(workDir: string): string[] {
  try {
    return fs.readdirSync(workDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 20);
  } catch {
    return [];
  }
}

function directoryInfoText(
  project: ChannelConnectorRuntimeProject,
  control: ChannelConnectorSessionControlRecord | null,
): string {
  const children = listChildDirectories(project.workDir);
  const history = normalizeWorkDirHistory(control)
    .filter((item) => path.resolve(item) !== path.resolve(project.workDir))
    .slice(0, 10);
  const lines = [`当前工作目录：${project.workDir}`];
  if (history.length) {
    lines.push("", "最近目录：");
    history.forEach((name, index) => lines.push(`${index + 1}. ${name}`));
  }
  if (children.length) {
    lines.push("", "子目录：");
    children.forEach((name, index) => lines.push(`${index + 1}. ${name}`));
  }
  lines.push("", "用法：/dir <路径|序号|->；/cd <路径|default>。序号优先选择最近目录，历史为空时选择子目录。");
  return lines.join("\n");
}

function effectiveToggle(value: boolean | null | undefined): boolean {
  return value !== false;
}

function toggleStatusText(
  control: ChannelConnectorSessionControlRecord | null,
): string {
  const thinking = effectiveToggle(control?.thinkingMessages);
  const process = effectiveToggle(control?.processMessages);
  const tools = effectiveToggle(control?.toolMessages);
  return [
    "显示设置：",
    `思考消息：${thinking ? "开启" : "关闭"}${control?.thinkingMessages === null || control?.thinkingMessages === undefined ? " (默认)" : ""}`,
    `过程回复：${process ? "开启" : "关闭"}${control?.processMessages === null || control?.processMessages === undefined ? " (默认)" : ""}`,
    `工具消息：${tools ? "开启" : "关闭"}${control?.toolMessages === null || control?.toolMessages === undefined ? " (默认)" : ""}`,
    "用法：/quiet 隐藏/恢复中间态；/thinking <on|off|default>；/process <on|off|default>；/tools <on|off|default>；/display default 恢复默认。",
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

function parsePositiveLimit(value: string | null | undefined, fallback: number, max = 50): number {
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
    "Studio Reply Buffer",
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

function resolveModelTarget(input: string, models: string[]): string | null {
  const target = normalizeString(input);
  if (!target) return null;
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1 && index <= models.length) return models[index - 1] || null;
  const exact = models.find((model) => model.toLowerCase() === target.toLowerCase());
  return exact || target;
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
    ? getChannelConnectorConversationHistory(input.context.conversationHistoryPath, controlsLookup(input.context), 50)
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
      "Studio Channel Status",
      `Agent: ${currentProject.id} (${currentProject.agent})`,
      `Model: ${currentProject.model || "default"}`,
      `Reasoning: ${currentProject.reasoningEffort || "default"}`,
      `Mode: ${currentProject.permissionMode}`,
      `WorkDir: ${currentProject.workDir}`,
      `Thinking: ${effectiveToggle(control?.thinkingMessages) ? "on" : "off"}`,
      `Process: ${effectiveToggle(control?.processMessages) ? "on" : "off"}`,
      `Tools: ${effectiveToggle(control?.toolMessages) ? "on" : "off"}`,
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
    ? getChannelConnectorConversationHistory(context.conversationHistoryPath, lookup, 50).length
    : 0;
  const sessionName = session?.name || control?.sessionName || "-";
  return {
    handled: true,
    command: "current",
    action: "status",
    ok: true,
    control,
    replyText: [
      "Studio Current Session",
      `Binding: ${context.binding.id}`,
      `Session key: ${context.sessionKey}`,
      `Session name: ${sessionName}`,
      `Agent: ${currentProject.id} (${currentProject.agent})`,
      `Model: ${currentProject.model || "default"}`,
      `Reasoning: ${currentProject.reasoningEffort || "default"}`,
      `Mode: ${currentProject.permissionMode}`,
      `WorkDir: ${currentProject.workDir}`,
      `Thinking: ${effectiveToggle(control?.thinkingMessages) ? "on" : "off"}`,
      `Process: ${effectiveToggle(control?.processMessages) ? "on" : "off"}`,
      `Tools: ${effectiveToggle(control?.toolMessages) ? "on" : "off"}`,
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
      "Studio Whoami",
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
      "Studio Channel Version",
      `Studio: ${studioRuntimeVersion()}`,
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
  const limit = parsePositiveLimit(args[0], 10, 50);
  const entries = getChannelConnectorConversationHistory(filePath, controlsLookup(context), limit);
  if (!entries.length) return "当前 IM 会话还没有可显示的 history。";
  const lines = [`Studio Session History (last ${entries.length}/${limit})`];
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
      "Studio Usage",
      "当前 IM 会话还没有可统计的 Gateway usage。",
      "只有通过 Studio Gateway 且上游返回 usage/token 字段的 Agent 请求会计入。",
    ].join("\n");
  }
  const lines = [
    "Studio Usage",
    `Requests: ${summary.requests} (${summary.successfulRequests} success / ${summary.failedRequests} failed)`,
    `Tokens: input ${summary.inputTokens} · output ${summary.outputTokens} · total ${summary.totalTokens}`,
  ];
  if (summary.cacheReadTokens || summary.cacheCreationTokens) {
    lines.push(`Cache: read ${summary.cacheReadTokens} · write ${summary.cacheCreationTokens}`);
  }
  if (summary.models.length) lines.push(`Models: ${summary.models.join(", ")}`);
  if (summary.providers.length) lines.push(`Providers: ${summary.providers.join(", ")}`);
  lines.push(`Last request: ${summary.lastRequestAt || "-"}`);
  lines.push("Source: Studio Gateway runtime log, correlated by Agent run time window.");
  return lines.join("\n");
}

function sessionListText(
  records: ChannelConnectorAgentSessionRecord[],
  activeSessionId: string | null,
): string {
  if (!records.length) {
    return [
      "当前 IM 会话还没有本地 Agent session。",
      "发送普通消息后，Studio 会保存可续接记录；用法：/switch <序号|sessionId前缀>。",
    ].join("\n");
  }
  const lines = ["Studio Agent Sessions"];
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
    `Studio Session Search: ${query}`,
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
  const parsedStudioName = parsed ? matchChannelConnectorCommandPrefix(parsed.name) : null;
  const parsedNameForControl = parsedStudioName || parsed?.name || "";
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
  const name = parsedStudioName || parsed.name;
  const args = parsed.args;
  const rawCommandsSubcommand = normalizeString(args[0]).toLowerCase();
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
  const listOnlyCommand = ["agent", "model", "mode", "reasoning", "dir", "display", "thinking", "process", "tools"].includes(name)
    && args.length === 0;
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

  if (!isStudioCommand(name)) {
    const customCommand = resolveCustomCommand(context, currentProject, name);
    if (customCommand) {
      return {
        handled: false,
        command: customCommand.name,
        action: "passthrough",
        ok: null,
        control: currentControl,
        replyText: null,
        passthroughText: expandAgentCommandPrompt(customCommand.prompt, args),
        nativeCommand: null,
      };
    }
    const skill = resolveChannelConnectorSkill(currentProject, name);
    if (skill) {
      return {
        handled: false,
        command: skill.name,
        action: "passthrough",
        ok: null,
        control: currentControl,
        replyText: null,
        passthroughText: buildChannelConnectorSkillPrompt(skill, args),
        nativeCommand: null,
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
          replyText: "当前 Channel runtime 未启用 Agent 原生 compact contract。请使用 /compact 允许 Studio Gateway fallback。",
          passthroughText: null,
          nativeCommand: null,
        };
      }
      const nativeResult = await context.nativeCompactConversation({
        bindingId: context.binding.id,
        sessionKey: context.sessionKey,
        project: currentProject,
        message: context.message,
        command: target,
      });
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
          "请使用 /compact 让 Studio 按 native-first 后降级 Gateway compact。",
        ].filter(Boolean).join("\n"),
        passthroughText: null,
        nativeCommand: null,
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
    };
  }

  if (name === "skills") {
    return {
      handled: true,
      command: name,
      action: "list",
      ok: true,
      control: currentControl,
      replyText: skillsListText(currentProject),
      passthroughText: null,
    };
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
          replyText: `别名 ${aliasName} 来自 binding metadata：${metadataAlias.command}。请在 Studio 配置中修改，或换一个触发词。`,
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
      if (isStudioCommand(commandName) || resolveCustomCommand(context, currentProject, commandName)) {
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
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "暂不开放 /commands addexec。shell 执行面需要单独按 admin/yolo/审计合同验收后再启用。",
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
    if (
      (args.length === 0)
      || ["help", "usage", "?"].includes(normalizeString(requestedDir).toLowerCase())
    ) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: directoryInfoText(currentProject, currentControl),
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
        replyText: toggleStatusText(currentControl),
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
    const target = parseToggleTarget(args.join(" "));
    if (target === "status") {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: toggleStatusText(currentControl),
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
      };
    }
    if (nativeResult?.attempted && !nativeResult.fallbackAllowed) {
      return {
        handled: true,
        command: name,
        action: "compact",
        ok: false,
        control: currentControl,
        replyText: nativeResult.error || "Agent 原生 compact 未完成，且当前不允许降级 Studio compact。",
        passthroughText: null,
      };
    }
    if (!context.compactConversation) {
      return {
        handled: true,
        command: name,
        action: "compact",
        ok: false,
        control: currentControl,
        replyText: nativeResult?.error
          ? `Agent 原生 compact 未完成：${nativeResult.error}\n当前 Channel runtime 未启用 Studio compact contract。`
          : "当前 Channel runtime 未启用 Studio compact contract。",
        passthroughText: null,
      };
    }
    const result = await context.compactConversation({
      bindingId: context.binding.id,
      sessionKey: context.sessionKey,
      project: currentProject,
      command: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "compact",
      ok: result.ok,
      control: currentControl,
      replyText: result.ok
        ? [
          nativeResult?.attempted && nativeResult.error
            ? `Agent 原生 compact 未完成，已降级 Studio compact：${bufferPreviewText(nativeResult.error, 180)}`
            : "",
          "Studio compact 已压缩当前 IM 会话上下文。",
          `history: ${result.beforeEntries} -> ${result.afterEntries}`,
          `Agent sessions: cleared ${result.sessionsCleared}`,
          result.summaryText ? `summary: ${bufferPreviewText(result.summaryText, 160)}` : "",
        ].filter(Boolean).join("\n")
        : result.error || "当前 IM 会话上下文压缩失败。",
      passthroughText: null,
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
  };
}
