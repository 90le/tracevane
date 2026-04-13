export type SystemEventSeverity = "info" | "warning" | "error" | "success";

export type SystemEventCategory =
  | "operations"
  | "audit"
  | "recovery"
  | "alerts";

export type SystemEventKind =
  | "diagnostic_issue"
  | "device_trust_pending"
  | "release_update_available";

export interface SystemEventItem {
  id: string;
  kind: SystemEventKind;
  category: SystemEventCategory;
  severity: SystemEventSeverity;
  occurredAt: string;
  title: string;
  summary?: string;
  sourceModule?: string;
}

export interface SystemEventTimelineGroup {
  date: string;
  items: SystemEventItem[];
}
