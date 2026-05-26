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

test("agents expose operate shell, task head, and mobile stage tabs", () => {
  assert.match(agentsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(agentsWorkspaceLayout, /operate-stage-task-head/);
  assert.match(agentsWorkspaceLayout, /mobile-stage-tabs/);
});

test("channels expose operate shell, stage badges, and mobile stage tabs", () => {
  assert.match(channelsWorkspaceLayout, /operate-workspace-shell/);
  assert.match(channelsWorkspaceLayout, /channels-stage-badge/);
  assert.match(channelsWorkspaceLayout, /mobile-stage-tabs/);
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
  assert.match(
    operateWorkspaceCss,
    /\.operate-stage-task-head\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*10px;/,
  );
  assert.doesNotMatch(globalStyle, /\.operate-[a-zA-Z0-9_-]*/);
  assert.match(channelsWorkspaceCss, /\.channels-stage-badges\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*10px;/);
  assert.match(cronWorkspaceCss, /\.cron-stage-facts\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*10px;/);
  assert.match(agentsWorkspaceCss, /\.agents-stage-header__facts\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-wrap:\s*wrap;[\s\S]*gap:\s*8px;/);
  assert.match(
    channelsWorkspaceCss,
    /\.channels-stage-badge\s*\{[\s\S]*border:\s*1px solid var\(--border-subtle\);[\s\S]*background:\s*color-mix\(in srgb, var\(--surface-raised\) 90%, transparent\);/,
  );
  assert.match(agentsWorkspaceCss, /\.agents-summary-pill\s*\{/);
  assert.match(cronWorkspaceCss, /\.cron-chip\s*\{[\s\S]*border:\s*1px solid var\(--border-subtle\);[\s\S]*background:\s*color-mix\(in srgb, var\(--surface-raised\) 90%, transparent\);/);
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
