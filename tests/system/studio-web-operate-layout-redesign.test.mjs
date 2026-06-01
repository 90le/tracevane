import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const testFileDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(testFileDir, "..", "..");
const read = (filePath) =>
  fs.readFileSync(path.join(rootDir, filePath), "utf8");

const agentsWorkspaceLayout = read(
  "apps/web-vue/src/features/agents/AgentsWorkspaceLayout.vue",
);
const channelsWorkspaceLayout = read(
  "apps/web-vue/src/features/channels/ChannelsWorkspaceLayout.vue",
);
const cronControlPage = read(
  "apps/web-vue/src/features/cron/CronControlPage.vue",
);
const globalStyle = read("apps/web-vue/src/style.css");
const operateWorkspaceCss = read("apps/web-vue/src/features/operate/operate-workspace.css");
const agentsWorkspaceCss = read("apps/web-vue/src/features/agents/agents-workspace.css");
const channelsWorkspaceCss = read("apps/web-vue/src/features/channels/channels-workspace.css");
const cronWorkspaceCss = read("apps/web-vue/src/features/cron/cron-workspace.css");

test("agents expose operate shell, task head, and top task navigation", () => {
  assert.match(agentsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(agentsWorkspaceLayout, /operate-stage-task-head/);
  assert.match(agentsWorkspaceLayout, /operate-stage-strip/);
  assert.match(agentsWorkspaceLayout, /agents-task-nav/);
  assert.doesNotMatch(agentsWorkspaceLayout, /mobile-stage-tabs|agents-stage-tabs/);
  assert.doesNotMatch(agentsWorkspaceLayout, /operate-command-panel/);
  assert.doesNotMatch(agentsWorkspaceLayout, /右侧工作台|right side|right-side/);
});

test("channels expose operate shell, stage badges, and top task navigation", () => {
  assert.match(channelsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(channelsWorkspaceLayout, /operate-stage-strip/);
  assert.match(channelsWorkspaceLayout, /channels-stage-badge/);
  assert.match(channelsWorkspaceLayout, /channels-task-nav/);
  assert.doesNotMatch(channelsWorkspaceLayout, /mobile-stage-tabs|channels-top-tabs|channels-task-tabs/);
  assert.doesNotMatch(channelsWorkspaceLayout, /operate-command-panel/);
  assert.doesNotMatch(channelsWorkspaceLayout, /高密度索引|右侧专门工作区|right-side workspaces|dense index/);
});

test("cron exposes operate shell, task head, and mobile stage tabs", () => {
  assert.match(cronControlPage, /operate-workspace-shell/);
  assert.match(cronControlPage, /operate-stage-task-head/);
  assert.match(cronControlPage, /mobile-stage-tabs/);
});

test("operate pages keep shared workspace language hooks", () => {
  assert.match(agentsWorkspaceLayout, /import '\.\.\/operate\/operate-workspace\.css';/);
  assert.match(channelsWorkspaceLayout, /import '\.\.\/operate\/operate-workspace\.css';/);
  assert.match(cronControlPage, /import '\.\.\/operate\/operate-workspace\.css';/);

  assert.match(agentsWorkspaceLayout, /operate-resource-rail/);
  assert.match(channelsWorkspaceLayout, /operate-resource-rail/);
  assert.match(cronControlPage, /operate-resource-rail/);

  assert.match(agentsWorkspaceLayout, /operate-stage/);
  assert.match(channelsWorkspaceLayout, /operate-stage/);
  assert.match(cronControlPage, /operate-stage/);

  assert.match(
    operateWorkspaceCss,
    /\.operate-workspace-shell\s+\.operate-resource-rail,[\s\S]*\.operate-stage\s*\{[\s\S]*min-width:\s*0;[\s\S]*border:\s*1px solid var\(--border-subtle\);/,
  );
  assert.match(operateWorkspaceCss, /DuoYuan operate layer: split inspector panes/);
  assert.match(
    operateWorkspaceCss,
    /\.operate-workspace-surface\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*var\(--mono-shadow-sm,/,
  );
  assert.match(
    operateWorkspaceCss,
    /\.operate-stage-strip\s*\{[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.doesNotMatch(
    `${operateWorkspaceCss}\n${agentsWorkspaceCss}\n${channelsWorkspaceCss}`,
    /operate-command-panel/,
  );
  assert.doesNotMatch(
    `${operateWorkspaceCss}\n${agentsWorkspaceCss}\n${channelsWorkspaceCss}\n${cronWorkspaceCss}`,
    /var\(--atlas-|var\(--atlas|Atlas operate layer/,
  );
  assert.doesNotMatch(
    operateWorkspaceCss,
    /\/\* Atlas operate layer:|\.operate-resource-rail\s*\{[\s\S]*linear-gradient\(180deg,/,
  );
  assert.doesNotMatch(
    operateWorkspaceCss,
    /account-list|binding-list|request-list|account-tile|binding-item|request-item/,
  );
  assert.doesNotMatch(
    operateWorkspaceCss,
    /rgba\(|#[0-9a-fA-F]{3,6}|linear-gradient|radial-gradient|--sky|--atlas|--glass/,
    "expected shared operate workspace chrome to stay on DuoYuan/OpenClaw tokens",
  );
  assert.match(
    operateWorkspaceCss,
    /\.operate-stage-task-head\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*10px;/,
  );
  assert.doesNotMatch(globalStyle, /\.operate-[a-zA-Z0-9_-]*/);
  assert.match(channelsWorkspaceCss, /\.channels-stage-badges\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*10px;/);
  assert.match(cronWorkspaceCss, /\.cron-stage-facts\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*10px;/);
  assert.match(agentsWorkspaceCss, /\.agents-stage-header__facts\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*8px;/);
  assert.match(
    agentsWorkspaceCss,
    /\.agents-workspace-layout\s*\{[\s\S]*grid-template-columns:\s*minmax\(260px,\s*324px\) minmax\(0,\s*1fr\);[\s\S]*background:\s*var\(--surface-base\);/,
  );
  assert.match(
    agentsWorkspaceCss,
    /\.agents-workspace-sidebar\s*\{[\s\S]*background:\s*var\(--surface-raised\);[\s\S]*backdrop-filter:\s*none;/,
  );
  assert.match(
    channelsWorkspaceCss,
    /\.channels-stage-badge\s*\{[\s\S]*border:\s*1px solid var\(--border-subtle\);[\s\S]*background:\s*var\(--surface-raised\);/,
  );
  assert.match(
    channelsWorkspaceCss,
    /DuoYuan P1 workspace contract[\s\S]*\.channels-workbench\s*\{[\s\S]*background:\s*var\(--surface-base\);[\s\S]*box-shadow:\s*var\(--mono-shadow-sm,/,
  );
  assert.match(agentsWorkspaceCss, /\.agents-summary-pill\s*\{/);
  assert.match(cronWorkspaceCss, /\.cron-chip,[\s\S]*\.cron-list-meta span,[\s\S]*background:\s*var\(--surface-raised\);/);
  assert.match(
    cronWorkspaceCss,
    /\.cron-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(260px,\s*320px\) minmax\(0,\s*1fr\);[\s\S]*background:\s*var\(--surface-base\);/,
  );
});

test("cron page keeps one create failure alert watcher and shared surface tokens", () => {
  const createFailureAlertWatcherMatches =
    cronControlPage.match(
      /watch\(\s*\(\) => createForm\.failureAlertEnabled,/g,
    ) || [];

  assert.equal(createFailureAlertWatcherMatches.length, 1);
  assert.match(
    cronWorkspaceCss,
    /\.cron-sidebar-panel,[\s\S]*\.cron-stage-header,[\s\S]*\.cron-stage-panel\s*\{[\s\S]*background:\s*transparent;[\s\S]*border:\s*0;/,
  );
  assert.doesNotMatch(cronControlPage, /<style(?:\s|>)/);
});
