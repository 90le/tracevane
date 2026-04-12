export type ConfigTabId =
  | 'model'
  | 'security'
  | 'session'
  | 'session-policy'
  | 'providers'
  | 'gateway'
  | 'acp'
  | 'commands-hooks'
  | 'appearance'
  | 'logging'
  | 'browser';

export interface ConfigWorkspaceSection {
  id: ConfigTabId;
  icon: string;
  label: string;
  copy: string;
}

export function buildConfigWorkspaceSections(
  text: (zh: string, en: string) => string,
): ConfigWorkspaceSection[] {
  return [
    { id: 'model', icon: '🧠', label: text('模型与 Agent', 'Models & Agents'), copy: text('主模型、回退链和默认执行参数', 'Primary models, fallback chains, and execution defaults') },
    { id: 'security', icon: '🛡️', label: text('沙盒与安全', 'Sandbox & Security'), copy: text('Sandbox、工具权限和执行策略', 'Sandbox, tool permissions, and exec strategy') },
    { id: 'session', icon: '💬', label: text('会话与行为', 'Sessions & Messaging'), copy: text('私聊隔离、确认反应和配置摘要', 'DM isolation, ack reactions, and summaries') },
    { id: 'session-policy', icon: '🔄', label: text('会话策略', 'Session Policy'), copy: text('重置策略、按类型覆盖、DM 作用域和线程绑定', 'Reset strategy, per-type overrides, DM scope, and thread bindings') },
    { id: 'providers', icon: '🏗️', label: text('模型供应商', 'Model Providers'), copy: text('供应商注册表和模型矩阵', 'Provider registry and model matrix') },
    { id: 'gateway', icon: '🌐', label: text('网关设置', 'Gateway'), copy: text('端口、认证、速率限制和 Tailscale', 'Port, auth, rate limiting, and Tailscale') },
    { id: 'acp', icon: '🔗', label: text('ACP', 'ACP'), copy: text('外部编码会话入口与允许执行器', 'External coding-session entry and allowed harnesses') },
    { id: 'commands-hooks', icon: '⚡', label: text('命令与钩子', 'Commands & Hooks'), copy: text('原生命令、技能开关和内部钩子', 'Native commands, skill toggles, and internal hooks') },
    { id: 'appearance', icon: '🎨', label: text('界面主题', 'Appearance'), copy: text('浅色、深色和跟随系统', 'Light, dark, and follow system') },
    { id: 'logging', icon: '📝', label: text('日志设置', 'Logging'), copy: text('日志级别、文件和数据脱敏', 'Log levels, file, and data redaction') },
    { id: 'browser', icon: '🌐', label: text('浏览器', 'Browser'), copy: text('Chrome 路径、无头模式和沙盒配置', 'Chrome path, headless mode, and sandbox config') },
  ];
}
