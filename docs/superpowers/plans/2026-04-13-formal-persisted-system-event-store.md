# Formal Persisted System Event Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a formal persisted local event log for System event center so `/system/events` can survive refreshes and restarts with retained action and state-change history.

**Architecture:** Extend the current Phase 1 system event center into a Phase 2 local persistence layer built on append-only JSONL plus a state file. The backend will split responsibilities across a persisted event log store, a writer for action/state-change persistence policy, a reader that merges persisted history with current snapshot-derived events, and summary helpers that consume the unified merged event list without introducing a database.

**Tech Stack:** TypeScript, Node.js filesystem APIs, existing System service/routes in `apps/api/modules/system`, existing event center frontend in `apps/web-vue/src/features/system`, node:test, Vue 3, Vue Router

---

## Scope check

This plan covers only **Phase 2 of the System event center persisted local event log**:

- JSONL + state-file persistence for system events
- Persistence policy for action events and status-change events
- Rebuild/recovery/retention/compaction seams
- Unified backend read path that merges persisted history with current snapshot-derived events
- Frontend compatibility updates for persisted event fields and summary consumption
- Targeted tests for persistence, retention, rebuild, merge, and summary alignment

This plan does **not** cover:

- SQLite or database-backed storage
- Config audit history persistence
- Terminal transcript ingestion
- Dashboard redesign
- Cross-module event bus

## File structure and responsibilities

### Backend persistence files

- Create: `apps/api/modules/system/event-store-paths.ts` — resolve JSONL/state file paths under the system data directory
- Create: `apps/api/modules/system/event-reader.ts` — read persisted records, parse JSONL safely, ignore broken tail lines, and merge persisted history with live snapshot events
- Create: `apps/api/modules/system/event-writer.ts` — decide when to persist action events and status-change events using state-file dedupe memory
- Modify: `apps/api/modules/system/event-log-store.ts` — upgrade from in-memory list to JSONL/state-backed append, read, retention, compaction, and rebuild helpers
- Modify: `apps/api/modules/system/event-types.ts` — extend persisted event schema with `dedupeKey`, `persistedAt`, `sourceEntity`, `details`, and `action`
- Modify: `apps/api/modules/system/event-normalizer.ts` — provide stable dedupe keys and state-change mapping helpers for snapshot-derived events
- Modify: `apps/api/modules/system/event-summary.ts` — continue summary calculation from unified merged event list
- Modify: `apps/api/modules/system/service.ts` — route all event writes through the writer and all reads through the persisted reader/merge flow
- Modify: `apps/api/modules/system/routes.ts` — keep `/api/system/events` and `/api/system/events/summary` on the unified persisted read path
- Modify: `types/system.ts` — align shared payload types with persisted event fields

### Frontend compatibility files

- Modify: `apps/web-vue/src/features/system/api.ts` — keep event list/summary helpers aligned with persisted payload shape
- Modify: `apps/web-vue/src/features/system/system-event-store.ts` — map new persisted fields cleanly into frontend event items
- Modify: `apps/web-vue/src/features/system/system-event-types.ts` — widen frontend event kinds / fields to match persisted records
- Modify: `apps/web-vue/src/features/system/system-event-actions.ts` — keep next-step actions compatible with persisted event kinds
- Modify: `apps/web-vue/src/features/system/system-event-selectors.ts` — preserve summary logic against persisted payloads
- Modify: `apps/web-vue/src/features/system/SystemEventCenterPage.vue` — keep persisted history + summary flow integrated without local schema drift

### Tests and verification files

- Create: `tests/system/system-event-log-store.test.mjs`
- Create: `tests/system/system-event-writer.test.mjs`
- Create: `tests/system/system-event-reader.test.mjs`
- Modify: `tests/system/system-event-normalizer.test.mjs`
- Modify: `tests/system/system-event-summary.test.mjs`
- Modify: `tests/system/system-event-selectors.test.mjs`
- Modify: `tests/system/studio-web-system-event-center.test.mjs`
- Keep green: `tests/system/bootstrap.test.mjs`
- Keep green: `tests/system/device-trust.test.mjs`
- Keep green: `tests/system/dashboard-service.test.mjs`

