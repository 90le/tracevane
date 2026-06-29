import assert from "node:assert/strict";

import {
  createWorkspaceSeasonOneAdapterInputFromSnapshot,
  createWorkspaceSeasonOneDemoSourceSnapshot,
  createWorkspaceSeasonOneStoredSessionSnapshot,
} from "../../apps/web/src/features/workspace/season-one/useWorkspaceSeasonOneLiveModel";

const snapshot = createWorkspaceSeasonOneDemoSourceSnapshot();
const secondSnapshot = createWorkspaceSeasonOneDemoSourceSnapshot();

assert.notEqual(snapshot.openFiles, secondSnapshot.openFiles);
assert.equal(snapshot.activePath, "docs/DESIGN.md");
assert.equal(snapshot.openFiles?.[0], "docs/DESIGN.md");

const adapterInput = createWorkspaceSeasonOneAdapterInputFromSnapshot({
  rootLabel: "  project-root  ",
  activePath: " docs/Plan.md ",
  openFiles: ["README.md", "docs/Plan.md", "  ", "src/index.ts"],
  gitChanges: 2.7,
  evidenceItems: -1,
  terminalState: "running",
  agentState: "drafting",
  lastRunLabel: " npm test ",
  viewportCoverage: " phone live ",
});

assert.equal(adapterInput.rootLabel, "project-root");
assert.equal(adapterInput.activePath, "docs/Plan.md");
assert.deepEqual(adapterInput.openFiles, ["docs/Plan.md", "README.md", "src/index.ts"]);
assert.equal(adapterInput.gitChanges, 2);
assert.equal(adapterInput.evidenceItems, 0);
assert.equal(adapterInput.terminalState, "running");
assert.equal(adapterInput.agentState, "drafting");
assert.equal(adapterInput.lastRunLabel, "npm test");
assert.equal(adapterInput.viewportCoverage, "phone live");

const fallback = createWorkspaceSeasonOneAdapterInputFromSnapshot({
  openFiles: [" notes.md "],
});

assert.equal(fallback.activePath, "notes.md");
assert.equal(fallback.terminalState, "idle");
assert.equal(fallback.agentState, "idle");


const stored = createWorkspaceSeasonOneStoredSessionSnapshot({
  getItem(key) {
    assert.equal(key, "tracevane.workspace.session.v1");
    return JSON.stringify({
      rootId: "project-root",
      activePath: "docs/Stored.md",
      gitDiffTarget: {
        path: "docs/Stored.md",
        staged: false,
        untracked: false,
        kind: "modified",
      },
    });
  },
});

assert.deepEqual(stored, {
  rootLabel: "project-root",
  activePath: "docs/Stored.md",
  openFiles: ["docs/Stored.md"],
  gitChanges: 1,
  evidenceItems: 0,
  terminalState: "idle",
  agentState: "idle",
  lastRunLabel: "Workspace session restore",
  viewportCoverage: "desktop · tablet · phone live",
});

assert.equal(
  createWorkspaceSeasonOneStoredSessionSnapshot({ getItem: () => "not-json" }),
  null,
);
assert.equal(
  createWorkspaceSeasonOneStoredSessionSnapshot({ getItem: () => JSON.stringify({ sideOpen: true }) }),
  null,
);
assert.equal(createWorkspaceSeasonOneStoredSessionSnapshot(undefined), null);
