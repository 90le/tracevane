import assert from "node:assert/strict";

import { createWorkspaceSeasonOneLiveModel } from "../../apps/web/src/features/workspace/shared/WorkspaceSeasonOneLiveAdapter";

const live = createWorkspaceSeasonOneLiveModel({
  rootLabel: "project-root",
  activePath: "DESIGN.md",
  openFiles: ["DESIGN.md", "apps/web/src/features/workspace/WorkspacePage.tsx"],
  gitChanges: 3,
  evidenceItems: 2,
  aiContextItems: 4,
  terminalState: "passed",
  agentState: "waiting-review",
  lastRunLabel: "Season One browser smoke",
  activeContent:
    "# Tracevane Design\n\nSeason One reads real files into the primary stage.",
  activeContentLanguage: "md",
  activeContentLabel: "DESIGN.md · 70 bytes",
  activeContentEditable: true,
});

assert.equal(live.identity.rootLabel, "project-root");
assert.equal(live.canvas.fileName, "DESIGN.md");
assert.equal(live.canvas.badge, "open");
assert.match(live.canvas.codeSample, /Live file preview: DESIGN\.md · md/);
assert.match(live.canvas.codeSample, /Season One reads real files/);
assert.match(live.canvas.writingBody, /Live document loaded from DESIGN\.md/);
assert.match(live.canvas.writingBody, /DESIGN\.md · 70 bytes/);
assert.match(live.mission.currentBody, /DESIGN\.md/);
assert.match(
  live.mission.resourceSummary,
  /2 open files · 3 Git changes · 4 AI contexts · 2 evidence items/,
);
assert.equal(live.resources[0]?.label, "DESIGN.md");
assert.ok(
  live.resources.some(
    (item) => item.id === "git-live" && item.state === "review",
  ),
);
assert.ok(
  live.resources.some(
    (item) => item.id === "ai-context-live" && item.state === "ready",
  ),
);
assert.ok(
  live.resources.some(
    (item) => item.id === "evidence-live" && item.state === "ready",
  ),
);
assert.match(live.aiPartner.contextValue, /4 AI contexts/);
assert.match(live.aiPartner.contextValue, /2 evidence items/);
assert.match(live.aiPartner.nextActionValue, /waiting for human review/);
assert.equal(live.evidence.title, "Evidence cockpit");
assert.equal(live.runPanel.badge, "passed");
assert.match(live.runPanel.transcript, /Season One browser smoke/);
assert.equal(live.status.label, "Season One Live Adapter");
assert.equal(live.status.health, "evidence ready");

const blocked = createWorkspaceSeasonOneLiveModel({
  activePath: "README.md",
  evidenceItems: 0,
  aiContextItems: 1,
  terminalState: "failed",
});

assert.equal(blocked.evidence.title, "Evidence required");
assert.equal(blocked.status.health, "run failed");
assert.ok(
  blocked.resources.some(
    (item) => item.id === "ai-context-live" && item.state === "ready",
  ),
);
assert.ok(
  blocked.resources.some(
    (item) => item.id === "evidence-live" && item.state === "blocked",
  ),
);
assert.match(blocked.runPanel.transcript, /failed/);
