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
} from "./agent-session-store.js";
import {
  clearChannelConnectorSessionControl,
  getChannelConnectorSessionControl,
  upsertChannelConnectorSessionControl,
  type ChannelConnectorSessionControlRecord,
} from "./session-control-store.js";
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
  gatewayClientKey: string | null;
  listModels?: (endpoint: string, clientKey: string | null) => Promise<string[]>;
}

export interface ChannelConnectorCommandResult {
  handled: boolean;
  command: string | null;
  action: "help" | "status" | "list" | "set" | "reset" | "new" | "passthrough" | null;
  ok: boolean | null;
  replyText: string | null;
  control: ChannelConnectorSessionControlRecord | null;
  passthroughText?: string | null;
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
  const trimmed = normalizeString(content);
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
    "new",
    "reset",
    "native",
    "raw",
    "pass",
  ].includes(name);
}

function commandHelpText(): string {
  return [
    "Studio Channel Commands",
    "/status - 查看当前 Agent、模型和权限",
    "/agent - 列出可切换 Agent",
    "/agent <序号|id|codex|claude-code|opencode> - 切换本会话 Agent",
    "/model - 列出 Gateway 可用模型",
    "/model <序号|模型ID|default> - 切换本会话模型",
    "/mode - 列出权限模式",
    "/mode <suggest|read-only|auto-edit|full-auto|plan|yolo|default> - 切换本会话权限",
    "/dir - 查看当前工作目录和子目录",
    "/cd <路径|default> - 切换本会话工作目录",
    "/display - 查看流式/工具消息开关",
    "/stream <on|off|default> - 开关本会话 IM 进度/流式消息",
    "/tools <on|off|default> - 开关本会话工具/思考消息",
    "/new - 开启新 Agent 会话，保留本会话配置",
    "/reset - 清空本 IM 会话 override 和 Agent 续接状态",
    "/native <原生命令> - 强制透传给当前 Agent，例如 /native /help",
    "未被 Studio 拥有的 /xxx 会自动透传给当前 Agent。",
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

function directoryInfoText(project: ChannelConnectorRuntimeProject): string {
  const children = listChildDirectories(project.workDir);
  const lines = [`当前工作目录：${project.workDir}`];
  if (children.length) {
    lines.push("", "子目录：");
    children.forEach((name, index) => lines.push(`${index + 1}. ${name}`));
  }
  lines.push("", "用法：/cd <路径>；/cd default 恢复 Agent Profile 默认目录。");
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

export async function listChannelConnectorGatewayModels(endpoint: string, clientKey: string | null): Promise<string[]> {
  const url = `${endpoint.replace(/\/+$/, "")}/models`;
  const headers: Record<string, string> = {};
  if (clientKey) headers.authorization = `Bearer ${clientKey}`;
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`Gateway models failed with HTTP ${response.status}`);
  const raw = await response.json() as { data?: Array<{ id?: unknown }> };
  return uniqueStrings((raw.data || []).map((item) => normalizeString(item.id)));
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

  if (name === "status" || name === "current") return handleStatus(context);

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
    if ((name === "dir" || name === "pwd") && args.length === 0) {
      return {
        handled: true,
        command: name,
        action: "list",
        ok: true,
        control: currentControl,
        replyText: directoryInfoText(currentProject),
        passthroughText: null,
      };
    }
    const target = resolveWorkDirTarget(args.join(" "), currentProject.workDir);
    if (target === null) {
      return {
        handled: true,
        command: name,
        action: "set",
        ok: false,
        control: currentControl,
        replyText: "目录参数为空。用 /dir 查看当前目录和用法。",
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
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      workDir: target || null,
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

  if (name === "new") {
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    return {
      handled: true,
      command: name,
      action: "new",
      ok: true,
      control: currentControl,
      replyText: `已开启新的 Agent 会话，保留当前 IM 会话配置。清理 Agent sessions=${sessionsCleared}。`,
      passthroughText: null,
    };
  }

  if (name === "reset") {
    const controlsCleared = clearChannelConnectorSessionControl(context.controlsPath, lookup);
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    return {
      handled: true,
      command: name,
      action: "reset",
      ok: true,
      control: null,
      replyText: `已重置本 IM 会话：清理 override=${controlsCleared ? "yes" : "no"}，Agent sessions=${sessionsCleared}。`,
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
  };
}
