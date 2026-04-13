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

const storeModuleUrl = `${pathToFileURL(storeModulePath).href}?t=${Date.now()}`;
const actionsModuleUrl = `${pathToFileURL(actionsModulePath).href}?t=${Date.now()}`;

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

test("system event actions export minimal next-step descriptor structure", async () => {
  const { buildSystemEventNextStepActions } = await import(actionsModuleUrl);

  const actions = buildSystemEventNextStepActions(
    createEvent("e1", "2026-04-13T10:00:00.000Z", {
      kind: "device_trust_pending",
      category: "recovery",
      severity: "warning",
    }),
  );

  assert.ok(Array.isArray(actions));
  assert.ok(actions.length > 0);
  const first = actions[0];
  assert.equal(typeof first.id, "string");
  assert.equal(typeof first.label, "string");
  assert.ok(first.label.length > 0);
  assert.equal(typeof first.intent, "string");
});
