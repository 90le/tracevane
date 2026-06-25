import type {
  ChatMessageRole,
  ChatRunState,
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
      return { tone: "info", label: state || "未知" };
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
