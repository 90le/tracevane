import fs from "node:fs";
import path from "node:path";
import type {
  ChannelConnectorCommandSurface,
  ChannelConnectorCommandSurfaceAction,
  ChannelConnectorCommandSurfaceSection,
  ChannelConnectorFeishuInteractiveCard,
  ChannelConnectorPermissionMode,
  ChannelConnectorsDaemonRuntimeConfig,
} from "../../../../types/channel-connectors.js";
import type {
  ChannelConnectorRuntimeBinding,
  ChannelConnectorRuntimeProject,
} from "./agent-runner.js";
import { resolveChannelConnectorEffectiveProject } from "./command-router.js";
import type { ChannelConnectorSessionControlRecord } from "./session-control-store.js";

const PERMISSION_MODES: readonly ChannelConnectorPermissionMode[] = [
  "suggest",
  "read-only",
  "auto-edit",
  "full-auto",
  "plan",
  "yolo",
];

const PERMISSION_MODE_LABELS: Record<ChannelConnectorPermissionMode, string> = {
  suggest: "建议确认",
  "read-only": "只读",
  "auto-edit": "自动编辑",
  "full-auto": "全自动",
  plan: "规划",
  yolo: "YOLO",
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
  "mode",
  "display",
  "buffer",
  "workdir",
  "native",
] as const;

type FeishuMenuSectionId = typeof FEISHU_MENU_SECTIONS[number];

const FEISHU_MENU_VIEWS = [
  "help",
  "session",
  "current",
  "sessions",
  "history",
  "agent",
  "model",
  "mode",
  "display",
  "buffer",
  "workdir",
] as const;

type FeishuMenuViewId = typeof FEISHU_MENU_VIEWS[number];

const FEISHU_MENU_SECTION_LABELS: Record<FeishuMenuSectionId, string> = {
  session: "会话",
  agent: "Agent",
  model: "模型",
  mode: "权限",
  display: "显示",
  buffer: "缓存",
  workdir: "目录",
  native: "原生",
};

const FEISHU_MENU_SECTION_ALIASES: Record<string, FeishuMenuSectionId> = {
  session: "session",
  status: "session",
  current: "session",
  list: "session",
  sessions: "session",
  switch: "session",
  history: "session",
  new: "session",
  reset: "session",
  agent: "agent",
  agents: "agent",
  project: "agent",
  profile: "agent",
  model: "model",
  models: "model",
  mode: "mode",
  permission: "mode",
  permissions: "mode",
  yolo: "mode",
  display: "display",
  stream: "display",
  streams: "display",
  progress: "display",
  tools: "display",
  tool: "display",
  buffer: "buffer",
  buffers: "buffer",
  "reply-buffer": "buffer",
  "reply-buffers": "buffer",
  workdir: "workdir",
  dir: "workdir",
  pwd: "workdir",
  cd: "workdir",
  chdir: "workdir",
  native: "native",
  raw: "native",
  pass: "native",
};

const FEISHU_MENU_VIEW_ALIASES: Record<string, FeishuMenuViewId> = {
  help: "help",
  menu: "help",
  commands: "help",
  command: "help",
  cmd: "help",
  start: "help",
  session: "session",
  status: "session",
  current: "current",
  list: "sessions",
  sessions: "sessions",
  switch: "sessions",
  history: "history",
  new: "session",
  reset: "session",
  agent: "agent",
  agents: "agent",
  project: "agent",
  profile: "agent",
  model: "model",
  models: "model",
  "model-picker": "model",
  mode: "mode",
  permission: "mode",
  permissions: "mode",
  "mode-picker": "mode",
  display: "display",
  stream: "display",
  streams: "display",
  progress: "display",
  tools: "display",
  tool: "display",
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
};

