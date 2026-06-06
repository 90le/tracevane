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
  action: "help" | "status" | "list" | "set" | "reset" | "unknown" | null;
  ok: boolean | null;
  replyText: string | null;
  control: ChannelConnectorSessionControlRecord | null;
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
    "/reset - 清空本 IM 会话 override 和 Agent 续接状态",
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

async function defaultListGatewayModels(endpoint: string, clientKey: string | null): Promise<string[]> {
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
    const models = await (context.listModels || defaultListGatewayModels)(
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
    };
  }

  const lookup = controlsLookup(context);
  const currentControl = getChannelConnectorSessionControl(context.controlsPath, lookup);
  const currentProject = resolveChannelConnectorEffectiveProject(context.config, context.project, currentControl);
  const name = parsed.name;
  const args = parsed.args;
  const mutating = (
    ["agent", "model", "mode", "permission", "permissions", "reset", "new", "yolo"].includes(name)
    && !(["agent", "model", "mode", "permission", "permissions"].includes(name) && args.length === 0)
  );

  if (mutating && !canManageSession(context.binding, context.message)) {
    return {
      handled: true,
      command: name,
      action: "set",
      ok: false,
      control: currentControl,
      replyText: "当前用户没有管理该 Channel session 的权限。",
    };
  }

  if (name === "start" || name === "help" || name === "menu" || name === "commands") {
    return {
      handled: true,
      command: name,
      action: "help",
      ok: true,
      control: currentControl,
      replyText: commandHelpText(),
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
      };
    }
    const control = upsertChannelConnectorSessionControl(context.controlsPath, {
      ...lookup,
      activeProjectId: target.id,
      model: null,
      permissionMode: null,
      lastCommand: parsed.raw,
    });
    return {
      handled: true,
      command: name,
      action: "set",
      ok: true,
      control,
      replyText: `已切换本会话 Agent：${target.id} (${target.agent})。模型和权限已恢复该 Agent Profile 默认值。`,
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
    };
  }

  if (name === "reset" || name === "new") {
    const controlsCleared = clearChannelConnectorSessionControl(context.controlsPath, lookup);
    const sessionsCleared = clearChannelConnectorAgentSessionsForConversation(context.agentSessionsPath, lookup);
    return {
      handled: true,
      command: name,
      action: "reset",
      ok: true,
      control: null,
      replyText: `已重置本 IM 会话：清理 override=${controlsCleared ? "yes" : "no"}，Agent sessions=${sessionsCleared}。`,
    };
  }

  return {
    handled: true,
    command: name,
    action: "unknown",
    ok: false,
    control: currentControl,
    replyText: `未知命令：/${name}\n发送 /help 查看可用命令。`,
  };
}
