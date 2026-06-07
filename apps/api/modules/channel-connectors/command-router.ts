import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ChannelConnectorOctoInboundMessage,
  ChannelConnectorPermissionMode,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import { extractOctoContent } from "./octo-adapter.js";
import {
  clearChannelConnectorAgentSessionsForConversation,
  getChannelConnectorAgentSession,
  listChannelConnectorAgentSessionsForConversation,
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
  findChannelConnectorReplyBufferForSession,
  listChannelConnectorReplyBuffersForSession,
  type ChannelConnectorReplyBufferRecord,
} from "./reply-buffer-store.js";
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

export interface ChannelConnectorCommandContext {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  message: ChannelConnectorOctoInboundMessage;
  sessionKey: string;
  controlsPath: string;
  agentSessionsPath: string;
  conversationHistoryPath?: string | null;
  replyBuffersPath?: string | null;
  gatewayClientKey: string | null;
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
}

export interface ChannelConnectorGatewayModel {
  id: string;
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

export interface ChannelConnectorCommandResult {
  handled: boolean;
  command: string | null;
  action: "help" | "status" | "list" | "show" | "set" | "reset" | "new" | "stop" | "passthrough" | null;
  ok: boolean | null;
  replyText: string | null;
  control: ChannelConnectorSessionControlRecord | null;
  passthroughText?: string | null;
  nativeCommand?: string | null;
}

interface ParsedCommand {
  raw: string;
  name: string;
  args: string[];
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function canManageSession(binding: ChannelConnectorRuntimeBinding, message: ChannelConnectorOctoInboundMessage): boolean {
  if (!binding.adminUsers.length) return true;
  return binding.adminUsers.includes(message.fromUid);
}

function isStudioCommand(name: string): boolean {
  return [
    "start",
    "help",
    "menu",
    "commands",
    "command",
    "cmd",
    "status",
    "current",
    "list",
    "sessions",
    "switch",
    "history",
    "agent",
    "agents",
    "model",
    "models",
    "mode",
    "permission",
    "permissions",
    "yolo",
    "dir",
    "cd",
    "chdir",
    "workdir",
    "pwd",
    "display",
    "stream",
    "streams",
    "progress",
    "tools",
    "tool",
    "buffer",
    "buffers",
    "reply-buffer",
    "reply-buffers",
    "stop",
    "cancel",
    "new",
    "reset",
    "native",
    "raw",
    "pass",
  ].includes(name);
}

function commandHelpText(): string {
  return [
    "**Studio Channel Commands**",
    "",
    "普通消息会交给当前 Agent。未被 Studio 占用的 `/xxx` 会自动透传；冲突命令用 `/native <命令>`。",
    "",
    "**会话**",
    "- `/status` 查看当前 Agent、模型、权限和续接状态",
    "- `/current` 查看当前 IM 会话详情",
    "- `/list` 列出当前 IM 会话已知 Agent sessions",
    "- `/switch <序号|sessionId前缀>` 切换到已知 Agent session",
    "- `/history` 查看当前 IM 会话最近上下文",
    "- `/stop` 停止当前 IM 会话正在运行的 Agent",
    "- `/new` 开启新 Agent 会话，保留本会话配置",
    "- `/reset` 清空本 IM 会话 override 和 Agent 续接状态",
    "",
    "**Agent / 模型 / 权限**",
    "- `/agent` 列出可切换 Agent Profile",
    "- `/agent <序号|id|codex|claude-code|opencode>` 切换本会话 Agent",
    "- `/model` 列出 Studio Gateway 可用模型",
    "- `/model <序号|模型ID|default>` 切换本会话模型",
    "- `/mode` 列出权限模式",
    "- `/mode <suggest|read-only|auto-edit|full-auto|plan|yolo|default>` 切换本会话权限",
    "",
    "**目录**",
    "- `/dir` 查看当前工作目录、最近目录和子目录",
    "- `/dir <路径|序号|->` 切换目录；序号优先选择最近目录，`-` 返回上一目录",
    "- `/cd <路径|default>` `/dir` 的兼容别名",
    "",
    "**显示 / 工具 / 长回复**",
    "- `/display` 查看流式和工具消息开关",
    "- `/stream <on|off|default>` 开关本会话进度/流式消息",
    "- `/tools <on|off|default>` 开关本会话工具/思考消息",
    "- `/buffer` 查看本会话最近 reply buffer",
    "- `/buffer <id|前缀|latest>` 读取本会话缓存的完整长回复",
    "",
    "**原生 Agent**",
    "- `/native /help` 查看当前 Agent 原生帮助或 skills 命令",
    "- `/native <原生命令>` 强制透传给当前 Agent",
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
  const stream = effectiveToggle(control?.streamMessages);
  const tools = effectiveToggle(control?.toolMessages);
  return [
    "显示设置：",
    `流式/进度消息：${stream ? "开启" : "关闭"}${control?.streamMessages === null || control?.streamMessages === undefined ? " (默认)" : ""}`,
    `工具/思考消息：${tools ? "开启" : "关闭"}${control?.toolMessages === null || control?.toolMessages === undefined ? " (默认)" : ""}`,
    "用法：/stream <on|off|default>；/tools <on|off|default>；/display default 恢复默认。",
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

function bufferPreviewText(value: string, maxRunes = 120): string {
  const runes = Array.from(value);
  const preview = runes.slice(0, maxRunes).join("");
  return runes.length > maxRunes ? `${preview}...` : preview;
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

async function handleStatus(context: ChannelConnectorCommandContext): Promise<ChannelConnectorCommandResult> {
  const control = getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context));
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, control);
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
      `Mode: ${currentProject.permissionMode}`,
      `WorkDir: ${currentProject.workDir}`,
      `Stream: ${effectiveToggle(control?.streamMessages) ? "on" : "off"}`,
      `Tools: ${effectiveToggle(control?.toolMessages) ? "on" : "off"}`,
      `Session: ${session ? `${session.turnCount} turns` : "new"}`,
      `Codex thread: ${session?.codexThreadId || "-"}`,
    ].join("\n"),
  };
}

async function handleCurrent(context: ChannelConnectorCommandContext): Promise<ChannelConnectorCommandResult> {
  const control = getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context));
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, control);
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
    command: "current",
    action: "status",
    ok: true,
    control,
    replyText: [
      "Studio Current Session",
      `Binding: ${context.binding.id}`,
      `Session key: ${context.sessionKey}`,
      `Agent: ${currentProject.id} (${currentProject.agent})`,
      `Model: ${currentProject.model || "default"}`,
      `Mode: ${currentProject.permissionMode}`,
      `WorkDir: ${currentProject.workDir}`,
      `Stream: ${effectiveToggle(control?.streamMessages) ? "on" : "off"}`,
      `Tools: ${effectiveToggle(control?.toolMessages) ? "on" : "off"}`,
      `Agent session: ${session ? `${session.turnCount} turns` : "not started"}`,
      `Last status: ${session?.lastStatus || "-"}`,
      `Last message: ${session?.lastMessageId || "-"}`,
      `Codex thread: ${session?.codexThreadId || "-"}`,
    ].join("\n"),
  };
}

