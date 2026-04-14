# Terminal Persistence Strategy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persisted terminal session descriptors, handoff lifecycle ledger, and recent output summaries so `/terminal` and `/terminal/:sessionId` can recover stable workspace context without full transcript storage.

**Architecture:** Keep the current Terminal workspace shell and session model, but add a backend persistence layer made of a descriptor snapshot store plus an append-only handoff/attach ledger. The frontend will continue using the current Terminal routes and workspace shell, but its recent rail and route recovery flow will read from persisted descriptors and recent summaries instead of relying only on runtime memory.

**Tech Stack:** TypeScript, Node.js filesystem APIs, existing terminal service/routes in `apps/api/modules/terminal`, existing terminal workspace frontend under `apps/web-vue/src/features/terminal`, Vue 3, Vue Router, node:test

---

## Scope check

This plan covers only **Terminal persistence Phase 1**:

- Session descriptor persistence
- Handoff / attach / takeover ledger persistence
- Recent output summary persistence
- `/terminal` and `/terminal/:sessionId` recovery via persisted descriptors
- Minimal frontend rendering of handoff context and completed/failed summary states

This plan does **not** cover:

- Full terminal transcript persistence
- Transcript search or replay
- Transcript-heavy audit UI
- Dashboard transcript integration

## File structure and responsibilities

### Backend persistence files

- Create: `apps/api/modules/terminal/terminal-session-descriptor-store.ts` — read/write `terminal-sessions.json`, apply descriptor retention, and return recent/recoverable sessions
- Create: `apps/api/modules/terminal/terminal-session-ledger.ts` — append/read `terminal-session-ledger.jsonl`, keep attach/takeover lifecycle history with retention
- Create: `apps/api/modules/terminal/terminal-session-summary.ts` — build persisted recent output summary from runtime session state and completed/failure results
- Create: `apps/api/modules/terminal/terminal-handoff-context.ts` — normalize source module / route / trigger / related event metadata into one handoff schema
- Modify: `apps/api/modules/terminal/service.ts` — persist descriptor and ledger changes on create/attach/detach/takeover/complete/fail, and expose recovery-oriented reads
- Modify: `apps/api/modules/terminal/routes.ts` — add or adapt session list/detail endpoints for persisted descriptors and ledger reads
- Modify: `types/terminal.ts` — extend shared terminal session payloads with descriptor, handoff context, and recent output summary types

### Frontend terminal recovery files

- Modify: `apps/web-vue/src/features/terminal/terminal-session-registry.ts` — consume persisted descriptors as the source for recent/recoverable sessions
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts` — hydrate workspace tabs and active session from persisted descriptor state
- Modify: `apps/web-vue/src/features/terminal/terminal-route-sync.ts` — recover `/terminal/:sessionId` from persisted descriptor reads
- Modify: `apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue` — render persisted descriptor metadata and recent summary hints
- Modify: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue` — show handoff context and completed/failed recent output summary
- Modify: `apps/web-vue/src/features/terminal/api.ts` — add descriptor list/detail fetch helpers and ledger fetch helper if needed

### Tests and verification files

- Create: `tests/terminal/terminal-session-descriptor-store.test.mjs`
- Create: `tests/terminal/terminal-session-ledger.test.mjs`
- Create: `tests/terminal/terminal-session-summary.test.mjs`
- Modify: `tests/terminal/terminal-workspace-state.test.mjs`
- Modify: `tests/terminal/terminal-session-selectors.test.mjs`
- Modify: `tests/system/studio-web-terminal-route-session.test.mjs`
- Modify: `tests/system/studio-web-terminal-workspace-shell.test.mjs`

---

### Task 1: Define persisted terminal descriptor and ledger types

