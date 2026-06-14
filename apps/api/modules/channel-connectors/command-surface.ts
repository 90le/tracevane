import fs from "node:fs";
import path from "node:path";
import { Buffer } from "node:buffer";
import type {
  ChannelConnectorCommandSurface,
  ChannelConnectorCommandSurfaceAction,
  ChannelConnectorCommandSurfaceSection,
  ChannelConnectorCommandSurfaceSkill,
  ChannelConnectorCommandSurfaceSkillAction,
  ChannelConnectorFeishuInteractiveCard,
  ChannelConnectorPermissionMode,
  ChannelConnectorReasoningEffort,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorRuntimeBinding,
  ChannelConnectorRuntimeProject,
} from "./agent-runner.js";
import { resolveChannelConnectorEffectiveProject } from "./command-router.js";
import {
  formatChannelConnectorThinkingSupport,
  resolveChannelConnectorThinkingSupport,
} from "./agent-capabilities.js";
import type { ChannelConnectorSessionControlRecord } from "./session-control-store.js";

const PERMISSION_MODES: readonly ChannelConnectorPermissionMode[] = [
  "suggest",
  "read-only",
  "auto-edit",
  "full-auto",
  "plan",
  "yolo",
];

const REASONING_EFFORTS: readonly ChannelConnectorReasoningEffort[] = ["low", "medium", "high", "xhigh"];
const AUTO_VISION_MODEL_SENTINEL = "__studio_auto__";

const PERMISSION_MODE_LABELS: Record<ChannelConnectorPermissionMode, string> = {
  suggest: "建议确认",
  "read-only": "只读",
  "auto-edit": "自动编辑",
  "full-auto": "全自动",
  plan: "规划",
  yolo: "YOLO",
};

const REASONING_EFFORT_LABELS: Record<ChannelConnectorReasoningEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "XHigh",
};

const PERMISSION_MODE_DESCRIPTIONS: Record<ChannelConnectorPermissionMode, string> = {
  suggest: "执行前询问",
  "read-only": "只允许读取",
  "auto-edit": "可编辑，关键动作确认",
  "full-auto": "可编辑并自动执行",
  plan: "只规划不执行",
  yolo: "高权限直通",
};

const FEISHU_MENU_SECTIONS = [
  "session",
  "agent",
  "model",
  "vision",
  "mode",
  "display",
  "buffer",
  "workdir",
  "commands",
  "native",
] as const;

type FeishuMenuSectionId = typeof FEISHU_MENU_SECTIONS[number];

const FEISHU_MENU_VIEWS = [
  "help",
  "more",
  "session",
  "current",
  "sessions",
  "history",
  "agent",
  "model",
  "vision",
  "mode",
  "display",
  "buffer",
  "workdir",
  "commands",
] as const;

type FeishuMenuViewId = typeof FEISHU_MENU_VIEWS[number];

const FEISHU_MENU_SECTION_LABELS: Record<FeishuMenuSectionId, string> = {
  session: "会话",
  agent: "Agent",
  model: "模型",
  vision: "视觉",
  mode: "权限/推理",
  display: "进度显示",
  buffer: "缓存",
  workdir: "工作目录",
  commands: "命令/Skills",
  native: "原生命令",
};

const FEISHU_MENU_SECTION_ALIASES: Record<string, FeishuMenuSectionId> = {
  session: "session",
  status: "session",
  whoami: "session",
  myid: "session",
  version: "session",
  current: "session",
  list: "session",
  sessions: "session",
  switch: "session",
  search: "session",
  find: "session",
  name: "session",
  rename: "session",
  delete: "session",
  del: "session",
  rm: "session",
  history: "session",
  compact: "session",
  compress: "session",
  new: "session",
  reset: "session",
  agent: "agent",
  agents: "agent",
  project: "agent",
  profile: "agent",
  model: "model",
  models: "model",
  vision: "vision",
  visual: "vision",
  image: "vision",
  "vision-model": "vision",
  "visual-model": "vision",
  "image-model": "vision",
  mode: "mode",
  permission: "mode",
  permissions: "mode",
  yolo: "mode",
  reasoning: "mode",
  effort: "mode",
  display: "display",
  thinking: "display",
  think: "display",
  process: "display",
  progress: "display",
  tools: "display",
  tool: "display",
  quiet: "display",
  buffer: "buffer",
  buffers: "buffer",
  "reply-buffer": "buffer",
  "reply-buffers": "buffer",
  workdir: "workdir",
  dir: "workdir",
  pwd: "workdir",
  cd: "workdir",
  chdir: "workdir",
  commands: "commands",
  command: "commands",
  cmd: "commands",
  alias: "commands",
  aliases: "commands",
  native: "native",
  raw: "native",
  pass: "native",
};

const FEISHU_MENU_VIEW_ALIASES: Record<string, FeishuMenuViewId> = {
  help: "help",
  menu: "help",
  more: "more",
  advanced: "more",
  settings: "more",
  commands: "commands",
  command: "commands",
  cmd: "commands",
  alias: "commands",
  aliases: "commands",
  start: "help",
  whoami: "session",
  myid: "session",
  version: "session",
  session: "session",
  status: "session",
  current: "current",
  list: "sessions",
  sessions: "sessions",
  switch: "sessions",
  search: "sessions",
  find: "sessions",
  name: "sessions",
  rename: "sessions",
  delete: "sessions",
  del: "sessions",
  rm: "sessions",
  history: "history",
  compact: "session",
  compress: "session",
  new: "session",
  reset: "session",
  agent: "agent",
  agents: "agent",
  project: "agent",
  profile: "agent",
  model: "model",
  models: "model",
  "model-picker": "model",
  vision: "vision",
  visual: "vision",
  image: "vision",
  "vision-model": "vision",
  "visual-model": "vision",
  "image-model": "vision",
  "vision-picker": "vision",
  mode: "mode",
  permission: "mode",
  permissions: "mode",
  yolo: "mode",
  reasoning: "mode",
  effort: "mode",
  "mode-picker": "mode",
  display: "display",
  thinking: "display",
  think: "display",
  process: "display",
  progress: "display",
  tools: "display",
  tool: "display",
  quiet: "display",
  "display-picker": "display",
  buffer: "buffer",
  buffers: "buffer",
  "reply-buffer": "buffer",
  "reply-buffers": "buffer",
  "buffer-picker": "buffer",
  workdir: "workdir",
  dir: "workdir",
  pwd: "workdir",
  cd: "workdir",
  chdir: "workdir",
  "workdir-picker": "workdir",
  "commands-picker": "commands",
};

export interface ChannelConnectorCommandSurfaceInput {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  control?: ChannelConnectorSessionControlRecord | null;
  displayDefaults?: {
    thinkingMessages?: boolean | null;
    processMessages?: boolean | null;
    toolMessages?: boolean | null;
  } | null;
  sessionKey?: string | null;
  models?: string[];
  visionModels?: string[];
  agentSession?: ChannelConnectorCommandSurface["session"];
  sessionList?: ChannelConnectorCommandSurface["sessionList"];
  history?: ChannelConnectorCommandSurface["history"];
  customCommands?: Array<{
    name: string;
    description: string;
    source: "config" | "agent";
  }>;
  skills?: ChannelConnectorCommandSurfaceSkill[];
  selectedSectionId?: string | null;
  selectedViewId?: string | null;
}

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function metadataString(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">, keys: string[]): string {
  const metadata = isRecord(binding.metadata) ? binding.metadata : {};
  for (const key of keys) {
    const normalized = normalizeString(metadata[key]);
    if (normalized) return normalized;
  }
  return "";
}

function metadataBoolean(
  binding: Pick<ChannelConnectorRuntimeBinding, "metadata">,
  keys: string[],
  fallback = false,
): boolean {
  const metadata = isRecord(binding.metadata) ? binding.metadata : {};
  for (const key of keys) {
    const value = metadata[key];
    if (typeof value === "boolean") return value;
    const normalized = normalizeString(value).toLowerCase();
    if (["1", "true", "yes", "on", "enable", "enabled"].includes(normalized)) return true;
    if (["0", "false", "no", "off", "disable", "disabled"].includes(normalized)) return false;
  }
  return fallback;
}

function bindingVisionModel(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">): string | null {
  return metadataString(binding, [
    "autoVisionModelId",
    "auto_vision_model_id",
    "visionModel",
    "vision_model",
    "visualModel",
    "visual_model",
  ]) || null;
}

