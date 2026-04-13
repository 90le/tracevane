import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const writerModulePath = path.join(
  rootDir,
  "apps/api/modules/system/event-writer.ts",
);
const writerModuleUrl = `${pathToFileURL(writerModulePath).href}?t=${Date.now()}`;

function makePersistedEvent(id, overrides = {}) {
  return {
    id,
    kind: "diagnostic_issue",
    category: "alerts",
    severity: "warning",
    occurredAt: "2026-04-13T09:00:00.000Z",
    title: `Event ${id}`,
    summary: `Summary ${id}`,
    status: "pending",
    dedupeKey: `diagnostics:${id}`,
    persistedAt: "2026-04-13T09:00:01.000Z",
    sourceEntity: "system:diagnostics",
    details: { scope: "test" },
    action: "snapshot",
    ...overrides,
  };
}

test("persistActionEvent 会把 action 事件写入持久化 store", async () => {
  const { createSystemEventWriter } = await import(writerModuleUrl);
  const stateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "system-event-writer-"),
  );

  const writer = createSystemEventWriter({ stateDir, maxRecords: 10 });
  writer.persistActionEvent(
    makePersistedEvent("action-1", {
      kind: "repair_succeeded",
      severity: "success",
      status: "succeeded",
      dedupeKey: "action:bootstrap-repair",
      action: "bootstrap-repair",
      sourceEntity: "system:bootstrap",
    }),
  );

  const events = writer.listPersistedEvents(10);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "action-1");

  const raw = fs
    .readFileSync(path.join(stateDir, "system-events.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.equal(raw.length, 1);
  assert.equal(raw[0].id, "action-1");
});

test("persistStateChanges 仅在 dedupeKey 状态变化时持久化，并跨重启复用 state-file dedupe memory", async () => {
  const { createSystemEventWriter } = await import(writerModuleUrl);
  const stateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "system-event-writer-"),
  );

  const writer = createSystemEventWriter({ stateDir, maxRecords: 10 });
  const base = makePersistedEvent("snapshot-1", {
    dedupeKey: "gateway:rpc",
    sourceEntity: "system:diagnostics",
  });

  writer.persistStateChanges([base]);
  writer.persistStateChanges([{ ...base, id: "snapshot-2" }]);
  writer.persistStateChanges([
    { ...base, id: "snapshot-3", status: "resolved", severity: "success" },
  ]);

  assert.deepEqual(
    writer.listPersistedEvents(10).map((event) => event.id),
    ["snapshot-3", "snapshot-1"],
  );

  const writerReloaded = createSystemEventWriter({ stateDir, maxRecords: 10 });
  writerReloaded.persistStateChanges([
    { ...base, id: "snapshot-4", status: "resolved", severity: "success" },
  ]);

  assert.deepEqual(
    writerReloaded.listPersistedEvents(10).map((event) => event.id),
    ["snapshot-3", "snapshot-1"],
  );
});

test("persistStateChanges 在同一批次内不会重复写入相同 dedupeKey 和 status", async () => {
  const { createSystemEventWriter } = await import(writerModuleUrl);
  const stateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "system-event-writer-"),
  );

  const writer = createSystemEventWriter({ stateDir, maxRecords: 10 });
  const base = makePersistedEvent("batch-1", {
    dedupeKey: "bootstrap:pending",
    sourceEntity: "system:bootstrap",
  });

  writer.persistStateChanges([base, { ...base, id: "batch-2" }]);

  assert.deepEqual(
    writer.listPersistedEvents(10).map((event) => event.id),
    ["batch-1"],
  );
});
