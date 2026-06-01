import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

function read(filePath) {
  return fs.readFileSync(path.join(rootDir, filePath), "utf8");
}

const routerSource = read("apps/web-vue/src/router.ts");
const routeManifestSource = read(
  "apps/web-vue/src/features/shell/route-manifest.ts",
);
const agentsViewSource = read("apps/web-vue/src/views/AgentsView.vue");
const agentsWorkspaceLayoutPath =
  "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue";
const docsPagePath = "apps/web-vue/src/features/agents/AgentDocsPage.vue";
const bindingsPagePath =
  "apps/web-vue/src/features/agents/AgentBindingsPage.vue";
const advancedPagePath =
  "apps/web-vue/src/features/agents/AgentAdvancedPage.vue";
const sessionsPagePath =
  "apps/web-vue/src/features/agents/AgentSessionsPage.vue";

test("agents router keeps a persistent workspace layout with an overview route per agent", () => {
  assert.match(routerSource, /routes:\s*shellRoutes/);
  assert.match(routeManifestSource, /path:\s*"\/agents"/);
  assert.match(routeManifestSource, /component:\s*AgentsView/);
  assert.doesNotMatch(routeManifestSource, /contextPanel/);
  assert.match(
    routeManifestSource,
    /\{ path:\s*"", component:\s*AgentsControlPage \}/,
  );
  assert.match(
    routeManifestSource,
    /\{ path:\s*":agentId", component:\s*AgentsControlPage \}/,
  );
  assert.match(
    routeManifestSource,
    /\{ path:\s*":agentId\/docs", component:\s*AgentDocsPage \}/,
  );
  assert.match(
    routeManifestSource,
    /\{ path:\s*":agentId\/bindings", component:\s*AgentBindingsPage \}/,
  );
  assert.match(
    routeManifestSource,
    /\{ path:\s*":agentId\/sessions", component:\s*AgentSessionsPage \}/,
  );
  assert.match(
    routeManifestSource,
    /\{ path:\s*":agentId\/advanced", component:\s*AgentAdvancedPage \}/,
  );
  assert.match(agentsViewSource, /AgentsWorkspaceLayout/);
  assert.doesNotMatch(
    agentsViewSource,
    /<template>\s*<RouterView\s*\/>\s*<\/template>/,
  );
});

test("agents workspace layout exists and owns the persistent stage shell", () => {
  assert.equal(
    fs.existsSync(path.join(rootDir, agentsWorkspaceLayoutPath)),
    true,
  );

  const agentsWorkspaceLayoutSource = read(agentsWorkspaceLayoutPath);

  assert.match(agentsWorkspaceLayoutSource, /RouterView/);
  assert.match(agentsWorkspaceLayoutSource, /agents-workspace-shell/);
  assert.match(agentsWorkspaceLayoutSource, /agent-rail-list/);
  assert.match(agentsWorkspaceLayoutSource, /agent-rail-group/);
  assert.match(agentsWorkspaceLayoutSource, /agents-task-nav/);
  assert.doesNotMatch(agentsWorkspaceLayoutSource, /agents-stage-tabs|mobile-stage-tabs/);
  assert.match(agentsWorkspaceLayoutSource, /openQuickConfig/);
  assert.match(agentsWorkspaceLayoutSource, /openCreateModal/);
});

test("agents workspace navigation can leave advanced routes cleanly", () => {
  const agentsWorkspaceLayoutSource = read(agentsWorkspaceLayoutPath);

  assert.match(agentsWorkspaceLayoutSource, /<RouterView v-slot="\{ Component, route: childRoute \}">/);
  assert.match(agentsWorkspaceLayoutSource, /:key="childRoute\.path"/);
  assert.match(
    agentsWorkspaceLayoutSource,
    /function openAgent\(agentId: string, section: AgentTaskSection = 'overview'\)/,
  );
  assert.match(agentsWorkspaceLayoutSource, /type AgentTaskSection = 'overview' \| 'docs' \| 'bindings' \| 'sessions' \| 'runtime';/);
  assert.match(agentsWorkspaceLayoutSource, /if \(section === 'runtime'\) return `\/agents\/\$\{encoded\}\/advanced`;/);
  assert.match(agentsWorkspaceLayoutSource, /@click="openAgent\(routeAgentId, navItem\.value\)"/);
  assert.match(agentsWorkspaceLayoutSource, /const nextSection = routeAgentId\.value === nextAgentId && route\.path !== '\/agents'/);
});

