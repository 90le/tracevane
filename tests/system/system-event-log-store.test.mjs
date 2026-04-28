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
const pathsModulePath = path.join(
  rootDir,
  "apps/api/modules/system/event-store-paths.ts",
);
const pathsModuleUrl = `${pathToFileURL(pathsModulePath).href}?t=${Date.now()}`;
const storeModulePath = path.join(
  rootDir,
  "apps/api/modules/system/event-log-store.ts",
);
const storeModuleUrl = `${pathToFileURL(storeModulePath).href}?t=${Date.now()}`;

function makeEvent(id, occurredAt) {
  return {
    id,
    kind: "test.event",
    category: "operations",
    severity: "info",
    occurredAt,
    title: `Event ${id}`,
    summary: `Summary ${id}`,
    status: "ok",
  };
}

function recentIso(offsetMs = 0) {
  return new Date(Date.now() + offsetMs).toISOString();
}

test("resolveSystemEventStorePaths returns jsonl and state file paths", async () => {
  const { resolveSystemEventStorePaths } = await import(pathsModuleUrl);

  const paths = resolveSystemEventStorePaths({
    stateDir: "/tmp/openclaw-state",
  });

  assert.deepEqual(paths, {
    eventsJsonlPath: "/tmp/openclaw-state/system-events.jsonl",
    eventStatePath: "/tmp/openclaw-state/system-events.state.json",
  });
});

test("append 后能读回最近事件并写入 jsonl/state 文件", async () => {
  const { createSystemEventLogStore } = await import(storeModuleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-log-store-"));

  const store = createSystemEventLogStore({ stateDir, maxRecords: 5 });
  store.append([makeEvent("a", recentIso(-1000))]);
  store.append([makeEvent("b", recentIso())]);

  assert.deepEqual(
    store.list(2).map((event) => event.id),
    ["b", "a"],
  );

  const eventsJsonlPath = path.join(stateDir, "system-events.jsonl");
  const eventStatePath = path.join(stateDir, "system-events.state.json");
  assert.equal(fs.existsSync(eventsJsonlPath), true);
  assert.equal(fs.existsSync(eventStatePath), true);

  const state = JSON.parse(fs.readFileSync(eventStatePath, "utf8"));
  assert.equal(state.totalRecords, 2);
});

test("retention 限制有效", async () => {
  const { createSystemEventLogStore } = await import(storeModuleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-log-store-"));

  const store = createSystemEventLogStore({ stateDir, maxRecords: 2 });
  store.append([makeEvent("a", recentIso(-2000))]);
  store.append([makeEvent("b", recentIso(-1000))]);
  store.append([makeEvent("c", recentIso())]);

  assert.deepEqual(
    store.list(10).map((event) => event.id),
    ["c", "b"],
  );

  const lines = fs
    .readFileSync(path.join(stateDir, "system-events.jsonl"), "utf8")
    .trim()
    .split("\n");
  assert.equal(lines.length, 2);
});

test("maxAgeDays 会裁剪过期历史并在重启后保留最近记录", async () => {
  const { createSystemEventLogStore } = await import(storeModuleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-log-store-"));

  const oldOccurredAt = new Date(
    Date.now() - 10 * 24 * 60 * 60 * 1000,
  ).toISOString();
  const freshOccurredAt = new Date().toISOString();
  fs.writeFileSync(
    path.join(stateDir, "system-events.jsonl"),
    `${JSON.stringify(makeEvent("old", oldOccurredAt))}\n${JSON.stringify(makeEvent("fresh", freshOccurredAt))}\n`,
    "utf8",
  );

  const store = createSystemEventLogStore({
    stateDir,
    maxRecords: 5,
    maxAgeDays: 7,
  });

  assert.deepEqual(
    store.list(10).map((event) => event.id),
    ["fresh"],
  );
});

test("corrupted tail line 安全忽略", async () => {
  const { createSystemEventLogStore } = await import(storeModuleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "event-log-store-"));

  const eventsJsonlPath = path.join(stateDir, "system-events.jsonl");
  const validLine = `${JSON.stringify(makeEvent("a", recentIso()))}\n`;
  fs.writeFileSync(eventsJsonlPath, `${validLine}{broken-json`, "utf8");

  const store = createSystemEventLogStore({ stateDir, maxRecords: 5 });

  assert.deepEqual(
    store.list(10).map((event) => event.id),
    ["a"],
  );
});
