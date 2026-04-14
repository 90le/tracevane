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
const storeModulePath = path.join(
  rootDir,
  "apps/api/modules/terminal/terminal-session-descriptor-store.ts",
);

function makeDescriptor(overrides = {}) {
  const sessionId = overrides.sessionId || "term-default";
  return {
    sessionId,
    title: `Terminal ${sessionId}`,
    source: "manual",
    sourceModule: "terminal",
    sourceAction: "manual.open",
    originRoute: "/terminal",
    status: "running",
    controllerClientId: null,
    observerClientIds: [],
    createdAt: "2026-04-14T10:00:00.000Z",
    lastActiveAt: "2026-04-14T10:00:00.000Z",
    lastAttachedAt: null,
    canResume: true,
    resumeKey: null,
    handoffContext: null,
    recentOutputSummary: null,
    controlState: "observer",
    observerCount: 0,
    updatedAt: "2026-04-14T10:00:00.000Z",
    ...overrides,
  };
}

test("upsert 会写入 terminal-sessions.json 且支持 get", async () => {
  const stateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "terminal-desc-store-"),
  );
  const moduleUrl = `${pathToFileURL(storeModulePath).href}?t=${Date.now()}`;
  const { createTerminalSessionDescriptorStore } = await import(moduleUrl);

  const store = createTerminalSessionDescriptorStore({ stateDir });
  const descriptor = makeDescriptor({
    sessionId: "term-write",
    status: "detached",
    canResume: true,
    updatedAt: "2026-04-14T10:00:01.000Z",
  });

  store.upsert(descriptor);

  const filePath = path.join(stateDir, "terminal-sessions.json");
  assert.equal(fs.existsSync(filePath), true);

  const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(Array.isArray(raw.items), true);
  assert.equal(raw.items.length, 1);
  assert.equal(raw.items[0].sessionId, "term-write");
  assert.equal(store.get("term-write")?.status, "detached");
});

test("listRecent 按 updatedAt 倒序返回", async () => {
  const stateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "terminal-desc-store-"),
  );
  const moduleUrl = `${pathToFileURL(storeModulePath).href}?t=${Date.now()}`;
  const { createTerminalSessionDescriptorStore } = await import(moduleUrl);

  const store = createTerminalSessionDescriptorStore({ stateDir });
  store.upsert(
    makeDescriptor({
      sessionId: "term-old",
      updatedAt: "2026-04-14T10:00:01.000Z",
      status: "completed",
      canResume: false,
    }),
  );
  store.upsert(
    makeDescriptor({
      sessionId: "term-new",
      updatedAt: "2026-04-14T10:00:02.000Z",
      status: "running",
      canResume: true,
    }),
  );

  assert.deepEqual(
    store.listRecent().map((item) => item.sessionId),
    ["term-new", "term-old"],
  );
});

test("会裁剪旧 completed 会话但保留 running/detached", async () => {
  const stateDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "terminal-desc-store-"),
  );
  const moduleUrl = `${pathToFileURL(storeModulePath).href}?t=${Date.now()}`;
  const { createTerminalSessionDescriptorStore } = await import(moduleUrl);

  const store = createTerminalSessionDescriptorStore({
    stateDir,
    maxCompleted: 1,
  });

  store.upsert(
    makeDescriptor({
      sessionId: "completed-old",
      status: "completed",
      canResume: false,
      updatedAt: "2026-04-14T10:00:00.000Z",
    }),
  );
  store.upsert(
    makeDescriptor({
      sessionId: "completed-new",
      status: "completed",
      canResume: false,
      updatedAt: "2026-04-14T10:00:02.000Z",
    }),
  );
  store.upsert(
    makeDescriptor({
      sessionId: "still-running",
      status: "running",
      canResume: true,
      updatedAt: "2026-04-14T10:00:01.000Z",
    }),
  );
  store.upsert(
    makeDescriptor({
      sessionId: "still-detached",
      status: "detached",
      canResume: true,
      updatedAt: "2026-04-14T10:00:03.000Z",
    }),
  );

  const ids = store.listRecent().map((item) => item.sessionId);
  assert.deepEqual(ids, ["still-detached", "completed-new", "still-running"]);
  assert.equal(store.get("completed-old"), null);
  assert.equal(store.get("still-running")?.status, "running");
  assert.equal(store.get("still-detached")?.status, "detached");
});
