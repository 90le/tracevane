import assert from "node:assert/strict";

import {
  createWorkspaceSeasonOneAdapterInputFromSnapshot,
  createWorkspaceSeasonOneAiContextSnapshot,
  createWorkspaceSeasonOneDemoSourceSnapshot,
  createWorkspaceSeasonOneEvidenceSnapshot,
  createWorkspaceSeasonOneFilesSummarySnapshot,
  createWorkspaceSeasonOneStoredSessionSnapshot,
  mergeWorkspaceSeasonOneSourceSnapshots,
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
  aiContextItems: 3.4,
  terminalState: "running",
  agentState: "drafting",
  lastRunLabel: " npm test ",
  viewportCoverage: " phone live ",
});

assert.equal(adapterInput.rootLabel, "project-root");
assert.equal(adapterInput.activePath, "docs/Plan.md");
assert.deepEqual(adapterInput.openFiles, [
  "docs/Plan.md",
  "README.md",
  "src/index.ts",
]);
assert.equal(adapterInput.gitChanges, 2);
assert.equal(adapterInput.evidenceItems, 0);
assert.equal(adapterInput.aiContextItems, 3);
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
  aiContextItems: 0,
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
  createWorkspaceSeasonOneStoredSessionSnapshot({
    getItem: () => JSON.stringify({ sideOpen: true }),
  }),
  null,
);
assert.equal(createWorkspaceSeasonOneStoredSessionSnapshot(undefined), null);

const filesSnapshot = createWorkspaceSeasonOneFilesSummarySnapshot(
  {
    checkedAt: "2026-06-29T00:00:00.000Z",
    defaultRootId: "workspace-root",
    roots: [
      {
        id: "project-root",
        labelZh: "项目",
        labelEn: "Project",
        descriptionZh: "项目根",
        descriptionEn: "Project root",
        absolutePath: "/project",
      },
      {
        id: "workspace-root",
        labelZh: "工作区",
        labelEn: "Workspace",
        descriptionZh: "工作区根",
        descriptionEn: "Workspace root",
        absolutePath: "/workspace",
        preferred: true,
      },
    ],
  },
  {
    rootLabel: "project-root",
    activePath: "docs/Stored.md",
    openFiles: ["docs/Stored.md"],
    gitChanges: 1,
  },
);

assert.equal(filesSnapshot?.rootLabel, "project-root");
assert.equal(filesSnapshot?.activePath, "docs/Stored.md");
assert.deepEqual(filesSnapshot?.openFiles, ["docs/Stored.md"]);

const defaultRootSnapshot = createWorkspaceSeasonOneFilesSummarySnapshot({
  checkedAt: "2026-06-29T00:00:00.000Z",
  defaultRootId: "workspace-root",
  roots: [
    {
      id: "project-root",
      labelZh: "项目",
      labelEn: "Project",
      descriptionZh: "项目根",
      descriptionEn: "Project root",
      absolutePath: "/project",
    },
    {
      id: "workspace-root",
      labelZh: "工作区",
      labelEn: "Workspace",
      descriptionZh: "工作区根",
      descriptionEn: "Workspace root",
      absolutePath: "/workspace",
    },
  ],
});

assert.equal(defaultRootSnapshot?.rootLabel, "project-root");
assert.equal(defaultRootSnapshot?.activePath, "docs/DESIGN.md");
assert.equal(defaultRootSnapshot?.evidenceItems, 3);
assert.equal(defaultRootSnapshot?.aiContextItems, 2);
assert.equal(createWorkspaceSeasonOneFilesSummarySnapshot(undefined), null);

const validAiContextItem = {
  id: "document:docs/DESIGN.md",
  kind: "document",
  path: "docs/DESIGN.md",
  title: "DESIGN.md",
  context: "@document\npath: docs/DESIGN.md",
  addedAt: "2026-06-29T00:00:00.000Z",
};
const aiContextSnapshot = createWorkspaceSeasonOneAiContextSnapshot({
  getItem(key) {
    assert.equal(key, "tracevane.workspace.ai-context-basket.v1");
    return JSON.stringify([
      validAiContextItem,
      { id: "invalid" },
      { ...validAiContextItem, id: "document:README.md", path: "README.md" },
    ]);
  },
});

assert.deepEqual(aiContextSnapshot, {
  aiContextItems: 2,
  agentState: "drafting",
  lastRunLabel: "AI context basket ready",
});

const emptyAiContextSnapshot = createWorkspaceSeasonOneAiContextSnapshot({
  getItem: () => JSON.stringify([]),
});
assert.deepEqual(emptyAiContextSnapshot, {
  aiContextItems: 0,
  agentState: "idle",
  lastRunLabel: undefined,
});
assert.equal(
  createWorkspaceSeasonOneAiContextSnapshot({ getItem: () => "not-json" }),
  null,
);

const validEvidenceRecord = {
  id: "evidence-1",
  source: "verification",
  kind: "verification",
  title: "Browser smoke",
  summary: "Season One viewport smoke passed",
  refs: {
    command: "node tests/workspace/workspace-season-one-responsive.smoke.mjs",
  },
  createdAt: "2026-06-29T00:00:00.000Z",
};
const evidenceSnapshot = createWorkspaceSeasonOneEvidenceSnapshot({
  getItem(key) {
    assert.equal(key, "tracevane.workspace.evidence-basket.v1");
    return JSON.stringify([
      validEvidenceRecord,
      { id: "invalid" },
      { ...validEvidenceRecord, id: "evidence-2" },
    ]);
  },
});

assert.deepEqual(evidenceSnapshot, {
  evidenceItems: 2,
  agentState: "waiting-review",
});

const emptyEvidenceSnapshot = createWorkspaceSeasonOneEvidenceSnapshot({
  getItem: () => JSON.stringify([]),
});
assert.deepEqual(emptyEvidenceSnapshot, {
  evidenceItems: 0,
  agentState: "idle",
});
assert.equal(
  createWorkspaceSeasonOneEvidenceSnapshot({ getItem: () => "not-json" }),
  null,
);

const mergedEvidence = mergeWorkspaceSeasonOneSourceSnapshots(
  {
    activePath: "README.md",
    openFiles: ["README.md"],
    evidenceItems: 3,
    aiContextItems: 1,
  },
  evidenceSnapshot,
);
assert.equal(mergedEvidence.activePath, "README.md");
assert.deepEqual(mergedEvidence.openFiles, ["README.md"]);
assert.equal(mergedEvidence.evidenceItems, 2);
assert.equal(mergedEvidence.aiContextItems, 1);
assert.equal(mergedEvidence.agentState, "waiting-review");
