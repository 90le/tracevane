import type {
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
