import test from "node:test";
import assert from "node:assert/strict";
import { nextTick } from "vue";
import "tsx/esm";

const workspaceStateModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-workspace-state.ts");
const routeSyncModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-route-sync.ts");

test("terminal workspace tracks tabs active session and recoverable sessions", () => {
  assert.equal(
    typeof workspaceStateModule.createTerminalWorkspaceState,
    "function",
  );

  const workspace = workspaceStateModule.createTerminalWorkspaceState();

  workspace.registerSession({
    sessionId: "term-1",
    title: "Health Check",
    status: "running",
    source: "system_action",
    canResume: true,
    controlState: "controller",
    updatedAt: "2026-04-13T10:00:00.000Z",
  });

  workspace.registerSession({
    sessionId: "term-2",
    title: "Gateway Logs",
    status: "detached",
    source: "manual",
    canResume: true,
    controlState: "observer",
    updatedAt: "2026-04-13T10:01:00.000Z",
  });

  workspace.registerSession({
    sessionId: "term-3",
    title: "Completed Run",
    status: "completed",
    source: "manual",
    canResume: false,
    controlState: "observer",
    updatedAt: "2026-04-13T10:02:00.000Z",
  });

  workspace.setActiveSession("term-2");

  assert.deepEqual(workspace.tabOrder.value, ["term-1", "term-2", "term-3"]);
  assert.equal(workspace.activeSessionId.value, "term-2");
  assert.deepEqual(
    workspace.recoverableSessions.value.map((item) => item.sessionId),
    ["term-2", "term-1"],
  );
});

test("terminal workspace recomputes recoverable sessions after register", () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();

  assert.deepEqual(workspace.recoverableSessions.value, []);

  workspace.registerSession({
    sessionId: "term-reactive",
    title: "Reactive Session",
    status: "running",
    source: "manual",
    canResume: true,
    controlState: "controller",
    updatedAt: "2026-04-13T10:03:00.000Z",
  });

  assert.deepEqual(
    workspace.recoverableSessions.value.map((item) => item.sessionId),
    ["term-reactive"],
  );
});

test("terminal workspace hydrate keeps persisted sessions closed by default", () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();

  workspace.hydrateSessions([
    {
      sessionId: "term-backend-2",
      title: "Backend B",
      status: "running",
      source: "system_action",
      canResume: true,
      controlState: "controller",
      updatedAt: "2026-04-13T10:05:00.000Z",
    },
    {
      sessionId: "term-backend-1",
      title: "Backend A",
      status: "detached",
      source: "manual",
      canResume: true,
      controlState: "observer",
      updatedAt: "2026-04-13T10:04:00.000Z",
    },
  ]);

  assert.deepEqual(workspace.tabOrder.value, []);
  assert.equal(workspace.activeSessionId.value, null);
  assert.deepEqual(
    workspace.recoverableSessions.value.map((item) => item.sessionId),
    ["term-backend-2", "term-backend-1"],
  );
});

test("terminal workspace persists tab order and active session across refresh", () => {
  const memoryStorage = {
    records: new Map(),
    getItem(key) {
      return this.records.has(key) ? this.records.get(key) : null;
    },
    setItem(key, value) {
      this.records.set(key, value);
    },
    removeItem(key) {
      this.records.delete(key);
    },
  };

  const storageKey = "terminal.descriptors.persist-ui.test";
  const descriptors = [
    {
      sessionId: "term-a",
      title: "Session A",
      status: "running",
      source: "manual",
      canResume: true,
      controlState: "controller",
      updatedAt: "2026-04-13T10:05:00.000Z",
    },
    {
      sessionId: "term-b",
      title: "Session B",
      status: "detached",
      source: "manual",
      canResume: true,
      controlState: "observer",
      updatedAt: "2026-04-13T10:04:00.000Z",
    },
  ];

  const workspace = workspaceStateModule.createTerminalWorkspaceState({
    storage: memoryStorage,
    storageKey,
  });

  workspace.hydrateSessions(descriptors);
  workspace.openTab("term-a");
  workspace.openTab("term-b");
  workspace.setActiveSession("term-a");

  assert.deepEqual(workspace.tabOrder.value, ["term-a", "term-b"]);
  assert.equal(workspace.activeSessionId.value, "term-a");

  const refreshedWorkspace = workspaceStateModule.createTerminalWorkspaceState({
    storage: memoryStorage,
    storageKey,
  });
  refreshedWorkspace.hydrateSessions(descriptors);

  assert.deepEqual(refreshedWorkspace.tabOrder.value, ["term-a", "term-b"]);
  assert.equal(refreshedWorkspace.activeSessionId.value, "term-a");
});