export interface ChannelConnectorCommandSurfaceInput {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  control?: ChannelConnectorSessionControlRecord | null;
  displayDefaults?: {
    streamMessages?: boolean | null;
    toolMessages?: boolean | null;
  } | null;
  sessionKey?: string | null;
  models?: string[];
  agentSession?: ChannelConnectorCommandSurface["session"];
  sessionList?: ChannelConnectorCommandSurface["sessionList"];
  history?: ChannelConnectorCommandSurface["history"];
  selectedSectionId?: string | null;
  selectedViewId?: string | null;
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
  if (["help", "menu", "commands", "command", "cmd", "start"].includes(name.toLowerCase())) {
    return normalizeChannelConnectorCommandSurfaceSection(parts[1]) || "session";
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
  if (["help", "menu", "commands", "command", "cmd", "start"].includes(name)) return "help";
  if (name === "current") return "current";
  if (name === "list" || name === "sessions" || name === "switch") return "sessions";
  if (name === "history") return "history";
  if (["status", "new", "reset"].includes(name)) return "session";
  if (name === "agent" || name === "agents") return "agent";
  if (name === "model" || name === "models") return "model";
  if (["mode", "permission", "permissions", "yolo"].includes(name)) return "mode";
  if (["display", "stream", "streams", "progress", "tools", "tool"].includes(name)) return "display";
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

function fallbackActionPrefix(item: ChannelConnectorCommandSurfaceAction): string {
  if (item.tone === "danger") return "!";
  if (item.tone === "primary") return ">";
  if (item.actionKind === "nav") return "-";
  return "-";
}

function fallbackActionLine(item: ChannelConnectorCommandSurfaceAction): string {
  const description = commandSurfaceItemDescription(item);
  const suffix = description ? ` - ${description}` : "";
  return `${fallbackActionPrefix(item)} \`${item.command}\` ${item.label}${suffix}`;
}

function buildTextFallback(surface: Omit<ChannelConnectorCommandSurface, "textFallback">): string {
  const quickActions = sectionById(surface as ChannelConnectorCommandSurface, "session")?.actions
    .filter((item) => ["status", "new"].includes(item.id)) || [];
  const lines: string[] = [
    `**${surface.title}**`,
    "",
    "**当前会话**",
    `- Agent: ${surface.current.projectId} (${surface.current.agent})`,
    `- Model: ${surface.current.model || "default"}`,
    `- Mode: ${surface.current.permissionMode}`,
    `- WorkDir: ${surface.current.workDir}`,
    `- Display: stream=${surface.current.streamMessages ? "on" : "off"} / tools=${surface.current.toolMessages ? "on" : "off"}`,
  ];
  if (surface.current.workDirHistory.length) {
    lines.push(`- Previous WorkDir: ${surface.current.workDirHistory[0]}`);
  }
  if (quickActions.length) {
    lines.push("", "**快捷操作**");
    quickActions.forEach((item) => lines.push(fallbackActionLine(item)));
  }
  for (const section of surface.sections) {
    lines.push("", `**${section.title}**`);
    if (section.summary) lines.push(section.summary);
    for (const item of section.actions) {
      lines.push(fallbackActionLine(item));
    }
  }
  lines.push(
    "",
    "**原生 Agent**",
    "未被 Studio 拥有的 `/xxx` 会直接透传给当前 Agent；与 Studio 命令冲突时用 `/native <命令>`。",
    "示例：`/native /help` 查看当前 Agent 的原生帮助或 skills 命令。",
  );
  return lines.join("\n");
}

export function buildChannelConnectorCommandSurface(
  input: ChannelConnectorCommandSurfaceInput,
): ChannelConnectorCommandSurface {
  const current = resolveChannelConnectorEffectiveProject(input.config, input.project, input.control || null);
  const streamMessages = input.control?.streamMessages
    ?? input.displayDefaults?.streamMessages
    ?? true;
  const toolMessages = input.control?.toolMessages
    ?? input.displayDefaults?.toolMessages
    ?? true;
  const models = uniqueStrings([
    ...(input.models || []),
    current.model || "",
    ...input.config.projects.map((project) => project.model || ""),
  ]).slice(0, 12);

  const sections: ChannelConnectorCommandSurfaceSection[] = [
    {
      id: "session",
      title: "Session",
      summary: "当前 IM 会话级控制，不修改全局 Provider/App 配置。",
      actions: [
        action("status", "Status", "/status"),
        action("current", "Current Session", "/current", { actionKind: "nav" }),
        action("sessions", "Agent Sessions", "/list", { actionKind: "nav" }),
        action("history", "History", "/history", { actionKind: "nav" }),
        action("new", "New Session", "/new", { tone: "primary", requiresAdmin: true }),
        action("reset", "Reset", "/reset", { tone: "danger", requiresAdmin: true }),
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
        action("model-default", "Default Model", "/model default", { requiresAdmin: true }),
      ],
    },
    {
      id: "mode",
      title: "Permission",
      summary: "权限只作用于当前 IM session；yolo 始终保持显式动作。",
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
        action("display-status", "Status", "/display"),
        action("stream-on", "Stream On", "/stream on", {
          tone: input.control?.streamMessages === false ? "default" : "primary",
          requiresAdmin: true,
          description: "显示 Agent 运行、失败、完成等进度消息",
        }),
        action("stream-off", "Stream Off", "/stream off", {
          tone: input.control?.streamMessages === false ? "danger" : "default",
          requiresAdmin: true,
          description: "关闭本 IM session 中间态消息",
        }),
        action("tools-on", "Tools On", "/tools on", {
          tone: input.control?.toolMessages === false ? "default" : "primary",
          requiresAdmin: true,
          description: "显示工具调用和思考进度",
        }),
        action("tools-off", "Tools Off", "/tools off", {
          tone: input.control?.toolMessages === false ? "danger" : "default",
          requiresAdmin: true,
          description: "隐藏工具调用和思考进度",
        }),
        action("display-default", "Default", "/display default", {
          requiresAdmin: true,
          description: "恢复默认：流式/工具消息开启",
        }),
      ],
    },
    {
      id: "workdir",
      title: "WorkDir",
      summary: "工作目录切换会断开旧 Agent 续接，避免上下文指向错误目录。",
      actions: [
        action("dir", "Current Dir", "/dir"),
        action("cd-default", "Default Dir", "/cd default", { requiresAdmin: true }),
      ],
    },
    {
      id: "buffer",
      title: "Reply Buffer",
      summary: "群聊长回复的本地缓存；只读取当前 IM session。",
      actions: [
        action("buffer-list", "Buffer List", "/buffer", {
          description: "列出本会话最近缓存的长回复",
        }),
        action("buffer-latest", "Latest Buffer", "/buffer latest", {
          description: "读取本会话最新缓存的完整回复",
        }),
      ],
    },
    {
      id: "native",
      title: "Agent Native",
      summary: "未知 /xxx 自动透传；与 Studio 命令冲突时使用 /native。",
      actions: [
        action("native-help", "Agent /help", "/native /help", {
          nativePassthrough: true,
          description: "透传当前 Agent 的原生帮助或 skills 命令入口。",
        }),
      ],
    },
  ].filter((section) => section.actions.length > 0);

  const withoutFallback: Omit<ChannelConnectorCommandSurface, "textFallback"> = {
    version: 1,
    title: "Studio Channel Menu",
    selectedSectionId: normalizeChannelConnectorCommandSurfaceSection(input.selectedSectionId) || null,
    selectedViewId: normalizeChannelConnectorCommandSurfaceView(input.selectedViewId) || null,
    current: {
      bindingId: input.binding.id,
      sessionKey: normalizeString(input.sessionKey) || null,
      projectId: current.id,
      agent: current.agent,
      model: current.model,
      permissionMode: current.permissionMode,
      workDir: current.workDir,
      workDirHistory: uniqueStrings(input.control?.workDirHistory || [])
        .map((item) => path.resolve(item))
        .filter((item) => item !== path.resolve(current.workDir))
        .slice(0, 10),
      streamMessages,
      toolMessages,
    },
    session: input.agentSession || null,
    sessionList: (input.sessionList || []).slice(0, 20),
    history: (input.history || []).slice(-10),
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
              `stream=${surface.current.streamMessages ? "on" : "off"} · tools=${surface.current.toolMessages ? "on" : "off"}`,
            ].join("\n"),
          },
        ],
      },
    ],
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