test("agents deep pages still exist and stay route-backed inside the workspace shell", () => {
  assert.equal(fs.existsSync(path.join(rootDir, docsPagePath)), true);
  assert.equal(fs.existsSync(path.join(rootDir, bindingsPagePath)), true);
  assert.equal(fs.existsSync(path.join(rootDir, advancedPagePath)), true);
  assert.equal(fs.existsSync(path.join(rootDir, sessionsPagePath)), true);

  const docsPageSource = read(docsPagePath);
  const bindingsPageSource = read(bindingsPagePath);
  const advancedPageSource = read(advancedPagePath);
  const sessionsPageSource = read(sessionsPagePath);

  assert.match(docsPageSource, /route\.params\.agentId/);
  assert.match(docsPageSource, /fetchAgentDocument/);
  assert.match(docsPageSource, /saveAgentDocument/);

  assert.match(bindingsPageSource, /route\.params\.agentId/);
  assert.match(bindingsPageSource, /fetchAgentDetail/);
  assert.match(bindingsPageSource, /createAgentBinding/);
  assert.match(bindingsPageSource, /updateAgentBinding/);
  assert.match(bindingsPageSource, /deleteAgentBinding/);
  assert.match(bindingsPageSource, /bindingDialogOpen/);
  assert.match(bindingsPageSource, /openCreateBindingDialog/);
  assert.match(bindingsPageSource, /openEditBindingDialog/);
  assert.match(bindingsPageSource, /removeBinding/);
  assert.match(bindingsPageSource, /openChannelWorkspace/);
  assert.match(bindingsPageSource, /openChannelBindings/);
  assert.doesNotMatch(bindingsPageSource, /openSessionsPage/);
  assert.match(bindingsPageSource, /type: 'route'/);
  assert.match(bindingsPageSource, /binding\.channel/);
  assert.match(bindingsPageSource, /binding\.accountId/);
  assert.match(bindingsPageSource, /binding\.mode/);
  assert.match(bindingsPageSource, /binding\.backend/);
  assert.match(bindingsPageSource, /binding\.cwd/);

  assert.match(advancedPageSource, /route\.params\.agentId/);
  assert.match(advancedPageSource, /fetchAgentDetail/);
  assert.match(advancedPageSource, /fetchAgentsSummary/);
  assert.match(advancedPageSource, /modelOptions/);
  assert.match(advancedPageSource, /draft\.runtime\.type === 'acp'/);
  assert.match(advancedPageSource, /clearAcpRuntimeFields/);
  assert.match(advancedPageSource, /updateAgent/);
  assert.match(advancedPageSource, /AvatarFieldEditor/);

  assert.match(sessionsPageSource, /route\.params\.agentId/);
  assert.match(sessionsPageSource, /deleteAgentSession/);
  assert.match(sessionsPageSource, /clearAgentSessions/);
  assert.match(sessionsPageSource, /session\.totalTokens/);
  assert.match(sessionsPageSource, /session\.updatedAt/);

  assert.match(docsPageSource, /agents-stage-task-head/);
  assert.match(advancedPageSource, /agents-stage-task-head/);
  assert.match(sessionsPageSource, /agents-stage-task-head/);
  assert.doesNotMatch(docsPageSource, /page-header-row/);
  assert.doesNotMatch(advancedPageSource, /page-header-row/);
  assert.doesNotMatch(sessionsPageSource, /page-header-row/);
});