test("terminal workspace hydrate reconciles removed persisted sessions", () => {
  const memoryStorage = {
    records: new Map(),
    getItem(key) {
      return this.records.has(key) ? this.records.get(key) : null;
    },
    setItem(key, value) {
      this.records.set(key, value);
    },
    removeItem(key) {
      this.records.delete(key);
    },
  };

  const storageKey = "terminal.descriptors.reconcile.test";
  const workspace = workspaceStateModule.createTerminalWorkspaceState({
    storage: memoryStorage,
    storageKey,
  });

  workspace.hydrateSessions([
    {
      sessionId: "term-a",
      title: "Session A",
      status: "running",
      source: "manual",
      canResume: true,
      controlState: "controller",
      updatedAt: "2026-04-13T10:05:00.000Z",
    },
    {
      sessionId: "term-b",
      title: "Session B",
      status: "detached",
      source: "manual",
      canResume: true,
      controlState: "observer",
      updatedAt: "2026-04-13T10:04:00.000Z",
    },
  ]);

  workspace.openTab("term-b");
  assert.deepEqual(workspace.tabOrder.value, ["term-b"]);
  assert.equal(workspace.activeSessionId.value, "term-b");

  workspace.hydrateSessions([
    {
      sessionId: "term-a",
      title: "Session A",
      status: "running",
      source: "manual",
      canResume: true,
      controlState: "controller",
      updatedAt: "2026-04-13T10:06:00.000Z",
    },
  ]);

  assert.equal(workspace.sessions.value["term-b"], undefined);
  assert.deepEqual(workspace.tabOrder.value, []);
  assert.equal(workspace.activeSessionId.value, null);
  assert.deepEqual(
    workspace.recoverableSessions.value.map((item) => item.sessionId),
    ["term-a"],
  );

  const persisted = JSON.parse(memoryStorage.getItem(storageKey));
  assert.deepEqual(
    persisted.map((item) => item.sessionId),
    ["term-a"],
  );
});

test("terminal workspace restores recoverable sessions from persisted descriptors", () => {
  const memoryStorage = {
    records: new Map(),
    getItem(key) {
      return this.records.has(key) ? this.records.get(key) : null;
    },
    setItem(key, value) {
      this.records.set(key, value);
    },
    removeItem(key) {
      this.records.delete(key);
    },
  };

  memoryStorage.setItem(
    "terminal.descriptors.test",
    JSON.stringify([
      {
        sessionId: "term-persisted-recent",
        title: "Persisted recent",
        status: "failed",
        source: "linked_context",
        canResume: false,
        controlState: "observer",
        updatedAt: "2026-04-13T10:08:00.000Z",
        handoffContext: {
          fromClientId: "console-a",
          toClientId: "console-b",
          reason: "host_switched",
          handoffAt: "2026-04-13T10:07:58.000Z",
        },
        recentOutputSummary: {
          tailText: "deploy failed",
          byteLength: 13,
          truncated: false,
          capturedAt: "2026-04-13T10:07:59.000Z",
        },
      },
    ]),
  );

  const workspace = workspaceStateModule.createTerminalWorkspaceState({
    storage: memoryStorage,
    storageKey: "terminal.descriptors.test",
  });

  assert.deepEqual(
    workspace.recoverableSessions.value.map((item) => item.sessionId),
    ["term-persisted-recent"],
  );
  assert.equal(
    workspace.recoverableSessions.value[0]?.handoffContext?.reason,
    "host_switched",
  );
});

