import type { SystemEventItem } from "./system-event-types";

export interface SystemEventActionDescriptor {
  id: string;
  label: string;
  intent:
    | "navigate"
    | "command"
    | "refresh"
    | "open-terminal"
    | "open-system-section";
}

export function buildSystemEventNextStepActions(
  event: SystemEventItem | null,
): SystemEventActionDescriptor[] {
  if (!event) {
    return [];
  }

  const actions: SystemEventActionDescriptor[] = [];

  if (event.kind === "diagnostic_issue") {
    actions.push({
      id: `refresh-${event.id}`,
      label: "刷新诊断",
      intent: "refresh",
    });
    return actions;
  }

  if (
    event.kind === "device_trust_pending" ||
    event.kind === "device_trust_approve_failed" ||
    event.kind === "helper_repair_failed"
  ) {
    actions.push({
      id: `terminal-${event.id}`,
      label: "去终端处理",
      intent: "open-terminal",
    });
    return actions;
  }

  actions.push({
    id: `section-${event.id}`,
    label: "打开系统升级",
    intent: "open-system-section",
  });
  return actions;
}