---

### Task 1: Define the persisted event schema and file-path seam

**Files:**
- Create: `apps/api/modules/system/event-store-paths.ts`
- Modify: `apps/api/modules/system/event-types.ts`
- Modify: `types/system.ts`
- Test: `tests/system/system-event-log-store.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const eventTypesUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/system/event-types.ts")).href}?t=${Date.now()}`;
const storePathsUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/system/event-store-paths.ts")).href}?t=${Date.now()}`;

test("persisted system event types include dedupe and persistence fields", async () => {
  const mod = await import(eventTypesUrl);
  const example = /** @type {import('../../apps/api/modules/system/event-types.ts').SystemEventRecord} */ ({
    id: "evt-1",
    dedupeKey: "gateway:offline",
    kind: "diagnostic_issue",
    category: "alerts",
    severity: "error",
    occurredAt: "2026-04-13T10:00:00.000Z",
    persistedAt: "2026-04-13T10:00:01.000Z",
    title: "Gateway offline",
    summary: "Gateway RPC unavailable",
    status: "failed",
    sourceModule: "gateway",
    sourceEntity: "gateway:rpc",
    details: { reason: "rpc_unreachable" },
    action: { key: "refresh-diagnostics" },
  });

  assert.equal(example.dedupeKey, "gateway:offline");
  assert.equal(example.persistedAt, "2026-04-13T10:00:01.000Z");
  assert.equal(example.sourceEntity, "gateway:rpc");
  assert.equal(example.details.reason, "rpc_unreachable");
  assert.equal(example.action.key, "refresh-diagnostics");
  assert.equal(typeof mod.createSystemEventId, "function");
});

test("event store path helper resolves jsonl and state files", async () => {
  const mod = await import(storePathsUrl);
  const paths = mod.resolveSystemEventStorePaths({
    stateDir: "/tmp/openclaw-studio-state",
  });

  assert.equal(paths.logFilePath, "/tmp/openclaw-studio-state/system-events.jsonl");
  assert.equal(paths.stateFilePath, "/tmp/openclaw-studio-state/system-events.state.json");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-log-store.test.mjs`
Expected: FAIL because persisted schema fields and path helper do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/system/event-store-paths.ts`

```ts
import path from "node:path";

export interface ResolveSystemEventStorePathsInput {
  stateDir: string;
}

export interface SystemEventStorePaths {
  logFilePath: string;
  stateFilePath: string;
}

export function resolveSystemEventStorePaths(
  input: ResolveSystemEventStorePathsInput,
): SystemEventStorePaths {
  return {
    logFilePath: path.join(input.stateDir, "system-events.jsonl"),
    stateFilePath: path.join(input.stateDir, "system-events.state.json"),
  };
}
```

`apps/api/modules/system/event-types.ts`

```ts
export type {
  SystemEventCategory,
  SystemEventRecord,
  SystemEventSeverity,
} from "../../../../types/system.js";

export function createSystemEventId(input: {
  kind: string;
  occurredAt: string;
  sourceEntity?: string;
}): string {
  return [input.kind, input.occurredAt, input.sourceEntity || "system"]
    .join(":")
    .replace(/\s+/g, "-");
}
```

`types/system.ts` excerpt

```ts
export interface SystemEventActionMeta {
  key: string;
}

export interface SystemEventRecord {
  id: string;
  dedupeKey: string;
  kind: string;
  category: SystemEventCategory;
  severity: SystemEventSeverity;
  occurredAt: string;
  persistedAt: string;
  title: string;
  summary: string;
  status: string;
  sourceModule?: string;
  sourceEntity?: string;
  details?: Record<string, unknown>;
  action?: SystemEventActionMeta | null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-log-store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/system/event-store-paths.ts \
  apps/api/modules/system/event-types.ts \
  types/system.ts \
  tests/system/system-event-log-store.test.mjs

git commit -m "事件：定义持久结构"
```

### Task 2: Upgrade the event log store to JSONL + state persistence

**Files:**
- Modify: `apps/api/modules/system/event-log-store.ts`
- Modify: `apps/api/modules/system/event-store-paths.ts`
- Test: `tests/system/system-event-log-store.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/system/event-log-store.ts")).href}?t=${Date.now()}`;

function makeRecord(id, overrides = {}) {
  return {
    id,
    dedupeKey: id,
    kind: "diagnostic_issue",
    category: "alerts",
    severity: "error",
    occurredAt: "2026-04-13T10:00:00.000Z",
    persistedAt: "2026-04-13T10:00:01.000Z",
    title: id,
    summary: id,
    status: "failed",
    ...overrides,
  };
}

test("jsonl event store appends and reads most recent records", async () => {
  const { createSystemEventLogStore } = await import(moduleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "system-event-store-"));
  const store = createSystemEventLogStore({ stateDir, maxRecords: 3, maxAgeDays: 7 });

  store.append([makeRecord("a"), makeRecord("b")]);
  const events = store.list(10);

  assert.deepEqual(events.map((event) => event.id), ["b", "a"]);
  assert.equal(fs.existsSync(path.join(stateDir, "system-events.jsonl")), true);
  assert.equal(fs.existsSync(path.join(stateDir, "system-events.state.json")), true);
});

test("jsonl event store trims to retention limit", async () => {
  const { createSystemEventLogStore } = await import(moduleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "system-event-store-"));
  const store = createSystemEventLogStore({ stateDir, maxRecords: 2, maxAgeDays: 7 });

  store.append([makeRecord("a"), makeRecord("b"), makeRecord("c")]);

  assert.deepEqual(store.list(10).map((event) => event.id), ["c", "b"]);
});

