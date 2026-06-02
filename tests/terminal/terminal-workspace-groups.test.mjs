import test from "node:test";
import assert from "node:assert/strict";
import "tsx/esm";

const workspaceGroupModule =
  await import("../../apps/web-vue/src/features/terminal/terminal-workspace-groups.ts");

test("terminal workspace groups collect sessions by normalized cwd", () => {
  const sessions = [
    { sessionId: "a-1", cwd: "/workspace/a/" },
    { sessionId: "a-2", cwd: "/workspace/a" },
    { sessionId: "b-1", cwd: "C:\\workspace\\b\\" },
    { sessionId: "default-1", cwd: "" },
  ];

  const groups = workspaceGroupModule.buildTerminalWorkspaceGroups(sessions);

  assert.equal(groups[0].id, workspaceGroupModule.TERMINAL_WORKSPACE_ALL_GROUP_ID);
  assert.equal(groups[0].count, 4);
  assert.deepEqual(groups[0].sessionIds, ["a-1", "a-2", "b-1", "default-1"]);
  assert.deepEqual(
    groups.map((group) => [group.id, group.label, group.count]),
    [
      ["all", "All", 4],
      ["cwd:/workspace/a", "a", 2],
      ["cwd:C:/workspace/b", "b", 1],
      [workspaceGroupModule.TERMINAL_WORKSPACE_DEFAULT_GROUP_ID, "Default", 1],
    ],
  );
});

test("terminal workspace groups filter tabs for the selected directory group", () => {
  const sessions = [
    { sessionId: "a-1", cwd: "/workspace/a" },
    { sessionId: "b-1", cwd: "/workspace/b" },
    { sessionId: "a-2", cwd: "/workspace/a/" },
  ];

  assert.deepEqual(
    workspaceGroupModule
      .filterTerminalSessionsByWorkspaceGroup(sessions, "cwd:/workspace/a")
      .map((session) => session.sessionId),
    ["a-1", "a-2"],
  );
  assert.deepEqual(
    workspaceGroupModule
      .filterTerminalSessionsByWorkspaceGroup(
        sessions,
        workspaceGroupModule.TERMINAL_WORKSPACE_ALL_GROUP_ID,
      )
      .map((session) => session.sessionId),
    ["a-1", "b-1", "a-2"],
  );
});

test("terminal workspace group ids are stable for missing and normalized cwd values", () => {
  assert.equal(
    workspaceGroupModule.resolveTerminalSessionWorkspaceGroupId({ cwd: null }),
    workspaceGroupModule.TERMINAL_WORKSPACE_DEFAULT_GROUP_ID,
  );
  assert.equal(
    workspaceGroupModule.resolveTerminalSessionWorkspaceGroupId({ cwd: " /tmp/project// " }),
    "cwd:/tmp/project",
  );
  assert.equal(
    workspaceGroupModule.normalizeTerminalWorkspaceCwd("C:\\tmp\\project\\"),
    "C:/tmp/project",
  );
});