function bindingAutoVisionModel(binding: Pick<ChannelConnectorRuntimeBinding, "metadata">): boolean {
  return metadataBoolean(binding, [
    "autoVisionModel",
    "auto_vision_model",
    "visionAutoModel",
    "vision_auto_model",
  ], false);
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

export function normalizeChannelConnectorCommandSurfaceSection(value: unknown): FeishuMenuSectionId | null {
  const normalized = normalizeString(value).replace(/^\/+/, "").toLowerCase();
  if (!normalized) return null;
  return FEISHU_MENU_SECTION_ALIASES[normalized] || null;
}

export function normalizeChannelConnectorCommandSurfaceView(value: unknown): FeishuMenuViewId | null {
  const normalized = normalizeString(value).replace(/^\/+/, "").toLowerCase();
  if (!normalized) return null;
  return FEISHU_MENU_VIEW_ALIASES[normalized] || null;
}

export function channelConnectorCommandSurfaceSectionFromCommand(command: string | null | undefined): FeishuMenuSectionId | null {
  const normalized = normalizeString(command);
  if (!normalized) return null;
  const parts = normalized.replace(/^[/%]+/, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const name = parts[0] || "";
  if (["commands", "command", "cmd", "alias", "aliases"].includes(name.toLowerCase())) return "commands";
  if (["help", "menu", "start"].includes(name.toLowerCase())) {
    return normalizeChannelConnectorCommandSurfaceSection(parts[1]) || null;
  }
  return normalizeChannelConnectorCommandSurfaceSection(name);
}

export function channelConnectorCommandSurfaceViewFromCommand(
  command: string | null | undefined,
  _actionKind: "nav" | "act" | "cmd" | null = null,
): FeishuMenuViewId | null {
  const normalized = normalizeString(command);
  if (!normalized) return null;
  const parts = normalized.replace(/^[/%]+/, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const name = parts[0]?.toLowerCase() || "";
  if (["commands", "command", "cmd", "alias", "aliases"].includes(name)) return "commands";
  if (["help", "menu", "start"].includes(name)) {
    return normalizeChannelConnectorCommandSurfaceView(parts[1]) === "more" ? "more" : "help";
  }
  if (name === "more" || name === "advanced" || name === "settings") return "more";
  if (name === "whoami" || name === "myid" || name === "version") return "session";
  if (name === "current") return "current";
  if (
    name === "list"
    || name === "sessions"
    || name === "switch"
    || name === "search"
    || name === "find"
    || name === "name"
    || name === "rename"
    || name === "delete"
    || name === "del"
    || name === "rm"
  ) {
    return "sessions";
  }
  if (name === "history") return "history";
  if (["status", "compact", "compress", "new", "reset"].includes(name)) return "session";
  if (name === "agent" || name === "agents") return "agent";
  if (name === "model" || name === "models") return "model";
  if (["vision", "visual", "image-model", "vision-model", "visual-model"].includes(name)) return "vision";
  if (["mode", "permission", "permissions", "yolo", "reasoning", "effort"].includes(name)) return "mode";
  if (["display", "thinking", "think", "process", "progress", "tools", "tool", "quiet"].includes(name)) return "display";
  if (["buffer", "buffers", "reply-buffer", "reply-buffers"].includes(name)) return "buffer";
  if (["workdir", "dir", "pwd", "cd", "chdir"].includes(name)) return "workdir";
  return null;
}

function action(
  id: string,
  label: string,
  command: string,
  options: Partial<Omit<ChannelConnectorCommandSurfaceAction, "id" | "label" | "command">> = {},
): ChannelConnectorCommandSurfaceAction {
  return {
    id,
    label,
    command,
    actionKind: options.actionKind || "act",
    tone: options.tone || "default",
    description: options.description || null,
    requiresAdmin: options.requiresAdmin === true,
    nativePassthrough: options.nativePassthrough === true,
  };
}

function fallbackActionList(items: readonly ChannelConnectorCommandSurfaceAction[]): string {
  return items.map((item) => {
    const description = commandSurfaceItemDescription(item);
    return description
      ? `- \`${item.command}\` - ${item.label}: ${description}`
      : `- \`${item.command}\` - ${item.label}`;
  }).join("\n");
}

function compactCurrentSummary(surface: Omit<ChannelConnectorCommandSurface, "textFallback">): string {
  return [
    `Agent: ${surface.current.projectId} (${surface.current.agent})`,
    `Model: ${surface.current.model || "default"} · Permission: ${surface.current.permissionMode}`,
    `WorkDir: \`${compactPath(surface.current.workDir)}\``,
  ].join("\n");
}

function buildTextFallback(surface: Omit<ChannelConnectorCommandSurface, "textFallback">): string {
  const normalizedSurface = surface as ChannelConnectorCommandSurface;
  const selectedSectionId = normalizeChannelConnectorCommandSurfaceSection(surface.selectedSectionId);
  const selectedSection = selectedSectionId ? sectionById(normalizedSurface, selectedSectionId) : null;
  const lines: string[] = [
    "Studio Channel",
    "",
    "**当前配置**",
    compactCurrentSummary(surface),
  ];
  if (surface.current.workDirHistory.length) {
    lines.push(`- Previous WorkDir: \`${compactPath(surface.current.workDirHistory[0] || "")}\``);
  }

  if (selectedSection) {
    lines.push("", `**${selectedSection.title}**`);
    if (selectedSection.summary) lines.push(selectedSection.summary);
    lines.push(fallbackActionList(helpSectionActions(selectedSection, normalizedSurface)));
    const siblings = siblingSectionActions(selectedSection.id as FeishuMenuSectionId);
    if (siblings.length) {
      lines.push("", "**同组入口**", fallbackActionList(siblings));
    }
    lines.push("", "返回主菜单：`/help`");
  } else {
    lines.push(
      "",
      "**配置**",
      "- `/agent` Agent Profile",
      "- `/model` 模型",
      "- `/mode` 权限 / 推理",
      "- `/display` 思考 / 过程 / 工具显示",
      "- `/vision` 图片视觉 fallback",
      "- `/dir` 工作目录",
      "",
      "**会话动作**",
      "- `/new` 新会话",
      "- `/compact` 压缩上下文",
      "- `/stop` 停止运行",
      "",
      "**更多**",
      "- `/help session` 会话详情、续接、历史、usage",
      "- `/help commands` 命令 / Skills / 别名",
      "- `/help buffer` 长回复缓存",
      "- `/help native` Agent 原生命令",
    );
  }

  return lines.join("\n");
}

export function buildChannelConnectorCommandSurface(
  input: ChannelConnectorCommandSurfaceInput,
): ChannelConnectorCommandSurface {
  const current = resolveChannelConnectorEffectiveProject(input.config, input.project, input.control || null);
  const thinkingMessages = input.control?.thinkingMessages
    ?? input.displayDefaults?.thinkingMessages
    ?? true;
  const processMessages = input.control?.processMessages
    ?? input.displayDefaults?.processMessages
    ?? true;
  const toolMessages = input.control?.toolMessages
    ?? input.displayDefaults?.toolMessages
    ?? true;
  const quietEnabled = !thinkingMessages && !processMessages && !toolMessages;
  const autoVisionModel = input.control?.autoVisionModel ?? bindingAutoVisionModel(input.binding);
  const rawSessionVisionModel = input.control?.visionModel || null;
  const sessionAutoVisionModel = rawSessionVisionModel === AUTO_VISION_MODEL_SENTINEL;
  const visionModel = sessionAutoVisionModel ? null : rawSessionVisionModel || bindingVisionModel(input.binding);
  const autoVisionModelSource = input.control?.autoVisionModel === null || input.control?.autoVisionModel === undefined
    ? "binding"
    : "session";
  const visionModelSource = rawSessionVisionModel
    ? "session"
    : visionModel ? "binding" : "auto";
  const thinkingSupport = resolveChannelConnectorThinkingSupport({
    agent: current.agent,
    model: current.model,
  });
  const models = uniqueStrings([
    ...(input.models || []),
    current.model || "",
    ...input.config.projects.map((project) => project.model || ""),
  ]).slice(0, 12);
  const visionModels = uniqueStrings(input.visionModels || []).slice(0, 12);
  const skills: ChannelConnectorCommandSurfaceSkill[] = (input.skills || []).map((skill) => ({
    name: normalizeString(skill.name),
    displayName: normalizeString(skill.displayName),
    description: normalizeString(skill.description),
    source: normalizeString(skill.source),
    scope: skill.scope || "agent",
    platform: normalizeString(skill.platform) || null,
    actions: Array.isArray(skill.actions)
      ? skill.actions.map((action) => ({
        id: normalizeString(action.id),
        label: normalizeString(action.label),
        manifest: normalizeString(action.manifest),
        tool: normalizeString(action.tool) || null,
        action: normalizeString(action.action) || null,
        approval: (action.approval === "required" || action.approval === "managed" ? action.approval : "none") as ChannelConnectorCommandSurfaceSkillAction["approval"],
        notes: normalizeString(action.notes) || null,
      })).filter((action) => action.id && action.label && action.manifest)
      : [],
  })).filter((skill) => skill.name);

  const sections: ChannelConnectorCommandSurfaceSection[] = [
    {
      id: "session",
      title: "Session",
      summary: "当前 IM 会话级控制，不修改全局 Provider/App 配置。",
      actions: [
        action("status", "状态", "/status"),
        action("whoami", "Whoami", "/whoami"),
        action("version", "版本", "/version"),
        action("usage", "用量", "/usage"),
        action("current", "当前会话", "/current", { actionKind: "nav" }),
        action("sessions", "续接列表", "/list", { actionKind: "nav" }),
        action("history", "历史", "/history", { actionKind: "nav" }),
        action("compact", "压缩上下文", "/compact", {
          tone: "primary",
          requiresAdmin: true,
          description: "有 live persistent Agent session 时原生优先；否则 Gateway 兜底",
        }),
        action("stop", "停止运行", "/stop", { tone: "danger", requiresAdmin: true }),
        action("new", "新会话", "/new", { tone: "primary", requiresAdmin: true }),
        action("reset", "重置会话", "/reset", { tone: "danger", requiresAdmin: true }),
      ],
    },
    {
      id: "agent",
      title: "Agent",
      summary: "切换本会话绑定的 CLI Agent Profile。",
      actions: input.config.projects.slice(0, 12).map((project, index) => action(
        `agent-${project.id}`,
        `${index + 1}. ${project.name || project.id}`,
        `/agent ${project.id}`,
        {
          tone: project.id === current.id ? "primary" : "default",
          description: `${project.agent} · ${project.model || "default"}`,
          requiresAdmin: true,
        },
      )),
    },
    {
      id: "model",
      title: "Model",
      summary: "模型来自 Gateway 可用列表或 Agent Profile 默认值。",
      actions: [
        ...models.map((model, index) => action(
          `model-${model}`,
          `${index + 1}. ${model}`,
          `/model ${model}`,
          {
            tone: model === current.model ? "primary" : "default",
            requiresAdmin: true,
          },
        )),
        action("model-default", "Profile 默认模型", "/model default", { requiresAdmin: true }),
      ],
    },
    {
      id: "vision",
      title: "Vision",
      summary: "图片/贴图/视频类输入的自动视觉 fallback，只作用于当前 IM session。",
      actions: [
        action("vision-status", "视觉状态", "/vision"),
        action("vision-on", "开启视觉", "/vision on", {
          tone: autoVisionModel ? "primary" : "default",
          requiresAdmin: true,
        }),
        action("vision-off", "关闭视觉", "/vision off", {
          tone: autoVisionModel ? "default" : "danger",
          requiresAdmin: true,
        }),
        action("vision-auto", "自动选择模型", "/vision model auto", {
          tone: autoVisionModel && !visionModel ? "primary" : "default",
          requiresAdmin: true,
        }),
        ...visionModels.map((model, index) => action(
          `vision-model-${model}`,
          `${index + 1}. ${model}`,
          `/vision model ${model}`,
          {
            tone: model === visionModel ? "primary" : "default",
            requiresAdmin: true,
          },
        )),
        action("vision-default", "恢复默认", "/vision default", { requiresAdmin: true }),
      ],
    },
    {
      id: "mode",
      title: "Permission",
      summary: "权限和推理强度只作用于当前 IM session；yolo 始终保持显式动作。",
      actions: PERMISSION_MODES.map((mode) => action(
        `mode-${mode}`,
        PERMISSION_MODE_LABELS[mode],
        `/mode ${mode}`,
        {
          tone: mode === current.permissionMode ? "primary" : mode === "yolo" ? "danger" : "default",
          description: PERMISSION_MODE_DESCRIPTIONS[mode],
          requiresAdmin: true,
        },
      )),
    },
    {
      id: "display",
      title: "Display",
      summary: "控制 IM 中间态消息；最终回复不受影响。",
      actions: [
        action("display-status", "显示状态", "/display"),
        action(
          "quiet-toggle",
          quietEnabled ? "恢复显示" : "安静模式",
          quietEnabled ? "/quiet full" : "/quiet quiet",
          {
            tone: quietEnabled ? "primary" : "default",
            requiresAdmin: true,
            description: "按 CC /quiet 习惯隐藏或恢复中间态消息",
          },
        ),
        action("thinking-on", "显示思考", "/thinking on", {
          tone: input.control?.thinkingMessages === false ? "default" : "primary",
          requiresAdmin: true,
          description: "显示 Agent 思考过程",
        }),
        action("thinking-off", "隐藏思考", "/thinking off", {
          tone: input.control?.thinkingMessages === false ? "danger" : "default",
          requiresAdmin: true,
          description: "隐藏 Agent 思考过程",
        }),
        action("process-on", "显示过程", "/process on", {
          tone: input.control?.processMessages === false ? "default" : "primary",
          requiresAdmin: true,
          description: "显示 Agent 过程回复",
        }),
        action("process-off", "隐藏过程", "/process off", {
          tone: input.control?.processMessages === false ? "danger" : "default",
          requiresAdmin: true,
          description: "隐藏 Agent 过程回复",
        }),
        action("tools-on", "显示工具", "/tools on", {
          tone: input.control?.toolMessages === false ? "default" : "primary",
          requiresAdmin: true,
          description: "显示工具调用和工具结果",
        }),
        action("tools-off", "隐藏工具", "/tools off", {
          tone: input.control?.toolMessages === false ? "danger" : "default",
          requiresAdmin: true,
          description: "隐藏工具调用和工具结果",
        }),
        action("display-default", "恢复默认", "/display default", {
          requiresAdmin: true,
          description: "恢复默认：思考、过程回复和工具消息开启",
        }),
      ],
    },
    {
      id: "workdir",
      title: "WorkDir",
      summary: "工作目录切换会断开旧 Agent 续接，避免上下文指向错误目录。",
      actions: [
        action("dir", "当前目录", "/dir"),
        action("cd-default", "默认目录", "/cd default", { requiresAdmin: true }),
      ],
    },
    {
      id: "buffer",
      title: "Reply Buffer",
      summary: "群聊长回复的本地缓存；只读取当前 IM session。",
      actions: [
        action("buffer-list", "缓存列表", "/buffer", {
          description: "列出本会话最近缓存的长回复",
        }),
        action("buffer-latest", "最新缓存", "/buffer latest", {
          description: "读取本会话最新缓存的完整回复",
        }),
      ],
    },
    {
      id: "commands",
      title: "Commands",
      summary: "当前 Agent 可用的 config prompt commands、Agent command files 与 Skills。",
      actions: [
        action("commands-list", "命令列表", "/commands", {
          actionKind: "nav",
          description: "查看当前 Agent 自定义命令列表和 add/del 用法",
        }),
        action("aliases-list", "别名", "/alias", {
          actionKind: "nav",
          description: "查看当前 binding 命令别名和 add/del 用法",
        }),
        action("skills-list", "Skills 列表", "/skills", {
          actionKind: "nav",
          description: "查看当前 Agent 自动发现的 SKILL.md",
        }),
        ...(input.customCommands || []).slice(0, 12).map((command, index) => action(
          `custom-command-${command.source}-${command.name}`,
          `${index + 1}. /${command.name}`,
          `/${command.name}`,
          {
            description: `${command.source === "agent" ? "agent" : "config"} · ${command.description || "Custom prompt command"}`,
          },
        )),
        ...skills.slice(0, 12).map((skill, index) => action(
          `skill-${skill.name}`,
          `${index + 1}. /${skill.name}`,
          `/${skill.name}`,
          {
            description: `${skill.scope === "binding" ? "binding skill" : skill.scope === "platform" ? `${skill.platform || "platform"} skill` : "agent skill"} · ${skill.description || skill.displayName || "Skill"}`,
          },
        )),
      ],
    },
    {
      id: "native",
      title: "Agent Native",
      summary: "未知 /xxx 自动透传；与 Studio 命令冲突时使用 /native。",
      actions: [
        action("native-help", "Agent 帮助", "/native /help", {
          nativePassthrough: true,
          description: "透传当前 Agent 的原生帮助或 skills 命令入口。",
        }),
        action("native-compact", "Agent 压缩", "/native /compact", {
          nativePassthrough: true,
          description: "尝试 Agent 原生压缩；Codex one-shot 不伪执行交互式 compact。",
        }),
      ],
    },
  ].filter((section) => section.actions.length > 0);

  const withoutFallback: Omit<ChannelConnectorCommandSurface, "textFallback"> = {
    version: 1,
    title: "Studio Channel 操作台",
    selectedSectionId: normalizeChannelConnectorCommandSurfaceSection(input.selectedSectionId) || null,
    selectedViewId: normalizeChannelConnectorCommandSurfaceView(input.selectedViewId) || null,
    current: {
      bindingId: input.binding.id,
      sessionKey: normalizeString(input.sessionKey) || null,
      projectId: current.id,
      agent: current.agent,
      model: current.model,
      reasoningEffort: current.reasoningEffort || null,
      permissionMode: current.permissionMode,
      workDir: current.workDir,
      workDirHistory: uniqueStrings(input.control?.workDirHistory || [])
        .map((item) => path.resolve(item))
        .filter((item) => item !== path.resolve(current.workDir))
        .slice(0, 10),
      thinkingMessages,
      processMessages,
      toolMessages,
      autoVisionModel,
      autoVisionModelSource,
      visionModel,
      visionModelSource,
      thinkingSupport,
    },
    session: input.agentSession || null,
    sessionList: (input.sessionList || []).slice(0, 20),
    history: (input.history || []).slice(-10),
    skills,
    sections,
  };
  return {
    ...withoutFallback,
    textFallback: buildTextFallback(withoutFallback),
  };
}

function plainText(content: string): { tag: "plain_text"; content: string } {
  return { tag: "plain_text", content };
}

function feishuButtonType(tone: ChannelConnectorCommandSurfaceAction["tone"]): string {
  if (tone === "primary") return "primary";
  if (tone === "danger") return "danger";
  return "default";
}

function actionValue(
  item: ChannelConnectorCommandSurfaceAction,
  surface: ChannelConnectorCommandSurface,
): Record<string, string> {
  const actionKind = item.actionKind;
  const sectionId = channelConnectorCommandSurfaceSectionFromCommand(item.command);
  const viewId = channelConnectorCommandSurfaceViewFromCommand(item.command, actionKind);
  const value: Record<string, string> = {
    action: `${actionKind}:${item.command}`,
    command: item.command,
    surface_action_kind: actionKind,
    surface_action_id: item.id,
    binding_id: surface.current.bindingId,
  };
  if (sectionId) value.surface_section_id = sectionId;
  if (viewId) value.surface_view_id = viewId;
  if (surface.current.sessionKey) value.session_key = surface.current.sessionKey;
  return value;
}

function actionCommandValue(item: ChannelConnectorCommandSurfaceAction): string {
  return `${item.actionKind}:${item.command}`;
}

function buttonElement(
  item: ChannelConnectorCommandSurfaceAction,
  surface: ChannelConnectorCommandSurface,
): Record<string, unknown> {
  return {
    tag: "button",
    text: plainText(item.label),
    type: feishuButtonType(item.tone),
    value: actionValue(item, surface),
  };
}

function truncateMiddle(value: string, maxLength: number): string {
  const normalized = normalizeString(value);
  if (normalized.length <= maxLength) return normalized;
  if (maxLength <= 3) return normalized.slice(0, maxLength);
  const head = Math.ceil((maxLength - 1) / 2);
  const tail = Math.floor((maxLength - 1) / 2);
  return `${normalized.slice(0, head)}…${normalized.slice(normalized.length - tail)}`;
}

function shortSurfaceId(value: string | null | undefined, maxLength = 18): string {
  const normalized = normalizeString(value);
  return normalized ? truncateMiddle(normalized, maxLength) : "-";
}

function compactPath(value: string): string {
  const normalized = normalizeString(value);
  if (normalized.length <= 42) return normalized;
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length >= 2) {
    return `…/${parts.slice(-2).join("/")}`;
  }
  return truncateMiddle(normalized, 42);
}

function listChildDirectoryNames(workDir: string): string[] {
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

function stripListPrefix(value: string): string {
  return normalizeString(value).replace(/^\d+\.\s*/, "");
}

function sectionById(
  surface: ChannelConnectorCommandSurface,
  id: string,
): ChannelConnectorCommandSurfaceSection | null {
  return surface.sections.find((section) => section.id === id) || null;
}

function statusBlock(surface: ChannelConnectorCommandSurface): Record<string, unknown> {
  const model = surface.current.model || "default";
  const workDir = compactPath(surface.current.workDir);
  return {
    tag: "column_set",
    flex_mode: "bisect",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "top",
        elements: [
          {
            tag: "markdown",
            content: [
              "**当前 Agent**",
              `${surface.current.projectId} · ${surface.current.agent}`,
              "",
              "**模型**",
              model,
              "",
              "**推理**",
              surface.current.reasoningEffort || "default",
              "",
              "**思考流**",
              formatChannelConnectorThinkingSupport(surface.current.thinkingSupport),
            ].join("\n"),
          },
        ],
      },
      {
        tag: "column",
        width: "weighted",
        weight: 1,
        vertical_align: "top",
        elements: [
          {
            tag: "markdown",
            content: [
              "**权限**",
              surface.current.permissionMode,
              "",
              "**目录**",
              `\`${workDir}\``,
              "",
              "**显示**",
              [
                `thinking=${surface.current.thinkingMessages ? "on" : "off"}`,
                `process=${surface.current.processMessages ? "on" : "off"}`,
                `tools=${surface.current.toolMessages ? "on" : "off"}`,
              ].join(" · "),
            ].join("\n"),
          },
        ],
      },
    ],
  };
}

function compactConfigBlock(surface: ChannelConnectorCommandSurface): Record<string, unknown> {
  return {
    tag: "markdown",
    content: [
      "**当前配置**",
      `${surface.current.projectId} · ${surface.current.agent}`,
      `${surface.current.model || "default"} · ${surface.current.permissionMode} · reasoning ${surface.current.reasoningEffort || "default"}`,
      `\`${compactPath(surface.current.workDir)}\``,
    ].join("\n"),
  };
}

function actionRowElement(
  actions: ChannelConnectorCommandSurfaceAction[],
  surface: ChannelConnectorCommandSurface,
  equalColumns = false,
): Record<string, unknown> | null {
  if (actions.length === 0) return null;
  if (!equalColumns) {
    return {
      tag: "action",
      actions: actions.map((item) => buttonElement(item, surface)),
    };
  }
  const columns = actions.map((item) => ({
    tag: "column",
    width: "weighted",
    weight: 1,
    vertical_align: "center",
    horizontal_align: "center",
    elements: [
      {
        ...buttonElement(item, surface),
        width: "fill",
      },
    ],
  }));
  return {
    tag: "column_set",
    flex_mode: columns.length === 2 ? "bisect" : "none",
    columns,
  };
}

function pushActionRows(
  elements: Array<Record<string, unknown>>,
  actions: ChannelConnectorCommandSurfaceAction[],
  surface: ChannelConnectorCommandSurface,
  rowSize: number,
  equalColumns = false,
): void {
  for (let index = 0; index < actions.length; index += rowSize) {
    const row = actions.slice(index, index + rowSize);
    const element = actionRowElement(row, surface, equalColumns);
    if (element) elements.push(element);
  }
}

function listItemElement(
  item: ChannelConnectorCommandSurfaceAction,
  surface: ChannelConnectorCommandSurface,
  options: { actionLabel?: string; primaryLabel?: string } = {},
): Record<string, unknown> {
  const active = item.tone === "primary";
  const actionLabel = active
    ? options.primaryLabel || "当前"
    : options.actionLabel || "选择";
  const label = stripListPrefix(item.label);
  const detail = item.description ? `\n${item.description}` : "";
  return {
    tag: "column_set",
    flex_mode: "none",
    columns: [
      {
        tag: "column",
        width: "weighted",
        weight: 5,
        vertical_align: "center",
        elements: [
          {
            tag: "markdown",
            content: `${active ? "▶" : "◻"} **${label}**${detail}`,
          },
        ],
      },
      {
        tag: "column",
        width: "auto",
        vertical_align: "center",
        elements: [
          {
            ...buttonElement({
              ...item,
              label: actionLabel,
              tone: active ? "primary" : item.tone,
            }, surface),
          },
        ],
      },
    ],
  };
}

function feishuDeleteModeCheckerName(sessionId: string): string {
  return `delete_sel_${Buffer.from(sessionId, "utf8").toString("hex")}`;
}

function feishuDeleteModeValue(surface: ChannelConnectorCommandSurface, actionText: string, command: string): Record<string, string> {
  return {
    action: actionText,
    command,
    binding_id: surface.current.bindingId,
    surface_action_kind: "act",
    surface_section_id: "session",
    surface_view_id: "sessions",
    ...(surface.current.sessionKey ? { session_key: surface.current.sessionKey } : {}),
  };
}

function deleteModeFormElement(
  records: ChannelConnectorCommandSurface["sessionList"],
  surface: ChannelConnectorCommandSurface,
): Record<string, unknown> | null {
  const candidates = records.filter((record) => !record.active).slice(0, 10);
  if (!candidates.length) return null;
  const formElements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: "**批量删除**\n勾选非当前 Agent session 后删除；当前 session 不会出现在可选项里。",
    },
    ...candidates.map((record, index) => {
      const title = record.name || record.projectId;
      const detail = `${record.projectId} · ${record.agent} · ${record.model || "default"} · ${record.turnCount} turns`;
      return {
        tag: "checker",
        name: feishuDeleteModeCheckerName(record.id),
        checked: false,
        text: {
          tag: "lark_md",
          content: `**${index + 1}. ${title}**\n${detail}`,
        },
      };
    }),
    {
      tag: "column_set",
      horizontal_align: "left",
      columns: [
        {
          tag: "column",
          width: "auto",
          vertical_align: "center",
          elements: [
            {
              tag: "button",
              text: plainText("删除已选"),
              type: "danger",
              name: "delete_mode_submit",
              form_action_type: "submit",
              value: feishuDeleteModeValue(surface, "act:/delete-mode form-submit", "/delete"),
            },
          ],
        },
        {
          tag: "column",
          width: "auto",
          vertical_align: "center",
          elements: [
            {
              tag: "button",
              text: plainText("取消"),
              type: "default",
              name: "delete_mode_cancel",
              value: feishuDeleteModeValue(surface, "nav:/list", "/list"),
            },
          ],
        },
      ],
    },
  ];
  return {
    tag: "form",
    name: "delete_mode_form",
    elements: formElements,
  };
}

