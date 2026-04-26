export const CONFIG_TAB_IDS = [
  "model",
  "security",
  "session",
  "session-policy",
  "providers",
  "gateway",
  "acp",
  "mcp-skills",
  "commands-hooks",
  "appearance",
  "logging",
  "browser",
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
    icon: "🧠",
    label: "Models & Agents",
    copy: "Primary models, fallback chains, and execution defaults",
  },
  {
    id: "security",
    icon: "🛡️",
    label: "Sandbox & Security",
    copy: "Sandbox, tool permissions, and exec strategy",
  },
  {
    id: "session",
    icon: "💬",
    label: "Sessions & Messaging",
    copy: "DM isolation, ack reactions, and summaries",
  },
  {
    id: "session-policy",
    icon: "🔄",
    label: "Session Policy",
    copy: "Reset strategy, per-type overrides, DM scope, and thread bindings",
  },
  {
    id: "providers",
    icon: "🏗️",
    label: "Model Providers",
    copy: "Provider registry and model matrix",
  },
  {
    id: "gateway",
    icon: "🌐",
    label: "Gateway",
    copy: "Port, auth, rate limiting, and Tailscale",
  },
  {
    id: "acp",
    icon: "🔗",
    label: "ACP",
    copy: "External coding-session entry and allowed harnesses",
  },
  {
    id: "mcp-skills",
    icon: "🧰",
    label: "MCP & Skills",
    copy: "MCP runtime, skill loading, install policy, and skill entries",
  },
  {
    id: "commands-hooks",
    icon: "⚡",
    label: "Commands & Hooks",
    copy: "Native commands, skill toggles, and internal hooks",
  },
  {
    id: "appearance",
    icon: "🎨",
    label: "Appearance",
    copy: "Light, dark, and follow system",
  },
  {
    id: "logging",
    icon: "📝",
    label: "Logging",
    copy: "Log levels, file, and data redaction",
  },
  {
    id: "browser",
    icon: "🌐",
    label: "Browser",
    copy: "Chrome path, headless mode, and sandbox config",
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
        ? text("模型与 Agent", section.label)
        : section.id === "security"
          ? text("沙盒与安全", section.label)
          : section.id === "session"
            ? text("会话与行为", section.label)
            : section.id === "session-policy"
              ? text("会话策略", section.label)
              : section.id === "providers"
                ? text("模型供应商", section.label)
                : section.id === "gateway"
                  ? text("网关设置", section.label)
                  : section.id === "acp"
                    ? text("ACP", section.label)
                    : section.id === "mcp-skills"
                      ? text("MCP 与技能", section.label)
                      : section.id === "commands-hooks"
                        ? text("命令与钩子", section.label)
                        : section.id === "appearance"
                          ? text("界面主题", section.label)
                          : section.id === "logging"
                            ? text("日志设置", section.label)
                            : text("浏览器", section.label),
    copy:
      section.id === "model"
        ? text("主模型、回退链和默认执行参数", section.copy)
        : section.id === "security"
          ? text("Sandbox、工具权限和执行策略", section.copy)
          : section.id === "session"
            ? text("私聊隔离、确认反应和配置摘要", section.copy)
            : section.id === "session-policy"
              ? text("重置策略、按类型覆盖、DM 作用域和线程绑定", section.copy)
              : section.id === "providers"
                ? text("供应商注册表和模型矩阵", section.copy)
                : section.id === "gateway"
                  ? text("端口、认证、速率限制和 Tailscale", section.copy)
                  : section.id === "acp"
                    ? text("外部编码会话入口与允许执行器", section.copy)
                    : section.id === "mcp-skills"
                      ? text("MCP 运行时、技能加载、安装策略和技能条目", section.copy)
                      : section.id === "commands-hooks"
                        ? text("原生命令、技能开关和内部钩子", section.copy)
                        : section.id === "appearance"
                          ? text("浅色、深色和跟随系统", section.copy)
                          : section.id === "logging"
                            ? text("日志级别、文件和数据脱敏", section.copy)
                            : text(
                                "Chrome 路径、无头模式和沙盒配置",
                                section.copy,
                              ),
  }));
}
