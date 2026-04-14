import assert from "node:assert/strict";
import { CONFIG_AUDIT_WHITELIST_FIELDS } from "./config-audit-fields.js";

export interface DiffConfigAuditChangesInput {
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

export interface ConfigAuditChangeRecord {
  module: string;
  path: string;
  label: string;
  before: unknown;
  after: unknown;
  changeType: "updated";
}

function getValueByPath(
  source: Record<string, unknown>,
  path: string,
): unknown {
  const segments = path.split(".");
  let current: unknown = source;

  for (const segment of segments) {
    if (current == null || typeof current !== "object") {
      return undefined;
    }
    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

function isSameValue(left: unknown, right: unknown): boolean {
  try {
    assert.deepStrictEqual(left, right);
    return true;
  } catch {
    return false;
  }
}

export function diffConfigAuditChanges({
  before,
  after,
}: DiffConfigAuditChangesInput): ConfigAuditChangeRecord[] {
  const changes: ConfigAuditChangeRecord[] = [];

  for (const field of CONFIG_AUDIT_WHITELIST_FIELDS) {
    const beforeValue = getValueByPath(before, field.path);
    const afterValue = getValueByPath(after, field.path);

    if (isSameValue(beforeValue, afterValue)) {
      continue;
    }

    changes.push({
      module: field.module,
      path: field.path,
      label: field.label,
      before: beforeValue,
      after: afterValue,
      changeType: "updated",
    });
  }

  return changes;
}