function historyCommandText(context: ChannelConnectorCommandContext): string {
  const filePath = normalizeString(context.conversationHistoryPath);
  if (!filePath) return "当前 Channel daemon 未启用 history store。";
  const entries = getChannelConnectorConversationHistory(filePath, controlsLookup(context), 10);
  if (!entries.length) return "当前 IM 会话还没有可显示的 history。";
  const lines = ["Studio Session History"];
  for (const [index, entry] of entries.entries()) {
    const role = entry.role === "assistant" ? "assistant" : "user";
    const status = entry.status ? ` (${entry.status})` : "";
    const text = normalizeString(entry.text) || "(no text)";
    const attachments = entry.attachmentSummaries.length
      ? `\nattachments: ${entry.attachmentSummaries.join("; ")}`
      : "";
    lines.push(`${index + 1}. ${role}${status} · ${entry.createdAt}\n${bufferPreviewText(text, 220)}${attachments}`);
  }
  return lines.join("\n\n");
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
    lines.push([
      `${marker} ${index + 1}. ${record.projectId} (${record.agent})`,
      `   model=${record.model || "default"} turns=${record.turnCount} status=${record.lastStatus || "-"}`,
      `   updated=${record.updatedAt}`,
      `   workDir=${record.workDir}`,
    ].join("\n"));
  });
  lines.push("用法：/switch <序号|sessionId前缀>");
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