test("terminal workspace groups recent and ended sessions without overlap", () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();

  workspace.hydrateSessions([
    {
      sessionId: "term-lost",
      title: "Lost session",
      status: "lost",
      source: "linked_context",
      canResume: false,
      controlState: "observer",
      updatedAt: "2026-04-13T10:07:00.000Z",
    },
    {
      sessionId: "term-running",
      title: "Running session",
      status: "running",
      source: "manual",
      canResume: true,
      controlState: "controller",
      updatedAt: "2026-04-13T10:08:00.000Z",
    },
    {
      sessionId: "term-completed-persisted",
      title: "Persisted completed",
      status: "completed",
      source: "linked_context",
      canResume: false,
      controlState: "observer",
      updatedAt: "2026-04-13T10:06:00.000Z",
      recentOutputSummary: {
        tailText: "task finished",
        byteLength: 13,
        truncated: false,
        capturedAt: "2026-04-13T10:05:59.000Z",
      },
    },
  ]);

  assert.deepEqual(
    workspace.recentSessions.value.map((item) => item.sessionId),
    ["term-running"],
  );
  assert.deepEqual(
    workspace.endedSessions.value.map((item) => item.sessionId),
    ["term-lost", "term-completed-persisted"],
  );
  assert.equal(
    workspace.recentSessions.value.some(
      (item) => item.sessionId === "term-lost",
    ),
    false,
  );
  assert.deepEqual(
    workspace.recoverableSessions.value.map((item) => item.sessionId),
    ["term-running", "term-completed-persisted"],
  );
});

test("terminal workspace lifecycle transitions are applied to tab and session state", () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();

  workspace.hydrateSessions([
    {
      sessionId: "term-persisted",
      title: "Persisted Session",
      status: "detached",
      source: "manual",
      canResume: true,
      controlState: "observer",
      updatedAt: "2026-04-13T10:10:00.000Z",
    },
  ]);

  assert.deepEqual(workspace.tabOrder.value, []);
  assert.equal(workspace.activeSessionId.value, null);

  workspace.openTab("term-persisted");
  assert.deepEqual(workspace.tabOrder.value, ["term-persisted"]);
  assert.equal(workspace.activeSessionId.value, "term-persisted");

  workspace.renameSession("term-persisted", "Renamed Session");
  assert.equal(
    workspace.sessions.value["term-persisted"]?.title,
    "Renamed Session",
  );

  workspace.endSession("term-persisted");
  assert.equal(workspace.sessions.value["term-persisted"]?.status, "completed");
  assert.equal(workspace.sessions.value["term-persisted"]?.canResume, false);

  workspace.deleteSession("term-persisted");
  assert.equal(workspace.sessions.value["term-persisted"], undefined);
  assert.deepEqual(workspace.tabOrder.value, []);
  assert.equal(workspace.activeSessionId.value, null);
});

test("terminal workspace open/recent/ended groups are mutually exclusive for opened completed sessions", () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();

  workspace.hydrateSessions([
    {
      sessionId: "term-ended",
      title: "Ended Session",
      status: "completed",
      source: "manual",
      canResume: false,
      controlState: "observer",
      updatedAt: "2026-04-13T10:11:00.000Z",
    },
  ]);

  assert.deepEqual(
    workspace.openSessions.value.map((item) => item.sessionId),
    [],
  );
  assert.deepEqual(
    workspace.endedSessions.value.map((item) => item.sessionId),
    ["term-ended"],
  );

  workspace.openTab("term-ended");

  assert.deepEqual(
    workspace.openSessions.value.map((item) => item.sessionId),
    ["term-ended"],
  );
  assert.deepEqual(
    workspace.endedSessions.value.map((item) => item.sessionId),
    [],
  );
  assert.deepEqual(
    workspace.recentSessions.value.map((item) => item.sessionId),
    [],
  );
});

