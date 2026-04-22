import type {
  TerminalSessionSource,
  TerminalSessionControlState,
  TerminalSessionStatus,
} from "../../../../../types/terminal";

export interface TerminalSessionStatusSummary {
  tone: "success" | "warning" | "muted";
  labelZh: string;
  labelEn: string;
}

export interface TerminalTakeoverSummary {
  canTakeover: boolean;
  labelZh: string;
  labelEn: string;
}

export interface TerminalSessionSourceSummary {
  labelZh: string;
  labelEn: string;
}

export interface TerminalSessionDisplayTitle {
  labelZh: string;
  labelEn: string;
}

export function buildTerminalSessionStatusSummary(input: {
  status: TerminalSessionStatus;
  controlState: TerminalSessionControlState;
  canResume: boolean;
}): TerminalSessionStatusSummary {
  if (input.status === "running" && input.controlState === "controller") {
    return {
      tone: "success",
      labelZh: "控制中",
      labelEn: "Live control",
    };
  }

  if (input.status === "running") {
    return {
      tone: "success",
      labelZh: "运行中",
      labelEn: "Running",
    };
  }

  if (input.status === "failed") {
    return {
      tone: "warning",
      labelZh: "失败",
      labelEn: "Failed",
    };
  }

  if (input.status === "lost") {
    return {
      tone: "warning",
      labelZh: "连接丢失",
      labelEn: "Lost",
    };
  }

  if (input.canResume) {
    return {
      tone: "warning",
      labelZh: "可恢复",
      labelEn: "Resume available",
    };
  }

  return {
    tone: "muted",
    labelZh: "已结束",
    labelEn: "Completed",
  };
}

export function buildTerminalTakeoverSummary(input: {
  controlState: TerminalSessionControlState;
}): TerminalTakeoverSummary {
  if (input.controlState === "controller") {
    return {
      canTakeover: false,
      labelZh: "当前设备控制",
      labelEn: "Controlled here",
    };
  }

  return {
    canTakeover: true,
    labelZh: "请求接管",
    labelEn: "Take over",
  };
}

export function buildTerminalSessionSourceSummary(
  source: TerminalSessionSource,
): TerminalSessionSourceSummary {
  switch (source) {
    case "system_action":
      return {
        labelZh: "系统动作",
        labelEn: "System action",
      };
    case "linked_context":
      return {
        labelZh: "关联上下文",
        labelEn: "Linked context",
      };
    case "system-handoff":
      return {
        labelZh: "系统交接",
        labelEn: "System handoff",
      };
    default:
      return {
        labelZh: "手动启动",
        labelEn: "Manual",
      };
  }
}

function looksLikeGeneratedTerminalTitle(title: string): boolean {
  return /^terminal[\s:-]/i.test(title) || /^shell[\s:-]/i.test(title);
}

function shrinkTerminalToken(value: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (normalized.length <= 12) return normalized;
  return normalized.slice(0, 10);
}

export function buildTerminalSessionDisplayTitle(input: {
  title: string;
  sessionId: string;
}): TerminalSessionDisplayTitle {
  const title = String(input.title || "").trim();
  const sessionId = String(input.sessionId || "").trim();

  if (!title || title === sessionId) {
    return {
      labelZh: "终端",
      labelEn: "Shell",
    };
  }

  if (title === "新终端会话") {
    return {
      labelZh: "终端",
      labelEn: "Shell",
    };
  }

  if (looksLikeGeneratedTerminalTitle(title)) {
    const token = shrinkTerminalToken(
      title
        .replace(/^terminal[\s:-]*/i, "")
        .replace(/^shell[\s:-]*/i, ""),
    );
    if (!token) {
      return {
        labelZh: "终端",
        labelEn: "Shell",
      };
    }
    return {
      labelZh: `终端 ${token}`,
      labelEn: `Shell ${token}`,
    };
  }

  return {
    labelZh: title,
    labelEn: title,
  };
}
