import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const summaryModulePath = path.join(
  rootDir,
  "apps/api/modules/system/event-summary.ts",
);
const summaryModuleUrl = `${pathToFileURL(summaryModulePath).href}?t=${Date.now()}`;
const normalizerModulePath = path.join(
  rootDir,
  "apps/api/modules/system/event-normalizer.ts",
);
const normalizerModuleUrl = `${pathToFileURL(normalizerModulePath).href}?t=${Date.now()}`;

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

test("buildSystemEventSummaryCards counts failures, pending audit, and recoveries", async () => {
  const { buildSystemEventSummaryCards } = await import(summaryModuleUrl);

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

test("buildSystemEventSummaryCards sorts most recent events first", async () => {
  const { buildSystemEventSummaryCards } = await import(summaryModuleUrl);

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

test("buildSystemEventSummaryCardsFromHistory 基于 unified merged 列表统计", async () => {
  const { buildSystemEventSummaryCardsFromHistory } = await import(
    summaryModuleUrl
  );

  const cards = buildSystemEventSummaryCardsFromHistory({
    persistedEvents: [
      makeEvent({
        id: "persisted-failed",
        dedupeKey: "diagnostics:gateway-rpc",
        action: "snapshot",
        status: "failed",
        severity: "error",
        occurredAt: "2026-04-13T08:00:00.000Z",
      }),
      makeEvent({
        id: "action-repair",
        dedupeKey: "action:helper-repair:ok",
        action: "helper-repair",
        kind: "helper_repair_succeeded",
        category: "operations",
        severity: "success",
        status: "succeeded",
        occurredAt: "2026-04-13T10:00:00.000Z",
      }),
    ],
    liveSnapshotEvents: [
      makeEvent({
        id: "live-resolved",
        dedupeKey: "diagnostics:gateway-rpc",
        action: "snapshot",
        category: "recovery",
        severity: "success",
        status: "resolved",
        occurredAt: "2026-04-13T09:00:00.000Z",
      }),
    ],
    limit: 10,
  });

  assert.equal(cards.recentFailures.count, 0);
  assert.equal(cards.recentRecoveries.count, 2);
  assert.deepEqual(
    cards.recentRecoveries.items.map((item) => item.id),
    ["action-repair", "live-resolved"],
  );
});

test("buildSystemActionEvents keeps helper repair success distinct", async () => {
  const { buildSystemActionEvents } = await import(normalizerModuleUrl);

  const [event] = buildSystemActionEvents({
    action: "helper-repair",
    ok: true,
    occurredAt: "2026-04-13T10:00:00.000Z",
  });

  assert.equal(event.kind, "helper_repair_succeeded");
  assert.equal(event.status, "succeeded");
  assert.equal(event.severity, "success");
});
