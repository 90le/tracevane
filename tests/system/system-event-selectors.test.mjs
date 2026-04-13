import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

const storeModulePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-event-store.ts",
);
const actionsModulePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-event-actions.ts",
);
const selectorsModulePath = path.join(
  rootDir,
  "apps/web-vue/src/features/system/system-event-selectors.ts",
);

const storeModuleUrl = `${pathToFileURL(storeModulePath).href}?t=${Date.now()}`;
const actionsModuleUrl = `${pathToFileURL(actionsModulePath).href}?t=${Date.now()}`;
const selectorsModuleUrl = `${pathToFileURL(selectorsModulePath).href}?t=${Date.now()}`;

function createEvent(id, occurredAt, overrides = {}) {
  return {
    id,
    kind: "diagnostic_issue",
    category: "alerts",
    severity: "error",
    occurredAt,
    title: id,
    ...overrides,
  };
}

test("system event store exposes events, selectedEventId, groups, selectedEvent, and hydrate", async () => {
  const { useSystemEventStore } = await import(storeModuleUrl);

  const store = useSystemEventStore();
  const first = createEvent("e1", "2026-04-13T10:00:00.000Z");
  const second = createEvent("e2", "2026-04-12T10:00:00.000Z", {
    severity: "warning",
    category: "recovery",
    kind: "device_trust_pending",
  });

  store.hydrate([first, second]);

  assert.deepEqual(
    store.events.value.map((event) => event.id),
    ["e1", "e2"],
  );
  assert.equal(store.selectedEventId.value, "e1");
  assert.equal(store.selectedEvent.value?.id, "e1");
  assert.equal(store.groups.value.length, 2);
  assert.equal(store.groups.value[0].date, "2026-04-13");
  assert.deepEqual(
    store.groups.value[0].items.map((item) => item.id),
    ["e1"],
  );
});

test("system event store keeps selected event when hydrate contains selected id", async () => {
  const { useSystemEventStore } = await import(storeModuleUrl);

  const store = useSystemEventStore();
  const first = createEvent("keep", "2026-04-13T10:00:00.000Z");
  const second = createEvent("other", "2026-04-13T09:00:00.000Z", {
    severity: "info",
    category: "operations",
    kind: "release_update_available",
  });

  store.hydrate([first, second]);
  store.selectedEventId.value = "other";
  store.hydrate([second, first]);

  assert.equal(store.selectedEventId.value, "other");
  assert.equal(store.selectedEvent.value?.id, "other");
});

test("system event store maps persisted payload sourceEntity and never maps status into sourceModule", async () => {
  const { useSystemEventStore } = await import(storeModuleUrl);

  const store = useSystemEventStore();
  store.hydrate([
    {
      id: "persisted-1",
      kind: "device_trust_pending",
      category: "audit",
      severity: "warning",
      occurredAt: "2026-04-13T08:00:00.000Z",
      title: "设备信任待审批",
      summary: "存在 1 条待审批请求",
      status: "pending",
      sourceEntity: "system:device-trust",
      dedupeKey: "device-trust:pending",
      persistedAt: "2026-04-13T08:00:01.000Z",
      details: { pendingCount: 1 },
      action: "snapshot",
    },
  ]);

  assert.equal(store.events.value[0].sourceModule, "device-trust");
  assert.notEqual(store.events.value[0].sourceModule, "pending");
});

test("system event selectors build summary items from backend summary payload", async () => {
  const { buildSystemEventSummaryItems } = await import(selectorsModuleUrl);

  const text = (zh, _en) => zh;
  const items = buildSystemEventSummaryItems({
    summary: {
      recentFailures: { count: 2, items: [] },
      pendingAuditItems: { count: 3, items: [] },
      recentRecoveries: { count: 1, items: [] },
    },
    filteredEvents: [
      createEvent("e1", "2026-04-13T10:00:00.000Z"),
      createEvent("e2", "2026-04-13T09:00:00.000Z"),
    ],
    text,
    summaryCards: [
      { key: "current", label: "当前事件" },
      { key: "failures", label: "最近失败" },
      { key: "pending", label: "待处理审计" },
      { key: "recoveries", label: "最近恢复" },
    ],
  });

  assert.deepEqual(items, [
    { label: "当前事件", value: "2" },
    { label: "最近失败", value: "2" },
    { label: "待处理审计", value: "3" },
    { label: "最近恢复", value: "1" },
  ]);
});

test("system event actions export next-step descriptors by event kind", async () => {
  const { buildSystemEventNextStepActions } = await import(actionsModuleUrl);

  const releaseActions = buildSystemEventNextStepActions(
    createEvent("release", "2026-04-13T10:00:00.000Z", {
      kind: "release_update_available",
      category: "operations",
      severity: "info",
    }),
  );
  assert.ok(
    releaseActions.some((action) => action.intent === "open-system-section"),
  );

  const trustActions = buildSystemEventNextStepActions(
    createEvent("trust", "2026-04-13T10:00:00.000Z", {
      kind: "device_trust_pending",
      category: "recovery",
      severity: "warning",
    }),
  );
  assert.ok(trustActions.some((action) => action.intent === "open-terminal"));

  const issueActions = buildSystemEventNextStepActions(
    createEvent("issue", "2026-04-13T10:00:00.000Z", {
      kind: "diagnostic_issue",
      category: "alerts",
      severity: "error",
    }),
  );
  assert.ok(issueActions.some((action) => action.intent === "refresh"));
  assert.equal(
    issueActions.some((action) => action.intent === "open-terminal"),
    false,
  );

  const approveFailedActions = buildSystemEventNextStepActions(
    createEvent("approve-failed", "2026-04-13T10:00:00.000Z", {
      kind: "device_trust_approve_failed",
      category: "operations",
      severity: "error",
    }),
  );
  assert.ok(
    approveFailedActions.some((action) => action.intent === "open-terminal"),
  );
});
