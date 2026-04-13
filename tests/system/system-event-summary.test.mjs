import test from "node:test";
import assert from "node:assert/strict";

import { buildSystemEventSummaryCards } from "../../dist/apps/api/modules/system/event-summary.js";
import { buildSystemActionEvents } from "../../dist/apps/api/modules/system/event-normalizer.js";

function makeEvent(overrides = {}) {
  return {
    id: "evt-1",
    kind: "repair_failed",
    category: "operations",
    severity: "error",
    occurredAt: "2026-04-13T08:00:00.000Z",
    title: "操作失败",
    summary: "示例失败事件",
    status: "failed",
    ...overrides,
  };
}

test("buildSystemEventSummaryCards counts failures, pending audit, and recoveries", () => {
  const cards = buildSystemEventSummaryCards([
    makeEvent({
      id: "f-1",
      kind: "repair_failed",
      severity: "error",
      status: "failed",
    }),
    makeEvent({
      id: "a-1",
      kind: "device_trust_pending",
      category: "audit",
      severity: "warning",
      status: "pending",
    }),
    makeEvent({
      id: "r-1",
      kind: "repair_succeeded",
      category: "recovery",
      severity: "success",
      status: "succeeded",
    }),
  ]);

  assert.equal(cards.recentFailures.count, 1);
  assert.equal(cards.pendingAuditItems.count, 1);
  assert.equal(cards.recentRecoveries.count, 1);
  assert.equal(cards.recentFailures.items[0].id, "f-1");
  assert.equal(cards.pendingAuditItems.items[0].id, "a-1");
  assert.equal(cards.recentRecoveries.items[0].id, "r-1");
});

test("buildSystemEventSummaryCards sorts most recent events first", () => {
  const cards = buildSystemEventSummaryCards([
    makeEvent({ id: "old-failure", occurredAt: "2026-04-13T08:00:00.000Z" }),
    makeEvent({ id: "new-failure", occurredAt: "2026-04-13T09:00:00.000Z" }),
  ]);

  assert.equal(cards.recentFailures.count, 2);
  assert.deepEqual(
    cards.recentFailures.items.map((item) => item.id),
    ["new-failure", "old-failure"],
  );
});

test("buildSystemActionEvents keeps helper repair success distinct", () => {
  const [event] = buildSystemActionEvents({
    action: "helper-repair",
    ok: true,
    occurredAt: "2026-04-13T10:00:00.000Z",
  });

  assert.equal(event.kind, "helper_repair_succeeded");
  assert.equal(event.status, "succeeded");
  assert.equal(event.severity, "success");
});