function commandSurfaceItemDescription(item: ChannelConnectorCommandSurfaceAction): string | null {
  if (item.description) return item.description;
  switch (item.id) {
    case "status":
      return "查看当前 Agent、模型、权限和 session 状态";
    case "current":
      return "查看当前 IM session、Agent 续接和最近状态";
    case "sessions":
      return "列出当前 IM session 已知 Agent sessions 并切换续接";
    case "history":
      return "查看当前 IM session 最近上下文";
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
    case "model-default":
      return "恢复 Agent Profile 默认模型";
    case "display-status":
      return "查看流式/工具消息开关";
    case "buffer-list":
      return "列出当前 IM session 最近的 reply buffer";
    case "buffer-latest":
      return "读取当前 IM session 最新的完整缓存回复";
    case "stream-on":
    case "stream-off":
    case "tools-on":
    case "tools-off":
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

function menuTabActions(
  selectedSectionId: FeishuMenuSectionId,
): ChannelConnectorCommandSurfaceAction[] {
  return FEISHU_MENU_SECTIONS.map((sectionId) => action(
    `menu-${sectionId}`,
    FEISHU_MENU_SECTION_LABELS[sectionId],
    `/help ${sectionId}`,
    {
      actionKind: "nav",
      tone: sectionId === selectedSectionId ? "primary" : "default",
    },
  ));
}

function homeMenuAction(): ChannelConnectorCommandSurfaceAction {
  return action("home-menu", "主菜单", "/help", {
    actionKind: "nav",
  });
}

function sectionMenuAction(
  sectionId: FeishuMenuSectionId,
  options: Partial<Omit<ChannelConnectorCommandSurfaceAction, "id" | "label" | "command">> = {},
): ChannelConnectorCommandSurfaceAction {
  return action(
    `section-${sectionId}`,
    FEISHU_MENU_SECTION_LABELS[sectionId],
    `/help ${sectionId}`,
    {
      actionKind: "nav",
      description: sectionSummary(sectionId),
      ...options,
    },
  );
}

function sectionSummary(sectionId: FeishuMenuSectionId): string {
  switch (sectionId) {
    case "session":
      return "状态、续接列表、新会话、重置当前 IM 会话";
    case "agent":
      return "切换当前会话绑定的 CLI Agent Profile";
    case "model":
      return "从 Studio Gateway 可用模型中选择";
    case "mode":
      return "切换当前会话权限模式";
    case "display":
      return "流式进度和工具过程显示开关";
    case "buffer":
      return "查看群聊长回复的完整缓存";
    case "workdir":
      return "查看或切换 Agent 工作目录，支持最近目录和返回上一目录";
    case "native":
      return "进入 Agent 原生 slash/skills 命令";
  }
}

function homeMenuSections(): Array<{
  title: string;
  sectionIds: FeishuMenuSectionId[];
}> {
  return [
    { title: "会话", sectionIds: ["session", "buffer", "native"] },
    { title: "配置", sectionIds: ["agent", "model", "mode", "workdir"] },
    { title: "显示", sectionIds: ["display"] },
  ];
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
  if (section.id === "mode") {
    const currentMode = surface.current.permissionMode;
    return [
      action("mode-picker", "权限模式", "/mode", {
        actionKind: "nav",
        tone: "primary",
        description: `${PERMISSION_MODE_LABELS[currentMode]} · ${PERMISSION_MODE_DESCRIPTIONS[currentMode]}`,
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
    const stream = surface.current.streamMessages ? "stream on" : "stream off";
    const tools = surface.current.toolMessages ? "tools on" : "tools off";
    return [
      action("display-picker", "显示设置", "/display", {
        actionKind: "nav",
        tone: "primary",
        description: `${stream} · ${tools}`,
        requiresAdmin: true,
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

function backToHelpAction(sectionId: FeishuMenuSectionId): ChannelConnectorCommandSurfaceAction {
  return action(`back-help-${sectionId}`, "返回分组", `/help ${sectionId}`, {
    actionKind: "nav",
  });
}

function pushSubcardNavRows(
  elements: Array<Record<string, unknown>>,
  surface: ChannelConnectorCommandSurface,
  sectionId: FeishuMenuSectionId,
): void {
  pushActionRows(elements, [backToHelpAction(sectionId), homeMenuAction()], surface, 2, true);
}

function renderModelPickerCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "model");
  const actions = section?.actions || [];
  const resetAction = actions.find((item) => item.id === "model-default")
    || action("model-default", "Default Model", "/model default", { requiresAdmin: true });
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
      title: plainText("Studio Model"),
      template: "indigo",
    },
    elements,
  };
}

function renderModePickerCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "mode");
  const modeActions = section?.actions || [];
  const current = surface.current.permissionMode;
  const options = modeActions.map((item) => ({
    label: stripListPrefix(item.label),
    value: actionCommandValue(item),
  }));
  const currentModeAction = modeActions.find((item) => item.command === `/mode ${current}`);
  const initialValue = currentModeAction ? actionCommandValue(currentModeAction) : null;
  const modeLines = modeActions.map((item) => {
    const active = item.command === `/mode ${current}`;
    return `${active ? "▶" : "◻"} **${stripListPrefix(item.label)}** — ${item.description || ""}`;
  });
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: modeLines.join("\n"),
    },
    selectStaticElement({
      placeholder: "选择权限模式",
      options,
      initialValue,
      surface,
      sectionId: "mode",
      viewId: "mode",
    }),
  ];
  pushSubcardNavRows(elements, surface, "mode");
  elements.push({
    tag: "note",
    elements: [plainText("权限只作用于当前 IM session；YOLO 代表高权限直通。")],
  });
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("Studio Permission"),
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
  const lines = agentActions.map((item) => {
    const active = item.command === `/agent ${surface.current.projectId}`;
    return `${active ? "▶" : "◻"} **${stripListPrefix(item.label)}**${item.description ? ` — ${item.description}` : ""}`;
  });
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        `**当前 Agent**\n${surface.current.projectId} · ${surface.current.agent}`,
        "",
        lines.join("\n") || "没有可切换的 Agent Profile。",
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
      title: plainText("Studio Agent"),
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
        "",
        history.length ? `**最近目录**\n${history.map((dir, index) => `${index + 1}. \`${compactPath(dir)}\``).join("\n")}` : "**最近目录**\n无",
        "",
        children.length ? `**子目录**\n${children.map((name, index) => `${index + 1}. ${name}`).join("\n")}` : "**子目录**\n无可见子目录",
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
      title: plainText("Studio WorkDir"),
      template: "green",
    },
    elements,
  };
}

function renderDisplayCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "display");
  const actions = section?.actions || [];
  const displayStatus = actions.find((item) => item.id === "display-status")
    || action("display-status", "Status", "/display");
  const streamOn = actions.find((item) => item.id === "stream-on")
    || action("stream-on", "Stream On", "/stream on", { requiresAdmin: true });
  const streamOff = actions.find((item) => item.id === "stream-off")
    || action("stream-off", "Stream Off", "/stream off", { requiresAdmin: true });
  const toolsOn = actions.find((item) => item.id === "tools-on")
    || action("tools-on", "Tools On", "/tools on", { requiresAdmin: true });
  const toolsOff = actions.find((item) => item.id === "tools-off")
    || action("tools-off", "Tools Off", "/tools off", { requiresAdmin: true });
  const defaults = actions.find((item) => item.id === "display-default")
    || action("display-default", "Default", "/display default", { requiresAdmin: true });
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: [
        "**当前显示设置**",
        `流式/进度消息：${surface.current.streamMessages ? "开启" : "关闭"}`,
        `工具/思考消息：${surface.current.toolMessages ? "开启" : "关闭"}`,
        "",
        "**作用范围**",
        "只作用于当前 IM session；最终回复仍会正常发送。",
      ].join("\n"),
    },
  ];
  pushActionRows(elements, [displayStatus, defaults], surface, 2, true);
  pushActionRows(elements, [streamOn, streamOff], surface, 2, true);
  pushActionRows(elements, [toolsOn, toolsOff], surface, 2, true);
  pushSubcardNavRows(elements, surface, "display");
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("Studio Display"),
      template: "wathet",
    },
    elements,
  };
}

function renderBufferCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "buffer");
  const actions = section?.actions || [];
  const list = actions.find((item) => item.id === "buffer-list")
    || action("buffer-list", "Buffer List", "/buffer");
  const latest = actions.find((item) => item.id === "buffer-latest")
    || action("buffer-latest", "Latest Buffer", "/buffer latest");
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
      title: plainText("Studio Reply Buffer"),
      template: "purple",
    },
    elements,
  };
}

function renderSessionCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const section = sectionById(surface, "session");
  const actions = section?.actions || [];
  const status = actions.find((item) => item.id === "status") || action("status", "Status", "/status");
  const current = actions.find((item) => item.id === "current") || action("current", "Current Session", "/current", { actionKind: "nav" });
  const sessions = actions.find((item) => item.id === "sessions") || action("sessions", "Agent Sessions", "/list", { actionKind: "nav" });
  const history = actions.find((item) => item.id === "history") || action("history", "History", "/history", { actionKind: "nav" });
  const fresh = actions.find((item) => item.id === "new") || action("new", "New Session", "/new", { tone: "primary", requiresAdmin: true });
  const reset = actions.find((item) => item.id === "reset") || action("reset", "Reset", "/reset", { tone: "danger", requiresAdmin: true });
  const elements: Array<Record<string, unknown>> = [
    statusBlock(surface),
    {
      tag: "markdown",
      content: [
        "**会话操作**",
        "Status 查看当前 IM session 的 Agent、模型、权限和续接状态。",
        "Agent Sessions 查看当前 IM session 已知续接记录，并可切换回旧续接。",
        "New Session 只断开 Agent 续接，保留当前模型/权限/目录选择。",
        "Reset 清空本 IM session 的 override 和 Agent 续接。",
      ].join("\n"),
    },
  ];
  pushActionRows(elements, [status, current, sessions, history], surface, 1);
  pushActionRows(elements, [fresh, reset], surface, 2, true);
  pushSubcardNavRows(elements, surface, "session");
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("Studio Session"),
      template: "blue",
    },
    elements,
  };
}

function renderCurrentSessionCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const session = surface.session;
  const rows = [
    ["Binding", surface.current.bindingId],
    ["Session key", surface.current.sessionKey || "-"],
    ["Agent", `${surface.current.projectId} · ${surface.current.agent}`],
    ["Model", surface.current.model || "default"],
    ["Permission", surface.current.permissionMode],
    ["WorkDir", surface.current.workDir],
    ["Stream / Tools", `${surface.current.streamMessages ? "on" : "off"} / ${surface.current.toolMessages ? "on" : "off"}`],
    ["Agent session", session?.started ? `${session.turnCount} turns` : "not started"],
    ["Last status", session?.lastStatus || "-"],
    ["Last message", session?.lastMessageId || "-"],
    ["Codex thread", session?.codexThreadId || "-"],
    ["Updated", session?.updatedAt || "-"],
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
  ], surface, 1);
  pushSubcardNavRows(elements, surface, "session");
  return {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: plainText("Studio Current Session"),
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
        "发送普通消息后，Studio 会保存可续接记录；也可以用 New Session 开启新的 Agent 会话。",
      ].join("\n"),
    });
  } else {
    elements.push({
      tag: "markdown",
      content: `**Agent Sessions**\n${records.length} 个本地续接记录 · 当前 IM session`,
    });
    records.forEach((record, index) => {
      const model = record.model || "default";
      const description = [
        `${record.projectId} · ${record.agent} · ${model}`,
        `${record.turnCount} turns · ${record.lastStatus || "unknown"} · ${record.updatedAt}`,
        compactPath(record.workDir),
      ].join("\n");
      elements.push(listItemElement(action(
        `session-${index + 1}`,
        `${index + 1}. ${record.projectId}`,
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
    });
  }
  pushActionRows(elements, [
    action("current", "当前会话", "/current", { actionKind: "nav" }),
    action("history", "历史", "/history", { actionKind: "nav" }),
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
      title: plainText("Studio Agent Sessions"),
      template: "turquoise",
    },
    elements,
  };
}

function renderHistoryCard(surface: ChannelConnectorCommandSurface): ChannelConnectorFeishuInteractiveCard {
  const lines = surface.history.length
    ? surface.history.map((entry, index) => {
      const role = entry.role === "assistant" ? "Assistant" : "User";
      const status = entry.status ? ` (${entry.status})` : "";
      const text = normalizeString(entry.text) || "(no text)";
      const truncated = text.length > 260 ? `${text.slice(0, 259)}...` : text;
      const attachments = entry.attachmentSummaries.length
        ? `\nAttachments: ${entry.attachmentSummaries.join("; ")}`
        : "";
      return `**${index + 1}. ${role}${status}** · ${entry.createdAt}\n${truncated}${attachments}`;
    }).join("\n\n")
    : "当前 IM session 还没有 history。";
  const elements: Array<Record<string, unknown>> = [
    {
      tag: "markdown",
      content: lines,
    },
  ];
  pushActionRows(elements, [
    action("current", "当前会话", "/current", { actionKind: "nav" }),
    action("sessions", "续接列表", "/list", { actionKind: "nav" }),
    action("new", "New Session", "/new", { tone: "primary", requiresAdmin: true }),
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
      title: plainText("Studio Session History"),
      template: "turquoise",
    },
    elements,
  };
}

function renderHelpMenuCard(
  surface: ChannelConnectorCommandSurface,
): ChannelConnectorFeishuInteractiveCard {
  const selectedSectionId = normalizeChannelConnectorCommandSurfaceSection(surface.selectedSectionId);
  const elements: Array<Record<string, unknown>> = [statusBlock(surface)];

  if (!selectedSectionId) {
    const sessionSection = sectionById(surface, "session");
    const status = sessionSection?.actions.find((item) => item.id === "status") || action("status", "Status", "/status");
    const fresh = sessionSection?.actions.find((item) => item.id === "new") || action("new", "New Session", "/new", { tone: "primary", requiresAdmin: true });
    pushActionRows(elements, [status, fresh], surface, 2, true);
    elements.push({ tag: "hr" });
    for (const group of homeMenuSections()) {
      elements.push({
        tag: "markdown",
        content: `**${group.title}**`,
      });
      for (const sectionId of group.sectionIds) {
        const section = sectionById(surface, sectionId);
        if (!section) continue;
        elements.push(commandSurfaceListItemElement(sectionMenuAction(sectionId), surface, {
          showCurrent: false,
        }));
      }
    }
    elements.push({
      tag: "note",
      elements: [plainText("未列出的 /xxx 默认透传给 Agent；与 Studio 命令冲突时用 /native。")],
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

  pushActionRows(elements, menuTabActions(selectedSectionId), surface, 2, true);

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

  pushActionRows(elements, [homeMenuAction()], surface, 1);
  elements.push({
    tag: "note",
    elements: [plainText("未列出的 /xxx 默认透传给 Agent；需要原生冲突命令时用 /native。")],
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
              : selectedViewId === "mode"
                ? renderModePickerCard(surface)
                : selectedViewId === "display"
                  ? renderDisplayCard(surface)
                  : selectedViewId === "buffer"
                    ? renderBufferCard(surface)
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
