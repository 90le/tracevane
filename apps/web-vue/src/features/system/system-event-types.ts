export type SystemEventSeverity = "info" | "warning" | "error" | "success";

export type SystemEventCategory =
  | "operations"
  | "audit"
  | "recovery"
  | "alerts";

import type { SystemEventRecord } from "../../../../../types/system";

export type SystemEventKind =
  | "diagnostic_issue"
  | "device_trust_pending"
  | "release_update_available"
  | "repair_succeeded"
  | "repair_failed"
  | "upgrade_started"
  | "upgrade_failed"
  | "device_trust_approved"
  | "device_trust_approve_failed"
  | "helper_repair_succeeded"
  | "helper_repair_failed";

export interface PersistedSystemEventPayload extends SystemEventRecord {
  dedupeKey?: string;
  persistedAt?: string;
  sourceEntity?: string;
  details?: Record<string, unknown>;
  action?: string;
}

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
