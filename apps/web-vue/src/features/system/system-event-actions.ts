import type { SystemEventItem } from "./system-event-types";

export interface SystemEventActionDescriptor {
  id: string;
  label: string;
  intent: "navigate" | "command" | "inspect";
}

export function buildSystemEventNextStepActions(
  event: SystemEventItem | null,
): SystemEventActionDescriptor[] {
  if (!event) {
    return [];
  }

  return [
    {
      id: `inspect-${event.id}`,
      label: "查看详情",
      intent: "inspect",
    },
  ];
}