test("jsonl event store ignores a corrupted tail line", async () => {
  const { createSystemEventLogStore } = await import(moduleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "system-event-store-"));
  const store = createSystemEventLogStore({ stateDir, maxRecords: 5, maxAgeDays: 7 });

  store.append([makeRecord("a")]);
  fs.appendFileSync(path.join(stateDir, "system-events.jsonl"), '{bad-json}\n', 'utf8');

  assert.deepEqual(store.list(10).map((event) => event.id), ["a"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-log-store.test.mjs`
Expected: FAIL because the store is still in-memory only.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/system/event-log-store.ts`

```ts
import fs from "node:fs";
import path from "node:path";
import type { SystemEventRecord } from "./event-types.js";
import { resolveSystemEventStorePaths } from "./event-store-paths.js";

export interface SystemEventLogStoreOptions {
  stateDir: string;
  maxRecords?: number;
  maxAgeDays?: number;
}

export interface SystemEventLogStore {
  append(events: SystemEventRecord[]): void;
  list(limit?: number): SystemEventRecord[];
}

function ensureDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readJsonl(filePath: string): SystemEventRecord[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
  const records: SystemEventRecord[] = [];
  for (const line of lines) {
    try {
      records.push(JSON.parse(line) as SystemEventRecord);
    } catch {
      // ignore corrupted tail line
    }
  }
  return records;
}

function trimRecords(
  records: SystemEventRecord[],
  maxRecords: number,
): SystemEventRecord[] {
  return records.slice(-maxRecords);
}

export function createSystemEventLogStore(
  options: SystemEventLogStoreOptions,
): SystemEventLogStore {
  const maxRecords = options.maxRecords ?? 500;
  const paths = resolveSystemEventStorePaths({ stateDir: options.stateDir });

  function writeState(records: SystemEventRecord[]): void {
    ensureDir(paths.stateFilePath);
    fs.writeFileSync(
      paths.stateFilePath,
      `${JSON.stringify({ count: records.length }, null, 2)}\n`,
      "utf8",
    );
  }

  return {
    append(events: SystemEventRecord[]): void {
      if (!Array.isArray(events) || events.length === 0) {
        return;
      }
      ensureDir(paths.logFilePath);
      const existing = readJsonl(paths.logFilePath);
      const next = trimRecords([...existing, ...events], maxRecords);
      fs.writeFileSync(
        paths.logFilePath,
        `${next.map((event) => JSON.stringify(event)).join("\n")}\n`,
        "utf8",
      );
      writeState(next);
    },
    list(limit = 100): SystemEventRecord[] {
      return readJsonl(paths.logFilePath)
        .slice()
        .reverse()
        .slice(0, limit);
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-log-store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/system/event-log-store.ts \
  tests/system/system-event-log-store.test.mjs

git commit -m "事件：接入日志存储"
```

### Task 3: Add the persistence writer for actions and status changes

**Files:**
- Create: `apps/api/modules/system/event-writer.ts`
- Modify: `apps/api/modules/system/event-normalizer.ts`
- Test: `tests/system/system-event-writer.test.mjs`
- Modify: `tests/system/system-event-normalizer.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const writerUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/system/event-writer.ts")).href}?t=${Date.now()}`;

test("writer persists action events immediately", async () => {
  const { createSystemEventWriter } = await import(writerUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "system-event-writer-"));
  const writer = createSystemEventWriter({ stateDir, maxRecords: 50, maxAgeDays: 7 });

  writer.persistActionEvent({
    action: "bootstrap-repair",
    ok: true,
    occurredAt: "2026-04-13T10:00:00.000Z",
  });

  const events = writer.listPersistedEvents(10);
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "repair_succeeded");
});

test("writer only persists snapshot event when dedupe state changes", async () => {
  const { createSystemEventWriter } = await import(writerUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "system-event-writer-"));
  const writer = createSystemEventWriter({ stateDir, maxRecords: 50, maxAgeDays: 7 });

  const snapshotEvent = {
    id: "gateway-offline-1",
    dedupeKey: "gateway:offline",
    kind: "diagnostic_issue",
    category: "alerts",
    severity: "error",
    occurredAt: "2026-04-13T10:00:00.000Z",
    persistedAt: "2026-04-13T10:00:01.000Z",
    title: "Gateway offline",
    summary: "Gateway RPC unavailable",
    status: "failed",
    sourceModule: "gateway",
    sourceEntity: "gateway:rpc",
  };

  writer.persistStateChanges([snapshotEvent]);
  writer.persistStateChanges([snapshotEvent]);

  assert.equal(writer.listPersistedEvents(10).length, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-writer.test.mjs tests/system/system-event-normalizer.test.mjs`
Expected: FAIL because the writer does not exist and the normalizer does not emit stable dedupe fields.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/system/event-writer.ts`

```ts
import fs from "node:fs";
import { buildSystemActionEvents } from "./event-normalizer.js";
import { createSystemEventLogStore } from "./event-log-store.js";
import type { SystemEventRecord } from "./event-types.js";
import { resolveSystemEventStorePaths } from "./event-store-paths.js";

export interface CreateSystemEventWriterOptions {
  stateDir: string;
  maxRecords: number;
  maxAgeDays: number;
}

export function createSystemEventWriter(
  options: CreateSystemEventWriterOptions,
) {
  const store = createSystemEventLogStore(options);
  const paths = resolveSystemEventStorePaths({ stateDir: options.stateDir });

  function readDedupeState(): Record<string, string> {
    try {
      const raw = JSON.parse(fs.readFileSync(paths.stateFilePath, "utf8"));
      return raw.dedupeState || {};
    } catch {
      return {};
    }
  }

  function writeDedupeState(dedupeState: Record<string, string>): void {
    fs.writeFileSync(
      paths.stateFilePath,
      `${JSON.stringify({ dedupeState }, null, 2)}\n`,
      "utf8",
    );
  }

  return {
    persistActionEvent(input: {
      action: Parameters<typeof buildSystemActionEvents>[0]["action"];
      ok: boolean;
      occurredAt?: string;
    }): void {
      store.append(buildSystemActionEvents(input));
    },
    persistStateChanges(events: SystemEventRecord[]): void {
      const dedupeState = readDedupeState();
      const nextEvents = events.filter((event) => dedupeState[event.dedupeKey] !== event.status);
      if (!nextEvents.length) {
        return;
      }
      for (const event of nextEvents) {
        dedupeState[event.dedupeKey] = event.status;
      }
      store.append(nextEvents);
      writeDedupeState(dedupeState);
    },
    listPersistedEvents(limit = 100): SystemEventRecord[] {
      return store.list(limit);
    },
  };
}
```

`apps/api/modules/system/event-normalizer.ts` additive excerpt

```ts
function withPersistenceMeta(
  record: Omit<SystemEventRecord, "persistedAt" | "dedupeKey"> & {
    dedupeKey: string;
  },
): SystemEventRecord {
  return {
    ...record,
    persistedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-writer.test.mjs tests/system/system-event-normalizer.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/system/event-writer.ts \
  apps/api/modules/system/event-normalizer.ts \
  tests/system/system-event-writer.test.mjs \
  tests/system/system-event-normalizer.test.mjs

git commit -m "事件：写入状态变化"
```

### Task 4: Add the persisted event reader and merged read path

**Files:**
- Create: `apps/api/modules/system/event-reader.ts`
- Modify: `apps/api/modules/system/service.ts`
- Modify: `apps/api/modules/system/event-summary.ts`
- Test: `tests/system/system-event-reader.test.mjs`
- Modify: `tests/system/system-event-summary.test.mjs`
- Regression: `tests/system/dashboard-service.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/system/event-reader.ts")).href}?t=${Date.now()}`;

function makeEvent(id, overrides = {}) {
  return {
    id,
    dedupeKey: id,
    kind: "diagnostic_issue",
    category: "alerts",
    severity: "error",
    occurredAt: "2026-04-13T10:00:00.000Z",
    persistedAt: "2026-04-13T10:00:01.000Z",
    title: id,
    summary: id,
    status: "failed",
    sourceModule: "gateway",
    ...overrides,
  };
}

test("reader merges persisted history with live snapshot events by dedupe key", async () => {
  const { mergeSystemEventHistory } = await import(moduleUrl);
  const merged = mergeSystemEventHistory({
    persistedEvents: [makeEvent("persisted-gateway", { dedupeKey: "gateway:offline", occurredAt: "2026-04-13T09:00:00.000Z" })],
    liveSnapshotEvents: [makeEvent("live-gateway", { dedupeKey: "gateway:offline", occurredAt: "2026-04-13T10:00:00.000Z" })],
    limit: 10,
  });

  assert.deepEqual(merged.map((event) => event.id), ["live-gateway"]);
});

test("reader keeps distinct action events beside live snapshot events", async () => {
  const { mergeSystemEventHistory } = await import(moduleUrl);
  const merged = mergeSystemEventHistory({
    persistedEvents: [
      makeEvent("repair-1", { dedupeKey: "action:repair-1", kind: "repair_succeeded", category: "operations", severity: "success", status: "succeeded" }),
    ],
    liveSnapshotEvents: [makeEvent("gateway-live", { dedupeKey: "gateway:offline" })],
    limit: 10,
  });

  assert.deepEqual(merged.map((event) => event.id), ["gateway-live", "repair-1"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-reader.test.mjs tests/system/system-event-summary.test.mjs tests/system/dashboard-service.test.mjs`
Expected: FAIL because the reader/merge seam does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/system/event-reader.ts`

```ts
import type { SystemEventRecord } from "./event-types.js";

function toTime(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function mergeSystemEventHistory(input: {
  persistedEvents: SystemEventRecord[];
  liveSnapshotEvents: SystemEventRecord[];
  limit: number;
}): SystemEventRecord[] {
  const merged = new Map<string, SystemEventRecord>();

  for (const event of input.persistedEvents || []) {
    merged.set(event.dedupeKey, event);
  }

  for (const event of input.liveSnapshotEvents || []) {
    merged.set(event.dedupeKey, event);
  }

  const actionEvents = (input.persistedEvents || []).filter(
    (event) => event.dedupeKey.startsWith("action:"),
  );

  const values = [...merged.values(), ...actionEvents].sort(
    (left, right) => toTime(right.occurredAt) - toTime(left.occurredAt),
  );

  return values.slice(0, input.limit);
}
```

`apps/api/modules/system/service.ts` additive excerpt

```ts
const eventReader = {
  merge: mergeSystemEventHistory,
};

async listEvents(limit = 100): Promise<SystemEventRecord[]> {
  const diagnostics = await this.getDiagnostics();
  const bootstrap = await this.getBootstrap();
  const deviceTrust = await this.getDeviceTrust();
  const studioRelease = await this.getStudioRelease();
  const persistedEvents = eventWriter.listPersistedEvents(limit);
  const liveSnapshotEvents = buildSystemSnapshotDerivedEvents({
    diagnostics,
    bootstrap,
    deviceTrust,
    studioRelease,
  });
  return eventReader.merge({
    persistedEvents,
    liveSnapshotEvents,
    limit,
  });
}

async getEventSummary(limit = 100): Promise<SystemEventSummaryPayload> {
  return buildSystemEventSummaryCards(await this.listEvents(limit));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-reader.test.mjs tests/system/system-event-summary.test.mjs tests/system/dashboard-service.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/system/event-reader.ts \
  apps/api/modules/system/service.ts \
  apps/api/modules/system/event-summary.ts \
  tests/system/system-event-reader.test.mjs \
  tests/system/system-event-summary.test.mjs

git commit -m "事件：合并历史读取"
```

### Task 5: Keep the frontend aligned with persisted payloads

**Files:**
- Modify: `apps/web-vue/src/features/system/api.ts`
- Modify: `apps/web-vue/src/features/system/system-event-store.ts`
- Modify: `apps/web-vue/src/features/system/system-event-types.ts`
- Modify: `apps/web-vue/src/features/system/system-event-actions.ts`
- Modify: `apps/web-vue/src/features/system/system-event-selectors.ts`
- Modify: `apps/web-vue/src/features/system/SystemEventCenterPage.vue`
- Modify: `tests/system/system-event-selectors.test.mjs`
- Modify: `tests/system/studio-web-system-event-center.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const storePath = path.join(rootDir, "apps/web-vue/src/features/system/system-event-store.ts");
const pagePath = path.join(rootDir, "apps/web-vue/src/features/system/SystemEventCenterPage.vue");

test("frontend store maps persisted sourceModule and persisted event kinds", () => {
  const storeSource = fs.readFileSync(storePath, "utf8");
  assert.match(storeSource, /sourceModule:\s*record\.sourceModule/);
  assert.doesNotMatch(storeSource, /sourceModule:\s*record\.status/);
});

test("event center page still consumes snapshot and summary endpoints after persistence upgrade", () => {
  const pageSource = fs.readFileSync(pagePath, "utf8");
  assert.match(pageSource, /fetchSystemEventCenterSnapshot/);
  assert.match(pageSource, /fetchSystemEventCenterSummary/);
  assert.match(pageSource, /handleNextStepAction/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs`
Expected: FAIL if the frontend still assumes the old lightweight schema.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/system/system-event-store.ts` excerpt

```ts
function toSystemEventItem(record: SystemEventRecord): SystemEventItem {
  return {
    id: record.id,
    kind: record.kind as SystemEventItem["kind"],
    category: record.category,
    severity: record.severity,
    occurredAt: record.occurredAt,
    title: record.title,
    summary: record.summary,
    sourceModule: record.sourceModule || "system",
  };
}
```

`apps/web-vue/src/features/system/system-event-types.ts` excerpt

```ts
export type SystemEventKind =
  | "diagnostic_issue"
  | "device_trust_pending"
  | "device_trust_approved"
  | "device_trust_approve_failed"
  | "release_update_available"
  | "repair_succeeded"
  | "repair_failed"
  | "upgrade_started"
  | "upgrade_failed"
  | "helper_repair_succeeded"
  | "helper_repair_failed";
```

`apps/web-vue/src/features/system/system-event-actions.ts` excerpt

```ts
if (event.kind === "repair_failed" || event.kind === "diagnostic_issue") {
  return [
    { id: `refresh-${event.id}`, label: "刷新诊断", intent: "refresh" },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/system/api.ts \
  apps/web-vue/src/features/system/system-event-store.ts \
  apps/web-vue/src/features/system/system-event-types.ts \
  apps/web-vue/src/features/system/system-event-actions.ts \
  apps/web-vue/src/features/system/system-event-selectors.ts \
  apps/web-vue/src/features/system/SystemEventCenterPage.vue \
  tests/system/system-event-selectors.test.mjs \
  tests/system/studio-web-system-event-center.test.mjs

git commit -m "事件：对齐前端持久化"
```

### Task 6: Run the persisted event store gate and capture follow-up split

**Files:**
- Modify: `docs/superpowers/plans/2026-04-13-formal-persisted-system-event-store.md`
- Verify: `apps/api/modules/system/event-log-store.ts`
- Verify: `apps/api/modules/system/event-writer.ts`
- Verify: `apps/api/modules/system/event-reader.ts`
- Verify: `apps/api/modules/system/event-normalizer.ts`
- Verify: `apps/api/modules/system/service.ts`
- Verify: `apps/web-vue/src/features/system/system-event-store.ts`
- Verify: `apps/web-vue/src/features/system/SystemEventCenterPage.vue`

- [x] **Step 1: Append the exit criteria to the plan footer**

```md
## Persisted system event store exit criteria

- System event history is stored in a local JSONL log with a companion state file.
- Action events are always persisted and status-change events persist only on real state transitions.
- Corrupted JSONL tail lines are ignored safely and state can rebuild from persisted history.
- `/api/system/events` merges persisted history with live snapshot-derived events.
- `/api/system/events/summary` is calculated from the unified merged event list.
- Frontend event center continues to consume snapshot and summary endpoints with persisted event payloads.
- Targeted persisted-event tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Config audit integration into the persisted system event log
2. Terminal transcript / handoff persistence strategy
```

- [ ] **Step 2: Run the persisted event store verification gate**

Run: `node --test tests/system/system-event-log-store.test.mjs tests/system/system-event-writer.test.mjs tests/system/system-event-reader.test.mjs tests/system/system-event-normalizer.test.mjs tests/system/system-event-summary.test.mjs tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, fix only one of these seams before re-running:

- schema / path files
- log store / rebuild files
- writer / dedupe files
- reader / merge files
- frontend compatibility files

Do not widen into SQLite, Config audit, or transcript persistence.

- [ ] **Step 4: Re-run the persisted event store verification gate**

Run: `node --test tests/system/system-event-log-store.test.mjs tests/system/system-event-writer.test.mjs tests/system/system-event-reader.test.mjs tests/system/system-event-normalizer.test.mjs tests/system/system-event-summary.test.mjs tests/system/system-event-selectors.test.mjs tests/system/studio-web-system-event-center.test.mjs tests/system/bootstrap.test.mjs tests/system/device-trust.test.mjs tests/system/dashboard-service.test.mjs && npm run typecheck:web && npm run typecheck:api`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-13-formal-persisted-system-event-store.md

git commit -m "事件：完成持久化一期"
```

---

## Self-review

### Spec coverage

This plan covers the approved persisted local event log scope:

- JSONL + state file persistence
- action and state-change persistence policy
- rebuild / retention / merge seams
- summary endpoint based on unified merged events
- frontend compatibility with persisted payloads

It intentionally does **not** introduce SQLite, Config audit persistence, or terminal transcript storage.

### Placeholder scan

No placeholders remain. Each task names exact files, tests, commands, and minimal code.

### Type consistency

The plan uses one persisted event vocabulary throughout:

- `SystemEventRecord`
- `dedupeKey`
- `persistedAt`
- `sourceEntity`
- `details`
- `action`

The backend read path consistently flows through `event-reader.ts`, and the frontend continues consuming `/api/system/events` plus `/api/system/events/summary`.
