export const CONFIG_TAB_IDS = [
  "model",
  "providers",
  "security",
  "session",
  "session-policy",
  "gateway",
  "acp",
  "mcp-skills",
  "commands-hooks",
  "browser",
  "logging",
  "openclaw-domains",
] as const;

export type ConfigTabId = (typeof CONFIG_TAB_IDS)[number];

export interface ConfigWorkspaceSection {
  id: ConfigTabId;
  icon: string;
  label: string;
  copy: string;
}

export const DEFAULT_CONFIG_WORKSPACE_SECTIONS = [
  {
    id: "model",
    icon: "model",
    label: "Models",
    copy: "Default model, fallbacks, generation models, and agent defaults",
  },
  {
    id: "providers",
    icon: "providers",
    label: "Providers",
    copy: "Provider registry, API keys, model matrix, and request options",
  },
  {
    id: "security",
    icon: "security",
    label: "Security",
    copy: "Sandbox, tool permissions, and exec strategy",
  },
  {
    id: "session",
    icon: "session",
    label: "Sessions & Messaging",
    copy: "DM isolation, ack reactions, and summaries",
  },
  {
    id: "session-policy",
    icon: "session-policy",
    label: "Session Policy",
    copy: "Reset strategy, per-type overrides, DM scope, and thread bindings",
  },
  {
    id: "gateway",
    icon: "gateway",
    label: "Gateway",
    copy: "Port, auth, rate limiting, and Tailscale",
  },
  {
    id: "acp",
    icon: "acp",
    label: "ACP",
    copy: "External coding-session entry and allowed harnesses",
  },
  {
    id: "mcp-skills",
    icon: "mcp-skills",
    label: "MCP & Skill Runtime",
    copy: "MCP servers, skill loading roots, watcher, and runtime limits",
  },
  {
    id: "commands-hooks",
    icon: "commands-hooks",
    label: "Commands & Hooks",
    copy: "Native commands, skill toggles, and internal hooks",
  },
  {
    id: "browser",
    icon: "browser",
    label: "Browser",
    copy: "Chrome path, headless mode, and sandbox config",
  },
  {
    id: "logging",
    icon: "logging",
    label: "Logging",
    copy: "Log levels, file, and data redaction",
  },
  {
    id: "openclaw-domains",
    icon: "openclaw-domains",
    label: "OpenClaw Domains",
    copy: "Low-frequency schema domains not modeled by dedicated Studio tabs",
  },
] as const satisfies ReadonlyArray<ConfigWorkspaceSection>;

export function buildConfigWorkspaceSections(
  text: (zh: string, en: string) => string,
): ConfigWorkspaceSection[] {
  return DEFAULT_CONFIG_WORKSPACE_SECTIONS.map((section) => ({
    id: section.id,
    icon: section.icon,
    label:
      section.id === "model"
        ? text("全局配置", "Global Config")
        : section.id === "providers"
          ? text("模型供应商", section.label)
          : section.id === "security"
            ? text("沙盒与安全", section.label)
            : section.id === "session"
              ? text("会话与行为", section.label)
              : section.id === "session-policy"
                ? text("会话策略", section.label)
                : section.id === "gateway"
                  ? text("网关设置", section.label)
                  : section.id === "acp"
                    ? text("ACP", section.label)
                    : section.id === "mcp-skills"
                      ? text("MCP 与技能运行时", section.label)
                      : section.id === "commands-hooks"
                        ? text("命令与钩子", section.label)
                        : section.id === "browser"
                          ? text("浏览器", section.label)
                          : section.id === "logging"
                            ? text("日志设置", section.label)
                            : text("OpenClaw 域", section.label),
    copy:
      section.id === "model"
        ? text("全局默认模型、工作区、HEARTBEAT 和 Agent 运行默认值", "Global model defaults, workspace, HEARTBEAT, and agent runtime defaults")
        : section.id === "providers"
          ? text("供应商注册表、API Key、模型矩阵和请求参数", section.copy)
          : section.id === "security"
            ? text("Sandbox、工具权限和执行策略", section.copy)
            : section.id === "session"
              ? text("私聊隔离、确认反应和配置摘要", section.copy)
              : section.id === "session-policy"
                ? text("重置策略、按类型覆盖、DM 作用域和线程绑定", section.copy)
                : section.id === "gateway"
                  ? text("端口、认证、速率限制和 Tailscale", section.copy)
                  : section.id === "acp"
                    ? text("外部编码会话入口与允许执行器", section.copy)
                    : section.id === "mcp-skills"
                      ? text("MCP 服务器、技能加载目录、监听和运行限制", section.copy)
                      : section.id === "commands-hooks"
                        ? text("原生命令、技能开关和内部钩子", section.copy)
                        : section.id === "browser"
                          ? text(
                              "Chrome 路径、无头模式和沙盒配置",
                              section.copy,
                            )
                          : section.id === "logging"
                            ? text("日志级别、文件和数据脱敏", section.copy)
                            : text("未单独建模的低频 schema 顶层域", section.copy),
  }));
}
