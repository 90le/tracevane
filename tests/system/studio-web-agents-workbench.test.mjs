import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = "/home/binbin/.openclaw/extensions/openclaw-studio";
const agentsWorkspaceLayout = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue"),
  "utf8",
);
const agentsOverviewPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/AgentsControlPage.vue"),
  "utf8",
);

test("agents workspace uses a persistent left rail and stage tabs instead of the old ledger landing page", () => {
  assert.match(agentsWorkspaceLayout, /agents-workspace-shell/);
  assert.match(agentsWorkspaceLayout, /agent-rail-list/);
  assert.match(agentsWorkspaceLayout, /agents-stage-tabs/);
  assert.match(agentsWorkspaceLayout, /agent-rail-group/);
  assert.match(agentsWorkspaceLayout, /默认入口 Agent|Default entry agent/);
  assert.match(agentsWorkspaceLayout, /defaultRailAgents/);
  assert.match(agentsWorkspaceLayout, /regularRailAgents/);
  assert.match(agentsWorkspaceLayout, /openQuickConfig/);
  assert.match(agentsWorkspaceLayout, /openCreateModal/);
  assert.match(agentsWorkspaceLayout, /selectedAgentId/);
  assert.match(agentsWorkspaceLayout, /fetchAgentsSummary/);
  assert.match(agentsWorkspaceLayout, /fetchAgentDetail/);
  assert.doesNotMatch(agentsWorkspaceLayout, /agents-ledger-shell/);
  assert.doesNotMatch(agentsWorkspaceLayout, /agents-ledger-table/);
});

test("agents overview page focuses on selected-agent context instead of rendering the full roster again", () => {
  assert.match(agentsOverviewPage, /agents-overview-grid/);
  assert.match(agentsOverviewPage, /agents-overview-card/);
  assert.match(agentsOverviewPage, /agents-overview-card--primary/);
  assert.match(agentsOverviewPage, /agents-overview-identity/);
  assert.match(agentsOverviewPage, /agents-overview-quick-edit/);
  assert.match(agentsOverviewPage, /recentSessions/);
  assert.match(agentsOverviewPage, /detail\.bindings/);
  assert.doesNotMatch(agentsOverviewPage, /agents-overview-defaults/);
  assert.doesNotMatch(agentsOverviewPage, /默认入口 vs 全局默认配置|Default entry vs global defaults/);
  assert.doesNotMatch(agentsOverviewPage, /Document Status|文档状态/);
  assert.doesNotMatch(agentsOverviewPage, /agents-overview-doc-list/);
  assert.doesNotMatch(agentsOverviewPage, /agents-ledger-shell/);
  assert.doesNotMatch(agentsOverviewPage, /agents-ledger-table/);
});
