import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const agentsWorkspaceLayout = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue"),
  "utf8",
);
const agentsOverviewPage = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/AgentsControlPage.vue"),
  "utf8",
);
const agentsWorkspaceCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/features/agents/agents-workspace.css"),
  "utf8",
);
const workbenchCss = fs.readFileSync(
  path.join(rootDir, "apps/web-vue/src/shared/styles/studio-workbench.css"),
  "utf8",
);

test("agents workspace uses a persistent object list and top task bar instead of the old ledger landing page", () => {
  assert.match(agentsWorkspaceLayout, /agents-workspace-shell/);
  assert.match(agentsWorkspaceLayout, /agent-rail-list/);
  assert.match(agentsWorkspaceLayout, /agents-task-nav/);
  assert.doesNotMatch(agentsWorkspaceLayout, /agents-stage-tabs|mobile-stage-tabs/);
  assert.match(agentsWorkspaceLayout, /agent-rail-group/);
  assert.match(agentsWorkspaceLayout, /默认入口 Agent|Default entry agent/);
  assert.match(agentsWorkspaceLayout, /在主工作区顶部切换人设、路由、会话和运行配置|from the top of the workspace/);
  assert.match(agentsWorkspaceLayout, /进入任务工作区|open the task workspace/);
  assert.doesNotMatch(agentsWorkspaceLayout, /右侧工作台|right side|right-side/);
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
  assert.match(agentsOverviewPage, /agents-overview-workbench/);
  assert.match(agentsOverviewPage, /agents-identity-strip/);
  assert.match(agentsOverviewPage, /agents-insight-pane/);
  assert.match(agentsOverviewPage, /agents-overview-identity/);
  assert.match(agentsOverviewPage, /agents-overview-quick-edit/);
  assert.match(agentsOverviewPage, /切换顶部任务条|switch the top task bar/);
  assert.match(agentsOverviewPage, /顶部任务条会切换到概览、人设、路由、会话或运行任务|top task bar switches to overview, persona, routing, sessions, or runtime tasks/);
  assert.doesNotMatch(agentsOverviewPage, /右侧任务区|右侧会切换|right stage|right-side/);
  assert.match(agentsOverviewPage, /recentSessions/);
  assert.match(agentsOverviewPage, /detail\.bindings/);
  assert.doesNotMatch(agentsOverviewPage, /agents-command-center|agents-stream-pane|agents-overview-card|agents-stage-empty-card/);
  assert.match(agentsWorkspaceCss, /\.agents-overview-workbench\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(agentsWorkspaceCss, /\.agents-identity-strip\s*\{[\s\S]*border-left:\s*4px solid var\(--acc\);/);
  assert.match(agentsWorkspaceCss, /\.agents-insight-pane \.agents-metrics-grid\.compact\s*\{[\s\S]*gap:\s*0;[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(agentsWorkspaceCss, /\.agents-insight-pane \.agents-stat-cell\s*\{[\s\S]*background:\s*transparent;[\s\S]*inset -1px 0 0/);
  assert.doesNotMatch(agentsWorkspaceCss, /agents-command-center|agents-stream-pane|agents-overview-section--primary/);
  assert.doesNotMatch(agentsOverviewPage, /agents-overview-defaults/);
  assert.doesNotMatch(agentsOverviewPage, /默认入口 vs 全局默认配置|Default entry vs global defaults/);
  assert.doesNotMatch(agentsOverviewPage, /Document Status|文档状态/);
  assert.doesNotMatch(agentsOverviewPage, /agents-overview-doc-list/);
  assert.doesNotMatch(agentsOverviewPage, /agents-ledger-shell/);
  assert.doesNotMatch(agentsOverviewPage, /agents-ledger-table/);
});

test("agents workspace chrome inherits DuoYuan tokens instead of local modal and status colors", () => {
  assert.doesNotMatch(
    agentsWorkspaceCss,
    /rgba\(|#[0-9a-fA-F]{3,6}|--sky|--atlas|--glass/,
  );
  assert.doesNotMatch(
    agentsWorkspaceCss,
    /(?<![-\w])(?:white|black)(?![-\w])/,
  );
  assert.doesNotMatch(
    agentsWorkspaceCss,
    /--shell-(?:panel|stage|highlight)|var\(--surface\)/,
  );
  assert.match(agentsWorkspaceCss, /background:\s*var\(--modal-backdrop\);/);
  assert.match(agentsWorkspaceCss, /\.agents-modal,[\s\S]*?\.agents-quick-config-dialog\s*\{[\s\S]*background:\s*var\(--modal-panel-bg\);/);
  assert.match(agentsWorkspaceCss, /box-shadow:\s*var\(--mono-shadow-md\);/);
  assert.match(agentsWorkspaceCss, /\.agents-summary-pill\s*\{[\s\S]*background:\s*var\(--surface-raised\);[\s\S]*box-shadow:\s*none;/);
  assert.match(agentsWorkspaceCss, /\.agent-filter-chip\s*\{[\s\S]*background:\s*var\(--surface-base\);/);
  assert.match(workbenchCss, /\.studio-workbench-task-nav-button\s*\{[\s\S]*background:\s*transparent;/);
  assert.match(workbenchCss, /\.studio-workbench-task-nav-button\.active\s*\{[\s\S]*background:\s*color-mix\(in srgb, var\(--acc\) 12%, var\(--surface-base\)\);/);
  assert.doesNotMatch(agentsWorkspaceCss, /\.agents-task-nav-button\s*\{/);
  assert.match(
    agentsWorkspaceCss,
    /\.agent-rail-item__status\.is-active\s*\{[\s\S]*var\(--success\)/,
  );
  assert.match(
    agentsWorkspaceCss,
    /html\[data-theme="light"\] \.agents-binding-meta span,[\s\S]*background:\s*var\(--surface-raised\);/,
  );
});
