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
export function toolStatusTone(status: ChatToolStatus | string | null | undefined): {
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
export function roleLabel(role: ChatMessageRole | string | null | undefined): string {
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
export function boolTone(value: boolean | null | undefined): { tone: ChatTone; label: string } {
  return value ? { tone: "ok", label: "是" } : { tone: "mute", label: "否" };
}

/** A readable title for a session row. */
export function sessionTitle(session: {
  label?: string | null;
  derivedTitle?: string | null;
  sessionId?: string | null;
  key?: string;
}): string {
  return (
    session.label?.trim() ||
    session.derivedTitle?.trim() ||
    session.sessionId?.trim() ||
    session.key ||
    "会话"
  );
}
