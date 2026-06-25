import type {
  ChatMessageRole,
  ChatRunState,
  ChatSessionRow,
  ChatToolStatus,
  ChatTone,
} from "./types";

/** Map a run state to a tone + Chinese label. */
export function runStateTone(state: ChatRunState | string | null | undefined): {
  tone: ChatTone;
  label: string;
} {
  switch (state) {
    case "idle":
      return { tone: "mute", label: "空闲" };
    case "running":
      return { tone: "warn", label: "运行中" };
    case "streaming":
      return { tone: "warn", label: "流式中" };
    case "completed":
      return { tone: "ok", label: "已完成" };
    case "aborted":
      return { tone: "bad", label: "已中止" };
    case "error":
      return { tone: "bad", label: "错误" };
    default:
      return { tone: "mute", label: "状态未同步" };
  }
}

/** Map a tool-call status to a tone + label. */
export function toolStatusTone(
  status: ChatToolStatus | string | null | undefined,
): {
  tone: ChatTone;
  label: string;
} {
  switch (status) {
    case "running":
      return { tone: "warn", label: "运行中" };
    case "completed":
      return { tone: "ok", label: "完成" };
    case "error":
      return { tone: "bad", label: "错误" };
    default:
      return { tone: "info", label: status || "未知" };
  }
}

/** Chinese label for a message role. */
export function roleLabel(
  role: ChatMessageRole | string | null | undefined,
): string {
  switch (role) {
    case "user":
      return "用户";
    case "assistant":
      return "Agent";
    case "tool":
      return "工具";
    case "system":
      return "系统";
    default:
      return String(role || "未知");
  }
}

function readableRawToken(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized) return null;
  switch (normalized) {
    case "codex":
      return "Codex";
    case "claude":
    case "claude-code":
      return "Claude Code";
    case "opencode":
      return "OpenCode";
    case "openclaw":
      return "OpenClaw";
    case "main":
      return "默认 Agent";
    case "agent-chat":
      return "网页";
    case "webchat":
      return "兼容会话";
    case "dashboard":
      return "总览";
    case "tracevane":
      return "Tracevane";
    case "external":
      return "外部";
    case "system":
      return "系统";
    case "octo":
      return "Octo";
    case "feishu":
    case "feishu-live":
      return "飞书";
    case "wecom":
    case "wechat-work":
      return "企业微信";
    default:
      return normalized;
  }
}

/** Human-facing runtime target label. */
export function runtimeAgentLabel(session: Pick<ChatSessionRow, "agentId" | "runtimeTarget"> | null | undefined): string {
  if (!session) return "选择 Agent";
  const runtimeAgent = readableRawToken(session.runtimeTarget?.agent);
  if (session.runtimeTarget?.adapterKind === "native-cli") {
    return runtimeAgent ? `${runtimeAgent} CLI` : "本地 CLI";
  }
  if (session.runtimeTarget?.adapterKind === "openclaw-gateway") {
    return runtimeAgent ? `${runtimeAgent} 平台 Agent` : "OpenClaw 平台 Agent";
  }
  return readableRawToken(session.agentId) || "Agent";
}

/** Human-facing source label for Chat rows; never leak empty/unknown/raw debug terms. */
export function sessionSourceLabel(session: Pick<ChatSessionRow, "source" | "runtimeTarget" | "kind"> | null | undefined): string {
  if (!session) return "Tracevane";
  const origin = session.source?.originLabel?.trim();
  if (origin && origin !== "unknown") return origin;

  const adapter = session.runtimeTarget?.adapterKind;
  if (adapter === "native-cli") {
    const agent = readableRawToken(session.runtimeTarget?.agent);
    return agent ? `${agent} CLI` : "本地 CLI";
  }
  if (adapter === "openclaw-gateway") return "OpenClaw 平台";

  const channel = readableRawToken(session.source?.channel);
  const surface = readableRawToken(session.source?.surface);
  if (channel && surface && channel !== surface) return `${channel} / ${surface}`;
  if (channel) return channel;
  if (surface) return surface;
  if (session.kind === "observed_external") return "外部观察";
  if (session.kind === "system_internal") return "系统";
  return "Tracevane";
}

/** Boolean → tone + label for permission / connectivity flags. */
export function boolTone(value: boolean | null | undefined): {
  tone: ChatTone;
  label: string;
} {
  return value ? { tone: "ok", label: "是" } : { tone: "mute", label: "否" };
}

function looksLikeRawAgentKey(value: string): boolean {
  return /^agent:[^:]+:/.test(value) || /^[a-f0-9-]{24,}$/i.test(value);
}

function titleFromRawAgentKey(value: string): string | null {
  const parts = value.split(":").filter(Boolean);
  if (parts[0] !== "agent") return null;
  const agent = parts[1] || "Agent";
  const surface = parts[2] || "会话";
  if (surface === "agent-chat") return `${agent} · Agent 会话`;
  if (surface === "webchat") return `${agent} · Agent 会话（兼容）`;
  if (surface === "dashboard") return `${agent} · 总览触发`;
  if (surface === "main") return `${agent} · 默认会话`;
  return `${agent} · ${surface}`;
}

/** A readable title for a session row. Never expose raw agent/session keys as the primary title. */
export function sessionTitle(session: {
  label?: string | null;
  derivedTitle?: string | null;
  sessionId?: string | null;
  key?: string;
}): string {
  const derived = session.derivedTitle?.trim();
  if (derived && !looksLikeRawAgentKey(derived)) return derived;

  const label = session.label?.trim();
  if (label && !looksLikeRawAgentKey(label)) return label;
  if (label) {
    const parsed = titleFromRawAgentKey(label);
    if (parsed) return parsed;
  }

  const key = session.key?.trim();
  if (key) {
    const parsed = titleFromRawAgentKey(key);
    if (parsed) return parsed;
  }

  const sessionId = session.sessionId?.trim();
  if (sessionId && !looksLikeRawAgentKey(sessionId))
    return `会话 ${sessionId.slice(0, 8)}`;
  return "Agent 会话";
}

/** Whether a runtime state is useful enough to show as a primary list badge. */
export function shouldShowRunState(
  state: ChatRunState | string | null | undefined,
): boolean {
  return Boolean(state && state !== "unknown");
}