function commandSurfaceItemDescription(item: ChannelConnectorCommandSurfaceAction): string | null {
  if (item.description) return item.description;
  switch (item.id) {
    case "status":
      return "查看当前 Agent、模型、权限和 session 状态";
    case "whoami":
      return "查看当前 IM 用户、频道和 session id";
    case "version":
      return "查看 Studio Channel runtime 版本和当前 binding";
    case "current":
      return "查看当前 IM session、Agent 续接和最近状态";
    case "sessions":
      return "列出当前 IM session 已知 Agent sessions 并切换续接";
    case "delete-session":
      return "删除非当前 Agent session 续接记录";
    case "usage":
      return "查看当前 IM session 最近 Agent run 的 Gateway usage";
    case "history":
      return "查看当前 IM session 最近上下文";
    case "compact":
      return "先尝试 live persistent Agent 原生 compact；否则 Gateway /responses/compact 摘要 IM history";
    case "stop":
      return "停止当前 IM session 正在运行的 Agent";
    case "new":
      return "开启新的 Agent 会话，保留本 IM 会话配置";
    case "reset":
      return "清空本 IM 会话 override 和 Agent 续接";
    case "dir":
      return "查看当前目录和可用子目录";
    case "cd-default":
      return "恢复 Agent Profile 默认目录";
    case "native-help":
      return "打开当前 CLI Agent 的原生帮助或 skills 命令";
    case "native-compact":
      return "尝试当前 CLI Agent 原生 compact；Codex one-shot 不伪执行";
    case "aliases-list":
      return "查看或管理当前 binding 命令别名";
    case "model-default":
      return "恢复 Agent Profile 默认模型";
    case "display-status":
      return "查看思考、过程回复和工具消息开关";
    case "buffer-list":
      return "列出当前 IM session 最近的 reply buffer";
    case "buffer-latest":
      return "读取当前 IM session 最新的完整缓存回复";
    case "thinking-on":
    case "thinking-off":
    case "process-on":
    case "process-off":
    case "tools-on":
    case "tools-off":
    case "quiet-toggle":
    case "display-default":
      return item.description;
    default:
      return null;
  }
}