**Files:**
- Modify: `types/terminal.ts`
- Test: `tests/terminal/terminal-session-summary.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = `${pathToFileURL(path.join(rootDir, "types/terminal.ts")).href}?t=${Date.now()}`;

test("terminal types expose descriptor, handoff context, ledger event, and recent summary shapes", async () => {
  const mod = await import(moduleUrl);

  const descriptor = /** @type {import('../../types/terminal.ts').TerminalSessionDescriptor} */ ({
    sessionId: "session-1",
    title: "Bootstrap Repair",
    source: "system-handoff",
    sourceModule: "system",
    sourceAction: "bootstrap-repair",
    originRoute: "/system/events",
    status: "detached",
    controllerClientId: "client-a",
    observerClientIds: ["client-b"],
    createdAt: "2026-04-14T10:00:00.000Z",
    lastActiveAt: "2026-04-14T10:05:00.000Z",
    lastAttachedAt: "2026-04-14T10:04:00.000Z",
    canResume: true,
    resumeKey: "session-1",
    handoffContext: {
      fromModule: "system",
      fromRoute: "/system/events",
      triggerType: "event-center",
      triggerLabel: "Bootstrap repair",
      targetEntity: "bootstrap",
      recommendedCommand: "studio diagnostics collect",
      relatedEventId: "evt-1",
    },
    recentOutputSummary: {
      tailText: "repair succeeded",
      lastError: "",
      lastCommandHint: "studio diagnostics collect",
      exitSummary: "completed",
      updatedAt: "2026-04-14T10:05:00.000Z",
    },
  });

  assert.equal(descriptor.handoffContext?.fromModule, "system");
  assert.equal(descriptor.recentOutputSummary?.exitSummary, "completed");
  assert.equal(typeof mod.isRecoverableTerminalStatus, "function");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-session-summary.test.mjs`
Expected: FAIL because the new persisted terminal types do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`types/terminal.ts` excerpt

```ts
export type TerminalSessionSource = "manual" | "system-handoff" | "action-panel";
export type TerminalPersistedStatus = "running" | "detached" | "completed" | "failed" | "lost";

export interface TerminalHandoffContext {
  fromModule: string;
  fromRoute: string;
  triggerType: string;
  triggerLabel: string;
  targetEntity: string;
  recommendedCommand: string;
  relatedEventId: string | null;
}

export interface TerminalRecentOutputSummary {
  tailText: string;
  lastError: string;
  lastCommandHint: string;
  exitSummary: string;
  updatedAt: string;
}

export interface TerminalSessionDescriptor {
  sessionId: string;
  title: string;
  source: TerminalSessionSource;
  sourceModule: string;
  sourceAction: string;
  originRoute: string;
  status: TerminalPersistedStatus;
  controllerClientId: string | null;
  observerClientIds: string[];
  createdAt: string;
  lastActiveAt: string;
  lastAttachedAt: string | null;
  canResume: boolean;
  resumeKey: string;
  handoffContext: TerminalHandoffContext | null;
  recentOutputSummary: TerminalRecentOutputSummary | null;
}

export interface TerminalSessionLedgerEvent {
  id: string;
  sessionId: string;
  kind: string;
  occurredAt: string;
  actor: string;
  details: Record<string, unknown>;
}

export function isRecoverableTerminalStatus(status: TerminalPersistedStatus): boolean {
  return status === "running" || status === "detached";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-session-summary.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  types/terminal.ts \
  tests/terminal/terminal-session-summary.test.mjs

git commit -m "终端：定义持久模型"
```

### Task 2: Add the descriptor store for persisted terminal sessions

**Files:**
- Create: `apps/api/modules/terminal/terminal-session-descriptor-store.ts`
- Test: `tests/terminal/terminal-session-descriptor-store.test.mjs`

- [ ] **Step 1: Write the failing test**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const moduleUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/terminal/terminal-session-descriptor-store.ts")).href}?t=${Date.now()}`;

function makeDescriptor(id, overrides = {}) {
  return {
    sessionId: id,
    title: id,
    source: "manual",
    sourceModule: "terminal",
    sourceAction: "manual",
    originRoute: "/terminal",
    status: "detached",
    controllerClientId: null,
    observerClientIds: [],
    createdAt: "2026-04-14T10:00:00.000Z",
    lastActiveAt: "2026-04-14T10:10:00.000Z",
    lastAttachedAt: null,
    canResume: true,
    resumeKey: id,
    handoffContext: null,
    recentOutputSummary: null,
    ...overrides,
  };
}

