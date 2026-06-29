import assert from "node:assert/strict";

import { createWorkspaceSeasonOneDemoAdapterInput } from "../../apps/web/src/features/workspace/season-one/useWorkspaceSeasonOneLiveModel";
import { createWorkspaceSeasonOneLiveModel } from "../../apps/web/src/features/workspace/shared/WorkspaceSeasonOneLiveAdapter";

const first = createWorkspaceSeasonOneDemoAdapterInput();
const second = createWorkspaceSeasonOneDemoAdapterInput();

assert.notEqual(first.openFiles, second.openFiles);
assert.deepEqual(first.openFiles, second.openFiles);
assert.equal(first.rootLabel, "project-root");
assert.equal(first.activePath, "docs/DESIGN.md");
assert.equal(first.evidenceItems, 3);
assert.equal(first.terminalState, "passed");
assert.equal(first.agentState, "waiting-review");

const model = createWorkspaceSeasonOneLiveModel(first);
assert.equal(model.status.label, "Season One Live Adapter");
assert.equal(model.canvas.fileName, "docs/DESIGN.md");
assert.match(model.aiPartner.nextActionValue, /waiting for human review/);
assert.match(model.runPanel.transcript, /Season One browser smoke/);