export async function handleChannelConnectorCommand(
  context: ChannelConnectorCommandContext,
): Promise<ChannelConnectorCommandResult> {
  const parsed = parseChannelConnectorCommand(extractOctoContent(context.message));
  if (!parsed) {
    return {
      handled: false,
      command: null,
      action: null,
      ok: null,
      replyText: null,
      control: getChannelConnectorSessionControl(context.controlsPath, controlsLookup(context)),
      passthroughText: null,
      nativeCommand: null,
    };
  }

  const lookup = controlsLookup(context);
  const currentControl = getChannelConnectorSessionControl(context.controlsPath, lookup);
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, currentControl);
  const name = parsed.name;
  const args = parsed.args;
  const mutating = (
    [
      "agent",
      "model",
      "mode",
      "permission",
      "permissions",
      "switch",
      "reset",
      "new",
      "yolo",
      "dir",
      "cd",
      "chdir",
      "workdir",
      "display",
      "stream",
      "streams",
      "progress",
      "tools",
      "tool",
      "stop",
      "cancel",
    ].includes(name)
    && !(["agent", "model", "mode", "permission", "permissions", "dir", "display", "stream", "streams", "progress", "tools", "tool"].includes(name) && args.length === 0)
  );

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

  if (!isStudioCommand(name)) {
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

  if (name === "native" || name === "raw" || name === "pass") {
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

  if (name === "start" || name === "help" || name === "menu" || name === "commands" || name === "command" || name === "cmd") {
    return {
      handled: true,
      command: name,
      action: "help",
      ok: true,
      control: currentControl,
      replyText: commandHelpText(),
      passthroughText: null,
    };
  }

  if (name === "status") return handleStatus(context);
  if (name === "current") return handleCurrent(context);
  if (name === "list" || name === "sessions" || name === "switch") {
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
    if (name === "list" || name === "sessions") {
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
      replyText: historyCommandText(context),
      passthroughText: null,
    };
  }

  if (name === "agent" || name === "agents") {
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

  if (name === "model" || name === "models") {
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

  if (name === "mode" || name === "permission" || name === "permissions" || name === "yolo") {
    if (name === "yolo" && args.length === 0) args.push("yolo");
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

  if (name === "dir" || name === "pwd" || name === "cd" || name === "chdir" || name === "workdir") {
    const requestedDir = args.join(" ");
    if (
      ((name === "dir" || name === "pwd") && args.length === 0)
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

  if (name === "display" || name === "stream" || name === "streams" || name === "progress" || name === "tools" || name === "tool") {
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
      ? { streamMessages: target, toolMessages: target }
      : name === "tools" || name === "tool"
        ? { toolMessages: target }
        : { streamMessages: target };
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      ...update,
      lastCommand: parsed.raw,
    });
    const changed = name === "display"
      ? `流式/进度消息和工具/思考消息：${toggleLabel(target)}`
      : name === "tools" || name === "tool"
        ? `工具/思考消息：${toggleLabel(target)}`
        : `流式/进度消息：${toggleLabel(target)}`;
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

  if (name === "buffer" || name === "buffers" || name === "reply-buffer" || name === "reply-buffers") {
    return handleReplyBufferCommand(context, args, currentControl, name);
  }

  if (name === "stop" || name === "cancel") {
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