function commandSurfaceListItemElement(
  item: ChannelConnectorCommandSurfaceAction,
  surface: ChannelConnectorCommandSurface,
  options: { showCurrent?: boolean } = {},
): Record<string, unknown> {
  const description = commandSurfaceItemDescription(item);
  return listItemElement({
    ...item,
    description,
  }, surface, {
    actionLabel: "▶",
    primaryLabel: options.showCurrent === false ? "▶" : "当前",
  });
}

function pushSectionHeading(
  elements: Array<Record<string, unknown>>,
  section: ChannelConnectorCommandSurfaceSection,
): void {
  elements.push({
    tag: "markdown",
    content: section.summary ? `**${section.title}**\n${section.summary}` : `**${section.title}**`,
  });
}

function homeMenuAction(): ChannelConnectorCommandSurfaceAction {
  return action("home-menu", "回到主菜单", "/help", {
    actionKind: "nav",
  });
}

function sectionMenuAction(
  sectionId: FeishuMenuSectionId,
  options: Partial<Omit<ChannelConnectorCommandSurfaceAction, "id" | "command">> = {},
): ChannelConnectorCommandSurfaceAction {
  const label = options.label || FEISHU_MENU_SECTION_LABELS[sectionId];
  const { label: _label, ...rest } = options;
  return action(
    `section-${sectionId}`,
    label,
    `/help ${sectionId}`,
    {
      actionKind: "nav",
      description: sectionSummary(sectionId),
      ...rest,
    },
  );
}

function directSectionAction(
  sectionId: FeishuMenuSectionId,
  command: string,
  options: Partial<Omit<ChannelConnectorCommandSurfaceAction, "id" | "command">> = {},
): ChannelConnectorCommandSurfaceAction {
  const label = options.label || FEISHU_MENU_SECTION_LABELS[sectionId];
  const { label: _label, ...rest } = options;
  return action(
    `home-${sectionId}`,
    label,
    command,
    {
      actionKind: "nav",
      description: sectionSummary(sectionId),
      ...rest,
    },
  );
}

function sectionSummary(sectionId: FeishuMenuSectionId): string {
  switch (sectionId) {
    case "session":
      return "查看状态、续接列表、历史记录，也可以新建、压缩、停止或重置当前会话。";
    case "agent":
      return "选择当前对话使用的 CLI Agent Profile，例如 Codex、Claude Code 或 OpenCode。";
    case "model":
      return "从 Studio Gateway 可用模型中选择当前会话模型，不改全局默认配置。";
    case "vision":
      return "配置图片输入的自动视觉 fallback；默认关闭，需要时再为当前会话开启。";
    case "mode":
      return "切换工具权限策略和 reasoning effort；高权限模式保持显式选择。";
    case "display":
      return "控制思考、过程回复和工具过程是否显示；最终回复不受影响。";
    case "buffer":
      return "查看长回复的完整缓存，适合群聊或超长回复被折叠时使用。";
    case "workdir":
      return "查看或切换 Agent 工作目录；切换目录会断开旧 Agent 续接。";
    case "commands":
      return "查看 config command、Agent command file、Skill 和命令别名。";
    case "native":
      return "查看或执行当前 CLI Agent 的原生 slash / skills 命令。";
  }
}

function homeMenuSections(): Array<{
  id: "setup" | "more";
  title: string;
  summary: string;
  sectionIds: FeishuMenuSectionId[];
}> {
  return [
    {
      id: "setup",
      title: "配置入口",
      summary: "调当前对话的 Agent、模型、权限、显示、视觉和工作目录。",
      sectionIds: ["agent", "model", "mode", "display", "vision", "workdir"],
    },
    {
      id: "more",
      title: "更多工具",
      summary: "查看续接、历史、缓存、自定义命令和 Agent 原生命令。",
      sectionIds: ["session", "buffer", "commands", "native"],
    },
  ];
}

