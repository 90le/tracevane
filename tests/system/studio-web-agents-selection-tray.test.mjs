import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = "/home/binbin/.openclaw/extensions/openclaw-studio";
const agentsWorkspaceLayout = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue"),
  "utf8",
);
const agentsControlPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/AgentsControlPage.vue"),
  "utf8",
);

test("agents workspace lifts navigation into the persistent shell and removes the old temporary tray pattern", () => {
  assert.match(agentsWorkspaceLayout, /agents-stage-tabs/);
  assert.match(agentsWorkspaceLayout, /agent-rail-group/);
  assert.match(agentsWorkspaceLayout, /默认入口 Agent|Default entry agent/);
  assert.match(agentsWorkspaceLayout, /openQuickConfig/);
  assert.match(agentsControlPage, /agents-overview-identity/);
  assert.doesNotMatch(agentsWorkspaceLayout, /AgentSelectionTray/);
  assert.doesNotMatch(agentsControlPage, /AgentSelectionTray/);
});
