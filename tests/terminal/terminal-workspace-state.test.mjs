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

test("terminal route sync exports bind function", () => {
  assert.equal(typeof routeSyncModule.bindTerminalRouteSync, "function");
});

test("terminal route sync keeps active session and tabs aligned", async () => {
  const workspace = workspaceStateModule.createTerminalWorkspaceState();
  const route = {
    params: {
      sessionId: "term-route-1",
    },
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
