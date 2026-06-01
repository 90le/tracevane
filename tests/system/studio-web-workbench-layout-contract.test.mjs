import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (filePath) => fs.readFileSync(path.join(rootDir, filePath), "utf8");

const workbenchCss = read("apps/web-vue/src/shared/styles/studio-workbench.css");
const agentsWorkspaceCss = read("apps/web-vue/src/features/agents/agents-workspace.css");
const channelsWorkspaceCss = read("apps/web-vue/src/features/channels/channels-workspace.css");
const channelsWorkspaceBaseCss = channelsWorkspaceCss.split("@media (max-width: 980px)")[0];
const codexStackWorkspaceCss = read("apps/web-vue/src/features/codex-stack/codex-stack-workspace.css");
const agentsWorkspaceLayout = read("apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue");
const channelsWorkspaceLayout = read("apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue");
const codexStackWorkspaceShell = read("apps/web-vue/src/features/codex-stack/CodexStackWorkspaceShell.vue");
const designContract = read("DESIGN.md");

const blockCount = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return [...css.matchAll(new RegExp(`(^|\\n)${escaped}\\s*\\{`, "g"))].length;
};

test("shared workbench primitives own object selector, top task bar, and active canvas layout", () => {
  assert.match(workbenchCss, /Shared Studio workbench primitives for object selectors, task bars, and active canvases/);
  assert.match(workbenchCss, /\.studio-workbench--object\s*\{[\s\S]*grid-template-columns:\s*minmax\(260px,\s*324px\) minmax\(0,\s*1fr\);/);
  assert.match(workbenchCss, /\.studio-workbench-task-shell\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
  assert.match(workbenchCss, /\.studio-workbench-task-shell > \.studio-workbench-task-rail\s*\{[\s\S]*display:\s*flex;[\s\S]*border-width:\s*0 0 1px 0;/);
  assert.match(workbenchCss, /\.studio-workbench-task-shell > \.studio-workbench-task-rail > nav,[\s\S]*\.studio-workbench-task-shell \.studio-workbench-task-nav\s*\{[\s\S]*display:\s*flex;/);
  assert.match(workbenchCss, /\.studio-workbench-task-rail\s*\{[\s\S]*position:\s*sticky;[\s\S]*background:\s*var\(--surface-raised\);/);
  assert.match(workbenchCss, /\.studio-workbench-task-nav,[\s\S]*\.studio-workbench-task-rail > nav\s*\{/);
  assert.match(workbenchCss, /\.studio-workbench-task-nav-button\s*\{[\s\S]*background:\s*transparent;[\s\S]*transition:/);
  assert.match(workbenchCss, /\.studio-workbench-task-nav-button\.active\s*\{[\s\S]*border-color:[\s\S]*var\(--acc\)/);
  assert.match(workbenchCss, /\.studio-workbench-active-canvas\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*14px;/);
  assert.match(workbenchCss, /\.studio-command-lane\s*\{/);
  assert.doesNotMatch(workbenchCss, /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient|--sky|--atlas|--glass/);
});

test("agents and channels use a top task bar instead of keeping local tabs inside the stage header", () => {
  assert.match(agentsWorkspaceLayout, /studio-workbench studio-workbench--object/);
  assert.match(agentsWorkspaceLayout, /class="agents-task-workbench studio-workbench-task-shell"/);
  assert.match(agentsWorkspaceLayout, /class="agents-task-rail studio-workbench-task-rail"/);
  assert.match(agentsWorkspaceLayout, /class="agents-task-canvas studio-workbench-active-canvas"/);
  assert.match(agentsWorkspaceLayout, /text\('人设', 'Persona'\)/);
  assert.match(agentsWorkspaceLayout, /text\('路由', 'Routing'\)/);
  assert.match(agentsWorkspaceLayout, /text\('运行', 'Runtime'\)/);
  assert.match(
    agentsWorkspaceLayout,
    /<aside v-if="selectedAgent" class="agents-task-rail studio-workbench-task-rail"[\s\S]*?<nav class="agents-task-nav studio-workbench-task-nav"[\s\S]*?class="agents-task-nav-button studio-workbench-task-nav-button"[\s\S]*?<\/aside>[\s\S]*?<section class="agents-task-canvas studio-workbench-active-canvas">/,
  );
  assert.doesNotMatch(agentsWorkspaceLayout, /agents-stage-tabs|mobile-stage-tabs/);

  assert.match(channelsWorkspaceLayout, /studio-workbench studio-workbench--object/);
  assert.match(channelsWorkspaceLayout, /class="channels-task-workbench studio-workbench-task-shell"/);
  assert.match(channelsWorkspaceLayout, /class="channels-task-rail studio-workbench-task-rail"/);
  assert.match(channelsWorkspaceLayout, /class="channels-task-canvas studio-workbench-active-canvas"/);
  assert.match(channelsWorkspaceLayout, /class="channel-account-tree"/);
  assert.match(channelsWorkspaceLayout, /class="channel-account-node"/);
  assert.match(channelsWorkspaceLayout, /class="channels-stage-actions studio-command-lane"/);
  assert.match(channelsWorkspaceLayout, /class="channels-task-nav studio-workbench-task-nav"/);
  assert.match(channelsWorkspaceLayout, /v-for="navItem in taskNavItems"/);
  assert.match(agentsWorkspaceLayout, /v-for="navItem in taskNavItems"/);
  assert.doesNotMatch(channelsWorkspaceLayout, /class="channels-subtabs"/);
  assert.doesNotMatch(channelsWorkspaceLayout, /channels-top-tabs|channels-task-tabs|mobile-stage-tabs|taskTabs|activeTaskTab|openTaskTab/);
  assert.doesNotMatch(agentsWorkspaceLayout, /v-for="tab in taskNavItems"|tab\.value|tab\.label|tab\.icon/);
  assert.match(
    channelsWorkspaceLayout,
    /<aside v-if="workspace\.selectedChannel\.value" class="channels-task-rail studio-workbench-task-rail"[\s\S]*?<nav class="channels-task-nav studio-workbench-task-nav"[\s\S]*?class="channels-task-nav-button studio-workbench-task-nav-button"[\s\S]*?<\/aside>[\s\S]*?<section class="channels-task-canvas studio-workbench-active-canvas">/,
  );
});

test("agents and channels keep one final feature layout owner instead of cascade patches", () => {
  for (const selector of [
    ".agents-workspace-shell",
    ".agents-workspace-layout",
    ".agents-workspace-sidebar",
    ".agents-workspace-stage",
    ".agents-stage-header",
    ".agents-identity-strip",
    ".agents-insight-pane",
    ".agent-rail-item",
    ".agent-rail-item.active",
    ".agent-rail-item__meta",
    ".agents-session-row",
    ".agents-session-entry",
    ".agents-stage-header__mission",
  ]) {
    assert.equal(blockCount(agentsWorkspaceCss, selector), 1, `${selector} should have one owning block`);
  }

  for (const selector of [
    ".channels-workbench",
    ".channels-sidebar-panel",
    ".channels-stage-header",
    ".channels-stage-actions",
    ".channels-stage-task",
    ".channels-stage",
    ".channels-stage-view",
    ".channels-list-panel",
    ".channel-rail-node",
    ".channel-rail-node.active",
    ".channel-account-node__meta",
    ".channel-rail-item",
    ".channel-rail-item.active",
    ".channel-account-entry",
  ]) {
    assert.equal(blockCount(channelsWorkspaceCss, selector), 1, `${selector} should have one owning block`);
  }

  for (const selector of [
    ".channels-stage-section",
    ".binding-table-shell",
    ".channels-focus-strip",
    ".channels-overview-empty",
    ".binding-table",
    ".binding-table-item",
    ".binding-table-row",
    ".binding-table-row.active",
  ]) {
    assert.equal(blockCount(channelsWorkspaceBaseCss, selector), 1, `${selector} should have one base owning block`);
  }

  for (const selector of [
    ".cs-section-stack",
    ".cs-task-badge",
    ".cs-status-pill",
    ".cs-log-mode-list",
    ".cs-log-mode-button",
  ]) {
    assert.equal(blockCount(codexStackWorkspaceCss, selector), 1, `${selector} should have one Codex Stack workspace owning block`);
  }

  assert.match(agentsWorkspaceCss, /\.agents-workspace-sidebar\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*14px;/);
  assert.match(agentsWorkspaceCss, /\.agents-stage-header\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*14px;/);
  assert.doesNotMatch(agentsWorkspaceLayout, /workspace tabs|工作区标签/);
  assert.doesNotMatch(channelsWorkspaceCss, /\.channel-rail-item:hover,\s*\n\.channel-rail-item\.active/);
  assert.match(channelsWorkspaceCss, /\.channels-sidebar-panel\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*12px;/);
  assert.match(channelsWorkspaceCss, /\.channels-stage-header\s*\{[\s\S]*display:\s*grid;[\s\S]*gap:\s*16px;/);
  assert.match(channelsWorkspaceCss, /\.channels-stage-task\s*\{[\s\S]*border-bottom:\s*1px solid/);
});

test("codex stack is marked as a guided task-rail workbench while preserving the existing section nav component", () => {
  assert.match(codexStackWorkspaceShell, /class="studio-workbench studio-workbench--guided"/);
  assert.match(codexStackWorkspaceShell, /class="cs-stack-task-rail studio-workbench-task-rail"/);
  assert.match(codexStackWorkspaceShell, /aria-label="Codex Stack task rail"/);
  assert.doesNotMatch(codexStackWorkspaceShell, /studio-workbench--flow|cs-flow-rail|Codex Stack flow/);
  assert.match(codexStackWorkspaceShell, /<CodexStackSectionNav[\s\S]*:sections="sections"[\s\S]*:active-section="activeSection"/);
  assert.match(codexStackWorkspaceShell, /import "\.\.\/\.\.\/shared\/styles\/studio-workbench\.css";/);
  assert.doesNotMatch(codexStackWorkspaceShell, /<style(?:\s|>)/);
});

test("design contract names the three route families and rejects the old navigation stack", () => {
  assert.match(designContract, /Agent \/ Channels \/ Codex Stack Layout Directive/);
  assert.match(designContract, /Agent and Channels are object-management workbenches/);
  assert.match(designContract, /Codex Stack is a guided operations workbench/);
  assert.match(designContract, /Advanced JSON stays folded inside Runtime/);
  assert.match(designContract, /Status, Install\/Repair, Agent Bridge, Route Models, and Logs/);
  assert.match(designContract, /resource rail, a second side task rail, large hero header, top tabs, nested subtabs, action-card grids/);
  assert.match(designContract, /Agent and Channels route-level sections must not use an additional side task rail/);
  assert.match(designContract, /object-workbench task bar is a shared workbench primitive/);
  assert.match(designContract, /Codex Stack task rail/);
  assert.doesNotMatch(designContract, /Codex Stack is a guided operations flow|Codex Stack flow rail|nav badge/);
});