test("descriptor store saves and reads persisted session descriptors", async () => {
  const { createTerminalSessionDescriptorStore } = await import(moduleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-descriptor-store-"));
  const store = createTerminalSessionDescriptorStore({ stateDir, maxSessions: 50, maxCompletedAgeDays: 7 });

  store.upsert(makeDescriptor("s-1"));
  store.upsert(makeDescriptor("s-2", { lastActiveAt: "2026-04-14T10:20:00.000Z" }));

  assert.deepEqual(store.listRecent().map((item) => item.sessionId), ["s-2", "s-1"]);
  assert.equal(fs.existsSync(path.join(stateDir, "terminal-sessions.json")), true);
});

test("descriptor store keeps running sessions and trims old completed sessions", async () => {
  const { createTerminalSessionDescriptorStore } = await import(moduleUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-descriptor-store-"));
  const store = createTerminalSessionDescriptorStore({ stateDir, maxSessions: 50, maxCompletedAgeDays: 7 });

  store.upsert(makeDescriptor("running-session", {
    status: "running",
    canResume: true,
    lastActiveAt: new Date().toISOString(),
  }));
  store.upsert(makeDescriptor("old-completed", {
    status: "completed",
    canResume: false,
    lastActiveAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  assert.deepEqual(store.listRecent().map((item) => item.sessionId), ["running-session"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-session-descriptor-store.test.mjs`
Expected: FAIL because the descriptor store does not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/terminal/terminal-session-descriptor-store.ts`

```ts
import fs from "node:fs";
import path from "node:path";
import type { TerminalSessionDescriptor } from "../../../../types/terminal.js";

export interface CreateTerminalSessionDescriptorStoreInput {
  stateDir: string;
  maxSessions: number;
  maxCompletedAgeDays: number;
}

function readJson(filePath: string): TerminalSessionDescriptor[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function createTerminalSessionDescriptorStore(
  input: CreateTerminalSessionDescriptorStoreInput,
) {
  const filePath = path.join(input.stateDir, "terminal-sessions.json");
  fs.mkdirSync(input.stateDir, { recursive: true });

  function normalize(items: TerminalSessionDescriptor[]): TerminalSessionDescriptor[] {
    const cutoff = Date.now() - input.maxCompletedAgeDays * 24 * 60 * 60 * 1000;
    return items
      .filter((item) => {
        if (item.status === "running" || item.status === "detached") {
          return true;
        }
        return Date.parse(item.lastActiveAt) >= cutoff;
      })
      .sort((left, right) => Date.parse(right.lastActiveAt) - Date.parse(left.lastActiveAt))
      .slice(0, input.maxSessions);
  }

  function write(items: TerminalSessionDescriptor[]): void {
    fs.writeFileSync(filePath, `${JSON.stringify(normalize(items), null, 2)}\n`, "utf8");
  }

  return {
    upsert(descriptor: TerminalSessionDescriptor): void {
      const current = readJson(filePath).filter((item) => item.sessionId !== descriptor.sessionId);
      write([descriptor, ...current]);
    },
    listRecent(): TerminalSessionDescriptor[] {
      return normalize(readJson(filePath));
    },
    get(sessionId: string): TerminalSessionDescriptor | null {
      return readJson(filePath).find((item) => item.sessionId === sessionId) || null;
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-session-descriptor-store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/terminal/terminal-session-descriptor-store.ts \
  tests/terminal/terminal-session-descriptor-store.test.mjs

git commit -m "终端：接入会话描述"
```

### Task 3: Add the handoff / attach ledger and recent output summary seams

**Files:**
- Create: `apps/api/modules/terminal/terminal-session-ledger.ts`
- Create: `apps/api/modules/terminal/terminal-session-summary.ts`
- Test: `tests/terminal/terminal-session-ledger.test.mjs`
- Modify: `tests/terminal/terminal-session-summary.test.mjs`

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
const ledgerUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/terminal/terminal-session-ledger.ts")).href}?t=${Date.now()}`;
const summaryUrl = `${pathToFileURL(path.join(rootDir, "apps/api/modules/terminal/terminal-session-summary.ts")).href}?t=${Date.now()}`;

test("ledger appends terminal lifecycle events and reads recent history", async () => {
  const { createTerminalSessionLedger } = await import(ledgerUrl);
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "terminal-ledger-"));
  const ledger = createTerminalSessionLedger({ stateDir, maxEvents: 1000, maxAgeDays: 14 });

  ledger.append({
    id: "evt-1",
    sessionId: "session-1",
    kind: "handoff_created",
    occurredAt: "2026-04-14T10:00:00.000Z",
    actor: "system",
    details: { fromModule: "system" },
  });

  const events = ledger.listBySession("session-1");
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "handoff_created");
  assert.equal(fs.existsSync(path.join(stateDir, "terminal-session-ledger.jsonl")), true);
});

test("recent output summary keeps tail text and exit summary", async () => {
  const { buildTerminalRecentOutputSummary } = await import(summaryUrl);
  const summary = buildTerminalRecentOutputSummary({
    tailText: "diagnostics collect completed",
    lastError: "",
    lastCommandHint: "studio diagnostics collect",
    exitSummary: "completed",
    updatedAt: "2026-04-14T10:10:00.000Z",
  });

  assert.equal(summary.tailText, "diagnostics collect completed");
  assert.equal(summary.exitSummary, "completed");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-session-ledger.test.mjs tests/terminal/terminal-session-summary.test.mjs`
Expected: FAIL because the ledger/summary seams do not exist yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/terminal/terminal-session-ledger.ts`

```ts
import fs from "node:fs";
import path from "node:path";
import type { TerminalSessionLedgerEvent } from "../../../../types/terminal.js";

export function createTerminalSessionLedger(input: {
  stateDir: string;
  maxEvents: number;
  maxAgeDays: number;
}) {
  const filePath = path.join(input.stateDir, "terminal-session-ledger.jsonl");
  fs.mkdirSync(input.stateDir, { recursive: true });

  function readAll(): TerminalSessionLedgerEvent[] {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    return fs.readFileSync(filePath, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TerminalSessionLedgerEvent);
  }

  return {
    append(event: TerminalSessionLedgerEvent): void {
      fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
    },
    listBySession(sessionId: string): TerminalSessionLedgerEvent[] {
      return readAll().filter((event) => event.sessionId === sessionId);
    },
  };
}
```

`apps/api/modules/terminal/terminal-session-summary.ts`

```ts
import type { TerminalRecentOutputSummary } from "../../../../types/terminal.js";

export function buildTerminalRecentOutputSummary(
  input: TerminalRecentOutputSummary,
): TerminalRecentOutputSummary {
  return {
    tailText: input.tailText,
    lastError: input.lastError,
    lastCommandHint: input.lastCommandHint,
    exitSummary: input.exitSummary,
    updatedAt: input.updatedAt,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-session-ledger.test.mjs tests/terminal/terminal-session-summary.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/terminal/terminal-session-ledger.ts \
  apps/api/modules/terminal/terminal-session-summary.ts \
  tests/terminal/terminal-session-ledger.test.mjs \
  tests/terminal/terminal-session-summary.test.mjs

git commit -m "终端：记录交接摘要"
```

### Task 4: Hook terminal service into descriptor and ledger persistence

**Files:**
- Modify: `apps/api/modules/terminal/service.ts`
- Modify: `apps/api/modules/terminal/routes.ts`
- Test: `tests/system/studio-web-terminal-route-session.test.mjs`
- Modify: `tests/system/studio-web-terminal-workspace-shell.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createTerminalService } from "../../dist/apps/api/modules/terminal/service.js";

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "studio-terminal-persist-"));
  fs.mkdirSync(path.join(root, "terminal"), { recursive: true });
  return root;
}

test("terminal service persists descriptor and ledger for system handoff session", async () => {
  const root = createTempRoot();
  const service = createTerminalService({
    openclawRoot: root,
    projectRoot: root,
  });

  const session = await service.createSession({
    source: "system-handoff",
    sourceModule: "system",
    sourceAction: "bootstrap-repair",
    originRoute: "/system/events",
    handoffContext: {
      fromModule: "system",
      fromRoute: "/system/events",
      triggerType: "event-center",
      triggerLabel: "Bootstrap repair",
      targetEntity: "bootstrap",
      recommendedCommand: "studio diagnostics collect",
      relatedEventId: "evt-1",
    },
  });

  const descriptorFile = path.join(root, "terminal", "terminal-sessions.json");
  const ledgerFile = path.join(root, "terminal", "terminal-session-ledger.jsonl");
  assert.equal(fs.existsSync(descriptorFile), true);
  assert.equal(fs.existsSync(ledgerFile), true);
  assert.equal(session.handoffContext?.fromModule, "system");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs`
Expected: FAIL because terminal service does not persist descriptors/handoff ledger yet.

- [ ] **Step 3: Write minimal implementation**

`apps/api/modules/terminal/service.ts` additive excerpt

```ts
const descriptorStore = createTerminalSessionDescriptorStore({
  stateDir: path.join(config.openclawRoot, "terminal"),
  maxSessions: 50,
  maxCompletedAgeDays: 7,
});
const ledger = createTerminalSessionLedger({
  stateDir: path.join(config.openclawRoot, "terminal"),
  maxEvents: 1000,
  maxAgeDays: 14,
});

function persistSessionDescriptor(descriptor: TerminalSessionDescriptor): void {
  descriptorStore.upsert(descriptor);
}

function appendLedger(event: TerminalSessionLedgerEvent): void {
  ledger.append(event);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/api/modules/terminal/service.ts \
  apps/api/modules/terminal/routes.ts \
  tests/system/studio-web-terminal-route-session.test.mjs \
  tests/system/studio-web-terminal-workspace-shell.test.mjs

git commit -m "终端：接入会话持久化"
```

### Task 5: Recover persisted terminal descriptors in the workspace shell

**Files:**
- Modify: `apps/web-vue/src/features/terminal/api.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-session-registry.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- Modify: `apps/web-vue/src/features/terminal/terminal-route-sync.ts`
- Modify: `apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue`
- Modify: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`
- Modify: `tests/terminal/terminal-workspace-state.test.mjs`
- Modify: `tests/terminal/terminal-session-selectors.test.mjs`

- [ ] **Step 1: Write the failing tests**

```js
import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "tsx/esm";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stateUrl = `${pathToFileURL(path.join(rootDir, "apps/web-vue/src/features/terminal/terminal-workspace-state.ts")).href}?t=${Date.now()}`;

test("terminal workspace state can hydrate persisted recent sessions and restore active session", async () => {
  const { createTerminalWorkspaceState } = await import(stateUrl);
  const state = createTerminalWorkspaceState();

  state.hydratePersistedSessions([
    {
      sessionId: "session-1",
      title: "Bootstrap Repair",
      status: "detached",
      source: "system-handoff",
      sourceModule: "system",
      sourceAction: "bootstrap-repair",
      originRoute: "/system/events",
      canResume: true,
      lastActiveAt: "2026-04-14T10:05:00.000Z",
      recentOutputSummary: {
        tailText: "repair succeeded",
        lastError: "",
        lastCommandHint: "studio diagnostics collect",
        exitSummary: "completed",
        updatedAt: "2026-04-14T10:05:00.000Z",
      },
      handoffContext: {
        fromModule: "system",
        fromRoute: "/system/events",
        triggerType: "event-center",
        triggerLabel: "Bootstrap repair",
        targetEntity: "bootstrap",
        recommendedCommand: "studio diagnostics collect",
        relatedEventId: "evt-1",
      },
    },
  ]);

  assert.equal(state.activeSessionId.value, "session-1");
  assert.equal(state.recoverableSessions.value[0]?.sourceModule, "system");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/terminal/terminal-workspace-state.test.mjs tests/terminal/terminal-session-selectors.test.mjs`
Expected: FAIL because the workspace still relies on runtime-only registry state.

- [ ] **Step 3: Write minimal implementation**

`apps/web-vue/src/features/terminal/api.ts` excerpt

```ts
export function fetchTerminalSessionDescriptors() {
  return requestJson("/api/terminal/sessions");
}

export function fetchTerminalSessionDescriptor(sessionId: string) {
  return requestJson(`/api/terminal/sessions/${sessionId}`);
}
```

`apps/web-vue/src/features/terminal/terminal-workspace-state.ts` excerpt

```ts
function hydratePersistedSessions(descriptors: TerminalSessionDescriptor[]): void {
  registry.replacePersistedSessions(descriptors);
  if (!activeSessionId.value && descriptors[0]) {
    activeSessionId.value = descriptors[0].sessionId;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test tests/terminal/terminal-workspace-state.test.mjs tests/terminal/terminal-session-selectors.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  apps/web-vue/src/features/terminal/api.ts \
  apps/web-vue/src/features/terminal/terminal-session-registry.ts \
  apps/web-vue/src/features/terminal/terminal-workspace-state.ts \
  apps/web-vue/src/features/terminal/terminal-route-sync.ts \
  apps/web-vue/src/features/terminal/TerminalRecentSessionRail.vue \
  apps/web-vue/src/features/terminal/TerminalSessionPane.vue \
  tests/terminal/terminal-workspace-state.test.mjs \
  tests/terminal/terminal-session-selectors.test.mjs

git commit -m "终端：恢复持久会话"
```

### Task 6: Run the terminal persistence gate and capture follow-up split

**Files:**
- Modify: `docs/superpowers/plans/2026-04-14-terminal-persistence.md`
- Verify: `apps/api/modules/terminal/terminal-session-descriptor-store.ts`
- Verify: `apps/api/modules/terminal/terminal-session-ledger.ts`
- Verify: `apps/api/modules/terminal/terminal-session-summary.ts`
- Verify: `apps/api/modules/terminal/service.ts`
- Verify: `apps/web-vue/src/features/terminal/terminal-workspace-state.ts`
- Verify: `apps/web-vue/src/features/terminal/TerminalSessionPane.vue`

- [ ] **Step 1: Append the exit criteria to the plan footer**

```md
## Terminal persistence exit criteria

- Terminal sessions persist descriptor state in a local descriptor store.
- Handoff / attach / takeover lifecycle events are written to a local ledger.
- Recent output summary is persisted without storing the full transcript.
- `/terminal` and `/terminal/:sessionId` can recover session context from persisted descriptors.
- System → Terminal handoff context remains visible after refresh / re-entry.
- Targeted terminal persistence tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Full terminal transcript persistence
2. Transcript search / replay and richer audit views
```

- [ ] **Step 2: Run the terminal persistence verification gate**

Run: `node --test tests/terminal/terminal-session-summary.test.mjs tests/terminal/terminal-session-descriptor-store.test.mjs tests/terminal/terminal-session-ledger.test.mjs tests/terminal/terminal-workspace-state.test.mjs tests/terminal/terminal-session-selectors.test.mjs tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs && npm run typecheck:web && npm run typecheck:api`
Expected: PASS.

- [ ] **Step 3: Fix only the smallest seam that fails**

If the gate fails, fix only one of these seams before re-running:

- terminal descriptor store
- terminal ledger / summary
- terminal service persistence hook
- frontend descriptor recovery

Do not widen into full transcript persistence.

- [ ] **Step 4: Re-run the terminal persistence verification gate**

Run: `node --test tests/terminal/terminal-session-summary.test.mjs tests/terminal/terminal-session-descriptor-store.test.mjs tests/terminal/terminal-session-ledger.test.mjs tests/terminal/terminal-workspace-state.test.mjs tests/terminal/terminal-session-selectors.test.mjs tests/system/studio-web-terminal-route-session.test.mjs tests/system/studio-web-terminal-workspace-shell.test.mjs && npm run typecheck:web && npm run typecheck:api`
Expected: PASS end-to-end.

- [ ] **Step 5: Commit the closeout**

```bash
git add \
  docs/superpowers/plans/2026-04-14-terminal-persistence.md

git commit -m "终端：完成持久一期"
```

---

## Self-review

### Spec coverage

This plan covers the approved terminal persistence scope:

- session descriptor persistence
- handoff / attach ledger persistence
- recent output summary persistence
- `/terminal` + `/terminal/:sessionId` recovery path
- frontend recovery of persisted sessions and handoff context

It intentionally does **not** implement full transcript persistence, transcript search, or replay UI.

### Placeholder scan

No placeholders remain. Each task names exact files, tests, commands, and minimal code.

### Type consistency

The plan uses one terminal persistence vocabulary throughout:

- `TerminalSessionDescriptor`
- `TerminalSessionLedgerEvent`
- `TerminalRecentOutputSummary`
- `handoffContext`
- `recentOutputSummary`

The backend persists descriptors and ledger events, while the frontend restores the workspace from the same descriptor model.

## Terminal persistence exit criteria

- Terminal sessions persist descriptor state in a local descriptor store.
- Handoff / attach / takeover lifecycle events are written to a local ledger.
- Recent output summary is persisted without storing the full transcript.
- `/terminal` and `/terminal/:sessionId` can recover session context from persisted descriptors.
- System → Terminal handoff context remains visible after refresh / re-entry.
- Targeted terminal persistence tests pass.
- `npm run typecheck:web` and `npm run typecheck:api` pass.
- Every completed task is committed separately with a short Chinese message.

## Required follow-up plans

1. Full terminal transcript persistence
2. Transcript search / replay and richer audit views
