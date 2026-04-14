import type { SystemPersistedEventRecord } from "../system/event-types.js";
import { CONFIG_AUDIT_WHITELIST_FIELDS } from "./config-audit-fields.js";
import type { ConfigAuditChangeRecord } from "./config-audit-diff.js";

export interface BuildConfigAuditEventsInput {
  changes: ConfigAuditChangeRecord[];
  occurredAt?: string;
}

function createEventId(
  path: string,
  occurredAt: string,
  index: number,
): string {
  return `config-change-${path}-${occurredAt}-${index}`;
}

function toActionKey(path: string): string {
  const matched = CONFIG_AUDIT_WHITELIST_FIELDS.find(
    (entry) => entry.path === path,
  );
  return matched?.actionKey || `${path}.update`;
}

export function buildConfigAuditEvents({
  changes,
  occurredAt,
}: BuildConfigAuditEventsInput): SystemPersistedEventRecord[] {
  const eventOccurredAt = occurredAt || new Date().toISOString();
  if (!Array.isArray(changes) || changes.length === 0) {
    return [];
  }

  return changes.map((change, index) => ({
    id: createEventId(change.path, eventOccurredAt, index),
    kind: "config_change",
    category: "audit",
    severity: "info",
    occurredAt: eventOccurredAt,
    title: `配置变更：${change.label}`,
    summary: `${change.path} 已更新`,
    status: "updated",
    sourceModule: "config",
    dedupeKey: `config-change:${change.path}`,
    persistedAt: eventOccurredAt,
    sourceEntity: `config:${change.path}`,
    details: {
      module: change.module,
      path: change.path,
      label: change.label,
      before: change.before,
      after: change.after,
      changeType: change.changeType,
    },
    action: toActionKey(change.path),
  }));
}