function menuActionFromSection(
  surface: ChannelConnectorCommandSurface,
  sectionId: FeishuMenuSectionId,
  actionId: string,
  fallback: ChannelConnectorCommandSurfaceAction,
  overrides: Partial<Omit<ChannelConnectorCommandSurfaceAction, "id" | "command">> = {},
): ChannelConnectorCommandSurfaceAction {
  const source = sectionById(surface, sectionId)?.actions.find((item) => item.id === actionId) || fallback;
  const { label, description, ...rest } = overrides;
  return {
    ...source,
    ...rest,
    label: label || source.label,
    description: description === undefined ? source.description : description,
  };
}

function homeQuickActions(surface: ChannelConnectorCommandSurface): ChannelConnectorCommandSurfaceAction[] {
  return [
    menuActionFromSection(surface, "session", "new", action("new", "新会话", "/new", { tone: "primary", requiresAdmin: true }), {
      label: "新会话",
      tone: "primary",
      description: "开启新的 Agent 会话，保留当前配置。",
    }),
    menuActionFromSection(surface, "session", "compact", action("compact", "压缩上下文", "/compact", { tone: "primary", requiresAdmin: true }), {
      label: "压缩上下文",
      tone: "primary",
      description: "优先调用 Agent 原生 compact，必要时使用 Gateway 摘要。",
    }),
    menuActionFromSection(surface, "session", "stop", action("stop", "停止运行", "/stop", { tone: "danger", requiresAdmin: true }), {
      label: "停止运行",
      tone: "danger",
      description: "停止当前会话正在执行的 Agent run。",
    }),
  ];
}

function homeConfigActions(): ChannelConnectorCommandSurfaceAction[] {
  return [
    directSectionAction("agent", "/agent"),
    directSectionAction("model", "/model"),
    directSectionAction("mode", "/mode"),
    directSectionAction("display", "/display"),
    directSectionAction("vision", "/vision"),
    directSectionAction("workdir", "/dir"),
  ];
}

function moreMenuAction(): ChannelConnectorCommandSurfaceAction {
  return action("more-menu", "更多", "/help more", {
    actionKind: "nav",
    description: "会话详情、续接历史、缓存、自定义命令和 Agent 原生命令。",
  });
}

function moreSectionActions(): ChannelConnectorCommandSurfaceAction[] {
  return [
    directSectionAction("session", "/status", {
      label: "会话控制",
      description: sectionSummary("session"),
    }),
    directSectionAction("commands", "/commands", {
      label: "命令/Skills",
      description: sectionSummary("commands"),
    }),
    directSectionAction("buffer", "/buffer", {
      label: "缓存",
      description: sectionSummary("buffer"),
    }),
    sectionMenuAction("native"),
  ];
}

function siblingSectionActions(sectionId: FeishuMenuSectionId): ChannelConnectorCommandSurfaceAction[] {
  const group = homeMenuSections().find((item) => item.sectionIds.includes(sectionId));
  return (group?.sectionIds || [])
    .filter((item) => item !== sectionId)
    .map((item) => sectionMenuAction(item));
}

function helpSectionActions(
  section: ChannelConnectorCommandSurfaceSection,
  surface: ChannelConnectorCommandSurface,
): ChannelConnectorCommandSurfaceAction[] {
  if (section.id === "agent") {
    const profileCount = section.actions.filter((item) => item.id.startsWith("agent-")).length;
    return [
      action("agent-picker", "Agent Profile", "/agent", {
        actionKind: "nav",
        tone: "primary",
        description: `${profileCount} 个可选 Profile · 当前 ${surface.current.projectId}`,
        requiresAdmin: true,
      }),
    ];
  }
  if (section.id === "model") {
    const modelCount = section.actions.filter((item) => item.id.startsWith("model-") && item.id !== "model-default").length;
    const currentModel = surface.current.model || "default";
    const reset = section.actions.find((item) => item.id === "model-default");
    return [
      action("model-picker", "模型选择器", "/model", {
        actionKind: "nav",
        tone: "primary",
        description: `${modelCount} 个可选模型 · 当前 ${currentModel}`,
        requiresAdmin: true,
      }),
      ...(reset ? [reset] : []),
    ];
  }
  if (section.id === "vision") {
    const modelCount = section.actions.filter((item) => item.id.startsWith("vision-model-")).length;
    return [
      action("vision-picker", "视觉设置", "/vision", {
        actionKind: "nav",
        tone: "primary",
        description: `${surface.current.autoVisionModel ? "on" : "off"} · ${surface.current.visionModel || "auto"} · ${modelCount} 个 vision 模型`,
        requiresAdmin: true,
      }),
      ...section.actions.filter((item) => ["vision-on", "vision-off", "vision-auto", "vision-default"].includes(item.id)),
    ];
  }
  if (section.id === "mode") {
    const currentMode = surface.current.permissionMode;
    const currentReasoning = surface.current.reasoningEffort || "default";
    return [
      action("mode-picker", "权限 / 推理", "/mode", {
        actionKind: "nav",
        tone: "primary",
        description: `${PERMISSION_MODE_LABELS[currentMode]} · reasoning ${currentReasoning}`,
        requiresAdmin: true,
      }),
    ];
  }
  if (section.id === "workdir") {
    const childCount = listChildDirectoryNames(surface.current.workDir).length;
    const historyCount = surface.current.workDirHistory.length;
    return [
      action("workdir-picker", "目录选择器", "/dir", {
        actionKind: "nav",
        tone: "primary",
        description: `${compactPath(surface.current.workDir)} · ${historyCount} 个最近目录 · ${childCount} 个子目录`,
        requiresAdmin: true,
      }),
    ];
  }
  if (section.id === "display") {
    const thinking = surface.current.thinkingMessages ? "thinking on" : "thinking off";
    const process = surface.current.processMessages ? "process on" : "process off";
    const tools = surface.current.toolMessages ? "tools on" : "tools off";
    return [
      action("display-picker", "显示设置", "/display", {
        actionKind: "nav",
        tone: "primary",
        description: `${thinking} · ${process} · ${tools}`,
        requiresAdmin: true,
      }),
    ];
  }
  if (section.id === "commands") {
    const commandCount = section.actions.filter((item) => item.id.startsWith("custom-command-")).length;
    const skillCount = section.actions.filter((item) => item.id.startsWith("skill-")).length;
    return [
      action("commands-picker", "自定义命令", "/commands", {
        actionKind: "nav",
        tone: "primary",
        description: `${commandCount} 个命令 · ${skillCount} 个 Skill · 支持 /commands add/del`,
      }),
    ];
  }
  return section.actions;
}

function selectStaticElement(input: {
  placeholder: string;
  options: Array<{ label: string; value: string }>;
  initialValue: string | null;
  surface: ChannelConnectorCommandSurface;
  sectionId: FeishuMenuSectionId;
  viewId: FeishuMenuViewId;
}): Record<string, unknown> {
  const selectElement: Record<string, unknown> = {
    tag: "select_static",
    placeholder: plainText(input.placeholder),
    options: input.options.map((option) => ({
      text: plainText(option.label),
      value: option.value,
    })),
    value: {
      binding_id: input.surface.current.bindingId,
      surface_section_id: input.sectionId,
      surface_view_id: input.viewId,
      surface_action_kind: "act",
      ...(input.surface.current.sessionKey ? { session_key: input.surface.current.sessionKey } : {}),
    },
  };
  if (input.initialValue) selectElement.initial_option = input.initialValue;
  return {
    tag: "action",
    actions: [selectElement],
  };
}

function pushSubcardNavRows(
  elements: Array<Record<string, unknown>>,
  surface: ChannelConnectorCommandSurface,
  sectionId: FeishuMenuSectionId,
): void {
  const actions = sectionId === "session"
    ? [moreMenuAction(), homeMenuAction()]
    : [homeMenuAction(), moreMenuAction()];
  pushActionRows(elements, actions, surface, 2, true);
}

function renderModelPickerCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "model");
  const actions = section?.actions || [];
  const resetAction = actions.find((item) => item.id === "model-default")
    || action("model-default", "Profile 默认模型", "/model default", { requiresAdmin: true });
  const modelActions = actions.filter((item) => item.id.startsWith("model-") && item.id !== "model-default");
  const options = [
    { label: "Profile 默认模型", value: actionCommandValue(resetAction) },
    ...modelActions.map((item) => ({
      label: stripListPrefix(item.label),
      value: actionCommandValue(item),
    })),
  ];
  const current = surface.current.model || "default";
  const currentModelAction = surface.current.model
    ? modelActions.find((item) => item.command === `/model ${surface.current.model}`)
    : null;
  const initialValue = currentModelAction ? actionCommandValue(currentModelAction) : actionCommandValue(resetAction);
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: `**当前模型**\n${current}\n\n**可选模型**\n${modelActions.length || 0} 个`,
    },
    selectStaticElement({
      placeholder: "选择模型",
      options,
      initialValue,
      surface,
      sectionId: "model",
      viewId: "model",
    }),
  ];
  pushSubcardNavRows(elements, surface, "model");
  elements.push({
    tag: "note",
    elements: [plainText("选择只作用于当前 IM session；Profile 默认值不会被改写。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("模型选择"),
      template: "indigo",
    },
    elements,
  };
}

function renderVisionPickerCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "vision");
  const actions = section?.actions || [];
  const on = actions.find((item) => item.id === "vision-on")
    || action("vision-on", "开启视觉", "/vision on", { requiresAdmin: true });
  const off = actions.find((item) => item.id === "vision-off")
    || action("vision-off", "关闭视觉", "/vision off", { requiresAdmin: true });
  const auto = actions.find((item) => item.id === "vision-auto")
    || action("vision-auto", "自动选择模型", "/vision model auto", { requiresAdmin: true });
  const defaults = actions.find((item) => item.id === "vision-default")
    || action("vision-default", "恢复默认", "/vision default", { requiresAdmin: true });
  const modelActions = actions.filter((item) => item.id.startsWith("vision-model-"));
  const options = [
    { label: "Gateway 自动选择", value: actionCommandValue(auto) },
    ...modelActions.map((item) => ({
      label: stripListPrefix(item.label),
      value: actionCommandValue(item),
    })),
  ];
  const currentModelAction = surface.current.visionModel
    ? modelActions.find((item) => item.command === `/vision model ${surface.current.visionModel}`)
    : null;
  const initialValue = currentModelAction ? actionCommandValue(currentModelAction) : actionCommandValue(auto);
  const toggle = surface.current.autoVisionModel
    ? {
      ...off,
      label: "关闭自动视觉",
      tone: "default" as const,
    }
    : {
      ...on,
      label: "开启自动视觉",
      tone: "primary" as const,
    };
  const defaultAction = {
    ...defaults,
    label: "恢复默认设置",
  };
  const currentVisionModel = surface.current.visionModel || "Gateway 自动选择";
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**当前视觉**",
        `自动切换：${surface.current.autoVisionModel ? "开启" : "关闭"}`,
        `视觉模型：${currentVisionModel}`,
        `来源：${surface.current.autoVisionModelSource === "session" ? "当前会话" : "binding 默认"}`,
        `当前对话模型：${surface.current.model || "default"}`,
      ].join("\n"),
    },
  ];
  elements.push({
    tag: "markdown",
    content: `**视觉模型**\n图片输入 fallback 可用模型：${modelActions.length || 0} 个`,
  });
  elements.push(selectStaticElement({
    placeholder: modelActions.length ? "选择视觉模型" : "暂无 vision 模型",
    options,
    initialValue,
    surface,
    sectionId: "vision",
    viewId: "vision",
  }));
  elements.push({
    tag: "markdown",
    content: "**自动切换**\n开启后仅在图片输入时使用视觉 fallback；失败会回退附件说明。",
  });
  pushActionRows(elements, [toggle, defaultAction], surface, 2, true);
  pushSubcardNavRows(elements, surface, "vision");
  elements.push({
    tag: "note",
    elements: [plainText("选择只作用于当前 IM session；平台 binding 默认值在 Studio 页面配置。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("视觉设置"),
      template: "turquoise",
    },
    elements,
  };
}

function renderModePickerCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "mode");
  const modeActions = section?.actions || [];
  const current = surface.current.permissionMode;
  const currentReasoning = surface.current.reasoningEffort || null;
  const options = modeActions.map((item) => ({
    label: stripListPrefix(item.label),
    value: actionCommandValue(item),
  }));
  const reasoningActions = [
    action("reasoning-default", "Profile 默认推理强度", "/reasoning default", { requiresAdmin: true }),
    ...REASONING_EFFORTS.map((effort) => action(
      `reasoning-${effort}`,
      REASONING_EFFORT_LABELS[effort],
      `/reasoning ${effort}`,
      {
        tone: effort === currentReasoning ? "primary" : "default",
        requiresAdmin: true,
      },
    )),
  ];
  const reasoningOptions = reasoningActions.map((item) => ({
    label: stripListPrefix(item.label),
    value: actionCommandValue(item),
  }));
  const currentModeAction = modeActions.find((item) => item.command === `/mode ${current}`);
  const initialValue = currentModeAction ? actionCommandValue(currentModeAction) : null;
  const currentReasoningAction = currentReasoning
    ? reasoningActions.find((item) => item.command === `/reasoning ${currentReasoning}`)
    : reasoningActions[0];
  const initialReasoningValue = currentReasoningAction ? actionCommandValue(currentReasoningAction) : null;
  const currentPermissionLabel = currentModeAction ? stripListPrefix(currentModeAction.label) : current;
  const currentReasoningLabel = currentReasoningAction ? stripListPrefix(currentReasoningAction.label) : "Profile 默认推理强度";
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**当前设置**",
        `权限模式：${currentPermissionLabel}`,
        `推理强度：${currentReasoningLabel}`,
      ].join("\n"),
    },
    {
      tag: "markdown",
      content: `**权限模式**\n${modeActions.length || 0} 个可选模式 · 高权限模式保持显式选择`,
    },
    selectStaticElement({
      placeholder: "选择权限模式",
      options,
      initialValue,
      surface,
      sectionId: "mode",
      viewId: "mode",
    }),
    {
      tag: "markdown",
      content: `**推理强度**\n${reasoningActions.length} 个可选强度 · 切换后会断开旧 Agent 续接`,
    },
    selectStaticElement({
      placeholder: "选择推理强度",
      options: reasoningOptions,
      initialValue: initialReasoningValue,
      surface,
      sectionId: "mode",
      viewId: "mode",
    }),
  ];
  pushSubcardNavRows(elements, surface, "mode");
  elements.push({
    tag: "note",
    elements: [plainText("权限和推理强度只作用于当前 IM session；切换推理强度会断开旧 Agent 续接。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("权限与推理"),
      template: "violet",
    },
    elements,
  };
}

function renderAgentPickerCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "agent");
  const agentActions = section?.actions.filter((item) => item.id.startsWith("agent-")) || [];
  const options = agentActions.map((item) => ({
    label: stripListPrefix(item.label),
    value: actionCommandValue(item),
  }));
  const currentAgentAction = agentActions.find((item) => item.command === `/agent ${surface.current.projectId}`);
  const initialValue = currentAgentAction ? actionCommandValue(currentAgentAction) : null;
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**当前 Agent**",
        `${surface.current.projectId} · ${surface.current.agent}`,
        `可选 Profile：${agentActions.length || 0} 个`,
      ].join("\n"),
    },
  ];
  if (options.length) {
    elements.push(selectStaticElement({
      placeholder: "选择 Agent Profile",
      options,
      initialValue,
      surface,
      sectionId: "agent",
      viewId: "agent",
    }));
  }
  pushSubcardNavRows(elements, surface, "agent");
  elements.push({
    tag: "note",
    elements: [plainText("切换只作用于当前 IM session；模型和权限会恢复目标 Profile 默认值。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("Agent 选择"),
      template: "turquoise",
    },
    elements,
  };
}

function renderWorkdirPickerCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const workDir = surface.current.workDir;
  const children = listChildDirectoryNames(workDir);
  const history = surface.current.workDirHistory
    .filter((item) => path.resolve(item) !== path.resolve(workDir))
    .slice(0, 10);
  const defaultAction = action("workdir-default", "Profile 默认目录", "/cd default", {
    requiresAdmin: true,
  });
  const previousAction = history[0]
    ? action("workdir-previous", "上一目录", "/dir -", { requiresAdmin: true })
    : null;
  const parent = path.dirname(workDir);
  const options = [
    { label: "Profile 默认目录", value: actionCommandValue(defaultAction) },
    ...(previousAction ? [{
      label: `上一目录 · ${compactPath(history[0] || "")}`,
      value: actionCommandValue(previousAction),
    }] : []),
    ...history.map((dir, index) => ({
      label: `最近 ${index + 1}. ${compactPath(dir)}`,
      value: actionCommandValue(action(`workdir-history-${index + 1}`, dir, `/dir ${index + 1}`, { requiresAdmin: true })),
    })),
    ...(parent && parent !== workDir ? [{
      label: `上级目录 · ${compactPath(parent)}`,
      value: actionCommandValue(action("workdir-parent", "上级目录", `/cd ${parent}`, { requiresAdmin: true })),
    }] : []),
    ...children.map((name, index) => {
      const target = path.resolve(workDir, name);
      return {
        label: `${index + 1}. ${name}`,
        value: actionCommandValue(action(`workdir-child-${index + 1}`, name, `/cd ${target}`, { requiresAdmin: true })),
      };
    }),
  ];
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**当前目录**",
        `\`${workDir}\``,
        `可选项：${options.length} 个 · 最近目录 ${history.length} 个 · 子目录 ${children.length} 个`,
      ].join("\n"),
    },
    selectStaticElement({
      placeholder: "切换工作目录",
      options,
      initialValue: null,
      surface,
      sectionId: "workdir",
      viewId: "workdir",
    }),
  ];
  pushSubcardNavRows(elements, surface, "workdir");
  elements.push({
    tag: "note",
    elements: [plainText("切换目录会断开旧 Agent 续接；/dir - 返回上一目录，/dir <序号> 优先选择最近目录。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("工作目录"),
      template: "green",
    },
    elements,
  };
}

function renderDisplayCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "display");
  const actions = section?.actions || [];
  const quietToggle = actions.find((item) => item.id === "quiet-toggle")
    || action("quiet-toggle", "安静模式", "/quiet quiet", { requiresAdmin: true });
  const thinkingOn = actions.find((item) => item.id === "thinking-on")
    || action("thinking-on", "显示思考", "/thinking on", { requiresAdmin: true });
  const thinkingOff = actions.find((item) => item.id === "thinking-off")
    || action("thinking-off", "隐藏思考", "/thinking off", { requiresAdmin: true });
  const processOn = actions.find((item) => item.id === "process-on")
    || action("process-on", "显示过程", "/process on", { requiresAdmin: true });
  const processOff = actions.find((item) => item.id === "process-off")
    || action("process-off", "隐藏过程", "/process off", { requiresAdmin: true });
  const toolsOn = actions.find((item) => item.id === "tools-on")
    || action("tools-on", "显示工具", "/tools on", { requiresAdmin: true });
  const toolsOff = actions.find((item) => item.id === "tools-off")
    || action("tools-off", "隐藏工具", "/tools off", { requiresAdmin: true });
  const defaults = actions.find((item) => item.id === "display-default")
    || action("display-default", "恢复默认", "/display default", { requiresAdmin: true });
  const thinkingToggle = surface.current.thinkingMessages
    ? { ...thinkingOff, label: "隐藏思考" }
    : { ...thinkingOn, label: "显示思考", tone: "primary" as const };
  const processToggle = surface.current.processMessages
    ? { ...processOff, label: "隐藏过程" }
    : { ...processOn, label: "显示过程", tone: "primary" as const };
  const toolsToggle = surface.current.toolMessages
    ? { ...toolsOff, label: "隐藏工具" }
    : { ...toolsOn, label: "显示工具", tone: "primary" as const };
  const quietEnabled = !surface.current.thinkingMessages && !surface.current.processMessages && !surface.current.toolMessages;
  const quietAction = {
    ...quietToggle,
    label: quietEnabled ? "恢复完整显示" : "一键安静",
    tone: quietEnabled ? "primary" as const : "default" as const,
  };
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**当前显示**",
        `思考：${surface.current.thinkingMessages ? "开启" : "关闭"}`,
        `过程：${surface.current.processMessages ? "开启" : "关闭"}`,
        `工具：${surface.current.toolMessages ? "开启" : "关闭"}`,
        `思考流：${formatChannelConnectorThinkingSupport(surface.current.thinkingSupport)}`,
      ].join("\n"),
    },
  ];
  elements.push({
    tag: "markdown",
    content: "**单项开关**\n分别控制思考、过程回复和工具过程。",
  });
  pushActionRows(elements, [thinkingToggle, processToggle], surface, 2, true);
  pushActionRows(elements, [toolsToggle], surface, 2, true);
  elements.push({
    tag: "markdown",
    content: "**一键模式**\n快速隐藏或恢复全部中间态；最终回复不受影响。",
  });
  pushActionRows(elements, [quietAction, defaults], surface, 2, true);
  pushSubcardNavRows(elements, surface, "display");
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("进度显示"),
      template: "wathet",
    },
    elements,
  };
}

function renderBufferCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "buffer");
  const actions = section?.actions || [];
  const list = actions.find((item) => item.id === "buffer-list")
    || action("buffer-list", "缓存列表", "/buffer");
  const latest = actions.find((item) => item.id === "buffer-latest")
    || action("buffer-latest", "最新缓存", "/buffer latest");
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**Reply Buffer**",
        "群聊长回复会保存在 Studio 本地，只在群里发送预览和 buffer id。",
        "",
        "**读取范围**",
        "只读取当前 binding 和当前 IM session 的缓存。",
      ].join("\n"),
    },
  ];
  pushActionRows(elements, [list, latest], surface, 2, true);
  pushSubcardNavRows(elements, surface, "buffer");
  elements.push({
    tag: "note",
    elements: [plainText("也可以直接发送 /buffer <id|前缀|latest>。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("长回复缓存"),
      template: "purple",
    },
    elements,
  };
}

function renderCommandsCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "commands");
  const actions = section?.actions || [];
  const list = actions.find((item) => item.id === "commands-list")
    || action("commands-list", "命令列表", "/commands", { actionKind: "nav" });
  const aliases = actions.find((item) => item.id === "aliases-list")
    || action("aliases-list", "别名", "/alias", { actionKind: "nav" });
  const skills = actions.find((item) => item.id === "skills-list")
    || action("skills-list", "Skills 列表", "/skills", { actionKind: "nav" });
  const commandActions = actions.filter((item) => item.id.startsWith("custom-command-"));
  const skillActions = actions.filter((item) => item.id.startsWith("skill-"));
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**Commands / Skills**",
        commandActions.length || skillActions.length
          ? `当前 Agent 可用 ${commandActions.length} 个自定义命令、${skillActions.length} 个 Skill。点击按钮会交给 Agent 执行。`
          : "当前 Agent 还没有可用的自定义命令或 Skill。",
        "",
        "**管理**",
        "`/commands add <名称> <prompt 模板>`",
        "`/commands addexec [--work-dir <目录>] <名称> <shell 命令>`",
        "`/commands del <名称>`",
        "`/alias add <触发词> <命令>`",
        "`/alias del <触发词>`",
      ].join("\n"),
    },
  ];
  pushActionRows(elements, [list, aliases, skills], surface, 3, true);
  if (commandActions.length) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "markdown", content: "**自定义命令**" });
    for (const item of commandActions) {
      elements.push(commandSurfaceListItemElement(item, surface, { showCurrent: false }));
    }
  }
  if (skillActions.length) {
    elements.push({ tag: "hr" });
    elements.push({ tag: "markdown", content: "**Skills**" });
    for (const item of skillActions) {
      elements.push(commandSurfaceListItemElement(item, surface, { showCurrent: false }));
    }
  }
  pushSubcardNavRows(elements, surface, "commands");
  elements.push({
    tag: "note",
    elements: [plainText("优先级：Studio 内置命令 > config command > Agent command file > Skill > 原生透传。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("命令与 Skills"),
      template: "turquoise",
    },
    elements,
  };
}

function renderSessionCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "session");
  const actions = section?.actions || [];
  const usage = actions.find((item) => item.id === "usage") || action("usage", "用量", "/usage");
  const current = actions.find((item) => item.id === "current") || action("current", "当前会话", "/current", { actionKind: "nav" });
  const sessions = actions.find((item) => item.id === "sessions") || action("sessions", "续接列表", "/list", { actionKind: "nav" });
  const history = actions.find((item) => item.id === "history") || action("history", "历史", "/history", { actionKind: "nav" });
  const compact = actions.find((item) => item.id === "compact") || action("compact", "压缩上下文", "/compact", { tone: "primary", requiresAdmin: true });
  const stop = actions.find((item) => item.id === "stop") || action("stop", "停止运行", "/stop", { tone: "danger", requiresAdmin: true });
  const fresh = actions.find((item) => item.id === "new") || action("new", "新会话", "/new", { tone: "primary", requiresAdmin: true });
  const reset = actions.find((item) => item.id === "reset") || action("reset", "重置会话", "/reset", { tone: "danger", requiresAdmin: true });
  const elements: Array<Record<string, unknown>> = [
    statusBlock(surface),
    {
      tag: "markdown",
      content: [
        "**会话操作**",
        "常用查看和会话控制。低频诊断可直接发送 /whoami 或 /version。",
      ].join("\n"),
    },
  ];
  elements.push({ tag: "markdown", content: "**查看**" });
  pushActionRows(elements, [current, sessions], surface, 2, true);
  pushActionRows(elements, [history, usage], surface, 2, true);
  elements.push({ tag: "hr" });
  elements.push({ tag: "markdown", content: "**控制**" });
  pushActionRows(elements, [fresh, compact], surface, 2, true);
  pushActionRows(elements, [stop, reset], surface, 2, true);
  pushSubcardNavRows(elements, surface, "session");
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("会话控制"),
      template: "blue",
    },
    elements,
  };
}

function renderCurrentSessionCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const session = surface.session;
  const historyCount = surface.history.length;
  const rows = [
    ["Binding", surface.current.bindingId],
    ["Session key", surface.current.sessionKey || "-"],
    ["Session name", session?.name || "-"],
    ["Agent", `${surface.current.projectId} · ${surface.current.agent}`],
    ["Model", surface.current.model || "default"],
    ["Reasoning", surface.current.reasoningEffort || "default"],
    ["Thinking stream", formatChannelConnectorThinkingSupport(surface.current.thinkingSupport)],
    ["Permission", surface.current.permissionMode],
    ["WorkDir", surface.current.workDir],
    [
      "Thinking / Process / Tools",
      `${surface.current.thinkingMessages ? "on" : "off"} / ${surface.current.processMessages ? "on" : "off"} / ${surface.current.toolMessages ? "on" : "off"}`,
    ],
    ["Agent session", session?.started ? `${session.turnCount} turns` : "not started"],
    ["Session id", shortSurfaceId(session?.id)],
    ["Native session", shortSurfaceId(session?.agentNativeSessionId)],
    ["Last status", session?.lastStatus || "-"],
    ["Last message", session?.lastMessageId || "-"],
    ["Codex thread", shortSurfaceId(session?.codexThreadId)],
    ["Created", session?.createdAt || "-"],
    ["Updated", session?.updatedAt || "-"],
    ["History", `${historyCount} recent entries loaded`],
  ];
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: rows.map(([label, value]) => `**${label}**\n${value}`).join("\n\n"),
    },
  ];
  pushActionRows(elements, [
    action("status", "刷新状态", "/status"),
    action("sessions", "续接列表", "/list", { actionKind: "nav" }),
    action("history", "查看历史", "/history", { actionKind: "nav" }),
    action("usage", "用量", "/usage"),
  ], surface, 1);
  pushSubcardNavRows(elements, surface, "session");
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("当前会话"),
      template: "turquoise",
    },
    elements,
  };
}

function renderSessionListCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const records = surface.sessionList.slice(0, 12);
  const elements: Array<Record<string, unknown>> = [];
  if (!records.length) {
    elements.push({
      tag: "markdown",
      content: [
        "**Agent Sessions**",
        "当前 IM session 还没有本地 Agent session。",
        "",
        "发送普通消息后，Studio 会保存可续接记录；也可以用新会话开启新的 Agent 会话。",
      ].join("\n"),
    });
  } else {
    elements.push({
      tag: "markdown",
      content: `**Agent Sessions**\n${records.length} 个本地续接记录 · 当前 IM session`,
    });
    records.forEach((record, index) => {
      const model = record.model || "default";
      const title = record.name || record.projectId;
      const description = [
        `${record.projectId} · ${record.agent} · ${model}`,
        `${record.turnCount} turns · ${record.lastStatus || "unknown"} · ${record.updatedAt}`,
        `session ${shortSurfaceId(record.id)} · native ${shortSurfaceId(record.agentNativeSessionId)} · thread ${shortSurfaceId(record.codexThreadId)}`,
        compactPath(record.workDir),
      ].join("\n");
      elements.push(listItemElement(action(
        `session-${index + 1}`,
        `${index + 1}. ${title}`,
        `/switch ${index + 1}`,
        {
          tone: record.active ? "primary" : "default",
          description,
          requiresAdmin: true,
        },
      ), surface, {
        actionLabel: "切换",
        primaryLabel: "当前",
      }));
      if (!record.active) {
        pushActionRows(elements, [action(
          `delete-session-${index + 1}`,
          `删除 ${index + 1}`,
          `/delete ${index + 1}`,
          {
            tone: "danger",
            description: "删除这条非当前 Agent session 续接记录",
            requiresAdmin: true,
          },
        )], surface, 1, true);
      }
    });
    const deleteModeForm = deleteModeFormElement(records, surface);
    if (deleteModeForm) {
      elements.push({ tag: "hr" });
      elements.push(deleteModeForm);
    }
  }
  pushActionRows(elements, [
    action("current", "当前会话", "/current", { actionKind: "nav" }),
    action("history", "历史", "/history", { actionKind: "nav" }),
    action("usage", "用量", "/usage"),
  ], surface, 2, true);
  pushSubcardNavRows(elements, surface, "session");
  elements.push({
    tag: "note",
    elements: [plainText("列表来自 Studio 本地 Agent session store；/switch <序号|sessionId前缀> 只切换当前 IM session。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("会话续接"),
      template: "turquoise",
    },
    elements,
  };
}

function renderHistoryCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const lines = surface.history.length
    ? surface.history.map((entry, index) => {
      const role = entry.role === "assistant" ? "Assistant" : "User";
      const icon = entry.role === "assistant" ? "A" : "U";
      const status = entry.status ? ` (${entry.status})` : "";
      const text = normalizeString(entry.text) || "(no text)";
      const truncated = text.length > 260 ? `${text.slice(0, 259)}...` : text;
      const attachments = entry.attachmentSummaries.length
        ? `\nAttachments: ${entry.attachmentSummaries.join("; ")}`
        : "";
      return `**${index + 1}. [${icon}] ${role}${status}** · ${entry.createdAt} · msg=${shortSurfaceId(entry.messageId, 14)}\n${truncated}${attachments}`;
    }).join("\n\n")
    : "当前 IM session 还没有 history。";
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: surface.history.length
        ? `**最近 ${surface.history.length} 条 IM history**\n${lines}`
        : lines,
    },
  ];
  pushActionRows(elements, [
    action("current", "当前会话", "/current", { actionKind: "nav" }),
    action("sessions", "续接列表", "/list", { actionKind: "nav" }),
    action("compact", "压缩上下文", "/compact", {
      tone: "primary",
      requiresAdmin: true,
      description: "原生优先；否则摘要本 IM history",
    }),
    action("new", "新会话", "/new", { tone: "primary", requiresAdmin: true }),
  ], surface, 1);
  pushSubcardNavRows(elements, surface, "session");
  elements.push({
    tag: "note",
    elements: [plainText("History 来自 Studio 本地 IM session store；/new 和 /reset 会清理当前会话 history。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("最近历史"),
      template: "turquoise",
    },
    elements,
  };
}

function renderMoreMenuCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const elements: Array<Record<string, unknown>> = [
    compactConfigBlock(surface),
    {
      tag: "markdown",
      content: [
        "**更多**",
        "低频查看、排查和扩展命令集中在这里；日常配置回主菜单。",
      ].join("\n"),
    },
  ];
  pushActionRows(elements, moreSectionActions(), surface, 2, true);
  elements.push({ tag: "hr" });
  pushActionRows(elements, [
    action("current", "当前会话", "/current", { actionKind: "nav" }),
    action("sessions", "续接列表", "/list", { actionKind: "nav" }),
    action("history", "历史", "/history", { actionKind: "nav" }),
    action("usage", "用量", "/usage"),
  ], surface, 2, true);
  pushActionRows(elements, [homeMenuAction()], surface, 1, true);
  elements.push({
    tag: "note",
    elements: [plainText("更多页只放低频入口；Agent、模型、权限、显示、视觉和目录在主菜单配置。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("更多"),
      template: "wathet",
    },
    elements,
  };
}

function renderHelpMenuCard(
  surface: ChannelConnectorCommandSurface,
): ChannelConnectorFeishuInteractiveCard {
  const selectedSectionId = normalizeChannelConnectorCommandSurfaceSection(surface.selectedSectionId);
  const elements: Array<Record<string, unknown>> = [compactConfigBlock(surface)];

  if (!selectedSectionId) {
    elements.push({
      tag: "markdown",
      content: [
        "**配置**",
        "选择当前 IM 会话使用的 Agent、模型、权限、进度显示、视觉和工作目录。",
      ].join("\n"),
    });
    pushActionRows(elements, homeConfigActions(), surface, 2, true);
    elements.push({ tag: "hr" });
    elements.push({
      tag: "markdown",
      content: "**会话动作**",
    });
    pushActionRows(elements, homeQuickActions(surface), surface, 2, true);
    pushActionRows(elements, [moreMenuAction()], surface, 1, true);
    elements.push({
      tag: "note",
      elements: [plainText("低频查看和扩展操作收纳在“更多”里。")],
    });
    return {
      config: {
        wide_screen_mode: true,
      },
      header: {
        title: plainText(surface.title),
        template: "blue",
      },
      elements,
    };
  }

  const section = sectionById(surface, selectedSectionId);
  if (section) {
    elements.push({ tag: "hr" });
    pushSectionHeading(elements, section);
    for (const item of helpSectionActions(section, surface)) {
      elements.push(commandSurfaceListItemElement(item, surface, {
        showCurrent: selectedSectionId === "agent",
      }));
    }
  }

  const siblings = siblingSectionActions(selectedSectionId);
  if (siblings.length) {
    elements.push({ tag: "hr" });
    elements.push({
      tag: "markdown",
      content: "**同组入口**",
    });
    pushActionRows(elements, siblings, surface, 2, true);
  }
  pushActionRows(elements, [homeMenuAction()], surface, 1, true);
  elements.push({
    tag: "note",
    elements: [plainText("选择类按钮只作用于当前 IM session；全局默认配置在 Studio 页面维护。")],
  });

  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText(surface.title),
      template: "blue",
    },
    elements,
  };
}

export function renderChannelConnectorCommandSurfaceFeishu(
  surface: ChannelConnectorCommandSurface,
  notice?: {
    title: string;
    text: string;
    ok?: boolean | null;
  } | null,
): ChannelConnectorFeishuInteractiveCard {
  const selectedViewId = normalizeChannelConnectorCommandSurfaceView(surface.selectedViewId) || "help";
  const card = selectedViewId === "agent"
    ? renderAgentPickerCard(surface)
    : selectedViewId === "more"
      ? renderMoreMenuCard(surface)
      : selectedViewId === "session"
        ? renderSessionCard(surface)
        : selectedViewId === "current"
          ? renderCurrentSessionCard(surface)
          : selectedViewId === "sessions"
            ? renderSessionListCard(surface)
            : selectedViewId === "history"
              ? renderHistoryCard(surface)
              : selectedViewId === "model"
                ? renderModelPickerCard(surface)
                : selectedViewId === "vision"
                  ? renderVisionPickerCard(surface)
                  : selectedViewId === "mode"
                    ? renderModePickerCard(surface)
                    : selectedViewId === "display"
                      ? renderDisplayCard(surface)
                      : selectedViewId === "buffer"
                        ? renderBufferCard(surface)
                        : selectedViewId === "commands"
                          ? renderCommandsCard(surface)
                          : selectedViewId === "workdir"
                            ? renderWorkdirPickerCard(surface)
                            : renderHelpMenuCard(surface);
  return notice?.text ? withCommandNotice(card, notice) : card;
}

function truncateNoticeText(value: string, maxLength = 1800): string {
  const normalized = normalizeString(value);
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function withCommandNotice(
  card: ChannelConnectorFeishuInteractiveCard,
  notice: {
    title: string;
    text: string;
    ok?: boolean | null;
  },
): ChannelConnectorFeishuInteractiveCard {
  const title = normalizeString(notice.title) || "执行结果";
  const text = truncateNoticeText(notice.text);
  const template = notice.ok === false ? "red" : notice.ok === null ? "yellow" : "green";
  const header = card.header || {
    title: plainText("Studio Channel Menu"),
    template: "blue",
  };
  return {
    ...card,
    header: {
      ...header,
      title: header.title,
      template,
    },
    elements: [
      {
        tag: "markdown",
        content: `**${title}**\n${text}`,
      },
      { tag: "hr" },
      ...card.elements,
    ],
  };
}

export interface ChannelConnectorSurfaceActionPayload {
  command: string | null;
  rawAction: string | null;
  actionKind: "nav" | "act" | "cmd" | null;
  bindingId: string | null;
  sessionKey: string | null;
  actionId: string | null;
  targetSectionId: string | null;
  targetViewId: string | null;
}

function parseSurfaceAction(raw: string): {
  command: string | null;
  actionKind: ChannelConnectorSurfaceActionPayload["actionKind"];
} {
  const normalized = normalizeString(raw);
  if (!normalized) return { command: null, actionKind: null };
  const match = normalized.match(/^(nav|act|cmd):(.+)$/i);
  if (!match) return { command: normalized, actionKind: "cmd" };
  const command = normalizeString(match[2]);
  return {
    command: command || null,
    actionKind: match[1].toLowerCase() as "nav" | "act" | "cmd",
  };
}

function bestSurfaceActionRaw(record: Record<string, unknown>): string | null {
  const candidates = [
    normalizeString(record.action),
    normalizeString(record.command),
    normalizeString(record.value),
    normalizeString(record.option),
  ].filter(Boolean);
  return candidates.find((candidate) => /^(nav|act|cmd):/i.test(candidate))
    || candidates.find((candidate) => candidate.startsWith("/"))
    || candidates[0]
    || null;
}

export function extractChannelConnectorSurfaceActionPayload(value: unknown): ChannelConnectorSurfaceActionPayload {
  if (typeof value === "string") {
    const parsed = parseSurfaceAction(value);
    return {
      command: parsed.command,
      rawAction: normalizeString(value) || null,
      actionKind: parsed.actionKind,
      bindingId: null,
      sessionKey: null,
      actionId: null,
      targetSectionId: channelConnectorCommandSurfaceSectionFromCommand(parsed.command),
      targetViewId: channelConnectorCommandSurfaceViewFromCommand(parsed.command, parsed.actionKind),
    };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {
      command: null,
      rawAction: null,
      actionKind: null,
      bindingId: null,
      sessionKey: null,
      actionId: null,
      targetSectionId: null,
      targetViewId: null,
    };
  }
  const record = value as Record<string, unknown>;
  const rawAction = bestSurfaceActionRaw(record);
  const parsed = parseSurfaceAction(rawAction || "");
  const recordCommand = normalizeString(record.command);
  const parsedRecordCommand = parseSurfaceAction(recordCommand);
  const command = parsed.command || parsedRecordCommand.command || recordCommand;
  const explicitActionKind = normalizeString(record.surface_action_kind).toLowerCase();
  const sectionId = normalizeChannelConnectorCommandSurfaceSection(record.surface_section_id)
    || channelConnectorCommandSurfaceSectionFromCommand(command);
  const actionKind = explicitActionKind === "nav" || explicitActionKind === "act" || explicitActionKind === "cmd"
    ? explicitActionKind
    : parsed.actionKind;
  const viewId = normalizeChannelConnectorCommandSurfaceView(record.surface_view_id)
    || normalizeChannelConnectorCommandSurfaceView(record.surfaceViewId)
    || channelConnectorCommandSurfaceViewFromCommand(command, actionKind);
  return {
    command: command || null,
    rawAction,
    actionKind,
    bindingId: normalizeString(record.binding_id) || normalizeString(record.bindingId) || null,
    sessionKey: normalizeString(record.session_key) || normalizeString(record.sessionKey) || null,
    actionId: normalizeString(record.surface_action_id) || normalizeString(record.surfaceActionId) || null,
    targetSectionId: sectionId,
    targetViewId: viewId,
  };
}

export function extractChannelConnectorCommandFromActionValue(value: unknown): string | null {
  return extractChannelConnectorSurfaceActionPayload(value).command;
}