test("terminal workspace delete rejects running and detached sessions", () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();

  workspace.hydrateSessions([
    {
      sessionId: "term-running",
      title: "Running Session",
      status: "running",
      source: "manual",
      canResume: true,
      controlState: "controller",
      updatedAt: "2026-04-13T10:12:00.000Z",
    },
    {
      sessionId: "term-detached",
      title: "Detached Session",
      status: "detached",
      source: "manual",
      canResume: true,
      controlState: "observer",
      updatedAt: "2026-04-13T10:12:30.000Z",
    },
  ]);

  assert.throws(() => workspace.deleteSession("term-running"), {
    message: "terminal_session_delete_requires_ended_state",
  });
  assert.throws(() => workspace.deleteSession("term-detached"), {
    message: "terminal_session_delete_requires_ended_state",
  });

  assert.ok(workspace.sessions.value["term-running"]);
  assert.ok(workspace.sessions.value["term-detached"]);
});

test("terminal route sync exports bind function", () => {
  assert.equal(typeof routeSyncModule.bindTerminalRouteSync, "function");
});

test("terminal route sync keeps active session and tabs aligned", async () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();
  const route = {
    params: {
      sessionId: "term-route-1",
    },
    query: {},
  };
  const routerCalls = [];
  const router = {
    replace(path) {
      routerCalls.push(path);
      return Promise.resolve();
    },
  };

  routeSyncModule.bindTerminalRouteSync({
    activeSessionId: workspace.activeSessionId,
    setActiveSession: workspace.setActiveSession,
    registerSession: workspace.registerSession,
    route,
    router,
  });

  await nextTick();

  assert.equal(workspace.activeSessionId.value, "term-route-1");
  assert.deepEqual(workspace.tabOrder.value, ["term-route-1"]);
  assert.deepEqual(
    workspace.tabs.value.map((item) => item.sessionId),
    ["term-route-1"],
  );
  assert.equal(routerCalls.length, 0);
});

test("terminal route sync recovers persisted descriptor metadata by route session id", async () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();
  const route = {
    params: {
      sessionId: "term-persisted-1",
    },
    query: {
      fromModule: "system",
      fromRoute: "/system",
      triggerType: "system-control",
      triggerLabel: "System handoff",
      targetEntity: "bootstrap",
      recommendedCommand: "studio diagnostics collect",
      relatedEventId: "evt-1",
    },
  };
  const router = {
    replace() {
      return Promise.resolve();
    },
  };

  routeSyncModule.bindTerminalRouteSync({
    activeSessionId: workspace.activeSessionId,
    setActiveSession: workspace.setActiveSession,
    registerSession: workspace.registerSession,
    route,
    router,
    resolveSessionDescriptor: async (sessionId) => ({
      sessionId,
      title: "Recovered persisted session",
      status: "completed",
      source: "linked_context",
      canResume: false,
      controlState: "observer",
      updatedAt: "2026-04-13T11:11:00.000Z",
      handoffContext: {
        fromModule: "system",
        fromRoute: "/system",
        triggerType: "system-control",
        triggerLabel: "System handoff",
        targetEntity: "bootstrap",
        recommendedCommand: "studio diagnostics collect",
        relatedEventId: "evt-1",
      },
      recentOutputSummary: {
        tailText: "npm run build failed",
        lastError: "exit code 1",
        lastCommandHint: "npm run build",
        exitSummary: "failed",
        updatedAt: "2026-04-13T11:10:30.000Z",
      },
    }),
  });

  await nextTick();
  await Promise.resolve();

  assert.equal(workspace.activeSessionId.value, "term-persisted-1");
  assert.deepEqual(workspace.tabOrder.value, ["term-persisted-1"]);
  assert.equal(
    workspace.sessions.value["term-persisted-1"]?.title,
    "Recovered persisted session",
  );
  assert.equal(
    workspace.sessions.value["term-persisted-1"]?.handoffContext?.triggerLabel,
    "System handoff",
  );
  assert.equal(
    workspace.sessions.value["term-persisted-1"]?.recentOutputSummary?.tailText,
    "npm run build failed",
  );
});
