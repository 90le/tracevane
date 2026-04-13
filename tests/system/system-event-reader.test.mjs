import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const modulePath = path.join(
  rootDir,
  "apps/api/modules/system/event-reader.ts",
);
const moduleUrl = `${pathToFileURL(modulePath).href}?t=${Date.now()}`;

function makeEvent(id, overrides = {}) {
  return {
    id,
    kind: "diagnostic_issue",
    category: "alerts",
    severity: "warning",
    occurredAt: "2026-04-13T08:00:00.000Z",
    title: id,
    summary: id,
    status: "pending",
    dedupeKey: `dedupe:${id}`,
    action: "snapshot",
    ...overrides,
  };
}

test("mergeSystemEventHistory 用 live snapshot 覆盖过时 persisted snapshot", async () => {
  const { mergeSystemEventHistory } = await import(moduleUrl);

  const merged = mergeSystemEventHistory({
    persistedEvents: [
      makeEvent("persisted-old", {
        dedupeKey: "diagnostics:gateway-rpc",
        occurredAt: "2026-04-13T08:00:00.000Z",
        status: "failed",
      }),
    ],
    liveSnapshotEvents: [
      makeEvent("live-new", {
        dedupeKey: "diagnostics:gateway-rpc",
        occurredAt: "2026-04-13T09:00:00.000Z",
        status: "resolved",
        category: "recovery",
        severity: "success",
      }),
    ],
    limit: 20,
  });

  assert.equal(merged.length, 1);
  assert.equal(merged[0].id, "live-new");
  assert.equal(merged[0].status, "resolved");
});

test("mergeSystemEventHistory 保留 action 持久化事件并按时间倒序+limit 输出", async () => {
  const { mergeSystemEventHistory } = await import(moduleUrl);

  const merged = mergeSystemEventHistory({
    persistedEvents: [
      makeEvent("action-event", {
        dedupeKey: "bootstrap:pending",
        action: "bootstrap-repair",
        occurredAt: "2026-04-13T10:00:00.000Z",
        category: "operations",
        severity: "success",
        status: "succeeded",
      }),
      makeEvent("persisted-older", {
        dedupeKey: "bootstrap:pending",
        action: "snapshot",
        occurredAt: "2026-04-13T08:00:00.000Z",
      }),
    ],
    liveSnapshotEvents: [
      makeEvent("live-latest", {
        dedupeKey: "bootstrap:pending",
        action: "snapshot",
        occurredAt: "2026-04-13T09:00:00.000Z",
        category: "recovery",
        severity: "success",
        status: "resolved",
      }),
    ],
    limit: 2,
  });

  assert.deepEqual(
    merged.map((event) => event.id),
    ["action-event", "live-latest"],
  );
});
