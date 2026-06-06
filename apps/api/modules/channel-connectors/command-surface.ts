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

const FEISHU_MENU_SECTIONS = [
  "session",
  "agent",
  "model",
  "mode",
  "workdir",
  "native",
] as const;

type FeishuMenuSectionId = typeof FEISHU_MENU_SECTIONS[number];

const FEISHU_MENU_SECTION_LABELS: Record<FeishuMenuSectionId, string> = {
  session: "会话",
  agent: "Agent",
  model: "模型",
  mode: "权限",
  workdir: "目录",
  native: "原生",
};

const FEISHU_MENU_SECTION_ALIASES: Record<string, FeishuMenuSectionId> = {
  session: "session",
  status: "session",
  current: "session",
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
  workdir: "workdir",
  dir: "workdir",
  pwd: "workdir",
  cd: "workdir",
  chdir: "workdir",
  native: "native",
  raw: "native",
  pass: "native",
};

export interface ChannelConnectorCommandSurfaceInput {
  config: ChannelConnectorsDaemonRuntimeConfig;
  project: ChannelConnectorRuntimeProject;
  binding: ChannelConnectorRuntimeBinding;
  control?: ChannelConnectorSessionControlRecord | null;
  sessionKey?: string | null;
  models?: string[];
  selectedSectionId?: string | null;
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

export function channelConnectorCommandSurfaceSectionFromCommand(command: string | null | undefined): FeishuMenuSectionId | null {
  const normalized = normalizeString(command);
  if (!normalized) return null;
  const parts = normalized.replace(/^\/+/, "").split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const name = parts[0] || "";
  if (["help", "menu", "commands", "command", "cmd", "start"].includes(name.toLowerCase())) {
    return normalizeChannelConnectorCommandSurfaceSection(parts[1]) || "session";
  }
  return normalizeChannelConnectorCommandSurfaceSection(name);
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
    tone: options.tone || "default",
    description: options.description || null,
    requiresAdmin: options.requiresAdmin === true,
    nativePassthrough: options.nativePassthrough === true,
  };
}

function buildTextFallback(surface: Omit<ChannelConnectorCommandSurface, "textFallback">): string {
  const lines = [
    surface.title,
    `Agent: ${surface.current.projectId} (${surface.current.agent})`,
    `Model: ${surface.current.model || "default"}`,
    `Mode: ${surface.current.permissionMode}`,
    `WorkDir: ${surface.current.workDir}`,
  ];
  for (const section of surface.sections) {
    lines.push("", section.title);
    if (section.summary) lines.push(section.summary);
    for (const item of section.actions) {
      lines.push(`- ${item.label}: ${item.command}`);
    }
  }
  lines.push("", "未被 Studio 拥有的 /xxx 会直接透传给当前 Agent；skills/native 命令优先留给 Agent CLI 处理。");
  return lines.join("\n");
}

export function buildChannelConnectorCommandSurface(
  input: ChannelConnectorCommandSurfaceInput,
): ChannelConnectorCommandSurface {
  const current = resolveChannelConnectorEffectiveProject(input.config, input.project, input.control || null);
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
        mode,
        `/mode ${mode}`,
        {
          tone: mode === current.permissionMode ? "primary" : mode === "yolo" ? "danger" : "default",
          requiresAdmin: true,
        },
      )),
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
    current: {
      bindingId: input.binding.id,
      sessionKey: normalizeString(input.sessionKey) || null,
      projectId: current.id,
      agent: current.agent,
      model: current.model,
      permissionMode: current.permissionMode,
      workDir: current.workDir,
    },
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
  const actionKind = item.id.startsWith("menu-") ? "nav" : "act";
  const sectionId = channelConnectorCommandSurfaceSectionFromCommand(item.command);
  const value: Record<string, string> = {
    action: `${actionKind}:${item.command}`,
    command: item.command,
    surface_action_kind: actionKind,
    surface_action_id: item.id,
    binding_id: surface.current.bindingId,
  };
  if (sectionId) value.surface_section_id = sectionId;
  if (surface.current.sessionKey) value.session_key = surface.current.sessionKey;
  return value;
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
    { tone: sectionId === selectedSectionId ? "primary" : "default" },
  ));
}

export function renderChannelConnectorCommandSurfaceFeishu(
  surface: ChannelConnectorCommandSurface,
): ChannelConnectorFeishuInteractiveCard {
  const selectedSectionId = normalizeChannelConnectorCommandSurfaceSection(surface.selectedSectionId) || "session";
  const elements: Array<Record<string, unknown>> = [statusBlock(surface)];

  pushActionRows(elements, menuTabActions(selectedSectionId), surface, 2, true);

  const section = sectionById(surface, selectedSectionId);
  if (section) {
    elements.push({ tag: "hr" });
    pushSectionHeading(elements, section);
    for (const item of section.actions) {
      elements.push(commandSurfaceListItemElement(item, surface, {
        showCurrent: selectedSectionId === "agent" || selectedSectionId === "model" || selectedSectionId === "mode",
      }));
    }
  }

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

export interface ChannelConnectorSurfaceActionPayload {
  command: string | null;
  rawAction: string | null;
  actionKind: "nav" | "act" | "cmd" | null;
  bindingId: string | null;
  sessionKey: string | null;
  actionId: string | null;
  targetSectionId: string | null;
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
    };
  }
  const record = value as Record<string, unknown>;
  const rawAction = normalizeString(record.action) || normalizeString(record.command) || null;
  const parsed = parseSurfaceAction(rawAction || "");
  const command = normalizeString(record.command) || parsed.command;
  const explicitActionKind = normalizeString(record.surface_action_kind).toLowerCase();
  const sectionId = normalizeChannelConnectorCommandSurfaceSection(record.surface_section_id)
    || channelConnectorCommandSurfaceSectionFromCommand(command);
  return {
    command: command || null,
    rawAction,
    actionKind: explicitActionKind === "nav" || explicitActionKind === "act" || explicitActionKind === "cmd"
      ? explicitActionKind
      : parsed.actionKind,
    bindingId: normalizeString(record.binding_id) || normalizeString(record.bindingId) || null,
    sessionKey: normalizeString(record.session_key) || normalizeString(record.sessionKey) || null,
    actionId: normalizeString(record.surface_action_id) || normalizeString(record.surfaceActionId) || null,
    targetSectionId: sectionId,
  };
}

export function extractChannelConnectorCommandFromActionValue(value: unknown): string | null {
  return extractChannelConnectorSurfaceActionPayload(value).command;
}
