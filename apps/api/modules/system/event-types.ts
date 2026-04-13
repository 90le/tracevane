export type SystemEventSeverity = "info" | "warning" | "error" | "success";

export type SystemEventCategory =
  | "operations"
  | "audit"
  | "recovery"
  | "alerts";

export interface SystemEventRecord {
  id: string;
  kind: string;
  category: SystemEventCategory;
  severity: SystemEventSeverity;
  occurredAt: string;
  title: string;
  summary: string;
  status: string;
}
